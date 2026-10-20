import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { query } from "../db.js";
import { send } from "../http/errors.js";

/**
 * Site-wide settings the admin page edits: the $BUREAU contract address and
 * the X account. Stored in platform_kv so they change without a redeploy.
 */

const KEYS = { ca: "site.ca", x: "site.x", xHandle: "site.x_handle" } as const;
type Site = { ca: string; x: string; xHandle: string };

async function readSite(): Promise<Site> {
  const { rows } = await query<{ key: string; value: string }>(
    `SELECT key, value FROM platform_kv WHERE key = ANY($1)`,
    [Object.values(KEYS)],
  );
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  return { ca: get(KEYS.ca), x: get(KEYS.x), xHandle: get(KEYS.xHandle) };
}

const siteBody = z.object({
  // Solana addresses are base58, 32–44 characters. Empty clears it ("soon" on the site).
  ca: z.string().trim().regex(/^([1-9A-HJ-NP-Za-km-z]{32,44})?$/, "not a Solana address"),
  x: z.string().trim().regex(/^(https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?)?$/, "must be https://x.com/<handle>"),
  xHandle: z.string().trim().regex(/^(@[A-Za-z0-9_]{1,15})?$/, "must look like @handle"),
});

/** Constant-time check of the Bearer token against ADMIN_TOKEN. */
function isAdmin(req: FastifyRequest): boolean {
  const want = config.ADMIN_TOKEN;
  if (!want) return false;
  const got = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function siteRoutes(app: FastifyInstance) {
  app.get("/site", async (_req, reply) => {
    try {
      return await readSite();
    } catch (err) {
      return send(reply, err);
    }
  });

  // Tight limit: this is the one place a guessed token would matter.
  const adminLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.get("/admin/site", adminLimit, async (req, reply) => {
    if (!config.ADMIN_TOKEN) return reply.code(503).send({ error: "admin_disabled", message: "ADMIN_TOKEN is not set on the server" });
    if (!isAdmin(req)) return reply.code(401).send({ error: "unauthorized", message: "wrong admin token" });
    return readSite();
  });

  app.put("/admin/site", adminLimit, async (req, reply) => {
    if (!config.ADMIN_TOKEN) return reply.code(503).send({ error: "admin_disabled", message: "ADMIN_TOKEN is not set on the server" });
    if (!isAdmin(req)) return reply.code(401).send({ error: "unauthorized", message: "wrong admin token" });
    const parsed = siteBody.safeParse(req.body);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return reply.code(400).send({ error: "bad_request", message: `${i?.path.join(".")}: ${i?.message}` });
    }
    const body = parsed.data;
    try {
      for (const [field, key] of Object.entries(KEYS) as [keyof Site, string][]) {
        await query(
          `INSERT INTO platform_kv (key, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, body[field]],
        );
      }
      return readSite();
    } catch (err) {
      return send(reply, err);
    }
  });
}
