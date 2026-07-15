/**
 * Sketch audio engine: beat playback + punch-in recording + a playback vocal chain.
 *
 * Recording is captured RAW (AudioWorklet → Float32 PCM). The chain (HPF → EQ →
 * compressor → reverb send) is applied non-destructively at playback time, so takes
 * can be re-toned at any point and there is no monitoring-latency risk.
 */

export type TonePreset = 'bright' | 'balanced' | 'dark';

export interface ChainSettings {
  preset: TonePreset;
  vox: number;    // 0..1.5
  beat: number;   // 0..1.5
  space: number;  // 0..1  (reverb send)
}

export const DEFAULT_CHAIN: ChainSettings = { preset: 'balanced', vox: 1.0, beat: 0.9, space: 0.25 };

interface PresetParams {
  hpf: number;
  mid: { f: number; gain: number; q: number };
  air: { f: number; gain: number };
  compThreshold: number;
}

const PRESETS: Record<TonePreset, PresetParams> = {
  balanced: { hpf: 90,  mid: { f: 300, gain: -2.0, q: 1.0 }, air: { f: 4500, gain: 2.5 },  compThreshold: -20 },
  bright:   { hpf: 110, mid: { f: 250, gain: -3.5, q: 1.1 }, air: { f: 6000, gain: 4.5 },  compThreshold: -18 },
  dark:     { hpf: 70,  mid: { f: 200, gain: 1.5,  q: 0.9 }, air: { f: 6000, gain: -2.5 }, compThreshold: -22 },
};

export interface EngineTake {
  id: string;
  buffer: AudioBuffer;
  offsetSec: number;
  enabled: boolean;
}

const WORKLET_CODE = `
class SketchRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('sketch-recorder', SketchRecorder);
`;

export class SketchEngine {
  private ctx: AudioContext | null = null;
  private workletReady = false;

  private beatBuffer: AudioBuffer | null = null;
  private takes: EngineTake[] = [];

  // graph
  private master!: GainNode;
  private beatGain!: GainNode;
  private voxBus!: GainNode;   // post-chain vocal level
  private hpf!: BiquadFilterNode;
  private mid!: BiquadFilterNode;
  private air!: BiquadFilterNode;
  private comp!: DynamicsCompressorNode;
  private wet!: GainNode;
  private convolver!: ConvolverNode;
  private chainIn!: GainNode;  // take sources connect here

  // transport
  private beatSrc: AudioBufferSourceNode | null = null;
  private takeSrcs: AudioBufferSourceNode[] = [];
  private startedAtCtx = 0;
  private startPos = 0;
  playing = false;

