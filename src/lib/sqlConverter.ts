import * as XLSX from 'xlsx';
import {
  buildFileDatasetId,
  buildFileTableName,
  buildPipeDatasetId,
  buildSchemaFingerprint,
} from '@/lib/datasetIdentity';
import type {
  DatasetColumnStats,
  DatasetSource,
  PipefyFieldHint,
  SqlColumnDef,
  SqlColumnType,
  SqlRow,
} from '@/types/pipefySql';

function normalizeKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const RESERVED_SQL_WORDS = new Set([
  'select',
  'from',
  'where',
  'group',
  'order',
  'by',
  'table',
  'index',
  'create',
  'insert',
  'update',
  'delete',
  'user',
  'date',
  'time',
  'timestamp',
  'default',
  'values',
  'key',
]);

export function sanitizeSqlIdentifier(rawHeader: string, used: Set<string>): string {
  let base = normalizeKey(rawHeader) || 'col';
  if (/^\d/.test(base)) {
    base = `col_${base}`;
  }
  if (RESERVED_SQL_WORDS.has(base)) {
    base = `${base}_col`;
  }

  let candidate = base;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

export function parseFlexibleNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (raw === null || raw === undefined) return null;
  let str = String(raw).trim();
  if (!str) return null;

  str = str.replace(/[^\d.,-]/g, '');
  if (!str || str === '-' || str === '.' || str === ',') return null;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length <= 4) {
      str = `${parts[0]}.${parts[1]}`;
    } else {
      str = str.replace(/,/g, '');
    }
  }

  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : null;
}

const SLASH_DATE_REGEX =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * Infers whether slash-delimited dates in a column follow DD/MM/YYYY (`true`)
 * or MM/DD/YYYY (`false`). Defaults to `true` (Brazilian/Pipefy convention)
 * when all sampled dates are ambiguous (both parts <= 12).
 */
export function inferColumnDayFirst(sampleValues: unknown[]): boolean {
  let sawDayFirstEvidence = false;
  let sawMonthFirstEvidence = false;

  for (const raw of sampleValues) {
    if (typeof raw !== 'string') continue;
    const match = raw.trim().match(SLASH_DATE_REGEX);
    if (!match) continue;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a > 12 && b <= 12) sawDayFirstEvidence = true;
    if (b > 12 && a <= 12) sawMonthFirstEvidence = true;
  }

  if (sawDayFirstEvidence && !sawMonthFirstEvidence) return true;
  if (sawMonthFirstEvidence && !sawDayFirstEvidence) return false;
  return true;
}

export function parseFlexibleDateIso(
  raw: unknown,
  preferDayFirst = false
): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial date
    if (raw > 20000 && raw < 90000) {
      const utcMs = Math.round((raw - 25569) * 86400 * 1000);
      const d = new Date(utcMs);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    }
    return null;
  }

  const str = String(raw).trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  const slashMatch = str.match(SLASH_DATE_REGEX);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const isDayFirst =
      a > 12 && b <= 12
        ? true
        : b > 12 && a <= 12
          ? false
          : preferDayFirst;
    const month = isDayFirst ? b : a;
    const day = isDayFirst ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const ms = Date.parse(str);
  if (!Number.isNaN(ms)) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  return null;
}

function parseBooleanValue(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === 'sim' || s === '1') return true;
  if (s === 'false' || s === 'no' || s === 'nao' || s === 'não' || s === '0') return false;
  return null;
}

const KNOWN_DATE_HEADERS = new Set([
  'created_at',
  'criado_em',
  'updated_at',
  'atualizado_em',
  'finished_at',
  'finalizado_em',
  'due_date',
  'data_de_vencimento',
  'expired_at',
  'expirado_em',
]);

const KNOWN_BOOLEAN_HEADERS = new Set(['overdue', 'atrasado', 'done', 'concluido']);

const KNOWN_IDENTIFIER_HEADERS = new Set([
  'id',
  'code',
  'card_id',
  'codigo',
  'cpf',
  'cnpj',
  'cep',
  'zip',
  'zipcode',
  'telefone',
  'phone',
  'celular',
  'whatsapp',
  'rg',
  'protocolo',
  'matricula',
  'numero_do_card',
]);

