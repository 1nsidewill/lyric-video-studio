import { authFetch } from '../utils/api';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseSingerTags } from '../utils/parseSingerTags';
import { resetSingerColors, getSingerColor } from '../utils/singerColors';
import { drawLyricFrame, createRenderState } from '../utils/canvasRenderer';
import { getDominantColor } from '../utils/colorUtils';
import type { ProjectData } from '../types';

interface Props {
  projectId: string;
  onBack: () => void;
  onBackToSync?: () => void;
}

interface CreditField { key: string; label: string; placeholder: string; }

const CREDIT_FIELDS: CreditField[] = [
  { key: 'producer', label: 'Producer', placeholder: 'Producer name(s)' },
  { key: 'composer', label: 'Composer', placeholder: 'Composer name(s)' },
  { key: 'arranger', label: 'Arranger', placeholder: 'Arranger name(s)' },
  { key: 'lyricist', label: 'Lyricist', placeholder: 'Lyricist name(s)' },
  { key: 'vocalist', label: 'Vocalist', placeholder: 'Vocalist name(s)' },
  { key: 'mixing', label: 'Mixing', placeholder: 'Mix engineer name(s)' },
  { key: 'mastering', label: 'Mastering', placeholder: 'Mastering engineer name(s)' },
];

function TagInput({ label, tags, onTagsChange, placeholder }: {
  label: string; tags: string[]; onTagsChange: (t: string[]) => void; placeholder: string;
}) {
  const [input, setInput] = useState('');
  const addTag = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !tags.includes(trimmed)) onTagsChange([...tags, trimmed]);
    setInput('');
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ',' || e.key === 'Enter') { e.preventDefault(); addTag(input); }
    if (e.key === 'Backspace' && !input && tags.length > 0) onTagsChange(tags.slice(0, -1));
  };
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest mb-1 block"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}>{label}</label>
      <div className="flex flex-wrap items-center gap-1.5 glass rounded-lg px-3 py-2 min-h-[38px] focus-within:ring-1 focus-within:ring-[var(--color-accent)]/30 transition-all">
        {tags.map((t, i) => (
          <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium shrink-0"
            style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
            {t}
            <button onClick={() => onTagsChange(tags.filter((_, j) => j !== i))}
              className="hover:text-white ml-0.5 text-[9px]">×</button>
          </motion.span>
        ))}
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input); }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent text-xs outline-none placeholder:text-[var(--color-text-muted)]"
          style={{ fontFamily: 'var(--font-body)' }} />
      </div>
    </div>
  );
}

async function getAudioDuration(projectId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`/api/project/${projectId}/audio`);
    audio.addEventListener('loadedmetadata', () => resolve(audio.duration));
    audio.addEventListener('error', () => reject(new Error('Failed to load audio')));
  });
}

