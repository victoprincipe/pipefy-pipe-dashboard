import type { DashboardView, WidgetConfig } from '../types/dashboard';
import type { PipeFieldMeta, PipeSchema } from '../types/pipefy';

function findField(schema: PipeSchema, candidates: string[], fallbackKind?: PipeFieldMeta['kind']): PipeFieldMeta | undefined {
  for (const c of candidates) {
    const exact = schema.fields.find((f) => f.key.toLowerCase() === c.toLowerCase());
    if (exact) return exact;
  }
  for (const c of candidates) {
    const partial = schema.fields.find((f) => f.label.toLowerCase().includes(c.toLowerCase()));
    if (partial) return partial;
  }
  if (fallbackKind) {
    return schema.fields.find((f) => !f.isBuiltIn && f.kind === fallbackKind);
  }
  return undefined;
}

export function buildDefaultViewsForSchema(schema: PipeSchema): DashboardView[] {
  const numField = findField(schema, ['valor_total', 'valor', 'amount', 'price'], 'number');
  const stateField = findField(schema, ['estado', 'uf', 'state', 'regiao'], 'category');
  const cityField = findField(schema, ['cidade', 'city', 'municipio'], 'category');
  const companyField = findField(schema, ['empresa', 'company', 'cliente', 'account'], 'category');
  const dateField = findField(schema, ['data_limite', 'due', 'prazo', 'data'], 'date') ??
    schema.fields.find((f) => f.key === '__createdAt')!;

  const now = Date.now();
  const hasNum = Boolean(numField);
  const numKey = numField?.key;
  const numLabel = numField?.label || 'Valor';

  const executiveWidgets: WidgetConfig[] = [
    {
      id: 'w-kpi-total',
      title: 'Total de Cards',
      subtitle: 'Volume no filtro ativo',
      chartType: 'kpi',
      dimensionKey: '__phase',
      metricOp: 'count',
      sortMode: 'value_desc',
      topN: 0,
      groupOthers: false,
      width: 4,
      colorScheme: 'cobalt',
    },
    hasNum
      ? {
          id: 'w-kpi-sum',
          title: `Soma · ${numLabel}`,
          subtitle: 'Volume financeiro na carteira filtrada',
          chartType: 'kpi',
          dimensionKey: stateField?.key || '__phase',
          metricOp: 'sum',
          metricFieldKey: numKey,
          sortMode: 'value_desc',
          topN: 0,
          groupOthers: false,
          width: 4,
          colorScheme: 'teal',
          formatAsCurrency: true,
        }
      : {
          id: 'w-kpi-phases',
          title: 'Fases Ativas',
          subtitle: 'Fases com cards',
          chartType: 'kpi',
          dimensionKey: '__phase',
          metricOp: 'distinct',
          metricFieldKey: '__phase',
          sortMode: 'value_desc',
          topN: 0,
          groupOthers: false,
          width: 4,
          colorScheme: 'teal',
        },
    hasNum
      ? {
          id: 'w-kpi-avg',
          title: `Ticket Médio (${numLabel})`,
          subtitle: 'Média aritmética por card',
          chartType: 'kpi',
          dimensionKey: stateField?.key || '__phase',
          metricOp: 'avg',
          metricFieldKey: numKey,
          sortMode: 'value_desc',
          topN: 0,
          groupOthers: false,
          width: 4,
          colorScheme: 'amber',
          formatAsCurrency: true,
        }
      : {
          id: 'w-kpi-lead',
          title: 'Lead Time Médio (h)',
          subtitle: 'Da criação à conclusão',
          chartType: 'kpi',
          dimensionKey: '__phase',
          metricOp: 'avg',
          metricFieldKey: '__leadTimeHours',
          sortMode: 'value_desc',
          topN: 0,
          groupOthers: false,
          width: 4,
          colorScheme: 'amber',
        },
    {
      id: 'w-timeline-date',
      title: `${hasNum ? numLabel : 'Cards'} por ${dateField.label}`,
      subtitle: 'Série mensal (clique para filtrar período)',
      chartType: 'area',
      dimensionKey: dateField.key,
      dateGranularity: 'month',
      metricOp: hasNum ? 'sum' : 'count',
      metricFieldKey: numKey,
      sortMode: 'label_asc',
      topN: 0,
      groupOthers: false,
      width: 8,
      colorScheme: 'cobalt',
      formatAsCurrency: hasNum,
    },
    {
      id: 'w-by-state',
      title: `Top ${stateField?.label || 'Fases'} por Volume`,
      subtitle: 'Distribuição percentual',
      chartType: 'donut',
      dimensionKey: stateField?.key || '__phase',
      metricOp: 'count',
      sortMode: 'value_desc',
      topN: 6,
      groupOthers: true,
      width: 4,
      colorScheme: 'teal',
    },
    {
      id: 'w-by-company',
      title: `${hasNum ? numLabel : 'Cards'} por ${companyField?.label || 'Fase'}`,
      subtitle: 'Ranking dos principais segmentos',
      chartType: 'horizontal_bar',
      dimensionKey: companyField?.key || '__phase',
      metricOp: hasNum ? 'sum' : 'count',
      metricFieldKey: numKey,
      sortMode: 'value_desc',
      topN: 10,
      groupOthers: false,
      width: 6,
      colorScheme: 'cobalt',
      formatAsCurrency: hasNum,
    },
    {
      id: 'w-by-city',
      title: `Top 10 ${cityField?.label || 'Fases'}`,
      subtitle: 'Contagem de cards por localidade',
      chartType: 'bar',
      dimensionKey: cityField?.key || '__phase',
      metricOp: 'count',
      sortMode: 'value_desc',
      topN: 10,
      groupOthers: false,
      width: 6,
      colorScheme: 'emerald',
    },
  ];

  const geoWidgets: WidgetConfig[] = [
    {
      id: 'w-geo-state-val',
      title: `${hasNum ? numLabel : 'Cards'} por ${stateField?.label || 'Estado'}`,
      subtitle: 'Comparativo completo por UF',
      chartType: 'bar',
      dimensionKey: stateField?.key || '__phase',
      metricOp: hasNum ? 'sum' : 'count',
      metricFieldKey: numKey,
      sortMode: 'value_desc',
      topN: 15,
      groupOthers: false,
      width: 8,
      colorScheme: 'teal',
      formatAsCurrency: hasNum,
    },
    ...(hasNum
      ? [
          {
            id: 'w-geo-hist',
            title: `Faixas de ${numLabel}`,
            subtitle: 'Histograma de distribuição de valores',
            chartType: 'bar' as const,
            dimensionKey: numKey!,
            numericBins: 6,
            metricOp: 'count' as const,
            sortMode: 'label_asc' as const,
            topN: 0,
            groupOthers: false,
            width: 4 as const,
            colorScheme: 'amber' as const,
          },
        ]
      : []),
    {
      id: 'w-geo-pivot',
      title: `Tabela Dinâmica: ${companyField?.label || 'Fase'}`,
      subtitle: `Resumo consolidado por ${companyField?.label || 'fase'}`,
      chartType: 'pivot_table',
      dimensionKey: companyField?.key || '__phase',
      metricOp: hasNum ? 'sum' : 'count',
      metricFieldKey: numKey,
      sortMode: 'value_desc',
      topN: 20,
      groupOthers: false,
      width: 12,
      colorScheme: 'slate',
      formatAsCurrency: hasNum,
    },
  ];

  return [
    {
      id: 'view-executive',
      name: 'Visão Executiva',
      description: 'KPIs, série temporal, concentração por empresa e distribuição regional.',
      kind: 'charts',
      widgets: executiveWidgets,
      filters: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'view-geo',
      name: 'Geografia & Faixas',
      description: 'Análise detalhada por UF, histograma de valores e tabela dinâmica.',
      kind: 'charts',
      widgets: geoWidgets,
      filters: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'view-explorer',
      name: 'Explorador de Cards',
      description: 'Tabela paginada dos 20.000 cards com busca instantânea, ordenação e abertura no Pipefy.',
      kind: 'explorer',
      widgets: [],
      filters: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}
