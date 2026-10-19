import { Fragment, useEffect, useRef, useState, type ReactNode, type ElementType, type CSSProperties } from "react";
import { Link } from "../lib/router";
import { copy, toasts, useInView, useStore } from "../lib/store";
import { phantomDeepLink, useWallet } from "../lib/wallet";
import {
  type Agent, SITE, STATUS_LABEL, fmtUsd, kindById, modelByName, pairBySym, short, statusClass,
} from "../lib/data";
import { Check, Copy, Logout, Mark, Phantom, ProviderIcon } from "./icons";
import { Avatar } from "./Avatar";

/* ------------------------------------------------------------ reveal */
export function Reveal({ as: Tag = "div", i = 0, className = "", children, style, ...rest }: { as?: ElementType; i?: number; className?: string; children?: ReactNode; style?: CSSProperties; [k: string]: unknown }) {
  const [ref, inView] = useInView<HTMLElement>({ threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  return (
    <Tag ref={ref} className={`rv ${inView ? "in" : ""} ${className}`} style={{ ...style, ["--i" as string]: i }} {...rest}>
      {children}
    </Tag>
  );
}

/* line-mask word reveal for headings (padding keeps descenders unclipped) */
export function MaskWords({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((w, i, arr) => (
        <Fragment key={i}><span className="wm"><span style={{ ["--w" as string]: i }}>{w}</span></span>{i < arr.length - 1 ? " " : ""}</Fragment>
      ))}
    </>
  );
}

/* per-char entrance; words never break mid-word */
export function SplitText({ text, delay = 0 }: { text: string; delay?: number }) {
  let k = 0;
  return (
    <>
      {text.split(" ").map((word, wi, arr) => (
        <span className="w" key={wi}>
          {[...word].map((c) => (
            <span className="ch" key={k} style={{ ["--k" as string]: k++, ["--d" as string]: `${delay}ms` }}>{c}</span>
          ))}
          {wi < arr.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}


export function SecHead({ n, eyebrow, title, side, id }: { n: string; eyebrow: string; title: ReactNode; side?: ReactNode; id?: string }) {
  return (
    <Reveal className="sec-head" id={id}>
      <div>
        <div className="eyebrow"><b>{n}</b> · {eyebrow}</div>
        <h2>{typeof title === "string" ? <MaskWords text={title} /> : title}</h2>
      </div>
      {side && <div className="side">{side}</div>}
    </Reveal>
  );
}

/* ------------------------------------------------------------ status */
export const StatusBadge = ({ s }: { s: Agent["status"] }) => (
  <span className={`status ${statusClass(s)}`}><i />{STATUS_LABEL[s]}</span>
);
export const statusNote = (a: Agent) =>
  a.status === "awake" ? `next thought in ${a.nextThought} min`
  : a.status === "asleep-fees" ? "asleep until its coin earns its first fees"
  : a.status === "asleep-floor" ? "asleep under its $6K market-cap floor"
  : a.status === "paused" ? "paused by its dev"
  : "halted — run ended";

export function PairIcon({ sym, size = 22 }: { sym: string; size?: number }) {
  const p = pairBySym(sym);
  if (!p.logo) return <span className="pi pi-mark" style={{ width: size, height: size }}><Mark /></span>;
  return <img className="pi" src={p.logo} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />;
}

/* ------------------------------------------------------------ agent card */
export function AgentCard({ a, i }: { a: Agent; i: number }) {
  const k = kindById(a.kind);
  const m = modelByName(a.model);
  return (
    <Reveal as="article" i={i % 5} className="acard">
      <Link to={`/agent/${a.id}`} aria-label={`${a.name} $${a.ticker}`} style={{ position: "absolute", inset: 0, zIndex: 4 }} />
      <div className="media">
        <Avatar seed={a.seed} image={a.image} />
        <span className="num">#{String(i + 1).padStart(2, "0")}</span>
        <span className="st"><StatusBadge s={a.status} /></span>
      </div>
      <div className="body">
        <div className="nm"><h3>{a.name}</h3><span className="tk">${a.ticker}</span></div>
        <div className="row-wrap chips-row">
          <span className="chip"><span style={{ color: "var(--ice)" }}>{k.glyph}</span>{k.name}</span>
          <span className="chip"><PairIcon sym={a.pair} size={13} />{a.pair}</span>
        </div>
        <div className="kv">
          <div><div className="label">Mcap</div><div className="v">{fmtUsd(a.mcap)}</div></div>
          <div><div className="label">Fees</div><div className="v">{fmtUsd(a.fees)}</div></div>
          <div><div className="label">Age</div><div className="v">{a.ageLabel ?? a.ageDays + "d"}</div></div>
        </div>
        <div className={`note ${a.status === "awake" ? "on" : ""}`}><i />{statusNote(a)}</div>
        <div className="model">
          <ProviderIcon id={m.provider} className="pv" />
          <div style={{ minWidth: 0 }}><b>{a.model}</b><small>{m.provider === "zai" ? "Z.ai" : m.provider}</small></div>
        </div>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------ CA button */
export function CAButton({ compact = false }: { compact?: boolean }) {
  const [done, setDone] = useState(false);
  const has = !!SITE.ca;
  const onClick = () => {
    if (!has) { copy(SITE.token, "Contract address drops at launch — follow " + SITE.xHandle); return; }
    copy(SITE.ca, "Contract address copied");
    setDone(true); setTimeout(() => setDone(false), 1600);
  };
  return (
    <button type="button" className={`ca-btn ${done ? "copied" : ""}`} onClick={onClick} title={has ? SITE.ca : "Contract address — soon"}>
      <span className="ca-k">CA</span>
      {!compact && <span className="ca-v">{has ? short(SITE.ca, 4, 4) : "soon"}</span>}
      <span className="ca-c">{done ? <Check className="ic" /> : <Copy className="ic" />}</span>
    </button>
  );
}

/* ------------------------------------------------------------ wallet button */
export function WalletButton({ block = false, size = "sm" }: { block?: boolean; size?: "sm" | "md" }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const cls = `btn ${size === "sm" ? "btn-sm" : ""} ${block ? "btn-block" : ""}`;
  if (!w.address && !w.hasPhantom) {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    return (
      <a className={`${cls} btn-blue wallet-btn`} href={mobile ? phantomDeepLink() : "https://phantom.app/download"} target="_blank" rel="noreferrer">
        <Phantom className="ic" />Connect Wallet
      </a>
    );
  }
  if (!w.address)
    return (
      <button type="button" className={`${cls} btn-blue wallet-btn`} onClick={() => w.connect()} disabled={w.connecting}>
        <Phantom className="ic" />
        {w.connecting ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  return (
    <div ref={ref} style={{ position: "relative", width: block ? "100%" : undefined }}>
      <button type="button" className={`${cls} wallet-btn`} onClick={() => setOpen((o) => !o)}>
        <span className="w-dot" />
        <span className="mono" style={{ letterSpacing: ".06em", textTransform: "none" }}>{short(w.address, 4, 4)}</span>
      </button>
      {open && (
        <div className="panel" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", minWidth: 220, padding: 8, background: "#07090d", zIndex: 90 }}>
          <button className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: "flex-start" }} onClick={() => { copy(w.address!, "Address copied"); setOpen(false); }}><Copy className="ic" />Copy address</button>
          <a className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: "flex-start" }} href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noreferrer">Solscan</a>
          <button className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: "flex-start" }} onClick={() => { w.disconnect(); setOpen(false); }}><Logout className="ic" />Disconnect</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ toasts */
export function Toasts() {
  const list = useStore(toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (<div key={t.id} className={`toast ${t.kind ?? ""}`}>{t.kind === "ok" ? <Check className="icon" style={{ color: "var(--good)" }} /> : null}{t.text}</div>))}
    </div>
  );
}

/* ------------------------------------------------------------ count up */
export function CountUp({ to, format = (n: number) => Math.round(n).toLocaleString("en-US"), dur = 1400 }: { to: number; format?: (n: number) => string; dur?: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min((t - t0) / dur, 1); setV(to * (1 - Math.pow(1 - p, 4))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);
  return <span ref={ref}>{format(v)}</span>;
}

/* ------------------------------------------------------------ ASCII art box */
export const Ascii = ({ art }: { art: string }) => <div className="ascii" aria-hidden="true">{art}</div>;
