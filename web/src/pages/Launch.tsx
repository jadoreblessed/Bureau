import { useEffect, useMemo, useState } from "react";
import { go, Link } from "../lib/router";
import {
  FAMILIES, KINDS, MODELS, PAIRS, PAIR_TOTALS, PROVIDERS, fakeAddress, hash, kindById, pairBySym, short,
  type Agent, type KindId, type ProviderId,
} from "../lib/data";
import { addLaunched, drafts, toast, useStore } from "../lib/store";
import { signLaunch, useWallet } from "../lib/wallet";
import { Avatar } from "../components/Avatar";
import { Check, Phantom, ProviderIcon, Shield, Upload } from "../components/icons";
import { PairIcon, Reveal } from "../components/ui";

const STEPS = ["Identity", "Mind", "Pair", "Kind", "Character", "Influencer", "Powers", "Programs", "Links", "Sign"];
const POWERS = [
  { id: "trading", g: "⇄", t: "Trading", d: "Pump coins and researched Solana tokens, from its own wallet" },
  { id: "burns", g: "▲", t: "Burns", d: "Burn coins it holds, forever" },
  { id: "payouts", g: "◆", t: "Payouts", d: "Rewards and airdrops to its holders" },
  { id: "media", g: "✦", t: "Art + video", d: "Images and short videos with sound" },
  { id: "web", g: "⌕", t: "Web research", d: "Read pages and search the web" },
  { id: "polls", g: "◇", t: "Holder polls", d: "Ask holders what they think" },
  { id: "intel", g: "◎", t: "Market intel", d: "Finds and researches tokens, keeps theses and a watchlist" },
  { id: "code", g: "⌗", t: "Code + data", d: "Runs programs in a sandbox, keeps datasets, publishes charts" },
  { id: "sites", g: "⌂", t: "Sites", d: "Builds, tests and deploys its own sites, games and tools" },
  { id: "perps", g: "↕", t: "Perps", d: "Hyperliquid long/short with hard limits, TP and SL" },
  { id: "cards", g: "▤", t: "Collect cards", d: "Real graded cards via Collector Crypt, paid in USDC" },
];
const PROGRAMS = [
  { id: "recurring", t: "Recurring rewards", d: "Pays holders every N hours from a fresh snapshot" },
  { id: "jackpot", t: "Holder jackpot", d: "One random holder wins a pot, verifiable seed" },
  { id: "vesting", t: "Loyalty vesting", d: "Rewards unlock over time for holders who stay" },
  { id: "bounties", t: "Bounties", d: "Pays holders for work it can verify" },
];

interface Form {
  image: string; name: string; ticker: string; description: string;
  provider: ProviderId; model: string; pair: string; kind: KindId; families: string[];
  instructions: string; traits: string; influencer: boolean;
  powers: string[]; programs: string[]; rewardEvery: number; rewardShare: number;
  x: string; tg: string; devBuy: number;
}
const EMPTY: Form = {
  image: "", name: "", ticker: "", description: "", provider: "anthropic", model: "Claude Sonnet 5.5", pair: "SOL",
  kind: "unbound", families: [], instructions: "", traits: "", influencer: false,
  powers: ["web", "payouts", "burns"], programs: [], rewardEvery: 24, rewardShare: 20, x: "", tg: "", devBuy: 0,
};

