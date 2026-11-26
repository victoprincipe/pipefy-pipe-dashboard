export type FieldKind = 'category' | 'number' | 'date' | 'text' | 'boolean';

export interface PipeFieldMeta {
  key: string; // field id or built-in key e.g. '__phase', '__createdAt'
  label: string;
  pipefyType: string;
  kind: FieldKind;
  isBuiltIn: boolean;
  reportColumnName?: string;
  options?: string[];
}

export interface PipePhaseMeta {
  id: string;
  name: string;
  done: boolean;
  cardsCount: number;
}

export interface PipeLabelMeta {
  id: string;
  name: string;
  color: string;
}

export interface PipeReportMeta {
  id: string;
  name: string;
}

export interface PipeSchema {
  id: string;
  suid?: string;
  uuid?: string;
  name: string;
  cardsCount: number;
  openedCardsCount: number;
  role: string | null;
  phases: PipePhaseMeta[];
  labels: PipeLabelMeta[];
  reports: PipeReportMeta[];
  fields: PipeFieldMeta[];
}

export interface PipefyUser {
  id: string;
  name: string;
  email: string;
  username?: string;
}

export interface NormalizedCard {
  id: string;
  suid?: string;
  title: string;
  phaseId: string;
  phaseName: string;
  done: boolean;
  late: boolean;
  expired: boolean;
  createdAt: string | null; // ISO string or YYYY-MM-DD
  createdAtMs: number | null;
  updatedAt: string | null;
  finishedAt: string | null;
  dueDate: string | null;
  dueDateMs: number | null;
  assignees: string[];
  labels: string[];
  createdBy: string;
  leadTimeHours: number | null;
  fields: Record<string, string | number | boolean | null>;
  searchText: string;
}

export type SyncStrategy = 'bulk_report' | 'cursor_pagination' | 'demo_seed' | 'incremental';

export interface SyncProgress {
  phase: 'idle' | 'meta' | 'creating_report' | 'exporting' | 'polling' | 'downloading' | 'parsing' | 'paginating' | 'done' | 'error' | 'paused';
  strategy: SyncStrategy;
  loaded: number;
  total: number;
  percent: number;
  message: string;
  startedAt: number;
  elapsedMs: number;
  error?: string;
}

export type CacheStorageFormat = 'parquet' | 'json';

export interface CacheSnapshotMeta {
  userId: string;
  pipeId: string;
  status: 'HIT' | 'STALE' | 'MISS';
  syncedAt: number | null;
  ttlMs: number;
  ageMs: number;
  strategy: SyncStrategy | null;
  storageFormat?: CacheStorageFormat;
  engine?: 'duckdb-wasm';
  cardsCount: number;
  totalCardsInPipe: number;
  estimatedBytes: number;
  reportId?: string;
  complete: boolean;
}
