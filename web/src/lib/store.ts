import { useEffect, useState, useSyncExternalStore } from "react";
import { CONCEPTS, type Agent } from "./data";
import { useLiveAgents } from "./api";

/* tiny external store */
function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (next: T | ((s: T) => T)) => {
      state = typeof next === "function" ? (next as (s: T) => T)(state) : next;
      subs.forEach((f) => f());
    },
    sub: (f: () => void) => { subs.add(f); return () => subs.delete(f); },
  };
}
export function useStore<T>(s: ReturnType<typeof createStore<T>>) {
  return useSyncExternalStore(s.sub, s.get, s.get);
}

const LS = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

/* launched agents (persist in this browser) */
export const launched = createStore<Agent[]>(LS.get("bureau.launched", []));
launched.sub(() => LS.set("bureau.launched", launched.get()));
export function addLaunched(a: Agent) { launched.set((l) => [a, ...l.filter((x) => x.id !== a.id)]); }
export function updateLaunched(id: string, patch: Partial<Agent>) { launched.set((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a))); }

export function useAllAgents() {
  const mine = useStore(launched);
  const live = useLiveAgents(100);
  return [...mine, ...(live ?? []), ...CONCEPTS];
}
export function findAgent(id: string, mine: Agent[]) {
  return mine.find((a) => a.id === id) ?? CONCEPTS.find((a) => a.id === id);
}

/* drafts */
export interface Draft { id: string; savedAt: number; data: Record<string, unknown> }
export const drafts = createStore<Draft[]>(LS.get("bureau.drafts", []));
drafts.sub(() => LS.set("bureau.drafts", drafts.get()));

/* dev notes per agent */
export const devState = createStore<Record<string, { notes: string[]; instructions?: string; paused?: boolean; model?: string }>>(LS.get("bureau.dev", {}));
devState.sub(() => LS.set("bureau.dev", devState.get()));

/* toasts */
export interface Toast { id: number; text: string; kind?: "ok" | "err" }
export const toasts = createStore<Toast[]>([]);
let tid = 0;
export function toast(text: string, kind?: "ok" | "err") {
  const id = ++tid;
  toasts.set((t) => [...t, { id, text, kind }]);
  setTimeout(() => toasts.set((t) => t.filter((x) => x.id !== id)), 3200);
}

/* clipboard */
export async function copy(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
  }
  toast(label, "ok");
}

/* in-view hook for reveals + pausing work offscreen */
export function useInView<T extends Element>(opts: IntersectionObserverInit = { threshold: 0.15 }, once = true) {
  const [el, setEl] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); if (once) io.disconnect(); }
      else if (!once) setInView(false);
    }, opts);
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return [setEl, inView] as const;
}
