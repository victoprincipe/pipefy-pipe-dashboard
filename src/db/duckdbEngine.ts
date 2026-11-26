import type {
  AggregatedPoint,
  AggregationOp,
  DateGranularity,
  ExplorerQuery,
  ExplorerResult,
  FilterRule,
  WidgetComputationResult,
  WidgetConfig,
} from '../types/dashboard';
import type { NormalizedCard, PipeFieldMeta, PipeSchema } from '../types/pipefy';
import { formatCompactRangeEdge, formatDateBucketKeyLabel } from '../utils/cardHelpers';
import { parseFlexibleDate, parseFlexibleNumber } from '../utils/xlsxNormalizer';
import type { DuckDbBackend } from './duckdbBackend';
import {
  buildColumnCatalog,
  buildCreateTableSql,
  buildReadJsonColumnsSql,
  flattenCardToRow,
  getColumnMapping,
  hydrateRowToCard,
  quoteIdent,
  sqlNum,
  sqlStr,
  type ColumnMapping,
  type SchemaCatalog,
} from './schemaCatalog';

const textEncoder = new TextEncoder();

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function buildNumericExpr(mapping: ColumnMapping): string {
  const ident = quoteIdent(mapping.colName);
  return mapping.sqlType === 'DOUBLE'
    ? ident
    : `TRY_CAST(CAST(${ident} AS VARCHAR) AS DOUBLE)`;
}

function buildDateCastExpr(ident: string): string {
  return `TRY_CAST(LEFT(${ident}, 10) AS DATE)`;
}

function buildMetricAggExpr(
  op: AggregationOp,
  metricFieldKey: string | undefined,
  catalog: SchemaCatalog
): string {
  if (op === 'count') {
    return 'COUNT(*)::DOUBLE';
  }
  const targetKey = metricFieldKey || '__id';
  const mapping = getColumnMapping(catalog, targetKey);
  if (!mapping) {
    return '0::DOUBLE';
  }

  const ident = quoteIdent(mapping.colName);
  if (op === 'distinct') {
    return `COUNT(DISTINCT NULLIF(TRIM(CAST(${ident} AS VARCHAR)), ''))::DOUBLE`;
  }

  const numExpr = buildNumericExpr(mapping);
  switch (op) {
    case 'sum':
      return `COALESCE(SUM(${numExpr}), 0)::DOUBLE`;
    case 'avg':
      return `COALESCE(AVG(${numExpr}), 0)::DOUBLE`;
    case 'median':
      return `COALESCE(MEDIAN(${numExpr}), 0)::DOUBLE`;
    case 'min':
      return `COALESCE(MIN(${numExpr}), 0)::DOUBLE`;
    case 'max':
      return `COALESCE(MAX(${numExpr}), 0)::DOUBLE`;
  }
}

