'use client';

import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Reads the OS-level reduced-motion preference and keeps it in sync.
 *
 * Initializes to `false` so SSR and the first client render match, then
 * re-syncs in an effect. Use it to gate JS-driven animation (Recharts,
 * canvas, timers) that CSS media queries cannot reach.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReduced(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  return reduced;
}
