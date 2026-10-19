import nacl from "tweetnacl";
import bs58 from "bs58";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { query, one } from "../db.js";
import { randomId } from "../util/crypto.js";

/**
 * Wallet sign-in. A session proves one thing: whoever holds it controlled the
 * private key for this wallet a moment ago. Nothing else is implied, and the
 * dev console checks ownership of the specific coin separately.
 */

const CHALLENGE_TTL_MIN = 10;

export function challengeMessage(wallet: string, nonce: string): string {
  return [
    "Sign in to BUREAU",
    "",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    "",
    "Signing proves you hold this wallet. It does not approve any transaction and moves no funds.",
  ].join("\n");
}

export async function createChallenge(wallet: string): Promise<{ nonce: string; message: string }> {
  const nonce = randomId(16);
  await query(
    `INSERT INTO auth_challenges (nonce, wallet, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [nonce, wallet, CHALLENGE_TTL_MIN],
  );
  return { nonce, message: challengeMessage(wallet, nonce) };
}

export async function verifyChallenge(wallet: string, nonce: string, signatureB58: string): Promise<string | null> {
  // A nonce is good once. Deleting as we read closes the replay window.
  const row = await one<{ wallet: string }>(
    `DELETE FROM auth_challenges WHERE nonce = $1 AND wallet = $2 AND expires_at > now() RETURNING wallet`,
    [nonce, wallet],
  );
  if (!row) return null;

  let ok = false;
  try {
    ok = nacl.sign.detached.verify(
      new TextEncoder().encode(challengeMessage(wallet, nonce)),
      bs58.decode(signatureB58),
      bs58.decode(wallet),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  const token = randomId(32);
  await query(
    `INSERT INTO sessions (token, wallet, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [token, wallet, config.SESSION_TTL_HOURS],
  );
  return token;
}

export async function walletFor(req: FastifyRequest): Promise<string | null> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const row = await one<{ wallet: string }>(
    `SELECT wallet FROM sessions WHERE token = $1 AND expires_at > now()`,
    [token],
  );
  return row?.wallet ?? null;
}

/** True when this wallet launched this coin. */
export async function ownsAgent(wallet: string, agentId: string): Promise<boolean> {
  const row = await one<{ id: string }>(
    `SELECT id FROM agents WHERE id = $1 AND creator_wallet = $2`,
    [agentId, wallet],
  );
  return Boolean(row);
}

export async function sweepExpiredSessions(): Promise<void> {
  await query(`DELETE FROM sessions WHERE expires_at < now()`);
  await query(`DELETE FROM auth_challenges WHERE expires_at < now()`);
}
