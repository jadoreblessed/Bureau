import { config } from "../config.js";
import { log } from "../logger.js";
import { query } from "../db.js";
import { wake } from "../agent/runtime.js";

/**
 * Picks the agents whose turn it is and runs their wake, a few at a time so a
 * busy agent never holds up the rest.
 */

const CONCURRENCY = 3;

export async function runDueWakes(): Promise<void> {
  if (!config.OPENROUTER_API_KEY) return;

  // Claim the rows first so two workers cannot wake the same agent.
  const { rows } = await query<{ id: string }>(
    `UPDATE agents SET next_wake_at = now() + make_interval(mins => $2)
      WHERE id IN (
        SELECT id FROM agents
         WHERE status = 'awake' AND NOT paused_by_dev AND mint IS NOT NULL
           AND next_wake_at IS NOT NULL AND next_wake_at <= now()
         ORDER BY next_wake_at ASC LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id`,
    [CONCURRENCY, config.WAKE_INTERVAL_MIN],
  );

  if (!rows.length) return;
  log.info({ count: rows.length }, "waking agents");

  await Promise.allSettled(
    rows.map((r) =>
      wake(r.id, "scheduled").catch((err) => log.warn({ err, agentId: r.id }, "wake threw")),
    ),
  );
}

/** First wake, right after a coin earns enough to come online. */
export async function runFirstWakes(): Promise<void> {
  if (!config.OPENROUTER_API_KEY) return;
  const { rows } = await query<{ id: string }>(
    `UPDATE agents SET next_wake_at = now() + make_interval(mins => $1)
      WHERE id IN (
        SELECT id FROM agents
         WHERE status = 'awake' AND wake_count = 0 AND NOT paused_by_dev AND mint IS NOT NULL
         ORDER BY created_at LIMIT 2 FOR UPDATE SKIP LOCKED
      ) RETURNING id`,
    [config.WAKE_INTERVAL_MIN],
  );
  for (const r of rows) {
    await wake(r.id, "first").catch((err) => log.warn({ err, agentId: r.id }, "first wake failed"));
  }
}
