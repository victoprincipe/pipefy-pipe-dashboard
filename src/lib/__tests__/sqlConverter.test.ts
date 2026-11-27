import { describe, expect, it } from 'vitest';
import {
  buildCreateTableSql,
  convertTabularBufferToSqlDataset,
  inferColumnDayFirst,
  parseFlexibleDateIso,
  parseFlexibleNumber,
  sanitizeSqlIdentifier,
} from '@/lib/sqlConverter';

describe('sqlConverter', () => {
  it('sanitizes headers, avoids SQL reserved words, and deduplicates identifiers', () => {
    const used = new Set<string>();
    expect(sanitizeSqlIdentifier('Fase Atual', used)).toBe('fase_atual');
    expect(sanitizeSqlIdentifier('2026 Receita', used)).toBe('col_2026_receita');
    expect(sanitizeSqlIdentifier('Date', used)).toBe('date_col');
    expect(sanitizeSqlIdentifier('User', used)).toBe('user_col');
    expect(sanitizeSqlIdentifier('Valor', used)).toBe('valor');
    expect(sanitizeSqlIdentifier('Valor!', used)).toBe('valor_2');
  });

  it('parses Brazilian, US, and numeric values cleanly', () => {
    expect(parseFlexibleNumber(42.5)).toBe(42.5);
    expect(parseFlexibleNumber('R$ 1.234,56')).toBe(1234.56);
    expect(parseFlexibleNumber('1,234.56')).toBe(1234.56);
    expect(parseFlexibleNumber('500,75')).toBe(500.75);
    expect(parseFlexibleNumber('N/A')).toBeNull();
    expect(parseFlexibleNumber('')).toBeNull();
  });

  it('infers DD/MM/YYYY vs MM/DD/YYYY and normalizes dates to ISO YYYY-MM-DD', () => {
    expect(inferColumnDayFirst(['25/11/2026', '01/12/2026'])).toBe(true);
    expect(inferColumnDayFirst(['11/25/2026', '12/01/2026'])).toBe(false);

    expect(parseFlexibleDateIso('25/11/2026', true)).toBe('2026-11-25');
    expect(parseFlexibleDateIso('11/25/2026', false)).toBe('2026-11-25');
    expect(parseFlexibleDateIso('2026-05-10T14:30:00Z')).toBe('2026-05-10');
    // Excel serial 46023 -> 2026-01-01
    expect(parseFlexibleDateIso(46023)).toBe('2026-01-01');
  });

  it('builds a typed CREATE TABLE statement', () => {
    const sql = buildCreateTableSql('pipe_307435909_cards', [
      { name: 'card_id', label: 'ID', sourceHeader: 'ID', sqlType: 'VARCHAR' },
      { name: 'valor', label: 'Valor', sourceHeader: 'Valor', sqlType: 'DOUBLE' },
    ]);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "pipe_307435909_cards"');
    expect(sql).toContain('"card_id" VARCHAR');
    expect(sql).toContain('"valor" DOUBLE');
  });

  it('converts a CSV buffer into a typed SQL dataset with column stats', () => {
    const csv = [
      'ID,Fase,Valor,Criado em,Atrasado',
      '1001,Triagem,1500.5,2026-10-01,false',
      '1002,Aprovacao,3200,2026-10-15,true',
      '1003,Triagem,800.25,2026-10-20,false',
    ].join('\n');

    const buffer = new TextEncoder().encode(csv).buffer;
    const result = convertTabularBufferToSqlDataset({
      buffer,
      pipeId: 'local_xlsx',
      pipeName: 'chamados',
      datasetName: 'chamados',
      source: 'file',
      format: 'csv',
    });

    const typeByCol = Object.fromEntries(
      result.columns.map((c) => [c.name, c.sqlType])
    );
    expect(typeByCol).toEqual({
      id: 'VARCHAR',
      fase: 'VARCHAR',
      valor: 'DOUBLE',
      criado_em: 'DATE',
      atrasado: 'BOOLEAN',
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({
      id: '1001',
      fase: 'Triagem',
      valor: 1500.5,
      criado_em: '2026-10-01',
      atrasado: false,
    });
    expect(result.datasetId).toBe('file::chamados');
    expect(result.schemaFingerprint).toMatch(/^[0-9a-f]{8}$/);

    const faseCol = result.columns.find((c) => c.name === 'fase');
    expect(faseCol?.stats?.distinctCount).toBe(2);
    expect(faseCol?.stats?.topValues?.[0]).toBe('Triagem');
  });
});
