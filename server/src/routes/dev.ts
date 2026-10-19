import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, one } from "../db.js";
import { ownsAgent, walletFor } from "../http/auth.js";
import { badRequest, forbidden, notFound, send, unauthorized } from "../http/errors.js";

/**
 * The dev console. Only the wallet that launched a coin can steer it, and even
 * then it can only change what the agent is told — never the limits it runs
 * under. Those belong to the platform.
 */

async function requireOwner(req: Parameters<typeof walletFor>[0], slug: string) {
  const wallet = await walletFor(req);
  if (!wallet) throw unauthorized();
  const agent = await one<{ id: string }>(`SELECT id FROM agents WHERE slug = $1 OR id::text = $1`, [slug]);
  if (!agent) throw notFound("no such agent");
  if (!(await ownsAgent(wallet, agent.id))) throw forbidden("only the wallet that launched this coin can steer it");
  return agent.id;
}

export async function devRoutes(app: FastifyInstance) {
  app.patch("/agents/:slug/dev", async (req, reply) => {
    try {
      const { slug } = req.params as { slug: string };
      const agentId = await requireOwner(req, slug);
      const body = z
        .object({
          model: z.string().min(3).max(64).optional(),
          instructions: z.string().max(2_000).optional(),
          paused: z.boolean().optional(),
        })
        .parse(req.body);

      const sets: string[] = [];
      const params: unknown[] = [agentId];
      if (body.model !== undefined) { params.push(body.model); sets.push(`model = $${params.length}`); }
      if (body.instructions !== undefined) { params.push(body.instructions); sets.push(`instructions = $${params.length}`); }
      if (body.paused !== undefined) {
        params.push(body.paused);
        sets.push(`paused_by_dev = $${params.length}`);
        // Pausing stops the next wake immediately; resuming lets the scheduler
        // pick it up again on its own terms.
        sets.push(body.paused ? `status = 'paused'` : `status = 'asleep_fees', next_wake_at = now()`);
      }
      if (!sets.length) throw badRequest("nothing to change");

      await query(`UPDATE agents SET ${sets.join(", ")} WHERE id = $1`, params);
      return { ok: true };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.post("/agents/:slug/dev/note", async (req, reply) => {
    try {
      const { slug } = req.params as { slug: string };
      const agentId = await requireOwner(req, slug);
      const { text } = z.object({ text: z.string().min(1).max(1_000) }).parse(req.body);
      await query(`INSERT INTO dev_notes (agent_id, body) VALUES ($1,$2)`, [agentId, text]);
      return { ok: true, queued: true };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.get("/agents/:slug/dev/notes", async (req, reply) => {
    try {
      const { slug } = req.params as { slug: string };
      const agentId = await requireOwner(req, slug);
      const { rows } = await query(
        `SELECT body, consumed, created_at FROM dev_notes WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [agentId],
      );
      return { notes: rows };
    } catch (err) {
      return send(reply, err);
    }
  });
}
