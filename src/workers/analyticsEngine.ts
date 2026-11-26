import type {
  AggregatedPoint,
  AggregationOp,
  DateGranularity,
  ExplorerQuery,
  ExplorerResult,
  FilterRule,
  WidgetConfig,
  WidgetComputationResult,
} from '../types/dashboard';
import type { NormalizedCard, PipeFieldMeta, PipeSchema } from '../types/pipefy';
import { parseFlexibleDate, parseFlexibleNumber } from '../utils/xlsxNormalizer';

export function getCardRawValue(
  card: NormalizedCard,
  fieldKey: string
): string | number | boolean | null {
  switch (fieldKey) {
    case '__id':
      return card.id;
    case '__title':
      return card.title;
    case '__phase':
      return card.phaseName || 'Sem fase';
    case '__status':
      return card.done ? 'Concluído' : 'Em andamento';
    case '__sla':
      return card.expired ? 'Expirado' : card.late ? 'Atrasado' : 'No prazo';
    case '__createdAt':
      return card.createdAt;
    case '__finishedAt':
      return card.finishedAt;
    case '__dueDate':
      return card.dueDate;
    case '__createdBy':
      return card.createdBy || 'Não informado';
    case '__assignee':
      return card.assignees.length > 0 ? card.assignees[0] : 'Sem responsável';
    case '__label':
      return card.labels.length > 0 ? card.labels[0] : 'Sem etiqueta';
    case '__leadTimeHours':
      return card.leadTimeHours;
    default: {
      const val = card.fields[fieldKey];
      return val === undefined ? null : val;
    }
  }
}

export function applyFilters(
  cards: NormalizedCard[],
  globalSearch: string,
  filters: FilterRule[]
): NormalizedCard[] {
  const q = globalSearch.trim().toLowerCase();
  const activeFilters = filters.filter((f) => {
    if (f.operator === 'is_empty' || f.operator === 'not_empty') return true;
    return f.value.trim() !== '';
  });

  if (!q && activeFilters.length === 0) {
    return cards;
  }

  const out: NormalizedCard[] = [];
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (q && !card.searchText.includes(q)) {
      continue;
    }

    let matched = true;
    for (let j = 0; j < activeFilters.length; j += 1) {
      const rule = activeFilters[j];
      const raw = getCardRawValue(card, rule.fieldKey);
      const isEmpty = raw === null || raw === undefined || raw === '';

      if (rule.operator === 'is_empty') {
        if (!isEmpty) {
          matched = false;
          break;
        }
        continue;
      }
      if (rule.operator === 'not_empty') {
        if (isEmpty) {
          matched = false;
          break;
        }
        continue;
      }

      if (isEmpty) {
        matched = false;
        break;
      }

      const strRaw = String(raw).toLowerCase();
      const targetStr = rule.value.trim().toLowerCase();

      switch (rule.operator) {
        case 'equals':
          if (strRaw !== targetStr) matched = false;
          break;
        case 'not_equals':
          if (strRaw === targetStr) matched = false;
          break;
        case 'contains':
          if (!strRaw.includes(targetStr)) matched = false;
          break;
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
        case 'between': {
          const numRaw = typeof raw === 'number' ? raw : parseFlexibleNumber(raw);
          const n1 = parseFlexibleNumber(rule.value);
          if (numRaw === null || n1 === null) {
            matched = false;
            break;
          }
          if (rule.operator === 'gt' && !(numRaw > n1)) matched = false;
          if (rule.operator === 'gte' && !(numRaw >= n1)) matched = false;
          if (rule.operator === 'lt' && !(numRaw < n1)) matched = false;
          if (rule.operator === 'lte' && !(numRaw <= n1)) matched = false;
          if (rule.operator === 'between') {
            const n2 = parseFlexibleNumber(rule.valueEnd ?? '');
            if (n2 === null || numRaw < Math.min(n1, n2) || numRaw > Math.max(n1, n2)) {
              matched = false;
            }
          }
          break;
        }
        case 'before':
        case 'after': {
          const cardDateMs = parseFlexibleDate(raw).ms;
          const targetDateMs = parseFlexibleDate(rule.value).ms;
          if (cardDateMs === null || targetDateMs === null) {
            matched = false;
            break;
          }
          if (rule.operator === 'before' && !(cardDateMs <= targetDateMs)) matched = false;
          if (rule.operator === 'after' && !(cardDateMs >= targetDateMs)) matched = false;
          break;
        }
      }

      if (!matched) break;
    }

    if (matched) {
      out.push(card);
    }
  }

  return out;
}

