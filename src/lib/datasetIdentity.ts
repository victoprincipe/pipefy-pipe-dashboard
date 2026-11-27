import type {
  DatasetSource,
  PipefySqlDataset,
  SqlColumnDef,
} from '@/types/pipefySql';

/**
 * Converts any free-form name into a stable, URL/SQL friendly slug.
 * Strips accents, lowercases and collapses every non-alphanumeric run into `-`.
 */
export function slugifyDatasetName(input: string): string {
  const slug = String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'dataset';
}

/** Removes a known spreadsheet extension from a file name. */
export function stripFileExtension(fileName: string): string {
  return String(fileName ?? '').replace(/\.(xlsx|xls|csv|tsv)$/i, '').trim();
}

export function buildPipeDatasetId(pipeId: string): string {
  return `pipe::${slugifyDatasetName(pipeId)}`;
}

/**
 * File datasets are identified by file name (and sheet when applicable).
 * Re-importing the same file keeps the same id; renaming creates a new dataset.
 */
export function buildFileDatasetId(params: {
  fileName: string;
  sheetName?: string;
}): string {
  const base = `file::${slugifyDatasetName(stripFileExtension(params.fileName))}`;
  return params.sheetName
    ? `${base}::${slugifyDatasetName(params.sheetName)}`
    : base;
}

/** FNV-1a 32-bit, synchronous and dependency free. */
export function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  const text = String(input ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Stable fingerprint of the column schema (name + sql type, sorted). */
export function buildSchemaFingerprint(columns: SqlColumnDef[]): string {
  const payload = (columns ?? [])
    .map((col) => `${col.name}:${col.sqlType}`)
    .sort()
    .join('|');
  return shortHash(payload);
}

/** Generates a DuckDB table name for a file dataset. */
export function buildFileTableName(datasetId: string): string {
  return `ds_${shortHash(datasetId)}_data`;
}

/**
 * Fills in the identity fields for datasets persisted before they existed.
 * Safe to call on every read path; never mutates the input.
 */
export function ensureDatasetIdentity(
  dataset: PipefySqlDataset
): PipefySqlDataset {
  // Legacy local imports used the fixed `local_xlsx` pipe slot.
  const source: DatasetSource =
    dataset.source ?? (dataset.pipeId === 'local_xlsx' ? 'file' : 'pipefy');
  const name = dataset.name || dataset.pipeName || dataset.pipeId || 'Dataset';
  const datasetId =
    dataset.datasetId ||
    (source === 'file'
      ? buildFileDatasetId({ fileName: name })
      : buildPipeDatasetId(dataset.pipeId || name));

  return {
    ...dataset,
    pipeName: dataset.pipeName || name,
    datasetId,
    name,
    source,
    schemaFingerprint:
      dataset.schemaFingerprint || buildSchemaFingerprint(dataset.columns ?? []),
  };
}
