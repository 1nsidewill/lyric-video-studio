/**
 * Pre-computed audio spectrogram that drives the reactive EQ.
 *
 * Computed ONCE per project (cached) from the decoded audio, so the live preview and
 * the offline render read the exact same frequency data → the EQ in the exported video
 * matches what you saw. Offline render can't use a real-time AnalyserNode, hence this.
 */
import { readFile } from '@tauri-apps/plugin-fs';
import { fftMagnitudes } from './fft';

const FFT_SIZE = 2048;
const NUM_BANDS = 40;
const COLUMN_RATE = 45; // spectrogram columns per second

export interface Spectrogram {
  bands: Float32Array; // columns * NUM_BANDS, normalized 0..1
  columns: number;
  numBands: number;
  columnRate: number;
  duration: number;
}

const cache = new Map<string, Promise<Spectrogram>>();

/** Get (or compute + cache) the spectrogram for a project, from the audio file path. */
export function getSpectrogram(key: string, audioPath: string): Promise<Spectrogram> {
  let p = cache.get(key);
  if (!p) {
    p = compute(audioPath).catch((e) => {
      cache.delete(key); // allow retry on failure
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}

async function compute(audioPath: string): Promise<Spectrogram> {
  const bytes = await readFile(audioPath);
  const AC: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new AC();
  let audio: AudioBuffer;
  try {
    // copy into a fresh ArrayBuffer (decodeAudioData detaches its input)
    audio = await actx.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);
  } finally {
    if (actx.state !== 'closed') actx.close();
  }

  const data = audio.getChannelData(0);
  const sampleRate = audio.sampleRate;
  const duration = audio.duration;
  const hop = Math.max(1, Math.floor(sampleRate / COLUMN_RATE));
  const columns = Math.max(1, Math.floor((data.length - FFT_SIZE) / hop));

  // Log-spaced band edges across the usable FFT bins.
  const binCount = FFT_SIZE >> 1;
  const minBin = 1;
  const maxBin = binCount - 1;
  const edges = new Array<number>(NUM_BANDS + 1);
  for (let b = 0; b <= NUM_BANDS; b++) {
    edges[b] = Math.round(minBin * Math.pow(maxBin / minBin, b / NUM_BANDS));
  }

  const hann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }

  const bands = new Float32Array(columns * NUM_BANDS);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let c = 0; c < columns; c++) {
    const start = c * hop;
    for (let i = 0; i < FFT_SIZE; i++) re[i] = data[start + i] * hann[i];
    const mag = fftMagnitudes(re, im);
    for (let b = 0; b < NUM_BANDS; b++) {
      let sum = 0;
      let cnt = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) {
        sum += mag[k];
        cnt++;
      }
      bands[c * NUM_BANDS + b] = Math.sqrt(cnt ? sum / cnt : 0); // perceptual-ish compression
    }
  }

  // Per-band "flatten": scale each band to its OWN peak so bass doesn't dominate and
  // mids/highs also fill. Floored against the global peak so near-silent bands aren't
  // amplified into noise.
  const bandMax = new Float32Array(NUM_BANDS);
  for (let c = 0; c < columns; c++) {
    const base = c * NUM_BANDS;
    for (let b = 0; b < NUM_BANDS; b++) if (bands[base + b] > bandMax[b]) bandMax[b] = bands[base + b];
  }
  let globalMax = 1e-6;
  for (let b = 0; b < NUM_BANDS; b++) if (bandMax[b] > globalMax) globalMax = bandMax[b];
  const invBand = new Float32Array(NUM_BANDS);
  for (let b = 0; b < NUM_BANDS; b++) invBand[b] = 1 / Math.max(bandMax[b], globalMax * 0.28);
  for (let c = 0; c < columns; c++) {
    const base = c * NUM_BANDS;
    for (let b = 0; b < NUM_BANDS; b++) bands[base + b] = Math.min(1, bands[base + b] * invBand[b]);
  }

  return { bands, columns, numBands: NUM_BANDS, columnRate: COLUMN_RATE, duration };
}

/** Write the band levels at time `t` (seconds) into `out` (length = numBands). */
export function sampleBands(spec: Spectrogram, t: number, out: Float32Array): void {
  const col = Math.min(spec.columns - 1, Math.max(0, Math.round(t * spec.columnRate)));
  const base = col * spec.numBands;
  for (let b = 0; b < spec.numBands; b++) out[b] = spec.bands[base + b];
}
