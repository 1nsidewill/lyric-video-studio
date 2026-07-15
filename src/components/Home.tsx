import { motion } from 'framer-motion';
import { springSoft } from '../lib/motion';
import { useI18n } from '../lib/i18n';
import { IconDownload, IconFilm, IconMic, IconArrowRight } from './icons';

interface Props {
  onOpenDownloader: () => void;
  onOpenSketch: () => void;
  onOpenStudio: () => void;
}

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function Home({ onOpenDownloader, onOpenSketch, onOpenStudio }: Props) {
  const { t } = useI18n();
  const cards = [
    { icon: <IconDownload size={24} />, title: t('home.downloader.title'), desc: t('home.downloader.desc'), onClick: onOpenDownloader },
    { icon: <IconMic size={24} />, title: t('home.sketch.title'), desc: t('home.sketch.desc'), onClick: onOpenSketch },
    { icon: <IconFilm size={24} />, title: t('home.studio.title'), desc: t('home.studio.desc'), onClick: onOpenStudio },
  ];

  return (
    <div className="h-full flex flex-col items-center justify-center px-8 relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-[640px] h-[420px] rounded-full opacity-[0.035]"
          style={{ background: 'radial-gradient(circle, #ffffff, transparent 65%)' }} />
      </div>

      <motion.div initial="initial" animate="animate" transition={{ staggerChildren: 0.07 }} className="relative z-10 w-full max-w-4xl">
        <motion.div variants={fadeUp} className="text-center mb-12">
          <h1 className="text-[4rem] leading-none font-bold tracking-tight lowercase" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
            the rest
          </h1>
          <p className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('home.tagline')}</p>
        </motion.div>

        <motion.div variants={fadeUp} className="grid grid-cols-3 gap-4">
          {cards.map(c => (
            <motion.button key={c.title}
              whileHover={{ scale: 1.015, y: -3 }} whileTap={{ scale: 0.985 }} transition={springSoft}
              onClick={c.onClick}
              className="glass glass-hover rounded-3xl p-7 text-left group cursor-pointer">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--color-text-primary)' }}>
                {c.icon}
              </div>
              <p className="font-semibold text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</p>
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{c.desc}</p>
              <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold opacity-50 group-hover:opacity-100 transition-opacity"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>
                {t('home.open')} <IconArrowRight size={14} />
              </div>
            </motion.button>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
