import { authFetch } from '../utils/api';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import HitEffect, { emitHitParticles } from './HitEffect';
import ComboCounter from './ComboCounter';
import ScreenFlash from './ScreenFlash';
import { getSingerColor } from '../utils/singerColors';
import { parseSingerTags } from '../utils/parseSingerTags';
import type { LyricLine, ProjectData } from '../types';

interface Props {
  projectId: string;
  onComplete: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  color: string; type: 'spark' | 'ring' | 'glow';
}

const STORAGE_KEY = (id: string) => `lyric-sync-${id}`;

export default function LyricSync({ projectId, onComplete }: Props) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [synced, setSynced] = useState(false);
  const [combo, setCombo] = useState(0);
  const [lastHitTime, setLastHitTime] = useState(0);
  const [flashTrigger, setFlashTrigger] = useState(0);
  const [, setTotalHits] = useState(0);
  const editingSingerIdx: number | null = null;
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shakeControls = useAnimation();

  const audioUrl = `/api/project/${projectId}/audio`;
  const artworkUrl = `/api/project/${projectId}/artwork`;
  const { isPlaying, currentTime, duration, toggle, seek, play, restart, audioRef } = useAudioPlayer(audioUrl);

  // Load project and restore from localStorage
  useEffect(() => {
    authFetch(`/api/project/${projectId}`)
      .then(r => r.json())
      .then((data: ProjectData) => {
        setProject(data);
        const processed = parseSingerTags(data.lyrics);
        const saved = localStorage.getItem(STORAGE_KEY(projectId));
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as { lyrics: LyricLine[]; currentIdx: number };
            const restored = parseSingerTags(parsed.lyrics);
            setLyrics(restored);
            setCurrentIdx(parsed.currentIdx);
            if (parsed.currentIdx >= restored.length) setSynced(true);
            return;
          } catch { /* fall through */ }
        }
        setLyrics(processed.map(l => ({ ...l, start_time: 0, end_time: null })));
      });
  }, [projectId]);

  // Persist to localStorage on every change
  useEffect(() => {
    if (lyrics.length === 0) return;
    localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify({ lyrics, currentIdx }));
  }, [lyrics, currentIdx, projectId]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[currentIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentIdx]);

  const triggerHitFeedback = useCallback((lineElement: HTMLElement | null) => {
    // Gentle bump instead of violent shake
    shakeControls.start({
      y: [0, -2, 0],
      transition: { duration: 0.15, ease: 'easeOut' },
    });

    if (lineElement && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const lineRect = lineElement.getBoundingClientRect();
      const x = lineRect.left - containerRect.left + lineRect.width / 2;
      const y = lineRect.top - containerRect.top + lineRect.height / 2;
      emitHitParticles(particlesRef, x, y, combo);
    }

    setFlashTrigger(prev => prev + 1);
  }, [combo, shakeControls]);

  const stampLine = useCallback(() => {
    if (currentIdx >= lyrics.length) return;
    const now = audioRef.current?.currentTime ?? currentTime;

    setLyrics(prev => {
      const next = [...prev];
      next[currentIdx] = { ...next[currentIdx], start_time: now };
      if (currentIdx > 0 && next[currentIdx - 1].end_time === null) {
        next[currentIdx - 1] = { ...next[currentIdx - 1], end_time: now };
      }
      return next;
    });

    setCombo(prev => prev + 1);
    setLastHitTime(Date.now());
    setTotalHits(prev => prev + 1);

    const lineEl = listRef.current?.children[currentIdx] as HTMLElement | null;
    triggerHitFeedback(lineEl);

    if (currentIdx === lyrics.length - 1) setSynced(true);
    setCurrentIdx(prev => Math.min(prev + 1, lyrics.length));
  }, [currentIdx, currentTime, lyrics.length, triggerHitFeedback, audioRef]);

  const skipLine = useCallback(() => {
    if (currentIdx >= lyrics.length) return;
    setLyrics(prev => {
      const next = [...prev];
      next[currentIdx] = { ...next[currentIdx], start_time: -1 };
      return next;
    });
    if (currentIdx === lyrics.length - 1) setSynced(true);
    setCurrentIdx(prev => Math.min(prev + 1, lyrics.length));
  }, [currentIdx, lyrics.length]);

  const rollback = useCallback(() => {
    if (currentIdx <= 0) return;
    const prevIdx = currentIdx - 1;
    setLyrics(prev => {
      const next = [...prev];
      next[prevIdx] = { ...next[prevIdx], start_time: 0, end_time: null };
      if (prevIdx > 0) next[prevIdx - 1] = { ...next[prevIdx - 1], end_time: null };
      return next;
    });
    setCurrentIdx(prevIdx);
    setCombo(0);
    setSynced(false);
  }, [currentIdx]);

  const deleteLine = useCallback((idx: number) => {
    setLyrics(prev => {
      const next = prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, index: i }));
      return next;
    });
    if (currentIdx >= idx && currentIdx > 0) setCurrentIdx(prev => Math.max(0, prev - 1));
    setSynced(false);
  }, [currentIdx]);

  const startEdit = useCallback((idx: number) => {
    setEditingIdx(idx);
    setEditText(lyrics[idx].text);
  }, [lyrics]);

  const confirmEdit = useCallback(() => {
    if (editingIdx === null) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      deleteLine(editingIdx);
    } else {
      setLyrics(prev => {
        const next = [...prev];
        next[editingIdx] = { ...next[editingIdx], text: trimmed };
        return next;
      });
    }
    setEditingIdx(null);
    setEditText('');
  }, [editingIdx, editText, deleteLine]);

  const cancelEdit = useCallback(() => {
    setEditingIdx(null);
    setEditText('');
  }, []);

  const resetAll = useCallback(() => {
    setLyrics(prev => prev.map(l => ({ ...l, start_time: 0, end_time: null })));
    setCurrentIdx(0);
    setCombo(0);
    setTotalHits(0);
    setSynced(false);
    restart();
  }, [restart]);

  // Click a lyric line → seek there. If already committed, next space commits idx+1
  const handleLineClick = useCallback((idx: number) => {
    if (editingSingerIdx !== null) return;
    const line = lyrics[idx];
    const hasTimestamp = line.start_time > 0;
    const seekTo = hasTimestamp
      ? line.start_time
      : (idx > 0 && lyrics[idx - 1].start_time > 0 ? lyrics[idx - 1].start_time : 0);
    seek(seekTo);
    setCurrentIdx(hasTimestamp ? idx + 1 : idx);
    setSynced(false);
    play();
  }, [lyrics, seek, play, editingSingerIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingSingerIdx !== null || editingIdx !== null) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (!isPlaying) toggle();
          else stampLine();
          break;
        case 'Backspace':
          e.preventDefault();
          rollback();
          break;
        case 'Tab':
          e.preventDefault();
          skipLine();
          break;
        case 'KeyR':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); resetAll(); }
          break;
        case 'Escape':
          e.preventDefault();
          toggle();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPlaying, toggle, stampLine, rollback, resetAll, skipLine, editingSingerIdx, editingIdx]);

  const skipToPreview = async () => {
    if (!project) return;
    const committed = lyrics.filter(l => l.start_time > 0);
    const uncommitted = lyrics.filter(l => l.start_time === 0);
    if (uncommitted.length > 0) {
      const lastTime = committed.length > 0
        ? Math.max(...committed.map(l => l.end_time ?? l.start_time + 3))
        : 0;
      const remaining = Math.max(0, duration - lastTime);
      const gap = remaining / (uncommitted.length + 1);
      uncommitted.forEach((l, i) => {
        l.start_time = lastTime + gap * (i + 1);
        l.end_time = lastTime + gap * (i + 2);
      });
    }
    const merged = lyrics
      .filter(l => l.start_time > 0)
      .sort((a, b) => a.start_time - b.start_time)
      .map((l, i, arr) => ({
        ...l,
        end_time: l.end_time ?? (i < arr.length - 1 ? arr[i + 1].start_time : duration),
      }));
    await authFetch(`/api/project/${projectId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, lyrics: merged, audio_duration: duration }),
    });
    onComplete();
  };

  const saveAndProceed = async () => {
    if (!project) return;
    const activeLyrics = lyrics.filter(l => l.start_time > 0);
    const finalLyrics = activeLyrics.map((l, i) => ({
      ...l,
      end_time: l.end_time ?? (i < activeLyrics.length - 1 ? activeLyrics[i + 1].start_time : duration),
    }));
    await authFetch(`/api/project/${projectId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, lyrics: finalLyrics, audio_duration: duration }),
    });
    onComplete();
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const progress = lyrics.length > 0 ? (currentIdx / lyrics.length) * 100 : 0;

  return (
    <motion.div animate={shakeControls} ref={containerRef} className="max-w-4xl mx-auto relative">
      <HitEffect containerRef={containerRef} />
      <ScreenFlash trigger={flashTrigger} combo={combo} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-5 mb-6">
        <motion.img src={artworkUrl} alt="album art" className="w-16 h-16 rounded-xl object-cover"
          style={{ boxShadow: '0 0 30px rgba(255, 255, 255, 0.05)' }} whileHover={{ scale: 1.05 }} />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate" style={{ fontFamily: 'var(--font-display)' }}>
            {project.title || 'Untitled'}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] truncate">{project.artist || 'Unknown'}</p>
        </div>
        <ComboCounter combo={combo} lastHitTime={lastHitTime} />
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
            {formatTime(currentTime)}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            / {formatTime(duration)}
          </div>
        </div>
      </motion.div>

      {/* Progress bar — clickable to seek */}
      <motion.div initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }}
        className="relative h-3 rounded-full cursor-pointer group mb-2"
        style={{ background: 'var(--color-bg-card)' }}
        onClick={(e) => {
          if (duration <= 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          seek(ratio * duration);
          play();
        }}>
        <div className="absolute inset-y-1 left-0 right-0 rounded-full overflow-hidden">
          <motion.div className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, background: '#ffffff' }}
            transition={{ duration: 0.1 }} />
          <div className="absolute inset-y-0 left-0 rounded-full opacity-20"
            style={{ width: `${progress}%`, background: '#ffffff' }} />
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)', background: '#ffffff', boxShadow: '0 0 8px rgba(255, 255, 255, 0.5)' }} />
      </motion.div>

      {/* Stats + controls */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="flex justify-between items-center mb-4">
        <div className="flex gap-4 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className="text-[var(--color-text-muted)]">
            <span className="text-[var(--color-text-primary)]">{currentIdx}</span>/{lyrics.length} lines
          </span>
          <span className="text-[var(--color-text-muted)]">{Math.round(progress)}% done</span>
        </div>
        <div className="flex gap-3 text-xs text-[var(--color-text-muted)]">
          <span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
              SPACE</kbd> {isPlaying ? 'HIT' : 'PLAY'}
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              ←</kbd> UNDO
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              ESC</kbd> PAUSE
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              TAB</kbd> SKIP
          </span>
          <span className="text-[var(--color-text-muted)] opacity-50">· click line to seek</span>
        </div>
      </motion.div>

      {/* Lyric lines */}
      <div ref={listRef} className="h-[50vh] overflow-y-auto space-y-0.5 rounded-2xl p-4 relative"
        style={{ background: 'linear-gradient(180deg, var(--color-bg-card), rgba(26, 26, 26, 0.5))', border: '1px solid rgba(255,255,255,0.03)' }}>
        <AnimatePresence>
          {lyrics.map((line, i) => {
            const isCurrent = i === currentIdx;
            const isDone = i < currentIdx;
            const isSkipped = line.start_time === -1;
            const singerClr = getSingerColor(line.singer);
            const singerRgb = singerClr ? `${singerClr[0]}, ${singerClr[1]}, ${singerClr[2]}` : null;
            return (
              <motion.div
                key={i} layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: isCurrent ? 1 : isDone ? 0.7 : 0.25, x: 0, scale: 1, y: 0 }}
                transition={{ layout: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
                onClick={() => handleLineClick(i)}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors relative ${isCurrent ? 'z-10' : 'hover:bg-white/[0.03]'}`}
                style={isCurrent ? {
                  background: singerRgb
                    ? `linear-gradient(90deg, rgba(${singerRgb}, 0.15), rgba(${singerRgb}, 0.04))`
                    : 'linear-gradient(90deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))',
                  border: `1px solid rgba(${singerRgb || '255, 255, 255'}, 0.25)`,
                  boxShadow: `0 0 30px rgba(${singerRgb || '255, 255, 255'}, 0.05)`,
                } : isDone ? {
                  background: 'rgba(255,255,255,0.02)', border: '1px solid transparent',
                  borderLeft: singerRgb ? `3px solid rgba(${singerRgb}, 0.4)` : '1px solid transparent',
                } : {
                  border: '1px solid transparent',
                  borderLeft: singerRgb ? `3px solid rgba(${singerRgb}, 0.15)` : '1px solid transparent',
                }}
              >
                {/* Timestamp */}
                <span className="w-16 text-right shrink-0 text-xs tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)', color: isSkipped ? 'var(--color-text-muted)' : isDone ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  {isSkipped ? 'SKIP' : isDone ? formatTime(line.start_time) : '--:--'}
                </span>

                {/* Lyric text or edit input */}
                {editingIdx === i ? (
                  <div className="flex-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      autoFocus
                      className="flex-1 px-2 py-1 rounded-lg text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--color-text-primary)]/40"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-lyric-active)', border: '1px solid rgba(255, 255, 255, 0.3)' }}
                    />
                      <button onClick={confirmEdit}
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>OK</button>
                    <button onClick={cancelEdit}
                      className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)' }}>ESC</button>
                  </div>
                ) : (
                  <span className={`flex-1 transition-all ${isCurrent ? 'text-base font-semibold' : 'text-sm'} ${isSkipped ? 'line-through opacity-30' : ''}`}
                    style={{
                      fontFamily: isCurrent ? 'var(--font-display)' : 'var(--font-body)',
                      color: isCurrent ? 'var(--color-lyric-active)' : isDone ? 'var(--color-lyric-past)' : 'var(--color-lyric-inactive)',
                      textShadow: isCurrent ? '0 0 20px rgba(255, 255, 255, 0.2)' : 'none',
                    }}>
                    {line.text}
                  </span>
                )}

                {/* Singer badge + actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {line.singer && editingIdx !== i && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        background: singerRgb ? `rgba(${singerRgb}, 0.15)` : 'rgba(255, 255, 255, 0.1)',
                        color: singerRgb ? `rgb(${singerRgb})` : 'var(--color-text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                      {line.singer}
                    </span>
                  )}

                  {editingIdx !== i && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(i); }}
                        className="w-5 h-5 rounded flex items-center justify-center text-[9px] hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                        title="Edit">✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteLine(i); }}
                        className="w-5 h-5 rounded flex items-center justify-center text-[9px] hover:bg-red-500/20 transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                        title="Delete">🗑</button>
                    </div>
                  )}

                  {/* Status */}
                  {isDone && editingIdx !== i && (
                    <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>✓</motion.div>
                  )}
                  {isCurrent && isPlaying && editingIdx !== i && (
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }}
                      className="w-2 h-2 rounded-full"
                      style={{ background: '#ffffff', boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)' }} />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex gap-3 mt-6">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={toggle}
          className="flex-1 py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all"
          style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-primary)' }}>
          {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={skipToPreview}
          className="py-3.5 px-5 rounded-xl font-semibold text-sm tracking-wide transition-all"
          style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-primary)' }}>
          SKIP → PREVIEW
        </motion.button>
        <motion.button
          whileHover={synced ? { scale: 1.02, boxShadow: '0 0 40px rgba(255, 255, 255, 0.15)' } : {}}
          whileTap={synced ? { scale: 0.97 } : {}}
          onClick={saveAndProceed} disabled={!synced}
          className="flex-1 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all disabled:opacity-20 disabled:cursor-not-allowed"
          style={{
            fontFamily: 'var(--font-display)',
            background: synced ? '#ffffff' : 'var(--color-bg-card)',
            color: synced ? '#000' : 'var(--color-text-muted)',
          }}>
          COMPLETE → PREVIEW
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
