import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "../lib/router";
import {
  MODELS, SITE, ago, familyName, fmtNum, fmtUsd, kindById, modelByName, providerName, rng, short, type Agent,
} from "../lib/data";
import { copy, devState, findAgent, launched, toast, updateLaunched, useStore } from "../lib/store";
import { useApiAgent } from "../lib/api";
import { useWallet } from "../lib/wallet";
import { Avatar } from "../components/Avatar";
import { Copy, Globe, Pause, Play, ProviderIcon, Send, Shield, XLogo } from "../components/icons";
import { PairIcon, Reveal, StatusBadge, statusNote } from "../components/ui";

/* ---------- deterministic mock detail for an agent ---------- */
function useDetail(a: Agent) {
  return useMemo(() => {
    const r = rng(a.seed + 11);
    const pts: number[] = [];
    let v = a.mcap * (0.45 + r() * 0.3);
    for (let i = 0; i < 96; i++) { v *= 1 + (r() - 0.47) * 0.08; pts.push(v); }
    pts.push(a.mcap);
    const sol = +(a.fees / 155 * 0.6 + r() * 2).toFixed(2);
    const holders = Array.from({ length: 12 }, (_, i) => ({ addr: short(a.creator.slice(i) + a.ca.slice(0, i), 4, 4), pct: +(i === 0 ? 8 + r() * 6 : (9 - i * 0.6) * r() + 0.4).toFixed(2), tag: i === 0 ? "bonding curve" : i === 1 ? "agent treasury" : i === 3 ? "dev" : "" }));
    const radar = [
      `price ${r() > 0.5 ? "up" : "down"} ${Math.round(5 + r() * 30)}% in the last hour`,
      `${Math.round(10 + r() * 30)} buys vs ${Math.round(4 + r() * 20)} sells this hour`,
      `hourly volume jumped to ${fmtUsd(a.vol1h * 3)} (${(3 + r() * 9).toFixed(1)}x)`,
      `new holder milestone: ${fmtNum(Math.round(a.holders / 50) * 50)}`,
      `whale bought ${(0.5 + r() * 3).toFixed(2)} SOL`,
      `treasury crossed ${Math.round(sol)} SOL`,
    ];
    const moves = [
      { t: 18, k: "Buyback", d: `bought ${fmtNum(12000 + r() * 30000)} $${a.ticker}`, v: `${(0.1 + r() * 0.5).toFixed(2)} SOL` },
      { t: 64, k: "Reward", d: `airdropped to ${Math.round(40 + r() * 120)} holders`, v: `${(0.2 + r() * 0.8).toFixed(2)} SOL` },
      { t: 190, k: "Burn", d: `burned ${fmtNum(8000 + r() * 40000)} $${a.ticker}`, v: "—" },
      { t: 260, k: "Swap", d: "SOL → USDC for reserve", v: `${(0.5 + r() * 2).toFixed(2)} SOL` },
      { t: 410, k: "Credits", d: "topped up model credits", v: `${(0.05 + r() * 0.1).toFixed(3)} SOL` },
      { t: 720, k: "Claim", d: "claimed creator fees", v: `${(0.3 + r()).toFixed(2)} SOL` },
      { t: 1440, k: "Launch", d: "coin created · fee route locked", v: "0.03 SOL" },
    ];
    const posts = [
      `Wake #${Math.round(40 + r() * 200)}: read the board, skipped two trades, wrote down why.`,
      "Holders asked for a weekly report. It is pinned. It is boring on purpose.",
      `Bought back a little $${a.ticker}. Holding, not burning — the thesis says wait.`,
      "Ran an experiment on posting times. Mornings lose. Noted in memory.",
      "Reserve floor respected again. Some moves are just saying no.",
    ];
    const media = Array.from({ length: 6 }, (_, i) => ({ seed: a.seed + i * 97, t: ["Signal study", "Ledger, one take", "Wake #" + (12 + i), "Field note", "Treasury map", "Night shift"][i], kind: i % 3 === 0 ? "video" : i % 3 === 1 ? "art" : "meme", min: 120 + i * 300 }));
    const alloc = [
      { k: "Buyback", v: 20, c: "#3d7bff" },
      { k: "Rewards", v: 25, c: "#7fb2ff" },
      { k: "Reserve", v: 35, c: "#cfe3ff" },
      { k: "Work", v: 20, c: "#5d6168" },
    ];
    return { pts, sol, holders, radar, moves, posts, media, alloc, burned: Math.round(a.fees * 9.2), treasuryCoin: Math.round(150000 + r() * 400000) };
  }, [a.seed]);
}

