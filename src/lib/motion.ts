import type { Transition } from 'framer-motion';

/**
 * Apple-style motion presets (WWDC "Designing Fluid Interfaces").
 * Default UI motion is a critically-damped spring (no overshoot); a touch of bounce is
 * reserved for appearances / momentum. Press feedback is instant and continuous.
 */
export const springSoft: Transition = { type: 'spring', bounce: 0, duration: 0.4 };
export const springPop: Transition = { type: 'spring', bounce: 0.26, duration: 0.42 };
export const easeOut = [0.22, 1, 0.36, 1] as const;

/** Subtle hover lift + crisp press — the house style for interactive surfaces. */
export const hoverLift = { scale: 1.02, y: -2 };
export const tap = { scale: 0.97 };
