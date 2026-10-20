// BUREAU's own animated line glyphs (replace the ASCII drawings).
// Each is a tiny SVG scene in the orb's ice-blue, animated with CSS.
import { useEffect, useRef, type ReactNode } from "react";

export type GlyphKind =
  | "observe" | "research" | "think" | "plan" | "act" | "measure" | "learn" | "repeat"
  | "launch" | "verify" | "earn" | "wake"
  | "wallet" | "burn" | "swap" | "lock" | "airdrop" | "chart" | "browser" | "chat" | "people" | "media" | "code" | "reserve" | "trigger";

const W = 132, H = 66;
const S = ({ children }: { children: ReactNode }) => (
  <svg viewBox={`0 0 ${W} ${H}`} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const Dot = ({ x, y, r = 2, cls = "" }: { x: number; y: number; r?: number; cls?: string }) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" className={cls} />;

const SCENES: Record<GlyphKind, () => ReactNode> = {
  observe: () => (<S>
    <circle cx="30" cy="33" r="26" opacity=".35" /><circle cx="30" cy="33" r="16" opacity=".35" /><circle cx="30" cy="33" r="6" opacity=".5" />
    <g className="g-spin" style={{ transformOrigin: "30px 33px" }}><path d="M30 33 L30 7" /><path d="M30 33 L30 7 A26 26 0 0 1 48 14 Z" fill="currentColor" stroke="none" opacity=".18" /></g>
    <Dot x={41} y={22} cls="g-blink" /><Dot x={19} y={44} r={1.6} cls="g-blink d2" />
    <path d="M70 18h52M70 33h38M70 48h46" opacity=".45" /><path d="M70 18h20" className="g-grow" /><path d="M70 33h30" className="g-grow d2" /><path d="M70 48h12" className="g-grow d3" />
  </S>),
  research: () => (<S>
    <rect x="6" y="6" width="84" height="54" rx="4" opacity=".55" /><path d="M6 16h84" opacity=".55" /><Dot x={12} y={11} r={1.3} /><Dot x={17} y={11} r={1.3} /><Dot x={22} y={11} r={1.3} />
    <path d="M14 26h50M14 34h62M14 42h40M14 50h56" opacity=".35" />
    <path d="M8 26h80" className="g-scan" opacity=".8" />
    <g className="g-float"><circle cx="104" cy="30" r="13" /><path d="M113 39l12 12" /></g>
  </S>),
  think: () => (<S>
    {[[20, 18], [20, 48], [56, 10], [56, 33], [56, 56], [92, 22], [92, 46], [120, 33]].map(([x, y], i) => (<Dot key={i} x={x} y={y} r={2.6} cls={`g-pulse d${i % 4}`} />))}
    <path d="M20 18L56 10M20 18L56 33M20 48L56 33M20 48L56 56M56 10L92 22M56 33L92 22M56 33L92 46M56 56L92 46M92 22L120 33M92 46L120 33" opacity=".35" />
    <path d="M20 18L56 33L92 46L120 33" className="g-trace" />
  </S>),
  plan: () => (<S>
    <rect x="4" y="22" width="30" height="20" rx="3" /><rect x="52" y="6" width="30" height="18" rx="3" opacity=".7" /><rect x="52" y="42" width="30" height="18" rx="3" opacity=".7" /><rect x="98" y="22" width="30" height="20" rx="3" />
    <path d="M34 32h8v-17h10M42 32v19h10M82 15h8v17h8M82 51h8V32" opacity=".5" />
    <circle r="2.4" fill="currentColor" stroke="none"><animateMotion dur="3s" repeatCount="indefinite" path="M34 32h8V15h10h30h8v17h8" /></circle>
    <path d="M10 32h18M58 15h18M58 51h12M104 32h18" opacity=".5" />
  </S>),
  act: () => (<S>
    <circle cx="104" cy="33" r="22" opacity=".35" /><circle cx="104" cy="33" r="13" opacity=".55" /><circle cx="104" cy="33" r="4" className="g-pulse" fill="currentColor" stroke="none" />
    <g className="g-shoot"><path d="M8 33h56" /><path d="M56 26l9 7-9 7" /></g>
    <path d="M8 20h20M8 46h28" opacity=".3" />
  </S>),
  measure: () => (<S>
    <path d="M6 58h120" opacity=".5" />
    {[12, 30, 48, 66, 84, 102].map((x, i) => (<rect key={x} x={x} y={14} width="12" height="44" rx="1.5" className={`g-bar d${i % 4}`} style={{ transformOrigin: `${x}px 58px` }} fill="currentColor" stroke="none" opacity={0.25 + i * 0.12} />))}
    <path d="M14 46L36 40L54 44L72 28L90 30L108 14" className="g-trace" />
  </S>),
  learn: () => (<S>
    {Array.from({ length: 24 }, (_, i) => { const x = 8 + (i % 8) * 15, y = 8 + Math.floor(i / 8) * 18; return <rect key={i} x={x} y={y} width="11" height="13" rx="2" className={`g-cell`} style={{ animationDelay: `${(i * 0.13) % 3}s` }} />; })}
  </S>),
  repeat: () => (<S>
    <ellipse cx="66" cy="33" rx="52" ry="22" opacity=".45" />
    <g className="g-orbit" style={{ transformOrigin: "66px 33px" }}><Dot x={118} y={33} r={3} /></g>
    <circle cx="66" cy="33" r="7" /><Dot x={66} y={33} r={2} cls="g-pulse" />
    <path d="M24 16l-6-4M108 50l6 4" opacity=".5" />
  </S>),
  launch: () => (<S>
    <g className="g-stamp"><rect x="46" y="4" width="40" height="22" rx="3" /><path d="M58 26v8h16v-8" /><path d="M52 34h28" /></g>
    <rect x="22" y="44" width="88" height="18" rx="2" opacity=".5" /><path d="M32 53h30" opacity=".5" />
    <circle cx="94" cy="53" r="6" className="g-ink" />
  </S>),
  verify: () => (<S>
    <path d="M66 4l24 9v16c0 15-10 26-24 33-14-7-24-18-24-33V13z" />
    <path d="M54 33l8 8 16-17" className="g-draw" />
    <path d="M8 20h22M8 33h16M102 20h22M108 33h16" opacity=".35" />
  </S>),
  earn: () => (<S>
    <rect x="40" y="36" width="52" height="26" rx="3" /><path d="M52 36v-6h28v6" opacity=".6" />
    {[54, 66, 78].map((x, i) => (<g key={x} className={`g-drop d${i}`}><ellipse cx={x} cy="10" rx="6" ry="3" fill="currentColor" stroke="none" opacity=".75" /></g>))}
    <path d="M8 49h20M104 49h20" opacity=".35" />
  </S>),
  wake: () => (<S>
    <path d="M30 33c10-16 26-24 36-24s26 8 36 24c-10 16-26 24-36 24S40 49 30 33z" />
    <g className="g-blinkeye" style={{ transformOrigin: "66px 33px" }}><circle cx="66" cy="33" r="10" /><Dot x={66} y={33} r={4} /></g>
    <path d="M8 33h12M112 33h12" opacity=".4" />
  </S>),
  wallet: () => (<S>
    <rect x="30" y="12" width="72" height="44" rx="5" /><path d="M30 24h72" opacity=".5" /><rect x="82" y="30" width="20" height="12" rx="3" /><Dot x={90} y={36} r={2} cls="g-pulse" />
    <path d="M40 44h26" className="g-grow" />
  </S>),
  burn: () => (<S>
    <path d="M30 60h72" opacity=".5" />
    {Array.from({ length: 14 }, (_, i) => (<g key={i} className="g-rise" style={{ animationDelay: `${(i * 0.21) % 2.4}s` }}><Dot x={36 + (i * 37) % 60} y={56} r={1.2 + (i % 3) * 0.5} /></g>))}
  </S>),
  swap: () => (<S>
    <circle cx="26" cy="33" r="16" /><circle cx="106" cy="33" r="16" />
    <g className="g-slide"><path d="M48 25h36M78 19l6 6-6 6" /></g>
    <g className="g-slide rev"><path d="M84 41H48M54 35l-6 6 6 6" /></g>
  </S>),
  lock: () => (<S>
    <rect x="46" y="28" width="40" height="32" rx="4" /><path d="M54 28v-8a12 12 0 0 1 24 0v8" className="g-shackle" /><Dot x={66} y={42} r={3} /><path d="M66 45v6" />
  </S>),
  airdrop: () => (<S>
    <path d="M50 8c0-4 32-4 32 0l-8 14H58z" /><path d="M58 22l8 6 8-6" opacity=".5" />
    {[20, 43, 66, 89, 112].map((x, i) => (<g key={x}><path d={`M${x - 6} 60h12`} opacity=".5" /><Dot x={x} y={36} r={2} cls={`g-fall d${i % 4}`} /></g>))}
  </S>),
  chart: () => (<S>
    <path d="M8 58h116M8 8v50" opacity=".4" />
    <path d="M10 50L30 42L46 46L64 30L82 34L100 18L122 22" className="g-trace" />
    <Dot x={122} y={22} r={2.6} cls="g-pulse" />
  </S>),
  browser: () => (<S>
    <rect x="10" y="6" width="112" height="54" rx="4" /><path d="M10 16h112" /><rect x="40" y="9" width="60" height="4" rx="2" opacity=".5" />
    <rect x="18" y="24" width="40" height="28" rx="2" opacity=".5" /><path d="M66 26h46M66 34h38M66 42h44" opacity=".35" />
    <g className="g-cursor"><path d="M80 40l10 4-4 2-2 4z" fill="currentColor" stroke="none" /></g>
  </S>),
  chat: () => (<S>
    <path d="M10 10h66a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H32l-12 10V40h-4a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6z" />
    <Dot x={30} y={25} r={2.4} cls="g-pulse d0" /><Dot x={44} y={25} r={2.4} cls="g-pulse d1" /><Dot x={58} y={25} r={2.4} cls="g-pulse d2" />
    <path d="M92 30h30M92 40h22" opacity=".4" className="g-grow" />
  </S>),
  people: () => (<S>
    {[30, 66, 102].map((x, i) => (<g key={x} className={`g-bob d${i}`}><circle cx={x} cy="22" r="8" /><path d={`M${x - 14} 52c0-10 6-16 14-16s14 6 14 16`} /></g>))}
  </S>),
  media: () => (<S>
    <rect x="10" y="8" width="70" height="50" rx="3" /><path d="M10 46l20-16 16 12 12-8 22 14" opacity=".6" /><circle cx="64" cy="22" r="5" className="g-pulse" />
    <rect x="90" y="16" width="32" height="34" rx="3" opacity=".6" /><path d="M102 26v14l11-7z" fill="currentColor" stroke="none" />
  </S>),
  code: () => (<S>
    <path d="M30 18L14 33l16 15M102 18l16 15-16 15" /><path d="M76 12L56 54" opacity=".6" />
    <rect x="80" y="28" width="2" height="10" fill="currentColor" stroke="none" className="g-caret" />
  </S>),
  reserve: () => (<S>
    <rect x="20" y="8" width="92" height="50" rx="3" /><path d="M20 38h92" strokeDasharray="4 4" />
    <rect x="21" y="39" width="90" height="18" fill="currentColor" stroke="none" opacity=".2" />
    <rect x="21" y="16" width="90" height="22" fill="currentColor" stroke="none" opacity=".12" className="g-level" style={{ transformOrigin: "66px 38px" }} />
  </S>),
  trigger: () => (<S>
    <path d="M6 28h120" strokeDasharray="3 5" opacity=".6" />
    <path d="M8 50L28 40L42 46L60 30L74 36L92 20L110 26L124 12" className="g-trace" />
    <Dot x={92} y={28} r={3} cls="g-pulse" />
  </S>),
};

export function Glyph({ kind, className = "" }: { kind: GlyphKind; className?: string }) {
  return <div className={`glyph ${className}`} aria-hidden="true">{SCENES[kind]()}</div>;
}

/* capability name -> glyph */
const CAP_GLYPH: Record<string, GlyphKind> = {
  Observe: "observe", "Event radar": "wake", "Think in public": "think", Memory: "learn", "Think harder": "think", Mission: "plan",
  "Inner life": "wake", "Rule lab": "plan", Experiments: "measure", "Self-review": "repeat", "Web search": "research", "Read X": "chat",
  "Token research": "chart", Browser: "browser", "Study other agents": "people", "Trend hunter": "observe", "Buy back": "earn", Sell: "swap",
  Burn: "burn", Swap: "swap", "Acquire assets": "chart", "Back other agents": "people", Portfolio: "measure", "Reserve floor": "reserve",
  "Trigger orders": "trigger", Lock: "lock", Perps: "trigger", Collectibles: "media", "Fund its mind": "wallet", "Treasury thesis": "plan",
  Airdrop: "airdrop", "Recurring rewards": "repeat", Jackpot: "airdrop", Vesting: "lock", Bounties: "verify", "Holder polls": "people",
  Contests: "act", Updates: "chat", Images: "media", Video: "media", "Lore + ASCII": "code", Sites: "code",
};
export const capGlyph = (name: string): GlyphKind => CAP_GLYPH[name] ?? "think";

/* rotating wire globe used in the hero headline */
export function WireGlobe({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, size = 0, visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => { size = c.clientWidth; c.width = c.height = Math.round(size * dpr); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(c);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(c);
    const tilt = -0.38;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const rot = reduce ? 0.6 : t / 2600;
      const s = size * dpr, R = s * 0.42, cx = s / 2, cy = s / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, s, s);
      const lw = Math.max(1, s / 60);
      // halo
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
      g.addColorStop(0, "rgba(61,123,255,.22)"); g.addColorStop(1, "rgba(61,123,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      ctx.lineWidth = lw; ctx.shadowColor = "rgba(61,123,255,.9)"; ctx.shadowBlur = s / 14;
      // project a point on the sphere (lon, lat) with rotation + tilt
      const P = (lon: number, lat: number) => {
        const x = Math.cos(lat) * Math.sin(lon + rot), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon + rot);
        const y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
        return [cx + x * R, cy - y2 * R, z2] as const;
      };
      // Segments are grouped by depth into a few shades and stroked once per
      // shade: shadowBlur per stroke is the expensive part, not the geometry.
      const SHADES = 8;
      const buckets: number[][] = Array.from({ length: SHADES * 2 }, () => []);
      const path = (pts: (readonly [number, number, number])[]) => {
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0, z0] = pts[i - 1], [x1, y1, z1] = pts[i];
          const z = (z0 + z1) / 2;
          const k = Math.min(SHADES - 1, Math.floor(Math.abs(z) * SHADES));
          buckets[(z > 0 ? SHADES : 0) + k].push(x0, y0, x1, y1);
        }
      };
      const N = 48;
      for (let m = 0; m < 6; m++) { const lon = (m / 6) * Math.PI; path(Array.from({ length: N * 2 + 1 }, (_, i) => P(lon, -Math.PI / 2 + (i / (N * 2)) * Math.PI * 2))); }
      for (let l = -2; l <= 2; l++) { const lat = (l / 3) * (Math.PI / 2); path(Array.from({ length: N + 1 }, (_, i) => P((i / N) * Math.PI * 2, lat))); }
      buckets.forEach((seg, b) => {
        if (!seg.length) return;
        const front = b >= SHADES, z = ((b % SHADES) + 0.5) / SHADES;
        ctx.strokeStyle = front ? `rgba(160,196,255,${0.55 + z * 0.45})` : `rgba(61,123,255,${0.12 + (1 - z) * 0.12})`;
        ctx.beginPath();
        for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(seg[i], seg[i + 1]); ctx.lineTo(seg[i + 2], seg[i + 3]); }
        ctx.stroke();
      });
      // outline
      ctx.strokeStyle = "rgba(207,227,255,.95)"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      // travelling signal dot
      const [dx, dy, dz] = P(t / 900, 0.55 * Math.sin(t / 1700));
      ctx.shadowBlur = s / 8; ctx.fillStyle = dz > 0 ? "#ffffff" : "rgba(127,178,255,.4)";
      ctx.beginPath(); ctx.arc(dx, dy, lw * 2.4, 0, Math.PI * 2); ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);
  return <canvas ref={ref} className={`globe ${className}`} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ feature scenes
   The three big home cards. Larger, more detailed line scenes in the same
   ice-blue wire language, each one specific to what it describes. */

