import type {
  ChartValueFormat,
  DashboardChartAggregation,
  DashboardChartConfig,
  DashboardChartType,
  DateGranularity,
} from '@/types/dashboardViews';
import type { PipefySqlDataset, SqlColumnDef } from '@/types/pipefySql';
import type { ColumnRoleOverride, ColumnRoleOverrides } from '@/lib/columnRoleOverrides';
import { matchColumnRoleRule } from '@/utils/columnRoleRules';
import { resolveChartConfig } from '@/utils/chartConfigResolver';

export type ColumnSemanticRole =
  | 'phase'
  | 'status'
  | 'assignee'
  | 'label'
  | 'boolean_sla'
  | 'boolean_done'
  | 'boolean'
  | 'date_created'
  | 'date_finished'
  | 'date_due'
  | 'date'
  | 'currency'
  | 'percent'
  | 'duration'
  | 'identifier'
  | 'number'
  | 'category';

export type ColumnGroupCategory = 'dimension' | 'date' | 'metric' | 'identifier';

export type ColumnRoleSource = 'pipefyType' | 'header' | 'data' | 'user';
export type ColumnRoleConfidence = 'high' | 'medium' | 'low';

export interface ColumnProfile {
  name: string;
  label: string;
  sqlType: SqlColumnDef['sqlType'];
  pipefyType?: string;
  role: ColumnSemanticRole;
  roleSource: ColumnRoleSource;
  confidence: ColumnRoleConfidence;
  friendlyType: string;
  groupCategory: ColumnGroupCategory;
  isIdentifier: boolean;
  isMultiValueLikely: boolean;
  recommendedFormat: ChartValueFormat;
  defaultAggregation: DashboardChartAggregation;
  priorityScore: number;
}

export interface ChartTemplate {
  id: string;
  label: string;
  description: string;
  config: Omit<DashboardChartConfig, 'id'>;
}

export interface ChartCoachingWarning {
  id: string;
  severity: 'warning' | 'info';
  message: string;
  actionLabel?: string;
  fixPatch?: Partial<Omit<DashboardChartConfig, 'id'>>;
}

export interface ChartInsightPoint {
  name: string;
  value: number;
  cardCount?: number;
  sharePct?: number | null;
  deltaPct?: number | null;
  isOthers?: boolean;
}

export interface ChartInsightSummary {
  grandTotal: number;
  totalCards: number;
  allDatasetCards: number;
  totalGroups: number;
  avgPerGroup: number;
  excludedEmptyCount: number;
  pctOfPipe: number;
}

const PT_MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export const PIPEFY_CHART_PALETTE = [
  '#0B66FF',
  '#00BFA5',
  '#AB19F3',
  '#FFBC33',
  '#F51F7E',
  '#FF5019',
  '#3C85FF',
  '#545D63',
] as const;

export const NEUTRAL_OTHERS_COLOR = '#92A5B3';

export function normalizeSemanticText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const IDENTIFIER_EXACT = new Set([
  'id',
  'card_id',
  'code',
  'codigo',
  'title',
  'titulo',
  'nome_do_card',
  'card_title',
  'email',
  'e_mail',
  'cpf',
  'cnpj',
  'cpf_cnpj',
  'telefone',
  'phone',
  'celular',
  'whatsapp',
  'cep',
  'zip',
  'zipcode',
  'rg',
  'protocolo',
  'matricula',
  'numero_do_card',
  'url',
  'link',
]);

const PHASE_EXACT = new Set([
  'current_phase',
  'fase_atual',
  'fase',
  'phase',
  'etapa',
  'stage',
  'status_fase',
]);

const STATUS_TOKENS =
  /(status|situacao|motivo|resultado|prioridade|priority|canal|channel|origem|source|categoria|category|tipo|type|departamento|area|segmento|plano|regiao|uf|estado)/;

const ASSIGNEE_EXACT = new Set([
  'assignees',
  'responsaveis',
  'responsavel',
  'assignee',
  'owner',
  'dono',
  'vendedor',
  'analista',
  'created_by',
  'criado_por',
  'solicitante',
]);

const LABEL_EXACT = new Set(['labels', 'etiquetas', 'tags', 'tag']);

