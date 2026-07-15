/**
 * Local render pipeline. Runs entirely on the user's machine:
 *   1. Draw every frame on a 1920×1080 canvas (shared engine with the live preview).
 *   2a. WebCodecs path — GPU-encode H.264 in the webview, stream it to a temp file,
 *       then FFmpeg muxes it with the audio (`-c:v copy`). Fast; used on Chromium/WebView2.
 *   2b. Fallback path — dump a JPEG frame sequence to a temp dir, then FFmpeg encodes
 *       it with libx264. Used only where WebCodecs H.264 is unavailable.
 *
 * FFmpeg (bundled sidecar) is invoked in Rust; progress streams back via `render:progress`.
 */
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { tempDir, join } from '@tauri-apps/api/path';
import { listen } from '@tauri-apps/api/event';
import { open, mkdir, writeFile, remove } from '@tauri-apps/plugin-fs';
import { loadProject, projectFilePath } from './storage';
import { parseSingerTags } from '../utils/parseSingerTags';
import { resetSingerColors, getSingerColor } from '../utils/singerColors';
import { drawLyricFrame, createRenderState } from '../utils/canvasRenderer';
import { getDominantColor } from '../utils/colorUtils';
import { getSpectrogram, sampleBands, type Spectrogram } from './spectrogram';
import { DEFAULT_RENDER_OPTIONS, type RenderOptions as ProjectRenderOptions } from '../types';

export type RenderStage = 'preparing' | 'encoding' | 'finalizing';

export interface RenderOptions {
  projectId: string;
  /** Absolute path chosen by the user's save dialog. */
  outputPath: string;
  onProgress?: (fraction: number) => void;
  onStage?: (stage: RenderStage) => void;
  isCancelled?: () => boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('앨범아트를 불러올 수 없습니다 (failed to load artwork)'));
  });
}

function probeDuration(src: string, fallback: number): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.addEventListener('loadedmetadata', () => resolve(audio.duration));
    audio.addEventListener('error', () => resolve(0));
  }).then((d) => {
    const n = d as number;
    return !n || !isFinite(n) || n < 1 ? fallback : n;
  });
}

/** Run an FFmpeg command, mapping its `render:progress` events into [base, base+span]. */
async function runFfmpeg(
  command: 'mux_h264' | 'encode_frames',
  args: Record<string, unknown>,
  base: number,
  span: number,
  onProgress?: (f: number) => void,
): Promise<void> {
  const unlisten = await listen<{ fraction: number; stage: string }>('render:progress', (e) => {
    onProgress?.(base + span * (e.payload?.fraction ?? 0));
  });
  try {
    await invoke(command, args);
    onProgress?.(base + span);
  } finally {
    unlisten();
  }
}

export async function renderProject(opts: RenderOptions): Promise<void> {
  const { projectId, outputPath, onProgress, onStage } = opts;
  const cancelled = () => opts.isCancelled?.() ?? false;

  onStage?.('preparing');
  const project = await loadProject(projectId);
  const lyrics = parseSingerTags(project.lyrics).filter((l) => l.start_time > 0);
  const renderData = { ...project, lyrics };

  const audioPath = await projectFilePath(projectId, project.audio_filename);
  const artworkPath = await projectFilePath(projectId, project.artwork_filename);
  const img = await loadImage(convertFileSrc(artworkPath));
  const accent = getDominantColor(img);
  resetSingerColors();
  for (const l of lyrics) if (l.singer) getSingerColor(l.singer);

  const duration = await probeDuration(convertFileSrc(audioPath), project.audio_duration ?? 0);
  if (duration < 1) throw new Error('오디오 길이를 불러올 수 없습니다 (could not read audio duration)');

  // Reactive-EQ spectrogram (cached from the preview step) + persisted style options.
  const spec = await getSpectrogram(projectId, audioPath).catch(() => null);
  const ropts = project.render_options ?? DEFAULT_RENDER_OPTIONS;
  const portrait = ropts.aspect === '9:16';
  const W = portrait ? 1080 : 1920;
  const H = portrait ? 1920 : 1080;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  // Probe WebCodecs H.264 support.
  const VideoEncoderAPI = (window as unknown as { VideoEncoder?: typeof VideoEncoder }).VideoEncoder;
  const encoderConfig = {
    codec: 'avc1.640034', // H.264 High Profile Level 5.2
    width: W,
    height: H,
    bitrate: 20_000_000,
    framerate: 60,
    hardwareAcceleration: 'prefer-hardware' as const,
    avc: { format: 'annexb' as const },
  };
  let useWebCodecs = false;
  if (VideoEncoderAPI) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useWebCodecs = !!(await VideoEncoderAPI.isConfigSupported(encoderConfig as any)).supported;
    } catch {
      useWebCodecs = false;
    }
  }

  if (useWebCodecs) {
    await renderWebCodecs(canvas, img, renderData, accent, duration, audioPath, outputPath, encoderConfig, spec, ropts, onProgress, onStage, cancelled);
  } else {
    await renderFallback(canvas, img, renderData, accent, duration, audioPath, outputPath, spec, ropts, onProgress, onStage, cancelled);
  }
}

