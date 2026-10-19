# BUREAU — backend

Launches Solana coins that each own an AI agent, routes creator fees to that
agent on chain, and runs the agent's wake loop.

Three processes, one image:

| process | what it does | reachable from |
|---|---|---|
| `api` | REST for the website | the internet |
| `worker` | launches, fee sweeps, market refresh, wakes | nothing |
| `signer` | **the only thing that can open an agent wallet** | api + worker only |

## How a launch works

1. `POST /api/launch/quote` — the agent's wallet is generated and sealed, and
   the dev is quoted an exact amount.
2. The dev sends **one transfer** to that address from their own wallet. They
   sign a plain transfer they can read in Phantom, never a transaction we built.
3. The worker sees the money, uploads metadata, and asks the signer to create
   the coin **with the agent wallet as the Pump creator**.
4. The signer locks the fee split with Pump's `update_fee_shares_v2`. Pump then
   revokes the admin, so the split can never change — not by the dev, not by us.
5. The verifier reads the split back off the chain. A coin is only "live" once
   the chain agrees with what the site promised.

Because the creator is a wallet only the signer can open, "100% of creator fees
go to the agent, locked on chain" is true by construction rather than by policy.

## How an agent acts

`observe → research → think → act → learn`, bounded by wall clock, tool budget
and model turns.

Nothing the model produces becomes a transaction. It proposes a **typed
intent**; the intent is recorded, run through the policy engine, and only then
handed to the signer — which checks it again with its own copy of the engine.
A refusal is written down as publicly as an action.

Hard limits live in `agent_policy` and belong to the platform. The dev can
change the model, the instructions and the pause switch. They cannot raise a
cap, and neither can the agent.

Everything the agent reads from outside passes `src/agent/firewall.ts` first.

## Running it

```bash
cp .env.example .env     # then fill it in — see below
docker compose up -d db
docker compose run --rm api node dist/util/migrate.js
docker compose up -d
curl localhost:8080/health
```

Without Docker: Node 22, a Postgres, then `npm install && npm run migrate` and
`npm run dev`, `npm run dev:worker`, `npm run dev:signer` in three terminals.

### What you must fill in

```bash
openssl rand -base64 32   # MASTER_KEY
openssl rand -hex 32      # SIGNER_TOKEN
solana-keygen new -o payer.json   # PLATFORM_PAYER_SECRET (paste the array)
```

Then three different addresses for `PLATFORM_FEE_WALLET`, `CREDITS_WALLET` and
`BUYBACK_WALLET`, and an `OPENROUTER_API_KEY` if you want agents to think.

**`MASTER_KEY` is the whole system.** It decrypts every agent wallet. Lose it
and every agent's funds are gone; leak it and so is everything else. Keep a copy
somewhere that is not the server, and do not put it in the repo.

### The three switches

All three ship **off**:

```
LAUNCH_ENABLED=false   # creating real coins
MONEY_ENABLED=false    # agents moving funds at all
SOCIAL_ENABLED=false   # posting to connected accounts
```

With `MONEY_ENABLED=false` the financial tools are not even offered to the
model, so agents plan around what they can actually do instead of promising
holders a buyback they cannot deliver.

Turn them on one at a time, on devnet, and watch a full cycle each time.

## Before mainnet

Everything below runs against the real Pump program, and the parts that move
money have **not been run against a live chain from here**. On devnet, confirm
in this order:

1. A launch end to end, then read the sharing config with `readFeeLock` and
   check the shares are yours and `locked` is true.
2. A fee sweep: trade the coin, wait for `claimFees`, confirm the agent wallet
   balance rose by the share you expect.
3. One wake with `OPENROUTER_API_KEY` set, reading the thoughts table.
4. Only then `MONEY_ENABLED=true`, with the caps set low, and watch the first
   buyback land.

The Pump SDK call shapes in `src/chain/pump.ts` follow Pump's published
instruction docs. If a release renames something, that file is the only one to
change — nothing else imports the SDK.

## Operational notes

- Use a paid RPC. The public devnet endpoint will drop launches under load.
- Keep ~1 SOL on the platform payer; it pays fees for sweeps and buybacks.
- Two worker containers are safe: every job takes a short lease first.
- The signer must never be published to the host. In compose it has `expose`
  and no `ports`, which is the point.
- `GET /health` reports whether the signer is reachable and which switches are on.

## Layout

```
migrations/      numbered SQL, applied in order
src/chain/       Solana: rpc, wallets, pump, market data, metadata
src/policy/      the limits, and the facts they are checked against
src/signer/      the isolated signer and the intent builder
src/agent/       firewall, prompt, tools, model client, wake loop
src/routes/      REST
src/workers/     the background loop
tests/           policy and firewall, dependency-free: npm test
```

`npm test` runs without installing anything.
