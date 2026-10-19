import { Connection, Keypair, PublicKey, type Commitment } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "../config.js";
import { log } from "../logger.js";
import { retry } from "../util/retry.js";

export const connection = new Connection(config.SOLANA_RPC_URL, {
  commitment: "confirmed",
  ...(config.SOLANA_RPC_WS ? { wsEndpoint: config.SOLANA_RPC_WS } : {}),
  confirmTransactionInitialTimeout: 90_000,
});

/**
 * The platform payer. It pays network fees for permissionless upkeep —
 * sweeping and distributing creator fees, buybacks — and never holds
 * an agent's funds.
 */
export const payer: Keypair = (() => {
  const raw = config.PLATFORM_PAYER_SECRET.trim();
  try {
    // accept either a base58 secret or a JSON array, whichever the user pasted
    const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw);
    return Keypair.fromSecretKey(bytes);
  } catch (err) {
    log.error({ err }, "PLATFORM_PAYER_SECRET is not a valid base58 or JSON secret key");
    process.exit(1);
  }
})();

export const pk = (s: string) => new PublicKey(s);

export async function getSolBalance(address: string | PublicKey): Promise<number> {
  const key = typeof address === "string" ? pk(address) : address;
  return retry(() => connection.getBalance(key, "confirmed"), { label: "getBalance" });
}

export async function confirmSignature(signature: string, commitment: Commitment = "confirmed"): Promise<boolean> {
  const latest = await connection.getLatestBlockhash(commitment);
  const res = await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    commitment,
  );
  if (res.value.err) {
    log.warn({ signature, err: res.value.err }, "transaction confirmed with error");
    return false;
  }
  return true;
}

/** True once the mint account exists and is owned by a token program. */
export async function mintExists(mint: string): Promise<boolean> {
  const info = await retry(() => connection.getAccountInfo(pk(mint), "confirmed"), { label: "getAccountInfo" });
  return info !== null && info.data.length > 0;
}

export async function assertPayerFunded(minLamports = 20_000_000): Promise<void> {
  const balance = await getSolBalance(payer.publicKey);
  if (balance < minLamports) {
    log.error(
      { balance, minLamports, payer: payer.publicKey.toBase58() },
      "platform payer is low on SOL; fee distribution and buybacks will fail",
    );
  }
}
