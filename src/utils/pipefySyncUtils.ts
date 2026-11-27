import { ingestRowsIntoDuckDb, loadParquetIntoDuckDb } from '@/lib/pipefyDuckDb';
import { downloadPipeXlsxDirect, type PipefySdkClient } from '@/lib/pipefyExportClient';
import { getCachedSqlDataset, saveSqlDataset } from '@/lib/pipefyIndexedDb';
import {
  buildPipeDatasetId,
  ensureDatasetIdentity,
  stripFileExtension,
} from '@/lib/datasetIdentity';
import type {
  CacheHitStatus,
  PipefySqlDataset,
  PipefySyncPhase,
  PipefyUserInfo,
} from '@/types/pipefySql';
import { parseXlsxInWorker } from '@/utils/xlsxWorkerUtils';

export const LOCAL_TEST_USER: PipefyUserInfo = {
  id: 'local-dev',
  name: 'Teste Local',
};

export const LOCAL_TEST_PIPE_ID = 'local_xlsx';
export const LOCAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SyncPipefySqlParams {
  client: PipefySdkClient;
  user: PipefyUserInfo;
  pipeId: string;
  ttlMs: number;
  forceDownload?: boolean;
  signal?: AbortSignal;
  onStatus?: (phase: PipefySyncPhase, message: string) => void;
  onStaleCache?: (dataset: PipefySqlDataset, status: CacheHitStatus) => void;
}

export interface SyncPipefySqlResult {
  dataset: PipefySqlDataset;
  cacheStatus: CacheHitStatus;
  durationMs: number;
  message: string;
}

/**
 * Returns true when an error represents a cancelled fetch/sync operation.
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Extracts a human-readable message from an unknown thrown value.
 */
export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function hydrateCachedParquetDataset(params: {
  cached: PipefySqlDataset;
  cacheStatus?: CacheHitStatus;
  startedAt: number;
  signal?: AbortSignal;
  hitMessage: string;
}): Promise<SyncPipefySqlResult | null> {
  const { cached, cacheStatus = 'HIT', startedAt, signal, hitMessage } = params;

  if (cached.parquetBuffer && cached.parquetBuffer.byteLength > 0) {
    await loadParquetIntoDuckDb({
      tableName: cached.tableName,
      parquetBuffer: cached.parquetBuffer,
    });
    if (signal?.aborted) return null;

    return {
      dataset: cached,
      cacheStatus,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      message: hitMessage,
    };
  }

  // Upgrade legacy JSON-row cache entry to a compact Parquet snapshot.
  const { parquetBuffer } = await ingestRowsIntoDuckDb({
    tableName: cached.tableName,
    columns: cached.columns,
    rows: cached.rows ?? [],
    createTableSql: cached.createTableSql,
  });
  if (signal?.aborted) return null;

  const upgraded = await saveSqlDataset({
    ...ensureDatasetIdentity(cached),
    userId: cached.userId,
    pipeId: cached.pipeId,
    pipeName: cached.pipeName,
    tableName: cached.tableName,
    columns: cached.columns,
    parquetBuffer,
    createTableSql: cached.createTableSql,
    rowsCount: cached.rowsCount,
    syncedAt: cached.syncedAt,
    ttlMs: cached.ttlMs,
    reportId: cached.reportId,
    exportId: cached.exportId,
  });
  if (signal?.aborted) return null;

  return {
    dataset: upgraded,
    cacheStatus,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    message: `${upgraded.rowsCount.toLocaleString('pt-BR')} registros migrados para Parquet e carregados no DuckDB-WASM.`,
  };
}

/**
 * Restores a previously imported local `.xlsx` Parquet snapshot from IndexedDB
 * into DuckDB-WASM during standalone local testing.
 */
export async function restoreCachedLocalSqlDataset(params: {
  signal?: AbortSignal;
  onStatus?: (phase: PipefySyncPhase, message: string) => void;
}): Promise<SyncPipefySqlResult | null> {
  const { signal, onStatus } = params;
  const t0 = performance.now();

  const cached = await getCachedSqlDataset(
    LOCAL_TEST_USER.id,
    LOCAL_TEST_PIPE_ID,
    LOCAL_CACHE_TTL_MS
  );
  if (!cached.dataset || signal?.aborted) return null;

  onStatus?.('loading_duckdb', 'Restaurando .xlsx local do IndexedDB no DuckDB-WASM...');
  return hydrateCachedParquetDataset({
    cached: cached.dataset,
    startedAt: t0,
    signal,
    hitMessage: `${cached.dataset.rowsCount.toLocaleString('pt-BR')} registros locais restaurados do IndexedDB no DuckDB-WASM.`,
  });
}

