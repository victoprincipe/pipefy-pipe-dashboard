import { ensureDatasetIdentity } from '@/lib/datasetIdentity';
import type {
  DashboardChartAggregation,
  DashboardChartConfig,
} from '@/types/dashboardViews';
import type { PipefySqlDataset, SqlColumnDef, SqlColumnType } from '@/types/pipefySql';
import {
  type ColumnProfile,
  type ColumnSemanticRole,
  normalizeSemanticText,
  profileColumn,
  profileDatasetColumns,
} from '@/utils/chartSemantics';

export type ChartConfigField =
  | 'groupBy'
  | 'metric'
  | 'breakdownBy'
  | 'dateRangeColumn'
  | 'filter';

export type ChartConfigIssueCode =
  | 'dataset_mismatch'
  | 'column_missing'
  | 'column_remapped'
  | 'column_type_changed'
  | 'filter_removed'
  | 'field_cleared';

export interface ChartConfigIssue {
  code: ChartConfigIssueCode;
  field: ChartConfigField | string;
  severity: 'info' | 'warning' | 'error';
  missingColumn?: string;
  resolvedColumn?: string;
  message: string;
}

export interface ResolvedChartConfig {
  config: DashboardChartConfig;
  issues: ChartConfigIssue[];
  canRender: boolean;
  isAdapted: boolean;
}

export interface ColumnRefResolution {
  column: SqlColumnDef | null;
  matchedBy: 'exact' | 'normalized' | 'label' | 'role' | null;
}

const NUMERIC_AGGREGATIONS: ReadonlySet<DashboardChartAggregation> = new Set([
  'sum',
  'avg',
  'median',
  'min',
  'max',
]);

const BOOLEAN_AGGREGATIONS: ReadonlySet<DashboardChartAggregation> = new Set([
  'count_true',
  'true_rate',
]);

const ANY_COLUMN_AGGREGATIONS: ReadonlySet<DashboardChartAggregation> = new Set([
  'count_non_empty',
  'count_distinct',
  'count_empty',
  'fill_rate',
]);

export function aggregationNeedsNumericMetric(
  aggregation: DashboardChartAggregation | undefined
): boolean {
  return Boolean(aggregation && NUMERIC_AGGREGATIONS.has(aggregation));
}

export function aggregationNeedsBooleanMetric(
  aggregation: DashboardChartAggregation | undefined
): boolean {
  return Boolean(aggregation && BOOLEAN_AGGREGATIONS.has(aggregation));
}

export function aggregationNeedsAnyColumn(
  aggregation: DashboardChartAggregation | undefined
): boolean {
  return Boolean(aggregation && ANY_COLUMN_AGGREGATIONS.has(aggregation));
}

function normalizeColumn(value: string | undefined): string {
  return normalizeSemanticText(value ?? '');
}

/**
 * Resolves a chart column reference against the dataset schema.
 *
 * Order: exact name -> normalized name -> label/source header -> semantic role.
 * The role fallback only applies when explicitly requested and when exactly one
 * compatible candidate exists. It never falls back to `dataset.columns[0]`.
 */
export function resolveColumnRef(
  dataset: PipefySqlDataset,
  requested: string | undefined,
  options?: {
    allowedSqlTypes?: SqlColumnType[];
    fallbackRoles?: ColumnSemanticRole[];
  }
): ColumnRefResolution {
  if (!requested || !requested.trim() || !dataset?.columns?.length) {
    return { column: null, matchedBy: null };
  }

  const columns = dataset.columns;
  const allowed = options?.allowedSqlTypes;
  const isAllowed = (col: SqlColumnDef) =>
    !allowed || allowed.length === 0 || allowed.includes(col.sqlType);

  const exact = columns.find((col) => col.name === requested);
  if (exact) {
    return { column: exact, matchedBy: 'exact' };
  }

  const normalizedRequest = normalizeColumn(requested);
  if (!normalizedRequest) return { column: null, matchedBy: null };

  const byName = columns.find(
    (col) => normalizeColumn(col.name) === normalizedRequest
  );
  if (byName) {
    return { column: byName, matchedBy: 'normalized' };
  }

  const byLabel = columns.find(
    (col) =>
      normalizeColumn(col.label) === normalizedRequest ||
      normalizeColumn(col.sourceHeader) === normalizedRequest
  );
  if (byLabel) {
    return { column: byLabel, matchedBy: 'label' };
  }

  if (options?.fallbackRoles && options.fallbackRoles.length > 0) {
    const profiles = profileDatasetColumns(columns);
    const candidates = profiles.filter((profile) => {
      if (!options.fallbackRoles!.includes(profile.role)) return false;
      const col = columns.find((c) => c.name === profile.name);
      return Boolean(col && isAllowed(col));
    });
    if (candidates.length === 1) {
      const col = columns.find((c) => c.name === candidates[0].name) ?? null;
      if (col) return { column: col, matchedBy: 'role' };
    }
  }

  return { column: null, matchedBy: null };
}

