import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { CacheDrawer } from '../components/CacheDrawer';
import { CardExplorerTable } from '../components/CardExplorerTable';
import { DashboardGrid } from '../components/DashboardGrid';
import { FilterBar } from '../components/FilterBar';
import { HeaderBar } from '../components/HeaderBar';
import { SyncBanner } from '../components/SyncBanner';
import { WidgetBuilderDialog } from '../components/WidgetBuilderDialog';
import { DEFAULT_CACHE_TTL_MS, userCacheDb } from '../cache/userIndexedDb';
import { DEMO_USERS, usePipefyApp } from '../sdk/PipefyAppContext';
import {
  fetchAndPatchSingleCard,
  syncIncrementalDelta,
  syncPipeHybrid,
} from '../sdk/pipefySync';
import type {
  AggregatedPoint,
  DashboardView,
  ExplorerQuery,
  ExplorerResult,
  FilterRule,
  WidgetComputationResult,
  WidgetConfig,
} from '../types/dashboard';
import type {
  CacheSnapshotMeta,
  NormalizedCard,
  PipeSchema,
  SyncProgress,
} from '../types/pipefy';
import { buildDefaultViewsForSchema } from '../utils/defaultViews';
import { DEMO_PIPE_SCHEMA, generateDemoDataset } from '../utils/demoDataset';
import { exportCardsCsv } from '../utils/formatters';
import { AnalyticsWorkerClient } from '../workers/workerClient';

const IDLE_PROGRESS: SyncProgress = {
  phase: 'idle',
  strategy: 'bulk_report',
  loaded: 0,
  total: 0,
  percent: 0,
  message: '',
  startedAt: 0,
  elapsedMs: 0,
};

function createLoadingSchema(pipeId: string): PipeSchema {
  return {
    ...DEMO_PIPE_SCHEMA,
    id: pipeId,
    name: `Pipe #${pipeId} · Carregando...`,
    cardsCount: 0,
    openedCardsCount: 0,
  };
}

