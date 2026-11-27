export type SqlColumnType = 'VARCHAR' | 'DOUBLE' | 'DATE' | 'BOOLEAN';

export type DatasetSource = 'pipefy' | 'file';

export interface DatasetColumnStats {
  /** Number of non-null distinct values observed in the sampled rows. */
  distinctCount?: number;
  /** Number of null/empty values observed in the sampled rows. */
  nullCount?: number;
  /** How many rows were inspected to compute the stats. */
  sampleSize?: number;
  /** Up to 10 most frequent non-empty values (VARCHAR/BOOLEAN only). */
  topValues?: string[];
}

export interface SqlColumnDef {
  name: string;
  label: string;
  sourceHeader: string;
  pipefyType?: string;
  sqlType: SqlColumnType;
  stats?: DatasetColumnStats;
}

export type SqlRow = Record<string, string | number | boolean | null>;

export interface PipefyFieldHint {
  label: string;
  pipefyType: string;
}

export interface PipefySqlDataset {
  cacheKey: string; // `${userId}::${pipeId}`
  userId: string;
  pipeId: string;
  /** @deprecated use `name`. Kept for backwards compatibility. */
  pipeName: string;
  tableName: string;
  columns: SqlColumnDef[];
  rows?: SqlRow[];
  parquetBuffer?: Uint8Array;
  parquetBytes?: number;
  createTableSql: string;
  rowsCount: number;
  syncedAt: number;
  ttlMs: number;
  reportId?: string;
  exportId?: string;
  estimatedBytes: number;

  /** Stable identity for the dataset origin (pipe or file). */
  datasetId: string;
  /** Human readable dataset name (pipe name or file name). */
  name: string;
  source: DatasetSource;
  sheetName?: string;
  /** Diagnostic fingerprint of the column schema. */
  schemaFingerprint: string;
}

export interface DuckDbQueryResult<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  columns: string[];
  rows: T[];
  rowCount: number;
  durationMs: number;
}

export interface PipefyUserInfo {
  id: string;
  name: string;
  email?: string;
}

export type PipefySyncPhase =
  | 'idle'
  | 'initializing'
  | 'checking_cache'
  | 'fetching_meta'
  | 'creating_report'
  | 'exporting'
  | 'polling'
  | 'downloading'
  | 'converting'
  | 'loading_duckdb'
  | 'saving_cache'
  | 'ready'
  | 'error';

export type CacheHitStatus = 'HIT' | 'STALE' | 'MISS';