function pickDefaultDimension(dataset: PipefySqlDataset): ColumnProfile | null {
  const profiles = profileDatasetColumns(dataset.columns)
    .filter(
      (profile) =>
        profile.groupCategory === 'dimension' || profile.groupCategory === 'date'
    )
    .sort((a, b) => b.priorityScore - a.priorityScore);
  return profiles[0] ?? null;
}

function defaultAggregationForColumn(col: SqlColumnDef): DashboardChartAggregation {
  return profileColumn(col).defaultAggregation;
}

function remapIssue(
  field: ChartConfigField,
  requested: string,
  resolved: string,
  matchedBy: ColumnRefResolution['matchedBy']
): ChartConfigIssue {
  return {
    code: 'column_remapped',
    field,
    severity: 'info',
    missingColumn: requested,
    resolvedColumn: resolved,
    message:
      matchedBy === 'role'
        ? `Campo "${requested}" não existe; usando "${resolved}" pelo papel semântico.`
        : `Campo "${requested}" foi encontrado como "${resolved}" (nome/acentuação diferente).`,
  };
}

function resolveFilterColumns(
  dataset: PipefySqlDataset,
  chart: DashboardChartConfig,
  issues: ChartConfigIssue[]
): Pick<DashboardChartConfig, 'filters' | 'filterColumn' | 'filterValue'> {
  const result: Pick<DashboardChartConfig, 'filters' | 'filterColumn' | 'filterValue'> = {};

  if (chart.filters && chart.filters.length > 0) {
    const kept: NonNullable<DashboardChartConfig['filters']> = [];
    for (const filter of chart.filters) {
      const resolution = resolveColumnRef(dataset, filter.column);
      if (!resolution.column) {
        issues.push({
          code: 'filter_removed',
          field: filter.id,
          severity: 'info',
          missingColumn: filter.column,
          message: `O filtro em "${filter.column}" foi removido porque a coluna não existe neste arquivo.`,
        });
        continue;
      }
      if (resolution.matchedBy !== 'exact') {
        issues.push(remapIssue('filter', filter.column, resolution.column.name, resolution.matchedBy));
      }
      kept.push({ ...filter, column: resolution.column.name });
    }
    result.filters = kept;
  }

  if (chart.filterColumn && chart.filterValue) {
    const resolution = resolveColumnRef(dataset, chart.filterColumn);
    if (!resolution.column) {
      issues.push({
        code: 'filter_removed',
        field: 'filter',
        severity: 'info',
        missingColumn: chart.filterColumn,
        message: `O filtro em "${chart.filterColumn}" foi removido porque a coluna não existe neste arquivo.`,
      });
    } else {
      result.filterColumn = resolution.column.name;
      result.filterValue = chart.filterValue;
    }
  }

  return result;
}

/**
 * Resolves a chart configuration against a dataset without persisting anything.
 * Every missing/incompatible field becomes a visible issue instead of a silent
 * fallback to the first column.
 */
