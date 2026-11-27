import { describe, expect, it } from 'vitest';
import type { DashboardChartConfig } from '@/types/dashboardViews';
import { resolveChartConfig } from '@/utils/chartConfigResolver';
import { column, dataset } from '@/utils/__tests__/datasetFixture';

function chart(patch: Partial<DashboardChartConfig>): DashboardChartConfig {
  return {
    id: 'chart-1',
    type: 'horizontalBar',
    datasetId: 'file::vendas',
    ...patch,
  };
}

const vendas = dataset('file::vendas', [
  column('id', 'VARCHAR'),
  column('regiao', 'VARCHAR', { label: 'Região' }),
  column('valor', 'DOUBLE'),
  column('status', 'VARCHAR'),
]);

describe('resolveChartConfig', () => {
  it('resolves exact column names and renders', () => {
    const result = resolveChartConfig(
      vendas,
      chart({ groupBy: 'regiao', metric: '__count__', aggregation: 'count' })
    );
    expect(result.canRender).toBe(true);
    expect(result.config.groupBy).toBe('regiao');
    expect(result.issues).toHaveLength(0);
  });

  it('remaps accented/case-different column names', () => {
    const result = resolveChartConfig(
      vendas,
      chart({ groupBy: 'Região', metric: '__count__', aggregation: 'count' })
    );
    expect(result.canRender).toBe(true);
    expect(result.config.groupBy).toBe('regiao');
    expect(result.isAdapted).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'column_remapped')).toBe(true);
  });

  it('remaps by original label/header', () => {
    const custom = dataset('file::custom', [column('col_x', 'VARCHAR', { label: 'Setor' })]);
    const result = resolveChartConfig(
      custom,
      chart({ datasetId: 'file::custom', groupBy: 'Setor' })
    );
    expect(result.canRender).toBe(true);
    expect(result.config.groupBy).toBe('col_x');
  });

  it('never falls back to columns[0] when groupBy is missing from a scoped chart', () => {
    const result = resolveChartConfig(
      vendas,
      chart({ groupBy: 'nao_existe', metric: '__count__', aggregation: 'count' })
    );
    expect(result.canRender).toBe(false);
    expect(result.config.groupBy).toBeUndefined();
    expect(result.issues[0]?.code).toBe('column_missing');
  });

  it('flags type changes that block numeric aggregations', () => {
    const changed = dataset('file::vendas', [
      column('regiao', 'VARCHAR'),
      column('valor', 'VARCHAR'),
    ]);
    const result = resolveChartConfig(
      changed,
      chart({ groupBy: 'regiao', metric: 'valor', aggregation: 'sum' })
    );
    expect(result.canRender).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'column_type_changed')).toBe(true);
  });

  it('drops orphan filters without blocking the chart', () => {
    const result = resolveChartConfig(
      vendas,
      chart({
        groupBy: 'regiao',
        metric: '__count__',
        aggregation: 'count',
        filters: [
          { id: 'f1', column: 'coluna_removida', operator: 'equals', value: 'x' },
        ],
      })
    );
    expect(result.canRender).toBe(true);
    expect(result.config.filters).toEqual([]);
    expect(result.issues.some((issue) => issue.code === 'filter_removed')).toBe(true);
  });

  it('blocks charts authored against another dataset', () => {
    const result = resolveChartConfig(
      vendas,
      chart({ datasetId: 'file::rh', groupBy: 'regiao' })
    );
    expect(result.canRender).toBe(false);
    expect(result.issues[0]?.code).toBe('dataset_mismatch');
  });

  it('allows KPIs without a group column', () => {
    const result = resolveChartConfig(
      vendas,
      chart({ type: 'kpi', metric: '__count__', aggregation: 'count' })
    );
    expect(result.canRender).toBe(true);
  });

  it('blocks a KPI sum when the metric column was removed', () => {
    const result = resolveChartConfig(
      vendas,
      chart({ type: 'kpi', metric: 'receita_removida', aggregation: 'sum' })
    );
    expect(result.canRender).toBe(false);
  });

  it('renders in demo mode without a dataset', () => {
    const result = resolveChartConfig(null, chart({ groupBy: 'anything' }));
    expect(result.canRender).toBe(true);
  });
});
