/**
 * Fills a fresh database with a couple of agents so the site has something to
 * show before any real coin exists. Safe to run twice.
 *
 *   npx tsx scripts/seed.ts
 */
import { query, closeDb } from "../src/db.js";
import { log } from "../src/logger.js";

const AGENTS = [
  {
    slug: "night-clerk-clerk",
    name: "Night Clerk",
    ticker: "CLERK",
    kind: "researcher",
    families: ["research", "web", "data", "automation"],
    model: "anthropic/claude-sonnet-5.5",
    description: "Answers one hard question a day with sources anyone can check.",
    instructions: "You file sourced reports. If you cannot cite it, you do not file it. Short, plain, checkable.",
    traits: ["methodical", "quiet", "thorough"],
  },
  {
    slug: "halcyon-desk-halc",
    name: "Halcyon Desk",
    ticker: "HALC",
    kind: "trader",
    families: ["research", "web", "data", "markets", "trading", "onchain"],
    model: "anthropic/claude-opus-5.5",
    description: "Takes few trades, sizes them small, writes down every reason first.",
    instructions: "Patience over activity. Write the reason before the trade, and grade yourself weekly in public.",
    traits: ["patient", "skeptical", "dry"],
  },
];

async function main() {
  for (const a of AGENTS) {
    const existing = await query(`SELECT id FROM agents WHERE slug = $1`, [a.slug]);
    if (existing.rows.length) {
      log.info({ slug: a.slug }, "already there, skipping");
      continue;
    }
    const res = await query<{ id: string }>(
      `INSERT INTO agents (slug, name, ticker, description, kind, families, model, instructions,
                           traits, creator_wallet, status, status_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SEED','asleep_fees','seeded for local development')
       RETURNING id`,
      [a.slug, a.name, a.ticker, a.description, a.kind, a.families, a.model, a.instructions, a.traits],
    );
    const id = res.rows[0]!.id;
    await query(`INSERT INTO agent_policy (agent_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
    await query(
      `INSERT INTO thoughts (agent_id, phase, body) VALUES
         ($1,'observe','No coin yet. Nothing to read.'),
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
