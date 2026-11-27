import { describe, expect, it } from 'vitest';
import {
  buildFileDatasetId,
  buildFileTableName,
  buildPipeDatasetId,
  buildSchemaFingerprint,
  ensureDatasetIdentity,
  slugifyDatasetName,
  stripFileExtension,
} from '@/lib/datasetIdentity';
import type { PipefySqlDataset, SqlColumnDef } from '@/types/pipefySql';

describe('datasetIdentity', () => {
  it('slugifies names stripping accents and punctuation with dataset fallback', () => {
    expect(slugifyDatasetName('Vendas & Receita (2026)')).toBe('vendas-receita-2026');
    expect(slugifyDatasetName('   ---   ')).toBe('dataset');
    expect(slugifyDatasetName('')).toBe('dataset');
  });

  it('strips known spreadsheet extensions case-insensitively', () => {
    expect(stripFileExtension('relatorio-vendas.xlsx')).toBe('relatorio-vendas');
    expect(stripFileExtension('BASE_RH.CSV')).toBe('BASE_RH');
    expect(stripFileExtension('dados.xls')).toBe('dados');
    expect(stripFileExtension('export.tsv')).toBe('export');
  });

  it('builds stable dataset ids for pipes and files (with or without sheet)', () => {
    expect(buildPipeDatasetId('307435909')).toBe('pipe::307435909');
    expect(buildFileDatasetId({ fileName: 'Vendas Q1.xlsx' })).toBe('file::vendas-q1');
    expect(
      buildFileDatasetId({ fileName: 'Vendas Q1.xlsx', sheetName: 'Resumo Mensal' })
    ).toBe('file::vendas-q1::resumo-mensal');
  });

  it('computes order-independent schema fingerprints sensitive to type changes', () => {
    const colsA: SqlColumnDef[] = [
      { name: 'fase', label: 'Fase', sourceHeader: 'Fase', sqlType: 'VARCHAR' },
      { name: 'valor', label: 'Valor', sourceHeader: 'Valor', sqlType: 'DOUBLE' },
    ];
    const colsReordered: SqlColumnDef[] = [colsA[1], colsA[0]];
    const colsTypeChanged: SqlColumnDef[] = [
      colsA[0],
      { ...colsA[1], sqlType: 'VARCHAR' },
    ];

    expect(buildSchemaFingerprint(colsA)).toBe(buildSchemaFingerprint(colsReordered));
    expect(buildSchemaFingerprint(colsA)).not.toBe(
      buildSchemaFingerprint(colsTypeChanged)
    );
  });

  it('generates deterministic DuckDB table names for file datasets', () => {
    const tableName = buildFileTableName('file::vendas-q1');
    expect(tableName).toMatch(/^ds_[0-9a-f]{8}_data$/);
    expect(buildFileTableName('file::vendas-q1')).toBe(tableName);
  });

  it('hydrates legacy dataset identity fields without mutating the input', () => {
    const legacyFile = {
      cacheKey: 'local-dev::local_xlsx',
      userId: 'local-dev',
      pipeId: 'local_xlsx',
      pipeName: 'chamados',
      tableName: 'ds_legacy_data',
      columns: [
        { name: 'id', label: 'ID', sourceHeader: 'ID', sqlType: 'VARCHAR' as const },
      ],
      createTableSql: 'CREATE TABLE "ds_legacy_data" ("id" VARCHAR);',
      rowsCount: 10,
      syncedAt: 1700000000000,
      ttlMs: 1000,
      estimatedBytes: 128,
    } as unknown as PipefySqlDataset;

    const hydratedFile = ensureDatasetIdentity(legacyFile);
    expect(hydratedFile.source).toBe('file');
    expect(hydratedFile.datasetId).toBe('file::chamados');
    expect(hydratedFile.name).toBe('chamados');
    expect(hydratedFile.schemaFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect((legacyFile as { datasetId?: string }).datasetId).toBeUndefined();

    const legacyPipe = {
      ...legacyFile,
      cacheKey: 'u1::307435909',
      userId: 'u1',
      pipeId: '307435909',
      pipeName: 'Tech Consultants',
    } as unknown as PipefySqlDataset;

    const hydratedPipe = ensureDatasetIdentity(legacyPipe);
    expect(hydratedPipe.source).toBe('pipefy');
    expect(hydratedPipe.datasetId).toBe('pipe::307435909');
  });
});
