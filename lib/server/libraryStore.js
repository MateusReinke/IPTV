import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { queryOne, query } from './db';

// Server-side storage of the synced library (playlists, favorites, history).
//
// It is encrypted at rest with APP_ENCRYPTION_KEY, held outside the database.
// That is a deliberate step down from the old sync-code design, which the
// server could not read at all: with real accounts the server has to be able
// to restore a library after a password reset. Keeping the key in the
// environment means a database dump alone still reveals nothing.

const ALGORITHM = 'aes-256-gcm';

function encryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    const err = new Error(
      'APP_ENCRYPTION_KEY nao configurada: a sincronizacao esta desativada neste servidor.'
    );
    err.code = 'NO_KEY';
    throw err;
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    const err = new Error('APP_ENCRYPTION_KEY precisa ser 32 bytes em base64.');
    err.code = 'BAD_KEY';
    throw err;
  }
  return key;
}

export function libraryStorageConfigured() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

function encrypt(json) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  // The auth tag rides along with the ciphertext so one column holds both.
  return { iv, payload: Buffer.concat([body, cipher.getAuthTag()]) };
}

function decrypt(iv, payload) {
  const buffer = Buffer.from(payload);
  const tag = buffer.subarray(buffer.length - 16);
  const body = buffer.subarray(0, buffer.length - 16);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

export async function readLibrary(userId) {
  const row = await queryOne(
    'select iv, payload, revision, updated_at from libraries where user_id = $1',
    [userId]
  );
  if (!row) return null;
  try {
    return {
      document: JSON.parse(decrypt(row.iv, row.payload)),
      revision: Number(row.revision),
      updatedAt: row.updated_at,
    };
  } catch (err) {
    // A key rotation without re-encrypting would land here. Treat it as "no
    // library" rather than blocking the user out of the app entirely.
    console.error('[library] failed to decrypt for user', userId, err.message);
    return null;
  }
}

export async function writeLibrary(userId, document) {
  const json = JSON.stringify(document);
  const { iv, payload } = encrypt(json);
  const row = await queryOne(
    `insert into libraries (user_id, iv, payload, revision, updated_at)
     values ($1, $2, $3, 1, now())
     on conflict (user_id) do update
       set iv = excluded.iv,
           payload = excluded.payload,
           revision = libraries.revision + 1,
           updated_at = now()
     returning revision, updated_at`,
    [userId, iv, payload]
  );
  return { revision: Number(row.revision), updatedAt: row.updated_at };
}

export async function deleteLibrary(userId) {
  await query('delete from libraries where user_id = $1', [userId]);
}

export const MAX_LIBRARY_BYTES = 4 * 1024 * 1024;
