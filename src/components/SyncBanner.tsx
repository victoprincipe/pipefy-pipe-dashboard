import { AlertTriangle, Loader2, Pause, RefreshCw } from 'lucide-react';
import type { SyncProgress } from '../types/pipefy';

interface SyncBannerProps {
  progress: SyncProgress;
  onCancel: () => void;
  onRetryPagination: () => void;
  onRetryBulk: () => void;
}

export function SyncBanner({
  progress,
  onCancel,
  onRetryPagination,
  onRetryBulk,
}: SyncBannerProps) {
  if (progress.phase === 'idle' || progress.phase === 'done') {
    return null;
  }

  const isError = progress.phase === 'error';
  const elapsedSec = (progress.elapsedMs / 1000).toFixed(1);

  return (
    <section className={`sync-banner ${isError ? 'error' : ''}`} aria-live="polite">
      <div className="sync-banner-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isError ? (
            <AlertTriangle size={18} color="#e11d48" />
          ) : (
            <Loader2 size={18} color="#1d4ed8" />
          )}
          <div>
            <strong style={{ fontSize: 13.5 }}>
              {isError ? 'Sincronização interrompida' : progress.message}
            </strong>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isError
                ? progress.error
                : `Estratégia: ${
                    progress.strategy === 'bulk_report'
                      ? 'Bulk Report Export (Pipefy Reports)'
                      : 'Paginação GraphQL por Cursor'
                  } · ${elapsedSec}s decorridos`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isError ? (
            <button type="button" className="btn btn-sm" onClick={onCancel}>
              <Pause size={13} />
              <span>Pausar</span>
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-sm btn-primary" onClick={onRetryBulk}>
                <RefreshCw size={13} />
                <span>Tentar Bulk Novamente</span>
              </button>
              <button type="button" className="btn btn-sm" onClick={onRetryPagination}>
                <span>Sync Paginado</span>
              </button>
            </>
          )}
        </div>
      </div>

      {!isError && (
        <div className="progress-track">
          <div className="progress-fill" style={{ inlineSize: `${Math.max(4, progress.percent)}%` }} />
        </div>
      )}
    </section>
  );
}
