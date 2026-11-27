import {
  AreaChart as AreaChartIcon,
  BarChart3,
  BarChartHorizontal,
  Gauge,
  PieChart as PieChartIcon,
  Radar as RadarIcon,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DASHBOARD_CHART_TYPE_OPTIONS,
  LEGACY_CHART_TYPE_OPTIONS,
  PRIMARY_CHART_TYPE_OPTIONS,
  type DashboardChartType,
  type DashboardChartTypeOption,
} from '@/types/dashboardViews';

/**
 * To add a new chart type: register it here and add its renderer branch in
 * `ChartRenderer`. The modal, validation and capability-driven controls all
 * derive from this registry.
 */
export type ChartCapability =
  | 'breakdown'
  | 'averageLine'
  | 'stack'
  | 'dateGranularity'
  | 'groupOthers'
  | 'splitMultiValue'
  | 'limit'
  | 'sort'
  | 'valueFormat';

export interface ChartTypeDefinition {
  type: DashboardChartType;
  label: string;
  description: string;
  bestFor?: string;
  tier: 'primary' | 'legacy';
  icon: LucideIcon;
  capabilities: ReadonlySet<ChartCapability>;
}

function caps(...values: ChartCapability[]): ReadonlySet<ChartCapability> {
  return new Set(values);
}

const META: Record<
  DashboardChartType,
  { icon: LucideIcon; tier: 'primary' | 'legacy'; capabilities: ReadonlySet<ChartCapability> }
> = {
  horizontalBar: {
    icon: BarChartHorizontal,
    tier: 'primary',
    capabilities: caps(
      'breakdown',
      'averageLine',
      'stack',
      'dateGranularity',
      'groupOthers',
      'splitMultiValue',
      'limit',
      'sort',
      'valueFormat'
    ),
  },
  bar: {
    icon: BarChart3,
    tier: 'primary',
    capabilities: caps(
      'breakdown',
      'averageLine',
      'stack',
      'dateGranularity',
      'groupOthers',
      'splitMultiValue',
      'limit',
      'sort',
      'valueFormat'
    ),
  },
  line: {
    icon: TrendingUp,
    tier: 'primary',
    capabilities: caps(
      'breakdown',
      'averageLine',
      'dateGranularity',
      'groupOthers',
      'splitMultiValue',
      'limit',
      'sort',
      'valueFormat'
    ),
  },
  area: {
    icon: AreaChartIcon,
    tier: 'primary',
    capabilities: caps(
      'breakdown',
      'averageLine',
      'dateGranularity',
      'groupOthers',
      'splitMultiValue',
      'limit',
      'sort',
      'valueFormat'
    ),
  },
  pie: {
    icon: PieChartIcon,
    tier: 'primary',
    capabilities: caps('limit', 'sort', 'groupOthers', 'splitMultiValue', 'valueFormat'),
  },
  kpi: {
    icon: Gauge,
    tier: 'primary',
    capabilities: caps('valueFormat'),
  },
  radar: {
    icon: RadarIcon,
    tier: 'legacy',
    capabilities: caps('limit', 'valueFormat'),
  },
  radialBar: {
    icon: RadarIcon,
    tier: 'legacy',
    capabilities: caps('limit', 'valueFormat'),
  },
};

function buildDefinition(option: DashboardChartTypeOption): ChartTypeDefinition {
  const meta = META[option.type];
  return {
    type: option.type,
    label: option.label,
    description: option.description,
    bestFor: option.bestFor,
    tier: meta.tier,
    icon: meta.icon,
    capabilities: meta.capabilities,
  };
}

export const CHART_TYPE_REGISTRY: Record<DashboardChartType, ChartTypeDefinition> =
  DASHBOARD_CHART_TYPE_OPTIONS.reduce(
    (acc, option) => {
      acc[option.type] = buildDefinition(option);
      return acc;
    },
    {} as Record<DashboardChartType, ChartTypeDefinition>
  );

export function getChartTypeDefinition(type: DashboardChartType): ChartTypeDefinition {
  return (
    CHART_TYPE_REGISTRY[type] ?? {
      type,
      label: type,
      description: '',
      tier: 'legacy',
      icon: BarChart3,
      capabilities: caps(),
    }
  );
}

export function getChartTypeOptions(
  tier?: 'primary' | 'legacy'
): DashboardChartTypeOption[] {
  const source =
    tier === 'primary'
      ? PRIMARY_CHART_TYPE_OPTIONS
      : tier === 'legacy'
        ? LEGACY_CHART_TYPE_OPTIONS
        : DASHBOARD_CHART_TYPE_OPTIONS;
  return source.map((opt) => ({ ...opt }));
}

export function chartTypeHasCapability(
  type: DashboardChartType,
  capability: ChartCapability
): boolean {
  return getChartTypeDefinition(type).capabilities.has(capability);
}