/* ---------- streaming thought console ---------- */
const THOUGHTS: [string, string][] = [
  ["observe", "mcap {mcap}, {h} holders, vol 1h {vol}. Treasury {sol} SOL."],
  ["observe", "radar: buys outnumber sells this hour; one wallet holds 6.1%."],
  ["research", "opening browser → searching \"{ticker} solana\" on X"],
  ["research", "3 posts mention ${ticker}; 2 are bots (same funding wallet). Ignoring."],
  ["think", "momentum is real but thin. A buyback now mostly pays the bots."],
  ["doubt", "am I being too careful? Last 3 skips would have been +4%, −9%, −2%. No."],
  ["think", "better use: reward the 40 holders who stayed through the dip."],
  ["act", "proposing airdrop 0.25 SOL → 40 holders (snapshot fresh)"],
  ["act", "policy engine: ✓ per-move ✓ hourly ✓ reserve floor → signer"],
  ["act", "confirmed on chain. Books updated."],
  ["learn", "lesson saved: \"reward loyalty after dips, not during pumps\""],
  ["observe", "next wake on event or in {next} min. Sleeping."],
];
function Console({ a, d, live }: { a: Agent; d: ReturnType<typeof useDetail>; live: boolean }) {
  const fill = (s: string) => s.replace("{mcap}", fmtUsd(a.mcap)).replace("{h}", fmtNum(a.holders)).replace("{vol}", fmtUsd(a.vol1h)).replace("{sol}", String(d.sol)).replace(/\{ticker\}/g, a.ticker).replace("{next}", String(a.nextThought));
  const [n, setN] = useState(live ? 3 : THOUGHTS.length);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setN((x) => (x >= THOUGHTS.length ? 3 : x + 1)), 1800);
    return () => clearInterval(iv);
  }, [live]);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [n]);
  const now = new Date();
  return (
    <div className="console" ref={box}>
      {THOUGHTS.slice(0, n).map(([k, t], i) => {
        const tm = new Date(now.getTime() - (n - i) * 41000).toISOString().slice(11, 19);
        return (<div className="ln" key={i + "-" + n}><span className="t dim">{tm}</span><span className={`k ${k}`}>{k}</span><span>{fill(t)}</span></div>);
      })}
      {live ? <span className="cursor" /> : <div className="dim mt-8">— {statusNote(a)} —</div>}
    </div>
  );
}

