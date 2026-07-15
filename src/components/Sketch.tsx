import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import { springSoft, springPop } from '../lib/motion';
import { useI18n } from '../lib/i18n';
import { SketchEngine, type ChainSettings, type TonePreset, type EngineTake } from '../lib/sketchEngine';
import { encodeWavMono } from '../lib/wav';
import {
  listSessions, createSession, updateSession, deleteSession,
  readBeatBytes, readTakeBytes, saveTakeWav, deleteTakeFile,
  listLibraryBeats, type SketchSession, type LibraryBeat,
} from '../lib/sketchStore';
import { IconMic, IconRecord, IconStop, IconPlay, IconPause, IconTrash, IconMusic, IconFolder, IconArrowLeft, IconCheck } from './icons';

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/* ── Gamified vertical fader ──────────────────────────────────────────────── */
function Fader({ label, value, max, def, onChange, accent = '#ffffff' }: {
  label: string; value: number; max: number; def: number;
  onChange: (v: number) => void; accent?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = Math.max(0, Math.min(1, value / max));

  const fromPointer = useCallback((clientY: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    onChange(Math.round(ratio * max * 100) / 100);
  }, [max, onChange]);

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <span className="text-[10px] font-bold tracking-[0.14em] tabular-nums"
        style={{ fontFamily: 'var(--font-mono)', color: dragging ? accent : 'var(--color-text-muted)' }}>
        {Math.round(pct * 100)}
      </span>
      <div ref={trackRef}
        className="relative w-9 h-36 rounded-full cursor-pointer touch-none"
        style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.4)' }}
        onPointerDown={e => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
          fromPointer(e.clientY);
        }}
        onPointerMove={e => { if (dragging) fromPointer(e.clientY); }}
        onPointerUp={() => setDragging(false)}
        onDoubleClick={() => onChange(def)}>
        {/* fill */}
        <motion.div className="absolute bottom-0 left-0 right-0 rounded-full"
          animate={{ height: `${pct * 100}%`, opacity: dragging ? 0.5 : 0.28 }}
          transition={dragging ? { duration: 0 } : springSoft}
          style={{ background: accent }} />
        {/* thumb */}
        <motion.div className="absolute left-1/2 w-11 h-6 rounded-xl"
          animate={{ top: `calc(${(1 - pct) * 100}% - 12px)`, scale: dragging ? 1.18 : 1 }}
          transition={dragging ? { duration: 0 } : springPop}
          style={{
            x: '-50%',
            background: '#ffffff',
            boxShadow: dragging ? `0 0 24px ${accent}66, 0 4px 12px rgba(0,0,0,0.5)` : '0 4px 10px rgba(0,0,0,0.45)',
          }}>
          <div className="absolute inset-x-2.5 top-1/2 -translate-y-1/2 h-[2px] rounded-full" style={{ background: 'rgba(0,0,0,0.25)' }} />
        </motion.div>
      </div>
      <span className="text-[10px] font-semibold tracking-[0.12em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
    </div>
  );
}