function inferSqlType(
  rawHeader: string,
  sampleValues: unknown[],
  hint?: PipefyFieldHint
): SqlColumnType {
  const norm = normalizeKey(rawHeader);
  if (KNOWN_IDENTIFIER_HEADERS.has(norm)) {
    return 'VARCHAR';
  }

  if (hint) {
    const t = hint.pipefyType.toLowerCase();
    if (t === 'number' || t === 'currency') return 'DOUBLE';
    if (t === 'date' || t === 'datetime' || t === 'due_date') return 'DATE';
    if (t === 'checkbox' || t === 'boolean') return 'BOOLEAN';
    if (t === 'phone' || t === 'cpf' || t === 'cnpj') return 'VARCHAR';
  }

  if (KNOWN_DATE_HEADERS.has(norm)) return 'DATE';
  if (KNOWN_BOOLEAN_HEADERS.has(norm)) return 'BOOLEAN';

  const nonEmpty = sampleValues.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (nonEmpty.length === 0) return 'VARCHAR';

  if (nonEmpty.every((v) => parseBooleanValue(v) !== null)) return 'BOOLEAN';
  const preferDayFirst = inferColumnDayFirst(nonEmpty);
  if (nonEmpty.every((v) => parseFlexibleDateIso(v, preferDayFirst) !== null)) return 'DATE';
  if (nonEmpty.every((v) => parseFlexibleNumber(v) !== null)) return 'DOUBLE';

  return 'VARCHAR';
}

export function buildCreateTableSql(tableName: string, columns: SqlColumnDef[]): string {
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  const colLines = columns.map((col) => `  "${col.name}" ${col.sqlType}`).join(',\n');
  return `CREATE TABLE IF NOT EXISTS "${safeTable}" (\n${colLines}\n);`;
}

const STATS_SAMPLE_SIZE = 500;
const STATS_MAX_TRACKED_DISTINCT = 2000;
const STATS_TOP_VALUES = 10;

/**
 * Computes cheap, bounded per-column statistics used by the semantic profiler.
 * Runs over at most ~500 rows and never keeps unbounded distinct buckets.
 */
function computeColumnStats(
  rows: SqlRow[],
  columns: SqlColumnDef[]
): void {
  const sampleSize = Math.min(rows.length, STATS_SAMPLE_SIZE);
  if (sampleSize === 0) return;

  for (const col of columns) {
    let nullCount = 0;
    const distinct = new Set<string>();
    const freq = new Map<string, number>();
    let overflow = false;

    for (let i = 0; i < sampleSize; i += 1) {
      const value = rows[i]?.[col.name];
      if (value === null || value === undefined || String(value).trim() === '') {
        nullCount += 1;
        continue;
      }
      const key = String(value);
      if (!overflow) {
        distinct.add(key);
        if (distinct.size > STATS_MAX_TRACKED_DISTINCT) overflow = true;
      }
      if (col.sqlType === 'VARCHAR' || col.sqlType === 'BOOLEAN') {
        freq.set(key, (freq.get(key) ?? 0) + 1);
      }
    }

    const stats: DatasetColumnStats = {
      distinctCount: distinct.size,
      nullCount,
      sampleSize,
    };
    if (freq.size > 0) {
      stats.topValues = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, STATS_TOP_VALUES)
        .map(([value]) => value);
    }
    col.stats = stats;
  }
}

export interface ConvertTabularParams {
  buffer: ArrayBuffer;
  pipeId: string;
  pipeName: string;
  fieldHints?: PipefyFieldHint[];
  datasetName?: string;
  source?: DatasetSource;
  sheetName?: string;
  format?: 'xlsx' | 'csv';
  /** Pre-computed identity, when the caller already knows it. */
  datasetId?: string;
}

export interface ConvertTabularResult {
  tableName: string;
  columns: SqlColumnDef[];
  rows: SqlRow[];
  createTableSql: string;
  parseMs: number;
  /** All sheet names found in the workbook (single entry for CSV). */
  sheetNames: string[];
  /** Sheet that was actually converted. */
  sheetName?: string;
  datasetId: string;
  name: string;
  source: DatasetSource;
  schemaFingerprint: string;
}

/**
 * Converts an arbitrary tabular buffer (`.xlsx`, `.xls` or `.csv`) into a typed
 * SQL dataset, inferring column types and lightweight statistics.
 */
