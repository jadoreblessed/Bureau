import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import { createRequire } from "node:module";
import type * as PumpSdkModule from "@pump-fun/pump-sdk";
import type { BondingCurve, SharingConfig } from "@pump-fun/pump-sdk";
import { PUMP, WSOL_MINT, config } from "../config.js";
import { connection, payer, pk } from "./rpc.js";
import { log } from "../logger.js";
import { retry } from "../util/retry.js";

/**
 * Adapter over @pump-fun/pump-sdk (4.x).
 *
 * The SDK splits into an offline instruction builder (PumpSdk) and a reader
 * that talks to the chain (OnlinePumpSdk). If a future SDK release renames
 * something, this is the only file that needs touching — nothing else
 * imports the SDK.
 */
// Loaded through require: the SDK's ESM build imports named exports from
// @coral-xyz/anchor, a CommonJS package, which Node's ESM loader rejects at
// startup. Its CommonJS build loads fine.
const {
  OnlinePumpSdk,
  PumpSdk,
  canonicalPumpPoolPdaWithQuote,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
} = createRequire(import.meta.url)("@pump-fun/pump-sdk") as typeof PumpSdkModule;

export const sdk = new PumpSdk();
export const online = new OnlinePumpSdk(connection);

export const PUMP_PROGRAM = pk(PUMP.program);
export const PUMP_FEES_PROGRAM = pk(PUMP.fees);
export const PUMP_AMM_PROGRAM = pk(PUMP.amm);

/** PDA `[b"sharing-config", mint]` on the Pump Fees program. */
export function sharingConfigPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("sharing-config"), mint.toBuffer()], PUMP_FEES_PROGRAM)[0];
}

/** PDA `[b"bonding-curve", mint]` on the Pump program. */
export function bondingCurvePda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP_PROGRAM)[0];
}

async function fetchSharingConfig(address: PublicKey): Promise<SharingConfig | null> {
  const info = await connection.getAccountInfo(address, "confirmed").catch(() => null);
  return info ? sdk.decodeSharingConfig(info) : null;
}

/** The token program that owns a mint (Pump coins may be classic SPL or Token-2022). */
async function tokenProgramOf(mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info) throw new Error(`mint ${mint.toBase58()} not found`);
  return info.owner;
}

/** Tokens out for a SOL budget, leaving room for slippage: the budget is the cap, the amount is the floor. */
const withSlippage = (lamports: BN, slippageBps: number) => lamports.muln(10_000 - slippageBps).divn(10_000);

/** Create (+ optional dev buy in the same transaction) for a fresh SOL-paired coin. */
async function createIxs(a: {
  creator: PublicKey; user: PublicKey; mint: PublicKey; name: string; symbol: string; uri: string;
  devBuyLamports: number; slippageBps: number;
}): Promise<TransactionInstruction[]> {
  // create_v2 (Token-2022 mint); the legacy create is deprecated in the SDK.
  const base = { mint: a.mint, name: a.name, symbol: a.symbol, uri: a.uri, creator: a.creator, user: a.user, mayhemMode: false };
  if (a.devBuyLamports <= 0) return [await sdk.createV2Instruction(base)];
  const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig().catch(() => null)]);
  const solAmount = new BN(a.devBuyLamports);
  const amount = getBuyTokenAmountFromSolAmount({
    global, feeConfig, mintSupply: null, bondingCurve: null,
    amount: withSlippage(solAmount, a.slippageBps), quoteMint: pk(WSOL_MINT),
  });
  return sdk.createV2AndBuyInstructions({ ...base, global, amount, solAmount });
}

interface LiveCurve { curveInfo: import("@solana/web3.js").AccountInfo<Buffer>; bondingCurve: BondingCurve }
/** A coin still on its bonding curve. Graduated coins trade on the AMM, which is not wired here. */
async function liveCurve(mint: PublicKey): Promise<LiveCurve> {
  const curveInfo = await connection.getAccountInfo(bondingCurvePda(mint), "confirmed");
  if (!curveInfo) throw new Error("no bonding curve: the coin has graduated and AMM trades are not supported yet");
  const bondingCurve = sdk.decodeBondingCurve(curveInfo);
  if (bondingCurve.complete) throw new Error("bonding curve is complete: the coin is migrating to the AMM");
  return { curveInfo, bondingCurve };
}

