'use client';

import { useId } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ChartStackMode,
  ChartValueFormat,
  DashboardChartAggregation,
  DashboardChartType,
} from '@/types/dashboardViews';
import {
  formatAxisTick,
  formatMetricValue,
  getSemanticColor,
  PIPEFY_CHART_PALETTE,
} from '@/utils/chartSemantics';
import type { ChartDataPoint, ChartQuerySummary } from '@/utils/duckDbChartUtils';

export interface ChartRendererProps {
  chartType: DashboardChartType;
  points: ChartDataPoint[];
  summary: ChartQuerySummary;
  valueLabel: string;
  valueFormat: Exclude<ChartValueFormat, 'auto'>;
  isAdditive: boolean;
  isDateAxis: boolean;
  splitMultiValue?: boolean;
  aggregation: DashboardChartAggregation;
  showAverageLine?: boolean;
  /** Series (breakdown) keys, when the chart is segmented. */
  seriesKeys?: string[];
  stackMode?: ChartStackMode;
  height?: number;
  compact?: boolean;
}

function truncateLabel(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(3, maxLen - 1)).trimEnd()}…`;
}

function ExecutiveTooltip({
  active,
  payload,
  valueLabel,
  valueFormat,
  aggregation,
  isAdditive,
  splitMultiValue,
  avgPerGroup,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartDataPoint; value?: unknown }>;
  valueLabel: string;
  valueFormat: Exclude<ChartValueFormat, 'auto'>;
  aggregation: DashboardChartAggregation;
  isAdditive: boolean;
  splitMultiValue?: boolean;
  avgPerGroup: number;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const formattedValue = formatMetricValue(point.value, valueFormat);
  const shareDenominatorLabel = splitMultiValue ? 'dos cards' : 'do total';
  const diffFromAvg =
    !isAdditive && avgPerGroup > 0
      ? ((point.value - avgPerGroup) / Math.abs(avgPerGroup)) * 100
      : null;

  return (
    <div className="max-w-64 rounded-pf-panel border border-border-subtle bg-surface px-3.5 py-2.5 text-xs text-ink shadow-pf-tooltip">
      <p className="font-semibold text-ink break-words">{point.name}</p>
      <div className="mt-1.5 space-y-1 text-ink-secondary">
        <p className="flex items-center justify-between gap-4">
          <span>{valueLabel}:</span>
          <span className="font-semibold text-brand">{formattedValue}</span>
        </p>

        {point.sharePct !== null && (
          <p className="flex items-center justify-between gap-4">
            <span>Participação:</span>
            <span className="font-semibold text-ink">
              {point.sharePct.toLocaleString('pt-BR', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              % {shareDenominatorLabel}
            </span>
          </p>
        )}

        {aggregation !== 'count' && point.cardCount > 0 && (
          <p className="flex items-center justify-between gap-4">
            <span>Base:</span>
            <span className="font-medium text-ink">
              {point.cardCount.toLocaleString('pt-BR')}{' '}
              {point.cardCount === 1 ? 'card' : 'cards'}
            </span>
          </p>
        )}

        {point.deltaPct !== null && (
          <p className="flex items-center justify-between gap-4">
            <span>Vs. período anterior:</span>
            <span
              className={`font-semibold ${
                point.deltaPct > 0
                  ? 'text-pf-green-dark-1'
                  : point.deltaPct < 0
                    ? 'text-pf-red'
                    : 'text-ink'
              }`}
            >
              {point.deltaPct > 0 ? '+' : ''}
              {point.deltaPct.toLocaleString('pt-BR', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              %
            </span>
          </p>
        )}

        {diffFromAvg !== null && Math.abs(diffFromAvg) >= 0.5 && (
          <p className="flex items-center justify-between gap-4">
            <span>Vs. média geral:</span>
            <span className="font-medium text-ink">
              {diffFromAvg > 0 ? '+' : ''}
              {diffFromAvg.toLocaleString('pt-BR', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              %
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Shared executive Recharts renderer used by both dashboard cards and the studio live preview.
 */
export function ChartRenderer({
  chartType,
  points,
  summary,
  valueLabel,
  valueFormat,
  isAdditive,
  isDateAxis,
  splitMultiValue = false,
  aggregation,
  showAverageLine = false,
  seriesKeys,
  stackMode = 'stacked',
  height = 280,
  compact = false,
}: ChartRendererProps) {
  const rawId = useId();
  const reduceMotion = useReducedMotion();
  const gradientId = `pfAreaGrad_${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const coloredPoints = points.map((pt, idx) => ({
    ...pt,
    fill: getSemanticColor(pt.name, idx, pt.isOthers),
  }));

  const activeSeriesKeys = seriesKeys ?? [];
  const hasSeries = activeSeriesKeys.length > 0;
  const seriesData = hasSeries
    ? coloredPoints.map((pt) => {
        const row: Record<string, unknown> = { ...pt };
        activeSeriesKeys.forEach((key, index) => {
          row[`__s${index}`] = pt.seriesValues?.[key] ?? 0;
        });
        return row;
      })
    : coloredPoints;
  const seriesFill = (index: number) =>
    PIPEFY_CHART_PALETTE[index % PIPEFY_CHART_PALETTE.length];
  const stackId = stackMode === 'stacked' ? 'series' : undefined;

  if (chartType === 'kpi') {
    const mainFormatted = formatMetricValue(summary.grandTotal, valueFormat);
    const maxContributor = points.reduce(
      (max, pt) => (pt.value > max ? pt.value : max),
      0
    );

    return (
      <div
        className="flex flex-col justify-between gap-4 rounded-pf-panel border border-border-subtle bg-canvas/70 p-5"
        style={{ minHeight: compact ? 200 : height }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              {valueLabel}
            </p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {mainFormatted}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              {summary.totalCards.toLocaleString('pt-BR')}{' '}
              {summary.totalCards === 1 ? 'card analisado' : 'cards analisados'}
              {summary.allDatasetCards > 0 && summary.pctOfPipe < 99.9
                ? ` de ${summary.allDatasetCards.toLocaleString('pt-BR')} no pipe`
                : ''}
            </p>
          </div>

          {summary.allDatasetCards > 0 && summary.pctOfPipe < 99.9 && (
            <span className="inline-flex items-center rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
              {summary.pctOfPipe.toLocaleString('pt-BR', {
                maximumFractionDigits: 1,
              })}
              % do pipe
            </span>
          )}
        </div>

        {points.length > 1 && (
          <div className="space-y-2.5 border-t border-border-subtle pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
              Principais contribuintes
            </p>
            <div className="space-y-2">
              {points.slice(0, 3).map((pt, idx) => {
                const widthPct =
                  maxContributor > 0
                    ? Math.max(6, Math.round((pt.value / maxContributor) * 100))
                    : 0;
                const barColor = getSemanticColor(pt.name, idx, pt.isOthers);
                return (
                  <div key={`${pt.name}-${idx}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-ink">
                        {pt.name}
                      </span>
                      <span className="shrink-0 font-mono font-semibold text-ink">
                        {formatMetricValue(pt.value, valueFormat, { compact: true })}
                        {pt.sharePct !== null ? (
                          <span className="ml-1.5 font-sans font-normal text-ink-secondary">
                            ({pt.sharePct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-border-subtle/70">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (chartType === 'pie') {
    const centerLabel = isAdditive ? 'Total' : 'Geral';
    const centerValue = formatMetricValue(summary.grandTotal, valueFormat, {
      compact: true,
    });

    return (
      <div
        className={`grid grid-cols-1 items-center gap-4 ${
          compact ? '' : 'md:grid-cols-12'
        }`}
      >
        <div
          className={`relative ${compact ? 'h-52' : 'h-64 md:col-span-7'}`}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Tooltip
                content={({ active, payload }) => (
                  <ExecutiveTooltip
                    active={active}
                    payload={payload as ReadonlyArray<{ payload?: ChartDataPoint }>}
                    valueLabel={valueLabel}
                    valueFormat={valueFormat}
                    aggregation={aggregation}
                    isAdditive={isAdditive}
                    splitMultiValue={splitMultiValue}
                    avgPerGroup={summary.avgPerGroup}
                  />
                )}
              />
              <Pie
                data={coloredPoints}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="56%"
                outerRadius="86%"
                paddingAngle={2}
                isAnimationActive={!reduceMotion}
                animationDuration={700}
                animationEasing="ease-out"
              >
                {coloredPoints.map((entry, idx) => (
                  <Cell key={`${entry.name}-${idx}`} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
              {centerLabel}
            </span>
            <span className="mt-0.5 text-base font-bold text-ink sm:text-lg">
              {centerValue}
            </span>
          </div>
        </div>

        <ul
          className={`space-y-1.5 ${
            compact ? '' : 'md:col-span-5'
          } max-h-64 overflow-y-auto pr-1`}
        >
          {coloredPoints.map((pt, idx) => (
            <li
              key={`${pt.name}-${idx}`}
              className="flex items-center justify-between gap-2 rounded-pf-control px-2 py-1 text-xs hover:bg-canvas"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: pt.fill }}
                />
                <span className="truncate font-medium text-ink" title={pt.name}>
                  {pt.name}
                </span>
              </div>
              <div className="shrink-0 text-right font-mono text-[11px]">
                <span className="font-semibold text-ink">
                  {formatMetricValue(pt.value, valueFormat, { compact: true })}
                </span>
                {pt.sharePct !== null && (
                  <span className="ml-1.5 text-ink-secondary">
                    {pt.sharePct.toLocaleString('pt-BR', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (chartType === 'horizontalBar') {
    const resolvedHeight = compact
      ? Math.max(height, Math.min(320, points.length * 32 + 24))
      : Math.max(height, Math.min(460, points.length * 38 + 28));

    return (
      <div style={{ height: resolvedHeight }} className="w-full">
        <ResponsiveContainer width="100%" height={resolvedHeight} minWidth={0}>
          <BarChart
            data={seriesData}
            layout="vertical"
            margin={{
              top: 6,
              right: compact ? 64 : 96,
              left: 4,
              bottom: 6,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--color-border-subtle)"
            />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-ink-secondary)', fontSize: 11 }}
              tickFormatter={(v) => formatAxisTick(Number(v), valueFormat)}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={compact ? 108 : 148}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-ink)', fontSize: 12, fontWeight: 500 }}
              tickFormatter={(v) => truncateLabel(String(v), compact ? 15 : 22)}
            />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--color-brand) 6%, transparent)' }}
              content={({ active, payload }) => (
                <ExecutiveTooltip
                  active={active}
                  payload={payload as ReadonlyArray<{ payload?: ChartDataPoint }>}
                  valueLabel={valueLabel}
                  valueFormat={valueFormat}
                  aggregation={aggregation}
                  isAdditive={isAdditive}
                  splitMultiValue={splitMultiValue}
                  avgPerGroup={summary.avgPerGroup}
                />
              )}
            />
            {showAverageLine && summary.avgPerGroup > 0 && (
              <ReferenceLine
                x={summary.avgPerGroup}
                stroke="#607D8B"
                strokeDasharray="4 4"
                label={{
                  value: 'Média',
                  position: 'top',
                  fill: '#607D8B',
                  fontSize: 11,
                }}
              />
            )}
            {hasSeries &&
              activeSeriesKeys.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={`__s${index}`}
                  name={key}
                  stackId={stackId}
                  fill={seriesFill(index)}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={26}
                  isAnimationActive={!reduceMotion}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              ))}
            {!hasSeries && (
              <Bar
                dataKey="value"
                name={valueLabel}
                radius={[0, 6, 6, 0]}
                maxBarSize={26}
                isAnimationActive={!reduceMotion}
                animationDuration={700}
                animationEasing="ease-out"
              >
                {coloredPoints.map((entry, idx) => (
                  <Cell key={`${entry.name}-${idx}`} fill={entry.fill} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  content={(props) => {
                    const x = Number(props.x ?? 0);
                    const y = Number(props.y ?? 0);
                    const w = Number(props.width ?? 0);
                    const h = Number(props.height ?? 0);
                    const idx =
                      typeof props.index === 'number' ? props.index : -1;
                    const pt = idx >= 0 ? coloredPoints[idx] : undefined;
                    const numVal = Number(props.value ?? 0);
                    const mainStr = formatMetricValue(numVal, valueFormat, {
                      compact: true,
                    });
                    const labelText =
                      !compact && pt?.sharePct !== null && pt?.sharePct !== undefined
                        ? `${mainStr} (${pt.sharePct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`
                        : mainStr;

                    return (
                      <text
                        x={x + w + 6}
                        y={y + h / 2}
                        dy={4}
                        fill="var(--color-ink-secondary)"
                        fontSize={11}
                        fontWeight={600}
                      >
                        {labelText}
                      </text>
                    );
                  }}
                />
              </Bar>
            )}
            {hasSeries && (
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'line') {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
          <LineChart
            data={seriesData}
            margin={{ top: 12, right: 16, left: 10, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--color-border-subtle)"
            />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-ink-secondary)', fontSize: 11, fontWeight: 500 }}
              tickFormatter={(v) => truncateLabel(String(v), 14)}
            />
            <YAxis
              width={68}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-ink-secondary)', fontSize: 11, fontWeight: 500 }}
              tickFormatter={(v) => formatAxisTick(Number(v), valueFormat)}
            />
            <Tooltip
              content={({ active, payload }) => (
                <ExecutiveTooltip
                  active={active}
                  payload={payload as ReadonlyArray<{ payload?: ChartDataPoint }>}
                  valueLabel={valueLabel}
                  valueFormat={valueFormat}
                  aggregation={aggregation}
                  isAdditive={isAdditive}
                  splitMultiValue={splitMultiValue}
                  avgPerGroup={summary.avgPerGroup}
                />
              )}
            />
            {showAverageLine && summary.avgPerGroup > 0 && (
              <ReferenceLine
                y={summary.avgPerGroup}
                stroke="#607D8B"
                strokeDasharray="4 4"
                label={{
                  value: `Média: ${formatMetricValue(summary.avgPerGroup, valueFormat, { compact: true })}`,
                  position: 'insideTopRight',
                  fill: '#607D8B',
                  fontSize: 11,
                }}
              />
            )}
            {hasSeries ? (
              activeSeriesKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={`__s${index}`}
                  name={key}
                  stroke={seriesFill(index)}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: seriesFill(index), strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={!reduceMotion}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey="value"
                name={valueLabel}
                stroke="var(--color-brand)"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: 'var(--color-brand)', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                isAnimationActive={!reduceMotion}
                animationDuration={700}
                animationEasing="ease-out"
              />
            )}
            {hasSeries && (
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'area') {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
          <AreaChart
            data={seriesData}
            margin={{ top: 12, right: 16, left: 10, bottom: 8 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0B66FF" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#0B66FF" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--color-border-subtle)"
            />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-ink-secondary)', fontSize: 11, fontWeight: 500 }}
              tickFormatter={(v) => truncateLabel(String(v), 14)}
            />
            <YAxis
              width={68}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-ink-secondary)', fontSize: 11, fontWeight: 500 }}
              tickFormatter={(v) => formatAxisTick(Number(v), valueFormat)}
            />
            <Tooltip
              content={({ active, payload }) => (
                <ExecutiveTooltip
                  active={active}
                  payload={payload as ReadonlyArray<{ payload?: ChartDataPoint }>}
                  valueLabel={valueLabel}
                  valueFormat={valueFormat}
                  aggregation={aggregation}
                  isAdditive={isAdditive}
                  splitMultiValue={splitMultiValue}
                  avgPerGroup={summary.avgPerGroup}
                />
              )}
            />
            {showAverageLine && summary.avgPerGroup > 0 && (
              <ReferenceLine
                y={summary.avgPerGroup}
                stroke="#607D8B"
                strokeDasharray="4 4"
                label={{
                  value: `Média: ${formatMetricValue(summary.avgPerGroup, valueFormat, { compact: true })}`,
                  position: 'insideTopRight',
                  fill: '#607D8B',
                  fontSize: 11,
                }}
              />
            )}
            {hasSeries ? (
              activeSeriesKeys.map((key, index) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={`__s${index}`}
                  name={key}
                  stackId={stackId}
                  stroke={seriesFill(index)}
                  strokeWidth={2}
                  fill={seriesFill(index)}
                  fillOpacity={0.22}
                  isAnimationActive={!reduceMotion}
                  animationDuration={700}
                  animationEasing="ease-out"
                />
              ))
            ) : (
              <Area
                type="monotone"
                dataKey="value"
                name={valueLabel}
                stroke="var(--color-brand)"
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                isAnimationActive={!reduceMotion}
                animationDuration={700}
                animationEasing="ease-out"
              />
            )}
            {hasSeries && (
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'radar') {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
          <RadarChart cx="50%" cy="50%" outerRadius="72%" data={points}>
            <PolarGrid stroke="var(--color-border-subtle)" />
            <PolarAngleAxis
              dataKey="name"
              tick={{ fill: 'var(--color-ink-secondary)', fontSize: 11, fontWeight: 500 }}
            />
            <PolarRadiusAxis
              tick={{ fill: 'var(--color-ink-icon)', fontSize: 10 }}
              tickFormatter={(v) => formatAxisTick(Number(v), valueFormat)}
            />
            <Tooltip
              content={({ active, payload }) => (
                <ExecutiveTooltip
                  active={active}
                  payload={payload as ReadonlyArray<{ payload?: ChartDataPoint }>}
                  valueLabel={valueLabel}
                  valueFormat={valueFormat}
                  aggregation={aggregation}
                  isAdditive={isAdditive}
                  splitMultiValue={splitMultiValue}
                  avgPerGroup={summary.avgPerGroup}
                />
              )}
            />
            <Radar
              name={valueLabel}
              dataKey="value"
              stroke="#0B66FF"
              fill="#0B66FF"
              fillOpacity={0.28}
              isAnimationActive={!reduceMotion}
                animationDuration={700}
                animationEasing="ease-out"
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'radialBar') {
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height={height} minWidth={0}>
          <RadialBarChart
            cx="50%"
            cy="46%"
            innerRadius="20%"
            outerRadius="86%"
            barSize={14}
            data={coloredPoints}
          >
            <RadialBar
              background={{ fill: 'var(--color-canvas)' }}
              dataKey="value"
              cornerRadius={6}
              isAnimationActive={!reduceMotion}
                animationDuration={700}
                animationEasing="ease-out"
            />
            <Legend
              verticalAlign="bottom"
              height={32}
              wrapperStyle={{ fontSize: '11px', color: 'var(--color-ink-secondary)' }}
            />
            <Tooltip
              content={({ active, payload }) => (
                <ExecutiveTooltip
                  active={active}
                  payload={payload as ReadonlyArray<{ payload?: ChartDataPoint }>}
                  valueLabel={valueLabel}
                  valueFormat={valueFormat}
                  aggregation={aggregation}
                  isAdditive={isAdditive}
                  splitMultiValue={splitMultiValue}
                  avgPerGroup={summary.avgPerGroup}
                />
              )}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const shouldAngleTicks =
    !isDateAxis && (points.length > 6 || points.some((p) => p.name.length > 11));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <BarChart
          data={seriesData}
          margin={{
            top: 12,
            right: 16,
            left: 10,
            bottom: shouldAngleTicks ? 24 : 8,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--color-border-subtle)"
          />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={shouldAngleTicks ? -25 : 0}
            textAnchor={shouldAngleTicks ? 'end' : 'middle'}
            height={shouldAngleTicks ? 52 : 30}
            tick={{ fill: 'var(--color-ink-secondary)', fontSize: 11, fontWeight: 500 }}
            tickFormatter={(v) => truncateLabel(String(v), shouldAngleTicks ? 14 : 18)}
          />
          <YAxis
            width={68}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-ink-secondary)', fontSize: 11, fontWeight: 500 }}
            tickFormatter={(v) => formatAxisTick(Number(v), valueFormat)}
          />
          <Tooltip
            cursor={{ fill: 'color-mix(in srgb, var(--color-brand) 8%, transparent)' }}
            content={({ active, payload }) => (
              <ExecutiveTooltip
                active={active}
                payload={payload as ReadonlyArray<{ payload?: ChartDataPoint }>}
                valueLabel={valueLabel}
                valueFormat={valueFormat}
                aggregation={aggregation}
                isAdditive={isAdditive}
                splitMultiValue={splitMultiValue}
                avgPerGroup={summary.avgPerGroup}
              />
            )}
          />
          {showAverageLine && summary.avgPerGroup > 0 && (
            <ReferenceLine
              y={summary.avgPerGroup}
              stroke="#607D8B"
              strokeDasharray="4 4"
              label={{
                value: `Média: ${formatMetricValue(summary.avgPerGroup, valueFormat, { compact: true })}`,
                position: 'insideTopRight',
                fill: '#607D8B',
                fontSize: 11,
              }}
            />
          )}
          {hasSeries &&
            activeSeriesKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={`__s${index}`}
                name={key}
                stackId={stackId}
                fill={seriesFill(index)}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                isAnimationActive={!reduceMotion}
                animationDuration={700}
                animationEasing="ease-out"
              />
            ))}
          {!hasSeries && (
            <Bar
              dataKey="value"
              name={valueLabel}
              radius={[6, 6, 0, 0]}
              maxBarSize={48}
              isAnimationActive={!reduceMotion}
              animationDuration={700}
              animationEasing="ease-out"
            >
              {coloredPoints.map((entry, idx) => (
                <Cell key={`${entry.name}-${idx}`} fill={entry.fill} />
              ))}
            </Bar>
          )}
          {hasSeries && (
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
