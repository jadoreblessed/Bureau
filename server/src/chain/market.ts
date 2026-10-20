import { connection, pk } from "./rpc.js";
import { online, bondingCurvePda } from "./pump.js";
import { log } from "../logger.js";
import { withTimeout, retry } from "../util/retry.js";

/**
 * Market facts about a coin. Dexscreener is the quick public source; the
 * bonding curve is read straight off the chain, which is authoritative for
 * anything the agent sizes a decision against.
 */

export interface Market {
  priceUsd: number;
  marketCapUsd: number;
  volume1hUsd: number;
  liquidityUsd: number;
  priceChange1h: number;
  /** Quote-side reserve, in lamports. The policy engine sizes impact on this. */
  poolReserveLamports: number;
  bondingPct: number;
  graduated: boolean;
  solUsd: number;
}

const EMPTY: Market = {
  priceUsd: 0, marketCapUsd: 0, volume1hUsd: 0, liquidityUsd: 0,
  priceChange1h: 0, poolReserveLamports: 0, bondingPct: 0, graduated: false, solUsd: 0,
};

export async function solUsdPrice(): Promise<number> {
  try {
    const res = await withTimeout(
      () => fetch("https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112"),
      10_000,
      "solusd",
    );
    if (!res.ok) return 0;
    const json = (await res.json()) as { pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number } }> };
    const best = (json.pairs ?? []).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    return Number(best?.priceUsd ?? 0);
  } catch {
    return 0;
  }
}

/** Bonding curve progress and reserves, read from the chain. */
export async function curveState(mint: string): Promise<{ bondingPct: number; graduated: boolean; reserveLamports: number }> {
  try {
    const curve = await retry(() => online.fetchBondingCurve(pk(mint)), { label: "fetchBondingCurve", attempts: 2 });
    if (!curve) return { bondingPct: 100, graduated: true, reserveLamports: 0 };
    const complete = curve.complete;
    const realSol = Number(curve.realQuoteReserves.toString());
    const virtualSol = Number(curve.virtualQuoteReserves.toString());
    const realToken = Number(curve.realTokenReserves.toString());
    const initialToken = Number(curve.tokenTotalSupply.toString());
    const sold = initialToken > 0 ? 1 - realToken / initialToken : 0;
    return {
      bondingPct: complete ? 100 : Math.max(0, Math.min(99, Math.round(sold * 100))),
      graduated: complete,
      reserveLamports: virtualSol || realSol,
    };
  } catch (err) {
    log.debug({ err, mint }, "curve read failed");
    // The curve account is gone once a coin graduates to the AMM.
    return { bondingPct: 100, graduated: true, reserveLamports: 0 };
  }
}

export async function getMarket(mint: string): Promise<Market> {
  if (!mint) return EMPTY;
  const [dex, curve, solUsd] = await Promise.all([
    fetchDexscreener(mint),
    curveState(mint),
    solUsdPrice(),
  ]);

  // On the curve the chain is authoritative for the reserve; after graduation
  // fall back to the pool's quote-side liquidity.
  const poolReserveLamports =
    curve.reserveLamports > 0
      ? curve.reserveLamports
      : solUsd > 0
        ? Math.round((dex.liquidityUsd / 2 / solUsd) * 1_000_000_000)
        : 0;

  return {
    ...dex,
    ...curve,
    poolReserveLamports,
    solUsd,
  };
}

async function fetchDexscreener(mint: string) {
  try {
    const res = await withTimeout(() => fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`), 10_000, "dexscreener");
    if (!res.ok) return { priceUsd: 0, marketCapUsd: 0, volume1hUsd: 0, liquidityUsd: 0, priceChange1h: 0 };
    const json = (await res.json()) as {
      pairs?: Array<{
        priceUsd?: string; fdv?: number; marketCap?: number;
        volume?: { h1?: number }; liquidity?: { usd?: number }; priceChange?: { h1?: number };
      }>;
    };
    const best = (json.pairs ?? []).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (!best) return { priceUsd: 0, marketCapUsd: 0, volume1hUsd: 0, liquidityUsd: 0, priceChange1h: 0 };
    return {
      priceUsd: Number(best.priceUsd ?? 0),
      marketCapUsd: best.marketCap ?? best.fdv ?? 0,
      volume1hUsd: best.volume?.h1 ?? 0,
      liquidityUsd: best.liquidity?.usd ?? 0,
      priceChange1h: best.priceChange?.h1 ?? 0,
    };
  } catch {
    return { priceUsd: 0, marketCapUsd: 0, volume1hUsd: 0, liquidityUsd: 0, priceChange1h: 0 };
  }
}

/** Holder count and the biggest balances, straight from the token program. */
export async function holders(mint: string): Promise<{ count: number; top: Array<{ address: string; pct: number }> }> {
  try {
    const largest = await connection.getTokenLargestAccounts(pk(mint));
    const supply = await connection.getTokenSupply(pk(mint));
    const total = Number(supply.value.amount);
    const top = largest.value.slice(0, 10).map((a) => ({
      address: a.address.toBase58(),
      pct: total > 0 ? Math.round((Number(a.amount) / total) * 10_000) / 100 : 0,
    }));
    // getProgramAccounts is heavy; the top-20 call gives a floor on the count.
    return { count: largest.value.length, top };
  } catch (err) {
    log.debug({ err, mint }, "holder read failed");
    return { count: 0, top: [] };
  }
}

export { bondingCurvePda };
