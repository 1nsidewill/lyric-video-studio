import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { parseSingerTags } from '../utils/parseSingerTags';
import { drawLyricFrame, createRenderState } from '../utils/canvasRenderer';
import { getDominantColor } from '../utils/colorUtils';
import type { ProjectData } from '../types';

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
  const [project, setProject] = useState<ProjectData | null>(null);
  const [artworkImg, setArtworkImg] = useState<HTMLImageElement | null>(null);
  const [accentColor, setAccentColor] = useState<[number, number, number]>([200, 160, 80]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const renderStateRef = useRef(createRenderState());
  const audioUrl = `/api/project/${projectId}/audio`;
  const artworkUrl = `/api/project/${projectId}/artwork`;
  const { isPlaying, currentTime, duration, toggle, seek } = useAudioPlayer(audioUrl);

  useEffect(() => {
    fetch(`/api/project/${projectId}`).then(r => r.json()).then((data: ProjectData) => {
      const parsed = parseSingerTags(data.lyrics).filter((l: { start_time: number }) => l.start_time > 0);
      setProject({ ...data, lyrics: parsed });
    });
  }, [projectId]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = artworkUrl;
    img.onload = () => { setArtworkImg(img); setAccentColor(getDominantColor(img)); };
  }, [artworkUrl]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project || !artworkImg) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawLyricFrame(ctx, artworkImg, project, currentTime, accentColor, renderStateRef.current, 0.08);
  }, [project, artworkImg, currentTime, accentColor]);

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
    <div className="max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>PREVIEW</h2>
        <p className="text-xs text-[var(--color-text-primary)] mt-1 tracking-wide" style={{ fontFamily: 'var(--font-mono)' }}>
          SPACE play/pause · ← → skip 5s · drag timeline to seek
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="relative rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <canvas ref={canvasRef} width={1280} height={720} className="w-full aspect-video bg-black" />

        <button onClick={toggle} className="absolute inset-0 flex items-center justify-center bg-transparent hover:bg-black/10 transition-colors">
          {!isPlaying && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400 }}
              className="w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-md"
              style={{ background: 'rgba(255, 255, 255, 0.9)', boxShadow: '0 0 40px rgba(255, 255, 255, 0.4)' }}>
              <span className="text-xl ml-1" style={{ color: '#000' }}>▶</span>
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

      <div className="flex justify-between text-xs mt-2 px-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex gap-3 mt-4">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={onBack}
          className="flex-1 py-3.5 rounded-xl font-semibold text-sm tracking-wide"
          style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-primary)' }}>
          ← BACK TO SYNC
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02, boxShadow: '0 0 40px rgba(255, 255, 255, 0.1)' }}
          whileTap={{ scale: 0.97 }} onClick={onGenerate}
          className="flex-1 py-3.5 rounded-xl font-bold text-sm tracking-wide"
          style={{ fontFamily: 'var(--font-display)', background: '#ffffff', color: '#000000' }}>
          RENDER VIDEO →
        </motion.button>
      </motion.div>
    </div>
  );
}
