import { useEffect, useRef, useState } from "react";
import { Link, useRoute } from "../lib/router";
import { useClock } from "../lib/store";
import { initDotSphere, initOrb, type OrbCtl } from "../lib/orb";
import { SITE } from "../lib/data";
import { Mark, XLogo } from "./icons";
import { CAButton, WalletButton } from "./ui";

export const NAV = [
  { to: "/agents", label: "Agents" },
  { to: "/launch", label: "Launch" },
  { to: "/capabilities", label: "Capabilities" },
  { to: "/how", label: "How it works" },
  { to: "/docs", label: "Docs" },
];

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="BUREAU home">
      <Mark />
      BUREAU
    </Link>
  );
}

export function Header() {
  const route = useRoute();
  const clock = useClock();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [route.path]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; }, [open]);
  const active = (to: string) => route.path === to || (to !== "/" && route.path.startsWith(to + "/")) || (to === "/agents" && route.path.startsWith("/agent/"));

  return (
    <>
      <header className={`hdr ${scrolled || open ? "scrolled" : ""}`}>
        <div className="wrap hdr-in">
          <Logo />
          <nav className="nav hide-sm" aria-label="Primary">
            {NAV.map((n) => (<Link key={n.to} to={n.to} className={active(n.to) ? "on" : ""}>{n.label}</Link>))}
          </nav>
          <div className="hdr-right">
            <span className="clock">{clock} UTC</span>
            <CAButton />
            <a className="btn btn-sm btn-icon hide-sm" href={SITE.x} target="_blank" rel="noreferrer" aria-label="BUREAU on X"><XLogo className="ic" /></a>
            <Link to="/launch" className="btn btn-sm btn-solid hide-sm">Launch</Link>
            <span className="hide-sm"><WalletButton /></span>
            <a className="btn btn-sm btn-icon show-sm" href={SITE.x} target="_blank" rel="noreferrer" aria-label="BUREAU on X"><XLogo className="ic" /></a>
            <button type="button" className={`burger show-sm ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
              <span className="burger-lines"><span /><span /></span>
            </button>
          </div>
        </div>
      </header>
      <div className={`msheet ${open ? "open" : ""}`} aria-hidden={!open}>
        <nav aria-label="Mobile">
          <Link to="/"><small>00</small>Home</Link>
          {NAV.map((n, i) => (<Link key={n.to} to={n.to}><small>{String(i + 1).padStart(2, "0")}</small>{n.label}</Link>))}
        </nav>
        <div className="stack">
          <WalletButton block size="md" />
          <Link to="/launch" className="btn btn-solid btn-block">Launch an agent</Link>
          <div className="between"><CAButton /><a className="btn btn-sm" href={SITE.x} target="_blank" rel="noreferrer"><XLogo className="ic" />{SITE.xHandle}</a></div>
        </div>
        <div className="label">{clock} UTC · Solana mainnet</div>
      </div>
    </>
  );
}

export function Footer() {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr-grid">
          <div>
            <Logo />
            <p className="mt-16 muted" style={{ maxWidth: 360, fontSize: 14, lineHeight: 1.6 }}>
              Every coin gets an agent. Agents act only through a deterministic policy engine and an isolated signer. Nothing here is financial advice.
            </p>
          </div>
          <div><h5>Platform</h5><ul><li><Link to="/launch">Launch</Link></li><li><Link to="/agents">Explore agents</Link></li><li><Link to="/capabilities">Capabilities</Link></li><li><Link to="/how">How it works</Link></li></ul></div>
          <div><h5>Docs</h5><ul><li><Link to="/docs?s=economics">Economics</Link></li><li><Link to="/docs?s=minds">Agents</Link></li><li><Link to="/docs?s=firewall">Firewall</Link></li><li><Link to="/docs?s=faq">FAQ</Link></li></ul></div>
          <div><h5>Network</h5><ul><li><span>Solana mainnet</span></li><li><span>Pump · PumpSwap</span></li><li><span>OpenRouter</span></li><li><a href={SITE.x} target="_blank" rel="noreferrer">X · {SITE.xHandle}</a></li></ul></div>
        </div>
        <div className="ftr-big" aria-hidden="true">BUREAU</div>
        <div className="ftr-bot"><span>© 2026 BUREAU</span><span>{SITE.version}</span><span>Every coin gets an agent</span></div>
      </div>
    </footer>
  );
}

/* Fixed particle orb behind the home hero. Stops rendering once the hero is gone. */
export function OrbBackground({ started }: { started: boolean }) {
  const mount = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const ctl = useRef<OrbCtl>({ started, visible: true });
  ctl.current.started = started;
  useEffect(() => {
    const el = mount.current!;
    let cleanup = () => {};
    const id = requestAnimationFrame(() => { cleanup = initOrb(el, ctl.current); });
    // Written straight to the DOM: a React state update per scroll event re-renders for nothing.
    const onScroll = () => {
      const h = window.innerHeight;
      const y = window.scrollY;
      const o = Math.max(0, 1 - y / (h * 1.1));
      ctl.current.visible = o > 0.02;
      if (y > h * 1.2 && wrap.current!.style.opacity === "0") return;
      wrap.current!.style.opacity = String(o);
      el.style.transform = `scale(${1 + Math.min(y / 800, 1) * 0.2})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(id); cleanup(); window.removeEventListener("scroll", onScroll); };
  }, []);
  return (
    <div className="orb-wrap" ref={wrap} aria-hidden="true">
      <div className="orb-plume" />
      <div ref={mount} style={{ position: "absolute", inset: 0 }} />
      <div className="orb-fade" />
    </div>
  );
}

const PRE_TAGS = ["AUTONOMOUS AGENTS", "OWN WALLETS", "LOCKED FEES", "POLICY ENGINE", "BUREAU®"];
/* Preloader: once per session. */
export function Preloader({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  const [tag, setTag] = useState(0);
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);
  const pRef = useRef(0);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      const e = performance.now() - t0;
      const v = Math.min(Math.floor(e / 16), 100);
      pRef.current = v; setP(v); setTag(Math.floor(e / 380) % PRE_TAGS.length);
      if (v >= 100) {
        clearInterval(iv);
        setTimeout(() => { setOut(true); onDone(); setTimeout(() => setGone(true), 650); }, 300);
      }
    }, 30);
    const stop = initDotSphere(cv.current!, () => pRef.current);
    return () => { clearInterval(iv); stop(); };
  }, []);
  if (gone) return null;
  return (
    <div className={`pre ${out ? "out" : ""}`} aria-hidden="true">
      <canvas ref={cv} />
      <div className="pre-top"><span>[ BUREAU_ONLINE ]</span><b>{String(p).padStart(3, "0")}%</b></div>
      <div className="pre-bot">
        <div key={tag} className="pre-tag">/ {PRE_TAGS[tag]}</div>
        <div className="label">Opening the bureau</div>
      </div>
    </div>
  );
}

export function DotSphere({ label, size = 260 }: { label?: string; size?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => initDotSphere(cv.current!, () => 100, { count: 520, label }), []);
  return <canvas ref={cv} style={{ width: size, height: size }} aria-hidden="true" />;
}
