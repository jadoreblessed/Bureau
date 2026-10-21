/**
 * Devnet only: trade a coin back and forth so it earns real creator fees, to
 * test the fee sweep → split → agent wallet cycle end to end.
 *
 * A throwaway trader wallet is funded from the platform payer, buys and sells
 * the coin ROUNDS times, then sends what is left back to the payer.
 *
 *   npx tsx scripts/devnet-trade.ts <mint> [rounds=3] [buySol=0.2]
 */
import { Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { config } from "../src/config.js";
import { connection, payer, pk } from "../src/chain/rpc.js";
import { buyInstructionsFor, sellInstructionsFor } from "../src/chain/pump.js";

if (config.SOLANA_CLUSTER !== "devnet") throw new Error("devnet-trade refuses to run anywhere but devnet");

const [mintArg, roundsArg = "3", buyArg = "0.2"] = process.argv.slice(2);
if (!mintArg) throw new Error("usage: devnet-trade <mint> [rounds] [buySol]");
const mint = pk(mintArg);
const rounds = Number(roundsArg);
const buyLamports = Math.round(Number(buyArg) * 1e9);
const trader = Keypair.generate();

const send = (ixs: TransactionInstruction[], signers: Keypair[], label: string) =>
  sendAndConfirmTransaction(connection, new Transaction().add(...ixs), signers, { commitment: "confirmed" })
    .then((sig) => { console.log(`${label}: ${sig}`); return sig; });

async function main() {
  await send([SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: trader.publicKey, lamports: buyLamports + 60_000_000 })], [payer], "fund trader");
  const tokenProgram = (await connection.getAccountInfo(mint))!.owner;
  const ata = getAssociatedTokenAddressSync(mint, trader.publicKey, true, tokenProgram);

  for (let i = 1; i <= rounds; i++) {
    await send(await buyInstructionsFor({ mint, user: trader.publicKey, lamports: buyLamports, slippageBps: 1500 }), [trader], `round ${i} buy`);
    const held = Number((await connection.getTokenAccountBalance(ata, "confirmed")).value.amount);
    await send(await sellInstructionsFor({ mint, user: trader.publicKey, atoms: held, slippageBps: 1500 }), [trader], `round ${i} sell ${held / 1e6} tokens`);
  }

  const left = await connection.getBalance(trader.publicKey, "confirmed");
  if (left > 10_000) await send([SystemProgram.transfer({ fromPubkey: trader.publicKey, toPubkey: payer.publicKey, lamports: left - 5_000 })], [trader], "return to payer");
  console.log(`done: ${rounds} round trips of ${buyLamports / 1e9} SOL; trader cost ${((buyLamports + 60_000_000 - left) / 1e9).toFixed(4)} SOL`);
}

main().catch((err) => { console.error(err); process.exit(1); });
