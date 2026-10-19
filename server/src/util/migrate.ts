import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, query, closeDb } from "../db.js";
import { log } from "../logger.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

async function main() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set((await query<{ name: string }>(`SELECT name FROM schema_migrations`)).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      log.info({ file }, "migration applied");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      log.error({ err, file }, "migration failed");
      throw err;
    } finally {
      client.release();
    }
  }
  log.info({ count: files.length }, "database up to date");
  await closeDb();
}

main().catch((err) => {
  log.error({ err }, "migrate failed");
  process.exit(1);
});
