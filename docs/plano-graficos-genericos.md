# Plano: gráficos genéricos para qualquer arquivo de dados

> **Status**: implementado
> **Data**: 2026-11-26
> **Escopo**: permitir importar planilhas `.xlsx/.xls/.csv` com colunas arbitrárias e criar/editar gráficos sem alterar código, mantendo compatibilidade com o modo Pipefy.
> **Público-alvo deste documento**: agente de código ou desenvolvedor responsável pela implementação.

---

## 1. Decisões de produto confirmadas

1. **Entrada**: novas planilhas de dados (`.xlsx`, `.xls`, `.csv`).
2. **Vínculo gráfico × arquivo**: cada gráfico guarda o `datasetId` do arquivo de origem. Ao abrir outro arquivo, gráficos antigos se **adaptam** (com aviso) ou pedem ajuste em 1 clique.
3. **Um arquivo ativo por vez**: não é necessário carregar vários arquivos simultaneamente nesta entrega. A modelagem com `datasetId` deve deixar a porta aberta para múltiplos arquivos no futuro.
4. **Modo Pipefy continua funcionando**: o fluxo atual de sincronização do Pipe não pode regredir.

### Critério de sucesso (macro)

Importar um arquivo com colunas desconhecidas e, **sem tocar em código**:

- ver modelos de gráfico coerentes com as capacidades do arquivo;
- criar/editar gráficos usando os campos corretos;
- recarregar a página e os gráficos continuarem funcionando;
- importar um arquivo novo e os gráficos antigos **nunca renderizarem dados errados silenciosamente**: eles se adaptam com badge de aviso ou exibem estado "precisa de ajuste".

---

## 2. Estado atual (mapa do código)

### 2.1 Pipeline de gráficos

```
Pipefy / arquivo
      │
      ▼
sqlConverter.convertXlsxBufferToSqlDataset   (src/lib/sqlConverter.ts)
      │  xlsx → colunas tipadas (VARCHAR/DOUBLE/DATE/BOOLEAN) + linhas
      ▼
pipefySyncUtils / usePipefyCardsSync          (cache IndexedDB + DuckDB-WASM)
      │
      ▼
chartSemantics.profileColumn / profileDatasetColumns   (papéis semânticos)
      │
      ▼
duckDbChartUtils.buildChartQuerySpec          (gera SQL DuckDB)
      │
      ▼
useDuckDbQuery → duckDbChartUtils.mapDuckDbRowsToChartResult
      │
      ▼
ChartRenderer (Recharts) / DashboardChartCard
```

### 2.2 Arquivos principais

| Arquivo | Responsabilidade atual |
|---|---|
| `src/types/pipefySql.ts` | `PipefySqlDataset`, `SqlColumnDef`, tipos de sync |
| `src/types/dashboardViews.ts` | `DashboardChartConfig`, tipos de gráfico, agregações, opções de tipo |
| `src/lib/sqlConverter.ts` | `.xlsx` → dataset SQL; inferência de tipo; nome da tabela |
| `src/utils/xlsxWorkerUtils.ts` | parse em Web Worker com fallback na main thread |
| `src/workers/xlsxToSql.worker.ts` | worker de conversão |
| `src/utils/pipefySyncUtils.ts` | import local, cache, sync Pipefy, Parquet |
| `src/hooks/usePipefyCardsSync.ts` | estado do dataset ativo, import local, troca de usuário |
| `src/lib/pipefyIndexedDb.ts` | persistência de datasets em IndexedDB |
| `src/utils/chartSemantics.ts` | papéis de coluna, templates, formatação, heurísticas |
| `src/utils/duckDbChartUtils.ts` | SQL do gráfico, agregações, mapeamento de linhas, resumo executivo |
| `src/hooks/useDuckDb.ts` | execução declarativa de SQL |
| `src/components/AddChartModal.tsx` | criação/edição de gráfico + preview |
| `src/components/DashboardChartCard.tsx` | card do gráfico no dashboard |
| `src/components/ChartRenderer.tsx` | renderização Recharts por tipo |
| `src/components/ExecutiveSummaryStrip.tsx` | faixa de KPIs do topo |
| `src/components/PipefyDashboard.tsx` | composição da tela |
| `src/hooks/useDashboardViews.ts` | CRUD de views/gráficos + persistência |
| `src/lib/pipefyAppStorage.ts` | persistência das views no App Storage do Pipefy |

### 2.3 Limitações que impedem genericidade

1. **Dataset amarrado ao Pipe**
   - `PipefySqlDataset` depende de `userId::pipeId` (`cacheKey`), `pipeName` e `tableName` fixo `pipe_<pipeId>_cards`.
   - Import local usa sempre `LOCAL_TEST_PIPE_ID = 'local_xlsx'`, sobrescrevendo o arquivo anterior.

2. **Gráfico não guarda o arquivo de origem**
   - `DashboardChartConfig` não tem `datasetId`.
   - `buildChartQuerySpec` resolve `groupBy`/`metric` por nome e, se não encontrar, cai em `dataset.columns[0]` (fallback silencioso).
   - `AddChartModal` também cai em `numericColumns[0]`.

3. **Heurísticas de coluna específicas de Pipe**
   - `chartSemantics.ts` usa listas de nomes (fase, SLA, responsável, etiquetas, moeda).
   - Não há uso de estatísticas dos dados (cardinalidade, nulos, valores de exemplo).
   - Não há como o usuário corrigir o papel de uma coluna.

4. **Templates e resumo executivo fixos**
   - `generateRecommendedTemplates` assume fase/SLA/moeda.
   - `buildExecutiveSummaryQuery`/`ExecutiveSummaryStrip` assumem overdue/done/currency.

5. **Tipo de gráfico duplicado em 3 lugares**
   - `DashboardChartType` (`types/dashboardViews.ts`);
   - lista de ícones e condicionais no `AddChartModal`;
   - `switch` no `ChartRenderer`.
   - Adicionar um tipo novo exige editar vários arquivos.

