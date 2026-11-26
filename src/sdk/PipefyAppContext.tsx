import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PipefyUser } from '../types/pipefy';
import { ME_QUERY } from './pipefyQueries';

export interface PipefySdkClient {
  app?: { pipeId?: string | number };
  pipeId?: string;
  organizationId?: string;
  locale?: string;
  pipe: () => Promise<{ id: string; name: string; cards_count?: number; organization_name?: string } | null>;
  fields: () => Promise<any[] | null>;
  phases: () => Array<{ id: string; name: string; done: boolean }>;
  query: (query: string, variables?: Record<string, unknown>) => Promise<{ data?: any; errors?: any }>;
  mutation: (mutation: string, variables?: Record<string, unknown>) => Promise<{ data?: any; errors?: any }>;
  get: (scope: 'card' | 'pipe' | 'organization', visibility: 'private' | 'public', key: string) => Promise<string | null>;
  set: (scope: 'card' | 'pipe' | 'organization', visibility: 'private' | 'public', key: string, value: string) => Promise<unknown>;
  openCard: (id: string | number) => void;
  sidebar: (opts: { title: string; url: string }) => void;
  closeSidebar: () => void;
  closeView: () => void;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  timezone: () => Promise<string | undefined>;
}

export interface PipefyGlobalSdk {
  init: () => PipefySdkClient;
  initCall: (handlers: Record<string, any>) => void;
  render: (cb: () => void) => void;
  registerListener?: (eventName: string, cb: (payload: any) => void) => void;
  pipeFilter?: (pipeId: string) => void;
}

declare global {
  interface Window {
    PipefyApp?: PipefyGlobalSdk;
  }
}

export const DEMO_USERS: PipefyUser[] = [
  {
    id: '305998309',
    name: 'Victo Principe Pessoa Borges',
    email: 'victopessoa46@gmail.com',
    username: 'victopessoa46',
  },
  {
    id: '999000001',
    name: 'Ana Beatriz (Analista Ops)',
    email: 'ana.ops@empresa-demo.com',
    username: 'ana.ops',
  },
];

interface PipefyAppContextValue {
  ready: boolean;
  isInsidePipefy: boolean;
  isRootFrame: boolean;
  pipefyApp: PipefyGlobalSdk | null;
  client: PipefySdkClient | null;
  user: PipefyUser;
  pipeId: string;
  locale: string;
  switchDemoUser: (userId: string) => void;
}

const PipefyAppContext = createContext<PipefyAppContextValue | null>(null);

function detectPipefyContext(): boolean {
  if (typeof window === 'undefined') return false;
  const search = window.location.search || '';
  if (search.includes('appID=')) return true;
  try {
    return Boolean(sessionStorage.getItem('pipefy-app.appID') && window.self !== window.top);
  } catch {
    return false;
  }
}

function resolveNumericPipeId(sdkClient: PipefySdkClient | null): string {
  const fromApp = sdkClient?.app?.pipeId;
  if (fromApp !== undefined && fromApp !== null && /^\d+$/.test(String(fromApp))) {
    return String(fromApp);
  }
  const fromClient = sdkClient?.pipeId;
  if (fromClient !== undefined && fromClient !== null && /^\d+$/.test(String(fromClient))) {
    return String(fromClient);
  }
  if (typeof document !== 'undefined' && document.referrer) {
    const match = document.referrer.match(/\/pipes\/(\d+)/);
    if (match?.[1]) return match[1];
  }
  return '';
}

export function PipefyAppProvider({ children }: { children: React.ReactNode }) {
  const isRootFrame =
    typeof window !== 'undefined' && window.location.search.includes('root=true');
  const [ready, setReady] = useState(false);
  const [isInsidePipefy, setIsInsidePipefy] = useState(false);
  const [client, setClient] = useState<PipefySdkClient | null>(null);
  const [user, setUser] = useState<PipefyUser>(DEMO_USERS[0]);
  const [pipeId, setPipeId] = useState<string>('307435909');
  const [locale, setLocale] = useState<string>('pt-br');

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const inside = detectPipefyContext() && Boolean(window.PipefyApp);
      if (!inside || !window.PipefyApp) {
        if (active) {
          setIsInsidePipefy(false);
          setReady(true);
        }
        return;
      }

      // On the hidden root=true frame, initCall() initializes the SDK itself and must run immediately.
      if (isRootFrame) {
        if (active) {
          setIsInsidePipefy(true);
          setReady(true);
        }
        return;
      }

      try {
        const sdkClient = window.PipefyApp.init();
        if (!active) return;

        setIsInsidePipefy(true);
        setClient(sdkClient);
        setLocale(sdkClient.locale || 'pt-br');

        let resolvedPipeId = resolveNumericPipeId(sdkClient);
        if (!resolvedPipeId) {
          const pipeInfo = await sdkClient.pipe();
          if (pipeInfo?.id && /^\d+$/.test(String(pipeInfo.id))) {
            resolvedPipeId = String(pipeInfo.id);
          }
        }
        if (active && resolvedPipeId) {
          setPipeId(resolvedPipeId);
        }

        // Fetch authenticated user via p.query(ME_QUERY) for strict per-user cache isolation
        const meRes = await sdkClient.query(ME_QUERY);
        const me = meRes?.data?.me;
        if (active && me?.id) {
          setUser({
            id: String(me.id),
            name: me.name || me.username || `Usuário ${me.id}`,
            email: me.email || '',
            username: me.username,
          });
        }
      } catch (err) {
        console.error('[PipeLens] Falha ao inicializar PipefyApp SDK:', err);
      } finally {
        if (active) setReady(true);
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [isRootFrame]);

  const switchDemoUser = (userId: string) => {
    const found = DEMO_USERS.find((u) => u.id === userId);
    if (found) setUser(found);
  };

  const value = useMemo<PipefyAppContextValue>(
    () => ({
      ready,
      isInsidePipefy,
      isRootFrame,
      pipefyApp: typeof window !== 'undefined' ? window.PipefyApp ?? null : null,
      client,
      user,
      pipeId,
      locale,
      switchDemoUser,
    }),
    [ready, isInsidePipefy, isRootFrame, client, user, pipeId, locale]
  );

  return <PipefyAppContext.Provider value={value}>{children}</PipefyAppContext.Provider>;
}

export function usePipefyApp(): PipefyAppContextValue {
  const ctx = useContext(PipefyAppContext);
  if (!ctx) {
    throw new Error('usePipefyApp deve ser usado dentro de PipefyAppProvider.');
  }
  return ctx;
}
