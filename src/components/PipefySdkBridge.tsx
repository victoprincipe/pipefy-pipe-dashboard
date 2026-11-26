'use client';

import { useEffect } from 'react';

interface PipefyAppApi {
  initCall: (features: Record<string, (...args: unknown[]) => unknown>) => void;
  init: () => unknown;
  render: (cb: () => void) => void;
}

declare global {
  interface Window {
    PipefyApp?: PipefyAppApi;
  }
}

interface PipefySdkBridgeProps {
  mode: 'root' | 'pipe-view';
}

/**
 * Registers Pipefy Apps SDK entrypoints (`initCall` on root iframe, `init` + `render` on `pipe-view`).
 */
export function PipefySdkBridge({ mode }: PipefySdkBridgeProps) {
  useEffect(() => {
    const isInsidePipefy =
      window.self !== window.top || window.location.search.includes('appID=');
    if (!isInsidePipefy) return;

    let cancelled = false;
    let initialized = false;

    const tryInit = () => {
      if (cancelled || initialized || !window.PipefyApp) return false;
      initialized = true;

      try {
        if (mode === 'root') {
          const origin = window.location.origin;
          window.PipefyApp.initCall({
            'pipe-view': () => ({
              icon: `${origin}/globe.svg`,
              text: 'PipeLens Dashboard',
              url: `${origin}/pipe-view`,
            }),
          });
        } else {
          window.PipefyApp.init();
          window.PipefyApp.render(() => {});
        }
      } catch (err) {
        console.error('[PipeLens] Erro ao inicializar PipefyApp SDK:', err);
      }
      return true;
    };

    if (tryInit()) return;

    const interval = window.setInterval(() => {
      if (tryInit()) {
        window.clearInterval(interval);
      }
    }, 50);

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [mode]);

  return null;
}