6. **Import rígido**
   - Só primeira aba do `.xlsx`.
   - Sem CSV.
   - Sem informação de abas para a UI.

---

## 3. Arquitetura alvo

```
┌─────────────────────────────────────────────────────────────┐
│ Dataset (Pipefy ou arquivo)                                  │
│  datasetId · name · source · columns[stats] · schemaFingerprint │
└───────────────────────────┬─────────────────────────────────┘
                            │
       ┌────────────────────┼─────────────────────┐
       ▼                    ▼                     ▼
 chartSemantics       chartConfigResolver    chartCapabilities
 (papel + confiança)  (resolve/valida campos) (o que dá para chartar)
       │                    │                     │
       └──────────┬─────────┴──────────┬──────────┘
                  ▼                    ▼
        buildChartQuerySpec      generateRecommendedTemplates
        (SQL + issues)           / buildAutoDashboard
                  │
                  ▼
        mapDuckDbRowsToChartResult
                  │
                  ▼
        ChartRenderer (registry de tipos)
```

### Princípios

1. **Fonte única de verdade**: todo controle da UI deriva de `ColumnProfile` + capacidades do dataset.
2. **Nunca fallback silencioso**: campo ausente gera `issue` visível, não `columns[0]`.
3. **Resolução separada de persistência**: o config resolvido é efêmero; só é gravado quando o usuário salva/adapta.
4. **Compatibilidade retroativa**: campos existentes continuam válidos; novos campos são opcionais na migração.
5. **Pipefy é um adapter**: o motor de gráficos não deve saber se veio de Pipe ou arquivo.

---

## 4. Modelo de dados alvo

### 4.1 `src/types/pipefySql.ts`

Adicionar (fase 1: campos opcionais; fase 1.3: obrigatórios):

```ts
export type DatasetSource = 'pipefy' | 'file';

export interface DatasetColumnStats {
  distinctCount?: number;
  nullCount?: number;
  topValues?: string[]; // até 10 valores mais frequentes
}

export interface SqlColumnDef {
  name: string;
  label: string;
  sourceHeader: string;
  pipefyType?: string;
  sqlType: SqlColumnType;
  stats?: DatasetColumnStats; // NOVO
}

export interface PipefySqlDataset {
  cacheKey: string;
  userId: string;
  pipeId: string;
  /** @deprecated usar name. Mantido para compatibilidade. */
  pipeName: string;
  tableName: string;
  columns: SqlColumnDef[];
  rows?: SqlRow[];
  parquetBuffer?: Uint8Array;
  parquetBytes?: number;
  createTableSql: string;
  rowsCount: number;
  syncedAt: number;
  ttlMs: number;
  reportId?: string;
  exportId?: string;
  estimatedBytes: number;

  // NOVOS
  datasetId: string;          // estável por origem
  name: string;               // nome exibido (arquivo ou pipe)
  source: DatasetSource;
  sheetName?: string;
  schemaFingerprint: string;
}
```

**Regra de compatibilidade**: durante a fase 1, `datasetId`, `name`, `source` e `schemaFingerprint` podem ser opcionais; criar `ensureDatasetIdentity(dataset)` em `src/lib/datasetIdentity.ts` que preenche os valores derivando de `pipeId`/`pipeName` para registros antigos. Torná-los obrigatórios só após atualizar todos os pontos de criação.

### 4.2 `src/types/dashboardViews.ts`

```ts
export interface DashboardChartConfig {
  // ...campos existentes...
  datasetId?: string;          // NOVO
  schemaFingerprint?: string;  // NOVO (informativo)
  configVersion?: 2;           // NOVO
}
```

- Não remover `filterColumn`/`filterValue` legados; migrar na leitura.
- Não alterar `DashboardChartType` nesta fase.

### 4.3 Identidade do dataset — novo `src/lib/datasetIdentity.ts`

```ts
import type { PipefySqlDataset, SqlColumnDef } from '@/types/pipefySql';

export function slugifyDatasetName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dataset';
}

export function buildPipeDatasetId(pipeId: string): string {
  return `pipe::${slugifyDatasetName(pipeId)}`;
}

export function buildFileDatasetId(params: {
  fileName: string;
  sheetName?: string;
}): string {
  const base = `file::${slugifyDatasetName(stripFileExtension(params.fileName))}`;
  return params.sheetName
    ? `${base}::${slugifyDatasetName(params.sheetName)}`
    : base;
}

export function stripFileExtension(fileName: string): string;
export function buildSchemaFingerprint(columns: SqlColumnDef[]): string;
// FNV-1a simples e síncrono:
// payload = columns.map(c => `${c.name}:${c.sqlType}`).sort().join('|')

export function ensureDatasetIdentity(
  dataset: PipefySqlDataset
): PipefySqlDataset;
```

**Decisões:**
- `datasetId` do arquivo é baseado no **nome do arquivo** (e aba). Reimportar o mesmo arquivo mantém o ID; renomear cria outro (documentar).
- `schemaFingerprint` serve apenas para diagnóstico/aviso, não bloqueia renderização.
- Para Pipefy: `pipe::<pipeId>`.
- Para arquivo local: `file::<nome-slug>[::<aba-slug>]`.

### 4.4 `src/utils/chartConfigResolver.ts` (novo — núcleo da entrega)

