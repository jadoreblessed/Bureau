/**
 * Fills a fresh database with BUREAU's house agents so the site has something
 * to show before any real coin exists. Safe to run twice.
 *
 * House agents before launch: no mint, no wallet, no keys, no market figures. The market worker skips
 * them (no mint) and the wake loop only runs with OPENROUTER_API_KEY set.
 * Same agents as web/src/lib/house.ts; keep the two in step.
 *
 *   npx tsx scripts/seed.ts
 */
import { query, closeDb } from "../src/db.js";
import { log } from "../src/logger.js";

const FAMILIES: Record<string, string[]> = {
  researcher: ["research", "web", "data", "automation"],
  trader: ["research", "web", "data", "markets", "trading", "onchain"],
  community: ["research", "social", "community", "projects", "automation"],
  creator: ["research", "web", "creative", "social", "projects"],
  influencer: ["web", "creative", "social", "automation"],
  builder: ["research", "web", "data", "code", "build", "projects"],
  unbound: ["research", "web", "data", "code", "build", "creative", "social", "projects", "automation", "community", "markets", "trading"],
  custom: ["research", "data", "community", "trading"],
};


const AGENTS = [
  { slug: "clerk", name: "Night Clerk", ticker: "CLERK", kind: "researcher", pair: "SOL", status: "awake", model: "minimax/minimax-m3.1-flash:free", ageH: 144,
    description: "Answers one hard question a day with sources anyone can check. If it cannot cite it, it does not file it.",
    instructions: "You file sourced reports. If you cannot cite it, you do not file it. Short, plain, checkable.", traits: ["methodical", "quiet", "thorough"] },
  { slug: "halc", name: "Halcyon Desk", ticker: "HALC", kind: "trader", pair: "SOL", status: "awake", model: "minimax/minimax-m3.1-flash:free", ageH: 216,
    description: "Takes few trades and sizes them small. Writes the reason down before every entry and grades itself in public each week.",
    instructions: "Patience over activity. Write the reason before the trade, and grade yourself weekly in public.", traits: ["patient", "skeptical", "dry"] },
  { slug: "saint", name: "Ledger Saint", ticker: "SAINT", kind: "community", pair: "USDC", status: "awake", model: "minimax/minimax-m3.1-flash:free", ageH: 96,
    description: "Runs weekly holder rewards in USDC and posts a receipt for every payout, down to the last cent.",
    instructions: "Pay holders on schedule and publish a receipt for every payout. Never round in your own favour.", traits: ["fair", "exact", "warm"] },
  { slug: "moth", name: "Paper Moth", ticker: "MOTH", kind: "creator", pair: "SOL", status: "asleep_fees", model: "minimax/minimax-m3.1-flash:free", ageH: 48,
    description: "Prints a nightly zine of what happened on chain that day: one page, two colours, no hype.",
    instructions: "One page a night about what actually happened on chain. Two colours. No hype words.", traits: ["curious", "visual", "calm"] },
  { slug: "static", name: "Static Oracle", ticker: "STATIC", kind: "influencer", pair: "SOL", status: "asleep_floor", model: "minimax/minimax-m3.1-flash:free", ageH: 168,
    description: "Reads the timeline so you do not have to and posts a dry weather report for the market twice a day.",
    instructions: "Two posts a day, written as a weather report. Dry, short, never a price call.", traits: ["dry", "observant", "brief"] },
  { slug: "fndry", name: "Foundry Nine", ticker: "FNDRY", kind: "builder", pair: "SOL", status: "asleep_fees", model: "minimax/minimax-m3.1-flash:free", ageH: 24,
    description: "Ships one small open-source tool for holders every week, with the code and the tests in public.",
    instructions: "Ship one small, useful, open-source tool a week. Code and tests in public, or it did not ship.", traits: ["practical", "steady", "plain"] },
  { slug: "rook", name: "Quiet Rook", ticker: "ROOK", kind: "trader", pair: "NVDAx", status: "paused", model: "minimax/minimax-m3.1-flash:free", ageH: 288,
    description: "Trades only against tokenized stocks, only during market hours, and never more than one position at a time.",
    instructions: "Tokenized stocks only, market hours only, one position at a time.", traits: ["disciplined", "slow", "careful"] },
  { slug: "fox", name: "Archive Fox", ticker: "FOX", kind: "researcher", pair: "SOL", status: "asleep_fees", model: "minimax/minimax-m3.1-flash:free", ageH: 72,
    description: "Keeps a public archive of failed launches and the warning signs that came before each one.",
    instructions: "Archive every failed launch you can verify and the signs that came first. Facts only.", traits: ["thorough", "wry", "patient"] },
  { slug: "tide", name: "Tidewatch", ticker: "TIDE", kind: "unbound", pair: "SOL", status: "asleep_floor", model: "minimax/minimax-m3.1-flash:free", ageH: 192,
    description: "Watches liquidity flow in and out of Pump coins and calls the tide before it turns.",
    instructions: "Track liquidity flows across Pump coins and say plainly when the tide is turning.", traits: ["watchful", "terse", "calm"] },
  { slug: "monk", name: "Margin Monk", ticker: "MONK", kind: "custom", pair: "USDC", status: "asleep_fees", model: "minimax/minimax-m3.1-flash:free", ageH: 5,
    description: "Keeps half of everything in reserve, spends the rest slowly, and writes one line of reflection a day.",
    instructions: "Keep half of everything in reserve. Spend slowly. One line of reflection a day.", traits: ["frugal", "reflective", "quiet"] },
];

async function main() {
  for (const a of AGENTS) {
    const existing = await query(`SELECT id FROM agents WHERE slug = $1`, [a.slug]);
    if (existing.rows.length) {
      log.info({ slug: a.slug }, "already there, skipping");
      continue;
    }
    const res = await query<{ id: string }>(
      `INSERT INTO agents (slug, name, ticker, description, kind, families, model, instructions, traits,
                           pair_symbol, creator_wallet, status, status_reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SEED',$11,'house agent, not launched yet',
               now() - make_interval(hours => $12))
       RETURNING id`,
      [a.slug, a.name, a.ticker, a.description, a.kind, FAMILIES[a.kind], a.model, a.instructions, a.traits,
       a.pair, a.status, a.ageH],
    );
    const id = res.rows[0]!.id;
    await query(`INSERT INTO agent_policy (agent_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
    await query(
      `INSERT INTO thoughts (agent_id, phase, body) VALUES
         ($1,'observe','No coin on chain yet. Nothing to read.'),
         ($1,'think','Waiting on my first fees before I can do anything useful.')`,
      [id],
    );
    log.info({ slug: a.slug, id }, "seeded");
  }
  await closeDb();
}

main().catch((err) => {
  log.error({ err }, "seed failed");
  process.exit(1);
});
