import type { FieldKind, NormalizedCard, PipeSchema } from '../types/pipefy';
import { parseFlexibleDate, parseFlexibleNumber } from '../utils/xlsxNormalizer';

export type DuckSqlType = 'VARCHAR' | 'DOUBLE' | 'BOOLEAN' | 'BIGINT';

export interface ColumnMapping {
  fieldKey: string;
  colName: string;
  kind: FieldKind;
  sqlType: DuckSqlType;
  isBuiltIn: boolean;
}

export interface SchemaCatalog {
  columns: ColumnMapping[];
  allColumnDefs: Array<{ colName: string; sqlType: DuckSqlType }>;
  byFieldKey: Map<string, ColumnMapping>;
  customFields: ColumnMapping[];
}

const SYSTEM_FIELD_COLUMNS: ColumnMapping[] = [
  { fieldKey: '__id', colName: 'id', kind: 'text', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__title', colName: 'title', kind: 'text', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__phase', colName: 'phase_name', kind: 'category', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__status', colName: 'status_label', kind: 'category', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__sla', colName: 'sla_label', kind: 'category', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__createdAt', colName: 'created_at', kind: 'date', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__finishedAt', colName: 'finished_at', kind: 'date', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__dueDate', colName: 'due_date', kind: 'date', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__assignee', colName: 'primary_assignee', kind: 'category', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__label', colName: 'primary_label', kind: 'category', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__createdBy', colName: 'created_by', kind: 'category', sqlType: 'VARCHAR', isBuiltIn: true },
  { fieldKey: '__leadTimeHours', colName: 'lead_time_hours', kind: 'number', sqlType: 'DOUBLE', isBuiltIn: true },
];

const EXTRA_SYSTEM_COLUMNS: Array<{ colName: string; sqlType: DuckSqlType }> = [
  { colName: 'suid', sqlType: 'VARCHAR' },
  { colName: 'phase_id', sqlType: 'VARCHAR' },
  { colName: 'done', sqlType: 'BOOLEAN' },
  { colName: 'late', sqlType: 'BOOLEAN' },
  { colName: 'expired', sqlType: 'BOOLEAN' },
  { colName: 'created_at_ms', sqlType: 'BIGINT' },
  { colName: 'updated_at', sqlType: 'VARCHAR' },
  { colName: 'due_date_ms', sqlType: 'BIGINT' },
  { colName: 'assignees_json', sqlType: 'VARCHAR' },
  { colName: 'labels_json', sqlType: 'VARCHAR' },
  { colName: 'search_text', sqlType: 'VARCHAR' },
];

const IDENT_RE = /^[a-z][a-z0-9_]*$/;

export function quoteIdent(colName: string): string {
  if (!IDENT_RE.test(colName)) {
    throw new Error(`Identificador SQL inválido: ${colName}`);
  }
  return `"${colName}"`;
}

export function sqlStr(val: string): string {
  const clean = String(val).replace(/\0/g, '');
  return `'${clean.replace(/'/g, "''")}'`;
}

export function sqlNum(val: number): string {
  if (!Number.isFinite(val)) {
    throw new Error(`Valor numérico SQL inválido: ${val}`);
  }
  return String(val);
}

function mapFieldKindToSqlType(kind: FieldKind): DuckSqlType {
  switch (kind) {
    case 'number':
      return 'DOUBLE';
    case 'boolean':
      return 'BOOLEAN';
    default:
      return 'VARCHAR';
  }
}

function sanitizeCustomColName(fieldKey: string, usedNames: Set<string>): string {
  const cleaned = fieldKey
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'field';
  const base = `cf_${cleaned}`;
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export function buildColumnCatalog(schema: PipeSchema): SchemaCatalog {
  const usedNames = new Set<string>([
    ...SYSTEM_FIELD_COLUMNS.map((c) => c.colName),
    ...EXTRA_SYSTEM_COLUMNS.map((c) => c.colName),
  ]);

  const columns: ColumnMapping[] = [...SYSTEM_FIELD_COLUMNS];
  const customFields: ColumnMapping[] = [];
  const byFieldKey = new Map<string, ColumnMapping>();

  for (const sysCol of SYSTEM_FIELD_COLUMNS) {
    byFieldKey.set(sysCol.fieldKey, sysCol);
  }

  for (const field of schema.fields) {
    if (field.isBuiltIn || byFieldKey.has(field.key)) continue;
    const colName = sanitizeCustomColName(field.key, usedNames);
    const mapping: ColumnMapping = {
      fieldKey: field.key,
      colName,
      kind: field.kind,
      sqlType: mapFieldKindToSqlType(field.kind),
      isBuiltIn: false,
    };
    columns.push(mapping);
    customFields.push(mapping);
    byFieldKey.set(field.key, mapping);
  }

  const allColumnDefs: Array<{ colName: string; sqlType: DuckSqlType }> = [
    ...SYSTEM_FIELD_COLUMNS.map((c) => ({ colName: c.colName, sqlType: c.sqlType })),
    ...EXTRA_SYSTEM_COLUMNS,
    ...customFields.map((c) => ({ colName: c.colName, sqlType: c.sqlType })),
  ];

  return { columns, allColumnDefs, byFieldKey, customFields };
}

export function getColumnMapping(catalog: SchemaCatalog, fieldKey: string): ColumnMapping | null {
  return catalog.byFieldKey.get(fieldKey) ?? null;
}

function coerceCustomValue(
  raw: string | number | boolean | null | undefined,
  sqlType: DuckSqlType,
  kind: FieldKind
): string | number | boolean | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (sqlType === 'DOUBLE') {
    const n = typeof raw === 'number' ? (Number.isFinite(raw) ? raw : null) : parseFlexibleNumber(raw);
    return n;
  }
  if (sqlType === 'BOOLEAN') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === 'sim' || s === '1';
  }
  if (kind === 'date') {
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.trim())) {
      return raw.trim();
    }
    return parseFlexibleDate(raw).iso ?? String(raw);
  }
  return String(raw);
}

