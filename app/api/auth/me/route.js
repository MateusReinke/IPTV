import { getRequestAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ user: null, entitlements: null }, { status: 200 });
  return Response.json({
    user: auth.user,
    entitlements: auth.entitlements,
    subscription: auth.subscription
      ? {
          plan: auth.subscription.plan,
          status: auth.subscription.status,
          cancelAtPeriodEnd: auth.subscription.cancel_at_period_end,
          provider: auth.subscription.provider,
        }
      : null,
  });
}