/**
 * Restores a Pipefy user's cached Parquet snapshot from IndexedDB into DuckDB-WASM
 * when switching between Pipefy members inside the Pipe.
 */
export async function restoreCachedPipefyUserDataset(params: {
  user: PipefyUserInfo;
  pipeId: string;
  ttlMs: number;
  signal?: AbortSignal;
  onStatus?: (phase: PipefySyncPhase, message: string) => void;
}): Promise<SyncPipefySqlResult | null> {
  const { user, pipeId, ttlMs, signal, onStatus } = params;
  const t0 = performance.now();

  const cached = await getCachedSqlDataset(user.id, pipeId, ttlMs);
  if (!cached.dataset || signal?.aborted) return null;

  onStatus?.(
    'loading_duckdb',
    `Carregando snapshot Parquet de ${user.name} no DuckDB-WASM...`
  );
  const hitMessage =
    cached.status === 'STALE'
      ? `${cached.dataset.rowsCount.toLocaleString('pt-BR')} registros expirados (STALE) de ${user.name} restaurados no DuckDB-WASM. Clique em "Atualizar dados" para sincronizar.`
      : `${cached.dataset.rowsCount.toLocaleString('pt-BR')} registros de ${user.name} carregados no DuckDB-WASM (cache Parquet).`;

  return hydrateCachedParquetDataset({
    cached: cached.dataset,
    cacheStatus: cached.status,
    startedAt: t0,
    signal,
    hitMessage,
  });
}

/**
 * Imports a user-selected local tabular file (`.xlsx`, `.xls` or `.csv`) through the
 * Web Worker -> DuckDB-WASM -> Parquet IndexedDB pipeline for local testing outside Pipefy.
 */
