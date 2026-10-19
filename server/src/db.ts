import pg from "pg";
import { config } from "./config.js";
import { log } from "./logger.js";

/**
 * Postgres access. Plain SQL on a pooled client — migrations live in
 * migrations/*.sql and run through `npm run migrate`.
 *
 * Money columns are bigint. node-postgres hands bigint back as a string so no
 * value is silently truncated through a float; parse with BigInt() where the
 * exact number matters, Number() only for display.
 */
const { Pool, types } = pg;

// numeric -> number for market caches (display only); bigint stays a string.
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(config.DATABASE_URL.includes("sslmode=require") ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on("error", (err) => log.error({ err }, "idle postgres client errored"));

export type Row = Record<string, unknown>;

export async function query<T extends Row = Row>(text: string, params: unknown[] = []) {
  const started = Date.now();
  try {
    const res = await pool.query(text, params);
    const ms = Date.now() - started;
    if (ms > 500) log.warn({ ms, text: text.slice(0, 120) }, "slow query");
    return res as unknown as { rows: T[]; rowCount: number };
  } catch (err) {
    log.error({ err, text: text.slice(0, 200) }, "query failed");
    throw err;
  }
}

/** First row or null. */
export async function one<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const { rows } = await query<T>(text, params);
  return rows[0] ?? null;
}

/** First row, or throw — for reads that must exist. */
export async function must<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T> {
  const row = await one<T>(text, params);
  if (!row) throw new Error("expected exactly one row, got none");
  return row;
}

/** Runs fn inside a transaction, rolling back on any throw. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cooperative lock so several workers can run the same job safely.
 * Returns false when someone else holds it and their lease has not expired.
 */
export async function takeLock(name: string, owner: string, ttlSeconds: number): Promise<boolean> {
  const { rowCount } = await query(
    `INSERT INTO job_locks (name, locked_by, locked_at, expires_at)
       VALUES ($1, $2, now(), now() + make_interval(secs => $3))
     ON CONFLICT (name) DO UPDATE
       SET locked_by = EXCLUDED.locked_by,
           locked_at = now(),
           expires_at = EXCLUDED.expires_at
       WHERE job_locks.expires_at < now()`,
    [name, owner, ttlSeconds],
  );
  return rowCount > 0;
}

export async function releaseLock(name: string, owner: string): Promise<void> {
  await query(`DELETE FROM job_locks WHERE name = $1 AND locked_by = $2`, [name, owner]);
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

/** Fails fast at boot if the database is unreachable or not migrated. */
export async function assertDbReady(): Promise<void> {
  await query("SELECT 1");
  const t = await one<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agents') AS exists`,
  );
  if (!t?.exists) throw new Error("database is not migrated — run: npm run migrate");
}
