import pino from "pino";
import { config, isProd } from "./config.js";

export const log = pino({
  level: config.LOG_LEVEL,
  ...(isProd ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
  redact: {
    paths: ["secret", "*.secret", "secretKey", "*.secretKey", "MASTER_KEY", "*.privateKey", "ciphertext"],
    censor: "[redacted]",
  },
});

export const child = (bindings: Record<string, unknown>) => log.child(bindings);
