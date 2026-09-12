import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getOrCreateSetting } from './settings';

// Short-lived signed permission to pull bytes through /api/stream.
//
// The stream proxy is hit once per HLS segment, so it cannot afford a database
// round trip per request. Instead the lease endpoint (which does check the
// database, and the plan's screen limit) hands out an HMAC token that the
// proxy verifies statelessly. Concurrency stays honest because tokens are
// short-lived and only renewed while a lease heartbeat keeps flowing.
//
// The signing key comes from STREAM_TOKEN_SECRET when set; otherwise the app
// generates one on first use and keeps it in the database. That is safe here -
// this key authorises streaming, it does not encrypt stored data - and it
// means a deploy does not have to invent a secret before video works.

// Long enough that a progressive .mp4 can still be seeked hours into a film
// (those requests carry whatever token was baked into the <video> src). HLS
// playback swaps in a fresh token on every segment, so it never relies on this
// window. The trade-off is that a leaked token stays usable until it expires -
// acceptable because holding one already requires a logged-in account.
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const SETTING_KEY = 'stream_token_secret';

let cachedSecret;

export async function streamSecret() {
  const fromEnv =
    process.env.STREAM_TOKEN_SECRET || process.env.APP_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;
  if (cachedSecret) return cachedSecret;
  cachedSecret = await getOrCreateSetting(SETTING_KEY, () => randomBytes(32).toString('hex'));
  return cachedSecret;
}

// True when a secret is already available without touching the database.
// Playback still works without it - the key is generated on demand - so this
// only tells the health endpoint where the value comes from.
export function streamSecretFromEnv() {
  return !!(
    process.env.STREAM_TOKEN_SECRET ||
    process.env.APP_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET
  );
}

async function sign(payload) {
  return createHmac('sha256', await streamSecret()).update(payload).digest('base64url');
}

export async function issuePlayToken(userId, ttlMs = TOKEN_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${userId}.${expiresAt}`;
  return { token: `${payload}.${await sign(payload)}`, expiresAt };
}

export async function verifyPlayToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;

  // Cheapest check first: an expired token needs no HMAC work.
  if (!Number(expiresAt) || Number(expiresAt) < Date.now()) return null;

  const expected = Buffer.from(await sign(`${userId}.${expiresAt}`));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  return { userId, expiresAt: Number(expiresAt) };
}
