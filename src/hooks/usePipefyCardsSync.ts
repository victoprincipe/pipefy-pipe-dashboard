'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dropDuckDbTable } from '@/lib/pipefyDuckDb';
import type { PipefySdkClient } from '@/lib/pipefyExportClient';
import {
  type CachedUserDatasetSummary,
  clearUserSqlDataset,
  DEFAULT_CACHE_TTL_MS,
  listCachedUsersForPipe,
} from '@/lib/pipefyIndexedDb';
import type {
  CacheHitStatus,
  PipefySqlDataset,
  PipefySyncPhase,
  PipefyUserInfo,
} from '@/types/pipefySql';
import {
  detectPipefyFrameContext,
  registerPipefyRootView,
  resolvePipefySession,
  waitForPipefySdk,
} from '@/utils/pipefySdkUtils';
import {
  extractErrorMessage,
  importLocalDataFile,
  isAbortError,
  LOCAL_TEST_PIPE_ID,
  LOCAL_TEST_USER,
  restoreCachedLocalSqlDataset,
  restoreCachedPipefyUserDataset,
  syncPipefySqlDataset,
} from '@/utils/pipefySyncUtils';

interface UsePipefyCardsSyncOptions {
  ttlMs?: number;
  autoDownloadOnOpen?: boolean;
}

/**
 * Automatically initializes the Pipefy SDK on page open, resolves the authenticated
 * Pipefy user & Pipe members, keeps each Pipefy user's IndexedDB + DuckDB-WASM cache
 * isolated by `${userId}::${pipeId}`, and supports local `.xlsx` testing outside Pipefy.
 */