const SLA_BOOL_EXACT = new Set(['overdue', 'atrasado', 'vencido', 'sla_estourado']);
const DONE_BOOL_EXACT = new Set(['done', 'concluido', 'finalizado', 'fechado']);

const CURRENCY_TOKENS =
  /(valor|receita|faturamento|preco|custo|orcamento|budget|amount|revenue|price|mrr|arr|ticket|salario|pagamento|comissao|despesa|total_r|brl|usd|\$)/;

const PERCENT_TOKENS =
  /(%|percent|porcent|taxa|margem|desconto|rate|ratio|conversao|sla_pct|atingimento)/;

const DURATION_TOKENS =
  /(tempo|dias|horas|sla|lead_time|cycle_time|duracao|duration|prazo_dias|idade|aging)/;

function classifyColumnRole(col: SqlColumnDef): ColumnSemanticRole {
  const norm = normalizeSemanticText(col.name || col.label);
  const normLabel = normalizeSemanticText(col.label);
  const pType = (col.pipefyType ?? '').toLowerCase();

  if (col.sqlType === 'BOOLEAN' || pType === 'checkbox' || pType === 'boolean') {
    if (SLA_BOOL_EXACT.has(norm) || SLA_BOOL_EXACT.has(normLabel)) {
      return 'boolean_sla';
    }
    if (DONE_BOOL_EXACT.has(norm) || DONE_BOOL_EXACT.has(normLabel)) {
      return 'boolean_done';
    }
    return 'boolean';
  }

  if (col.sqlType === 'DATE' || pType === 'date' || pType === 'datetime' || pType === 'due_date') {
    if (norm.includes('created') || norm.includes('criado')) return 'date_created';
    if (norm.includes('finished') || norm.includes('finalizado') || norm.includes('concluido')) {
      return 'date_finished';
    }
    if (norm.includes('due') || norm.includes('vencimento') || norm.includes('prazo') || pType === 'due_date') {
      return 'date_due';
    }
    return 'date';
  }

  if (col.sqlType === 'DOUBLE') {
    if (pType === 'currency' || CURRENCY_TOKENS.test(norm) || CURRENCY_TOKENS.test(normLabel)) {
      return 'currency';
    }
    if (PERCENT_TOKENS.test(norm) || PERCENT_TOKENS.test(normLabel)) {
      return 'percent';
    }
    if (DURATION_TOKENS.test(norm) || DURATION_TOKENS.test(normLabel)) {
      return 'duration';
    }
    return 'number';
  }

  if (
    IDENTIFIER_EXACT.has(norm) ||
    IDENTIFIER_EXACT.has(normLabel) ||
    pType === 'email' ||
    pType === 'phone' ||
    pType === 'cpf' ||
    pType === 'cnpj' ||
    norm.endsWith('_id') ||
    norm.endsWith('_url')
  ) {
    return 'identifier';
  }

  if (PHASE_EXACT.has(norm) || PHASE_EXACT.has(normLabel)) return 'phase';
  if (LABEL_EXACT.has(norm) || LABEL_EXACT.has(normLabel) || pType === 'label_select') {
    return 'label';
  }
  if (
    ASSIGNEE_EXACT.has(norm) ||
    ASSIGNEE_EXACT.has(normLabel) ||
    pType === 'assignee_select'
  ) {
    return 'assignee';
  }
  if (STATUS_TOKENS.test(norm) || STATUS_TOKENS.test(normLabel) || pType === 'select' || pType === 'radio_vertical' || pType === 'radio_horizontal') {
    return 'status';
  }

  return 'category';
}

interface ResolvedRole {
  role: ColumnSemanticRole;
  roleSource: ColumnRoleSource;
  confidence: ColumnRoleConfidence;
}

/**
 * Applies data-driven rules on top of the header/type heuristics. The header
 * heuristic always wins when it found a specific role; data rules only refine
 * generic categories/numbers.
 */
