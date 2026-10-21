import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { query, one } from "../db.js";
import { notFound, send } from "../http/errors.js";

/** Public reads: the catalogue, one coin, its thinking, its moves. */

const listQuery = z.object({
  kind: z.string().optional(),
  status: z.string().optional(),
  pair: z.string().optional(),
  q: z.string().max(80).optional(),
  sort: z.enum(["mcap", "fees", "holders", "new", "awake"]).default("mcap"),
  limit: z.coerce.number().int().min(1).max(100).default(48),
  offset: z.coerce.number().int().min(0).default(0),
  creator: z.string().optional(),
});

const SORTS: Record<string, string> = {
  mcap: "mcap_usd DESC",
  fees: "fees_earned_lamports DESC",
  holders: "holders DESC",
  new: "created_at DESC",
  awake: "(status = 'awake') DESC, mcap_usd DESC",
};

const CARD = `id, slug, name, ticker, kind, families, pair_symbol, model, mint, agent_wallet,
  status, paused_by_dev, mcap_usd, vol_1h_usd, holders, bonding_pct, graduated,
  fees_earned_lamports, image_url, description, next_wake_at, created_at`;

export async function agentRoutes(app: FastifyInstance) {
  app.get("/agents", async (req, reply) => {
    try {
      const p = listQuery.parse(req.query);
      const where: string[] = ["status <> 'pending'"];
      const params: unknown[] = [];
      const add = (clause: string, value: unknown) => {
        params.push(value);
        where.push(clause.replace("$?", `$${params.length}`));
      };
      if (p.kind && p.kind !== "all") add("kind = $?", p.kind);
      if (p.pair && p.pair !== "all") add("pair_symbol = $?", p.pair);
      if (p.creator) add("creator_wallet = $?", p.creator);
      if (p.status && p.status !== "all") {
        if (p.status === "asleep") where.push("status IN ('asleep_fees','asleep_floor')");
        else add("status = $?", p.status);
      }
      if (p.q) add("(name ILIKE '%' || $? || '%' OR ticker ILIKE '%' || $? || '%' OR mint = $?)", p.q);

      const sql = `SELECT ${CARD} FROM agents WHERE ${where.join(" AND ")}
        ORDER BY ${SORTS[p.sort] ?? SORTS.mcap} LIMIT ${p.limit} OFFSET ${p.offset}`;
      const { rows } = await query(sql, params);
      const total = await one<{ n: string }>(`SELECT COUNT(*) AS n FROM agents WHERE ${where.join(" AND ")}`, params);
      return { agents: rows, total: Number(total?.n ?? 0) };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.get("/agents/:slug", async (req, reply) => {
    try {
      const { slug } = req.params as { slug: string };
      const agent = await one(
        `SELECT ${CARD}, instructions, traits, links, sharing_config, fees_locked, launch_sig, wake_count, last_wake_at, status_reason
           FROM agents WHERE slug = $1 OR id::text = $1 OR mint = $1`,
        [slug],
      );
      if (!agent) throw notFound("no such agent");
      const id = (agent as { id: string }).id;
      const [mission, memories, policy] = await Promise.all([
        one(`SELECT title, goal_label, target, progress FROM missions WHERE agent_id = $1 AND active ORDER BY created_at DESC LIMIT 1`, [id]),
        query(`SELECT kind, body, created_at FROM memories WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
        one(`SELECT trading_enabled, payouts_enabled, burns_enabled, max_per_move_lamports,
                    max_per_day_lamports, reserve_floor_lamports
               FROM agent_policy WHERE agent_id = $1`, [id]),
      ]);
      return { agent, mission, memories: memories.rows, policy };
    } catch (err) {
      return send(reply, err);
    }
  });

  /** Token metadata (Metaplex JSON) for coins whose IPFS upload fell back to us. */
  app.get("/meta/:file", async (req, reply) => {
    try {
      const slug = (req.params as { file: string }).file.replace(/\.json$/, "");
      const a = await one<{ name: string; ticker: string; description: string; image_url: string | null; links: { x?: string; telegram?: string } }>(
        // the URI on chain keeps the slug the coin launched with, even if the slug changes later
        `SELECT name, ticker, description, image_url, links FROM agents
          WHERE slug = $1 OR metadata_uri LIKE '%/api/meta/' || $1 || '.json' LIMIT 1`,
        [slug],
      );
      if (!a) throw notFound("no such agent");
      const site = config.PUBLIC_URL.replace(/\/$/, "");
      return {
        name: a.name,
        symbol: a.ticker,
        description: a.description,
        image: a.image_url ?? "",
        showName: true,
        createdOn: site,
        website: `${site}/#/agent/${slug}`,
        ...(a.links?.x ? { twitter: a.links.x } : {}),
        ...(a.links?.telegram ? { telegram: a.links.telegram } : {}),
      };
    } catch (err) {
      return send(reply, err);
    }
  });

  /** The live console: what the agent is thinking, newest last. */
  app.get("/agents/:slug/thoughts", async (req, reply) => {
    try {
      const { slug } = req.params as { slug: string };
      const { after, limit } = z
        .object({ after: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(200).default(60) })
        .parse(req.query);
      const agent = await one<{ id: string }>(`SELECT id FROM agents WHERE slug = $1 OR id::text = $1`, [slug]);
      if (!agent) throw notFound("no such agent");
      const { rows } = await query(
        after === undefined
          ? `SELECT id, phase, body, meta, created_at FROM thoughts WHERE agent_id = $1 ORDER BY id DESC LIMIT $2`
          : `SELECT id, phase, body, meta, created_at FROM thoughts WHERE agent_id = $1 AND id > $3 ORDER BY id ASC LIMIT $2`,
        after === undefined ? [agent.id, limit] : [agent.id, limit, after],
      );
      return { thoughts: after === undefined ? rows.reverse() : rows };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.get("/agents/:slug/moves", async (req, reply) => {
    try {
      const { slug } = req.params as { slug: string };
      const agent = await one<{ id: string }>(`SELECT id FROM agents WHERE slug = $1 OR id::text = $1`, [slug]);
      if (!agent) throw notFound("no such agent");
      const { rows } = await query(
        `SELECT kind, amount_lamports, status, reject_reason, signature, confirmed_at, created_at
           FROM intents WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [agent.id],
      );
      return { moves: rows };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.get("/agents/:slug/posts", async (req, reply) => {
    try {
      const { slug } = req.params as { slug: string };
      const agent = await one<{ id: string }>(`SELECT id FROM agents WHERE slug = $1 OR id::text = $1`, [slug]);
      if (!agent) throw notFound("no such agent");
      const { rows } = await query(
        `SELECT platform, body, posted_at, created_at FROM posts
          WHERE agent_id = $1 AND posted_at IS NOT NULL ORDER BY created_at DESC LIMIT 40`,
        [agent.id],
      );
      return { posts: rows };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.get("/agents/:slug/chart", async (req, reply) => {
    try {
      const { slug } = req.params as { slug: string };
      const agent = await one<{ id: string }>(`SELECT id FROM agents WHERE slug = $1 OR id::text = $1`, [slug]);
      if (!agent) throw notFound("no such agent");
      const { rows } = await query(
        `SELECT mcap_usd, price_usd, created_at FROM market_snapshots
          WHERE agent_id = $1 AND created_at > now() - interval '7 days'
          ORDER BY created_at ASC LIMIT 500`,
        [agent.id],
      );
      return { points: rows };
    } catch (err) {
      return send(reply, err);
    }
  });

  /** The home page feed: what every agent did recently. */
  app.get("/feed", async (_req, reply) => {
    try {
      const { rows } = await query(
        `SELECT t.id, t.phase, t.body, t.created_at,
                a.slug, a.ticker, a.name, a.image_url
           FROM thoughts t JOIN agents a ON a.id = t.agent_id
          WHERE t.phase IN ('act','research','learn')
          ORDER BY t.id DESC LIMIT 30`,
      );
      return { feed: rows };
    } catch (err) {
      return send(reply, err);
    }
  });
}
