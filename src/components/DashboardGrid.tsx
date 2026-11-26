import { Plus } from 'lucide-react';
import type {
  AggregatedPoint,
  WidgetComputationResult,
  WidgetConfig,
} from '../types/dashboard';
import { WidgetCard } from './WidgetCard';

interface DashboardGridProps {
  widgets: WidgetConfig[];
  resultsMap: Record<string, WidgetComputationResult>;
  onEdit: (widget: WidgetConfig) => void;
  onDuplicate: (widget: WidgetConfig) => void;
  onRemove: (widgetId: string) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onCrossFilter: (widget: WidgetConfig, point: AggregatedPoint) => void;
  onOpenBuilder: () => void;
}

export function DashboardGrid({
  widgets,
  resultsMap,
  onEdit,
  onDuplicate,
  onRemove,
  onMove,
  onCrossFilter,
  onOpenBuilder,
}: DashboardGridProps) {
  if (widgets.length === 0) {
    return (
      <section
        className="widget-card"
        style={{ padding: 40, alignItems: 'center', textAlign: 'center', gap: 12 }}
      >
        <h2 className="widget-title">Nenhum gráfico nesta visão ainda</h2>
        <p className="widget-subtitle">
          Monte gráficos de barras, linhas, área, rosca, KPIs ou tabelas dinâmicas usando qualquer campo do Pipe.
        </p>
        <button type="button" className="btn btn-primary" onClick={onOpenBuilder}>
          <Plus size={15} />
          <span>Criar Primeiro Gráfico</span>
        </button>
      </section>
    );
  }

  return (
    <section className="dashboard-grid" aria-label="Gráficos do painel">
      {widgets.map((widget, idx) => (
        <WidgetCard
          key={widget.id}
          widget={widget}
          result={resultsMap[widget.id]}
          index={idx}
          totalWidgets={widgets.length}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onMove={onMove}
          onCrossFilter={onCrossFilter}
        />
      ))}
    </section>
  );
}
