import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { query, one } from "../db.js";
import { send } from "../http/errors.js";
import { lamportsToSol } from "../util/money.js";

/** The numbers the home page shows. */
export async function statsRoutes(app: FastifyInstance) {
  app.get("/stats", async (_req, reply) => {
    try {
      const [agents, burn, pairs, sol] = await Promise.all([
        one<{ total: string; awake: string; live: string; fees: string }>(
          `SELECT COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status = 'awake') AS awake,
                  COUNT(*) FILTER (WHERE mint IS NOT NULL) AS live,
                  COALESCE(SUM(fees_earned_lamports), 0) AS fees
             FROM agents WHERE status <> 'pending' AND mint IS NOT NULL`,
        ),
        one<{ burned: string; sol: string; count: string }>(
          `SELECT bureau_burned AS burned, buyback_sol AS sol, buyback_count AS count FROM platform_stats WHERE id`,
        ),
        one<{ n: string }>(`SELECT COUNT(DISTINCT pair_symbol) AS n FROM agents WHERE status <> 'pending'`),
        one<{ v: string }>(`SELECT value AS v FROM platform_kv WHERE key = 'sol_usd'`),
      ]);
      return {
        agents: Number(agents?.total ?? 0),
        awake: Number(agents?.awake ?? 0),
        pairAssets: Number(pairs?.n ?? 0),
        liveCoins: Number(agents?.live ?? 0),
        solUsd: Number(sol?.v ?? 0),
        feesEarnedSol: lamportsToSol(Number(agents?.fees ?? 0)),
        buybackBurn: {
          burned: Number(burn?.burned ?? 0),
          solSpent: lamportsToSol(Number(burn?.sol ?? 0)),
          buybacks: Number(burn?.count ?? 0),
        },
        switches: {
          launchEnabled: config.LAUNCH_ENABLED,
          moneyEnabled: config.MONEY_ENABLED,
          socialEnabled: config.SOCIAL_ENABLED,
        },
        cluster: config.SOLANA_CLUSTER,
      };
    } catch (err) {
      return send(reply, err);
    }
  });

  app.get("/burns", async (_req, reply) => {
    try {
      const { rows } = await query(
        `SELECT amount_lamports, amount_atoms, signature, created_at FROM ledger
          WHERE entry = 'buyback_burn' ORDER BY created_at DESC LIMIT 20`,
      );
      return { burns: rows };
    } catch (err) {
      return send(reply, err);
    }
  });
}
