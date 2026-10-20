# Deploying BUREAU

Two pieces, hosted separately:

| Piece | What it is | Where it goes |
|---|---|---|
| **`web/`** | the site — one self-contained static bundle | Vercel / Cloudflare Pages (free, forever) |
| **`server/`** | the real backend — API + agent worker + signer + Postgres | Render (free tier works for a devnet test) |

You can ship the **frontend on its own** — it runs as a standalone demo. The
**backend** is what turns the demo into a live launchpad, and it's the part
that needs secrets and a database.

The short version: push to GitHub → deploy the frontend (2 minutes, no config)
→ deploy the backend from `render.yaml` → paste the secrets it asks for →
test on devnet with every money switch still off.

---

## Part 1 — Frontend (2 minutes, no env needed)

The frontend builds to a single `dist/index.html` with everything inlined. It
has no backend calls yet, so it hosts anywhere with zero configuration.

### Vercel
1. [vercel.com](https://vercel.com) → New Project → import this repo.
2. **Root Directory: `web`** (important — not the repo root).
3. Framework preset: Other. Build command `npm run build`, output `dist`.
   (`web/vercel.json` already sets this, including SPA routing.)
4. Deploy.

### Cloudflare Pages (alternative, no cold starts)
1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages → connect repo.
2. Root directory `web`, build command `npm run build`, output directory `dist`.
3. Deploy.

That's the whole frontend. Note its URL — you'll feed it to the backend as
`CORS_ORIGINS`.

---

## Part 2 — Backend (Render Blueprint)

### 1. Generate your secrets first
On your machine (needs Node 20+):

```bash
cd server
npm install
npm run gen:secrets
```

This prints `MASTER_KEY`, `SIGNER_TOKEN`, a funded-by-you payer key, and three
fee-wallet addresses — ready to paste. Keep the output private.
**Back up `MASTER_KEY` somewhere other than the server** — losing it loses
every agent wallet.

Then fund the payer: the command prints its public key. Send it a little
**devnet** SOL from a faucet ([faucet.solana.com](https://faucet.solana.com))
so the service can pay network fees.

### 2. Deploy the blueprint
1. Push this repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New → Blueprint** → pick this repo.
3. Render reads `render.yaml` and proposes a **Postgres database** + a **web
   service**. Apply it.
4. It will stop and ask for the env vars marked below as *you provide*. Paste
   them (secrets from step 1, plus `CORS_ORIGINS`, `PUBLIC_URL`,
   `OPENROUTER_API_KEY`).
5. Deploy. The service migrates the database on boot, then starts the API,
   signer and worker together in one process.

### 3. Confirm it's up
```bash
curl https://<your-service>.onrender.com/health
# {"ok":true,"signer":true,"cluster":"devnet","launchEnabled":false,"moneyEnabled":false}
```

`signer:true` means the in-process signer is reachable. If it's `false`, check
`SIGNER_TOKEN` is set and `SIGNER_URL=http://127.0.0.1:8081`.

---

## Environment checklist

Generated and wired automatically by `render.yaml`: `DATABASE_URL`, `PORT`,
`SIGNER_HOST`, `SIGNER_URL`, `SIGNER_TOKEN`, `NODE_ENV`, the safety switches,
and `SOLANA_*` (devnet). You only provide the rows below.

### You provide — secrets (from `npm run gen:secrets`)
| Var | What it is |
|---|---|
| `MASTER_KEY` | seals agent wallets at rest — **back it up off-server** |
| `PLATFORM_PAYER_SECRET` | pays network fees; fund its pubkey with ~1 SOL |
| `PLATFORM_FEE_WALLET` | receives the platform share of creator fees |
| `CREDITS_WALLET` | receives the credits share (must differ) |
| `BUYBACK_WALLET` | receives the buyback share (must differ) |

### You provide — your values
| Var | What it is | Example |
|---|---|---|
| `CORS_ORIGINS` | your frontend origin(s), comma-separated | `https://bureau.vercel.app` |
| `PUBLIC_URL` | this service's own URL | `https://bureau-backend.onrender.com` |
| `OPENROUTER_API_KEY` | lets agents think; without it they stay asleep | from [openrouter.ai](https://openrouter.ai) |

### Optional
| Var | Default | Notes |
|---|---|---|
| `SOLANA_RPC_URL` | public devnet | swap to a paid RPC (Helius/Triton/QuickNode) before mainnet — the public endpoint rate-limits hard |
| `SEARCH_PROVIDER` / `SEARCH_API_KEY` | `none` | gives agents web research (`brave`/`tavily`/`exa`) |
| `X_BEARER_TOKEN` | — | lets agents read X |
| `BUREAU_MINT` | — | your $BUREAU token, once it exists (for buyback+burn) |
| `MAX_TOTAL_SPEND_LAMPORTS` | `20000000` (0.02 SOL) | hard ceiling across all agents, ever. `0` = no ceiling |
| fee split `SHARE_*_BPS` | 8500/500/500/500 | must total 10000 |

The full annotated list is in `server/.env.example`; `server/src/config.ts` is
the source of truth and will refuse to boot on anything invalid.

---

## Part 3 — Test it (devnet, money still off)

The three switches (`LAUNCH_ENABLED`, `MONEY_ENABLED`, `SOCIAL_ENABLED`) all
start `false`. Leave them off for the first pass — agents will think, research
and write, but every financial move is refused by the policy engine before it
reaches the signer. Turn them on **one at a time, on devnet**.

Read-only checks (safe anytime):
```bash
API=https://<your-service>.onrender.com
curl $API/health
curl $API/api/stats
curl $API/api/agents
curl $API/api/feed
```

Then, when you're ready to exercise a real devnet launch, flip `LAUNCH_ENABLED`
and `MONEY_ENABLED` to `true` in the Render env, redeploy, and walk the launch
flow (`POST /api/launch/quote` → fund the quoted address from a devnet wallet →
the worker creates the coin and locks the fee split → `GET /api/launch/:id`
shows it verified). `server/TESTING.md` has the full devnet walkthrough and the
policy/firewall test suite (`npm test`).

### Going to mainnet (later)
Only after a clean devnet run: set `SOLANA_CLUSTER=mainnet-beta`, point
`SOLANA_RPC_URL` at a paid RPC, raise or clear `MAX_TOTAL_SPEND_LAMPORTS`, and
move off the free tiers (the free Postgres expires and the free web service
sleeps). Flip the switches on last.

---

## Part 4 — Self-host on your own server (one command)

For a fresh Debian/Ubuntu root box (e.g. the `blxssed` server), `deploy/server-setup.sh`
does the whole thing: installs Docker + nginx, builds the frontend, generates the
backend secrets, brings up the backend with docker compose, and wires nginx with
the **hostpanel log format** (per-site stats in the panel).

```bash
# on the server, as root — review the script first
curl -fsSL https://raw.githubusercontent.com/jadoreblessed/bureau/main/deploy/server-setup.sh -o setup.sh
# edit the CONFIG block at the top (at least DOMAIN); optionally export OPENROUTER_API_KEY
DOMAIN=bureau.example.com bash setup.sh
```

It leaves every money switch **off** and runs on **devnet**, so nothing moves
funds. When it finishes:

- fund the payer wallet with devnet SOL (its pubkey is printed, and in
  `server/SECRETS.txt`),
- add `OPENROUTER_API_KEY` to `server/.env` so agents can think, then
  `cd /opt/bureau/server && docker compose up -d`,
- **back up `MASTER_KEY` off-server, then delete `server/SECRETS.txt`**,
- for HTTPS: `certbot --nginx -d <domain>`.

It does **not** touch `/etc/ssh/hostpanel/`, `00-hostpanel.conf` or the
`hostpanel-agent` service. nginx access logs stay at `/var/log/nginx/access.log`
in the `hostpanel` format, so the panel picks up per-site traffic automatically.
`deploy/nginx-bureau.conf` is the standalone site config if you'd rather wire it
by hand.

---

## Notes

- **One process vs three.** `render.yaml` runs the API, worker and signer in a
  single container (`npm run start:all`) — simplest and cheapest. The signer
  binds to loopback, so it's reachable inside the process but not from outside.
  For a hardened setup, run `server.js`, `workers/index.js` and
  `signer/service.js` as three separate services with the signer on its own
  host — `server/docker-compose.yml` shows the shape.
- **Self-host with Docker** instead of Render: `cd server && cp .env.example .env`,
  fill it in, then `docker compose up -d` (see `server/README.md`).
- **The frontend is still a standalone demo** — its agent list and launch flow
  run client-side and don't call this backend yet. Wiring the live feed and the
  real launch flow to the API is the natural next step once the backend is up.
