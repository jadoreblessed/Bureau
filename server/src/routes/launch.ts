import type { FastifyInstance } from "fastify";
import { Keypair } from "@solana/web3.js";
import { z } from "zod";
import { config } from "../config.js";
import { log } from "../logger.js";
import { query, one, tx } from "../db.js";
import { walletFor } from "../http/auth.js";
import { badRequest, conflict, disabled, notFound, send, unauthorized } from "../http/errors.js";
import { createAgentWallet } from "../chain/wallet.js";
import { ensurePolicy } from "../policy/context.js";
import { lamportsToSol } from "../util/money.js";
import { connection, payer } from "../chain/rpc.js";

/**
 * Launching a coin.
 *
 *   1. POST /launch/quote   — reserve the agent, make its wallet, quote a price
 *   2. the dev signs ONE transfer in their own wallet, funding that address
 *   3. POST /launch/:id/funded — we see the money, then create and lock
 *
 * The dev's wallet signs exactly one thing: a transfer they can read in
 * Phantom. The platform never asks them to sign a transaction it built.
 */

const KINDS = ["builder", "researcher", "trader", "creator", "influencer", "community", "unbound", "custom"] as const;

const quoteBody = z.object({
  name: z.string().min(2).max(32),
  ticker: z.string().regex(/^[A-Za-z0-9]{2,10}$/),
  description: z.string().max(600).default(""),
  kind: z.enum(KINDS).default("unbound"),
  families: z.array(z.string().max(24)).max(20).default([]),
  model: z.string().min(3).max(64),
  instructions: z.string().max(2_000).default(""),
  traits: z.array(z.string().max(24)).max(6).default([]),
  imageUrl: z.string().url().max(500).optional(),
  pair: z.string().max(12).default("SOL"),
  devBuySol: z.number().min(0).max(100).default(0),
  links: z.object({ x: z.string().max(120).optional(), telegram: z.string().max(200).optional() }).default({}),
});

const slugify = (name: string, ticker: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "agent"}-${ticker.toLowerCase()}`;

export async function launchRoutes(app: FastifyInstance) {
  /** A fresh blockhash and the cluster, so the site can build the one transfer a launch needs without a Solana SDK. */
  app.get("/chain/blockhash", async (_req, reply) => {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      return { blockhash, lastValidBlockHeight, cluster: config.SOLANA_CLUSTER, launchEnabled: config.LAUNCH_ENABLED };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.post("/launch/quote", async (req, reply) => {
    try {
      const wallet = await walletFor(req);
      if (!wallet) throw unauthorized("connect and sign in first");

      const body = quoteBody.parse(req.body);
      const devBuy = Math.round(body.devBuySol * 1_000_000_000);
      if (devBuy > config.MAX_DEV_BUY_LAMPORTS) throw badRequest("dev buy is above the allowed maximum");

      const ticker = body.ticker.toUpperCase();
      let slug = slugify(body.name, ticker);
      if (await one(`SELECT 1 FROM agents WHERE slug = $1`, [slug])) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      // The platform payer signs the fee lock right after the coin is created; without SOL on it
      // the coin would launch with its fee route unlocked, so refuse before the dev sends anything.
      if ((await connection.getBalance(payer.publicKey, "confirmed")) < 5_000_000)
        throw conflict("launches are paused: the platform wallet needs topping up");

      // Rent for the mint and its accounts plus network fees (~0.012 SOL measured), with headroom
      // left in the agent wallet for gas, plus the buy.
      const overhead = 20_000_000;
      const quoted = overhead + devBuy;

      const agentId = await tx(async (c) => {
        const res = await c.query(
          `INSERT INTO agents (slug, name, ticker, description, image_url, kind, families, model,
                               instructions, traits, pair_symbol, creator_wallet, status, links)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13)
           RETURNING id`,
          [slug, body.name, ticker, body.description, body.imageUrl ?? null, body.kind, body.families,
           body.model, body.instructions, body.traits, body.pair, wallet, JSON.stringify(body.links)],
        );
        return res.rows[0].id as string;
      });

      const { pubkey } = await createAgentWallet(agentId);
      await query(`UPDATE agents SET agent_wallet = $2 WHERE id = $1`, [agentId, pubkey]);
      await ensurePolicy(agentId);

      const launch = await one<{ id: string; expires_at: Date }>(
        `INSERT INTO launches (agent_id, dev_wallet, dev_buy_lamports, quoted_lamports, expires_at)
         VALUES ($1,$2,$3,$4, now() + make_interval(mins => $5))
         RETURNING id, expires_at`,
        [agentId, wallet, devBuy, quoted, config.LAUNCH_TTL_MIN],
      );

      log.info({ agentId, slug, wallet }, "launch quoted");
      return {
        launchId: launch!.id,
        agentId,
        slug,
        // The dev sends exactly this, to exactly this address, from their wallet.
        fundingAddress: pubkey,
        fundingLamports: quoted,
        fundingSol: lamportsToSol(quoted),
        breakdown: {
          networkAndRentSol: lamportsToSol(overhead),
          devBuySol: lamportsToSol(devBuy),
        },
        expiresAt: launch!.expires_at,
        launchEnabled: config.LAUNCH_ENABLED,
      };
    } catch (err) {
      return send(reply, err);
    }
  });

  /** The dev tells us their transfer landed; a worker takes it from here. */
  app.post("/launch/:id/funded", async (req, reply) => {
    try {
      const wallet = await walletFor(req);
      if (!wallet) throw unauthorized();
      const { id } = req.params as { id: string };
      const { signature } = z.object({ signature: z.string().min(32).max(128) }).parse(req.body);

      const launch = await one<{ id: string; agent_id: string; stage: string; dev_wallet: string }>(
        `SELECT id, agent_id, stage, dev_wallet FROM launches WHERE id = $1`,
        [id],
      );
      if (!launch) throw notFound("no such launch");
      if (launch.dev_wallet !== wallet) throw unauthorized("that launch belongs to another wallet");
      if (launch.stage !== "quoted") throw conflict(`launch is already ${launch.stage}`);
      if (!config.LAUNCH_ENABLED) throw disabled("creating coins is switched off on this deployment");

      await query(`UPDATE launches SET stage = 'funded', create_sig = $2 WHERE id = $1`, [id, signature]);
      await query(`UPDATE agents SET status = 'launching' WHERE id = $1`, [launch.agent_id]);
      log.info({ launchId: id, signature }, "launch funded; handing to the worker");
      return { ok: true, stage: "funded" };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.get("/launch/:id", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const launch = await one(
        `SELECT l.id, l.stage, l.error, l.quoted_lamports, l.expires_at, l.create_sig, l.lock_sig,
                a.slug, a.mint, a.agent_wallet, a.fees_locked, a.status
           FROM launches l JOIN agents a ON a.id = l.agent_id WHERE l.id = $1`,
        [id],
      );
      if (!launch) throw notFound("no such launch");
      return launch;
    } catch (err) {
      return send(reply, err);
    }
  });
}
