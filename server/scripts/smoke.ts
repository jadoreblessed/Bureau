/**
 * End-to-end smoke test. Drives the running API and reports what works.
 *
 * It spends NO SOL by itself: it checks wiring (health, reads, auth shape, a
 * launch quote) and prints the exact, bounded steps that do cost SOL so you can
 * run them by hand on devnet. Point it at a running stack:
 *
 *   API_URL=http://localhost:8080 npx tsx scripts/smoke.ts
 */
const API = process.env.API_URL ?? "http://localhost:8080";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}${detail ? "  — " + detail : ""}`);
  cond ? pass++ : fail++;
};

async function get(path: string) {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  console.log(`\nBUREAU smoke test → ${API}\n`);

  const health = await get("/health");
  ok("GET /health", health.status === 200, `signer=${health.body.signer} cluster=${health.body.cluster}`);
  ok("  signer reachable", health.body.signer === true, health.body.signer ? "" : "start the signer");

  const stats = await get("/api/stats");
  ok("GET /api/stats", stats.status === 200, `${stats.body.agents} agents, switches ${JSON.stringify(stats.body.switches)}`);

  const agents = await get("/api/agents?limit=5");
  ok("GET /api/agents", agents.status === 200, `${agents.body.agents?.length ?? 0} returned`);

  const feed = await get("/api/feed");
  ok("GET /api/feed", feed.status === 200);

  // Auth shape: a challenge should come back for a well-formed address.
  const addr = "So11111111111111111111111111111111111111112";
  const challenge = await post("/auth/challenge", { wallet: addr }).catch(() => ({ status: 0, body: {} }));
  // /auth is mounted under /api
  const ch = challenge.status === 404 ? await post("/api/auth/challenge", { wallet: addr }) : challenge;
  ok("POST /api/auth/challenge", ch.status === 200 && typeof ch.body.nonce === "string");

  // A launch quote needs a real session, so we only confirm it refuses without one.
  const quoteNoAuth = await post("/api/launch/quote", { name: "Test", ticker: "TEST", model: "anthropic/claude-haiku-4.5" });
  ok("POST /api/launch/quote without auth is refused", quoteNoAuth.status === 401);

  console.log(`\n${pass} passed, ${fail} failed\n`);

  console.log("Steps that cost SOL (run by hand, devnet is free):");
  console.log("  1. Fund the payer:   solana airdrop 2 <payer> --url devnet");
  console.log("  2. Sign in, POST /api/launch/quote, send the quoted SOL to the funding address");
  console.log("  3. Watch GET /api/launch/:id until stage = 'verified'");
  console.log("  4. Confirm the split on chain, then flip MONEY_ENABLED and watch one buyback");
  console.log("  The spend ceiling (MAX_TOTAL_SPEND_LAMPORTS) bounds step 4.\n");

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke test could not reach the API:", err instanceof Error ? err.message : err);
  process.exit(1);
});
