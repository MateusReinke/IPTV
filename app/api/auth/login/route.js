import {
  createSession,
  findUserByEmail,
  promoteBootstrapAdmin,
  resolveSessionToken,
  setSessionCookie,
  verifyPassword,
} from '@/lib/server/auth';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/server/rateLimit';
import { describeDatabaseError } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_ERROR = 'E-mail ou senha incorretos';

export async function POST(request) {
  const ip = clientIp(request);
  const body = await request.json().catch(() => null);
  const email = String(body?.email || '');

  // Limited per address and per account: one stops a spray from a single
  // host, the other stops a distributed attack against one inbox.
  const byIp = rateLimit(`login:ip:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!byIp.allowed) return tooManyRequests(byIp.retryAfter);
  const byEmail = rateLimit(`login:email:${email.toLowerCase()}`, {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!byEmail.allowed) return tooManyRequests(byEmail.retryAfter);

  let user;
  try {
    user = await findUserByEmail(email);
  } catch (err) {
    console.error('[login]', err);
    return Response.json(
      { error: `Nao foi possivel entrar: ${describeDatabaseError(err)}`, code: 'SERVER_NOT_READY' },
      { status: 503 }
    );
  }

  // Always run the comparison so a missing account and a wrong password take
  // a similar amount of time.
  const ok = await verifyPassword(
    body?.password || '',
    user?.password_hash || '$scrypt$32768$8$1$AAAA$AAAA'
  );

  if (!user || !ok) {
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }
  if (user.disabled_at) {
    return Response.json({ error: 'Esta conta esta suspensa.' }, { status: 403 });
  }

  try {
    await promoteBootstrapAdmin(user);
    const { token, maxAge } = await createSession(user.id, request.headers.get('user-agent'));
    await setSessionCookie(token, maxAge);
    const auth = await resolveSessionToken(token);
    return Response.json({ user: auth.user, entitlements: auth.entitlements, token });
  } catch (err) {
    console.error('[login session]', err);
    return Response.json(
      { error: `Nao foi possivel entrar: ${describeDatabaseError(err)}`, code: 'SERVER_NOT_READY' },
      { status: 503 }
    );
  }
}
