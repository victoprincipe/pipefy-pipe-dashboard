'use client';

import { useMemo } from 'react';
import {
  CircleDollarSign,
  Layers,
  ListTree,
  ToggleRight,
} from 'lucide-react';
import { useDuckDbQuery } from '@/hooks/useDuckDb';
import type { PipefySqlDataset } from '@/types/pipefySql';
import { formatMetricValue } from '@/utils/chartSemantics';
import { buildExecutiveSummaryQuery } from '@/utils/duckDbChartUtils';

interface ExecutiveSummaryStripProps {
  dataset?: PipefySqlDataset | null;
}

interface SummaryRow extends Record<string, unknown> {
  total_records?: number;
  dimension_groups?: number;
  boolean_true?: number;
  boolean_total?: number;
  total_value?: number;
  avg_value?: number;
}

/**
 * Compact executive KPI strip summarizing the active dataset: record count,
 * primary dimension, boolean health signal and financial volume when applicable.
 */
export function ExecutiveSummaryStrip({ dataset }: ExecutiveSummaryStripProps) {
  const spec = useMemo(
    () => buildExecutiveSummaryQuery(dataset),
    [dataset]
  );

  const datasetKey = dataset
    ? `${dataset.cacheKey}:${dataset.syncedAt}:${dataset.rowsCount}`
    : '';

  const { rows, loading } = useDuckDbQuery<SummaryRow>(spec?.sql ?? null, {
    enabled: Boolean(spec),
    depsKey: `exec-summary:${datasetKey}`,
  });

  if (!dataset || !spec) return null;

  const row = rows[0];
  const totalRecords = Number(row?.total_records ?? dataset.rowsCount);
  const dimensionGroups = Number(row?.dimension_groups ?? 0);
  const booleanTrue = Number(row?.boolean_true ?? 0);
  const booleanTotal = Number(row?.boolean_total ?? 0);
  const totalValue = Number(row?.total_value ?? 0);
  const avgValue = Number(row?.avg_value ?? 0);

  const booleanPct =
    booleanTotal > 0 ? Math.round((booleanTrue / booleanTotal) * 1000) / 10 : 0;

  return (
    <section
      aria-label="Resumo executivo do conjunto de dados"
      className="pf-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <div className="flex items-start justify-between rounded-pf-card border border-border-subtle bg-surface px-4 py-3.5 shadow-pf-card">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
            {spec.totalLabel}
          </span>
          <p className="mt-1 text-2xl font-bold text-ink">
            {totalRecords.toLocaleString('pt-BR')}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-secondary">
            {dataset.name ?? dataset.pipeName}
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pf-panel bg-brand-soft text-brand">
          <Layers className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      {spec.hasDimensionCol && (
        <div className="flex items-start justify-between rounded-pf-card border border-border-subtle bg-surface px-4 py-3.5 shadow-pf-card">
          <div>
            <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
              {spec.dimensionLabel || 'Dimensão principal'}
            </span>
            <p className="mt-1 text-2xl font-bold text-ink">
              {loading ? '—' : dimensionGroups.toLocaleString('pt-BR')}
            </p>
            <p className="mt-0.5 text-xs text-ink-secondary">
              {loading
                ? 'Calculando...'
                : `${dimensionGroups === 1 ? 'grupo distinto' : 'grupos distintos'}`}
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pf-panel bg-brand-soft text-brand">
            <ListTree className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      )}

      {spec.hasBooleanCol && (
        <div className="flex items-start justify-between rounded-pf-card border border-border-subtle bg-surface px-4 py-3.5 shadow-pf-card">
          <div>
            <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
              {spec.booleanLabel || 'Indicador Sim/Não'}
            </span>
            <p className="mt-1 text-2xl font-bold text-ink">
              {loading ? '—' : booleanTrue.toLocaleString('pt-BR')}
            </p>
            <p className="mt-0.5 text-xs font-medium text-ink-secondary">
              {loading
                ? 'Calculando...'
                : `${booleanPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${spec.booleanTrueLabel ?? 'positivos'}`}
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pf-panel bg-pf-green-100 text-pf-green-dark-1">
            <ToggleRight className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      )}

      {spec.hasCurrencyCol && (
        <div className="flex items-start justify-between rounded-pf-card border border-border-subtle bg-surface px-4 py-3.5 shadow-pf-card">
          <div className="min-w-0">
            <span className="block truncate text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
              {spec.currencyLabel || 'Volume financeiro'}
            </span>
            <p className="mt-1 truncate text-2xl font-bold text-ink">
              {loading
                ? '—'
                : formatMetricValue(totalValue, 'currency_brl', {
                    compact: true,
                  })}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-secondary">
              {loading
                ? 'Calculando...'
                : `Média: ${formatMetricValue(avgValue, 'currency_brl')}`}
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pf-panel bg-brand-soft text-brand">
            <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      )}
    </section>
  );
}
