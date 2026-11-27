import { ensureDatasetIdentity } from '@/lib/datasetIdentity';
import type { CacheHitStatus, PipefySqlDataset } from '@/types/pipefySql';

const DB_NAME = 'pipefy_sql_cache_v1';
const DB_VERSION = 2;
const STORE_DATASETS = 'datasets';

export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

export function buildUserPipeCacheKey(userId: string, pipeId: string): string {
  const u = String(userId ?? '').trim();
  const p = String(pipeId ?? '').trim();
  if (!u || !p) {
    throw new Error('userId e pipeId são obrigatórios para isolar o cache no IndexedDB.');
  }
  return `${u}::${p}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DATASETS)) {
        const store = db.createObjectStore(STORE_DATASETS, { keyPath: 'cacheKey' });
        store.createIndex('by_user', 'userId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Erro ao abrir IndexedDB.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha na transação IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação IndexedDB abortada.'));
  });
}

export function estimateDatasetBytes(
  dataset: Pick<PipefySqlDataset, 'rows' | 'parquetBuffer'>
): number {
  if (dataset.parquetBuffer && dataset.parquetBuffer.byteLength > 0) {
    return dataset.parquetBuffer.byteLength;
  }
  const { rows } = dataset;
  if (!rows || rows.length === 0) return 0;
  const sampleSize = Math.min(rows.length, 40);
  let sampleBytes = 0;
  for (let i = 0; i < sampleSize; i += 1) {
    sampleBytes += JSON.stringify(rows[i]).length;
  }
  return Math.round((sampleBytes / sampleSize) * rows.length);
}

export async function getCachedSqlDataset(
  userId: string,
  pipeId: string,
  ttlOverrideMs?: number
): Promise<{ dataset: PipefySqlDataset | null; status: CacheHitStatus }> {
  const cacheKey = buildUserPipeCacheKey(userId, pipeId);
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_DATASETS, 'readonly');
    const record = await new Promise<PipefySqlDataset | undefined>((resolve, reject) => {
      const req = tx.objectStore(STORE_DATASETS).get(cacheKey);
      req.onsuccess = () => resolve(req.result as PipefySqlDataset | undefined);
      req.onerror = () => reject(req.error ?? new Error('Erro ao ler cache do IndexedDB.'));
    });

    if (!record || record.userId !== String(userId).trim()) {
      return { dataset: null, status: 'MISS' };
    }

    const ttl = ttlOverrideMs ?? record.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    const ageMs = Math.max(0, Date.now() - record.syncedAt);
    const status: CacheHitStatus = ageMs <= ttl ? 'HIT' : 'STALE';
    return { dataset: ensureDatasetIdentity(record), status };
  } finally {
    db.close();
  }
}

export async function saveSqlDataset(
  dataset: Omit<PipefySqlDataset, 'cacheKey' | 'estimatedBytes'>
): Promise<PipefySqlDataset> {
  const cacheKey = buildUserPipeCacheKey(dataset.userId, dataset.pipeId);
  const estimatedBytes = estimateDatasetBytes(dataset);
  const record: PipefySqlDataset = ensureDatasetIdentity({
    ...dataset,
    cacheKey,
    userId: String(dataset.userId).trim(),
    pipeId: String(dataset.pipeId).trim(),
    parquetBytes: dataset.parquetBuffer?.byteLength ?? dataset.parquetBytes,
    estimatedBytes,
  });

  const db = await openDb();
  try {
    const tx = db.transaction(STORE_DATASETS, 'readwrite');
    tx.objectStore(STORE_DATASETS).put(record);
    await txDone(tx);
    return record;
  } finally {
    db.close();
  }
}

export interface CachedUserDatasetSummary {
  userId: string;
  pipeName: string;
  rowsCount: number;
  estimatedBytes: number;
  syncedAt: number;
}

export async function listCachedUsersForPipe(
  pipeId: string
): Promise<Record<string, CachedUserDatasetSummary>> {
  const cleanPipeId = String(pipeId ?? '').trim();
  if (!cleanPipeId || typeof indexedDB === 'undefined') {
    return {};
  }

  const db = await openDb();
  try {
    const tx = db.transaction(STORE_DATASETS, 'readonly');
    const records = await new Promise<PipefySqlDataset[]>((resolve, reject) => {
      const req = tx.objectStore(STORE_DATASETS).getAll();
      req.onsuccess = () => resolve((req.result as PipefySqlDataset[] | undefined) ?? []);
      req.onerror = () => reject(req.error ?? new Error('Erro ao listar caches do IndexedDB.'));
    });

    const summaries: Record<string, CachedUserDatasetSummary> = {};
    for (const record of records) {
      if (record.pipeId !== cleanPipeId || !record.userId) continue;
      summaries[record.userId] = {
        userId: record.userId,
        pipeName: record.pipeName,
        rowsCount: record.rowsCount,
        estimatedBytes: record.estimatedBytes,
        syncedAt: record.syncedAt,
      };
    }
    return summaries;
  } finally {
    db.close();
  }
}

export async function clearUserSqlDataset(userId: string, pipeId: string): Promise<void> {
  const cacheKey = buildUserPipeCacheKey(userId, pipeId);
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_DATASETS, 'readwrite');
    const store = tx.objectStore(STORE_DATASETS);
    const existing = await new Promise<PipefySqlDataset | undefined>((resolve, reject) => {
      const req = store.get(cacheKey);
      req.onsuccess = () => resolve(req.result as PipefySqlDataset | undefined);
      req.onerror = () => reject(req.error ?? new Error('Erro ao verificar chave no IndexedDB.'));
    });
    if (existing && existing.userId === String(userId).trim()) {
      store.delete(cacheKey);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}
