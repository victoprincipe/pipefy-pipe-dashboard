import { describe, expect, it } from 'vitest';
import { buildChartQuerySpec } from '@/utils/duckDbChartUtils';
import { column, dataset } from '@/utils/__tests__/datasetFixture';

const vendas = dataset('file::vendas', [
  column('id', 'VARCHAR'),
  column('regiao', 'VARCHAR'),
  column('valor', 'DOUBLE'),
  column('ativo', 'BOOLEAN'),
]);

describe('buildChartQuerySpec', () => {
  it('returns an empty SQL and issues when a group column is missing', () => {
    const spec = buildChartQuerySpec(vendas, {
      type: 'horizontalBar',
      groupBy: 'nao_existe',
      metric: '__count__',
      aggregation: 'count',
      datasetId: 'file::vendas',
    });
    expect(spec.canRender).toBe(false);
    expect(spec.sql).toBe('');
    expect(spec.issues.length).toBeGreaterThan(0);
    // Must not silently query the first column.
    expect(spec.sql).not.toContain('"id"');
  });

  it('renders count by an existing dimension', () => {
    const spec = buildChartQuerySpec(vendas, {
      type: 'horizontalBar',
      groupBy: 'regiao',
      metric: '__count__',
      aggregation: 'count',
      datasetId: 'file::vendas',
    });
    expect(spec.canRender).toBe(true);
    expect(spec.sql).toContain('"regiao"');
  });

  it('blocks numeric aggregations on non numeric columns', () => {
    const spec = buildChartQuerySpec(vendas, {
      type: 'bar',
      groupBy: 'regiao',
      metric: 'id',
      aggregation: 'sum',
      datasetId: 'file::vendas',
    });
    expect(spec.canRender).toBe(false);
    expect(spec.sql).toBe('');
  });

  it('supports boolean aggregations', () => {
    const spec = buildChartQuerySpec(vendas, {
      type: 'pie',
      groupBy: 'regiao',
      metric: 'ativo',
      aggregation: 'true_rate',
      datasetId: 'file::vendas',
    });
    expect(spec.canRender).toBe(true);
    expect(spec.valueFormat).toBe('percent');
  });

  it('blocks KPI sums without a metric', () => {
    const spec = buildChartQuerySpec(vendas, {
      type: 'kpi',
      aggregation: 'sum',
      datasetId: 'file::vendas',
    });
    expect(spec.canRender).toBe(false);
    expect(spec.sql).toBe('');
  });

  it('renders custom SQL untouched', () => {
    const spec = buildChartQuerySpec(vendas, {
      type: 'bar',
      dataMode: 'sql',
      customSql: 'SELECT 1 AS bucket, 2 AS total;',
    });
    expect(spec.canRender).toBe(true);
    expect(spec.sql).toContain('SELECT 1');
  });
});
