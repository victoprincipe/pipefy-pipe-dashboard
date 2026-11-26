# PipeLens Dashboard · Aplicativo Pipefy SDK (Case 1)

**PipeLens** é um aplicativo nativo do **Pipefy Apps SDK** (`pipe-view` + `pipe-buttons`) projetado para transformar qualquer Pipe — incluindo pipes de alto volume como o **Tech. Consultants (Case 1)** com **20.000 cards** — em um dashboard analítico flexível com **DuckDB-WASM (SQL colunar em Web Worker)**, construtor visual de gráficos, cross-filtering interativo e **cache Parquet estritamente isolado por usuário**.

## Links do Projeto

- **Pipe de Teste (Pipefy):** https://app.pipefy.com/pipes/307435909
- **Organização (Pipefy):** https://app.pipefy.com/organizations/302574355
- **Aplicação Hospedada (HTTPS / Vercel):** https://pipefy-pipe-dashboard.vercel.app
- **Manifest do App (`manifest.json`):** https://pipefy-pipe-dashboard.vercel.app/manifest.json
- **Repositório Público (GitHub):** https://github.com/victoprincipe/pipefy-pipe-dashboard

---

## Principais Funcionalidades

- **Integração Nativa via Pipefy Apps SDK (`pipe-view` & `pipe-buttons`):**
  - Registra uma visão em tela cheia (`PipeLens Dashboard`) no seletor de visões do Pipe e um botão no cabeçalho (`PipeLens Cache`) abrindo uma sidebar de telemetria.
  - Utiliza `PipefyApp.init()`, `PipefyApp.initCall()`, `PipefyApp.render()`, `PipefyApp.registerListener()` (`onCardCreated`, `onCardDeleted`), `p.query()`, `p.mutation()`, `p.set()`, `p.get()` e `p.openCard()` — **zero tokens hardcoded** no código-fonte.
- **Estratégia Híbrida para 20.000+ Cards:**
  1. **Fast-Path (Bulk Report Export):** cria/reutiliza o relatório `[PipeLens] Snapshot`, dispara `exportPipeReport`, faz polling de `pipeReportExport`, baixa o `.xlsx` via proxy autenticado por usuário (`/api/fetch-export`), realiza o parsing da planilha em **Web Worker** (`SheetJS`) e ingere no **DuckDB-WASM**.
  2. **Fallback Automático (Paginação por Cursor):** se `exportPipeReport` estiver indisponível ou o pipe tiver < 500 cards, pagina `allCards(first: 50)` com retry/backoff, checkpoints Parquet no IndexedDB e renderização progressiva.
  3. **Atualização Incremental:** compara `cards_count` e escuta eventos em tempo real do Pipefy (`onCardCreated`, `onCardDeleted`) para aplicar deltas SQL (`DELETE` + `INSERT`) no DuckDB e regravar o Parquet sem re-exportar os 20.000 cards.
- **Motor Analítico DuckDB-WASM + Construtor Flexível:**
  - Queries SQL reais executadas no Web Worker single-thread (`duckdb-eh` / `duckdb-mvp`, compatível com iframe sem `COOP`/`COEP`) com catálogo tipado dinâmico gerado pelo schema do Pipe.
  - 7 tipos de visualização: **Barras Verticais**, **Barras Horizontais**, **Linha Temporal**, **Área**, **Rosca (Donut)**, **Cartão KPI** e **Tabela Dinâmica**.
  - 7 agregações SQL: `COUNT`, `SUM`, `AVG`, `MEDIAN`, `MIN`, `MAX`, `DISTINCT`.
  - Granularidade temporal (`Dia`, `Semana`, `Mês`, `Trimestre`, `Ano`), histograma numérico automático, Top N com agrupamento em `"Outros"`, ordenação configurável e **pré-visualização ao vivo** no modal.
  - Múltiplas visões nomeáveis (criar, renomear, excluir, importar/exportar JSON) + **Explorador de Cards** paginado em SQL (`LIMIT`/`OFFSET`) com abertura direta do card no Pipefy.
  - **Cross-filtering interativo** entre gráficos ao clicar em barras, fatias ou pontos.
