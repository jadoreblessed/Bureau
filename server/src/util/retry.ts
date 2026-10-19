import { log } from "../logger.js";

export interface RetryOpts {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  label?: string;
  /** Return false to stop retrying a permanent failure. */
  retryable?: (err: unknown) => boolean;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function retry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { attempts = 4, baseMs = 300, maxMs = 8_000, label = "op", retryable = () => true } = opts;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!retryable(err) || i === attempts - 1) break;
      // exponential backoff with jitter, so a burst of workers does not sync up
      const delay = Math.min(maxMs, baseMs * 2 ** i) * (0.6 + Math.random() * 0.6);
      log.warn({ err, label, attempt: i + 1, delay: Math.round(delay) }, "retrying");
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Rejects if fn takes longer than ms. */
export async function withTimeout<T>(fn: () => Promise<T>, ms: number, label = "op"): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
