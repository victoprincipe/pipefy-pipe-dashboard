'use client';

import { useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Code2,
  Database,
  Download,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { AddChartFab } from '@/components/AddChartFab';
import { AddChartModal } from '@/components/AddChartModal';
import { DashboardChartCard } from '@/components/DashboardChartCard';
import { ExecutiveSummaryStrip } from '@/components/ExecutiveSummaryStrip';
import { ViewsDrawer } from '@/components/ViewsDrawer';
import { useDashboardViews } from '@/hooks/useDashboardViews';
import { useDuckDb } from '@/hooks/useDuckDb';
import { usePipefyCardsSync } from '@/hooks/usePipefyCardsSync';
import type { DashboardChartConfig } from '@/types/dashboardViews';
import type { DuckDbQueryResult } from '@/types/pipefySql';
import {
  buildAutoDashboard,
  generateRecommendedTemplates,
} from '@/utils/chartSemantics';
import { adaptChartToDataset } from '@/utils/chartConfigResolver';
import { listWorkbookSheets } from '@/utils/xlsxWorkerUtils';

type ChartModalState =
  | { mode: 'create' }
  | { mode: 'edit'; chart: DashboardChartConfig }
  | null;

export function PipefyDashboard() {
  const {
    phase,
    message,
    error,
    isInsidePipefy,
    isRootFrame,
    user,
    pipeUsers,
    cachedUsersSummary,
    pipeId,
    sdkClient,
    cacheStatus,
    dataset,
    durationMs,
    refresh,
    importLocalXlsx,
    switchPipefyUser,
    clearCache,
  } = usePipefyCardsSync({ autoDownloadOnOpen: true });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    isRunning: queryRunning,
    error: queryError,
    runQuery,
    clearResult,
  } = useDuckDb();

  const {
    views,
    activeView,
    activeViewId,
    isConnectedToPipefyStorage,
    storageVisibility,
    isSyncingStorage,
    storageError,
    selectView,
    createView,
    deleteView,
    addChart,
    addCharts,
    duplicateChart,
    updateChart,
    removeChart,
  } = useDashboardViews({
    client: sdkClient,
  });

  const [desktopDrawerOpen, setDesktopDrawerOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [chartModal, setChartModal] = useState<ChartModalState>(null);
  const [showSqlSchema, setShowSqlSchema] = useState(false);
  const [sqlDraft, setSqlDraft] = useState<{ cacheKey: string; sql: string } | null>(
    null
  );
  const [queryResult, setQueryResult] = useState<{
    cacheKey: string;
    data: DuckDbQueryResult;
  } | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    file: File;
    sheets: string[];
  } | null>(null);

  const recommendedTemplates = useMemo(
    () => generateRecommendedTemplates(dataset),
    [dataset]
  );

  // Inside Pipefy's hidden 1x1px root iframe (?root=true), only initCall runs.
  if (isRootFrame) {
    return null;
  }

  const isBusy =
    phase !== 'idle' && phase !== 'ready' && phase !== 'error';

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const activeSql = dataset
    ? sqlDraft && sqlDraft.cacheKey === dataset.cacheKey
      ? sqlDraft.sql
      : `SELECT * FROM "${dataset.tableName}" LIMIT 20;`
    : '';

  const activeResult =
    dataset && queryResult && queryResult.cacheKey === dataset.cacheKey
      ? queryResult.data
      : null;

  const runCustomQuery = async () => {
    if (!dataset || !activeSql.trim()) return;
    try {
      const data = await runQuery(activeSql);
      setQueryResult({ cacheKey: dataset.cacheKey, data });
    } catch {
      // Error state is handled by `useDuckDb`.
    }
  };

  const handleClearCache = async () => {
    clearResult();
    setQueryResult(null);
    await clearCache();
  };

  const handleSwitchPipefyUser = async (targetUserId: string) => {
    clearResult();
    setQueryResult(null);
    await switchPipefyUser(targetUserId);
  };

  const activeDatasetId = dataset?.datasetId;

  const chartsForActiveDataset = activeView.charts.filter(
    (chart) =>
      !activeDatasetId || !chart.datasetId || chart.datasetId === activeDatasetId
  );

  const chartsFromOtherDatasets = activeDatasetId
    ? activeView.charts.filter(
        (chart) => chart.datasetId && chart.datasetId !== activeDatasetId
      )
    : [];

  const chartsCount = chartsForActiveDataset.length;

  const handleAdaptChart = (chart: DashboardChartConfig) => {
    if (!dataset) return;
    const { patch } = adaptChartToDataset(dataset, chart);
    updateChart(activeView.id, chart.id, patch);
  };

  const openFixChart = (chart: DashboardChartConfig) => {
    if (!dataset) {
      setChartModal({ mode: 'edit', chart });
      return;
    }
    const { patch } = adaptChartToDataset(dataset, chart);
    setChartModal({ mode: 'edit', chart: { ...chart, ...patch } });
  };

  const handleFileSelected = async (file: File) => {
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (!isExcel) {
      void importLocalXlsx(file);
      return;
    }
    try {
      const sheets = listWorkbookSheets(await file.arrayBuffer());
      if (sheets.length > 1) {
        setPendingImport({ file, sheets });
        return;
      }
      void importLocalXlsx(file, sheets[0] ? { sheetName: sheets[0] } : undefined);
    } catch {
      void importLocalXlsx(file);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ViewsDrawer
        views={views}
        activeViewId={activeViewId}
        desktopOpen={desktopDrawerOpen}
        mobileOpen={mobileDrawerOpen}
        isConnectedToPipefyStorage={isConnectedToPipefyStorage}
        storageVisibility={storageVisibility}
        isSyncingStorage={isSyncingStorage}
        storageError={storageError}
        isInsidePipefy={isInsidePipefy}
        activeUser={user}
        pipeUsers={pipeUsers}
        cachedUsersSummary={cachedUsersSummary}
        isUserSwitchingDisabled={isBusy}
        onOpenDesktop={() => setDesktopDrawerOpen(true)}
        onOpenMobile={() => setMobileDrawerOpen(true)}
        onCloseDesktop={() => setDesktopDrawerOpen(false)}
        onCloseMobile={() => setMobileDrawerOpen(false)}
        onSelectView={selectView}
        onCreateView={(name) => {
          createView(name);
        }}
        onDeleteView={deleteView}
        onSwitchUser={handleSwitchPipefyUser}
      />

      <div className="flex-1 overflow-y-auto px-5 py-6 pb-24 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          <header className="pf-reveal flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="block text-pf-overline uppercase text-ink-secondary">
                Visão ativa
              </span>
              <h1 className="text-pf-h4 text-ink">{activeView.name}</h1>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-pf-control bg-brand-soft px-3 py-1.5 text-pf-caption font-semibold text-brand">
                {chartsCount === 0
                  ? 'Nenhum gráfico'
                  : chartsCount === 1
                    ? '1 gráfico'
                    : `${chartsCount} gráficos`}
              </span>
              <button
                type="button"
                onClick={() => setChartModal({ mode: 'create' })}
                className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control bg-brand px-3 py-1.5 text-xs font-semibold text-pf-white shadow-sm transition hover:bg-brand-shade"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Novo gráfico</span>
              </button>
            </div>
          </header>

          <section
            className="pf-reveal flex flex-wrap items-center justify-between gap-4 rounded-pf-card border border-border-subtle bg-surface px-5 py-4 shadow-pf-card"
            style={{ animationDelay: '60ms' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                e.target.value = '';
                if (selectedFile) {
                  void handleFileSelected(selectedFile);
                }
              }}
            />

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-pf-overline uppercase text-ink-secondary">
                  {isInsidePipefy
                    ? dataset?.pipeName || `Pipe #${pipeId ?? '—'}`
                    : dataset
                      ? `Planilha local · ${dataset.pipeName}`
                      : 'Modo demonstrativo'}
                </span>
                {dataset && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      cacheStatus === 'HIT'
                        ? 'bg-pf-green-100 text-pf-green-dark-2'
                        : 'bg-pf-yellow-100 text-pf-yellow-dark-1'
                    }`}
                  >
                    {cacheStatus === 'HIT' ? 'Dados atualizados' : 'Cache expirado'}
                  </span>
                )}
                {user && (
                  <span className="text-pf-caption text-ink-secondary">
                    · <strong>{user.name}</strong>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isBusy && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
                <p className="text-pf-body-2 text-ink-secondary">
                  {error
                    ? error
                    : dataset
                      ? `${dataset.rowsCount.toLocaleString('pt-BR')} registros carregados · ${dataset.columns.length} campos disponíveis${durationMs !== null ? ` · ${formatBytes(dataset.estimatedBytes)}` : ''}`
                      : message ||
                        (isInsidePipefy
                          ? 'Aguardando sincronização dos cards do Pipe...'
                          : 'Carregue uma planilha (.xlsx/.xls/.csv) para analisar seus dados reais ou explore os gráficos demonstrativos.')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {dataset && (
                <button
                  type="button"
                  onClick={() => setShowSqlSchema((v) => !v)}
                  className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control border border-border-subtle bg-canvas px-3 py-2 text-xs font-semibold text-ink transition hover:border-border-strong disabled:opacity-50"
                >
                  <Code2 className="h-3.5 w-3.5 text-brand" />
                  <span>{showSqlSchema ? 'Ocultar Console SQL' : 'Console SQL'}</span>
                </button>
              )}

              {!isInsidePipefy && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control bg-brand px-3.5 py-2 text-xs font-semibold text-pf-white transition hover:bg-brand-shade disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{dataset ? 'Trocar planilha' : 'Importar planilha (.xlsx/.csv)'}</span>
                </button>
              )}

              {isInsidePipefy && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void refresh()}
                  className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control bg-brand px-3.5 py-2 text-xs font-semibold text-pf-white transition hover:bg-brand-shade disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {dataset ? (
                    <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                  ) : isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {dataset
                      ? isBusy
                        ? 'Atualizando...'
                        : 'Atualizar dados'
                      : isBusy
                        ? 'Sincronizando...'
                        : 'Sincronizar dados'}
                  </span>
                </button>
              )}

              {dataset && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleClearCache()}
                  className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control border border-border-subtle bg-surface px-3 py-2 text-xs font-semibold text-pf-red transition hover:bg-pf-red-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Limpar dados</span>
                </button>
              )}
            </div>
          </section>

          {pendingImport && (
            <section className="pf-reveal flex flex-col gap-3 rounded-pf-card border border-border-subtle bg-surface p-5 shadow-pf-card">
              <div>
                <h3 className="text-pf-subtitle-2 text-ink">
                  Escolha a aba de &ldquo;{pendingImport.file.name}&rdquo;
                </h3>
                <p className="text-pf-caption text-ink-secondary">
                  Este arquivo tem {pendingImport.sheets.length} abas. Cada aba gera um
                  conjunto de dados separado.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingImport.sheets.map((sheet) => (
                  <button
                    key={sheet}
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      const file = pendingImport.file;
                      setPendingImport(null);
                      void importLocalXlsx(file, { sheetName: sheet });
                    }}
                    className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control border border-border-subtle bg-canvas px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand/50 hover:bg-brand-soft hover:text-brand disabled:opacity-50"
                  >
                    <span>{sheet}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPendingImport(null)}
                  className="pf-press inline-flex cursor-pointer items-center rounded-pf-control border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
            </section>
          )}

          {showSqlSchema && dataset && (
            <section className="pf-reveal flex flex-col gap-4 rounded-pf-card border border-border-subtle bg-surface p-5 shadow-pf-card">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-brand" />
                <h3 className="text-pf-subtitle-2 text-ink">
                  Estrutura da tabela e Console SQL (DuckDB-WASM)
                </h3>
              </div>

              <pre className="overflow-x-auto rounded-pf-panel bg-pf-dark-2 p-4 font-mono text-xs leading-relaxed text-pf-light-2">
                {dataset.createTableSql}
              </pre>

              <div className="flex flex-col gap-2.5 border-t border-border-subtle pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="duckdb-sql-input"
                    className="text-pf-subtitle-2 text-ink"
                  >
                    Consulta ad-hoc
                  </label>
                  {activeResult && (
                    <span className="inline-flex items-center rounded-pf-control bg-brand-soft px-2.5 py-1 text-pf-caption font-semibold text-brand">
                      {activeResult.rowCount} linhas · {activeResult.durationMs} ms
                    </span>
                  )}
                </div>

                <textarea
                  id="duckdb-sql-input"
                  rows={3}
                  value={activeSql}
                  onChange={(e) =>
                    setSqlDraft({ cacheKey: dataset.cacheKey, sql: e.target.value })
                  }
                  className="w-full rounded-pf-panel border border-border-subtle bg-canvas p-3 font-mono text-xs text-ink focus:border-brand focus:outline-none"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={queryRunning || !activeSql.trim()}
                    onClick={() => void runCustomQuery()}
                    className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control bg-brand px-3.5 py-2 text-xs font-semibold text-pf-white transition hover:bg-brand-shade disabled:opacity-50"
                  >
                    {queryRunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    <span>Executar</span>
                  </button>

                  {queryError && (
                    <p className="text-pf-caption text-pf-red">{queryError}</p>
                  )}
                </div>

                {activeResult && (
                  <div className="max-h-72 overflow-auto rounded-pf-panel border border-border-subtle">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 bg-canvas text-ink">
                        <tr>
                          {activeResult.columns.map((col) => (
                            <th
                              key={col}
                              className="border-b border-border-subtle px-3 py-2 font-mono font-semibold whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle bg-surface text-ink-secondary">
                        {activeResult.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-canvas">
                            {activeResult.columns.map((col) => {
                              const val = row[col];
                              const text =
                                val === null || val === undefined
                                  ? '—'
                                  : typeof val === 'object'
                                    ? JSON.stringify(val)
                                    : String(val);
                              return (
                                <td
                                  key={col}
                                  className="max-w-xs truncate px-3 py-1.5 font-mono whitespace-nowrap"
                                  title={text}
                                >
                                  {text}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {activeResult.rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={Math.max(activeResult.columns.length, 1)}
                              className="px-3 py-4 text-center text-pf-caption text-ink-secondary"
                            >
                              Consulta executada com sucesso, mas não retornou linhas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          <ExecutiveSummaryStrip dataset={dataset} />

          {chartsCount === 0 ? (
            <section className="pf-reveal flex flex-col items-center justify-center rounded-pf-card border border-dashed border-border-strong bg-surface px-6 py-12 text-center shadow-pf-card">
              <div
                className="pf-pop-in mb-3 flex h-12 w-12 items-center justify-center rounded-pf-panel bg-brand-soft text-brand"
                style={{ animationDelay: '120ms' }}
              >
                <BarChart3 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="text-pf-h4 text-ink">
                Monte o painel de &ldquo;{activeView.name}&rdquo;
              </h2>
              <p className="mt-1.5 max-w-lg text-pf-body-2 text-ink-secondary">
                Adicione indicadores prontos em 1 clique ou crie uma visualização personalizada para acompanhar os resultados do processo.
              </p>

              {recommendedTemplates.length > 0 && (
                <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
                  {recommendedTemplates.slice(0, 4).map((tpl, index) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() =>
                        addChart(activeView.id, {
                          ...tpl.config,
                          datasetId: dataset?.datasetId,
                          schemaFingerprint: dataset?.schemaFingerprint,
                          configVersion: 2,
                        })
                      }
                      className="pf-press pf-pop-in inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control border border-border-subtle bg-canvas px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-brand/50 hover:bg-brand-soft hover:text-brand"
                      style={{ animationDelay: `${180 + index * 50}ms` }}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {dataset && dataset.columns.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      addCharts(activeView.id, buildAutoDashboard(dataset))
                    }
                    className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control bg-brand px-4 py-2 text-xs font-semibold text-pf-white shadow-sm transition hover:bg-brand-shade"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>Criar painel automático</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setChartModal({ mode: 'create' })}
                  className="pf-press inline-flex cursor-pointer items-center gap-1.5 rounded-pf-control border border-border-subtle bg-surface px-4 py-2 text-xs font-semibold text-ink shadow-sm transition hover:border-brand/40 hover:text-brand"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Criar gráfico personalizado</span>
                </button>
              </div>
            </section>
          ) : (
            <div
              className={
                chartsCount > 1
                  ? 'grid grid-cols-1 gap-5 xl:grid-cols-2'
                  : 'flex flex-col gap-5'
              }
            >
              {chartsForActiveDataset.map((chart, index) => (
                <div
                  key={chart.id}
                  className={chart.span === 2 ? 'xl:col-span-2' : ''}
                >
                  <DashboardChartCard
                    chart={chart}
                    dataset={dataset}
                    revealDelay={Math.min(index * 70 + 120, 420)}
                    onEdit={() => setChartModal({ mode: 'edit', chart })}
                    onFix={() => openFixChart(chart)}
                    onAdaptToDataset={() => handleAdaptChart(chart)}
                    onDuplicate={() => duplicateChart(activeView.id, chart.id)}
                    onRemove={() => removeChart(activeView.id, chart.id)}
                  />
                </div>
              ))}
            </div>
          )}

          {chartsFromOtherDatasets.length > 0 && (
            <details className="pf-reveal rounded-pf-card border border-border-subtle bg-surface px-5 py-4 shadow-pf-card">
              <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">
                {chartsFromOtherDatasets.length === 1
                  ? '1 gráfico de outro arquivo'
                  : `${chartsFromOtherDatasets.length} gráficos de outros arquivos`}
              </summary>
              <div className="mt-3 flex flex-col gap-2">
                {chartsFromOtherDatasets.map((chart) => (
                  <div
                    key={chart.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-pf-control border border-border-subtle bg-canvas px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">
                        {chart.title?.trim() || 'Gráfico sem título'}
                      </p>
                      <p className="truncate text-[11px] text-ink-secondary">
                        Gravado em outro conjunto de dados.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAdaptChart(chart)}
                        className="pf-press inline-flex cursor-pointer items-center rounded-pf-control bg-brand px-2.5 py-1 text-[11px] font-semibold text-pf-white transition hover:bg-brand-shade"
                      >
                        Adaptar ao arquivo atual
                      </button>
                      <button
                        type="button"
                        onClick={() => removeChart(activeView.id, chart.id)}
                        className="pf-press inline-flex cursor-pointer items-center rounded-pf-control border border-border-subtle bg-surface px-2.5 py-1 text-[11px] font-semibold text-pf-red transition hover:bg-pf-red-100"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <AddChartFab
        viewName={activeView.name}
        onClick={() => setChartModal({ mode: 'create' })}
      />

      <AddChartModal
        open={chartModal !== null}
        viewName={activeView.name}
        dataset={dataset}
        initialChart={chartModal?.mode === 'edit' ? chartModal.chart : null}
        onClose={() => setChartModal(null)}
        onSaveChart={(config) => {
          if (chartModal?.mode === 'edit') {
            updateChart(activeView.id, chartModal.chart.id, config);
          } else {
            addChart(activeView.id, config);
          }
          setChartModal(null);
        }}
      />
    </div>
  );
}
