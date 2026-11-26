import type { AggregationOp, AggregatedPoint } from '../types/dashboard';
import type { NormalizedCard, PipeSchema } from '../types/pipefy';
import { getCardRawValue } from './cardHelpers';

export function formatMetricValue(
  value: number,
  op: AggregationOp,
  asCurrency?: boolean
): string {
  if (!Number.isFinite(value)) return '0';
  if (op === 'count' || op === 'distinct') {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
  }
  if (asCurrency) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
    }).format(value);
  }
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompactNumber(value: number, asCurrency?: boolean): string {
  if (!Number.isFinite(value)) return '0';
  const prefix = asCurrency ? 'R$ ' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(1)}k`;
  return `${prefix}${Math.round(value)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatRelativeAge(ageMs: number): string {
  if (ageMs < 5000) return 'agora';
  const sec = Math.round(ageMs / 1000);
  if (sec < 60) return `há ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.round(min / 60);
  return `há ${hr}h`;
}

function escapeCsvCell(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAggregatedCsv(title: string, points: AggregatedPoint[]) {
  const safeName = title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  downloadCsv(
    `${safeName || 'grafico'}.csv`,
    ['Categoria', 'Valor', 'Cards', 'Participacao (%)'],
    points.map((p) => [p.label, p.value, p.count, p.sharePercent])
  );
}

export function exportCardsCsv(filename: string, cards: NormalizedCard[], schema: PipeSchema) {
  const customFields = schema.fields.filter((f) => !f.isBuiltIn);
  const headers = ['ID', 'Titulo', 'Fase', 'Criado em', ...customFields.map((f) => f.label)];
  const rows = cards.map((card) => [
    card.id,
    card.title,
    card.phaseName,
    card.createdAt ?? '',
    ...customFields.map((f) => getCardRawValue(card, f.key) ?? ''),
  ]);
  downloadCsv(filename, headers, rows);
}
