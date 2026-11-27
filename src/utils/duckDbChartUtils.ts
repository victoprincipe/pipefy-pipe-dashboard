import { sanitizeTableName } from '@/lib/pipefyDuckDb';
import { parseFlexibleNumber } from '@/lib/sqlConverter';
import type {
  ChartDateRangePreset,
  ChartSortOrder,
  ChartStackMode,
  ChartValueFormat,
  DashboardChartAggregation,
  DashboardChartConfig,
  DashboardChartDataMode,
  DashboardChartFilter,
  DashboardChartType,
  DateGranularity,
  SampleDatasetPresetId,
} from '@/types/dashboardViews';
import type { PipefySqlDataset, SqlColumnDef } from '@/types/pipefySql';
import {
  type ChartConfigIssue,
  type ResolvedChartConfig,
  resolveChartConfig,
} from '@/utils/chartConfigResolver';
import { getDatasetCapabilities } from '@/utils/chartCapabilities';
import {
  type ColumnProfile,
  formatDateBucket,
  getBooleanLabels,
  isAdditiveAggregation,
  profileColumn,
  profileDatasetColumns,
  resolveValueFormat,
} from '@/utils/chartSemantics';

export interface ChartDataPoint {
  name: string;
  rawBucket: string;
  value: number;
  cardCount: number;
  sharePct: number | null;
  deltaPct: number | null;
  isOthers: boolean;
  seriesValues?: Record<string, number>;
}

export type BarChartPoint = ChartDataPoint;

export interface ChartQuerySummary {
  grandTotal: number;
  totalCards: number;
  allDatasetCards: number;
  totalGroups: number;
  avgPerGroup: number;
  excludedEmptyCount: number;
  pctOfPipe: number;
}

export interface ChartQuerySpec {
  sql: string;
  chartType: DashboardChartType;
  isDateAxis: boolean;
  dateGranularity: DateGranularity;
  chartTitle: string;
  baseSubtitle: string;
  valueLabel: string;
  valueFormat: Exclude<ChartValueFormat, 'auto'>;
  groupByColumn: string | null;
  groupByLabel: string | null;
  breakdownByColumn: string | null;
  breakdownByLabel: string | null;
  stackMode: ChartStackMode;
  metricColumn: string | null;
  metricLabel: string | null;
  aggregation: DashboardChartAggregation;
  isAdditive: boolean;
  isCustomSql: boolean;
  groupOthersApplied: boolean;
  excludeEmptyApplied: boolean;
  splitMultiValueApplied: boolean;
  limitApplied: number;
  /** False when the config cannot be resolved against the dataset. */
  canRender: boolean;
  issues: ChartConfigIssue[];
  appliedConfig: DashboardChartConfig;
}

export type BarChartQuerySpec = ChartQuerySpec;

export interface ChartQuerySelection {
  type?: DashboardChartType;
  dataMode?: DashboardChartDataMode;
  groupBy?: string;
  breakdownBy?: string;
  stackMode?: ChartStackMode;
  metric?: string;
  aggregation?: DashboardChartAggregation;
  filters?: DashboardChartFilter[];
  filterColumn?: string;
  filterValue?: string;
  dateGranularity?: DateGranularity;
  dateRangeColumn?: string;
  dateRangePreset?: ChartDateRangePreset;
  sortBy?: ChartSortOrder;
  limit?: number;
  excludeEmpty?: boolean;
  groupOthers?: boolean;
  splitMultiValue?: boolean;
  valueFormat?: ChartValueFormat;
  customSql?: string;
  samplePreset?: SampleDatasetPresetId;
  datasetId?: string;
  schemaFingerprint?: string;
}

export const COUNT_METRIC_VALUE = '__count__';

export type AggregationScope =
  | 'all_cards'
  | 'any_column'
  | 'boolean_only'
  | 'numeric_only';

export interface AggregationOptionDef {
  value: DashboardChartAggregation;
  label: string;
  shortLabel: string;
  appliesTo: AggregationScope;
  requiresNumericMetric: boolean;
  supportsAnyMetricColumn: boolean;
}

export const AGGREGATION_OPTIONS: ReadonlyArray<AggregationOptionDef> = [
  {
    value: 'count',
    label: 'Contagem de cards',
    shortLabel: 'Contagem',
    appliesTo: 'all_cards',
    requiresNumericMetric: false,
    supportsAnyMetricColumn: false,
  },
  {
    value: 'count_non_empty',
    label: 'Contagem (valores preenchidos)',
    shortLabel: 'Preenchidos',
    appliesTo: 'any_column',
    requiresNumericMetric: false,
    supportsAnyMetricColumn: true,
  },
  {
    value: 'count_distinct',
    label: 'Valores únicos (distintos)',
    shortLabel: 'Únicos',
    appliesTo: 'any_column',
    requiresNumericMetric: false,
    supportsAnyMetricColumn: true,
  },
  {
    value: 'fill_rate',
    label: 'Taxa de preenchimento (%)',
    shortLabel: '% preenchido',
    appliesTo: 'any_column',
    requiresNumericMetric: false,
    supportsAnyMetricColumn: true,
  },
  {
    value: 'count_empty',
    label: 'Contagem de vazios',
    shortLabel: 'Vazios',
    appliesTo: 'any_column',
    requiresNumericMetric: false,
    supportsAnyMetricColumn: true,
  },
  {
    value: 'count_true',
    label: 'Contagem de positivos (Sim)',
    shortLabel: 'Positivos',
    appliesTo: 'boolean_only',
    requiresNumericMetric: false,
    supportsAnyMetricColumn: false,
  },
  {
    value: 'true_rate',
    label: 'Taxa de positivos (%)',
    shortLabel: '% positivos',
    appliesTo: 'boolean_only',
    requiresNumericMetric: false,
    supportsAnyMetricColumn: false,
  },
  {
    value: 'sum',
    label: 'Soma dos valores',
    shortLabel: 'Soma',
    appliesTo: 'numeric_only',
    requiresNumericMetric: true,
    supportsAnyMetricColumn: false,
  },
  {
    value: 'avg',
    label: 'Média por card',
    shortLabel: 'Média',
    appliesTo: 'numeric_only',
    requiresNumericMetric: true,
    supportsAnyMetricColumn: false,
  },
  {
    value: 'median',
    label: 'Mediana (típico sem distorções)',
    shortLabel: 'Mediana',
    appliesTo: 'numeric_only',
    requiresNumericMetric: true,
    supportsAnyMetricColumn: false,
  },
  {
    value: 'min',
    label: 'Valor mínimo',
    shortLabel: 'Mínimo',
    appliesTo: 'numeric_only',
    requiresNumericMetric: true,
    supportsAnyMetricColumn: false,
  },
  {
    value: 'max',
    label: 'Valor máximo',
    shortLabel: 'Máximo',
    appliesTo: 'numeric_only',
    requiresNumericMetric: true,
    supportsAnyMetricColumn: false,
  },
];

export function getCompatibleAggregations(
  metricCol: SqlColumnDef | null | undefined
): ReadonlyArray<AggregationOptionDef> {
  if (!metricCol) {
    return AGGREGATION_OPTIONS.filter((a) => a.appliesTo === 'all_cards');
  }
  if (metricCol.sqlType === 'DOUBLE') {
    return AGGREGATION_OPTIONS.filter(
      (a) => a.appliesTo === 'numeric_only' || a.appliesTo === 'any_column'
    );
  }
  if (metricCol.sqlType === 'BOOLEAN') {
    return AGGREGATION_OPTIONS.filter(
      (a) => a.appliesTo === 'boolean_only' || a.appliesTo === 'any_column'
    );
  }
  return AGGREGATION_OPTIONS.filter((a) => a.appliesTo === 'any_column');
}

export function getDefaultAggregationForMetric(
  metricCol: SqlColumnDef | null | undefined
): DashboardChartAggregation {
  if (!metricCol) return 'count';
  if (metricCol.sqlType === 'DOUBLE') {
    return profileColumn(metricCol).defaultAggregation;
  }
  if (metricCol.sqlType === 'BOOLEAN') {
    return 'count_true';
  }
  return 'count_non_empty';
}

export const DATE_GRANULARITY_OPTIONS: ReadonlyArray<{
  value: DateGranularity;
  label: string;
}> = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'year', label: 'Ano' },
];

export const DATE_RANGE_PRESET_OPTIONS: ReadonlyArray<{
  value: ChartDateRangePreset;
  label: string;
}> = [
  { value: 'all', label: 'Todo o período' },
  { value: 'last_7d', label: 'Últimos 7 dias' },
  { value: 'last_30d', label: 'Últimos 30 dias' },
  { value: 'last_90d', label: 'Últimos 90 dias' },
  { value: 'last_12m', label: 'Últimos 12 meses' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'this_quarter', label: 'Este trimestre' },
  { value: 'this_year', label: 'Este ano' },
];

