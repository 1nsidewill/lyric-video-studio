import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import HitEffect, { emitHitParticles } from './HitEffect';
import ComboCounter from './ComboCounter';
import ScreenFlash from './ScreenFlash';
import { getSingerColor } from '../utils/singerColors';
import { parseSingerTags } from '../utils/parseSingerTags';
import { loadProject, saveProject, projectMediaSrc } from '../lib/storage';
import { springSoft } from '../lib/motion';
import { useI18n } from '../lib/i18n';
import { IconPlay, IconPause, IconPencil, IconTrash, IconCheck, IconX } from './icons';
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
  const { t } = useI18n();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lastHitTime, setLastHitTime] = useState(0);
  const [flashTrigger, setFlashTrigger] = useState(0);
  const [, setTotalHits] = useState(0);
  const editingSingerIdx: number | null = null;
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editingAll, setEditingAll] = useState(false);
  const [allText, setAllText] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shakeControls = useAnimation();

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [artworkSrc, setArtworkSrc] = useState<string>('');
  const { isPlaying, currentTime, duration, toggle, seek, play, pause, restart, audioRef } = useAudioPlayer(audioSrc);

  // Load project (local storage) and restore in-progress sync from localStorage
  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await loadProject(projectId);
      if (!alive) return;
      setProject(data);
      setArtworkSrc(await projectMediaSrc(projectId, data.artwork_filename));
      setAudioSrc(await projectMediaSrc(projectId, data.audio_filename));
      const processed = parseSingerTags(data.lyrics);
      const saved = localStorage.getItem(STORAGE_KEY(projectId));
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { lyrics: LyricLine[]; currentIdx: number };
          const restored = parseSingerTags(parsed.lyrics);
          setLyrics(restored);
          setCurrentIdx(parsed.currentIdx);
          return;
        } catch { /* fall through */ }
      }
      setLyrics(processed.map(l => ({ ...l, start_time: 0, end_time: null })));
    })();
    return () => { alive = false; };
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
      // Clear this line's end so it is recomputed from its (possibly new) neighbour on save.
      next[currentIdx] = { ...next[currentIdx], start_time: now, end_time: null };
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

    setCurrentIdx(prev => Math.min(prev + 1, lyrics.length));
  }, [currentIdx, currentTime, lyrics.length, triggerHitFeedback, audioRef]);

  const skipLine = useCallback(() => {
    if (currentIdx >= lyrics.length) return;
    setLyrics(prev => {
      const next = [...prev];
      next[currentIdx] = { ...next[currentIdx], start_time: -1 };
      return next;
    });
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
  }, [currentIdx]);

  const deleteLine = useCallback((idx: number) => {
    setLyrics(prev => {
      const next = prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, index: i }));
      return next;
    });
    if (currentIdx >= idx && currentIdx > 0) setCurrentIdx(prev => Math.max(0, prev - 1));
  }, [currentIdx]);

  const startEdit = useCallback((idx: number) => {
    pause(); // freeze playback so the track doesn't run off while you retype the line
    setEditingIdx(idx);
    setEditText(lyrics[idx].text);
  }, [lyrics, pause]);

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

  // Full-lyrics editor: serialize every line back to text (re-emitting [Singer] part tags),
  // so the user can add missing lines / reorder in one textarea.
  const openAllEdit = useCallback(() => {
    pause();
    let prevSinger: string | undefined;
    const out: string[] = [];
    for (const l of lyrics) {
      if (l.singer !== prevSinger) {
        if (l.singer) out.push(`[${l.singer}]`);
        prevSinger = l.singer;
      }
      out.push(l.text);
    }
    setAllText(out.join('\n'));
    setEditingAll(true);
  }, [lyrics, pause]);

  // Re-parse the edited text, then carry each unchanged line's timestamp over by matching
  // text (order-preserving, so duplicate lines and inserts are handled). New lines stay
  // unsynced; the cursor jumps to the first line that still needs a timestamp.
  const confirmAllEdit = useCallback(() => {
    const raw: LyricLine[] = allText
      .split('\n')
      .map(t => t.trim())
      .filter(Boolean)
      .map((text, i) => ({ index: i, text, start_time: 0, end_time: null }));
    const parsed = parseSingerTags(raw);

    const pool = new Map<string, { s: number; e: number | null }[]>();
    for (const l of lyrics) {
      if (l.start_time === 0) continue; // only carry over recorded / skipped lines
      const key = l.text.trim();
      const arr = pool.get(key) ?? [];
      arr.push({ s: l.start_time, e: l.end_time });
      pool.set(key, arr);
    }
    const merged = parsed.map((l, i) => {
      const q = pool.get(l.text.trim());
      if (q && q.length) {
        const t = q.shift()!;
        return { ...l, index: i, start_time: t.s, end_time: t.e };
      }
      return { ...l, index: i };
    });

    setLyrics(merged);
    const firstUnsynced = merged.findIndex(l => l.start_time === 0);
    setCurrentIdx(firstUnsynced === -1 ? merged.length : firstUnsynced);
    setEditingAll(false);
  }, [allText, lyrics]);

  const cancelAllEdit = useCallback(() => setEditingAll(false), []);

  const resetAll = useCallback(() => {
    setLyrics(prev => prev.map(l => ({ ...l, start_time: 0, end_time: null })));
    setCurrentIdx(0);
    setCombo(0);
    setTotalHits(0);
    restart();
  }, [restart]);

  // Click a lyric line → MOVE only: seek a short run-up before the line and park the
  // cursor there. The click never touches timestamps or playback state — the time is
  // committed only when you press Space (while playing).
  const RUN_UP_SEC = 1.2;
  const handleLineClick = useCallback((idx: number) => {
    if (editingIdx !== null) return; // don't seek out from under an open editor
    const line = lyrics[idx];
    const base = line.start_time > 0
      ? line.start_time
      : (idx > 0 && lyrics[idx - 1].start_time > 0 ? lyrics[idx - 1].start_time : 0);
    seek(Math.max(0, base - RUN_UP_SEC));
    setCurrentIdx(idx);
  }, [lyrics, seek, editingIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingSingerIdx !== null || editingIdx !== null || editingAll) return;
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
  }, [isPlaying, toggle, stampLine, rollback, resetAll, skipLine, editingSingerIdx, editingIdx, editingAll]);

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
    await saveProject({ ...project, lyrics: merged, audio_duration: duration });
    onComplete();
  };

  const saveAndProceed = async () => {
    if (!project) return;
    const activeLyrics = lyrics.filter(l => l.start_time > 0);
    const finalLyrics = activeLyrics.map((l, i) => ({
      ...l,
      end_time: l.end_time ?? (i < activeLyrics.length - 1 ? activeLyrics[i + 1].start_time : duration),
    }));
    await saveProject({ ...project, lyrics: finalLyrics, audio_duration: duration });
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

  // A line counts as "done" when it has a real time (>0) or was explicitly skipped (-1).
  // `synced` is derived, so clicking back to fine-tune one line never flips it off.
  const syncedCount = lyrics.filter(l => l.start_time !== 0).length;
  const synced = lyrics.length > 0 && syncedCount === lyrics.length;
  const progress = lyrics.length > 0 ? (syncedCount / lyrics.length) * 100 : 0;

  return (
    <motion.div animate={shakeControls} ref={containerRef}
      className="h-full min-h-0 w-full max-w-4xl mx-auto px-6 py-4 flex flex-col relative">
      <HitEffect containerRef={containerRef} />
      <ScreenFlash trigger={flashTrigger} combo={combo} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-5 mb-4 shrink-0">
        <motion.img src={artworkSrc} alt="album art" className="w-16 h-16 rounded-xl object-cover"
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
        className="relative h-3 rounded-full cursor-pointer group mb-2 shrink-0"
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
        className="flex justify-between items-center mb-3 shrink-0">
        <div className="flex gap-4 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className="text-[var(--color-text-muted)]">
            <span className="text-[var(--color-text-primary)]">{syncedCount}</span>/{lyrics.length} {t('sync.lines')}
          </span>
          <span className="text-[var(--color-text-muted)]">{t('sync.done', { p: Math.round(progress) })}</span>
        </div>
        <div className="flex gap-3 text-xs text-[var(--color-text-muted)]">
          <span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
              Space</kbd> {isPlaying ? t('sync.kbd.hit') : t('sync.kbd.play')}
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              ←</kbd> {t('sync.kbd.undo')}
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              Esc</kbd> {t('sync.kbd.stop')}
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
              Tab</kbd> {t('sync.kbd.skip')}
          </span>
          <span className="text-[var(--color-text-muted)] opacity-50">{t('sync.hint')}</span>
        </div>
      </motion.div>

      {/* Lyric lines */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-0.5 rounded-2xl p-4 relative glass-strong"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <AnimatePresence>
          {lyrics.map((line, i) => {
            const isCurrent = i === currentIdx;
            const isSkipped = line.start_time === -1;
            const recorded = line.start_time > 0;
            const marked = recorded || isSkipped;
            const singerClr = getSingerColor(line.singer);
            const singerRgb = singerClr ? `${singerClr[0]}, ${singerClr[1]}, ${singerClr[2]}` : null;
            return (
              <motion.div
                key={i} layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: isCurrent ? 1 : marked ? 0.7 : 0.25, x: 0, scale: 1, y: 0 }}
                transition={{ layout: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
                onClick={() => handleLineClick(i)}
                onDoubleClick={(e) => { e.stopPropagation(); startEdit(i); }}
                title={t('sync.dbl')}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors relative ${isCurrent ? 'z-10' : 'hover:bg-white/[0.03]'}`}
                style={isCurrent ? {
                  background: singerRgb
                    ? `linear-gradient(90deg, rgba(${singerRgb}, 0.15), rgba(${singerRgb}, 0.04))`
                    : 'linear-gradient(90deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))',
                  border: `1px solid rgba(${singerRgb || '255, 255, 255'}, 0.25)`,
                  boxShadow: `0 0 30px rgba(${singerRgb || '255, 255, 255'}, 0.05)`,
                } : marked ? {
                  background: 'rgba(255,255,255,0.02)', border: '1px solid transparent',
                  borderLeft: singerRgb ? `3px solid rgba(${singerRgb}, 0.4)` : '1px solid transparent',
                } : {
                  border: '1px solid transparent',
                  borderLeft: singerRgb ? `3px solid rgba(${singerRgb}, 0.15)` : '1px solid transparent',
                }}
              >
                {/* Timestamp */}
                <span className="w-16 text-right shrink-0 text-xs tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)', color: recorded ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  {isSkipped ? 'SKIP' : recorded ? formatTime(line.start_time) : '--:--'}
                </span>

                {/* Lyric text or edit input */}
                {editingIdx === i ? (
                  <div className="flex-1 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      onFocus={e => e.target.select()}
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
                      color: isCurrent ? 'var(--color-lyric-active)' : recorded ? 'var(--color-lyric-past)' : 'var(--color-lyric-inactive)',
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
                    <div className={`flex items-center gap-0.5 transition-opacity ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <button onClick={(e) => { e.stopPropagation(); startEdit(i); }}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                        title={t('sync.edit')}><IconPencil size={13} /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteLine(i); }}
                        className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-[rgba(244,63,94,0.18)] transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                        title={t('sync.delete')}><IconTrash size={13} /></button>
                    </div>
                  )}

                  {/* Status */}
                  {recorded && !isCurrent && editingIdx !== i && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.35, duration: 0.4 }}
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(255, 255, 255, 0.12)', color: 'var(--color-text-primary)' }}><IconCheck size={12} /></motion.div>
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
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex gap-3 mt-4 shrink-0">
        <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={toggle}
          className="flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-primary)' }}>
          {isPlaying ? <><IconPause size={16} /> {t('sync.pause')}</> : <><IconPlay size={16} /> {t('sync.play')}</>}
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={openAllEdit}
          className="py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center gap-1.5"
          style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>
          <IconPencil size={15} /> {t('sync.editAll')}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }} transition={springSoft}
          onClick={skipToPreview}
          className="py-3.5 px-4 rounded-xl font-semibold text-sm"
          style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>
          {t('sync.skip')}
        </motion.button>
        <motion.button
          whileHover={synced ? { scale: 1.01, y: -1 } : {}}
          whileTap={synced ? { scale: 0.98 } : {}}
          transition={springSoft}
          onClick={saveAndProceed} disabled={!synced}
          className="flex-1 py-3.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          style={{
            fontFamily: 'var(--font-display)',
            background: synced ? '#ffffff' : 'rgba(255,255,255,0.05)',
            color: synced ? '#000' : 'var(--color-text-muted)',
            boxShadow: synced ? '0 8px 30px rgba(255,255,255,0.12)' : 'none',
          }}>
          {t('sync.complete')}
        </motion.button>
      </motion.div>

      {/* Full-lyrics editor — add/remove/reorder lines mid-sync; unchanged lines keep their sync */}
      <AnimatePresence>
        {editingAll && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={cancelAllEdit}>
            <motion.div
              initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0 }}
              transition={springSoft}
              className="glass-strong rounded-2xl p-5 w-full max-w-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('sync.editAll')}</h3>
                <button onClick={cancelAllEdit}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}><IconX size={16} /></button>
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                {t('sync.editDesc')} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>[Name]</span> {t('sync.editDesc2')}
              </p>
              <textarea
                value={allText}
                onChange={e => setAllText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { e.preventDefault(); cancelAllEdit(); }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); confirmAllEdit(); }
                }}
                autoFocus
                spellCheck={false}
                className="w-full h-[46vh] rounded-xl p-3 text-sm resize-none focus:outline-none"
                style={{ fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--color-text-primary)', lineHeight: 1.7 }}
              />
              <div className="flex items-center justify-between mt-4">
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {t('sync.editCount', { n: allText.split('\n').map(s => s.trim()).filter(Boolean).length })}
                </span>
                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={cancelAllEdit}
                    className="px-4 py-2.5 rounded-xl font-semibold text-sm"
                    style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>{t('sync.cancel')}</motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={confirmAllEdit}
                    className="px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1.5"
                    style={{ fontFamily: 'var(--font-display)', background: '#fff', color: '#000' }}><IconCheck size={15} /> {t('sync.save')}</motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
