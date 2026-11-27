export interface ProjectMetricItem {
  label: string;
  value: string;
  detail: string;
}

export interface ArchifyDiagramMeta {
  slug: 'architecture' | 'data-flow' | 'chart-pipeline';
  tabLabel: string;
  title: string;
  subtitle: string;
  explainBullets: string[];
  files: string[];
}

export interface EngineeringDecisionItem {
  id: string;
  topic: string;
  chosen: string;
  rejected: string;
  why: string;
  tradeoff: string;
  files: string[];
}

export interface ModuleMapRow {
  layer: string;
  files: string;
  responsibility: string;
}

export interface InterviewQaItem {
  id: string;
  question: string;
  shortAnswer: string;
  deepDive: string;
  files: string[];
}

export const ELEVATOR_PITCH =
  'O PipeLens transforma um Pipe de ~20 mil cards do Pipefy em um painel analítico instantâneo dentro de um iframe cross-origin. Em vez de paginar centenas de queries GraphQL ou manter um data warehouse no backend, o app exporta o snapshot em lote via SDK, converte em um Web Worker, compacta em Parquet no IndexedDB isolado por usuário e roda queries analíticas em milissegundos com DuckDB-WASM no navegador.';

export const PROJECT_METRICS: ProjectMetricItem[] = [
  {
    label: 'Volume alvo',
    value: '~20 mil cards',
    detail: 'Exportação em lote única em vez de ~400 páginas GraphQL',
  },
  {
    label: 'Cache local',
    value: 'Parquet · TTL 15m',
    detail: 'IndexedDB por ${userId}::${pipeId} com Stale-While-Revalidate',
  },
  {
    label: 'Motor analítico',
    value: '8 gráficos · 12 aggs',
    detail: 'DuckDB-WASM single-threaded (mvp/eh) sem SharedArrayBuffer',
  },
  {
    label: 'Qualidade',
    value: 'Vitest + TS estrito',
    detail: 'Testes unitários em semântica, SQL builder, cache e guarda local',
  },
  {
    label: 'Segurança',
    value: '0 tokens no client',
    detail: 'Canal autenticado do Pipefy Apps SDK + /api/dev/* bloqueada em prod',
  },
];

export const ARCHIFY_DIAGRAMS: ArchifyDiagramMeta[] = [
  {
    slug: 'architecture',
    tabLabel: '01 · Arquitetura Geral',
    title: 'Arquitetura Geral (Iframe → Worker → DuckDB-WASM → IndexedDB)',
    subtitle:
      'Mapa completo das fronteiras de runtime: Pipefy Web App, canal SDK autenticado, motor OLAP no browser e persistência de visões.',
    explainBullets: [
      'Tudo roda dentro de um iframe cross-origin declarado em public/manifest.json (pipe-view) com CSP frame-ancestors restrita ao Pipefy.',
      'Não há banco analítico no servidor: a ingestão passa pelo Pipefy Apps SDK e o OLAP roda 100% no cliente via DuckDB-WASM.',
      'As configurações de visões e gráficos ficam separadas dos dados: visões vão para o Pipefy App Storage (p.set/p.get) e o snapshot de cards vai para o IndexedDB.',
    ],
    files: [
      'public/manifest.json',
      'next.config.ts',
      'src/utils/pipefySdkUtils.ts',
      'src/lib/pipefyDuckDb.ts',
      'src/lib/pipefyAppStorage.ts',
    ],
  },
  {
    slug: 'data-flow',
    tabLabel: '02 · Fluxo 20k & Cache SWR',
    title: 'Ingestão de 20k Cards & Ciclo Stale-While-Revalidate',
    subtitle:
      'Como o app decide entre HIT, STALE (SWR) e MISS no IndexedDB, e como evita travar a UI durante o parse de planilhas grandes.',
    explainBullets: [
      'Na abertura, buscamos ${userId}::${pipeId} no IndexedDB e validamos record.userId === userId para evitar vazamento entre membros.',
      'Dentro de 15 min (HIT), o buffer Parquet é carregado direto no DuckDB-WASM sem chamar o Pipefy; após 15 min (STALE), exibimos o cache na hora e sincronizamos em background.',
      'No sync (MISS ou revalidação), criamos/reutilizamos "[PipeLens] Snapshot", fazemos polling até 95s e delegamos o parse do .xlsx ao Web Worker (SheetJS).',
    ],
    files: [
      'src/utils/pipefySyncUtils.ts',
      'src/lib/pipefyExportClient.ts',
      'src/workers/xlsxToSql.worker.ts',
      'src/lib/pipefyIndexedDb.ts',
    ],
  },
  {
    slug: 'chart-pipeline',
    tabLabel: '03 · Motor de Gráficos',
    title: 'Motor Genérico de Gráficos (Sem Fallbacks Silenciosos)',
    subtitle:
      'Da inferência semântica de colunas à validação explícita de schema e geração de SQL DuckDB protegido contra injeção.',
    explainBullets: [
      'O profiler classifica colunas em 17 papéis semânticos (moeda, percentual, data, status, identificador, booleano etc.) combinando tipo Pipefy, cabeçalho e amostra.',
      'chartConfigResolver resolve campos na ordem exact → normalized → label → role único. Ele nunca cai em columns[0]: se a coluna sumir, emite ChartConfigIssue.',
      'duckDbChartUtils gera SQL com quoteIdent, quoteLiteral e escapeIlikeLiteral, alimentando 8 visualizações e 12 agregações no ChartRenderer.',
    ],
    files: [
      'src/utils/columnRoleRules.ts',
      'src/utils/chartSemantics.ts',
      'src/utils/chartConfigResolver.ts',
      'src/utils/duckDbChartUtils.ts',
      'src/components/charts/chartTypeRegistry.tsx',
    ],
  },
];