export function resolveChartConfig(
  dataset: PipefySqlDataset | null | undefined,
  chart: DashboardChartConfig
): ResolvedChartConfig {
  const issues: ChartConfigIssue[] = [];

  // Demo/sample mode: charts render synthetic data, nothing to resolve.
  if (!dataset || dataset.rowsCount === 0 || dataset.columns.length === 0) {
    return { config: chart, issues, canRender: true, isAdapted: false };
  }

  const identity = ensureDatasetIdentity(dataset);

  if (
    chart.datasetId &&
    identity.datasetId &&
    chart.datasetId !== identity.datasetId
  ) {
    issues.push({
      code: 'dataset_mismatch',
      field: 'dataset',
      severity: 'error',
      message: 'Este gráfico pertence a outro arquivo. Aponte-o para o arquivo atual para continuar.',
    });
    return { config: chart, issues, canRender: false, isAdapted: false };
  }

  if (chart.dataMode === 'sql' && chart.customSql?.trim()) {
    return { config: chart, issues, canRender: true, isAdapted: false };
  }

  const config: DashboardChartConfig = { ...chart };
  let canRender = true;

  // --- groupBy -----------------------------------------------------------
  let groupColumn: SqlColumnDef | null = null;
  if (chart.groupBy) {
    const resolution = resolveColumnRef(dataset, chart.groupBy);
    if (resolution.column) {
      groupColumn = resolution.column;
      config.groupBy = resolution.column.name;
      if (resolution.matchedBy !== 'exact') {
        issues.push(remapIssue('groupBy', chart.groupBy, resolution.column.name, resolution.matchedBy));
      }
    } else {
      issues.push({
        code: 'column_missing',
        field: 'groupBy',
        severity: chart.type === 'kpi' ? 'warning' : 'error',
        missingColumn: chart.groupBy,
        message: `O campo de agrupamento "${chart.groupBy}" não existe neste arquivo.`,
      });
      if (chart.type !== 'kpi') canRender = false;
      config.groupBy = undefined;
    }
  } else if (chart.type !== 'kpi') {
    if (!chart.datasetId) {
      // Legacy chart authored before dataset scoping: adopt the best semantic
      // dimension once and surface it as an adaptation, never `columns[0]`.
      const fallback = pickDefaultDimension(dataset);
      if (fallback) {
        groupColumn = dataset.columns.find((c) => c.name === fallback.name) ?? null;
        config.groupBy = fallback.name;
        issues.push({
          code: 'field_cleared',
          field: 'groupBy',
          severity: 'info',
          resolvedColumn: fallback.name,
          message: `Agrupamento padrão aplicado em "${fallback.label}". Salve o gráfico para fixar esta escolha.`,
        });
      } else {
        issues.push({
          code: 'column_missing',
          field: 'groupBy',
          severity: 'error',
          message: 'Este gráfico precisa de um campo de agrupamento.',
        });
        canRender = false;
      }
    } else {
      issues.push({
        code: 'column_missing',
        field: 'groupBy',
        severity: 'error',
        message: 'Este gráfico precisa de um campo de agrupamento.',
      });
      canRender = false;
    }
  }

  // --- metric + aggregation ---------------------------------------------
  const requestedMetric =
    chart.metric && chart.metric !== '__count__' ? chart.metric : undefined;
  let metricColumn: SqlColumnDef | null = null;

  if (requestedMetric) {
    const resolution = resolveColumnRef(dataset, requestedMetric);
    if (resolution.column) {
      metricColumn = resolution.column;
      config.metric = resolution.column.name;
      if (resolution.matchedBy !== 'exact') {
        issues.push(remapIssue('metric', requestedMetric, resolution.column.name, resolution.matchedBy));
      }
    } else {
      issues.push({
        code: 'column_missing',
        field: 'metric',
        severity: 'error',
        missingColumn: requestedMetric,
        message: `O campo medido "${requestedMetric}" não existe neste arquivo.`,
      });
      config.metric = undefined;
      canRender = false;
    }
  }

  const aggregation: DashboardChartAggregation =
    chart.aggregation ?? (metricColumn ? defaultAggregationForColumn(metricColumn) : 'count');

  if (aggregation === 'count') {
    metricColumn = null;
    config.metric = '__count__';
  } else if (aggregationNeedsNumericMetric(aggregation)) {
    const candidate = metricColumn ?? groupColumn;
    if (!candidate) {
      issues.push({
        code: 'column_missing',
        field: 'metric',
        severity: 'error',
        message: 'Esta agregação precisa de um campo numérico.',
      });
      canRender = false;
    } else if (candidate.sqlType !== 'DOUBLE') {
      issues.push({
        code: 'column_type_changed',
        field: 'metric',
        severity: 'error',
        missingColumn: candidate.name,
        message: `"${candidate.label}" não é mais numérico; esta agregação não pode ser calculada.`,
      });
      canRender = false;
    } else {
      metricColumn = candidate;
      config.metric = candidate.name;
    }
  } else if (aggregationNeedsBooleanMetric(aggregation)) {
    if (!metricColumn) {
      issues.push({
        code: 'column_missing',
        field: 'metric',
        severity: 'error',
        message: 'Esta agregação precisa de uma coluna Sim/Não.',
      });
      canRender = false;
    } else if (metricColumn.sqlType !== 'BOOLEAN') {
      issues.push({
        code: 'column_type_changed',
        field: 'metric',
        severity: 'error',
        missingColumn: metricColumn.name,
        message: `"${metricColumn.label}" não é mais uma coluna Sim/Não.`,
      });
      canRender = false;
    }
  } else if (aggregationNeedsAnyColumn(aggregation)) {
    let candidate = metricColumn;
    if (!candidate && aggregation === 'count_distinct') {
      candidate = groupColumn ?? null;
    }
    if (!candidate) {
      issues.push({
        code: 'column_missing',
        field: 'metric',
        severity: 'error',
        message: 'Esta agregação precisa de um campo.',
      });
      canRender = false;
    } else {
      metricColumn = candidate;
      config.metric = candidate.name;
      if (chart.metric === '__count__' || !chart.metric) {
        issues.push({
          code: 'field_cleared',
          field: 'metric',
          severity: 'info',
          resolvedColumn: candidate.name,
          message: `Campo medido ajustado para "${candidate.label}".`,
        });
      }
    }
  }

  config.aggregation = aggregation;

  // --- breakdownBy -------------------------------------------------------
  if (chart.breakdownBy) {
    const resolution = resolveColumnRef(dataset, chart.breakdownBy);
    if (!resolution.column) {
      issues.push({
        code: 'column_missing',
        field: 'breakdownBy',
        severity: 'warning',
        missingColumn: chart.breakdownBy,
        message: `A segmentação por "${chart.breakdownBy}" foi ignorada porque o campo não existe neste arquivo.`,
      });
      config.breakdownBy = undefined;
    } else {
      config.breakdownBy = resolution.column.name;
      if (resolution.matchedBy !== 'exact') {
        issues.push(remapIssue('breakdownBy', chart.breakdownBy, resolution.column.name, resolution.matchedBy));
      }
    }
  }

  // --- date range --------------------------------------------------------
  if (chart.dateRangeColumn) {
    const resolution = resolveColumnRef(dataset, chart.dateRangeColumn, {
      allowedSqlTypes: ['DATE'],
    });
    if (!resolution.column) {
      issues.push({
        code: 'field_cleared',
        field: 'dateRangeColumn',
        severity: 'warning',
        missingColumn: chart.dateRangeColumn,
        message: `O recorte temporal foi desativado: "${chart.dateRangeColumn}" não é uma data neste arquivo.`,
      });
      config.dateRangeColumn = undefined;
      config.dateRangePreset = undefined;
    } else {
      config.dateRangeColumn = resolution.column.name;
      if (resolution.matchedBy !== 'exact') {
        issues.push(remapIssue('dateRangeColumn', chart.dateRangeColumn, resolution.column.name, resolution.matchedBy));
      }
    }
  }

  // --- filters -----------------------------------------------------------
  Object.assign(config, resolveFilterColumns(dataset, chart, issues));

  const isAdapted = issues.some(
    (issue) =>
      issue.code === 'column_remapped' &&
      issue.severity !== 'error'
  );

  return { config, issues, canRender, isAdapted };
}