/** Buy `lamports` worth of a curve coin for `user`. */
export async function buyInstructionsFor(opts: { mint: PublicKey; user: PublicKey; lamports: number; slippageBps: number }) {
  const [{ curveInfo, bondingCurve }, global, feeConfig, tokenProgram] = await Promise.all([
    liveCurve(opts.mint), online.fetchGlobal(), online.fetchFeeConfig().catch(() => null), tokenProgramOf(opts.mint),
  ]);
  const solAmount = new BN(opts.lamports);
  const amount = getBuyTokenAmountFromSolAmount({
    global, feeConfig, mintSupply: bondingCurve.tokenTotalSupply, bondingCurve,
    amount: withSlippage(solAmount, opts.slippageBps), quoteMint: bondingCurve.quoteMint,
  });
  const ata = getAssociatedTokenAddressSync(opts.mint, opts.user, true, tokenProgram);
  const ataInfo = await connection.getAccountInfo(ata, "confirmed").catch(() => null);
  return sdk.buyInstructions({
    global, bondingCurveAccountInfo: curveInfo, bondingCurve, associatedUserAccountInfo: ataInfo,
    mint: opts.mint, user: opts.user, amount, solAmount, slippage: opts.slippageBps / 100, tokenProgram,
  });
}

/** Sell `atoms` of a curve coin held by `user`. */
export async function sellInstructionsFor(opts: { mint: PublicKey; user: PublicKey; atoms: number; slippageBps: number }) {
  const [{ curveInfo, bondingCurve }, global, feeConfig, tokenProgram] = await Promise.all([
    liveCurve(opts.mint), online.fetchGlobal(), online.fetchFeeConfig().catch(() => null), tokenProgramOf(opts.mint),
  ]);
  const amount = new BN(opts.atoms);
  const solAmount = getSellSolAmountFromTokenAmount({ global, feeConfig, mintSupply: bondingCurve.tokenTotalSupply, bondingCurve, amount });
  return sdk.sellInstructions({
    global, bondingCurveAccountInfo: curveInfo, bondingCurve, mint: opts.mint, user: opts.user,
    amount, solAmount, slippage: opts.slippageBps / 100, tokenProgram, mayhemMode: bondingCurve.isMayhemMode,
  });
}

export interface Shareholder {
  address: string;
  shareBps: number;
}

/**
 * The split every BUREAU coin locks at launch.
 * Pump requires exactly 10000 bps across at most 10 wallets; config validates
 * the total at boot, so this cannot drift.
 */
export function bureauShares(agentWallet: string): Shareholder[] {
  const shares: Shareholder[] = [
    { address: agentWallet, shareBps: config.SHARE_AGENT_BPS },
    { address: config.PLATFORM_FEE_WALLET, shareBps: config.SHARE_PLATFORM_BPS },
    { address: config.CREDITS_WALLET, shareBps: config.SHARE_CREDITS_BPS },
    { address: config.BUYBACK_WALLET, shareBps: config.SHARE_BUYBACK_BPS },
  ].filter((s) => s.shareBps > 0);

  const total = shares.reduce((a, s) => a + s.shareBps, 0);
  if (total !== 10_000) throw new Error(`shares total ${total} bps, Pump requires exactly 10000`);
  if (shares.length > 10) throw new Error(`Pump allows at most 10 shareholders, got ${shares.length}`);
  const seen = new Set(shares.map((s) => s.address));
  if (seen.size !== shares.length) {
    throw new Error("duplicate shareholder wallet: set PLATFORM_FEE_WALLET, CREDITS_WALLET and BUYBACK_WALLET to different addresses");
  }
  return shares;
}

const withBudget = (ixs: TransactionInstruction[], units = 400_000, microLamports = 150_000) => [
  ComputeBudgetProgram.setComputeUnitLimit({ units }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ...ixs,
];

async function sendIxs(ixs: TransactionInstruction[], signers: Keypair[], label: string): Promise<string> {
  return retry(
    async () => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const msg = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: withBudget(ixs),
      }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([payer, ...signers]);
      const sig = await connection.sendTransaction(tx, { maxRetries: 3, skipPreflight: false });
      const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error(`${label} failed on chain: ${JSON.stringify(res.value.err)}`);
      log.info({ label, sig }, "transaction confirmed");
      return sig;
    },
    { label, attempts: 3 },
  );
}

