import { getRequestAuth } from '@/lib/server/auth';
import { billingConfigured, openPortal } from '@/lib/server/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Nao autenticado' }, { status: 401 });
  if (!billingConfigured()) {
    return Response.json({ error: 'Pagamentos nao configurados' }, { status: 503 });
  }

  try {
    const url = await openPortal({
      user: auth.user,
      origin: process.env.APP_URL || new URL(request.url).origin,
    });
    return Response.json({ url });
  } catch (err) {
    console.error('[portal]', err);
    return Response.json({ error: err.message || 'Falha ao abrir o portal' }, { status: 502 });
  }
}