function resolveColumnRole(col: SqlColumnDef): ResolvedRole {
  const baseRole = classifyColumnRole(col);
  const pType = (col.pipefyType ?? '').toLowerCase();

  if (baseRole === 'category' || baseRole === 'number') {
    const rule = matchColumnRoleRule({
      name: col.name,
      label: col.label,
      sqlType: col.sqlType,
      pipefyType: col.pipefyType,
      stats: col.stats,
    });
    if (rule && rule.role !== baseRole) {
      return { role: rule.role, roleSource: 'data', confidence: 'medium' };
    }
  }

  const roleSource: ColumnRoleSource = pType ? 'pipefyType' : 'header';
  const confidence: ColumnRoleConfidence = pType
    ? 'high'
    : baseRole === 'category' || baseRole === 'number'
      ? 'low'
      : 'medium';

  return { role: baseRole, roleSource, confidence };
}

function getFriendlyType(role: ColumnSemanticRole): string {
  switch (role) {
    case 'phase':
      return 'Fase';
    case 'status':
      return 'Status / Categoria';
    case 'assignee':
      return 'Responsável';
    case 'label':
      return 'Etiquetas';
    case 'boolean_sla':
      return 'Prazo (SLA)';
    case 'boolean_done':
      return 'Conclusão';
    case 'boolean':
      return 'Sim/Não';
    case 'date_created':
    case 'date_finished':
    case 'date_due':
    case 'date':
      return 'Data';
    case 'currency':
      return 'Moeda';
    case 'percent':
      return 'Percentual';
    case 'duration':
      return 'Duração';
    case 'number':
      return 'Número';
    case 'identifier':
      return 'Identificador';
    case 'category':
    default:
      return 'Categoria';
  }
}

function getGroupCategory(role: ColumnSemanticRole): ColumnGroupCategory {
  switch (role) {
    case 'date_created':
    case 'date_finished':
    case 'date_due':
    case 'date':
      return 'date';
    case 'currency':
    case 'percent':
    case 'duration':
    case 'number':
      return 'metric';
    case 'identifier':
      return 'identifier';
    default:
      return 'dimension';
  }
}

function getPriorityScore(role: ColumnSemanticRole): number {
  switch (role) {
    case 'phase':
      return 100;
    case 'status':
      return 90;
    case 'boolean_sla':
      return 85;
    case 'assignee':
      return 80;
    case 'label':
      return 75;
    case 'boolean_done':
      return 72;
    case 'date_created':
      return 70;
    case 'date_due':
      return 65;
    case 'date_finished':
      return 62;
    case 'category':
      return 60;
    case 'date':
      return 55;
    case 'boolean':
      return 50;
    case 'currency':
      return 95;
    case 'duration':
      return 80;
    case 'percent':
      return 75;
    case 'number':
      return 60;
    case 'identifier':
    default:
      return 10;
  }
}

export function profileColumn(
  col: SqlColumnDef,
  override?: ColumnRoleOverride
): ColumnProfile {
  const resolved = override?.role
    ? {
        role: override.role,
        roleSource: 'user' as ColumnRoleSource,
        confidence: 'high' as ColumnRoleConfidence,
      }
    : resolveColumnRole(col);
  const { role } = resolved;
  const norm = normalizeSemanticText(col.name || col.label);
  const isMultiValueLikely =
    role === 'label' ||
    (role === 'assignee' &&
      (norm.includes('assignees') ||
        norm.includes('responsaveis') ||
        col.pipefyType?.toLowerCase() === 'assignee_select'));

  const derivedFormat: ChartValueFormat =
    role === 'currency'
      ? 'currency_brl'
      : role === 'percent'
        ? 'percent'
        : role === 'duration'
          ? 'duration_days'
          : 'auto';
  const recommendedFormat =
    override?.valueFormat && override.valueFormat !== 'auto'
      ? override.valueFormat
      : derivedFormat;

  const defaultAggregation: DashboardChartAggregation =
    role === 'percent' || role === 'duration'
      ? 'avg'
      : role === 'currency' || role === 'number'
        ? 'sum'
        : 'count';

  return {
    name: col.name,
    label: col.label,
    sqlType: col.sqlType,
    pipefyType: col.pipefyType,
    role,
    roleSource: resolved.roleSource,
    confidence: resolved.confidence,
    friendlyType: getFriendlyType(role),
    groupCategory: getGroupCategory(role),
    isIdentifier: role === 'identifier',
    isMultiValueLikely,
    recommendedFormat,
    defaultAggregation,
    priorityScore: getPriorityScore(role),
  };
}