export function buildWhereClauseSql(
  globalSearch: string,
  filters: FilterRule[],
  catalog: SchemaCatalog
): string {
  const clauses: string[] = [];
  const q = globalSearch.trim().toLowerCase();
  if (q) {
    clauses.push(`CONTAINS(search_text, ${sqlStr(q)})`);
  }

  for (const rule of filters) {
    const isPresenceRule = rule.operator === 'is_empty' || rule.operator === 'not_empty';
    if (!isPresenceRule && rule.value.trim() === '') continue;

    const mapping = getColumnMapping(catalog, rule.fieldKey);
    if (!mapping) {
      clauses.push('FALSE');
      continue;
    }

    const ident = quoteIdent(mapping.colName);
    const isStringCol = mapping.sqlType === 'VARCHAR';
    const emptyExpr = isStringCol ? `(${ident} IS NULL OR ${ident} = '')` : `${ident} IS NULL`;
    const nonEmptyExpr = isStringCol ? `(${ident} IS NOT NULL AND ${ident} <> '')` : `${ident} IS NOT NULL`;

    if (rule.operator === 'is_empty') {
      clauses.push(emptyExpr);
      continue;
    }
    if (rule.operator === 'not_empty') {
      clauses.push(nonEmptyExpr);
      continue;
    }

    const targetTrimmed = rule.value.trim();
    const targetLower = targetTrimmed.toLowerCase();

    switch (rule.operator) {
      case 'equals':
      case 'not_equals': {
        if (mapping.sqlType === 'DOUBLE') {
          const parsedNum = parseFlexibleNumber(targetTrimmed);
          if (parsedNum !== null) {
            clauses.push(
              rule.operator === 'equals'
                ? `${ident} = ${sqlNum(parsedNum)}`
                : `(${ident} IS NOT NULL AND ${ident} <> ${sqlNum(parsedNum)})`
            );
            break;
          }
        }
        const cmpOp = rule.operator === 'equals' ? '=' : '<>';
        clauses.push(`(${nonEmptyExpr} AND LOWER(CAST(${ident} AS VARCHAR)) ${cmpOp} ${sqlStr(targetLower)})`);
        break;
      }

      case 'contains':
        clauses.push(`(${nonEmptyExpr} AND CONTAINS(LOWER(CAST(${ident} AS VARCHAR)), ${sqlStr(targetLower)}))`);
        break;

      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
      case 'between': {
        const n1 = parseFlexibleNumber(targetTrimmed);
        if (n1 === null) {
          clauses.push('FALSE');
          break;
        }
        const numExpr = buildNumericExpr(mapping);
        if (rule.operator === 'between') {
          const n2 = parseFlexibleNumber(rule.valueEnd ?? '');
          if (n2 === null) {
            clauses.push('FALSE');
            break;
          }
          const lo = Math.min(n1, n2);
          const hi = Math.max(n1, n2);
          clauses.push(`(${numExpr} >= ${sqlNum(lo)} AND ${numExpr} <= ${sqlNum(hi)})`);
        } else {
          const opMap: Record<'gt' | 'gte' | 'lt' | 'lte', string> = {
            gt: '>',
            gte: '>=',
            lt: '<',
            lte: '<=',
          };
          clauses.push(`${numExpr} ${opMap[rule.operator]} ${sqlNum(n1)}`);
        }
        break;
      }

      case 'before':
      case 'after': {
        const target = parseFlexibleDate(targetTrimmed);
        if (target.ms === null) {
          clauses.push('FALSE');
          break;
        }
        const cardTsExpr = `CASE WHEN LENGTH(${ident}) = 10 THEN TRY_CAST(${ident} || 'T12:00:00Z' AS TIMESTAMPTZ) ELSE TRY_CAST(${ident} AS TIMESTAMPTZ) END`;
        const targetTsExpr = `TRY_CAST(${sqlStr(new Date(target.ms).toISOString())} AS TIMESTAMPTZ)`;
        const cmpOp = rule.operator === 'before' ? '<=' : '>=';
        clauses.push(`(${nonEmptyExpr} AND ${cardTsExpr} ${cmpOp} ${targetTsExpr})`);
        break;
      }
    }
  }

  return clauses.length > 0 ? clauses.join(' AND ') : 'TRUE';
}

export class DuckDbAnalyticsEngine {
  private backendPromise: Promise<DuckDbBackend> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private schema: PipeSchema | null = null;
  private catalog: SchemaCatalog | null = null;
  private totalCards = 0;

  constructor(private readonly backendFactory: () => Promise<DuckDbBackend>) {}

