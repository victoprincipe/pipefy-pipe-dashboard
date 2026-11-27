# PipeLens Dashboard · Aplicativo Pipefy SDK (Case 1)

**PipeLens** é um aplicativo nativo para o **Pipefy Apps SDK** (`pipe-view`), desenvolvido em **Next.js 16 (App Router + React 19 + TypeScript)**, projetado para transformar um Pipe de alto volume (~20 mil cards) em um painel analítico interativo com criação flexível de visões e gráficos, motor SQL em memória (**DuckDB-WASM**) e **cache em Parquet isolado por usuário no IndexedDB**.

---

## Links da Entrega

- **Pipe alvo (Case 1):** https://app.pipefy.com/pipes/307435909
- **Repositório público (GitHub):** https://github.com/victoprincipe/pipefy-pipe-dashboard
- **Aplicação hospedada (Vercel HTTPS):** https://pipefy-pipe-dashboard.vercel.app
- **Manifest do App (`manifest.json`):** https://pipefy-pipe-dashboard.vercel.app/manifest.json

---

## 1. Arquitetura da Solução

```text
+-------------------------------------------------------------------------+
| Pipefy Web App (https://app.pipefy.com/pipes/307435909)                 |
|  └── Carrega public/manifest.json (feature: "pipe-view", init_url: "./")|
+-----------------------------------+-------------------------------------+
                                    | iframe cross-origin
                                    v
+-------------------------------------------------------------------------+
| PipeLens Dashboard (Next.js 16 + pipefy-app.js SDK)                     |
|                                                                         |
| 1) Sessão & Contexto (pipefySdkUtils.ts / pipefyExportClient.ts)        |
|    - Root frame (?root=true): PipefyApp.initCall({ 'pipe-view': ... })  |
|    - View frame: PipefyApp.init(), me, pipe.members, start_form_fields  |
|                                                                         |
| 2) Ingestão de Alto Volume (pipefySyncUtils.ts)                         |
|    - Cria/reutiliza relatório "[PipeLens] Snapshot" via SDK             |
|    - Dispara exportPipeReport -> polling pipeReportExport -> download   |
|    - Web Worker (xlsxToSql.worker.ts + SheetJS): tipagem & estatísticas |
|                                                                         |
| 3) Cache & Motor Analítico no Navegador                                 |
|    - IndexedDB (pipefyIndexedDb.ts): chave `${userId}::${pipeId}`       |
|      armazena snapshot binário Parquet + metadados + TTL (15 min)       |
|    - DuckDB-WASM (pipefyDuckDb.ts): bundle single-threaded (mvp/eh)     |
|      executa agregações, filtros, séries temporais e SQL ad-hoc         |
|                                                                         |
| 4) Motor de Gráficos & Persistência de Visões                           |
|    - Semântica e resolução: columnRoleRules + chartSemantics +          |
|      chartCapabilities + chartConfigResolver (sem fallbacks silenciosos)|
|    - Query & Render: duckDbChartUtils -> ChartRenderer (Recharts)       |
|    - Visões: Pipefy App Storage (p.set/p.get) em useDashboardViews.ts   |
+-------------------------------------------------------------------------+
```

### Principais módulos

