import {
  createSession,
  createUser,
  isValidEmail,
  passwordProblem,
  resolveSessionToken,
  setSessionCookie,
} from '@/lib/server/auth';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const limit = rateLimit(`signup:${clientIp(request)}`, { limit: 8, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const email = body?.email;
  const password = body?.password;

  if (!isValidEmail(email)) {
    return Response.json({ error: 'Informe um e-mail valido' }, { status: 400 });
  }
  const problem = passwordProblem(password);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  let user;
  try {
    user = await createUser({ email, password, name: body?.name });
  } catch (err) {
    if (err.code === 'EMAIL_TAKEN') {
      return Response.json({ error: err.message }, { status: 409 });
    }
    console.error('[signup]', err);
    return Response.json({ error: 'Nao foi possivel criar a conta agora' }, { status: 500 });
  }

  const { token, maxAge } = await createSession(user.id, request.headers.get('user-agent'));
  await setSessionCookie(token, maxAge);
  const auth = await resolveSessionToken(token);

  return Response.json({
    user: auth.user,
    entitlements: auth.entitlements,
    // Native clients cannot use the cookie; they keep this token instead.
    token,
  });
}
