import type {
  AsyncDuckDB,
  AsyncDuckDBConnection,
  DuckDBBundles,
} from '@duckdb/duckdb-wasm';
import type {
  DuckDbQueryResult,
  SqlColumnDef,
  SqlColumnType,
  SqlRow,
} from '@/types/pipefySql';

interface DuckDbSession {
  db: AsyncDuckDB;
  conn: AsyncDuckDBConnection;
}

let sessionPromise: Promise<DuckDbSession> | null = null;
let opQueue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = opQueue.then(fn, fn);
  opQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function getDuckDbSession(): Promise<DuckDbSession> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('DuckDB-WASM só pode ser executado no navegador.'));
  }

  if (!sessionPromise) {
    sessionPromise = (async () => {
      const duckdb = await import('@duckdb/duckdb-wasm');
      const origin = window.location.origin;

      // Single-threaded bundles only (never coi/SharedArrayBuffer) for cross-origin Pipefy iframes.
      const manualBundles: DuckDBBundles = {
        mvp: {
          mainModule: new URL('/duckdb/duckdb-mvp.wasm', origin).toString(),
          mainWorker: new URL('/duckdb/duckdb-browser-mvp.worker.js', origin).toString(),
        },
        eh: {
          mainModule: new URL('/duckdb/duckdb-eh.wasm', origin).toString(),
          mainWorker: new URL('/duckdb/duckdb-browser-eh.worker.js', origin).toString(),
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

      return { db, conn };
    })().catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }

  return sessionPromise;
}

export function sanitizeTableName(tableName: string): string {
  const safe = String(tableName ?? '').replace(/[^a-zA-Z0-9_]/g, '_');
  return safe || 'pipe_cards';
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function mapReadJsonColumnType(sqlType: SqlColumnType): string {
  switch (sqlType) {
    case 'DOUBLE':
      return 'DOUBLE';
    case 'BOOLEAN':
      return 'BOOLEAN';
    case 'DATE':
    case 'VARCHAR':
    default:
      return 'VARCHAR';
  }
}

function buildCastProjection(col: SqlColumnDef): string {
  const ident = quoteIdent(col.name);
  switch (col.sqlType) {
    case 'DATE':
      return `TRY_CAST(${ident} AS DATE) AS ${ident}`;
    case 'DOUBLE':
      return `TRY_CAST(${ident} AS DOUBLE) AS ${ident}`;
    case 'BOOLEAN':
      return `TRY_CAST(${ident} AS BOOLEAN) AS ${ident}`;
    case 'VARCHAR':
    default:
      return `CAST(${ident} AS VARCHAR) AS ${ident}`;
  }
}

function normalizeDuckDbValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') {
    if (
      value >= BigInt(Number.MIN_SAFE_INTEGER) &&
      value <= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return Number(value);
    }
    return value.toString();
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDuckDbValue);
  }

  if (ArrayBuffer.isView(value)) {
    if (value instanceof Uint8Array) {
      return Array.from(value);
    }
    return String(value);
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeDuckDbValue(v);
    }
    return out;
  }

  return value;
}

/**
 * Ingests parsed SQL rows into DuckDB-WASM and exports a compact Parquet snapshot
 * suitable for caching inside IndexedDB.
 */
