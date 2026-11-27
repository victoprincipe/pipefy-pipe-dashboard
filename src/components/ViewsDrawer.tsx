'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { PipefyViewsVisibility } from '@/lib/pipefyAppStorage';
import type { CachedUserDatasetSummary } from '@/lib/pipefyIndexedDb';
import type { DashboardView } from '@/types/dashboardViews';
import type { PipefyUserInfo } from '@/types/pipefySql';

interface ViewsDrawerProps {
  views: DashboardView[];
  activeViewId: string;
  desktopOpen: boolean;
  mobileOpen: boolean;
  isConnectedToPipefyStorage?: boolean;
  storageVisibility?: PipefyViewsVisibility | null;
  isSyncingStorage?: boolean;
  storageError?: string | null;
  isInsidePipefy?: boolean;
  activeUser?: PipefyUserInfo | null;
  pipeUsers?: PipefyUserInfo[];
  cachedUsersSummary?: Record<string, CachedUserDatasetSummary>;
  isUserSwitchingDisabled?: boolean;
  onOpenDesktop: () => void;
  onOpenMobile: () => void;
  onCloseDesktop: () => void;
  onCloseMobile: () => void;
  onSelectView: (id: string) => void;
  onCreateView: (name?: string) => void;
  onDeleteView: (id: string) => void;
  onSwitchUser?: (userId: string) => void | Promise<void>;
}

interface DrawerContentProps {
  views: DashboardView[];
  activeViewId: string;
  isMobile: boolean;
  isConnectedToPipefyStorage?: boolean;
  storageVisibility?: PipefyViewsVisibility | null;
  isSyncingStorage?: boolean;
  storageError?: string | null;
  isInsidePipefy?: boolean;
  activeUser?: PipefyUserInfo | null;
  pipeUsers?: PipefyUserInfo[];
  cachedUsersSummary?: Record<string, CachedUserDatasetSummary>;
  isUserSwitchingDisabled?: boolean;
  onClose: () => void;
  onSelectView: (id: string) => void;
  onCreateView: (name?: string) => void;
  onDeleteView: (id: string) => void;
  onSwitchUser?: (userId: string) => void | Promise<void>;
}

interface CollapsedRailProps {
  views: DashboardView[];
  activeViewId: string;
  className: string;
  isInsidePipefy?: boolean;
  activeUser?: PipefyUserInfo | null;
  onOpen: () => void;
  onSelectView: (id: string) => void;
}

function formatChartsCount(count: number): string {
  if (count === 0) return '0 gráficos';
  if (count === 1) return '1 gráfico';
  return `${count} gráficos`;
}

function getViewInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'V';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function CollapsedRail({
  views,
  activeViewId,
  className,
  isInsidePipefy,
  activeUser,
  onOpen,
  onSelectView,
}: CollapsedRailProps) {
  return (
    <aside
      aria-label="Visões recolhidas"
      className={`${className} pf-fade-in h-full w-16 shrink-0 flex-col border-r border-border-subtle bg-surface`}
    >
      <div className="flex justify-center border-b border-border-subtle py-4">
        <button
          type="button"
          onClick={onOpen}
          aria-label="Abrir drawer de visões"
          title="Abrir drawer de visões"
          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-pf-control border border-border-subtle bg-canvas text-ink-secondary transition hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <nav
        aria-label="Atalhos das visões"
        className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-2 py-3"
      >
        {views.map((view) => {
          const isActive = view.id === activeViewId;
          const initials = getViewInitials(view.name);
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onSelectView(view.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Selecionar visão ${view.name}`}
              title={`${view.name} (${formatChartsCount(view.charts.length)})`}
              className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-pf-panel text-xs font-bold tracking-wide transition ${
                isActive
                  ? 'bg-brand text-pf-white shadow-sm ring-2 ring-brand/25'
                  : 'border border-border-subtle bg-canvas text-ink hover:border-brand/40 hover:bg-brand-soft hover:text-brand'
              }`}
            >
              {initials}
            </button>
          );
        })}
      </nav>

      {isInsidePipefy && activeUser && (
        <div className="flex justify-center border-t border-border-subtle py-3">
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Usuário Pipefy: ${activeUser.name} — abrir menu`}
            title={`Usuário Pipefy: ${activeUser.name} — abrir menu`}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border-subtle bg-brand-soft text-xs font-bold text-brand transition hover:border-brand/40"
          >
            {getViewInitials(activeUser.name)}
          </button>
        </div>
      )}
    </aside>
  );
}

function DrawerContent({
  views,
  activeViewId,
  isMobile,
  isConnectedToPipefyStorage,
  storageVisibility,
  isSyncingStorage,
  storageError,
  isInsidePipefy,
  activeUser,
  pipeUsers,
  cachedUsersSummary,
  isUserSwitchingDisabled,
  onClose,
  onSelectView,
  onCreateView,
  onDeleteView,
  onSwitchUser,
}: DrawerContentProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateView(draftName);
    setDraftName('');
    setCreating(false);
    if (isMobile) {
      onClose();
    }
  };

  const handleCancel = () => {
    setDraftName('');
    setCreating(false);
  };

  const activeUserSummary = activeUser
    ? cachedUsersSummary?.[activeUser.id]
    : undefined;

  return (
    <div className="flex h-full w-full flex-col bg-surface text-ink">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-4">
        <div>
          <span className="block text-pf-overline uppercase text-ink-secondary">
            PipeLens
          </span>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="text-pf-h5 text-ink">Visões</h2>
            <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
              {views.length}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={isMobile ? 'Fechar menu de visões' : 'Recolher painel de visões'}
          title={isMobile ? 'Fechar menu de visões' : 'Recolher painel de visões'}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pf-control text-ink-secondary transition hover:bg-canvas hover:text-ink"
        >
          {isMobile ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="border-b border-border-subtle p-3">
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="pf-press inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-pf-control bg-brand px-3.5 py-2.5 text-xs font-semibold text-pf-white shadow-sm transition hover:bg-brand-shade"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Nova visão</span>
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="pf-pop-in flex flex-col gap-2">
            <label htmlFor="new-view-name" className="text-pf-caption text-ink-secondary">
              Nome da nova visão
            </label>
            <input
              id="new-view-name"
              type="text"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  handleCancel();
                }
              }}
              placeholder={`Ex: Comercial (ou Visão ${views.length + 1})`}
              className="w-full rounded-pf-control border border-border-strong bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-icon focus:border-brand focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="pf-press inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-pf-control bg-brand px-3 py-1.5 text-xs font-semibold text-pf-white transition hover:bg-brand-shade"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Criar</span>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="pf-press inline-flex cursor-pointer items-center justify-center rounded-pf-control border border-border-subtle bg-canvas px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-border-strong hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      <nav
        aria-label="Lista de visões"
        className="flex-1 space-y-1 overflow-y-auto p-3"
      >
        {views.map((view, index) => {
          const isActive = view.id === activeViewId;
          return (
            <div
              key={view.id}
              className={`pf-list-in group flex items-center gap-1.5 rounded-pf-panel border px-2 py-1.5 transition ${
                isActive
                  ? 'border-brand/25 bg-brand-soft text-brand'
                  : 'border-transparent bg-transparent text-ink hover:bg-canvas'
              }`}
              style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}
            >
              <button
                type="button"
                onClick={() => {
                  onSelectView(view.id);
                  if (isMobile) onClose();
                }}
                aria-current={isActive ? 'page' : undefined}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-1 py-1 text-left"
              >
                <LayoutDashboard
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-brand' : 'text-ink-icon group-hover:text-ink-secondary'
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-xs font-semibold ${
                      isActive ? 'text-brand' : 'text-ink'
                    }`}
                  >
                    {view.name}
                  </p>
                  <p className="text-[11px] text-ink-secondary">
                    {formatChartsCount(view.charts.length)}
                  </p>
                </div>
              </button>

              {views.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteView(view.id)}
                  aria-label={`Remover visão ${view.name}`}
                  title={`Remover visão ${view.name}`}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-pf-control text-ink-icon opacity-70 transition hover:bg-pf-red-100 hover:text-pf-red hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </nav>

      {isInsidePipefy && activeUser && (
        <div className="border-t border-border-subtle px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-pf-overline uppercase text-ink-secondary">
              <User className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              <span>Usuário Pipefy</span>
            </span>
          </div>

          {pipeUsers && pipeUsers.length > 1 && onSwitchUser ? (
            <select
              aria-label="Usuário do Pipefy"
              disabled={isUserSwitchingDisabled}
              value={activeUser.id}
              onChange={(e) => void onSwitchUser(e.target.value)}
              className="w-full rounded-pf-control border border-border-subtle bg-canvas px-2.5 py-2 text-xs font-medium text-ink focus:border-brand focus:outline-none disabled:opacity-50"
            >
              {pipeUsers.map((u) => {
                const summary = cachedUsersSummary?.[u.id];
                return (
                  <option key={u.id} value={u.id}>
                    {u.name} (
                    {summary
                      ? `${summary.rowsCount.toLocaleString('pt-BR')} linhas`
                      : 'sem cache'}
                    )
                  </option>
                );
              })}
            </select>
          ) : (
            <div className="rounded-pf-control border border-border-subtle bg-canvas px-2.5 py-2">
              <p className="truncate text-xs font-semibold text-ink">
                {activeUser.name}
              </p>
              <p className="truncate text-[11px] text-ink-secondary">
                {activeUser.email || `ID ${activeUser.id}`} ·{' '}
                {activeUserSummary
                  ? `${activeUserSummary.rowsCount.toLocaleString('pt-BR')} linhas`
                  : 'sem cache'}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border-subtle px-4 py-3">
        <p
          className={`text-[11px] ${
            storageError ? 'text-pf-red' : 'text-ink-secondary'
          }`}
        >
          {storageError
            ? `Erro no Pipefy Storage: ${storageError}`
            : isSyncingStorage
              ? 'Salvando no Pipefy Storage...'
              : isConnectedToPipefyStorage
                ? `Salvo no Pipefy Storage (${storageVisibility === 'private' ? 'privado' : 'pipe'}).`
                : 'Prévia local · salva no Pipefy SDK dentro de um Pipe.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Left navigation drawer for creating, switching, and removing dashboard views,
 * plus switching between authenticated Pipefy Pipe members inside Pipefy.
 */
export function ViewsDrawer({
  views,
  activeViewId,
  desktopOpen,
  mobileOpen,
  isConnectedToPipefyStorage,
  storageVisibility,
  isSyncingStorage,
  storageError,
  isInsidePipefy,
  activeUser,
  pipeUsers,
  cachedUsersSummary,
  isUserSwitchingDisabled,
  onOpenDesktop,
  onOpenMobile,
  onCloseDesktop,
  onCloseMobile,
  onSelectView,
  onCreateView,
  onDeleteView,
  onSwitchUser,
}: ViewsDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (mobileOpen && !dialog.open) {
      dialog.showModal();
    } else if (!mobileOpen && dialog.open) {
      dialog.close();
    }
  }, [mobileOpen]);

  return (
    <>
      {desktopOpen ? (
        <aside
          aria-label="Navegação de visões"
          className="hidden h-full w-72 shrink-0 border-r border-border-subtle bg-surface lg:flex pf-panel-in"
        >
          <DrawerContent
            views={views}
            activeViewId={activeViewId}
            isMobile={false}
            isConnectedToPipefyStorage={isConnectedToPipefyStorage}
            storageVisibility={storageVisibility}
            isSyncingStorage={isSyncingStorage}
            storageError={storageError}
            isInsidePipefy={isInsidePipefy}
            activeUser={activeUser}
            pipeUsers={pipeUsers}
            cachedUsersSummary={cachedUsersSummary}
            isUserSwitchingDisabled={isUserSwitchingDisabled}
            onClose={onCloseDesktop}
            onSelectView={onSelectView}
            onCreateView={onCreateView}
            onDeleteView={onDeleteView}
            onSwitchUser={onSwitchUser}
          />
        </aside>
      ) : (
        <CollapsedRail
          views={views}
          activeViewId={activeViewId}
          className="hidden lg:flex"
          isInsidePipefy={isInsidePipefy}
          activeUser={activeUser}
          onOpen={onOpenDesktop}
          onSelectView={onSelectView}
        />
      )}

      <CollapsedRail
        views={views}
        activeViewId={activeViewId}
        className="flex lg:hidden"
        isInsidePipefy={isInsidePipefy}
        activeUser={activeUser}
        onOpen={onOpenMobile}
        onSelectView={onSelectView}
      />

      <dialog
        ref={dialogRef}
        aria-label="Visões do dashboard"
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            onCloseMobile();
          }
        }}
        onCancel={(e) => {
          e.preventDefault();
          onCloseMobile();
        }}
        className="pf-drawer-dialog lg:hidden"
      >
        <div className="pf-drawer-panel h-full w-72 max-w-[82vw] border-r border-border-subtle bg-surface shadow-pf-card">
          <DrawerContent
            views={views}
            activeViewId={activeViewId}
            isMobile={true}
            isConnectedToPipefyStorage={isConnectedToPipefyStorage}
            storageVisibility={storageVisibility}
            isSyncingStorage={isSyncingStorage}
            storageError={storageError}
            isInsidePipefy={isInsidePipefy}
            activeUser={activeUser}
            pipeUsers={pipeUsers}
            cachedUsersSummary={cachedUsersSummary}
            isUserSwitchingDisabled={isUserSwitchingDisabled}
            onClose={onCloseMobile}
            onSelectView={onSelectView}
            onCreateView={onCreateView}
            onDeleteView={onDeleteView}
            onSwitchUser={onSwitchUser}
          />
        </div>
      </dialog>
    </>
  );
}
