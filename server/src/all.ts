import { log } from "./logger.js";

/**
 * All-in-one entrypoint.
 *
 * Boots the signer, the API and the worker loop inside ONE process, so the
 * whole backend can run as a single service — the simplest and cheapest way
 * to host it (one container, one free dyno) while still being the real thing.
 *
 * The signer binds to loopback only (SIGNER_HOST=127.0.0.1, the default), so
 * it is reachable from the API and worker in this process but never from the
 * outside. For a hardened production deployment run the three entrypoints
 * (server.js, workers/index.js, signer/service.js) as separate services on
 * separate hosts instead — see docker-compose.yml and DEPLOY.md.
 *
 * Order matters: the signer comes up first so the API's health check sees it.
 */

log.info("BUREAU all-in-one: starting signer, api and worker in one process");

await import("./signer/service.js");
await import("./server.js");
await import("./workers/index.js");
