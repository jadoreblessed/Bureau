import { toast } from "./store";
import { useSyncExternalStore } from "react";
import { b58encode, transferMessage } from "./solana";

// Solana wallets through the Wallet Standard: every installed wallet that
// registers itself (Phantom, Solflare, Backpack, MetaMask with Solana, …)
// shows up in the picker. No SDK: the standard is a small event handshake.

interface StdAccount { address: string; publicKey: Uint8Array; chains: readonly string[] }
interface StdWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const NEEDED = ["standard:connect", "solana:signMessage", "solana:signAndSendTransaction"];
const LAST = "bureau.wallet";

let wallets: StdWallet[] = [];
let state: { address: string | null; connecting: boolean; wallet: string | null; picking: boolean; list: StdWallet[] } =
  { address: null, connecting: false, wallet: null, picking: false, list: [] };
const subs = new Set<() => void>();
const set = (s: Partial<typeof state>) => { state = { ...state, ...s }; subs.forEach((f) => f()); };
const walletStore = { get: () => state, sub: (f: () => void) => { subs.add(f); return () => subs.delete(f); } };
let active: StdWallet | null = null;
let account: StdAccount | null = null;
let pickResolve: ((w: StdWallet | null) => void) | null = null;

/* ---------- discovery (Wallet Standard app ↔ wallet handshake) ---------- */
function register(...ws: StdWallet[]) {
  for (const w of ws) {
    const ok = w.chains.some((c) => c.startsWith("solana:")) && NEEDED.every((f) => f in w.features);
    if (ok && !wallets.some((x) => x.name === w.name)) wallets = [...wallets, w];
  }
  set({ list: wallets });
  return () => { wallets = wallets.filter((x) => !ws.includes(x)); set({ list: wallets }); };
}
let discovered = false;
function discover() {
  if (discovered || typeof window === "undefined") return;
  discovered = true;
  const api = Object.freeze({ register });
  window.addEventListener("wallet-standard:register-wallet", (e: Event) => (e as CustomEvent<(a: typeof api) => void>).detail(api));
  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
}

export function useWallet() {
  discover();
  const s = useSyncExternalStore(walletStore.sub, walletStore.get, walletStore.get);
  return { ...s, connect, disconnect, hasWallet: s.list.length > 0, hasPhantom: s.list.length > 0 };
}

export function phantomDeepLink() {
  const url = encodeURIComponent(window.location.href);
  return `https://phantom.app/ul/browse/${url}?ref=${encodeURIComponent(window.location.origin)}`;
}

/** Called by the picker. */
export function pickWallet(name: string | null) {
  set({ picking: false });
  pickResolve?.(name ? wallets.find((w) => w.name === name) ?? null : null);
  pickResolve = null;
}

async function use(w: StdWallet, silent = false): Promise<string | null> {
  const res = await w.features["standard:connect"].connect(silent ? { silent: true } : undefined);
  const acc: StdAccount | undefined = (res?.accounts ?? w.accounts)[0];
  if (!acc) return null;
  active = w; account = acc;
  set({ address: acc.address, wallet: w.name, connecting: false });
  try { localStorage.setItem(LAST, w.name); } catch { /* private mode */ }
  w.features["standard:events"]?.on?.("change", (p: { accounts?: StdAccount[] }) => {
    if (!p.accounts) return;
    account = p.accounts[0] ?? null;
    set({ address: account?.address ?? null });
  });
  return acc.address;
}

export async function connect(): Promise<string | null> {
  discover();
  if (!wallets.length) {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile) window.location.href = phantomDeepLink();
    else window.open("https://phantom.app/download", "_blank", "noopener");
    toast("No Solana wallet found — install Phantom, Solflare, Backpack or MetaMask");
    return null;
  }
  const chosen = wallets.length === 1 ? wallets[0] : await new Promise<StdWallet | null>((r) => { pickResolve = r; set({ picking: true }); });
  if (!chosen) return null;
  try {
    set({ connecting: true });
    const address = await use(chosen);
    if (address) toast(`${chosen.name} connected`, "ok");
    else set({ connecting: false });
    return address;
  } catch {
    set({ connecting: false });
    toast("Connection cancelled", "err");
    return null;
  }
}

export async function disconnect() {
  try { await active?.features["standard:disconnect"]?.disconnect(); } catch { /* ignore */ }
  active = null; account = null;
  try { localStorage.removeItem(LAST); } catch { /* ignore */ }
  try { sessionStorage.removeItem(SESSION); } catch { /* ignore */ }
  set({ address: null, wallet: null });
  toast("Wallet disconnected");
}

// Silent reconnect to the wallet used last time, if it still trusts the site.
export function initWallet() {
  discover();
  let last: string | null = null;
  try { last = localStorage.getItem(LAST); } catch { /* ignore */ }
  if (!last) return;
  const tryIt = () => { const w = wallets.find((x) => x.name === last); if (w) use(w, true).catch(() => {}); };
  if (document.readyState === "complete") setTimeout(tryIt, 300);
  else window.addEventListener("load", () => setTimeout(tryIt, 300), { once: true });
}

/* ------------------------------------------------------------ backend sign-in + the launch transfer */

const SESSION = "bureau.session";

async function signMessage(text: string): Promise<Uint8Array> {
  if (!active || !account) throw new Error("no wallet");
  const [out] = await active.features["solana:signMessage"].signMessage({ account, message: new TextEncoder().encode(text) });
  return out.signature as Uint8Array;
}

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
  try {
    const ch = await (await fetch("/api/auth/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: address }) })).json() as { nonce: string; message: string };
    const signature = await signMessage(ch.message);
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

/** Ask the connected wallet to sign and send one SOL transfer. Returns the transaction signature. */
export async function sendSol(from: string, to: string, lamports: number): Promise<string | null> {
  if (!active || !account) { toast("Connect a wallet first", "err"); return null; }
  try {
    const bh = await (await fetch("/api/chain/blockhash")).json() as { blockhash: string; cluster: string };
    const message = transferMessage(from, to, lamports, bh.blockhash);
    // a legacy transaction is the signature count (1), an empty 64-byte slot for it, then the message
    const tx = new Uint8Array(1 + 64 + message.length);
    tx[0] = 1;
    tx.set(message, 65);
    const chain = bh.cluster === "devnet" ? "solana:devnet" : "solana:mainnet";
    const [out] = await active.features["solana:signAndSendTransaction"].signAndSendTransaction({ account, chain, transaction: tx });
    return b58encode(out.signature as Uint8Array);
  } catch {
    toast("Transfer cancelled", "err");
    return null;
  }
}
