import { useMemo } from "react";
import { go, Link, setQuery, useRoute } from "../lib/router";
import { KINDS, MODELS, PAIRS, PROVIDERS, fmtNum, fmtUsd, kindById, modelByName, type Agent, type KindId } from "../lib/data";
import { useAllAgents } from "../lib/store";
import { Avatar } from "../components/Avatar";
import { Grid, Rows, Search } from "../components/icons";
import { AgentCard, PairIcon, Reveal, StatusBadge } from "../components/ui";

const SORTS: Record<string, { label: string; fn: (a: Agent, b: Agent) => number }> = {
  mcap: { label: "Market cap", fn: (a, b) => b.mcap - a.mcap },
  fees: { label: "Fees earned", fn: (a, b) => b.fees - a.fees },
  holders: { label: "Holders", fn: (a, b) => b.holders - a.holders },
  new: { label: "Newest", fn: (a, b) => a.ageDays - b.ageDays || (b.createdAt ?? 0) - (a.createdAt ?? 0) },
  awake: { label: "Awake first", fn: (a, b) => Number(b.status === "awake") - Number(a.status === "awake") || b.mcap - a.mcap },
};

export default function Explore() {
  const { query } = useRoute();
  const all = useAllAgents();
  const tab = query.get("tab") ?? "agents";
  const kind = (query.get("kind") ?? "all") as KindId | "all";
  const status = query.get("status") ?? "all";
  const pair = query.get("pair") ?? "all";
  const provider = query.get("provider") ?? "all";
  const sort = query.get("sort") ?? "mcap";
  const view = query.get("view") ?? "grid";
  const q = (query.get("q") ?? "").toLowerCase();

  const source = tab === "mine" ? all.filter((a) => a.mine) : all;
  const list = useMemo(() => {
    let l = source.filter((a) =>
      (kind === "all" || a.kind === kind) &&
      (status === "all" || (status === "awake" ? a.status === "awake" : status === "asleep" ? a.status.startsWith("asleep") : a.status === status)) &&
      (pair === "all" || a.pair === pair) &&
      (provider === "all" || modelByName(a.model).provider === provider) &&
      (!q || a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q) || a.ca.toLowerCase().includes(q)),
    );
    l = [...l].sort(SORTS[sort]?.fn ?? SORTS.mcap.fn);
    // launched-by-me always pinned on top of "newest"
    return l;
  }, [source, kind, status, pair, provider, sort, q]);

  const count = (k: KindId | "all") => source.filter((a) => k === "all" || a.kind === k).length;
  const mineCount = all.filter((a) => a.mine).length;

  return (
    <main className="page">
      <div className="wrap page-top">
        <Reveal className="eyebrow">[ <b>Registry</b> · every coin with an agent ]</Reveal>
        <Reveal as="h1" i={1} className="h-page">Agents</Reveal>
        <Reveal i={2} className="between mt-24" style={{ flexWrap: "wrap" }}>
          <div className="pill-tabs" role="tablist">
            <button className={tab === "agents" ? "on" : ""} onClick={() => setQuery({ tab: undefined })}>Agents · {all.length}</button>
            <button className={tab === "mine" ? "on" : ""} onClick={() => setQuery({ tab: "mine" })}>Launched by me · {mineCount}</button>
          </div>
          <Link to="/launch" className="btn btn-solid btn-sm">Launch an agent</Link>
        </Reveal>
      </div>

      <div className="wrap">
        <Reveal className="kinds-bar">
          <button className={`kchip ${kind === "all" ? "on" : ""}`} onClick={() => setQuery({ kind: undefined })}>All <small>{count("all")}</small></button>
          {KINDS.map((k) => (
            <button key={k.id} className={`kchip ${kind === k.id ? "on" : ""}`} onClick={() => setQuery({ kind: k.id })}>
              <span style={{ color: "var(--ice)" }}>{k.glyph}</span>{k.name} <small>{count(k.id)}</small>
            </button>
          ))}
        </Reveal>

        <Reveal i={1} className="filters mt-12">
          <label className="search">
            <Search />
            <span className="sr">Search</span>
            <input className="inp" placeholder="Search name, ticker or CA" value={query.get("q") ?? ""} onChange={(e) => setQuery({ q: e.target.value })} />
          </label>
          <select className="inp" value={status} onChange={(e) => setQuery({ status: e.target.value })} aria-label="Status">
            <option value="all">Any status</option><option value="awake">Awake</option><option value="asleep">Asleep</option><option value="paused">Paused</option><option value="halted">Halted</option>
          </select>
          <select className="inp" value={pair} onChange={(e) => setQuery({ pair: e.target.value })} aria-label="Pair">
            <option value="all">Any pair</option>{PAIRS.map((p) => (<option key={p.sym} value={p.sym}>{p.sym}</option>))}
          </select>
          <select className="inp" value={provider} onChange={(e) => setQuery({ provider: e.target.value })} aria-label="Model provider">
            <option value="all">Any model</option>{PROVIDERS.map((p) => (<option key={p.id} value={p.id}>{p.name} · {MODELS.filter((m) => m.provider === p.id).length}</option>))}
          </select>
          <select className="inp" value={sort} onChange={(e) => setQuery({ sort: e.target.value })} aria-label="Sort">
            {Object.entries(SORTS).map(([k, s]) => (<option key={k} value={k}>Sort: {s.label}</option>))}
          </select>
          <div className="pill-tabs">
            <button className={view === "grid" ? "on" : ""} onClick={() => setQuery({ view: undefined })} aria-label="Grid view"><Grid className="icon" /></button>
            <button className={view === "table" ? "on" : ""} onClick={() => setQuery({ view: "table" })} aria-label="Table view"><Rows className="icon" /></button>
          </div>
        </Reveal>

        <div className="between mt-20 mb-8" style={{ marginBottom: 14 }}>
          <span className="label">{list.length} result{list.length === 1 ? "" : "s"}</span>
          {(kind !== "all" || status !== "all" || pair !== "all" || provider !== "all" || q) && (
            <button className="lnk" style={{ fontSize: 12 }} onClick={() => setQuery({ kind: undefined, status: undefined, pair: undefined, provider: undefined, q: undefined })}>Clear filters</button>
          )}
        </div>

        {list.length === 0 ? (
          <div className="empty">
            {tab === "mine" ? (<>You have not launched an agent from this browser yet.<div className="mt-16"><Link to="/launch" className="btn btn-sm btn-solid">Launch one</Link></div></>) : "Nothing matches these filters."}
          </div>
        ) : view === "table" ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>#</th><th>Agent</th><th>Status</th><th>Kind</th><th>Pair</th><th>Model</th>
                <th className="num sortable" onClick={() => setQuery({ sort: "mcap" })}>Mcap</th>
                <th className="num sortable" onClick={() => setQuery({ sort: "fees" })}>Fees</th>
                <th className="num sortable" onClick={() => setQuery({ sort: "holders" })}>Holders</th>
                <th className="num sortable" onClick={() => setQuery({ sort: "new" })}>Age</th>
              </tr></thead>
              <tbody>
                {list.map((a, i) => (
                  <tr key={a.id} onClick={() => go(`/agent/${a.id}`)}>
                    <td className="mono muted">{String(i + 1).padStart(2, "0")}</td>
                    <td><div className="row" style={{ gap: 10 }}><Avatar seed={a.seed} image={a.image} dots={60} className="ava-sm" /><b style={{ fontWeight: 600 }}>{a.name}</b><span className="mono muted" style={{ fontSize: 12 }}>${a.ticker}</span></div></td>
                    <td><StatusBadge s={a.status} /></td>
                    <td><span className="chip">{kindById(a.kind).glyph} {kindById(a.kind).name}</span></td>
                    <td><span className="chip"><PairIcon sym={a.pair} size={13} />{a.pair}</span></td>
                    <td className="muted">{a.model}</td>
                    <td className="num">{fmtUsd(a.mcap)}</td>
                    <td className="num">{fmtUsd(a.fees)}</td>
                    <td className="num">{fmtNum(a.holders)}</td>
                    <td className="num">{a.ageLabel ?? a.ageDays + "d"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="cards">
            {list.map((a, i) => (<AgentCard key={a.id} a={a} i={i} />))}
          </div>
        )}
      </div>
    </main>
  );
}
