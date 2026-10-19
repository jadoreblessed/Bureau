import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { log } from "../logger.js";
import { assertDbReady, closeDb, takeLock, releaseLock } from "../db.js";
import { assertPayerFunded } from "../chain/rpc.js";
import { sweepExpiredSessions } from "../http/auth.js";
import { processFundedLaunches, expireStaleLaunches } from "./launch.js";
import { claimFees } from "./fees.js";
import { refreshMarkets } from "./market.js";
import { runDueWakes, runFirstWakes } from "./wake.js";
import { reviewMoves } from "./review.js";

/**
 * The background loop.
 *
 * Every job takes a short lease first, so running two worker containers is
 * safe: whoever gets the lease does the work, the other skips that tick.
 */

const WORKER_ID = `${process.env.HOSTNAME ?? "worker"}-${randomUUID().slice(0, 8)}`;
let stopping = false;

interface Job {
  name: string;
  everyMs: number;
  leaseSec: number;
  run: () => Promise<void>;
}

const JOBS: Job[] = [
  { name: "launches", everyMs: 15_000, leaseSec: 120, run: processFundedLaunches },
  { name: "launch-expiry", everyMs: 300_000, leaseSec: 60, run: expireStaleLaunches },
  { name: "fees", everyMs: 60_000, leaseSec: 180, run: claimFees },
  { name: "market", everyMs: 60_000, leaseSec: 120, run: refreshMarkets },
  { name: "first-wakes", everyMs: 30_000, leaseSec: 300, run: runFirstWakes },
  { name: "wakes", everyMs: 30_000, leaseSec: 300, run: runDueWakes },
  { name: "review", everyMs: 600_000, leaseSec: 180, run: reviewMoves },
  { name: "sessions", everyMs: 3_600_000, leaseSec: 60, run: sweepExpiredSessions },
];

async function tick(job: Job) {
  if (stopping) return;
  const got = await takeLock(job.name, WORKER_ID, job.leaseSec).catch((err) => {
    log.warn({ err, job: job.name }, "could not take the lock");
    return false;
  });
  if (!got) return;
  const started = Date.now();
  try {
    await job.run();
  } catch (err) {
    log.error({ err, job: job.name }, "job failed");
  } finally {
    const ms = Date.now() - started;
    if (ms > job.leaseSec * 1_000) log.warn({ job: job.name, ms }, "job ran past its lease");
    await releaseLock(job.name, WORKER_ID).catch(() => {});
  }
}

async function main() {
  await assertDbReady();
  await assertPayerFunded().catch(() => {});

  log.info(
    {
      worker: WORKER_ID,
      cluster: config.SOLANA_CLUSTER,
      launch: config.LAUNCH_ENABLED,
      money: config.MONEY_ENABLED,
      thinking: Boolean(config.OPENROUTER_API_KEY),
    },
    "workers up",
  );
  if (!config.OPENROUTER_API_KEY) log.warn("no OPENROUTER_API_KEY — agents will not think");

  const timers = JOBS.map((job) => {
    // stagger the first run so everything does not fire at once on boot
    setTimeout(() => void tick(job), Math.random() * 5_000);
    return setInterval(() => void tick(job), job.everyMs);
  });

  const stop = async () => {
    stopping = true;
    timers.forEach(clearInterval);
    for (const job of JOBS) await releaseLock(job.name, WORKER_ID).catch(() => {});
    await closeDb();
    log.info("workers stopped");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  log.error({ err }, "workers failed to start");
  process.exit(1);
});
