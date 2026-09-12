import { query, transaction } from './db';

// The free plan's AI pick quota: one every N days, enforced here because the
// browser is not a place to keep a counter.
//
// A pick is *reserved* before the recommender runs and released if it fails,
// so a provider outage cannot cost someone their fortnight - and two tabs
// clicking at the same instant cannot spend the same slot twice (the advisory
// lock serialises the check and the insert per account).

function cooldownDaysOf(entitlements) {
  const days = Number(entitlements?.features?.aiPickCooldownDays);
  return Number.isInteger(days) && days > 0 ? days : 0;
}

export function aiPicksUnlimited(entitlements) {
  return cooldownDaysOf(entitlements) === 0;
}

async function lastPickFor(run, userId, cooldownDays) {
  const { rows } = await run(
    `select created_at,
            created_at + ($2 || ' days')::interval as next_at,
            now() < created_at + ($2 || ' days')::interval as blocked
     from ai_picks
     where user_id = $1
     order by created_at desc
     limit 1`,
    [userId, String(cooldownDays)]
  );
  return rows[0] || null;
}

// Read-only view of the quota, for the dialog to explain itself before the
// user spends anything.
export async function aiPickStatus(userId, entitlements) {
  const cooldownDays = cooldownDaysOf(entitlements);
  if (cooldownDays === 0) {
    return { allowed: true, unlimited: true, cooldownDays: 0, lastUsedAt: null, nextAvailableAt: null };
  }
  // `query` has the same shape as the transaction runner, so the quota SQL
  // lives in one place.
  const last = await lastPickFor(query, userId, cooldownDays);
  return {
    allowed: !last || !last.blocked,
    unlimited: false,
    cooldownDays,
    lastUsedAt: last ? new Date(last.created_at).toISOString() : null,
    nextAvailableAt: last && last.blocked ? new Date(last.next_at).toISOString() : null,
  };
}

// Takes the slot. Returns the reservation id to hand back to
// `settleAiPick`/`releaseAiPick` once the recommender has answered.
export async function reserveAiPick({ userId, plan, kind, genre, entitlements }) {
  const cooldownDays = cooldownDaysOf(entitlements);

  return transaction(async (run) => {
    // Held until the transaction ends; scoped to this account, so one user's
    // burst never blocks another's.
    await run('select pg_advisory_xact_lock(hashtext($1))', [`ai_pick:${userId}`]);

    if (cooldownDays > 0) {
      const last = await lastPickFor(run, userId, cooldownDays);
      if (last && last.blocked) {
        return {
          ok: false,
          cooldownDays,
          nextAvailableAt: new Date(last.next_at).toISOString(),
        };
      }
    }

    const { rows } = await run(
      `insert into ai_picks (user_id, plan, kind, genre)
       values ($1, $2, $3, $4)
       returning id`,
      [userId, String(plan || 'free'), String(kind || 'movie'), genre ? String(genre).slice(0, 120) : null]
    );
    return { ok: true, id: rows[0].id, cooldownDays };
  });
}

// Records what the reservation produced. Best effort: the user already has
// their recommendation, and losing the audit row is not worth a 500.
export async function settleAiPick(id, { engine, pickName }) {
  if (!id) return;
  try {
    await query('update ai_picks set engine = $2, pick_name = $3 where id = $1', [
      id,
      engine ? String(engine).slice(0, 40) : null,
      pickName ? String(pickName).slice(0, 200) : null,
    ]);
  } catch (err) {
    console.error('[picks] failed to record pick', err.message);
  }
}

// Gives the slot back when nothing was recommended.
export async function releaseAiPick(id) {
  if (!id) return;
  try {
    await query('delete from ai_picks where id = $1', [id]);
  } catch (err) {
    console.error('[picks] failed to release reservation', err.message);
  }
}
