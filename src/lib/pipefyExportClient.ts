import type {
  PipefyFieldHint,
  PipefySyncPhase,
  PipefyUserInfo,
} from '@/types/pipefySql';

export interface PipefyGraphQLResponse<TData = Record<string, unknown>> {
  data?: TData;
  errors?: Array<{ message?: string }> | string;
}

export interface PipefySdkClient {
  app?: { pipeId?: string | number };
  pipeId?: string | number;
  pipe: () => Promise<{ id?: string; name?: string } | null>;
  query: <TData = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>
  ) => Promise<PipefyGraphQLResponse<TData>>;
  mutation: <TData = Record<string, unknown>>(
    mutation: string,
    variables?: Record<string, unknown>
  ) => Promise<PipefyGraphQLResponse<TData>>;
  get?: (
    scope: 'card' | 'pipe' | 'organization',
    visibility: 'public' | 'private',
    key: string
  ) => Promise<unknown>;
  set?: (
    scope: 'card' | 'pipe' | 'organization',
    visibility: 'public' | 'private',
    key: string,
    value: unknown
  ) => Promise<unknown>;
}

export interface PipefyGlobalSdk {
  init: () => PipefySdkClient;
  initCall: (handlers: Record<string, (...args: unknown[]) => unknown>) => void;
  render: (cb: () => void) => void;
}

declare global {
  interface Window {
    PipefyApp?: PipefyGlobalSdk;
  }
}

interface MeQueryData {
  me?: {
    id?: string | number;
    name?: string;
    email?: string;
  };
}

interface PipeMembersQueryData {
  pipe?: {
    id?: string | number;
    members?: Array<{
      role_name?: string | null;
      user?: {
        id?: string | number;
        name?: string;
        email?: string;
      } | null;
    }>;
  };
}

interface PipeMetaQueryData {
  pipe?: {
    id?: string | number;
    uuid?: string;
    name?: string;
    cards_count?: number;
    role?: string | null;
    start_form_fields?: Array<{ id: string; label: string; type?: string }>;
    reports?: Array<{ id: string | number; name: string }>;
  };
}

interface PipeReportColumnsData {
  pipeReportColumns?: Array<{ name: string; label?: string; type?: string }>;
}

interface CreatePipeReportData {
  createPipeReport?: {
    pipeReport?: { id?: string | number; name?: string };
  };
}

interface ExportPipeReportData {
  exportPipeReport?: {
    pipeReportExport?: { id?: string | number; state?: string };
  };
}

interface PipeReportExportData {
  pipeReportExport?: {
    id?: string | number;
    state?: string;
    fileURL?: string;
  };
}

const REPORT_NAME = '[PipeLens] Snapshot';

const ME_QUERY = `
  query Me {
    me {
      id
      name
      email
    }
  }
`;

const PIPE_MEMBERS_QUERY = `
  query PipeMembers($pipeId: ID!) {
    pipe(id: $pipeId) {
      id
      members {
        role_name
        user {
          id
          name
          email
        }
      }
    }
  }
`;

const PIPE_META_QUERY = `
  query PipeMeta($pipeId: ID!) {
    pipe(id: $pipeId) {
      id
      uuid
      name
      cards_count
      role
      start_form_fields {
        id
        label
        type
      }
      reports {
        id
        name
      }
    }
  }
`;

const PIPE_REPORT_COLUMNS_QUERY = `
  query PipeReportColumns($pipeUuid: String!) {
    pipeReportColumns(pipeUuid: $pipeUuid) {
      name
      label
      type
    }
  }
`;

const CREATE_PIPE_REPORT_MUTATION = `
  mutation CreatePipeReport($input: CreatePipeReportInput!) {
    createPipeReport(input: $input) {
      pipeReport {
        id
        name
      }
    }
  }
`;

const EXPORT_PIPE_REPORT_MUTATION = `
  mutation ExportPipeReport($input: ExportPipeReportInput!) {
    exportPipeReport(input: $input) {
      pipeReportExport {
        id
        state
      }
    }
  }
`;

const PIPE_REPORT_EXPORT_QUERY = `
  query PipeReportExport($id: ID!) {
    pipeReportExport(id: $id) {
      id
      state
      fileURL
    }
  }
`;