export default function Generate({ projectId, onBack, onBackToSync }: Props) {
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [project, setProject] = useState<ProjectData | null>(null);
  const [credits, setCredits] = useState<Record<string, string[]>>({});
  const [copied, setCopied] = useState(false);
  const [downloadFilename, setDownloadFilename] = useState('');
  const cancelRef = useRef(false);

  useEffect(() => {
    authFetch(`/api/project/${projectId}`).then(r => r.json()).then((p: ProjectData) => {
      setProject(p);
      // Auto-generate filename: "Artist - Title (Lyric Video)"
      const artist = p.artist?.trim() || '';
      const title = p.title?.trim() || '';
      const base = artist && title
        ? `${artist} - ${title} (Lyric Video)`
        : title || artist || 'Lyric Video';
      // Sanitize: remove characters not allowed in filenames
      setDownloadFilename(base.replace(/[/\\:*?"<>|]/g, '').trim());
    });
  }, [projectId]);

  const startCanvasRender = useCallback(async () => {
    if (!project) return;
    cancelRef.current = false;
    setRenderStatus('rendering');
    setProgress(0);

    try {
      const lyrics = parseSingerTags(project.lyrics).filter(l => l.start_time > 0);
      const renderProject = { ...project, lyrics };

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `/api/project/${projectId}/artwork`;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load artwork'));
      });

      const accentColor = getDominantColor(img);
      resetSingerColors();
      for (const l of lyrics) {
        if (l.singer) getSingerColor(l.singer);
      }

      const duration = await getAudioDuration(projectId);
      const fps = 60;
      const totalFrames = Math.ceil(duration * fps);
      const W = 1920, H = 1080;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsToken = localStorage.getItem('token') ?? '';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/api/video/ws/render/${projectId}?token=${wsToken}`);
      ws.binaryType = 'arraybuffer';

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('WebSocket connection failed'));
      });

      ws.addEventListener('message', (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'progress') setProgress(msg.progress);
          if (msg.type === 'done') { setProgress(1); setRenderStatus('done'); }
          if (msg.type === 'error') { setErrorMsg(msg.message); setRenderStatus('error'); }
        } catch { /* binary data, ignore */ }
      });

      // ── WebCodecs path (Chrome/Edge: GPU hardware H.264 encoding) ──────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const VideoEncoderAPI = (window as any).VideoEncoder as typeof VideoEncoder | undefined;
      const webCodecsAvailable = !!VideoEncoderAPI;

      const encoderConfig = {
        codec: 'avc1.640034' as const, // H.264 High Profile Level 5.2
        width: W, height: H,
        bitrate: 20_000_000,
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware' as const,
        avc: { format: 'annexb' as const },
      };

      let useWebCodecs = false;
      if (webCodecsAvailable) {
        try {
          const support = await VideoEncoderAPI.isConfigSupported(encoderConfig);
          useWebCodecs = !!support.supported;
        } catch { useWebCodecs = false; }
      }

      const mode = useWebCodecs ? 'webcodecs' : 'rawvideo';

      ws.send(JSON.stringify({ mode, fps: useWebCodecs ? fps : 30, width: W, height: H, total_frames: totalFrames }));

      await new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'ready') { ws.removeEventListener('message', handler); resolve(); }
            if (msg.type === 'error') reject(new Error(msg.message));
          } catch { /* ignore */ }
        };
        ws.addEventListener('message', handler);
      });

      const state = createRenderState();

      if (useWebCodecs) {
        // ── GPU H.264 encoding via WebCodecs ────────────────────────────────────────
        // encoder.encode() queues frame for GPU; output callback fires asynchronously
        // → canvas rendering and GPU encoding run concurrently = ~real-time speed
        let encodeError: Error | null = null;
        const encoder = new VideoEncoderAPI!({
          output: (chunk: EncodedVideoChunk) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            ws.send(data);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          error: (e: any) => { encodeError = new Error(`VideoEncoder: ${e.message}`); },
        });

        encoder.configure(encoderConfig);

        const ctx = canvas.getContext('2d')!;
        for (let f = 0; f < totalFrames; f++) {
          if (cancelRef.current || encodeError) break;

          const t = f / fps;
          drawLyricFrame(ctx, img, renderProject, t, accentColor, state, 0.08);

          // Hold off if the encoder's input queue is too large (backpressure)
          while (encoder.encodeQueueSize > 60) {
            await new Promise(r => setTimeout(r, 5));
          }

          const timestamp = Math.round(f * 1_000_000 / fps); // microseconds
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const frame = new (window as any).VideoFrame(canvas, { timestamp });
          encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
          frame.close();

          if (f % fps === 0) {
            setProgress(Math.min(0.9, f / totalFrames));
            await new Promise(r => setTimeout(r, 0)); // yield to browser
          }
        }

        await encoder.flush();
        encoder.close();

        if (encodeError) throw encodeError;

      } else {
        // ── Fallback: raw RGBA (Firefox / no WebCodecs support) ──────────────────
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const actualFps = 30;
        const fallbackFrames = Math.ceil(duration * actualFps);
        const MAX_BUFFER = 64 * 1024 * 1024;

        for (let f = 0; f < fallbackFrames; f++) {
          if (cancelRef.current) { ws.close(); return; }
          if (ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket closed');

          while (ws.bufferedAmount > MAX_BUFFER) {
            await new Promise(r => setTimeout(r, 10));
          }

          const t = f / actualFps;
          drawLyricFrame(ctx, img, renderProject, t, accentColor, state, 0.08);
          ws.send(ctx.getImageData(0, 0, W, H).data.buffer);

          if (f % 30 === 0) {
            setProgress(Math.min(0.9, f / fallbackFrames));
            await new Promise(r => setTimeout(r, 0));
          }
        }
      }

      ws.send(new TextEncoder().encode('END'));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Render failed');
      setRenderStatus('error');
    }
  }, [project, projectId]);

  const buildDescription = useCallback(() => {
    if (!project) return '';
    const lines: string[] = [];
    lines.push(`${project.title || 'Untitled'} - ${project.artist || 'Unknown'}`);
    lines.push('');
    const hasAnyCred = CREDIT_FIELDS.some(f => (credits[f.key] || []).length > 0);
    if (hasAnyCred) {
      lines.push('[ Credits ]');
      for (const f of CREDIT_FIELDS) {
        const vals = credits[f.key] || [];
        if (vals.length > 0) lines.push(`${f.label}: ${vals.join(', ')}`);
      }
      lines.push('');
    }
    lines.push('---');
    lines.push('Lyric video made with LYRIC VIDEO STUDIO by insidewill');
    return lines.join('\n');
  }, [project, credits]);

  const desc = buildDescription();
  const copyDesc = () => { navigator.clipboard.writeText(desc); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const progressPct = Math.round(progress * 100);

  const handleDownload = useCallback(async () => {
    const res = await authFetch(`/api/video/download/${projectId}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(downloadFilename || 'lyric_video').trim()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [projectId, downloadFilename]);

  return (
    <div className="max-w-5xl mx-auto">
      <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-bold tracking-tight mb-8 text-center"
        style={{ fontFamily: 'var(--font-display)' }}>RENDER</motion.h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <AnimatePresence mode="wait">
            {renderStatus === 'idle' && (
              <motion.div key="ready" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
                <div className="rounded-2xl p-10 relative overflow-hidden"
                  style={{ background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="absolute inset-0 opacity-10"
                    style={{ background: 'radial-gradient(circle at 30% 40%, var(--color-accent), transparent 60%)' }} />
                  <div className="relative z-10 text-center">
                    <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-5xl mb-4">🎬</motion.div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
                      WebCodecs GPU H.264 · same canvas engine as preview
                    </p>
                    <div className="flex justify-center gap-4 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="px-2 py-1 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>1920×1080</span>
                      <span className="px-2 py-1 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>60fps H.264</span>
                      <span className="px-2 py-1 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>AAC 320k</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  {onBackToSync && (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onBackToSync}
                      className="py-3.5 px-4 rounded-xl font-semibold text-sm tracking-wide"
                      style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>← SYNC</motion.button>
                  )}
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onBack}
                    className="py-3.5 px-4 rounded-xl font-semibold text-sm tracking-wide"
                    style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>← PREVIEW</motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02, boxShadow: '0 0 50px rgba(255, 255, 255, 0.15)' }}
                    whileTap={{ scale: 0.97 }} onClick={startCanvasRender}
                    className="flex-1 py-3.5 rounded-xl font-bold text-sm tracking-wide"
                    style={{ fontFamily: 'var(--font-display)', background: '#ffffff', color: '#000000' }}>START RENDER</motion.button>
                </div>
              </motion.div>
            )}

            {renderStatus === 'rendering' && (
              <motion.div key="processing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                <div className="rounded-2xl p-10 relative overflow-hidden"
                  style={{ background: 'var(--color-bg-card)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
                    className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-[0.02]"
                    style={{ background: 'conic-gradient(from 0deg, #ffffff, #a3a3a3, #525252, #ffffff)' }} />
                  <div className="relative z-10 text-center">
                    <div className="relative h-2 rounded-full overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <motion.div className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: '#ffffff' }}
                        animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
                    </div>
                    <motion.div key={progressPct} initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="text-5xl font-extrabold tabular-nums mb-2"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', textShadow: '0 0 40px rgba(255, 255, 255, 0.2)' }}>{progressPct}%</motion.div>
                    <p className="text-sm text-[var(--color-text-secondary)]" style={{ fontFamily: 'var(--font-body)' }}>
                      Raw RGBA frame streaming · fill in credits while you wait →
                    </p>
                  </div>
                </div>
                <motion.p animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}
                  className="text-xs text-[var(--color-text-muted)] text-center" style={{ fontFamily: 'var(--font-mono)' }}>
                  raw RGBA streaming · 60fps · pixel-perfect match →
                </motion.p>
              </motion.div>
            )}

            {renderStatus === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }} className="space-y-6">
                <div className="rounded-2xl p-10 relative overflow-hidden"
                  style={{ background: 'var(--color-bg-card)', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  <div className="absolute inset-0 opacity-10"
                    style={{ background: 'radial-gradient(circle at center, #ffffff, transparent 60%)' }} />
                  <div className="relative z-10 text-center">
                    <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300, delay: 0.2 }} className="text-5xl mb-4">✅</motion.div>
                    <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                      className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>RENDER COMPLETE</motion.p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}>파일명</label>
                  <div className="flex items-center gap-0 rounded-xl overflow-hidden"
                    style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)' }}>
                    <input
                      value={downloadFilename}
                      onChange={e => setDownloadFilename(e.target.value.replace(/[/\\:*?"<>|]/g, ''))}
                      className="flex-1 bg-transparent px-4 py-3 text-sm outline-none"
                      style={{ fontFamily: 'var(--font-body)', color: 'var(--color-text-primary)' }}
                      spellCheck={false}
                    />
                    <span className="px-3 text-xs shrink-0"
                      style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>.mp4</span>
                  </div>
                </div>
                <motion.button
                  onClick={handleDownload}
                  whileHover={{ scale: 1.02, boxShadow: '0 0 40px rgba(255, 255, 255, 0.2)' }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-4 rounded-2xl font-bold text-base tracking-wide"
                  style={{ fontFamily: 'var(--font-display)', background: '#ffffff', color: '#000000' }}>DOWNLOAD MP4</motion.button>
                <div className="flex gap-3">
                  {onBackToSync && (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onBackToSync}
                      className="flex-1 py-3 rounded-xl font-semibold text-sm"
                      style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>← SYNC</motion.button>
                  )}
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onBack}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm"
                    style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>← PREVIEW</motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={() => { setRenderStatus('idle'); setProgress(0); }}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm"
                    style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>RE-RENDER</motion.button>
                </div>
              </motion.div>
            )}

            {renderStatus === 'error' && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="rounded-2xl p-10" style={{ background: 'var(--color-bg-card)', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                  <div className="text-4xl mb-4 text-center">💥</div>
                  <p className="font-bold text-center" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-danger)' }}>RENDER FAILED</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center" style={{ fontFamily: 'var(--font-mono)' }}>{errorMsg}</p>
                </div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setRenderStatus('idle'); setProgress(0); setErrorMsg(''); }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>TRY AGAIN</motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">📋</span>
            <h3 className="text-sm font-bold tracking-wide uppercase" style={{ fontFamily: 'var(--font-display)' }}>YouTube Description</h3>
          </div>
          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
            {CREDIT_FIELDS.map(f => (
              <TagInput key={f.key} label={f.label} placeholder={f.placeholder}
                tags={credits[f.key] || []} onTagsChange={t => setCredits(prev => ({ ...prev, [f.key]: t }))} />
            ))}
          </div>
          <div className="relative">
            <label className="text-[10px] uppercase tracking-widest mb-1 block"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}>GENERATED DESCRIPTION</label>
            <textarea readOnly value={desc} rows={8}
              className="w-full glass rounded-xl px-4 py-3 text-xs leading-relaxed resize-none focus:outline-none"
              style={{ fontFamily: 'var(--font-mono)' }} />
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={copyDesc}
              className="absolute top-7 right-2 px-3 py-1.5 rounded-lg text-[10px] font-bold"
              style={{
                fontFamily: 'var(--font-display)',
                background: copied ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                color: copied ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}>{copied ? 'COPIED!' : 'COPY'}</motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
