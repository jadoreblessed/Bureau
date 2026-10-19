import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PumpSdk } from "@pump-fun/pump-sdk";
import { PUMP, WSOL_MINT, config } from "../config.js";
import { connection, payer, pk } from "./rpc.js";
import { log } from "../logger.js";
import { retry } from "../util/retry.js";

/**
 * Adapter over @pump-fun/pump-sdk.
 *
 * The call shapes below follow Pump's public instruction docs
 * (CREATOR_FEE_SHARING.md). If a future SDK release renames something, this
 * is the only file that needs touching — nothing else imports the SDK.
 */
export const sdk = new PumpSdk(connection);

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
  const ixs: TransactionInstruction[] = await sdk.createInstructions({
    creator,
    mint: args.mint.publicKey,
    name: args.name,
    symbol: args.symbol,
    uri: args.metadataUri,
    user: creator,
  });

  if (args.devBuyLamports > 0) {
    const global = await sdk.fetchGlobal();
    const buyIxs: TransactionInstruction[] = await sdk.buyInstructions({
      global,
      bondingCurveAccountInfo: null,  // fresh curve: the create in this same tx makes it
      bondingCurve: null,
      associatedUserAccountInfo: null,
      mint: args.mint.publicKey,
      user: creator,
      solAmount: args.devBuyLamports,
      slippage: args.slippageBps / 100,
    });
    ixs.push(...buyIxs);
  }

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
  const createIxs: TransactionInstruction[] = await sdk.createFeeSharingConfigInstructions({
    creator: opts.creator.publicKey,
    mint,
    pool: opts.graduated ? await sdk.poolPda(mint, quoteMint) : null,
  });
  signatures.push(await sendIxs(createIxs, [opts.creator], "create_fee_sharing_config"));

  // 2. the one-time write. After this Pump sets admin_revoked = true.
  const updateIxs: TransactionInstruction[] = await sdk.updateFeeSharesV2Instructions({
    authority: opts.creator.publicKey,
    mint,
    currentShareholders: [opts.creator.publicKey],
    newShareholders: opts.shareholders.map((s) => ({ address: pk(s.address), shareBps: s.shareBps })),
    quoteMint,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
  });
  signatures.push(await sendIxs(updateIxs, [opts.creator], "update_fee_shares_v2"));

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
  const cfg = await sdk.fetchFeeSharingConfig(address).catch(() => null);
  if (!cfg) return { exists: false, locked: false, shareholders: [] };
  return {
    exists: true,
    // Pump revokes the admin after the one-time update; that is the lock.
    locked: Boolean(cfg.adminRevoked),
    shareholders: (cfg.shareholders ?? []).map((s: { address: PublicKey; shareBps: number }) => ({
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
      const ixs: TransactionInstruction[] = await sdk.transferCreatorFeesToPumpV2Instructions({
        payer: payer.publicKey,
        mint,
        quoteMint,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
      });
      if (ixs.length) signatures.push(await sendIxs(ixs, [], "transfer_creator_fees_to_pump_v2"));
    } catch (err) {
      log.warn({ err, mint: opts.mint }, "AMM fee sweep skipped");
    }
  }

  const address = sharingConfigPda(mint);
  const cfg = await sdk.fetchFeeSharingConfig(address).catch(() => null);
  if (!cfg) return { signatures, distributed: false };

  const ixs: TransactionInstruction[] = await sdk.distributeCreatorFeesV2Instructions({
    mint,
    sharingConfig: cfg,
    sharingConfigAddress: address,
    quoteMint,
    payer: payer.publicKey,
    shouldInitializeAta: true,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
  });
  if (!ixs.length) return { signatures, distributed: false };

  signatures.push(await sendIxs(ixs, [], "distribute_creator_fees_v2"));
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
  const ixs: TransactionInstruction[] = await sdk.createInstructions({
    creator: args.creator.publicKey,
    mint: args.mint.publicKey,
    name: args.name,
    symbol: args.symbol,
    uri: args.metadataUri,
    user: args.creator.publicKey,
  });

  if (args.devBuyLamports > 0) {
    const global = await sdk.fetchGlobal();
    const buyIxs: TransactionInstruction[] = await sdk.buyInstructions({
      global,
      bondingCurveAccountInfo: null,
      bondingCurve: null,
      associatedUserAccountInfo: null,
      mint: args.mint.publicKey,
      user: args.creator.publicKey,
      solAmount: args.devBuyLamports,
      slippage: args.slippageBps / 100,
    });
    ixs.push(...buyIxs);
  }

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
