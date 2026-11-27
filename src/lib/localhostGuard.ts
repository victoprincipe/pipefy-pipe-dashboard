const ALLOWED_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Extracts and validates whether a Host / X-Forwarded-Host token points to
 * loopback (`localhost`, `127.0.0.1`, or `::1`).
 */
export function isLocalHostname(rawHost: string | null | undefined): boolean {
  if (!rawHost) return false;
  const trimmed = rawHost.trim().toLowerCase();
  if (!trimmed) return false;

  let hostname = trimmed;
  if (trimmed.startsWith('[')) {
    const endBracket = trimmed.indexOf(']');
    if (endBracket === -1) return false;
    const afterBracket = trimmed.slice(endBracket + 1);
    if (afterBracket && !/^:\d+$/.test(afterBracket)) return false;
    hostname = trimmed.slice(1, endBracket);
  } else if (trimmed === '::1') {
    hostname = '::1';
  } else {
    const firstColon = trimmed.indexOf(':');
    const lastColon = trimmed.lastIndexOf(':');
    if (firstColon !== -1 && firstColon !== lastColon) {
      // Unbracketed multi-colon IPv6 other than `::1` is not allowed.
      return false;
    }
    if (firstColon !== -1) {
      const portPart = trimmed.slice(firstColon + 1);
      if (!/^\d+$/.test(portPart)) return false;
      hostname = trimmed.slice(0, firstColon);
    }
  }

  return ALLOWED_LOCAL_HOSTS.has(hostname);
}

/**
 * Verifies that an incoming request originates strictly from localhost and is
 * not running inside a hosted Vercel deployment or tunneled via forwarded host.
 */
export function isLocalhostHeaders(
  headerList: Pick<Headers, 'get'>,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.VERCEL === '1' || Boolean(env.VERCEL_ENV)) {
    return false;
  }

  const host = headerList.get('host');
  if (!isLocalHostname(host)) {
    return false;
  }

  const forwardedHost = headerList.get('x-forwarded-host');
  if (forwardedHost) {
    const entries = forwardedHost
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (entries.length === 0 || !entries.every((entry) => isLocalHostname(entry))) {
      return false;
    }
  }

  return true;
}