function extractGraphQLError(errors: PipefyGraphQLResponse['errors'], fallback: string): string {
  if (typeof errors === 'string' && errors.trim()) return errors;
  if (Array.isArray(errors) && errors[0]?.message) return errors[0].message;
  return fallback;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Operação cancelada.', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Operação cancelada.', 'AbortError'));
      },
      { once: true }
    );
  });
}

export function resolveNumericPipeId(client: PipefySdkClient): string {
  const fromApp = client.app?.pipeId;
  if (fromApp !== undefined && fromApp !== null && /^\d+$/.test(String(fromApp))) {
    return String(fromApp);
  }
  const fromClient = client.pipeId;
  if (fromClient !== undefined && fromClient !== null && /^\d+$/.test(String(fromClient))) {
    return String(fromClient);
  }
  if (typeof document !== 'undefined' && document.referrer) {
    const m = document.referrer.match(/\/pipes\/(\d+)/);
    if (m?.[1]) return m[1];
  }
  return '';
}

export async function fetchPipefyUser(client: PipefySdkClient): Promise<PipefyUserInfo> {
  const res = await client.query<MeQueryData>(ME_QUERY);
  const me = res?.data?.me;
  if (!me?.id) {
    throw new Error('Não foi possível identificar o usuário logado no Pipefy.');
  }
  return {
    id: String(me.id),
    name: String(me.name || 'Usuário Pipefy'),
    email: me.email ? String(me.email) : undefined,
  };
}

export async function fetchPipefyMembers(
  client: PipefySdkClient,
  pipeId: string
): Promise<PipefyUserInfo[]> {
  const res = await client.query<PipeMembersQueryData>(PIPE_MEMBERS_QUERY, { pipeId });
  const members = res?.data?.pipe?.members;
  if (!Array.isArray(members) || members.length === 0) {
    return [];
  }

  const byId = new Map<string, PipefyUserInfo>();
  for (const member of members) {
    const u = member?.user;
    if (!u?.id) continue;
    const id = String(u.id).trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      id,
      name: String(u.name || 'Usuário Pipefy'),
      email: u.email ? String(u.email) : undefined,
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR')
  );
}

export interface PipeExportMeta {
  pipeId: string;
  uuid?: string;
  name: string;
  cardsCount: number;
  role: string | null;
  fieldHints: PipefyFieldHint[];
  reports: Array<{ id: string; name: string }>;
}

export async function fetchPipeExportMeta(
  client: PipefySdkClient,
  pipeId: string
): Promise<PipeExportMeta> {
  const res = await client.query<PipeMetaQueryData>(PIPE_META_QUERY, { pipeId });
  const pipe = res?.data?.pipe;
  if (!pipe) {
    throw new Error(extractGraphQLError(res?.errors, `Pipe ${pipeId} não encontrado.`));
  }

  const fieldHints: PipefyFieldHint[] = Array.isArray(pipe.start_form_fields)
    ? pipe.start_form_fields.map((f) => ({
        label: String(f.label),
        pipefyType: String(f.type || 'short_text'),
      }))
    : [];

  const reports = Array.isArray(pipe.reports)
    ? pipe.reports.map((r) => ({
        id: String(r.id),
        name: String(r.name),
      }))
    : [];

  return {
    pipeId: String(pipe.id ?? pipeId),
    uuid: pipe.uuid ? String(pipe.uuid) : undefined,
    name: String(pipe.name || `Pipe #${pipeId}`),
    cardsCount: Number(pipe.cards_count || 0),
    role: pipe.role ?? null,
    fieldHints,
    reports,
  };
}

