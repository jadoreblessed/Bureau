import { config } from "../config.js";
import { one, query } from "../db.js";
import { getSolBalance } from "../chain/rpc.js";
import { DEFAULT_LIMITS, type Context, type Limits } from "./engine.js";

interface PolicyRow {
  max_per_move_lamports: string;
  max_per_hour_lamports: string;
  max_per_day_lamports: string;
  reserve_floor_lamports: string;
  max_price_impact_bps: number;
  max_slippage_bps: number;
  allowed_assets: string[];
  trading_enabled: boolean;
  payouts_enabled: boolean;
  burns_enabled: boolean;
}

interface AgentRow {
  id: string;
  mint: string | null;
  agent_wallet: string | null;
  status: string;
  paused_by_dev: boolean;
}

export async function loadLimits(agentId: string): Promise<Limits> {
  const row = await one<PolicyRow>(`SELECT * FROM agent_policy WHERE agent_id = $1`, [agentId]);
  if (!row) return { ...DEFAULT_LIMITS };
  return {
    maxPerMoveLamports: Number(row.max_per_move_lamports),
    maxPerHourLamports: Number(row.max_per_hour_lamports),
    maxPerDayLamports: Number(row.max_per_day_lamports),
    reserveFloorLamports: Number(row.reserve_floor_lamports),
    maxPriceImpactBps: row.max_price_impact_bps,
    maxSlippageBps: row.max_slippage_bps,
    allowedAssets: row.allowed_assets ?? [],
    tradingEnabled: row.trading_enabled,
    payoutsEnabled: row.payouts_enabled,
    burnsEnabled: row.burns_enabled,
  };
}

/** Creates the default row the first time an agent is launched. */
export async function ensurePolicy(agentId: string): Promise<void> {
  await query(
    `INSERT INTO agent_policy (agent_id, max_per_move_lamports, max_per_hour_lamports,
       max_per_day_lamports, reserve_floor_lamports, max_price_impact_bps)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (agent_id) DO NOTHING`,
    [
      agentId,
      config.DEFAULT_MAX_PER_MOVE_LAMPORTS,
      config.DEFAULT_MAX_PER_HOUR_LAMPORTS,
      config.DEFAULT_MAX_PER_DAY_LAMPORTS,
      config.DEFAULT_RESERVE_FLOOR_LAMPORTS,
      config.DEFAULT_MAX_PRICE_IMPACT_BPS,
    ],
  );
}

/**
 * Spend in the trailing windows, counted from confirmed intents only.
 * A proposal that never settled never cost anything, so it never counts.
 */
export async function spentWindows(agentId: string): Promise<{ hour: number; day: number }> {
  const row = await one<{ hour: string | null; day: string | null }>(
    `SELECT
       COALESCE(SUM(amount_lamports) FILTER (WHERE confirmed_at > now() - interval '1 hour'), 0) AS hour,
       COALESCE(SUM(amount_lamports) FILTER (WHERE confirmed_at > now() - interval '1 day'), 0)  AS day
     FROM intents
     WHERE agent_id = $1 AND status = 'confirmed'`,
    [agentId],
  );
  return { hour: Number(row?.hour ?? 0), day: Number(row?.day ?? 0) };
}

/** Confirmed spend across every agent, ever. Backs the deployment ceiling. */
export async function totalSpent(): Promise<number> {
  const row = await one<{ total: string | null }>(
    `SELECT COALESCE(SUM(amount_lamports), 0) AS total FROM intents WHERE status = 'confirmed'`,
  );
  return Number(row?.total ?? 0);
}

/**
 * Gathers everything the engine needs. The balance is read from the chain,
 * not from our books: the chain is the only authority on what exists.
 */
export async function buildContext(agentId: string): Promise<Context> {
  const agent = await one<AgentRow>(
    `SELECT id, mint, agent_wallet, status, paused_by_dev FROM agents WHERE id = $1`,
    [agentId],
  );
  if (!agent) throw new Error(`unknown agent ${agentId}`);

  const [limits, spent, total, balance] = await Promise.all([
    loadLimits(agentId),
    spentWindows(agentId),
    config.MAX_TOTAL_SPEND_LAMPORTS > 0 ? totalSpent() : Promise.resolve(0),
    agent.agent_wallet ? getSolBalance(agent.agent_wallet).catch(() => 0) : Promise.resolve(0),
  ]);

  return {
    moneyEnabled: config.MONEY_ENABLED,
    agentBalanceLamports: balance,
    spentLastHourLamports: spent.hour,
    spentLastDayLamports: spent.day,
    totalSpentLamports: total,
    maxTotalLamports: config.MAX_TOTAL_SPEND_LAMPORTS,
    limits,
    ownMint: agent.mint ?? "",
    agentActive: agent.status === "awake" && !agent.paused_by_dev,
  };
}