export function ingestRowsIntoDuckDb(params: {
  tableName: string;
  columns: SqlColumnDef[];
  rows: SqlRow[];
  createTableSql: string;
}): Promise<{ parquetBuffer: Uint8Array; loadMs: number }> {
  return runExclusive(async () => {
    const t0 = performance.now();
    const { db, conn } = await getDuckDbSession();
    const safeTable = sanitizeTableName(params.tableName);
    const quotedTable = quoteIdent(safeTable);

    await conn.query(`DROP TABLE IF EXISTS ${quotedTable};`);

    if (params.rows.length === 0) {
      await conn.query(params.createTableSql);
    } else {
      const jsonFile = `__ingest_${safeTable}.ndjson`;
      const ndjson = params.rows.map((r) => JSON.stringify(r)).join('\n');
      const encoded = new TextEncoder().encode(ndjson);

      await db.registerFileBuffer(jsonFile, encoded);
      try {
        const columnEntries = params.columns.map(
          (col) => `${quoteLiteral(col.name)}: ${quoteLiteral(mapReadJsonColumnType(col.sqlType))}`
        );
        const projections = params.columns.map(buildCastProjection);

        await conn.query(
          `CREATE TABLE ${quotedTable} AS SELECT ${projections.join(', ')} FROM read_json(${quoteLiteral(jsonFile)}, format = 'newline_delimited', columns = {${columnEntries.join(', ')}}, maximum_object_size = 16777216);`
        );
      } finally {
        await db.dropFile(jsonFile).catch(() => {});
      }
    }

    const parquetFile = `__export_${safeTable}.parquet`;
    try {
      await conn.query(`COPY ${quotedTable} TO ${quoteLiteral(parquetFile)} (FORMAT PARQUET);`);
      const raw = await db.copyFileToBuffer(parquetFile);
      const parquetBuffer = new Uint8Array(raw);
      return {
        parquetBuffer,
        loadMs: Math.round((performance.now() - t0) * 10) / 10,
      };
    } finally {
      await db.dropFile(parquetFile).catch(() => {});
    }
  });
}

/**
 * Restores a cached Parquet snapshot from IndexedDB into a DuckDB-WASM table.
 */
export function loadParquetIntoDuckDb(params: {
  tableName: string;
  parquetBuffer: Uint8Array;
}): Promise<{ loadMs: number }> {
  return runExclusive(async () => {
    const t0 = performance.now();
    const { db, conn } = await getDuckDbSession();
    const safeTable = sanitizeTableName(params.tableName);
    const quotedTable = quoteIdent(safeTable);
    const parquetFile = `__cache_${safeTable}.parquet`;

    await db.registerFileBuffer(parquetFile, new Uint8Array(params.parquetBuffer));
    try {
      await conn.query(
        `DROP TABLE IF EXISTS ${quotedTable}; CREATE TABLE ${quotedTable} AS SELECT * FROM read_parquet(${quoteLiteral(parquetFile)});`
      );
    } finally {
      await db.dropFile(parquetFile).catch(() => {});
    }

    return {
      loadMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  });
}

function arrowTableToObjects<
  T extends Record<string, unknown> = Record<string, unknown>,
>(table: {
  schema: { fields: Array<{ name: string }> };
  toArray: () => unknown[];
}): { columns: string[]; rows: T[] } {
  const columns = table.schema.fields.map((f) => f.name);
  const rows = table.toArray().map((row) => {
    const rawObj =
      typeof (row as { toJSON?: () => Record<string, unknown> })?.toJSON === 'function'
        ? (row as { toJSON: () => Record<string, unknown> }).toJSON()
        : { ...(row as Record<string, unknown>) };
    return normalizeDuckDbValue(rawObj) as T;
  });
  return { columns, rows };
}

/**
 * Initializes (or reuses) the singleton browser DuckDB-WASM session.
 */
export async function initDuckDb(): Promise<void> {
  await getDuckDbSession();
}

/**
 * Executes an analytical SQL query against the active DuckDB-WASM session.
 */
export function queryDuckDb<
  T extends Record<string, unknown> = Record<string, unknown>,
>(sql: string): Promise<DuckDbQueryResult<T>> {
  return runExclusive(async () => {
    const { conn } = await getDuckDbSession();
    const t0 = performance.now();
    const table = await conn.query(sql);
    const { columns, rows } = arrowTableToObjects<T>(table);

    return {
      columns,
      rows,
      rowCount: rows.length,
      durationMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  });
}

/**
 * Drops a table from DuckDB-WASM if an instance has already been initialized.
 */
export async function dropDuckDbTable(tableName: string): Promise<void> {
  if (!sessionPromise) return;
  const safeTable = sanitizeTableName(tableName);
  await runExclusive(async () => {
    const { conn } = await getDuckDbSession();
    await conn.query(`DROP TABLE IF EXISTS ${quoteIdent(safeTable)};`);
  });
}
