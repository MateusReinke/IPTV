// Login com Google (Authorization Code, servidor confidencial - tem client
// secret, entao dispensa PKCE). Mesma ideia de isolamento de provedor que
// lib/server/billing.js usa para o Stripe: sem GOOGLE_CLIENT_ID/SECRET o app
// continua funcionando so com e-mail/senha, o botao fica oculto.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REQUEST_TIMEOUT_MS = 15000;

// Cookie name for the CSRF state token, shared by the two OAuth route
// handlers (app/api/auth/google/route.js and its callback).
export const STATE_COOKIE = 'google_oauth_state';

export function googleAuthConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleAuthUrl({ state, redirectUri }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// Troca o code pelo access token e busca o perfil. So propaga erro em falha
// de rede/HTTP - quem chama decide o redirect de erro.
export async function exchangeCodeForProfile({ code, redirectUri }) {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const tokenData = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenData?.access_token) {
    throw new Error(tokenData?.error_description || 'Falha ao trocar o codigo com o Google');
  }

  const profileRes = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const profile = await profileRes.json().catch(() => null);
  if (!profileRes.ok || !profile?.sub || !profile?.email) {
    throw new Error('Falha ao obter o perfil do Google');
  }

  return {
    providerAccountId: profile.sub,
    email: profile.email,
    name: profile.name || null,
    emailVerified: profile.email_verified === true,
  };
}
