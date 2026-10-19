/**
 * The policy engine.
 *
 * Every move an agent proposes passes through `check` before anything is
 * signed. It is deterministic and has no I/O: the caller gathers the facts,
 * this decides. An agent cannot reach it, argue with it or change its limits.
 *
 * The rule of the house: when a fact is missing, refuse.
 */

export type IntentKind = "buyback" | "sell" | "burn" | "swap" | "airdrop" | "fund_credits" | "transfer";

export const FINANCIAL: readonly IntentKind[] = ["buyback", "sell", "burn", "swap", "airdrop", "fund_credits", "transfer"];

export interface Intent {
  kind: IntentKind;
  /** Lamports leaving the agent wallet. Burns of owned tokens spend nothing. */
  amountLamports: number;
  /** Mint being bought, sold or swapped into, when the move touches one. */
  mint?: string;
  /** Destination, for transfers and airdrops. */
  destination?: string;
  /** Expected slippage the agent accepts, in bps. */
  slippageBps?: number;
  /** Quote-side reserve of the pool being hit, for the impact estimate. */
  poolReserveLamports?: number;
}

export interface Limits {
  maxPerMoveLamports: number;
  maxPerHourLamports: number;
  maxPerDayLamports: number;
  reserveFloorLamports: number;
  maxPriceImpactBps: number;
  maxSlippageBps: number;
  /** Empty means "nothing but its own coin". */
  allowedAssets: string[];
  tradingEnabled: boolean;
  payoutsEnabled: boolean;
  burnsEnabled: boolean;
}

export interface Context {
  /** Global kill switch. False refuses every financial move. */
  moneyEnabled: boolean;
  agentBalanceLamports: number;
  /** Confirmed spend in the trailing hour and day. */
  spentLastHourLamports: number;
  spentLastDayLamports: number;
  /** Confirmed spend across the whole deployment, ever. For a bounded test. */
  totalSpentLamports: number;
  /** 0 means no ceiling. Above 0, the platform can never spend past this total. */
  maxTotalLamports: number;
  limits: Limits;
  /** The agent's own coin; always allowed to buy back and burn. */
  ownMint: string;
  /** Agents that are paused or asleep may not act at all. */
  agentActive: boolean;
}

export type Decision =
  | { ok: true; intent: Intent }
  | { ok: false; rule: string; reason: string };

const refuse = (rule: string, reason: string): Decision => ({ ok: false, rule, reason });

/** Price impact of taking `amountIn` against a constant-product reserve, in bps. */
export function priceImpactBps(amountIn: number, reserveIn: number): number {
  if (reserveIn <= 0) return 10_000;
  return Math.min(10_000, Math.round((amountIn / (reserveIn + amountIn)) * 10_000));
}

export function check(intent: Intent, ctx: Context): Decision {
  // ---- shape -------------------------------------------------------------
  if (!FINANCIAL.includes(intent.kind)) {
    return refuse("unknown_kind", `${intent.kind} is not a financial intent the engine knows`);
  }
  const amount = intent.amountLamports;
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    return refuse("bad_amount", "amount must be a non-negative whole number of lamports");
  }

  // ---- switches ----------------------------------------------------------
  if (!ctx.moneyEnabled) {
    return refuse("money_disabled", "moving funds is switched off for this deployment");
  }
  if (!ctx.agentActive) {
    return refuse("agent_inactive", "the agent is paused or asleep");
  }

  const { limits } = ctx;
  if ((intent.kind === "swap" || intent.kind === "sell" || intent.kind === "buyback") && !limits.tradingEnabled) {
    return refuse("trading_disabled", "trading is not enabled for this agent");
  }
  if (intent.kind === "airdrop" && !limits.payoutsEnabled) {
    return refuse("payouts_disabled", "payouts are not enabled for this agent");
  }
  if (intent.kind === "burn" && !limits.burnsEnabled) {
    return refuse("burns_disabled", "burns are not enabled for this agent");
  }

  // ---- asset allowlist ---------------------------------------------------
  if (intent.mint && intent.mint !== ctx.ownMint && !limits.allowedAssets.includes(intent.mint)) {
    return refuse("asset_not_allowed", `${intent.mint} is not on the approved asset list`);
  }
  if (intent.kind === "transfer") {
    // The agent may only ever move funds to itself; paying people happens
    // through airdrop, which pays a snapshot rather than an address it picked.
    return refuse("transfer_forbidden", "free transfers are never allowed; use airdrop");
  }
  if (intent.kind === "airdrop" && intent.destination) {
    return refuse("airdrop_destination", "airdrops pay a snapshot, not a chosen address");
  }

  // ---- amount caps -------------------------------------------------------
  if (amount > limits.maxPerMoveLamports) {
    return refuse("cap_per_move", `${amount} exceeds the per-move cap of ${limits.maxPerMoveLamports}`);
  }
  if (ctx.spentLastHourLamports + amount > limits.maxPerHourLamports) {
    return refuse("cap_per_hour", `would exceed the hourly cap of ${limits.maxPerHourLamports}`);
  }
  if (ctx.spentLastDayLamports + amount > limits.maxPerDayLamports) {
    return refuse("cap_per_day", `would exceed the daily cap of ${limits.maxPerDayLamports}`);
  }
  // Deployment-wide ceiling. Set it low for a bounded test and nothing the
  // agents do, however many there are, can spend past it.
  if (ctx.maxTotalLamports > 0 && ctx.totalSpentLamports + amount > ctx.maxTotalLamports) {
    return refuse("cap_total", `would exceed the deployment spend ceiling of ${ctx.maxTotalLamports}`);
  }

  // ---- balance and reserve ----------------------------------------------
  if (amount > ctx.agentBalanceLamports) {
    return refuse("insufficient_balance", "the agent does not hold that much");
  }
  if (ctx.agentBalanceLamports - amount < limits.reserveFloorLamports) {
    return refuse("reserve_floor", `would spend through the reserve floor of ${limits.reserveFloorLamports}`);
  }

  // ---- execution quality -------------------------------------------------
  if (intent.slippageBps !== undefined && intent.slippageBps > limits.maxSlippageBps) {
    return refuse("slippage", `slippage ${intent.slippageBps}bps above the ${limits.maxSlippageBps}bps limit`);
  }
  if (amount > 0 && (intent.kind === "buyback" || intent.kind === "sell" || intent.kind === "swap")) {
    if (intent.poolReserveLamports === undefined) {
      return refuse("impact_unknown", "refusing a trade without a pool reserve to size it against");
    }
    const impact = priceImpactBps(amount, intent.poolReserveLamports);
    if (impact > limits.maxPriceImpactBps) {
      return refuse("price_impact", `price impact ${impact}bps above the ${limits.maxPriceImpactBps}bps limit`);
    }
  }

  return { ok: true, intent };
}

export const DEFAULT_LIMITS: Limits = {
  maxPerMoveLamports: 200_000_000,
  maxPerHourLamports: 500_000_000,
  maxPerDayLamports: 2_000_000_000,
  reserveFloorLamports: 50_000_000,
  maxPriceImpactBps: 300,
  maxSlippageBps: 150,
  allowedAssets: [],
  tradingEnabled: false,
  payoutsEnabled: false,
  burnsEnabled: false,
};
