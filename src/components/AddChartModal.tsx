'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Info,
  Loader2,
  Plus,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ChartRenderer } from '@/components/ChartRenderer';
import { useDuckDbQuery } from '@/hooks/useDuckDb';
import {
  type ChartDateRangePreset,
  type ChartFilterOperator,
  type ChartSortOrder,
  type ChartValueFormat,
  type DashboardChartAggregation,
  type DashboardChartConfig,
  type DashboardChartDataMode,
  type DashboardChartFilter,
  type DashboardChartType,
  type ChartStackMode,
  type DateGranularity,
  type SampleDatasetPresetId,
} from '@/types/dashboardViews';
import {
  getChartTypeDefinition,
  getChartTypeOptions,
} from '@/components/charts/chartTypeRegistry';
import {
  loadColumnRoleOverrides,
  saveColumnRoleOverrides,
  type ColumnRoleOverrides,
} from '@/lib/columnRoleOverrides';
import { resolveChartConfig } from '@/utils/chartConfigResolver';
import type { PipefySqlDataset } from '@/types/pipefySql';
import {
  analyzeChartSanity,
  type ChartTemplate,
  type ColumnSemanticRole,
  generateChartTakeaway,
  generateRecommendedTemplates,
  getChartTypeLabel,
  profileDatasetColumns,
} from '@/utils/chartSemantics';
import {
  AGGREGATION_OPTIONS,
  buildChartQuerySpec,
  buildDistinctValuesQuery,
  COUNT_METRIC_VALUE,
  DATE_GRANULARITY_OPTIONS,
  DATE_RANGE_PRESET_OPTIONS,
  getDefaultChartSelection,
  mapDuckDbRowsToChartResult,
  SAMPLE_DATASET_PRESETS,
} from '@/utils/duckDbChartUtils';

interface AddChartModalProps {
  open: boolean;
  viewName: string;
  dataset?: PipefySqlDataset | null;
  initialChart?: DashboardChartConfig | null;
  onClose: () => void;
  onSaveChart: (config: Omit<DashboardChartConfig, 'id'>) => void;
}

const FILTER_OPERATOR_OPTIONS: ReadonlyArray<{
  value: ChartFilterOperator;
  label: string;
  needsValue: boolean;
}> = [  { value: 'equals', label: 'É igual a', needsValue: true },
  { value: 'not_equals', label: 'Diferente de', needsValue: true },
  { value: 'contains', label: 'Contém', needsValue: true },
  { value: 'not_contains', label: 'Não contém', needsValue: true },
  { value: 'not_empty', label: 'Está preenchido', needsValue: false },
  { value: 'is_empty', label: 'Está vazio', needsValue: false },
  { value: 'gt', label: 'Maior que (>)', needsValue: true },
  { value: 'gte', label: 'Maior ou igual (>=)', needsValue: true },
  { value: 'lt', label: 'Menor que (<)', needsValue: true },
  { value: 'lte', label: 'Menor ou igual (<=)', needsValue: true },
];

const ROLE_OVERRIDE_OPTIONS: ReadonlyArray<{
  value: ColumnSemanticRole | '';
  label: string;
}> = [
  { value: '', label: 'Automático' },
  { value: 'identifier', label: 'Identificador' },
  { value: 'currency', label: 'Moeda' },
  { value: 'percent', label: 'Percentual' },
  { value: 'date', label: 'Data' },
  { value: 'category', label: 'Categoria' },
  { value: 'status', label: 'Status' },
  { value: 'number', label: 'Número' },
  { value: 'boolean', label: 'Sim/Não' },
  { value: 'duration', label: 'Duração' },
];

function ChartTypeIcon({
  type,
  className,
}: {
  type: DashboardChartType;
  className?: string;
}) {
  const Icon = getChartTypeDefinition(type).icon;
  return <Icon className={className} aria-hidden="true" />;
}

function isOutsideDialogBounds(
  clientX: number,
  clientY: number,
  dialog: HTMLDialogElement
): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  );
}

function resolveInitialFilters(
  initialChart?: DashboardChartConfig | null
): DashboardChartFilter[] {
  if (initialChart?.filters && initialChart.filters.length > 0) {
    return initialChart.filters.map((f) => ({ ...f }));
  }
  if (initialChart?.filterColumn && initialChart.filterValue) {
    return [
      {
        id: 'legacy-filter-1',
        column: initialChart.filterColumn,
        operator: 'contains',
        value: initialChart.filterValue,
      },
    ];
  }
  return [];
}