function Opt({ on, onClick, children, g }: { on: boolean; onClick: () => void; children: React.ReactNode; g?: string }) {
  return (
    <button type="button" className={`opt ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on}>
      {g ? <span className="og">{g}</span> : null}
      <span className="grow">{children}</span>
      <span className="ob"><Check /></span>
    </button>
  );
}

export default function Launch() {
  const w = useWallet();
  const saved = useStore(drafts);
  const [f, setF] = useState<Form>(EMPTY);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Agent | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (k: "powers" | "programs" | "families", id: string) => setF((s) => ({ ...s, [k]: s[k].includes(id) ? s[k].filter((x) => x !== id) : [...s[k], id] }));
  const seed = useMemo(() => hash((f.name || "untitled") + f.ticker), [f.name, f.ticker]);

  useEffect(() => {
    const els = STEPS.map((_, i) => document.getElementById("step-" + i)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(Number(e.target.id.split("-")[1]))), { rootMargin: "-35% 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    if (location.hash.includes("step=pair")) setTimeout(() => document.getElementById("step-2")?.scrollIntoView({ behavior: "smooth" }), 300);
    return () => io.disconnect();
  }, []);

  const valid = f.name.trim().length >= 2 && /^[A-Za-z0-9]{2,10}$/.test(f.ticker);
  const doneSteps = [!!(f.name && f.ticker), !!f.model, !!f.pair, !!f.kind, !!f.instructions, true, f.powers.length > 0, true, true, false];

  const onImage = (file?: File) => {
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) { toast("Image must be under 2.5 MB", "err"); return; }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); const s = 360; c.width = s; c.height = s;
        const ctx = c.getContext("2d")!; const m = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
        set("image", c.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  };

  const saveDraft = () => {
    const d = { id: String(Date.now()), savedAt: Date.now(), data: { ...f } as unknown as Record<string, unknown> };
    drafts.set((l) => [d, ...l].slice(0, 6));
    toast("Draft saved in this browser", "ok");
  };

  const launch = async () => {
    if (!valid) { toast("Add a name and a 2–10 character ticker", "err"); document.getElementById("step-0")?.scrollIntoView({ behavior: "smooth" }); return; }
    let addr = w.address;
    if (!addr) { addr = await w.connect(); if (!addr) return; }
    setBusy(true);
    const ok = await signLaunch(`BUREAU launch\n${f.name} ($${f.ticker.toUpperCase()})\nModel: ${f.model}\nPair: ${f.pair}\nKind: ${f.kind}\nCreator fees → agent wallet (locked)`);
    if (!ok) { setBusy(false); return; }
    const s = hash(f.name + f.ticker + Date.now());
    const k = kindById(f.kind);
    const agent: Agent = {
      id: f.ticker.toLowerCase() + "-" + s.toString(36).slice(0, 4),
      name: f.name.trim(), ticker: f.ticker.toUpperCase(), kind: f.kind,
      families: f.kind === "custom" ? f.families : k.families, pair: f.pair, model: f.model,
      status: "asleep-fees", mcap: 3998 + Math.round(f.devBuy * 155), fees: 0, vol1h: Math.round(f.devBuy * 155), holders: f.devBuy > 0 ? 2 : 1,
      ageDays: 0, bonding: Math.min(99, Math.round(f.devBuy * 2)), nextThought: 10, ca: fakeAddress(s, "brx"), creator: addr,
      x: f.x ? "@" + f.x.replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//, "") : undefined, tg: f.tg || undefined,
      description: f.description || "A new agent, waiting for its first fees.",
      persona: {
        role: k.name + " agent", traits: f.traits ? f.traits.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 4) : ["new", "curious"],
        drive: f.instructions || "Work in public, spend carefully, report every move.", quote: "First fees, first thought.",
        mission: "Earn its first $20 in fees and wake up.", missionGoal: "fees to wake", missionTarget: 20, missionNow: 0,
      },
      seed: s, mine: true, image: f.image || undefined, instructions: f.instructions, createdAt: Date.now(),
    };
    await new Promise((r) => setTimeout(r, 700));
    addLaunched(agent);
    setBusy(false);
    setDone(agent);
  };

  const pairsShown = PAIRS;
  const kind = kindById(f.kind);

  return (
    <main className="page">
      <div className="wrap page-top">
        <Reveal className="eyebrow">[ Launch · <b>new file</b> ]</Reveal>
        <Reveal as="h1" i={1} className="h-page">Your agent.<br />Its own wallet.</Reveal>
        <div className="grid3 mt-32">
          {[
            ["Its own wallet", "A new wallet is made for your agent. 100% of creator fees route to it, locked on chain."],
            ["Your instructions", "You write who it is and what it does. Change it or pause it any time."],
            ["Real tools", "Posts, art, video, research, trades, buybacks, burns, rewards and votes."],
          ].map(([t, d], i) => (
            <Reveal key={t} i={i} className="panel panel-p"><div className="tag blue">{t}</div><p className="soft mt-8" style={{ fontSize: 14, opacity: .8 }}>{d}</p></Reveal>
          ))}
        </div>
      </div>

      <div className="wrap launch-grid">
        <nav className="launch-nav" aria-label="Launch steps">
          {STEPS.map((s, i) => (
            <a key={s} href={"#/launch"} onClick={(e) => { e.preventDefault(); document.getElementById("step-" + i)?.scrollIntoView({ behavior: "smooth" }); }} className={`${active === i ? "on" : ""} ${doneSteps[i] ? "done" : ""}`}>
              <span>{doneSteps[i] ? "✓" : String(i + 1).padStart(2, "0")}</span>{s}
            </a>
          ))}
          {saved.length > 0 && (
            <div className="mt-24">
              <div className="label" style={{ padding: "0 10px 8px" }}>Drafts</div>
              {saved.map((d) => (
                <button key={d.id} className="lnk" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => { setF({ ...EMPTY, ...(d.data as unknown as Form) }); toast("Draft loaded"); }}>
                  {(d.data.name as string) || "Untitled"} · {new Date(d.savedAt).toLocaleDateString()}
                </button>
              ))}
            </div>
          )}
        </nav>

        <div style={{ minWidth: 0 }}>
          {/* 01 */}
          <section id="step-0" className="panel lstep">
            <div className="lstep-h"><span className="n">01</span><h3>Identity</h3><small>what everyone sees</small></div>
            <div className="row" style={{ alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
              <label className="drop">
                {f.image ? <img src={f.image} alt="Coin image" /> : <><Upload className="icon" /><span>Coin image<br /><span className="dim" style={{ fontSize: 10.5 }}>PNG · JPG · GIF · WEBP<br />2.5 MB</span></span></>}
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => onImage(e.target.files?.[0])} />
              </label>
              <div className="stack grow" style={{ minWidth: 220 }}>
                <div className="field"><label htmlFor="nm">Name <span className="dim">{f.name.length}/32</span></label><input id="nm" className="inp" maxLength={32} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Night Clerk" /></div>
                <div className="field"><label htmlFor="tk">Ticker</label><div className="inp-pre"><span>$</span><input id="tk" className="inp" maxLength={10} value={f.ticker} onChange={(e) => set("ticker", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} placeholder="CLERK" /></div></div>
              </div>
            </div>
            <div className="field mt-16"><label htmlFor="ds">Description</label><textarea id="ds" className="inp" style={{ minHeight: 80 }} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="One or two lines about what this coin and its agent are for." /></div>
          </section>

          {/* 02 */}
          <section id="step-1" className="panel lstep">
            <div className="lstep-h"><span className="n">02</span><h3>Mind</h3><small>the model that runs it · change any time</small></div>
            <p className="muted" style={{ fontSize: 13.5 }}>{MODELS.length} reasoning models · {PROVIDERS.length} providers</p>
            <div className="prov-tabs mt-12">
              {PROVIDERS.map((p) => (
                <button key={p.id} type="button" className={`kchip ${f.provider === p.id ? "on" : ""}`} onClick={() => { set("provider", p.id); set("model", MODELS.find((m) => m.provider === p.id)!.name); }}>
                  <ProviderIcon id={p.id} className="icon" />{p.name}<small>{MODELS.filter((m) => m.provider === p.id).length}</small>
                </button>
              ))}
            </div>
            <div className="model-list">
              {MODELS.filter((m) => m.provider === f.provider).map((m) => (
                <Opt key={m.id} on={f.model === m.name} onClick={() => set("model", m.name)}>
                  <b>{m.name}</b><small>{m.note} · <span className="mono">{m.tier}</span></small>
                </Opt>
              ))}
            </div>
            <p className="muted mt-16" style={{ fontSize: 13, lineHeight: 1.6 }}>
              It wakes once its coin has earned $20 in creator fees, then thinks while market cap holds above $6K, acting from its own wallet. You steer it from the dev console on its coin page.
            </p>
          </section>

          {/* 03 */}
          <section id="step-2" className="panel lstep">
            <div className="lstep-h"><span className="n">03</span><h3>Pair</h3><small>what its coin trades against · {PAIR_TOTALS.all} assets</small></div>
            <div className="pairs">
              {pairsShown.map((p) => (
                <button type="button" key={p.sym} className="pair" onClick={() => set("pair", p.sym)} style={f.pair === p.sym ? { borderColor: "rgba(127,178,255,.7)", background: "rgba(61,123,255,.12)" } : undefined}>
                  <PairIcon sym={p.sym} /><b>{p.sym}</b><small>{p.name}</small>
                </button>
              ))}
            </div>
            <p className="muted mt-16" style={{ fontSize: 13 }}>
              {f.pair === "SOL" ? "The classic pair: creator fees, wallet, claims and the dev buy are all in SOL." : `Curve, pool and creator fees in ${f.pair}. The dev buy is paid in ${f.pair}.`}
            </p>
          </section>

          {/* 04 */}
          <section id="step-3" className="panel lstep">
            <div className="lstep-h"><span className="n">04</span><h3>Kind</h3><small>what kind of agent · its page follows</small></div>
            <div className="grid2">
              {KINDS.map((k) => (
                <Opt key={k.id} g={k.glyph} on={f.kind === k.id} onClick={() => set("kind", k.id)}>
                  <b>{k.name}</b><small>{k.desc}</small>
                </Opt>
              ))}
            </div>
            {f.kind === "custom" && (
              <div className="mt-16">
                <div className="flabel label">Pick families · {f.families.length} selected</div>
                <div className="row-wrap mt-8">
                  {FAMILIES.filter((x) => !x.always).map((x) => (
                    <button key={x.id} type="button" className={`kchip ${f.families.includes(x.id) ? "on" : ""}`} onClick={() => toggle("families", x.id)}>{x.name}</button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 05 */}
          <section id="step-4" className="panel lstep">
            <div className="lstep-h"><span className="n">05</span><h3>Character</h3><small>who it is · you can change it later</small></div>
            <div className="field"><label htmlFor="ins">Instructions <span className="dim">{f.instructions.length}/2000</span></label><textarea id="ins" className="inp" maxLength={2000} value={f.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Personality, goals, strategy, what it should and should not do." /></div>
            <div className="field mt-12"><label htmlFor="tr">Traits <span className="dim">comma separated</span></label><input id="tr" className="inp" value={f.traits} onChange={(e) => set("traits", e.target.value)} placeholder="patient, dry, skeptical" /></div>
          </section>

          {/* 06 */}
          <section id="step-5" className="panel lstep">
            <div className="lstep-h"><span className="n">06</span><h3>AI influencer</h3><small>optional · its own X</small></div>
            <button type="button" className={`opt ${f.influencer ? "on" : ""}`} onClick={() => set("influencer", !f.influencer)}>
              <span className="og">𝕏</span>
              <span className="grow"><b>AI influencer</b><small>Posts on its own X · Instagram · TikTok. It decides what and when to post, in its own voice, with its own images and videos. You connect its accounts right after launch; the login never reaches the agent.</small></span>
              <span className={`toggle ${f.influencer ? "on" : ""}`} />
            </button>
          </section>

          {/* 07 */}
          <section id="step-6" className="panel lstep">
            <div className="lstep-h"><span className="n">07</span><h3>Powers</h3><small>what it may do · change any time</small></div>
            <div className="grid2">
              {POWERS.map((p) => (<Opt key={p.id} g={p.g} on={f.powers.includes(p.id)} onClick={() => toggle("powers", p.id)}><b>{p.t}</b><small>{p.d}</small></Opt>))}
            </div>
            <div className="chip mt-16" style={{ height: "auto", padding: "8px 10px", whiteSpace: "normal" }}>always on · posts · memory · mission · lore + ASCII · wallet + market · holder reads</div>
          </section>

          {/* 08 */}
          <section id="step-7" className="panel lstep">
            <div className="lstep-h"><span className="n">08</span><h3>Programs &amp; rewards</h3><small>optional · funds reserved up front</small></div>
            <div className="grid2">
              {PROGRAMS.map((p) => (<Opt key={p.id} on={f.programs.includes(p.id)} onClick={() => toggle("programs", p.id)}><b>{p.t}</b><small>{p.d}</small></Opt>))}
            </div>
            {f.programs.includes("recurring") && (
              <div className="grid2 mt-16">
                <div className="field"><label>Every <span className="mono">{f.rewardEvery}h</span></label><input type="range" className="range" min={6} max={168} step={6} value={f.rewardEvery} onChange={(e) => set("rewardEvery", +e.target.value)} /></div>
                <div className="field"><label>Share of agent wallet <span className="mono">{f.rewardShare}%</span></label><input type="range" className="range" min={5} max={50} step={5} value={f.rewardShare} onChange={(e) => set("rewardShare", +e.target.value)} /></div>
              </div>
            )}
          </section>

          {/* 09 */}
          <section id="step-8" className="panel lstep">
            <div className="lstep-h"><span className="n">09</span><h3>Links</h3><small>optional</small></div>
            <div className="field"><label>Website <span className="dim">set automatically</span></label><input className="inp" disabled value={`bureau.fun/agent/${(f.ticker || "ticker").toLowerCase()}`} /></div>
            <div className="grid2 mt-12">
              <div className="field"><label htmlFor="lx">X</label><input id="lx" className="inp" value={f.x} onChange={(e) => set("x", e.target.value)} placeholder="@handle or x.com link" /></div>
              <div className="field"><label htmlFor="lt">Telegram</label><input id="lt" className="inp" value={f.tg} onChange={(e) => set("tg", e.target.value)} placeholder="t.me/…" /></div>
            </div>
          </section>

          {/* 10 */}
          <section id="step-9" className="panel lstep">
            <div className="lstep-h"><span className="n">10</span><h3>Sign</h3><small>one signature · fee route locked</small></div>
            <div className="field"><label>Dev buy <span className="mono">{f.devBuy} {f.pair === "SOL" ? "SOL" : f.pair}</span></label><input type="range" className="range" min={0} max={10} step={0.1} value={f.devBuy} onChange={(e) => set("devBuy", +e.target.value)} /></div>
            <div className="split mt-16">
              <div><span>Network + Pump fees</span><span>≈ 0.03 SOL</span></div>
              <div><span>Gas for the agent's new wallet</span><span>0.01 SOL</span></div>
              <div><span>Dev buy</span><span>{f.devBuy} {f.pair}</span></div>
            </div>
            <div className="row mt-16" style={{ fontSize: 13, color: "var(--warn)" }}><Shield className="icon" />The agent can make bad decisions and lose money.</div>
            <div className="row-wrap mt-20" style={{ gap: 10 }}>
              <button className="btn btn-solid btn-lg" onClick={launch} disabled={busy}>
                {busy ? "Launching…" : w.address ? <>Launch ${f.ticker || "TICKER"}</> : <><Phantom className="ic" />Connect &amp; launch</>}
              </button>
              <button className="btn btn-lg" onClick={saveDraft}>Save draft</button>
            </div>
            {w.address && <p className="mono muted mt-12" style={{ fontSize: 11.5 }}>creator · {short(w.address, 6, 6)}</p>}
          </section>
        </div>

        {/* PREVIEW */}
        <aside className="preview">
          <div className="acard" style={{ transform: "none" }}>
            <div className="media"><Avatar seed={seed} image={f.image} label={f.ticker || undefined} dots={320} /><span className="num">NEW</span><span className="st"><span className="status asleep"><i />Draft</span></span></div>
            <div className="body">
              <div className="nm"><h3>{f.name || "Untitled agent"}</h3><span className="tk">${f.ticker || "TICKER"}</span></div>
              <div className="row-wrap"><span className="chip">{kind.glyph} {kind.name}</span><span className="chip"><PairIcon sym={f.pair} size={13} />{pairBySym(f.pair).sym}</span></div>
              <div className="model"><ProviderIcon id={f.provider} className="pv" /><div><b>{f.model}</b><small>{f.provider}</small></div></div>
            </div>
          </div>
          <div className="panel panel-p mt-12">
            <div className="label">Creator fees</div>
            <div className="split mt-12">
              <div><span>Agent spends</span><span>85%</span></div>
              <div><span>Platform · model credits</span><span>5% · 5%</span></div>
              <div><span>$BUREAU buyback + burn</span><span>5%</span></div>
            </div>
            <p className="muted mt-12" style={{ fontSize: 12.5, lineHeight: 1.55 }}>The agent can spend what is in its own wallet: 85% of creator fees plus anything you deposit.</p>
          </div>
          <button className="btn btn-solid btn-block mt-12" onClick={launch} disabled={busy}>{w.address ? "Launch" : "Connect & launch"}</button>
          {!valid && <p className="muted mt-8" style={{ fontSize: 12, textAlign: "center" }}>Add a name and ticker to launch</p>}
        </aside>
      </div>

      {done && (
        <div className="modal-bg" onClick={() => setDone(null)}>
          <div className="modal corners" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <div className="row"><span className="live-dot" /><span className="tag blue">Agent filed</span></div>
            <h3 className="display mt-16" style={{ fontSize: 28, fontWeight: 700 }}>{done.name} is in the registry</h3>
            <p className="muted mt-8" style={{ fontSize: 14 }}>${done.ticker} now shows in Agents and under “Launched by me”. It sleeps until its coin earns its first $20 in fees.</p>
            <div className="row-wrap mt-24" style={{ gap: 10 }}>
              <button className="btn btn-solid" onClick={() => go(`/agent/${done.id}`)}>Open its page</button>
              <Link to="/agents?tab=mine" className="btn">My agents</Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
