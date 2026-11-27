import type {
  DatasetSource,
  PipefySqlDataset,
  SqlColumnDef,
} from '@/types/pipefySql';

export function column(
  name: string,
  sqlType: SqlColumnDef['sqlType'],
  options: Partial<SqlColumnDef> = {}
): SqlColumnDef {
  return {
    name,
    label: options.label ?? name,
    sourceHeader: options.sourceHeader ?? name,
    sqlType,
    pipefyType: options.pipefyType,
    stats: options.stats,
  };
}

export function dataset(
  id: string,
  columns: SqlColumnDef[],
  options: { source?: DatasetSource; rowsCount?: number } = {}
): PipefySqlDataset {
  const source = options.source ?? 'file';
  return {
    cacheKey: `local::${id}`,
    userId: 'local',
    pipeId: id,
    pipeName: id,
    tableName: `ds_${id}_data`,
    columns,
    rowsCount: options.rowsCount ?? 100,
    createTableSql: '',
    syncedAt: 0,
    ttlMs: 0,
    estimatedBytes: 0,
    datasetId: id,
    name: id,
    source,
    schemaFingerprint: 'fingerprint',
  };
}
