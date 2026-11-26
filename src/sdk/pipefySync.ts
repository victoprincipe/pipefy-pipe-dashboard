import type {
  NormalizedCard,
  PipeSchema,
  SyncProgress,
  SyncStrategy,
} from '../types/pipefy';
import type { PipefySdkClient } from './PipefyAppContext';
import {
  ALL_CARDS_PAGE_QUERY,
  ALL_CARDS_TAIL_QUERY,
  buildPipeSchemaFromGraphQL,
  CREATE_PIPE_REPORT_MUTATION,
  EXPORT_PIPE_REPORT_MUTATION,
  normalizeGraphQLCard,
  PIPE_META_QUERY,
  PIPE_REPORT_COLUMNS_QUERY,
  PIPE_REPORT_EXPORT_QUERY,
  SINGLE_CARD_QUERY,
} from './pipefyQueries';
import { userCacheDb } from '../cache/userIndexedDb';
import type { AnalyticsWorkerClient } from '../workers/workerClient';

const REPORT_NAME = '[PipeLens] Snapshot';
const EXPORT_COOLDOWN_MS = 90_000; // Protect 50 exports/24h Pipefy limit

export interface SyncCallbacks {
  onProgress: (progress: SyncProgress) => void;
  onSchema?: (schema: PipeSchema) => void;
  onPartialCards?: (cards: NormalizedCard[], schema: PipeSchema) => void;
}

export interface SyncResult {
  cards: NormalizedCard[];
  cardsCount: number;
  schema: PipeSchema;
  strategy: SyncStrategy;
  reportId?: string;
  serverCacheStatus?: string;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Sincronização cancelada.', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Sincronização cancelada.', 'AbortError'));
      },
      { once: true }
    );
  });
}

function getLastExportStorageKey(userId: string, pipeId: string): string {
  return `pipelens:last-export:${userId}:${pipeId}`;
}

