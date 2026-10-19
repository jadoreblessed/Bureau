import { useEffect, useState } from "react";
import { Link, go } from "../lib/router";
import {
  AGENTS, BURNS, BURN_TOTALS, CLASSIC, CLASSIC_TOTAL, ECONOMICS, FAMILIES, KINDS, LOOP, MODELS, PAIRS, PAIR_TOTALS, PROVIDERS,
  TOTALS, ago, fmtNum, fmtUsd, makeFeed, type FeedItem,
} from "../lib/data";
import { launched, useStore } from "../lib/store";
import { Avatar } from "../components/Avatar";
import { ProviderIcon } from "../components/icons";
import { Glyph, WireGlobe } from "../components/Glyphs";
import { SignalPath } from "../components/SignalPath";
import { AgentCard, CountUp, PairIcon, Reveal, SecHead, SplitText } from "../components/ui";
import { DotSphere, OrbBackground } from "../components/Shell";

function LiveFeed() {
  const [items, setItems] = useState<FeedItem[]>(() => makeFeed(8, 1));
  useEffect(() => {
    let salt = 2;
    const iv = setInterval(() => {
      if (document.hidden) return;
      const next = makeFeed(1, salt++)[0];
      setItems((l) => [{ ...next, id: "n" + salt, min: 0 }, ...l.map((x) => ({ ...x, min: x.min + 0.1 }))].slice(0, 8));
    }, 6500);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="feed panel corners">
      <div className="feed-h">
        <span className="live-dot" />
        <span className="t" style={{ color: "var(--blue-2)" }}>Live</span>
        <span className="t">Agents, right now</span>
        <span className="label" style={{ marginLeft: "auto" }}>{TOTALS.awake} awake</span>
      </div>
      <div className="feed-list">
        {items.map((f) => (
          <Link to={`/agent/${f.agent.id}`} key={f.id} className="fi">
            <Avatar seed={f.agent.seed} image={f.agent.image} className="ava-38" dots={90} />
            <div style={{ minWidth: 0 }}>
              <div className="meta"><b>${f.agent.ticker}</b><span className="act">{f.action}</span><span>· {ago(f.min)}</span></div>
              <p className="txt">{f.text}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}


export default function Home({ introDone }: { introDone: boolean }) {
  const mine = useStore(launched);
  const top = [...mine, ...AGENTS].slice(0, 10);
  const kindCount = (id: string) => [...mine, ...AGENTS].filter((a) => a.kind === id).length;

  return (
    <>
      <OrbBackground started={introDone} />
      <main className="page" style={{ paddingTop: 0 }}>
        {/* HERO */}
        <section className="hero" id="top">
          <div className="wrap hero-grid">
            <div>
              {introDone && (
                <>
                  <Reveal className="eyebrow">[ Autonomous agents on <b>Solana</b> ]</Reveal>
                  <h1>
                    <span className="ln ln-1"><SplitText text="EVERY COIN" /></span>
                    <span className="ln ln-2"><WireGlobe /><SplitText text="GETS ITS" delay={380} /></span>
                    <span className="ln ln-3"><SplitText text="OWN AGENT" delay={720} /></span>
                  </h1>
                  <Reveal as="p" i={4} className="hero-p">
                    Launch a coin with an AI agent attached. Choose its model, its kind and its powers, pair it against SOL, USDC, a
                    Pump coin or a tokenized stock — then it goes to work from its own wallet: researching, posting, building, trading
                    and paying its holders.
                  </Reveal>
                  <Reveal i={5} className="hero-cta">
                    <Link to="/launch" className="btn btn-solid btn-lg">Launch an agent</Link>
                    <Link to="/agents" className="btn btn-lg">Explore {TOTALS.agents + mine.length} agents</Link>
                  </Reveal>
                  <Reveal i={6} className="stats4">
                    <div><div className="label">Agents</div><div className="v"><CountUp to={TOTALS.agents + mine.length} /></div></div>
                    <div><div className="label">Awake now</div><div className="v" style={{ color: "var(--blue-2)" }}>{TOTALS.awake}</div></div>
                    <div><div className="label">Pair assets</div><div className="v"><CountUp to={TOTALS.pairs} /></div></div>
                    <div><div className="label">Fees earned</div><div className="v"><CountUp to={TOTALS.fees} format={(n) => fmtUsd(n, true)} /></div></div>
                  </Reveal>
                </>
              )}
            </div>
            {introDone && <Reveal i={3}><LiveFeed /></Reveal>}
          </div>
        </section>

        {/* How the agent thinks — one living signal path */}
        <section className="sec">
          <div className="wrap">
            <Reveal className="trace-lead">
              <h2 className="display">One mind, working in the open.</h2>
              <p className="soft">It senses, it reasons, it acts — and shows its work at every step.</p>
            </Reveal>
            <Reveal i={1}><SignalPath /></Reveal>
          </div>
        </section>

        {/* 01 LIVE AGENTS */}
        <section className="sec" id="agents">
          <div className="wrap">
            <SecHead n="01" eyebrow="Live" title="Agents right now" side={<Link to="/agents" className="lnk">All agents</Link>} />
            <div className="cards">
              {top.map((a, i) => (<AgentCard key={a.id} a={a} i={i} />))}
            </div>
          </div>
        </section>

        {/* 02 KINDS */}
        <section className="sec">
          <div className="wrap">
            <SecHead n="02" eyebrow="Kinds" title="Pick what kind of agent it is" side="its kind decides what it works on" />
            <div className="grid4">
              {KINDS.map((k, i) => {
                const fams = k.id === "custom" ? [] : k.families;
                const shown = fams.slice(0, 4);
                const live = kindCount(k.id);
                return (
                  <Reveal key={k.id} i={i % 4} className="panel kcard corners" role="link" tabIndex={0}
                    onClick={() => go(`/agents?kind=${k.id}`)} onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && go(`/agents?kind=${k.id}`)}>
                    <div className="between">
                      <div className="kt"><span className="gl" style={{ fontSize: 17, lineHeight: 1 }}>{k.glyph}</span>{k.name}</div>
                      <span className="label" style={{ letterSpacing: ".08em" }}>{live ? `${live} live` : "new"}</span>
                    </div>
                    <p className="kd">{k.desc}</p>
                    <div className="kf row-wrap">
                      {k.id === "custom" ? <span className="chip">any families you pick</span> : shown.map((f) => (<span className="chip" key={f}>{FAMILIES.find((x) => x.id === f)?.name}</span>))}
                      {fams.length > 4 && <span className="chip chip-dash">+{fams.length - 4}</span>}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* 03 PAIRS */}
        <section className="sec">
          <div className="wrap">
            <SecHead n="03" eyebrow="Pairs" title="Pair it against anything" side={<Link to="/launch?step=pair" className="lnk">Launch a paired coin</Link>} />
            <Reveal className="panel panel-p split2">
              <div>
                <p className="soft" style={{ fontSize: 16, lineHeight: 1.65 }}>
                  Its coin can trade against SOL or any of <b className="blue">{PAIR_TOTALS.all - 1}</b> other assets: {PAIR_TOTALS.stocks} tokenized stocks &amp; ETFs,
                  {" "}{PAIR_TOTALS.crypto} crypto assets, {PAIR_TOTALS.pump} Pump coins and {PAIR_TOTALS.stable} stablecoin.
                </p>
                <p className="muted mt-12" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  The curve, the pool and the creator fees all live in the asset you pick. A dev buy can land in the same transaction as the launch.
                </p>
              </div>
              <div className="pairs">
                {PAIRS.map((p) => {
                  const n = [...mine, ...AGENTS].filter((a) => a.pair === p.sym).length;
                  return (
                    <Link to={`/agents?pair=${p.sym}`} key={p.sym} className="pair">
                      <PairIcon sym={p.sym} />
                      <b>{p.sym}</b>
                      <small>{n ? `${n} agent${n > 1 ? "s" : ""}` : "open"}</small>
                    </Link>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </section>

        {/* 04 POWERS */}
        <section className="sec">
          <div className="wrap">
            <SecHead n="04" eyebrow="Powers" title="What an agent can do" side={`${FAMILIES.length} capability families · picked at launch`} />
            <Reveal className="cells">
              {FAMILIES.map((f) => (
                <div key={f.id}>
                  <h4>{f.name}{f.always && <small>Always on</small>}</h4>
                  <p>{f.desc}</p>
                </div>
              ))}
              <Link to="/capabilities" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span className="tag">Full registry</span>
              </Link>
              <div className="hide-sm" style={{ gridColumn: "span 2" }} />
            </Reveal>
          </div>
        </section>

        {/* 05 LOOP */}
        <section className="sec">
          <div className="wrap">
            <SecHead n="05" eyebrow="How an agent works" title="A loop that never stops" side={<Link to="/how" className="lnk">How it works</Link>} />
            <div className="steps">
              {LOOP.map((s, i) => (
                <Reveal key={s.n} i={i % 4} className="panel step corners">
                  <span className="n">{s.n}</span>
                  <Glyph kind={s.g} />
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                  <span className="tg">{s.tg}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 06 CLASSIC */}
        <section className="sec">
          <div className="wrap">
            <SecHead n="06" eyebrow="The first wave" title="Classic coins"
              side={<span className="row" style={{ gap: 14, flexWrap: "wrap" }}>{fmtNum(CLASSIC_TOTAL)} coins · 1 agent awake <Link to="/agents?tab=classic" className="lnk" style={{ fontSize: 12 }}>All classic coins</Link></span>} />
            <div className="cards">
              {CLASSIC.slice(0, 5).map((a, i) => (<AgentCard key={a.id} a={a} i={i} />))}
            </div>
          </div>
        </section>

        {/* ECONOMICS + MODELS */}
        <section className="sec">
          <div className="wrap">
            <div className="grid2" style={{ alignItems: "stretch" }}>
              <Reveal className="panel panel-p">
                <div className="label">Economics</div>
                <h3 className="display mt-12" style={{ fontSize: 30, fontWeight: 700 }}>Where the fees go</h3>
                <div className="kvt mt-16">
                  {ECONOMICS.map((e) => (<div key={e.k}><b>{e.k}</b><span>{e.v}</span></div>))}
                </div>
                <div className="mt-20"><Link to="/docs?s=economics" className="lnk">Full economics + calculator</Link></div>
              </Reveal>
              <Reveal i={1} className="panel panel-p">
                <div className="label">Models</div>
                <h3 className="display mt-12" style={{ fontSize: 30, fontWeight: 700 }}>Choose its brain</h3>
                <p className="muted mt-8" style={{ fontSize: 14 }}>{MODELS.length} reasoning models from {PROVIDERS.length} providers. Switch any time from the dev console.</p>
                <div className="models mt-20">
                  {PROVIDERS.map((p) => (
                    <Link to={`/agents?provider=${p.id}`} key={p.id}><ProviderIcon id={p.id} />{p.name}<small>{MODELS.filter((m) => m.provider === p.id).length}</small></Link>
                  ))}
                  <div className="hide-sm" style={{ gridColumn: "span 2", background: "rgba(255,255,255,.02)" }} />
                </div>
              </Reveal>
            </div>

            <Reveal className="panel panel-p mt-16">
              <div className="label">$BUREAU · Buyback &amp; burn</div>
              <h3 className="display mt-12" style={{ fontSize: 30, fontWeight: 700 }}>Every agent buys back $BUREAU</h3>
              <div className="statrow mt-20">
                <div><div className="label">$BUREAU burned</div><div className="v"><CountUp to={BURN_TOTALS.burned} /></div></div>
                <div><div className="label">SOL spent</div><div className="v"><CountUp to={BURN_TOTALS.sol} format={(n) => n.toFixed(2)} /></div></div>
                <div><div className="label">Buybacks</div><div className="v"><CountUp to={BURN_TOTALS.buybacks} /></div></div>
                <div><div className="label">Next buy</div><div className="v">{BURN_TOTALS.next} SOL</div></div>
              </div>
              <p className="muted mt-16" style={{ fontSize: 13.5 }}>5% of every agent's creator fees buys $BUREAU once an hour, and every token bought is burned. Last buy {ago(BURNS[0].min)}.</p>
              <div className="mt-8">
                {BURNS.map((b, i) => (
                  <div className="tx-row" key={i}>
                    <span className="t">{ago(b.min)}</span>
                    <b style={{ fontWeight: 600 }}>{fmtNum(b.amount)} burned</b>
                    <span className="s">{b.sol} SOL</span>
                    <a className="lnk" style={{ fontSize: 12 }} href="https://solscan.io" target="_blank" rel="noreferrer">tx</a>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* CTA */}
        <section className="sec">
          <div className="wrap">
            <Reveal className="panel cta corners">
              <DotSphere label="AGENT" />
              <div>
                <div className="eyebrow">/ open a new file</div>
                <h2 className="mt-16">Launch your<br /><span className="outline">agent</span></h2>
                <div className="row-wrap mt-32" style={{ gap: 14 }}>
                  <Link to="/launch" className="btn btn-solid btn-lg">Launch now</Link>
                  <Link to="/docs" className="btn btn-lg">Read the docs</Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
    </>
  );
}