export const SAMPLE_DATASET_PRESETS: ReadonlyArray<{
  id: SampleDatasetPresetId;
  label: string;
  chartTitle: string;
  valueLabel: string;
  valueFormat: Exclude<ChartValueFormat, 'auto'>;
  aggregation: DashboardChartAggregation;
  isDateAxis: boolean;
  rows: ReadonlyArray<{ bucket: string; total: number; cardCount: number }>;
}> = [
  {
    id: 'cards_by_phase',
    label: 'Cards por Fase do Pipe (Exemplo)',
    chartTitle: 'Cards por Fase',
    valueLabel: 'Cards',
    valueFormat: 'number',
    aggregation: 'count',
    isDateAxis: false,
    rows: [
      { bucket: 'Concluído', total: 940, cardCount: 940 },
      { bucket: 'Em Análise', total: 685, cardCount: 685 },
      { bucket: 'Triagem', total: 420, cardCount: 420 },
      { bucket: 'Aprovação', total: 310, cardCount: 310 },
      { bucket: 'Contrato', total: 195, cardCount: 195 },
      { bucket: 'Qualificação', total: 145, cardCount: 145 },
      { bucket: 'Aguardando Cliente', total: 112, cardCount: 112 },
      { bucket: 'Revisão Jurídica', total: 88, cardCount: 88 },
    ],
  },
  {
    id: 'monthly_cards',
    label: 'Evolução Mensal de Cards (Exemplo)',
    chartTitle: 'Evolução Mensal de Cards',
    valueLabel: 'Cards',
    valueFormat: 'number',
    aggregation: 'count',
    isDateAxis: true,
    rows: [
      { bucket: '2026-01', total: 1240, cardCount: 1240 },
      { bucket: '2026-02', total: 1580, cardCount: 1580 },
      { bucket: '2026-03', total: 1890, cardCount: 1890 },
      { bucket: '2026-04', total: 1420, cardCount: 1420 },
      { bucket: '2026-05', total: 2150, cardCount: 2150 },
      { bucket: '2026-06', total: 2490, cardCount: 2490 },
    ],
  },
  {
    id: 'sla_status',
    label: 'Saúde de Prazos / SLA (Exemplo)',
    chartTitle: 'Saúde de Prazos (SLA)',
    valueLabel: 'Cards',
    valueFormat: 'number',
    aggregation: 'count',
    isDateAxis: false,
    rows: [
      { bucket: 'No prazo', total: 2180, cardCount: 2180 },
      { bucket: 'Atrasado', total: 410, cardCount: 410 },
    ],
  },
  {
    id: 'revenue_by_company',
    label: 'Receita por Empresa (Exemplo)',
    chartTitle: 'Receita por Empresa',
    valueLabel: 'Valor (R$)',
    valueFormat: 'currency_brl',
    aggregation: 'sum',
    isDateAxis: false,
    rows: [
      { bucket: 'Soylent LTDA', total: 184500, cardCount: 28 },
      { bucket: 'Acme Brasil', total: 149200, cardCount: 22 },
      { bucket: 'Globex Corp', total: 113800, cardCount: 19 },
      { bucket: 'Initech SA', total: 81900, cardCount: 14 },
      { bucket: 'Umbrella Tech', total: 67400, cardCount: 12 },
      { bucket: 'Stark Serviços', total: 42100, cardCount: 9 },
      { bucket: 'Wayne Logística', total: 31800, cardCount: 7 },
    ],
  },
  {
    id: 'avg_ticket_by_phase',
    label: 'Ticket Médio por Fase (Exemplo)',
    chartTitle: 'Ticket Médio por Fase',
    valueLabel: 'Média de Valor',
    valueFormat: 'currency_brl',
    aggregation: 'avg',
    isDateAxis: false,
    rows: [
      { bucket: 'Contrato', total: 14200, cardCount: 195 },
      { bucket: 'Aprovação', total: 11850, cardCount: 310 },
      { bucket: 'Concluído', total: 9640, cardCount: 940 },
      { bucket: 'Em Análise', total: 7420, cardCount: 685 },
      { bucket: 'Triagem', total: 5180, cardCount: 420 },
    ],
  },
];

export const SAMPLE_BAR_CHART_SQL = buildSamplePresetSql(
  SAMPLE_DATASET_PRESETS[0],
  10,
  true,
  'value_desc'
);

function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function escapeIlikeLiteral(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/'/g, "''");
  return `'%${escaped}%'`;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return fallback;
  return Math.max(2, Math.min(50, Math.round(limit)));
}

function normalizeFilterBooleanLiteral(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (
    s === 'true' ||
    s === 'sim' ||
    s === '1' ||
    s === 'atrasado' ||
    s === 'concluido' ||
    s === 'concluído'
  ) {
    return true;
  }
  if (
    s === 'false' ||
    s === 'nao' ||
    s === 'não' ||
    s === '0' ||
    s === 'no prazo' ||
    s === 'em aberto'
  ) {
    return false;
  }
  return null;
}

function buildFilterCondition(
  col: SqlColumnDef,
  filter: DashboardChartFilter
): string | null {
  const qCol = quoteIdent(col.name);
  const val = (filter.value ?? '').trim();

  switch (filter.operator) {
    case 'is_empty':
      return `(${qCol} IS NULL OR TRIM(CAST(${qCol} AS VARCHAR)) = '')`;
    case 'not_empty':
      return `(${qCol} IS NOT NULL AND TRIM(CAST(${qCol} AS VARCHAR)) <> '')`;
    case 'equals': {
      if (!val) return null;
      if (col.sqlType === 'BOOLEAN') {
        const boolVal = normalizeFilterBooleanLiteral(val);
        if (boolVal !== null) {
          return `${qCol} IS ${boolVal ? 'TRUE' : 'FALSE'}`;
        }
      }
      if (col.sqlType === 'DOUBLE') {
        const num = parseFlexibleNumber(val);
        if (num !== null) {
          return `${qCol} = ${num}`;
        }
      }
      return `LOWER(TRIM(CAST(${qCol} AS VARCHAR))) = LOWER(${quoteLiteral(val)})`;
    }
    case 'not_equals': {
      if (!val) return null;
      if (col.sqlType === 'BOOLEAN') {
        const boolVal = normalizeFilterBooleanLiteral(val);
        if (boolVal !== null) {
          return `(${qCol} IS NULL OR ${qCol} IS NOT ${boolVal ? 'TRUE' : 'FALSE'})`;
        }
      }
      if (col.sqlType === 'DOUBLE') {
        const num = parseFlexibleNumber(val);
        if (num !== null) {
          return `(${qCol} IS NULL OR ${qCol} <> ${num})`;
        }
      }
      return `COALESCE(LOWER(TRIM(CAST(${qCol} AS VARCHAR))), '') <> LOWER(${quoteLiteral(val)})`;
    }
    case 'contains':
      if (!val) return null;
      return `COALESCE(CAST(${qCol} AS VARCHAR), '') ILIKE ${escapeIlikeLiteral(val)} ESCAPE '\\'`;
    case 'not_contains':
      if (!val) return null;
      return `COALESCE(CAST(${qCol} AS VARCHAR), '') NOT ILIKE ${escapeIlikeLiteral(val)} ESCAPE '\\'`;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (!val) return null;
      const opSql =
        filter.operator === 'gt'
          ? '>'
          : filter.operator === 'gte'
            ? '>='
            : filter.operator === 'lt'
              ? '<'
              : '<=';
      if (col.sqlType === 'DATE') {
        return `TRY_CAST(${qCol} AS DATE) ${opSql} TRY_CAST(${quoteLiteral(val)} AS DATE)`;
      }
      if (col.sqlType === 'DOUBLE') {
        const num = parseFlexibleNumber(val);
        if (num === null) return null;
        return `TRY_CAST(${qCol} AS DOUBLE) ${opSql} ${num}`;
      }
      return `CAST(${qCol} AS VARCHAR) ${opSql} ${quoteLiteral(val)}`;
    }
    default:
      return null;
  }
}

