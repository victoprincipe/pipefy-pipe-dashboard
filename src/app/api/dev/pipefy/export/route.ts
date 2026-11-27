/**
 * ⚠️ ROTA SOMENTE PARA TESTES COM AGENTES DE AI (não usada pelo app).
 *
 * Dispara e baixa a exportação XLSX de um relatório do Pipe para validar o
 * fluxo de exportação em testes assistidos por agentes de AI. Nenhum
 * componente, hook ou lib do dashboard consome esta rota.
 *
 * - Bloqueada em produção, salvo `ALLOW_DEV_PIPEFY_ROUTES=true`.
 * - Requer `?pipeId=<ID>` ou `PIPEFY_PIPE_ID` no `.env.local`.
 * - `?trigger=true` gera a exportação; `?download=true` baixa o `.xlsx`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  authorizeDevPipefyRequest,
  executePipefyGraphQL,
  missingPipeIdResponse,
} from '@/lib/pipefyServerClient';

const PIPE_REPORTS_QUERY = `
  query PipeReports($pipeId: ID!) {
    pipe(id: $pipeId) {
      id
      name
      reports {
        id
        name
      }
    }
  }
`;

const EXPORT_PIPE_REPORT_MUTATION = `
  mutation ExportPipeReport($input: ExportPipeReportInput!) {
    exportPipeReport(input: $input) {
      pipeReportExport {
        id
        state
      }
    }
  }
`;

const PIPE_REPORT_EXPORT_QUERY = `
  query PipeReportExport($id: ID!) {
    pipeReportExport(id: $id) {
      id
      state
      fileURL
    }
  }
`;

interface PipeReportsData {
  pipe?: {
    id?: string | number;
    name?: string;
    reports?: Array<{ id: string | number; name: string }>;
  };
}

interface ExportPipeReportData {
  exportPipeReport?: {
    pipeReportExport?: { id?: string | number; state?: string };
  };
}

interface PipeReportExportData {
  pipeReportExport?: {
    id?: string | number;
    state?: string;
    fileURL?: string;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const auth = authorizeDevPipefyRequest(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const searchParams = request.nextUrl.searchParams;
  const pipeId =
    searchParams.get('pipeId')?.trim() || auth.config.defaultPipeId;
  if (!pipeId) return missingPipeIdResponse();

  const trigger = searchParams.get('trigger') === 'true';
  const download = searchParams.get('download') === 'true';
  const requestedReportId = searchParams.get('reportId')?.trim() || '';

  const reportsRes = await executePipefyGraphQL<PipeReportsData>({
    token: auth.config.token,
    apiUrl: auth.config.apiUrl,
    query: PIPE_REPORTS_QUERY,
    variables: { pipeId },
  });

  if (!reportsRes.ok || !reportsRes.data?.pipe) {
    return NextResponse.json(
      {
        ok: false,
        pipeId,
        errors: reportsRes.errors ?? 'Pipe não encontrado.',
      },
      { status: reportsRes.status || 502 }
    );
  }

  const reports = (reportsRes.data.pipe.reports ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));

  if (!trigger && !download) {
    return NextResponse.json({
      ok: true,
      pipeId,
      pipeName: reportsRes.data.pipe.name ?? null,
      reports,
      hint: 'Passe ?trigger=true para gerar exportação ou ?download=true para baixar o .xlsx.',
    });
  }

  const targetReportId =
    requestedReportId ||
    reports.find((r) => r.name === '[PipeLens] Snapshot')?.id ||
    reports[0]?.id;

  if (!targetReportId) {
    return NextResponse.json(
      {
        ok: false,
        pipeId,
        error: 'Nenhum relatório encontrado neste Pipe para exportar.',
      },
      { status: 404 }
    );
  }

  const exportRes = await executePipefyGraphQL<ExportPipeReportData>({
    token: auth.config.token,
    apiUrl: auth.config.apiUrl,
    query: EXPORT_PIPE_REPORT_MUTATION,
    variables: {
      input: {
        pipeId,
        pipeReportId: targetReportId,
      },
    },
  });

  const exportId = exportRes.data?.exportPipeReport?.pipeReportExport?.id;
  if (!exportRes.ok || !exportId) {
    return NextResponse.json(
      {
        ok: false,
        pipeId,
        reportId: targetReportId,
        errors: exportRes.errors ?? 'Falha ao iniciar exportPipeReport.',
      },
      { status: exportRes.status || 502 }
    );
  }

  const deadline = Date.now() + 60_000;
  let state = String(
    exportRes.data?.exportPipeReport?.pipeReportExport?.state ?? ''
  );
  let fileURL = '';

  while (Date.now() < deadline) {
    await sleep(2000);
    const pollRes = await executePipefyGraphQL<PipeReportExportData>({
      token: auth.config.token,
      apiUrl: auth.config.apiUrl,
      query: PIPE_REPORT_EXPORT_QUERY,
      variables: { id: String(exportId) },
    });

    const statusObj = pollRes.data?.pipeReportExport;
    state = String(statusObj?.state ?? '');
    const lowerState = state.toLowerCase();

    if (lowerState === 'failed' || lowerState === 'error') {
      return NextResponse.json(
        {
          ok: false,
          pipeId,
          reportId: targetReportId,
          exportId: String(exportId),
          state,
          errors: pollRes.errors ?? 'O Pipefy reportou falha na exportação.',
        },
        { status: 502 }
      );
    }

    if (statusObj?.fileURL) {
      fileURL = String(statusObj.fileURL);
      break;
    }
  }

  if (!fileURL) {
    return NextResponse.json(
      {
        ok: false,
        pipeId,
        reportId: targetReportId,
        exportId: String(exportId),
        state,
        error: 'Tempo limite de 60s aguardando fileURL do Pipefy.',
      },
      { status: 504 }
    );
  }

  if (!download) {
    return NextResponse.json({
      ok: true,
      pipeId,
      reportId: targetReportId,
      exportId: String(exportId),
      state,
      fileURL,
    });
  }

  const fileResp = await fetch(fileURL, { cache: 'no-store' });
  if (!fileResp.ok) {
    return NextResponse.json(
      {
        ok: false,
        pipeId,
        reportId: targetReportId,
        exportId: String(exportId),
        error: `Falha ao baixar .xlsx do Pipefy (HTTP ${fileResp.status}).`,
      },
      { status: 502 }
    );
  }

  const buffer = await fileResp.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pipe-${pipeId}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