export function profileDatasetColumns(
  columns: SqlColumnDef[],
  overrides?: ColumnRoleOverrides
): ColumnProfile[] {
  return columns.map((col) => profileColumn(col, overrides?.[col.name]));
}

export function isAdditiveAggregation(agg: DashboardChartAggregation): boolean {
  return (
    agg === 'count' ||
    agg === 'count_non_empty' ||
    agg === 'count_empty' ||
    agg === 'count_true' ||
    agg === 'sum'
  );
}

export function resolveValueFormat(
  requestedFormat: ChartValueFormat | undefined,
  metricProfile: ColumnProfile | null | undefined,
  aggregation: DashboardChartAggregation
): Exclude<ChartValueFormat, 'auto'> {
  if (
    aggregation === 'count' ||
    aggregation === 'count_non_empty' ||
    aggregation === 'count_distinct' ||
    aggregation === 'count_empty' ||
    aggregation === 'count_true'
  ) {
    return 'number';
  }
  if (aggregation === 'fill_rate' || aggregation === 'true_rate') {
    return 'percent';
  }
  if (requestedFormat && requestedFormat !== 'auto') {
    return requestedFormat;
  }
  if (metricProfile && metricProfile.recommendedFormat !== 'auto') {
    return metricProfile.recommendedFormat;
  }
  return 'number';
}