function FilterRowEditor({
  filter,
  dataset,
  onChange,
  onRemove,
}: {
  filter: DashboardChartFilter;
  dataset: PipefySqlDataset;
  onChange: (patch: Partial<DashboardChartFilter>) => void;
  onRemove: () => void;
}) {
  const datalistId = useId();
  const opMeta =
    FILTER_OPERATOR_OPTIONS.find((o) => o.value === filter.operator) ??
    FILTER_OPERATOR_OPTIONS[0];

  const distinctSql = useMemo(
    () =>
      opMeta.needsValue
        ? buildDistinctValuesQuery(dataset, filter.column, 40)
        : null,
    [dataset, filter.column, opMeta.needsValue]
  );

  const { rows: suggestionRows } = useDuckDbQuery<{ value?: unknown }>(
    distinctSql,
    {
      enabled: Boolean(distinctSql),
      depsKey: `filter-suggestions:${dataset.cacheKey}:${filter.column}`,
    }
  );

  const suggestions = useMemo(() => {
    const out: string[] = [];
    for (const row of suggestionRows) {
      if (row.value !== null && row.value !== undefined) {
        const s = String(row.value).trim();
        if (s && !out.includes(s)) out.push(s);
      }
    }
    return out;
  }, [suggestionRows]);

  return (
    <div className="grid grid-cols-1 gap-2 rounded-pf-control border border-border-subtle bg-surface p-2.5 sm:grid-cols-12">
      <select
        aria-label="Coluna do filtro"
        value={filter.column}
        onChange={(e) => onChange({ column: e.target.value })}
        className="rounded-pf-control border border-border-subtle bg-canvas px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none sm:col-span-4"
      >
        {dataset.columns.map((col) => (
          <option key={col.name} value={col.name}>
            {col.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Condição do filtro"
        value={filter.operator}
        onChange={(e) =>
          onChange({ operator: e.target.value as ChartFilterOperator })
        }
        className="rounded-pf-control border border-border-subtle bg-canvas px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none sm:col-span-4"
      >
        {FILTER_OPERATOR_OPTIONS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5 sm:col-span-4">
        {opMeta.needsValue ? (
          <>
            <input
              type="text"
              list={datalistId}
              value={filter.value ?? ''}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="Valor..."
              className="w-full min-w-0 rounded-pf-control border border-border-subtle bg-canvas px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-icon focus:border-brand focus:outline-none"
            />
            <datalist id={datalistId}>
              {suggestions.map((val) => (
                <option key={val} value={val} />
              ))}
            </datalist>
          </>
        ) : (
          <span className="flex-1 px-1 text-[11px] text-ink-secondary">
            Sem valor necessário
          </span>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover filtro"
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-pf-control text-ink-icon transition hover:bg-pf-red-100 hover:text-pf-red"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function AddChartModalForm({
  viewName,
  dataset,
  initialChart,
  onClose,
  onSaveChart,
}: Omit<AddChartModalProps, 'open'>) {
  const isEditing = Boolean(initialChart);
  const hasDataset = Boolean(dataset && dataset.columns.length > 0);
  const defaults = useMemo(
    () => (dataset ? getDefaultChartSelection(dataset) : null),
    [dataset]
  );

  const [chartType, setChartType] = useState<DashboardChartType>(
    initialChart?.type ?? 'horizontalBar'
  );
  const [title, setTitle] = useState(initialChart?.title ?? '');
  const [subtitle, setSubtitle] = useState(initialChart?.subtitle ?? '');
  const [dataMode, setDataMode] = useState<DashboardChartDataMode>(
    initialChart?.dataMode ?? 'builder'
  );
  const [selectedGroupBy, setSelectedGroupBy] = useState(
    initialChart?.groupBy ?? ''
  );
  const [selectedMetric, setSelectedMetric] = useState(
    initialChart?.metric ?? ''
  );
  const [selectedAggregation, setSelectedAggregation] = useState<
    DashboardChartAggregation | ''
  >(initialChart?.aggregation ?? '');
  const [filters, setFilters] = useState<DashboardChartFilter[]>(() =>
    resolveInitialFilters(initialChart)
  );
  const [dateGranularity, setDateGranularity] = useState<DateGranularity>(
    initialChart?.dateGranularity ?? 'month'
  );
  const [dateRangeColumn, setDateRangeColumn] = useState(
    initialChart?.dateRangeColumn ?? ''
  );
  const [dateRangePreset, setDateRangePreset] = useState<ChartDateRangePreset>(
    initialChart?.dateRangePreset ?? 'all'
  );
  const [sortBy, setSortBy] = useState<ChartSortOrder>(
    initialChart?.sortBy ?? 'value_desc'
  );
  const [limit, setLimit] = useState<number>(
    initialChart?.limit ?? (initialChart?.type === 'pie' ? 6 : 10)
  );
  const [excludeEmpty, setExcludeEmpty] = useState<boolean>(
    initialChart?.excludeEmpty ?? true
  );
  const [groupOthers, setGroupOthers] = useState<boolean>(
    initialChart?.groupOthers ?? true
  );
  const [splitMultiValue, setSplitMultiValue] = useState<boolean | undefined>(
    initialChart?.splitMultiValue
  );
  const [selectedBreakdownBy, setSelectedBreakdownBy] = useState(
    initialChart?.breakdownBy ?? ''
  );
  const [stackMode, setStackMode] = useState<ChartStackMode>(
    initialChart?.stackMode ?? 'stacked'
  );
  const [roleOverrides, setRoleOverrides] = useState<ColumnRoleOverrides>(() =>
    dataset?.datasetId ? loadColumnRoleOverrides(dataset.datasetId) : {}
  );
  const [valueFormat, setValueFormat] = useState<ChartValueFormat>(
    initialChart?.valueFormat ?? 'auto'
  );
  const [showAverageLine, setShowAverageLine] = useState<boolean>(
    initialChart?.showAverageLine ?? false
  );
  const [span, setSpan] = useState<1 | 2>(initialChart?.span ?? 1);
  const [samplePreset, setSamplePreset] = useState<SampleDatasetPresetId>(
    initialChart?.samplePreset ?? 'cards_by_phase'
  );
  const [customSql, setCustomSql] = useState(initialChart?.customSql ?? '');

  const profiles = useMemo(
    () => (dataset ? profileDatasetColumns(dataset.columns, roleOverrides) : []),
    [dataset, roleOverrides]
  );

  const groupedColumns = useMemo(() => {
    const dimension = profiles.filter((p) => p.groupCategory === 'dimension');
    const date = profiles.filter((p) => p.groupCategory === 'date');
    const metric = profiles.filter((p) => p.groupCategory === 'metric');
    const identifier = profiles.filter((p) => p.groupCategory === 'identifier');
    return { dimension, date, metric, identifier };
  }, [profiles]);

  const numericColumns = useMemo(
    () =>
      profiles.filter((p) => p.sqlType === 'DOUBLE' && !p.isIdentifier),
    [profiles]
  );

  const dateColumns = useMemo(
    () => (dataset?.columns ?? []).filter((col) => col.sqlType === 'DATE'),
    [dataset]
  );

  const effectiveGroupBy = useMemo(() => {
    if (!dataset || dataset.columns.length === 0) return '';
    if (
      selectedGroupBy &&
      dataset.columns.some((col) => col.name === selectedGroupBy)
    ) {
      return selectedGroupBy;
    }
    return defaults?.groupBy ?? '';
  }, [dataset, defaults, selectedGroupBy]);

  const groupProfile = useMemo(
    () => profiles.find((p) => p.name === effectiveGroupBy) ?? null,
    [effectiveGroupBy, profiles]
  );

  const effectiveAggregation = useMemo<DashboardChartAggregation>(() => {
    if (selectedAggregation) {
      const opt = AGGREGATION_OPTIONS.find(
        (a) => a.value === selectedAggregation
      );
      if (opt?.requiresNumericMetric && numericColumns.length === 0) {
        return 'count';
      }
      return selectedAggregation;
    }
    return defaults?.aggregation ?? 'count';
  }, [defaults, numericColumns.length, selectedAggregation]);

  const effectiveMetric = useMemo(() => {
    if (!dataset || effectiveAggregation === 'count') return COUNT_METRIC_VALUE;
    if (effectiveAggregation === 'count_distinct') {
      if (
        selectedMetric &&
        selectedMetric !== COUNT_METRIC_VALUE &&
        dataset.columns.some((col) => col.name === selectedMetric)
      ) {
        return selectedMetric;
      }
      return effectiveGroupBy || COUNT_METRIC_VALUE;
    }
    if (
      selectedMetric &&
      selectedMetric !== COUNT_METRIC_VALUE &&
      numericColumns.some((col) => col.name === selectedMetric)
    ) {
      return selectedMetric;
    }
    return '';
  }, [
    dataset,
    effectiveAggregation,
    effectiveGroupBy,
    numericColumns,
    selectedMetric,
  ]);

  const metricProfile = useMemo(
    () =>
      effectiveMetric !== COUNT_METRIC_VALUE
        ? profiles.find((p) => p.name === effectiveMetric) ?? null
        : null,
    [effectiveMetric, profiles]
  );

  const effectiveSplitMultiValue =
    splitMultiValue ?? Boolean(groupProfile?.isMultiValueLikely);

  const capabilities = getChartTypeDefinition(chartType).capabilities;

  const initialResolution = useMemo(
    () =>
      initialChart && dataset && dataset.columns.length > 0
        ? resolveChartConfig(dataset, initialChart)
        : null,
    [initialChart, dataset]
  );

  const templates = useMemo(
    () => generateRecommendedTemplates(dataset),
    [dataset]
  );

  const builderSpec = useMemo(
    () =>
      buildChartQuerySpec(dataset, {
        type: chartType,
        dataMode: 'builder',
        groupBy: effectiveGroupBy,
        breakdownBy: selectedBreakdownBy || undefined,
        stackMode,
        metric: effectiveMetric,
        aggregation: effectiveAggregation,
        filters,
        dateGranularity,
        dateRangeColumn: dateRangeColumn || undefined,
        dateRangePreset,
        sortBy,
        limit,
        excludeEmpty,
        groupOthers,
        splitMultiValue: effectiveSplitMultiValue,
        valueFormat,
        samplePreset,
      }),
    [
      chartType,
      dataset,
      dateGranularity,
      dateRangeColumn,
      dateRangePreset,
      effectiveAggregation,
      effectiveGroupBy,
      effectiveMetric,
      effectiveSplitMultiValue,
      excludeEmpty,
      filters,
      groupOthers,
      limit,
      samplePreset,
      selectedBreakdownBy,
      sortBy,
      stackMode,
      valueFormat,
    ]
  );

  const activeSpec = useMemo(() => {
    if (dataMode === 'sql') {
      return buildChartQuerySpec(dataset, {
        type: chartType,
        dataMode: 'sql',
        customSql: customSql.trim() || builderSpec.sql,
        valueFormat,
      });
    }
    return builderSpec;
  }, [builderSpec, chartType, customSql, dataMode, dataset, valueFormat]);

  const datasetKey = dataset
    ? `${dataset.cacheKey}:${dataset.syncedAt}:${dataset.rowsCount}`
    : 'standalone-sample';

  const {
    rows: previewRows,
    columns: previewColumns,
    loading: previewLoading,
    error: previewError,
  } = useDuckDbQuery<Record<string, unknown>>(activeSpec.sql, {
    enabled: true,
    depsKey: `studio-preview:${datasetKey}`,
  });

  const {
    points: previewPoints,
    summary: previewSummary,
    seriesKeys: previewSeriesKeys,
  } = useMemo(
    () =>
      mapDuckDbRowsToChartResult(previewRows, {
        isDateAxis: activeSpec.isDateAxis,
        dateGranularity: activeSpec.dateGranularity,
        isAdditive: activeSpec.isAdditive,
        splitMultiValue: activeSpec.splitMultiValueApplied,
        columns: previewColumns,
      }),
    [
      activeSpec.dateGranularity,
      activeSpec.isAdditive,
      activeSpec.isDateAxis,
      activeSpec.splitMultiValueApplied,
      previewColumns,
      previewRows,
    ]
  );

  const sanityWarnings = useMemo(
    () =>
      analyzeChartSanity({
        chartType,
        aggregation: activeSpec.aggregation,
        groupProfile: hasDataset ? groupProfile : null,
        metricProfile: hasDataset ? metricProfile : null,
        limit,
        groupOthers,
        splitMultiValue: effectiveSplitMultiValue,
        isCustomSql: dataMode === 'sql',
      }),
    [
      activeSpec.aggregation,
      chartType,
      dataMode,
      effectiveSplitMultiValue,
      groupOthers,
      groupProfile,
      hasDataset,
      limit,
      metricProfile,
    ]
  );

  const takeaway = useMemo(
    () =>
      generateChartTakeaway({
        chartType,
        aggregation: activeSpec.aggregation,
        valueFormat: activeSpec.valueFormat,
        isDateAxis: activeSpec.isDateAxis,
        splitMultiValue: activeSpec.splitMultiValueApplied,
        points: previewPoints,
        summary: previewSummary,
      }),
    [
      activeSpec.aggregation,
      activeSpec.isDateAxis,
      activeSpec.splitMultiValueApplied,
      activeSpec.valueFormat,
      chartType,
      previewPoints,
      previewSummary,
    ]
  );

  const applyPatch = (patch: Partial<Omit<DashboardChartConfig, 'id'>>) => {
    if (patch.type) setChartType(patch.type);
    if (patch.aggregation) setSelectedAggregation(patch.aggregation);
    if (patch.metric !== undefined) setSelectedMetric(patch.metric);
    if (patch.groupBy !== undefined) setSelectedGroupBy(patch.groupBy);
    if (patch.limit !== undefined) setLimit(patch.limit);
    if (patch.groupOthers !== undefined) setGroupOthers(patch.groupOthers);
    if (patch.splitMultiValue !== undefined) {
      setSplitMultiValue(patch.splitMultiValue);
    }
    if (patch.valueFormat !== undefined) setValueFormat(patch.valueFormat);
    if (patch.showAverageLine !== undefined) {
      setShowAverageLine(patch.showAverageLine);
    }
  };

  const applyTemplate = (tpl: ChartTemplate) => {
    const cfg = tpl.config;
    setDataMode(cfg.dataMode ?? 'builder');
    setChartType(cfg.type);
    setTitle(cfg.title ?? '');
    setSubtitle(cfg.subtitle ?? '');
    setSelectedGroupBy(cfg.groupBy ?? '');
    setSelectedMetric(cfg.metric ?? '');
    setSelectedAggregation(cfg.aggregation ?? '');
    setSelectedBreakdownBy(cfg.breakdownBy ?? '');
    setStackMode(cfg.stackMode ?? 'stacked');
    setFilters(cfg.filters ? cfg.filters.map((f) => ({ ...f })) : []);
    setDateGranularity(cfg.dateGranularity ?? 'month');
    setDateRangePreset(cfg.dateRangePreset ?? 'all');
    setSortBy(cfg.sortBy ?? 'value_desc');
    setLimit(cfg.limit ?? (cfg.type === 'pie' ? 6 : 10));
    setExcludeEmpty(cfg.excludeEmpty ?? true);
    setGroupOthers(cfg.groupOthers ?? true);
    setSplitMultiValue(cfg.splitMultiValue);
    setValueFormat(cfg.valueFormat ?? 'auto');
    setShowAverageLine(cfg.showAverageLine ?? false);
    if (cfg.samplePreset) setSamplePreset(cfg.samplePreset);
  };

  const handleSelectChartType = (nextType: DashboardChartType) => {
    setChartType(nextType);
    if (nextType === 'pie' && limit > 6) {
      setLimit(6);
      setGroupOthers(true);
    }
  };

  const handleSwitchMode = (nextMode: DashboardChartDataMode) => {
    if (nextMode === 'sql' && !customSql.trim()) {
      setCustomSql(builderSpec.sql.trim());
    }
    setDataMode(nextMode);
  };

  const handleAddFilter = () => {
    if (!dataset || dataset.columns.length === 0) return;
    const defaultCol = effectiveGroupBy || dataset.columns[0].name;
    setFilters((prev) => [
      ...prev,
      {
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        column: defaultCol,
        operator: 'equals',
        value: '',
      },
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFilters = filters.filter((f) => {
      const opMeta = FILTER_OPERATOR_OPTIONS.find((o) => o.value === f.operator);
      if (!opMeta?.needsValue) return true;
      return Boolean(f.value?.trim());
    });

    onSaveChart({
      type: chartType,
      title: title.trim() || undefined,
      subtitle: subtitle.trim() || undefined,
      dataMode,
      groupBy:
        hasDataset && dataMode === 'builder' && effectiveGroupBy
          ? effectiveGroupBy
          : undefined,
      breakdownBy:
        hasDataset && dataMode === 'builder' && selectedBreakdownBy
          ? selectedBreakdownBy
          : undefined,
      stackMode:
        hasDataset && dataMode === 'builder' && selectedBreakdownBy
          ? stackMode
          : undefined,
      metric:
        hasDataset && dataMode === 'builder' && effectiveMetric
          ? effectiveMetric
          : undefined,
      aggregation:
        hasDataset && dataMode === 'builder' ? effectiveAggregation : undefined,
      filters:
        hasDataset && dataMode === 'builder' && cleanFilters.length > 0
          ? cleanFilters
          : undefined,
      dateGranularity:
        hasDataset &&
        dataMode === 'builder' &&
        groupProfile?.groupCategory === 'date'
          ? dateGranularity
          : undefined,
      dateRangeColumn:
        hasDataset && dataMode === 'builder' && dateRangePreset !== 'all'
          ? dateRangeColumn || undefined
          : undefined,
      dateRangePreset:
        hasDataset && dataMode === 'builder' && dateRangePreset !== 'all'
          ? dateRangePreset
          : undefined,
      sortBy:
        dataMode === 'builder' && !activeSpec.isDateAxis ? sortBy : undefined,
      limit,
      excludeEmpty,
      groupOthers,
      splitMultiValue:
        hasDataset && dataMode === 'builder' && groupProfile?.sqlType === 'VARCHAR'
          ? effectiveSplitMultiValue
          : undefined,
      valueFormat: valueFormat !== 'auto' ? valueFormat : undefined,
      showAverageLine:
        capabilities.has('averageLine') ? showAverageLine : undefined,
      span,
      customSql:
        dataMode === 'sql'
          ? customSql.trim() || builderSpec.sql.trim()
          : undefined,
      samplePreset:
        !hasDataset && dataMode === 'builder' ? samplePreset : undefined,
      datasetId: dataset?.datasetId,
      schemaFingerprint: dataset?.schemaFingerprint,
      configVersion: 2,
    });
  };

  const previewTitle = title.trim() || activeSpec.chartTitle;
  const previewSubtitle = subtitle.trim() || activeSpec.baseSubtitle;

  return (
    <form
      onSubmit={handleSubmit}
      className="pf-modal-card flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-pf-card border border-border-subtle bg-surface text-ink shadow-pf-card"
    >
      <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
        <div>
          <span className="block text-pf-overline uppercase text-ink-secondary">
            Visão: {viewName}
          </span>
          <h1 id="add-chart-modal-title" className="mt-0.5 text-pf-h4 text-ink">
            {isEditing ? 'Editar gráfico' : 'Criar visualização'}
          </h1>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar modal"
          className="pf-press inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pf-control text-ink-secondary transition hover:bg-canvas hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {initialResolution && initialResolution.issues.length > 0 && (
          <div className="mb-5 space-y-2">
            {initialResolution.issues.map((issue, idx) => (
              <div
                key={`${issue.code}-${issue.field}-${idx}`}
                className={`flex items-start gap-2 rounded-pf-control border px-3 py-2 text-[11px] ${
                  issue.severity === 'error'
                    ? 'border-pf-yellow bg-pf-yellow-100 text-pf-yellow-dark-2'
                    : 'border-border-subtle bg-brand-soft text-ink'
                }`}
              >
                {issue.severity === 'error' ? (
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pf-yellow-dark-1"
                    aria-hidden="true"
                  />
                ) : (
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                )}
                <span className="leading-snug">{issue.message}</span>
              </div>
            ))}
          </div>
        )}
        {templates.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
              <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              <span>Modelos recomendados para começar rápido</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  title={tpl.description}
                  className="pf-press inline-flex cursor-pointer flex-col items-start rounded-pf-control border border-border-subtle bg-canvas px-3 py-1.5 text-left transition hover:border-brand/50 hover:bg-brand-soft"
                >
                  <span className="text-xs font-semibold text-ink">
                    {tpl.label}
                  </span>
                  <span className="text-[10px] text-ink-secondary">
                    {tpl.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-7">
            <div>
              <p className="mb-2.5 text-pf-subtitle-2 text-ink">
                1. Escolha o formato visual
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {getChartTypeOptions('primary').map((option) => {
                  const isSelected = chartType === option.type;
                  return (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => handleSelectChartType(option.type)}
                      aria-pressed={isSelected}
                      className={`pf-press flex cursor-pointer flex-col items-start gap-1.5 rounded-pf-panel border p-2.5 text-left transition ${
                        isSelected
                          ? 'border-brand bg-brand-soft ring-2 ring-brand/20'
                          : 'border-border-subtle bg-canvas hover:border-border-strong'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-pf-control ${
                            isSelected
                              ? 'bg-brand text-pf-white'
                              : 'border border-border-subtle bg-surface text-brand'
                          }`}
                        >
                          <ChartTypeIcon type={option.type} className="h-3.5 w-3.5" />
                        </div>
                        {option.bestFor && (
                          <span className="text-[10px] font-medium text-ink-secondary">
                            {option.bestFor}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-ink">
                          {option.label}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">
                          {option.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3.5 rounded-pf-panel border border-border-subtle bg-canvas p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-pf-subtitle-2 text-ink">
                  2. O que os dados devem mostrar
                </p>

                <div className="inline-flex rounded-pf-control border border-border-subtle bg-surface p-0.5">
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('builder')}
                    className={`pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[11px] font-semibold transition ${
                      dataMode === 'builder'
                        ? 'bg-brand text-pf-white'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                    <span>Configuração guiada</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('sql')}
                    className={`pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[11px] font-semibold transition ${
                      dataMode === 'sql'
                        ? 'bg-brand text-pf-white'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <Database className="h-3 w-3" aria-hidden="true" />
                    <span>SQL Avançado</span>
                  </button>
                </div>
              </div>

              {dataMode === 'sql' ? (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="add-chart-custom-sql"
                    className="text-[11px] font-semibold text-ink-secondary"
                  >
                    Consulta SQL (1ª coluna = categoria, 2ª coluna = valor numérico)
                  </label>
                  <textarea
                    id="add-chart-custom-sql"
                    rows={5}
                    value={customSql}
                    onChange={(e) => setCustomSql(e.target.value)}
                    className="w-full rounded-pf-control border border-border-strong bg-surface p-2.5 font-mono text-xs text-ink focus:border-brand focus:outline-none"
                  />
                </div>
              ) : dataset && dataset.columns.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="add-chart-group-by"
                        className="text-[11px] font-semibold text-ink-secondary"
                      >
                        {chartType === 'kpi'
                          ? 'Quebrar top 3 por (opcional)'
                          : 'Agrupar por (dimensão)'}
                      </label>
                      <select
                        id="add-chart-group-by"
                        value={effectiveGroupBy}
                        onChange={(e) => {
                          setSelectedGroupBy(e.target.value);
                          setSplitMultiValue(undefined);
                        }}
                        className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                      >
                        {groupedColumns.dimension.length > 0 && (
                          <optgroup label="Dimensões do Processo">
                            {groupedColumns.dimension.map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.label} · {col.friendlyType}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {groupedColumns.date.length > 0 && (
                          <optgroup label="Datas">
                            {groupedColumns.date.map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.label} · {col.friendlyType}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {groupedColumns.metric.length > 0 && (
                          <optgroup label="Métricas e Valores">
                            {groupedColumns.metric.map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.label} · {col.friendlyType}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {groupedColumns.identifier.length > 0 && (
                          <optgroup label="Identificadores">
                            {groupedColumns.identifier.map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.label} · {col.friendlyType}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="add-chart-aggregation"
                        className="text-[11px] font-semibold text-ink-secondary"
                      >
                        Como calcular
                      </label>
                      <select
                        id="add-chart-aggregation"
                        value={effectiveAggregation}
                        onChange={(e) =>
                          setSelectedAggregation(
                            e.target.value as DashboardChartAggregation
                          )
                        }
                        className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                      >
                        {AGGREGATION_OPTIONS.map((agg) => (
                          <option
                            key={agg.value}
                            value={agg.value}
                            disabled={
                              agg.requiresNumericMetric &&
                              numericColumns.length === 0
                            }
                          >
                            {agg.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="add-chart-metric"
                        className="text-[11px] font-semibold text-ink-secondary"
                      >
                        Campo medido
                      </label>
                      <select
                        id="add-chart-metric"
                        value={effectiveMetric}
                        disabled={
                          effectiveAggregation === 'count' ||
                          (effectiveAggregation !== 'count_distinct' &&
                            numericColumns.length === 0)
                        }
                        onChange={(e) => setSelectedMetric(e.target.value)}
                        className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none disabled:opacity-50"
                      >
                        {effectiveAggregation === 'count' ? (
                          <option value={COUNT_METRIC_VALUE}>
                            Contagem de cards
                          </option>
                        ) : effectiveAggregation === 'count_distinct' ? (
                          profiles.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.label} · {col.friendlyType}
                            </option>
                          ))
                        ) : numericColumns.length === 0 ? (
                          <option value={COUNT_METRIC_VALUE}>
                            Sem campos numéricos disponíveis
                          </option>
                        ) : (
                          profiles
                            .filter((p) => p.sqlType === 'DOUBLE' && !p.isIdentifier)
                            .map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.label} · {col.friendlyType}
                              </option>
                            ))
                        )}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="add-chart-format"
                        className="text-[11px] font-semibold text-ink-secondary"
                      >
                        Formatação dos valores
                      </label>
                      <select
                        id="add-chart-format"
                        value={valueFormat}
                        disabled={
                          effectiveAggregation === 'count' ||
                          effectiveAggregation === 'count_distinct'
                        }
                        onChange={(e) =>
                          setValueFormat(e.target.value as ChartValueFormat)
                        }
                        className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none disabled:opacity-50"
                      >
                        <option value="auto">
                          Automático (
                          {metricProfile?.recommendedFormat === 'currency_brl'
                            ? 'Moeda R$'
                            : metricProfile?.recommendedFormat === 'percent'
                              ? 'Percentual'
                              : metricProfile?.recommendedFormat ===
                                  'duration_days'
                                ? 'Dias'
                                : 'Número'}
                          )
                        </option>
                        <option value="number">Número inteiro / decimal</option>
                        <option value="currency_brl">Moeda (R$)</option>
                        <option value="percent">Percentual (%)</option>
                        <option value="duration_days">Duração (dias)</option>
                      </select>
                    </div>
                  </div>

                  {capabilities.has('breakdown') && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor="add-chart-breakdown"
                          className="text-[11px] font-semibold text-ink-secondary"
                        >
                          Segmentar por (opcional)
                        </label>
                        <select
                          id="add-chart-breakdown"
                          value={selectedBreakdownBy}
                          onChange={(e) => setSelectedBreakdownBy(e.target.value)}
                          className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                        >
                          <option value="">Sem segmentação</option>
                          {[...groupedColumns.dimension, ...groupedColumns.date]
                            .filter((col) => col.name !== effectiveGroupBy)
                            .map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.label} · {col.friendlyType}
                              </option>
                            ))}
                        </select>
                      </div>

                      {capabilities.has('stack') && selectedBreakdownBy && (
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="add-chart-stack"
                            className="text-[11px] font-semibold text-ink-secondary"
                          >
                            Empilhamento das séries
                          </label>
                          <select
                            id="add-chart-stack"
                            value={stackMode}
                            onChange={(e) =>
                              setStackMode(e.target.value as ChartStackMode)
                            }
                            className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                          >
                            <option value="stacked">Empilhado</option>
                            <option value="grouped">Lado a lado</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {groupProfile?.groupCategory === 'date' &&
                    capabilities.has('dateGranularity') && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-semibold text-ink-secondary">
                          Granularidade do período
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {DATE_GRANULARITY_OPTIONS.map((g) => (
                            <button
                              key={g.value}
                              type="button"
                              onClick={() => setDateGranularity(g.value)}
                              className={`cursor-pointer rounded-pf-control border px-2.5 py-1 text-[11px] font-semibold transition ${
                                dateGranularity === g.value
                                  ? 'border-brand bg-brand text-pf-white'
                                  : 'border-border-subtle bg-surface text-ink-secondary hover:text-ink'
                              }`}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {dateColumns.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor="add-chart-date-range"
                          className="text-[11px] font-semibold text-ink-secondary"
                        >
                          Recorte temporal
                        </label>
                        <select
                          id="add-chart-date-range"
                          value={dateRangePreset}
                          onChange={(e) =>
                            setDateRangePreset(
                              e.target.value as ChartDateRangePreset
                            )
                          }
                          className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                        >
                          {DATE_RANGE_PRESET_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {dateRangePreset !== 'all' && (
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="add-chart-date-col"
                            className="text-[11px] font-semibold text-ink-secondary"
                          >
                            Coluna de data do recorte
                          </label>
                          <select
                            id="add-chart-date-col"
                            value={dateRangeColumn || dateColumns[0].name}
                            onChange={(e) => setDateRangeColumn(e.target.value)}
                            className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                          >
                            {dateColumns.map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {chartType !== 'kpi' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {capabilities.has('sort') && !activeSpec.isDateAxis && (
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="add-chart-sort"
                            className="text-[11px] font-semibold text-ink-secondary"
                          >
                            Ordenação
                          </label>
                          <select
                            id="add-chart-sort"
                            value={sortBy}
                            onChange={(e) =>
                              setSortBy(e.target.value as ChartSortOrder)
                            }
                            className="rounded-pf-control border border-border-strong bg-surface px-2.5 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                          >
                            <option value="value_desc">Maior para menor</option>
                            <option value="value_asc">Menor para maior</option>
                            <option value="label_asc">Alfabética (A → Z)</option>
                            <option value="label_desc">Alfabética (Z → A)</option>
                          </select>
                        </div>
                      )}

                      {capabilities.has('limit') && (
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor="add-chart-limit"
                          className="text-[11px] font-semibold text-ink-secondary"
                        >
                          {activeSpec.isDateAxis ? 'Períodos exibidos' : 'Máximo de grupos'}
                        </label>
                        <select
                          id="add-chart-limit"
                          value={limit}
                          onChange={(e) => setLimit(Number(e.target.value))}
                          className="rounded-pf-control border border-border-strong bg-surface px-2.5 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                        >
                          <option value={5}>Top 5</option>
                          <option value={6}>Top 6</option>
                          <option value={8}>Top 8</option>
                          <option value={10}>Top 10</option>
                          <option value={12}>Até 12</option>
                          <option value={20}>Até 20</option>
                          <option value={30}>Até 30</option>
                        </select>
                      </div>
                      )}

                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor="add-chart-span"
                          className="text-[11px] font-semibold text-ink-secondary"
                        >
                          Largura no painel
                        </label>
                        <select
                          id="add-chart-span"
                          value={span}
                          onChange={(e) =>
                            setSpan(Number(e.target.value) === 2 ? 2 : 1)
                          }
                          className="rounded-pf-control border border-border-strong bg-surface px-2.5 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                        >
                          <option value={1}>Padrão (1 coluna)</option>
                          <option value={2}>Largo (2 colunas)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                    {chartType !== 'kpi' && (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={excludeEmpty}
                          onChange={(e) => setExcludeEmpty(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border-strong text-brand focus:ring-brand"
                        />
                        <span>Ocultar registros vazios</span>
                      </label>
                    )}

                    {capabilities.has('groupOthers') &&
                      !activeSpec.isDateAxis &&
                      activeSpec.isAdditive && (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink">
                          <input
                            type="checkbox"
                            checked={groupOthers}
                            onChange={(e) => setGroupOthers(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-border-strong text-brand focus:ring-brand"
                          />
                          <span>Agrupar restante em &ldquo;Outros&rdquo;</span>
                        </label>
                      )}

                    {capabilities.has('splitMultiValue') &&
                      groupProfile?.sqlType === 'VARCHAR' && (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink">
                          <input
                            type="checkbox"
                            checked={effectiveSplitMultiValue}
                            onChange={(e) =>
                              setSplitMultiValue(e.target.checked)
                            }
                            className="h-3.5 w-3.5 rounded border-border-strong text-brand focus:ring-brand"
                          />
                          <span>Separar múltiplos valores (vírgula)</span>
                        </label>
                      )}

                    {capabilities.has('averageLine') && (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={showAverageLine}
                          onChange={(e) => setShowAverageLine(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border-strong text-brand focus:ring-brand"
                        />
                        <span>Exibir linha de média</span>
                      </label>
                    )}
                  </div>

                  <details className="rounded-pf-control border border-border-subtle bg-surface px-3 py-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-ink-secondary">
                      Ajustar tipo das colunas
                    </summary>
                    <div className="mt-2 space-y-2">
                      <p className="text-[11px] text-ink-secondary">
                        Corrija o papel semântico quando a detecção automática não
                        representar a coluna.
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {profiles.map((profile) => {
                          const override = roleOverrides[profile.name];
                          return (
                            <label
                              key={profile.name}
                              className="flex flex-col gap-1 text-[11px] text-ink-secondary"
                            >
                              <span className="truncate" title={profile.label}>
                                {profile.label}
                              </span>
                              <select
                                value={override?.role ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value as
                                    | ColumnSemanticRole
                                    | '';
                                  setRoleOverrides((prev) => {
                                    const next = { ...prev };
                                    const current = { ...(next[profile.name] ?? {}) };
                                    if (value) current.role = value;
                                    else delete current.role;
                                    if (Object.keys(current).length > 0) {
                                      next[profile.name] = current;
                                    } else {
                                      delete next[profile.name];
                                    }
                                    return next;
                                  });
                                }}
                                className="rounded-pf-control border border-border-subtle bg-canvas px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none"
                              >
                                {ROLE_OVERRIDE_OPTIONS.map((opt) => (
                                  <option key={opt.value || 'auto'} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        disabled={!dataset?.datasetId}
                        onClick={() => {
                          if (dataset?.datasetId) {
                            saveColumnRoleOverrides(dataset.datasetId, roleOverrides);
                          }
                        }}
                        className="inline-flex cursor-pointer items-center rounded-pf-control border border-border-subtle bg-surface px-2.5 py-1 text-[11px] font-semibold text-brand transition hover:border-brand/40 hover:bg-brand-soft disabled:opacity-50"
                      >
                        Aplicar tipos
                      </button>
                    </div>
                  </details>

                  <div className="border-t border-border-subtle pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-ink-secondary">
                        Filtros ({filters.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleAddFilter}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-pf-control border border-border-subtle bg-surface px-2.5 py-1 text-[11px] font-semibold text-brand transition hover:border-brand/40 hover:bg-brand-soft"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        <span>Adicionar filtro</span>
                      </button>
                    </div>

                    {filters.length > 0 && (
                      <div className="space-y-2">
                        {filters.map((f) => (
                          <FilterRowEditor
                            key={f.id}
                            filter={f}
                            dataset={dataset}
                            onChange={(patch) =>
                              setFilters((prev) =>
                                prev.map((item) =>
                                  item.id === f.id ? { ...item, ...patch } : item
                                )
                              )
                            }
                            onRemove={() =>
                              setFilters((prev) =>
                                prev.filter((item) => item.id !== f.id)
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="add-chart-sample-preset"
                        className="text-[11px] font-semibold text-ink-secondary"
                      >
                        Conjunto demonstrativo
                      </label>
                      <select
                        id="add-chart-sample-preset"
                        value={samplePreset}
                        onChange={(e) =>
                          setSamplePreset(
                            e.target.value as SampleDatasetPresetId
                          )
                        }
                        className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                      >
                        {SAMPLE_DATASET_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="add-chart-sample-limit"
                        className="text-[11px] font-semibold text-ink-secondary"
                      >
                        Máximo de grupos
                      </label>
                      <select
                        id="add-chart-sample-limit"
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        className="rounded-pf-control border border-border-strong bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                      >
                        <option value={3}>Top 3</option>
                        <option value={5}>Top 5</option>
                        <option value={6}>Top 6</option>
                        <option value={10}>Até 10</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-secondary">
                    Ao carregar um Pipe ou importar um arquivo `.xlsx`, todos os campos reais aparecem aqui automaticamente.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="add-chart-title"
                  className="text-pf-subtitle-2 text-ink"
                >
                  3. Título (opcional)
                </label>
                <input
                  id="add-chart-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Ex: ${builderSpec.chartTitle}`}
                  className="w-full rounded-pf-control border border-border-strong bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-icon focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="add-chart-subtitle"
                  className="text-pf-subtitle-2 text-ink"
                >
                  Subtítulo / nota (opcional)
                </label>
                <input
                  id="add-chart-subtitle"
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Contexto para stakeholders"
                  className="w-full rounded-pf-control border border-border-strong bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-icon focus:border-brand focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:col-span-5">
            <div className="sticky top-0 flex flex-col gap-3 rounded-pf-panel border border-border-subtle bg-canvas p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
                    Prévia ao vivo · {getChartTypeLabel(chartType)}
                  </span>
                  <h2 className="mt-0.5 truncate text-sm font-bold text-ink">
                    {previewTitle}
                  </h2>
                  <p className="truncate text-[11px] text-ink-secondary">
                    {previewSubtitle}
                  </p>
                </div>
                {previewLoading && (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-brand"
                    aria-hidden="true"
                  />
                )}
              </div>

              {!activeSpec.canRender && activeSpec.issues.length > 0 && (
                <div className="rounded-pf-control border border-pf-yellow bg-pf-yellow-100 px-3 py-2 text-[11px] text-pf-yellow-dark-2">
                  <p className="font-semibold">Ajuste os campos para ver a prévia</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {activeSpec.issues
                      .filter((issue) => issue.severity === 'error')
                      .map((issue, idx) => (
                        <li key={`${issue.field}-${idx}`}>{issue.message}</li>
                      ))}
                  </ul>
                </div>
              )}

              {takeaway && !previewError && previewPoints.length > 0 && (
                <p className="rounded-pf-control border border-border-subtle bg-surface px-3 py-2 text-[11px] leading-relaxed text-ink">
                  {takeaway}
                </p>
              )}

              <div className="rounded-pf-panel border border-border-subtle bg-surface p-3">
                {previewError ? (
                  <p className="py-8 text-center text-xs text-pf-red">
                    {previewError}
                  </p>
                ) : previewPoints.length === 0 && !previewLoading ? (
                  <p className="py-12 text-center text-xs text-ink-secondary">
                    Nenhum registro encontrado para os filtros atuais.
                  </p>
                ) : (
                  <ChartRenderer
                    chartType={chartType}
                    points={previewPoints}
                    summary={previewSummary}
                    valueLabel={activeSpec.valueLabel}
                    valueFormat={activeSpec.valueFormat}
                    isAdditive={activeSpec.isAdditive}
                    isDateAxis={activeSpec.isDateAxis}
                    splitMultiValue={activeSpec.splitMultiValueApplied}
                    aggregation={activeSpec.aggregation}
                    showAverageLine={showAverageLine}
                    seriesKeys={previewSeriesKeys}
                    stackMode={activeSpec.stackMode}
                    height={230}
                    compact
                  />
                )}
              </div>

              {sanityWarnings.length > 0 && (
                <div className="space-y-2">
                  {sanityWarnings.map((w) => (
                    <div
                      key={w.id}
                      className={`flex items-start gap-2 rounded-pf-control border px-3 py-2 text-[11px] ${
                        w.severity === 'warning'
                          ? 'border-pf-yellow bg-pf-yellow-100 text-pf-yellow-dark-2'
                          : 'border-border-subtle bg-brand-soft text-ink'
                      }`}
                    >
                      {w.severity === 'warning' ? (
                        <AlertTriangle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pf-yellow-dark-1"
                          aria-hidden="true"
                        />
                      ) : (
                        <Info
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="leading-snug">{w.message}</p>
                        {w.actionLabel && w.fixPatch && (
                          <button
                            type="button"
                            onClick={() => applyPatch(w.fixPatch!)}
                            className="mt-1.5 cursor-pointer font-semibold text-brand underline-offset-2 hover:underline"
                          >
                            {w.actionLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!previewError && previewPoints.length > 0 && (
                <p className="text-[11px] text-ink-secondary">
                  {previewSummary.totalCards.toLocaleString('pt-BR')} cards ·{' '}
                  {previewSummary.totalGroups.toLocaleString('pt-BR')}{' '}
                  {previewSummary.totalGroups === 1 ? 'grupo' : 'grupos'}
                  {previewSummary.excludedEmptyCount > 0
                    ? ` · ${previewSummary.excludedEmptyCount.toLocaleString('pt-BR')} sem preenchimento ocultos`
                    : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2.5 border-t border-border-subtle bg-canvas px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="pf-press inline-flex cursor-pointer items-center justify-center rounded-pf-control border border-border-subtle bg-surface px-4 py-2 text-xs font-semibold text-ink-secondary transition hover:border-border-strong hover:text-ink"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="pf-press inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-pf-control bg-brand px-4 py-2 text-xs font-semibold text-pf-white shadow-sm transition hover:bg-brand-shade"
        >
          {isEditing ? (
            <>
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Salvar alterações</span>
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Adicionar gráfico</span>
            </>
          )}
        </button>
      </footer>
    </form>
  );
}

/**
 * Executive chart creation and editing studio modal (`<dialog>`), featuring quick templates,
 * semantic column grouping, multi-filter builder, analytical coaching, and live visual preview.
 */
export function AddChartModal({
  open,
  viewName,
  dataset,
  initialChart,
  onClose,
  onSaveChart,
}: AddChartModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const pressedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const formKey = open
    ? initialChart
      ? `edit-${initialChart.id}`
      : 'create'
    : 'closed';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-chart-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        pressedOutsideRef.current = isOutsideDialogBounds(
          e.clientX,
          e.clientY,
          dialog
        );
      }}
      onPointerUp={(e) => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const releasedOutside = isOutsideDialogBounds(
          e.clientX,
          e.clientY,
          dialog
        );
        if (pressedOutsideRef.current && releasedOutside) {
          onClose();
        }
        pressedOutsideRef.current = false;
      }}
      className="pf-modal-dialog"
    >
      {open && (
        <AddChartModalForm
          key={formKey}
          viewName={viewName}
          dataset={dataset}
          initialChart={initialChart}
          onClose={onClose}
          onSaveChart={onSaveChart}
        />
      )}
    </dialog>
  );
}