/**
 * Builds the patch needed to point a chart at the active dataset, freezing the
 * resolved column names. Used by the dashboard "Adaptar ao arquivo atual" flow.
 */
export function adaptChartToDataset(
  dataset: PipefySqlDataset | null | undefined,
  chart: DashboardChartConfig
): { patch: Partial<Omit<DashboardChartConfig, 'id'>>; issues: ChartConfigIssue[]; canRender: boolean } {
  if (!dataset || dataset.columns.length === 0) {
    return { patch: {}, issues: [], canRender: false };
  }

  const identity = ensureDatasetIdentity(dataset);
  const { config, issues, canRender } = resolveChartConfig(
    { ...identity, datasetId: '__adapt__' },
    { ...chart, datasetId: undefined }
  );

  return {
    patch: {
      groupBy: config.groupBy,
      metric: config.metric,
      aggregation: config.aggregation,
      breakdownBy: config.breakdownBy,
      dateRangeColumn: config.dateRangeColumn,
      dateRangePreset: config.dateRangePreset,
      filters: config.filters,
      filterColumn: config.filterColumn,
      filterValue: config.filterValue,
      datasetId: identity.datasetId,
      schemaFingerprint: identity.schemaFingerprint,
      configVersion: 2,
    },
    issues,
    canRender,
  };
}
