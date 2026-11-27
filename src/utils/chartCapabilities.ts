import type { ColumnRoleOverrides } from '@/lib/columnRoleOverrides';
import type { PipefySqlDataset } from '@/types/pipefySql';
import {
  type ColumnProfile,
  profileDatasetColumns,
} from '@/utils/chartSemantics';

export interface DatasetCapabilities {
  primaryDimension: ColumnProfile | null;
  primaryDate: ColumnProfile | null;
  primaryNumeric: ColumnProfile | null;
  primaryCurrency: ColumnProfile | null;
  primaryBoolean: ColumnProfile | null;
  /** Assignee-like column, when the dataset has one (Pipefy style). */
  primaryAssignee: ColumnProfile | null;
  dimensions: ColumnProfile[];
  dates: ColumnProfile[];
  numerics: ColumnProfile[];
  booleans: ColumnProfile[];
}

/**
 * Derives everything the UI/template layer can build from a dataset, based on
 * the semantic profile of its columns (never on a fixed Pipe-specific list).
 */
export function getDatasetCapabilities(
  dataset: PipefySqlDataset | null | undefined,
  overrides?: ColumnRoleOverrides
): DatasetCapabilities {
  const empty: DatasetCapabilities = {
    primaryDimension: null,
    primaryDate: null,
    primaryNumeric: null,
    primaryCurrency: null,
    primaryBoolean: null,
    primaryAssignee: null,
    dimensions: [],
    dates: [],
    numerics: [],
    booleans: [],
  };
  if (!dataset || dataset.columns.length === 0) return empty;

  const profiles = profileDatasetColumns(dataset.columns, overrides);
  const byBest = [...profiles].sort((a, b) => b.priorityScore - a.priorityScore);

  const dimensions = byBest.filter(
    (p) => p.groupCategory === 'dimension' && !p.isIdentifier
  );
  const dates = byBest.filter((p) => p.groupCategory === 'date');
  const numerics = byBest.filter((p) => p.groupCategory === 'metric');
  const booleans = byBest.filter((p) => p.role.startsWith('boolean'));

  const primaryDimension =
    dimensions.find((p) => p.role === 'phase') ??
    dimensions.find((p) => p.role === 'status') ??
    dimensions.find((p) => p.role === 'assignee') ??
    dimensions.find((p) => p.role === 'label') ??
    dimensions[0] ??
    null;

  return {
    primaryDimension,
    primaryDate:
      dates.find((p) => p.role === 'date_created') ?? dates[0] ?? null,
    primaryNumeric: numerics.find((p) => p.role === 'number') ?? numerics[0] ?? null,
    primaryCurrency: numerics.find((p) => p.role === 'currency') ?? null,
    primaryBoolean:
      booleans.find((p) => p.role === 'boolean_sla') ??
      booleans.find((p) => p.role === 'boolean_done') ??
      booleans[0] ??
      null,
    primaryAssignee: dimensions.find((p) => p.role === 'assignee') ?? null,
    dimensions,
    dates,
    numerics,
    booleans,
  };
}
