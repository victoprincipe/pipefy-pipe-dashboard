import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'node_modules/@duckdb/duckdb-wasm/dist');
const outDir = resolve(rootDir, 'public/duckdb');

const REQUIRED_ASSETS = [
  'duckdb-mvp.wasm',
  'duckdb-browser-mvp.worker.js',
  'duckdb-eh.wasm',
  'duckdb-browser-eh.worker.js',
];

if (!existsSync(distDir)) {
  console.error(`[copy-duckdb-assets] Diretório não encontrado: ${distDir}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

for (const filename of REQUIRED_ASSETS) {
  const src = resolve(distDir, filename);
  const dest = resolve(outDir, filename);

  if (!existsSync(src)) {
    console.error(`[copy-duckdb-assets] Arquivo obrigatório ausente em @duckdb/duckdb-wasm: ${src}`);
    process.exit(1);
  }

  const srcSize = statSync(src).size;
  if (existsSync(dest) && statSync(dest).size === srcSize) {
    continue;
  }

  copyFileSync(src, dest);
}

console.log(`[copy-duckdb-assets] ${REQUIRED_ASSETS.length} arquivos DuckDB-WASM prontos em public/duckdb/`);
