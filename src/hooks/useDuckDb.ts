'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dropDuckDbTable,
  ingestRowsIntoDuckDb,
  initDuckDb,
  loadParquetIntoDuckDb,
  queryDuckDb,
} from '@/lib/pipefyDuckDb';
import type { DuckDbQueryResult, SqlColumnDef, SqlRow } from '@/types/pipefySql';

export interface UseDuckDbQueryOptions {
  enabled?: boolean;
  depsKey?: string;
}

interface DeclarativeQueryState<T extends Record<string, unknown>> {
  key: string;
  data: DuckDbQueryResult<T> | null;
  error: string | null;
}

const EMPTY_ROWS: Record<string, unknown>[] = [];
const EMPTY_COLUMNS: string[] = [];

/**
 * Imperative hook for managing the browser DuckDB-WASM engine: warming up the session,
 * running ad-hoc analytical SQL queries, ingesting rows, loading Parquet buffers, and dropping tables.
 */
export function useDuckDb() {
  const [isReady, setIsReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DuckDbQueryResult | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const requestIdRef = useRef(0);

  const warmUp = useCallback(async () => {
    setError(null);
    try {
      await initDuckDb();
      setIsReady(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const runQuery = useCallback(
    async <T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string
    ): Promise<DuckDbQueryResult<T>> => {
      const reqId = ++requestIdRef.current;
      setIsRunning(true);
      setError(null);

      try {
        const result = await queryDuckDb<T>(sql);
        if (reqId === requestIdRef.current) {
          setIsReady(true);
          setLastResult(result);
          setDurationMs(result.durationMs);
        }
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (reqId === requestIdRef.current) {
          setError(msg);
        }
        throw err;
      } finally {
        if (reqId === requestIdRef.current) {
          setIsRunning(false);
        }
      }
    },
    []
  );

  const loadParquet = useCallback(
    async (params: { tableName: string; parquetBuffer: Uint8Array }) => {
      setIsRunning(true);
      setError(null);
      try {
        const res = await loadParquetIntoDuckDb(params);
        setIsReady(true);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  const ingestRows = useCallback(
    async (params: {
      tableName: string;
      columns: SqlColumnDef[];
      rows: SqlRow[];
      createTableSql: string;
    }) => {
      setIsRunning(true);
      setError(null);
      try {
        const res = await ingestRowsIntoDuckDb(params);
        setIsReady(true);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  const dropTable = useCallback(async (tableName: string) => {
    await dropDuckDbTable(tableName);
  }, []);

  const clearResult = useCallback(() => {
    setLastResult(null);
    setError(null);
    setDurationMs(null);
  }, []);

  return {
    isReady,
    isRunning,
    error,
    lastResult,
    durationMs,
    warmUp,
    runQuery,
    loadParquet,
    ingestRows,
    dropTable,
    clearResult,
  };
}

/**
 * Declarative React hook that automatically executes a SQL query against DuckDB-WASM
 * whenever `sql` or `depsKey` changes and returns reactive rows, timing, loading, and error states.
 */
export function useDuckDbQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
>(sql: string | null, options: UseDuckDbQueryOptions = {}) {
  const { enabled = true, depsKey = '' } = options;
  const [refreshTick, setRefreshTick] = useState(0);
  const [queryState, setQueryState] = useState<DeclarativeQueryState<T> | null>(null);

  const normalizedSql = sql?.trim() ?? '';
  const activeKey =
    enabled && normalizedSql ? `${depsKey}\u0000${refreshTick}\u0000${normalizedSql}` : null;

  useEffect(() => {
    if (!activeKey || !normalizedSql) return;

    let cancelled = false;
    void (async () => {
      try {
        const data = await queryDuckDb<T>(normalizedSql);
        if (cancelled) return;
        setQueryState({ key: activeKey, data, error: null });
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setQueryState({ key: activeKey, data: null, error: message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeKey, normalizedSql]);

  const refetch = useCallback(() => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  const matched = activeKey && queryState?.key === activeKey ? queryState : null;
  const loading = activeKey !== null && matched === null;
  const data = matched?.data ?? null;

  return {
    data,
    rows: (data?.rows ?? EMPTY_ROWS) as T[],
    columns: data?.columns ?? EMPTY_COLUMNS,
    rowCount: data?.rowCount ?? 0,
    durationMs: data?.durationMs ?? null,
    loading,
    error: matched?.error ?? null,
    refetch,
  };
}