function buildDateRangeCondition(
  dateCol: SqlColumnDef | undefined,
  preset: ChartDateRangePreset | undefined
): string | null {
  if (!dateCol || !preset || preset === 'all') return null;
  const qDate = quoteIdent(dateCol.name);
  switch (preset) {
    case 'last_7d':
      return `${qDate} >= CURRENT_DATE - INTERVAL 7 DAY`;
    case 'last_30d':
      return `${qDate} >= CURRENT_DATE - INTERVAL 30 DAY`;
    case 'last_90d':
      return `${qDate} >= CURRENT_DATE - INTERVAL 90 DAY`;
    case 'last_12m':
      return `${qDate} >= CURRENT_DATE - INTERVAL 12 MONTH`;
    case 'this_month':
      return `${qDate} >= CAST(date_trunc('month', CURRENT_DATE) AS DATE)`;
    case 'this_quarter':
      return `${qDate} >= CAST(date_trunc('quarter', CURRENT_DATE) AS DATE)`;
    case 'this_year':
      return `${qDate} >= CAST(date_trunc('year', CURRENT_DATE) AS DATE)`;
    default:
      return null;
  }
}

function buildDateBucketExpr(
  quotedCol: string,
  granularity: DateGranularity
): string {
  switch (granularity) {
    case 'day':
      return `strftime(${quotedCol}, '%Y-%m-%d')`;
    case 'week':
      return `strftime(CAST(date_trunc('week', ${quotedCol}) AS DATE), '%Y-%m-%d')`;
    case 'quarter':
      return `CAST(EXTRACT(YEAR FROM ${quotedCol}) AS VARCHAR) || '-Q' || CAST(EXTRACT(QUARTER FROM ${quotedCol}) AS VARCHAR)`;
    case 'year':
      return `strftime(${quotedCol}, '%Y')`;
    case 'month':
    default:
      return `strftime(${quotedCol}, '%Y-%m')`;
  }
}

function buildSortOrderClause(sortBy: ChartSortOrder): string {
  switch (sortBy) {
    case 'value_asc':
      return 'total ASC, bucket ASC';
    case 'label_asc':
      return 'bucket ASC';
    case 'label_desc':
      return 'bucket DESC';
    case 'value_desc':
    default:
      return 'total DESC, bucket ASC';
  }
}

function buildSamplePresetSql(
  preset: (typeof SAMPLE_DATASET_PRESETS)[number],
  limit: number,
  groupOthers: boolean,
  sortBy: ChartSortOrder
): string {
  const valuesSql = preset.rows
    .map((r) => `(${quoteLiteral(r.bucket)}, ${r.total}, ${r.cardCount})`)
    .join(',\n      ');
  const isAdditive = preset.aggregation === 'count' || preset.aggregation === 'sum';

  if (preset.isDateAxis) {
    return `
      WITH src(bucket, total, card_count) AS (
        VALUES
        ${valuesSql}
      ),
      overall AS (
        SELECT
          ${isAdditive ? 'ROUND(SUM(total), 2)' : 'ROUND(AVG(total), 2)'} AS grand_total,
          SUM(card_count) AS total_cards,
          COUNT(*) AS total_groups,
          ROUND(AVG(total), 2) AS avg_per_group
        FROM src
      ),
      recent AS (
        SELECT bucket, total, card_count
        FROM src
        ORDER BY bucket DESC
        LIMIT ${limit}
      )
      SELECT
        r.bucket,
        r.total,
        r.card_count,
        0 AS is_others,
        o.grand_total,
        o.total_cards,
        o.total_cards AS all_cards,
        o.total_groups,
        o.avg_per_group,
        0 AS excluded_empty_count
      FROM recent r
      CROSS JOIN overall o
      ORDER BY r.bucket ASC
    `;
  }

  const orderClause = buildSortOrderClause(sortBy);
  const effectiveGroupOthers = groupOthers && isAdditive;

  return `
    WITH src(bucket, total, card_count) AS (
      VALUES
      ${valuesSql}
    ),
    overall AS (
      SELECT
        ${isAdditive ? 'ROUND(SUM(total), 2)' : 'ROUND(AVG(total), 2)'} AS grand_total,
        SUM(card_count) AS total_cards,
        COUNT(*) AS total_groups,
        ROUND(AVG(total), 2) AS avg_per_group
      FROM src
    ),
    ranked AS (
      SELECT
        bucket,
        total,
        card_count,
        ROW_NUMBER() OVER (ORDER BY ${orderClause}) AS rn
      FROM src
    ),
    top_rows AS (
      SELECT bucket, total, card_count, 0 AS is_others
      FROM ranked
      WHERE rn <= ${limit}
    )${
      effectiveGroupOthers
        ? `,
    others_row AS (
      SELECT
        'Outros' AS bucket,
        ROUND(SUM(total), 2) AS total,
        SUM(card_count) AS card_count,
        1 AS is_others
      FROM ranked
      WHERE rn > ${limit}
      HAVING COUNT(*) > 0
    ),
    combined AS (
      SELECT * FROM top_rows
      UNION ALL
      SELECT * FROM others_row
    )`
        : `,
    combined AS (
      SELECT * FROM top_rows
    )`
    }
    SELECT
      c.bucket,
      c.total,
      c.card_count,
      c.is_others,
      o.grand_total,
      o.total_cards,
      o.total_cards AS all_cards,
      o.total_groups,
      o.avg_per_group,
      0 AS excluded_empty_count
    FROM combined c
    CROSS JOIN overall o
    ORDER BY c.is_others ASC, ${orderClause}
  `;
}

/**
 * Picks smart stakeholder-friendly default grouping and metric columns for a Pipefy SQL dataset.
 */
export function getDefaultChartSelection(dataset: PipefySqlDataset): {
  groupBy: string;
  metric: string;
  aggregation: DashboardChartAggregation;
} {
  const profiles = profileDatasetColumns(dataset.columns);
  const dimensions = profiles
    .filter((p) => p.groupCategory === 'dimension' || p.groupCategory === 'date')
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const bestDim = dimensions[0] ?? profiles[0];
  return {
    groupBy: bestDim?.name ?? '',
    metric: COUNT_METRIC_VALUE,
    aggregation: 'count',
  };
}

function getEffectiveFilters(
  dataset: PipefySqlDataset,
  selection?: ChartQuerySelection
): string[] {
  const conditions: string[] = [];

  if (selection?.filters && selection.filters.length > 0) {
    for (const filter of selection.filters) {
      const col = dataset.columns.find((c) => c.name === filter.column);
      if (!col) continue;
      const cond = buildFilterCondition(col, filter);
      if (cond) conditions.push(cond);
    }
  } else if (selection?.filterColumn && selection.filterValue?.trim()) {
    const col = dataset.columns.find((c) => c.name === selection.filterColumn);
    if (col) {
      const cond = buildFilterCondition(col, {
        id: 'legacy',
        column: col.name,
        operator: 'contains',
        value: selection.filterValue,
      });
      if (cond) conditions.push(cond);
    }
  }

  return conditions;
}

/**
 * Builds the DuckDB SQL query and rich stakeholder metadata for charts and previews.
 */