// ── WebCodecs GPU path ────────────────────────────────────────────────────────
async function renderWebCodecs(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderData: any,
  accent: [number, number, number],
  duration: number,
  audioPath: string,
  outputPath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  encoderConfig: any,
  spec: Spectrogram | null,
  ropts: ProjectRenderOptions,
  onProgress?: (f: number) => void,
  onStage?: (s: RenderStage) => void,
  cancelled?: () => boolean,
): Promise<void> {
  const fps = 60;
  const totalFrames = Math.ceil(duration * fps);
  const bands = spec ? new Float32Array(spec.numBands) : null;
  const h264Path = await join(await tempDir(), `lvs-${crypto.randomUUID()}.h264`);
  const fh = await open(h264Path, { write: true, create: true, truncate: true });

  const pending: Uint8Array[] = [];
  const drain = async () => {
    while (pending.length) await fh.write(pending.shift()!);
  };

  let encodeError: Error | null = null;
  const VideoEncoderCtor = (window as unknown as { VideoEncoder: typeof VideoEncoder }).VideoEncoder;
  const encoder = new VideoEncoderCtor({
    output: (chunk: EncodedVideoChunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      pending.push(data);
    },
    error: (e: DOMException) => {
      encodeError = new Error(`VideoEncoder: ${e.message}`);
    },
  });
  encoder.configure(encoderConfig);

  onStage?.('encoding');
  const state = createRenderState();
  const ctx = canvas.getContext('2d')!;
  try {
    for (let f = 0; f < totalFrames; f++) {
      if (cancelled?.() || encodeError) break;
      const t = f / fps;
      if (spec && bands) sampleBands(spec, t, bands);
      drawLyricFrame(ctx, img, renderData, t, accent, state, { bands, showEq: ropts.show_eq, showTimeline: ropts.show_timeline, duration });

      while (encoder.encodeQueueSize > 60) await sleep(5);
      if (pending.length > 120) await drain();

      const timestamp = Math.round((f * 1_000_000) / fps);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const frame = new (window as any).VideoFrame(canvas, { timestamp });
      encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();

      if (f % fps === 0) {
        onProgress?.(0.92 * Math.min(1, f / totalFrames));
        await sleep(0);
      }
    }
    await encoder.flush();
    encoder.close();
    if (encodeError) throw encodeError;
    await drain();
  } finally {
    await fh.close();
  }

  if (cancelled?.()) {
    await remove(h264Path).catch(() => {});
    return;
  }

  onStage?.('finalizing');
  await runFfmpeg('mux_h264', { h264Path, audioPath, outputPath, fps, duration }, 0.92, 0.08, onProgress);
  await remove(h264Path).catch(() => {});
}

// ── Fallback path (JPEG sequence → libx264) ─────────────────────────────────────
async function renderFallback(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderData: any,
  accent: [number, number, number],
  duration: number,
  audioPath: string,
  outputPath: string,
  spec: Spectrogram | null,
  ropts: ProjectRenderOptions,
  onProgress?: (f: number) => void,
  onStage?: (s: RenderStage) => void,
  cancelled?: () => boolean,
): Promise<void> {
  const fps = 30;
  const totalFrames = Math.ceil(duration * fps);
  const bands = spec ? new Float32Array(spec.numBands) : null;
  const framesDir = await join(await tempDir(), `lvs-frames-${crypto.randomUUID()}`);
  await mkdir(framesDir, { recursive: true });

  onStage?.('encoding');
  const state = createRenderState();
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  try {
    for (let f = 0; f < totalFrames; f++) {
      if (cancelled?.()) {
        await remove(framesDir, { recursive: true }).catch(() => {});
        return;
      }
      const t = f / fps;
      if (spec && bands) sampleBands(spec, t, bands);
      drawLyricFrame(ctx, img, renderData, t, accent, state, { bands, showEq: ropts.show_eq, showTimeline: ropts.show_timeline, duration });
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) throw new Error('프레임 인코딩 실패 (frame encode failed)');
      const name = `f${String(f).padStart(6, '0')}.jpg`;
      await writeFile(await join(framesDir, name), new Uint8Array(await blob.arrayBuffer()));

      if (f % 10 === 0) {
        onProgress?.(0.55 * Math.min(1, f / totalFrames));
        await sleep(0);
      }
    }

    onStage?.('finalizing');
    await runFfmpeg(
      'encode_frames',
      { framesDir, pattern: 'f%06d.jpg', audioPath, outputPath, fps, duration },
      0.55,
      0.45,
      onProgress,
    );
  } finally {
    await remove(framesDir, { recursive: true }).catch(() => {});
  }
}
