-- Login com provedores OAuth (Google por enquanto). password_hash fica
-- opcional porque uma conta criada via Google nao tem senha.
alter table users alter column password_hash drop not null;

create table oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  created_at timestamptz not null default now()
);

create unique index oauth_accounts_provider_key on oauth_accounts (provider, provider_account_id);
create index oauth_accounts_user_idx on oauth_accounts (user_id);