export function buildChartQuerySpec(
  dataset: PipefySqlDataset | null | undefined,
  selection?: ChartQuerySelection,
  options?: { resolved?: ResolvedChartConfig }
): ChartQuerySpec {
  const chartType: DashboardChartType = selection?.type ?? 'horizontalBar';
  const dateGranularity: DateGranularity = selection?.dateGranularity ?? 'month';
  const stackMode: ChartStackMode = selection?.stackMode ?? 'stacked';
  const chartConfig: DashboardChartConfig = {
    id: 'chart-spec',
    ...selection,
    type: chartType,
  };

  if (selection?.dataMode === 'sql' && selection.customSql?.trim()) {
    return {
      sql: selection.customSql.trim(),
      chartType,
      isDateAxis: false,
      dateGranularity,
      chartTitle: dataset
        ? `Análise personalizada · ${dataset.name ?? dataset.pipeName}`
        : 'Análise personalizada',
      baseSubtitle: dataset
        ? `Base: ${dataset.rowsCount.toLocaleString('pt-BR')} registros · SQL personalizado`
        : 'Consulta SQL personalizada',
      valueLabel: 'Valor',
      valueFormat:
        selection.valueFormat && selection.valueFormat !== 'auto'
          ? selection.valueFormat
          : 'number',
      groupByColumn: null,
      groupByLabel: null,
      breakdownByColumn: null,
      breakdownByLabel: null,
      stackMode,
      metricColumn: null,
      metricLabel: null,
      aggregation: 'count',
      isAdditive: true,
      isCustomSql: true,
      groupOthersApplied: false,
      excludeEmptyApplied: false,
      splitMultiValueApplied: false,
      limitApplied: clampLimit(selection.limit, 10),
      canRender: true,
      issues: [],
      appliedConfig: chartConfig,
    };
  }

  if (!dataset || dataset.rowsCount === 0 || dataset.columns.length === 0) {
    const preset =
      SAMPLE_DATASET_PRESETS.find((p) => p.id === selection?.samplePreset) ??
      SAMPLE_DATASET_PRESETS[0];
    const limit = clampLimit(
      selection?.limit,
      chartType === 'pie' ? 6 : preset.isDateAxis ? 12 : 10
    );
    const groupOthers = selection?.groupOthers ?? true;
    const sortBy: ChartSortOrder = selection?.sortBy ?? 'value_desc';
    const isAdditive = isAdditiveAggregation(preset.aggregation);

    return {
      sql: buildSamplePresetSql(preset, limit, groupOthers, sortBy),
      chartType,
      isDateAxis: preset.isDateAxis,
      dateGranularity,
      chartTitle: preset.chartTitle,
      baseSubtitle: 'Dados demonstrativos · Carregue um Pipe para ver dados reais',
      valueLabel: preset.valueLabel,
      valueFormat:
        selection?.valueFormat && selection.valueFormat !== 'auto'
          ? selection.valueFormat
          : preset.valueFormat,
      groupByColumn: null,
      groupByLabel: null,
      breakdownByColumn: null,
      breakdownByLabel: null,
      stackMode,
      metricColumn: null,
      metricLabel: null,
      aggregation: preset.aggregation,
      isAdditive,
      isCustomSql: false,
      groupOthersApplied: !preset.isDateAxis && groupOthers && isAdditive,
      excludeEmptyApplied: true,
      splitMultiValueApplied: false,
      limitApplied: limit,
      canRender: true,
      issues: [],
      appliedConfig: chartConfig,
    };
  }

  const resolution = options?.resolved ?? resolveChartConfig(dataset, chartConfig);
  const appliedConfig = resolution.config;
  const datasetLabel = dataset.name ?? dataset.pipeName;
  const unresolvedSubtitle = `Base: ${dataset.rowsCount.toLocaleString('pt-BR')} registros · ${datasetLabel}`;

  if (!resolution.canRender) {
    return {
      sql: '',
      chartType,
      isDateAxis: false,
      dateGranularity,
      chartTitle: appliedConfig.title?.trim() || 'Gráfico precisa de ajuste',
      baseSubtitle: unresolvedSubtitle,
      valueLabel: '—',
      valueFormat: 'number',
      groupByColumn: appliedConfig.groupBy ?? null,
      groupByLabel:
        dataset.columns.find((c) => c.name === appliedConfig.groupBy)?.label ?? null,
      breakdownByColumn: null,
      breakdownByLabel: null,
      stackMode,
      metricColumn: null,
      metricLabel: null,
      aggregation: appliedConfig.aggregation ?? 'count',
      isAdditive: false,
      isCustomSql: false,
      groupOthersApplied: false,
      excludeEmptyApplied: false,
      splitMultiValueApplied: false,
      limitApplied: clampLimit(appliedConfig.limit, 10),
      canRender: false,
      issues: resolution.issues,
      appliedConfig,
    };
  }

  const groupCol: SqlColumnDef | null = appliedConfig.groupBy
    ? (dataset.columns.find((c) => c.name === appliedConfig.groupBy) ?? null)
    : null;
  const groupProfile: ColumnProfile | null = groupCol ? profileColumn(groupCol) : null;

  const candidateMetricCol: SqlColumnDef | null =
    appliedConfig.metric && appliedConfig.metric !== COUNT_METRIC_VALUE
      ? (dataset.columns.find((c) => c.name === appliedConfig.metric) ?? null)
      : null;

  const effectiveAgg: DashboardChartAggregation =
    appliedConfig.aggregation ??
    (candidateMetricCol ? getDefaultAggregationForMetric(candidateMetricCol) : 'count');

  const metricCol: SqlColumnDef | null =
    effectiveAgg === 'count' ? null : candidateMetricCol;

  const metricProfile = metricCol ? profileColumn(metricCol) : null;
  const valueFormat = resolveValueFormat(
    appliedConfig.valueFormat,
    metricProfile,
    effectiveAgg
  );
  const isAdditive = isAdditiveAggregation(effectiveAgg);

  let valueLabel = 'Cards';
  if (metricCol && metricProfile) {
    switch (effectiveAgg) {
      case 'count_non_empty':
        valueLabel = `Qtd. de ${metricCol.label}`;
        break;
      case 'count_distinct':
        valueLabel = `${metricCol.label} únicos`;
        break;
      case 'count_empty':
        valueLabel = `${metricCol.label} vazios`;
        break;
      case 'fill_rate':
        valueLabel = `% preenchido (${metricCol.label})`;
        break;
      case 'count_true': {
        const { trueLabel } = getBooleanLabels(metricProfile.role);
        valueLabel =
          trueLabel.toLowerCase() === metricCol.label.toLowerCase()
            ? `Qtd. ${trueLabel}`
            : `${trueLabel} (${metricCol.label})`;
        break;
      }
      case 'true_rate': {
        const { trueLabel } = getBooleanLabels(metricProfile.role);
        valueLabel =
          trueLabel.toLowerCase() === metricCol.label.toLowerCase()
            ? `Taxa de ${trueLabel}`
            : `Taxa de ${trueLabel} (${metricCol.label})`;
        break;
      }
      case 'avg':
        valueLabel = `Média de ${metricCol.label}`;
        break;
      case 'median':
        valueLabel = `Mediana de ${metricCol.label}`;
        break;
      case 'min':
        valueLabel = `Mínimo de ${metricCol.label}`;
        break;
      case 'max':
        valueLabel = `Máximo de ${metricCol.label}`;
        break;
      case 'sum':
      default:
        valueLabel = metricCol.label;
        break;
    }
  }

  const safeTable = sanitizeTableName(dataset.tableName);
  const quotedTable = quoteIdent(safeTable);
  const quotedGroupCol = groupCol ? quoteIdent(groupCol.name) : 'NULL';

  const filterConditions = getEffectiveFilters(dataset, appliedConfig);
  const dateRangeCol = appliedConfig.dateRangeColumn
    ? dataset.columns.find(
        (c) => c.name === appliedConfig.dateRangeColumn && c.sqlType === 'DATE'
      )
    : groupCol?.sqlType === 'DATE'
      ? groupCol
      : dataset.columns.find((c) => c.sqlType === 'DATE');
  const dateRangeCond = buildDateRangeCondition(
    dateRangeCol,
    appliedConfig.dateRangePreset
  );
  if (dateRangeCond) filterConditions.push(dateRangeCond);

  const whereClause =
    filterConditions.length > 0
      ? `\n      WHERE ${filterConditions.join('\n        AND ')}`
      : '';

  const isDateAxis = chartType !== 'kpi' && groupCol?.sqlType === 'DATE';
  const excludeEmpty = appliedConfig.excludeEmpty ?? true;
  const splitMultiValue =
    chartType !== 'kpi' &&
    groupCol?.sqlType === 'VARCHAR' &&
    (appliedConfig.splitMultiValue ?? Boolean(groupProfile?.isMultiValueLikely));
  const sortBy: ChartSortOrder = appliedConfig.sortBy ?? 'value_desc';
  const defaultLimit =
    chartType === 'pie' ? 6 : isDateAxis ? 12 : chartType === 'kpi' ? 3 : 10;
  const limit = clampLimit(appliedConfig.limit, defaultLimit);
  const groupOthers =
    chartType !== 'kpi' &&
    !isDateAxis &&
    isAdditive &&
    (appliedConfig.groupOthers ?? true);

  let rawBucketExpr = 'NULL';
  if (groupCol?.sqlType === 'DATE') {
    rawBucketExpr = buildDateBucketExpr(quotedGroupCol, dateGranularity);
  } else if (groupCol?.sqlType === 'BOOLEAN') {
    const { trueLabel, falseLabel } = getBooleanLabels(groupProfile?.role ?? 'boolean');
    rawBucketExpr = `CASE WHEN ${quotedGroupCol} IS TRUE THEN ${quoteLiteral(trueLabel)} WHEN ${quotedGroupCol} IS FALSE THEN ${quoteLiteral(falseLabel)} ELSE NULL END`;
  } else if (groupCol) {
    rawBucketExpr = `CAST(${quotedGroupCol} AS VARCHAR)`;
  }

  const supportsBreakdown =
    chartType === 'horizontalBar' ||
    chartType === 'bar' ||
    chartType === 'line' ||
    chartType === 'area';
  const breakdownCol: SqlColumnDef | null =
    supportsBreakdown &&
    appliedConfig.breakdownBy &&
    appliedConfig.breakdownBy !== groupCol?.name
      ? (dataset.columns.find((c) => c.name === appliedConfig.breakdownBy) ?? null)
      : null;

  let rawSeriesExpr = 'NULL';
  if (breakdownCol) {
    const qBreak = quoteIdent(breakdownCol.name);
    const breakProfile = profileColumn(breakdownCol);
    if (breakdownCol.sqlType === 'DATE') {
      rawSeriesExpr = `COALESCE(strftime(${qBreak}, '%Y-%m'), 'Sem data')`;
    } else if (breakdownCol.sqlType === 'BOOLEAN') {
      const { trueLabel, falseLabel } = getBooleanLabels(breakProfile.role);
      rawSeriesExpr = `CASE WHEN ${qBreak} IS TRUE THEN ${quoteLiteral(trueLabel)} WHEN ${qBreak} IS FALSE THEN ${quoteLiteral(falseLabel)} ELSE 'Não informado' END`;
    } else {
      rawSeriesExpr = `COALESCE(NULLIF(TRIM(CAST(${qBreak} AS VARCHAR)), ''), 'Não informado')`;
    }
  }

  const metricSelectExpr = metricCol ? quoteIdent(metricCol.name) : 'NULL';
  const metricColRef = '_metric_val';

  let aggExpr = 'COUNT(*)';
  if (metricCol) {
    switch (effectiveAgg) {
      case 'count_non_empty':
        aggExpr = `COUNT(NULLIF(TRIM(CAST(${metricColRef} AS VARCHAR)), ''))`;
        break;
      case 'count_distinct':
        aggExpr = `COUNT(DISTINCT NULLIF(TRIM(CAST(${metricColRef} AS VARCHAR)), ''))`;
        break;
      case 'count_empty':
        aggExpr = `SUM(CASE WHEN ${metricColRef} IS NULL OR TRIM(CAST(${metricColRef} AS VARCHAR)) = '' THEN 1 ELSE 0 END)`;
        break;
      case 'fill_rate':
        aggExpr = `ROUND(100.0 * COUNT(NULLIF(TRIM(CAST(${metricColRef} AS VARCHAR)), '')) / NULLIF(COUNT(*), 0), 1)`;
        break;
      case 'count_true':
        aggExpr = `SUM(CASE WHEN ${metricColRef} IS TRUE THEN 1 ELSE 0 END)`;
        break;
      case 'true_rate':
        aggExpr = `ROUND(100.0 * SUM(CASE WHEN ${metricColRef} IS TRUE THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)`;
        break;
      case 'avg':
        aggExpr = `AVG(${metricColRef})`;
        break;
      case 'median':
        aggExpr = `MEDIAN(${metricColRef})`;
        break;
      case 'min':
        aggExpr = `MIN(${metricColRef})`;
        break;
      case 'max':
        aggExpr = `MAX(${metricColRef})`;
        break;
      case 'sum':
      default:
        aggExpr = `COALESCE(SUM(${metricColRef}), 0)`;
        break;
    }
  }

  const emptyBucketLabel = isDateAxis ? 'Sem data' : 'Não informado';
  const baseSubtitle = `Base: ${dataset.rowsCount.toLocaleString('pt-BR')} registros · ${datasetLabel}`;
  const breakdownSuffix = breakdownCol ? ` × ${breakdownCol.label}` : '';
  const chartTitle =
    chartType === 'kpi'
      ? metricCol
        ? `${valueLabel}`
        : 'Total de Cards'
      : metricCol
        ? `${valueLabel} por ${groupCol?.label ?? 'grupo'}${breakdownSuffix}`
        : `Registros por ${groupCol?.label ?? 'grupo'}${breakdownSuffix}`;

  const baseFilteredCte = splitMultiValue
    ? `
    base_source AS (
      SELECT
        row_number() OVER () AS _row_id,
        ${rawBucketExpr} AS _raw_text,
        ${rawSeriesExpr} AS _series_raw,
        ${metricSelectExpr} AS _metric_val,
        CASE WHEN ${rawBucketExpr} IS NULL OR TRIM(CAST(${rawBucketExpr} AS VARCHAR)) = '' THEN 1 ELSE 0 END AS _is_empty_row
      FROM ${quotedTable}${whereClause}
    ),
    base_filtered AS (
      SELECT
        _row_id,
        NULLIF(TRIM(_part), '') AS raw_bucket,
        _series_raw,
        _metric_val,
        _is_empty_row
      FROM (
        SELECT
          _row_id,
          UNNEST(string_split(replace(COALESCE(_raw_text, ''), ';', ','), ',')) AS _part,
          _series_raw,
          _metric_val,
          _is_empty_row
        FROM base_source
      )
      WHERE _is_empty_row = 1 OR NULLIF(TRIM(_part), '') IS NOT NULL
    )`
    : `
    base_filtered AS (
      SELECT
        row_number() OVER () AS _row_id,
        ${rawBucketExpr} AS raw_bucket,
        ${rawSeriesExpr} AS _series_raw,
        ${metricSelectExpr} AS _metric_val,
        CASE WHEN ${rawBucketExpr} IS NULL OR TRIM(CAST(${rawBucketExpr} AS VARCHAR)) = '' THEN 1 ELSE 0 END AS _is_empty_row
      FROM ${quotedTable}${whereClause}
    )`;

  const scopedFilter = excludeEmpty
    ? `\n      WHERE _is_empty_row = 0 AND raw_bucket IS NOT NULL AND TRIM(CAST(raw_bucket AS VARCHAR)) <> ''`
    : '';

  if (chartType === 'kpi') {
    const hasGroup = Boolean(appliedConfig.groupBy && groupCol);
    const sql = `
      WITH
      pipe_meta AS (
        SELECT COUNT(*) AS all_cards FROM ${quotedTable}
      ),
      ${baseFilteredCte},
      empty_stats AS (
        SELECT
          COUNT(DISTINCT CASE WHEN raw_bucket IS NULL OR TRIM(CAST(raw_bucket AS VARCHAR)) = '' THEN _row_id END) AS excluded_empty_count
        FROM base_filtered
      ),
      scoped AS (
        SELECT
          _row_id,
          COALESCE(NULLIF(TRIM(CAST(raw_bucket AS VARCHAR)), ''), ${quoteLiteral(emptyBucketLabel)}) AS bucket,
          _metric_val
        FROM base_filtered${hasGroup && excludeEmpty ? scopedFilter : ''}
      ),
      overall AS (
        SELECT
          COALESCE(ROUND(${aggExpr}, 2), 0) AS grand_total,
          COUNT(DISTINCT _row_id) AS total_cards
        FROM scoped
      ),
      grouped AS (
        SELECT
          ${hasGroup ? 'bucket' : `${quoteLiteral(valueLabel)} AS bucket`},
          ROUND(${aggExpr}, 2) AS total,
          COUNT(DISTINCT _row_id) AS card_count
        FROM scoped
        ${hasGroup ? 'GROUP BY 1' : ''}
        HAVING ${aggExpr} IS NOT NULL
      ),
      group_stats AS (
        SELECT
          COUNT(*) AS total_groups,
          COALESCE(ROUND(AVG(total), 2), 0) AS avg_per_group
        FROM grouped
      )
      SELECT
        g.bucket,
        g.total,
        g.card_count,
        0 AS is_others,
        o.grand_total,
        o.total_cards,
        pm.all_cards,
        gs.total_groups,
        gs.avg_per_group,
        es.excluded_empty_count
      FROM grouped g
      CROSS JOIN overall o
      CROSS JOIN pipe_meta pm
      CROSS JOIN group_stats gs
      CROSS JOIN empty_stats es
      ORDER BY g.total DESC
      LIMIT 3
    `;

    return {
      sql,
      chartType,
      isDateAxis: false,
      dateGranularity,
      chartTitle,
      baseSubtitle,
      valueLabel,
      valueFormat,
      groupByColumn: hasGroup ? (groupCol?.name ?? null) : null,
      groupByLabel: hasGroup ? (groupCol?.label ?? null) : null,
      breakdownByColumn: null,
      breakdownByLabel: null,
      stackMode,
      metricColumn: metricCol?.name ?? COUNT_METRIC_VALUE,
      metricLabel: metricCol?.label ?? 'Cards',
      aggregation: effectiveAgg,
      isAdditive,
      isCustomSql: false,
      groupOthersApplied: false,
      excludeEmptyApplied: hasGroup && excludeEmpty,
      splitMultiValueApplied: false,
      limitApplied: 3,
      canRender: true,
      issues: resolution.issues,
      appliedConfig,
    };
  }

  const orderClause = buildSortOrderClause(sortBy);

  if (breakdownCol) {
    const breakdownOrderClause =
      sortBy === 'value_asc'
        ? 'fbt.bucket_total ASC, sc.bucket ASC'
        : sortBy === 'label_asc'
          ? 'sc.bucket ASC'
          : sortBy === 'label_desc'
            ? 'sc.bucket DESC'
            : 'fbt.bucket_total DESC, sc.bucket ASC';

    const sql = `
      WITH
      pipe_meta AS (
        SELECT COUNT(*) AS all_cards FROM ${quotedTable}
      ),
      ${baseFilteredCte},
      empty_stats AS (
        SELECT
          COUNT(DISTINCT CASE WHEN raw_bucket IS NULL OR TRIM(CAST(raw_bucket AS VARCHAR)) = '' THEN _row_id END) AS excluded_empty_count
        FROM base_filtered
      ),
      scoped AS (
        SELECT
          _row_id,
          COALESCE(NULLIF(TRIM(CAST(raw_bucket AS VARCHAR)), ''), ${quoteLiteral(emptyBucketLabel)}) AS bucket,
          COALESCE(NULLIF(TRIM(CAST(_series_raw AS VARCHAR)), ''), 'Não informado') AS raw_series,
          _metric_val,
          CASE WHEN raw_bucket IS NULL OR TRIM(CAST(raw_bucket AS VARCHAR)) = '' THEN 1 ELSE 0 END AS is_empty_bucket
        FROM base_filtered${scopedFilter}
      ),
      series_totals AS (
        SELECT
          raw_series,
          ROUND(${aggExpr}, 2) AS s_total
        FROM scoped
        GROUP BY 1
        HAVING ${aggExpr} IS NOT NULL
      ),
      top_series AS (
        SELECT
          raw_series,
          ROW_NUMBER() OVER (ORDER BY s_total DESC, raw_series ASC) AS srn
        FROM series_totals
      ),
      scoped_series AS (
        SELECT
          s._row_id,
          s.bucket,
          CASE WHEN ts.srn <= 5 THEN s.raw_series ELSE 'Outros' END AS series_name,
          s._metric_val,
          s.is_empty_bucket
        FROM scoped s
        LEFT JOIN top_series ts ON s.raw_series = ts.raw_series
      ),
      overall AS (
        SELECT
          COALESCE(ROUND(${aggExpr}, 2), 0) AS grand_total,
          COUNT(DISTINCT _row_id) AS total_cards
        FROM scoped
      ),
      bucket_totals AS (
        SELECT
          bucket,
          ROUND(${aggExpr}, 2) AS total,
          COUNT(DISTINCT _row_id) AS card_count,
          MAX(is_empty_bucket) AS is_empty_bucket
        FROM scoped_series
        GROUP BY 1
        HAVING ${aggExpr} IS NOT NULL
      ),
      group_stats AS (
        SELECT
          COUNT(*) AS total_groups,
          COALESCE(ROUND(AVG(total), 2), 0) AS avg_per_group
        FROM bucket_totals
      ),
      bucket_ranked AS (
        SELECT
          bucket,
          total,
          card_count,
          is_empty_bucket,
          ROW_NUMBER() OVER (ORDER BY ${isDateAxis ? 'is_empty_bucket ASC, bucket DESC' : orderClause}) AS rn
        FROM bucket_totals
      ),
      mapped_buckets AS (
        SELECT
          ss._row_id,
          CASE WHEN br.rn <= ${limit} THEN ss.bucket ELSE 'Outros' END AS final_bucket,
          CASE WHEN br.rn <= ${limit} THEN 0 ELSE 1 END AS is_others,
          CASE WHEN br.rn <= ${limit} THEN br.is_empty_bucket ELSE 0 END AS is_empty_bucket,
          ss.series_name,
          ss._metric_val
        FROM scoped_series ss
        INNER JOIN bucket_ranked br ON ss.bucket = br.bucket
        ${groupOthers ? '' : `WHERE br.rn <= ${limit}`}
      ),
      final_bucket_totals AS (
        SELECT
          final_bucket AS bucket,
          is_others,
          MAX(is_empty_bucket) AS is_empty_bucket,
          ROUND(${aggExpr}, 2) AS bucket_total,
          COUNT(DISTINCT _row_id) AS bucket_cards
        FROM mapped_buckets
        GROUP BY 1, 2
      ),
      series_cells AS (
        SELECT
          final_bucket AS bucket,
          is_others,
          series_name,
          ROUND(${aggExpr}, 2) AS total,
          COUNT(DISTINCT _row_id) AS card_count
        FROM mapped_buckets
        GROUP BY 1, 2, 3
        HAVING ${aggExpr} IS NOT NULL
      )
      SELECT
        sc.bucket,
        sc.series_name,
        sc.total,
        sc.card_count,
        fbt.bucket_total,
        fbt.bucket_cards,
        sc.is_others,
        o.grand_total,
        o.total_cards,
        pm.all_cards,
        gs.total_groups,
        gs.avg_per_group,
        es.excluded_empty_count
      FROM series_cells sc
      INNER JOIN final_bucket_totals fbt ON sc.bucket = fbt.bucket AND sc.is_others = fbt.is_others
      CROSS JOIN overall o
      CROSS JOIN pipe_meta pm
      CROSS JOIN group_stats gs
      CROSS JOIN empty_stats es
      ORDER BY ${isDateAxis ? 'fbt.is_empty_bucket ASC, sc.bucket ASC' : `sc.is_others ASC, ${breakdownOrderClause}`}
    `;

    return {
      sql,
      chartType,
      isDateAxis,
      dateGranularity,
      chartTitle,
      baseSubtitle,
      valueLabel,
      valueFormat,
      groupByColumn: groupCol?.name ?? null,
      groupByLabel: groupCol?.label ?? null,
      breakdownByColumn: breakdownCol.name,
      breakdownByLabel: breakdownCol.label,
      stackMode,
      metricColumn: metricCol?.name ?? COUNT_METRIC_VALUE,
      metricLabel: metricCol?.label ?? 'Cards',
      aggregation: effectiveAgg,
      isAdditive,
      isCustomSql: false,
      groupOthersApplied: groupOthers,
      excludeEmptyApplied: excludeEmpty,
      splitMultiValueApplied: splitMultiValue,
      limitApplied: limit,
      canRender: true,
      issues: resolution.issues,
      appliedConfig,
    };
  }

  if (isDateAxis) {
    const sql = `
      WITH
      pipe_meta AS (
        SELECT COUNT(*) AS all_cards FROM ${quotedTable}
      ),
      ${baseFilteredCte},
      empty_stats AS (
        SELECT
          COUNT(DISTINCT CASE WHEN raw_bucket IS NULL OR TRIM(CAST(raw_bucket AS VARCHAR)) = '' THEN _row_id END) AS excluded_empty_count
        FROM base_filtered
      ),
      scoped AS (
        SELECT
          _row_id,
          COALESCE(NULLIF(TRIM(CAST(raw_bucket AS VARCHAR)), ''), ${quoteLiteral(emptyBucketLabel)}) AS bucket,
          _metric_val,
          CASE WHEN raw_bucket IS NULL OR TRIM(CAST(raw_bucket AS VARCHAR)) = '' THEN 1 ELSE 0 END AS is_empty_bucket
        FROM base_filtered${scopedFilter}
      ),
      overall AS (
        SELECT
          COALESCE(ROUND(${aggExpr}, 2), 0) AS grand_total,
          COUNT(DISTINCT _row_id) AS total_cards
        FROM scoped
      ),
      grouped AS (
        SELECT
          bucket,
          ROUND(${aggExpr}, 2) AS total,
          COUNT(DISTINCT _row_id) AS card_count,
          MAX(is_empty_bucket) AS is_empty_bucket
        FROM scoped
        GROUP BY 1
        HAVING ${aggExpr} IS NOT NULL
      ),
      group_stats AS (
        SELECT
          COUNT(*) AS total_groups,
          COALESCE(ROUND(AVG(total), 2), 0) AS avg_per_group
        FROM grouped
      ),
      recent AS (
        SELECT bucket, total, card_count, is_empty_bucket
        FROM grouped
        ORDER BY is_empty_bucket ASC, bucket DESC
        LIMIT ${limit}
      )
      SELECT
        r.bucket,
        r.total,
        r.card_count,
        0 AS is_others,
        o.grand_total,
        o.total_cards,
        pm.all_cards,
        gs.total_groups,
        gs.avg_per_group,
        es.excluded_empty_count
      FROM recent r
      CROSS JOIN overall o
      CROSS JOIN pipe_meta pm
      CROSS JOIN group_stats gs
      CROSS JOIN empty_stats es
      ORDER BY r.is_empty_bucket ASC, r.bucket ASC
    `;

    return {
      sql,
      chartType,
      isDateAxis: true,
      dateGranularity,
      chartTitle,
      baseSubtitle,
      valueLabel,
      valueFormat,
      groupByColumn: groupCol?.name ?? null,
      groupByLabel: groupCol?.label ?? null,
      breakdownByColumn: null,
      breakdownByLabel: null,
      stackMode,
      metricColumn: metricCol?.name ?? COUNT_METRIC_VALUE,
      metricLabel: metricCol?.label ?? 'Cards',
      aggregation: effectiveAgg,
      isAdditive,
      isCustomSql: false,
      groupOthersApplied: false,
      excludeEmptyApplied: excludeEmpty,
      splitMultiValueApplied: false,
      limitApplied: limit,
      canRender: true,
      issues: resolution.issues,
      appliedConfig,
    };
  }

  const sql = `
    WITH
    pipe_meta AS (
      SELECT COUNT(*) AS all_cards FROM ${quotedTable}
    ),
    ${baseFilteredCte},
    empty_stats AS (
      SELECT
        COUNT(DISTINCT CASE WHEN raw_bucket IS NULL OR TRIM(CAST(raw_bucket AS VARCHAR)) = '' THEN _row_id END) AS excluded_empty_count
      FROM base_filtered
    ),
    scoped AS (
      SELECT
        _row_id,
        COALESCE(NULLIF(TRIM(CAST(raw_bucket AS VARCHAR)), ''), ${quoteLiteral(emptyBucketLabel)}) AS bucket,
        _metric_val
      FROM base_filtered${scopedFilter}
    ),
    overall AS (
      SELECT
        COALESCE(ROUND(${aggExpr}, 2), 0) AS grand_total,
        COUNT(DISTINCT _row_id) AS total_cards
      FROM scoped
    ),
    grouped AS (
      SELECT
        bucket,
        ROUND(${aggExpr}, 2) AS total,
        COUNT(DISTINCT _row_id) AS card_count
      FROM scoped
      GROUP BY 1
      HAVING ${aggExpr} IS NOT NULL
    ),
    group_stats AS (
      SELECT
        COUNT(*) AS total_groups,
        COALESCE(ROUND(AVG(total), 2), 0) AS avg_per_group
      FROM grouped
    ),
    ranked AS (
      SELECT
        bucket,
        total,
        card_count,
        ROW_NUMBER() OVER (ORDER BY ${orderClause}) AS rn
      FROM grouped
    ),
    top_rows AS (
      SELECT bucket, total, card_count, 0 AS is_others
      FROM ranked
      WHERE rn <= ${limit}
    )${
      groupOthers
        ? `,
    others_row AS (
      SELECT
        'Outros' AS bucket,
        ROUND(SUM(total), 2) AS total,
        SUM(card_count) AS card_count,
        1 AS is_others
      FROM ranked
      WHERE rn > ${limit}
      HAVING COUNT(*) > 0
    ),
    combined AS (
      SELECT * FROM top_rows
      UNION ALL
      SELECT * FROM others_row
    )`
        : `,
    combined AS (
      SELECT * FROM top_rows
    )`
    }
    SELECT
      c.bucket,
      c.total,
      c.card_count,
      c.is_others,
      o.grand_total,
      o.total_cards,
      pm.all_cards,
      gs.total_groups,
      gs.avg_per_group,
      es.excluded_empty_count
    FROM combined c
    CROSS JOIN overall o
    CROSS JOIN pipe_meta pm
    CROSS JOIN group_stats gs
    CROSS JOIN empty_stats es
    ORDER BY c.is_others ASC, ${orderClause}
  `;

  return {
    sql,
    chartType,
    isDateAxis: false,
    dateGranularity,
    chartTitle,
    baseSubtitle,
    valueLabel,
    valueFormat,
    groupByColumn: groupCol?.name ?? null,
    groupByLabel: groupCol?.label ?? null,
    breakdownByColumn: null,
    breakdownByLabel: null,
    stackMode,
    metricColumn: metricCol?.name ?? COUNT_METRIC_VALUE,
    metricLabel: metricCol?.label ?? 'Cards',
    aggregation: effectiveAgg,
    isAdditive,
    isCustomSql: false,
    groupOthersApplied: groupOthers,
    excludeEmptyApplied: excludeEmpty,
    splitMultiValueApplied: splitMultiValue,
    limitApplied: limit,
    canRender: true,
    issues: resolution.issues,
    appliedConfig,
  };
}

