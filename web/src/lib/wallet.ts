import { toast } from "./store";
import { useSyncExternalStore } from "react";
import { b58encode, transferMessage } from "./solana";

// Phantom (Solana) connection. No backend: we only read the public key and,
// on launch, ask for a signature over the launch summary.
interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage?(msg: Uint8Array, enc?: string): Promise<{ signature: Uint8Array }>;
  on?(ev: string, cb: (...a: unknown[]) => void): void;
}

function provider(): PhantomProvider | null {
  const w = window as unknown as { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider };
  const p = w.phantom?.solana ?? w.solana;
  return p && p.isPhantom ? p : null;
}

let state: { address: string | null; connecting: boolean } = { address: null, connecting: false };
const subs = new Set<() => void>();
const set = (s: Partial<typeof state>) => { state = { ...state, ...s }; subs.forEach((f) => f()); };
const walletStore = { get: () => state, sub: (f: () => void) => { subs.add(f); return () => subs.delete(f); } };

export function useWallet() {
  const s = useSyncExternalStore(walletStore.sub, walletStore.get, walletStore.get);
  return { ...s, connect, disconnect, hasPhantom: !!provider() };
}

export function phantomDeepLink() {
  const url = encodeURIComponent(window.location.href);
  return `https://phantom.app/ul/browse/${url}?ref=${encodeURIComponent(window.location.origin)}`;
}

export async function connect() {
  const p = provider();
  if (!p) {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile) window.location.href = phantomDeepLink();
    else window.open("https://phantom.app/download", "_blank", "noopener");
    toast("Phantom not found — opening phantom.app");
    return null;
  }
  try {
    set({ connecting: true });
    const res = await p.connect();
    const address = res.publicKey.toString();
    set({ address, connecting: false });
    toast("Wallet connected", "ok");
    return address;
  } catch {
    set({ connecting: false });
    toast("Connection cancelled", "err");
    return null;
  }
}

export async function disconnect() {
  try { await provider()?.disconnect(); } catch { /* ignore */ }
  set({ address: null });
  toast("Wallet disconnected");
}

export async function signLaunch(summary: string): Promise<boolean> {
  const p = provider();
  if (!p?.signMessage) return true;
  try {
    await p.signMessage(new TextEncoder().encode(summary), "utf8");
    return true;
  } catch {
    toast("Signature cancelled", "err");
    return false;
  }
}

// Silent reconnect if the site is already trusted.
export function initWallet() {
  const tryIt = () => {
    const p = provider();
    if (!p) return;
    p.connect({ onlyIfTrusted: true }).then((r) => set({ address: r.publicKey.toString() })).catch(() => {});
    p.on?.("accountChanged", (pk: unknown) => set({ address: pk ? String(pk) : null }));
  };
  if (document.readyState === "complete") tryIt();
  else window.addEventListener("load", tryIt, { once: true });
}

/* ------------------------------------------------------------ backend sign-in + the launch transfer */


interface RequestProvider { request?(a: { method: string; params: unknown }): Promise<{ signature: string; publicKey?: string }> }

const SESSION = "bureau.session";

/** Wallet sign-in with the API: sign a plain message (no transaction, no funds). Returns a session token. */
export async function apiSignIn(address: string): Promise<string | null> {
  try {
    const saved = sessionStorage.getItem(SESSION);
    if (saved) {
      const { wallet, token } = JSON.parse(saved) as { wallet: string; token: string };
      if (wallet === address) {
        const me = await fetch("/api/auth/me", { headers: { authorization: `Bearer ${token}` } });
        if (me.ok) return token;
      }
    }
  } catch { /* fall through to a fresh sign-in */ }
  const p = provider();
  if (!p?.signMessage) { toast("This wallet cannot sign messages", "err"); return null; }
  try {
    const ch = await (await fetch("/api/auth/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address }) })).json() as { nonce: string; message: string };
    const { signature } = await p.signMessage(new TextEncoder().encode(ch.message), "utf8");
    const res = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address, nonce: ch.nonce, signature: b58encode(signature) }) });
    if (!res.ok) { toast("Sign-in failed", "err"); return null; }
    const { token } = await res.json() as { token: string };
    try { sessionStorage.setItem(SESSION, JSON.stringify({ wallet: address, token })); } catch { /* private mode */ }
    return token;
  } catch {
    toast("Signature cancelled", "err");
    return null;
  }
}

/** Ask Phantom to sign and send one SOL transfer. Returns the transaction signature. */
export async function sendSol(from: string, to: string, lamports: number): Promise<string | null> {
  const p = provider() as (PhantomProvider & RequestProvider) | null;
  if (!p?.request) { toast("Phantom is required for the launch transfer", "err"); return null; }
  try {
    const bh = await (await fetch("/api/chain/blockhash")).json() as { blockhash: string };
    const message = transferMessage(from, to, lamports, bh.blockhash);
    const res = await p.request({ method: "signAndSendTransaction", params: { message: b58encode(message) } });
    return res.signature;
  } catch {
    toast("Transfer cancelled", "err");
    return null;
  }
}