/* ------------------------------------------------------------------ launch */

export interface CreateTokenArgs {
  creator: string;          // the dev's wallet; signs in their browser
  mint: Keypair;            // fresh mint keypair, generated server-side
  name: string;
  symbol: string;
  metadataUri: string;
  devBuyLamports: number;   // 0 for no dev buy
  slippageBps: number;
}

/**
 * Builds the create transaction for the dev to sign in their own wallet.
 * The server never holds the dev's key, so this comes back serialized and
 * the browser signs and sends it.
 */
export async function buildCreateTx(args: CreateTokenArgs): Promise<{ transaction: string; mint: string }> {
  const creator = pk(args.creator);
  const ixs = await createIxs({
    creator,
    user: creator,
    mint: args.mint.publicKey,
    name: args.name,
    symbol: args.symbol,
    uri: args.metadataUri,
    devBuyLamports: args.devBuyLamports,
    slippageBps: args.slippageBps,
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: blockhash,
    instructions: withBudget(ixs, 600_000),
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  // the mint must sign its own creation; the dev adds their signature in the browser
  tx.sign([args.mint]);

  return {
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    mint: args.mint.publicKey.toBase58(),
  };
}

/* ----------------------------------------------------- fee sharing + lock */

/**
 * Routes this coin's creator fees to the agent and locks the split forever.
 *
 * Two steps, both paid by the platform payer:
 *   1. create_fee_sharing_config — points the creator vault at a sharing config
 *   2. update_fee_shares_v2      — writes the final split, then Pump revokes
 *                                  the admin, so no one can ever change it
 *
 * Step 2 can only happen once per coin. After it lands, the 85% to the agent
 * is enforced by Pump's program, not by us.
 */
export async function lockFeeShares(opts: {
  mint: string;
  creator: Keypair;          // current coin creator; must sign
  shareholders: Shareholder[];
  quoteMint?: string;
  graduated?: boolean;
}): Promise<{ sharingConfig: string; signatures: string[] }> {
  const mint = pk(opts.mint);
  const quoteMint = pk(opts.quoteMint ?? WSOL_MINT);
  const sharingConfig = sharingConfigPda(mint);
  const signatures: string[] = [];

  const total = opts.shareholders.reduce((a, s) => a + s.shareBps, 0);
  if (total !== 10_000) throw new Error(`refusing to lock shares totalling ${total} bps`);

  // 1. opt in. Calling it twice is a no-op, so this is safe to retry.
  const createIx = await sdk.createFeeSharingConfig({
    creator: opts.creator.publicKey,
    mint,
    pool: opts.graduated ? canonicalPumpPoolPdaWithQuote(mint, quoteMint) : null,
  });
  signatures.push(await sendIxs([createIx], [opts.creator], "create_fee_sharing_config"));

  // 2. the one-time write. After this Pump sets admin_revoked = true.
  const updateIx = await sdk.updateFeeSharesV2({
    authority: opts.creator.publicKey,
    mint,
    currentShareholders: [opts.creator.publicKey],
    newShareholders: opts.shareholders.map((s) => ({ address: pk(s.address), shareBps: s.shareBps })),
    quoteMint,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
    bondingCurveComplete: Boolean(opts.graduated),
  });
  signatures.push(await sendIxs([updateIx], [opts.creator], "update_fee_shares_v2"));

  log.info({ mint: opts.mint, sharingConfig: sharingConfig.toBase58() }, "creator fee split locked on chain");
  return { sharingConfig: sharingConfig.toBase58(), signatures };
}

export interface FeeLockState {
  exists: boolean;
  locked: boolean;
  shareholders: Shareholder[];
}

/**
 * Reads the split back off the chain. Nothing is trusted from our own
 * database here — a coin only counts as verified once Pump says so.
 */
export async function readFeeLock(mint: string): Promise<FeeLockState> {
  const address = sharingConfigPda(pk(mint));
  const cfg = await fetchSharingConfig(address).catch(() => null);
  if (!cfg) return { exists: false, locked: false, shareholders: [] };
  return {
    exists: true,
    // Pump revokes the admin after the one-time update; that is the lock.
    locked: Boolean(cfg.adminRevoked),
    shareholders: (cfg.shareholders ?? []).map((s) => ({
      address: s.address.toBase58(),
      shareBps: s.shareBps,
    })),
  };
}

/** True when the chain agrees the agent holds the share we promised. */
export function sharesMatch(onChain: Shareholder[], expected: Shareholder[]): boolean {
  if (onChain.length !== expected.length) return false;
  const norm = (list: Shareholder[]) =>
    [...list].sort((a, b) => a.address.localeCompare(b.address)).map((s) => `${s.address}:${s.shareBps}`).join("|");
  return norm(onChain) === norm(expected);
}

/* --------------------------------------------------------- fee collection */

/**
 * Pays out everything the coin has earned. Both calls are permissionless, so
 * the platform payer can run them on a schedule for every coin.
 */
export async function sweepAndDistribute(opts: {
  mint: string;
  quoteMint?: string;
  graduated: boolean;
}): Promise<{ signatures: string[]; distributed: boolean }> {
  const mint = pk(opts.mint);
  const quoteMint = pk(opts.quoteMint ?? WSOL_MINT);
  const signatures: string[] = [];

  // Graduated coins accrue fees on the AMM side; move those across first.
  if (opts.graduated) {
    try {
      const ix = await sdk.transferCreatorFeesToPumpV2({
        payer: payer.publicKey,
        mint,
        quoteMint,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
      });
      signatures.push(await sendIxs([ix], [], "transfer_creator_fees_to_pump_v2"));
    } catch (err) {
      log.warn({ err, mint: opts.mint }, "AMM fee sweep skipped");
    }
  }

  const address = sharingConfigPda(mint);
  const cfg = await fetchSharingConfig(address).catch(() => null);
  if (!cfg) return { signatures, distributed: false };

  const ix = await sdk.distributeCreatorFeesV2({
    mint,
    sharingConfig: cfg,
    sharingConfigAddress: address,
    quoteMint,
    payer: payer.publicKey,
    shouldInitializeAta: true,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
  });
  signatures.push(await sendIxs([ix], [], "distribute_creator_fees_v2"));
  return { signatures, distributed: true };
}

/** Unclaimed creator fees sitting in the vault, in lamports. */
export async function pendingCreatorFees(mint: string): Promise<number> {
  const address = sharingConfigPda(pk(mint));
  const vault = PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), address.toBuffer()],
    PUMP_PROGRAM,
  )[0];
  const balance = await connection.getBalance(vault, "confirmed").catch(() => 0);
  // the vault keeps its rent-exempt minimum, which is not claimable
  const rentExempt = await connection.getMinimumBalanceForRentExemption(8).catch(() => 890_880);
  return Math.max(0, balance - rentExempt);
}

