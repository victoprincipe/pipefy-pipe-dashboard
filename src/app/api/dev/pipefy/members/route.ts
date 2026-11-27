/**
 * ⚠️ ROTA SOMENTE PARA TESTES COM AGENTES DE AI (não usada pelo app).
 *
 * Lista o usuário autenticado e os membros do Pipe para inspeção e depuração
 * assistida por agentes de AI. Nenhum componente, hook ou lib do dashboard
 * consome esta rota.
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
import type { PipefyUserInfo } from '@/types/pipefySql';

const ME_QUERY = `
  query Me {
    me {
      id
      name
      email
    }
  }
`;

const PIPE_MEMBERS_QUERY = `
  query PipeMembers($pipeId: ID!) {
    pipe(id: $pipeId) {
      id
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

interface MeData {
  me?: {
    id?: string | number;
    name?: string;
    email?: string;
  };
}

interface PipeMembersData {
  pipe?: {
    id?: string | number;
    members?: Array<{
      role_name?: string | null;
      user?: {
        id?: string | number;
        name?: string;
        email?: string;
      } | null;
    }>;
  };
}

export async function GET(request: NextRequest) {
  const auth = authorizeDevPipefyRequest(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const pipeId =
    request.nextUrl.searchParams.get('pipeId')?.trim() ||
    auth.config.defaultPipeId;
  if (!pipeId) return missingPipeIdResponse();

  const [meRes, membersRes] = await Promise.all([
    executePipefyGraphQL<MeData>({
      token: auth.config.token,
      apiUrl: auth.config.apiUrl,
      query: ME_QUERY,
    }),
    executePipefyGraphQL<PipeMembersData>({
      token: auth.config.token,
      apiUrl: auth.config.apiUrl,
      query: PIPE_MEMBERS_QUERY,
      variables: { pipeId },
    }),
  ]);

  const rawMe = meRes.data?.me;
  const me: PipefyUserInfo | null = rawMe?.id
    ? {
        id: String(rawMe.id),
        name: String(rawMe.name || 'Usuário Pipefy'),
        email: rawMe.email ? String(rawMe.email) : undefined,
      }
    : null;

  const rawMembers = membersRes.data?.pipe?.members ?? [];
  const membersMap = new Map<string, PipefyUserInfo>();
  for (const item of rawMembers) {
    const u = item?.user;
    if (!u?.id) continue;
    const id = String(u.id).trim();
    if (!id || membersMap.has(id)) continue;
    membersMap.set(id, {
      id,
      name: String(u.name || 'Usuário Pipefy'),
      email: u.email ? String(u.email) : undefined,
    });
  }

  const sortedMembers = Array.from(membersMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR')
  );

  const pipeUsers: PipefyUserInfo[] = [];
  const seen = new Set<string>();
  if (me) {
    pipeUsers.push(me);
    seen.add(me.id);
  }
  for (const member of sortedMembers) {
    if (!seen.has(member.id)) {
      seen.add(member.id);
      pipeUsers.push(member);
    }
  }

  const errors = [
    ...(meRes.errors ? [{ source: 'me', details: meRes.errors }] : []),
    ...(membersRes.errors ? [{ source: 'members', details: membersRes.errors }] : []),
  ];

  return NextResponse.json(
    {
      ok: meRes.ok && membersRes.ok,
      pipeId,
      me,
      members: rawMembers,
      pipeUsers,
      errors: errors.length > 0 ? errors : null,
    },
    { status: meRes.ok && membersRes.ok ? 200 : 502 }
  );
}
