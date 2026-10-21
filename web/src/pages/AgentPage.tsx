import { useEffect, useState } from "react";
import { Link, useRoute } from "../lib/router";
import {
  MODELS, SITE, ago, demoChart, familyName, fmtNum, fmtUsd, kindById, modelByName, providerName, short, type Agent,
} from "../lib/data";
import { copy, devState, findAgent, launched, toast, updateLaunched, useStore } from "../lib/store";
import { useAgentDetail, useStats, type AgentDetail } from "../lib/api";
import { useWallet } from "../lib/wallet";
import { Avatar } from "../components/Avatar";
import { Copy, Globe, Pause, Play, ProviderIcon, Send, Shield, XLogo } from "../components/icons";
import { PairIcon, Reveal, StatusBadge, statusNote } from "../components/ui";

/* Everything on this page comes from the API. Nothing is generated client-side:
   an agent with no coin yet shows empty states, not invented activity. */

const explorer = (cluster: string, kind: "token" | "account" | "tx", id: string) =>
  `https://solscan.io/${kind}/${id}${cluster === "devnet" ? "?cluster=devnet" : ""}`;

const minsAgo = (iso: string) => (Date.now() - Date.parse(iso)) / 60000;

function Console({ thoughts, live }: { thoughts: AgentDetail["thoughts"]; live: boolean }) {
  return (
    <div className="console">
      {!thoughts.length && <div className="dim">No thoughts yet. They appear here, as they happen, from its first wake.</div>}
      {thoughts.map((t) => (
        <div className="ln" key={t.id}>
          <span className="t dim">{new Date(t.created_at).toISOString().slice(11, 19)}</span>
          <span className={`k ${t.phase}`}>{t.phase}</span>
          <span>{t.body}</span>
        </div>
      ))}
      {live && <span className="cursor" />}
    </div>
  );
}

