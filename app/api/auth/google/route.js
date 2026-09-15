import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { STATE_COOKIE, googleAuthConfigured, googleAuthUrl } from '@/lib/server/googleAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_MAX_AGE = 600; // 10 min - just long enough for the consent screen

function origin(request) {
  return process.env.APP_URL || new URL(request.url).origin;
}

// Only in-app paths, so a crafted ?next= cannot bounce someone off-site -
// same rule app/entrar/page.js already applies client-side.
function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/app';
}

export async function GET(request) {
  const url = new URL(request.url);
  if (!googleAuthConfigured()) {
    return Response.redirect(`${origin(request)}/entrar?error=google`);
  }

  const next = safeNext(url.searchParams.get('next'));
  const random = randomBytes(16).toString('base64url');
  // No manual encoding here: googleAuthUrl builds the query string with
  // URLSearchParams, which already escapes the whole `state` value (and the
  // callback decodes it the same way reading url.searchParams).
  const state = `${random}.${next}`;

  const store = await cookies();
  store.set(STATE_COOKIE, random, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_MAX_AGE,
  });

  const redirectUri = `${origin(request)}/api/auth/google/callback`;
  return Response.redirect(googleAuthUrl({ state, redirectUri }));
}
