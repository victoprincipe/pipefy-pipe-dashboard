import { describe, expect, it } from 'vitest';
import type { DashboardChartConfig } from '@/types/dashboardViews';
import { resolveChartConfig } from '@/utils/chartConfigResolver';
import {
  buildAutoDashboard,
  generateRecommendedTemplates,
} from '@/utils/chartSemantics';
import { column, dataset } from '@/utils/__tests__/datasetFixture';

const scenarios = [
  dataset('file::vendas', [
    column('data', 'DATE', { label: 'Data' }),
    column('regiao', 'VARCHAR', { label: 'Região' }),
    column('valor', 'DOUBLE', { label: 'Valor (R$)' }),
    column('status', 'VARCHAR', { label: 'Status' }),
    column('vendedor', 'VARCHAR', { label: 'Vendedor' }),
  ]),
  dataset('file::chamados', [
    column('aberto_em', 'DATE', { label: 'Aberto em' }),
    column('fechado_em', 'DATE', { label: 'Fechado em' }),
    column('atrasado', 'BOOLEAN', { label: 'Atrasado' }),
    column('categoria', 'VARCHAR', { label: 'Categoria' }),
    column('protocolo', 'VARCHAR', { label: 'Protocolo' }),
  ]),
  dataset('file::rh', [
    column('admissao', 'DATE', { label: 'Admissão' }),
    column('departamento', 'VARCHAR', { label: 'Departamento' }),
    column('salario', 'DOUBLE', { label: 'Salário (R$)' }),
    column('matricula', 'DOUBLE', {
      label: 'Matrícula',
      stats: { distinctCount: 100, nullCount: 0, sampleSize: 100 },
    }),
    column('situacao', 'VARCHAR', { label: 'Situação' }),
  ]),
  dataset(
    'pipe::123',
    [
      column('current_phase', 'VARCHAR', { label: 'Fase', pipefyType: 'phase' }),
      column('due_date', 'DATE', { label: 'Vencimento', pipefyType: 'due_date' }),
      column('overdue', 'BOOLEAN', { label: 'Atrasado', pipefyType: 'checkbox' }),
      column('amount', 'DOUBLE', { label: 'Valor', pipefyType: 'currency' }),
    ],
    { source: 'pipefy' }
  ),
];

describe('recommended templates', () => {
  it.each(scenarios.map((ds) => [ds.datasetId, ds] as const))(
    'only produces renderable templates for %s',
    (_id, ds) => {
      const templates = generateRecommendedTemplates(ds);
      expect(templates.length).toBeGreaterThan(0);

      for (const tpl of templates) {
        const resolved = resolveChartConfig(ds, {
          id: tpl.id,
          ...tpl.config,
        } as DashboardChartConfig);
        expect(resolved.canRender, `${tpl.id}: ${JSON.stringify(resolved.issues)}`).toBe(
          true
        );

        const config = tpl.config;
        if (config.groupBy) {
          expect(ds.columns.some((c) => c.name === config.groupBy)).toBe(true);
        }
        if (config.metric && config.metric !== '__count__') {
          expect(ds.columns.some((c) => c.name === config.metric)).toBe(true);
        }
      }
    }
  );

  it('respects maxCharts in the automatic dashboard', () => {
    const configs = buildAutoDashboard(scenarios[0], 2);
    expect(configs.length).toBeLessThanOrEqual(2);
    expect(configs.length).toBeGreaterThan(0);
  });
});
