import { describe, expect, it } from 'vitest';
import { isLocalHostname, isLocalhostHeaders } from '@/lib/localhostGuard';

function makeHeaders(map: Record<string, string>): Pick<Headers, 'get'> {
  const normalized = new Map<string, string>(
    Object.entries(map).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    get: (name: string) => normalized.get(name.toLowerCase()) ?? null,
  };
}

describe('isLocalHostname', () => {
  it('accepts localhost, 127.0.0.1, and ::1 with or without ports', () => {
    expect(isLocalHostname('localhost')).toBe(true);
    expect(isLocalHostname('localhost:3000')).toBe(true);
    expect(isLocalHostname('LOCALHOST:3001')).toBe(true);
    expect(isLocalHostname('127.0.0.1')).toBe(true);
    expect(isLocalHostname('127.0.0.1:3000')).toBe(true);
    expect(isLocalHostname('[::1]')).toBe(true);
    expect(isLocalHostname('[::1]:3000')).toBe(true);
    expect(isLocalHostname('::1')).toBe(true);
  });

  it('rejects remote, tunneled, spoofed, and malformed hostnames', () => {
    expect(isLocalHostname(null)).toBe(false);
    expect(isLocalHostname('')).toBe(false);
    expect(isLocalHostname('pipefy-pipe-dashboard.vercel.app')).toBe(false);
    expect(isLocalHostname('demo.trycloudflare.com')).toBe(false);
    expect(isLocalHostname('localhost.evil.com')).toBe(false);
    expect(isLocalHostname('127.0.0.1.nip.io:3000')).toBe(false);
    expect(isLocalHostname('192.168.1.10:3000')).toBe(false);
    expect(isLocalHostname('localhost:abc')).toBe(false);
    expect(isLocalHostname('[::1]:abc')).toBe(false);
  });
});

describe('isLocalhostHeaders', () => {
  const localEnv = {};

  it('allows direct localhost requests when not on Vercel', () => {
    expect(isLocalhostHeaders(makeHeaders({ host: 'localhost:3000' }), localEnv)).toBe(true);
    expect(isLocalhostHeaders(makeHeaders({ host: '127.0.0.1:3000' }), localEnv)).toBe(true);
    expect(
      isLocalhostHeaders(
        makeHeaders({ host: 'localhost:3000', 'x-forwarded-host': 'localhost:3000' }),
        localEnv
      )
    ).toBe(true);
  });

  it('blocks requests with missing or non-local host / x-forwarded-host', () => {
    expect(isLocalhostHeaders(makeHeaders({}), localEnv)).toBe(false);
    expect(
      isLocalhostHeaders(makeHeaders({ host: 'pipefy-pipe-dashboard.vercel.app' }), localEnv)
    ).toBe(false);
    expect(
      isLocalhostHeaders(
        makeHeaders({ host: 'localhost:3000', 'x-forwarded-host': 'abc.trycloudflare.com' }),
        localEnv
      )
    ).toBe(false);
    expect(
      isLocalhostHeaders(
        makeHeaders({
          host: 'localhost:3000',
          'x-forwarded-host': 'localhost:3000, pipefy-pipe-dashboard.vercel.app',
        }),
        localEnv
      )
    ).toBe(false);
  });

  it('blocks requests when running in a Vercel deployment even if host header says localhost', () => {
    expect(
      isLocalhostHeaders(makeHeaders({ host: 'localhost:3000' }), {
        VERCEL: '1',
      })
    ).toBe(false);
    expect(
      isLocalhostHeaders(makeHeaders({ host: 'localhost:3000' }), {
        VERCEL_ENV: 'preview',
      })
    ).toBe(false);
  });
});