export const buildBarChartQuerySpec = buildChartQuerySpec;

function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value ?? fallback);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : fallback;
}

/**
 * Converts DuckDB rows into normalized chart points and grand-total summary metadata.
 */
export function mapDuckDbRowsToChartResult(
  rows: Array<Record<string, unknown>>,
  options: {
    isDateAxis: boolean;
    dateGranularity?: DateGranularity;
    isAdditive?: boolean;
    splitMultiValue?: boolean;
    columns?: string[];
  }
): { points: ChartDataPoint[]; summary: ChartQuerySummary; seriesKeys: string[] } {
  if (rows.length === 0) {
    return {
      points: [],
      summary: {
        grandTotal: 0,
        totalCards: 0,
        allDatasetCards: 0,
        totalGroups: 0,
        avgPerGroup: 0,
        excludedEmptyCount: 0,
        pctOfPipe: 0,
      },
      seriesKeys: [],
    };
  }

  const {
    isDateAxis,
    dateGranularity = 'month',
    isAdditive = true,
    splitMultiValue = false,
    columns,
  } = options;

  const first = rows[0];
  const hasGrandTotal = Object.prototype.hasOwnProperty.call(first, 'grand_total');
  const hasTotalCards = Object.prototype.hasOwnProperty.call(first, 'total_cards');
  const hasAllCards = Object.prototype.hasOwnProperty.call(first, 'all_cards');
  const hasTotalGroups = Object.prototype.hasOwnProperty.call(first, 'total_groups');
  const hasAvgPerGroup = Object.prototype.hasOwnProperty.call(first, 'avg_per_group');
  const hasExcludedEmpty = Object.prototype.hasOwnProperty.call(
    first,
    'excluded_empty_count'
  );
  const hasSeriesName = Object.prototype.hasOwnProperty.call(first, 'series_name');

  let rawPoints: Array<{
    name: string;
    rawBucket: string;
    value: number;
    cardCount: number;
    isOthers: boolean;
    seriesValues?: Record<string, number>;
  }> = [];
  let seriesKeys: string[] = [];

  if (hasSeriesName) {
    const bucketOrder: string[] = [];
    const bucketMap = new Map<
      string,
      {
        name: string;
        rawBucket: string;
        value: number;
        cardCount: number;
        isOthers: boolean;
        seriesValues: Record<string, number>;
      }
    >();
    const seriesTotals = new Map<string, number>();

    for (const row of rows) {
      const rawBucket =
        row.bucket !== null && row.bucket !== undefined && String(row.bucket) !== ''
          ? String(row.bucket)
          : 'Sem dado';
      const seriesName =
        row.series_name !== null &&
        row.series_name !== undefined &&
        String(row.series_name) !== ''
          ? String(row.series_name)
          : 'Não informado';
      const cellValue = toFiniteNumber(row.total, 0);
      const bucketValue = Object.prototype.hasOwnProperty.call(row, 'bucket_total')
        ? toFiniteNumber(row.bucket_total, cellValue)
        : cellValue;
      const bucketCards = Object.prototype.hasOwnProperty.call(row, 'bucket_cards')
        ? Math.max(0, Math.round(toFiniteNumber(row.bucket_cards, 0)))
        : Math.max(0, Math.round(toFiniteNumber(row.card_count, 0)));
      const isOthers =
        Number(row.is_others ?? 0) === 1 || rawBucket === 'Outros';

      let entry = bucketMap.get(rawBucket);
      if (!entry) {
        entry = {
          name: isDateAxis ? formatDateBucket(rawBucket, dateGranularity) : rawBucket,
          rawBucket,
          value: bucketValue,
          cardCount: bucketCards,
          isOthers,
          seriesValues: {},
        };
        bucketMap.set(rawBucket, entry);
        bucketOrder.push(rawBucket);
      }
      entry.seriesValues[seriesName] = cellValue;
      seriesTotals.set(
        seriesName,
        (seriesTotals.get(seriesName) ?? 0) + cellValue
      );
    }

    seriesKeys = Array.from(seriesTotals.entries())
      .sort((a, b) => {
        if (a[0] === 'Outros') return 1;
        if (b[0] === 'Outros') return -1;
        return b[1] - a[1];
      })
      .map(([key]) => key);

    rawPoints = bucketOrder.map((key) => bucketMap.get(key)!);
  } else {
    rawPoints = rows.map((row) => {
      const hasBucket = Object.prototype.hasOwnProperty.call(row, 'bucket');
      const hasTotal = Object.prototype.hasOwnProperty.call(row, 'total');
      const rowKeys = columns && columns.length > 0 ? columns : Object.keys(row);

      const rawLabel = hasBucket
        ? row.bucket
        : rowKeys[0]
          ? row[rowKeys[0]]
          : 'Sem dado';
      const rawValue = hasTotal
        ? row.total
        : rowKeys[1]
          ? row[rowKeys[1]]
          : rowKeys[0]
            ? row[rowKeys[0]]
            : 0;

      const rawBucket =
        rawLabel !== null && rawLabel !== undefined && String(rawLabel) !== ''
          ? String(rawLabel)
          : 'Sem dado';
      const name = isDateAxis
        ? formatDateBucket(rawBucket, dateGranularity)
        : rawBucket;
      const value = toFiniteNumber(rawValue, 0);
      const cardCount = Object.prototype.hasOwnProperty.call(row, 'card_count')
        ? Math.max(0, Math.round(toFiniteNumber(row.card_count, 0)))
        : Math.max(0, Math.round(value));
      const isOthers =
        Number(row.is_others ?? 0) === 1 || rawBucket === 'Outros';

      return {
        name,
        rawBucket,
        value,
        cardCount,
        isOthers,
      };
    });
  }

  const fallbackSum = rawPoints.reduce((acc, pt) => acc + pt.value, 0);
  const grandTotal = hasGrandTotal
    ? toFiniteNumber(first.grand_total, fallbackSum)
    : fallbackSum;
  const totalCards = hasTotalCards
    ? Math.max(0, Math.round(toFiniteNumber(first.total_cards, rawPoints.length)))
    : rawPoints.reduce((acc, pt) => acc + pt.cardCount, 0);
  const allDatasetCards = hasAllCards
    ? Math.max(0, Math.round(toFiniteNumber(first.all_cards, totalCards)))
    : totalCards;
  const totalGroups = hasTotalGroups
    ? Math.max(0, Math.round(toFiniteNumber(first.total_groups, rawPoints.length)))
    : rawPoints.length;
  const avgPerGroup = hasAvgPerGroup
    ? toFiniteNumber(first.avg_per_group, 0)
    : rawPoints.length > 0
      ? Math.round((fallbackSum / rawPoints.length) * 100) / 100
      : 0;
  const excludedEmptyCount = hasExcludedEmpty
    ? Math.max(0, Math.round(toFiniteNumber(first.excluded_empty_count, 0)))
    : 0;

  const shareDenominator = splitMultiValue ? totalCards : grandTotal;
  const points: ChartDataPoint[] = rawPoints.map((pt, idx) => {
    const sharePct =
      isAdditive && shareDenominator > 0
        ? Math.round((pt.value / shareDenominator) * 1000) / 10
        : null;

    let deltaPct: number | null = null;
    if (isDateAxis && idx > 0) {
      const prev = rawPoints[idx - 1];
      if (prev && prev.value !== 0) {
        deltaPct =
          Math.round(((pt.value - prev.value) / Math.abs(prev.value)) * 1000) / 10;
      }
    }

    return {
      ...pt,
      sharePct,
      deltaPct,
    };
  });

  const pctOfPipe =
    allDatasetCards > 0
      ? Math.round((totalCards / allDatasetCards) * 1000) / 10
      : 100;

  return {
    points,
    summary: {
      grandTotal,
      totalCards,
      allDatasetCards,
      totalGroups,
      avgPerGroup,
      excludedEmptyCount,
      pctOfPipe,
    },
    seriesKeys,
  };
}

