import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  Pencil,
  Trash2,
} from 'lucide-react';
import type {
  AggregatedPoint,
  WidgetComputationResult,
  WidgetConfig,
} from '../types/dashboard';
import { exportAggregatedCsv } from '../utils/formatters';
import { ChartRenderer } from './ChartRenderer';

interface WidgetCardProps {
  widget: WidgetConfig;
  result?: WidgetComputationResult;
  index: number;
  totalWidgets: number;
  onEdit: (widget: WidgetConfig) => void;
  onDuplicate: (widget: WidgetConfig) => void;
  onRemove: (widgetId: string) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onCrossFilter: (widget: WidgetConfig, point: AggregatedPoint) => void;
}

export function WidgetCard({
  widget,
  result,
  index,
  totalWidgets,
  onEdit,
  onDuplicate,
  onRemove,
  onMove,
  onCrossFilter,
}: WidgetCardProps) {
  return (
    <div className={`widget-slot span-${widget.width}`}>
      <article className="widget-card">
        <header className="widget-header">
          <div style={{ minInlineSize: 0 }}>
            <h2 className="widget-title">{widget.title}</h2>
            {widget.subtitle && <p className="widget-subtitle">{widget.subtitle}</p>}
          </div>

          <div className="widget-toolbar">
            <button
              type="button"
              className="btn btn-icon btn-sm"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              title="Mover para trás"
              aria-label={`Mover ${widget.title} para trás`}
            >
              <ArrowLeft size={13} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              disabled={index === totalWidgets - 1}
              onClick={() => onMove(index, 1)}
              title="Mover para frente"
              aria-label={`Mover ${widget.title} para frente`}
            >
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              disabled={!result || result.points.length === 0}
              onClick={() => result && exportAggregatedCsv(widget.title, result.points)}
              title="Exportar CSV"
              aria-label={`Exportar CSV de ${widget.title}`}
            >
              <Download size={13} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              onClick={() => onDuplicate(widget)}
              title="Duplicar gráfico"
              aria-label={`Duplicar ${widget.title}`}
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              onClick={() => onEdit(widget)}
              title="Configurar gráfico"
              aria-label={`Configurar ${widget.title}`}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              onClick={() => onRemove(widget.id)}
              title="Remover gráfico"
              aria-label={`Remover ${widget.title}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </header>

        <ChartRenderer
          widget={widget}
          result={result}
          onPointClick={(point) => onCrossFilter(widget, point)}
        />
      </article>
    </div>
  );
}
