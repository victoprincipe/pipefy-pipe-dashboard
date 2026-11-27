import { convertTabularBufferToSqlDataset } from '@/lib/sqlConverter';
import type { DatasetSource, PipefyFieldHint } from '@/types/pipefySql';

export interface XlsxToSqlRequest {
  id: number;
  buffer: ArrayBuffer;
  pipeId: string;
  pipeName: string;
  fieldHints?: PipefyFieldHint[];
  datasetName?: string;
  source?: DatasetSource;
  sheetName?: string;
  format?: 'xlsx' | 'csv';
  datasetId?: string;
}

self.onmessage = (event: MessageEvent<XlsxToSqlRequest>) => {
  const {
    id,
    buffer,
    pipeId,
    pipeName,
    fieldHints,
    datasetName,
    source,
    sheetName,
    format,
    datasetId,
  } = event.data;
  try {
    const result = convertTabularBufferToSqlDataset({
      buffer,
      pipeId,
      pipeName,
      fieldHints,
      datasetName,
      source,
      sheetName,
      format,
      datasetId,
    });
    self.postMessage({ id, ok: true, payload: result });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
