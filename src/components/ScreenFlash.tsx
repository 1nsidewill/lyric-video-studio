import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  trigger: number;
  combo: number;
}

export default function ScreenFlash({ trigger, combo }: Props) {
  const color = combo >= 10 ? 'rgba(236, 72, 153, 0.15)'
    : combo >= 5 ? 'rgba(249, 115, 22, 0.12)'
    : 'rgba(168, 85, 247, 0.1)';

  return (
    <AnimatePresence>
      {trigger > 0 && (
        <motion.div
          key={trigger}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute inset-0 pointer-events-none z-10"
          style={{ background: `radial-gradient(ellipse at center, ${color}, transparent 70%)` }}
        />
      )}
    </AnimatePresence>
  );
}
