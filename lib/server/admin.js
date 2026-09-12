import { randomBytes, createHash } from 'node:crypto';
import { query, queryOne, queryRows } from './db';

// Everything the operator needs: who signed up, who is paying, and the manual
// levers that keep the product sellable before (or without) an online payment
// provider.

export async function requireAdmin(auth) {
  return !!auth && auth.user.role === 'admin';
}

export async function dashboardStats() {
  const [totals, funnel, revenue, series] = await Promise.all([
    queryOne(`
      select
        count(*)::int as users,
        count(*) filter (where created_at > now() - interval '7 days')::int as users_7d,
        count(*) filter (where created_at > now() - interval '30 days')::int as users_30d
      from users
    `),
    queryOne(`
      select
        count(*) filter (where status = 'trialing' and trial_ends_at > now())::int as trialing,
        count(*) filter (where status in ('active','past_due') and current_period_end > now())::int as active,
        count(*) filter (where status = 'canceled' and current_period_end > now())::int as canceling,
        count(*) filter (
          where (status = 'trialing' and trial_ends_at <= now())
             or (status in ('active','past_due','canceled') and current_period_end <= now())
        )::int as expired
      from subscriptions
    `),
    queryOne(`
      select count(*)::int as paying
      from subscriptions
      where status in ('active','past_due','canceled') and current_period_end > now()
    `),
    queryRows(`
      select to_char(day, 'YYYY-MM-DD') as day, coalesce(count(u.id), 0)::int as signups
      from generate_series(current_date - interval '29 days', current_date, interval '1 day') as day
      left join users u on u.created_at >= day and u.created_at < day + interval '1 day'
      group by day
      order by day
    `),
  ]);

  const activeSessions = await queryOne(`
    select count(distinct user_id)::int as total
    from sessions
    where revoked_at is null and last_used_at > now() - interval '24 hours'
  `);

  return {
    users: totals.users,
    users7d: totals.users_7d,
    users30d: totals.users_30d,
    trialing: funnel.trialing,
    active: funnel.active,
    canceling: funnel.canceling,
    expired: funnel.expired,
    paying: revenue.paying,
    activeLast24h: activeSessions.total,
    signups: series,
  };
}

export async function listUsers({ search = '', status = 'all', limit = 50, offset = 0 } = {}) {
  const clauses = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(lower(u.email) like $${params.length} or lower(coalesce(u.name,'')) like $${params.length})`);
  }
  if (status === 'trialing') {
    clauses.push("s.status = 'trialing' and s.trial_ends_at > now()");
  } else if (status === 'active') {
    clauses.push("s.status in ('active','past_due') and s.current_period_end > now()");
  } else if (status === 'expired') {
    clauses.push(
      `((s.status = 'trialing' and s.trial_ends_at <= now())
        or (s.status in ('active','past_due','canceled') and s.current_period_end <= now())
        or s.status is null)`
    );
  }

  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  params.push(limit, offset);

  const rows = await queryRows(
    `select u.id, u.email, u.name, u.role, u.created_at, u.last_seen_at, u.disabled_at,
            s.plan, s.status, s.trial_ends_at, s.current_period_end,
            s.cancel_at_period_end, s.provider
     from users u
     left join subscriptions s on s.user_id = u.id
     ${where}
     order by u.created_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params
  );

  const totalRow = await queryOne(
    `select count(*)::int as total
     from users u left join subscriptions s on s.user_id = u.id
     ${where}`,
    params.slice(0, params.length - 2)
  );

  return { rows, total: totalRow?.total || 0 };
}

async function audit(actorId, action, targetUserId, details) {
  await query(
    'insert into admin_audit (actor_id, action, target_user_id, details) values ($1, $2, $3, $4)',
    [actorId, action, targetUserId || null, details ? JSON.stringify(details) : null]
  );
}

// Manual access grant. This is what lets you sell before Stripe is wired up
// (bank transfer, PIX, a friend) and what support uses to fix a bad charge.
export async function grantPremium(actorId, userId, days) {
  const amount = Math.max(1, Math.min(3650, Number(days) || 30));
  await query(
    `insert into subscriptions (user_id, plan, status, current_period_end, provider, updated_at)
     values ($1, 'premium', 'active', now() + ($2 || ' days')::interval, 'manual', now())
     on conflict (user_id) do update
       set plan = 'premium',
           status = 'active',
           -- Extends from whichever is later, so granting twice adds up.
           current_period_end = greatest(coalesce(subscriptions.current_period_end, now()), now())
                                + ($2 || ' days')::interval,
           cancel_at_period_end = false,
           provider = coalesce(subscriptions.provider, 'manual'),
           updated_at = now()`,
    [userId, String(amount)]
  );
  await audit(actorId, 'grant_premium', userId, { days: amount });
}

export async function extendTrial(actorId, userId, days) {
  const amount = Math.max(1, Math.min(365, Number(days) || 7));
  await query(
    `insert into subscriptions (user_id, plan, status, trial_ends_at, updated_at)
     values ($1, 'trial', 'trialing', now() + ($2 || ' days')::interval, now())
     on conflict (user_id) do update
       set plan = 'trial',
           status = 'trialing',
           trial_ends_at = greatest(coalesce(subscriptions.trial_ends_at, now()), now())
                           + ($2 || ' days')::interval,
           updated_at = now()`,
    [userId, String(amount)]
  );
  await audit(actorId, 'extend_trial', userId, { days: amount });
}

export async function revokeAccess(actorId, userId) {
  await query(
    `update subscriptions
     set status = 'expired', current_period_end = now(), trial_ends_at = now(), updated_at = now()
     where user_id = $1`,
    [userId]
  );
  await audit(actorId, 'revoke_access', userId, null);
}

export async function setUserDisabled(actorId, userId, disabled) {
  await query('update users set disabled_at = $2 where id = $1', [
    userId,
    disabled ? new Date() : null,
  ]);
  if (disabled) {
    await query('update sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [
      userId,
    ]);
  }
  await audit(actorId, disabled ? 'disable_user' : 'enable_user', userId, null);
}

export async function setUserRole(actorId, userId, role) {
  const next = role === 'admin' ? 'admin' : 'user';
  await query('update users set role = $2 where id = $1', [userId, next]);
  await audit(actorId, 'set_role', userId, { role: next });
}

// No transactional e-mail yet, so the operator hands the link over directly.
export async function createPasswordResetLink(actorId, userId, origin) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await query(
    `insert into password_resets (user_id, token_hash, expires_at)
     values ($1, $2, now() + interval '2 hours')`,
    [userId, tokenHash]
  );
  await audit(actorId, 'password_reset_link', userId, null);
  return `${origin}/redefinir-senha?token=${token}`;
}

export async function recentAudit(limit = 20) {
  return queryRows(
    `select a.action, a.details, a.created_at,
            actor.email as actor_email, target.email as target_email
     from admin_audit a
     left join users actor on actor.id = a.actor_id
     left join users target on target.id = a.target_user_id
     order by a.created_at desc
     limit $1`,
    [limit]
  );
}