export async function downloadPipeXlsxDirect(params: {
  client: PipefySdkClient;
  pipeId: string;
  signal?: AbortSignal;
  onStatus?: (phase: PipefySyncPhase, message: string) => void;
}): Promise<{
  buffer: ArrayBuffer;
  meta: PipeExportMeta;
  reportId: string;
  exportId: string;
}> {
  const { client, pipeId, signal, onStatus } = params;
  const startedAt = Date.now();

  onStatus?.('fetching_meta', 'Lendo estrutura e relatórios do Pipe via SDK...');
  const meta = await fetchPipeExportMeta(client, pipeId);

  if (meta.cardsCount > 0 && meta.role === null) {
    throw new Error(
      `Você ainda não ingressou neste Pipe (${meta.name}). Clique em "Join pipe" no Pipefy.`
    );
  }

  let reportId = meta.reports.find((r) => r.name === REPORT_NAME)?.id;
  if (!reportId) {
    onStatus?.('creating_report', 'Criando relatório de exportação automática no Pipefy...');
    let fields = [
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
    ];

    if (meta.uuid) {
      const colsRes = await client.query<PipeReportColumnsData>(PIPE_REPORT_COLUMNS_QUERY, {
        pipeUuid: meta.uuid,
      });
      const cols = colsRes?.data?.pipeReportColumns;
      if (Array.isArray(cols) && cols.length > 0) {
        fields = cols
          .map((c) => String(c.name))
          .filter(
            (name) =>
              !name.startsWith('start_at_') &&
              !name.startsWith('end_at_') &&
              name !== 'last_comment'
          );
      }
    }

    const createRes = await client.mutation<CreatePipeReportData>(CREATE_PIPE_REPORT_MUTATION, {
      input: {
        name: REPORT_NAME,
        pipeId: meta.pipeId,
        fields,
      },
    });
    const createdId = createRes?.data?.createPipeReport?.pipeReport?.id;
    if (!createdId) {
      throw new Error(
        extractGraphQLError(
          createRes?.errors,
          'Falha ao criar relatório para exportação .xlsx.'
        )
      );
    }
    reportId = String(createdId);
  }

  onStatus?.(
    'exporting',
    `Solicitando geração do .xlsx (${meta.cardsCount.toLocaleString('pt-BR')} cards)...`
  );
  const expRes = await client.mutation<ExportPipeReportData>(EXPORT_PIPE_REPORT_MUTATION, {
    input: {
      pipeId: meta.pipeId,
      pipeReportId: reportId,
    },
  });

  const exportId = expRes?.data?.exportPipeReport?.pipeReportExport?.id;
  if (!exportId) {
    throw new Error(
      extractGraphQLError(expRes?.errors, 'Falha ao iniciar exportPipeReport.')
    );
  }

  let fileURL = '';
  let attempt = 0;
  const maxWaitMs = 95_000;

  while (Date.now() - startedAt < maxWaitMs) {
    if (signal?.aborted) {
      throw new DOMException('Sincronização cancelada.', 'AbortError');
    }
    attempt += 1;

    if (!fileURL) {
      await sleep(attempt <= 3 ? 2000 : 3000, signal);
      const pollRes = await client.query<PipeReportExportData>(PIPE_REPORT_EXPORT_QUERY, {
        id: String(exportId),
      });
      const statusObj = pollRes?.data?.pipeReportExport;
      const state = String(statusObj?.state || '').toLowerCase();

      if (state === 'failed' || state === 'error') {
        throw new Error('O Pipefy reportou falha ao gerar o arquivo .xlsx.');
      }

      if (statusObj?.fileURL) {
        fileURL = String(statusObj.fileURL);
      } else {
        onStatus?.(
          'polling',
          `Aguardando Pipefy gerar URL do relatório (${state || 'processando'})...`
        );
        continue;
      }
    }

    onStatus?.(
      'downloading',
      `Baixando .xlsx direto do Pipefy (tentativa ${attempt})...`
    );
    const resp = await fetch(fileURL, { cache: 'no-store', signal });
    if (resp.ok) {
      const candidate = await resp.arrayBuffer();
      const bytes = new Uint8Array(candidate);
      // Validate ZIP/XLSX magic header ("PK")
      if (bytes.byteLength > 100 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        return {
          buffer: candidate,
          meta,
          reportId,
          exportId: String(exportId),
        };
      }
    } else if (resp.status !== 404 && resp.status !== 502) {
      throw new Error(`Download do .xlsx falhou com HTTP ${resp.status}.`);
    }

    await sleep(2500, signal);
  }

  throw new Error('Tempo limite excedido aguardando o arquivo .xlsx ficar disponível.');
}