const PT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function formatDateBucket(
  raw: string | number | boolean | null,
  granularity: DateGranularity = 'month'
): { key: string; label: string } | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const { ms } = parseFlexibleDate(raw);
  if (ms === null) return null;

  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-11
  const day = d.getUTCDate();

  switch (granularity) {
    case 'year': {
      const k = String(year);
      return { key: k, label: k };
    }
    case 'quarter': {
      const q = Math.floor(month / 3) + 1;
      return { key: `${year}-Q${q}`, label: `T${q}/${year}` };
    }
    case 'month': {
      const mo = String(month + 1).padStart(2, '0');
      return { key: `${year}-${mo}`, label: `${PT_MONTHS[month]}/${String(year).slice(-2)}` };
    }
    case 'week': {
      // ISO week start (Monday)
      const dayOfWeek = d.getUTCDay() || 7;
      const monday = new Date(Date.UTC(year, month, day - dayOfWeek + 1));
      const mY = monday.getUTCFullYear();
      const mM = String(monday.getUTCMonth() + 1).padStart(2, '0');
      const mD = String(monday.getUTCDate()).padStart(2, '0');
      return { key: `${mY}-${mM}-${mD}`, label: `${mD}/${mM}/${String(mY).slice(-2)}` };
    }
    case 'day': {
      const mo = String(month + 1).padStart(2, '0');
      const da = String(day).padStart(2, '0');
      return { key: `${year}-${mo}-${da}`, label: `${da}/${mo}/${String(year).slice(-2)}` };
    }
  }
}

