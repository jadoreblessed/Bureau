# Testing BUREAU for ≤ 0.05 SOL

## The short version

**Devnet is free.** Devnet SOL comes from a faucet, so a full functional run —
launching a coin, locking the fee split, sweeping fees, waking an agent, a
buyback — costs **0 real SOL**. Do all of your testing here first.

Real SOL is only needed for a **mainnet** smoke test, and that is bounded below
0.05 SOL by design.

## Free: the full devnet run

```bash
cp .env.test .env         # fill the three TODO secrets (keygen + openssl)
solana-keygen new -o payer.json
solana airdrop 2 $(solana address -k payer.json) --url devnet   # free
docker compose up -d db
docker compose run --rm api node dist/util/migrate.js
docker compose up -d
API_URL=http://localhost:8080 npx tsx scripts/smoke.ts
```

Then, with `LAUNCH_ENABLED=true`, walk one launch through from the site. Every
SOL you spend here is faucet SOL. Repeat until it is boring.

Note: the Pump program lives on **mainnet**. If Pump has no devnet deployment,
the create / lock / sweep steps can only be exercised against mainnet — so the
free devnet run covers everything *except* the Pump calls, and the paid run
below covers those.

## Paid: one mainnet smoke test, bounded under 0.05 SOL

Flip `.env` to `SOLANA_CLUSTER=mainnet-beta` with a paid RPC, keep
`MAX_TOTAL_SPEND_LAMPORTS=20000000`, and fund the payer with **0.05 SOL**.

Where that 0.05 goes, worst case:

| step | ~cost | why |
|---|---|---|
| launch one coin, dev buy = 0 | ~0.025 SOL | mint + accounts rent and tx fees |
| a 0.005 SOL dev buy, then sell it back | ~0.005 SOL net | generates creator fees to sweep |
| fee sweeps + buyback + all tx fees | < 0.005 SOL | base fees are ~0.000005 each |
| **ceiling on everything agents spend** | **0.02 SOL** | `MAX_TOTAL_SPEND_LAMPORTS` |

The ceiling is a hard stop in the policy engine: across **every** agent, ever,
total confirmed spend cannot pass it. Set it lower to test tighter.

## The three switches, in order

Turn them on one at a time and watch a full cycle each time:

1. `LAUNCH_ENABLED=true` — launch and verify a coin. Still no agent spending.
2. `OPENROUTER_API_KEY=...` — the agent wakes and thinks. Costs OpenRouter
   credits in USD (a Haiku wake is a fraction of a cent), not SOL.
3. `MONEY_ENABLED=true` — the agent can buy back, burn and reward. Bounded by
   the per-move caps and the deployment ceiling above.

## What costs nothing at all

`npm test` runs the policy engine and firewall with no database, no chain and no
install. Run it on every change.
