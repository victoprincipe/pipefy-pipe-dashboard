/**
 * ⚠️ ROTA SOMENTE PARA TESTES COM AGENTES DE AI (não usada pelo app).
 *
 * Retorna `me` (usuário autenticado no Pipefy) para inspeção e depuração
 * assistida por agentes de AI. Nenhum componente, hook ou lib do dashboard
 * consome esta rota.
 *
 * - Bloqueada em produção, salvo `ALLOW_DEV_PIPEFY_ROUTES=true`.
 * - Usa `PIPEFY_API_TOKEN` do servidor ou `Authorization: Bearer <token>`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  authorizeDevPipefyRequest,
  executePipefyGraphQL,
} from '@/lib/pipefyServerClient';

const ME_QUERY = `
  query Me {
    me {
      id
      name
      email
      username
    }
  }
`;

interface MeResponseData {
  me?: {
    id?: string | number;
    name?: string;
    email?: string;
    username?: string;
  };
}

export async function GET(request: NextRequest) {
  const auth = authorizeDevPipefyRequest(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const result = await executePipefyGraphQL<MeResponseData>({
    token: auth.config.token,
    apiUrl: auth.config.apiUrl,
    query: ME_QUERY,
  });

  return NextResponse.json(
    {
      ok: result.ok,
      me: result.data?.me ?? null,
      errors: result.errors ?? null,
    },
    { status: result.ok ? 200 : result.status || 502 }
  );
}