export async function importLocalDataFile(params: {
  file: File;
  sheetName?: string;
  signal?: AbortSignal;
  onStatus?: (phase: PipefySyncPhase, message: string) => void;
}): Promise<SyncPipefySqlResult | null> {
  const { file, sheetName, signal, onStatus } = params;
  if (file.size <= 0) {
    throw new Error('O arquivo selecionado está vazio.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const format = extension === 'csv' ? 'csv' : 'xlsx';

  const t0 = performance.now();
  const buffer = await file.arrayBuffer();
  if (signal?.aborted) return null;

  const pipeName = stripFileExtension(file.name) || 'Arquivo Local';

  onStatus?.(
    'converting',
    `Convertendo ${file.name} (${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB) para formato SQL...`
  );
  const parsed = await parseXlsxInWorker({
    buffer,
    pipeId: LOCAL_TEST_PIPE_ID,
    pipeName,
    datasetName: pipeName,
    source: 'file',
    sheetName: format === 'csv' ? undefined : sheetName,
    format,
  });
  if (signal?.aborted) return null;

  onStatus?.('loading_duckdb', 'Carregando tabela no DuckDB-WASM e gerando Parquet...');
  const { parquetBuffer } = await ingestRowsIntoDuckDb({
    tableName: parsed.tableName,
    columns: parsed.columns,
    rows: parsed.rows,
    createTableSql: parsed.createTableSql,
  });
  if (signal?.aborted) return null;

  onStatus?.(
    'saving_cache',
    `Salvando snapshot Parquet (${parsed.rows.length.toLocaleString('pt-BR')} linhas) no IndexedDB...`
  );
  const saved = await saveSqlDataset({
    userId: LOCAL_TEST_USER.id,
    pipeId: LOCAL_TEST_PIPE_ID,
    pipeName,
    tableName: parsed.tableName,
    columns: parsed.columns,
    parquetBuffer,
    createTableSql: parsed.createTableSql,
    rowsCount: parsed.rows.length,
    syncedAt: Date.now(),
    ttlMs: LOCAL_CACHE_TTL_MS,
    datasetId: parsed.datasetId,
    name: parsed.name,
    source: 'file',
    sheetName: parsed.sheetName,
    schemaFingerprint: parsed.schemaFingerprint,
  });
  if (signal?.aborted) return null;

  return {
    dataset: saved,
    cacheStatus: 'HIT',
    durationMs: Math.round((performance.now() - t0) * 10) / 10,
    message: `${saved.rowsCount.toLocaleString('pt-BR')} linhas de "${file.name}"${
      parsed.sheetName && format !== 'csv' ? ` (aba ${parsed.sheetName})` : ''
    } carregadas no DuckDB-WASM e salvas em Parquet no IndexedDB.`,
  };
}

/** @deprecated use importLocalDataFile */
export const importLocalXlsxFile = importLocalDataFile;

/**
 * Executes the full Pipefy `.xlsx` -> SQL -> DuckDB-WASM -> Parquet IndexedDB sync pipeline
 * for a user and pipe, serving fresh cached Parquet snapshots unless stale or bypassed.
 */
export async function syncPipefySqlDataset(
  params: SyncPipefySqlParams
): Promise<SyncPipefySqlResult | null> {
  const {
    client,
    user,
    pipeId,
    ttlMs,
    forceDownload = false,
    signal,
    onStatus,
    onStaleCache,
  } = params;

  const t0 = performance.now();

  if (!forceDownload) {
    onStatus?.('checking_cache', 'Verificando cache Parquet no IndexedDB...');
    const cached = await getCachedSqlDataset(user.id, pipeId, ttlMs);
    if (signal?.aborted) return null;

    if (cached.dataset) {
      if (cached.status === 'HIT') {
        onStatus?.('loading_duckdb', 'Carregando snapshot Parquet no DuckDB-WASM...');
        return hydrateCachedParquetDataset({
          cached: cached.dataset,
          startedAt: t0,
          signal,
          hitMessage: `${cached.dataset.rowsCount.toLocaleString('pt-BR')} registros de ${user.name} carregados no DuckDB-WASM (cache Parquet).`,
        });
      }

      if (cached.dataset.parquetBuffer && cached.dataset.parquetBuffer.byteLength > 0) {
        await loadParquetIntoDuckDb({
          tableName: cached.dataset.tableName,
          parquetBuffer: cached.dataset.parquetBuffer,
        }).catch(() => {});
        if (signal?.aborted) return null;
      }
      onStaleCache?.(cached.dataset, cached.status);
    }
  }

  const downloaded = await downloadPipeXlsxDirect({
    client,
    pipeId,
    signal,
    onStatus: (nextPhase, nextMsg) => {
      if (!signal?.aborted) {
        onStatus?.(nextPhase, nextMsg);
      }
    },
  });
  if (signal?.aborted) return null;

  onStatus?.(
    'converting',
    `Convertendo ${(downloaded.buffer.byteLength / (1024 * 1024)).toFixed(2)} MB (.xlsx) para formato SQL...`
  );
  const parsed = await parseXlsxInWorker({
    buffer: downloaded.buffer,
    pipeId: downloaded.meta.pipeId,
    pipeName: downloaded.meta.name,
    fieldHints: downloaded.meta.fieldHints,
    datasetName: downloaded.meta.name,
    source: 'pipefy',
    datasetId: buildPipeDatasetId(downloaded.meta.pipeId),
  });
  if (signal?.aborted) return null;

  onStatus?.('loading_duckdb', 'Carregando tabela no DuckDB-WASM e gerando Parquet...');
  const { parquetBuffer } = await ingestRowsIntoDuckDb({
    tableName: parsed.tableName,
    columns: parsed.columns,
    rows: parsed.rows,
    createTableSql: parsed.createTableSql,
  });
  if (signal?.aborted) return null;

  onStatus?.(
    'saving_cache',
    `Salvando snapshot Parquet (${parsed.rows.length.toLocaleString('pt-BR')} linhas) no IndexedDB...`
  );
  const saved = await saveSqlDataset({
    userId: user.id,
    pipeId: downloaded.meta.pipeId,
    pipeName: downloaded.meta.name,
    tableName: parsed.tableName,
    columns: parsed.columns,
    parquetBuffer,
    createTableSql: parsed.createTableSql,
    rowsCount: parsed.rows.length,
    syncedAt: Date.now(),
    ttlMs,
    reportId: downloaded.reportId,
    exportId: downloaded.exportId,
    datasetId: parsed.datasetId,
    name: parsed.name,
    source: 'pipefy',
    sheetName: parsed.sheetName,
    schemaFingerprint: parsed.schemaFingerprint,
  });
  if (signal?.aborted) return null;

  return {
    dataset: saved,
    cacheStatus: 'HIT',
    durationMs: Math.round((performance.now() - t0) * 10) / 10,
    message: `${saved.rowsCount.toLocaleString('pt-BR')} linhas de ${user.name} carregadas no DuckDB-WASM e salvas em Parquet no IndexedDB.`,
  };
}