- **Cache Isolado por Usuário (Parquet no IndexedDB + Proxy Server):**
  - **Camada 1 (IndexedDB com Parquet Comprimido):** chave composta `${userId}::${pipeId}`, armazenando o snapshot colunar `.parquet` gerado pelo DuckDB-WASM (~1–2 MB para 20k cards vs ~13 MB JSON), com TTL (`HIT` / `STALE` / `MISS`), *Stale-While-Revalidate* e limpeza seletiva apenas do usuário atual.
  - **Camada 2 (Memória LRU no Proxy `/api/fetch-export`):** chave composta `${userId}::${pipeId}::${exportId}` e proteção anti-SSRF por allowlist de domínios HTTPS.
  - **Camada 3 (Pipefy SDK `p.set('pipe', 'private', ...)`):** sincronização privada das configurações de visões do usuário quando dentro do limite de tamanho.

---

## Como Executar Localmente

### Pré-requisitos
- **Node.js 20+** (testado em `v23.9.0`)
- **npm**
- *(Opcional para testar dentro do `app.pipefy.com` apontando para localhost)*: `cloudflared` ou `ngrok` para expor HTTPS.

### Passo a Passo

```bash
# 1. Instalar dependências
npm install

# 2. Rodar testes automatizados (agregações 20k, isolamento por usuário, parsing XLSX)
npm test

# 3. Gerar build de produção (TypeScript + Vite)
npm run build

# 4. Iniciar servidor único (Frontend + Proxy /api/fetch-export na porta 4173)
npm start
```

- **Modo Desenvolvimento (Hot Reload):** `npm run dev` inicia a API local (`http://localhost:4174`) e o Vite (`http://localhost:5173`).
- **Modo Prévia Standalone:** ao abrir `http://localhost:4173` diretamente no navegador (fora do iframe do Pipefy), o app entra automaticamente em modo de demonstração com 20.000 cards e um seletor de usuário para demonstrar o isolamento de cache.
- **Testando seu `localhost` dentro do Pipefy:**
  ```bash
  npm run tunnel
  # Copie a URL https://*.trycloudflare.com gerada e registre <URL>/manifest.json em:
  # https://app.pipefy.com/developers/apps
  ```

---

## Como Registrar e Usar no Pipefy

1. Acesse **https://app.pipefy.com/developers/apps** como administrador da organização.
2. Clique em **Add new app**.
3. Preencha:
   - **Name:** `PipeLens Dashboard`
   - **Manifest URL:** `<URL_HTTPS_DO_APP>/manifest.json`
4. Abra o Pipe alvo (**https://app.pipefy.com/pipes/307435909**), habilite o aplicativo (caso ainda não tenha ingressado no pipe, clique em **Join pipe**).
5. No seletor de visões do Pipe, clique em **PipeLens Dashboard** para abrir o painel em tela cheia.

---

## Arquitetura e Decisões Técnicas

Consulte a documentação completa de arquitetura, diagramas Mermaid, análise quantitativa dos limites da API do Pipefy para 20.000 cards, modelo de cache por usuário, segurança e limitações em:

- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**

---

## Roteiro Sugerido para Demonstração

1. **Abertura Instantânea via Cache:** abrir a view `PipeLens Dashboard` dentro do Pipe `307435909` e destacar o badge `Cache HIT · <Usuário> (<ID>)` com renderização dos 20.000 cards em poucos milissegundos via Web Worker.
2. **Exploração & Cross-Filtering:** clicar em um estado/empresa/mês em qualquer gráfico e mostrar a filtragem cruzada e o contador `Mostrando X de 20.000 cards`.
3. **Criação de Nova Visão & Gráfico:** clicar em `+ Nova Visão` ou `+ Novo Gráfico`, escolher dimensão, agregação (`SUM`, `AVG`, `MEDIAN`), Top N e observar o preview ao vivo antes de salvar.
4. **Explorador de Cards:** alternar para a aba `Explorador de Cards`, ordenar por `Valor Total` e clicar em `Abrir` para abrir o modal nativo do card dentro do Pipefy (`p.openCard`).
5. **Auditoria do Cache por Usuário:** abrir `Cache & Telemetria`, demonstrar a chave `user:{id}:pipe:{pipeId}`, acionar atualização incremental e mostrar que limpar o cache afeta apenas o usuário logado.
