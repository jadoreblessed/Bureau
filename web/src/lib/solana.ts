// The one Solana transaction the site ever builds: a plain SOL transfer from
// the dev's wallet to their new agent's wallet. Built by hand (legacy message
// format) so the bundle does not carry a Solana SDK; Phantom signs and sends it.

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function b58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}

export function b58decode(str: string): Uint8Array {
  let n = 0n;
  for (const c of str) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(v);
  }
  const out: number[] = [];
  while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of str) { if (c !== "1") break; out.unshift(0); }
  return Uint8Array.from(out);
}

const key32 = (addr: string) => {
  const k = b58decode(addr);
  if (k.length !== 32) throw new Error("not a Solana address");
  return k;
};

/** Serialized legacy message for SystemProgram.transfer(from → to, lamports). */
export function transferMessage(from: string, to: string, lamports: number, blockhash: string): Uint8Array {
  const data = new Uint8Array(12);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, 2, true); // SystemInstruction::Transfer
  dv.setBigUint64(4, BigInt(lamports), true);
  const parts: (number | Uint8Array)[] = [
    1, 0, 1,                        // header: 1 signer, 0 readonly signed, 1 readonly unsigned (the system program)
    3, key32(from), key32(to), new Uint8Array(32), // account keys; system program is all zeros
    key32(blockhash),
    1,                              // one instruction
    2, 2, 0, 1, 12, data,           // program index 2, accounts [0,1], 12 bytes of data
  ];
  const len = parts.reduce<number>((a, p) => a + (typeof p === "number" ? 1 : p.length), 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { if (typeof p === "number") out[o++] = p; else { out.set(p, o); o += p.length; } }
  return out;
}
