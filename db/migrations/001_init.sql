-- Accounts, subscriptions and the server-side library.
-- Everything the paid product needs lives here; the Xtream credentials
-- themselves stay inside the (encrypted) library payload.

create extension if not exists "pgcrypto";

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  name text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  disabled_at timestamptz
);

-- Emails are compared case-insensitively; the stored value keeps the casing
-- the user typed.
create unique index users_email_lower_key on users (lower(email));
create index users_created_at_idx on users (created_at);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  -- Only the hash is stored: a database leak must not hand out live sessions.
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

create table subscriptions (
  user_id uuid primary key references users (id) on delete cascade,
  plan text not null default 'trial',
  status text not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_status_idx on subscriptions (status);
create unique index subscriptions_provider_sub_key
  on subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

-- One encrypted blob per account: playlists, favorites and watch history.
-- The server can decrypt it (unlike the old sync-code design) because the
-- account, not a memorised code, is now the unit of identity - so it is
-- encrypted at rest with APP_ENCRYPTION_KEY instead.
create table libraries (
  user_id uuid primary key references users (id) on delete cascade,
  iv bytea not null,
  payload bytea not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Concurrency control for the multiview paywall. One row per open tile;
-- rows go stale when the heartbeat stops.
create table stream_leases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  tile_id text not null,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index stream_leases_user_tile_key on stream_leases (user_id, tile_id);
create index stream_leases_last_seen_idx on stream_leases (last_seen_at);

-- Provider webhooks are replayed on failure; the primary key makes handling
-- idempotent.
create table billing_events (
  id text primary key,
  provider text not null,
  type text,
  payload jsonb,
  received_at timestamptz not null default now()
);

create table password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users (id) on delete set null,
  action text not null,
  target_user_id uuid references users (id) on delete set null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_created_idx on admin_audit (created_at desc);