export const ENGINEERING_DECISIONS: EngineeringDecisionItem[] = [
  {
    id: 'batch-export',
    topic: 'Extração em lote (.xlsx) vs Paginação GraphQL',
    chosen: 'Relatório [PipeLens] Snapshot via createPipeReport + exportPipeReport.',
    rejected: 'Paginar allCards (50 cards/página = ~400 requisições sequenciais por cursor).',
    why: 'Reduz minutos de latência e risco de rate limit para um único polling assíncrono (até 95s) + download direto.',
    tradeoff: 'Re-sincroniza o snapshot completo em vez de deltas incrementais em tempo real.',
    files: ['src/lib/pipefyExportClient.ts', 'src/utils/pipefySyncUtils.ts'],
  },
  {
    id: 'duckdb-single-thread',
    topic: 'DuckDB-WASM single-threaded (mvp/eh) vs Multi-thread (coi)',
    chosen: 'Carregar apenas bundles mvp e eh locais em public/duckdb/.',
    rejected: 'Bundle coi com SharedArrayBuffer e pthreads.',
    why: 'Iframes cross-origin dentro de app.pipefy.com não possuem isolamento COOP/COEP — SharedArrayBuffer falha silenciosamente ou quebra o worker.',
    tradeoff: 'Queries usam 1 thread WASM; para ~20k–50k linhas, ainda executam em poucos milissegundos.',
    files: ['src/lib/pipefyDuckDb.ts', 'scripts/copy-duckdb-assets.mjs'],
  },
  {
    id: 'parquet-indexeddb',
    topic: 'Parquet binário no IndexedDB vs JSON bruto ou backend cache',
    chosen: 'Exportar Parquet direto do DuckDB-WASM e indexar por ${userId}::${pipeId}.',
    rejected: 'Guardar milhares de objetos JSON soltos ou subir Redis/Postgres intermediário.',
    why: 'Parquet reduz drasticamente o tamanho em disco, restaura tabelas tipadas no DuckDB em uma chamada e garante isolamento multi-usuário sem servidor de dados.',
    tradeoff: 'Limitado à memória do navegador e à quota de IndexedDB do cliente.',
    files: ['src/lib/pipefyIndexedDb.ts', 'src/lib/pipefyDuckDb.ts'],
  },
  {
    id: 'no-silent-fallback',
    topic: 'Resolução explícita de colunas vs Fallback para columns[0]',
    chosen: 'Cascata determinística (exact → normalized → label → role único) + ChartConfigIssue.',
    rejected: 'Substituir coluna ausente pela primeira coluna do dataset.',
    why: 'Fallback silencioso gera gráficos enganosos quando um campo do Pipe é renomeado ou removido. É melhor falhar visivelmente com ação de correção.',
    tradeoff: 'Exige UX dedicada no card para adaptar ou corrigir gráficos antigos após schema drift.',
    files: ['src/utils/chartConfigResolver.ts', 'src/components/DashboardChartCard.tsx'],
  },
  {
    id: 'web-worker',
    topic: 'Parse de planilhas em Web Worker + fallback na main thread',
    chosen: 'Worker dedicado (xlsxToSql.worker.ts) com SheetJS e amostragem de 500 linhas.',
    rejected: 'Parsear ArrayBuffer de dezenas de MB direto no componente React.',
    why: 'Mantém animações e interações a 60fps durante o parsing inicial e evita jank perceptível no iframe.',
    tradeoff: 'Serialização de retorno entre Worker e main thread antes da ingestão no DuckDB.',
    files: ['src/workers/xlsxToSql.worker.ts', 'src/utils/xlsxWorkerUtils.ts'],
  },
  {
    id: 'security-boundaries',
    topic: 'Zero tokens no client & rotas /api/dev/* bloqueadas em produção',
    chosen: 'Pipefy Apps SDK para tráfego real; guarda HTTP 403 em /api/dev/* e HTTP 404 em /docs.',
    rejected: 'Expor token pessoal da API GraphQL no client ou deixar rotas de diagnóstico abertas.',
    why: 'Em produção na Vercel nenhum segredo existe no bundle e rotas auxiliares de dev/entrevista ficam inacessíveis externamente.',
    tradeoff: 'Testar o app localmente dentro do Pipefy exige túnel HTTPS temporário (npm run dev:tunnel).',
    files: ['src/lib/pipefyServerClient.ts', 'src/lib/localhostGuard.ts', 'src/proxy.ts'],
  },
];

