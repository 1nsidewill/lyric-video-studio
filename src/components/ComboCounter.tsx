import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  combo: number;
  lastHitTime: number;
}

function getComboTier(combo: number) {
  if (combo >= 20) return { label: 'LEGENDARY', color: '#ec4899', glow: 'rgba(236, 72, 153, 0.6)', scale: 1.4 };
  if (combo >= 15) return { label: 'ULTRA', color: '#f97316', glow: 'rgba(249, 115, 22, 0.5)', scale: 1.3 };
  if (combo >= 10) return { label: 'FIRE', color: '#f97316', glow: 'rgba(249, 115, 22, 0.4)', scale: 1.2 };
  if (combo >= 5) return { label: 'NICE', color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.3)', scale: 1.1 };
  if (combo >= 3) return { label: 'GOOD', color: '#a855f7', glow: 'rgba(168, 85, 247, 0.3)', scale: 1.05 };
  return { label: '', color: '#a855f7', glow: 'transparent', scale: 1.0 };
}

export default function ComboCounter({ combo, lastHitTime: _lastHitTime }: Props) {
  const tier = getComboTier(combo);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <AnimatePresence mode="popLayout">
        {combo >= 3 && (
          <motion.div
            key={tier.label}
            initial={{ scale: 2, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="text-xs font-bold tracking-[0.3em] uppercase"
            style={{
              fontFamily: 'var(--font-display)',
              color: tier.color,
              textShadow: `0 0 20px ${tier.glow}`,
            }}
          >
            {tier.label}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="popLayout">
        {combo >= 2 && (
          <motion.div
            key={`combo-${combo}`}
            initial={{ scale: 1.8, opacity: 0 }}
            animate={{ scale: tier.scale, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="flex items-baseline gap-1"
          >
            <span
              className="text-3xl font-extrabold tabular-nums"
              style={{
                fontFamily: 'var(--font-display)',
                color: tier.color,
                textShadow: `0 0 30px ${tier.glow}`,
              }}
            >
              {combo}
            </span>
            <span
              className="text-sm font-bold tracking-wider opacity-60"
              style={{ fontFamily: 'var(--font-display)', color: tier.color }}
            >
              COMBO
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
