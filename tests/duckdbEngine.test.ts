// @vitest-environment node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VoidLogger, createDuckDB, NODE_RUNTIME } from '@duckdb/duckdb-wasm/blocking';
import type { DuckDbBackend } from '../src/db/duckdbBackend';
import { DuckDbAnalyticsEngine } from '../src/db/duckdbEngine';
import type { WidgetConfig } from '../src/types/dashboard';
import { DEMO_PIPE_SCHEMA, generateDemoDataset } from '../src/utils/demoDataset';

const require = createRequire(import.meta.url);
const DUCKDB_DIST = path.dirname(require.resolve('@duckdb/duckdb-wasm'));

async function createNodeDuckDbBackend(): Promise<DuckDbBackend> {
  const bundles = {
    mvp: {
      mainModule: path.resolve(DUCKDB_DIST, './duckdb-mvp.wasm'),
      mainWorker: path.resolve(DUCKDB_DIST, './duckdb-node-mvp.worker.cjs'),
    },
    eh: {
      mainModule: path.resolve(DUCKDB_DIST, './duckdb-eh.wasm'),
      mainWorker: path.resolve(DUCKDB_DIST, './duckdb-node-eh.worker.cjs'),
    },
  };

  const db = await createDuckDB(bundles, new VoidLogger(), NODE_RUNTIME);
  await db.instantiate();
  const conn = db.connect();

  return {
    async query(sql: string) {
      const table = conn.query(sql);
      return table.toArray().map((row) =>
        typeof (row as { toJSON?: () => Record<string, unknown> })?.toJSON === 'function'
          ? (row as { toJSON: () => Record<string, unknown> }).toJSON()
          : { ...(row as Record<string, unknown>) }
      );
    },
    async registerFileBuffer(name: string, buffer: Uint8Array) {
      db.registerFileBuffer(name, buffer);
    },
    async copyFileToBuffer(name: string) {
      const raw = db.copyFileToBuffer(name);
      return new Uint8Array(raw);
    },
    async dropFile(name: string) {
      try {
        db.dropFile(name);
      } catch {
        // ignore if only written on local node fs
      }
      fs.rmSync(path.resolve(name), { force: true });
      fs.rmSync(path.resolve(`tmp_${name}`), { force: true });
    },
    async close() {
      conn.close();
      db.reset();
    },
  };
}