```ts
import type { DashboardChartConfig } from '@/types/dashboardViews';
import type { PipefySqlDataset, SqlColumnDef, SqlColumnType } from '@/types/pipefySql';

export type ChartConfigField =
  | 'groupBy'
  | 'metric'
  | 'breakdownBy'
  | 'dateRangeColumn'
  | 'filter';

export type ChartConfigIssueCode =
  | 'dataset_mismatch'
  | 'column_missing'
  | 'column_remapped'
  | 'column_type_changed'
  | 'filter_removed'
  | 'field_cleared';

export interface ChartConfigIssue {
  code: ChartConfigIssueCode;
  field: ChartConfigField | string; // para filtros, usar filter.id
  severity: 'info' | 'warning' | 'error';
  missingColumn?: string;
  resolvedColumn?: string;
  message: string;
}

export interface ResolvedChartConfig {
  config: DashboardChartConfig;
  issues: ChartConfigIssue[];
  canRender: boolean;
  isAdapted: boolean;
}

export function resolveChartConfig(
  dataset: PipefySqlDataset | null | undefined,
  chart: DashboardChartConfig
): ResolvedChartConfig;

/** Exportado para testes unitários. */
export function resolveColumnRef(
  dataset: PipefySqlDataset,
  requested: string | undefined,
  options?: {
    allowedSqlTypes?: SqlColumnType[];
    fallbackRoles?: ColumnSemanticRole[];
  }
): { column: SqlColumnDef | null; matchedBy: 'exact' | 'normalized' | 'label' | 'role' | null };
```

#### Regras de resolução (ordem obrigatória)

Para `groupBy`, `metric`, `breakdownBy`, `dateRangeColumn` e `filter.column`:

1. **Nome exato** (`column.name === requested`).
2. **Nome normalizado**: comparar `normalizeSemanticText` do `name`, `label` e `sourceHeader`.
3. **Label/header original**: comparação case/acento-insensível.
4. **Mesmo papel semântico**: apenas se `fallbackRoles` foi informado e existir **um único** candidato compatível com `allowedSqlTypes`; senão `null`.
5. Nunca usar `dataset.columns[0]` automaticamente.

Regras de `canRender`:

- `kpi`: renderiza sem `groupBy`. Se `aggregation` exige métrica numérica (`sum/avg/median/min/max`) e `metric` não resolveu → `canRender = false`.
- Demais tipos: exigem `groupBy` resolvido → senão `canRender = false`.
- `count_distinct` aceita qualquer tipo de coluna.
- `count_true`/`true_rate` exigem `BOOLEAN`.
- `sum/avg/median/min/max` exigem `DOUBLE`.
- Filtros inválidos são **removidos** do config efetivo com issue `filter_removed`; não bloqueiam o gráfico.
- `dataset_mismatch`: se `chart.datasetId` existe e é diferente de `dataset.datasetId` → `canRender = false` com mensagem “Este gráfico pertence a outro arquivo”.
- `isAdapted = issues.some(i => i.code === 'column_remapped')`.

**Importante**: `resolveChartConfig` **não grava nada**. Quem persiste é a UI ao salvar ou ao clicar em “Adaptar”.

---

## 5. Fases de implementação

> Ordem pensada para entregar valor cedo e reduzir risco. Cada fase deve deixar `npm run lint`, `npx tsc --noEmit` e `npm run build` verdes.

### Fase 0 — Baseline e preparação

**Objetivo**: garantir que o agente parta de um estado conhecido.

Tarefas:

- [ ] Rodar `npm install` (se necessário), `npm run lint`, `npx tsc --noEmit` e `npm run build`; registrar falhas pré-existentes.
- [ ] Criar testes manuais de referência com 3 arquivos (ver seção 7).
- [ ] Não alterar comportamento nesta fase.

**Critério de aceite**: baseline documentado no PR (comandos e resultado).

---

### Fase 1 — Identidade do dataset e escopo do gráfico

**Objetivo**: cada gráfico saber de qual arquivo veio; um arquivo novo não deixar gráficos órfãos sem aviso.

#### Arquivos

- `src/types/pipefySql.ts`
- `src/types/dashboardViews.ts`
- `src/lib/datasetIdentity.ts` (novo)
- `src/lib/sqlConverter.ts`
- `src/utils/xlsxWorkerUtils.ts`
- `src/workers/xlsxToSql.worker.ts`
- `src/utils/pipefySyncUtils.ts`
- `src/hooks/usePipefyCardsSync.ts`
- `src/lib/pipefyIndexedDb.ts`
- `src/hooks/useDashboardViews.ts`
- `src/components/PipefyDashboard.tsx`
- `src/components/AddChartModal.tsx`
- `src/lib/pipefyAppStorage.ts`

#### Tarefas

1. [ ] Adicionar os campos novos em `PipefySqlDataset` e `DashboardChartConfig` (opcionais nesta fase).
2. [ ] Criar `datasetIdentity.ts` com `buildPipeDatasetId`, `buildFileDatasetId`, `buildSchemaFingerprint`, `ensureDatasetIdentity`, `stripFileExtension`.
3. [ ] Em `sqlConverter.convertXlsxBufferToSqlDataset`:
   - aceitar `datasetName?`, `source?`, `sheetName?`;
   - retornar `datasetId`, `name`, `source`, `sheetName`, `schemaFingerprint`;
   - derivar `tableName` de forma estável, por exemplo `ds_${shortHash(datasetId)}_data` (substituir `pipe_${pipeId}_cards` apenas para `source === 'file'`; manter o nome atual para Pipefy).
4. [ ] Em `xlsxWorkerUtils.ts` e `xlsxToSql.worker.ts`: transportar os novos parâmetros e campos de retorno.
5. [ ] Em `pipefySyncUtils.ts`:
   - renomear `importLocalXlsxFile` para `importLocalDataFile` (manter alias exportado para não quebrar chamadas);
   - gerar `datasetId` via `buildFileDatasetId({ fileName: file.name, sheetName })`;
   - gravar `name: pipeName`, `source: 'file'`;
   - no sync Pipefy, `datasetId: buildPipeDatasetId(pipeId)`, `source: 'pipefy'`, `name: meta.name`.
