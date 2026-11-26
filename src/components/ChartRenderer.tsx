import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AggregatedPoint,
  WidgetComputationResult,
  WidgetConfig,
} from '../types/dashboard';
import { formatCompactNumber, formatMetricValue } from '../utils/formatters';

const SCHEME_PALETTES: Record<WidgetConfig['colorScheme'], string[]> = {
  cobalt: ['#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#0D9488', '#6366F1', '#0284C7', '#93C5FD'],
  teal: ['#0D9488', '#14B8A6', '#0F766E', '#2DD4BF', '#1D4ED8', '#0284C7', '#5EEAD4', '#38BDF8'],
  amber: ['#D97706', '#F59E0B', '#B45309', '#FBBF24', '#EA580C', '#0D9488', '#1D4ED8', '#FCD34D'],
  emerald: ['#059669', '#10B981', '#047857', '#34D399', '#0D9488', '#1D4ED8', '#6EE7B7', '#0284C7'],
  coral: ['#E11D48', '#F43F5E', '#BE123C', '#FB7185', '#D97706', '#1D4ED8', '#FDA4AF', '#0D9488'],
  slate: ['#0F172A', '#334155', '#475569', '#64748B', '#1D4ED8', '#0D9488', '#94A3B8', '#CBD5E1'],
};

interface ChartRendererProps {
  widget: WidgetConfig;
  result?: WidgetComputationResult;
  onPointClick?: (point: AggregatedPoint) => void;
  height?: number;
}

export function ChartRenderer({
  widget,
  result,
  onPointClick,
  height = 250,
}: ChartRendererProps) {
  if (!result) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', blockSize: height, color: 'var(--text-muted)' }}>
        Calculando no Web Worker...
      </div>
    );
  }

  const palette = SCHEME_PALETTES[widget.colorScheme] ?? SCHEME_PALETTES.cobalt;
  const primaryColor = palette[0];

  if (widget.chartType === 'kpi') {
    return (
      <div className="widget-body kpi-body">
        <div className="kpi-value mono-num">
          {formatMetricValue(result.summaryValue, widget.metricOp, widget.formatAsCurrency)}
        </div>
        <div className="kpi-meta">
          <span className="mono-num">
            Base: {result.totalMatched.toLocaleString('pt-BR')} cards
          </span>
          <span>·</span>
          <span className="mono-num">{result.durationMs} ms</span>
        </div>
      </div>
    );
  }

  if (result.points.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', blockSize: height, color: 'var(--text-muted)' }}>
        Nenhum card encontrado para os filtros ativos.
      </div>
    );
  }

  if (widget.chartType === 'pivot_table') {
    return (
      <div className="table-wrapper" style={{ maxBlockSize: height + 40 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Valor ({widget.metricOp.toUpperCase()})</th>
              <th>Cards</th>
              <th>% do Total</th>
            </tr>
          </thead>
          <tbody>
            {result.points.map((pt) => (
              <tr
                key={pt.key}
                style={{ cursor: onPointClick && pt.key !== '__others' ? 'pointer' : 'default' }}
                onClick={() => pt.key !== '__others' && onPointClick?.(pt)}
              >
                <th>{pt.label}</th>
                <td className="mono-num">
                  {formatMetricValue(pt.value, widget.metricOp, widget.formatAsCurrency)}
                </td>
                <td className="mono-num">{pt.count.toLocaleString('pt-BR')}</td>
                <td className="mono-num">{pt.sharePercent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const tooltipFormatter = (val: number) => [
    formatMetricValue(val, widget.metricOp, widget.formatAsCurrency),
    widget.metricOp.toUpperCase(),
  ];

  const handleChartClick = (data: any) => {
    const pt = data?.activePayload?.[0]?.payload as AggregatedPoint | undefined;
    if (pt && pt.key !== '__others') {
      onPointClick?.(pt);
    }
  };

  if (widget.chartType === 'donut') {
    return (
      <div style={{ inlineSize: '100%', blockSize: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={result.points}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="80%"
              paddingAngle={2}
              onClick={(entry: any) => {
                if (entry?.payload && entry.payload.key !== '__others') {
                  onPointClick?.(entry.payload);
                }
              }}
            >
              {result.points.map((pt, idx) => (
                <Cell
                  key={pt.key}
                  fill={palette[idx % palette.length]}
                  style={{ cursor: pt.key !== '__others' ? 'pointer' : 'default' }}
                />
              ))}
            </Pie>
            <Tooltip formatter={tooltipFormatter} />
            <Legend verticalAlign="bottom" height={34} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (widget.chartType === 'horizontal_bar') {
    return (
      <div style={{ inlineSize: '100%', blockSize: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={result.points}
            layout="vertical"
            margin={{ top: 6, right: 18, left: 10, bottom: 6 }}
            onClick={handleChartClick}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatCompactNumber(v, widget.formatAsCurrency)}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={136}
              tick={{ fontSize: 11, fill: '#334155' }}
            />
            <Tooltip formatter={tooltipFormatter} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} cursor="pointer">
              {result.points.map((pt, idx) => (
                <Cell key={pt.key} fill={idx === 0 ? primaryColor : palette[idx % palette.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (widget.chartType === 'line') {
    return (
      <div style={{ inlineSize: '100%', blockSize: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={result.points}
            margin={{ top: 8, right: 14, left: 6, bottom: 6 }}
            onClick={handleChartClick}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis
              width={76}
              tickFormatter={(v) => formatCompactNumber(v, widget.formatAsCurrency)}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <Tooltip formatter={tooltipFormatter} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={primaryColor}
              strokeWidth={2.5}
              dot={{ r: 3, fill: primaryColor }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (widget.chartType === 'area') {
    const gradId = `grad-${widget.id.replace(/[^a-z0-9]/gi, '')}`;
    return (
      <div style={{ inlineSize: '100%', blockSize: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={result.points}
            margin={{ top: 8, right: 14, left: 6, bottom: 6 }}
            onClick={handleChartClick}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={primaryColor} stopOpacity={0.28} />
                <stop offset="95%" stopColor={primaryColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis
              width={76}
              tickFormatter={(v) => formatCompactNumber(v, widget.formatAsCurrency)}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <Tooltip formatter={tooltipFormatter} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={primaryColor}
              strokeWidth={2.4}
              fill={`url(#${gradId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Default: vertical bar chart
  return (
    <div style={{ inlineSize: '100%', blockSize: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={result.points}
          margin={{ top: 8, right: 14, left: 6, bottom: 6 }}
          onClick={handleChartClick}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis
            width={76}
            tickFormatter={(v) => formatCompactNumber(v, widget.formatAsCurrency)}
            tick={{ fontSize: 11, fill: '#64748b' }}
          />
          <Tooltip formatter={tooltipFormatter} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} cursor="pointer">
            {result.points.map((pt, idx) => (
              <Cell key={pt.key} fill={palette[idx % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
