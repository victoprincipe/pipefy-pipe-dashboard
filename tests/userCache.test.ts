import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { UserIndexedDbCache } from '../src/cache/userIndexedDb';
import { generateDemoDataset } from '../src/utils/demoDataset';
import { UserScopedMemoryCache, validateExportUrl } from '../server/userCache.mjs';

describe('Per-User Cache Isolation (IndexedDB + Server Memory LRU)', () => {
  it('isolates IndexedDB snapshots and views strictly between User A and User B', async () => {
    const cache = new UserIndexedDbCache();
    const { cards, schema } = generateDemoDataset(50);

    await cache.saveSnapshot({
      userId: 'user-A',
      pipeId: '307435909',
      cards,
      pipeSchema: schema,
      strategy: 'bulk_report',
      totalCardsInPipe: 50,
      ttlMs: 60_000,
      complete: true,
    });

    // User A gets HIT
    const lookupA = await cache.getSnapshot('user-A', '307435909');
    expect(lookupA.meta.status).toBe('HIT');
    expect(lookupA.record?.cards.length).toBe(50);

    // User B gets MISS for the exact same pipe
    const lookupB = await cache.getSnapshot('user-B', '307435909');
    expect(lookupB.meta.status).toBe('MISS');
    expect(lookupB.record).toBeNull();

    // Save separate snapshot for User B
    await cache.saveSnapshot({
      userId: 'user-B',
      pipeId: '307435909',
      cards: cards.slice(0, 10),
      pipeSchema: schema,
      strategy: 'cursor_pagination',
      totalCardsInPipe: 10,
      ttlMs: 60_000,
      complete: true,
    });

    // Clearing User A's cache MUST NOT touch User B's cache
    await cache.clearUserCache('user-A', '307435909');
    const afterClearA = await cache.getSnapshot('user-A', '307435909');
    const afterClearB = await cache.getSnapshot('user-B', '307435909');
    expect(afterClearA.meta.status).toBe('MISS');
    expect(afterClearB.meta.status).toBe('HIT');
    expect(afterClearB.record?.cards.length).toBe(10);
  });

  it('marks expired snapshots as STALE rather than deleting data', async () => {
    const cache = new UserIndexedDbCache();
    const { cards, schema } = generateDemoDataset(10);
    await cache.saveSnapshot({
      userId: 'user-stale',
      pipeId: '307435909',
      cards,
      pipeSchema: schema,
      strategy: 'bulk_report',
      totalCardsInPipe: 10,
      ttlMs: 10,
      complete: true,
    });
    await new Promise((r) => setTimeout(r, 25));
    const lookup = await cache.getSnapshot('user-stale', '307435909', 10);
    expect(lookup.meta.status).toBe('STALE');
    expect(lookup.record?.cards.length).toBe(10);
  });

  it('isolates server-side LRU memory cache by userId and rejects SSRF hosts', () => {
    const mem = new UserScopedMemoryCache({ maxEntries: 5, ttlMs: 60_000 });
    const bufA = new Uint8Array([1, 2, 3]);
    const bufB = new Uint8Array([9, 8]);

    mem.set('u1', '307435909', 'exp-1', bufA);
    expect(mem.get('u2', '307435909', 'exp-1')).toBeNull();
    expect(mem.get('u1', '307435909', 'exp-1')?.buffer).toEqual(bufA);

    mem.set('u2', '307435909', 'exp-1', bufB);
    mem.clearUser('u1');
    expect(mem.get('u1', '307435909', 'exp-1')).toBeNull();
    expect(mem.get('u2', '307435909', 'exp-1')?.buffer).toEqual(bufB);

    expect(() => validateExportUrl('https://pipefy-prod.s3.amazonaws.com/export.xlsx')).not.toThrow();
    expect(() => validateExportUrl('http://169.254.169.254/latest/meta-data')).toThrow();
    expect(() => validateExportUrl('https://evil.example.com/file.xlsx')).toThrow();
  });
});
