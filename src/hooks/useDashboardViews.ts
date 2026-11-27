'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadViewsFromLocalStorage,
  loadViewsFromPipefyStorage,
  parsePipefyStoredViews,
  saveViewsToLocalStorage,
  saveViewsToPipefyStorage,
  type PipefyViewsVisibility,
} from '@/lib/pipefyAppStorage';
import type { PipefySdkClient } from '@/lib/pipefyExportClient';
import type { DashboardChartConfig, DashboardView } from '@/types/dashboardViews';

interface ViewsStoreState {
  views: DashboardView[];
  activeViewId: string;
}

export interface UseDashboardViewsOptions {
  client?: PipefySdkClient | null;
}

const DEFAULT_VIEW: DashboardView = {
  id: 'view-overview',
  name: 'Visão Geral',
  createdAt: 0,
  charts: [
    {
      id: 'chart-default-bar',
      type: 'horizontalBar',
      excludeEmpty: true,
      groupOthers: true,
    },
  ],
};

function getDefaultStore(): ViewsStoreState {
  return {
    views: [DEFAULT_VIEW],
    activeViewId: DEFAULT_VIEW.id,
  };
}

function normalizeViewsState(
  views: DashboardView[],
  requestedActiveId?: string
): ViewsStoreState {
  const parsed = parsePipefyStoredViews({
    views,
    activeViewId: requestedActiveId ?? '',
  });
  if (!parsed) return getDefaultStore();
  return {
    views: parsed.views,
    activeViewId: parsed.activeViewId,
  };
}

/**
 * Manages dashboard views and charts, persisting them exclusively in Pipefy's
 * native Apps SDK storage (`p.set` / `p.get`) when running inside a Pipe.
 */