/* ── Main module ─────────────────────────────────────────────────────────── */
export default function Sketch() {
  const { t } = useI18n();
  const engineRef = useRef<SketchEngine | null>(null);
  const bufMapRef = useRef<Map<string, AudioBuffer>>(new Map());
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sessions, setSessions] = useState<SketchSession[]>([]);
  const [beats, setBeats] = useState<LibraryBeat[]>([]);
  const [session, setSession] = useState<SketchSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');

  const engine = () => {
    if (!engineRef.current) engineRef.current = new SketchEngine();
    return engineRef.current;
  };

  useEffect(() => {
    listSessions().then(setSessions);
    listLibraryBeats().then(setBeats);
    return () => { engineRef.current?.dispose(); engineRef.current = null; };
  }, []);

  // Transport clock
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const e = engineRef.current;
      if (e) { setPos(e.position); setPlaying(e.playing); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const engineTakes = useCallback((s: SketchSession): EngineTake[] =>
    s.takes.flatMap(tk => {
      const buffer = bufMapRef.current.get(tk.id);
      return buffer ? [{ id: tk.id, buffer, offsetSec: tk.offset_sec, enabled: tk.enabled }] : [];
    }), []);

  const openSession = useCallback(async (s: SketchSession) => {
    setLoading(true);
    setError('');
    try {
      const e = engine();
      e.pause();
      bufMapRef.current.clear();
      const dur = await e.loadBeat(await readBeatBytes(s));
      for (const tk of s.takes) {
        try { bufMapRef.current.set(tk.id, await e.decodeTake(await readTakeBytes(tk.file))); }
        catch { /* missing take file — row still shows, just silent */ }
      }
      e.setTakes(engineTakes(s));
      e.applyChain(s.chain);
      setDuration(dur);
      setSession(s);
      setPos(0);
      await e.seek(0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [engineTakes]);

  const startFromBeat = useCallback(async (b: LibraryBeat) => {
    setLoading(true);
    try {
      const s = await createSession({ beatTitle: b.title, beatAbsPath: b.file_path, key: b.key, bpm: b.bpm });
      setSessions(prev => [s, ...prev]);
      await openSession(s);
    } catch (err) { setError(String(err)); setLoading(false); }
  }, [openSession]);

  const startFromFile = useCallback(async () => {
    const picked = await open({ multiple: false, filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg'] }] });
    if (typeof picked !== 'string') return;
    setLoading(true);
    try {
      const name = picked.split(/[/\\]/).pop() || 'beat';
      const s = await createSession({ beatTitle: name.replace(/\.[^.]+$/, ''), beatAbsPath: picked, key: null, bpm: null });
      setSessions(prev => [s, ...prev]);
      await openSession(s);
    } catch (err) { setError(String(err)); setLoading(false); }
  }, [openSession]);

  const removeSession = useCallback(async (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    await deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  /* ── recording ── */
  const startRec = useCallback(async () => {
    if (!session || recording) return;
    setError('');
    try {
      await engine().startRecording();
      setRecording(true);
    } catch {
      setError(t('sk.micDenied'));
    }
  }, [session, recording, t]);

  const stopRec = useCallback(async () => {
    if (!session) return;
    const e = engine();
    const rec = e.stopRecording();
    setRecording(false);
    if (!rec || rec.samples.length < rec.sampleRate * 0.3) return; // <0.3s = accidental tap
    e.pause();
    const takeId = `take-${Date.now()}`;
    const rel = await saveTakeWav(session.id, takeId, encodeWavMono(rec.samples, rec.sampleRate));
    bufMapRef.current.set(takeId, e.bufferFromSamples(rec.samples, rec.sampleRate));
    const next: SketchSession = {
      ...session,
      takes: [...session.takes, { id: takeId, file: rel, offset_sec: rec.offsetSec, enabled: true, created_at: new Date().toISOString() }],
    };
    setSession(next);
    setSessions(prev => prev.map(s => (s.id === next.id ? next : s)));
    await updateSession(next);
    e.setTakes(engineTakes(next));
    await e.seek(Math.max(0, rec.offsetSec - 0.5));
  }, [session, engineTakes]);

  const toggleTake = useCallback(async (takeId: string) => {
    if (!session) return;
    const next: SketchSession = {
      ...session,
      takes: session.takes.map(tk => (tk.id === takeId ? { ...tk, enabled: !tk.enabled } : tk)),
    };
    setSession(next);
    engine().setTakes(engineTakes(next));
    await updateSession(next);
  }, [session, engineTakes]);

  const removeTake = useCallback(async (takeId: string) => {
    if (!session) return;
    const tk = session.takes.find(x => x.id === takeId);
    const next: SketchSession = { ...session, takes: session.takes.filter(x => x.id !== takeId) };
    setSession(next);
    setSessions(prev => prev.map(s => (s.id === next.id ? next : s)));
    bufMapRef.current.delete(takeId);
    engine().setTakes(engineTakes(next));
    await updateSession(next);
    if (tk) await deleteTakeFile(tk.file);
  }, [session, engineTakes]);

  /* ── chain ── */
  const setChain = useCallback((patch: Partial<ChainSettings>) => {
    if (!session) return;
    const next: SketchSession = { ...session, chain: { ...session.chain, ...patch } };
    setSession(next);
    engine().applyChain(next.chain);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => { updateSession(next).catch(() => {}); }, 500);
  }, [session]);

  /* ── keyboard ── */
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (!session) return;
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        const e = engine();
        if (e.playing) e.pause(); else e.play();
      } else if (ev.code === 'KeyR' && !ev.metaKey && !ev.ctrlKey) {
        ev.preventDefault();
        if (recording) stopRec(); else startRec();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session, recording, startRec, stopRec]);

  const seekFromPointer = useCallback((clientX: number, el: HTMLDivElement) => {
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    engine().seek(ratio * duration);
    setPos(ratio * duration);
  }, [duration]);

  /* ═══════════ session list view ═══════════ */
  if (!session) {
    return (
      <div className="h-full min-h-0 flex flex-col px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="mb-5 shrink-0">
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('sk.title')}</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{t('sk.sub')}</p>
        </div>

        {error && (
          <div className="mb-3 rounded-xl px-4 py-2.5 text-xs shrink-0" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--color-danger)' }}>{error}</div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-[1fr_320px] gap-5">
          {/* New sketch: pick a beat */}
          <div className="min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2.5 shrink-0">
              <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>{t('sk.new')}</h3>
              <motion.button whileTap={{ scale: 0.96 }} transition={springSoft} onClick={startFromFile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-primary)' }}>
                <IconFolder size={13} /> {t('sk.pickFile')}
              </motion.button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {beats.map(b => (
                <motion.button key={b.id} whileHover={{ scale: 1.005, y: -1 }} whileTap={{ scale: 0.99 }} transition={springSoft}
                  onClick={() => startFromBeat(b)} disabled={loading}
                  className="w-full glass glass-hover rounded-xl p-3.5 text-left flex items-center gap-3 disabled:opacity-50">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)' }}>
                    <IconMusic size={16} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold tracking-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>{b.title}</span>
                    <span className="block text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{b.uploader}</span>
                  </span>
                  {b.bpm && <span className="text-[10px] px-1.5 py-0.5 rounded tabular-nums shrink-0" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{b.bpm}bpm</span>}
                  {b.key && <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{b.key}</span>}
                </motion.button>
              ))}
              {beats.length === 0 && (
                <p className="text-[11px] text-center pt-10 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{t('sk.noBeats')}</p>
              )}
            </div>
          </div>

          {/* Existing sessions */}
          <div className="min-h-0 flex flex-col">
            <div className="flex items-center gap-2 mb-2.5 shrink-0">
              <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>{t('sk.sessions')}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>{sessions.length}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {sessions.map(s => (
                <div key={s.id} onClick={() => openSession(s)}
                  className="glass glass-hover rounded-xl p-3 group cursor-pointer">
                  <p className="text-xs font-semibold tracking-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>{s.beat_title}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded tabular-nums" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {s.takes.length} {t('sk.takes')}
                    </span>
                    {s.bpm && <span className="text-[10px] px-1.5 py-0.5 rounded tabular-nums" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{s.bpm}bpm</span>}
                    {s.key && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{s.key}</span>}
                    <span className="flex-1" />
                    <button onClick={e => removeSession(s.id, e)} title={t('sk.delete')}
                      className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[rgba(244,63,94,0.18)] transition-all"
                      style={{ color: 'var(--color-text-muted)' }}><IconTrash size={13} /></button>
                  </div>
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="text-[11px] text-center pt-10 whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{t('sk.emptySessions')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════ session (booth) view ═══════════ */
  const pct = duration > 0 ? (pos / duration) * 100 : 0;
  return (
    <div className="h-full min-h-0 flex flex-col px-8 py-5 max-w-6xl mx-auto w-full">
      {/* header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <motion.button whileTap={{ scale: 0.94 }} transition={springSoft}
          onClick={() => { engine().pause(); if (recording) { engine().stopRecording(); setRecording(false); } setSession(null); }}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }} title={t('sk.back')}>
          <IconArrowLeft size={17} />
        </motion.button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm tracking-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>{session.beat_title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {session.bpm && <span className="text-[10px] px-1.5 py-0.5 rounded tabular-nums" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{session.bpm}bpm</span>}
            {session.key && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{session.key}</span>}
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>· {t('sk.kbd')}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl px-4 py-2.5 text-xs shrink-0" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--color-danger)' }}>{error}</div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_300px] gap-6">
        {/* left: transport + takes */}
        <div className="min-h-0 flex flex-col">
          {/* transport card */}
          <div className="glass-strong rounded-2xl p-6 shrink-0">
            <div className="flex items-center justify-center gap-5 mb-5">
              <motion.button whileTap={{ scale: 0.94 }} transition={springSoft}
                onClick={() => { const e = engine(); if (e.playing) e.pause(); else e.play(); }}
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
              </motion.button>

              {/* REC — the hero button */}
              <motion.button
                whileTap={{ scale: 0.92 }} transition={springPop}
                onClick={() => (recording ? stopRec() : startRec())}
                disabled={loading}
                className="relative w-20 h-20 rounded-full flex items-center justify-center disabled:opacity-40"
                style={{
                  background: recording ? '#ef4444' : '#ffffff',
                  color: recording ? '#fff' : '#d92d20',
                  boxShadow: recording ? '0 0 44px rgba(239,68,68,0.5)' : '0 10px 36px rgba(255,255,255,0.16)',
                }}>
                {recording && (
                  <motion.span className="absolute inset-0 rounded-full"
                    animate={{ scale: [1, 1.28], opacity: [0.5, 0] }}
                    transition={{ repeat: Infinity, duration: 1.1, ease: 'easeOut' }}
                    style={{ border: '2px solid rgba(239,68,68,0.8)' }} />
                )}
                {recording ? <IconStop size={30} /> : <IconRecord size={34} />}
              </motion.button>

              <div className="w-12 text-center">
                <span className="text-xs tabular-nums font-bold" style={{ fontFamily: 'var(--font-mono)', color: recording ? '#ef4444' : 'var(--color-text-secondary)' }}>
                  {fmt(pos)}
                </span>
              </div>
            </div>

            {/* timeline */}
            <div className="h-4 flex items-center cursor-pointer group"
              onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); seekFromPointer(e.clientX, e.currentTarget); }}
              onPointerMove={e => { if (e.buttons === 1) seekFromPointer(e.clientX, e.currentTarget); }}>
              <div className="relative w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.09)' }}>
                {/* take regions */}
                {duration > 0 && session.takes.map(tk => {
                  const b = bufMapRef.current.get(tk.id);
                  const w = b ? (b.duration / duration) * 100 : 0;
                  return (
                    <div key={tk.id} className="absolute top-0 bottom-0 rounded-full"
                      style={{ left: `${(tk.offset_sec / duration) * 100}%`, width: `${w}%`, background: tk.enabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)' }} />
                  );
                })}
                <div className="absolute top-0 bottom-0 left-0 rounded-full" style={{ width: `${pct}%`, background: recording ? 'rgba(239,68,68,0.85)' : '#ffffff' }} />
                <div className="absolute top-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${pct}%`, transform: 'translate(-50%,-50%)', background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,0.6)' }} />
              </div>
            </div>
            <div className="flex justify-between text-[10px] mt-1.5 tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
              <span>{fmt(pos)}</span>
              <span>{recording ? t('sk.recording') : t('sk.recHint')}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* takes */}
          <div className="flex items-center gap-2 mt-4 mb-2 shrink-0">
            <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>{t('sk.takes')}</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>{session.takes.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
            <AnimatePresence initial={false}>
              {session.takes.map((tk, i) => (
                <motion.div key={tk.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={springSoft}
                  onClick={() => toggleTake(tk.id)}
                  className="glass rounded-xl px-3.5 py-2.5 flex items-center gap-3 cursor-pointer group"
                  style={{ opacity: tk.enabled ? 1 : 0.45 }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: tk.enabled ? '#fff' : 'rgba(255,255,255,0.1)', color: tk.enabled ? '#000' : 'var(--color-text-muted)' }}>
                    {tk.enabled ? <IconCheck size={11} /> : <IconMic size={11} />}
                  </span>
                  <span className="flex-1 text-xs font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                    {t('sk.take')} {i + 1}
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                    @{fmt(tk.offset_sec)} · {fmt(bufMapRef.current.get(tk.id)?.duration ?? 0)}
                  </span>
                  <button onClick={e => { e.stopPropagation(); removeTake(tk.id); }} title={t('sk.delete')}
                    className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[rgba(244,63,94,0.18)] transition-all"
                    style={{ color: 'var(--color-text-muted)' }}><IconTrash size={13} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
            {session.takes.length === 0 && (
              <p className="text-[11px] text-center pt-8" style={{ color: 'var(--color-text-muted)' }}>{t('sk.emptyTakes')}</p>
            )}
          </div>
        </div>

        {/* right: tone + faders */}
        <div className="min-h-0 flex flex-col">
          <div className="glass-strong rounded-2xl p-5 flex-1 min-h-0 flex flex-col">
            <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase mb-3 shrink-0" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>{t('sk.tone')}</h3>
            <div className="flex gap-1.5 mb-6 shrink-0">
              {(['bright', 'balanced', 'dark'] as TonePreset[]).map(p => (
                <motion.button key={p} whileTap={{ scale: 0.95 }} transition={springSoft}
                  onClick={() => setChain({ preset: p })}
                  className="flex-1 py-2 rounded-full text-[11px] font-semibold capitalize"
                  style={{
                    fontFamily: 'var(--font-display)',
                    background: session.chain.preset === p ? '#fff' : 'rgba(255,255,255,0.06)',
                    color: session.chain.preset === p ? '#000' : 'var(--color-text-muted)',
                  }}>{p}</motion.button>
              ))}
            </div>
            <div className="flex-1 flex items-center justify-center gap-7">
              <Fader label="VOX" value={session.chain.vox} max={1.5} def={1.0} onChange={v => setChain({ vox: v })} accent="#ffd166" />
              <Fader label="BEAT" value={session.chain.beat} max={1.5} def={0.9} onChange={v => setChain({ beat: v })} accent="#7dd3fc" />
              <Fader label="SPACE" value={session.chain.space} max={1} def={0.25} onChange={v => setChain({ space: v })} accent="#c4b5fd" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
