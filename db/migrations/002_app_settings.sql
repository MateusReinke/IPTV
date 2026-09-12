-- Server-side settings that the app can generate for itself on first boot,
-- so a deploy needs as little manual configuration as possible.
--
-- Only values that do not protect data at rest belong here: the stream token
-- secret authorises the proxy, it does not encrypt anything. The library
-- encryption key deliberately stays in the environment - keeping it next to
-- the ciphertext would defeat the point.

create table app_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
