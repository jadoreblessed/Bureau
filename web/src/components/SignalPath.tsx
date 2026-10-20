import { useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   SignalPath — the agent's cognition drawn as one luminous instrument.
   A conductor runs left→right through three lit phases: sources converge
   (Signal, cyan), the line branches and doubts itself (Reasoning, blue),
   then resolves to one signed move (Action, violet). A bright pulse travels
   the whole path; as it enters a phase, that phase's label lights up.
   Canvas, DPR-capped, paused when offscreen or hidden; a single committed
   frame under prefers-reduced-motion.
   ───────────────────────────────────────────────────────────────────────── */

const CYAN = "120,224,255";   // Signal
const BLUE = "61,123,255";    // Reasoning / conductor
const VIOLET = "150,130,255"; // Action
const ICE = "207,227,255";
const WHITE = "236,244,255";
const WARN = "242,180,90";

const PERIOD = 4800;
const TAIL = 26;

export function SignalPath() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cvs = cvsRef.current!;
    const wrap = wrapRef.current!;
    const root = rootRef.current!;
    const ctx = cvs.getContext("2d", { alpha: true })!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stageEls = Array.from(root.querySelectorAll<HTMLElement>(".trace-stage"));

    let W = 0, H = 0, dpr = 1;
    let raf = 0, start = 0, visible = true, litPhase = -1;

    function resize() {
      const r = wrap.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.width = Math.round(W * dpr);
      cvs.height = Math.round(H * dpr);
      cvs.style.width = W + "px";
      cvs.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) { draw(0.985); light(2); }
    }

    const zA = () => 0.30 * W;
    const zB = () => 0.66 * W;
    const stepX = () => 0.82 * W;
    const nodeX = () => 0.945 * W;
    const cy = () => H * 0.5;

    function conductorY(x: number): number {
      const c = cy();
      if (x <= zA()) return c;
      if (x <= zB()) {
        const t = (x - zA()) / (zB() - zA());
        return c + Math.sin(t * Math.PI) * -11 + Math.sin(t * Math.PI * 2) * 6;
      }
      if (x <= stepX()) return c;
      if (x <= nodeX()) {
        const t = (x - stepX()) / (nodeX() - stepX());
        return c + t * -15;
      }
      return c - 15;
    }

    function pulseX(p: number): number {
      if (p < 0.28) return lerp(0, zA(), p / 0.28);
      if (p < 0.72) return lerp(zA(), zB(), (p - 0.28) / 0.44);
      return lerp(zB(), W, (p - 0.72) / 0.28);
    }
    function phaseOf(p: number): number { return p < 0.28 ? 0 : p < 0.72 ? 1 : 2; }
    function colorAt(x: number): string {
      if (x < zA()) return CYAN;
      if (x < zB()) return BLUE;
      return VIOLET;
    }

    function samplePath(x0: number, x1: number, step = 6) {
      const out: { x: number; y: number }[] = [];
      for (let x = x0; x <= x1; x += step) out.push({ x, y: conductorY(x) });
      out.push({ x: x1, y: conductorY(x1) });
      return out;
    }

    function curve(pts: { x: number; y: number }[], color: string, alpha: number, width: number, dash?: number[]) {
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) {
        const pr = pts[i - 1]!, cu = pts[i]!, mx = (pr.x + cu.x) / 2;
        ctx.quadraticCurveTo(pr.x, pr.y, mx, (pr.y + cu.y) / 2);
        ctx.lineTo(cu.x, cu.y);
      }
      ctx.setLineDash(dash || []);
      ctx.strokeStyle = `rgba(${color},${alpha})`;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function draw(p: number) {
      const c = cy();
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter"; // additive glow for the whole scene

      // ── ambient phase washes ────────────────────────────────────────────
      wash(zA() * 0.5, c, zA() * 0.9, CYAN, 0.05);
      wash((zA() + zB()) / 2, c, (zB() - zA()) * 0.7, BLUE, 0.06);
      wash((zB() + W) / 2, c, (W - zB()) * 0.8, VIOLET, 0.055);

      // ── Zone A · sources converging ─────────────────────────────────────
      const merge = { x: zA(), y: c };
      const feeds = [
        { x: 0, y: H * 0.16 }, { x: 0, y: H * 0.84 },
        { x: W * 0.11, y: H * 0.04 }, { x: W * 0.11, y: H * 0.96 },
        { x: W * 0.015, y: H * 0.5 },
      ];
      feeds.forEach((f, i) => {
        curve([f, merge], CYAN, 0.1, 1);
        const fp = (p * 2.0 + i * 0.19) % 1;
        const dx = f.x + (merge.x - f.x) * fp;
        const dy = f.y + (merge.y - f.y) * fp;
        const a = 0.9 * (1 - Math.abs(fp - 0.5) * 1.4);
        if (a > 0) { glow(dx, dy, 5, CYAN, a * 0.5); dot(dx, dy, 1.5, `rgba(${WHITE},${a})`); }
        dot(f.x, f.y, 2, `rgba(${CYAN},0.55)`);
      });

      // ── Zone B · the reasoning graph ────────────────────────────────────
      const top = samplePath(zA(), zB()).map((pt) => ({ x: pt.x, y: c - 20 + (pt.y - c) * 0.4 }));
      const bot = samplePath(zA(), zB()).map((pt) => ({ x: pt.x, y: c + 20 - (pt.y - c) * 0.4 }));
      curve(top, BLUE, 0.16, 1);
      curve(bot, BLUE, 0.16, 1);
      // a discarded branch peeling off and fading
      const dp = 0.5 + 0.5 * Math.sin(p * Math.PI * 2);
      curve([{ x: W * 0.46, y: c }, { x: W * 0.54, y: c - 32 }, { x: W * 0.60, y: c - 50 }],
        WARN, 0.1 + dp * 0.22, 1.2, [3, 5]);
      [0.40, 0.48, 0.56, 0.62].forEach((f, i) => {
        const x = lerp(zA(), zB(), (f - 0.30) / 0.36);
        node(x, conductorY(x), BLUE, i === 1 ? 1 : 0.55);
      });

      // ── the chosen conductor, full width, with bloom ────────────────────
      const chosen = samplePath(0, W);
      curve(chosen, BLUE, 0.1, 6);   // soft halo
      // segment it by phase color
      curve(samplePath(0, zA()), CYAN, 0.6, 1.8);
      curve(samplePath(zA(), zB()), BLUE, 0.6, 1.8);
      curve(samplePath(zB(), W), VIOLET, 0.6, 1.8);

      // ── Zone C · resolution → signed ────────────────────────────────────
      const nx = nodeX(), ny = c - 15;
      curve([{ x: stepX(), y: c }, { x: nx - 16, y: ny }], VIOLET, 0.55, 1.8);
      const arrived = p > 0.90 || p < 0.05;
      roundRect(nx - 8, ny - 8, 16, 16, 3, VIOLET, arrived ? 1 : 0.6);
      if (arrived) glow(nx, ny, 16, VIOLET, 0.6);
      if (!reduce) {
        const rp = (p - 0.86) / 0.14;
        if (rp > 0 && rp < 1) ring(nx, ny, 8 + rp * 26, VIOLET, (1 - rp) * 0.6);
      } else ring(nx, ny, 18, VIOLET, 0.35);

      // ── the travelling pulse (bright comet) ─────────────────────────────
      if (!reduce) {
        for (let k = TAIL; k >= 0; k--) {
          const pp = (p - k * 0.0052 + 1) % 1;
          const x = pulseX(pp);
          const y = conductorY(x);
          const col = colorAt(x);
          const a = 1 - k / TAIL;
          if (k === 0) {
            glow(x, y, 16, col, 0.9);
            glow(x, y, 7, WHITE, 0.9);
            dot(x, y, 2.8, `rgba(${WHITE},1)`);
          } else {
            dot(x, y, 2.6 * a, `rgba(${col},${0.6 * a})`);
          }
        }
      }

      ctx.globalCompositeOperation = "source-over";

      // sync label highlight to the pulse's phase
      if (!reduce) light(phaseOf(p));
    }

    // ── helpers ───────────────────────────────────────────────────────────
    function dot(x: number, y: number, r: number, fill: string) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    }
    function node(x: number, y: number, color: string, a: number) {
      glow(x, y, 6, color, a * 0.5);
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${WHITE},${0.9 * a})`; ctx.fill();
    }
    function glow(x: number, y: number, r: number, color: string, a: number) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color},${a})`); g.addColorStop(1, `rgba(${color},0)`);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    }
    function wash(x: number, y: number, r: number, color: string, a: number) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color},${a})`); g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    function ring(x: number, y: number, r: number, color: string, a: number) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${color},${a})`; ctx.lineWidth = 1.3; ctx.stroke();
    }
    function roundRect(x: number, y: number, w: number, h: number, r: number, color: string, a: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.strokeStyle = `rgba(${color},${a})`; ctx.lineWidth = 1.8; ctx.stroke();
    }

    function light(phase: number) {
      if (phase === litPhase) return;
      litPhase = phase;
      stageEls.forEach((el, i) => el.classList.toggle("is-lit", i === phase));
    }

    function frame(now: number) {
      if (!start) start = now;
      const p = ((now - start) % PERIOD) / PERIOD;
      draw(p);
      raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; toggle(); }, { threshold: 0.01 });
    io.observe(wrap);

    function toggle() {
      const run = visible && !document.hidden && !reduce;
      if (run && !raf) { start = 0; raf = requestAnimationFrame(frame); }
      else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    document.addEventListener("visibilitychange", toggle);
    toggle();

    return () => {
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", toggle);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="trace panel corners" ref={rootRef}>
      <div className="trace-stab" aria-hidden="true">
        <span>perceive</span><span>reason</span><span>act</span>
      </div>
      <div className="trace-canvas-wrap" ref={wrapRef}>
        <canvas ref={cvsRef} className="trace-canvas" />
      </div>
      <div className="trace-stages">
        {STAGES.map((s, i) => (
          <div className={`trace-stage phase-${i}`} key={s.t}>
            <h3 className="display trace-word">{s.t}</h3>
            <p className="trace-desc">{s.d}</p>
            <span className="label trace-cap">{s.c}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const STAGES = [
  { t: "Signal", c: "every wake · first", d: "Market, holders, treasury, X and the open web — read before anything else happens." },
  { t: "Reasoning", c: "weighs · doubts · plans", d: "It weighs what changed against its memory, doubts itself out loud, and writes down a plan." },
  { t: "Action", c: "policy-gated · signed", d: "Buybacks, rewards, posts, trades — each move checked by the policy engine, then signed." },
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
