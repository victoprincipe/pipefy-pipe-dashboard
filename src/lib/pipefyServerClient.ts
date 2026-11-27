/**
 * Módulo de apoio às rotas `/api/dev/pipefy/*`, que existem SOMENTE para
 * testes e inspeção com agentes de AI. Nenhum fluxo do dashboard (que fala
 * com o Pipefy via Apps SDK no browser) importa este arquivo.
 */
import { NextResponse, type NextRequest } from 'next/server';

export const DEFAULT_PIPEFY_API_URL = 'https://api.pipefy.com/graphql';

export interface PipefyServerConfig {
  token: string;
  apiUrl: string;
  defaultPipeId: string;
}

export interface PipefyServerGraphQLResult<TData = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data?: TData;
  errors?: unknown;
  raw?: string;
}

/**
 * Blocks temporary dev Pipefy routes in production unless explicitly opted in.
 * These routes exist only for testing/inspection with AI agents.
 */
export function assertDevPipefyRouteAllowed(): NextResponse | null {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DEV_PIPEFY_ROUTES !== 'true'
  ) {
    return NextResponse.json(
      { error: 'Rotas temporárias /api/dev/pipefy desabilitadas em produção.' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Resolves Pipefy server credentials from request headers or server-only env vars.
 */
export function resolvePipefyServerConfig(
  request: NextRequest
): PipefyServerConfig {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  const headerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const envToken = process.env.PIPEFY_API_TOKEN?.trim() ?? '';

  return {
    token: headerToken || envToken,
    apiUrl: process.env.PIPEFY_API_URL?.trim() || DEFAULT_PIPEFY_API_URL,
    defaultPipeId: process.env.PIPEFY_PIPE_ID?.trim() || '',
  };
}

export function missingTokenResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        'Defina PIPEFY_API_TOKEN no .env.local (ou envie Authorization: Bearer <token>).',
    },
    { status: 401 }
  );
}

export function missingPipeIdResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        'Informe ?pipeId=<ID> na URL ou defina PIPEFY_PIPE_ID no .env.local.',
    },
    { status: 400 }
  );
}

/**
 * Validates dev route guard + auth token in one step for temporary
 * `/api/dev/pipefy/*` routes (AI-agent testing only).
 */
export function authorizeDevPipefyRequest(
  request: NextRequest
): { config: PipefyServerConfig } | { errorResponse: NextResponse } {
  const blocked = assertDevPipefyRouteAllowed();
  if (blocked) {
    return { errorResponse: blocked };
  }

  const config = resolvePipefyServerConfig(request);
  if (!config.token) {
    return { errorResponse: missingTokenResponse() };
  }

  return { config };
}

/**
 * Executes a GraphQL query or mutation directly against Pipefy's GraphQL API.
 */
export async function executePipefyGraphQL<TData = Record<string, unknown>>(params: {
  token: string;
  apiUrl: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<PipefyServerGraphQLResult<TData>> {
  const { token, apiUrl, query, variables } = params;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  const rawText = await response.text();
  let parsed: { data?: TData; errors?: unknown } | null = null;
  try {
    parsed = JSON.parse(rawText) as { data?: TData; errors?: unknown };
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return {
      ok: false,
      status: response.status || 502,
      errors: [{ message: 'Resposta não-JSON da API do Pipefy.' }],
      raw: rawText.slice(0, 1000),
    };
  }

  const hasGraphQLErrors =
    Array.isArray(parsed.errors) ? parsed.errors.length > 0 : Boolean(parsed.errors);

  return {
    ok: response.ok && !hasGraphQLErrors,
    status: response.status,
    data: parsed.data,
    errors: parsed.errors,
  };
}
