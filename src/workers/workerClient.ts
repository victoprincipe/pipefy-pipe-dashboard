import type {
  ExplorerQuery,
  ExplorerResult,
  FilterRule,
  WidgetComputationResult,
  WidgetConfig,
} from '../types/dashboard';
import type { NormalizedCard, PipeSchema } from '../types/pipefy';

interface PendingCall {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

export class AnalyticsWorkerClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, PendingCall>();

  constructor() {
    this.worker = new Worker(new URL('./analytics.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event) => {
      const { id, ok, payload, error } = event.data as {
        id: number;
        ok: boolean;
        payload?: unknown;
        error?: string;
      };
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (ok) {
        entry.resolve(payload);
      } else {
        entry.reject(new Error(error || 'Erro no Web Worker de análise.'));
      }
    };
    this.worker.onerror = (err) => {
      for (const entry of this.pending.values()) {
        entry.reject(new Error(err.message || 'Falha fatal no Web Worker.'));
      }
      this.pending.clear();
    };
  }

  private call<T>(message: Record<string, unknown>, transferables?: Transferable[]): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (transferables && transferables.length > 0) {
        this.worker.postMessage({ id, ...message }, transferables);
      } else {
        this.worker.postMessage({ id, ...message });
      }
    });
  }

  setDataset(cards: NormalizedCard[], schema: PipeSchema): Promise<{ count: number }> {
    return this.call({ type: 'SET_DATASET', cards, schema });
  }

  parseXlsx(
    buffer: ArrayBuffer,
    schema: PipeSchema
  ): Promise<{ cards: NormalizedCard[]; count: number; parseMs: number }> {
    return this.call({ type: 'PARSE_XLSX', buffer, schema }, [buffer]);
  }

  computeDashboard(params: {
    globalSearch: string;
    filters: FilterRule[];
    widgets: WidgetConfig[];
    explorer?: ExplorerQuery;
  }): Promise<{
    totalCards: number;
    matchedCards: number;
    results: WidgetComputationResult[];
    explorer?: ExplorerResult;
    totalMs: number;
  }> {
    return this.call({ type: 'COMPUTE_DASHBOARD', ...params });
  }

  computeWidget(params: {
    globalSearch: string;
    filters: FilterRule[];
    widget: WidgetConfig;
  }): Promise<WidgetComputationResult> {
    return this.call({ type: 'COMPUTE_WIDGET', ...params });
  }

  getSuggestions(fieldKey: string, limit = 25): Promise<{ values: string[] }> {
    return this.call({ type: 'GET_SUGGESTIONS', fieldKey, limit });
  }

  getFilteredCards(
    globalSearch: string,
    filters: FilterRule[],
    limit?: number
  ): Promise<{ cards: NormalizedCard[] }> {
    return this.call({ type: 'GET_FILTERED_CARDS', globalSearch, filters, limit });
  }

  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}
