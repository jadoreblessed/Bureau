import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type Keypair,
} from "@solana/web3.js";
import {
  createBurnCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { buyInstructionsFor, sellInstructionsFor } from "../chain/pump.js";
import { connection, pk } from "../chain/rpc.js";
import type { Intent } from "../policy/engine.js";

/**
 * Turns an approved intent into instructions.
 *
 * This is the only place a financial action becomes a transaction, and it is
 * built from typed fields — never from text a model produced. An agent names
 * a kind and an amount; the shape of the transaction is ours.
 */

export interface BuildResult {
  instructions: TransactionInstruction[];
  /** Extra signers besides the agent wallet. */
  signers: Keypair[];
  label: string;
}

export async function buildIntent(intent: Intent, agent: Keypair, ownMint: string): Promise<BuildResult> {
  switch (intent.kind) {
    case "buyback": {
      const ixs = await buyInstructionsFor({
        mint: pk(intent.mint ?? ownMint),
        user: agent.publicKey,
        lamports: intent.amountLamports,
        slippageBps: intent.slippageBps ?? 100,
      });
      return { instructions: ixs, signers: [], label: "buyback" };
    }

    case "sell": {
      // for a sell, amountLamports carries the token amount in atoms
      const ixs = await sellInstructionsFor({
        mint: pk(intent.mint ?? ownMint),
        user: agent.publicKey,
        atoms: intent.amountLamports,
        slippageBps: intent.slippageBps ?? 100,
      });
      return { instructions: ixs, signers: [], label: "sell" };
    }

    case "burn": {
      // Burns only ever touch tokens the agent already holds.
      const mint = pk(intent.mint ?? ownMint);
      const ata = getAssociatedTokenAddressSync(mint, agent.publicKey, true);
      const supplyInfo = await connection.getTokenSupply(mint);
      const decimals = supplyInfo.value.decimals;
      const held = await connection.getTokenAccountBalance(ata);
      const amount = BigInt(intent.amountLamports);
      if (amount > BigInt(held.value.amount)) {
        throw new Error("cannot burn more than the agent holds");
      }
      return {
        instructions: [createBurnCheckedInstruction(ata, mint, agent.publicKey, amount, decimals, [], TOKEN_PROGRAM_ID)],
        signers: [],
        label: "burn",
      };
    }

    case "airdrop": {
      // The caller resolves the snapshot; the agent never names recipients.
      const recipients = (intent as Intent & { recipients?: Array<{ address: string; lamports: number }> }).recipients;
      if (!recipients?.length) throw new Error("airdrop needs a resolved snapshot");
      const total = recipients.reduce((a, r) => a + r.lamports, 0);
      if (total !== intent.amountLamports) {
        throw new Error(`snapshot totals ${total} but the approved amount was ${intent.amountLamports}`);
      }
      if (recipients.length > 20) throw new Error("split large airdrops into batches of 20");
      return {
        instructions: recipients.map((r) =>
          SystemProgram.transfer({
            fromPubkey: agent.publicKey,
            toPubkey: new PublicKey(r.address),
            lamports: r.lamports,
          }),
        ),
        signers: [],
        label: "airdrop",
      };
    }

    case "fund_credits": {
      // Topping up its own thinking: the one transfer with a fixed destination.
      const dest = (intent as Intent & { creditsWallet?: string }).creditsWallet;
      if (!dest) throw new Error("no credits wallet configured");
      return {
        instructions: [
          SystemProgram.transfer({
            fromPubkey: agent.publicKey,
            toPubkey: new PublicKey(dest),
            lamports: intent.amountLamports,
          }),
        ],
        signers: [],
        label: "fund_credits",
      };
    }

    case "swap":
      throw new Error("swap routing is not wired yet");

    case "transfer":
      throw new Error("free transfers are never built");

    default: {
      const never: never = intent.kind;
      throw new Error(`unhandled intent kind ${String(never)}`);
    }
  }
}

export { createAssociatedTokenAccountIdempotentInstruction };