export function mapDuckDbRowsToChartPoints(
  rows: Array<Record<string, unknown>>,
  isDateAxis: boolean,
  columns?: string[]
): ChartDataPoint[] {
  return mapDuckDbRowsToChartResult(rows, { isDateAxis, columns }).points;
}

/**
 * Builds a fast DuckDB query returning the most frequent non-empty distinct values
 * of a column for filter autocomplete suggestions.
 */
export function buildDistinctValuesQuery(
  dataset: PipefySqlDataset | null | undefined,
  columnName: string | undefined,
  limit = 40
): string | null {
  if (!dataset || !columnName || dataset.rowsCount === 0) return null;
  const col = dataset.columns.find((c) => c.name === columnName);
  if (!col) return null;

  const quotedTable = quoteIdent(sanitizeTableName(dataset.tableName));
  const quotedCol = quoteIdent(col.name);

  if (col.sqlType === 'BOOLEAN') {
    const profile = profileColumn(col);
    const { trueLabel, falseLabel } = getBooleanLabels(profile.role);
    return `
      SELECT DISTINCT
        CASE
          WHEN ${quotedCol} IS TRUE THEN ${quoteLiteral(trueLabel)}
          WHEN ${quotedCol} IS FALSE THEN ${quoteLiteral(falseLabel)}
        END AS value
      FROM ${quotedTable}
      WHERE ${quotedCol} IS NOT NULL
      ORDER BY 1 ASC
      LIMIT 10
    `;
  }

  return `
    SELECT
      TRIM(CAST(${quotedCol} AS VARCHAR)) AS value,
      COUNT(*) AS freq
    FROM ${quotedTable}
    WHERE ${quotedCol} IS NOT NULL AND TRIM(CAST(${quotedCol} AS VARCHAR)) <> ''
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT ${Math.max(5, Math.min(100, limit))}
  `;
}

