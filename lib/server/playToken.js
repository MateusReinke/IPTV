import { createHmac, timingSafeEqual } from 'node:crypto';

// Short-lived signed permission to pull bytes through /api/stream.
//
// The stream proxy is hit once per HLS segment, so it cannot afford a database
// round trip per request. Instead the lease endpoint (which does check the
// database, and the plan's screen limit) hands out an HMAC token that the
// proxy verifies statelessly. Concurrency stays honest because tokens are
// short-lived and only renewed while a lease heartbeat keeps flowing.

// Long enough that a progressive .mp4 can still be seeked hours into a film
// (those requests carry whatever token was baked into the <video> src). HLS
// playback swaps in a fresh token on every segment, so it never relies on this
// window. The trade-off is that a leaked token stays usable until it expires -
// acceptable because holding one already requires a logged-in account.
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

function secret() {
  const value =
    process.env.STREAM_TOKEN_SECRET || process.env.APP_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!value) {
    throw new Error(
      'Configure STREAM_TOKEN_SECRET (ou APP_ENCRYPTION_KEY) para liberar a reproducao.'
    );
  }
  return value;
}

export function streamAuthConfigured() {
  return !!(
    process.env.STREAM_TOKEN_SECRET ||
    process.env.APP_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET
  );
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issuePlayToken(userId, ttlMs = TOKEN_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${userId}.${expiresAt}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifyPlayToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;

  const expected = Buffer.from(sign(`${userId}.${expiresAt}`));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  if (!Number(expiresAt) || Number(expiresAt) < Date.now()) return null;

  return { userId, expiresAt: Number(expiresAt) };
}
