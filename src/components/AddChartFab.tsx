'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

interface AddChartFabProps {
  viewName: string;
  onClick?: () => void;
}

/**
 * Floating Action Button placed at the bottom-right corner of the main workspace,
 * reserved for adding new charts to the active dashboard view.
 */
export function AddChartFab({ viewName, onClick }: AddChartFabProps) {
  const [noticeText, setNoticeText] = useState<string | null>(null);

  useEffect(() => {
    if (!noticeText) return;
    const timer = window.setTimeout(() => setNoticeText(null), 3500);
    return () => window.clearTimeout(timer);
  }, [noticeText]);

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    setNoticeText(`Em breve: adicionar novo gráfico em "${viewName}".`);
  };

  return (
    <div className="fixed right-6 bottom-6 z-30 flex flex-col items-end gap-2">
      {noticeText && (
        <div
          role="status"
          className="pf-toast rounded-pf-panel border border-border-subtle bg-surface px-3.5 py-2 text-xs font-medium text-ink shadow-pf-tooltip"
        >
          {noticeText}
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        aria-label={`Adicionar novo gráfico em ${viewName}`}
        title={`Adicionar novo gráfico em ${viewName}`}
        className="pf-fab flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-brand text-pf-white shadow-pf-tooltip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Plus className="pf-fab-icon h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
}
