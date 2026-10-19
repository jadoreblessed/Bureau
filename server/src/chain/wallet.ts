import { Keypair } from "@solana/web3.js";
import { config } from "../config.js";
import { query, one } from "../db.js";
import { loadMasterKey, seal, open } from "../util/crypto.js";

/**
 * Agent wallets. The secret key is sealed with the master key before it
 * touches the database, and is only ever opened inside the signer.
 * Nothing in the agent runtime can reach this module's output.
 */
const masterKey = loadMasterKey(config.MASTER_KEY);
const aadFor = (agentId: string) => `bureau:agent-wallet:v1:${agentId}`;

export interface NewWallet {
  pubkey: string;
  /** Only returned at creation so the caller can fund it; never stored in clear. */
  keypair: Keypair;
}

/** Creates the agent's wallet and stores it sealed. */
export async function createAgentWallet(agentId: string): Promise<NewWallet> {
  const keypair = Keypair.generate();
  const sealed = seal(masterKey, keypair.secretKey, aadFor(agentId));
  await query(
    `INSERT INTO agent_keys (agent_id, pubkey, enc_version, nonce, ciphertext)
     VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agentId, keypair.publicKey.toBase58(), sealed.nonce, sealed.ciphertext],
  );
  return { pubkey: keypair.publicKey.toBase58(), keypair };
}

/**
 * Opens an agent's wallet. Signer-only: calling this anywhere in the agent
 * runtime defeats the whole separation, so it lives behind the signer module.
 */
export async function openAgentWallet(agentId: string): Promise<Keypair> {
  const row = await one<{ nonce: Buffer; ciphertext: Buffer; pubkey: string }>(
    `SELECT nonce, ciphertext, pubkey FROM agent_keys WHERE agent_id = $1`,
    [agentId],
  );
  if (!row) throw new Error(`no wallet stored for agent ${agentId}`);
  const secret = open(masterKey, { nonce: row.nonce, ciphertext: row.ciphertext }, aadFor(agentId));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  if (keypair.publicKey.toBase58() !== row.pubkey) {
    throw new Error(`wallet for agent ${agentId} does not match its stored pubkey`);
  }
  return keypair;
}

export async function getAgentPubkey(agentId: string): Promise<string | null> {
  const row = await one<{ pubkey: string }>(`SELECT pubkey FROM agent_keys WHERE agent_id = $1`, [agentId]);
  return row?.pubkey ?? null;
}