export function formatMetricValue(
  value: number,
  format: ChartValueFormat = 'number',
  options?: { compact?: boolean }
): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);

  if (format === 'currency_brl') {
    if (options?.compact) {
      if (abs >= 1_000_000_000) {
        return `R$ ${(safe / 1_000_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;
      }
      if (abs >= 1_000_000) {
        return `R$ ${(safe / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
      }
      if (abs >= 1_000) {
        return `R$ ${(safe / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
      }
    }
    const hasCents = Math.abs(safe % 1) > 0.005 && abs < 10_000;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }).format(safe);
  }

  if (format === 'percent') {
    return `${safe.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  }

  if (format === 'duration_days') {
    const unit = Math.abs(safe - 1) < 0.05 ? 'dia' : 'dias';
    return `${safe.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unit}`;
  }

  if (options?.compact) {
    if (abs >= 1_000_000_000) {
      return `${(safe / 1_000_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;
    }
    if (abs >= 1_000_000) {
      return `${(safe / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    }
    if (abs >= 10_000) {
      return `${(safe / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    }
  }

  return safe.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function formatAxisTick(value: number, format: ChartValueFormat): string {
  return formatMetricValue(value, format, { compact: true });
}

export function formatSharePercent(part: number, whole: number): string {
  if (!Number.isFinite(whole) || whole <= 0 || !Number.isFinite(part)) {
    return '0,0%';
  }
  const pct = (part / whole) * 100;
  return `${pct.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function formatDateBucket(
  rawBucket: string,
  granularity: DateGranularity = 'month'
): string {
  if (!rawBucket || rawBucket === 'Sem data' || rawBucket === 'Não informado') {
    return rawBucket || 'Sem data';
  }

  if (granularity === 'year' && /^\d{4}$/.test(rawBucket)) {
    return rawBucket;
  }

  if (granularity === 'quarter') {
    const qMatch = rawBucket.match(/^(\d{4})-[Qq]?([1-4])$/);
    if (qMatch) {
      return `${qMatch[2]}T/${qMatch[1].slice(-2)}`;
    }
  }

  if (granularity === 'month') {
    const mMatch = rawBucket.match(/^(\d{4})-(\d{2})$/);
    if (mMatch) {
      return `${PT_MONTHS[Number(mMatch[2]) - 1] ?? mMatch[2]}/${mMatch[1].slice(-2)}`;
    }
  }

  if (granularity === 'week') {
    const wMatch = rawBucket.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (wMatch) {
      return `Sem ${wMatch[3]}/${wMatch[2]}`;
    }
  }

  const dMatch = rawBucket.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dMatch) {
    return `${dMatch[3]}/${dMatch[2]}/${dMatch[1].slice(-2)}`;
  }

  return rawBucket;
}

export function getSemanticColor(
  label: string,
  index: number,
  isOthers?: boolean
): string {
  if (isOthers) return NEUTRAL_OTHERS_COLOR;

  const norm = normalizeSemanticText(label);
  if (
    norm === 'outros' ||
    norm === 'nao_informado' ||
    norm === 'sem_data' ||
    norm === 'sem_dado'
  ) {
    return NEUTRAL_OTHERS_COLOR;
  }

  if (
    /^(no_prazo|concluido|concluida|ganho|ganha|aprovado|aprovada|sim|feito|resolvido|ativo)$/.test(
      norm
    )
  ) {
    return '#00BFA5';
  }

  if (
    /^(atrasado|atrasada|perdido|perdida|cancelado|cancelada|vencido|vencida|reprovado|reprovada|estourado|critico)$/.test(
      norm
    )
  ) {
    return '#FF5019';
  }

  if (
    /^(pendente|aguardando|em_andamento|em_aberto|em_analise|em_aprovacao|atencao|alerta)$/.test(
      norm
    )
  ) {
    return '#FFBC33';
  }

  return PIPEFY_CHART_PALETTE[index % PIPEFY_CHART_PALETTE.length];
}

export function getBooleanLabels(role: ColumnSemanticRole): {
  trueLabel: string;
  falseLabel: string;
} {
  if (role === 'boolean_sla') {
    return { trueLabel: 'Atrasado', falseLabel: 'No prazo' };
  }
  if (role === 'boolean_done') {
    return { trueLabel: 'Concluído', falseLabel: 'Em aberto' };
  }
  return { trueLabel: 'Sim', falseLabel: 'Não' };
}

export function getChartTypeLabel(type: DashboardChartType): string {
  switch (type) {
    case 'horizontalBar':
      return 'Ranking';
    case 'bar':
      return 'Colunas';
    case 'line':
      return 'Tendência';
    case 'area':
      return 'Evolução';
    case 'pie':
      return 'Participação';
    case 'kpi':
      return 'Indicador';
    case 'radar':
      return 'Radar';
    case 'radialBar':
      return 'Radial';
    default:
      return 'Gráfico';
  }
}

export function generateRecommendedTemplates(
  dataset?: PipefySqlDataset | null
): ChartTemplate[] {
  if (!dataset || dataset.columns.length === 0) {
    return [
      {
        id: 'sample-phase',
        label: 'Cards por Fase',
        description: 'Onde os cards estão acumulados no fluxo',
        config: {
          type: 'horizontalBar',
          title: 'Distribuição de Cards por Fase',
          dataMode: 'builder',
          samplePreset: 'cards_by_phase',
          excludeEmpty: true,
          groupOthers: true,
          limit: 6,
        },
      },
      {
        id: 'sample-sla',
        label: 'Saúde de Prazos (SLA)',
        description: 'Proporção de cards no prazo vs atrasados',
        config: {
          type: 'pie',
          title: 'Saúde de Prazos (SLA)',
          dataMode: 'builder',
          samplePreset: 'sla_status',
          excludeEmpty: true,
          groupOthers: true,
          limit: 6,
        },
      },
      {
        id: 'sample-monthly',
        label: 'Evolução Mensal',
        description: 'Ritmo de entrada de cards ao longo dos meses',
        config: {
          type: 'area',
          title: 'Evolução Mensal de Cards',
          dataMode: 'builder',
          samplePreset: 'monthly_cards',
          showAverageLine: true,
          limit: 12,
        },
      },
      {
        id: 'sample-revenue',
        label: 'Valor por Empresa',
        description: 'Concentração de receita por cliente',
        config: {
          type: 'horizontalBar',
          title: 'Valor Total por Empresa',
          dataMode: 'builder',
          samplePreset: 'revenue_by_company',
          valueFormat: 'currency_brl',
          limit: 8,
        },
      },
      {
        id: 'sample-ticket',
        label: 'Ticket Médio',
        description: 'Média de valor em cada fase do processo',
        config: {
          type: 'bar',
          title: 'Ticket Médio por Fase',
          dataMode: 'builder',
          samplePreset: 'avg_ticket_by_phase',
          valueFormat: 'currency_brl',
          showAverageLine: true,
          limit: 8,
        },
      },
    ];
  }

  const profiles = profileDatasetColumns(dataset.columns);
  const byBest = [...profiles].sort((a, b) => b.priorityScore - a.priorityScore);
  const dimensionCandidates = byBest.filter(
    (p) => p.groupCategory === 'dimension' && !p.isIdentifier
  );
  const dimensionCol =
    dimensionCandidates.find((p) => p.role === 'phase') ??
    dimensionCandidates.find((p) => p.role === 'status') ??
    dimensionCandidates.find((p) => p.role === 'assignee') ??
    dimensionCandidates.find((p) => p.role === 'label') ??
    dimensionCandidates[0] ??
    null;
  const dateCol =
    byBest.find((p) => p.role === 'date_created') ??
    byBest.find((p) => p.groupCategory === 'date') ??
    null;
  const booleanCol =
    byBest.find((p) => p.role === 'boolean_sla') ??
    byBest.find((p) => p.role === 'boolean_done') ??
    byBest.find((p) => p.role === 'boolean') ??
    null;
  const currencyCol = byBest.find((p) => p.role === 'currency') ?? null;
  const numericCol =
    currencyCol ??
    byBest.find((p) => p.role === 'duration') ??
    byBest.find((p) => p.role === 'number') ??
    byBest.find((p) => p.groupCategory === 'metric') ??
    null;

  const noun = 'registros';
  const templates: ChartTemplate[] = [];

  if (dimensionCol) {
    templates.push({
      id: `tpl-dim-${dimensionCol.name}`,
      label: `Registros por ${dimensionCol.label}`,
      description: 'Ranking por dimensão principal',
      config: {
        type: 'horizontalBar',
        title: `Registros por ${dimensionCol.label}`,
        dataMode: 'builder',
        groupBy: dimensionCol.name,
        metric: '__count__',
        aggregation: 'count',
        sortBy: 'value_desc',
        limit: 10,
        excludeEmpty: true,
        groupOthers: true,
        splitMultiValue: dimensionCol.isMultiValueLikely,
      },
    });
  }

  if (dateCol) {
    templates.push({
      id: `tpl-trend-${dateCol.name}`,
      label: `Evolução por ${dateCol.label}`,
      description: 'Tendência temporal com média histórica',
      config: {
        type: 'area',
        title: `Evolução por ${dateCol.label}`,
        dataMode: 'builder',
        groupBy: dateCol.name,
        metric: '__count__',
        aggregation: 'count',
        dateGranularity: 'month',
        limit: 12,
        excludeEmpty: true,
        showAverageLine: true,
      },
    });
  }

  if (booleanCol) {
    templates.push({
      id: `tpl-bool-${booleanCol.name}`,
      label: `Participação · ${booleanCol.label}`,
      description: 'Proporção Sim/Não no conjunto',
      config: {
        type: 'pie',
        title: `Distribuição por ${booleanCol.label}`,
        dataMode: 'builder',
        groupBy: booleanCol.name,
        metric: '__count__',
        aggregation: 'count',
        sortBy: 'value_desc',
        limit: 6,
        excludeEmpty: true,
        groupOthers: true,
      },
    });
  } else if (dimensionCol) {
    templates.push({
      id: `tpl-share-${dimensionCol.name}`,
      label: `Participação por ${dimensionCol.label}`,
      description: 'Divisão proporcional entre grupos',
      config: {
        type: 'pie',
        title: `Participação por ${dimensionCol.label}`,
        dataMode: 'builder',
        groupBy: dimensionCol.name,
        metric: '__count__',
        aggregation: 'count',
        sortBy: 'value_desc',
        limit: 6,
        excludeEmpty: true,
        groupOthers: true,
      },
    });
  }

  if (numericCol && dimensionCol) {
    const agg = numericCol.defaultAggregation;
    const format = numericCol.recommendedFormat;
    templates.push({
      id: `tpl-metric-${numericCol.name}`,
      label: `${agg === 'avg' ? 'Média' : 'Total'} de ${numericCol.label}`,
      description: `Análise de ${numericCol.label} por ${dimensionCol.label}`,
      config: {
        type: 'bar',
        title: `${agg === 'avg' ? 'Média' : 'Total'} de ${numericCol.label} por ${dimensionCol.label}`,
        dataMode: 'builder',
        groupBy: dimensionCol.name,
        metric: numericCol.name,
        aggregation: agg,
        valueFormat: format,
        sortBy: 'value_desc',
        limit: 8,
        excludeEmpty: true,
        groupOthers: agg === 'sum',
        showAverageLine: agg === 'avg',
      },
    });
  }

  templates.push({
    id: 'tpl-kpi-summary',
    label: currencyCol ? `KPI · ${currencyCol.label}` : `KPI · Total de ${noun}`,
    description: 'Indicador executivo para visão rápida',
    config: {
      type: 'kpi',
      title: currencyCol ? `Total de ${currencyCol.label}` : `Total de ${noun}`,
      dataMode: 'builder',
      metric: currencyCol ? currencyCol.name : '__count__',
      aggregation: currencyCol ? 'sum' : 'count',
      valueFormat: currencyCol ? 'currency_brl' : 'number',
      excludeEmpty: true,
    },
  });

  return templates
    .filter((tpl) => resolveChartConfig(dataset, { id: tpl.id, ...tpl.config }).canRender)
    .slice(0, 6);
}

/**
 * Builds a complete, validated starter dashboard for the active dataset.
 */
export function buildAutoDashboard(
  dataset: PipefySqlDataset | null | undefined,
  maxCharts = 4
): Array<Omit<DashboardChartConfig, 'id'>> {
  if (!dataset) return [];
  return generateRecommendedTemplates(dataset)
    .map((tpl) => ({
      ...tpl.config,
      datasetId: dataset.datasetId,
      schemaFingerprint: dataset.schemaFingerprint,
      configVersion: 2 as const,
    }))
    .slice(0, Math.max(1, maxCharts));
}

export function analyzeChartSanity(params: {
  chartType: DashboardChartType;
  aggregation: DashboardChartAggregation;
  groupProfile?: ColumnProfile | null;
  metricProfile?: ColumnProfile | null;
  breakdownBy?: string | null;
  limit: number;
  groupOthers: boolean;
  splitMultiValue: boolean;
  isCustomSql?: boolean;
}): ChartCoachingWarning[] {
  if (params.isCustomSql) return [];

  const warnings: ChartCoachingWarning[] = [];
  const {
    chartType,
    aggregation,
    groupProfile,
    metricProfile,
    breakdownBy,
    limit,
    groupOthers,
    splitMultiValue,
  } = params;

  const isAdditive = isAdditiveAggregation(aggregation);

  if (chartType === 'pie' && !isAdditive) {
    warnings.push({
      id: 'pie-non-additive',
      severity: 'warning',
      message:
        'Gráfico de rosca representa partes de um todo e não deve ser usado com taxas, médias, medianas ou valores únicos.',
      actionLabel: 'Trocar para Barras Horizontais',
      fixPatch: { type: 'horizontalBar' },
    });
  }

  if (chartType === 'pie' && (limit > 7 || !groupOthers)) {
    warnings.push({
      id: 'pie-too-many-slices',
      severity: 'info',
      message:
        'Gráficos de rosca ficam difíceis de ler com muitas fatias. Limite a 6 grupos e consolide o restante em "Outros".',
      actionLabel: 'Limitar a 6 + Outros',
      fixPatch: { limit: 6, groupOthers: true },
    });
  }

  if (breakdownBy && (chartType === 'pie' || chartType === 'kpi')) {
    warnings.push({
      id: 'breakdown-unsupported-type',
      severity: 'info',
      message:
        'A segmentação em séries está disponível nos formatos Barras Horizontais, Colunas, Linhas e Área.',
      actionLabel: 'Trocar para Barras Horizontais',
      fixPatch: { type: 'horizontalBar' },
    });
  }

  if (
    (chartType === 'line' || chartType === 'area') &&
    groupProfile &&
    groupProfile.groupCategory !== 'date'
  ) {
    warnings.push({
      id: 'trend-on-category',
      severity: 'warning',
      message: `Linhas e áreas sugerem continuidade temporal, mas "${groupProfile.label}" é uma categoria discreta.`,
      actionLabel: 'Trocar para Barras Horizontais',
      fixPatch: { type: 'horizontalBar' },
    });
  }

  if (
    aggregation === 'sum' &&
    metricProfile &&
    (metricProfile.role === 'percent' || metricProfile.role === 'duration')
  ) {
    warnings.push({
      id: 'sum-non-summable',
      severity: 'warning',
      message: `Somar "${metricProfile.label}" pode distorcer a leitura gerencial. Para taxas ou durações, prefira a Média.`,
      actionLabel: 'Usar Média',
      fixPatch: { aggregation: 'avg' },
    });
  }

  if (groupProfile?.isIdentifier && chartType !== 'kpi') {
    warnings.push({
      id: 'group-by-identifier',
      severity: 'warning',
      message: `"${groupProfile.label}" parece ser um identificador único. Agrupar por ele gera muitos grupos com 1 card.`,
    });
  }

  if (
    groupProfile?.isMultiValueLikely &&
    !splitMultiValue &&
    chartType !== 'kpi'
  ) {
    warnings.push({
      id: 'split-multivalue',
      severity: 'info',
      message: `"${groupProfile.label}" costuma ter múltiplos valores separados por vírgula. Ative a separação individual para evitar combinações duplicadas.`,
      actionLabel: 'Separar itens individuais',
      fixPatch: { splitMultiValue: true },
    });
  }

  return warnings;
}

export function generateChartTakeaway(params: {
  chartType: DashboardChartType;
  aggregation: DashboardChartAggregation;
  valueFormat: ChartValueFormat;
  isDateAxis: boolean;
  splitMultiValue: boolean;
  points: ChartInsightPoint[];
  summary: ChartInsightSummary;
}): string | null {
  const {
    chartType,
    aggregation,
    valueFormat,
    isDateAxis,
    splitMultiValue,
    points,
    summary,
  } = params;

  if (points.length === 0) return null;

  const isAdditive = isAdditiveAggregation(aggregation);

  if (chartType === 'kpi') {
    const formatted = formatMetricValue(summary.grandTotal, valueFormat);
    const baseText = `${summary.totalCards.toLocaleString('pt-BR')} cards analisados`;
    if (summary.allDatasetCards > 0 && summary.pctOfPipe < 99.9) {
      return `${formatted} · ${baseText} (${summary.pctOfPipe.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do pipe).`;
    }
    return `${formatted} considerando ${baseText}.`;
  }

  if (isDateAxis) {
    if (points.length === 1) {
      return `Período único (${points[0].name}): ${formatMetricValue(points[0].value, valueFormat)}.`;
    }
    const latest = points[points.length - 1];
    const prev = points[points.length - 2];
    const peak = points.reduce((best, cur) => (cur.value > best.value ? cur : best), points[0]);
    const delta =
      prev && prev.value !== 0
        ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100
        : null;
    const deltaText =
      delta !== null
        ? ` (${delta >= 0 ? '+' : ''}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs ${prev.name})`
        : '';
    return `Pico em ${peak.name} (${formatMetricValue(peak.value, valueFormat)}) · Último período ${latest.name}: ${formatMetricValue(latest.value, valueFormat)}${deltaText}.`;
  }

  const primaryPoints = points.filter((p) => !p.isOthers);
  if (primaryPoints.length === 0) return null;

  const sorted = [...primaryPoints].sort((a, b) => b.value - a.value);
  const leader = sorted[0];

  if (isAdditive) {
    const denominator = splitMultiValue ? summary.totalCards : summary.grandTotal;
    const shareText =
      denominator > 0
        ? ` (${formatSharePercent(leader.value, denominator)} ${splitMultiValue ? 'dos cards' : 'do total'})`
        : '';

    if (sorted.length >= 2) {
      const runnerUp = sorted[1];
      return `Líder: ${leader.name} com ${formatMetricValue(leader.value, valueFormat)}${shareText}, seguido por ${runnerUp.name} (${formatMetricValue(runnerUp.value, valueFormat)}).`;
    }
    return `Líder: ${leader.name} com ${formatMetricValue(leader.value, valueFormat)}${shareText}.`;
  }

  const lowest = sorted[sorted.length - 1];
  const avgText =
    summary.avgPerGroup > 0
      ? ` · Média geral: ${formatMetricValue(summary.avgPerGroup, valueFormat)}`
      : '';
  if (sorted.length >= 2 && leader.name !== lowest.name) {
    return `Maior em ${leader.name} (${formatMetricValue(leader.value, valueFormat)}) e menor em ${lowest.name} (${formatMetricValue(lowest.value, valueFormat)})${avgText}.`;
  }
  return `${leader.name}: ${formatMetricValue(leader.value, valueFormat)}${avgText}.`;
}
