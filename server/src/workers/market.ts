import { config } from "../config.js";
import { log } from "../logger.js";
import { query } from "../db.js";
import { getMarket, holders, solUsdPrice } from "../chain/market.js";

/**
 * Keeps the numbers the site shows in step with the chain, and moves agents
 * between awake and asleep as their market cap crosses the floor.
 */
export async function refreshMarkets(): Promise<void> {
  const solUsd = await solUsdPrice();
  if (solUsd > 0) {
    await query(
      `INSERT INTO platform_kv (key, value, updated_at) VALUES ('sol_usd', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [String(solUsd)],
    );
  }

  const { rows } = await query<{ id: string; mint: string; status: string }>(
    `SELECT id, mint, status FROM agents
      WHERE mint IS NOT NULL AND status NOT IN ('pending','failed','halted')
      ORDER BY updated_at ASC LIMIT 40`,
  );

  for (const agent of rows) {
    try {
      const [market, hold] = await Promise.all([getMarket(agent.mint), holders(agent.mint)]);

      await query(
        `UPDATE agents SET mcap_usd = $2, vol_1h_usd = $3, holders = $4, bonding_pct = $5, graduated = $6, updated_at = now()
           WHERE id = $1`,
        [agent.id, market.marketCapUsd, market.volume1hUsd, hold.count, market.bondingPct, market.graduated],
      );

      // One snapshot per five-minute bucket; the unique index drops the rest.
      await query(
        `INSERT INTO market_snapshots (agent_id, price_usd, mcap_usd, vol_1h_usd, liquidity_usd, holders, bonding_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [agent.id, market.priceUsd, market.marketCapUsd, market.volume1hUsd, market.liquidityUsd, hold.count, market.bondingPct],
      );

      await applyFloor(agent.id, agent.status, market.marketCapUsd);
    } catch (err) {
      log.warn({ err, agentId: agent.id }, "market refresh failed");
    }
  }
}

/** Below the floor an agent sleeps; above it, it wakes again on its own. */
async function applyFloor(agentId: string, status: string, mcapUsd: number): Promise<void> {
  if (status === "awake" && mcapUsd > 0 && mcapUsd < config.MCAP_FLOOR_USD) {
    await query(
      `UPDATE agents SET status = 'asleep_floor', status_reason = 'market cap below the floor', next_wake_at = NULL
         WHERE id = $1 AND status = 'awake'`,
      [agentId],
    );
    log.info({ agentId, mcapUsd }, "agent asleep under the floor");
  } else if (status === "asleep_floor" && mcapUsd >= config.MCAP_FLOOR_USD) {
    await query(
      `UPDATE agents SET status = 'awake', status_reason = NULL, next_wake_at = now()
         WHERE id = $1 AND status = 'asleep_floor'`,
      [agentId],
    );
    log.info({ agentId, mcapUsd }, "agent woke back above the floor");
  }
}