describe('DuckDbAnalyticsEngine (20.000 cards + Parquet)', () => {
  const { cards, schema } = generateDemoDataset(20_000);
  const engine = new DuckDbAnalyticsEngine(createNodeDuckDbBackend);
  let parquetSnapshot: Uint8Array = new Uint8Array();

  beforeAll(async () => {
    const loadRes = await engine.loadCards(cards, schema);
    expect(loadRes.count).toBe(20_000);
  }, 30_000);

  afterAll(async () => {
    await engine.terminate();
  });

  it('exports 20,000 cards to compressed Parquet (< 4 MB) and round-trips cleanly', async () => {
    parquetSnapshot = await engine.exportParquet();
    expect(parquetSnapshot.byteLength).toBeGreaterThan(10_000);
    expect(parquetSnapshot.byteLength).toBeLessThan(4 * 1024 * 1024);

    // Parquet magic header: "PAR1"
    expect(String.fromCharCode(...parquetSnapshot.slice(0, 4))).toBe('PAR1');

    const reloadRes = await engine.loadParquet(parquetSnapshot, schema);
    expect(reloadRes.count).toBe(20_000);
  }, 30_000);

  it('aggregates 20,000 cards in SQL for SUM by category with Top N + Outros', async () => {
    const widget: WidgetConfig = {
      id: 'w-test-sum',
      title: 'Valor Total por Estado',
      chartType: 'horizontal_bar',
      dimensionKey: 'estado',
      metricOp: 'sum',
      metricFieldKey: 'valor_total',
      sortMode: 'value_desc',
      topN: 5,
      groupOthers: true,
      width: 6,
      colorScheme: 'cobalt',
    };

    const res = await engine.computeWidget({ globalSearch: '', filters: [], widget });
    expect(res.totalMatched).toBe(20_000);
    expect(res.points.length).toBe(6); // top 5 + Outros
    expect(res.points[5].key).toBe('__others');
    expect(res.summaryValue).toBeGreaterThan(0);
    expect(res.durationMs).toBeLessThan(300);
  });

  it('computes COUNT, SUM, AVG, MEDIAN, MIN, MAX and DISTINCT accurately in SQL', async () => {
    const base: Omit<WidgetConfig, 'metricOp'> = {
      id: 'w-ops',
      title: 'Teste Ops',
      chartType: 'kpi',
      dimensionKey: 'estado',
      metricFieldKey: 'valor_total',
      sortMode: 'value_desc',
      topN: 0,
      groupOthers: false,
      width: 4,
      colorScheme: 'teal',
    };

    const [countRes, sumRes, avgRes, medRes, minRes, maxRes, distRes] = await Promise.all([
      engine.computeWidget({ globalSearch: '', filters: [], widget: { ...base, metricOp: 'count' } }),
      engine.computeWidget({ globalSearch: '', filters: [], widget: { ...base, metricOp: 'sum' } }),
      engine.computeWidget({ globalSearch: '', filters: [], widget: { ...base, metricOp: 'avg' } }),
      engine.computeWidget({ globalSearch: '', filters: [], widget: { ...base, metricOp: 'median' } }),
      engine.computeWidget({ globalSearch: '', filters: [], widget: { ...base, metricOp: 'min' } }),
      engine.computeWidget({ globalSearch: '', filters: [], widget: { ...base, metricOp: 'max' } }),
      engine.computeWidget({
        globalSearch: '',
        filters: [],
        widget: { ...base, metricOp: 'distinct', metricFieldKey: 'estado' },
      }),
    ]);

    expect(countRes.summaryValue).toBe(20_000);
    expect(avgRes.summaryValue).toBeCloseTo(sumRes.summaryValue / 20_000, 1);
    expect(minRes.summaryValue).toBeLessThanOrEqual(medRes.summaryValue);
    expect(medRes.summaryValue).toBeLessThanOrEqual(maxRes.summaryValue);
    expect(distRes.summaryValue).toBe(9);
  });

  it('buckets dates (month/quarter/week/year) and numeric histograms', async () => {
    const monthly = await engine.computeWidget({
      globalSearch: '',
      filters: [],
      widget: {
        id: 'w-m',
        title: 'Mensal',
        chartType: 'area',
        dimensionKey: 'data_limite',
        dateGranularity: 'month',
        metricOp: 'count',
        sortMode: 'label_asc',
        topN: 0,
        groupOthers: false,
        width: 8,
        colorScheme: 'cobalt',
      },
    });
    expect(monthly.points.length).toBe(12);
    expect(monthly.points[0].key).toBe('2027-01');
    expect(monthly.points[0].label).toBe('Jan/27');

    const quarterly = await engine.computeWidget({
      globalSearch: '',
      filters: [],
      widget: {
        id: 'w-q',
        title: 'Trimestral',
        chartType: 'bar',
        dimensionKey: 'data_limite',
        dateGranularity: 'quarter',
        metricOp: 'count',
        sortMode: 'label_asc',
        topN: 0,
        groupOthers: false,
        width: 4,
        colorScheme: 'teal',
      },
    });
    expect(quarterly.points.length).toBe(4);
    expect(quarterly.points[0].key).toBe('2027-Q1');

    const hist = await engine.computeWidget({
      globalSearch: '',
      filters: [],
      widget: {
        id: 'w-h',
        title: 'Histograma',
        chartType: 'bar',
        dimensionKey: 'valor_total',
        numericBins: 6,
        metricOp: 'count',
        sortMode: 'label_asc',
        topN: 0,
        groupOthers: false,
        width: 4,
        colorScheme: 'amber',
      },
    });
    expect(hist.points.length).toBe(6);
    const totalInBins = hist.points.reduce((s, p) => s + p.count, 0);
    expect(totalInBins).toBe(20_000);
  });

  it('filters 20,000 cards safely (including SQL injection payloads) and paginates explorer', async () => {
    const dash = await engine.computeDashboard({
      globalSearch: 'sp',
      filters: [
        { id: 'f1', fieldKey: 'estado', operator: 'equals', value: 'SP' },
        { id: 'f2', fieldKey: 'valor_total', operator: 'gte', value: '500000' },
        { id: 'f3', fieldKey: 'data_limite', operator: 'after', value: '2027-01-01' },
      ],
      widgets: [],
      explorer: {
        page: 1,
        pageSize: 25,
        sortBy: 'valor_total',
        sortDir: 'desc',
      },
    });

    expect(dash.matchedCards).toBeGreaterThan(0);
    expect(dash.matchedCards).toBeLessThan(20_000);
    expect(dash.explorer?.rows.length).toBe(Math.min(25, dash.matchedCards));
    for (const c of dash.explorer?.rows ?? []) {
      expect(c.fields.estado).toBe('SP');
      expect(Number(c.fields.valor_total)).toBeGreaterThanOrEqual(500000);
    }
    if ((dash.explorer?.rows.length ?? 0) >= 2) {
      expect(Number(dash.explorer!.rows[0].fields.valor_total)).toBeGreaterThanOrEqual(
        Number(dash.explorer!.rows[1].fields.valor_total)
      );
    }

    // SQL injection payload in equals filter must never break SQL or bypass filtering
    const sqli = await engine.computeDashboard({
      globalSearch: '',
      filters: [{ id: 'f-sqli', fieldKey: 'estado', operator: 'equals', value: "SP' OR '1'='1" }],
      widgets: [],
    });
    expect(sqli.matchedCards).toBe(0);

    const suggestions = await engine.getSuggestions('estado', 10);
    expect(suggestions.values[0]).toBe('SP');
  });

  it('supports incremental upsertCards and deleteCards + Parquet re-export', async () => {
    const patched = {
      ...cards[0],
      id: '9999999',
      title: 'Card Incremental DuckDB',
      fields: { ...cards[0].fields, estado: 'AC', valor_total: 123456 },
      searchText: '9999999 card incremental duckdb ac',
    };
    const up = await engine.upsertCards([patched], DEMO_PIPE_SCHEMA);
    expect(up.count).toBe(20_001);

    const del = await engine.deleteCards(['9999999']);
    expect(del.count).toBe(20_000);

    const updatedParquet = await engine.exportParquet();
    expect(updatedParquet.byteLength).toBeGreaterThan(10_000);
  });
});
