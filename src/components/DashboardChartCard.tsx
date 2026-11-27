'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  AreaChart as AreaChartIcon,
  BarChart3,
  BarChartHorizontal,
  Copy,
  Download,
  Gauge,
  Loader2,
  Pencil,
  PieChart as PieChartIcon,
  Radar as RadarIcon,
  RefreshCw,
  Table2,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { ChartRenderer } from '@/components/ChartRenderer';
import { useDuckDbQuery } from '@/hooks/useDuckDb';
import type {
  DashboardChartConfig,
  DashboardChartType,
} from '@/types/dashboardViews';
import type { PipefySqlDataset } from '@/types/pipefySql';
import { resolveChartConfig } from '@/utils/chartConfigResolver';
import {
  formatMetricValue,
  generateChartTakeaway,
  getChartTypeLabel,
} from '@/utils/chartSemantics';
import {
  buildChartQuerySpec,
  DATE_RANGE_PRESET_OPTIONS,
  mapDuckDbRowsToChartResult,
} from '@/utils/duckDbChartUtils';

interface DashboardChartCardProps {
  chart: DashboardChartConfig;
  dataset?: PipefySqlDataset | null;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  /** Called when the user must adjust an unresolvable chart. */
  onFix?: () => void;
  /** Called to point the chart at the active dataset. */
  onAdaptToDataset?: () => void;
  /** Stagger (ms) applied to the card entrance animation. */
  revealDelay?: number;
}

function ChartHeaderIcon({
  type,
  loading,
}: {
  type: DashboardChartType;
  loading: boolean;
}) {
  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  }
  switch (type) {
    case 'horizontalBar':
      return <BarChartHorizontal className="h-4 w-4" aria-hidden="true" />;
    case 'line':
      return <TrendingUp className="h-4 w-4" aria-hidden="true" />;
    case 'area':
      return <AreaChartIcon className="h-4 w-4" aria-hidden="true" />;
    case 'pie':
      return <PieChartIcon className="h-4 w-4" aria-hidden="true" />;
    case 'kpi':
      return <Gauge className="h-4 w-4" aria-hidden="true" />;
    case 'radar':
    case 'radialBar':
      return <RadarIcon className="h-4 w-4" aria-hidden="true" />;
    case 'bar':
    default:
      return <BarChart3 className="h-4 w-4" aria-hidden="true" />;
  }
}

function formatFilterBadge(
  colLabel: string,
  operator: string,
  value?: string
): string {
  switch (operator) {
    case 'is_empty':
      return `${colLabel}: vazio`;
    case 'not_empty':
      return `${colLabel}: preenchido`;
    case 'equals':
      return `${colLabel} = "${value ?? ''}"`;
    case 'not_equals':
      return `${colLabel} ≠ "${value ?? ''}"`;
    case 'not_contains':
      return `${colLabel} não contém "${value ?? ''}"`;
    case 'gt':
      return `${colLabel} > ${value ?? ''}`;
    case 'gte':
      return `${colLabel} ≥ ${value ?? ''}`;
    case 'lt':
      return `${colLabel} < ${value ?? ''}`;
    case 'lte':
      return `${colLabel} ≤ ${value ?? ''}`;
    case 'contains':
    default:
      return `${colLabel} ~ "${value ?? ''}"`;
  }
}