export function PipeViewPage() {
  const {
    ready,
    userResolved,
    isInsidePipefy,
    pipefyApp,
    client,
    user,
    pipeId,
    switchDemoUser,
  } = usePipefyApp();

  const workerRef = useRef<AnalyticsWorkerClient | null>(null);
  if (!workerRef.current) {
    workerRef.current = new AnalyticsWorkerClient();
  }
  const syncAbortRef = useRef<AbortController | null>(null);
  const renderedRef = useRef(false);

  const [schema, setSchema] = useState<PipeSchema>(() =>
    typeof window !== 'undefined' && window.location.search.includes('appID=')
      ? createLoadingSchema('307435909')
      : DEMO_PIPE_SCHEMA
  );
  const [views, setViews] = useState<DashboardView[]>(() =>
    buildDefaultViewsForSchema(DEMO_PIPE_SCHEMA)
  );
  const [activeViewId, setActiveViewId] = useState<string>('view-executive');
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [ttlMinutes, setTtlMinutes] = useState<number>(15);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(IDLE_PROGRESS);
  const [serverCacheStatus, setServerCacheStatus] = useState<string | null>(null);
  const [cacheMeta, setCacheMeta] = useState<CacheSnapshotMeta>({
    userId: user.id,
    pipeId,
    status: 'MISS',
    syncedAt: null,
    ttlMs: DEFAULT_CACHE_TTL_MS,
    ageMs: 0,
    strategy: null,
    cardsCount: 0,
    totalCardsInPipe: 0,
    estimatedBytes: 0,
    complete: false,
  });

  const [resultsMap, setResultsMap] = useState<Record<string, WidgetComputationResult>>({});
  const [matchedCount, setMatchedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [workerMs, setWorkerMs] = useState<number | null>(null);
  const [explorerQuery, setExplorerQuery] = useState<ExplorerQuery>({
    page: 1,
    pageSize: 50,
    sortBy: '__id',
    sortDir: 'desc',
  });
  const [explorerResult, setExplorerResult] = useState<ExplorerResult | null>(null);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);
  const [cacheDrawerOpen, setCacheDrawerOpen] = useState(false);

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? views[0],
    [views, activeViewId]
  );

  // Required by Pipefy Apps SDK: call PipefyApp.render() right after PipefyApp.init() (client != null)
  useEffect(() => {
    if (!ready || !isInsidePipefy || !pipefyApp || !client || renderedRef.current) return;
    renderedRef.current = true;
    try {
      pipefyApp.render(() => {});
    } catch (err) {
      console.error('[PipeLens] PipefyApp.render() error:', err);
    }
  }, [ready, isInsidePipefy, pipefyApp, client]);

  // Debounce global search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(globalSearch), 140);
    return () => clearTimeout(t);
  }, [globalSearch]);

  // Persist user views into per-user IndexedDB (+ Pipefy private scope when small enough)
  const persistViews = useCallback(
    async (nextViews: DashboardView[], nextActiveId: string) => {
      try {
        await userCacheDb.saveViews({
          userId: user.id,
          pipeId,
          activeViewId: nextActiveId,
          views: nextViews,
        });
        if (isInsidePipefy && client) {
          const payload = JSON.stringify({ activeViewId: nextActiveId, views: nextViews });
          if (payload.length < 28_000) {
            client.set('pipe', 'private', 'pipelens_views_v1', payload).catch(() => {});
          }
        }
      } catch {
        // ignore persistence error
      }
    },
    [user.id, pipeId, isInsidePipefy, client]
  );

  const loadCardsIntoWorker = useCallback(
    async (cards: NormalizedCard[], nextSchema: PipeSchema) => {
      setSchema(nextSchema);
      setTotalCount(cards.length);
      await workerRef.current!.setDataset(cards, nextSchema);
    },
    []
  );

  const startSync = useCallback(
    async (preferStrategy: 'auto' | 'bulk_report' | 'cursor_pagination' = 'auto') => {
      syncAbortRef.current?.abort();
      const abort = new AbortController();
      syncAbortRef.current = abort;

      if (!isInsidePipefy || !client) {
        // Standalone Preview: generate deterministic 20,000-card dataset and persist to user's IndexedDB
        const t0 = Date.now();
        setSyncProgress({
          phase: 'parsing',
          strategy: 'demo_seed',
          loaded: 0,
          total: 20000,
          percent: 35,
          message: 'Gerando 20.000 cards demonstrativos para o cache deste usuário...',
          startedAt: t0,
          elapsedMs: 0,
        });
        const demo = generateDemoDataset(20000);
        await userCacheDb.saveSnapshot({
          userId: user.id,
          pipeId,
          cards: demo.cards,
          pipeSchema: demo.schema,
          strategy: 'demo_seed',
          totalCardsInPipe: demo.cards.length,
          ttlMs: ttlMinutes * 60_000,
          complete: true,
        });
        await loadCardsIntoWorker(demo.cards, demo.schema);
        const refreshed = await userCacheDb.getSnapshot(user.id, pipeId, ttlMinutes * 60_000);
        setCacheMeta(refreshed.meta);
        setSyncProgress(IDLE_PROGRESS);
        return;
      }

      try {
        const res = await syncPipeHybrid({
          client,
          userId: user.id,
          pipeId,
          worker: workerRef.current!,
          preferStrategy,
          ttlMs: ttlMinutes * 60_000,
          signal: abort.signal,
          callbacks: {
            onProgress: setSyncProgress,
            onSchema: (s) => setSchema(s),
            onPartialCards: (partial, s) => {
              loadCardsIntoWorker(partial, s).catch(() => {});
            },
          },
        });
        if (res.serverCacheStatus) {
          setServerCacheStatus(res.serverCacheStatus);
        }
        const savedViews = await userCacheDb.getViews(user.id, pipeId);
        if (!savedViews || savedViews.views.length === 0) {
          const nextDefaults = buildDefaultViewsForSchema(res.schema);
          setViews(nextDefaults);
          setActiveViewId(nextDefaults[0].id);
        }
        await loadCardsIntoWorker(res.cards, res.schema);
        const refreshed = await userCacheDb.getSnapshot(user.id, pipeId, ttlMinutes * 60_000);
        setCacheMeta(refreshed.meta);
        setSyncProgress(IDLE_PROGRESS);
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setSyncProgress(IDLE_PROGRESS);
          return;
        }
        setSyncProgress((prev) => ({
          ...prev,
          phase: 'error',
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [isInsidePipefy, client, user.id, pipeId, ttlMinutes, loadCardsIntoWorker]
  );

  // Initial load per (user.id, pipeId): check user's IndexedDB cache FIRST!
  useEffect(() => {
    if (!ready || !userResolved) return;
    let active = true;

    async function hydrateForUser() {
      const ttlMs = ttlMinutes * 60_000;
      const [snapshotLookup, savedViews] = await Promise.all([
        userCacheDb.getSnapshot(user.id, pipeId, ttlMs),
        userCacheDb.getViews(user.id, pipeId),
      ]);

      if (!active) return;
      setCacheMeta(snapshotLookup.meta);

      if (snapshotLookup.record) {
        const activeSchema = snapshotLookup.record.pipeSchema;
        await loadCardsIntoWorker(snapshotLookup.record.cards, activeSchema);

        if (savedViews && savedViews.views.length > 0) {
          setViews(savedViews.views);
          setActiveViewId(savedViews.activeViewId);
        } else {
          const defaults = buildDefaultViewsForSchema(activeSchema);
          setViews(defaults);
          setActiveViewId(defaults[0].id);
        }

        // If stale inside Pipefy, run lightweight incremental check
        if (snapshotLookup.meta.status === 'STALE' && isInsidePipefy && client) {
          syncIncrementalDelta({
            client,
            userId: user.id,
            pipeId,
            existingCount: snapshotLookup.record.cards.length,
          })
            .then(async (delta) => {
              if (!active) return;
              if (delta.mode === 'delta_tail') {
                const updated = await userCacheDb.getSnapshot(user.id, pipeId, ttlMs);
                if (updated.record) {
                  setCacheMeta(updated.meta);
                  await loadCardsIntoWorker(updated.record.cards, updated.record.pipeSchema);
                }
              }
            })
            .catch(() => {});
        }
        return;
      }

      // Cache MISS for this user -> restore saved views if any, then sync
      if (savedViews && savedViews.views.length > 0) {
        setViews(savedViews.views);
        setActiveViewId(savedViews.activeViewId);
      } else {
        const defaults = buildDefaultViewsForSchema(DEMO_PIPE_SCHEMA);
        setViews(defaults);
        setActiveViewId(defaults[0].id);
      }

      await startSync('auto');
    }

    hydrateForUser();
    return () => {
      active = false;
    };
  }, [ready, userResolved, user.id, pipeId]);

  // Listen to Pipefy live pipe events (onCardCreated, onCardDeleted, onCardUpdated)
  useEffect(() => {
    if (!ready || !isInsidePipefy || !pipefyApp?.registerListener || !client) return;
    try {
      pipefyApp.registerListener('onCardCreated', async (payload: any) => {
        if (!payload?.internalId && !payload?.id) return;
        const cardId = String(payload.internalId ?? payload.id);
        await fetchAndPatchSingleCard({ client, userId: user.id, pipeId, cardId, schema });
        const snap = await userCacheDb.getSnapshot(user.id, pipeId, ttlMinutes * 60_000);
        if (snap.record) {
          setCacheMeta(snap.meta);
          await loadCardsIntoWorker(snap.record.cards, snap.record.pipeSchema);
        }
      });
      pipefyApp.registerListener('onCardDeleted', async (payload: any) => {
        const cardId = String(payload?.internalId ?? payload?.id ?? '');
        if (!cardId) return;
        await userCacheDb.patchCards({ userId: user.id, pipeId, deletedIds: [cardId] });
        const snap = await userCacheDb.getSnapshot(user.id, pipeId, ttlMinutes * 60_000);
        if (snap.record) {
          setCacheMeta(snap.meta);
          await loadCardsIntoWorker(snap.record.cards, snap.record.pipeSchema);
        }
      });
    } catch {
      // registerListener throws outside pipe-view
    }
  }, [ready, isInsidePipefy, pipefyApp, client, user.id, pipeId, schema, ttlMinutes, loadCardsIntoWorker]);

  // Recompute active view widgets / explorer inside Web Worker
  useEffect(() => {
    if (!activeView || totalCount === 0) return;
    let active = true;

    workerRef.current!.computeDashboard({
      globalSearch: debouncedSearch,
      filters: activeView.filters,
      widgets: activeView.kind === 'charts' ? activeView.widgets : [],
      explorer: activeView.kind === 'explorer' ? explorerQuery : undefined,
    })
      .then((res) => {
        if (!active) return;
        setMatchedCount(res.matchedCards);
        setTotalCount(res.totalCards);
        setWorkerMs(res.totalMs);
        const map: Record<string, WidgetComputationResult> = {};
        for (const r of res.results) {
          map[r.widgetId] = r;
        }
        setResultsMap(map);
        if (res.explorer) {
          setExplorerResult(res.explorer);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [activeView, debouncedSearch, totalCount, explorerQuery, cacheMeta.syncedAt]);

  const updateActiveView = (updater: (view: DashboardView) => DashboardView) => {
    const next = views.map((v) =>
      v.id === activeView.id ? { ...updater(v), updatedAt: Date.now() } : v
    );
    setViews(next);
    persistViews(next, activeViewId);
  };

  const handleSaveWidget = (widget: WidgetConfig) => {
    updateActiveView((v) => {
      const exists = v.widgets.some((w) => w.id === widget.id);
      return {
        ...v,
        kind: 'charts',
        widgets: exists
          ? v.widgets.map((w) => (w.id === widget.id ? widget : w))
          : [...v.widgets, widget],
      };
    });
    setBuilderOpen(false);
    setEditingWidget(null);
  };

  const handleDuplicateWidget = (widget: WidgetConfig) => {
    const copy: WidgetConfig = {
      ...widget,
      id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${widget.title} (Cópia)`,
    };
    updateActiveView((v) => ({ ...v, widgets: [...v.widgets, copy] }));
  };

  const handleMoveWidget = (index: number, delta: -1 | 1) => {
    updateActiveView((v) => {
      const next = [...v.widgets];
      const target = index + delta;
      if (target < 0 || target >= next.length) return v;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...v, widgets: next };
    });
  };

  const handleCrossFilter = (widget: WidgetConfig, point: AggregatedPoint) => {
    if (widget.chartType === 'kpi') return;
    const fieldMeta = schema.fields.find((f) => f.key === widget.dimensionKey);
    const isDate = fieldMeta?.kind === 'date';
    const isNum = fieldMeta?.kind === 'number';
    if (isNum) return; // histogram bucket keys are ranges

    const existing = activeView.filters.find(
      (f) =>
        f.source === 'cross_filter' &&
        f.fieldKey === widget.dimensionKey &&
        f.value === point.key
    );

    if (existing) {
      updateActiveView((v) => ({
        ...v,
        filters: v.filters.filter((f) => f.id !== existing.id),
      }));
      return;
    }

    const rule: FilterRule = {
      id: `xf-${Date.now()}`,
      fieldKey: widget.dimensionKey,
      operator: isDate ? 'contains' : 'equals',
      value: point.key,
      source: 'cross_filter',
    };

    updateActiveView((v) => ({
      ...v,
      filters: [
        ...v.filters.filter((f) => !(f.source === 'cross_filter' && f.fieldKey === widget.dimensionKey)),
        rule,
      ],
    }));
  };

  const handleCreateView = (kind: 'charts' | 'explorer') => {
    const id = `view-${Date.now()}`;
    const newView: DashboardView = {
      id,
      name: `Nova Visão ${views.length + 1}`,
      kind,
      widgets: [],
      filters: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [...views, newView];
    setViews(next);
    setActiveViewId(id);
    persistViews(next, id);
  };

  const handleRenameView = (id: string, name: string) => {
    const next = views.map((v) => (v.id === id ? { ...v, name, updatedAt: Date.now() } : v));
    setViews(next);
    persistViews(next, activeViewId);
  };

  const handleDeleteView = (id: string) => {
    if (views.length <= 1) return;
    const next = views.filter((v) => v.id !== id);
    const nextActive = id === activeViewId ? next[0].id : activeViewId;
    setViews(next);
    setActiveViewId(nextActive);
    persistViews(next, nextActive);
  };

  const handleExportViewsJson = () => {
    const blob = new Blob([JSON.stringify({ pipeId, userId: user.id, views }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipelens-views-pipe-${pipeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportViewsJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (Array.isArray(parsed?.views) && parsed.views.length > 0) {
        setViews(parsed.views);
        setActiveViewId(parsed.views[0].id);
        persistViews(parsed.views, parsed.views[0].id);
      }
    } catch {
      // ignore invalid JSON
    }
  };

  const handleIncrementalSync = async () => {
    if (!isInsidePipefy || !client) {
      await startSync('auto');
      return;
    }
    const snap = await userCacheDb.getSnapshot(user.id, pipeId, ttlMinutes * 60_000);
    if (!snap.record) {
      await startSync('auto');
      return;
    }
    const t0 = Date.now();
    setSyncProgress({
      phase: 'meta',
      strategy: 'incremental',
      loaded: snap.record.cards.length,
      total: snap.record.cards.length,
      percent: 50,
      message: 'Verificando atualizações incrementais no Pipe...',
      startedAt: t0,
      elapsedMs: 0,
    });
    try {
      const delta = await syncIncrementalDelta({
        client,
        userId: user.id,
        pipeId,
        existingCount: snap.record.cards.length,
      });
      if (delta.mode === 'needs_full_resync') {
        await startSync('bulk_report');
        return;
      }
      const nextSnap = await userCacheDb.getSnapshot(user.id, pipeId, ttlMinutes * 60_000);
      if (nextSnap.record) {
        setCacheMeta(nextSnap.meta);
        await loadCardsIntoWorker(nextSnap.record.cards, nextSnap.record.pipeSchema);
      }
      setSyncProgress(IDLE_PROGRESS);
    } catch {
      await startSync('auto');
    }
  };

  const handleClearUserCache = async () => {
    await userCacheDb.clearUserCache(user.id, pipeId, false);
    await fetch('/api/fetch-export', {
      method: 'DELETE',
      headers: { 'X-Pipefy-User-Id': user.id },
    }).catch(() => {});
    setServerCacheStatus(null);
    setCacheDrawerOpen(false);
    await startSync('auto');
  };

  const isSyncing = syncProgress.phase !== 'idle' && syncProgress.phase !== 'done' && syncProgress.phase !== 'error';

  return (
    <div className="app-shell">
      <HeaderBar
        schema={schema}
        user={user}
        cacheMeta={cacheMeta}
        workerMs={workerMs}
        views={views}
        activeViewId={activeView.id}
        isSyncing={isSyncing}
        onSelectView={setActiveViewId}
        onCreateView={handleCreateView}
        onRenameView={handleRenameView}
        onDeleteView={handleDeleteView}
        onExportViewsJson={handleExportViewsJson}
        onImportViewsJson={handleImportViewsJson}
        onOpenBuilder={() => {
          setEditingWidget(null);
          setBuilderOpen(true);
        }}
        onOpenCacheDrawer={() => setCacheDrawerOpen(true)}
        onQuickSync={handleIncrementalSync}
      />

      <main className="main-workspace">
        {!isInsidePipefy && (
          <div className="standalone-banner" role="region" aria-label="Modo prévia standalone">
            <div>
              <strong>Modo Prévia Standalone</strong> — Aberto fora do iframe do Pipefy. Os
              20.000 cards demonstrativos reproduzem o schema real do Pipe{' '}
              <code className="mono-num">307435909</code>. Alterne o usuário abaixo para testar o
              isolamento de cache por usuário:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCheck size={15} />
              <select
                className="select"
                style={{ width: 250, padding: '4px 8px' }}
                aria-label="Selecionar usuário simulado"
                value={user.id}
                onChange={(e) => switchDemoUser(e.target.value)}
              >
                {DEMO_USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.id})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <SyncBanner
          progress={syncProgress}
          onCancel={() => syncAbortRef.current?.abort()}
          onRetryBulk={() => startSync('bulk_report')}
          onRetryPagination={() => startSync('cursor_pagination')}
        />

        <FilterBar
          schema={schema}
          globalSearch={globalSearch}
          filters={activeView.filters}
          matchedCount={matchedCount}
          totalCount={totalCount}
          workerMs={workerMs}
          onGlobalSearchChange={setGlobalSearch}
          onAddFilter={(rule) =>
            updateActiveView((v) => ({ ...v, filters: [...v.filters, rule] }))
          }
          onRemoveFilter={(id) =>
            updateActiveView((v) => ({
              ...v,
              filters: v.filters.filter((f) => f.id !== id),
            }))
          }
          onClearAllFilters={() => {
            setGlobalSearch('');
            updateActiveView((v) => ({ ...v, filters: [] }));
          }}
          onRequestSuggestions={async (fieldKey) => {
            const res = await workerRef.current!.getSuggestions(fieldKey, 25);
            return res.values;
          }}
        />

        {activeView.kind === 'explorer' ? (
          <CardExplorerTable
            schema={schema}
            explorer={explorerResult}
            query={explorerQuery}
            canOpenCard={Boolean(isInsidePipefy && client)}
            onQueryChange={setExplorerQuery}
            onOpenCard={(cardId) => {
              if (isInsidePipefy && client) {
                client.openCard(cardId);
              } else {
                window.open(`https://app.pipefy.com/open-cards/${cardId}`, '_blank', 'noopener');
              }
            }}
            onExportFilteredCsv={async () => {
              const res = await workerRef.current!.getFilteredCards(
                debouncedSearch,
                activeView.filters
              );
              exportCardsCsv(`pipe-${pipeId}-cards-filtrados.csv`, res.cards, schema);
            }}
          />
        ) : (
          <DashboardGrid
            widgets={activeView.widgets}
            resultsMap={resultsMap}
            onEdit={(w) => {
              setEditingWidget(w);
              setBuilderOpen(true);
            }}
            onDuplicate={handleDuplicateWidget}
            onRemove={(widgetId) =>
              updateActiveView((v) => ({
                ...v,
                widgets: v.widgets.filter((w) => w.id !== widgetId),
              }))
            }
            onMove={handleMoveWidget}
            onCrossFilter={handleCrossFilter}
            onOpenBuilder={() => {
              setEditingWidget(null);
              setBuilderOpen(true);
            }}
          />
        )}
      </main>

      <WidgetBuilderDialog
        open={builderOpen}
        schema={schema}
        initialWidget={editingWidget}
        onClose={() => {
          setBuilderOpen(false);
          setEditingWidget(null);
        }}
        onSave={handleSaveWidget}
        onPreviewCompute={(w) =>
          workerRef.current!.computeWidget({
            globalSearch: debouncedSearch,
            filters: activeView.filters,
            widget: w,
          })
        }
      />

      <CacheDrawer
        open={cacheDrawerOpen}
        user={user}
        pipeId={pipeId}
        cacheMeta={cacheMeta}
        ttlMinutes={ttlMinutes}
        serverCacheStatus={serverCacheStatus}
        isSyncing={isSyncing}
        onClose={() => setCacheDrawerOpen(false)}
        onChangeTtlMinutes={(m) => setTtlMinutes(m)}
        onIncrementalSync={() => {
          setCacheDrawerOpen(false);
          handleIncrementalSync();
        }}
        onFullBulkSync={() => {
          setCacheDrawerOpen(false);
          startSync('bulk_report');
        }}
        onFullPaginatedSync={() => {
          setCacheDrawerOpen(false);
          startSync('cursor_pagination');
        }}
        onClearUserCache={handleClearUserCache}
      />
    </div>
  );
}
