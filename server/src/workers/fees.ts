import { config } from "../config.js";
import { log } from "../logger.js";
import { query, one } from "../db.js";
import { sweepAndDistribute, pendingCreatorFees } from "../chain/pump.js";
import { splitByBps } from "../util/money.js";

/**
 * Creator fees.
 *
 * The split is enforced on chain by Pump, so this worker does not move money
 * between wallets — it triggers the permissionless distribution and writes down
 * what happened. The ledger mirrors the chain; it never decides anything.
 */

const MIN_CLAIM_LAMPORTS = 2_000_000; // 0.002 SOL — below this the fee costs more than it pays

export async function claimFees(): Promise<void> {
  const { rows } = await query<{ id: string; mint: string; graduated: boolean; pair_symbol: string }>(
    `SELECT id, mint, graduated, pair_symbol FROM agents
      WHERE mint IS NOT NULL AND fees_locked AND status NOT IN ('pending','failed')
      ORDER BY last_wake_at NULLS FIRST LIMIT 25`,
  );

  for (const agent of rows) {
    try {
      const pending = await pendingCreatorFees(agent.mint);
      if (pending < MIN_CLAIM_LAMPORTS) continue;

      const res = await sweepAndDistribute({ mint: agent.mint, graduated: agent.graduated });
      if (!res.distributed) continue;
      // book what the chain says moved, not what the vault seemed to hold
      const gross = res.movedLamports;

      const signature = res.signatures.at(-1);
      const [toAgent, toPlatform, toCredits, toBurn] = splitByBps(gross, [
        config.SHARE_AGENT_BPS, config.SHARE_PLATFORM_BPS, config.SHARE_CREDITS_BPS, config.SHARE_BUYBACK_BPS,
      ]);

      await query(
        `INSERT INTO ledger (agent_id, entry, amount_lamports, signature, meta)
         VALUES ($1,'fee_claim',$2,$3,$4)
         ON CONFLICT (signature, entry) WHERE signature IS NOT NULL DO NOTHING`,
        [agent.id, toAgent, signature ?? null, JSON.stringify({ gross, toPlatform, toCredits, toBurn })],
      );
      await query(`UPDATE agents SET fees_earned_lamports = fees_earned_lamports + $2 WHERE id = $1`, [agent.id, toAgent]);

      log.info({ agentId: agent.id, gross, toAgent, signature }, "creator fees distributed");
      await maybeWake(agent.id);
    } catch (err) {
      log.warn({ err, agentId: agent.id }, "fee claim failed");
    }
  }
}

/** The $20 rule: the first fees buy thinking time and the agent comes online. */
async function maybeWake(agentId: string): Promise<void> {
  const row = await one<{ fees_earned_lamports: string; status: string; mcap_usd: number }>(
    `SELECT fees_earned_lamports, status, mcap_usd FROM agents WHERE id = $1`,
    [agentId],
  );
  if (!row || row.status !== "asleep_fees") return;

  // Converted at the SOL price the market worker last saw; a rough gate is fine
  // because the agent re-checks its own balance on every wake.
  const solUsd = Number((await one<{ v: string }>(`SELECT value AS v FROM platform_kv WHERE key = 'sol_usd'`, []))?.v ?? 0);
  if (!solUsd) return;
  const earnedUsd = (Number(row.fees_earned_lamports) / 1e9) * solUsd;
  if (earnedUsd < config.WAKE_THRESHOLD_USD) return;

  await query(
    `UPDATE agents SET status = 'awake', status_reason = NULL, next_wake_at = now() WHERE id = $1`,
    [agentId],
  );
  log.info({ agentId, earnedUsd: Math.round(earnedUsd) }, "agent woke for the first time");
}
