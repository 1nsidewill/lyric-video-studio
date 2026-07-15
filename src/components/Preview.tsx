import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { parseSingerTags } from '../utils/parseSingerTags';
import { drawLyricFrame, createRenderState } from '../utils/canvasRenderer';
import { getDominantColor } from '../utils/colorUtils';
import { loadProject, saveProject, projectMediaSrc, projectFilePath } from '../lib/storage';
import { getSpectrogram, sampleBands, type Spectrogram } from '../lib/spectrogram';
import { springSoft } from '../lib/motion';
import { useI18n } from '../lib/i18n';
import { IconPlay, IconArrowLeft, IconFilm, IconWave, IconTimeline } from './icons';
import { DEFAULT_RENDER_OPTIONS, type ProjectData, type AspectRatio, type RenderOptions } from '../types';

interface Props {
  projectId: string;
  onGenerate: () => void;
  onBack: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Preview({ projectId, onGenerate, onBack }: Props) {
  const { t } = useI18n();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [artworkImg, setArtworkImg] = useState<HTMLImageElement | null>(null);
  const [accentColor, setAccentColor] = useState<[number, number, number]>([200, 160, 80]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const renderStateRef = useRef(createRenderState());
  const specRef = useRef<Spectrogram | null>(null);
  const bandsRef = useRef<Float32Array | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [artworkSrc, setArtworkSrc] = useState<string>('');
  const [showEq, setShowEq] = useState(DEFAULT_RENDER_OPTIONS.show_eq);
  const [showTimeline, setShowTimeline] = useState(DEFAULT_RENDER_OPTIONS.show_timeline);
  const [aspect, setAspect] = useState<AspectRatio>(DEFAULT_RENDER_OPTIONS.aspect);
  const { isPlaying, currentTime, duration, toggle, seek } = useAudioPlayer(audioSrc);

  const persistOptions = useCallback(async (opts: RenderOptions) => {
    try {
      const full = await loadProject(projectId); // full lyrics — don't persist the filtered copy
      await saveProject({ ...full, render_options: opts });
    } catch { /* best-effort */ }
  }, [projectId]);
  const toggleEq = () => { const v = !showEq; setShowEq(v); persistOptions({ show_eq: v, show_timeline: showTimeline, aspect }); };
  const toggleTimeline = () => { const v = !showTimeline; setShowTimeline(v); persistOptions({ show_eq: showEq, show_timeline: v, aspect }); };
  const chooseAspect = (a: AspectRatio) => { setAspect(a); persistOptions({ show_eq: showEq, show_timeline: showTimeline, aspect: a }); };

  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await loadProject(projectId);
      if (!alive) return;
      const parsed = parseSingerTags(data.lyrics).filter((l: { start_time: number }) => l.start_time > 0);
      setProject({ ...data, lyrics: parsed });
      setShowEq(data.render_options?.show_eq ?? DEFAULT_RENDER_OPTIONS.show_eq);
      setShowTimeline(data.render_options?.show_timeline ?? DEFAULT_RENDER_OPTIONS.show_timeline);
      setAspect(data.render_options?.aspect ?? DEFAULT_RENDER_OPTIONS.aspect);
      setArtworkSrc(await projectMediaSrc(projectId, data.artwork_filename));
      setAudioSrc(await projectMediaSrc(projectId, data.audio_filename));
      // Reactive-EQ spectrogram (computed once, cached by project id)
      const audioPath = await projectFilePath(projectId, data.audio_filename);
      getSpectrogram(projectId, audioPath).then((s) => { if (alive) specRef.current = s; }).catch(() => {});
    })();
    return () => { alive = false; };
  }, [projectId]);

  useEffect(() => {
    if (!artworkSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = artworkSrc;
    img.onload = () => { setArtworkImg(img); setAccentColor(getDominantColor(img)); };
  }, [artworkSrc]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project || !artworkImg) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let bands: Float32Array | null = null;
    const spec = specRef.current;
    if (spec) {
      if (!bandsRef.current || bandsRef.current.length !== spec.numBands) bandsRef.current = new Float32Array(spec.numBands);
      sampleBands(spec, currentTime, bandsRef.current);
      bands = bandsRef.current;
    }
    drawLyricFrame(ctx, artworkImg, project, currentTime, accentColor, renderStateRef.current, {
      bands, showEq, showTimeline, duration,
    });
  }, [project, artworkImg, currentTime, accentColor, showEq, showTimeline, duration]);

  useEffect(() => {
    let rafId: number;
    const loop = () => { drawFrame(); rafId = requestAnimationFrame(loop); };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [drawFrame]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'Space': e.preventDefault(); toggle(); break;
        case 'ArrowLeft': e.preventDefault(); seek(Math.max(0, currentTime - 5)); break;
        case 'ArrowRight': e.preventDefault(); seek(Math.min(duration, currentTime + 5)); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle, seek, currentTime, duration]);

  const seekFromMouse = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!timelineRef.current || duration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
  }, [seek, duration]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => seekFromMouse(e);
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, seekFromMouse]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-full min-h-0 w-full max-w-5xl mx-auto px-6 py-4 flex flex-col">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="text-center mb-3 shrink-0">
        <h2 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('pv.title')}</h2>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          {t('pv.hint')}
        </p>
      </motion.div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
        className="relative rounded-2xl overflow-hidden"
        style={{
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
          aspectRatio: aspect === '9:16' ? '9 / 16' : '16 / 9',
          height: '100%',
          maxWidth: '100%',
        }}>
        <canvas ref={canvasRef}
          width={aspect === '9:16' ? 720 : 1280}
          height={aspect === '9:16' ? 1280 : 720}
          className="w-full h-full bg-black" />

        <button onClick={toggle} className="absolute inset-0 flex items-center justify-center bg-transparent hover:bg-black/10 transition-colors">
          {!isPlaying && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springSoft}
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255, 255, 255, 0.92)', boxShadow: '0 8px 40px rgba(0,0,0,0.35)', color: '#000' }}>
              <IconPlay size={26} />
            </motion.div>
          )}
        </button>

        <div ref={timelineRef} className="absolute bottom-0 left-0 right-0 h-3 cursor-pointer group"
          onMouseDown={e => { setIsDragging(true); seekFromMouse(e.nativeEvent); }}>
          <div className="absolute bottom-0 left-0 right-0 h-1 group-hover:h-2.5 transition-all bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#ffffff' }} />
          </div>
          <div className="absolute bottom-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}>
            <div className="w-3 h-3 rounded-full -mb-0.5" style={{ background: '#ffffff', boxShadow: '0 0 8px rgba(255, 255, 255, 0.6)' }} />
          </div>
        </div>
      </motion.div>
      </div>

      <div className="flex justify-between text-xs mt-2 px-1 shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Style options — reflected live in the preview and baked into the render */}
      <div className="flex items-center justify-center gap-2 mt-3 shrink-0">
        {([['EQ', <IconWave size={13} />, showEq, toggleEq], [t('pv.timeline'), <IconTimeline size={13} />, showTimeline, toggleTimeline]] as const).map(([label, icon, active, onClick]) => (
          <motion.button key={label} whileTap={{ scale: 0.95 }} onClick={onClick} transition={springSoft}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors"
            style={{
              fontFamily: 'var(--font-display)',
              background: active ? 'rgba(255,255,255,0.92)' : 'var(--color-bg-card)',
              color: active ? '#000' : 'var(--color-text-muted)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
            {icon} {label}
          </motion.button>
        ))}
        <span className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
        {(['16:9', '9:16'] as const).map((a) => (
          <motion.button key={a} whileTap={{ scale: 0.95 }} onClick={() => chooseAspect(a)}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors"
            style={{
              fontFamily: 'var(--font-display)',
              background: aspect === a ? 'rgba(255,255,255,0.92)' : 'var(--color-bg-card)',
              color: aspect === a ? '#000' : 'var(--color-text-muted)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
            {a === '9:16' ? t('pv.reels') : '16:9'}
          </motion.button>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex gap-3 mt-3 shrink-0">
        <motion.button whileTap={{ scale: 0.98 }} transition={springSoft} onClick={onBack}
          className="flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5"
          style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>
          <IconArrowLeft size={16} /> {t('pv.toSync')}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.98 }} transition={springSoft} onClick={onGenerate}
          className="flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          style={{ fontFamily: 'var(--font-display)', background: '#ffffff', color: '#000000', boxShadow: '0 8px 30px rgba(255,255,255,0.12)' }}>
          <IconFilm size={17} /> {t('pv.toRender')}
        </motion.button>
      </motion.div>
    </div>
  );
}
