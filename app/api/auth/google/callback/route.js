import { cookies } from 'next/headers';
import { STATE_COOKIE, exchangeCodeForProfile } from '@/lib/server/googleAuth';
import {
  createSession,
  findOrCreateOAuthUser,
  promoteBootstrapAdmin,
  setSessionCookie,
} from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function origin(request) {
  return process.env.APP_URL || new URL(request.url).origin;
}

function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/app';
}

function fail(request, reason) {
  return Response.redirect(`${origin(request)}/entrar?error=${reason}`);
}

export async function GET(request) {
  const url = new URL(request.url);
  const store = await cookies();
  const expectedRandom = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (url.searchParams.get('error')) {
    return fail(request, 'google_denied');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  // indexOf, not split('.') - a next path could itself contain a dot (e.g. a
  // future ?next= with a file extension), which split() would truncate.
  const dotIndex = state.indexOf('.');
  const random = dotIndex === -1 ? state : state.slice(0, dotIndex);
  if (!code || !expectedRandom || random !== expectedRandom) {
    return fail(request, 'google');
  }
  const next = safeNext(dotIndex === -1 ? '' : state.slice(dotIndex + 1));

  let profile;
  try {
    profile = await exchangeCodeForProfile({
      code,
      redirectUri: `${origin(request)}/api/auth/google/callback`,
    });
  } catch (err) {
    console.error('[google callback]', err);
    return fail(request, 'google');
  }
  if (!profile.emailVerified) {
    return fail(request, 'google');
  }

  try {
    let user = await findOrCreateOAuthUser({
      provider: 'google',
      providerAccountId: profile.providerAccountId,
      email: profile.email,
      name: profile.name,
    });
    if (user.disabled_at) {
      return fail(request, 'google_disabled');
    }
    user = await promoteBootstrapAdmin(user);

    const { token, maxAge } = await createSession(user.id, request.headers.get('user-agent'));
    await setSessionCookie(token, maxAge);
  } catch (err) {
    console.error('[google callback session]', err);
    return fail(request, 'google');
  }

  return Response.redirect(`${origin(request)}${next}`);
}
