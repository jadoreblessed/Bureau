import { toast } from "./store";
import { useSyncExternalStore } from "react";

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