| Camada | Arquivos principais | Responsabilidade |
|---|---|---|
| **Manifest & Next.js** | `public/manifest.json`, `next.config.ts`, `src/app/layout.tsx` | Declara a feature `pipe-view`, carrega `https://platform.staticpipefy.com/pipefy-app.js` e configura CSP `frame-ancestors` para `app.pipefy.com` e `*.pipefy.com`. |
| **Integração Pipefy SDK** | `src/utils/pipefySdkUtils.ts`, `src/lib/pipefyExportClient.ts`, `src/lib/pipefyAppStorage.ts` | Inicializa o SDK, identifica usuário (`me`) e membros do Pipe, exporta o relatório `.xlsx` via GraphQL do SDK e persiste visões em `p.set` / `p.get`. |
| **Conversão & Worker** | `src/workers/xlsxToSql.worker.ts`, `src/utils/xlsxWorkerUtils.ts`, `src/lib/sqlConverter.ts` | Faz o parsing de `.xlsx`/`.xls`/`.csv` fora da main thread, infere tipos (`VARCHAR`, `DOUBLE`, `DATE`, `BOOLEAN`) e coleta estatísticas leves nas primeiras 500 linhas. |
| **Cache & DuckDB-WASM** | `src/lib/pipefyIndexedDb.ts`, `src/lib/pipefyDuckDb.ts`, `src/utils/pipefySyncUtils.ts`, `src/hooks/usePipefyCardsSync.ts` | Gerencia o cache isolado por usuário no IndexedDB (`${userId}::${pipeId}`), gera/restaura snapshots **Parquet** e executa queries SQL no DuckDB-WASM. |
| **Motor Genérico de Gráficos** | `src/utils/columnRoleRules.ts`, `src/utils/chartSemantics.ts`, `src/utils/chartCapabilities.ts`, `src/utils/chartConfigResolver.ts`, `src/utils/duckDbChartUtils.ts` | Perfila colunas (moeda, data, status, identificador, booleano), valida compatibilidade sem fallback silencioso e gera SQL DuckDB seguro. |
| **Interface do Dashboard** | `src/components/PipefyDashboard.tsx`, `src/components/ViewsDrawer.tsx`, `src/components/AddChartModal.tsx`, `src/components/DashboardChartCard.tsx`, `src/components/ChartRenderer.tsx`, `src/components/ExecutiveSummaryStrip.tsx`, `src/components/charts/chartTypeRegistry.tsx` | Drawer de visões, faixa de KPIs executivos, modal estúdio com prévia ao vivo, console SQL ad-hoc, painel automático e exportação CSV. |

---

## 2. Estratégia para Volume (~20 mil cards), Desempenho e Atualização

### Por que Exportação em Massa + Web Worker + DuckDB-WASM + Parquet?

Consultar 20.000 cards página por página via GraphQL (`allCards`, limite típico de 50 cards/página) exigiria ~400 requisições sequenciais por cursor, sujeitas a *rate limits* e lentidão de vários minutos. Para manter o dashboard rápido e utilizável:

1. **Extração em lote via SDK (`createPipeReport` + `exportPipeReport`):** o aplicativo cria ou reutiliza um relatório chamado `[PipeLens] Snapshot` usando as colunas reais do pipe (`pipeReportColumns`), inicia a exportação assíncrona, acompanha `pipeReportExport` até obter a `fileURL` e baixa o `.xlsx` diretamente.
2. **Parsing em Web Worker (`xlsxToSql.worker.ts`):** a leitura do buffer `.xlsx` com SheetJS e a inferência de tipos ocorrem em thread separada, evitando travamentos na interface (e com fallback automático para a main thread se necessário).
3. **Motor colunar em memória (`DuckDB-WASM`):** após o parse, os registros são ingeridos no DuckDB-WASM (`read_json`) e compactados em formato **Parquet** (`COPY ... TO ... (FORMAT PARQUET)`). Todas as agregações, agrupamentos, filtros e séries temporais passam a rodar em milissegundos via SQL diretamente no navegador.
4. **Atualização dos dados (TTL + *Stale-While-Revalidate*):**
   - Cada snapshot salvo possui `TTL = 15 minutos` (`DEFAULT_CACHE_TTL_MS`).
   - Dentro do TTL (`HIT`): o Parquet salvo no IndexedDB é carregado direto no DuckDB-WASM sem nova chamada ao Pipefy.
   - Após o TTL (`STALE`): o aplicativo restaura imediatamente os dados em cache na tela (*Stale-While-Revalidate*) enquanto sincroniza uma nova exportação em segundo plano.
   - A qualquer momento o usuário pode forçar o reprocessamento pelo botão **"Atualizar dados"**.

---

## 3. Hospedagem e Cache Isolado por Usuário

### Cache no próprio aplicativo com separação por usuário

- O cache de dados reside no navegador do usuário via **IndexedDB** (`pipefy_sql_cache_v1` em `src/lib/pipefyIndexedDb.ts`), indexado pela chave composta:
  ```text
  ${userId}::${pipeId}
  ```
- Toda leitura (`getCachedSqlDataset`) e limpeza (`clearUserSqlDataset`) verifica explicitamente se `record.userId === userId`, impedindo colisão ou vazamento entre usuários diferentes que utilizem o mesmo navegador ou pipe.
- Na barra lateral (`ViewsDrawer.tsx`), quando o Pipe possui múltiplos membros, o seletor **"Usuário Pipefy"** exibe o resumo de cache por membro (`rowsCount` / `"sem cache"`) e permite alternar o contexto ativo para demonstrar o isolamento de cache e a restauração imediata do snapshot Parquet por usuário.
- As **visões e configurações de gráficos** são persistidas no **Pipefy App Storage** (`p.set('pipe', ...)` / `p.get('pipe', ...)` em `src/lib/pipefyAppStorage.ts`), priorizando escopo `public` (compartilhado no pipe) com fallback automático para `private` caso o perfil tenha restrição — e `localStorage` no modo standalone/local.

