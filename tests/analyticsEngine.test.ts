import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  computeExplorerPage,
  computeFieldSuggestions,
  computeWidgetData,
} from '../src/workers/analyticsEngine';
import { DEMO_PIPE_SCHEMA, generateDemoDataset } from '../src/utils/demoDataset';
import type { WidgetConfig } from '../src/types/dashboard';

describe('analyticsEngine (20.000 cards)', () => {
  const { cards, schema } = generateDemoDataset(20_000);

  it('aggregates 20,000 cards under 150ms for SUM by category with Top N + Outros', () => {
    const widget: WidgetConfig = {
      id: 'w-test-sum',
      title: 'Valor Total por Estado',
      chartType: 'horizontal_bar',
      dimensionKey: 'estado',
      metricOp: 'sum',
      metricFieldKey: 'valor_total',
      sortMode: 'value_desc',
      topN: 5,
      groupOthers: true,
      width: 6,
      colorScheme: 'cobalt',
    };

    const res = computeWidgetData(cards, widget, schema);
    expect(res.totalMatched).toBe(20_000);
    expect(res.points.length).toBe(6); // top 5 + Outros
    expect(res.points[5].key).toBe('__others');
    expect(res.summaryValue).toBeGreaterThan(0);
    expect(res.durationMs).toBeLessThan(150);
  });

  it('computes COUNT, AVG, MEDIAN, MIN, MAX and DISTINCT accurately', () => {
    const base: Omit<WidgetConfig, 'metricOp'> = {
      id: 'w-ops',
      title: 'Teste Ops',
      chartType: 'kpi',
      dimensionKey: 'estado',
      metricFieldKey: 'valor_total',
      sortMode: 'value_desc',
      topN: 0,
      groupOthers: false,
      width: 4,
      colorScheme: 'teal',
    };

    const countRes = computeWidgetData(cards, { ...base, metricOp: 'count' }, schema);
    const sumRes = computeWidgetData(cards, { ...base, metricOp: 'sum' }, schema);
    const avgRes = computeWidgetData(cards, { ...base, metricOp: 'avg' }, schema);
    const medRes = computeWidgetData(cards, { ...base, metricOp: 'median' }, schema);
    const minRes = computeWidgetData(cards, { ...base, metricOp: 'min' }, schema);
    const maxRes = computeWidgetData(cards, { ...base, metricOp: 'max' }, schema);
    const distRes = computeWidgetData(
      cards,
      { ...base, metricOp: 'distinct', metricFieldKey: 'estado' },
      schema
    );

    expect(countRes.summaryValue).toBe(20_000);
    expect(avgRes.summaryValue).toBeCloseTo(sumRes.summaryValue / 20_000, 1);
    expect(minRes.summaryValue).toBeLessThanOrEqual(medRes.summaryValue);
    expect(medRes.summaryValue).toBeLessThanOrEqual(maxRes.summaryValue);
    expect(distRes.summaryValue).toBe(9); // 9 UFs in DEMO_CITIES (SP appears twice)
  });

  it('buckets dates by month and numbers into histogram bins', () => {
    const monthly = computeWidgetData(
      cards,
      {
        id: 'w-m',
        title: 'Mensal',
        chartType: 'area',
        dimensionKey: 'data_limite',
        dateGranularity: 'month',
        metricOp: 'count',
        sortMode: 'label_asc',
        topN: 0,
        groupOthers: false,
        width: 8,
        colorScheme: 'cobalt',
      },
      schema
    );
    expect(monthly.points.length).toBe(12);
    expect(monthly.points[0].key).toBe('2027-01');

    const hist = computeWidgetData(
      cards,
      {
        id: 'w-h',
        title: 'Histograma',
        chartType: 'bar',
        dimensionKey: 'valor_total',
        numericBins: 6,
        metricOp: 'count',
        sortMode: 'label_asc',
        topN: 0,
        groupOthers: false,
        width: 4,
        colorScheme: 'amber',
      },
      DEMO_PIPE_SCHEMA
    );
    expect(hist.points.length).toBe(6);
    const totalInBins = hist.points.reduce((s, p) => s + p.count, 0);
    expect(totalInBins).toBe(20_000);
  });

  it('filters 20,000 cards with global search + compound field filters and paginates explorer', () => {
    const filtered = applyFilters(cards, 'sp', [
      { id: 'f1', fieldKey: 'estado', operator: 'equals', value: 'SP' },
      { id: 'f2', fieldKey: 'valor_total', operator: 'gte', value: '500000' },
    ]);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(20_000);
    for (const c of filtered.slice(0, 50)) {
      expect(c.fields.estado).toBe('SP');
      expect(Number(c.fields.valor_total)).toBeGreaterThanOrEqual(500000);
    }

    const page = computeExplorerPage(filtered, {
      page: 1,
      pageSize: 25,
      sortBy: 'valor_total',
      sortDir: 'desc',
    });
    expect(page.rows.length).toBe(Math.min(25, filtered.length));
    if (page.rows.length >= 2) {
      expect(Number(page.rows[0].fields.valor_total)).toBeGreaterThanOrEqual(
        Number(page.rows[1].fields.valor_total)
      );
    }

    const suggestions = computeFieldSuggestions(cards, 'estado', 10);
    expect(suggestions[0]).toBe('SP');
  });
});
