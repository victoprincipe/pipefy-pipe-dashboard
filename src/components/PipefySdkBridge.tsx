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

/**
 * Registers `PipefyApp.initCall` when loaded inside Pipefy's hidden root iframe (`?root=true`),
 * or calls `PipefyApp.init()` + `PipefyApp.render()` when opened in the visible `pipe-view` tab.
 */
export function PipefySdkBridge() {
  useEffect(() => {
    const search = window.location.search;
    const isInsidePipefy = window.self !== window.top || search.includes('appID=');
    if (!isInsidePipefy) return;

    const isRootInit = search.includes('root=true');
    let cancelled = false;
    let initialized = false;

    const tryInit = () => {
      if (cancelled || initialized || !window.PipefyApp) return false;
      initialized = true;

      try {
        if (isRootInit) {
          window.PipefyApp.initCall({
            'pipe-view': () => ({
              icon: './globe.svg',
              text: 'PipeLens Dashboard',
              url: './',
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
  }, []);

  return null;
}