  private enqueue<T>(task: (backend: DuckDbBackend) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      if (!this.backendPromise) {
        this.backendPromise = this.backendFactory();
      }
      const backend = await this.backendPromise;
      return task(backend);
    });
    this.queue = next.catch(() => {});
    return next;
  }

  private async ingestCardsToTable(
    backend: DuckDbBackend,
    cards: NormalizedCard[],
    catalog: SchemaCatalog,
    tempFilename: string
  ): Promise<void> {
    if (cards.length === 0) return;
    const ndjson = cards.map((card) => JSON.stringify(flattenCardToRow(card, catalog))).join('\n');
    const bytes = textEncoder.encode(ndjson);
    const colsSpec = buildReadJsonColumnsSql(catalog);

    await backend.registerFileBuffer(tempFilename, bytes);
    try {
      await backend.query(
        `INSERT INTO cards SELECT * FROM read_json(${sqlStr(tempFilename)}, format='newline_delimited', columns=${colsSpec})`
      );
    } finally {
      await backend.dropFile(tempFilename).catch(() => {});
    }
  }

  loadCards(cards: NormalizedCard[], schema: PipeSchema): Promise<{ count: number; loadMs: number }> {
    return this.enqueue(async (backend) => {
      const t0 = nowMs();
      const catalog = buildColumnCatalog(schema);
      await backend.query(buildCreateTableSql(catalog));
      await this.ingestCardsToTable(backend, cards, catalog, 'ingest.ndjson');
      this.schema = schema;
      this.catalog = catalog;
      this.totalCards = cards.length;
      const t1 = nowMs();
      return { count: cards.length, loadMs: Math.round((t1 - t0) * 100) / 100 };
    });
  }

  loadParquet(parquetBytes: Uint8Array, schema: PipeSchema): Promise<{ count: number; loadMs: number }> {
    return this.enqueue(async (backend) => {
      const t0 = nowMs();
      const catalog = buildColumnCatalog(schema);
      await backend.registerFileBuffer('snapshot.parquet', new Uint8Array(parquetBytes));
      try {
        await backend.query("CREATE OR REPLACE TABLE cards AS SELECT * FROM read_parquet('snapshot.parquet')");
      } finally {
        await backend.dropFile('snapshot.parquet').catch(() => {});
      }
      const rows = await backend.query('SELECT COUNT(*)::DOUBLE AS cnt FROM cards');
      const count = toNum(rows[0]?.cnt);
      this.schema = schema;
      this.catalog = catalog;
      this.totalCards = count;
      const t1 = nowMs();
      return { count, loadMs: Math.round((t1 - t0) * 100) / 100 };
    });
  }

  exportParquet(): Promise<Uint8Array> {
    return this.enqueue(async (backend) => {
      if (!this.catalog) {
        throw new Error('Tabela DuckDB ainda não inicializada para exportação Parquet.');
      }
      const outFile = 'snapshot_out.parquet';
      try {
        try {
          await backend.query(`COPY cards TO ${sqlStr(outFile)} (FORMAT PARQUET, COMPRESSION ZSTD)`);
        } catch {
          await backend.query(`COPY cards TO ${sqlStr(outFile)} (FORMAT PARQUET)`);
        }
        return await backend.copyFileToBuffer(outFile);
      } finally {
        await backend.dropFile(outFile).catch(() => {});
      }
    });
  }

  upsertCards(cards: NormalizedCard[], schema: PipeSchema): Promise<{ count: number }> {
    return this.enqueue(async (backend) => {
      if (!this.catalog || !this.schema) {
        const catalog = buildColumnCatalog(schema);
        await backend.query(buildCreateTableSql(catalog));
        await this.ingestCardsToTable(backend, cards, catalog, 'delta.ndjson');
        this.schema = schema;
        this.catalog = catalog;
        this.totalCards = cards.length;
        return { count: this.totalCards };
      }

      if (cards.length === 0) {
        return { count: this.totalCards };
      }

      const catalog = this.catalog;
      const chunkSize = 500;
      for (let i = 0; i < cards.length; i += chunkSize) {
        const idsList = cards
          .slice(i, i + chunkSize)
          .map((c) => sqlStr(String(c.id)))
          .join(', ');
        await backend.query(`DELETE FROM cards WHERE id IN (${idsList})`);
      }

      await this.ingestCardsToTable(backend, cards, catalog, 'delta.ndjson');
      const rows = await backend.query('SELECT COUNT(*)::DOUBLE AS cnt FROM cards');
      this.totalCards = toNum(rows[0]?.cnt);
      return { count: this.totalCards };
    });
  }

  deleteCards(ids: string[]): Promise<{ count: number }> {
    return this.enqueue(async (backend) => {
      if (!this.catalog || ids.length === 0) {
        return { count: this.totalCards };
      }
      const chunkSize = 500;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const idsList = ids
          .slice(i, i + chunkSize)
          .map((id) => sqlStr(String(id)))
          .join(', ');
        await backend.query(`DELETE FROM cards WHERE id IN (${idsList})`);
      }
      const rows = await backend.query('SELECT COUNT(*)::DOUBLE AS cnt FROM cards');
      this.totalCards = toNum(rows[0]?.cnt);
      return { count: this.totalCards };
    });
  }

  private async runWidgetSql(
    backend: DuckDbBackend,
    whereSql: string,
    widget: WidgetConfig,
    schema: PipeSchema,
    catalog: SchemaCatalog
  ): Promise<WidgetComputationResult> {
    const t0 = nowMs();
    const aggExpr = buildMetricAggExpr(widget.metricOp, widget.metricFieldKey, catalog);

    const summaryRows = await backend.query(
      `SELECT COUNT(*)::DOUBLE AS total_matched, ${aggExpr} AS summary_value FROM cards WHERE ${whereSql}`
    );
    const totalMatched = toNum(summaryRows[0]?.total_matched);
    const summaryValue = toNum(summaryRows[0]?.summary_value);

    if (widget.chartType === 'kpi') {
      const t1 = nowMs();
      return {
        widgetId: widget.id,
        points: [
          {
            key: 'total',
            label: widget.title,
            value: summaryValue,
            count: totalMatched,
            sharePercent: 100,
          },
        ],
        totalMatched,
        summaryValue,
        durationMs: Math.round((t1 - t0) * 100) / 100,
      };
    }

    const fieldMeta: PipeFieldMeta | undefined = schema.fields.find(
      (f) => f.key === widget.dimensionKey
    );
    const dimMapping = getColumnMapping(catalog, widget.dimensionKey);
    if (!dimMapping) {
      const t1 = nowMs();
      return {
        widgetId: widget.id,
        points: [],
        totalMatched,
        summaryValue,
        durationMs: Math.round((t1 - t0) * 100) / 100,
      };
    }

    const dimIdent = quoteIdent(dimMapping.colName);
    const isDateDim = fieldMeta?.kind === 'date';
    const isNumericDim = fieldMeta?.kind === 'number';
    let points: AggregatedPoint[] = [];
    let grandTotalValue = 0;

    if (isDateDim) {
      const granularity: DateGranularity = widget.dateGranularity ?? 'month';
      const dateExpr = buildDateCastExpr(dimIdent);
      let fmtExpr = `strftime(${dateExpr}, '%Y-%m')`;
      if (granularity === 'year') {
        fmtExpr = `strftime(${dateExpr}, '%Y')`;
      } else if (granularity === 'quarter') {
        fmtExpr = `strftime(${dateExpr}, '%Y') || '-Q' || CAST(quarter(${dateExpr}) AS VARCHAR)`;
      } else if (granularity === 'week') {
        fmtExpr = `strftime(CAST(date_trunc('week', ${dateExpr}) AS DATE), '%Y-%m-%d')`;
      } else if (granularity === 'day') {
        fmtExpr = `strftime(${dateExpr}, '%Y-%m-%d')`;
      }

      const grouped = await backend.query(
        `SELECT COALESCE(${fmtExpr}, '__sem_data') AS bucket_key, COUNT(*)::DOUBLE AS cnt, ${aggExpr} AS val FROM cards WHERE ${whereSql} GROUP BY 1`
      );
      for (const r of grouped) {
        const key = String(r.bucket_key ?? '__sem_data');
        const value = toNum(r.val);
        grandTotalValue += value;
        points.push({
          key,
          label: formatDateBucketKeyLabel(key, granularity),
          value,
          count: toNum(r.cnt),
          sharePercent: 0,
        });
      }
    } else if (isNumericDim) {
      const numBins = Math.max(3, Math.min(20, widget.numericBins ?? 6));
      const dimNumExpr = buildNumericExpr(dimMapping);
      const minMaxRows = await backend.query(
        `SELECT MIN(${dimNumExpr})::DOUBLE AS min_v, MAX(${dimNumExpr})::DOUBLE AS max_v FROM cards WHERE ${whereSql} AND ${dimNumExpr} IS NOT NULL`
      );
      const rawMin = minMaxRows[0]?.min_v;
      const rawMax = minMaxRows[0]?.max_v;
      let binMin = rawMin === null || rawMin === undefined ? 0 : toNum(rawMin);
      let binMax = rawMax === null || rawMax === undefined ? 100 : toNum(rawMax);
      if (rawMin === null || rawMin === undefined) {
        binMin = 0;
        binMax = 100;
      } else if (binMax === binMin) {
        binMax = binMin + 1;
      }
      const binSize = (binMax - binMin) / numBins;
      const binIdxExpr = `CASE WHEN ${dimNumExpr} IS NULL THEN NULL ELSE CAST(LEAST(${numBins - 1}, GREATEST(0, FLOOR((${dimNumExpr} - ${sqlNum(binMin)}) / ${sqlNum(binSize)}))) AS INTEGER) END`;

      const grouped = await backend.query(
        `SELECT ${binIdxExpr} AS bin_idx, COUNT(*)::DOUBLE AS cnt, ${aggExpr} AS val FROM cards WHERE ${whereSql} GROUP BY 1`
      );
      for (const r of grouped) {
        const value = toNum(r.val);
        const count = toNum(r.cnt);
        grandTotalValue += value;
        if (r.bin_idx === null || r.bin_idx === undefined) {
          points.push({
            key: '__sem_valor',
            label: 'Sem valor',
            value,
            count,
            sharePercent: 0,
          });
        } else {
          const idx = Math.trunc(toNum(r.bin_idx));
          const lo = binMin + idx * binSize;
          const hi = lo + binSize;
          points.push({
            key: `${String(idx).padStart(2, '0')}:${lo.toFixed(0)}-${hi.toFixed(0)}`,
            label: `${formatCompactRangeEdge(lo)} – ${formatCompactRangeEdge(hi)}`,
            value,
            count,
            sharePercent: 0,
          });
        }
      }
    } else {
      const catKeyExpr =
        dimMapping.sqlType === 'VARCHAR'
          ? `COALESCE(NULLIF(${dimIdent}, ''), 'Não informado')`
          : `COALESCE(CAST(${dimIdent} AS VARCHAR), 'Não informado')`;
      const grouped = await backend.query(
        `SELECT ${catKeyExpr} AS bucket_key, COUNT(*)::DOUBLE AS cnt, ${aggExpr} AS val FROM cards WHERE ${whereSql} GROUP BY 1`
      );
      for (const r of grouped) {
        const key = String(r.bucket_key ?? 'Não informado');
        const value = toNum(r.val);
        grandTotalValue += value;
        points.push({
          key,
          label: key,
          value,
          count: toNum(r.cnt),
          sharePercent: 0,
        });
      }
    }

    if (isDateDim || isNumericDim) {
      if (widget.sortMode === 'value_desc') {
        points.sort((a, b) => b.value - a.value);
      } else if (widget.sortMode === 'value_asc') {
        points.sort((a, b) => a.value - b.value);
      } else if (widget.sortMode === 'label_desc') {
        points.sort((a, b) => b.key.localeCompare(a.key));
      } else {
        points.sort((a, b) => a.key.localeCompare(b.key));
      }
    } else {
      switch (widget.sortMode) {
        case 'value_desc':
          points.sort((a, b) => b.value - a.value);
          break;
        case 'value_asc':
          points.sort((a, b) => a.value - b.value);
          break;
        case 'label_asc':
          points.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
          break;
        case 'label_desc':
          points.sort((a, b) => b.label.localeCompare(a.label, 'pt-BR'));
          break;
      }
    }

    if (widget.topN > 0 && points.length > widget.topN) {
      const head = points.slice(0, widget.topN);
      if (widget.groupOthers && (widget.metricOp === 'count' || widget.metricOp === 'sum')) {
        const tail = points.slice(widget.topN);
        const othersVal = tail.reduce((s, p) => s + p.value, 0);
        const othersCount = tail.reduce((s, p) => s + p.count, 0);
        head.push({
          key: '__others',
          label: `Outros (${tail.length})`,
          value: othersVal,
          count: othersCount,
          sharePercent: 0,
        });
      }
      points = head;
    }

    const denom = grandTotalValue !== 0 ? grandTotalValue : 1;
    for (let i = 0; i < points.length; i += 1) {
      points[i].sharePercent = Math.round((points[i].value / denom) * 1000) / 10;
    }

    const t1 = nowMs();
    return {
      widgetId: widget.id,
      points,
      totalMatched,
      summaryValue,
      durationMs: Math.round((t1 - t0) * 100) / 100,
    };
  }

  private async runExplorerPageSql(
    backend: DuckDbBackend,
    whereSql: string,
    query: ExplorerQuery,
    catalog: SchemaCatalog
  ): Promise<ExplorerResult> {
    const t0 = nowMs();
    const dir = query.sortDir === 'asc' ? 'ASC' : 'DESC';
    const mapping = getColumnMapping(catalog, query.sortBy) ?? getColumnMapping(catalog, '__id')!;
    const colIdent = quoteIdent(mapping.colName);
    const orderClause =
      mapping.fieldKey === '__id'
        ? `TRY_CAST(id AS BIGINT) ${dir} NULLS LAST, id ${dir}`
        : `${colIdent} ${dir} NULLS LAST`;

    const limit = Math.max(1, Math.min(500, Math.trunc(query.pageSize)));
    const offset = Math.max(0, (Math.max(1, Math.trunc(query.page)) - 1) * limit);

    const [countRows, dataRows] = await Promise.all([
      backend.query(`SELECT COUNT(*)::DOUBLE AS cnt FROM cards WHERE ${whereSql}`),
      backend.query(
        `SELECT * FROM cards WHERE ${whereSql} ORDER BY ${orderClause} LIMIT ${limit} OFFSET ${offset}`
      ),
    ]);

    const total = toNum(countRows[0]?.cnt);
    const rows = dataRows.map((r) => hydrateRowToCard(r, catalog));
    const t1 = nowMs();

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      rows,
      durationMs: Math.round((t1 - t0) * 100) / 100,
    };
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
    return this.enqueue(async (backend) => {
      if (!this.schema || !this.catalog) {
        throw new Error('Dataset ainda não inicializado no DuckDB-WASM.');
      }
      const t0 = nowMs();
      const whereSql = buildWhereClauseSql(params.globalSearch, params.filters, this.catalog);
      const countRows = await backend.query(
        `SELECT COUNT(*)::DOUBLE AS cnt FROM cards WHERE ${whereSql}`
      );
      const matchedCards = toNum(countRows[0]?.cnt);

      const results: WidgetComputationResult[] = [];
      for (const widget of params.widgets) {
        results.push(
          await this.runWidgetSql(backend, whereSql, widget, this.schema, this.catalog)
        );
      }

      const explorer = params.explorer
        ? await this.runExplorerPageSql(backend, whereSql, params.explorer, this.catalog)
        : undefined;

      const t1 = nowMs();
      return {
        totalCards: this.totalCards,
        matchedCards,
        results,
        explorer,
        totalMs: Math.round((t1 - t0) * 100) / 100,
      };
    });
  }

  computeWidget(params: {
    globalSearch: string;
    filters: FilterRule[];
    widget: WidgetConfig;
  }): Promise<WidgetComputationResult> {
    return this.enqueue(async (backend) => {
      if (!this.schema || !this.catalog) {
        throw new Error('Dataset ainda não inicializado no DuckDB-WASM.');
      }
      const whereSql = buildWhereClauseSql(params.globalSearch, params.filters, this.catalog);
      return this.runWidgetSql(backend, whereSql, params.widget, this.schema, this.catalog);
    });
  }

  getSuggestions(fieldKey: string, limit = 25): Promise<{ values: string[] }> {
    return this.enqueue(async (backend) => {
      if (!this.catalog) {
        return { values: [] };
      }
      const mapping = getColumnMapping(this.catalog, fieldKey);
      if (!mapping) {
        return { values: [] };
      }
      const ident = quoteIdent(mapping.colName);
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
      const rows = await backend.query(
        `SELECT CAST(${ident} AS VARCHAR) AS val, COUNT(*)::DOUBLE AS cnt FROM cards WHERE ${ident} IS NOT NULL AND CAST(${ident} AS VARCHAR) <> '' GROUP BY 1 ORDER BY cnt DESC, val ASC LIMIT ${safeLimit}`
      );
      return { values: rows.map((r) => String(r.val)) };
    });
  }

  getFilteredCards(
    globalSearch: string,
    filters: FilterRule[],
    limit?: number
  ): Promise<{ cards: NormalizedCard[] }> {
    return this.enqueue(async (backend) => {
      if (!this.catalog) {
        return { cards: [] };
      }
      const whereSql = buildWhereClauseSql(globalSearch, filters, this.catalog);
      const limitClause =
        limit && Number.isFinite(limit) ? ` LIMIT ${Math.max(1, Math.trunc(limit))}` : '';
      const rows = await backend.query(`SELECT * FROM cards WHERE ${whereSql}${limitClause}`);
      return { cards: rows.map((r) => hydrateRowToCard(r, this.catalog!)) };
    });
  }

  async terminate(): Promise<void> {
    if (!this.backendPromise) return;
    const p = this.backendPromise;
    this.backendPromise = null;
    try {
      const backend = await p;
      await backend.close();
    } catch {
      // ignore close errors
    }
  }
}