### Hospedagem

- **Produção (Vercel):** hospedagem estática/serverless em HTTPS (`https://pipefy-pipe-dashboard.vercel.app`), com assets do DuckDB-WASM servidos localmente em `public/duckdb/` (copiados automaticamente via `scripts/copy-duckdb-assets.mjs` no `postinstall`/`prebuild`/`predev`).
- **Execução local com túnel HTTPS:** o comando `npm run dev:tunnel` (`scripts/dev-tunnel.mjs`) sobe o servidor Next.js e um túnel `cloudflared` exibindo a URL HTTPS temporária do `manifest.json` para testar dentro de `app.pipefy.com`.

---

## 4. Funcionalidades do Dashboard

- **Múltiplas Visões (`ViewsDrawer`):** criação, seleção e exclusão de visões (mantendo sempre ao menos uma visão ativa).
- **Construtor Flexível de Gráficos (`AddChartModal`) com Preview ao Vivo:**
  - **8 tipos de visualização** definidos em `chartTypeRegistry.tsx`: **Barras Horizontais**, **Colunas**, **Linhas**, **Área**, **Rosca / Participação**, **Indicador (KPI)**, além dos legados **Radar** e **Barras Radiais**.
  - **12 agregações:** Contagem de cards, Contagem de preenchidos, Valores únicos (`COUNT DISTINCT`), Taxa de preenchimento (`%`), Contagem de vazios, Positivos (`Sim`), Taxa de positivos (`%`), Soma, Média, Mediana, Mínimo e Máximo.
  - **Eixos & Segmentação:** granularidade temporal (`Dia`, `Semana`, `Mês`, `Trimestre`, `Ano`), recorte de período (`Últimos 7d/30d/90d/12m`, `Este mês/trimestre/ano`), segmentação por segunda dimensão (`breakdownBy` empilhada ou agrupada), Top N com consolidação em `"Outros"`, ordenação, linha de média e separação de campos multivalor separados por vírgula.
  - **Filtros múltiplos com sugestões:** operadores (`equals`, `not_equals`, `contains`, `not_contains`, `not_empty`, `is_empty`, `gt`, `gte`, `lt`, `lte`) com autocomplete via `SELECT DISTINCT` no DuckDB.
  - **Ajuste manual de papel semântico por coluna:** permite reclassificar uma coluna (ex.: `Identificador`, `Moeda`, `Percentual`, `Data`, `Categoria`, `Status`, `Número`, `Sim/Não`) persistindo em `localStorage`.
  - **Modo SQL Customizado & Console SQL Ad-Hoc:** permite escrever consultas DuckDB customizadas por gráfico ou explorar a tabela diretamente no painel.
- **Painel Automático e Templates:** geração de até 4 gráficos em 1 clique (`buildAutoDashboard`) com base nos tipos e estatísticas reais do pipe/arquivo.
- **Cartão Analítico (`DashboardChartCard`):** KPI headline, *takeaway* automático em português, alternância Gráfico/Tabela e exportação dos dados agregados em **CSV**.
- **Modo Standalone / Local:** fora do iframe do Pipefy, permite importar planilhas `.xlsx`, `.xls` ou `.csv` (incluindo seletor de abas) ou explorar presets demonstrativos.

---

## 5. Limitações Conhecidas