function formatCompactRangeEdge(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface BucketAccumulator {
  label: string;
  count: number;
  sum: number;
  numericCount: number;
  min: number;
  max: number;
  valuesForMedian?: number[];
  distinctSet?: Set<string>;
}

function finalizeAccumulator(acc: BucketAccumulator, op: AggregationOp): number {
  switch (op) {
    case 'count':
      return acc.count;
    case 'sum':
      return acc.sum;
    case 'avg':
      return acc.numericCount > 0 ? acc.sum / acc.numericCount : 0;
    case 'min':
      return acc.numericCount > 0 ? acc.min : 0;
    case 'max':
      return acc.numericCount > 0 ? acc.max : 0;
    case 'median':
      return acc.valuesForMedian ? computeMedian(acc.valuesForMedian) : 0;
    case 'distinct':
      return acc.distinctSet ? acc.distinctSet.size : 0;
  }
}

export function computeGlobalMetric(
  cards: NormalizedCard[],
  op: AggregationOp,
  metricFieldKey?: string
): number {
  if (op === 'count') return cards.length;

  let sum = 0;
  let numericCount = 0;
  let min = Infinity;
  let max = -Infinity;
  const medianList: number[] | null = op === 'median' ? [] : null;
  const distinctSet: Set<string> | null = op === 'distinct' ? new Set() : null;

  for (let i = 0; i < cards.length; i += 1) {
    const raw = metricFieldKey ? getCardRawValue(cards[i], metricFieldKey) : cards[i].id;
    if (distinctSet) {
      if (raw !== null && raw !== undefined && raw !== '') {
        distinctSet.add(String(raw));
      }
      continue;
    }

    const num = typeof raw === 'number' ? raw : parseFlexibleNumber(raw);
    if (num === null) continue;
    sum += num;
    numericCount += 1;
    if (num < min) min = num;
    if (num > max) max = num;
    if (medianList) medianList.push(num);
  }

  switch (op) {
    case 'sum':
      return sum;
    case 'avg':
      return numericCount > 0 ? sum / numericCount : 0;
    case 'min':
      return numericCount > 0 ? min : 0;
    case 'max':
      return numericCount > 0 ? max : 0;
    case 'median':
      return medianList ? computeMedian(medianList) : 0;
    case 'distinct':
      return distinctSet ? distinctSet.size : 0;
  }
}

export function computeWidgetData(
  cards: NormalizedCard[],
  widget: WidgetConfig,
  schema: PipeSchema
): WidgetComputationResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const fieldMeta: PipeFieldMeta | undefined = schema.fields.find(
    (f) => f.key === widget.dimensionKey
  );

  // KPI widget skips bucketing
  if (widget.chartType === 'kpi') {
    const summaryValue = computeGlobalMetric(cards, widget.metricOp, widget.metricFieldKey);
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      widgetId: widget.id,
      points: [
        {
          key: 'total',
          label: widget.title,
          value: summaryValue,
          count: cards.length,
          sharePercent: 100,
        },
      ],
      totalMatched: cards.length,
      summaryValue,
      durationMs: Math.round((t1 - t0) * 100) / 100,
    };
  }

  // If numeric dimension, precompute min/max for histogram binning
  let binMin = Infinity;
  let binMax = -Infinity;
  let binSize = 1;
  const isNumericDim = fieldMeta?.kind === 'number';
  const numBins = Math.max(3, Math.min(20, widget.numericBins ?? 6));

  if (isNumericDim) {
    for (let i = 0; i < cards.length; i += 1) {
      const v = getCardRawValue(cards[i], widget.dimensionKey);
      const n = typeof v === 'number' ? v : parseFlexibleNumber(v);
      if (n !== null) {
        if (n < binMin) binMin = n;
        if (n > binMax) binMax = n;
      }
    }
    if (binMin === Infinity) {
      binMin = 0;
      binMax = 100;
    } else if (binMax === binMin) {
      binMax = binMin + 1;
    }
    binSize = (binMax - binMin) / numBins;
  }

  const buckets = new Map<string, BucketAccumulator>();
  const isDateDim = fieldMeta?.kind === 'date';
  const needsMedian = widget.metricOp === 'median';
  const needsDistinct = widget.metricOp === 'distinct';

  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const dimRaw = getCardRawValue(card, widget.dimensionKey);

    let bucketKey = '';
    let bucketLabel = '';

    if (isDateDim) {
      const formatted = formatDateBucket(dimRaw, widget.dateGranularity ?? 'month');
      if (!formatted) {
        bucketKey = '__sem_data';
        bucketLabel = 'Sem data';
      } else {
        bucketKey = formatted.key;
        bucketLabel = formatted.label;
      }
    } else if (isNumericDim) {
      const numVal = typeof dimRaw === 'number' ? dimRaw : parseFlexibleNumber(dimRaw);
      if (numVal === null) {
        bucketKey = '__sem_valor';
        bucketLabel = 'Sem valor';
      } else {
        const idx = Math.min(numBins - 1, Math.max(0, Math.floor((numVal - binMin) / binSize)));
        const lo = binMin + idx * binSize;
        const hi = lo + binSize;
        bucketKey = `${String(idx).padStart(2, '0')}:${lo.toFixed(0)}-${hi.toFixed(0)}`;
        bucketLabel = `${formatCompactRangeEdge(lo)} – ${formatCompactRangeEdge(hi)}`;
      }
    } else {
      const str = dimRaw === null || dimRaw === undefined || dimRaw === '' ? 'Não informado' : String(dimRaw);
      bucketKey = str;
      bucketLabel = str;
    }

    let acc = buckets.get(bucketKey);
    if (!acc) {
      acc = {
        label: bucketLabel,
        count: 0,
        sum: 0,
        numericCount: 0,
        min: Infinity,
        max: -Infinity,
        valuesForMedian: needsMedian ? [] : undefined,
        distinctSet: needsDistinct ? new Set() : undefined,
      };
      buckets.set(bucketKey, acc);
    }

    acc.count += 1;

    if (widget.metricOp !== 'count') {
      const mRaw = widget.metricFieldKey ? getCardRawValue(card, widget.metricFieldKey) : card.id;
      if (needsDistinct && acc.distinctSet) {
        if (mRaw !== null && mRaw !== undefined && mRaw !== '') {
          acc.distinctSet.add(String(mRaw));
        }
      } else {
        const num = typeof mRaw === 'number' ? mRaw : parseFlexibleNumber(mRaw);
        if (num !== null) {
          acc.sum += num;
          acc.numericCount += 1;
          if (num < acc.min) acc.min = num;
          if (num > acc.max) acc.max = num;
          if (needsMedian && acc.valuesForMedian) {
            acc.valuesForMedian.push(num);
          }
        }
      }
    }
  }

  let points: AggregatedPoint[] = [];
  let grandTotalValue = 0;

  for (const [key, acc] of buckets.entries()) {
    const value = finalizeAccumulator(acc, widget.metricOp);
    grandTotalValue += value;
    points.push({
      key,
      label: acc.label,
      value,
      count: acc.count,
      sharePercent: 0,
    });
  }

  // Sorting
  if (isDateDim || isNumericDim) {
    // Chronological or numeric bucket order by key unless explicitly sorted by value
    if (widget.sortMode === 'value_desc') {
      points.sort((a, b) => b.value - a.value);
    } else if (widget.sortMode === 'value_asc') {
      points.sort((a, b) => a.value - b.value);
    } else if (widget.sortMode === 'label_desc') {
      points.sort((a, b) => b.key.localeCompare(a.key));
    } else {
      points.sort((a, b) => a.key.localeCompare(b.key));
    }
  } else {
    switch (widget.sortMode) {
      case 'value_desc':
        points.sort((a, b) => b.value - a.value);
        break;
      case 'value_asc':
        points.sort((a, b) => a.value - b.value);
        break;
      case 'label_asc':
        points.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        break;
      case 'label_desc':
        points.sort((a, b) => b.label.localeCompare(a.label, 'pt-BR'));
        break;
    }
  }

  // Top N + optional "Outros"
  if (widget.topN > 0 && points.length > widget.topN) {
    const head = points.slice(0, widget.topN);
    if (widget.groupOthers && (widget.metricOp === 'count' || widget.metricOp === 'sum')) {
      const tail = points.slice(widget.topN);
      const othersVal = tail.reduce((s, p) => s + p.value, 0);
      const othersCount = tail.reduce((s, p) => s + p.count, 0);
      head.push({
        key: '__others',
        label: `Outros (${tail.length})`,
        value: othersVal,
        count: othersCount,
        sharePercent: 0,
      });
    }
    points = head;
  }

  const denom = grandTotalValue !== 0 ? grandTotalValue : 1;
  for (let i = 0; i < points.length; i += 1) {
    points[i].sharePercent = Math.round((points[i].value / denom) * 1000) / 10;
  }

  const summaryValue = computeGlobalMetric(cards, widget.metricOp, widget.metricFieldKey);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    widgetId: widget.id,
    points,
    totalMatched: cards.length,
    summaryValue,
    durationMs: Math.round((t1 - t0) * 100) / 100,
  };
}

export function computeExplorerPage(
  cards: NormalizedCard[],
  query: ExplorerQuery
): ExplorerResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const sorted = [...cards];
  const dir = query.sortDir === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    const va = getCardRawValue(a, query.sortBy);
    const vb = getCardRawValue(b, query.sortBy);
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir;
  });

  const start = Math.max(0, (query.page - 1) * query.pageSize);
  const rows = sorted.slice(start, start + query.pageSize);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    total: cards.length,
    page: query.page,
    pageSize: query.pageSize,
    rows,
    durationMs: Math.round((t1 - t0) * 100) / 100,
  };
}

export function computeFieldSuggestions(
  cards: NormalizedCard[],
  fieldKey: string,
  limit = 25
): string[] {
  const freq = new Map<string, number>();
  for (let i = 0; i < cards.length; i += 1) {
    const raw = getCardRawValue(cards[i], fieldKey);
    if (raw === null || raw === undefined || raw === '') continue;
    const str = String(raw);
    freq.set(str, (freq.get(str) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([v]) => v);
}
