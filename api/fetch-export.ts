import { UserScopedMemoryCache, validateExportUrl } from '../server/userCache.mjs';

const MAX_EXPORT_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

const globalForCache = globalThis as typeof globalThis & {
  __pipeLensUserCache?: UserScopedMemoryCache;
};

const userCache =
  globalForCache.__pipeLensUserCache ??
  new UserScopedMemoryCache({
    maxEntries: 24,
    ttlMs: 10 * 60 * 1000,
  });

globalForCache.__pipeLensUserCache = userCache;

function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pipefy-User-Id, X-Pipefy-Pipe-Id');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-PipeLens-Server-Cache, X-PipeLens-Cache-Owner, X-PipeLens-Bytes'
  );
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const userId = String(req.headers['x-pipefy-user-id'] ?? '').trim();
  if (!userId) {
    return res
      .status(400)
      .json({ error: 'Cabeçalho X-Pipefy-User-Id é obrigatório para isolamento de cache.' });
  }

  if (req.method === 'DELETE') {
    const removed = userCache.clearUser(userId);
    return res.status(200).json({ ok: true, userId, removed });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, userId, ...userCache.statsForUser(userId) });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const fileUrl = String(body.fileUrl ?? '').trim();
  const pipeId = String(body.pipeId ?? req.headers['x-pipefy-pipe-id'] ?? '').trim();
  const exportId = String(body.exportId ?? fileUrl).trim();

  if (!fileUrl || !pipeId) {
    return res.status(400).json({ error: 'Parâmetros fileUrl e pipeId são obrigatórios.' });
  }

  try {
    validateExportUrl(fileUrl);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'URL inválida.' });
  }

  const cached = userCache.get(userId, pipeId, exportId);
  if (cached) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-PipeLens-Server-Cache', 'HIT');
    res.setHeader('X-PipeLens-Cache-Owner', `user:${userId}`);
    res.setHeader('X-PipeLens-Bytes', String(cached.buffer.byteLength));
    return res.status(200).send(Buffer.from(cached.buffer));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(fileUrl, { signal: controller.signal });
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `Falha ao baixar relatório do Pipefy (HTTP ${upstream.status}).` });
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > MAX_EXPORT_BYTES) {
      return res.status(413).json({ error: 'Arquivo de exportação excede o limite de 25 MB.' });
    }

    const arrayBuf = await upstream.arrayBuffer();
    if (arrayBuf.byteLength > MAX_EXPORT_BYTES) {
      return res.status(413).json({ error: 'Arquivo de exportação excede o limite de 25 MB.' });
    }

    const bytes = new Uint8Array(arrayBuf);
    if (bytes.byteLength <= 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return res
        .status(502)
        .json({ error: 'Arquivo de exportação ainda em processamento no storage.' });
    }
    userCache.set(userId, pipeId, exportId, bytes, { fileUrl });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-PipeLens-Server-Cache', 'MISS');
    res.setHeader('X-PipeLens-Cache-Owner', `user:${userId}`);
    res.setHeader('X-PipeLens-Bytes', String(bytes.byteLength));
    return res.status(200).send(Buffer.from(bytes));
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'Erro ao buscar exportação remota.',
    });
  } finally {
    clearTimeout(timer);
  }
}