  // recording
  private micStream: MediaStream | null = null;
  private micSrc: MediaStreamAudioSourceNode | null = null;
  private recNode: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];
  recording = false;
  private recStartPos = 0;

  private async ensureCtx(): Promise<AudioContext> {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.connect(ctx.destination);

    this.beatGain = ctx.createGain();
    this.beatGain.connect(this.master);

    // vocal chain: chainIn → hpf → mid → air → comp → voxBus → master (+ wet → convolver → master)
    this.chainIn = ctx.createGain();
    this.hpf = ctx.createBiquadFilter(); this.hpf.type = 'highpass';
    this.mid = ctx.createBiquadFilter(); this.mid.type = 'peaking';
    this.air = ctx.createBiquadFilter(); this.air.type = 'highshelf';
    this.comp = ctx.createDynamicsCompressor();
    this.comp.ratio.value = 3; this.comp.attack.value = 0.003; this.comp.release.value = 0.25; this.comp.knee.value = 6;
    this.voxBus = ctx.createGain();

    this.chainIn.connect(this.hpf);
    this.hpf.connect(this.mid);
    this.mid.connect(this.air);
    this.air.connect(this.comp);
    this.comp.connect(this.voxBus);
    this.voxBus.connect(this.master);

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeImpulse(ctx, 1.4, 2.6);
    this.wet = ctx.createGain();
    this.voxBus.connect(this.wet);
    this.wet.connect(this.convolver);
    this.convolver.connect(this.master);

    this.applyChain(DEFAULT_CHAIN);
    return ctx;
  }

  /** Synthetic exponential-decay noise impulse — no IR asset needed. */
  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  applyChain(s: ChainSettings) {
    if (!this.ctx) return;
    const p = PRESETS[s.preset];
    this.hpf.frequency.value = p.hpf;
    this.mid.frequency.value = p.mid.f; this.mid.gain.value = p.mid.gain; this.mid.Q.value = p.mid.q;
    this.air.frequency.value = p.air.f; this.air.gain.value = p.air.gain;
    this.comp.threshold.value = p.compThreshold;
    this.voxBus.gain.value = s.vox;
    this.beatGain.gain.value = s.beat;
    this.wet.gain.value = s.space * 0.6;
  }

  async loadBeat(bytes: Uint8Array): Promise<number> {
    const ctx = await this.ensureCtx();
    // Copy into a fresh ArrayBuffer — decodeAudioData detaches it.
    const ab = bytes.slice().buffer as ArrayBuffer;
    this.beatBuffer = await ctx.decodeAudioData(ab);
    return this.beatBuffer.duration;
  }

  async decodeTake(bytes: Uint8Array): Promise<AudioBuffer> {
    const ctx = await this.ensureCtx();
    return ctx.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
  }

  bufferFromSamples(samples: Float32Array, sampleRate: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(new Float32Array(samples), 0);
    return buf;
  }

  setTakes(takes: EngineTake[]) {
    this.takes = takes;
    if (this.playing) { const pos = this.position; this.stopSources(); this.startSources(pos); }
  }

  get duration(): number { return this.beatBuffer?.duration ?? 0; }

  get position(): number {
    if (!this.ctx) return 0;
    if (!this.playing) return this.startPos;
    return Math.min(this.duration, this.startPos + (this.ctx.currentTime - this.startedAtCtx));
  }

  private startSources(pos: number) {
    const ctx = this.ctx!;
    if (!this.beatBuffer) return;
    const now = ctx.currentTime + 0.03;

    this.beatSrc = ctx.createBufferSource();
    this.beatSrc.buffer = this.beatBuffer;
    this.beatSrc.connect(this.beatGain);
    this.beatSrc.start(now, pos);
    this.beatSrc.onended = () => { if (this.playing && this.position >= this.duration - 0.05) this.pause(); };

    this.takeSrcs = [];
    for (const t of this.takes) {
      if (!t.enabled) continue;
      const end = t.offsetSec + t.buffer.duration;
      if (end <= pos) continue;
      const src = ctx.createBufferSource();
      src.buffer = t.buffer;
      src.connect(this.chainIn);
      if (t.offsetSec >= pos) src.start(now + (t.offsetSec - pos), 0);
      else src.start(now, pos - t.offsetSec);
      this.takeSrcs.push(src);
    }

    this.startedAtCtx = now;
    this.startPos = pos;
  }

  private stopSources() {
    try { this.beatSrc?.stop(); } catch { /* already stopped */ }
    this.beatSrc = null;
    for (const s of this.takeSrcs) { try { s.stop(); } catch { /* noop */ } }
    this.takeSrcs = [];
  }

  async play(pos?: number) {
    const ctx = await this.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const p = pos ?? this.startPos;
    if (this.playing) this.stopSources();
    this.startSources(Math.max(0, Math.min(p, Math.max(0, this.duration - 0.01))));
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.startPos = this.position;
    this.stopSources();
    this.playing = false;
  }

  async seek(pos: number) {
    const clamped = Math.max(0, Math.min(pos, this.duration));
    if (this.playing) { this.stopSources(); this.startSources(clamped); }
    else this.startPos = clamped;
  }

  /** Punch-in: ensures the beat is rolling, then captures raw mic PCM. */
  async startRecording(): Promise<void> {
    const ctx = await this.ensureCtx();
    if (this.recording) return;
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (!this.workletReady) {
      const url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.workletReady = true;
    }
    if (!this.playing) await this.play();

    this.micSrc = ctx.createMediaStreamSource(this.micStream);
    this.recNode = new AudioWorkletNode(ctx, 'sketch-recorder');
    this.chunks = [];
    this.recNode.port.onmessage = (e: MessageEvent<Float32Array>) => { this.chunks.push(e.data); };
    this.micSrc.connect(this.recNode);
    // NOT connected to destination — no monitoring, no feedback.

    // What the artist hears is delayed by the output latency; align the take to what
    // they were rapping along to.
    const outLatency = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    this.recStartPos = Math.max(0, this.position - outLatency);
    this.recording = true;
  }

  stopRecording(): { samples: Float32Array; sampleRate: number; offsetSec: number } | null {
    if (!this.recording || !this.ctx) return null;
    this.recording = false;
    this.micSrc?.disconnect();
    this.recNode?.port.close();
    this.recNode?.disconnect();
    this.micStream?.getTracks().forEach(tr => tr.stop());
    this.micSrc = null; this.recNode = null; this.micStream = null;

    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const samples = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) { samples.set(c, off); off += c.length; }
    this.chunks = [];
    return { samples, sampleRate: this.ctx.sampleRate, offsetSec: this.recStartPos };
  }

  dispose() {
    this.pause();
    this.micStream?.getTracks().forEach(tr => tr.stop());
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.workletReady = false;
    this.beatBuffer = null;
    this.takes = [];
  }
}
