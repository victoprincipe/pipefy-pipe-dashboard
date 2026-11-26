import type { NormalizedCard, PipeFieldMeta, PipeSchema } from '../types/pipefy';

export function parseFlexibleNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (raw === null || raw === undefined) return null;
  let str = String(raw).trim();
  if (!str) return null;

  // Strip currency symbols and spaces (e.g. "R$ 1.234,56" or "$1,234.56")
  str = str.replace(/[^\d.,-]/g, '');
  if (!str || str === '-' || str === '.' || str === ',') return null;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal separator
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

export function parseFlexibleDate(raw: unknown): { iso: string | null; ms: number | null } {
  if (raw === null || raw === undefined || raw === '') {
    return { iso: null, ms: null };
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { iso: raw.toISOString(), ms: raw.getTime() };
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial date (days since 1899-12-30)
    if (raw > 20000 && raw < 90000) {
      const utcMs = Math.round((raw - 25569) * 86400 * 1000);
      const d = new Date(utcMs);
      if (!Number.isNaN(d.getTime())) {
        return { iso: d.toISOString(), ms: d.getTime() };
      }
    }
    if (raw > 1e11) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        return { iso: d.toISOString(), ms: d.getTime() };
      }
    }
    return { iso: null, ms: null };
  }

  const str = String(raw).trim();
  if (!str) return { iso: null, ms: null };

  // ISO format: YYYY-MM-DD or full ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const normalized = str.length === 10 ? `${str}T12:00:00Z` : str;
    const ms = Date.parse(normalized);
    if (!Number.isNaN(ms)) {
      return { iso: str.length === 10 ? str : new Date(ms).toISOString(), ms };
    }
  }

  // Slash format: MM/DD/YYYY (Pipefy US default like "02/27/2027") or DD/MM/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const hh = Number(slashMatch[4] ?? 12);
    const mm = Number(slashMatch[5] ?? 0);
    const ss = Number(slashMatch[6] ?? 0);

    // If a > 12, it must be DD/MM/YYYY; if b > 12, it must be MM/DD/YYYY; otherwise Pipefy exports MM/DD/YYYY in US locale
    const isDayFirst = a > 12 && b <= 12;
    const month = isDayFirst ? b : a;
    const day = isDayFirst ? a : b;
    const ms = Date.UTC(year, month - 1, day, hh, mm, ss);
    if (!Number.isNaN(ms)) {
      const yyyy = String(year).padStart(4, '0');
      const mo = String(month).padStart(2, '0');
      const da = String(day).padStart(2, '0');
      return { iso: `${yyyy}-${mo}-${da}`, ms };
    }
  }

  const fallback = Date.parse(str);
  if (!Number.isNaN(fallback)) {
    return { iso: new Date(fallback).toISOString(), ms: fallback };
  }

  return { iso: null, ms: null };
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const BUILT_IN_HEADER_ALIASES: Record<string, string> = {
  id: 'id',
  code: 'id',
  card_id: 'id',
  codigo: 'id',
  title: 'title',
  titulo: 'title',
  current_phase: 'current_phase',
  fase_atual: 'current_phase',
  phase: 'current_phase',
  labels: 'labels',
  etiquetas: 'labels',
  due_date: 'due_date',
  data_de_vencimento: 'due_date',
  creator: 'created_by',
  criador: 'created_by',
  created_by: 'created_by',
  assignees: 'assignees',
  responsaveis: 'assignees',
  finished_at: 'finished_at',
  finalizado_em: 'finished_at',
  created_at: 'created_at',
  criado_em: 'created_at',
  updated_at: 'updated_at',
  atualizado_em: 'updated_at',
  overdue: 'overdue',
  atrasado: 'overdue',
  expired_at: 'expired_at',
  expirado_em: 'expired_at',
};

function buildSearchText(
  id: string,
  title: string,
  phaseName: string,
  fields: Record<string, string | number | boolean | null>,
  assignees: string[],
  labels: string[]
): string {
  const parts = [id, title, phaseName, ...assignees, ...labels];
  for (const v of Object.values(fields)) {
    if (v !== null && v !== undefined && v !== '') {
      parts.push(String(v));
    }
  }
  return parts.join(' ').toLowerCase();
}