6. [ ] Em `usePipefyCardsSync.ts`: repassar os campos; ao restaurar cache antigo, aplicar `ensureDatasetIdentity`.
7. [ ] Em `pipefyIndexedDb.ts`: como `saveSqlDataset` faz spread do dataset, os novos campos já persistem. Apenas garantir que `ensureDatasetIdentity` seja aplicado na leitura (`getCachedSqlDataset`).
8. [ ] Em `useDashboardViews.ts`:
   - adicionar `addCharts(viewId, configs)` que faz **um único** `commitState` (necessário para o painel automático);
   - adicionar `adaptChartToDataset(viewId, chartId, patch)` ou reutilizar `updateChart` (preferir reutilizar; documentar).
9. [ ] Em `AddChartModal.tsx`, no `onSaveChart`, incluir:
   ```ts
   datasetId: dataset?.datasetId,
   schemaFingerprint: dataset?.schemaFingerprint,
   configVersion: 2,
   ```
10. [ ] Em `pipefyAppStorage.ts`, adicionar `migrateChartConfig(item)`:
    - se `configVersion` ausente, preencher `configVersion: 2`;
    - se `filterColumn` + `filterValue` existirem e `filters` não, converter para `filters`;
    - não inventar `datasetId` (deixar `undefined` para gráficos legados = adaptáveis).
11. [ ] Em `PipefyDashboard.tsx`:
    - calcular `chartsForActiveDataset` (`!chart.datasetId || chart.datasetId === dataset?.datasetId`);
    - calcular `chartsFromOtherDatasets`;
    - renderizar os do arquivo ativo no grid normal;
    - renderizar uma faixa recolhível “X gráfico(s) de outro(s) arquivo(s)” com botões **Adaptar ao arquivo atual** (por gráfico) e **Remover**;
    - quando `dataset` for `null` (modo demonstrativo), tratar todos como adaptáveis.

#### Contratos e edge cases

- Dataset antigo sem `datasetId`: `ensureDatasetIdentity` deriva `pipe::<pipeId>` ou `file::<pipeName>`.
- `cacheKey` continua `userId::pipeId` nesta fase. Para arquivo local, o slot continua único e é sobrescrito ao importar outro arquivo. Isso é aceitável pela decisão “um arquivo por vez”; o gráfico antigo fica em “outro arquivo” até o arquivo ser reimportado.
- Gráficos legados sem `datasetId` **não** devem sumir: são tratados como adaptáveis ao dataset ativo.

#### Critério de aceite

- Importar `vendas.xlsx`, criar 2 gráficos, recarregar a página → gráficos continuam.
- Importar `rh.xlsx` → os 2 gráficos anteriores aparecem na faixa “outro arquivo”, não no grid misturados.
- Voltar a importar `vendas.xlsx` → os gráficos voltam a renderizar.
- Modo Pipefy: sync, cache, troca de usuário e limpeza continuam funcionando.

---

### Fase 2 — Resolver de compatibilidade (sem fallback silencioso)

**Objetivo**: nunca gerar gráfico errado por causa de coluna ausente.

#### Arquivos

- `src/utils/chartConfigResolver.ts` (novo)
- `src/utils/duckDbChartUtils.ts`
- `src/utils/chartSemantics.ts` (exportar/centralizar `normalizeSemanticText` se necessário)
- `src/components/DashboardChartCard.tsx`
- `src/components/AddChartModal.tsx`
- `src/types/dashboardViews.ts` (se precisar de campos de issue no spec)

#### Tarefas

1. [ ] Implementar `resolveChartConfig` + `resolveColumnRef` conforme seção 4.4.
2. [ ] Em `duckDbChartUtils.ts`:
   - adicionar ao `ChartQuerySpec`:
     ```ts
     canRender: boolean;
     issues: ChartConfigIssue[];
     appliedConfig: DashboardChartConfig;
     ```
   - em `buildChartQuerySpec`, remover **todos** os fallbacks silenciosos:
     - `const groupCol = find(...) ?? dataset.columns[0]`;
     - qualquer uso de `dataset.columns[0]` como grupo;
     - fallback de métrica numérica.
   - quando `canRender === false`, retornar `sql: ''` e os `issues` (não montar SQL inválido).
   - aceitar opção `preResolved?: ResolvedChartConfig` para evitar resolver duas vezes:
     ```ts
     buildChartQuerySpec(dataset, selection, options?: { resolved?: ResolvedChartConfig })
     ```
   - filtros cuja coluna não existe são descartados com issue.
   - datas de recorte (`dateRangeColumn`) ausentes não podem quebrar a query; desativar o preset com issue.
3. [ ] Em `DashboardChartCard.tsx`:
   - resolver antes de montar o spec;
   - se `!canRender` ou `datasetId` diferente: renderizar estado dedicado:
     - título do gráfico;
     - lista de campos ausentes;
     - botão **Ajustar gráfico** (abre modal via nova prop `onFix`);
     - botão **Apontar para este arquivo** quando for `dataset_mismatch` (aplica adaptação e reabre);
   - se adaptado: badge pequena “Adaptado: campo antigo → campo novo”;
   - `useDuckDbQuery(canRender ? spec.sql : null, ...)`.
4. [ ] Em `AddChartModal.tsx`:
   - receber/derivar `resolution` quando `initialChart` existir;
   - exibir banner de issues no topo do formulário (reaproveitar estilo dos `sanityWarnings`);
   - ao salvar um gráfico adaptado, gravar os campos resolvidos + `datasetId` atual (congela a adaptação).
5. [ ] Remover o fallback `numericColumns[0]` do `effectiveMetric` no modal; se não houver métrica válida, desabilitar agregações numéricas com aviso.
6. [ ] Atualizar `analyzeChartSanity` para receber issues de resolução? **Não obrigatório**; manter separado para reduzir escopo.

#### Edge cases obrigatórios

- Coluna existe com nome diferente por acento/caixa → remapeia, issue `column_remapped` (warning).
- Coluna existe mas mudou de tipo (ex.: `valor` DOUBLE virou VARCHAR) → issue `column_type_changed`; se agregação numérica, `canRender = false`.
- `groupBy` ausente, mas existe exatamente uma coluna de dimensão → **não** remapear automaticamente; mostrar “Ajustar”. (Evita gráfico arbitrário.)
- Filtro aponta para coluna removida → filtro removido + issue info; gráfico continua.
- Gráfico `kpi` sem `groupBy` → renderiza normalmente.
- Gráfico `kpi` com `sum` e métrica removida → estado de ajuste.

