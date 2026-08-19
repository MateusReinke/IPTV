import {
  createSession,
  createUser,
  isValidEmail,
  passwordProblem,
  resolveSessionToken,
  setSessionCookie,
} from '@/lib/server/auth';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/server/rateLimit';
import { describeDatabaseError } from '@/lib/server/db';

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
    if (err.code === 'EMAIL_TAKEN' || err.code === '23505') {
      return Response.json({ error: 'Ja existe uma conta com este e-mail' }, { status: 409 });
    }
    // Almost every real failure here is configuration, not code: no
    // DATABASE_URL, wrong credentials, migrations blocked. Say which, instead
    // of a generic error the operator cannot act on.
    console.error('[signup]', err);
    return Response.json(
      {
        error: `Nao foi possivel criar a conta: ${describeDatabaseError(err)}`,
        code: 'SERVER_NOT_READY',
      },
      { status: 503 }
    );
  }

  try {
    const { token, maxAge } = await createSession(user.id, request.headers.get('user-agent'));
    await setSessionCookie(token, maxAge);
    const auth = await resolveSessionToken(token);

    return Response.json({
      user: auth.user,
      entitlements: auth.entitlements,
      // Native clients cannot use the cookie; they keep this token instead.
      token,
    });
  } catch (err) {
    // The account exists at this point, so point the user at the login rather
    // than letting them try to register again.
    console.error('[signup session]', err);
    return Response.json(
      {
        error: 'Conta criada, mas nao foi possivel iniciar a sessao. Tente entrar pela tela de login.',
        code: 'SESSION_FAILED',
      },
      { status: 503 }
    );
  }
}
