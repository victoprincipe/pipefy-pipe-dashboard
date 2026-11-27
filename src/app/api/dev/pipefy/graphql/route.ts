/**
 * ⚠️ ROTA SOMENTE PARA TESTES COM AGENTES DE AI (não usada pelo app).
 *
 * Executa GraphQL arbitrário contra a API do Pipefy, apenas para inspeção e
 * depuração assistida por agentes de AI. Nenhum componente, hook ou lib do
 * dashboard consome esta rota.
 *
 * - Bloqueada em produção, salvo `ALLOW_DEV_PIPEFY_ROUTES=true`.
 * - Usa `PIPEFY_API_TOKEN` do servidor ou `Authorization: Bearer <token>`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  authorizeDevPipefyRequest,
  executePipefyGraphQL,
} from '@/lib/pipefyServerClient';

export async function POST(request: NextRequest) {
  const auth = authorizeDevPipefyRequest(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  let body: { query?: unknown; variables?: unknown };
  try {
    body = (await request.json()) as { query?: unknown; variables?: unknown };
  } catch {
    return NextResponse.json(
      { error: 'Corpo JSON inválido.' },
      { status: 400 }
    );
  }

  if (typeof body.query !== 'string' || !body.query.trim()) {
    return NextResponse.json(
      { error: 'O campo "query" (string GraphQL) é obrigatório.' },
      { status: 400 }
    );
  }

  const variables =
    body.variables &&
    typeof body.variables === 'object' &&
    !Array.isArray(body.variables)
      ? (body.variables as Record<string, unknown>)
      : undefined;

  const result = await executePipefyGraphQL({
    token: auth.config.token,
    apiUrl: auth.config.apiUrl,
    query: body.query,
    variables,
  });

  return NextResponse.json(
    {
      ok: result.ok,
      status: result.status,
      data: result.data ?? null,
      errors: result.errors ?? null,
      ...(result.raw ? { raw: result.raw } : {}),
    },
    { status: result.ok ? 200 : result.status || 502 }
  );
}
