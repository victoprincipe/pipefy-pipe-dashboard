import * as XLSX from 'xlsx';
import type { PipeSchema } from '../types/pipefy';
import { normalizeExportRows } from '../utils/xlsxNormalizer';

export interface XlsxParseRequest {
  id: number;
  type: 'PARSE_XLSX';
  buffer: ArrayBuffer;
  schema: PipeSchema;
}

self.onmessage = (event: MessageEvent<XlsxParseRequest>) => {
  const msg = event.data;
  try {
    if (msg.type !== 'PARSE_XLSX') {
      throw new Error(`Mensagem desconhecida no XLSX Worker: ${String((msg as { type?: unknown }).type)}`);
    }
    const t0 = performance.now();
    const workbook = XLSX.read(new Uint8Array(msg.buffer), {
      type: 'array',
      cellDates: true,
    });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });
    const cards = normalizeExportRows(rows, msg.schema);
    const t1 = performance.now();
    self.postMessage({
      id: msg.id,
      ok: true,
      payload: {
        cards,
        count: cards.length,
        parseMs: Math.round((t1 - t0) * 100) / 100,
      },
    });
  } catch (err) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
