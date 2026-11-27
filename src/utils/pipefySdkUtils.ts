import {
  fetchPipefyMembers,
  fetchPipefyUser,
  resolveNumericPipeId,
  type PipefySdkClient,
} from '@/lib/pipefyExportClient';
import type { PipefyUserInfo } from '@/types/pipefySql';

export interface PipefyFrameContext {
  isInsidePipefy: boolean;
  isRootFrame: boolean;
}

export interface PipefySession {
  user: PipefyUserInfo;
  pipeId: string;
  pipeUsers: PipefyUserInfo[];
}

/**
 * Inspects window frame ancestry and query parameters to determine whether the app
 * is running inside Pipefy and whether this instance is the hidden root frame.
 */
export function detectPipefyFrameContext(): PipefyFrameContext {
  const search = window.location.search;
  return {
    isInsidePipefy: window.self !== window.top || search.includes('appID='),
    isRootFrame: search.includes('root=true'),
  };
}

/**
 * Polls for the global `window.PipefyApp` SDK script until available or timeout expires.
 */
export function waitForPipefySdk(
  timeoutMs = 10_000
): Promise<NonNullable<Window['PipefyApp']>> {
  return new Promise((resolve, reject) => {
    if (window.PipefyApp) {
      resolve(window.PipefyApp);
      return;
    }

    const start = Date.now();
    const interval = window.setInterval(() => {
      if (window.PipefyApp) {
        window.clearInterval(interval);
        resolve(window.PipefyApp);
      } else if (Date.now() - start > timeoutMs) {
        window.clearInterval(interval);
        reject(new Error('PipefyApp SDK não carregou dentro do tempo limite.'));
      }
    }, 50);
  });
}

/**
 * Registers the Pipefy `pipe-view` tab entry from the hidden root frame using
 * relative URLs so Pipefy resolves them against the manifest origin.
 */
export function registerPipefyRootView(sdk: NonNullable<Window['PipefyApp']>): void {
  sdk.initCall({
    'pipe-view': () => ({
      icon: './globe.svg',
      text: 'PipeLens Dashboard',
      url: './',
    }),
  });
}

/**
 * Resolves the authenticated Pipefy user and numeric Pipe ID from the initialized SDK client.
 */
export async function resolvePipefySession(client: PipefySdkClient): Promise<PipefySession> {
  const [resolvedUser, pipeFallback] = await Promise.all([
    fetchPipefyUser(client),
    client.pipe().catch(() => null),
  ]);

  const numericPipeId =
    resolveNumericPipeId(client) || (pipeFallback?.id ? String(pipeFallback.id) : '');
  if (!numericPipeId) {
    throw new Error('Não foi possível identificar o ID numérico do Pipe.');
  }

  const members = await fetchPipefyMembers(client, numericPipeId).catch(() => []);
  const pipeUsers: PipefyUserInfo[] = [resolvedUser];
  const seenIds = new Set([resolvedUser.id]);
  for (const member of members) {
    if (!seenIds.has(member.id)) {
      seenIds.add(member.id);
      pipeUsers.push(member);
    }
  }

  return {
    user: resolvedUser,
    pipeId: numericPipeId,
    pipeUsers,
  };
}