export { Transaction };

/* --------------------------------------------------------------- creation */

export interface CreateCoinArgs {
  creator: Keypair;        // the agent's own wallet: it IS the pump creator
  mint: Keypair;
  name: string;
  symbol: string;
  metadataUri: string;
  devBuyLamports: number;
  slippageBps: number;
}

/**
 * Creates the coin with the agent wallet as its creator.
 *
 * That is the whole point of the design: because the creator is a wallet only
 * the signer can open, creator fees have nowhere else to go, and the split we
 * lock afterwards cannot be redirected by anyone — including us.
 *
 * The agent wallet pays, having been funded by the dev beforehand.
 */
export async function createCoin(args: CreateCoinArgs): Promise<{ mint: string; signature: string }> {
  const ixs = await createIxs({
    creator: args.creator.publicKey,
    user: args.creator.publicKey,
    mint: args.mint.publicKey,
    name: args.name,
    symbol: args.symbol,
    uri: args.metadataUri,
    devBuyLamports: args.devBuyLamports,
    slippageBps: args.slippageBps,
  });

  const signature = await retry(
    async () => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const msg = new TransactionMessage({
        // the agent pays for its own creation out of what the dev sent it
        payerKey: args.creator.publicKey,
        recentBlockhash: blockhash,
        instructions: withBudget(ixs, 600_000),
      }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([args.creator, args.mint]);
      const sig = await connection.sendTransaction(tx, { maxRetries: 3 });
      const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error(`create failed on chain: ${JSON.stringify(res.value.err)}`);
      return sig;
    },
    { label: "create_coin", attempts: 2 },
  );

  log.info({ mint: args.mint.publicKey.toBase58(), signature }, "coin created");
  return { mint: args.mint.publicKey.toBase58(), signature };
}
