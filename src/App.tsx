import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import Home from './components/Home';
import Downloader from './components/Downloader';
import FileUpload from './components/FileUpload';
import LyricSync from './components/LyricSync';
import Preview from './components/Preview';
import Generate from './components/Generate';
import UpdateBanner from './components/UpdateBanner';
import { springSoft } from './lib/motion';
import { useI18n } from './lib/i18n';
import { IconHome, IconDownload, IconFilm, IconCheck, IconGlobe } from './components/icons';
import type { AppStep } from './types';

type Module = 'home' | 'downloader' | 'studio';

const STEPS: { key: AppStep; num: string }[] = [
  { key: 'upload', num: '01' },
  { key: 'sync', num: '02' },
  { key: 'preview', num: '03' },
  { key: 'generate', num: '04' },
];

const STEP_LABEL_KEY = {
  upload: 'step.upload', sync: 'step.sync', preview: 'step.preview', generate: 'step.render',
} as const;

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring' as const, bounce: 0, duration: 0.45 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
};

/** Desktop-app shell guards: no browser zoom, no pinch, no page scroll. */
function useAppShellGuards() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
    const onGesture = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('gesturestart', onGesture);
    window.addEventListener('gesturechange', onGesture);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('gesturestart', onGesture);
      window.removeEventListener('gesturechange', onGesture);
    };
  }, []);
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [module, setModule] = useState<Module>('home');
  const [step, setStep] = useState<AppStep>('upload');
  const [projectId, setProjectId] = useState('');
  useAppShellGuards();

  const currentIdx = STEPS.findIndex(s => s.key === step);

  const navigateTo = useCallback((target: AppStep) => {
    const targetIdx = STEPS.findIndex(s => s.key === target);
    if (target === 'upload') { setStep('upload'); return; }
    if (!projectId) return;
    if (targetIdx <= currentIdx || targetIdx === currentIdx + 1) setStep(target);
  }, [projectId, currentIdx]);

  const loadProject = useCallback((id: string, targetStep: AppStep) => {
    setProjectId(id);
    setStep(targetStep);
  }, []);

  const railItems: { key: Module; icon: React.ReactNode; label: string }[] = [
    { key: 'home', icon: <IconHome size={19} />, label: t('nav.home') },
    { key: 'downloader', icon: <IconDownload size={19} />, label: t('nav.downloader') },
    { key: 'studio', icon: <IconFilm size={19} />, label: t('nav.studio') },
  ];

  return (
    <div className="h-full flex overflow-hidden select-none">
      {/* ── Left rail ─────────────────────────────────────────────── */}
      <nav className="w-[58px] shrink-0 flex flex-col items-center py-3.5 gap-1.5 relative z-30"
        style={{
          background: 'rgba(10, 10, 16, 0.72)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          boxShadow: '1px 0 0 0 rgba(255,255,255,0.05)',
        }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2 cursor-pointer"
          style={{ background: '#ffffff' }} onClick={() => setModule('home')} title="the rest">
          <span className="text-black text-[13px] font-bold lowercase" style={{ fontFamily: 'var(--font-display)' }}>tr</span>
        </div>
        {railItems.map(item => {
          const active = module === item.key;
          return (
            <motion.button key={item.key} whileTap={{ scale: 0.92 }} transition={springSoft}
              onClick={() => setModule(item.key)} title={item.label}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              style={{
                background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-muted)',
              }}>
              {item.icon}
            </motion.button>
          );
        })}
        <div className="flex-1" />
        <motion.button whileTap={{ scale: 0.92 }} transition={springSoft}
          onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')} title={t('nav.lang')}
          className="w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 hover:bg-white/[0.06] transition-colors"
          style={{ color: 'var(--color-text-muted)' }}>
          <IconGlobe size={16} />
          <span className="text-[8px] font-bold tracking-wide" style={{ fontFamily: 'var(--font-mono)' }}>{lang === 'ko' ? 'KO' : 'EN'}</span>
        </motion.button>
      </nav>

      {/* ── Main column ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col relative">
        {/* Studio step header */}
        {module === 'studio' && (
          <header className="h-[52px] shrink-0 flex items-center justify-center gap-1 relative z-20"
            style={{
              background: 'rgba(8, 8, 14, 0.6)',
              backdropFilter: 'blur(24px) saturate(160%)',
              WebkitBackdropFilter: 'blur(24px) saturate(160%)',
              boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)',
            }}>
            {STEPS.map((s, i) => {
              const isActive = s.key === step;
              const isDone = currentIdx > i;
              const isClickable = (isDone || i === currentIdx + 1 || i <= currentIdx) && (s.key === 'upload' || projectId);
              return (
                <div key={s.key} className="flex items-center">
                  {i > 0 && <div className="w-6 h-px mx-1" style={{ background: isDone ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)' }} />}
                  <div onClick={() => isClickable && navigateTo(s.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${isClickable ? 'cursor-pointer hover:bg-white/[0.04]' : ''} ${isActive ? 'text-white' : isDone ? 'text-white/60' : 'text-[var(--color-text-muted)]'}`}
                    style={isActive ? { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' } : { border: '1px solid transparent' }}>
                    <span className="text-[10px] opacity-60 flex items-center" style={{ fontFamily: 'var(--font-mono)' }}>
                      {isDone ? <IconCheck size={11} /> : s.num}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)' }}>{t(STEP_LABEL_KEY[s.key])}</span>
                  </div>
                </div>
              );
            })}
          </header>
        )}

        {/* Stage */}
        <main className="flex-1 min-h-0 relative z-10">
          {/* No AnimatePresence here: its enter-after-exit freezes under React 19
              (same bug as qupid). A keyed remount with initial→animate is reliable. */}
            <motion.div key={module === 'studio' ? `studio-${step}` : module}
              variants={pageVariants} initial="initial" animate="animate" className="h-full">
              {module === 'home' && (
                <Home onOpenDownloader={() => setModule('downloader')} onOpenStudio={() => setModule('studio')} />
              )}
              {module === 'downloader' && <Downloader />}
              {module === 'studio' && step === 'upload' && (
                <FileUpload
                  onUploadComplete={(id) => { setProjectId(id); setStep('sync'); }}
                  onLoadProject={loadProject}
                />
              )}
              {module === 'studio' && step === 'sync' && projectId && (
                <LyricSync projectId={projectId} onComplete={() => setStep('preview')} />
              )}
              {module === 'studio' && step === 'preview' && projectId && (
                <Preview projectId={projectId} onGenerate={() => setStep('generate')} onBack={() => setStep('sync')} />
              )}
              {module === 'studio' && step === 'generate' && projectId && (
                <Generate projectId={projectId} onBack={() => setStep('preview')} onBackToSync={() => setStep('sync')} />
              )}
            </motion.div>
        </main>
      </div>

      <UpdateBanner />
    </div>
  );
}