export function useDashboardViews(options: UseDashboardViewsOptions = {}) {
  const { client } = options;

  const [store, setStore] = useState<ViewsStoreState>(() => {
    // Only use the local fallback outside Pipefy; inside a Pipe the remote app
    // storage is the single source of truth.
    const canUseLocalStorage =
      typeof window !== 'undefined' &&
      window.self === window.top &&
      !window.location.search.includes('appID=');
    if (client || !canUseLocalStorage) return getDefaultStore();
    const local = loadViewsFromLocalStorage();
    return local
      ? normalizeViewsState(local.views, local.activeViewId)
      : getDefaultStore();
  });
  const [storageVisibility, setStorageVisibility] =
    useState<PipefyViewsVisibility | null>(null);
  const [isSyncingStorage, setIsSyncingStorage] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const storeRef = useRef<ViewsStoreState>(store);
  const visibilityRef = useRef<PipefyViewsVisibility>('public');
  const revisionRef = useRef(0);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    if (!client) return;

    let cancelled = false;
    const hydrationRevision = revisionRef.current;

    void (async () => {
      try {
        setIsSyncingStorage(true);
        setStorageError(null);

        const remote = await loadViewsFromPipefyStorage(client);
        if (cancelled || revisionRef.current !== hydrationRevision) return;

        if (remote) {
          const remoteState = normalizeViewsState(
            remote.payload.views,
            remote.payload.activeViewId
          );
          visibilityRef.current = remote.visibility;
          setStorageVisibility(remote.visibility);
          storeRef.current = remoteState;
          setStore(remoteState);
          return;
        }

        const savedVis = await saveViewsToPipefyStorage(
          client,
          storeRef.current,
          visibilityRef.current
        );
        if (cancelled || revisionRef.current !== hydrationRevision) return;

        if (savedVis) {
          visibilityRef.current = savedVis;
          setStorageVisibility(savedVis);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStorageError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsSyncingStorage(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const commitState = useCallback(
    (next: ViewsStoreState) => {
      revisionRef.current += 1;
      storeRef.current = next;
      setStore(next);

      if (!client) {
        saveViewsToLocalStorage(next);
        return;
      }

      setIsSyncingStorage(true);
      setStorageError(null);

      const targetRevision = revisionRef.current;
      persistQueueRef.current = persistQueueRef.current
        .then(async () => {
          const savedVis = await saveViewsToPipefyStorage(
            client,
            next,
            visibilityRef.current
          );
          if (savedVis) {
            visibilityRef.current = savedVis;
            setStorageVisibility(savedVis);
          }
        })
        .then(() => {
          if (revisionRef.current === targetRevision) {
            setIsSyncingStorage(false);
          }
        })
        .catch((err: unknown) => {
          if (revisionRef.current === targetRevision) {
            setStorageError(err instanceof Error ? err.message : String(err));
            setIsSyncingStorage(false);
          }
        });
    },
    [client]
  );

  const selectView = useCallback(
    (id: string) => {
      const current = storeRef.current;
      if (!current.views.some((v) => v.id === id)) return;
      commitState({
        ...current,
        activeViewId: id,
      });
    },
    [commitState]
  );

  const createView = useCallback(
    (rawName?: string): DashboardView => {
      const current = storeRef.current;
      const trimmed = (rawName ?? '').trim();
      const nextView: DashboardView = {
        id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed || `Visão ${current.views.length + 1}`,
        createdAt: Date.now(),
        charts: [],
      };

      commitState({
        views: [...current.views, nextView],
        activeViewId: nextView.id,
      });

      return nextView;
    },
    [commitState]
  );

  const deleteView = useCallback(
    (id: string) => {
      const current = storeRef.current;
      if (current.views.length <= 1) return;

      const remaining = current.views.filter((v) => v.id !== id);
      if (remaining.length === current.views.length) return;

      const nextActiveId =
        current.activeViewId === id ? remaining[0].id : current.activeViewId;

      commitState({
        views: remaining,
        activeViewId: nextActiveId,
      });
    },
    [commitState]
  );

  const addChart = useCallback(
    (viewId: string, config: Partial<Omit<DashboardChartConfig, 'id'>> = {}) => {
      const current = storeRef.current;
      const newChart: DashboardChartConfig = {
        ...config,
        id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: config.type ?? 'horizontalBar',
      };

      const nextViews = current.views.map((view) =>
        view.id === viewId
          ? { ...view, charts: [...view.charts, newChart] }
          : view
      );

      commitState({
        ...current,
        views: nextViews,
      });

      return newChart;
    },
    [commitState]
  );

  /** Adds multiple charts in a single persisted commit (used by the auto dashboard). */
  const addCharts = useCallback(
    (
      viewId: string,
      configs: Array<Partial<Omit<DashboardChartConfig, 'id'>>>
    ): DashboardChartConfig[] => {
      if (configs.length === 0) return [];
      const current = storeRef.current;
      const created = configs.map((config, index) => ({
        ...config,
        id: `chart-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        type: config.type ?? 'horizontalBar',
      })) as DashboardChartConfig[];

      const nextViews = current.views.map((view) =>
        view.id === viewId
          ? { ...view, charts: [...view.charts, ...created] }
          : view
      );

      commitState({ ...current, views: nextViews });
      return created;
    },
    [commitState]
  );

  const duplicateChart = useCallback(
    (viewId: string, chartId: string) => {
      const current = storeRef.current;
      let duplicated: DashboardChartConfig | null = null;

      const nextViews = current.views.map((view) => {
        if (view.id !== viewId) return view;
        const idx = view.charts.findIndex((c) => c.id === chartId);
        if (idx === -1) return view;

        const source = view.charts[idx];
        const copy: DashboardChartConfig = {
          ...source,
          filters: source.filters ? source.filters.map((f) => ({ ...f })) : undefined,
          id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: source.title ? `${source.title} (cópia)` : undefined,
        };
        duplicated = copy;

        const nextCharts = [...view.charts];
        nextCharts.splice(idx + 1, 0, copy);
        return { ...view, charts: nextCharts };
      });

      if (!duplicated) return null;

      commitState({
        ...current,
        views: nextViews,
      });

      return duplicated;
    },
    [commitState]
  );

  const updateChart = useCallback(
    (
      viewId: string,
      chartId: string,
      patch: Partial<Omit<DashboardChartConfig, 'id'>>
    ) => {
      const current = storeRef.current;
      const nextViews = current.views.map((view) =>
        view.id === viewId
          ? {
              ...view,
              charts: view.charts.map((chart) =>
                chart.id === chartId ? { ...chart, ...patch } : chart
              ),
            }
          : view
      );

      commitState({
        ...current,
        views: nextViews,
      });
    },
    [commitState]
  );

  const removeChart = useCallback(
    (viewId: string, chartId: string) => {
      const current = storeRef.current;
      const nextViews = current.views.map((view) =>
        view.id === viewId
          ? { ...view, charts: view.charts.filter((c) => c.id !== chartId) }
          : view
      );

      commitState({
        ...current,
        views: nextViews,
      });
    },
    [commitState]
  );

  const activeView =
    store.views.find((v) => v.id === store.activeViewId) ?? store.views[0];

  return {
    views: store.views,
    activeView,
    activeViewId: activeView.id,
    isConnectedToPipefyStorage: Boolean(client),
    storageVisibility,
    isSyncingStorage,
    storageError,
    selectView,
    createView,
    deleteView,
    addChart,
    addCharts,
    duplicateChart,
    updateChart,
    removeChart,
  };
}
