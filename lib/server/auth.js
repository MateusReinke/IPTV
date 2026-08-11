import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { entitlementsFor, TRIAL_DAYS } from '@/lib/entitlements';
import { query, queryOne, transaction } from './db';

// Accounts, passwords and sessions.
//
// Passwords use scrypt from Node's standard library - no native dependency to
// build, and memory-hard enough that a leaked hash is expensive to attack.
// Sessions are opaque random tokens; only their SHA-256 is stored, so the
// database never holds anything that can be replayed as a login.

const scrypt = promisify(scryptCallback);

const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };
export const SESSION_COOKIE = 'iptv_session';
const SESSION_DAYS = 60;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  const value = normalizeEmail(email);
  return value.length >= 5 && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < 8) return 'A senha precisa de pelo menos 8 caracteres';
  if (value.length > 200) return 'A senha e longa demais';
  return null;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const { N, r, p, keylen, maxmem } = SCRYPT_PARAMS;
  const key = await scrypt(String(password).normalize('NFKC'), salt, keylen, { N, r, p, maxmem });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, N, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  let expected;
  try {
    expected = Buffer.from(hashB64, 'base64');
    const salt = Buffer.from(saltB64, 'base64');
    const key = await scrypt(String(password).normalize('NFKC'), salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT_PARAMS.maxmem,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function adminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  );
}

export function isBootstrapAdmin(email) {
  return adminEmails().has(normalizeEmail(email));
}

// Creates the account plus its trial in one transaction, so a failure never
// leaves someone registered without the trial they were promised.
export async function createUser({ email, password, name }) {
  const passwordHash = await hashPassword(password);
  const role = isBootstrapAdmin(email) ? 'admin' : 'user';

  return transaction(async (run) => {
    const existing = await run('select id from users where lower(email) = lower($1)', [email]);
    if (existing.rows.length > 0) {
      const err = new Error('Ja existe uma conta com este e-mail');
      err.code = 'EMAIL_TAKEN';
      throw err;
    }

    const { rows } = await run(
      `insert into users (email, password_hash, name, role)
       values ($1, $2, $3, $4)
       returning id, email, name, role, created_at`,
      [String(email).trim(), passwordHash, name ? String(name).trim().slice(0, 120) : null, role]
    );
    const user = rows[0];

    await run(
      `insert into subscriptions (user_id, plan, status, trial_ends_at)
       values ($1, 'trial', 'trialing', now() + ($2 || ' days')::interval)`,
      [user.id, String(TRIAL_DAYS)]
    );

    return user;
  });
}

export async function findUserByEmail(email) {
  return queryOne(
    `select id, email, name, role, password_hash, disabled_at
     from users where lower(email) = lower($1)`,
    [String(email).trim()]
  );
}

export async function createSession(userId, userAgent) {
  const token = randomBytes(32).toString('base64url');
  await query(
    `insert into sessions (user_id, token_hash, user_agent, expires_at)
     values ($1, $2, $3, now() + ($4 || ' days')::interval)`,
    [userId, hashToken(token), (userAgent || '').slice(0, 300) || null, String(SESSION_DAYS)]
  );
  return { token, maxAge: SESSION_DAYS * 24 * 60 * 60 };
}

export async function revokeSession(token) {
  if (!token) return;
  await query('update sessions set revoked_at = now() where token_hash = $1', [hashToken(token)]);
}

export async function revokeAllSessions(userId) {
  await query(
    'update sessions set revoked_at = now() where user_id = $1 and revoked_at is null',
    [userId]
  );
}

// Resolves a raw session token into the account and its current entitlements.
export async function resolveSessionToken(token) {
  if (!token) return null;
  const row = await queryOne(
    `select u.id, u.email, u.name, u.role, u.disabled_at,
            s.id as session_id,
            sub.plan, sub.status, sub.trial_ends_at, sub.current_period_end,
            sub.cancel_at_period_end, sub.provider, sub.provider_customer_id,
            sub.provider_subscription_id
     from sessions s
     join users u on u.id = s.user_id
     left join subscriptions sub on sub.user_id = u.id
     where s.token_hash = $1
       and s.revoked_at is null
       and s.expires_at > now()`,
    [hashToken(token)]
  );
  if (!row || row.disabled_at) return null;

  // Cheap liveness tracking; skipped when already fresh to avoid a write per
  // request. `last_used_at` also powers "active accounts" in the admin panel.
  query(
    `update sessions set last_used_at = now() where id = $1 and last_used_at < now() - interval '5 minutes'`,
    [row.session_id]
  ).catch(() => {});

  const subscription = row.status
    ? {
        plan: row.plan,
        status: row.status,
        trial_ends_at: row.trial_ends_at,
        current_period_end: row.current_period_end,
        cancel_at_period_end: row.cancel_at_period_end,
        provider: row.provider,
        provider_customer_id: row.provider_customer_id,
        provider_subscription_id: row.provider_subscription_id,
      }
    : null;

  return {
    user: { id: row.id, email: row.email, name: row.name, role: row.role },
    subscription,
    entitlements: entitlementsFor(subscription),
  };
}

// For server components and route handlers using cookies.
export async function getAuth() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return resolveSessionToken(token);
}

// For route handlers: accepts the cookie or an `Authorization: Bearer` token,
// so a native app can use the same API without a cookie jar.
export async function getRequestAuth(request) {
  const header = request.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    const auth = await resolveSessionToken(header.slice(7).trim());
    if (auth) return auth;
  }
  return getAuth();
}

export function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export async function setSessionCookie(token, maxAge) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', sessionCookieOptions(0));
}

export async function promoteBootstrapAdmin(user) {
  if (user.role === 'admin' || !isBootstrapAdmin(user.email)) return user;
  await query("update users set role = 'admin' where id = $1", [user.id]);
  return { ...user, role: 'admin' };
}
