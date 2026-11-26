import * as XLSX from 'xlsx';
import {
  applyFilters,
  computeExplorerPage,
  computeFieldSuggestions,
  computeWidgetData,
} from './analyticsEngine';
import { normalizeExportRows } from '../utils/xlsxNormalizer';
import type { NormalizedCard, PipeSchema } from '../types/pipefy';
import type {
  ExplorerQuery,
  FilterRule,
  WidgetConfig,
} from '../types/dashboard';

let datasetCards: NormalizedCard[] = [];
let datasetSchema: PipeSchema | null = null;
let lastFilteredCards: NormalizedCard[] = [];
let lastFilterSignature = '';

export type WorkerRequest =
  | { id: number; type: 'SET_DATASET'; cards: NormalizedCard[]; schema: PipeSchema }
  | { id: number; type: 'PARSE_XLSX'; buffer: ArrayBuffer; schema: PipeSchema }
  | {
      id: number;
      type: 'COMPUTE_DASHBOARD';
      globalSearch: string;
      filters: FilterRule[];
      widgets: WidgetConfig[];
      explorer?: ExplorerQuery;
    }
  | {
      id: number;
      type: 'COMPUTE_WIDGET';
      globalSearch: string;
      filters: FilterRule[];
      widget: WidgetConfig;
    }
  | { id: number; type: 'GET_SUGGESTIONS'; fieldKey: string; limit?: number }
  | { id: number; type: 'GET_FILTERED_CARDS'; globalSearch: string; filters: FilterRule[]; limit?: number };

function getFiltered(globalSearch: string, filters: FilterRule[]): { cards: NormalizedCard[]; filterMs: number } {
  const sig = JSON.stringify({ globalSearch, filters, count: datasetCards.length });
  if (sig === lastFilterSignature) {
    return { cards: lastFilteredCards, filterMs: 0 };
  }
  const t0 = performance.now();
  const filtered = applyFilters(datasetCards, globalSearch, filters);
  const t1 = performance.now();
  lastFilteredCards = filtered;
  lastFilterSignature = sig;
  return { cards: filtered, filterMs: Math.round((t1 - t0) * 100) / 100 };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'SET_DATASET': {
        datasetCards = msg.cards;
        datasetSchema = msg.schema;
        lastFilterSignature = '';
        lastFilteredCards = datasetCards;
        self.postMessage({
          id: msg.id,
          ok: true,
          payload: { count: datasetCards.length },
        });
        break;
      }

      case 'PARSE_XLSX': {
        const t0 = performance.now();
        const workbook = XLSX.read(new Uint8Array(msg.buffer), {
          type: 'array',
          cellDates: true,
        });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          raw: true,
        });
        const cards = normalizeExportRows(rows, msg.schema);
        datasetCards = cards;
        datasetSchema = msg.schema;
        lastFilterSignature = '';
        lastFilteredCards = cards;
        const t1 = performance.now();
        self.postMessage({
          id: msg.id,
          ok: true,
          payload: {
            cards,
            count: cards.length,
            parseMs: Math.round((t1 - t0) * 100) / 100,
          },
        });
        break;
      }

      case 'COMPUTE_DASHBOARD': {
        if (!datasetSchema) {
          throw new Error('Dataset ainda não inicializado no Worker.');
        }
        const t0 = performance.now();
        const { cards: filtered } = getFiltered(msg.globalSearch, msg.filters);
        const results = msg.widgets.map((w) => computeWidgetData(filtered, w, datasetSchema!));
        const explorer = msg.explorer ? computeExplorerPage(filtered, msg.explorer) : undefined;
        const t1 = performance.now();
        self.postMessage({
          id: msg.id,
          ok: true,
          payload: {
            totalCards: datasetCards.length,
            matchedCards: filtered.length,
            results,
            explorer,
            totalMs: Math.round((t1 - t0) * 100) / 100,
          },
        });
        break;
      }

      case 'COMPUTE_WIDGET': {
        if (!datasetSchema) {
          throw new Error('Dataset ainda não inicializado no Worker.');
        }
        const { cards: filtered } = getFiltered(msg.globalSearch, msg.filters);
        const result = computeWidgetData(filtered, msg.widget, datasetSchema);
        self.postMessage({
          id: msg.id,
          ok: true,
          payload: result,
        });
        break;
      }

      case 'GET_SUGGESTIONS': {
        const values = computeFieldSuggestions(datasetCards, msg.fieldKey, msg.limit ?? 25);
        self.postMessage({
          id: msg.id,
          ok: true,
          payload: { values },
        });
        break;
      }

      case 'GET_FILTERED_CARDS': {
        const { cards: filtered } = getFiltered(msg.globalSearch, msg.filters);
        const slice = msg.limit ? filtered.slice(0, msg.limit) : filtered;
        self.postMessage({
          id: msg.id,
          ok: true,
          payload: { cards: slice },
        });
        break;
      }
    }
  } catch (err) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
