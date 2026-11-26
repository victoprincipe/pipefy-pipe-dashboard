import * as duckdb from '@duckdb/duckdb-wasm';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

export interface DuckDbBackend {
  query(sql: string): Promise<Record<string, unknown>[]>;
  registerFileBuffer(name: string, buffer: Uint8Array): Promise<void>;
  copyFileToBuffer(name: string): Promise<Uint8Array>;
  dropFile(name: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Instantiates single-threaded DuckDB-WASM (mvp/eh bundles only — never coi/SharedArrayBuffer)
 * so it works inside cross-origin Pipefy iframes without COOP/COEP headers.
 */
export async function createBrowserDuckDbBackend(): Promise<DuckDbBackend> {
  const manualBundles: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: mvpWasm,
      mainWorker: mvpWorker,
    },
    eh: {
      mainModule: ehWasm,
      mainWorker: ehWorker,
    },
  };

  const bundle = await duckdb.selectBundle(manualBundles);
  if (!bundle.mainWorker) {
    throw new Error('Bundle do DuckDB-WASM sem script de Web Worker.');
  }

  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.VoidLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();

  return {
    async query(sql: string): Promise<Record<string, unknown>[]> {
      const table = await conn.query(sql);
      return table.toArray().map((row) =>
        typeof (row as { toJSON?: () => Record<string, unknown> })?.toJSON === 'function'
          ? (row as { toJSON: () => Record<string, unknown> }).toJSON()
          : { ...(row as Record<string, unknown>) }
      );
    },
    async registerFileBuffer(name: string, buffer: Uint8Array): Promise<void> {
      await db.registerFileBuffer(name, buffer);
    },
    async copyFileToBuffer(name: string): Promise<Uint8Array> {
      const raw = await db.copyFileToBuffer(name);
      return new Uint8Array(raw);
    },
    async dropFile(name: string): Promise<void> {
      await db.dropFile(name);
    },
    async close(): Promise<void> {
      await conn.close().catch(() => {});
      await db.terminate().catch(() => {});
    },
  };
}
