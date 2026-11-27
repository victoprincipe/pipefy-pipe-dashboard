export const REMOTION_FPS = 30;
export const REMOTION_DURATION_IN_FRAMES = 1350;

export interface InterviewChapter {
  id: string;
  index: number;
  title: string;
  shortLabel: string;
  startFrame: number;
  endFrame: number;
  durationLabel: string;
  headline: string;
  talkingPoint: string;
  keyFiles: string[];
}

export const INTERVIEW_CHAPTERS: InterviewChapter[] = [
  {
    id: 'problem',
    index: 1,
    title: 'O Problema (~20k Cards)',
    shortLabel: '01 · Problema 20k',
    startFrame: 0,
    endFrame: 270,
    durationLabel: '0:00 – 0:09',
    headline: 'Por que evitar ~400 requisições paginadas GraphQL?',
    talkingPoint:
      'Consultar 20 mil cards via allCards (limite típico de 50/página) geraria ~400 chamadas sequenciais sujeitas a rate limit. Em vez disso, disparamos um único relatório "[PipeLens] Snapshot" via SDK e baixamos o .xlsx em lote.',
    keyFiles: ['src/lib/pipefyExportClient.ts', 'src/utils/pipefySyncUtils.ts'],
  },
  {
    id: 'pipeline',
    index: 2,
    title: 'Web Worker & DuckDB-WASM',
    shortLabel: '02 · Worker + OLAP',
    startFrame: 270,
    endFrame: 540,
    durationLabel: '0:09 – 0:18',
    headline: 'Processamento colunar sem travar a interface (nem exigir COOP/COEP)',
    talkingPoint:
      'O Web Worker faz o parse com SheetJS e infere tipos fora da main thread. Depois, o DuckDB-WASM usa os bundles single-threaded (mvp/eh) — escolha intencional porque iframes cross-origin no Pipefy não têm SharedArrayBuffer.',
    keyFiles: ['src/workers/xlsxToSql.worker.ts', 'src/lib/pipefyDuckDb.ts'],
  },
  {
    id: 'cache',
    index: 3,
    title: 'Cache Parquet Isolado & SWR',
    shortLabel: '03 · Cache Parquet',
    startFrame: 540,
    endFrame: 810,
    durationLabel: '0:18 – 0:27',
    headline: 'Abertura instantânea com isolamento estrito por usuário',
    talkingPoint:
      'O DuckDB-WASM compacta os dados em Parquet binário e salva no IndexedDB sob a chave ${userId}::${pipeId}, validando record.userId === userId. Com TTL de 15 min, HIT carrega direto e STALE usa Stale-While-Revalidate.',
    keyFiles: ['src/lib/pipefyIndexedDb.ts', 'src/utils/pipefySyncUtils.ts'],
  },
  {
    id: 'charts',
    index: 4,
    title: 'Motor de Gráficos Sem Fallbacks',
    shortLabel: '04 · Motor Gráficos',
    startFrame: 810,
    endFrame: 1080,
    durationLabel: '0:27 – 0:36',
    headline: 'Resolução explícita de schema e SQL protegido contra injeção',
    talkingPoint:
      'O resolvedor segue exact → normalized → label → role único e nunca cai silenciosamente em columns[0]. Se o schema do pipe mudar, emitimos ChartConfigIssue acionável; se válido, geramos SQL DuckDB com quoteIdent e quoteLiteral.',
    keyFiles: [
      'src/utils/chartSemantics.ts',
      'src/utils/chartConfigResolver.ts',
      'src/utils/duckDbChartUtils.ts',
    ],
  },
  {
    id: 'senior',
    index: 5,
    title: 'Segurança, Trade-offs & Escala',
    shortLabel: '05 · Trade-offs',
    startFrame: 1080,
    endFrame: 1350,
    durationLabel: '0:36 – 0:45',
    headline: 'Decisões conscientes de arquitetura sênior e limites assumidos',
    talkingPoint:
      'Zero tokens no frontend (tudo trafega pelo canal autenticado do Pipefy Apps SDK) e rotas /api/dev/* retornam 403 em produção. Assumimos trade-offs claros: snapshot completo em vez de deltas em tempo real e limite de RAM do cliente.',
    keyFiles: [
      'src/lib/pipefyServerClient.ts',
      'src/lib/pipefyAppStorage.ts',
      'src/lib/localhostGuard.ts',
    ],
  },
];
