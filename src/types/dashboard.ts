export type ChartType =
  | 'bar'
  | 'horizontal_bar'
  | 'line'
  | 'area'
  | 'donut'
  | 'kpi'
  | 'pivot_table';

export type AggregationOp =
  | 'count'
  | 'sum'
  | 'avg'
  | 'median'
  | 'min'
  | 'max'
  | 'distinct';

export type DateGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type SortMode = 'value_desc' | 'value_asc' | 'label_asc' | 'label_desc';

export type WidgetWidth = 4 | 6 | 8 | 12;

export interface WidgetConfig {
  id: string;
  title: string;
  subtitle?: string;
  chartType: ChartType;
  dimensionKey: string; // e.g. 'estado', '__phase', 'data_limite', '__createdAt'
  dateGranularity?: DateGranularity;
  numericBins?: number; // used when dimensionKey is a numeric field
  metricOp: AggregationOp;
  metricFieldKey?: string; // e.g. 'valor_total'
  sortMode: SortMode;
  topN: number; // 0 = all
  groupOthers: boolean;
  width: WidgetWidth;
  colorScheme: 'cobalt' | 'teal' | 'amber' | 'slate' | 'emerald' | 'coral';
  formatAsCurrency?: boolean;
}

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'before'
  | 'after'
  | 'is_empty'
  | 'not_empty';

export interface FilterRule {
  id: string;
  fieldKey: string;
  operator: FilterOperator;
  value: string;
  valueEnd?: string;
  source?: 'user' | 'cross_filter';
}

export interface DashboardView {
  id: string;
  name: string;
  description?: string;
  kind: 'charts' | 'explorer';
  widgets: WidgetConfig[];
  filters: FilterRule[];
  createdAt: number;
  updatedAt: number;
}

export interface AggregatedPoint {
  key: string;
  label: string;
  value: number;
  count: number;
  sharePercent: number;
}

export interface WidgetComputationResult {
  widgetId: string;
  points: AggregatedPoint[];
  totalMatched: number;
  summaryValue: number;
  secondaryLabel?: string;
  durationMs: number;
}

export interface ExplorerQuery {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}

export interface ExplorerResult {
  total: number;
  page: number;
  pageSize: number;
  rows: import('./pipefy').NormalizedCard[];
  durationMs: number;
}
