import { getRequestAuth } from '@/lib/server/auth';
import {
  HEARTBEAT_SECONDS,
  activeLeases,
  claimLease,
  pruneExpiredLeases,
  releaseLease,
} from '@/lib/server/leases';
import { issuePlayToken } from '@/lib/server/playToken';

// Every picture on screen holds a lease. This is where the plan's screen limit
// is enforced, and where the short-lived token that /api/stream accepts comes
// from - so the limit holds across tabs and devices, not just inside one page.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Faca login para assistir' }, { status: 401 });

  // navigator.sendBeacon can only POST, and it is the one release that still
  // works while the tab is being torn down.
  const params = new URL(request.url).searchParams;
  if (params.get('_method') === 'delete') {
    const tileId = params.get('tileId');
    if (tileId) await releaseLease(auth.user.id, tileId);
    return Response.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  const tileId = String(body?.tileId || '').slice(0, 80);
  if (!tileId) return Response.json({ error: 'tileId obrigatorio' }, { status: 400 });

  const screens = auth.entitlements.features.screens;
  const lease = await claimLease(auth.user.id, tileId, body?.label, screens);

  if (!lease) {
    const open = await activeLeases(auth.user.id);
    return Response.json(
      {
        error:
          screens === 1
            ? 'Seu plano permite assistir a uma tela por vez. Assine o Premium para abrir varias.'
            : `Seu plano permite ${screens} telas simultaneas.`,
        code: 'SCREEN_LIMIT',
        screens,
        used: open.length,
      },
      { status: 402 }
    );
  }

  // Cheap opportunistic cleanup - there is no scheduler in a single container.
  if (Math.random() < 0.05) pruneExpiredLeases().catch(() => {});

  const { token, expiresAt } = await issuePlayToken(auth.user.id);
  return Response.json({
    token,
    expiresAt,
    heartbeatSeconds: HEARTBEAT_SECONDS,
    screens,
    used: lease.used,
  });
}

export async function DELETE(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ ok: true });
  const tileId = new URL(request.url).searchParams.get('tileId');
  if (tileId) await releaseLease(auth.user.id, tileId);
  return Response.json({ ok: true });
}

export async function GET(request) {
  const auth = await getRequestAuth(request);
  if (!auth) return Response.json({ error: 'Nao autenticado' }, { status: 401 });
  const leases = await activeLeases(auth.user.id);
  return Response.json({
    screens: auth.entitlements.features.screens,
    used: leases.length,
    leases: leases.map((lease) => ({ tileId: lease.tile_id, label: lease.label })),
  });
}
