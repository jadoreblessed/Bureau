import { config } from "../config.js";
import { log } from "../logger.js";
import { withTimeout } from "../util/retry.js";

/** What the API and the workers use to reach the signer. */
export interface SignRequest {
  intentId: string;
  agentId: string;
  kind: "buyback" | "sell" | "burn" | "swap" | "airdrop" | "fund_credits";
  amountLamports: number;
  mint?: string;
  slippageBps?: number;
  poolReserveLamports?: number;
  recipients?: Array<{ address: string; lamports: number }>;
}

export interface SignResult {
  signature: string;
  confirmed?: boolean;
  replayed?: boolean;
}

export async function signAndSend(req: SignRequest): Promise<SignResult> {
  const res = await withTimeout(
    () =>
      fetch(`${config.SIGNER_URL}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.SIGNER_TOKEN}` },
        body: JSON.stringify(req),
      }),
    90_000,
    "signer",
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    log.warn({ status: res.status, body, intentId: req.intentId }, "signer declined");
    throw new Error(typeof body.reason === "string" ? body.reason : `signer returned ${res.status}`);
  }
  return body as unknown as SignResult;
}

export async function signerHealthy(): Promise<boolean> {
  try {
    const res = await withTimeout(() => fetch(`${config.SIGNER_URL}/health`), 5_000, "signer health");
    return res.ok;
  } catch {
    return false;
  }
}
