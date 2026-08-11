import { getRequestAuth } from '@/lib/server/auth';
import { listUsers } from '@/lib/server/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await getRequestAuth(request);
  if (!auth || auth.user.role !== 'admin') {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const result = await listUsers({
    search: (params.get('q') || '').trim().toLowerCase().slice(0, 120),
    status: params.get('status') || 'all',
    limit: Math.min(200, Math.max(1, Number(params.get('limit')) || 50)),
    offset: Math.max(0, Number(params.get('offset')) || 0),
  });

  return Response.json(result);
}