export function flattenCardToRow(
  card: NormalizedCard,
  catalog: SchemaCatalog
): Record<string, string | number | boolean | null> {
  const row: Record<string, string | number | boolean | null> = {
    id: String(card.id),
    title: card.title ?? '',
    phase_name: card.phaseName || 'Sem fase',
    status_label: card.done ? 'Concluído' : 'Em andamento',
    sla_label: card.expired ? 'Expirado' : card.late ? 'Atrasado' : 'No prazo',
    created_at: card.createdAt ?? null,
    finished_at: card.finishedAt ?? null,
    due_date: card.dueDate ?? null,
    primary_assignee: card.assignees.length > 0 ? card.assignees[0] : 'Sem responsável',
    primary_label: card.labels.length > 0 ? card.labels[0] : 'Sem etiqueta',
    created_by: card.createdBy || 'Não informado',
    lead_time_hours:
      typeof card.leadTimeHours === 'number' && Number.isFinite(card.leadTimeHours)
        ? card.leadTimeHours
        : null,
    suid: card.suid ?? null,
    phase_id: card.phaseId ?? '',
    done: Boolean(card.done),
    late: Boolean(card.late),
    expired: Boolean(card.expired),
    created_at_ms:
      typeof card.createdAtMs === 'number' && Number.isFinite(card.createdAtMs)
        ? Math.trunc(card.createdAtMs)
        : null,
    updated_at: card.updatedAt ?? null,
    due_date_ms:
      typeof card.dueDateMs === 'number' && Number.isFinite(card.dueDateMs)
        ? Math.trunc(card.dueDateMs)
        : null,
    assignees_json: JSON.stringify(card.assignees ?? []),
    labels_json: JSON.stringify(card.labels ?? []),
    search_text: card.searchText ?? '',
  };

  for (const cf of catalog.customFields) {
    row[cf.colName] = coerceCustomValue(card.fields[cf.fieldKey], cf.sqlType, cf.kind);
  }

  return row;
}

function safeParseStringArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toNullableFiniteNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function hydrateRowToCard(
  row: Record<string, unknown>,
  catalog: SchemaCatalog
): NormalizedCard {
  const fields: Record<string, string | number | boolean | null> = {};
  for (const cf of catalog.customFields) {
    const raw = row[cf.colName];
    if (raw === undefined || raw === null) {
      fields[cf.fieldKey] = null;
    } else if (cf.sqlType === 'DOUBLE') {
      fields[cf.fieldKey] = toNullableFiniteNumber(raw);
    } else if (cf.sqlType === 'BOOLEAN') {
      fields[cf.fieldKey] = Boolean(raw);
    } else {
      fields[cf.fieldKey] = String(raw);
    }
  }

  const createdByRaw = row.created_by !== null && row.created_by !== undefined ? String(row.created_by) : '';

  return {
    id: String(row.id ?? ''),
    suid: row.suid !== null && row.suid !== undefined ? String(row.suid) : undefined,
    title: String(row.title ?? ''),
    phaseId: String(row.phase_id ?? ''),
    phaseName: String(row.phase_name ?? 'Sem fase'),
    done: Boolean(row.done),
    late: Boolean(row.late),
    expired: Boolean(row.expired),
    createdAt: row.created_at !== null && row.created_at !== undefined ? String(row.created_at) : null,
    createdAtMs: toNullableFiniteNumber(row.created_at_ms),
    updatedAt: row.updated_at !== null && row.updated_at !== undefined ? String(row.updated_at) : null,
    finishedAt: row.finished_at !== null && row.finished_at !== undefined ? String(row.finished_at) : null,
    dueDate: row.due_date !== null && row.due_date !== undefined ? String(row.due_date) : null,
    dueDateMs: toNullableFiniteNumber(row.due_date_ms),
    assignees: safeParseStringArray(row.assignees_json),
    labels: safeParseStringArray(row.labels_json),
    createdBy: createdByRaw === 'Não informado' ? '' : createdByRaw,
    leadTimeHours: toNullableFiniteNumber(row.lead_time_hours),
    fields,
    searchText: String(row.search_text ?? ''),
  };
}

export function buildCreateTableSql(catalog: SchemaCatalog): string {
  const colDefs = catalog.allColumnDefs
    .map((c) => `${quoteIdent(c.colName)} ${c.sqlType}`)
    .join(', ');
  return `CREATE OR REPLACE TABLE cards (${colDefs})`;
}

export function buildReadJsonColumnsSql(catalog: SchemaCatalog): string {
  const entries = catalog.allColumnDefs
    .map((c) => `${sqlStr(c.colName)}: ${sqlStr(c.sqlType)}`)
    .join(', ');
  return `{ ${entries} }`;
}
