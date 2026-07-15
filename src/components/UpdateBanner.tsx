import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { springSoft } from '../lib/motion';
import { useI18n } from '../lib/i18n';
import { IconRefresh, IconCheck, IconAlert, IconX } from './icons';

type Phase = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

/**
 * Silent-on-launch update check. If a newer signed release exists on GitHub, a
 * translucent banner slides up offering a one-click download + relaunch. Any
 * failure (offline, no endpoint, dev build) is swallowed so it never nags.
 */
export default function UpdateBanner() {
  const { t } = useI18n();
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await check();
        if (!cancelled && u) {
          setUpdate(u);
          setPhase('available');
        }
      } catch {
        /* offline / no manifest / dev run — stay silent */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const install = async () => {
    if (!update) return;
    setPhase('downloading');
    try {
      let total = 0;
      let got = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0;
        else if (e.event === 'Progress') {
          got += e.data.chunkLength;
          if (total > 0) setPct(Math.min(100, Math.round((got / total) * 100)));
        } else if (e.event === 'Finished') setPct(100);
      });
      setPhase('ready');
      await relaunch();
    } catch {
      setPhase('error');
    }
  };

  const dismiss = () => setPhase('idle');

  return (
    <div className="fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <AnimatePresence>
        {phase !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={springSoft}
            className="glass-strong rounded-2xl pl-4 pr-3 py-3 flex items-center gap-3 pointer-events-auto"
            style={{ minWidth: 320, maxWidth: 480 }}>

            {phase === 'available' && update && (
              <>
                <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--color-text-primary)' }}>
                  <IconRefresh size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                    {t('ub.new', { v: update.version })}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {t('ub.sub')}
                  </p>
                </div>
                <motion.button whileTap={{ scale: 0.96 }} transition={springSoft} onClick={install}
                  className="shrink-0 px-3.5 py-2 rounded-xl text-sm font-semibold"
                  style={{ fontFamily: 'var(--font-display)', background: '#fff', color: '#000' }}>
                  {t('ub.install')}
                </motion.button>
                <button onClick={dismiss} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--color-text-muted)' }} title={t('ub.later')}>
                  <IconX size={15} />
                </button>
              </>
            )}

            {phase === 'downloading' && (
              <>
                <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--color-text-primary)' }}>
                  <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ display: 'flex' }}>
                    <IconRefresh size={18} />
                  </motion.span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                    {t('ub.downloading', { p: pct })}
                  </p>
                  <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    <motion.div className="h-full rounded-full" style={{ background: '#fff' }}
                      animate={{ width: `${pct}%` }} transition={{ ease: 'easeOut', duration: 0.3 }} />
                  </div>
                </div>
              </>
            )}

            {phase === 'ready' && (
              <>
                <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#fff', color: '#000' }}>
                  <IconCheck size={18} />
                </span>
                <p className="flex-1 text-sm font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                  {t('ub.ready')}
                </p>
              </>
            )}

            {phase === 'error' && (
              <>
                <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(244,63,94,0.16)', color: 'var(--color-danger)' }}>
                  <IconAlert size={18} />
                </span>
                <p className="flex-1 text-sm font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                  {t('ub.error')}
                </p>
                <button onClick={dismiss} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--color-text-muted)' }} title={t('ub.close')}>
                  <IconX size={15} />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
