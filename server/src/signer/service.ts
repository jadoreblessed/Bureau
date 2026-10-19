import Fastify from "fastify";
import { TransactionMessage, VersionedTransaction, ComputeBudgetProgram, Keypair } from "@solana/web3.js";
import { z } from "zod";
import { config } from "../config.js";
import { log } from "../logger.js";
import { query, one, assertDbReady, closeDb } from "../db.js";
import { connection, payer } from "../chain/rpc.js";
import { openAgentWallet } from "../chain/wallet.js";
import { buildIntent } from "./build.js";
import { createCoin, lockFeeShares, bureauShares } from "../chain/pump.js";
import { check, type Intent } from "../policy/engine.js";
import { buildContext } from "../policy/context.js";
import { safeEqual } from "../util/crypto.js";

/**
 * The isolated signer.
 *
 * It runs as its own process and is the only thing in the system that can open
 * an agent wallet. It does not accept transactions — only typed intents, which
 * it re-checks against the policy engine itself before building anything. So
 * even if the API or the agent runtime were fully compromised, the worst it
 * could ask for is a move the policy already allows.
 *
 * Run it on its own host, reachable only from the API and the workers.
 */

const intentSchema = z.object({
  intentId: z.string().uuid(),
  agentId: z.string().uuid(),
  kind: z.enum(["buyback", "sell", "burn", "swap", "airdrop", "fund_credits"]),
  amountLamports: z.number().int().nonnegative(),
  mint: z.string().optional(),
  slippageBps: z.number().int().min(0).max(5_000).optional(),
  poolReserveLamports: z.number().int().nonnegative().optional(),
  recipients: z.array(z.object({ address: z.string(), lamports: z.number().int().positive() })).max(20).optional(),
});

const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health") return;
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, config.SIGNER_TOKEN)) {
    log.warn({ ip: req.ip, url: req.url }, "signer rejected an unauthenticated call");
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/health", async () => ({ ok: true, cluster: config.SOLANA_CLUSTER, moneyEnabled: config.MONEY_ENABLED }));

app.post("/sign", async (req, reply) => {
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "bad intent", issues: parsed.error.issues });
  const body = parsed.data;

  // One intent, one signature. A replayed request must never sign twice.
  const row = await one<{ status: string; signature: string | null }>(
    `SELECT status, signature FROM intents WHERE id = $1 AND agent_id = $2`,
    [body.intentId, body.agentId],
  );
  if (!row) return reply.code(404).send({ error: "unknown intent" });
  if (row.signature) return reply.send({ signature: row.signature, replayed: true });
  if (row.status !== "approved") return reply.code(409).send({ error: `intent is ${row.status}, not approved` });

  const intent: Intent = {
    kind: body.kind,
    amountLamports: body.amountLamports,
    ...(body.mint ? { mint: body.mint } : {}),
    ...(body.slippageBps !== undefined ? { slippageBps: body.slippageBps } : {}),
    ...(body.poolReserveLamports !== undefined ? { poolReserveLamports: body.poolReserveLamports } : {}),
  };

  // Second, independent policy check. The caller already ran one; we do not
  // take its word for it.
  const ctx = await buildContext(body.agentId);
  const decision = check(intent, ctx);
  if (!decision.ok) {
    await query(`UPDATE intents SET status = 'rejected', reject_reason = $2 WHERE id = $1`, [
      body.intentId,
      `signer:${decision.rule}`,
    ]);
    log.warn({ intentId: body.intentId, rule: decision.rule }, "signer refused an intent the caller had approved");
    return reply.code(403).send({ error: "refused by policy", rule: decision.rule, reason: decision.reason });
  }

  const agent = await openAgentWallet(body.agentId);
  const built = await buildIntent(
    { ...intent, ...(body.recipients ? { recipients: body.recipients } : {}) } as Intent,
    agent,
    ctx.ownMint,
  );

  await query(`UPDATE intents SET status = 'signing' WHERE id = $1`, [body.intentId]);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    // the platform pays network fees so an empty agent can still act
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 150_000 }),
      ...built.instructions,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer, agent, ...built.signers]);

  const signature = await connection.sendTransaction(tx, { maxRetries: 3 });
  await query(`UPDATE intents SET status = 'submitted', signature = $2 WHERE id = $1`, [body.intentId, signature]);

  const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) {
    await query(`UPDATE intents SET status = 'failed', result = $2 WHERE id = $1`, [
      body.intentId,
      JSON.stringify(res.value.err),
    ]);
    log.error({ intentId: body.intentId, signature, err: res.value.err }, "intent failed on chain");
    return reply.code(502).send({ error: "transaction failed", signature });
  }

  await query(
    `UPDATE intents SET status = 'confirmed', confirmed_at = now() WHERE id = $1`,
    [body.intentId],
  );
  await query(
    `INSERT INTO ledger (agent_id, intent_id, entry, amount_lamports, signature, meta)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (signature, entry) WHERE signature IS NOT NULL DO NOTHING`,
    [body.agentId, body.intentId, built.label, -body.amountLamports, signature, JSON.stringify({ kind: body.kind })],
  );

  log.info({ intentId: body.intentId, kind: body.kind, signature }, "intent settled");
  return { signature, confirmed: true };
});

