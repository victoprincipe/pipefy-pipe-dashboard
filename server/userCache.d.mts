export class UserScopedMemoryCache {
  constructor(options?: { maxEntries?: number; ttlMs?: number });
  static buildKey(userId: string, pipeId: string, key: string): string;
  get(
    userId: string,
    pipeId: string,
    key: string
  ): {
    userId: string;
    pipeId: string;
    key: string;
    buffer: Uint8Array;
    meta: Record<string, unknown>;
    createdAt: number;
    expiresAt: number;
  } | null;
  set(
    userId: string,
    pipeId: string,
    key: string,
    buffer: Uint8Array,
    meta?: Record<string, unknown>
  ): unknown;
  clearUser(userId: string): number;
  statsForUser(userId: string): {
    entries: number;
    totalBytes: number;
    items: Array<{ pipeId: string; key: string; bytes: number; createdAt: number; expiresAt: number }>;
  };
}

export const ALLOWED_EXPORT_HOST_SUFFIXES: string[];
export function validateExportUrl(rawUrl: string): URL;
