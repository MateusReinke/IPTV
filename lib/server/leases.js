import { query, queryOne, queryRows } from './db';

// A "lease" is one open picture. Multiview opens several; the ordinary player
// opens one. The plan's screen count is enforced here, which is what makes the
// paywall real rather than a hidden button - two browser tabs on a free
// account hit the same limit.

// Generous enough to survive a paused tab or a slow network, short enough that
// closing a laptop frees the slot within a minute or so.
export const LEASE_TTL_SECONDS = 90;
export const HEARTBEAT_SECONDS = 30;

export async function activeLeases(userId) {
  return queryRows(
    `select tile_id, label, created_at, last_seen_at
     from stream_leases
     where user_id = $1 and last_seen_at > now() - ($2 || ' seconds')::interval
     order by created_at`,
    [userId, String(LEASE_TTL_SECONDS)]
  );
}

async function countOtherLeases(userId, tileId) {
  const row = await queryOne(
    `select count(*)::int as total
     from stream_leases
     where user_id = $1
       and tile_id <> $2
       and last_seen_at > now() - ($3 || ' seconds')::interval`,
    [userId, tileId, String(LEASE_TTL_SECONDS)]
  );
  return row?.total || 0;
}

// Takes or refreshes the slot for one tile. Returns null when the plan is
// already at its limit, so the caller can answer 402 with an upgrade prompt.
export async function claimLease(userId, tileId, label, screens) {
  const others = await countOtherLeases(userId, tileId);
  if (others >= screens) return null;

  await query(
    `insert into stream_leases (user_id, tile_id, label)
     values ($1, $2, $3)
     on conflict (user_id, tile_id)
     do update set last_seen_at = now(), label = excluded.label`,
    [userId, tileId, label ? String(label).slice(0, 160) : null]
  );

  return { tileId, used: others + 1, screens };
}

export async function releaseLease(userId, tileId) {
  await query('delete from stream_leases where user_id = $1 and tile_id = $2', [userId, tileId]);
}

export async function releaseAllLeases(userId) {
  await query('delete from stream_leases where user_id = $1', [userId]);
}

// Housekeeping for rows whose client vanished. Cheap enough to run on the
// lease path; there is no cron in a single-container deploy.
export async function pruneExpiredLeases() {
  await query(
    `delete from stream_leases where last_seen_at < now() - ($1 || ' seconds')::interval`,
    [String(LEASE_TTL_SECONDS * 20)]
  );
}
