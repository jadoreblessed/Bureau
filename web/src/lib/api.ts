// Backend reads. The site still renders fully from local data; when the API
// answers, its rows take over (and local rows only fill in art and persona).
import { useEffect, useState } from "react";
import { AGENTS, hash, modelByName, type Agent, type KindId, type Status } from "./data";

const API = "/api";

interface ApiAgent {
  id: string; slug: string; name: string; ticker: string; kind: KindId; families: string[];
  pair_symbol: string; model: string; mint: string | null; status: string; paused_by_dev: boolean;
  mcap_usd: number; vol_1h_usd: number; holders: number; bonding_pct: number;
  fees_earned_lamports: string; image_url: string | null; description: string;
  next_wake_at: string | null; created_at: string;
}

const STATUS: Record<string, Status> = {
  awake: "awake", asleep_fees: "asleep-fees", asleep_floor: "asleep-floor", paused: "paused", halted: "halted",
};
// Only used when an agent has no local row to borrow display fees from.
const SOL_USD_FALLBACK = 150;

function toAgent(r: ApiAgent): Agent {
  const local = AGENTS.find((a) => a.id === r.slug || a.ticker.toLowerCase() === r.ticker.toLowerCase());
  const ageH = Math.max(0, (Date.now() - Date.parse(r.created_at)) / 3.6e6);
  const status = r.paused_by_dev ? "paused" : STATUS[r.status] ?? "asleep-fees";
  const base: Agent = local ?? {
    id: r.slug, name: r.name, ticker: r.ticker, kind: r.kind, families: r.families, pair: r.pair_symbol,
    model: modelByName(r.model).name, status, mcap: 0, fees: 0, vol1h: 0, holders: 0, ageDays: 0, bonding: 0,
    nextThought: 10, ca: r.mint ?? "", creator: "", description: r.description, seed: hash(r.slug),
    persona: { role: r.kind, traits: [], drive: r.description, quote: "", mission: "", missionGoal: "holders", missionTarget: 50, missionNow: 0 },
  };
  return {
    ...base,
    id: local?.id ?? r.slug,
    name: r.name, ticker: r.ticker, kind: r.kind, pair: r.pair_symbol, model: modelByName(r.model).name, status,
    mcap: Number(r.mcap_usd) || base.mcap,
    holders: r.holders || base.holders,
    fees: local ? local.fees : (Number(r.fees_earned_lamports) / 1e9) * SOL_USD_FALLBACK,
    ageDays: Math.floor(ageH / 24), ageLabel: ageH < 24 ? `${Math.max(1, Math.round(ageH))}h` : `${Math.floor(ageH / 24)}d`,
    nextThought: r.next_wake_at ? Math.max(1, Math.round((Date.parse(r.next_wake_at) - Date.now()) / 60000)) : base.nextThought,
    description: r.description || base.description,
    image: r.image_url ?? base.image,
    ca: r.mint ?? base.ca,
  };
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
  const [list, setList] = useState<Agent[] | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`${API}/agents?sort=mcap&limit=${limit}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { agents?: ApiAgent[] } | null) => { if (j?.agents?.length) setList(j.agents.map(toAgent)); })
      .catch(() => {});
    return () => ctl.abort();
  }, [limit]);
  return list;
}
