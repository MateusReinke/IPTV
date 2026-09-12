-- Usage log for the AI pick ("indicacao da IA").
--
-- It exists to enforce the free plan's one-every-N-days quota, so the row is
-- written *before* the recommendation is produced (and deleted again if it
-- fails) - a quota that only counted successes could be spent by clicking
-- during an outage.
--
-- It doubles as the audit trail for what the recommender actually returned,
-- which is the only way to tell a bad prompt from a bad catalog later on.

create table ai_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  plan text not null,
  kind text not null default 'movie',
  genre text,
  -- Which provider answered: 'openai' / 'claude', or 'local' when the server
  -- fell back to its own ranking (no API key configured, or the call failed).
  engine text,
  pick_name text,
  created_at timestamptz not null default now()
);

-- The quota question is always "when did this user last spend one?".
create index ai_picks_user_created_idx on ai_picks (user_id, created_at desc);
