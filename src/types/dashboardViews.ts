export type DashboardChartType =
  | 'horizontalBar'
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'kpi'
  | 'radar'
  | 'radialBar';

export type DashboardChartAggregation =
  | 'count'
  | 'count_non_empty'
  | 'count_distinct'
  | 'count_empty'
  | 'fill_rate'
  | 'count_true'
  | 'true_rate'
  | 'sum'
  | 'avg'
  | 'median'
  | 'min'
  | 'max';

export type ChartStackMode = 'stacked' | 'grouped';

export type DashboardChartDataMode = 'builder' | 'sql';

export type DateGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type ChartSortOrder =
  | 'value_desc'
  | 'value_asc'
  | 'label_asc'
  | 'label_desc';

export type ChartValueFormat =
  | 'auto'
  | 'number'
  | 'currency_brl'
  | 'percent'
  | 'duration_days';

export type ChartDateRangePreset =
  | 'all'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'last_12m'
  | 'this_month'
  | 'this_quarter'
  | 'this_year';

export type ChartFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'not_empty'
  | 'is_empty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export interface DashboardChartFilter {
  id: string;
  column: string;
  operator: ChartFilterOperator;
  value?: string;
}

export type SampleDatasetPresetId =
  | 'monthly_cards'
  | 'cards_by_phase'
  | 'revenue_by_company'
  | 'sla_status'
  | 'avg_ticket_by_phase';

export interface DashboardChartTypeOption {
  type: DashboardChartType;
  label: string;
  description: string;
  bestFor?: string;
}

export const PRIMARY_CHART_TYPE_OPTIONS: ReadonlyArray<DashboardChartTypeOption> = [
  {
    type: 'horizontalBar',
    label: 'Barras Horizontais',
    description: 'Melhor para rankings, fases e nomes longos',
    bestFor: 'Ranking e comparação',
  },
  {
    type: 'bar',
    label: 'Colunas',
    description: 'Comparação direta entre poucas categorias ou meses',
    bestFor: 'Comparação vertical',
  },
  {
    type: 'line',
    label: 'Linhas',
    description: 'Tendência e ritmo de crescimento ao longo do tempo',
    bestFor: 'Série temporal',
  },
  {
    type: 'area',
    label: 'Área',
    description: 'Volume e evolução contínua por período',
    bestFor: 'Volume temporal',
  },
  {
    type: 'pie',
    label: 'Rosca / Participação',
    description: 'Proporção de até 6 fatias sobre o total',
    bestFor: 'Participação (%)',
  },
  {
    type: 'kpi',
    label: 'Indicador (KPI)',
    description: 'Número executivo principal com contexto e líderes',
    bestFor: 'Resumo executivo',
  },
];

export const LEGACY_CHART_TYPE_OPTIONS: ReadonlyArray<DashboardChartTypeOption> = [
  {
    type: 'radar',
    label: 'Radar',
    description: 'Comparação multidimensional entre grupos',
  },
  {
    type: 'radialBar',
    label: 'Barras Radiais',
    description: 'Ranking circular proporcional',
  },
];

export const DASHBOARD_CHART_TYPE_OPTIONS: ReadonlyArray<DashboardChartTypeOption> = [
  ...PRIMARY_CHART_TYPE_OPTIONS,
  ...LEGACY_CHART_TYPE_OPTIONS,
];

export interface DashboardChartConfig {
  id: string;
  title?: string;
  subtitle?: string;
  type: DashboardChartType;
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
  showAverageLine?: boolean;
  span?: 1 | 2;
  customSql?: string;
  samplePreset?: SampleDatasetPresetId;
  /** Dataset the chart was authored against. */
  datasetId?: string;
  /** Informative schema fingerprint captured at save time. */
  schemaFingerprint?: string;
  configVersion?: 2;
}

export interface DashboardView {
  id: string;
  name: string;
  createdAt: number;
  charts: DashboardChartConfig[];
}
