import { describe, expect, it } from 'vitest';
import { profileColumn } from '@/utils/chartSemantics';
import { column } from '@/utils/__tests__/datasetFixture';

describe('column semantics', () => {
  it('classifies unique numeric identifiers as identifier', () => {
    const profile = profileColumn(
      column('matricula', 'DOUBLE', {
        stats: { distinctCount: 100, nullCount: 0, sampleSize: 100 },
      })
    );
    expect(profile.role).toBe('identifier');
    expect(profile.groupCategory).toBe('identifier');
  });

  it('classifies date columns as date', () => {
    const profile = profileColumn(column('admissao', 'DATE'));
    expect(profile.groupCategory).toBe('date');
    expect(profile.role).toBe('date');
  });

  it('detects currency from the header/label', () => {
    const profile = profileColumn(
      column('col_1', 'DOUBLE', { label: 'valor total (R$)' })
    );
    expect(profile.role).toBe('currency');
    expect(profile.recommendedFormat).toBe('currency_brl');
  });

  it('detects low-cardinality status columns from data', () => {
    const profile = profileColumn(
      column('grupo_5', 'VARCHAR', {
        label: 'Grupo',
        stats: {
          distinctCount: 5,
          nullCount: 0,
          sampleSize: 100,
          topValues: ['Ativo', 'Inativo', 'Pendente', 'Cancelado', 'Concluído'],
        },
      })
    );
    expect(profile.role).toBe('status');
    expect(profile.roleSource).toBe('data');
  });

  it('lets a manual override win over the heuristic', () => {
    const profile = profileColumn(
      column('codigo', 'DOUBLE', {
        stats: { distinctCount: 100, nullCount: 0, sampleSize: 100 },
      }),
      { role: 'category', valueFormat: 'number' }
    );
    expect(profile.role).toBe('category');
    expect(profile.roleSource).toBe('user');
    expect(profile.groupCategory).toBe('dimension');
  });
});