export const MODULE_MAP: ModuleMapRow[] = [
  {
    layer: 'Manifest & Next.js',
    files: 'public/manifest.json, next.config.ts, src/app/layout.tsx',
    responsibility:
      'Declara a feature pipe-view, carrega pipefy-app.js e aplica CSP frame-ancestors para app.pipefy.com.',
  },
  {
    layer: 'Pipefy SDK & Storage',
    files: 'src/utils/pipefySdkUtils.ts, src/lib/pipefyExportClient.ts, src/lib/pipefyAppStorage.ts',
    responsibility:
      'Identifica usuário/membros, exporta o snapshot .xlsx via SDK e persiste visões em p.set/p.get (public → private).',
  },
  {
    layer: 'Worker & Tipagem',
    files: 'src/workers/xlsxToSql.worker.ts, src/utils/xlsxWorkerUtils.ts, src/lib/sqlConverter.ts',
    responsibility:
      'Processa planilhas fora da main thread, infere tipos SQL e extrai estatísticas das primeiras 500 linhas.',
  },
  {
    layer: 'Cache & DuckDB-WASM',
    files: 'src/lib/pipefyIndexedDb.ts, src/lib/pipefyDuckDb.ts, src/utils/pipefySyncUtils.ts',
    responsibility:
      'Gerencia cache Parquet isolado (${userId}::${pipeId}) com TTL 15 min / SWR e executa SQL em memória.',
  },
  {
    layer: 'Motor de Gráficos',
    files: 'src/utils/columnRoleRules.ts, chartSemantics.ts, chartConfigResolver.ts, duckDbChartUtils.ts',
    responsibility:
      'Perfila colunas semanticamente, resolve configurações sem fallbacks silenciosos e gera SQL seguro.',
  },
  {
    layer: 'Interface & Local Docs',
    files: 'src/components/PipefyDashboard.tsx, AddChartModal.tsx, src/app/docs/page.tsx, src/proxy.ts',
    responsibility:
      'UI analítica em Recharts, console SQL ad-hoc e esta documentação de entrevista isolada em localhost.',
  },
];