#### Critério de aceite

- Criar gráfico em `vendas.xlsx` usando `regiao`; importar arquivo em que `regiao` não existe → card mostra “campo `regiao` não encontrado” e **não** desenha um gráfico usando a primeira coluna.
- Renomear `regiao` para `Região` (mesma semântica) → card re-renderiza com badge “Adaptado”.
- Filtro em coluna removida → gráfico continua sem o filtro e mostra issue.

---

### Fase 3 — Inferência de schema genérica e overrides do usuário

**Objetivo**: arquivos desconhecidos receberem papéis semânticos razoáveis, com correção manual.

#### Arquivos

- `src/utils/columnRoleRules.ts` (novo)
- `src/utils/chartSemantics.ts`
- `src/lib/sqlConverter.ts`
- `src/lib/columnRoleOverrides.ts` (novo)
- `src/components/AddChartModal.tsx`
- `src/types/pipefySql.ts` (stats)

#### Tarefas

1. [ ] Definir `columnRoleRules.ts`:
   ```ts
   export interface ColumnRoleRule {
     id: string;
     role: ColumnSemanticRole;
     score: number;
     matches: (input: {
       name: string;
       label: string;
       sqlType: SqlColumnType;
       pipefyType?: string;
       stats?: DatasetColumnStats;
     }) => boolean;
   }
   export const COLUMN_ROLE_RULES: ReadonlyArray<ColumnRoleRule>;
   ```
   - Migrar os regexes/listas atuais de `chartSemantics.ts` para regras.
   - Adicionar regras por dados:
     - `DOUBLE` + `distinctCount === rowsCount` + nome termina em `id`/`codigo` → `identifier`;
     - `VARCHAR` + `distinctCount <= 30` → dimensão de status (prioridade média);
     - `VARCHAR` + `distinctCount > 50%` das linhas → dimensão de baixa prioridade;
     - `DATE` já é tratado por tipo.
2. [ ] Coletar `stats` no `sqlConverter`:
   - para cada coluna, calcular `nullCount` e `distinctCount` na amostra (primeiras ~500 linhas) e `topValues` (até 10) apenas para colunas `VARCHAR`/`BOOLEAN`;
   - custo deve ser O(n) e limitado; não guardar valores únicos ilimitados.
3. [ ] `profileColumn(col, overrides?)`:
   - aceitar `overrides?: ColumnRoleOverride`;
   - `ColumnProfile` ganha `confidence: 'high' | 'medium' | 'low'` e `roleSource: 'pipefyType' | 'header' | 'data' | 'user'`;
   - `profileDatasetColumns(columns, overrides?)`.
4. [ ] `columnRoleOverrides.ts`:
   - chave `pipelens_column_roles::<datasetId>`;
   - shape: `Record<columnName, { role?: ColumnSemanticRole; valueFormat?: ChartValueFormat }>`;
   - funções `loadColumnRoleOverrides(datasetId)`, `saveColumnRoleOverrides(datasetId, overrides)`;
   - usar `localStorage` (evita migração do IndexedDB nesta entrega).
5. [ ] UI de override no `AddChartModal`:
   - seção recolhível “Ajustar tipo das colunas”;
   - por coluna relevante, select de papel (`Identificador`, `Moeda`, `Percentual`, `Data`, `Categoria`, `Número`, `Sim/Não`);
   - aplicar em memória no preview e persistir ao salvar (ou em um botão “Aplicar tipos”).
6. [ ] Garantir que o modo Pipefy continue usando `pipefyType` com prioridade máxima (regra de maior score), mas sem depender dele.

#### Critério de aceite

- Arquivo com `matricula` numérica única → `identifier`, não aparece como métrica.
- Arquivo com `valor total (R$)` → `currency`, formato `currency_brl` sugerido.
- Arquivo com `situacao` de 5 valores → dimensão de status com prioridade alta.
- Trocar manualmente `codigo` de numérico para identificador remove a coluna das métricas no modal e dos templates.

---

### Fase 4 — Capacidades, templates e resumo executivo genéricos

**Objetivo**: o painel nasce útil para qualquer arquivo, sem conceitos fixos de Pipe.

#### Arquivos

- `src/utils/chartCapabilities.ts` (novo)
- `src/utils/chartSemantics.ts` (`generateRecommendedTemplates`)
- `src/utils/duckDbChartUtils.ts` (`buildExecutiveSummaryQuery`)
- `src/components/ExecutiveSummaryStrip.tsx`
- `src/components/PipefyDashboard.tsx`
- `src/hooks/useDashboardViews.ts` (se ainda não tiver `addCharts`)

#### Tarefas

1. [ ] Criar `chartCapabilities.ts`:
   ```ts
   export interface DatasetCapabilities {
     primaryDimension: ColumnProfile | null;
     primaryDate: ColumnProfile | null;
     primaryNumeric: ColumnProfile | null;
     primaryCurrency: ColumnProfile | null;
     primaryBoolean: ColumnProfile | null;
     primaryAssignee: ColumnProfile | null; // opcional (Pipefy)
     dimensions: ColumnProfile[];
     dates: ColumnProfile[];
     numerics: ColumnProfile[];
     booleans: ColumnProfile[];
   }
   export function getDatasetCapabilities(
     dataset: PipefySqlDataset | null | undefined,
     overrides?: ColumnRoleOverrides
   ): DatasetCapabilities;
   ```
2. [ ] Reescrever `generateRecommendedTemplates(dataset)`:
   - usar capacidades, não listas fixas de Pipe;
   - ordem sugerida:
     1. ranking por dimensão principal (contagem);
     2. tendência temporal (se houver data);
     3. participação por booleano (se houver);
     4. soma/média por dimensão (se houver numérico/moeda);
     5. KPI (contagem ou soma da moeda).
   - todo template deve ser validado: `resolveChartConfig(dataset, tpl.config).canRender === true`; descartar inválidos.
   - manter fallback de `samplePreset` quando `dataset` for `null`.
