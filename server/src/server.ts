import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config, corsOrigins, isProd } from "./config.js";
import { log } from "./logger.js";
import { assertDbReady, closeDb } from "./db.js";
import { assertPayerFunded } from "./chain/rpc.js";
import { signerHealthy } from "./signer/client.js";
import { agentRoutes } from "./routes/agents.js";
import { launchRoutes } from "./routes/launch.js";
import { devRoutes } from "./routes/dev.js";
import { authRoutes } from "./routes/auth.js";
import { statsRoutes } from "./routes/stats.js";
import { siteRoutes } from "./routes/site.js";

const app = Fastify({
  logger: false,
  bodyLimit: 512 * 1024,
  trustProxy: isProd,
});

await app.register(cors, {
  origin: corsOrigins.includes("*") ? true : corsOrigins,
  credentials: true,
});

await app.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute",
  // Launch and auth are the expensive ones; they get their own tighter limit.
  keyGenerator: (req) => req.ip,
});

app.setErrorHandler((err, req, reply) => {
  log.error({ err, url: req.url }, "request failed");
  reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500)
    .send({ error: "error", message: err.statusCode && err.statusCode < 500 ? err.message : "something broke on our side" });
});

app.get("/health", async () => {
  const signer = await signerHealthy();
  return { ok: true, signer, cluster: config.SOLANA_CLUSTER, launchEnabled: config.LAUNCH_ENABLED, moneyEnabled: config.MONEY_ENABLED };
});

await app.register(async (api) => {
  await agentRoutes(api);
  await launchRoutes(api);
  await devRoutes(api);
  await authRoutes(api);
  await statsRoutes(api);
  await siteRoutes(api);
}, { prefix: "/api" });

async function main() {
  await assertDbReady();
  await assertPayerFunded().catch(() => {});
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info(
    { port: config.PORT, cluster: config.SOLANA_CLUSTER, launch: config.LAUNCH_ENABLED, money: config.MONEY_ENABLED },
    "api up",
  );
  if (!(await signerHealthy())) log.warn("signer is not reachable — anything that moves funds will fail");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    log.info("shutting down");
    await app.close();
    await closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  log.error({ err }, "api failed to start");
  process.exit(1);
});
