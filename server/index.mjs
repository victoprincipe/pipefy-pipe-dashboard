import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserScopedMemoryCache, validateExportUrl } from './userCache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const MAX_EXPORT_BYTES = 25 * 1024 * 1024; // 25 MB safety limit
const FETCH_TIMEOUT_MS = 25_000;

const memoryCache = new UserScopedMemoryCache({
  maxEntries: 24,
  ttlMs: 10 * 60 * 1000,
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function applyCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Pipefy-User-Id, X-Pipefy-Pipe-Id');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-PipeLens-Server-Cache, X-PipeLens-Cache-Owner, X-PipeLens-Bytes'
  );
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors https://app.pipefy.com https://*.pipefy.com 'self'"
  );
}

function sendJson(res, status, payload) {
  applyCommonHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 64) {
      throw new Error('Request body muito grande.');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function handleFetchExport(req, res) {
  const userId = String(req.headers['x-pipefy-user-id'] ?? '').trim();
  if (!userId) {
    return sendJson(res, 400, { error: 'Cabeçalho X-Pipefy-User-Id é obrigatório para isolamento de cache.' });
  }

  if (req.method === 'DELETE') {
    const removed = memoryCache.clearUser(userId);
    return sendJson(res, 200, { ok: true, userId, removed });
  }

  if (req.method === 'GET') {
    return sendJson(res, 200, { ok: true, userId, ...memoryCache.statsForUser(userId) });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : 'JSON inválido.' });
  }

  const fileUrl = String(body?.fileUrl ?? '').trim();
  const pipeId = String(body?.pipeId ?? req.headers['x-pipefy-pipe-id'] ?? '').trim();
  const exportId = String(body?.exportId ?? fileUrl).trim();

  if (!fileUrl || !pipeId) {
    return sendJson(res, 400, { error: 'Parâmetros fileUrl e pipeId são obrigatórios.' });
  }

  try {
    validateExportUrl(fileUrl);
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : 'URL inválida.' });
  }

  const cached = memoryCache.get(userId, pipeId, exportId);
  if (cached) {
    applyCommonHeaders(res);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(cached.buffer.byteLength),
      'X-PipeLens-Server-Cache': 'HIT',
      'X-PipeLens-Cache-Owner': `user:${userId}`,
      'X-PipeLens-Bytes': String(cached.buffer.byteLength),
    });
    res.end(cached.buffer);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(fileUrl, { signal: controller.signal });
    if (!upstream.ok) {
      return sendJson(res, 502, {
        error: `Falha ao baixar relatório do Pipefy (HTTP ${upstream.status}).`,
      });
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0);
    if (contentLength > MAX_EXPORT_BYTES) {
      return sendJson(res, 413, { error: 'Arquivo de exportação excede o limite de 25 MB.' });
    }

    const arrayBuf = await upstream.arrayBuffer();
    if (arrayBuf.byteLength > MAX_EXPORT_BYTES) {
      return sendJson(res, 413, { error: 'Arquivo de exportação excede o limite de 25 MB.' });
    }

    const bytes = new Uint8Array(arrayBuf);
    if (bytes.byteLength <= 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return sendJson(res, 502, {
        error: 'Arquivo de exportação ainda em processamento no storage.',
      });
    }
    memoryCache.set(userId, pipeId, exportId, bytes, { fileUrl });

    applyCommonHeaders(res);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'X-PipeLens-Server-Cache': 'MISS',
      'X-PipeLens-Cache-Owner': `user:${userId}`,
      'X-PipeLens-Bytes': String(bytes.byteLength),
    });
    res.end(bytes);
  } catch (err) {
    return sendJson(res, 502, {
      error: err instanceof Error ? err.message : 'Erro ao buscar exportação remota.',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function serveStatic(reqPath, res) {
  const cleanPath = reqPath === '/' ? '/index.html' : reqPath;
  const candidate = path.normalize(path.join(DIST_DIR, cleanPath));
  if (!candidate.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let fileToServe = candidate;
  try {
    const stat = await fs.stat(fileToServe);
    if (stat.isDirectory()) {
      fileToServe = path.join(fileToServe, 'index.html');
    }
  } catch {
    // SPA fallback for /pipe-view, /sidebar, etc.
    fileToServe = path.join(DIST_DIR, 'index.html');
  }

  try {
    const data = await fs.readFile(fileToServe);
    const ext = path.extname(fileToServe).toLowerCase();
    applyCommonHeaders(res);
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    };
    if (reqPath.startsWith('/assets/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Build não encontrado. Execute "npm run build" antes de "npm start".' });
  }
}

const apiOnly = process.argv.includes('--api-only');
const port = Number(process.env.PORT || (apiOnly ? 4174 : 4173));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`);

  if (req.method === 'OPTIONS') {
    applyCommonHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'pipelens-dashboard',
      mode: apiOnly ? 'api-only' : 'full',
      timestamp: new Date().toISOString(),
    });
  }

  if (url.pathname === '/api/fetch-export') {
    return handleFetchExport(req, res);
  }

  if (apiOnly) {
    return sendJson(res, 404, { error: 'API server in --api-only mode.' });
  }

  return serveStatic(url.pathname, res);
});

server.listen(port, () => {
  console.log(
    `[PipeLens Server] ${apiOnly ? 'API proxy' : 'App + API proxy'} rodando em http://localhost:${port}`
  );
});