const launchSchema = z.object({
  agentId: z.string().uuid(),
  launchId: z.string().uuid(),
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10),
  metadataUri: z.string().url(),
  devBuyLamports: z.number().int().nonnegative().default(0),
});

/**
 * Creates the coin and locks its fee split.
 *
 * This lives in the signer because both steps need the agent wallet's key,
 * and that key is only ever opened here. The worker asks; it does not sign.
 */
app.post("/launch", async (req, reply) => {
  const parsed = launchSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "bad launch", issues: parsed.error.issues });
  const body = parsed.data;

  if (!config.LAUNCH_ENABLED) return reply.code(503).send({ error: "launching is switched off" });

  const row = await one<{ stage: string; mint: string | null; dev_buy_lamports: string }>(
    `SELECT l.stage, a.mint, l.dev_buy_lamports
       FROM launches l JOIN agents a ON a.id = l.agent_id
      WHERE l.id = $1 AND l.agent_id = $2`,
    [body.launchId, body.agentId],
  );
  if (!row) return reply.code(404).send({ error: "unknown launch" });
  if (row.mint) return reply.send({ mint: row.mint, replayed: true });
  if (row.stage !== "funded") return reply.code(409).send({ error: `launch is ${row.stage}, not funded` });

  const creator = await openAgentWallet(body.agentId);

  // The wallet must actually hold what the dev was quoted; we never front it.
  const balance = await connection.getBalance(creator.publicKey, "confirmed");
  const needed = 25_000_000 + Number(row.dev_buy_lamports);
  if (balance < needed) {
    return reply.code(409).send({ error: "agent wallet is not funded yet", balance, needed });
  }

  await query(`UPDATE launches SET stage = 'creating' WHERE id = $1`, [body.launchId]);

  const mintKeypair = Keypair.generate();
  let created;
  try {
    created = await createCoin({
      creator,
      mint: mintKeypair,
      name: body.name,
      symbol: body.symbol,
      metadataUri: body.metadataUri,
      devBuyLamports: Number(row.dev_buy_lamports),
      slippageBps: config.LAUNCH_SLIPPAGE_BPS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 400) : "create failed";
    await query(`UPDATE launches SET stage = 'failed', error = $2 WHERE id = $1`, [body.launchId, message]);
    await query(`UPDATE agents SET status = 'failed', status_reason = $2 WHERE id = $1`, [body.agentId, message]);
    log.error({ err, launchId: body.launchId }, "coin creation failed");
    return reply.code(502).send({ error: "create failed", message });
  }

  await query(`UPDATE agents SET mint = $2, launch_sig = $3 WHERE id = $1`, [body.agentId, created.mint, created.signature]);
  await query(`UPDATE launches SET stage = 'locking', create_sig = $2 WHERE id = $1`, [body.launchId, created.signature]);

  // Lock the split. If this fails the coin still exists, so the launch is
  // marked failed-with-coin rather than lost, and the worker retries.
  try {
    const shares = bureauShares(creator.publicKey.toBase58());
    const locked = await lockFeeShares({ mint: created.mint, creator, shareholders: shares });
    await query(
      `UPDATE agents SET sharing_config = $2, fees_locked = true, lock_sig = $3, status = 'asleep_fees' WHERE id = $1`,
      [body.agentId, locked.sharingConfig, locked.signatures.at(-1) ?? null],
    );
    await query(`UPDATE launches SET stage = 'verified', lock_sig = $2 WHERE id = $1`, [
      body.launchId, locked.signatures.at(-1) ?? null,
    ]);
    log.info({ agentId: body.agentId, mint: created.mint }, "launch complete and fee split locked");
    return { mint: created.mint, signature: created.signature, sharingConfig: locked.sharingConfig, locked: true };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 400) : "lock failed";
    await query(`UPDATE launches SET error = $2 WHERE id = $1`, [body.launchId, message]);
    log.error({ err, mint: created.mint }, "coin created but the fee split is NOT locked yet");
    return reply.code(502).send({ error: "lock failed", mint: created.mint, message });
  }
});

async function main() {
  await assertDbReady();
  // Binds to loopback by default. In compose it binds inside the container and
  // is never published to the host, so only the api and worker can reach it.
  await app.listen({ port: config.SIGNER_PORT, host: config.SIGNER_HOST });
  log.info(
    { port: config.SIGNER_PORT, moneyEnabled: config.MONEY_ENABLED },
    config.MONEY_ENABLED ? "signer up — money moves are ENABLED" : "signer up — money moves are disabled",
  );
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  log.error({ err }, "signer failed to start");
  process.exit(1);
});
