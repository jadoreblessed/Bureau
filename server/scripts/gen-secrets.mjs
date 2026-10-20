#!/usr/bin/env node
/**
 * Prints every secret the backend needs, ready to paste into the host's
 * environment. Run after `npm install`:
 *
 *   npm run gen:secrets
 *
 * Nothing here touches the network or the chain — it only generates keys.
 * The payer and the three fee wallets are fresh Solana keypairs; fund the
 * payer with a little devnet SOL before launching (see DEPLOY.md).
 *
 * Keep this output secret. MASTER_KEY in particular: losing it loses every
 * agent wallet, so back it up somewhere other than the server.
 */
import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

function solWallet() {
  const kp = Keypair.generate();
  return { pubkey: kp.publicKey.toBase58(), secret: bs58.encode(kp.secretKey) };
}

const payer = solWallet();
const feeWallet = solWallet();
const credits = solWallet();
const buyback = solWallet();

const masterKey = randomBytes(32).toString("base64"); // seals agent wallets at rest
const signerToken = randomBytes(32).toString("hex");  // api/worker ↔ signer shared secret

const out = `
# ───────────────────────────────────────────────────────────────────────────
# BUREAU secrets — generated ${new Date().toISOString()}
# Paste these into your host's environment. Keep them private; never commit.
# ───────────────────────────────────────────────────────────────────────────

# Seals agent wallet keys at rest. BACK THIS UP off-server — losing it loses
# every agent wallet.
MASTER_KEY=${masterKey}

# Shared secret between the API/worker and the signer.
SIGNER_TOKEN=${signerToken}

# Pays network fees for upkeep. FUND THIS with ~1 SOL (devnet: use a faucet).
# Public key (fund this):  ${payer.pubkey}
PLATFORM_PAYER_SECRET=${payer.secret}

# Where the non-agent shares of creator fees land. Three different addresses.
PLATFORM_FEE_WALLET=${feeWallet.pubkey}
CREDITS_WALLET=${credits.pubkey}
BUYBACK_WALLET=${buyback.pubkey}

# ── keep these secret keys somewhere safe if you want to withdraw from the
#    fee wallets later (they are NOT needed by the server) ──
# PLATFORM_FEE_WALLET secret: ${feeWallet.secret}
# CREDITS_WALLET secret:      ${credits.secret}
# BUYBACK_WALLET secret:      ${buyback.secret}
`;

process.stdout.write(out);
