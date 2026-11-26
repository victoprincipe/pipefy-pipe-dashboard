import type {
  CacheSnapshotMeta,
  NormalizedCard,
  PipeSchema,
  SyncStrategy,
} from '../types/pipefy';
import type { DashboardView } from '../types/dashboard';

const DB_NAME = 'pipefy_pipelens_cache_v1';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';
const STORE_VIEWS = 'views';

export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface CachedSnapshotRecord {
  cacheKey: string; // `${userId}::${pipeId}`
  userId: string;
  pipeId: string;
  schemaVersion: number;
  syncedAt: number;
  ttlMs: number;
  strategy: SyncStrategy;
  totalCardsInPipe: number;
  cards: NormalizedCard[];
  pipeSchema: PipeSchema;
  reportId?: string;
  lastCursor?: string | null;
  complete: boolean;
  estimatedBytes: number;
}

export interface CachedViewsRecord {
  cacheKey: string; // `${userId}::${pipeId}`
  userId: string;
  pipeId: string;
  updatedAt: number;
  activeViewId: string;
  views: DashboardView[];
}

export interface SnapshotLookupResult {
  record: CachedSnapshotRecord | null;
  meta: CacheSnapshotMeta;
}

function buildKey(userId: string, pipeId: string): string {
  const u = String(userId ?? '').trim();
  const p = String(pipeId ?? '').trim();
  if (!u || !p) {
    throw new Error('userId e pipeId são obrigatórios para acessar o cache isolado por usuário.');
  }
  return `${u}::${p}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste ambiente.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        const store = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'cacheKey' });
        store.createIndex('by_user', 'userId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_VIEWS)) {
        const store = db.createObjectStore(STORE_VIEWS, { keyPath: 'cacheKey' });
        store.createIndex('by_user', 'userId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Erro ao abrir IndexedDB.'));
  });
}

function txRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha na operação IndexedDB.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Falha na transação IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação IndexedDB abortada.'));
  });
}

export function estimateSnapshotBytes(cards: NormalizedCard[]): number {
  if (cards.length === 0) return 0;
  const sampleSize = Math.min(cards.length, 50);
  let sampleBytes = 0;
  for (let i = 0; i < sampleSize; i += 1) {
    sampleBytes += JSON.stringify(cards[i]).length;
  }
  return Math.round((sampleBytes / sampleSize) * cards.length);
}

export class UserIndexedDbCache {
  async getSnapshot(
    userId: string,
    pipeId: string,
    ttlOverrideMs?: number
  ): Promise<SnapshotLookupResult> {
    const cacheKey = buildKey(userId, pipeId);
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
      const store = tx.objectStore(STORE_SNAPSHOTS);
      const record = (await txRequest(store.get(cacheKey))) as CachedSnapshotRecord | undefined;

      if (!record || record.userId !== String(userId).trim()) {
        return {
          record: null,
          meta: {
            userId,
            pipeId,
            status: 'MISS',
            syncedAt: null,
            ttlMs: ttlOverrideMs ?? DEFAULT_CACHE_TTL_MS,
            ageMs: 0,
            strategy: null,
            cardsCount: 0,
            totalCardsInPipe: 0,
            estimatedBytes: 0,
            complete: false,
          },
        };
      }

      const effectiveTtl = ttlOverrideMs ?? record.ttlMs ?? DEFAULT_CACHE_TTL_MS;
      const ageMs = Math.max(0, Date.now() - record.syncedAt);
      const status: 'HIT' | 'STALE' = ageMs <= effectiveTtl && record.complete ? 'HIT' : 'STALE';

      return {
        record,
        meta: {
          userId: record.userId,
          pipeId: record.pipeId,
          status,
          syncedAt: record.syncedAt,
          ttlMs: effectiveTtl,
          ageMs,
          strategy: record.strategy,
          cardsCount: record.cards.length,
          totalCardsInPipe: record.totalCardsInPipe,
          estimatedBytes: record.estimatedBytes,
          reportId: record.reportId,
          complete: record.complete,
        },
      };
    } finally {
      db.close();
    }
  }

  async saveSnapshot(params: {
    userId: string;
    pipeId: string;
    cards: NormalizedCard[];
    pipeSchema: PipeSchema;
    strategy: SyncStrategy;
    totalCardsInPipe: number;
    ttlMs?: number;
    reportId?: string;
    lastCursor?: string | null;
    complete: boolean;
  }): Promise<CachedSnapshotRecord> {
    const cacheKey = buildKey(params.userId, params.pipeId);
    const estimatedBytes = estimateSnapshotBytes(params.cards);
    const record: CachedSnapshotRecord = {
      cacheKey,
      userId: String(params.userId).trim(),
      pipeId: String(params.pipeId).trim(),
      schemaVersion: 1,
      syncedAt: Date.now(),
      ttlMs: params.ttlMs ?? DEFAULT_CACHE_TTL_MS,
      strategy: params.strategy,
      totalCardsInPipe: params.totalCardsInPipe,
      cards: params.cards,
      pipeSchema: params.pipeSchema,
      reportId: params.reportId,
      lastCursor: params.lastCursor ?? null,
      complete: params.complete,
      estimatedBytes,
    };

    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
      tx.objectStore(STORE_SNAPSHOTS).put(record);
      await txDone(tx);
      return record;
    } finally {
      db.close();
    }
  }

  async patchCards(params: {
    userId: string;
    pipeId: string;
    upsertedCards?: NormalizedCard[];
    deletedIds?: string[];
    totalCardsInPipe?: number;
  }): Promise<CachedSnapshotRecord | null> {
    const lookup = await this.getSnapshot(params.userId, params.pipeId);
    if (!lookup.record) return null;

    const deletedSet = new Set((params.deletedIds ?? []).map(String));
    const upsertMap = new Map<string, NormalizedCard>();
    for (const c of params.upsertedCards ?? []) {
      upsertMap.set(String(c.id), c);
    }

    const nextCards: NormalizedCard[] = [];
    for (const existing of lookup.record.cards) {
      const id = String(existing.id);
      if (deletedSet.has(id)) continue;
      if (upsertMap.has(id)) {
        nextCards.push(upsertMap.get(id)!);
        upsertMap.delete(id);
      } else {
        nextCards.push(existing);
      }
    }
    for (const remaining of upsertMap.values()) {
      nextCards.unshift(remaining);
    }

    return this.saveSnapshot({
      userId: params.userId,
      pipeId: params.pipeId,
      cards: nextCards,
      pipeSchema: lookup.record.pipeSchema,
      strategy: lookup.record.strategy,
      totalCardsInPipe: params.totalCardsInPipe ?? nextCards.length,
      ttlMs: lookup.record.ttlMs,
      reportId: lookup.record.reportId,
      lastCursor: lookup.record.lastCursor,
      complete: lookup.record.complete,
    });
  }

  async getViews(userId: string, pipeId: string): Promise<CachedViewsRecord | null> {
    const cacheKey = buildKey(userId, pipeId);
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_VIEWS, 'readonly');
      const rec = (await txRequest(tx.objectStore(STORE_VIEWS).get(cacheKey))) as
        | CachedViewsRecord
        | undefined;
      if (!rec || rec.userId !== String(userId).trim()) return null;
      return rec;
    } finally {
      db.close();
    }
  }

  async saveViews(params: {
    userId: string;
    pipeId: string;
    activeViewId: string;
    views: DashboardView[];
  }): Promise<void> {
    const cacheKey = buildKey(params.userId, params.pipeId);
    const record: CachedViewsRecord = {
      cacheKey,
      userId: String(params.userId).trim(),
      pipeId: String(params.pipeId).trim(),
      updatedAt: Date.now(),
      activeViewId: params.activeViewId,
      views: params.views,
    };
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_VIEWS, 'readwrite');
      tx.objectStore(STORE_VIEWS).put(record);
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  /**
   * Clears ONLY entries owned by `userId` (optionally narrowed to `pipeId`).
   * Entries belonging to any other userId remain untouched.
   */
  async clearUserCache(userId: string, pipeId?: string, includeViews = false): Promise<number> {
    const cleanUser = String(userId ?? '').trim();
    if (!cleanUser) return 0;

    const db = await openDatabase();
    try {
      const stores = includeViews ? [STORE_SNAPSHOTS, STORE_VIEWS] : [STORE_SNAPSHOTS];
      const tx = db.transaction(stores, 'readwrite');
      let deleted = 0;

      for (const storeName of stores) {
        const store = tx.objectStore(storeName);
        if (pipeId) {
          const key = buildKey(cleanUser, pipeId);
          const existing = await txRequest(store.get(key));
          if (existing && existing.userId === cleanUser) {
            store.delete(key);
            deleted += 1;
          }
        } else {
          const idx = store.index('by_user');
          const allForUser = (await txRequest(idx.getAll(cleanUser))) as Array<{
            cacheKey: string;
            userId: string;
          }>;
          for (const rec of allForUser) {
            if (rec.userId === cleanUser) {
              store.delete(rec.cacheKey);
              deleted += 1;
            }
          }
        }
      }

      await txDone(tx);
      return deleted;
    } finally {
      db.close();
    }
  }

  async listUserNamespaces(userId: string): Promise<Array<{ pipeId: string; cardsCount: number; syncedAt: number; estimatedBytes: number }>> {
    const cleanUser = String(userId ?? '').trim();
    if (!cleanUser) return [];

    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
      const idx = tx.objectStore(STORE_SNAPSHOTS).index('by_user');
      const records = (await txRequest(idx.getAll(cleanUser))) as CachedSnapshotRecord[];
      return records
        .filter((r) => r.userId === cleanUser)
        .map((r) => ({
          pipeId: r.pipeId,
          cardsCount: r.cards.length,
          syncedAt: r.syncedAt,
          estimatedBytes: r.estimatedBytes,
        }));
    } finally {
      db.close();
    }
  }
}

export const userCacheDb = new UserIndexedDbCache();