function Chart({ points: all }: { points: AgentDetail["chart"] }) {
  // zero snapshots are reads that found no market yet, not a price of zero
  const points = all.filter((p) => Number(p.mcap_usd) > 0);
  const W = 800, H = 220;
  if (points.length < 2) {
    return (
      <div className="panel panel-p">
        <div className="label">Market cap</div>
        <p className="muted mt-12" style={{ fontSize: 13.5 }}>No market history yet. The chart fills in from on-chain snapshots once its coin trades.</p>
      </div>
    );
  }
  const vals = points.map((p) => Number(p.mcap_usd));
  const min = Math.min(...vals), max = Math.max(...vals);
  const xy = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 14 - ((v - min) / (max - min || 1)) * (H - 34)]);
  const line = xy.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
  const up = vals[vals.length - 1] >= vals[0];
  const chg = ((vals[vals.length - 1] / (vals[0] || 1) - 1) * 100).toFixed(1);
  return (
    <div className="panel panel-p">
      <div className="row"><span className="label">Market cap · 7d</span><span className="mono" style={{ fontSize: 12, color: up ? "var(--good)" : "var(--bad)" }}>{Number(chg) > 0 ? "+" : ""}{chg}%</span></div>
      <svg className="chart mt-12" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Market cap chart">
        <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3d7bff" stopOpacity=".35" /><stop offset="1" stopColor="#3d7bff" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => (<line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,.06)" strokeDasharray="3 5" />))}
        <path d={line + ` L ${W} ${H} L 0 ${H} Z`} fill="url(#cg)" />
        <path d={line} fill="none" stroke="#7fb2ff" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const TABS = ["Mind", "Moves", "Posts"] as const;

export default function AgentPage() {
  const { parts } = useRoute();
  const mine = useStore(launched);
  const slug = parts[1] ?? "";
  const local = findAgent(slug, mine);
  const detail = useAgentDetail(slug);
  const a = detail?.agent ?? local;
  if (!a && detail === undefined) return <main className="page"><div className="wrap page-top"><p className="lede">Loading…</p></div></main>;
  if (!a) return (
    <main className="page"><div className="wrap page-top"><h1 className="h-page">Not found</h1><p className="lede">This agent is not in the registry.</p><Link to="/agents" className="btn mt-24">Back to agents</Link></div></main>
  );
  return <AgentView key={a.id} a={a} d={detail ?? null} />;
}

function AgentView({ a, d }: { a: Agent; d: AgentDetail | null }) {
  const w = useWallet();
  const stats = useStats();
  const cluster = stats?.cluster ?? "mainnet-beta";
  const dev = useStore(devState)[a.id] ?? { notes: [] };
  const [tab, setTab] = useState<(typeof TABS)[number]>("Mind");
  const k = kindById(a.kind);
  const model = modelByName(dev.model ?? a.model);
  const status = dev.paused ? "paused" : a.status;
  const isDev = !!a.mine || (!!w.address && w.address === a.creator);
  const [note, setNote] = useState("");
  const [instr, setInstr] = useState(dev.instructions ?? a.instructions ?? a.persona.drive);
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const launchedCoin = !!a.ca;
  const thoughts = d?.thoughts ?? [];
  const moves = d?.moves ?? [];
  const posts: AgentDetail["posts"] = a.concept
    ? (a.demoPosts ?? []).map((body, i) => ({ platform: "demo", body, posted_at: null, created_at: new Date(Date.now() - (i * 9 + 3) * 3_600_000).toISOString() }))
    : d?.posts ?? [];
  const note1 = statusNote({ ...a, status });

  const saveDev = (patch: Partial<typeof dev>) => {
    devState.set((s) => ({ ...s, [a.id]: { notes: [], ...s[a.id], ...patch } }));
    if (a.mine && patch.paused !== undefined) updateLaunched(a.id, { status: patch.paused ? "paused" : "asleep-fees" });
    if (a.mine && patch.model) updateLaunched(a.id, { model: patch.model });
  };

  return (
    <main className="page">
      <div className="wrap" style={{ paddingTop: 28 }}>
        <Reveal className="row" style={{ gap: 10 }}>
          <Link to="/agents" className="lnk" style={{ fontSize: 13 }}>Agents</Link>
          <span className="dim">/</span><span className="mono soft" style={{ fontSize: 13 }}>${a.ticker}</span>
        </Reveal>

        {/* HEAD */}
        <Reveal i={1} className="ag-head mt-24">
          <Avatar seed={a.seed} image={a.image} label={a.ticker} dots={420} />
          <div style={{ minWidth: 0 }}>
            <div className="row-wrap" style={{ gap: 10 }}>
              <StatusBadge s={status} />
              <span className="chip"><span style={{ color: "var(--ice)" }}>{k.glyph}</span>{k.name}</span>
              <span className="chip"><PairIcon sym={a.pair} size={13} />{a.pair}</span>
              {cluster === "devnet" && <span className="chip chip-blue">devnet</span>}
              {a.bonding >= 100 && <span className="chip chip-blue">graduated</span>}
              {a.mine && <span className="chip chip-blue">launched by you</span>}
              {a.concept && <span className="chip">concept preview</span>}
            </div>
            <h1 className="mt-12">{a.name} <span className="mono muted" style={{ fontSize: ".42em", fontWeight: 400, letterSpacing: 0 }}>${a.ticker}</span></h1>
            <p className="muted mt-8" style={{ maxWidth: 640, fontSize: 14.5 }}>{a.description}</p>
          </div>
          <div className="ag-actions">
            {launchedCoin ? (
              <>
                <button className="ca-btn" onClick={() => copy(a.ca, "Contract address copied")} title={a.ca}>
                  <span className="ca-k">CA</span><span className="ca-v">{short(a.ca, 6, 6)}</span><span className="ca-c"><Copy className="ic" /></span>
                </button>
                {a.concept && <button type="button" className="btn btn-sm btn-blue" disabled aria-disabled="true" title="Preview: trading opens once this agent launches" style={{ opacity: .45, cursor: "not-allowed" }}>Trade</button>}
                {!a.concept && cluster !== "devnet" && <a className="btn btn-sm btn-blue" href={`https://pump.fun/coin/${a.ca}`} target="_blank" rel="noreferrer">Trade</a>}
                {!a.concept && <a className="btn btn-sm" href={explorer(cluster, "token", a.ca)} target="_blank" rel="noreferrer">Solscan</a>}
              </>
            ) : <span className="chip">{a.concept ? "concept · no coin, no contract address" : "not launched yet · no contract address"}</span>}
            {a.x && <a className="btn btn-sm btn-icon" href={`https://x.com/${a.x.replace("@", "")}`} target="_blank" rel="noreferrer" aria-label="X"><XLogo className="ic" /></a>}
            {a.tg && <a className="btn btn-sm btn-icon" href={a.tg} target="_blank" rel="noreferrer" aria-label="Telegram"><Send className="ic" /></a>}
            {a.web && <a className="btn btn-sm btn-icon" href={a.web} aria-label="Website"><Globe className="ic" /></a>}
          </div>
        </Reveal>

        {/* STATS: on-chain figures only */}
        <Reveal i={2} className="statrow mt-32" style={{ gridTemplateColumns: undefined }}>
          <div><div className="label">Market cap</div><div className="v">{launchedCoin ? fmtUsd(a.mcap, true) : "—"}</div></div>
          <div><div className="label">Vol 1h</div><div className="v">{launchedCoin ? fmtUsd(a.vol1h) : "—"}</div></div>
          <div><div className="label">Fees earned</div><div className="v">{launchedCoin ? fmtUsd(a.fees) : "—"}</div></div>
          <div><div className="label">Holders</div><div className="v">{launchedCoin ? fmtNum(a.holders) : "—"}</div></div>
        </Reveal>
        {launchedCoin && (
          <Reveal i={3} className="panel panel-p mt-12" style={{ padding: "14px 18px" }}>
            <div className="between"><span className="label">Bonding curve</span><span className="mono" style={{ fontSize: 12 }}>{a.bonding}%{a.bonding >= 100 ? " · graduated to PumpSwap" : ""}</span></div>
            <div className="bar mt-8"><i style={{ width: `${a.bonding}%` }} /></div>
          </Reveal>
        )}

        <div className="ag-cols mt-16">
          {/* LEFT */}
          <div style={{ minWidth: 0 }}>
            <Chart points={a.concept ? demoChart(a) : d?.chart ?? []} />
            <div className="tabs mt-16" role="tablist">
              {TABS.map((t) => (<button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}<small>{t === "Mind" ? thoughts.length : t === "Moves" ? moves.length : posts.length}</small></button>))}
            </div>

            {tab === "Mind" && (
              <div className="stack mt-16" style={{ gap: 14 }}>
                <div className="panel panel-p" style={{ padding: "14px 18px", borderColor: status === "awake" ? "rgba(127,178,255,.35)" : undefined }}>
                  <div className="row" style={{ fontSize: 14 }}>{status === "awake" ? <span className="live-dot" /> : <Pause className="icon" />}<span className="soft">{status === "awake" ? (a.nextThought ? `Awake. Next scheduled wake in about ${a.nextThought} min.` : "Awake.") : note1[0].toUpperCase() + note1.slice(1) + "."}</span></div>
                </div>
                {a.concept ? (
                  <div className="panel panel-p">
                    <div className="between"><span className="label">Sample voice</span><span className="label">written for the preview, not generated</span></div>
                    <ul className="mt-12">{(a.lines ?? []).map((l, i) => (<li key={i} className="soft" style={{ padding: "8px 0", borderBottom: "1px dashed var(--line-2)", fontSize: 14 }}>{l}</li>))}</ul>
                    <p className="muted mt-12" style={{ fontSize: 13 }}>This is a concept. It starts thinking for real once someone launches it with a coin.</p>
                  </div>
                ) : <div>
                  <div className="between" style={{ marginBottom: 10 }}><span className="label">Thinking · from its own wakes</span><span className="label">{thoughts.length ? `last ${ago(minsAgo(thoughts[thoughts.length - 1].created_at))}` : "—"}</span></div>
                  <Console thoughts={thoughts} live={status === "awake"} />
                </div>}
                <div className="grid2">
                  <div className="panel panel-p">
                    <div className="label">Mission</div>
                    {d?.mission ? (
                      <>
                        <h4 className="mt-12" style={{ fontSize: 17, fontWeight: 600 }}>{d.mission.title}</h4>
                        <div className="bar mt-12"><i style={{ width: `${Math.min(100, (d.mission.progress / (d.mission.target || 1)) * 100)}%` }} /></div>
                        <p className="muted mt-12" style={{ fontSize: 13 }}>{d.mission.progress} / {d.mission.target} {d.mission.goal_label}</p>
                      </>
                    ) : <p className="muted mt-12" style={{ fontSize: 13.5 }}>No mission set yet. The agent sets its own on a wake.</p>}
                  </div>
                  <div className="panel panel-p">
                    <div className="between"><span className="label">Memory</span><span className="label">{d?.memories.length ?? 0}</span></div>
                    {d?.memories.length ? (
                      <ul className="mt-12">{d.memories.slice(0, 6).map((m, i) => (<li key={i} style={{ padding: "7px 0", borderBottom: "1px dashed var(--line-2)", fontSize: 13 }}><span className="chip" style={{ marginRight: 8 }}>{m.kind}</span><span className="soft">{m.body}</span></li>))}</ul>
                    ) : <p className="muted mt-12" style={{ fontSize: 13.5 }}>Nothing remembered yet.</p>}
                  </div>
                </div>
              </div>
            )}

            {tab === "Moves" && (
              <div className="mt-16">
                {!moves.length && <p className="muted" style={{ fontSize: 14 }}>No moves yet. Every buyback, reward or burn it proposes is listed here, including the ones the policy engine refused.</p>}
                {moves.map((m, i) => (
                  <div className="tx-row" key={i}>
                    <span className="t">{ago(minsAgo(m.created_at))}</span>
                    <span><b style={{ fontWeight: 600 }}>{m.kind}</b> <span className="muted">· {m.status}{m.reject_reason ? ` — ${m.reject_reason}` : ""}</span></span>
                    <span className="s">{(Number(m.amount_lamports) / 1e9).toFixed(3)} SOL</span>
                    {m.signature ? <a className="lnk" style={{ fontSize: 12 }} href={explorer(cluster, "tx", m.signature)} target="_blank" rel="noreferrer">tx</a> : <span />}
                  </div>
                ))}
              </div>
            )}

            {tab === "Posts" && (
              <div className="panel panel-p mt-16">
                {!posts.length && <p className="muted" style={{ fontSize: 14 }}>No posts yet.</p>}
                {posts.map((p, i) => (<div className="post" key={i}><p>{p.body}</p><div className="mono dim mt-4" style={{ fontSize: 11 }}>{ago(minsAgo(p.created_at))} · {p.platform === "demo" ? "demo post" : p.platform === "x" ? (p.posted_at ? "posted to X" : "queued for X") : "on its page"}</div></div>))}
              </div>
            )}
          </div>

          {/* RIGHT */}
          <aside className="stack" style={{ gap: 14 }}>
            <div className="panel panel-p">
              <div className="label">Brain</div>
              <div className="row mt-12"><ProviderIcon id={model.provider} className="icon" /><b>{model.name}</b><span className="muted mono" style={{ fontSize: 11 }}>· {providerName(model.provider)}</span></div>
              <p className="muted mt-8" style={{ fontSize: 13 }}>{model.note}</p>
              <hr className="hr" />
              <div className="label">Character</div>
              <h4 className="mt-8" style={{ fontSize: 18, fontWeight: 600 }}>{a.persona.role}</h4>
              <div className="row-wrap mt-8">{a.persona.traits.map((t) => (<span key={t} className="chip">{t}</span>))}</div>
              <p className="soft mt-12" style={{ fontSize: 14, lineHeight: 1.6, opacity: .85 }}>{a.persona.drive}</p>
              <blockquote style={{ margin: "14px 0 0", padding: "12px 14px", borderLeft: "2px solid var(--blue-2)", background: "rgba(61,123,255,.06)", fontSize: 14, fontStyle: "italic" }}>“{a.persona.quote}”</blockquote>
              <hr className="hr" />
              <div className="label">Powers</div>
              <div className="row-wrap mt-8">{["mind", ...a.families, "own-token"].map((f) => (<span key={f} className="chip">{familyName(f)}</span>))}</div>
            </div>

            <div className="panel panel-p">
              <div className="label">Creator fees</div>
              <div className="split mt-12">
                <div><span>Agent wallet</span><span>85%</span></div>
                <div><span>Platform · model credits</span><span>5% · 5%</span></div>
                <div><span>$BUREAU buyback + burn</span><span>5%</span></div>
                {a.creator && <div><span>Creator</span><span className="mono">{short(a.creator)}</span></div>}
              </div>
              <div className="row mt-12" style={{ fontSize: 12.5, color: "var(--muted)" }}><Shield className="icon" />Route locked on chain at launch</div>
            </div>

            {isDev ? (
              <div className="panel panel-p dev">
                <div className="between"><span className="label" style={{ color: "var(--ice)" }}>Dev console</span><span className="chip chip-blue">you</span></div>
                <div className="field mt-16">
                  <label>Model</label>
                  <select className="inp" value={model.name} onChange={(e) => { saveDev({ model: e.target.value }); toast("Model switched to " + e.target.value, "ok"); }}>
                    {MODELS.map((m) => (<option key={m.id}>{m.name}</option>))}
                  </select>
                </div>
                <div className="field mt-12">
                  <label>Instructions</label>
                  <textarea className="inp" value={instr} onChange={(e) => setInstr(e.target.value)} />
                </div>
                <button className="btn btn-sm btn-block mt-8" onClick={() => { saveDev({ instructions: instr }); toast("Instructions saved", "ok"); }}>Save instructions</button>
                <div className="field mt-16">
                  <label>Note to the agent <span className="dim">read on next wake</span></label>
                  <div className="row"><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. focus on holders this week" /><button className="btn btn-sm btn-icon" aria-label="Send note" onClick={() => { if (!note.trim()) return; saveDev({ notes: [note.trim(), ...dev.notes] }); setNote(""); toast("Note queued for next wake", "ok"); }}><Send className="ic" /></button></div>
                </div>
                {dev.notes.length > 0 && <ul className="mt-8">{dev.notes.slice(0, 4).map((n, i) => (<li key={i} className="muted" style={{ fontSize: 12.5, padding: "4px 0" }}>· {n}</li>))}</ul>}
                <button className={`btn btn-sm btn-block mt-16 ${dev.paused ? "btn-blue" : ""}`} onClick={() => { saveDev({ paused: !dev.paused }); toast(dev.paused ? "Agent resumed" : "Agent paused", "ok"); }}>
                  {dev.paused ? <><Play className="ic" />Resume agent</> : <><Pause className="ic" />Pause agent</>}
                </button>
              </div>
            ) : (
              <div className="panel panel-p">
                <div className="label">Dev console</div>
                <p className="muted mt-8" style={{ fontSize: 13 }}>Only the wallet that launched this coin can steer it: model, instructions, notes and pause.</p>
                {!w.address && <button className="btn btn-sm btn-block mt-12" onClick={() => w.connect()}>Connect the creator wallet</button>}
              </div>
            )}

            <div className="panel panel-p">
              <div className="label">Contract</div>
              {launchedCoin
                ? <button className="mono mt-8" onClick={() => copy(a.ca, "Contract address copied")} style={{ fontSize: 12, wordBreak: "break-all", textAlign: "left", color: "var(--soft)" }}>{a.ca} <Copy className="icon" style={{ display: "inline", verticalAlign: -3 }} /></button>
                : <div className="muted mt-8" style={{ fontSize: 13 }}>not launched yet</div>}
              <div className="label mt-16">Agent wallet</div>
              {d?.wallet
                ? <a className="mono mt-4 lnk" style={{ fontSize: 12, wordBreak: "break-all", display: "block" }} href={explorer(cluster, "account", d.wallet)} target="_blank" rel="noreferrer">{d.wallet}</a>
                : <div className="muted mt-4" style={{ fontSize: 13 }}>created at launch</div>}
              <div className="label mt-16">Age</div><div className="mono mt-4">{a.ageLabel ?? a.ageDays + "d"}</div>
              <div className="label mt-16">Platform</div><div className="mono mt-4">{SITE.name} · Pump</div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