export function convertTabularBufferToSqlDataset(
  params: ConvertTabularParams
): ConvertTabularResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const workbook = XLSX.read(new Uint8Array(params.buffer), {
    type: 'array',
    cellDates: true,
  });
  const sheetNames = workbook.SheetNames ?? [];
  const source: DatasetSource =
    params.source ??
    (params.format === 'csv' ? 'file' : params.pipeId === 'local_xlsx' ? 'file' : 'pipefy');
  const isCsv = params.format === 'csv';
  const requestedSheet =
    !isCsv && params.sheetName && sheetNames.includes(params.sheetName)
      ? params.sheetName
      : undefined;
  const activeSheetName = isCsv ? sheetNames[0] : requestedSheet ?? sheetNames[0];

  const name = (params.datasetName ?? params.pipeName ?? '').trim() || 'Dataset';
  const datasetId =
    params.datasetId ??
    (source === 'file'
      ? buildFileDatasetId({
          fileName: name,
          sheetName: isCsv ? undefined : activeSheetName,
        })
      : buildPipeDatasetId(params.pipeId));

  const tableName =
    source === 'file'
      ? buildFileTableName(datasetId)
      : `pipe_${String(params.pipeId).replace(/[^a-zA-Z0-9_]/g, '_') || 'default'}_cards`;

  const sheet = activeSheetName ? workbook.Sheets[activeSheetName] : undefined;
  const rawRows = sheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: true,
      })
    : [];

  if (rawRows.length === 0) {
    const fallbackCols: SqlColumnDef[] = [
      { name: 'id', label: 'ID', sourceHeader: 'ID', sqlType: 'VARCHAR' },
    ];
    return {
      tableName,
      columns: fallbackCols,
      rows: [],
      createTableSql: buildCreateTableSql(tableName, fallbackCols),
      parseMs: 0,
      sheetNames,
      sheetName: activeSheetName,
      datasetId,
      name,
      source,
      schemaFingerprint: buildSchemaFingerprint(fallbackCols),
    };
  }

  const hintByNormLabel = new Map<string, PipefyFieldHint>();
  for (const h of params.fieldHints ?? []) {
    hintByNormLabel.set(normalizeKey(h.label), h);
  }

  const headers = Object.keys(rawRows[0]);
  const usedIdentifiers = new Set<string>();
  const sampleSlice = rawRows.slice(0, 40);
  const dateSampleSlice = rawRows.slice(0, 200);

  const columns: SqlColumnDef[] = headers.map((header) => {
    const hint = hintByNormLabel.get(normalizeKey(header));
    const samples = sampleSlice.map((r) => r[header]);
    return {
      name: sanitizeSqlIdentifier(header, usedIdentifiers),
      label: header,
      sourceHeader: header,
      pipefyType: hint?.pipefyType,
      sqlType: inferSqlType(header, samples, hint),
    };
  });

  const dayFirstByCol = columns.map((col) =>
    col.sqlType === 'DATE'
      ? inferColumnDayFirst(dateSampleSlice.map((r) => r[col.sourceHeader]))
      : false
  );

  const rows: SqlRow[] = new Array(rawRows.length);
  for (let i = 0; i < rawRows.length; i += 1) {
    const src = rawRows[i];
    const out: SqlRow = {};
    for (let j = 0; j < columns.length; j += 1) {
      const col = columns[j];
      const rawVal = src[col.sourceHeader];
      if (rawVal === undefined || rawVal === null || rawVal === '') {
        out[col.name] = null;
        continue;
      }
      switch (col.sqlType) {
        case 'DOUBLE':
          out[col.name] = parseFlexibleNumber(rawVal);
          break;
        case 'DATE':
          out[col.name] = parseFlexibleDateIso(rawVal, dayFirstByCol[j]);
          break;
        case 'BOOLEAN':
          out[col.name] = parseBooleanValue(rawVal);
          break;
        default:
          out[col.name] = String(rawVal).trim();
          break;
      }
    }
    rows[i] = out;
  }

  computeColumnStats(rows, columns);

  const createTableSql = buildCreateTableSql(tableName, columns);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    tableName,
    columns,
    rows,
    createTableSql,
    parseMs: Math.round((t1 - t0) * 100) / 100,
    sheetNames,
    sheetName: activeSheetName,
    datasetId,
    name,
    source,
    schemaFingerprint: buildSchemaFingerprint(columns),
  };
}

/** @deprecated use convertTabularBufferToSqlDataset */
export const convertXlsxBufferToSqlDataset = convertTabularBufferToSqlDataset;
