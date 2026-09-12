import { getRequestAuth } from '@/lib/server/auth';
import { dashboardStats, recentAudit } from '@/lib/server/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await getRequestAuth(request);
  if (!auth || auth.user.role !== 'admin') {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }
  const [stats, audit] = await Promise.all([dashboardStats(), recentAudit(15)]);
  return Response.json({ stats, audit });
}
