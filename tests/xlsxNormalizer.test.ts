import { describe, expect, it } from 'vitest';
import {
  normalizeExportRows,
  parseFlexibleDate,
  parseFlexibleNumber,
} from '../src/utils/xlsxNormalizer';
import { DEMO_PIPE_SCHEMA } from '../src/utils/demoDataset';

describe('xlsxNormalizer', () => {
  it('parses US, BR, and currency formatted numbers accurately', () => {
    expect(parseFlexibleNumber(1285947.3)).toBe(1285947.3);
    expect(parseFlexibleNumber('1285947.3')).toBe(1285947.3);
    expect(parseFlexibleNumber('R$ 1.285.947,30')).toBe(1285947.3);
    expect(parseFlexibleNumber('$94,946.94')).toBe(94946.94);
    expect(parseFlexibleNumber('')).toBeNull();
  });

  it('parses ISO dates, Pipefy MM/DD/YYYY dates, DD/MM/YYYY dates, and Excel serial numbers', () => {
    expect(parseFlexibleDate('2027-02-27').iso).toBe('2027-02-27');
    expect(parseFlexibleDate('02/27/2027').iso).toBe('2027-02-27');
    expect(parseFlexibleDate('27/02/2027').iso).toBe('2027-02-27');
    const excelSerial = parseFlexibleDate(46445);
    expect(excelSerial.iso).toMatch(/^2027-02-/);
  });

  it('maps Pipefy XLSX export rows to NormalizedCard objects', () => {
    const rows = [
      {
        ID: '1478388794',
        Title: '1478388794',
        'Current phase': 'Concluded',
        'Created at': '2026-11-13T18:44:37Z',
        'Finished at': '2026-11-13T18:44:37Z',
        'Nome Contato': 'Ursula Souza',
        Email: 'ursula.souza4013@acme.com',
        Empresa: 'Acme Holding',
        Cidade: 'Porto Alegre',
        Estado: 'RS',
        'Valor Total': '1285947.3',
        'Data Limite': '02/27/2027',
        Overdue: 'false',
      },
    ];

    const cards = normalizeExportRows(rows, DEMO_PIPE_SCHEMA);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('1478388794');
    expect(cards[0].phaseName).toBe('Concluded');
    expect(cards[0].done).toBe(true);
    expect(cards[0].fields.valor_total).toBe(1285947.3);
    expect(cards[0].fields.data_limite).toBe('2027-02-27');
    expect(cards[0].fields.estado).toBe('RS');
    expect(cards[0].fields.empresa).toBe('Acme Holding');
  });
});
