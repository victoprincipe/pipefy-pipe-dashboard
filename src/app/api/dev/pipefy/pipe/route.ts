/**
 * ⚠️ ROTA SOMENTE PARA TESTES COM AGENTES DE AI (não usada pelo app).
 *
 * Inspeciona a estrutura de um Pipe (fases, campos de formulário, relatórios)
 * para depuração assistida por agentes de AI. Nenhum componente, hook ou lib
 * do dashboard consome esta rota.
 *
 * - Bloqueada em produção, salvo `ALLOW_DEV_PIPEFY_ROUTES=true`.
 * - Requer `?pipeId=<ID>` ou `PIPEFY_PIPE_ID` no `.env.local`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  authorizeDevPipefyRequest,
  executePipefyGraphQL,
  missingPipeIdResponse,
} from '@/lib/pipefyServerClient';

const PIPE_INSPECT_QUERY = `
  query PipeInspect($pipeId: ID!) {
    pipe(id: $pipeId) {
      id
      uuid
      name
      cards_count
      role
      phases {
        id
        name
        cards_count
      }
      start_form_fields {
        id
        label
        type
      }
      reports {
        id
        name
      }
      members {
        role_name
        user {
          id
          name
          email
        }
      }
    }
  }
`;

export async function GET(request: NextRequest) {
  const auth = authorizeDevPipefyRequest(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const pipeId =
    request.nextUrl.searchParams.get('pipeId')?.trim() ||
    auth.config.defaultPipeId;
  if (!pipeId) return missingPipeIdResponse();

  const result = await executePipefyGraphQL<{ pipe?: unknown }>({
    token: auth.config.token,
    apiUrl: auth.config.apiUrl,
    query: PIPE_INSPECT_QUERY,
    variables: { pipeId },
  });

  return NextResponse.json(
    {
      ok: result.ok,
      pipeId,
      pipe: result.data?.pipe ?? null,
      errors: result.errors ?? null,
    },
    { status: result.ok ? 200 : result.status || 502 }
  );
}
