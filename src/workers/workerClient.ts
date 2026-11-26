import { createBrowserDuckDbBackend } from '../db/duckdbBackend';
import { DuckDbAnalyticsEngine } from '../db/duckdbEngine';
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
  private readonly engine: DuckDbAnalyticsEngine;
  private xlsxWorker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, PendingCall>();

  constructor() {
    this.engine = new DuckDbAnalyticsEngine(createBrowserDuckDbBackend);
  }

  private getXlsxWorker(): Worker {
    if (this.xlsxWorker) return this.xlsxWorker;
    const worker = new Worker(new URL('./xlsx.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event) => {
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
        entry.reject(new Error(error || 'Erro no Web Worker de planilha.'));
      }
    };
    worker.onerror = (err) => {
      for (const entry of this.pending.values()) {
        entry.reject(new Error(err.message || 'Falha fatal no XLSX Worker.'));
      }
      this.pending.clear();
    };
    this.xlsxWorker = worker;
    return worker;
  }

  private callXlsxWorker<T>(
    message: Record<string, unknown>,
    transferables?: Transferable[]
  ): Promise<T> {
    const worker = this.getXlsxWorker();
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (transferables && transferables.length > 0) {
        worker.postMessage({ id, ...message }, transferables);
      } else {
        worker.postMessage({ id, ...message });
      }
    });
  }

  async setDataset(cards: NormalizedCard[], schema: PipeSchema): Promise<{ count: number }> {
    const res = await this.engine.loadCards(cards, schema);
    return { count: res.count };
  }

  async loadParquet(parquetBytes: Uint8Array, schema: PipeSchema): Promise<{ count: number; loadMs: number }> {
    return this.engine.loadParquet(parquetBytes, schema);
  }

  exportParquet(): Promise<Uint8Array> {
    return this.engine.exportParquet();
  }

  upsertCards(cards: NormalizedCard[], schema: PipeSchema): Promise<{ count: number }> {
    return this.engine.upsertCards(cards, schema);
  }

  deleteCards(ids: string[]): Promise<{ count: number }> {
    return this.engine.deleteCards(ids);
  }

  async parseXlsx(
    buffer: ArrayBuffer,
    schema: PipeSchema
  ): Promise<{ cards: NormalizedCard[]; count: number; parseMs: number }> {
    const parsed = await this.callXlsxWorker<{
      cards: NormalizedCard[];
      count: number;
      parseMs: number;
    }>({ type: 'PARSE_XLSX', buffer, schema }, [buffer]);
    await this.engine.loadCards(parsed.cards, schema);
    return parsed;
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
    return this.engine.computeDashboard(params);
  }

  computeWidget(params: {
    globalSearch: string;
    filters: FilterRule[];
    widget: WidgetConfig;
  }): Promise<WidgetComputationResult> {
    return this.engine.computeWidget(params);
  }

  getSuggestions(fieldKey: string, limit = 25): Promise<{ values: string[] }> {
    return this.engine.getSuggestions(fieldKey, limit);
  }

  getFilteredCards(
    globalSearch: string,
    filters: FilterRule[],
    limit?: number
  ): Promise<{ cards: NormalizedCard[] }> {
    return this.engine.getFilteredCards(globalSearch, filters, limit);
  }

  terminate() {
    this.xlsxWorker?.terminate();
    this.xlsxWorker = null;
    this.pending.clear();
    void this.engine.terminate();
  }
}
