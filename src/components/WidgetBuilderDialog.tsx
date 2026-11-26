import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type {
  AggregationOp,
  ChartType,
  DateGranularity,
  SortMode,
  WidgetComputationResult,
  WidgetConfig,
  WidgetWidth,
} from '../types/dashboard';
import type { PipeSchema } from '../types/pipefy';
import { ChartRenderer } from './ChartRenderer';

interface WidgetBuilderDialogProps {
  open: boolean;
  schema: PipeSchema;
  initialWidget: WidgetConfig | null;
  onClose: () => void;
  onSave: (widget: WidgetConfig) => void;
  onPreviewCompute: (widget: WidgetConfig) => Promise<WidgetComputationResult>;
}

function createDraftWidget(schema: PipeSchema, initial: WidgetConfig | null): WidgetConfig {
  if (initial) return { ...initial };
  const defaultDim =
    schema.fields.find((f) => f.key === 'estado') ??
    schema.fields.find((f) => f.kind === 'category') ??
    schema.fields[0];
  const defaultNum = schema.fields.find((f) => f.kind === 'number');

  return {
    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: defaultNum
      ? `${defaultNum.label} por ${defaultDim?.label || 'Categoria'}`
      : `Cards por ${defaultDim?.label || 'Fase'}`,
    subtitle: 'Visão personalizada',
    chartType: 'horizontal_bar',
    dimensionKey: defaultDim?.key || '__phase',
    dateGranularity: 'month',
    numericBins: 6,
    metricOp: defaultNum ? 'sum' : 'count',
    metricFieldKey: defaultNum?.key,
    sortMode: 'value_desc',
    topN: 10,
    groupOthers: true,
    width: 6,
    colorScheme: 'cobalt',
    formatAsCurrency: Boolean(defaultNum),
  };
}

