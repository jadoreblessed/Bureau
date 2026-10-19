/** Lamport helpers. All money math stays in integers. */
export const LAMPORTS_PER_SOL = 1_000_000_000;

export const solToLamports = (sol: number): number => Math.round(sol * LAMPORTS_PER_SOL);
export const lamportsToSol = (lamports: number): number => lamports / LAMPORTS_PER_SOL;

export const fmtSol = (lamports: number, dp = 4): string => lamportsToSol(lamports).toFixed(dp).replace(/\.?0+$/, "");

/** Split an amount by basis points without losing lamports to rounding. */
export function splitByBps(total: number, shares: number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) throw new Error(`shares must total 10000 bps, got ${sum}`);
  const out = shares.map((bps) => Math.floor((total * bps) / 10_000));
  // give the dust to the largest share so the parts always add back to total
  const assigned = out.reduce((a, b) => a + b, 0);
  const remainder = total - assigned;
  if (remainder > 0) {
    let biggest = 0;
    for (let i = 1; i < shares.length; i++) if ((shares[i] ?? 0) > (shares[biggest] ?? 0)) biggest = i;
    out[biggest] = (out[biggest] ?? 0) + remainder;
  }
  return out;
}

export const bpsOf = (amount: number, bps: number): number => Math.floor((amount * bps) / 10_000);

/** Price impact of taking `amountIn` against a constant-product reserve, in bps. */
export function priceImpactBps(amountIn: number, reserveIn: number): number {
  if (reserveIn <= 0) return 10_000;
  return Math.min(10_000, Math.round((amountIn / (reserveIn + amountIn)) * 10_000));
}
