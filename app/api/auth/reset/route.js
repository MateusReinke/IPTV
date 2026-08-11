import { createHash } from 'node:crypto';
import { hashPassword, passwordProblem, revokeAllSessions } from '@/lib/server/auth';
import { queryOne, query } from '@/lib/server/db';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/server/rateLimit';

// Consumes a reset link generated from the admin panel. There is no
// self-service "forgot password" e-mail yet - see README for the SMTP seam.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const limit = rateLimit(`reset:${clientIp(request)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const token = String(body?.token || '');
  const problem = passwordProblem(body?.password);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  if (!token) return Response.json({ error: 'Link invalido' }, { status: 400 });

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const row = await queryOne(
    `select id, user_id from password_resets
     where token_hash = $1 and used_at is null and expires_at > now()`,
    [tokenHash]
  );
  if (!row) {
    return Response.json({ error: 'Link expirado ou ja utilizado' }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);
  await query('update users set password_hash = $2 where id = $1', [row.user_id, passwordHash]);
  await query('update password_resets set used_at = now() where id = $1', [row.id]);
  // A password change should end every other session.
  await revokeAllSessions(row.user_id);

  return Response.json({ ok: true });
}
