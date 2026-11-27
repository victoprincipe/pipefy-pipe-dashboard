import { normalizeSemanticText } from '@/utils/chartSemantics';
import type { ColumnSemanticRole } from '@/utils/chartSemantics';
import type {
  DatasetColumnStats,
  SqlColumnType,
} from '@/types/pipefySql';

export interface ColumnRoleRuleInput {
  name: string;
  label: string;
  sqlType: SqlColumnType;
  pipefyType?: string;
  stats?: DatasetColumnStats;
}

export interface ColumnRoleRuleMatch {
  rule: ColumnRoleRule;
  role: ColumnSemanticRole;
}

export interface ColumnRoleRule {
  id: string;
  role: ColumnSemanticRole;
  /** Higher scores win when more than one rule matches. */
  score: number;
  matches: (input: ColumnRoleRuleInput) => boolean;
}

const IDENTIFIER_TOKENS =
  /(^|_)(id|ids|codigo|cod|matricula|protocolo|numero|cpf|cnpj|cep|telefone|phone|email|e_mail|sku|serial|hash|uuid)(_|$)/;

const CURRENCY_TOKENS =
  /(valor|receita|faturamento|preco|custo|orcamento|budget|amount|revenue|price|mrr|arr|ticket|salario|pagamento|comissao|despesa|brl|usd|\$)/;

const PERCENT_TOKENS =
  /(%|percent|porcent|taxa|margem|desconto|rate|ratio|conversao|sla_pct|atingimento)/;

function uniqueRatio(stats?: DatasetColumnStats): number {
  if (!stats || !stats.distinctCount || !stats.sampleSize) return 0;
  return stats.distinctCount / stats.sampleSize;
}

/**
 * Data-driven rules refined from the sampled column statistics.
 * They run only after the header/type heuristics, acting as a fallback.
 */
export const COLUMN_ROLE_RULES: ReadonlyArray<ColumnRoleRule> = [
  {
    id: 'identifier-unique-numeric',
    role: 'identifier',
    score: 82,
    matches: (input) => {
      if (input.sqlType !== 'DOUBLE' && input.sqlType !== 'VARCHAR') return false;
      if (uniqueRatio(input.stats) < 0.98) return false;
      const norm = normalizeSemanticText(input.name || input.label);
      return IDENTIFIER_TOKENS.test(norm) || norm.endsWith('_id');
    },
  },
  {
    id: 'identifier-unique-text',
    role: 'identifier',
    score: 70,
    matches: (input) => {
      if (input.sqlType !== 'VARCHAR') return false;
      if (!input.stats?.sampleSize || (input.stats.sampleSize ?? 0) < 10) {
        return false;
      }
      if (uniqueRatio(input.stats) < 0.98) return false;
      const top = input.stats.topValues ?? [];
      const looksLikeEmail = top.some((v) => /.+@.+\..+/.test(v));
      const norm = normalizeSemanticText(input.name || input.label);
      return looksLikeEmail || norm.endsWith('_id') || norm === 'id';
    },
  },
  {
    id: 'currency-header-numeric',
    role: 'currency',
    score: 66,
    matches: (input) =>
      input.sqlType === 'DOUBLE' &&
      (CURRENCY_TOKENS.test(normalizeSemanticText(input.name)) ||
        CURRENCY_TOKENS.test(normalizeSemanticText(input.label))),
  },
  {
    id: 'percent-header-numeric',
    role: 'percent',
    score: 60,
    matches: (input) =>
      input.sqlType === 'DOUBLE' &&
      (PERCENT_TOKENS.test(normalizeSemanticText(input.name)) ||
        PERCENT_TOKENS.test(normalizeSemanticText(input.label))),
  },
  {
    id: 'status-low-cardinality',
    role: 'status',
    score: 40,
    matches: (input) => {
      if (input.sqlType !== 'VARCHAR' || !input.stats) return false;
      const distinct = input.stats.distinctCount ?? 0;
      return distinct >= 2 && distinct <= 30 && uniqueRatio(input.stats) < 0.5;
    },
  },
  {
    id: 'category-high-cardinality',
    role: 'category',
    score: 20,
    matches: (input) => {
      if (input.sqlType !== 'VARCHAR' || !input.stats) return false;
      return uniqueRatio(input.stats) > 0.8;
    },
  },
  {
    id: 'number-generic',
    role: 'number',
    score: 15,
    matches: (input) => input.sqlType === 'DOUBLE',
  },
];

/**
 * Returns the highest-scoring data rule for a column, or `null` when no rule applies.
 */
export function matchColumnRoleRule(
  input: ColumnRoleRuleInput
): ColumnRoleRule | null {
  let best: ColumnRoleRule | null = null;
  for (const rule of COLUMN_ROLE_RULES) {
    if (!rule.matches(input)) continue;
    if (!best || rule.score > best.score) best = rule;
  }
  return best;
}
