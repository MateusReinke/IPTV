import { queryOne } from './db';

// Settings the app generates for itself the first time it needs them, so a
// fresh deploy works without hand-written secrets. The insert is
// `on conflict do nothing` followed by a read, so several instances booting at
// once still converge on one value.

const cache = new Map();

export async function getOrCreateSetting(key, generate) {
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await queryOne('select value from app_settings where key = $1', [key]);
  if (existing) {
    cache.set(key, existing.value);
    return existing.value;
  }

  await queryOne(
    `insert into app_settings (key, value) values ($1, $2)
     on conflict (key) do nothing
     returning value`,
    [key, generate()]
  );

  // Re-read rather than trusting the insert: another instance may have won.
  const row = await queryOne('select value from app_settings where key = $1', [key]);
  if (!row) throw new Error(`Nao foi possivel gravar a configuracao "${key}"`);
  cache.set(key, row.value);
  return row.value;
}
