import { config } from "../config.js";
import { log } from "../logger.js";
import { query, one } from "../db.js";
import { connection, pk } from "../chain/rpc.js";
import { uploadMetadata } from "../chain/metadata.js";
import { readFeeLock, sharesMatch, bureauShares } from "../chain/pump.js";
import { withTimeout } from "../util/retry.js";

/**
 * Takes a funded launch through to a verified coin.
 *
 * Nothing here trusts our own database: a launch only counts as done once the
 * chain shows the mint exists and the fee split is locked with the shares we
 * promised.
 */

interface FundedRow {
  id: string;
  agent_id: string;
  dev_buy_lamports: string;
  quoted_lamports: string;
  name: string;
  ticker: string;
  description: string;
  image_url: string | null;
  agent_wallet: string;
  links: { x?: string; telegram?: string };
  slug: string;
}

export async function processFundedLaunches(): Promise<void> {
  if (!config.LAUNCH_ENABLED) return;

  const { rows } = await query<FundedRow>(
    `SELECT l.id, l.agent_id, l.dev_buy_lamports, l.quoted_lamports,
            a.name, a.ticker, a.description, a.image_url, a.agent_wallet, a.links, a.slug
       FROM launches l JOIN agents a ON a.id = l.agent_id
      WHERE l.stage IN ('funded','creating','locking') AND l.expires_at > now() - interval '2 hours'
      ORDER BY l.created_at LIMIT 5`,
  );

  for (const row of rows) {
    try {
      await processOne(row);
    } catch (err) {
      log.error({ err, launchId: row.id }, "launch processing failed");
      await query(`UPDATE launches SET error = $2 WHERE id = $1`, [
        row.id, err instanceof Error ? err.message.slice(0, 400) : "unknown",
      ]);
    }
  }
}

async function processOne(row: FundedRow): Promise<void> {
  // Has the dev's money actually arrived?
  const balance = await connection.getBalance(pk(row.agent_wallet), "confirmed");
  const needed = Number(row.quoted_lamports) - 5_000_000; // allow for their network fee
  if (balance < needed) {
    log.debug({ launchId: row.id, balance, needed }, "waiting for funding");
    return;
  }

  const metadataUri = await uploadMetadata({
    name: row.name,
    symbol: row.ticker,
    description: row.description,
    imageUrl: row.image_url ?? undefined,
    twitter: row.links?.x,
    telegram: row.links?.telegram,
    website: `${config.PUBLIC_URL.replace(/\/api$/, "")}/#/agent/${row.slug}`,
    slug: row.slug,
  });

  const res = await withTimeout(
    () =>
      fetch(`${config.SIGNER_URL}/launch`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.SIGNER_TOKEN}` },
        body: JSON.stringify({
          agentId: row.agent_id,
          launchId: row.id,
          name: row.name,
          symbol: row.ticker,
          metadataUri,
          devBuyLamports: Number(row.dev_buy_lamports),
        }),
      }),
    180_000,
    "signer launch",
  );

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    log.warn({ launchId: row.id, status: res.status, body }, "signer could not complete the launch");
    return;
  }

  await query(`UPDATE agents SET metadata_uri = $2 WHERE id = $1`, [row.agent_id, metadataUri]).catch(() => {});
  await verifyLaunch(row.agent_id);
}

/**
 * The verifier. Reads the split back off the chain and only then calls a coin
 * live. A mismatch is loud: it means the coin exists without the promise.
 */
export async function verifyLaunch(agentId: string): Promise<boolean> {
  const agent = await one<{ mint: string | null; agent_wallet: string | null }>(
    `SELECT mint, agent_wallet FROM agents WHERE id = $1`,
    [agentId],
  );
  if (!agent?.mint || !agent.agent_wallet) return false;

  const state = await readFeeLock(agent.mint);
  const expected = bureauShares(agent.agent_wallet);

  if (!state.exists) {
    log.warn({ agentId, mint: agent.mint }, "no fee sharing config on chain yet");
    return false;
  }
  if (!sharesMatch(state.shareholders, expected)) {
    await query(
      `UPDATE agents SET fees_locked = false, status = 'halted', status_reason = $2 WHERE id = $1`,
      [agentId, "fee split on chain does not match what was promised"],
    );
    log.error({ agentId, mint: agent.mint, onChain: state.shareholders }, "fee split mismatch — halting the agent");
    return false;
  }
  if (!state.locked) {
    log.warn({ agentId, mint: agent.mint }, "fee split is set but not locked yet");
    return false;
  }

  await query(
    `UPDATE agents SET fees_locked = true, status = 'asleep_fees', status_reason = NULL WHERE id = $1 AND status IN ('launching','pending')`,
    [agentId],
  );
  await query(`UPDATE launches SET stage = 'verified' WHERE agent_id = $1`, [agentId]);
  log.info({ agentId, mint: agent.mint }, "launch verified on chain");
  return true;
}

/** Launches nobody funded in time stop blocking the slug and the wallet. */
export async function expireStaleLaunches(): Promise<void> {
  const { rows } = await query<{ agent_id: string }>(
    `UPDATE launches SET stage = 'expired'
      WHERE stage = 'quoted' AND expires_at < now()
      RETURNING agent_id`,
  );
  for (const r of rows) {
    await query(`UPDATE agents SET status = 'failed', status_reason = 'not funded in time' WHERE id = $1 AND status = 'pending'`, [r.agent_id]);
  }
  if (rows.length) log.info({ count: rows.length }, "expired unfunded launches");
}