function exportPointsToCsv(
  title: string,
  valueLabel: string,
  points: ReturnType<typeof mapDuckDbRowsToChartResult>['points']
) {
  const escapeCsv = (val: string | number) => {
    const str = String(val);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    ['Categoria', valueLabel, 'Participacao (%)', 'Cards'].map(escapeCsv).join(';'),
    ...points.map((pt) =>
      [
        pt.name,
        pt.value,
        pt.sharePct !== null ? pt.sharePct.toFixed(1).replace('.', ',') : '',
        pt.cardCount,
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  anchor.href = url;
  anchor.download = `${slug || 'grafico'}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Executive dashboard card powered by DuckDB-WASM and Recharts, presenting headline KPIs,
 * generated business takeaways, semantic formatting, table toggle, and CSV export.
 */
export function DashboardChartCard({
  chart,
  dataset,
  onEdit,
  onDuplicate,
  onRemove,
  onFix,
  onAdaptToDataset,
  revealDelay = 0,
}: DashboardChartCardProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const datasetKey = dataset
    ? `${dataset.cacheKey}:${dataset.syncedAt}:${dataset.rowsCount}`
    : '';

  const resolution = useMemo(
    () => resolveChartConfig(dataset, chart),
    [chart, dataset]
  );

  const querySpec = useMemo(
    () => buildChartQuerySpec(dataset, chart, { resolved: resolution }),
    [chart, dataset, resolution]
  );

  const { rows, columns, loading, error, refetch } = useDuckDbQuery<
    Record<string, unknown>
  >(resolution.canRender ? querySpec.sql : null, {
    depsKey: `${datasetKey || 'standalone-sample'}:${chart.id}`,
  });

  const { points, summary, seriesKeys } = useMemo(
    () =>
      mapDuckDbRowsToChartResult(rows, {
        isDateAxis: querySpec.isDateAxis,
        dateGranularity: querySpec.dateGranularity,
        isAdditive: querySpec.isAdditive,
        splitMultiValue: querySpec.splitMultiValueApplied,
        columns,
      }),
    [
      columns,
      querySpec.dateGranularity,
      querySpec.isAdditive,
      querySpec.isDateAxis,
      querySpec.splitMultiValueApplied,
      rows,
    ]
  );

  const displayTitle =
    chart.title?.trim() ||
    (resolution.canRender ? querySpec.chartTitle : 'Gráfico precisa de ajuste');
  const displaySubtitle =
    chart.subtitle?.trim() ||
    (resolution.canRender
      ? querySpec.baseSubtitle
      : resolution.issues.some((issue) => issue.code === 'dataset_mismatch')
        ? 'Este gráfico pertence a outro arquivo.'
        : 'Alguns campos não existem no arquivo atual.');

  const blockingIssues = resolution.issues.filter(
    (issue) => issue.severity === 'error' || issue.code === 'dataset_mismatch'
  );
  const remapIssues = resolution.issues.filter(
    (issue) => issue.code === 'column_remapped'
  );
  const isDatasetMismatch = resolution.issues.some(
    (issue) => issue.code === 'dataset_mismatch'
  );

  const takeaway = useMemo(
    () =>
      generateChartTakeaway({
        chartType: querySpec.chartType,
        aggregation: querySpec.aggregation,
        valueFormat: querySpec.valueFormat,
        isDateAxis: querySpec.isDateAxis,
        splitMultiValue: querySpec.splitMultiValueApplied,
        points,
        summary,
      }),
    [
      points,
      querySpec.aggregation,
      querySpec.chartType,
      querySpec.isDateAxis,
      querySpec.splitMultiValueApplied,
      querySpec.valueFormat,
      summary,
    ]
  );

  const activeFilterBadges = useMemo(() => {
    const badges: string[] = [];
    if (chart.dateRangePreset && chart.dateRangePreset !== 'all') {
      const presetLabel =
        DATE_RANGE_PRESET_OPTIONS.find((p) => p.value === chart.dateRangePreset)
          ?.label ?? chart.dateRangePreset;
      badges.push(presetLabel);
    }

    if (chart.filters && chart.filters.length > 0) {
      for (const f of chart.filters) {
        const colLabel =
          dataset?.columns.find((c) => c.name === f.column)?.label ?? f.column;
        badges.push(formatFilterBadge(colLabel, f.operator, f.value));
      }
    } else if (chart.filterColumn && chart.filterValue) {
      const colLabel =
        dataset?.columns.find((c) => c.name === chart.filterColumn)?.label ??
        chart.filterColumn;
      badges.push(formatFilterBadge(colLabel, 'contains', chart.filterValue));
    }

    return badges;
  }, [
    chart.dateRangePreset,
    chart.filterColumn,
    chart.filterValue,
    chart.filters,
    dataset?.columns,
  ]);

  const footnotes = useMemo(() => {
    const notes: string[] = [];
    if (
      querySpec.chartType !== 'kpi' &&
      !querySpec.isDateAxis &&
      summary.totalGroups > querySpec.limitApplied
    ) {
      notes.push(
        querySpec.groupOthersApplied
          ? `Exibindo Top ${querySpec.limitApplied} de ${summary.totalGroups} grupos (restante consolidado em "Outros").`
          : `Exibindo Top ${querySpec.limitApplied} de ${summary.totalGroups} grupos.`
      );
    }
    if (querySpec.splitMultiValueApplied) {
      notes.push(
        'Itens múltiplos foram separados individualmente (a soma dos grupos pode superar o total de cards).'
      );
    }
    if (summary.excludedEmptyCount > 0) {
      notes.push(
        `${summary.excludedEmptyCount.toLocaleString('pt-BR')} ${
          summary.excludedEmptyCount === 1
            ? 'registro sem preenchimento oculto'
            : 'registros sem preenchimento ocultos'
        }.`
      );
    }
    return notes;
  }, [
    querySpec.chartType,
    querySpec.groupOthersApplied,
    querySpec.isDateAxis,
    querySpec.limitApplied,
    querySpec.splitMultiValueApplied,
    summary.excludedEmptyCount,
    summary.totalGroups,
  ]);

  const headlineLabel = querySpec.isAdditive
    ? querySpec.aggregation === 'count'
      ? 'Total de cards'
      : `Total · ${querySpec.metricLabel ?? querySpec.valueLabel}`
    : querySpec.valueLabel;

  return (
    <section
      className="pf-reveal pf-lift flex w-full flex-col rounded-pf-card border border-border-subtle bg-surface p-5 shadow-pf-card"
      style={{ animationDelay: `${revealDelay}ms` }}
    >
      <header className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pf-panel border border-border-subtle bg-canvas text-brand">
            <ChartHeaderIcon type={querySpec.chartType} loading={loading} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
              {getChartTypeLabel(querySpec.chartType)}
              {querySpec.groupByLabel ? ` · ${querySpec.groupByLabel}` : ''}
            </span>
            <h2
              className="mt-0.5 truncate text-pf-h5 text-ink"
              title={displayTitle}
            >
              {displayTitle}
            </h2>
            <p className="text-pf-caption text-ink-secondary">
              {displaySubtitle}
            </p>
            {remapIssues.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {remapIssues.map((issue, idx) => (
                  <span
                    key={`${issue.field}-${idx}`}
                    className="inline-flex items-center rounded-full bg-pf-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-pf-yellow-dark-2"
                    title={issue.message}
                  >
                    Adaptado: {issue.missingColumn} → {issue.resolvedColumn}
                  </span>
                ))}
              </div>
            )}
            {activeFilterBadges.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {activeFilterBadges.map((badge, idx) => (
                  <span
                    key={`${badge}-${idx}`}
                    className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {querySpec.chartType !== 'kpi' && (
            <button
              type="button"
              onClick={() =>
                setViewMode((prev) => (prev === 'chart' ? 'table' : 'chart'))
              }
              aria-label={
                viewMode === 'chart' ? 'Ver como tabela' : 'Ver como gráfico'
              }
              title={
                viewMode === 'chart' ? 'Ver como tabela' : 'Ver como gráfico'
              }
              className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pf-control border transition ${
                viewMode === 'table'
                  ? 'border-brand/40 bg-brand-soft text-brand'
                  : 'border-border-subtle bg-canvas text-ink-secondary hover:border-border-strong hover:text-ink'
              }`}
            >
              {viewMode === 'table' ? (
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          )}

          {points.length > 0 && (
            <button
              type="button"
              onClick={() =>
                exportPointsToCsv(displayTitle, querySpec.valueLabel, points)
              }
              aria-label={`Exportar dados de ${displayTitle} em CSV`}
              title="Exportar CSV"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pf-control border border-border-subtle bg-canvas text-ink-secondary transition hover:border-border-strong hover:text-ink"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Editar gráfico ${displayTitle}`}
              title="Editar gráfico"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pf-control border border-border-subtle bg-canvas text-ink-secondary transition hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              aria-label={`Duplicar gráfico ${displayTitle}`}
              title="Duplicar gráfico"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pf-control border border-border-subtle bg-canvas text-ink-secondary transition hover:border-border-strong hover:text-ink"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remover gráfico ${displayTitle}`}
              title="Remover gráfico"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pf-control border border-border-subtle bg-canvas text-ink-secondary transition hover:border-pf-red/40 hover:bg-pf-red-100 hover:text-pf-red"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {!resolution.canRender && (
        <div className="flex flex-col gap-3 rounded-pf-panel border border-pf-yellow bg-pf-yellow-100 px-4 py-3.5 text-pf-yellow-dark-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold">
                {isDatasetMismatch
                  ? 'Este gráfico pertence a outro arquivo'
                  : 'Este gráfico precisa de ajuste'}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-snug">
                {blockingIssues.length > 0 ? (
                  blockingIssues.map((issue, idx) => (
                    <li key={`${issue.field}-${idx}`}>{issue.message}</li>
                  ))
                ) : (
                  <li>Não foi possível resolver os campos deste gráfico.</li>
                )}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDatasetMismatch && onAdaptToDataset && (
              <button
                type="button"
                onClick={onAdaptToDataset}
                className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control bg-brand px-3 py-1.5 text-[11px] font-semibold text-pf-white transition hover:bg-brand-shade"
              >
                Apontar para este arquivo
              </button>
            )}
            {(onFix ?? onEdit) && (
              <button
                type="button"
                onClick={onFix ?? onEdit}
                className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control border border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink transition hover:border-brand/40 hover:text-brand"
              >
                Ajustar gráfico
              </button>
            )}
          </div>
        </div>
      )}

      {!error && !loading && points.length > 0 && querySpec.chartType !== 'kpi' && (
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2 rounded-pf-panel border border-border-subtle bg-canvas/70 px-3.5 py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="text-lg font-bold text-ink">
              {formatMetricValue(summary.grandTotal, querySpec.valueFormat)}
            </span>
            <span className="text-[11px] font-medium text-ink-secondary">
              {headlineLabel}
              {summary.totalCards > 0
                ? ` · ${summary.totalCards.toLocaleString('pt-BR')} cards`
                : ''}
              {summary.allDatasetCards > 0 && summary.pctOfPipe < 99.9
                ? ` (${summary.pctOfPipe.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do pipe)`
                : ''}
            </span>
          </div>
          {takeaway && (
            <p className="w-full text-xs leading-relaxed text-ink-secondary">
              {takeaway}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-pf-panel border border-pf-red bg-pf-red-100 px-3 py-2 text-xs text-pf-red">
          <span>Não foi possível gerar esta visualização: {error}</span>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex cursor-pointer items-center gap-1 rounded-pf-control bg-surface px-2 py-1 font-semibold text-ink transition hover:bg-canvas"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            <span>Tentar novamente</span>
          </button>
        </div>
      )}

      {!resolution.canRender ? null : !loading && !error && points.length === 0 ? (
        <div className="flex h-64 w-full items-center justify-center rounded-pf-panel border border-dashed border-border-subtle bg-canvas px-4 text-center text-pf-body-2 text-ink-secondary">
          Nenhum card corresponde aos critérios deste gráfico.
        </div>
      ) : viewMode === 'table' && querySpec.chartType !== 'kpi' ? (
        <div className="max-h-72 overflow-auto rounded-pf-panel border border-border-subtle">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-canvas text-ink">
              <tr>
                <th className="border-b border-border-subtle px-3 py-2 font-semibold">
                  {querySpec.groupByLabel ?? 'Categoria'}
                </th>
                <th className="border-b border-border-subtle px-3 py-2 text-right font-semibold">
                  {querySpec.valueLabel}
                </th>
                {querySpec.isAdditive && (
                  <th className="border-b border-border-subtle px-3 py-2 text-right font-semibold">
                    {querySpec.splitMultiValueApplied ? '% dos cards' : '% do total'}
                  </th>
                )}
                {querySpec.aggregation !== 'count' && (
                  <th className="border-b border-border-subtle px-3 py-2 text-right font-semibold">
                    Cards
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface text-ink-secondary">
              {points.map((pt, idx) => (
                <tr key={`${pt.name}-${idx}`} className="hover:bg-canvas">
                  <td className="px-3 py-2 font-medium text-ink">{pt.name}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-ink">
                    {formatMetricValue(pt.value, querySpec.valueFormat)}
                  </td>
                  {querySpec.isAdditive && (
                    <td className="px-3 py-2 text-right font-mono">
                      {pt.sharePct !== null
                        ? `${pt.sharePct.toLocaleString('pt-BR', {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}%`
                        : '—'}
                    </td>
                  )}
                  {querySpec.aggregation !== 'count' && (
                    <td className="px-3 py-2 text-right font-mono">
                      {pt.cardCount.toLocaleString('pt-BR')}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ChartRenderer
          chartType={querySpec.chartType}
          points={points}
          summary={summary}
          valueLabel={querySpec.valueLabel}
          valueFormat={querySpec.valueFormat}
          isAdditive={querySpec.isAdditive}
          isDateAxis={querySpec.isDateAxis}
          splitMultiValue={querySpec.splitMultiValueApplied}
          aggregation={querySpec.aggregation}
          showAverageLine={chart.showAverageLine}
          seriesKeys={seriesKeys}
          stackMode={querySpec.stackMode}
          height={280}
        />
      )}

      {footnotes.length > 0 && resolution.canRender && !error && points.length > 0 && (
        <p className="mt-3 border-t border-border-subtle pt-2.5 text-[11px] text-ink-secondary">
          {footnotes.join(' ')}
        </p>
      )}
    </section>
  );
}
