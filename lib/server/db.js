import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

// Postgres access plus a migration runner that fires on the first query.
//
// Running migrations in-process (behind an advisory lock) keeps deploys to a
// single step on platforms like Coolify, and stays safe when several app
// instances boot at once: only one holds the lock, the rest wait and find
// nothing left to apply.

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');
const MIGRATION_LOCK_KEY = 8123456789;

let pool;
let migrationPromise;

export function databaseUrl() {
  return process.env.DATABASE_URL || '';
}

export function databaseConfigured() {
  return !!databaseUrl();
}

function getPool() {
  if (pool) return pool;
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL nao configurada. Defina a conexao com o Postgres para usar contas e assinaturas.'
    );
  }
  pool = new pg.Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Managed Postgres (Neon, Supabase, RDS) terminates TLS with certificates
    // this container does not necessarily trust; opt in explicitly.
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  pool.on('error', (err) => {
    console.error('[db] idle client error', err.message);
  });
  return pool;
}

async function applyMigrations() {
  const client = await getPool().connect();
  try {
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      const applied = new Set(
        (await client.query('select name from schema_migrations')).rows.map((r) => r.name)
      );
      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        if (applied.has(file)) continue;
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        await client.query('begin');
        try {
          await client.query(sql);
          await client.query('insert into schema_migrations (name) values ($1)', [file]);
          await client.query('commit');
          console.log(`[db] applied migration ${file}`);
        } catch (err) {
          await client.query('rollback');
          throw new Error(`Falha na migracao ${file}: ${err.message}`);
        }
      }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = applyMigrations().catch((err) => {
      // Let the next request retry instead of poisoning the process.
      migrationPromise = undefined;
      throw err;
    });
  }
  return migrationPromise;
}

export async function query(text, params) {
  await ensureMigrated();
  return getPool().query(text, params);
}

export async function queryRows(text, params) {
  return (await query(text, params)).rows;
}

export async function queryOne(text, params) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

// Runs a set of statements in one transaction. The callback receives a
// client-bound `query` helper.
export async function transaction(run) {
  await ensureMigrated();
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await run((text, params) => client.query(text, params));
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
    migrationPromise = undefined;
  }
}
