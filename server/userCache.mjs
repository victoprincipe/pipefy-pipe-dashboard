/**
 * Per-user in-memory LRU cache with TTL isolation.
 * Composite key is strictly scoped to `${userId}::${pipeId}::${key}`,
 * guaranteeing that User A never reads or invalidates User B's cached payload.
 */
export class UserScopedMemoryCache {
  /**
   * @param {{ maxEntries?: number, ttlMs?: number }} [options]
   */
  constructor(options = {}) {
    this.maxEntries = options.maxEntries ?? 20;
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    /** @type {Map<string, { userId: string, pipeId: string, key: string, buffer: Uint8Array, meta: Record<string, unknown>, createdAt: number, expiresAt: number }>} */
    this.store = new Map();
  }

  /**
   * @param {string} userId
   * @param {string} pipeId
   * @param {string} key
   */
  static buildKey(userId, pipeId, key) {
    const cleanUser = String(userId ?? '').trim();
    const cleanPipe = String(pipeId ?? '').trim();
    const cleanKey = String(key ?? '').trim();
    if (!cleanUser) {
      throw new Error('userId is required for user-scoped cache isolation.');
    }
    if (!cleanPipe || !cleanKey) {
      throw new Error('pipeId and key are required for cache lookup.');
    }
    return `${cleanUser}::${cleanPipe}::${cleanKey}`;
  }

  /**
   * @param {string} userId
   * @param {string} pipeId
   * @param {string} key
   */
  get(userId, pipeId, key) {
    const composite = UserScopedMemoryCache.buildKey(userId, pipeId, key);
    const entry = this.store.get(composite);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt || entry.userId !== String(userId).trim()) {
      this.store.delete(composite);
      return null;
    }

    // Refresh LRU order
    this.store.delete(composite);
    this.store.set(composite, entry);
    return entry;
  }

  /**
   * @param {string} userId
   * @param {string} pipeId
   * @param {string} key
   * @param {Uint8Array} buffer
   * @param {Record<string, unknown>} [meta]
   */
  set(userId, pipeId, key, buffer, meta = {}) {
    const composite = UserScopedMemoryCache.buildKey(userId, pipeId, key);
    const now = Date.now();

    if (this.store.has(composite)) {
      this.store.delete(composite);
    }
    while (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }

    const entry = {
      userId: String(userId).trim(),
      pipeId: String(pipeId).trim(),
      key: String(key).trim(),
      buffer,
      meta,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.store.set(composite, entry);
    return entry;
  }

  /**
   * Clears ONLY cache entries belonging to the given userId.
   * @param {string} userId
   */
  clearUser(userId) {
    const cleanUser = String(userId ?? '').trim();
    if (!cleanUser) return 0;

    let removed = 0;
    for (const [k, v] of this.store.entries()) {
      if (v.userId === cleanUser) {
        this.store.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Returns metadata summary scoped exclusively to `userId`.
   * @param {string} userId
   */
  statsForUser(userId) {
    const cleanUser = String(userId ?? '').trim();
    if (!cleanUser) return { entries: 0, totalBytes: 0, items: [] };

    const now = Date.now();
    const items = [];
    let totalBytes = 0;

    for (const [k, v] of this.store.entries()) {
      if (v.userId !== cleanUser) continue;
      if (now > v.expiresAt) {
        this.store.delete(k);
        continue;
      }
      totalBytes += v.buffer.byteLength;
      items.push({
        pipeId: v.pipeId,
        key: v.key,
        bytes: v.buffer.byteLength,
        createdAt: v.createdAt,
        expiresAt: v.expiresAt,
      });
    }

    return { entries: items.length, totalBytes, items };
  }
}

export const ALLOWED_EXPORT_HOST_SUFFIXES = [
  '.amazonaws.com',
  '.pipefy.com',
  '.staticpipefy.com',
  '.storage.googleapis.com',
];

/**
 * Validates that an export URL points strictly to HTTPS and a trusted Pipefy/S3/GCS host
 * to prevent SSRF abuse on the export proxy endpoint.
 * @param {string} rawUrl
 */
export function validateExportUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL de exportação inválida.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Apenas URLs HTTPS são permitidas para download de relatórios.');
  }

  const host = parsed.hostname.toLowerCase();
  const isAllowed = ALLOWED_EXPORT_HOST_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
  );
  if (!isAllowed) {
    throw new Error(`Host não autorizado para download de exportação: ${host}`);
  }
  return parsed;
}