export interface ExecutiveSummarySpec {
  sql: string;
  totalLabel: string;
  dimensionLabel?: string;
  booleanLabel?: string;
  booleanTrueLabel?: string;
  currencyLabel?: string;
  hasDimensionCol: boolean;
  hasBooleanCol: boolean;
  hasCurrencyCol: boolean;
}

/**
 * Builds a single lightweight query computing high-signal executive KPIs for the
 * active dataset, derived from its semantic capabilities (Pipe or file alike).
 */
export function buildExecutiveSummaryQuery(
  dataset: PipefySqlDataset | null | undefined
): ExecutiveSummarySpec | null {
  if (!dataset || dataset.rowsCount === 0 || dataset.columns.length === 0) {
    return null;
  }

  const capabilities = getDatasetCapabilities(dataset);
  const dimensionCol = capabilities.primaryDimension;
  const booleanCol = capabilities.primaryBoolean;
  const currencyCol = capabilities.primaryCurrency;

  const quotedTable = quoteIdent(sanitizeTableName(dataset.tableName));

  const dimensionExpr = dimensionCol
    ? `COUNT(DISTINCT NULLIF(TRIM(CAST(${quoteIdent(dimensionCol.name)} AS VARCHAR)), ''))`
    : '0';
  const boolTrueExpr = booleanCol
    ? `SUM(CASE WHEN ${quoteIdent(booleanCol.name)} IS TRUE THEN 1 ELSE 0 END)`
    : '0';
  const boolTotalExpr = booleanCol
    ? `COUNT(${quoteIdent(booleanCol.name)})`
    : '0';
  const currencyTotalExpr = currencyCol
    ? `COALESCE(ROUND(SUM(${quoteIdent(currencyCol.name)}), 2), 0)`
    : '0';
  const currencyAvgExpr = currencyCol
    ? `COALESCE(ROUND(AVG(${quoteIdent(currencyCol.name)}), 2), 0)`
    : '0';

  const sql = `
    SELECT
      COUNT(*) AS total_records,
      ${dimensionExpr} AS dimension_groups,
      ${boolTrueExpr} AS boolean_true,
      ${boolTotalExpr} AS boolean_total,
      ${currencyTotalExpr} AS total_value,
      ${currencyAvgExpr} AS avg_value
    FROM ${quotedTable}
  `;

  return {
    sql,
    totalLabel: 'Registros',
    dimensionLabel: dimensionCol?.label,
    booleanLabel: booleanCol?.label,
    booleanTrueLabel: booleanCol
      ? getBooleanLabels(booleanCol.role).trueLabel
      : undefined,
    currencyLabel: currencyCol?.label,
    hasDimensionCol: Boolean(dimensionCol),
    hasBooleanCol: Boolean(booleanCol),
    hasCurrencyCol: Boolean(currencyCol),
  };
}