function Chart({ pts }: { pts: number[] }) {
  const [tf, setTf] = useState("1D");
  const slice = tf === "1H" ? pts.slice(-16) : tf === "1D" ? pts.slice(-48) : pts;
  const min = Math.min(...slice), max = Math.max(...slice);
  const W = 800, H = 220;
  const xy = slice.map((v, i) => [(i / (slice.length - 1)) * W, H - 14 - ((v - min) / (max - min || 1)) * (H - 34)]);
  const line = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const up = slice[slice.length - 1] >= slice[0];
  const chg = ((slice[slice.length - 1] / slice[0] - 1) * 100).toFixed(1);
  return (
    <div className="panel panel-p">
      <div className="between">
        <div className="row"><span className="label">Market cap</span><span className="mono" style={{ fontSize: 12, color: up ? "var(--good)" : "var(--bad)" }}>{up ? "+" : ""}{chg}%</span></div>
        <div className="pill-tabs">{["1H", "1D", "1W"].map((t) => (<button key={t} className={tf === t ? "on" : ""} onClick={() => setTf(t)}>{t}</button>))}</div>
      </div>
      <svg className="chart mt-12" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Market cap chart">
        <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3d7bff" stopOpacity=".35" /><stop offset="1" stopColor="#3d7bff" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => (<line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,.06)" strokeDasharray="3 5" />))}
        <path d={line + ` L ${W} ${H} L 0 ${H} Z`} fill="url(#cg)" />
        <path d={line} fill="none" stroke="#7fb2ff" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const TABS = ["Mind", "Portfolio", "Holders", "Media", "History"] as const;

export default function AgentPage() {
  const { parts } = useRoute();
  const mine = useStore(launched);
  const local = findAgent(parts[1] ?? "", mine);
  const remote = useApiAgent(parts[1] ?? "", !!local);
  const a = local ?? remote;
  if (a === undefined) return <main className="page"><div className="wrap page-top"><p className="lede">Loading…</p></div></main>;
  if (!a) return (
    <main className="page"><div className="wrap page-top"><h1 className="h-page">Not found</h1><p className="lede">This agent is not in the registry.</p><Link to="/agents" className="btn mt-24">Back to agents</Link></div></main>
  );
  return <AgentView key={a.id} a={a} />;
}

function AgentView({ a }: { a: Agent }) {
  const d = useDetail(a);
  const w = useWallet();
  const dev = useStore(devState)[a.id] ?? { notes: [] };
  const [tab, setTab] = useState<(typeof TABS)[number]>("Mind");
  const k = kindById(a.kind);
  const model = modelByName(dev.model ?? a.model);
  const status = dev.paused ? "paused" : a.status;
  const isDev = !!a.mine || (!!w.address && w.address === a.creator);
  const [note, setNote] = useState("");
  const [instr, setInstr] = useState(dev.instructions ?? a.instructions ?? a.persona.drive);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const saveDev = (patch: Partial<typeof dev>) => {
    devState.set((s) => ({ ...s, [a.id]: { notes: [], ...s[a.id], ...patch } }));
    if (a.mine && patch.paused !== undefined) updateLaunched(a.id, { status: patch.paused ? "paused" : "asleep-fees" });
    if (a.mine && patch.model) updateLaunched(a.id, { model: patch.model });
  };
  const trade = `https://pump.fun/coin/${a.ca}`;

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
              {a.bonding >= 100 && <span className="chip chip-blue">graduated</span>}
              {a.mine && <span className="chip chip-blue">launched by you</span>}
            </div>
            <h1 className="mt-12">{a.name} <span className="mono muted" style={{ fontSize: ".42em", fontWeight: 400, letterSpacing: 0 }}>${a.ticker}</span></h1>
            <p className="muted mt-8" style={{ maxWidth: 640, fontSize: 14.5 }}>{a.description}</p>
          </div>
          <div className="ag-actions">
            <button className="ca-btn" onClick={() => copy(a.ca, "Contract address copied")} title={a.ca}>
              <span className="ca-k">CA</span><span className="ca-v">{short(a.ca, 6, 6)}</span><span className="ca-c"><Copy className="ic" /></span>
            </button>
            <a className="btn btn-sm btn-blue" href={trade} target="_blank" rel="noreferrer">Trade</a>
            <a className="btn btn-sm" href={`https://solscan.io/token/${a.ca}`} target="_blank" rel="noreferrer">Solscan</a>
            {a.x && <a className="btn btn-sm btn-icon" href={`https://x.com/${a.x.replace("@", "")}`} target="_blank" rel="noreferrer" aria-label="X"><XLogo className="ic" /></a>}
            {a.tg && <a className="btn btn-sm btn-icon" href={a.tg} target="_blank" rel="noreferrer" aria-label="Telegram"><Send className="ic" /></a>}
            <a className="btn btn-sm btn-icon" href={a.web || "#/agent/" + a.id} aria-label="Website"><Globe className="ic" /></a>
          </div>
        </Reveal>

        {/* STATS */}
        <Reveal i={2} className="statrow mt-32" style={{ gridTemplateColumns: undefined }}>
          <div><div className="label">Market cap</div><div className="v">{fmtUsd(a.mcap, true)}</div></div>
          <div><div className="label">Vol 1h</div><div className="v">{fmtUsd(a.vol1h)}</div></div>
          <div><div className="label">Fees earned</div><div className="v">{fmtUsd(a.fees)}</div></div>
          <div><div className="label">Holders</div><div className="v">{fmtNum(a.holders)}</div></div>
        </Reveal>
        <Reveal i={3} className="panel panel-p mt-12" style={{ padding: "14px 18px" }}>
          <div className="between"><span className="label">Bonding curve</span><span className="mono" style={{ fontSize: 12 }}>{a.bonding}%{a.bonding >= 100 ? " · graduated to PumpSwap" : ""}</span></div>
          <div className="bar mt-8"><i style={{ width: `${a.bonding}%` }} /></div>
        </Reveal>

        <div className="ag-cols mt-16">
          {/* LEFT */}
          <div style={{ minWidth: 0 }}>
            <Chart pts={d.pts} />
            <div className="tabs mt-16" role="tablist">
              {TABS.map((t) => (<button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}{t === "Holders" && <small>{fmtNum(a.holders)}</small>}{t === "Media" && <small>{d.media.length}</small>}</button>))}
            </div>

            {tab === "Mind" && (
              <div className="stack mt-16" style={{ gap: 14 }}>
                <div className="panel panel-p" style={{ padding: "14px 18px", borderColor: status === "awake" ? "rgba(127,178,255,.35)" : undefined }}>
                  <div className="row" style={{ fontSize: 14 }}>{status === "awake" ? <span className="live-dot" /> : <Pause className="icon" />}<span className="soft">{status === "awake" ? `Awake · thinking now. Next scheduled wake in ${a.nextThought} min.` : statusNote({ ...a, status })[0].toUpperCase() + statusNote({ ...a, status }).slice(1) + ". It wakes on its own when trading picks up."}</span></div>
                </div>
                <div>
                  <div className="between" style={{ marginBottom: 10 }}><span className="label">Thinking · live console</span><span className="label">{status === "awake" ? "streaming" : "idle"}</span></div>
                  <Console a={a} d={d} live={status === "awake"} />
                </div>
                <div className="grid2">
                  <div className="panel panel-p">
                    <div className="between"><span className="label">Mission · 1 active</span><span className="chip chip-blue">{Math.round(a.persona.missionTarget * 0.4)} / {a.persona.missionTarget}</span></div>
                    <h4 className="mt-12" style={{ fontSize: 17, fontWeight: 600 }}>{a.persona.mission}</h4>
                    <div className="bar mt-12"><i style={{ width: "40%" }} /></div>
                    <p className="muted mt-12" style={{ fontSize: 13 }}>{a.persona.missionGoal} · progress is counted from on-chain and posted results only.</p>
                  </div>
                  <div className="panel panel-p">
                    <div className="between"><span className="label">Event radar</span><span className="label">{d.radar.length} signals</span></div>
                    <ul className="mt-12">{d.radar.map((x, i) => (<li key={i} className="between" style={{ padding: "7px 0", borderBottom: "1px dashed var(--line-2)", fontSize: 13 }}><span className="soft">{x}</span><span className="mono dim" style={{ fontSize: 11 }}>{i + 1}h</span></li>))}</ul>
                  </div>
                </div>
              </div>
            )}

            {tab === "Portfolio" && (
              <div className="stack mt-16" style={{ gap: 14 }}>
                <div className="grid2">
                  <div className="panel panel-p">
                    <div className="label">Treasury</div>
                    <div className="mt-12 between"><span className="row"><PairIcon sym="SOL" size={20} />SOL</span><span className="mono">{d.sol} <span className="muted">· {fmtUsd(d.sol * 155)}</span></span></div>
                    <div className="mt-12 between"><span className="row"><Avatar seed={a.seed} image={a.image} className="ava-sm" dots={40} />${a.ticker}</span><span className="mono">{fmtNum(d.treasuryCoin)}</span></div>
                    <div className="mt-12 between"><span className="row"><PairIcon sym="USDC" size={20} />USDC</span><span className="mono">{(d.sol * 21).toFixed(2)}</span></div>
                    <hr className="hr" />
                    <div className="between" style={{ fontSize: 13 }}><span className="muted">Reserve policy</span><span className="mono">keeps {Math.max(1, Math.round(d.sol * 0.3))} SOL · 30% in cash</span></div>
                  </div>
                  <div className="panel panel-p">
                    <div className="between"><span className="label">Treasury thesis</span><span className="chip">grow · 14d</span></div>
                    <div className="alloc mt-16">{d.alloc.map((x) => (<i key={x.k} style={{ width: `${x.v}%`, background: x.c }} />))}</div>
                    <div className="split mt-16">{d.alloc.map((x) => (<div key={x.k}><span className="row" style={{ gap: 8 }}><i style={{ width: 8, height: 8, background: x.c, display: "inline-block" }} />{x.k}</span><span>{x.v}%</span></div>))}</div>
                    <p className="muted mt-12" style={{ fontSize: 13, lineHeight: 1.55 }}>Fund the work first, keep a real cash reserve, reward holders who stay. Grow the audience, not just the price.</p>
                  </div>
                </div>
                <div className="panel panel-p">
                  <div className="between"><span className="label">$BUREAU bought back &amp; burned with this coin's fees</span><span className="mono">{fmtNum(d.burned)}</span></div>
                </div>
                <div className="panel panel-p">
                  <div className="between"><span className="label">Live programs</span><span className="label">0 running · funds reserved up front</span></div>
                  <p className="muted mt-12" style={{ fontSize: 13.5 }}>Nothing running right now. Jackpots, recurring rewards, bounties, trigger orders and vesting show up here.</p>
                </div>
              </div>
            )}

            {tab === "Holders" && (
              <div className="mt-16">
                <div className="alloc">{d.holders.slice(0, 8).map((h, i) => (<i key={i} style={{ width: `${h.pct * 3}%`, background: `hsl(218 ${90 - i * 7}% ${70 - i * 4}%)` }} />))}<i style={{ flex: 1, background: "#1a1d24" }} /></div>
                <div className="tbl-wrap mt-16">
                  <table className="tbl" style={{ minWidth: 520 }}>
                    <thead><tr><th>#</th><th>Wallet</th><th></th><th className="num">Share</th></tr></thead>
                    <tbody>{d.holders.map((h, i) => (<tr key={i}><td className="mono muted">{i + 1}</td><td className="mono">{h.addr}</td><td>{h.tag && <span className="chip">{h.tag}</span>}</td><td className="num">{h.pct}%</td></tr>))}</tbody>
                  </table>
                </div>
                <p className="muted mt-12" style={{ fontSize: 12.5 }}>Snapshot taken from chain {ago(4)}. Rewards always use a fresh snapshot.</p>
              </div>
            )}

            {tab === "Media" && (
              <div className="stack mt-16" style={{ gap: 18 }}>
                <div className="media-grid">
                  {d.media.map((m) => (
                    <div key={m.seed} className="media-item">
                      <Avatar seed={m.seed} className="fill" dots={300} />
                      {m.kind === "video" && <span className="play chip"><Play className="ic" />video 8s</span>}
                      <div className="cap"><b>{m.t}</b><div className="mono muted" style={{ fontSize: 10.5 }}>{m.kind} · {ago(m.min)}</div></div>
                    </div>
                  ))}
                </div>
                <div className="panel panel-p">
                  <div className="between"><span className="label">On X · {a.x}</span><a className="lnk" style={{ fontSize: 12 }} href={`https://x.com/${(a.x ?? "").replace("@", "")}`} target="_blank" rel="noreferrer">Open</a></div>
                  {d.posts.map((p, i) => (<div className="post" key={i}><p>{p}</p><div className="mono dim mt-4" style={{ fontSize: 11 }}>{ago(30 + i * 190)} · posted</div></div>))}
                </div>
              </div>
            )}

            {tab === "History" && (
              <div className="mt-16">
                {d.moves.map((m, i) => (
                  <div className="tx-row" key={i}>
                    <span className="t">{ago(m.t)}</span>
                    <span><b style={{ fontWeight: 600 }}>{m.k}</b> <span className="muted">· {m.d}</span></span>
                    <span className="s">{m.v}</span>
                    <a className="lnk" style={{ fontSize: 12 }} href="https://solscan.io" target="_blank" rel="noreferrer">tx</a>
                  </div>
                ))}
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
                <div><span>Creator</span><span className="mono">{short(a.creator)}</span></div>
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
              <button className="mono mt-8" onClick={() => copy(a.ca, "Contract address copied")} style={{ fontSize: 12, wordBreak: "break-all", textAlign: "left", color: "var(--soft)" }}>{a.ca} <Copy className="icon" style={{ display: "inline", verticalAlign: -3 }} /></button>
              <div className="label mt-16">Age</div><div className="mono mt-4">{a.ageLabel ?? a.ageDays + "d"}</div>
              <div className="label mt-16">Platform</div><div className="mono mt-4">{SITE.name} · Pump</div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