export function usePipefyCardsSync(options: UsePipefyCardsSyncOptions = {}) {
  const { ttlMs = DEFAULT_CACHE_TTL_MS, autoDownloadOnOpen = true } = options;

  const [isInsidePipefy, setIsInsidePipefy] = useState(false);
  const [isRootFrame, setIsRootFrame] = useState(false);
  const [phase, setPhase] = useState<PipefySyncPhase>('idle');
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<PipefyUserInfo | null>(null);
  const [pipeUsers, setPipeUsers] = useState<PipefyUserInfo[]>([]);
  const [cachedUsersSummary, setCachedUsersSummary] = useState<
    Record<string, CachedUserDatasetSummary>
  >({});
  const [pipeId, setPipeId] = useState<string | null>(null);
  const [sdkClient, setSdkClient] = useState<PipefySdkClient | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheHitStatus>('MISS');
  const [dataset, setDataset] = useState<PipefySqlDataset | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const clientRef = useRef<PipefySdkClient | null>(null);
  const rootInitDoneRef = useRef(false);
  const pipeUsersRef = useRef<PipefyUserInfo[]>([]);
  const userRef = useRef<PipefyUserInfo | null>(null);
  const pipeIdRef = useRef<string | null>(null);
  const tableNameRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshPipeCacheSummary = useCallback(async (targetPipeId: string | null) => {
    if (!targetPipeId || targetPipeId === LOCAL_TEST_PIPE_ID) return;
    try {
      const summaries = await listCachedUsersForPipe(targetPipeId);
      setCachedUsersSummary(summaries);
    } catch {
      // Non-fatal: cache summary lookup can fail silently.
    }
  }, []);

  const ensureSession = useCallback(
    async (signal: AbortSignal) => {
      if (!clientRef.current) {
        setPhase('initializing');
        setMessage('Inicializando Pipefy SDK...');
        const sdk = await waitForPipefySdk();
        if (signal.aborted) return null;
        clientRef.current = sdk.init();
        sdk.render(() => {});
        setSdkClient(clientRef.current);
      }

      const client = clientRef.current;

      if (!userRef.current || !pipeIdRef.current) {
        const session = await resolvePipefySession(client);
        if (signal.aborted) return null;
        userRef.current = session.user;
        pipeIdRef.current = session.pipeId;
        pipeUsersRef.current = session.pipeUsers;
        setUser(session.user);
        setPipeId(session.pipeId);
        setPipeUsers(session.pipeUsers);
        await refreshPipeCacheSummary(session.pipeId);
      }

      return {
        client,
        user: userRef.current,
        pipeId: pipeIdRef.current,
      };
    },
    [refreshPipeCacheSummary]
  );

  const runSync = useCallback(
    async (forceDownload = false) => {
      if (inFlightRef.current) return;

      const { isInsidePipefy: inside, isRootFrame: rootFrame } = detectPipefyFrameContext();
      if (!inside || rootFrame) return;

      inFlightRef.current = true;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setError(null);

      try {
        const session = await ensureSession(abort.signal);
        if (!session || abort.signal.aborted) return;

        const result = await syncPipefySqlDataset({
          client: session.client,
          user: session.user,
          pipeId: session.pipeId,
          ttlMs,
          forceDownload,
          signal: abort.signal,
          onStatus: (nextPhase, nextMsg) => {
            if (!abort.signal.aborted) {
              setPhase(nextPhase);
              setMessage(nextMsg);
            }
          },
          onStaleCache: (staleDataset, staleStatus) => {
            if (!abort.signal.aborted) {
              tableNameRef.current = staleDataset.tableName;
              setDataset(staleDataset);
              setCacheStatus(staleStatus);
            }
          },
        });

        if (!result || abort.signal.aborted) return;

        tableNameRef.current = result.dataset.tableName;
        setDataset(result.dataset);
        setCacheStatus(result.cacheStatus);
        setPhase('ready');
        setDurationMs(result.durationMs);
        setMessage(result.message);
        await refreshPipeCacheSummary(session.pipeId);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        const errMsg = extractErrorMessage(err);
        setPhase('error');
        setError(errMsg);
        setMessage(errMsg);
      } finally {
        inFlightRef.current = false;
      }
    },
    [ensureSession, refreshPipeCacheSummary, ttlMs]
  );

  useEffect(() => {
    const { isInsidePipefy: inside, isRootFrame: rootFrame } = detectPipefyFrameContext();

    if (!inside) {
      // Keep user/pipeUsers null/empty outside Pipefy; use internal local test slot for `.xlsx` testing.
      userRef.current = LOCAL_TEST_USER;
      pipeIdRef.current = LOCAL_TEST_PIPE_ID;

      let cancelled = false;
      const abort = new AbortController();

      void (async () => {
        try {
          const restored = await restoreCachedLocalSqlDataset({
            signal: abort.signal,
            onStatus: (nextPhase, nextMsg) => {
              if (!cancelled) {
                setPhase(nextPhase);
                setMessage(nextMsg);
              }
            },
          });
          if (cancelled || !restored) return;

          tableNameRef.current = restored.dataset.tableName;
          setDataset(restored.dataset);
          setCacheStatus(restored.cacheStatus);
          setDurationMs(restored.durationMs);
          setPhase('ready');
          setMessage(restored.message);
        } catch (err: unknown) {
          if (cancelled || isAbortError(err)) return;
          const errMsg = extractErrorMessage(err);
          setPhase('error');
          setError(errMsg);
          setMessage(errMsg);
        }
      })();

      return () => {
        cancelled = true;
        abort.abort();
      };
    }

    let cancelled = false;

    void (async () => {
      try {
        setIsInsidePipefy(true);
        setIsRootFrame(rootFrame);
        setPhase('initializing');

        const sdk = await waitForPipefySdk();
        if (cancelled) return;

        if (rootFrame) {
          if (!rootInitDoneRef.current) {
            rootInitDoneRef.current = true;
            registerPipefyRootView(sdk);
          }
          setPhase('idle');
          return;
        }

        if (!clientRef.current) {
          clientRef.current = sdk.init();
          sdk.render(() => {});
          setSdkClient(clientRef.current);
        }
        const client = clientRef.current;

        if (!userRef.current || !pipeIdRef.current) {
          const session = await resolvePipefySession(client);
          if (cancelled) return;

          userRef.current = session.user;
          pipeIdRef.current = session.pipeId;
          pipeUsersRef.current = session.pipeUsers;
          setUser(session.user);
          setPipeId(session.pipeId);
          setPipeUsers(session.pipeUsers);
          await refreshPipeCacheSummary(session.pipeId);
          if (cancelled) return;
        }

        if (autoDownloadOnOpen) {
          await runSync(false);
        } else {
          setPhase('idle');
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const errMsg = extractErrorMessage(err);
        setPhase('error');
        setError(errMsg);
        setMessage(errMsg);
      }
    })();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [autoDownloadOnOpen, refreshPipeCacheSummary, runSync]);

  const refresh = useCallback(() => runSync(true), [runSync]);

  const switchPipefyUser = useCallback(
    async (targetUserId: string) => {
      if (inFlightRef.current || !pipeIdRef.current) return;
      const targetUser = pipeUsersRef.current.find((u) => u.id === targetUserId);
      if (!targetUser || userRef.current?.id === targetUser.id) return;

      inFlightRef.current = true;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setError(null);

      try {
        if (tableNameRef.current) {
          await dropDuckDbTable(tableNameRef.current).catch(() => {});
          tableNameRef.current = null;
        }

        const activePipeId = pipeIdRef.current;
        userRef.current = targetUser;
        setUser(targetUser);
        setDataset(null);
        setDurationMs(null);
        setCacheStatus('MISS');

        const restored = await restoreCachedPipefyUserDataset({
          user: targetUser,
          pipeId: activePipeId,
          ttlMs,
          signal: abort.signal,
          onStatus: (nextPhase, nextMsg) => {
            if (!abort.signal.aborted) {
              setPhase(nextPhase);
              setMessage(nextMsg);
            }
          },
        });
        if (abort.signal.aborted) return;

        if (restored) {
          tableNameRef.current = restored.dataset.tableName;
          setDataset(restored.dataset);
          setCacheStatus(restored.cacheStatus);
          setDurationMs(restored.durationMs);
          setPhase('ready');
          setMessage(restored.message);
        } else {
          setPhase('idle');
          setMessage(
            `Nenhum cache no IndexedDB para ${targetUser.name}. Clique em "Sincronizar dados" para gerar o cache deste usuário.`
          );
        }

        await refreshPipeCacheSummary(activePipeId);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        const errMsg = extractErrorMessage(err);
        setPhase('error');
        setError(errMsg);
        setMessage(errMsg);
      } finally {
        inFlightRef.current = false;
      }
    },
    [refreshPipeCacheSummary, ttlMs]
  );

  const importLocalXlsx = useCallback(
    async (file: File, options?: { sheetName?: string }) => {
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setError(null);

      userRef.current = LOCAL_TEST_USER;
      pipeIdRef.current = LOCAL_TEST_PIPE_ID;

      try {
        if (tableNameRef.current) {
          await dropDuckDbTable(tableNameRef.current).catch(() => {});
          tableNameRef.current = null;
        }

        const result = await importLocalDataFile({
          file,
          sheetName: options?.sheetName,
          signal: abort.signal,
          onStatus: (nextPhase, nextMsg) => {
            if (!abort.signal.aborted) {
              setPhase(nextPhase);
              setMessage(nextMsg);
            }
          },
        });
        if (!result || abort.signal.aborted) return;

        tableNameRef.current = result.dataset.tableName;
        setPipeId(LOCAL_TEST_PIPE_ID);
        setDataset(result.dataset);
        setCacheStatus(result.cacheStatus);
        setDurationMs(result.durationMs);
        setPhase('ready');
        setMessage(result.message);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        const errMsg = extractErrorMessage(err);
        setPhase('error');
        setError(errMsg);
        setMessage(errMsg);
      } finally {
        inFlightRef.current = false;
      }
    },
    []
  );

  const clearCache = useCallback(async () => {
    if (!userRef.current || !pipeIdRef.current) return;
    const activeUser = userRef.current;
    const activePipeId = pipeIdRef.current;

    await clearUserSqlDataset(activeUser.id, activePipeId);
    if (tableNameRef.current) {
      await dropDuckDbTable(tableNameRef.current).catch(() => {});
      tableNameRef.current = null;
    }

    setDataset(null);
    setDurationMs(null);
    setCacheStatus('MISS');
    setPhase('idle');

    if (activePipeId !== LOCAL_TEST_PIPE_ID) {
      setMessage(
        `Cache de ${activeUser.name} removido do DuckDB-WASM e IndexedDB.`
      );
      await refreshPipeCacheSummary(activePipeId);
    } else {
      setMessage('Cache local removido do DuckDB-WASM e IndexedDB.');
    }
  }, [refreshPipeCacheSummary]);

  return {
    phase,
    message,
    error,
    isInsidePipefy,
    isRootFrame,
    user,
    pipeUsers,
    cachedUsersSummary,
    pipeId,
    sdkClient,
    cacheStatus,
    dataset,
    durationMs,
    refresh,
    downloadAndSave: refresh,
    importLocalXlsx,
    switchPipefyUser,
    clearCache,
  };
}
