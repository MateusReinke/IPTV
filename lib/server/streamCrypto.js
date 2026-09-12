import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { streamSecret } from './playToken';

// Encrypts the upstream Xtream stream URL (which embeds the account's
// username/password in its path) before it ever reaches the browser.
//
// /api/stream used to receive that URL as a plain `url=` query parameter,
// which meant the account's server/login/password sat in cleartext in the
// browser's network panel, history and any access log that records the
// request line. This makes the query parameter an opaque, authenticated
// blob instead - only this server can turn it back into a real URL.
//
// Reuses the same secret as the play token (STREAM_TOKEN_SECRET, falling
// back to a DB-generated one) so no extra configuration is required.

const ALGORITHM = 'aes-256-gcm';

async function encryptionKey() {
  return createHash('sha256').update(await streamSecret()).digest();
}

export async function encryptStreamTarget(url) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, await encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url');
}

// Returns null on any malformed or tampered input rather than throwing, so
// callers can treat it the same way as a missing parameter.
export async function decryptStreamTarget(token) {
  if (typeof token !== 'string' || !token) return null;
  let payload;
  try {
    payload = Buffer.from(token, 'base64url');
  } catch {
    return null;
  }
  if (payload.length < 12 + 16) return null;
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(payload.length - 16);
  const body = payload.subarray(12, payload.length - 16);
  try {
    const decipher = createDecipheriv(ALGORITHM, await encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
