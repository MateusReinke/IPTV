import { getRequestAuth } from '@/lib/server/auth';
import {
  createPasswordResetLink,
  extendTrial,
  grantPremium,
  revokeAccess,
  setUserDisabled,
  setUserRole,
} from '@/lib/server/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await getRequestAuth(request);
  if (!auth || auth.user.role !== 'admin') {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action;
  const userId = body?.userId;
  if (!action || !userId) {
    return Response.json({ error: 'Parametros ausentes' }, { status: 400 });
  }
  // An admin locking themselves out is the one mistake with no in-app remedy.
  if (userId === auth.user.id && ['disable', 'demote'].includes(action)) {
    return Response.json({ error: 'Voce nao pode fazer isso na propria conta' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'grant_premium':
        await grantPremium(auth.user.id, userId, body.days || 30);
        break;
      case 'extend_trial':
        await extendTrial(auth.user.id, userId, body.days || 7);
        break;
      case 'revoke':
        await revokeAccess(auth.user.id, userId);
        break;
      case 'disable':
        await setUserDisabled(auth.user.id, userId, true);
        break;
      case 'enable':
        await setUserDisabled(auth.user.id, userId, false);
        break;
      case 'promote':
        await setUserRole(auth.user.id, userId, 'admin');
        break;
      case 'demote':
        await setUserRole(auth.user.id, userId, 'user');
        break;
      case 'reset_link': {
        const origin = process.env.APP_URL || new URL(request.url).origin;
        const link = await createPasswordResetLink(auth.user.id, userId, origin);
        return Response.json({ ok: true, link });
      }
      default:
        return Response.json({ error: 'Acao desconhecida' }, { status: 400 });
    }
  } catch (err) {
    console.error('[admin action]', action, err);
    return Response.json({ error: 'Falha ao executar a acao' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
