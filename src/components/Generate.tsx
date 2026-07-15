import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { save } from '@tauri-apps/plugin-dialog';
import { revealItemInDir, openPath } from '@tauri-apps/plugin-opener';
import { loadProject, saveProject } from '../lib/storage';
import { renderProject, type RenderStage } from '../lib/render';
import { springSoft } from '../lib/motion';
import { useI18n } from '../lib/i18n';
import { IconFilm, IconCheck, IconAlert, IconFolder, IconExternal, IconRefresh, IconArrowLeft, IconCopy } from './icons';
import { DEFAULT_RENDER_OPTIONS, type ProjectData, type AspectRatio } from '../types';

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

const STAGE_KEY = {
  preparing: 'rd.stage.preparing',
  encoding: 'rd.stage.encoding',
  finalizing: 'rd.stage.finalizing',
} as const satisfies Record<RenderStage, string>;

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

export default function Generate({ projectId, onBack, onBackToSync }: Props) {
  const { t } = useI18n();
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<RenderStage>('preparing');
  const [errorMsg, setErrorMsg] = useState('');
  const [project, setProject] = useState<ProjectData | null>(null);
  const [credits, setCredits] = useState<Record<string, string[]>>({});
  const [copied, setCopied] = useState(false);
  const [suggestedName, setSuggestedName] = useState('');
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectRatio>(DEFAULT_RENDER_OPTIONS.aspect);
  const cancelRef = useRef(false);

  useEffect(() => {
    loadProject(projectId).then((p) => {
      setProject(p);
      setAspect(p.render_options?.aspect ?? DEFAULT_RENDER_OPTIONS.aspect);
      const artist = p.artist?.trim() || '';
      const title = p.title?.trim() || '';
      const base = artist && title
        ? `${artist} - ${title} (Lyric Video)`
        : title || artist || 'Lyric Video';
      setSuggestedName(base.replace(/[/\\:*?"<>|]/g, '').trim());
    });
  }, [projectId]);

  const chooseAspect = useCallback(async (a: AspectRatio) => {
    setAspect(a);
    try {
      const full = await loadProject(projectId);
      await saveProject({ ...full, render_options: { ...(full.render_options ?? DEFAULT_RENDER_OPTIONS), aspect: a } });
    } catch { /* best-effort */ }
  }, [projectId]);

  const startRender = useCallback(async () => {
    if (!project) return;

    // Ask where to save the finished MP4 before rendering into it.
    let target: string | null = null;
    try {
      target = await save({
        title: t('rd.saveTitle'),
        defaultPath: `${(suggestedName || 'lyric_video').trim()}.mp4`,
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
      });
    } catch {
      target = null;
    }
    if (!target) return; // cancelled

    cancelRef.current = false;
    setRenderStatus('rendering');
    setProgress(0);
    setStage('preparing');
    try {
      await renderProject({
        projectId,
        outputPath: target,
        onProgress: setProgress,
        onStage: setStage,
        isCancelled: () => cancelRef.current,
      });
      if (cancelRef.current) {
        setRenderStatus('idle');
        return;
      }
      setOutputPath(target);
      setProgress(1);
      setRenderStatus('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Render failed');
      setRenderStatus('error');
    }
  }, [project, projectId, suggestedName]);

  const cancelRender = useCallback(() => { cancelRef.current = true; }, []);

  const revealOutput = useCallback(() => {
    if (outputPath) revealItemInDir(outputPath).catch(() => {});
  }, [outputPath]);
  const openOutput = useCallback(() => {
    if (outputPath) openPath(outputPath).catch(() => {});
  }, [outputPath]);

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
    lines.push('Made with the rest — by insidewill');
    return lines.join('\n');
  }, [project, credits]);

  const desc = buildDescription();
  const copyDesc = () => { navigator.clipboard.writeText(desc); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const progressPct = Math.round(progress * 100);

  return (
    <div className="h-full min-h-0 w-full max-w-5xl mx-auto px-6 py-5 flex flex-col">
      <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}
        className="text-xl font-bold tracking-tight mb-5 text-center shrink-0"
        style={{ fontFamily: 'var(--font-display)' }}>{t('rd.title')}</motion.h2>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
        <div className="min-h-0 overflow-y-auto pr-1">
          <AnimatePresence mode="wait">
            {renderStatus === 'idle' && (
              <motion.div key="ready" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
                <div className="rounded-2xl p-10 relative overflow-hidden glass-strong"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="absolute inset-0 opacity-10"
                    style={{ background: 'radial-gradient(circle at 30% 40%, var(--color-accent), transparent 60%)' }} />
                  <div className="relative z-10 text-center">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-primary)' }}>
                      <IconFilm size={26} />
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-4">
                      {t('rd.local')}
                    </p>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      {(['16:9', '9:16'] as const).map((a) => (
                        <motion.button key={a} whileTap={{ scale: 0.96 }} onClick={() => chooseAspect(a)}
                          className="px-4 py-1.5 rounded-full text-xs font-bold transition-colors"
                          style={{
                            fontFamily: 'var(--font-display)',
                            background: aspect === a ? '#ffffff' : 'rgba(255,255,255,0.08)',
                            color: aspect === a ? '#000000' : 'var(--color-text-secondary)',
                            border: '1px solid rgba(255,255,255,0.1)',
                          }}>
                          {a === '9:16' ? t('rd.aspect.v') : t('rd.aspect.h')}
                        </motion.button>
                      ))}
                    </div>
                    <div className="flex justify-center gap-4 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                      <span className="px-2 py-1 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>{aspect === '9:16' ? '1080×1920' : '1920×1080'}</span>
                      <span className="px-2 py-1 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>60fps H.264</span>
                      <span className="px-2 py-1 rounded-full" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>{t('rd.audio.lossless')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  {onBackToSync && (
                    <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={onBackToSync} title={t('rd.sync')}
                      className="py-3.5 px-4 rounded-xl flex items-center justify-center"
                      style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}><IconArrowLeft size={18} /></motion.button>
                  )}
                  <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={onBack}
                    className="py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center gap-1.5"
                    style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}><IconArrowLeft size={16} /> {t('rd.preview')}</motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.98 }} transition={springSoft} onClick={startRender}
                    className="flex-1 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                    style={{ fontFamily: 'var(--font-display)', background: '#ffffff', color: '#000000', boxShadow: '0 8px 30px rgba(255,255,255,0.12)' }}><IconFilm size={17} /> {t('rd.start')}</motion.button>
                </div>
              </motion.div>
            )}

            {renderStatus === 'rendering' && (
              <motion.div key="processing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-6">
                <div className="rounded-2xl p-10 relative overflow-hidden glass-strong"
                  style={{ border: '1px solid rgba(255, 255, 255, 0.12)' }}>
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
                      {t(STAGE_KEY[stage])} · {t('rd.wait')}
                    </p>
                  </div>
                </div>
                <button onClick={cancelRender}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold tracking-wide opacity-60 hover:opacity-100 transition-opacity"
                  style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>
                  {t('rd.cancel')}
                </button>
              </motion.div>
            )}

            {renderStatus === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }} className="space-y-6">
                <div className="rounded-2xl p-10 relative overflow-hidden glass-strong"
                  style={{ border: '1px solid rgba(255, 255, 255, 0.22)' }}>
                  <div className="absolute inset-0 opacity-10"
                    style={{ background: 'radial-gradient(circle at center, #ffffff, transparent 60%)' }} />
                  <div className="relative z-10 text-center">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.4, duration: 0.5, delay: 0.1 }}
                      className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: '#ffffff', color: '#000' }}><IconCheck size={28} /></motion.div>
                    <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                      className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>{t('rd.doneTitle')}</motion.p>
                    {outputPath && (
                      <p className="text-[11px] mt-3 break-all leading-snug px-2"
                        style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}
                        title={outputPath}>
                        {outputPath}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <motion.button
                    onClick={revealOutput}
                    whileTap={{ scale: 0.97 }} transition={springSoft}
                    className="flex-1 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
                    style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-primary)' }}>
                    <IconFolder size={17} /> {t('rd.reveal')}
                  </motion.button>
                  <motion.button
                    onClick={openOutput}
                    whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.98 }} transition={springSoft}
                    className="flex-1 py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2"
                    style={{ fontFamily: 'var(--font-display)', background: '#ffffff', color: '#000000', boxShadow: '0 8px 30px rgba(255,255,255,0.14)' }}>
                    <IconExternal size={17} /> {t('rd.open')}
                  </motion.button>
                </div>
                <div className="flex gap-3">
                  {onBackToSync && (
                    <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={onBackToSync}
                      className="flex-1 py-3 rounded-xl font-semibold text-sm"
                      style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)' }}>{t('rd.sync')}</motion.button>
                  )}
                  <motion.button whileTap={{ scale: 0.97 }} transition={springSoft} onClick={onBack}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm"
                    style={{ fontFamily: 'var(--font-display)', background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)' }}>{t('rd.preview')}</motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} transition={springSoft}
                    onClick={() => { setRenderStatus('idle'); setProgress(0); setOutputPath(null); }}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5"
                    style={{ fontFamily: 'var(--font-display)', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--color-text-secondary)' }}><IconRefresh size={15} /> {t('rd.again')}</motion.button>
                </div>
              </motion.div>
            )}

            {renderStatus === 'error' && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="rounded-2xl p-10 glass-strong" style={{ border: '1px solid rgba(244, 63, 94, 0.3)' }}>
                  <div className="flex justify-center mb-3" style={{ color: 'var(--color-danger)' }}><IconAlert size={34} /></div>
                  <p className="font-bold text-center tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-danger)' }}>{t('rd.failed')}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center break-all max-h-32 overflow-y-auto" style={{ fontFamily: 'var(--font-mono)' }}>{errorMsg}</p>
                </div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => { setRenderStatus('idle'); setProgress(0); setErrorMsg(''); }}
                  className="w-full py-3 rounded-xl font-semibold text-sm"
                  style={{ fontFamily: 'var(--font-display)', background: 'var(--color-bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>{t('rd.retry')}</motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-2 shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
            <IconCopy size={15} />
            <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ fontFamily: 'var(--font-display)' }}>{t('rd.ytdesc')}</h3>
          </div>
          <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1 mb-3">
            {CREDIT_FIELDS.map(f => (
              <TagInput key={f.key} label={f.label} placeholder={f.placeholder}
                tags={credits[f.key] || []} onTagsChange={t => setCredits(prev => ({ ...prev, [f.key]: t }))} />
            ))}
          </div>
          <div className="relative shrink-0">
            <label className="text-[10px] uppercase tracking-widest mb-1 block"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-muted)' }}>{t('rd.gen')}</label>
            <textarea readOnly value={desc} rows={7}
              className="w-full glass rounded-xl px-4 py-3 text-xs leading-relaxed resize-none focus:outline-none"
              style={{ fontFamily: 'var(--font-mono)' }} />
            <motion.button whileTap={{ scale: 0.95 }} transition={springSoft} onClick={copyDesc}
              className="absolute top-7 right-2 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1"
              style={{
                fontFamily: 'var(--font-display)',
                background: copied ? '#ffffff' : 'rgba(255, 255, 255, 0.1)',
                color: copied ? '#000' : 'var(--color-text-secondary)',
              }}>{copied ? <><IconCheck size={12} /> {t('rd.copied')}</> : <><IconCopy size={12} /> {t('rd.copy')}</>}</motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
