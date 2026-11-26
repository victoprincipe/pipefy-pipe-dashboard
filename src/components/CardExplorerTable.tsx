import { ArrowDown, ArrowUp, Download, ExternalLink } from 'lucide-react';
import type { ExplorerQuery, ExplorerResult } from '../types/dashboard';
import type { PipeSchema } from '../types/pipefy';
import { getCardRawValue } from '../utils/cardHelpers';

interface CardExplorerTableProps {
  schema: PipeSchema;
  explorer: ExplorerResult | null;
  query: ExplorerQuery;
  canOpenCard: boolean;
  onQueryChange: (next: ExplorerQuery) => void;
  onOpenCard: (cardId: string) => void;
  onExportFilteredCsv: () => void;
}

export function CardExplorerTable({
  schema,
  explorer,
  query,
  canOpenCard,
  onQueryChange,
  onOpenCard,
  onExportFilteredCsv,
}: CardExplorerTableProps) {
  const customFields = schema.fields.filter((f) => !f.isBuiltIn).slice(0, 8);
  const totalPages = explorer ? Math.max(1, Math.ceil(explorer.total / query.pageSize)) : 1;

  const toggleSort = (colKey: string) => {
    if (query.sortBy === colKey) {
      onQueryChange({
        ...query,
        page: 1,
        sortDir: query.sortDir === 'asc' ? 'desc' : 'asc',
      });
    } else {
      onQueryChange({ ...query, page: 1, sortBy: colKey, sortDir: 'asc' });
    }
  };

  const renderSortIcon = (colKey: string) => {
    if (query.sortBy !== colKey) return null;
    return query.sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const formatCell = (val: unknown, pipefyType: string) => {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'number') {
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val);
    }
    if (pipefyType === 'date' && typeof val === 'string') {
      return val.slice(0, 10);
    }
    return String(val);
  };

  return (
    <section className="widget-card" aria-label="Explorador tabular de cards">
      <div className="widget-header">
        <div>
          <h2 className="widget-title">Explorador Completo de Cards</h2>
          <p className="widget-subtitle">
            {explorer
              ? `${explorer.total.toLocaleString('pt-BR')} cards filtrados · Página ${explorer.page} de ${totalPages} · ordenado em ${explorer.durationMs} ms`
              : 'Carregando tabela...'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={onExportFilteredCsv}>
            <Download size={14} />
            <span>Exportar CSV Filtrado</span>
          </button>
        </div>
      </div>

      <div className="table-wrapper" tabIndex={0} role="region" aria-label="Lista de cards do pipe">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="view-tab-btn" style={{ padding: 0 }} onClick={() => toggleSort('__id')}>
                  ID {renderSortIcon('__id')}
                </button>
              </th>
              <th>
                <button type="button" className="view-tab-btn" style={{ padding: 0 }} onClick={() => toggleSort('__phase')}>
                  Fase {renderSortIcon('__phase')}
                </button>
              </th>
              {customFields.map((f) => (
                <th key={f.key}>
                  <button
                    type="button"
                    className="view-tab-btn"
                    style={{ padding: 0 }}
                    onClick={() => toggleSort(f.key)}
                  >
                    {f.label} {renderSortIcon(f.key)}
                  </button>
                </th>
              ))}
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {(explorer?.rows ?? []).map((card) => (
              <tr key={card.id}>
                <th className="mono-num">#{card.id}</th>
                <td>{card.phaseName}</td>
                {customFields.map((f) => (
                  <td key={f.key} className={f.kind === 'number' || f.kind === 'date' ? 'mono-num' : ''}>
                    {formatCell(getCardRawValue(card, f.key), f.pipefyType)}
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onOpenCard(card.id)}
                    title={canOpenCard ? 'Abrir card no Pipefy' : 'Abrir link do card'}
                  >
                    <ExternalLink size={12} />
                    <span>Abrir</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Linhas por página:</span>
          <select
            className="select"
            style={{ width: 84, padding: '4px 8px' }}
            value={query.pageSize}
            onChange={(e) =>
              onQueryChange({ ...query, page: 1, pageSize: Number(e.target.value) })
            }
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={query.page <= 1}
            onClick={() => onQueryChange({ ...query, page: query.page - 1 })}
          >
            Anterior
          </button>
          <span className="mono-num" style={{ fontSize: 12 }}>
            {query.page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={query.page >= totalPages}
            onClick={() => onQueryChange({ ...query, page: query.page + 1 })}
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}
