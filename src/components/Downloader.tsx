import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { mkdir, readTextFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { springSoft } from '../lib/motion';
import { useI18n } from '../lib/i18n';
import { parseBeatMeta, beatFilename, normalizeKey } from '../lib/beatMeta';
import { IconLink, IconDownload, IconMusic, IconCheck, IconFolder, IconAlert, IconTrash, IconArrowRight } from './icons';

type Format = 'wav' | 'mp3' | 'flac';

interface FetchedMeta {
  title: string;
  uploader: string;
  duration: number | null;
  thumbnail: string | null;
  description: string;
  chapters: { title: string; start_time: number }[] | null;
  url: string;
}

interface BeatRecord {
  id: string;
  title: string;
  uploader: string;
  url: string;
  key: string | null;
  bpm: number | null;
  format: Format;
  file_path: string;
  chapters?: { title: string; start_time: number }[] | null;
  downloaded_at: string;
}

const BEATS_FILE = 'beats/beats.json';
const DIR_KEY = 'therest.dl.dir';
const FMT_KEY = 'therest.dl.fmt';

async function loadBeats(): Promise<BeatRecord[]> {
  try {
    const txt = await readTextFile(BEATS_FILE, { baseDir: BaseDirectory.AppLocalData });
    return JSON.parse(txt) as BeatRecord[];
  } catch { return []; }
}
async function saveBeats(beats: BeatRecord[]): Promise<void> {
  await mkdir('beats', { baseDir: BaseDirectory.AppLocalData, recursive: true }).catch(() => {});
  await writeTextFile(BEATS_FILE, JSON.stringify(beats, null, 2), { baseDir: BaseDirectory.AppLocalData });
}

function fmtDuration(s: number | null): string {
  if (!s || !isFinite(s)) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Re-normalize whatever the user typed into the key chip ("f# min" → "F#m"). */
function normalizeKeyInput(raw: string): string | null {
  const m = raw.trim().match(/^([A-Ga-g](?:#|♯|b|♭)?)\s*(major|minor|maj|min|m)?$/i);
  if (!m) return raw.trim() || null;
  return normalizeKey(m[1], m[2]);
}

export default function Downloader() {
  const { t } = useI18n();
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [meta, setMeta] = useState<FetchedMeta | null>(null);
  const [keyVal, setKeyVal] = useState('');
  const [bpmVal, setBpmVal] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [format, setFormat] = useState<Format>(() => (localStorage.getItem(FMT_KEY) as Format) || 'wav');
  const [outDir, setOutDir] = useState<string | null>(() => localStorage.getItem(DIR_KEY));
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'converting' | 'done' | 'error'>('idle');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [beats, setBeats] = useState<BeatRecord[]>([]);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    invoke<boolean>('ytdlp_status').then(setEngineReady).catch(() => setEngineReady(false));
    loadBeats().then(setBeats);
    return () => { unlistenRef.current?.(); };
  }, []);

  const installEngine = useCallback(async () => {
    setInstalling(true);
    setError('');
    try {
      await invoke('ytdlp_install');
      setEngineReady(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  }, []);

  const fetchMeta = useCallback(async () => {
    const u = url.trim();
    if (!u || fetching) return;
    setFetching(true);
    setError('');
    setMeta(null);
    setPhase('idle');
    try {
      const m = await invoke<FetchedMeta>('ytdlp_meta', { url: u });
      const parsed = parseBeatMeta(m.title ?? '', m.description ?? '');
      setMeta({ ...m, title: m.title ?? '', uploader: m.uploader ?? '', description: m.description ?? '' });
      setKeyVal(parsed.key ?? '');
      setBpmVal(parsed.bpm ? String(parsed.bpm) : '');
      setAutoDetected(parsed.key !== null || parsed.bpm !== null);
    } catch (e) {
      setError(String(e));
    } finally {
      setFetching(false);
    }
  }, [url, fetching]);

  const chooseDir = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false, title: t('dl.choose') });
    if (typeof dir === 'string') { setOutDir(dir); localStorage.setItem(DIR_KEY, dir); }
  }, [t]);

  const chooseFormat = (f: Format) => { setFormat(f); localStorage.setItem(FMT_KEY, f); };

  const startDownload = useCallback(async () => {
    if (!meta || phase === 'downloading' || phase === 'converting') return;
    let dir = outDir;
    if (!dir) {
      const picked = await open({ directory: true, multiple: false, title: t('dl.choose') });
      if (typeof picked !== 'string') return;
      dir = picked; setOutDir(picked); localStorage.setItem(DIR_KEY, picked);
    }
    const bpm = bpmVal ? Math.max(30, Math.min(200, parseInt(bpmVal, 10) || 0)) || null : null;
    const key = keyVal ? normalizeKeyInput(keyVal) : null;
    const filename = beatFilename(meta.title, meta.uploader, bpm, key);

    setPhase('downloading');
    setPct(0);
    setError('');
    unlistenRef.current?.();
    unlistenRef.current = await listen<{ pct: number | null; stage: string }>('beat-progress', (e) => {
      if (e.payload.stage === 'converting') setPhase('converting');
      else if (typeof e.payload.pct === 'number') setPct(e.payload.pct);
    });
    try {
      const filePath = await invoke<string>('ytdlp_download', { url: meta.url, format, outDir: dir, filename });
      const rec: BeatRecord = {
        id: `${Date.now()}`,
        title: meta.title,
        uploader: meta.uploader,
        url: meta.url,
        key, bpm, format,
        file_path: filePath,
        chapters: meta.chapters ?? null,
        downloaded_at: new Date().toISOString(),
      };
      const next = [rec, ...beats];
      setBeats(next);
      await saveBeats(next);
      setPhase('done');
    } catch (e) {
      setError(String(e));
      setPhase('error');
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }, [meta, phase, outDir, bpmVal, keyVal, format, beats, t]);

  const removeBeat = useCallback(async (id: string) => {
    const next = beats.filter(b => b.id !== id);
    setBeats(next);
    await saveBeats(next);
  }, [beats]);

  const busy = phase === 'downloading' || phase === 'converting';
  const filenamePreview = meta
    ? beatFilename(meta.title, meta.uploader,
        bpmVal ? parseInt(bpmVal, 10) || null : null,
        keyVal ? normalizeKeyInput(keyVal) : null) + '.' + format
    : '';

  return (
    <div className="h-full min-h-0 flex flex-col px-8 py-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="mb-5 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('dl.title')}</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{t('dl.sub')}</p>
      </div>

      {/* URL row */}
      <div className="flex gap-2.5 shrink-0">
        <div className="flex-1 flex items-center gap-2.5 glass rounded-xl px-4">
          <span style={{ color: 'var(--color-text-muted)' }}><IconLink size={16} /></span>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') fetchMeta(); }}
            placeholder="https://www.youtube.com/watch?v=…"
            spellCheck={false}
            className="flex-1 bg-transparent py-3 text-sm focus:outline-none placeholder:text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }} />
        </div>
        <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={fetchMeta} disabled={!url.trim() || fetching || engineReady === false}
          className="px-5 rounded-xl font-semibold text-sm flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--font-display)', background: '#fff', color: '#000' }}>
          {fetching ? (
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              className="w-3.5 h-3.5 rounded-full border-2 border-black/25 border-t-black" />
          ) : <IconArrowRight size={16} />}
          {fetching ? t('dl.fetching') : t('dl.fetch')}
        </motion.button>
      </div>

      {/* Engine banner */}
      {engineReady === false && (
        <div className="mt-3 glass rounded-xl px-4 py-3 flex items-center gap-3 shrink-0">
          <span style={{ color: 'var(--color-text-secondary)' }}><IconDownload size={18} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('dl.engine.title')}</p>
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{t('dl.engine.desc')}</p>
          </div>
          <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={installEngine} disabled={installing}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ fontFamily: 'var(--font-display)', background: '#fff', color: '#000' }}>
            {installing ? t('dl.engine.installing') : t('dl.engine.install')}
          </motion.button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl px-4 py-2.5 flex items-start gap-2 text-xs shrink-0"
          style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--color-danger)' }}>
          <IconAlert size={14} /> <span className="break-all" style={{ fontFamily: 'var(--font-mono)' }}>{error}</span>
        </div>
      )}

      {/* Body: current fetch + library */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_320px] gap-5 mt-5">
        {/* Current */}
        <div className="min-h-0 overflow-y-auto pr-1">
          <AnimatePresence mode="wait">
            {meta ? (
              <motion.div key="meta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springSoft}
                className="glass-strong rounded-2xl p-5">
                <div className="flex gap-4">
                  {meta.thumbnail && (
                    <img src={meta.thumbnail} alt="" className="w-36 h-20 rounded-lg object-cover shrink-0"
                      style={{ boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-snug tracking-tight line-clamp-2" style={{ fontFamily: 'var(--font-display)' }}>{meta.title}</p>
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {meta.uploader}{meta.duration ? ` · ${fmtDuration(meta.duration)}` : ''}
                    </p>
                    <p className="text-[10px] mt-1.5" style={{ color: autoDetected ? 'var(--color-text-muted)' : 'rgba(244,63,94,0.75)' }}>
                      {autoDetected ? t('dl.detected') : t('dl.notfound')}
                    </p>
                  </div>
                </div>

                {/* Key / BPM / Format */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}>{t('dl.key')}</label>
                    <input value={keyVal} onChange={e => setKeyVal(e.target.value)} placeholder="Am · F#m · C"
                      className="w-full glass rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/25"
                      style={{ fontFamily: 'var(--font-mono)' }} spellCheck={false} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest mb-1 block" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}>{t('dl.bpm')}</label>
                    <input value={bpmVal} onChange={e => setBpmVal(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} placeholder="30–200"
                      className="w-full glass rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-white/25"
                      style={{ fontFamily: 'var(--font-mono)' }} inputMode="numeric" />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <span className="text-[10px] uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}>{t('dl.format')}</span>
                  {(['wav', 'mp3', 'flac'] as Format[]).map(f => (
                    <motion.button key={f} whileTap={{ scale: 0.95 }} transition={springSoft} onClick={() => chooseFormat(f)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold uppercase"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: format === f ? '#fff' : 'rgba(255,255,255,0.06)',
                        color: format === f ? '#000' : 'var(--color-text-muted)',
                      }}>{f}</motion.button>
                  ))}
                </div>

                {/* Folder + filename preview */}
                <div className="flex items-center gap-2 mt-4">
                  <button onClick={chooseDir}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs hover:bg-white/[0.08] transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)' }}>
                    <IconFolder size={14} /> {outDir ? outDir.split(/[/\\]/).pop() : t('dl.choose')}
                  </button>
                  <span className="flex-1 text-[10px] truncate text-right" title={filenamePreview}
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                    {filenamePreview}
                  </span>
                </div>

                {/* Download button / progress */}
                <div className="mt-4">
                  {busy ? (
                    <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="flex justify-between text-xs mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                        <span>{phase === 'converting' ? t('dl.converting') : t('dl.downloading')}</span>
                        {phase === 'downloading' && <span className="tabular-nums">{Math.round(pct)}%</span>}
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <motion.div className="h-full rounded-full" style={{ background: '#fff' }}
                          animate={{ width: phase === 'converting' ? '100%' : `${pct}%` }} transition={{ ease: 'easeOut', duration: 0.25 }} />
                      </div>
                    </div>
                  ) : (
                    <motion.button whileHover={{ scale: 1.005, y: -1 }} whileTap={{ scale: 0.985 }} transition={springSoft}
                      onClick={startDownload}
                      className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                      style={{ fontFamily: 'var(--font-display)', background: '#fff', color: '#000', boxShadow: '0 8px 30px rgba(255,255,255,0.1)' }}>
                      {phase === 'done' ? <><IconCheck size={16} /> {t('dl.saved')}</> : <><IconDownload size={16} /> {t('dl.download')}</>}
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-full min-h-[280px] rounded-2xl flex flex-col items-center justify-center gap-3"
                style={{ border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--color-text-muted)' }}>
                <IconMusic size={28} />
                <p className="text-xs whitespace-pre-line text-center leading-relaxed">{t('dl.empty')}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Library */}
        <div className="min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-2.5 shrink-0">
            <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-secondary)' }}>{t('dl.library')}</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>{beats.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {beats.map(b => (
              <div key={b.id} className="glass rounded-xl p-3 group">
                <p className="text-xs font-semibold leading-snug tracking-tight line-clamp-2" style={{ fontFamily: 'var(--font-display)' }}>{b.title}</p>
                <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>{b.uploader}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  {b.bpm && <span className="text-[10px] px-1.5 py-0.5 rounded tabular-nums" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{b.bpm}bpm</span>}
                  {b.key && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{b.key}</span>}
                  <span className="text-[10px] px-1.5 py-0.5 rounded uppercase" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{b.format}</span>
                  <span className="flex-1" />
                  <button onClick={() => revealItemInDir(b.file_path).catch(() => {})} title={t('dl.reveal')}
                    className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                    style={{ color: 'var(--color-text-muted)' }}><IconFolder size={13} /></button>
                  <button onClick={() => removeBeat(b.id)} title={t('up.recent.delete')}
                    className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[rgba(244,63,94,0.18)] transition-all"
                    style={{ color: 'var(--color-text-muted)' }}><IconTrash size={13} /></button>
                </div>
              </div>
            ))}
            {beats.length === 0 && (
              <p className="text-[11px] text-center pt-8 whitespace-pre-line leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{t('dl.empty')}</p>
            )}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-center mt-3 shrink-0" style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}>{t('dl.disclaimer')}</p>
    </div>
  );
}