3. [ ] Criar `buildAutoDashboard(dataset, maxCharts = 4)` retornando `Array<Omit<DashboardChartConfig,'id'>>` válidos.
4. [ ] Em `PipefyDashboard.tsx`:
   - no estado vazio, botão **Criar painel automático** que chama `addCharts(activeView.id, buildAutoDashboard(dataset))`;
   - após o primeiro import (transição `dataset === null → dataset`), **não** criar automaticamente sem consentimento; apenas destacar o botão.
5. [ ] `buildExecutiveSummaryQuery`:
   - continuar retornando SQL, mas derivar expressões de capacidades;
   - renomear conceitos: `overdue_cards` pode permanecer como alias interno, mas a UI usa labels genéricos;
   - moeda só quando `primaryCurrency` existir;
   - “concluídos” só quando `boolean_done`/`date_finished` existirem.
6. [ ] `ExecutiveSummaryStrip`:
   - card 1: “Registros” + nome do dataset;
   - card 2: dimensão principal (nº de grupos) ou “Preenchimento”;
   - card 3: booleano principal (taxa) quando existir;
   - card 4: valor total/média da moeda principal quando existir;
   - remover textos “cards do Pipe” quando `dataset.source === 'file'`.
7. [ ] Verificar que `generateRecommendedTemplates` continua sendo usado em `PipefyDashboard` e `AddChartModal` sem quebrar tipos.

#### Critério de aceite

- Arquivo de RH (sem fase/SLA) gera templates de: ranking por departamento, evolução por data de admissão, distribuição de status, média salarial, KPI.
- Arquivo de vendas gera: ranking por região, evolução mensal, participação de status, soma de receita, ticket médio.
- Nenhum template referencia coluna inexistente.

---

### Fase 5 — Importação genérica: CSV e múltiplas abas

**Objetivo**: qualquer planilha tabular comum entra sem código.

#### Arquivos

- `src/lib/sqlConverter.ts`
- `src/utils/xlsxWorkerUtils.ts`
- `src/workers/xlsxToSql.worker.ts`
- `src/utils/pipefySyncUtils.ts`
- `src/hooks/usePipefyCardsSync.ts`
- `src/components/PipefyDashboard.tsx`

#### Tarefas

1. [ ] `sqlConverter`:
   - renomear `convertXlsxBufferToSqlDataset` para `convertTabularBufferToSqlDataset` (manter alias `export const convertXlsxBufferToSqlDataset = convertTabularBufferToSqlDataset`);
   - parâmetros: `{ buffer, pipeId, pipeName, fieldHints?, datasetName?, source?, sheetName?, format?: 'xlsx' | 'csv' }`;
   - escolher `sheetName` se informado, senão primeira aba;
   - retornar `sheetNames: string[]`;
   - para CSV, `sheetName` é ignorado.
2. [ ] `xlsxWorkerUtils`:
   - adicionar `listWorkbookSheets(buffer): Promise<string[]>` usando `XLSX.read(buffer, { bookSheets: true })` (não parseia células);
   - transportar `format`/`sheetName` no `postMessage`.
3. [ ] Worker: repassar novos parâmetros.
4. [ ] `pipefySyncUtils.importLocalDataFile`:
   - detectar extensão (`.csv` vs `.xlsx/.xls`);
   - validar tamanho > 0;
   - se `sheetName` não vier e houver múltiplas abas, **não** escolher silenciosamente: a UI deve escolher. A camada de sync pode lançar erro claro `MULTIPLE_SHEETS` com a lista, ou receber `sheetName` já escolhido. **Preferir** a UI escolher antes de chamar o sync.
5. [ ] `PipefyDashboard`:
   - `accept=".xlsx,.xls,.csv"`;
   - ao selecionar `.xlsx` com múltiplas abas, abrir seletor inline (estado `pendingImport: { file, sheets }`) e só então chamar `importLocalXlsx(file, { sheetName })`;
   - atualizar `usePipefyCardsSync.importLocalXlsx` para aceitar `{ sheetName?: string }` (manter nome ou renomear para `importLocalFile`);
   - textos: “Importar planilha (.xlsx/.csv)” e “X registros”.
6. [ ] Garantir que `dropDuckDbTable` continue sendo chamado antes de sobrescrever o dataset local, evitando tabela órfã.

#### Critério de aceite

- Importar `.csv` com `;` e com `,` → dataset carregado corretamente.
- Importar `.xlsx` com 2 abas → UI pergunta qual; cada aba gera `datasetId` distinto.
- Importar CSV não quebra o modo Pipefy nem o cache local.

---

### Fase 6 — Registry de tipos de gráfico e capacidades do builder

**Objetivo**: adicionar/editar tipos de gráfico de forma genérica; eliminar condicionais por tipo espalhadas.

#### Arquivos

- `src/components/charts/chartTypeRegistry.tsx` (novo)
- `src/types/dashboardViews.ts`
- `src/components/ChartRenderer.tsx`
- `src/components/AddChartModal.tsx`
- `src/lib/pipefyAppStorage.ts`
- `src/components/DashboardChartCard.tsx` (se necessário)

#### Tarefas

1. [ ] Criar o registry **sem importar `ChartRenderer`** (evitar dependência circular):
   ```tsx
   export type ChartCapability =
     | 'breakdown'
     | 'averageLine'
     | 'stack'
     | 'dateGranularity'
     | 'groupOthers'
     | 'splitMultiValue'
     | 'limit'
     | 'sort'
     | 'valueFormat';

   export interface ChartTypeDefinition {
     type: DashboardChartType;
     label: string;
     description: string;
     bestFor?: string;
     tier: 'primary' | 'legacy';
     icon: LucideIcon;
     capabilities: ReadonlySet<ChartCapability>;
   }

   export const CHART_TYPE_REGISTRY: Record<DashboardChartType, ChartTypeDefinition>;
   export function getChartTypeDefinition(type: DashboardChartType): ChartTypeDefinition;
   export function getChartTypeOptions(tier?: 'primary' | 'legacy'): DashboardChartTypeOption[];
   ```
   - `ChartRenderer` continua com seu `switch`, mas importa apenas helpers de capability quando precisar.
