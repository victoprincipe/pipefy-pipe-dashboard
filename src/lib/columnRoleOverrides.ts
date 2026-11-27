import type { ChartValueFormat } from '@/types/dashboardViews';
import type { ColumnSemanticRole } from '@/utils/chartSemantics';

export interface ColumnRoleOverride {
  role?: ColumnSemanticRole;
  valueFormat?: ChartValueFormat;
}

export type ColumnRoleOverrides = Record<string, ColumnRoleOverride>;

const STORAGE_PREFIX = 'pipelens_column_roles::';

function storageKey(datasetId: string): string {
  return `${STORAGE_PREFIX}${datasetId}`;
}

/** Loads per-dataset role overrides from localStorage (empty object when unavailable). */
export function loadColumnRoleOverrides(datasetId: string): ColumnRoleOverrides {
  if (!datasetId || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(datasetId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ColumnRoleOverrides;
  } catch {
    return {};
  }
}

/** Persists per-dataset role overrides in localStorage. */
export function saveColumnRoleOverrides(
  datasetId: string,
  overrides: ColumnRoleOverrides
): void {
  if (!datasetId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(datasetId), JSON.stringify(overrides));
  } catch {
    // Storage can be unavailable (private mode/quota); overrides stay in memory.
  }
}

export function getColumnRoleOverride(
  overrides: ColumnRoleOverrides | undefined,
  columnName: string
): ColumnRoleOverride | undefined {
  return overrides?.[columnName];
}
