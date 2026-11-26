import { useEffect, useState } from 'react';
import { Filter, Plus, Search, X } from 'lucide-react';
import type { FilterOperator, FilterRule } from '../types/dashboard';
import type { PipeFieldMeta, PipeSchema } from '../types/pipefy';

interface FilterBarProps {
  schema: PipeSchema;
  globalSearch: string;
  filters: FilterRule[];
  matchedCount: number;
  totalCount: number;
  workerMs: number | null;
  onGlobalSearchChange: (value: string) => void;
  onAddFilter: (rule: FilterRule) => void;
  onRemoveFilter: (id: string) => void;
  onClearAllFilters: () => void;
  onRequestSuggestions: (fieldKey: string) => Promise<string[]>;
}

const OPERATORS_BY_KIND: Record<PipeFieldMeta['kind'], Array<{ value: FilterOperator; label: string }>> = {
  category: [
    { value: 'equals', label: 'Igual a' },
    { value: 'not_equals', label: 'Diferente de' },
    { value: 'contains', label: 'Contém' },
    { value: 'is_empty', label: 'Vazio' },
    { value: 'not_empty', label: 'Preenchido' },
  ],
  text: [
    { value: 'contains', label: 'Contém' },
    { value: 'equals', label: 'Igual a' },
    { value: 'not_equals', label: 'Diferente de' },
    { value: 'is_empty', label: 'Vazio' },
    { value: 'not_empty', label: 'Preenchido' },
  ],
  number: [
    { value: 'gte', label: 'Maior ou igual (>=)' },
    { value: 'lte', label: 'Menor ou igual (<=)' },
    { value: 'between', label: 'Entre' },
    { value: 'equals', label: 'Igual a (=)' },
    { value: 'is_empty', label: 'Vazio' },
  ],
  date: [
    { value: 'after', label: 'A partir de' },
    { value: 'before', label: 'Até' },
    { value: 'contains', label: 'Contém (AAAA-MM)' },
    { value: 'is_empty', label: 'Sem data' },
  ],
  boolean: [
    { value: 'equals', label: 'Igual a (true/false)' },
  ],
};

export function FilterBar({
  schema,
  globalSearch,
  filters,
  matchedCount,
  totalCount,
  workerMs,
  onGlobalSearchChange,
  onAddFilter,
  onRemoveFilter,
  onClearAllFilters,
  onRequestSuggestions,
}: FilterBarProps) {
  const [showBuilder, setShowBuilder] = useState(false);
  const [fieldKey, setFieldKey] = useState<string>(schema.fields[0]?.key || '__phase');
  const [operator, setOperator] = useState<FilterOperator>('equals');
  const [value, setValue] = useState('');
  const [valueEnd, setValueEnd] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const selectedField = schema.fields.find((f) => f.key === fieldKey) ?? schema.fields[0];
  const ops = OPERATORS_BY_KIND[selectedField?.kind ?? 'text'];

  useEffect(() => {
    if (!selectedField) return;
    setOperator(OPERATORS_BY_KIND[selectedField.kind][0].value);
    setValue('');
    setValueEnd('');
    if (showBuilder) {
      onRequestSuggestions(selectedField.key)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }
  }, [fieldKey, showBuilder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedField) return;
    if (operator !== 'is_empty' && operator !== 'not_empty' && !value.trim()) return;

    onAddFilter({
      id: `flt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fieldKey: selectedField.key,
      operator,
      value: value.trim(),
      valueEnd: operator === 'between' ? valueEnd.trim() : undefined,
      source: 'user',
    });
    setValue('');
    setValueEnd('');
    setShowBuilder(false);
  };

  const getFieldLabel = (key: string) =>
    schema.fields.find((f) => f.key === key)?.label ?? key;

  return (
    <section className="filter-bar" aria-label="Filtros do painel">
      <div className="filter-controls">
        <div className="search-input-wrap">
          <Search size={15} />
          <input
            type="search"
            className="input search-input"
            placeholder="Buscar em 20.000 cards (empresa, contato, cidade, ID...)"
            value={globalSearch}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            aria-label="Busca global nos cards"
          />
        </div>

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowBuilder((s) => !s)}
          >
            <Filter size={14} />
            <span>Adicionar Filtro</span>
          </button>

          {showBuilder && (
            <form
              className="popover-panel"
              onSubmit={handleSubmit}
              style={{
                position: 'absolute',
                insetBlockStart: 'calc(100% + 8px)',
                insetInlineStart: 0,
                zIndex: 40,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: 10 }}>
                <strong style={{ fontSize: 13 }}>Novo Filtro</strong>
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  onClick={() => setShowBuilder(false)}
                  aria-label="Fechar painel de filtro"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="form-field">
                <label htmlFor="flt-field">Campo</label>
                <select
                  id="flt-field"
                  className="select"
                  value={fieldKey}
                  onChange={(e) => setFieldKey(e.target.value)}
                >
                  {schema.fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} ({f.kind})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="flt-op">Operador</label>
                <select
                  id="flt-op"
                  className="select"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as FilterOperator)}
                >
                  {ops.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {operator !== 'is_empty' && operator !== 'not_empty' && (
                <div className="form-field">
                  <label htmlFor="flt-val">Valor</label>
                  <input
                    id="flt-val"
                    className="input"
                    list="flt-suggestions"
                    type={selectedField?.kind === 'date' && operator !== 'contains' ? 'date' : 'text'}
                    placeholder={
                      selectedField?.kind === 'number' ? 'Ex.: 500000' : 'Digite ou escolha...'
                    }
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <datalist id="flt-suggestions">
                    {suggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              )}

              {operator === 'between' && (
                <div className="form-field">
                  <label htmlFor="flt-val-end">Até</label>
                  <input
                    id="flt-val-end"
                    className="input"
                    type="text"
                    placeholder="Valor máximo"
                    value={valueEnd}
                    onChange={(e) => setValueEnd(e.target.value)}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Plus size={14} />
                  <span>Aplicar</span>
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="filter-chips">
          {filters.map((f) => (
            <span
              key={f.id}
              className={`filter-chip ${f.source === 'cross_filter' ? 'cross' : ''}`}
            >
              <span>
                {f.source === 'cross_filter' ? 'Cross-filter · ' : ''}
                <strong>{getFieldLabel(f.fieldKey)}</strong> {f.operator} {f.value}
                {f.valueEnd ? ` .. ${f.valueEnd}` : ''}
              </span>
              <button
                type="button"
                aria-label="Remover filtro"
                onClick={() => onRemoveFilter(f.id)}
              >
                <X size={13} />
              </button>
            </span>
          ))}

          {(filters.length > 0 || globalSearch.trim() !== '') && (
            <button type="button" className="btn btn-sm" onClick={onClearAllFilters}>
              Limpar tudo
            </button>
          )}
        </div>
      </div>

      <div className="mono-num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        <strong>{matchedCount.toLocaleString('pt-BR')}</strong> de{' '}
        {totalCount.toLocaleString('pt-BR')} cards
        {workerMs !== null ? ` · ${workerMs} ms` : ''}
      </div>
    </section>
  );
}