export function WidgetBuilderDialog({
  open,
  schema,
  initialWidget,
  onClose,
  onSave,
  onPreviewCompute,
}: WidgetBuilderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [draft, setDraft] = useState<WidgetConfig>(() =>
    createDraftWidget(schema, initialWidget)
  );
  const [previewResult, setPreviewResult] = useState<WidgetComputationResult | undefined>(
    undefined
  );

  useEffect(() => {
    setDraft(createDraftWidget(schema, initialWidget));
  }, [initialWidget, schema, open]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      onPreviewCompute(draft)
        .then((res) => {
          if (active) setPreviewResult(res);
        })
        .catch(() => {});
    }, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft, open]);

  const selectedDim = schema.fields.find((f) => f.key === draft.dimensionKey);
  const numericFields = schema.fields.filter((f) => f.kind === 'number');
  const needsMetricField = draft.metricOp !== 'count';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...draft,
      title: draft.title.trim() || 'Novo Gráfico',
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="native-modal"
      aria-labelledby="builder-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h1 id="builder-modal-title">
          {initialWidget ? 'Editar Gráfico' : 'Construtor Flexível de Gráfico'}
        </h1>
        <button
          type="button"
          className="btn btn-icon btn-sm"
          onClick={onClose}
          aria-label="Fechar construtor"
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="modal-body">
          <div className="builder-grid">
            <div>
              <div className="form-field">
                <label htmlFor="wb-title">Título do Gráfico</label>
                <input
                  id="wb-title"
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor="wb-type">Tipo de Visualização</label>
                  <select
                    id="wb-type"
                    className="select"
                    value={draft.chartType}
                    onChange={(e) =>
                      setDraft({ ...draft, chartType: e.target.value as ChartType })
                    }
                  >
                    <option value="bar">Barras Verticais</option>
                    <option value="horizontal_bar">Barras Horizontais</option>
                    <option value="line">Linha Temporal</option>
                    <option value="area">Área</option>
                    <option value="donut">Rosca (Donut)</option>
                    <option value="kpi">Cartão KPI</option>
                    <option value="pivot_table">Tabela Dinâmica</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="wb-width">Largura no Grid</label>
                  <select
                    id="wb-width"
                    className="select"
                    value={draft.width}
                    onChange={(e) =>
                      setDraft({ ...draft, width: Number(e.target.value) as WidgetWidth })
                    }
                  >
                    <option value={4}>Compacto (1/3)</option>
                    <option value={6}>Médio (1/2)</option>
                    <option value={8}>Largo (2/3)</option>
                    <option value={12}>Linha inteira (100%)</option>
                  </select>
                </div>
              </div>

              {draft.chartType !== 'kpi' && (
                <div className="form-field">
                  <label htmlFor="wb-dim">Dimensão (Eixo X / Agrupamento)</label>
                  <select
                    id="wb-dim"
                    className="select"
                    value={draft.dimensionKey}
                    onChange={(e) => setDraft({ ...draft, dimensionKey: e.target.value })}
                  >
                    {schema.fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label} ({f.isBuiltIn ? 'sistema' : f.pipefyType})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {draft.chartType !== 'kpi' && selectedDim?.kind === 'date' && (
                <div className="form-field">
                  <label htmlFor="wb-granularity">Granularidade Temporal</label>
                  <select
                    id="wb-granularity"
                    className="select"
                    value={draft.dateGranularity ?? 'month'}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        dateGranularity: e.target.value as DateGranularity,
                      })
                    }
                  >
                    <option value="day">Dia</option>
                    <option value="week">Semana</option>
                    <option value="month">Mês</option>
                    <option value="quarter">Trimestre</option>
                    <option value="year">Ano</option>
                  </select>
                </div>
              )}

              {draft.chartType !== 'kpi' && selectedDim?.kind === 'number' && (
                <div className="form-field">
                  <label htmlFor="wb-bins">Quantidade de Faixas (Histograma)</label>
                  <input
                    id="wb-bins"
                    type="number"
                    min={3}
                    max={15}
                    className="input"
                    value={draft.numericBins ?? 6}
                    onChange={(e) =>
                      setDraft({ ...draft, numericBins: Number(e.target.value) || 6 })
                    }
                  />
                </div>
              )}

              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor="wb-op">Métrica / Agregação</label>
                  <select
                    id="wb-op"
                    className="select"
                    value={draft.metricOp}
                    onChange={(e) => {
                      const nextOp = e.target.value as AggregationOp;
                      setDraft({
                        ...draft,
                        metricOp: nextOp,
                        metricFieldKey:
                          nextOp !== 'count' && !draft.metricFieldKey
                            ? numericFields[0]?.key || schema.fields[0]?.key
                            : draft.metricFieldKey,
                      });
                    }}
                  >
                    <option value="count">Contagem (COUNT)</option>
                    <option value="sum">Soma (SUM)</option>
                    <option value="avg">Média (AVG)</option>
                    <option value="median">Mediana (MEDIAN)</option>
                    <option value="min">Mínimo (MIN)</option>
                    <option value="max">Máximo (MAX)</option>
                    <option value="distinct">Únicos (DISTINCT)</option>
                  </select>
                </div>

                {needsMetricField && (
                  <div className="form-field">
                    <label htmlFor="wb-mfield">Campo da Métrica</label>
                    <select
                      id="wb-mfield"
                      className="select"
                      value={draft.metricFieldKey || ''}
                      onChange={(e) =>
                        setDraft({ ...draft, metricFieldKey: e.target.value })
                      }
                    >
                      {(draft.metricOp === 'distinct' ? schema.fields : numericFields.length > 0 ? numericFields : schema.fields).map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor="wb-sort">Ordenação</label>
                  <select
                    id="wb-sort"
                    className="select"
                    value={draft.sortMode}
                    onChange={(e) =>
                      setDraft({ ...draft, sortMode: e.target.value as SortMode })
                    }
                  >
                    <option value="value_desc">Maior valor primeiro</option>
                    <option value="value_asc">Menor valor primeiro</option>
                    <option value="label_asc">Alfabética / Cronológica (A→Z)</option>
                    <option value="label_desc">Reversa (Z→A)</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="wb-topn">Limite (Top N · 0 = todos)</label>
                  <input
                    id="wb-topn"
                    type="number"
                    min={0}
                    max={100}
                    className="input"
                    value={draft.topN}
                    onChange={(e) =>
                      setDraft({ ...draft, topN: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-field">
                  <label htmlFor="wb-color">Paleta</label>
                  <select
                    id="wb-color"
                    className="select"
                    value={draft.colorScheme}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        colorScheme: e.target.value as WidgetConfig['colorScheme'],
                      })
                    }
                  >
                    <option value="cobalt">Azul Cobalto</option>
                    <option value="teal">Verde-Água (Teal)</option>
                    <option value="emerald">Esmeralda</option>
                    <option value="amber">Âmbar</option>
                    <option value="coral">Coral</option>
                    <option value="slate">Ardósia</option>
                  </select>
                </div>

                <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(draft.formatAsCurrency)}
                      onChange={(e) =>
                        setDraft({ ...draft, formatAsCurrency: e.target.checked })
                      }
                    />
                    <span>Formatar em R$ (Moeda)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={draft.groupOthers}
                      onChange={(e) =>
                        setDraft({ ...draft, groupOthers: e.target.checked })
                      }
                    />
                    <span>Agrupar excedente em "Outros"</span>
                  </label>
                </div>
              </div>
            </div>

            <div
              className="widget-card"
              style={{ background: 'var(--bg-canvas)', alignSelf: 'stretch', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Pré-visualização ao vivo (DuckDB-WASM SQL)
                  </span>
                  {previewResult && (
                    <span className="mono-num" style={{ fontSize: 11.5, color: 'var(--accent-teal)' }}>
                      {previewResult.totalMatched.toLocaleString('pt-BR')} cards · {previewResult.durationMs} ms
                    </span>
                  )}
                </div>
                <h2 className="widget-title" style={{ marginBlockEnd: 12 }}>
                  {draft.title || 'Prévia do Gráfico'}
                </h2>
              </div>

              <div style={{ flex: 1, minBlockSize: 280 }}>
                <ChartRenderer widget={draft} result={previewResult} height={290} />
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            {initialWidget ? 'Salvar Alterações' : 'Adicionar ao Painel'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