1. **Sincronização por snapshot completo:** cada atualização re-exporta o relatório `[PipeLens] Snapshot` completo em `.xlsx` em vez de aplicar deltas incrementais em tempo real via listeners do SDK (`onCardCreated` / `onCardDeleted`).
2. **Timeout de exportação e CORS da URL assinada:** o polling aguarda até `95.000 ms` (`maxWaitMs` em `src/lib/pipefyExportClient.ts`) e depende de o bucket de armazenamento da `fileURL` retornada pelo Pipefy permitir `fetch` direto do navegador na origem do aplicativo.
3. **DuckDB-WASM single-threaded:** o aplicativo utiliza intencionalmente os bundles `mvp` e `eh` sem `SharedArrayBuffer` (`coi`), pois iframes cross-origin incorporados no Pipefy não possuem isolamento COOP/COEP para threads compartilhadas.
4. **Limites do navegador e do Pipefy App Storage:** volumes muito acima de algumas dezenas de milhares de cards estão sujeitos à memória RAM do cliente e à quota de IndexedDB do navegador; a persistência de visões também respeita o limite de payload do `p.set` no Pipefy App Storage.
5. **Escopo de um dataset ativo por vez:** ao carregar um novo arquivo local fora do Pipefy, o slot local no IndexedDB é substituído; gráficos criados para outro `datasetId` são preservados e exibidos em uma seção separada com ação de **Adaptar ao arquivo atual** ou **Remover**.

---

## 6. Boas Práticas Aplicadas

- **Zero tokens hardcoded no aplicativo:** toda comunicação em produção acontece exclusivamente pelo canal autenticado do **Pipefy Apps SDK** no navegador (`p.query`, `p.mutation`, `p.get`, `p.set`).
- **Rotas auxiliares `/api/dev/pipefy/*` isoladas e bloqueadas em produção:** utilizadas apenas para inspeção/depuração local via `PIPEFY_API_TOKEN` em `.env.local`; retornam HTTP `403` automaticamente quando `NODE_ENV === 'production'` (a menos que `ALLOW_DEV_PIPEFY_ROUTES=true`).
- **Prevenção de SQL Injection no builder:** identificadores, literais e padrões `ILIKE` passam por `quoteIdent`, `quoteLiteral`, `escapeIlikeLiteral` e `sanitizeTableName`.
- **Resolução explícita de configuração (sem fallbacks silenciosos):** `chartConfigResolver.ts` nunca substitui silenciosamente uma coluna ausente por `columns[0]`; em caso de schema alterado, exibe diagnóstico claro e ações de correção.
- **Acessibilidade e Motion:** suporte a `prefers-reduced-motion` (`useReducedMotion`), modal/drawer com `<dialog>` nativo, fechamento por `Escape` e rótulos ARIA.
- **Qualidade contínua:** tipagem estrita em TypeScript, ESLint (`eslint-config-next`) e suíte de testes unitários com **Vitest**.

---

## 7. Como Executar e Acessar

### Pré-requisitos

- **Node.js 20+**
- **npm**
- *(Opcional, apenas para testar localmente dentro do Pipefy via HTTPS)*: [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

### Instalação e Execução Local

```bash
# 1. Clonar o repositório e instalar dependências
#    (o script postinstall copia os arquivos .wasm/.worker.js do DuckDB para public/duckdb/)
git clone https://github.com/victoprincipe/pipefy-pipe-dashboard.git
cd pipefy-pipe-dashboard
npm install

# 2. Executar testes unitários, lint e checagem de tipos
npm test
npm run lint
npx tsc --noEmit

# 3. Rodar em desenvolvimento (modo standalone / importação local .xlsx/.csv em http://localhost:3000)
npm run dev

# 4. Ou gerar build de produção e iniciar o servidor
npm run build
npm start
```

> **Testando localhost dentro do Pipefy (túnel HTTPS):**
> ```bash
> npm run dev:tunnel
> ```
> O script exibirá no terminal a URL pública `https://<id>.trycloudflare.com/manifest.json` para instalar como Custom App no Pipefy apontando para sua máquina local.

### Como instalar e acessar no Pipefy

1. Acesse o Pipe **https://app.pipefy.com/pipes/307435909** (com permissão de administrador).
2. Abra as configurações de **Apps / Aplicativos** do Pipe (ou da organização) e adicione um **Custom App** informando a URL do manifesto:
   - Versão hospedada: `https://pipefy-pipe-dashboard.vercel.app/manifest.json`
   - Ou versão local com túnel: `https://<sua-url-trycloudflare>/manifest.json`
3. Habilite o aplicativo no Pipe e acesse a aba/visão **PipeLens Dashboard** na barra de visões do Pipe.
4. Na primeira abertura, o app sincronizará os cards via `[PipeLens] Snapshot` e salvará o snapshot Parquet no IndexedDB do usuário autenticado. A partir daí, clique em **Criar painel automático** ou **Novo gráfico** para montar e salvar suas visões.