export type FeatureKind = "signal" | "reasoning" | "action";

const FEATURE: Record<FeatureKind, () => ReactNode> = {
  // Signal — a radar reading many sources every wake.
  signal: () => (
    <svg viewBox="0 0 220 150" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {/* feeds from four sources into the centre */}
      {([[26, 26], [194, 26], [22, 126], [198, 122]] as const).map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y} L110 75`} opacity=".3" />
          <rect x={x - 7} y={y - 6} width="14" height="12" rx="2" opacity=".8" />
          <path d={`M${x - 3} ${y - 1}h6M${x - 3} ${y + 2}h4`} opacity=".5" strokeWidth="1" />
          <circle r="2.1" fill="currentColor" stroke="none">
            <animateMotion dur="2.6s" repeatCount="indefinite" begin={`${i * 0.5}s`} path={`M${x} ${y} L110 75`} />
            <animate attributeName="opacity" dur="2.6s" repeatCount="indefinite" begin={`${i * 0.5}s`} values="0;1;1;0" keyTimes="0;0.1;0.8;1" />
          </circle>
        </g>
      ))}
      {/* radar rings + sweep */}
      <circle cx="110" cy="75" r="46" opacity=".3" />
      <circle cx="110" cy="75" r="30" opacity=".45" />
      <circle cx="110" cy="75" r="15" opacity=".6" />
      <g className="g-spin" style={{ transformOrigin: "110px 75px" }}>
        <path d="M110 75 L110 29" />
        <path d="M110 75 L110 29 A46 46 0 0 1 143 44 Z" fill="currentColor" stroke="none" opacity=".16" />
      </g>
      <circle cx="110" cy="75" r="4" fill="currentColor" stroke="none" className="g-pulse" />
    </svg>
  ),

  // Reasoning — a graph of thoughts with one path lit, one branch doubted.
  reasoning: () => (
    <svg viewBox="0 0 220 150" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {(() => {
        const n: Record<string, [number, number]> = {
          a: [24, 75], b: [66, 40], c: [66, 110], d: [110, 62], e: [110, 104], f: [154, 44], g: [154, 96], h: [196, 72],
        };
        const edges: [string, string][] = [["a", "b"], ["a", "c"], ["b", "d"], ["c", "e"], ["c", "d"], ["d", "f"], ["e", "g"], ["d", "g"], ["f", "h"], ["g", "h"]];
        const path = ["a", "b", "d", "g", "h"]; // the chosen line of reasoning
        const d = path.map((k, i) => `${i ? "L" : "M"}${n[k]![0]} ${n[k]![1]}`).join(" ");
        return (
          <>
            {edges.map(([p, q], i) => (<path key={i} d={`M${n[p]![0]} ${n[p]![1]} L${n[q]![0]} ${n[q]![1]}`} opacity=".25" />))}
            {/* a discarded branch, fading */}
            <path d={`M${n.d![0]} ${n.d![1]} L${n.f![0]} ${n.f![1]}`} className="g-doubt" strokeDasharray="3 4" />
            <path d={d} className="g-trace" strokeWidth="1.9" />
            {Object.entries(n).map(([k, [x, y]], i) => (
              <circle key={k} cx={x} cy={y} r={path.includes(k) ? 3.4 : 2.6} fill="currentColor" stroke="none"
                className="g-pulse" style={{ animationDelay: `${(i * 0.3) % 2}s`, opacity: path.includes(k) ? 1 : 0.4 }} />
            ))}
          </>
        );
      })()}
    </svg>
  ),

  // Action — intent → policy gate → signer → chain. The backend, drawn.
  action: () => (
    <svg viewBox="0 0 220 150" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 75 H206" opacity=".25" />
      {/* intent */}
      <circle cx="26" cy="75" r="9" opacity=".8" /><path d="M26 71v8M22 75h8" strokeWidth="1" opacity=".7" />
      {/* policy gate */}
      <path d="M86 52 h-12 v46 h12 M104 52 h12 v46 h-12" opacity=".7" />
      <path d="M89 75l6 6 11-12" className="g-draw" strokeWidth="2" />
      {/* signer (key) */}
      <circle cx="150" cy="75" r="8" /><path d="M158 75h14v6M166 75v5" strokeWidth="1.3" />
      {/* chain blocks */}
      <rect x="182" y="58" width="13" height="13" rx="2" opacity=".5" />
      <rect x="182" y="79" width="13" height="13" rx="2" opacity=".5" />
      <rect x="198" y="68" width="13" height="13" rx="2" className="g-block" />
      {/* the move travelling the pipeline */}
      <circle r="3" fill="currentColor" stroke="none" className="g-move-glow">
        <animateMotion dur="3.4s" repeatCount="indefinite" path="M26 75 H95 H150 H204" keyPoints="0;0.33;0.66;1" keyTimes="0;0.4;0.7;1" calcMode="linear" />
        <animate attributeName="opacity" dur="3.4s" repeatCount="indefinite" values="0;1;1;1;0" keyTimes="0;0.08;0.7;0.92;1" />
      </circle>
    </svg>
  ),
};

export function FeatureGlyph({ kind, className = "" }: { kind: FeatureKind; className?: string }) {
  return <div className={`feature-glyph ${className}`} aria-hidden="true">{FEATURE[kind]()}</div>;
}
