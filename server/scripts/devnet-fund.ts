/**
 * Devnet only: send test SOL from the platform payer to an address (for test wallets).
 *   npx tsx scripts/devnet-fund.ts <address> [sol=0.1]
 */
import { SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { config } from "../src/config.js";
import { connection, payer, pk } from "../src/chain/rpc.js";

if (config.SOLANA_CLUSTER !== "devnet") throw new Error("devnet-fund refuses to run anywhere but devnet");
const [to, sol = "0.1"] = process.argv.slice(2);
if (!to) throw new Error("usage: devnet-fund <address> [sol]");
const sig = await sendAndConfirmTransaction(connection, new Transaction().add(
  SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: pk(to), lamports: Math.round(Number(sol) * 1e9) }),
), [payer], { commitment: "confirmed" });
console.log(`sent ${sol} SOL to ${to}: ${sig}`);
