import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FileUpload from './components/FileUpload';
import LyricSync from './components/LyricSync';
import Preview from './components/Preview';
import Generate from './components/Generate';
import UpdateBanner from './components/UpdateBanner';
import { IconCheck } from './components/icons';
import type { AppStep } from './types';

const STEPS: { key: AppStep; label: string; icon: string }[] = [
  { key: 'upload', label: '업로드', icon: '01' },
  { key: 'sync', label: '싱크', icon: '02' },
  { key: 'preview', label: '프리뷰', icon: '03' },
  { key: 'generate', label: '렌더', icon: '04' },
];

// Apple-style page transition: compositor-friendly (opacity + transform only), a
// critically-damped spring in, a quick ease out. No blur filter (heavy + un-Apple).
const pageVariants = {
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring' as const, bounce: 0, duration: 0.5 } },
  exit: { opacity: 0, y: -14, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
};

export default function App() {
  const [step, setStep] = useState<AppStep>('upload');
  const [projectId, setProjectId] = useState('');

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

  return (
    <div className="min-h-full flex flex-col relative">
      {step !== 'upload' && (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]"
            style={{ background: 'radial-gradient(circle, #ffffff, transparent 70%)' }} />
          <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.02]"
            style={{ background: 'radial-gradient(circle, #ffffff, transparent 70%)' }} />
        </div>
      )}

      {/* Nav — translucent material with a soft scroll-edge (no hard divider) */}
      <nav className="relative z-30"
        style={{
          background: 'rgba(8, 8, 14, 0.6)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          boxShadow: '0 1px 0 0 rgba(255,255,255,0.05), 0 10px 30px rgba(0,0,0,0.25)',
        }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between py-4 px-6">
          <motion.div className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => navigateTo('upload')}
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#ffffff' }}>
              <span className="text-black text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>L</span>
            </div>
            <span className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
              LYRIC VIDEO STUDIO
            </span>
          </motion.div>

          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const isActive = s.key === step;
              const isDone = currentIdx > i;
              const isClickable = (isDone || i === currentIdx + 1) && (s.key === 'upload' || projectId);
              return (
                <motion.div key={s.key} className="flex items-center"
                  initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.05 }}>
                  {i > 0 && (
                    <div className="w-6 h-px mx-1"
                      style={{ background: isDone ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)' }} />
                  )}
                  <div onClick={() => isClickable && navigateTo(s.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${isClickable ? 'cursor-pointer hover:bg-white/[0.04]' : ''} ${isActive ? 'text-white' : isDone ? 'text-white/60' : 'text-[var(--color-text-muted)]'}`}
                    style={isActive ? { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' } : { border: '1px solid transparent' }}>
                    <span className="text-[10px] opacity-60 flex items-center" style={{ fontFamily: 'var(--font-mono)' }}>
                      {isDone ? <IconCheck size={11} /> : s.icon}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)' }}>{s.label}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 px-6 py-8 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div key={step} variants={pageVariants} initial="initial" animate="animate" exit="exit">
            {step === 'upload' && (
              <FileUpload
                onUploadComplete={(id) => { setProjectId(id); setStep('sync'); }}
                onLoadProject={loadProject}
              />
            )}
            {step === 'sync' && projectId && (
              <LyricSync projectId={projectId} onComplete={() => setStep('preview')} />
            )}
            {step === 'preview' && projectId && (
              <Preview projectId={projectId} onGenerate={() => setStep('generate')} onBack={() => setStep('sync')} />
            )}
            {step === 'generate' && projectId && (
              <Generate projectId={projectId} onBack={() => setStep('preview')} onBackToSync={() => setStep('sync')} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <UpdateBanner />
    </div>
  );
}