export const INTERVIEW_QA: InterviewQaItem[] = [
  {
    id: 'scale-200k',
    question: 'E se o Pipe crescer de 20 mil para 200 mil+ cards?',
    shortAnswer:
      'Hoje o gargalo é a RAM do navegador e o polling do relatório Pipefy; o próximo passo seria mover o DuckDB para um serviço server-side/edge com Parquet pré-materializado por Pipe.',
    deepDive:
      'A arquitetura já separa a camada de consulta (ChartQuerySpec → SQL) do executor (pipefyDuckDb.ts). Para 200k+ cards ou anexos muito largos, trocaríamos apenas o executor local por um endpoint DuckDB/ClickHouse paginado mantendo exatamente o mesmo resolvedor semântico e UI.',
    files: ['src/lib/pipefyDuckDb.ts', 'src/utils/duckDbChartUtils.ts'],
  },
  {
    id: 'multi-user-cache',
    question: 'Como você garante que um usuário não veja o cache de outro no mesmo navegador?',
    shortAnswer:
      'A chave do IndexedDB é composta (${userId}::${pipeId}) e toda leitura valida explicitamente record.userId === userId.',
    deepDive:
      'Além de isolar a chave em buildUserPipeCacheKey, a função getCachedSqlDataset rejeita qualquer registro cujo userId não bata com o usuário ativo. No ViewsDrawer, quando o Pipe tem múltiplos membros, é possível alternar o usuário ativo para auditar o cache separado por membro.',
    files: ['src/lib/pipefyIndexedDb.ts', 'src/components/ViewsDrawer.tsx'],
  },
  {
    id: 'why-no-sab',
    question: 'Por que DuckDB-WASM single-threaded em vez da versão multi-threaded?',
    shortAnswer:
      'Porque o app roda dentro de um iframe cross-origin no Pipefy, sem headers COOP/COEP para habilitar SharedArrayBuffer.',
    deepDive:
      'Em pipefyDuckDb.ts selecionamos manualmente apenas os bundles mvp e eh servidos localmente em public/duckdb/. Isso evita falhas em browsers/iframes que bloqueiam SharedArrayBuffer e ainda mantém agregações de 20k linhas abaixo de dezenas de milissegundos.',
    files: ['src/lib/pipefyDuckDb.ts', 'next.config.ts'],
  },
  {
    id: 'sql-injection',
    question: 'Há risco de SQL Injection já que vocês montam SQL dinâmico para gráficos e filtros?',
    shortAnswer:
      'Não no builder: identificadores, literais, padrões ILIKE e nomes de tabela passam por sanitização dedicada antes de chegar ao DuckDB.',
    deepDive:
      'quoteIdent escapa aspas duplas em nomes de coluna, quoteLiteral escapa aspas simples em valores de filtro, escapeIlikeLiteral escapa curingas %/_ e sanitizeTableName restringe nomes a [a-zA-Z0-9_]. Além disso, o DuckDB roda isolado em memória no navegador do próprio usuário.',
    files: ['src/utils/duckDbChartUtils.ts', 'src/lib/pipefyDuckDb.ts'],
  },
  {
    id: 'schema-drift',
    question: 'O que acontece com os gráficos salvos se alguém renomear ou apagar um campo no Pipefy?',
    shortAnswer:
      'O gráfico não quebra silenciosamente nem mostra dados errados: chartConfigResolver detecta o drift e exibe um diagnóstico acionável.',
    deepDive:
      'A resolução tenta match exato, nome normalizado, label/cabeçalho original e papel semântico único. Nunca substituímos por columns[0]. Se não resolver, canRender fica false e o card mostra os ChartConfigIssue com opções para adaptar ou editar.',
    files: ['src/utils/chartConfigResolver.ts', 'src/components/DashboardChartCard.tsx'],
  },
  {
    id: 'localhost-guard',
    question: 'Como esta rota /docs é bloqueada em produção e túneis?',
    shortAnswer:
      'Defesa em profundidade em 3 camadas: src/proxy.ts (Next.js 16), Server Component com headers() + notFound(), e API route dos HTMLs do Archify.',
    deepDive:
      'isLocalhostHeaders exige host em {localhost, 127.0.0.1, ::1}, valida todos os x-forwarded-host e bloqueia imediatamente se VERCEL=1 ou VERCEL_ENV estiverem definidos. Os HTMLs do Archify ficam em docs/archify/ (fora de public/) e só são servidos via /api/local-docs/archify/[slug].',
    files: ['src/lib/localhostGuard.ts', 'src/proxy.ts', 'src/app/docs/page.tsx'],
  },
];
