import { useEffect, useState } from 'react';
import { Database, ShieldCheck, Trash2 } from 'lucide-react';
import { userCacheDb } from '../cache/userIndexedDb';
import { usePipefyApp } from '../sdk/PipefyAppContext';
import type { CacheSnapshotMeta } from '../types/pipefy';
import { formatBytes, formatRelativeAge } from '../utils/formatters';

export function SidebarPage() {
  const { ready, user, pipeId, client } = usePipefyApp();
  const [meta, setMeta] = useState<CacheSnapshotMeta | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  const refresh = async () => {
    const res = await userCacheDb.getSnapshot(user.id, pipeId);
    setMeta(res.meta);
  };

  useEffect(() => {
    if (ready) {
      refresh().catch(() => {});
    }
  }, [ready, user.id, pipeId]);

  const handleClear = async () => {
    await userCacheDb.clearUserCache(user.id, pipeId, false);
    await fetch('/api/fetch-export', {
      method: 'DELETE',
      headers: { 'X-Pipefy-User-Id': user.id },
    }).catch(() => {});
    setStatusMsg(`Cache limpo exclusivamente para user:${user.id}.`);
    client?.showNotification('Cache do seu usuário foi limpo.', 'success');
    await refresh();
  };

  return (
    <div className="sidebar-shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={18} color="#0d9488" />
        <strong style={{ fontSize: 15 }}>PipeLens · Cache por Usuário</strong>
      </div>

      <div className="kv-grid">
        <div className="kv-box">
          <div className="kv-label">Usuário</div>
          <div className="kv-val">{user.name}</div>
        </div>
        <div className="kv-box">
          <div className="kv-label">User ID</div>
          <div className="kv-val mono-num">{user.id}</div>
        </div>
        <div className="kv-box">
          <div className="kv-label">Status</div>
          <div className="kv-val mono-num">{meta?.status ?? 'MISS'}</div>
        </div>
        <div className="kv-box">
          <div className="kv-label">Cards</div>
          <div className="kv-val mono-num">
            {(meta?.cardsCount ?? 0).toLocaleString('pt-BR')}
          </div>
        </div>
        <div className="kv-box">
          <div className="kv-label">Tamanho ({meta?.storageFormat === 'json' ? 'JSON' : 'Parquet'})</div>
          <div className="kv-val mono-num">{formatBytes(meta?.estimatedBytes ?? 0)}</div>
        </div>
        <div className="kv-box">
          <div className="kv-label">Atualizado</div>
          <div className="kv-val">
            {meta?.syncedAt ? formatRelativeAge(meta.ageMs) : 'Nunca'}
          </div>
        </div>
      </div>

      {statusMsg && (
        <div style={{ fontSize: 12, color: 'var(--accent-teal)' }}>{statusMsg}</div>
      )}

      <button type="button" className="btn" onClick={refresh}>
        <Database size={14} />
        <span>Atualizar Telemetria</span>
      </button>

      <button type="button" className="btn btn-danger" onClick={handleClear}>
        <Trash2 size={14} />
        <span>Limpar Apenas Meu Cache</span>
      </button>
    </div>
  );
}
