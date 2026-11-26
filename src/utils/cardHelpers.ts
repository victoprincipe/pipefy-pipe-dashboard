import type { DateGranularity } from '../types/dashboard';
import type { NormalizedCard } from '../types/pipefy';
import { parseFlexibleDate } from './xlsxNormalizer';

export const PT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function getCardRawValue(
  card: NormalizedCard,
  fieldKey: string
): string | number | boolean | null {
  switch (fieldKey) {
    case '__id':
      return card.id;
    case '__title':
      return card.title;
    case '__phase':
      return card.phaseName || 'Sem fase';
    case '__status':
      return card.done ? 'Concluído' : 'Em andamento';
    case '__sla':
      return card.expired ? 'Expirado' : card.late ? 'Atrasado' : 'No prazo';
    case '__createdAt':
      return card.createdAt;
    case '__finishedAt':
      return card.finishedAt;
    case '__dueDate':
      return card.dueDate;
    case '__createdBy':
      return card.createdBy || 'Não informado';
    case '__assignee':
      return card.assignees.length > 0 ? card.assignees[0] : 'Sem responsável';
    case '__label':
      return card.labels.length > 0 ? card.labels[0] : 'Sem etiqueta';
    case '__leadTimeHours':
      return card.leadTimeHours;
    default: {
      const val = card.fields[fieldKey];
      return val === undefined ? null : val;
    }
  }
}

export function formatDateBucket(
  raw: string | number | boolean | null,
  granularity: DateGranularity = 'month'
): { key: string; label: string } | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const { ms } = parseFlexibleDate(raw);
  if (ms === null) return null;

  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-11
  const day = d.getUTCDate();

  switch (granularity) {
    case 'year': {
      const k = String(year);
      return { key: k, label: k };
    }
    case 'quarter': {
      const q = Math.floor(month / 3) + 1;
      return { key: `${year}-Q${q}`, label: `T${q}/${year}` };
    }
    case 'month': {
      const mo = String(month + 1).padStart(2, '0');
      return { key: `${year}-${mo}`, label: `${PT_MONTHS[month]}/${String(year).slice(-2)}` };
    }
    case 'week': {
      // ISO week start (Monday)
      const dayOfWeek = d.getUTCDay() || 7;
      const monday = new Date(Date.UTC(year, month, day - dayOfWeek + 1));
      const mY = monday.getUTCFullYear();
      const mM = String(monday.getUTCMonth() + 1).padStart(2, '0');
      const mD = String(monday.getUTCDate()).padStart(2, '0');
      return { key: `${mY}-${mM}-${mD}`, label: `${mD}/${mM}/${String(mY).slice(-2)}` };
    }
    case 'day': {
      const mo = String(month + 1).padStart(2, '0');
      const da = String(day).padStart(2, '0');
      return { key: `${year}-${mo}-${da}`, label: `${da}/${mo}/${String(year).slice(-2)}` };
    }
  }
}

/**
 * Formats canonical SQL date bucket keys (e.g., '2027-01', '2027-Q1', '2027-01-15', '__sem_data')
 * into localized Portuguese chart labels.
 */
export function formatDateBucketKeyLabel(
  key: string,
  granularity: DateGranularity = 'month'
): string {
  if (!key || key === '__sem_data') return 'Sem data';

  switch (granularity) {
    case 'year':
      return key;
    case 'quarter': {
      const m = key.match(/^(\d{4})-Q(\d)$/);
      return m ? `T${m[2]}/${m[1]}` : key;
    }
    case 'month': {
      const m = key.match(/^(\d{4})-(\d{2})$/);
      if (!m) return key;
      const moIdx = Number(m[2]) - 1;
      const monthName = PT_MONTHS[moIdx] ?? m[2];
      return `${monthName}/${m[1].slice(-2)}`;
    }
    case 'week':
    case 'day': {
      const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}/${m[2]}/${m[1].slice(-2)}` : key;
    }
  }
}

export function formatCompactRangeEdge(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}
