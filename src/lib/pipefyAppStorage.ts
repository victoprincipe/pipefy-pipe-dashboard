import type { PipefySdkClient } from '@/lib/pipefyExportClient';
import {
  DASHBOARD_CHART_TYPE_OPTIONS,
  type DashboardChartConfig,
  type DashboardView,
} from '@/types/dashboardViews';

export type PipefyViewsVisibility = 'public' | 'private';

export interface PipefyStoredViewsPayload {
  version: 1;
  activeViewId: string;
  views: DashboardView[];
  updatedAt: number;
}

export const PIPEFY_VIEWS_STORAGE_KEY = 'pipelens_views_v1';
/** Local fallback used when the app runs outside Pipefy (dev/local imports). */
export const LOCAL_VIEWS_STORAGE_KEY = 'pipelens_local_views_v1';

const VALID_CHART_TYPES = new Set<string>(
  DASHBOARD_CHART_TYPE_OPTIONS.map((opt) => opt.type)
);

export function isValidChartConfig(item: unknown): item is DashboardChartConfig {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.type === 'string' &&
    VALID_CHART_TYPES.has(candidate.type)
  );
}

/**
 * Migrates a persisted chart config to the current shape:
 * - stamps `configVersion: 2`;
 * - converts legacy `filterColumn`/`filterValue` into `filters`;
 * - deliberately leaves `datasetId` undefined for legacy charts so they stay adaptable.
 */
export function migrateChartConfig(
  chart: DashboardChartConfig
): DashboardChartConfig {
  const next: DashboardChartConfig = { ...chart, configVersion: 2 };

  if (
    (!next.filters || next.filters.length === 0) &&
    next.filterColumn &&
    next.filterValue
  ) {
    next.filters = [
      {
        id: `legacy-filter-${next.id}`,
        column: next.filterColumn,
        operator: 'contains',
        value: next.filterValue,
      },
    ];
    delete next.filterColumn;
    delete next.filterValue;
  }

  return next;
}

export function isValidDashboardView(item: unknown): item is DashboardView {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    typeof candidate.createdAt === 'number' &&
    Array.isArray(candidate.charts) &&
    candidate.charts.every(isValidChartConfig)
  );
}

export function parsePipefyStoredViews(
  raw: unknown
): PipefyStoredViewsPayload | null {
  if (raw === null || raw === undefined) return null;

  let candidate: unknown = raw;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }

  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  const validViews = Array.isArray(obj.views)
    ? obj.views.filter(isValidDashboardView).map((view) => ({
        ...view,
        charts: view.charts.map(migrateChartConfig),
      }))
    : [];

  if (validViews.length === 0) return null;

  const requestedActiveId =
    typeof obj.activeViewId === 'string' ? obj.activeViewId : validViews[0].id;
  const activeViewId = validViews.some((v) => v.id === requestedActiveId)
    ? requestedActiveId
    : validViews[0].id;

  return {
    version: 1,
    activeViewId,
    views: validViews,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
  };
}

/**
 * Persists dashboard views in localStorage when running outside Pipefy (local
 * file imports / development), so charts survive a page reload.
 */
export function saveViewsToLocalStorage(state: {
  views: DashboardView[];
  activeViewId: string;
}): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: PipefyStoredViewsPayload = {
      version: 1,
      activeViewId: state.activeViewId,
      views: state.views,
      updatedAt: Date.now(),
    };
    localStorage.setItem(LOCAL_VIEWS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota/private mode: views stay in memory only.
  }
}

/** Loads locally persisted views, if any. */
export function loadViewsFromLocalStorage(): PipefyStoredViewsPayload | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_VIEWS_STORAGE_KEY);
    return parsePipefyStoredViews(raw);
  } catch {
    return null;
  }
}

/**
 * Loads dashboard views and chart configs saved in Pipefy's native App Storage (`p.get`).
 * Checks pipe-wide (`public`) storage first and falls back to per-user (`private`).
 */
export async function loadViewsFromPipefyStorage(
  client: PipefySdkClient
): Promise<{
  payload: PipefyStoredViewsPayload;
  visibility: PipefyViewsVisibility;
} | null> {
  if (typeof client.get !== 'function') return null;

  const visibilities: PipefyViewsVisibility[] = ['public', 'private'];
  for (const visibility of visibilities) {
    try {
      const raw = await client.get('pipe', visibility, PIPEFY_VIEWS_STORAGE_KEY);
      const parsed = parsePipefyStoredViews(raw);
      if (parsed) {
        return { payload: parsed, visibility };
      }
    } catch {
      // Try next visibility level if unavailable for this user/role.
    }
  }

  return null;
}

/**
 * Persists dashboard views and chart configs inside Pipefy's native App Storage (`p.set`).
 * Prefers pipe-wide (`public`) visibility and falls back to `private` if restricted.
 */
export async function saveViewsToPipefyStorage(
  client: PipefySdkClient,
  state: { views: DashboardView[]; activeViewId: string },
  preferredVisibility: PipefyViewsVisibility = 'public'
): Promise<PipefyViewsVisibility | null> {
  if (typeof client.set !== 'function') return null;

  const payload: PipefyStoredViewsPayload = {
    version: 1,
    activeViewId: state.activeViewId,
    views: state.views,
    updatedAt: Date.now(),
  };
  const serialized = JSON.stringify(payload);

  const order: PipefyViewsVisibility[] =
    preferredVisibility === 'private'
      ? ['private', 'public']
      : ['public', 'private'];

  let lastError: unknown = null;
  for (const visibility of order) {
    try {
      await client.set('pipe', visibility, PIPEFY_VIEWS_STORAGE_KEY, serialized);
      return visibility;
    } catch (err: unknown) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Falha ao salvar visões no storage nativo do Pipefy.');
}
