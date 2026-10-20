// Backend reads. Every number the site shows about agents comes from here;
// local data (house.ts) only fills in art and persona copy for known agents.
import { useEffect, useState } from "react";
import { AGENTS, hash, modelByName, type Agent, type FeedItem, type KindId, type Status } from "./data";

const API = "/api";

interface ApiAgent {
  id: string; slug: string; name: string; ticker: string; kind: KindId; families: string[];
  pair_symbol: string; model: string; mint: string | null; agent_wallet: string | null; status: string; paused_by_dev: boolean;
  mcap_usd: number; vol_1h_usd: number; holders: number; bonding_pct: number;
  fees_earned_lamports: string; image_url: string | null; description: string;
  next_wake_at: string | null; created_at: string;
}

export interface Stats {
  agents: number; awake: number; liveCoins: number; feesEarnedSol: number; solUsd: number;
  buybackBurn: { burned: number; solSpent: number; buybacks: number };
  switches: { launchEnabled: boolean; moneyEnabled: boolean; socialEnabled: boolean };
  cluster: string;
}

const STATUS: Record<string, Status> = {
  awake: "awake", asleep_fees: "asleep-fees", asleep_floor: "asleep-floor", paused: "paused", halted: "halted",
};

// SOL price for turning lamports into dollars; set once /api/stats answers. 0 = unknown.
let solUsd = 0;

function toAgent(r: ApiAgent): Agent {
  const local = AGENTS.find((a) => a.id === r.slug || a.ticker.toLowerCase() === r.ticker.toLowerCase());
  const ageH = Math.max(0, (Date.now() - Date.parse(r.created_at)) / 3.6e6);
  const status = r.paused_by_dev ? "paused" : STATUS[r.status] ?? "asleep-fees";
  const base: Agent = local ?? {
    id: r.slug, name: r.name, ticker: r.ticker, kind: r.kind, families: r.families, pair: r.pair_symbol,
    model: modelByName(r.model).name, status, mcap: 0, fees: 0, vol1h: 0, holders: 0, ageDays: 0, bonding: 0,
    nextThought: 0, ca: "", creator: "", description: r.description, seed: hash(r.slug),
    persona: { role: r.kind, traits: [], drive: r.description, quote: "", mission: "", missionGoal: "holders", missionTarget: 50, missionNow: 0 },
  };
  const launched = !!r.mint;
  return {
    ...base,
    id: local?.id ?? r.slug,
    name: r.name, ticker: r.ticker, kind: r.kind, pair: r.pair_symbol, model: modelByName(r.model).name, status,
    mcap: Number(r.mcap_usd) || 0,
    vol1h: Number(r.vol_1h_usd) || 0,
    holders: r.holders || 0,
    bonding: Number(r.bonding_pct) || 0,
    fees: (Number(r.fees_earned_lamports) / 1e9) * solUsd,
    ageDays: launched ? Math.floor(ageH / 24) : 0,
    ageLabel: !launched ? "—" : ageH < 24 ? `${Math.max(1, Math.round(ageH))}h` : `${Math.floor(ageH / 24)}d`,
    nextThought: r.next_wake_at ? Math.max(1, Math.round((Date.parse(r.next_wake_at) - Date.now()) / 60000)) : 0,
    description: r.description || base.description,
    image: r.image_url ?? base.image,
    ca: r.mint ?? "",
  };
}

function useFetch<T>(path: string, pick: (j: unknown) => T | null, refreshMs = 0): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    const load = () => fetch(`${API}${path}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { const x = j && pick(j); if (x) setV(x); })
      .catch(() => {});
    load();
    const iv = refreshMs ? setInterval(() => { if (!document.hidden) load(); }, refreshMs) : 0;
    return () => { ctl.abort(); if (iv) clearInterval(iv); };
  }, [path]);
  return v;
}

/** Platform numbers for the hero and the burn panel; null until the API answers. */
export function useStats(): Stats | null {
  return useFetch("/stats", (j) => { const s = j as Stats; solUsd = s.solUsd || solUsd; return s; }, 60_000);
}

const PHASE: Record<string, string> = { observe: "observed", research: "researched", think: "thought", plan: "planned", act: "acted", reflect: "reflected", learn: "learned" };

/** Newest thoughts across all agents, refreshed every 30s. */
export function useFeed(): FeedItem[] | null {
  return useFetch("/feed", (j) => {
    const items = (j as { feed?: Array<{ id: number; phase: string; body: string; created_at: string; slug: string; ticker: string; name: string }> }).feed;
    if (!items) return null;
    return items.map((t) => {
      const agent = AGENTS.find((a) => a.id === t.slug) ?? toAgent({
        id: t.slug, slug: t.slug, name: t.name, ticker: t.ticker, kind: "unbound", families: [], pair_symbol: "SOL", model: "",
        mint: null, agent_wallet: null, status: "asleep_fees", paused_by_dev: false, mcap_usd: 0, vol_1h_usd: 0, holders: 0,
        bonding_pct: 0, fees_earned_lamports: "0", image_url: null, description: "", next_wake_at: null, created_at: t.created_at,
      });
      return { id: String(t.id), agent, action: PHASE[t.phase] ?? t.phase, text: t.body, min: (Date.now() - Date.parse(t.created_at)) / 60000 };
    });
  }, 30_000);
}

/** One agent from the backend, for slugs the local catalogue does not know. undefined = loading, null = not found. */
export function useApiAgent(slug: string, skip: boolean): Agent | null | undefined {
  const [a, setA] = useState<Agent | null | undefined>(skip ? null : undefined);
  useEffect(() => {
    if (skip) return;
    const ctl = new AbortController();
    setA(undefined);
    fetch(`${API}/agents/${encodeURIComponent(slug)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { agent?: ApiAgent } | null) => setA(j?.agent ? toAgent(j.agent) : null))
      .catch(() => { if (!ctl.signal.aborted) setA(null); });
    return () => ctl.abort();
  }, [slug, skip]);
  return a;
}

/** Live agent list from the backend; null until it answers (or if it is down). */
export function useLiveAgents(limit = 10): Agent[] | null {
  return useFetch(`/agents?sort=awake&limit=${limit}`, (j) => {
    const list = (j as { agents?: ApiAgent[] }).agents;
    return list?.length ? list.map(toAgent) : null;
  }, 60_000);
}
