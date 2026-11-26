import { useState } from 'react';
import {
  Activity,
  Database,
  Download,
  FilePlus2,
  Pencil,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import type { DashboardView } from '../types/dashboard';
import type { CacheSnapshotMeta, PipeSchema, PipefyUser } from '../types/pipefy';

interface HeaderBarProps {
  schema: PipeSchema;
  user: PipefyUser;
  cacheMeta: CacheSnapshotMeta;
  workerMs: number | null;
  views: DashboardView[];
  activeViewId: string;
  isSyncing: boolean;
  onSelectView: (id: string) => void;
  onCreateView: (kind: 'charts' | 'explorer') => void;
  onRenameView: (id: string, name: string) => void;
  onDeleteView: (id: string) => void;
  onExportViewsJson: () => void;
  onImportViewsJson: (file: File) => void;
  onOpenBuilder: () => void;
  onOpenCacheDrawer: () => void;
  onQuickSync: () => void;
}

export function HeaderBar({
  schema,
  user,
  cacheMeta,
  workerMs,
  views,
  activeViewId,
  isSyncing,
  onSelectView,
  onCreateView,
  onRenameView,
  onDeleteView,
  onExportViewsJson,
  onImportViewsJson,
  onOpenBuilder,
  onOpenCacheDrawer,
  onQuickSync,
}: HeaderBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const statusClass =
    cacheMeta.status === 'HIT' ? 'hit' : cacheMeta.status === 'STALE' ? 'stale' : 'miss';

  const commitRename = () => {
    if (editingId && draftName.trim()) {
      onRenameView(editingId, draftName.trim());
    }
    setEditingId(null);
  };

  return (
    <header className="top-header">
      <div className="header-row">
        <div className="brand-cluster">
          <img src="/icon.svg" alt="" className="brand-mark" />
          <div className="brand-title-wrap">
            <h1 className="brand-title">
              <span>{schema.name}</span>
              <span className="pipe-count-badge mono-num">
                <Database size={12} />
                {schema.cardsCount.toLocaleString('pt-BR')} cards
              </span>
            </h1>
            <div className="brand-subtitle">
              <span>PipeLens Analytics</span>
              <span>·</span>
              <span>Pipe #{schema.id}</span>
              <span>·</span>
              <span>
                {schema.phases.length} fase{schema.phases.length === 1 ? '' : 's'}
              </span>
              {workerMs !== null && (
                <>
                  <span>·</span>
                  <span className="mono-num">DuckDB {workerMs} ms</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="telemetry-pill"
            onClick={onOpenCacheDrawer}
            title="Inspecionar cache isolado por usuário"
          >
            <span className={`status-dot ${statusClass}`} />
            <span>
              Cache {cacheMeta.status} · {user.name.split(' ')[0]} ({user.id})
            </span>
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={onQuickSync}
            disabled={isSyncing}
            title="Atualizar dados do Pipefy"
          >
            <RefreshCw size={14} />
            <span>{isSyncing ? 'Sincronizando...' : 'Atualizar'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={onExportViewsJson}
            title="Exportar configuração das visões (JSON)"
          >
            <Download size={14} />
            <span>JSON</span>
          </button>

          <label className="btn btn-sm" title="Importar visões de arquivo JSON" style={{ margin: 0 }}>
            <Upload size={14} />
            <span>Importar</span>
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportViewsJson(file);
                e.target.value = '';
              }}
            />
          </label>

          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenBuilder}>
            <Plus size={15} />
            <span>Novo Gráfico</span>
          </button>
        </div>
      </div>

      <nav className="views-bar" aria-label="Visões do dashboard">
        {views.map((view) => {
          const isActive = view.id === activeViewId;
          return (
            <div key={view.id} className={`view-tab-group ${isActive ? 'active' : ''}`}>
              {editingId === view.id ? (
                <input
                  className="input"
                  style={{ width: 160, padding: '4px 8px', fontSize: 13 }}
                  value={draftName}
                  autoFocus
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="view-tab-btn"
                  onClick={() => onSelectView(view.id)}
                >
                  {view.kind === 'explorer' ? <Table2 size={14} /> : <Activity size={14} />}
                  <span>{view.name}</span>
                  {view.kind === 'charts' && (
                    <span className="mono-num" style={{ fontSize: 11, opacity: 0.65 }}>
                      ({view.widgets.length})
                    </span>
                  )}
                </button>
              )}

              {isActive && editingId !== view.id && (
                <>
                  <button
                    type="button"
                    className="view-tab-icon-btn"
                    title="Renomear visão"
                    aria-label={`Renomear visão ${view.name}`}
                    onClick={() => {
                      setEditingId(view.id);
                      setDraftName(view.name);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  {views.length > 1 && (
                    <button
                      type="button"
                      className="view-tab-icon-btn"
                      title="Excluir visão"
                      aria-label={`Excluir visão ${view.name}`}
                      onClick={() => onDeleteView(view.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-sm"
          style={{ marginInlineStart: 6, marginBlockEnd: 4 }}
          onClick={() => onCreateView('charts')}
        >
          <FilePlus2 size={13} />
          <span>+ Nova Visão</span>
        </button>
      </nav>
    </header>
  );
}
