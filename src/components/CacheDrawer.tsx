import { Database, RefreshCw, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import type { CacheSnapshotMeta, PipefyUser } from '../types/pipefy';
import { formatBytes, formatRelativeAge } from '../utils/formatters';

interface CacheDrawerProps {
  open: boolean;
  user: PipefyUser;
  pipeId: string;
  cacheMeta: CacheSnapshotMeta;
  ttlMinutes: number;
  serverCacheStatus: string | null;
  isSyncing: boolean;
  onClose: () => void;
  onChangeTtlMinutes: (minutes: number) => void;
  onIncrementalSync: () => void;
  onFullBulkSync: () => void;
  onFullPaginatedSync: () => void;
  onClearUserCache: () => void;
}

export function CacheDrawer({
  open,
  user,
  pipeId,
  cacheMeta,
  ttlMinutes,
  serverCacheStatus,
  isSyncing,
  onClose,
  onChangeTtlMinutes,
  onIncrementalSync,
  onFullBulkSync,
  onFullPaginatedSync,
  onClearUserCache,
}: CacheDrawerProps) {
  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        aria-label="Telemetria e Cache por Usuário"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} color="#0d9488" />
            <h2>Cache Isolado por Usuário</h2>
          </div>
          <button
            type="button"
            className="btn btn-icon btn-sm"
            onClick={onClose}
            aria-label="Fechar painel de cache"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-teal-soft)',
              border: '1px solid #99f6e4',
              fontSize: 12.5,
              color: '#115e59',
            }}
          >
            <strong>Particionamento estrito:</strong> todos os snapshots, visões configuradas e
            downloads no proxy usam a chave composta{' '}
            <code className="mono-num">
              user:{user.id}:pipe:{pipeId}
            </code>
            . Outro usuário acessando o mesmo app nunca lê nem invalida o seu cache.
          </div>

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Sessão Atual</h3>
            <div className="kv-grid">
              <div className="kv-box">
                <div className="kv-label">Usuário</div>
                <div className="kv-val">{user.name}</div>
              </div>
              <div className="kv-box">
                <div className="kv-label">User ID</div>
                <div className="kv-val mono-num">{user.id}</div>
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Status do Snapshot Local (IndexedDB)</h3>
            <div className="kv-grid">
              <div className="kv-box">
                <div className="kv-label">Estado</div>
                <div className="kv-val mono-num">{cacheMeta.status}</div>
              </div>
              <div className="kv-box">
                <div className="kv-label">Cards em Cache</div>
                <div className="kv-val mono-num">
                  {cacheMeta.cardsCount.toLocaleString('pt-BR')}
                </div>
              </div>
              <div className="kv-box">
                <div className="kv-label">Tamanho Estimado</div>
                <div className="kv-val mono-num">{formatBytes(cacheMeta.estimatedBytes)}</div>
              </div>
              <div className="kv-box">
                <div className="kv-label">Último Sync</div>
                <div className="kv-val">
                  {cacheMeta.syncedAt ? formatRelativeAge(cacheMeta.ageMs) : 'Nunca'}
                </div>
              </div>
              <div className="kv-box">
                <div className="kv-label">Estratégia</div>
                <div className="kv-val mono-num">{cacheMeta.strategy ?? '—'}</div>
              </div>
              <div className="kv-box">
                <div className="kv-label">Proxy Server Cache</div>
                <div className="kv-val mono-num">{serverCacheStatus ?? 'N/A'}</div>
              </div>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="cache-ttl">TTL do Cache Local (Stale-While-Revalidate)</label>
            <select
              id="cache-ttl"
              className="select"
              value={ttlMinutes}
              onChange={(e) => onChangeTtlMinutes(Number(e.target.value))}
            >
              <option value={5}>5 minutos</option>
              <option value={15}>15 minutos (padrão)</option>
              <option value={30}>30 minutos</option>
              <option value={60}>60 minutos</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSyncing}
              onClick={onIncrementalSync}
            >
              <Zap size={15} />
              <span>Atualização Incremental (Delta)</span>
            </button>

            <button
              type="button"
              className="btn"
              disabled={isSyncing}
              onClick={onFullBulkSync}
            >
              <Database size={15} />
              <span>Re-sync Completo via Bulk Report (20k)</span>
            </button>

            <button
              type="button"
              className="btn"
              disabled={isSyncing}
              onClick={onFullPaginatedSync}
            >
              <RefreshCw size={15} />
              <span>Re-sync via Paginação GraphQL (allCards)</span>
            </button>

            <button
              type="button"
              className="btn btn-danger"
              disabled={isSyncing}
              onClick={onClearUserCache}
            >
              <Trash2 size={15} />
              <span>Limpar Apenas Meu Cache (user:{user.id})</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
