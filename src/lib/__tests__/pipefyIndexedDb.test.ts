import { describe, expect, it } from 'vitest';
import {
  buildUserPipeCacheKey,
  estimateDatasetBytes,
} from '@/lib/pipefyIndexedDb';

describe('pipefyIndexedDb helpers', () => {
  it('isolates cache keys by userId and pipeId and trims whitespace', () => {
    const userAKey = buildUserPipeCacheKey(' 101 ', ' 307435909 ');
    const userBKey = buildUserPipeCacheKey('202', '307435909');

    expect(userAKey).toBe('101::307435909');
    expect(userBKey).toBe('202::307435909');
    expect(userAKey).not.toBe(userBKey);
  });

  it('throws when userId or pipeId is missing', () => {
    expect(() => buildUserPipeCacheKey('', '307435909')).toThrow();
    expect(() => buildUserPipeCacheKey('101', '   ')).toThrow();
  });

  it('prefers parquetBuffer byteLength when estimating dataset size', () => {
    const parquetBuffer = new Uint8Array(4096);
    expect(
      estimateDatasetBytes({
        parquetBuffer,
        rows: [{ id: '1' }],
      })
    ).toBe(4096);
  });

  it('estimates bytes from JSON rows when no parquetBuffer is present', () => {
    expect(estimateDatasetBytes({ rows: [] })).toBe(0);
    const bytes = estimateDatasetBytes({
      rows: [
        { id: '1', title: 'Card A' },
        { id: '2', title: 'Card B' },
      ],
    });
    expect(bytes).toBeGreaterThan(0);
  });
});
