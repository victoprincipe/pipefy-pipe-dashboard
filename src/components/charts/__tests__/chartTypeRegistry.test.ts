import { TrendingUp } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  chartTypeHasCapability,
  getChartTypeDefinition,
  getChartTypeOptions,
} from '@/components/charts/chartTypeRegistry';

describe('chartTypeRegistry', () => {
  it('uses TrendingUp icon for line charts', () => {
    const def = getChartTypeDefinition('line');
    expect(def.icon).toBe(TrendingUp);
  });

  it('splits primary and legacy chart type options cleanly', () => {
    const primary = getChartTypeOptions('primary').map((o) => o.type);
    const legacy = getChartTypeOptions('legacy').map((o) => o.type);
    const all = getChartTypeOptions().map((o) => o.type);

    expect(primary).toEqual([
      'horizontalBar',
      'bar',
      'line',
      'area',
      'pie',
      'kpi',
    ]);
    expect(legacy).toEqual(['radar', 'radialBar']);
    expect(all).toHaveLength(primary.length + legacy.length);
  });

  it('reports accurate capabilities per chart type', () => {
    expect(chartTypeHasCapability('horizontalBar', 'breakdown')).toBe(true);
    expect(chartTypeHasCapability('horizontalBar', 'stack')).toBe(true);
    expect(chartTypeHasCapability('horizontalBar', 'averageLine')).toBe(true);

    expect(chartTypeHasCapability('pie', 'breakdown')).toBe(false);
    expect(chartTypeHasCapability('pie', 'averageLine')).toBe(false);
    expect(chartTypeHasCapability('pie', 'limit')).toBe(true);

    expect(chartTypeHasCapability('kpi', 'valueFormat')).toBe(true);
    expect(chartTypeHasCapability('kpi', 'limit')).toBe(false);
  });
});