export function normalizeExportRows(
  rows: Record<string, unknown>[],
  schema: PipeSchema
): NormalizedCard[] {
  if (rows.length === 0) return [];

  // Map normalized label -> PipeFieldMeta
  const fieldByLabel = new Map<string, PipeFieldMeta>();
  for (const f of schema.fields) {
    if (f.isBuiltIn) continue;
    fieldByLabel.set(normalizeHeaderKey(f.label), f);
    fieldByLabel.set(normalizeHeaderKey(f.key), f);
  }

  const phaseByName = new Map<string, { id: string; done: boolean }>();
  for (const p of schema.phases) {
    phaseByName.set(p.name.trim().toLowerCase(), { id: p.id, done: p.done });
  }

  const headers = Object.keys(rows[0]);
  const headerMapping = headers.map((rawHeader) => {
    const norm = normalizeHeaderKey(rawHeader);
    const builtIn = BUILT_IN_HEADER_ALIASES[norm];
    if (builtIn) {
      return { rawHeader, kind: 'built_in' as const, target: builtIn };
    }
    const matchedField = fieldByLabel.get(norm);
    if (matchedField) {
      return { rawHeader, kind: 'field' as const, field: matchedField };
    }
    return { rawHeader, kind: 'extra' as const, target: norm };
  });

  const result: NormalizedCard[] = new Array(rows.length);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    let id = '';
    let title = '';
    let phaseName = '';
    let createdBy = '';
    let assignees: string[] = [];
    let labels: string[] = [];
    let createdAt: string | null = null;
    let createdAtMs: number | null = null;
    let updatedAt: string | null = null;
    let finishedAt: string | null = null;
    let dueDate: string | null = null;
    let dueDateMs: number | null = null;
    let late = false;
    let expired = false;
    const fields: Record<string, string | number | boolean | null> = {};

    for (const map of headerMapping) {
      const rawVal = row[map.rawHeader];
      if (map.kind === 'built_in') {
        switch (map.target) {
          case 'id':
            id = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
            break;
          case 'title':
            title = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
            break;
          case 'current_phase':
            phaseName = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
            break;
          case 'created_by':
            createdBy = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
            break;
          case 'assignees':
            assignees = rawVal
              ? String(rawVal)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
            break;
          case 'labels':
            labels = rawVal
              ? String(rawVal)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
            break;
          case 'created_at': {
            const d = parseFlexibleDate(rawVal);
            createdAt = d.iso;
            createdAtMs = d.ms;
            break;
          }
          case 'updated_at':
            updatedAt = parseFlexibleDate(rawVal).iso;
            break;
          case 'finished_at':
            finishedAt = parseFlexibleDate(rawVal).iso;
            break;
          case 'due_date': {
            const d = parseFlexibleDate(rawVal);
            dueDate = d.iso;
            dueDateMs = d.ms;
            break;
          }
          case 'overdue':
            late =
              rawVal === true ||
              String(rawVal ?? '')
                .trim()
                .toLowerCase() === 'true' ||
              String(rawVal ?? '')
                .trim()
                .toLowerCase() === 'yes' ||
              String(rawVal ?? '')
                .trim()
                .toLowerCase() === 'sim';
            break;
          case 'expired_at':
            expired = Boolean(rawVal);
            break;
        }
      } else if (map.kind === 'field') {
        const f = map.field;
        if (rawVal === undefined || rawVal === null || rawVal === '') {
          fields[f.key] = null;
        } else if (f.kind === 'number') {
          fields[f.key] = parseFlexibleNumber(rawVal);
        } else if (f.kind === 'date') {
          fields[f.key] = parseFlexibleDate(rawVal).iso;
        } else if (f.kind === 'boolean') {
          const s = String(rawVal).trim().toLowerCase();
          fields[f.key] = s === 'true' || s === 'yes' || s === 'sim' || s === '1';
        } else {
          fields[f.key] = String(rawVal).trim();
        }
      }
    }

    if (!id) {
      id = title || `row-${i + 1}`;
    }
    if (!title) {
      title = id;
    }

    const phaseMatch = phaseByName.get(phaseName.toLowerCase());
    const phaseId = phaseMatch?.id ?? phaseName;
    const done = phaseMatch?.done ?? Boolean(finishedAt);

    let leadTimeHours: number | null = null;
    if (createdAtMs !== null && finishedAt) {
      const finMs = Date.parse(finishedAt);
      if (!Number.isNaN(finMs) && finMs >= createdAtMs) {
        leadTimeHours = Math.round(((finMs - createdAtMs) / 3_600_000) * 100) / 100;
      }
    }

    result[i] = {
      id,
      title,
      phaseId,
      phaseName: phaseName || 'Concluded',
      done,
      late,
      expired,
      createdAt,
      createdAtMs,
      updatedAt,
      finishedAt,
      dueDate,
      dueDateMs,
      assignees,
      labels,
      createdBy,
      leadTimeHours,
      fields,
      searchText: buildSearchText(id, title, phaseName, fields, assignees, labels),
    };
  }

  return result;
}