2. [ ] Mapear capacidades dos tipos atuais:
   | Tipo | breakdown | averageLine | limit | sort | groupOthers | splitMultiValue | valueFormat |
   |---|---|---|---|---|---|---|---|
   | horizontalBar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
   | bar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
   | line | ✓ | ✓ | ✓ | ✓ (só eixo categórico) | ✓ | ✓ | ✓ |
   | area | ✓ | ✓ | ✓ | ✓ (só eixo categórico) | ✓ | ✓ | ✓ |
   | pie | — | — | ✓ | ✓ | ✓ | ✓ | ✓ |
   | kpi | — | — | — | — | — | — | ✓ |
   | radar | — | — | ✓ | — | — | — | ✓ |
   | radialBar | — | — | ✓ | — | — | — | ✓ |
3. [ ] `AddChartModal`:
   - cards de tipo e ícones derivados do registry;
   - trocar condicionais `chartType === 'bar' || ...` por `getChartTypeDefinition(chartType).capabilities.has(...)`;
   - **adicionar seletor de segmentação (`breakdownBy`)** quando `capabilities.has('breakdown')` — hoje o campo existe no SQL mas não na UI;
   - adicionar seletor de `stackMode` quando `capabilities.has('stack')`;
   - manter `dateGranularity` condicionado a `groupProfile.groupCategory === 'date'`.
4. [ ] `dashboardViews.ts`:
   - manter `DashboardChartType` no arquivo de tipos;
   - mover `PRIMARY_CHART_TYPE_OPTIONS`/`LEGACY_CHART_TYPE_OPTIONS`/`DASHBOARD_CHART_TYPE_OPTIONS` para o registry ou reexportá-los de lá;
   - ajustar imports em `pipefyAppStorage.ts`, `AddChartModal.tsx`, `ChartRenderer.tsx`.
5. [ ] `pipefyAppStorage.isValidChartConfig`: validar contra `CHART_TYPE_REGISTRY` para garantir compatibilidade.
6. [ ] Documentar no topo do registry: “para adicionar um tipo, adicione a entrada aqui e o renderer no ChartRenderer”.

#### Critério de aceite

- Adicionar um tipo fictício de teste (ex.: `scatter`) no registry + renderer faz o tipo aparecer no modal e ser aceito no storage, sem editar mais nada.
- A UI não mostra controles incompatíveis (ex.: linha de média em pizza, granularidade em KPI).
- Segmentação (`breakdownBy`) funciona nos tipos que suportam e não aparece nos demais.

---

### Fase 7 — Testes e QA

**Objetivo**: travar as regras críticas e validar regressão.

#### Infra recomendada

- Adicionar `vitest` como devDependency e script `"test": "vitest run"`.
- Criar `vitest.config.ts` com alias `@` → `./src` e `environment: 'node'`.
- Se adicionar dependência não for desejado, criar script Node separado; mas `vitest` é o caminho mais simples.

#### Testes unitários obrigatórios

1. `src/utils/__tests__/chartConfigResolver.test.ts`
   - coluna exata;
   - remapeamento por acento/caixa;
   - remapeamento por label;
   - coluna ausente → `canRender=false` (não escolhe `columns[0]`);
   - tipo mudou (DOUBLE → VARCHAR) → issue e bloqueio para soma;
   - filtro órfão removido sem bloquear;
   - `datasetId` diferente → `dataset_mismatch`.
2. `src/utils/__tests__/columnSemantics.test.ts`
   - ID numérico único → `identifier`;
   - data em texto → `date`;
   - `valor total (R$)` → `currency`;
   - `situacao` com 5 valores → dimensão/status;
   - override do usuário vence a heurística.
3. `src/utils/__tests__/chartTemplates.test.ts`
   - para 4 schemas sintéticos (vendas, chamados, RH, Pipefy), todo template gerado tem `canRender === true` e campos existentes;
   - `buildAutoDashboard` respeita `maxCharts`.
4. `src/utils/__tests__/chartQuerySpec.test.ts` (smoke)
   - para cada agregação × tipo de coluna, o SQL é gerado sem `dataset.columns[0]` indevido;
   - `canRender=false` retorna `sql: ''`.

#### QA manual (checklist)

Criar 3 arquivos de teste:

1. **vendas.xlsx**: `data`, `regiao`, `valor`, `status`, `vendedor`.
2. **chamados.xlsx**: `aberto_em`, `fechado_em`, `atrasado` (booleano), `categoria`, `descricao`, `protocolo`.
3. **rh.csv**: `admissao`, `departamento`, `salario`, `percentual_bonus`, `matricula`, `situacao`.

Para cada um:

- [ ] importar e confirmar tipos inferidos;
- [ ] criar painel automático;
- [ ] criar gráfico manual com cada agregação compatível;
- [ ] editar e salvar;
- [ ] recarregar a página;
- [ ] importar outro arquivo e verificar faixa “outro arquivo”;
- [ ] adaptar um gráfico antigo ao novo arquivo;
- [ ] confirmar que nenhum gráfico usa coluna errada sem aviso;
- [ ] testar filtros, recorte temporal, segmentação, granularidade, “Outros” e separação por vírgula;
- [ ] testar modo Pipefy (sync, cache, troca de usuário, limpar dados).

