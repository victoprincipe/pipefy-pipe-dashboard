import { describe, expect, it } from 'vitest';
import {
  isValidChartConfig,
  migrateChartConfig,
  parsePipefyStoredViews,
} from '@/lib/pipefyAppStorage';
import type { DashboardChartConfig } from '@/types/dashboardViews';

describe('pipefyAppStorage', () => {
  it('validates chart configs by id and registered chart type', () => {
    expect(
      isValidChartConfig({ id: 'chart-1', type: 'horizontalBar' })
    ).toBe(true);
    expect(isValidChartConfig({ id: '', type: 'bar' })).toBe(false);
    expect(
      isValidChartConfig({ id: 'chart-1', type: 'unknown_type' })
    ).toBe(false);
    expect(isValidChartConfig(null)).toBe(false);
  });

  it('migrates legacy filterColumn/filterValue into filters array and stamps configVersion 2', () => {
    const legacy: DashboardChartConfig = {
      id: 'c-legacy',
      type: 'bar',
      filterColumn: 'fase',
      filterValue: 'Aprovação',
    };

    const migrated = migrateChartConfig(legacy);
    expect(migrated.configVersion).toBe(2);
    expect(migrated.filterColumn).toBeUndefined();
    expect(migrated.filterValue).toBeUndefined();
    expect(migrated.datasetId).toBeUndefined();
    expect(migrated.filters).toEqual([
      {
        id: 'legacy-filter-c-legacy',
        column: 'fase',
        operator: 'contains',
        value: 'Aprovação',
      },
    ]);
  });

  it('parses JSON string and object payloads and falls back activeViewId when invalid', () => {
    const rawJson = JSON.stringify({
      version: 1,
      activeViewId: 'missing-view',
      views: [
        {
          id: 'v1',
          name: 'Executivo',
          createdAt: 1000,
          charts: [{ id: 'c1', type: 'kpi' }],
        },
        {
          id: '',
          name: 'Inválida',
          createdAt: 1000,
          charts: [],
        },
      ],
    });

    const parsed = parsePipefyStoredViews(rawJson);
    expect(parsed).not.toBeNull();
    expect(parsed?.views).toHaveLength(1);
    expect(parsed?.activeViewId).toBe('v1');
    expect(parsed?.views[0].charts[0].configVersion).toBe(2);
  });

  it('returns null for empty or malformed stored payloads', () => {
    expect(parsePipefyStoredViews(null)).toBeNull();
    expect(parsePipefyStoredViews('')).toBeNull();
    expect(parsePipefyStoredViews('{invalid json')).toBeNull();
    expect(parsePipefyStoredViews({ views: [] })).toBeNull();
  });
});
