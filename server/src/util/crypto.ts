import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM for agent wallet keys at rest.
 * The master key never leaves the environment; ciphertext and nonce live in
 * `agent_keys`, so a database dump on its own does not expose a single wallet.
 */
const ALGO = "aes-256-gcm";

export function loadMasterKey(raw: string): Buffer {
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`MASTER_KEY must decode to 32 bytes, got ${key.length}. Generate one with: openssl rand -base64 32`);
  }
  return key;
}

export interface Sealed {
  nonce: Buffer;
  ciphertext: Buffer;
}

export function seal(key: Buffer, plaintext: Uint8Array, aad: string): Sealed {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  // tag is appended so a single column holds everything needed to open it
  return { nonce, ciphertext: Buffer.concat([body, cipher.getAuthTag()]) };
}

export function open(key: Buffer, sealed: Sealed, aad: string): Buffer {
  const { nonce, ciphertext } = sealed;
  if (ciphertext.length < 17) throw new Error("ciphertext too short");
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const body = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** Constant-time string compare for tokens and signatures. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const randomId = (bytes = 16) => randomBytes(bytes).toString("hex");