#### Comandos de verificação

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run test   # após adicionar vitest
```

---

## 6. Migração e compatibilidade

### 6.1 Dados salvos

- `PIPEFY_VIEWS_STORAGE_KEY = 'pipelens_views_v1'` não muda.
- **Fora do Pipefy** (import local/dev), as views passam a ser persistidas em
  `localStorage` sob `pipelens_local_views_v1`, para que os gráficos sobrevivam ao
  recarregamento da página. Dentro de um Pipe o App Storage do Pipefy continua
  sendo a única fonte de verdade.
- `parsePipefyStoredViews` continua aceitando views antigas.
- `migrateChartConfig` roda na leitura e:
  - adiciona `configVersion: 2`;
  - converte `filterColumn/filterValue` em `filters`;
  - **não** adiciona `datasetId` (legado = adaptável).
- Ao salvar qualquer edição, o config migrado é persistido.

### 6.2 Cache de dataset

- `cacheKey` permanece `userId::pipeId` nesta entrega.
- Registros antigos sem `datasetId` recebem identidade via `ensureDatasetIdentity`.
- Para arquivo local, o slot segue único (`local_xlsx`); reimportar outro arquivo sobrescreve. Gráficos do arquivo anterior ficam na faixa “outro arquivo” e podem ser adaptados.
- **Evolução futura** (fora do escopo): trocar a chave de cache para `datasetId` e manter múltiplos arquivos.

### 6.3 API pública existente

- Manter exports antigos como alias quando renomear:
  - `importLocalXlsxFile` → alias de `importLocalDataFile`;
  - `convertXlsxBufferToSqlDataset` → alias de `convertTabularBufferToSqlDataset`;
  - `buildBarChartQuerySpec` → alias já existente.
- `profileColumn(col)` continua funcionando; o segundo parâmetro é opcional.
- `getDefaultChartSelection(dataset)` continua retornando `{ groupBy, metric, aggregation }`.

---

## 7. Sequência sugerida de commits/PRs

1. `docs: add generic charts implementation plan`
2. `feat(dataset): add dataset identity, source and schema fingerprint`
3. `feat(charts): resolve chart config against dataset and surface issues`
4. `feat(dashboard): scope charts by dataset with adapt flow`
5. `feat(charts): derive templates and executive summary from dataset capabilities`
6. `feat(schema): add data-driven column roles and user overrides`
7. `feat(import): support csv and multiple xlsx sheets`
8. `feat(charts): add chart type registry and capability-driven builder`
9. `test: cover chart resolution, column semantics, templates and SQL smoke`

Cada commit deve passar em `lint`, `tsc --noEmit` e `build`.

---

## 8. Critérios de aceite globais (Definition of Done)

- [ ] Importar `.xlsx`, `.xls` e `.csv` com colunas arbitrárias funciona.
- [ ] É possível criar, editar, duplicar e remover gráficos sem alterar código.
- [ ] Nenhum caminho usa `dataset.columns[0]` como fallback silencioso para grupo/métrica.
- [ ] Gráfico de outro arquivo nunca renderiza dados errados: mostra estado de ajuste ou adapta com badge.
- [ ] Templates e painel automático só referenciam colunas existentes.
- [ ] Papéis de coluna usam dados + tipo + heurística, com override manual persistido.
- [ ] Tipos de gráfico são registrados em um único lugar, com capacidades declaradas.
- [ ] `.csv` e múltiplas abas de `.xlsx` são suportados.
- [ ] Modo Pipefy (sync, cache por usuário, troca de usuário, limpar dados) permanece funcional.
- [ ] Views antigas abrem e migram sem perda.
- [ ] Testes unitários das regras críticas passam.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` verdes.

---

## 9. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Remover fallback `columns[0]` revela gráficos antigos “funcionando por acidente” | Médio | Migração com issue visível + botão “Ajustar”; não apagar config automaticamente |
| `datasetId` baseado no nome do arquivo | Baixo | Documentar; renomear arquivo cria outro dataset; reimportar o mesmo nome mantém |
| Um arquivo por vez deixa gráficos de arquivos antigos sem dados | Médio | Faixa explícita “outro arquivo” + adaptar/remover; evolução futura com cache por `datasetId` |
| Heurísticas novas classificarem mal colunas | Médio | Override manual + confidence + testes com 3 domínios distintos |
| Registry de tipos gerar dependência circular | Baixo | Registry só metadados/ícones; `ChartRenderer` mantém dispatch |
| `resolveChartConfig` chamado em dobro (card + spec) | Baixo | Opção `preResolved` + memoização no componente |
| Import de CSV com encoding/delimitador diferente | Baixo | `xlsx` detecta delimitador; validar com arquivos `;` e `,`; erro claro se vazio |
| Web Worker não suportar novos parâmetros | Baixo | Atualizar `postMessage` e fallback main-thread juntos |

---

## 10. Fora de escopo desta entrega

- Múltiplos arquivos carregados simultaneamente com seletor global.
- Sincronização/colaboração de views entre usuários além do storage atual.
- Novos tipos de gráfico além do registry (o registry apenas facilita).
- Detecção automática de linha de cabeçalho em planilhas com título.
- Edição de dados/limpeza de colunas.
- Reescrita do motor DuckDB ou do Recharts.

---

## 11. Checklist rápido para o agente

Antes de começar:

- [ ] Ler este documento inteiro.
- [ ] Ler `AGENTS.md` e conferir regras do Next.js 16 em `node_modules/next/dist/docs/` se tocar em rotas/config.
- [ ] Rodar baseline (`lint`, `tsc`, `build`).

Durante:

- [ ] Implementar por fase; não misturar refactors não relacionados.
- [ ] Manter compatibilidade com Pipefy.
- [ ] Não usar `dataset.columns[0]` como fallback.
- [ ] Adicionar issues em vez de esconder problemas.
- [ ] Atualizar este documento se alguma decisão mudar.

Depois:

- [ ] Rodar a suíte de verificação.
- [ ] Executar o QA manual com os 3 arquivos.
- [ ] Descrever no PR quais fases foram concluídas e o que ficou pendente.
