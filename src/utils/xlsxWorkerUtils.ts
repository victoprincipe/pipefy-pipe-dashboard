import * as XLSX from 'xlsx';
import {
  convertTabularBufferToSqlDataset,
  type ConvertTabularResult,
} from '@/lib/sqlConverter';
import type {
  DatasetSource,
  PipefyFieldHint,
} from '@/types/pipefySql';

export type ParsedSqlPayload = ConvertTabularResult;

export interface ParseXlsxParams {
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

/**
 * Lists the sheet names of an Excel workbook without parsing any cell.
 * Useful to let the user pick a sheet before importing.
 */
export function listWorkbookSheets(buffer: ArrayBuffer): string[] {
  try {
    const workbook = XLSX.read(new Uint8Array(buffer), {
      type: 'array',
      bookSheets: true,
    });
    return workbook.SheetNames ?? [];
  } catch {
    return [];
  }
}

/**
 * Parses a tabular binary buffer (xlsx/xls/csv) into SQL schema + rows using a
 * Web Worker, transparently falling back to main-thread conversion if workers
 * are unavailable or fail.
 */
export function parseXlsxInWorker(params: ParseXlsxParams): Promise<ParsedSqlPayload> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(convertTabularBufferToSqlDataset(params));
  }

  return new Promise<ParsedSqlPayload>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/xlsxToSql.worker.ts', import.meta.url));
    } catch {
      resolve(convertTabularBufferToSqlDataset(params));
      return;
    }

    const reqId = Date.now();
    // Clone before transferring ownership so main-thread fallback still has intact bytes.
    const transferableBuffer = params.buffer.slice(0);

    worker.onmessage = (event) => {
      const { id, ok, payload } = event.data as {
        id: number;
        ok: boolean;
        payload?: ParsedSqlPayload;
      };
      if (id !== reqId) return;
      worker.terminate();
      if (ok && payload) {
        resolve(payload);
      } else {
        resolve(convertTabularBufferToSqlDataset(params));
      }
    };

    worker.onerror = () => {
      worker.terminate();
      resolve(convertTabularBufferToSqlDataset(params));
    };

    worker.postMessage(
      {
        id: reqId,
        buffer: transferableBuffer,
        pipeId: params.pipeId,
        pipeName: params.pipeName,
        fieldHints: params.fieldHints,
        datasetName: params.datasetName,
        source: params.source,
        sheetName: params.sheetName,
        format: params.format,
        datasetId: params.datasetId,
      },
      [transferableBuffer]
    );
  });
}
