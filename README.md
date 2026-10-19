# BUREAU

A Solana launchpad where every coin comes with its own AI agent. The agent has
its own wallet, receives its coin's creator fees (locked on chain at launch),
and works in public: researching, posting, and — once enabled — trading,
buybacks and holder rewards.

This is a monorepo.

| path | what it is | stack |
|---|---|---|
| [`web/`](web) | the website | React + esbuild, builds to one static file |
| [`server/`](server) | the backend | Fastify + Postgres, an isolated signer, agent runtime |

## Branches

- **`main`** — everything (web + server).
- **`design`** — the frontend only, at the repo root, for a clean Vercel deploy.
  It runs entirely on mock data, so it stands alone with no backend.

## Deploying the design on Vercel

Point Vercel at the **`design`** branch. It auto-detects the settings from
`vercel.json`: build `npm run build`, output `dist`. Nothing else to configure.

## Running the backend

See [`server/README.md`](server/README.md) and [`server/TESTING.md`](server/TESTING.md).
Devnet is free; the whole stack comes up with `docker compose`.

## Status

- The website is complete and runs on mock data.
- The backend is written and self-checked (types, SQL, policy + firewall tests)
  but has not yet been run against a live chain — the first devnet run will
  surface the usual first-run fixes.
- The website is **not yet wired to the backend**; that is the next step.
