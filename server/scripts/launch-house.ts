/**
 * Launches BUREAU's house agents for real, through the same public API a dev
 * uses from the site: wallet sign-in, quote, one SOL transfer, "funded", then
 * the worker and signer create the coin and lock the fee split on chain.
 *
 * The funding wallet is LAUNCH_FUNDER_SECRET (JSON array or base58). On devnet
 * that is the platform payer topped up from the faucet. Each launched coin
 * replaces its seeded "not launched yet" row; thoughts and memories carry over.
 *
 *   API_URL=http://api:8080 LAUNCH_FUNDER_SECRET=... npx tsx scripts/launch-house.ts [slug ...]
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { config } from "../src/config.js";
import { query, one, closeDb } from "../src/db.js";

const API = (process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "") + "/api";
const SITE = config.PUBLIC_URL.replace(/\/$/, "");
const raw = process.env.LAUNCH_FUNDER_SECRET ?? config.PLATFORM_PAYER_SECRET;
const funder = Keypair.fromSecretKey(raw.trim().startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw.trim()));
const connection = new Connection(config.SOLANA_RPC_URL, "confirmed");

async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(API + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`${path}: ${res.status} ${json.message ?? ""}`);
  return json;
}

async function signIn(): Promise<string> {
  const wallet = funder.publicKey.toBase58();
  const { nonce, message } = await api<{ nonce: string; message: string }>("/auth/challenge", { body: { wallet } });
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), funder.secretKey));
  const { token } = await api<{ token: string }>("/auth/verify", { body: { wallet, nonce, signature } });
  return token;
}

interface Seeded { id: string; slug: string; name: string; ticker: string; description: string; kind: string; families: string[]; model: string; instructions: string; traits: string[]; pair_symbol: string }

async function launchOne(token: string, a: Seeded) {
  console.log(`\n== ${a.name} ($${a.ticker})`);
  const q = await api<{ launchId: string; agentId: string; slug: string; fundingAddress: string; fundingLamports: number; launchEnabled: boolean }>(
    "/launch/quote",
    {
      token,
      body: {
        name: a.name, ticker: a.ticker, description: a.description, kind: a.kind, families: a.families,
        model: a.model, instructions: a.instructions, traits: a.traits.slice(0, 6), pair: "SOL", devBuySol: 0,
        imageUrl: `${SITE}/agents/${a.slug}.webp`,
      },
    },
  );
  if (!q.launchEnabled) throw new Error("LAUNCH_ENABLED is false on the server");
  console.log(`quote: send ${q.fundingLamports / 1e9} SOL to ${q.fundingAddress}`);

  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: new PublicKey(q.fundingAddress), lamports: q.fundingLamports }));
  const sig = await sendAndConfirmTransaction(connection, tx, [funder], { commitment: "confirmed" });
  console.log(`funded: ${sig}`);
  await api(`/launch/${q.launchId}/funded`, { token, body: { signature: sig } });

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const { stage, error, status } = await api<{ stage: string; error: string | null; status: string }>(`/launch/${q.launchId}`);
    process.stdout.write(`  ${stage} · agent ${status}${error ? " (" + error.slice(0, 160) + ")" : ""}\n`);
    if (stage === "verified" || stage === "failed" || status === "failed" || status === "halted") break;
  }

  const row = await one<{ mint: string | null; status: string }>(`SELECT mint, status FROM agents WHERE id = $1`, [q.agentId]);
  if (!row?.mint) { console.log("no mint; leaving the seeded row in place"); return; }

  // The launched agent takes over the seeded one: its history, then its short slug.
  for (const t of ["thoughts", "memories", "missions", "wakes", "posts", "dev_notes"]) {
    await query(`UPDATE ${t} SET agent_id = $1 WHERE agent_id = $2`, [q.agentId, a.id]).catch(() => {});
  }
  await query(`DELETE FROM agents WHERE id = $1`, [a.id]);
  await query(`UPDATE agents SET slug = $2 WHERE id = $1`, [q.agentId, a.slug]);
  console.log(`LIVE: ${a.ticker} mint ${row.mint} status ${row.status}`);
}

async function main() {
  const only = process.argv.slice(2);
  const { rows } = await query<Seeded>(
    `SELECT id, slug, name, ticker, description, kind, families, model, instructions, traits, pair_symbol
       FROM agents WHERE creator_wallet = 'SEED' AND mint IS NULL ORDER BY created_at`,
  );
  const todo = only.length ? rows.filter((r) => only.includes(r.slug)) : rows;
  console.log(`funder ${funder.publicKey.toBase58()} · ${(await connection.getBalance(funder.publicKey)) / 1e9} SOL · ${todo.length} to launch on ${config.SOLANA_CLUSTER}`);
  const token = await signIn();
  for (const a of todo) {
    try { await launchOne(token, a); } catch (err) { console.log(`FAILED ${a.slug}: ${(err as Error).message}`); }
  }
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
