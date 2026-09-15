import { getRequestAuth } from '@/lib/server/auth';
import { billingConfigured, resumeSubscription } from '@/lib/server/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!billingConfigured()) {
    return Response.json({ error: 'Pagamentos nao configurados' }, { status: 503 });
  }

  try {
    await resumeSubscription({ user: auth.user });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[renew]', err);
    // See the matching comment in /api/billing/checkout: 400 rather than
    // 502/503/504 so a reverse proxy in front of the app doesn't swap this
    // JSON body for its own generic gateway error page.
    return Response.json({ error: err.message || 'Falha ao renovar a assinatura' }, { status: 400 });
  }
}
