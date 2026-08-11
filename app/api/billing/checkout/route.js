import { getRequestAuth } from '@/lib/server/auth';
import { billingConfigured, startCheckout } from '@/lib/server/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function origin(request) {
  return process.env.APP_URL || new URL(request.url).origin;
}

export async function POST(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Faca login para assinar' }, { status: 401 });
  if (!billingConfigured()) {
    return Response.json(
      {
        error:
          'Pagamento online ainda nao esta ativo neste servidor. Fale com o suporte para liberar seu acesso.',
        code: 'BILLING_OFF',
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const planId = body?.plan === 'yearly' ? 'yearly' : 'monthly';

  try {
    const url = await startCheckout({ user: auth.user, planId, origin: origin(request) });
    return Response.json({ url });
  } catch (err) {
    console.error('[checkout]', err);
    return Response.json({ error: err.message || 'Falha ao iniciar o pagamento' }, { status: 502 });
  }
}