export function getLastExportTimestamp(userId: string, pipeId: string): number | null {
  try {
    const raw = localStorage.getItem(getLastExportStorageKey(userId, pipeId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function markLastExportTimestamp(userId: string, pipeId: string) {
  try {
    localStorage.setItem(getLastExportStorageKey(userId, pipeId), String(Date.now()));
  } catch {
    // ignore storage errors
  }
}

export async function fetchPipeSchema(
  client: PipefySdkClient,
  pipeId: string
): Promise<PipeSchema> {
  const metaRes = await client.query(PIPE_META_QUERY, { pipeId });
  if (metaRes?.errors && !metaRes?.data?.pipe) {
    throw new Error(
      typeof metaRes.errors === 'string'
        ? metaRes.errors
        : metaRes.errors?.[0]?.message || 'Falha ao consultar metadados do Pipe.'
    );
  }
  const rawPipe = metaRes?.data?.pipe;
  if (!rawPipe) {
    throw new Error(`Pipe ${pipeId} não encontrado ou sem permissão.`);
  }

  let reportCols: Array<{ name: string; label: string; type: string }> = [];
  if (rawPipe.uuid) {
    const colsRes = await client.query(PIPE_REPORT_COLUMNS_QUERY, {
      pipeUuid: rawPipe.uuid,
    });
    if (Array.isArray(colsRes?.data?.pipeReportColumns)) {
      reportCols = colsRes.data.pipeReportColumns;
    }
  }

  return buildPipeSchemaFromGraphQL(rawPipe, reportCols);
}

async function runBulkReportExport(params: {
  client: PipefySdkClient;
  userId: string;
  pipeId: string;
  schema: PipeSchema;
  worker: AnalyticsWorkerClient;
  startedAt: number;
  signal?: AbortSignal;
  onProgress: (p: SyncProgress) => void;
}): Promise<{ cards: NormalizedCard[]; reportId: string; serverCacheStatus?: string }> {
  const { client, userId, pipeId, schema, worker, startedAt, signal, onProgress } = params;

  const makeProgress = (
    phase: SyncProgress['phase'],
    percent: number,
    message: string,
    loaded = 0
  ): SyncProgress => ({
    phase,
    strategy: 'bulk_report',
    loaded,
    total: schema.cardsCount,
    percent,
    message,
    startedAt,
    elapsedMs: Date.now() - startedAt,
  });

  // 1. Reuse existing [PipeLens] Snapshot report or create one dynamically
  let reportId = schema.reports.find((r) => r.name === REPORT_NAME)?.id;
  if (!reportId) {
    onProgress(makeProgress('creating_report', 8, 'Configurando relatório de snapshot no Pipefy...'));
    const colsRes = schema.uuid
      ? await client.query(PIPE_REPORT_COLUMNS_QUERY, { pipeUuid: schema.uuid })
      : null;
    const cols: Array<{ name: string; label: string }> =
      colsRes?.data?.pipeReportColumns ?? [];

    const selectedFields = cols.length > 0
      ? cols
          .map((c) => c.name)
          .filter((name) => !name.startsWith('start_at_') && !name.startsWith('end_at_') && name !== 'last_comment')
      : [
          'card_id',
          'title',
          'current_phase',
          'labels',
          'due_date',
          'created_by',
          'assignees',
          'finished_at',
          'created_at',
          'updated_at',
          'overdue',
          ...schema.fields
            .filter((f) => !f.isBuiltIn && f.reportColumnName)
            .map((f) => f.reportColumnName!),
        ];

    const createRes = await client.mutation(CREATE_PIPE_REPORT_MUTATION, {
      input: {
        name: REPORT_NAME,
        pipeId,
        fields: selectedFields,
      },
    });
    const createdId = createRes?.data?.createPipeReport?.pipeReport?.id;
    if (!createdId) {
      const msg =
        createRes?.errors?.[0]?.message ||
        'Não foi possível criar relatório de exportação automática.';
      throw new Error(msg);
    }
    reportId = String(createdId);
  }

  // 2. Trigger exportPipeReport mutation
  onProgress(
    makeProgress(
      'exporting',
      18,
      `Solicitando exportação em lote de ${schema.cardsCount.toLocaleString('pt-BR')} cards...`
    )
  );
  const expRes = await client.mutation(EXPORT_PIPE_REPORT_MUTATION, {
    input: {
      pipeId,
      pipeReportId: reportId,
    },
  });

  const exportObj = expRes?.data?.exportPipeReport?.pipeReportExport;
  if (!exportObj?.id) {
    const errMsg =
      expRes?.errors?.[0]?.message ||
      (typeof expRes?.errors === 'string' ? expRes.errors : 'Falha ao iniciar exportação.');
    throw new Error(errMsg);
  }

  markLastExportTimestamp(userId, pipeId);
  const exportId = String(exportObj.id);

  // 3. Poll pipeReportExport until fileURL appears, then download with resilient retries
  // (Pipefy may populate fileURL while storage is still finalizing the XLSX object)
  let fileURL = '';
  let buffer: ArrayBuffer | null = null;
  let serverCacheStatus = 'MISS';
  const maxWaitMs = 95_000;
  let attempt = 0;

  while (Date.now() - startedAt < maxWaitMs) {
    if (signal?.aborted) {
      throw new DOMException('Sincronização cancelada.', 'AbortError');
    }
    attempt += 1;

    if (!fileURL) {
      const delayMs = attempt <= 3 ? 2000 : 3000;
      await sleep(delayMs, signal);

      const pollRes = await client.query(PIPE_REPORT_EXPORT_QUERY, { id: exportId });
      const statusObj = pollRes?.data?.pipeReportExport;
      const state = String(statusObj?.state || '').toLowerCase();

      if (state === 'failed' || state === 'error') {
        throw new Error('Pipefy reportou erro ao gerar o arquivo de exportação.');
      }

      if (statusObj?.fileURL) {
        fileURL = statusObj.fileURL;
      } else {
        const simulatedPct = Math.min(62, 22 + attempt * 5);
        onProgress(
          makeProgress(
            'polling',
            simulatedPct,
            `Pipefy compilando exportação (${state || 'processando'}) · tentativa ${attempt}...`
          )
        );
        continue;
      }
    }

    // 4. Download via per-user proxy endpoint (retrying if storage is still propagating)
    onProgress(makeProgress('downloading', 72, 'Baixando arquivo XLSX via proxy autenticado por usuário...'));
    const proxyResp = await fetch('/api/fetch-export', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Pipefy-User-Id': userId,
        'X-Pipefy-Pipe-Id': pipeId,
      },
      body: JSON.stringify({ fileUrl: fileURL, pipeId, exportId }),
    });

    if (proxyResp.ok) {
      const candidate = await proxyResp.arrayBuffer();
      const bytes = new Uint8Array(candidate);
      if (bytes.byteLength > 100 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        serverCacheStatus = proxyResp.headers.get('X-PipeLens-Server-Cache') || 'MISS';
        buffer = candidate;
        break;
      }
    } else if (proxyResp.status !== 502 && proxyResp.status !== 404) {
      const errText = await proxyResp.text();
      throw new Error(`Proxy de exportação retornou HTTP ${proxyResp.status}: ${errText}`);
    }

    onProgress(
      makeProgress(
        'downloading',
        74,
        `Aguardando arquivo XLSX ficar disponível no storage (tentativa ${attempt})...`
      )
    );
    await sleep(3000, signal);
  }

  if (!fileURL || !buffer) {
    throw new Error('Tempo limite excedido aguardando arquivo de exportação do Pipefy.');
  }

  // 5. Parse XLSX in Web Worker (zero UI freeze!)
  onProgress(
    makeProgress(
      'parsing',
      86,
      `Processando planilha (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB) em Web Worker...`
    )
  );
  const parsed = await worker.parseXlsx(buffer, schema);

  return {
    cards: parsed.cards,
    reportId,
    serverCacheStatus,
  };
}

async function runCursorPagination(params: {
  client: PipefySdkClient;
  userId: string;
  pipeId: string;
  schema: PipeSchema;
  worker: AnalyticsWorkerClient;
  startedAt: number;
  signal?: AbortSignal;
  onProgress: (p: SyncProgress) => void;
  onPartialCards?: (cards: NormalizedCard[], schema: PipeSchema) => void;
}): Promise<NormalizedCard[]> {
  const { client, userId, pipeId, schema, worker, startedAt, signal, onProgress, onPartialCards } = params;
  const accumulated: NormalizedCard[] = [];
  let cursor: string | null = null;
  let hasNext = true;
  let pageCount = 0;

  while (hasNext) {
    if (signal?.aborted) {
      throw new DOMException('Sincronização pausada pelo usuário.', 'AbortError');
    }

    let attempt = 0;
    let pageData: any = null;
    while (attempt < 3) {
      attempt += 1;
      const res = await client.query(ALL_CARDS_PAGE_QUERY, {
        pipeId,
        first: 50,
        after: cursor,
      });
      if (res?.data?.allCards) {
        pageData = res.data.allCards;
        break;
      }
      await sleep(attempt * 1000, signal);
    }

    if (!pageData) {
      throw new Error('Falha ao paginar cards via allCards.');
    }

    const edges = pageData.edges ?? [];
    for (const edge of edges) {
      if (edge?.node) {
        accumulated.push(normalizeGraphQLCard(edge.node, schema));
      }
    }

    pageCount += 1;
    hasNext = Boolean(pageData.pageInfo?.hasNextPage);
    cursor = pageData.pageInfo?.endCursor ?? null;

    const total = Math.max(schema.cardsCount, accumulated.length);
    const pct = total > 0 ? Math.min(99, Math.round((accumulated.length / total) * 100)) : 100;

    onProgress({
      phase: 'paginating',
      strategy: 'cursor_pagination',
      loaded: accumulated.length,
      total,
      percent: pct,
      message: `Carregando lote ${pageCount} via GraphQL (${accumulated.length.toLocaleString('pt-BR')} / ${total.toLocaleString('pt-BR')} cards)...`,
      startedAt,
      elapsedMs: Date.now() - startedAt,
    });

    // Progressive UI render every 250 cards
    if (pageCount % 5 === 0 || !hasNext) {
      onPartialCards?.([...accumulated], schema);
    }

    // Periodic Parquet checkpoint during long pagination (every 1,000 cards while incomplete)
    if (hasNext && pageCount % 20 === 0) {
      await worker.setDataset([...accumulated], schema);
      const parquetBytes = await worker.exportParquet();
      await userCacheDb.saveParquetSnapshot({
        userId,
        pipeId,
        parquetBytes,
        cardsCount: accumulated.length,
        pipeSchema: schema,
        strategy: 'cursor_pagination',
        totalCardsInPipe: total,
        lastCursor: cursor,
        complete: false,
      });
    }

    if (edges.length === 0) break;
  }

  return accumulated;
}

export async function syncPipeHybrid(params: {
  client: PipefySdkClient;
  userId: string;
  pipeId: string;
  worker: AnalyticsWorkerClient;
  preferStrategy?: 'auto' | 'bulk_report' | 'cursor_pagination';
  ttlMs?: number;
  signal?: AbortSignal;
  callbacks: SyncCallbacks;
}): Promise<SyncResult> {
  const {
    client,
    userId,
    pipeId,
    worker,
    preferStrategy = 'auto',
    ttlMs,
    signal,
    callbacks,
  } = params;
  const startedAt = Date.now();

  callbacks.onProgress({
    phase: 'meta',
    strategy: 'bulk_report',
    loaded: 0,
    total: 0,
    percent: 4,
    message: 'Lendo estrutura de fases, campos e contagem do Pipe...',
    startedAt,
    elapsedMs: 0,
  });

  const schema = await fetchPipeSchema(client, pipeId);
  callbacks.onSchema?.(schema);

  if (schema.cardsCount > 0 && schema.role === null) {
    throw new Error(
      `Você ainda não ingressou neste Pipe (${schema.name}). Clique em "Join pipe" no Pipefy e clique em Sincronizar novamente.`
    );
  }

  if (schema.cardsCount === 0) {
    await worker.setDataset([], schema);
    const parquetBytes = await worker.exportParquet();
    await userCacheDb.saveParquetSnapshot({
      userId,
      pipeId,
      parquetBytes,
      cardsCount: 0,
      pipeSchema: schema,
      strategy: 'cursor_pagination',
      totalCardsInPipe: 0,
      ttlMs,
      complete: true,
    });
    return { cards: [], cardsCount: 0, schema, strategy: 'cursor_pagination' };
  }

  const useBulk =
    preferStrategy === 'bulk_report' ||
    (preferStrategy === 'auto' && schema.cardsCount >= 500);

  if (useBulk) {
    const lastExp = getLastExportTimestamp(userId, pipeId);
    if (
      preferStrategy !== 'bulk_report' &&
      lastExp &&
      Date.now() - lastExp < EXPORT_COOLDOWN_MS
    ) {
      // Recently exported; if we have cached cards, keep them or inform user
      const cached = await userCacheDb.getSnapshot(userId, pipeId, ttlMs);
      const cachedCount = cached.record?.cardsCount ?? cached.record?.cards?.length ?? 0;
      if (cached.record && cachedCount > 0) {
        if (cached.record.parquetBytes) {
          await worker.loadParquet(cached.record.parquetBytes, schema);
        } else if (cached.record.cards) {
          await worker.setDataset(cached.record.cards, schema);
        }
        return {
          cards: cached.record.cards ?? [],
          cardsCount: cachedCount,
          schema,
          strategy: 'bulk_report',
          reportId: cached.record.reportId,
          serverCacheStatus: 'COOLDOWN_SKIPPED',
        };
      }
    }

    try {
      const bulk = await runBulkReportExport({
        client,
        userId,
        pipeId,
        schema,
        worker,
        startedAt,
        signal,
        onProgress: callbacks.onProgress,
      });

      const parquetBytes = await worker.exportParquet();
      await userCacheDb.saveParquetSnapshot({
        userId,
        pipeId,
        parquetBytes,
        cardsCount: bulk.cards.length,
        pipeSchema: schema,
        strategy: 'bulk_report',
        totalCardsInPipe: Math.max(schema.cardsCount, bulk.cards.length),
        ttlMs,
        reportId: bulk.reportId,
        complete: true,
      });

      callbacks.onProgress({
        phase: 'done',
        strategy: 'bulk_report',
        loaded: bulk.cards.length,
        total: Math.max(schema.cardsCount, bulk.cards.length),
        percent: 100,
        message: `${bulk.cards.length.toLocaleString('pt-BR')} cards sincronizados no DuckDB (Parquet).`,
        startedAt,
        elapsedMs: Date.now() - startedAt,
      });

      return {
        cards: bulk.cards,
        cardsCount: bulk.cards.length,
        schema,
        strategy: 'bulk_report',
        reportId: bulk.reportId,
        serverCacheStatus: bulk.serverCacheStatus,
      };
    } catch (bulkErr) {
      if (signal?.aborted) throw bulkErr;
      console.warn(
        '[PipeLens] Bulk Report Export indisponível, acionando fallback por cursor GraphQL:',
        bulkErr
      );
      // Fall through cleanly to cursor pagination!
    }
  }

  const cards = await runCursorPagination({
    client,
    userId,
    pipeId,
    schema,
    worker,
    startedAt,
    signal,
    onProgress: callbacks.onProgress,
    onPartialCards: callbacks.onPartialCards,
  });

  await worker.setDataset(cards, schema);
  const parquetBytes = await worker.exportParquet();
  await userCacheDb.saveParquetSnapshot({
    userId,
    pipeId,
    parquetBytes,
    cardsCount: cards.length,
    pipeSchema: schema,
    strategy: 'cursor_pagination',
    totalCardsInPipe: Math.max(schema.cardsCount, cards.length),
    ttlMs,
    complete: true,
  });

  callbacks.onProgress({
    phase: 'done',
    strategy: 'cursor_pagination',
    loaded: cards.length,
    total: Math.max(schema.cardsCount, cards.length),
    percent: 100,
    message: `${cards.length.toLocaleString('pt-BR')} cards sincronizados no DuckDB (Parquet).`,
    startedAt,
    elapsedMs: Date.now() - startedAt,
  });

  return { cards, cardsCount: cards.length, schema, strategy: 'cursor_pagination' };
}

export async function syncIncrementalDelta(params: {
  client: PipefySdkClient;
  userId: string;
  pipeId: string;
  existingCount: number;
  worker: AnalyticsWorkerClient;
}): Promise<{
  schema: PipeSchema;
  upserted: NormalizedCard[];
  cardsCount: number;
  mode: 'up_to_date' | 'delta_tail' | 'needs_full_resync';
}> {
  const { client, userId, pipeId, existingCount, worker } = params;
  const schema = await fetchPipeSchema(client, pipeId);
  const diff = schema.cardsCount - existingCount;

  if (diff > 50 || diff < -10) {
    return { schema, upserted: [], cardsCount: existingCount, mode: 'needs_full_resync' };
  }

  const tailCount = Math.min(50, Math.max(10, Math.abs(diff) + 10));
  const tailRes = await client.query(ALL_CARDS_TAIL_QUERY, {
    pipeId,
    last: tailCount,
  });
  const edges = tailRes?.data?.allCards?.edges ?? [];
  const upserted: NormalizedCard[] = edges
    .filter((e: any) => e?.node)
    .map((e: any) => normalizeGraphQLCard(e.node, schema));

  if (upserted.length === 0 && diff === 0) {
    return { schema, upserted, cardsCount: existingCount, mode: 'up_to_date' };
  }

  const { count } = await worker.upsertCards(upserted, schema);
  const parquetBytes = await worker.exportParquet();
  const existing = await userCacheDb.getSnapshot(userId, pipeId);
  await userCacheDb.saveParquetSnapshot({
    userId,
    pipeId,
    parquetBytes,
    cardsCount: count,
    pipeSchema: schema,
    strategy: existing.record?.strategy ?? 'bulk_report',
    totalCardsInPipe: Math.max(schema.cardsCount, count),
    ttlMs: existing.record?.ttlMs,
    reportId: existing.record?.reportId,
    complete: existing.record?.complete ?? true,
  });

  return {
    schema,
    upserted,
    cardsCount: count,
    mode: 'delta_tail',
  };
}

export async function fetchAndPatchSingleCard(params: {
  client: PipefySdkClient;
  userId: string;
  pipeId: string;
  cardId: string;
  schema: PipeSchema;
  worker: AnalyticsWorkerClient;
}): Promise<{ card: NormalizedCard | null; cardsCount: number }> {
  const { client, userId, pipeId, cardId, schema, worker } = params;
  const res = await client.query(SINGLE_CARD_QUERY, { id: cardId });
  const node = res?.data?.card;
  if (!node) return { card: null, cardsCount: 0 };

  const card = normalizeGraphQLCard(node, schema);
  const { count } = await worker.upsertCards([card], schema);
  const parquetBytes = await worker.exportParquet();
  const existing = await userCacheDb.getSnapshot(userId, pipeId);
  await userCacheDb.saveParquetSnapshot({
    userId,
    pipeId,
    parquetBytes,
    cardsCount: count,
    pipeSchema: schema,
    strategy: existing.record?.strategy ?? 'bulk_report',
    totalCardsInPipe: Math.max(schema.cardsCount, count),
    ttlMs: existing.record?.ttlMs,
    reportId: existing.record?.reportId,
    complete: existing.record?.complete ?? true,
  });
  return { card, cardsCount: count };
}
