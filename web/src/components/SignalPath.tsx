import { useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   SignalPath — the agent's cognition drawn as one living instrument.
   A single conductor runs left→right: sources converge (Signal), the line
   branches and doubts itself (Reasoning), then resolves to one signed move
   (Action). A pulse travels the whole path, lingering while it reasons.
   Canvas, DPR-capped, paused when offscreen or the tab is hidden; a single
   static frame under prefers-reduced-motion.
   ───────────────────────────────────────────────────────────────────────── */

type Pt = { x: number; y: number };

const ICE = "207,227,255";   // --ice
const BLUE = "61,123,255";   // --blue
const WHITE = "234,242,255";

const PERIOD = 4600;         // ms for one pass of the pulse
const TAIL = 18;             // comet samples

export function SignalPath() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvsRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = cvsRef.current!;
    const wrap = wrapRef.current!;
    const ctx = cvs.getContext("2d", { alpha: true })!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = 1;
    let raf = 0, start = 0, visible = true;

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
      if (reduce) draw(0.985); // committed frame: the move just signed
    }

    // zone boundaries
    const zA = () => 0.30 * W;   // sources converge here
    const zB = () => 0.66 * W;   // branches reconverge here
    const stepX = () => 0.82 * W;
    const nodeX = () => 0.945 * W;
    const cy = () => H * 0.5;

    // y of the chosen conductor at a given x
    function conductorY(x: number): number {
      const c = cy();
      if (x <= zA()) return c;
      if (x <= zB()) {
        // gentle navigation through the reasoning graph
        const t = (x - zA()) / (zB() - zA());
        return c + Math.sin(t * Math.PI) * -9 + Math.sin(t * Math.PI * 2) * 5;
      }
      if (x <= stepX()) return c;
      if (x <= nodeX()) {
        const t = (x - stepX()) / (nodeX() - stepX());
        return c + (1 - t) * 0 + t * -14; // step up into the node
      }
      return c - 14;
    }

    // pulse position along the path, time-warped to linger in Reasoning
    function pulseX(p: number): number {
      // p in [0,1); allocate 28% / 44% / 28% of the loop to the three zones
      if (p < 0.28) return lerp(0, zA(), p / 0.28);
      if (p < 0.72) return lerp(zA(), zB(), (p - 0.28) / 0.44);
      return lerp(zB(), W, (p - 0.72) / 0.28);
    }

    function line(a: Pt, b: Pt, alpha: number, width = 1.4, color = ICE) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(${color},${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function curve(pts: Pt[], alpha: number, width: number, color: string, dash?: number[]) {
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1]!, cur = pts[i]!;
        const mx = (prev.x + cur.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, (prev.y + cur.y) / 2);
        ctx.lineTo(cur.x, cur.y);
      }
      ctx.setLineDash(dash || []);
      ctx.strokeStyle = `rgba(${color},${alpha})`;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function samplePath(x0: number, x1: number, step = 7): Pt[] {
      const out: Pt[] = [];
      for (let x = x0; x <= x1; x += step) out.push({ x, y: conductorY(x) });
      out.push({ x: x1, y: conductorY(x1) });
      return out;
    }

    function draw(p: number) {
      const c = cy();
      ctx.clearRect(0, 0, W, H);

      // ── Zone A · sources converging into the conductor ──────────────────
      const merge: Pt = { x: zA(), y: c };
      const feeds: Pt[] = [
        { x: 0, y: H * 0.16 }, { x: 0, y: H * 0.84 },
        { x: W * 0.12, y: H * 0.05 }, { x: W * 0.12, y: H * 0.95 },
        { x: W * 0.02, y: H * 0.5 },
      ];
      feeds.forEach((f, i) => {
        line(f, merge, 0.09, 1);
        // a reading drifting inward
        const fp = (p * 2.1 + i * 0.19) % 1;
        const dx = f.x + (merge.x - f.x) * fp;
        const dy = f.y + (merge.y - f.y) * fp;
        dot(dx, dy, 1.4, `rgba(${ICE},${0.5 * (1 - Math.abs(fp - 0.5) * 1.3)})`);
        node(f.x, f.y, 0.5);
      });

      // ── Zone B · the reasoning graph: strands weave, one doubts ─────────
      const strandTop = samplePath(zA(), zB()).map((pt) => ({ x: pt.x, y: c - 18 + (pt.y - c) * 0.4 }));
      const strandBot = samplePath(zA(), zB()).map((pt) => ({ x: pt.x, y: c + 18 - (pt.y - c) * 0.4 }));
      curve(strandTop, 0.13, 1, ICE);
      curve(strandBot, 0.13, 1, ICE);
      // a discarded branch peeling off and fading
      const doubt: Pt[] = [
        { x: W * 0.46, y: c }, { x: W * 0.54, y: c - 30 }, { x: W * 0.60, y: c - 46 },
      ];
      curve(doubt, 0.22, 1.1, `${242},${180},${90}`, [3, 5]); // --warn, dashed
      // graph nodes
      [0.40, 0.48, 0.56, 0.62].forEach((f, i) => {
        const x = lerp(zA(), zB(), (f - 0.30) / 0.36);
        node(x, conductorY(x), i === 1 ? 1 : 0.5);
      });

      // ── the chosen conductor, full width ───────────────────────────────
      const chosen = samplePath(0, W);
      curve(chosen, 0.42, 1.6, ICE);

      // ── Zone C · resolution → signed on-chain ──────────────────────────
      const nx = nodeX(), ny = c - 14;
      // signer glyph (key notch)
      line({ x: stepX(), y: c }, { x: nx - 16, y: ny }, 0.5, 1.6);
      // the terminal block (the signed transaction)
      const arrived = p > 0.90 || p < 0.04;
      roundRect(nx - 7, ny - 7, 14, 14, 3, arrived ? 0.95 : 0.6);
      if (!reduce) {
        const rp = ((p - 0.86) / 0.14);
        if (rp > 0 && rp < 1) ring(nx, ny, 7 + rp * 22, (1 - rp) * 0.5);
      } else {
        ring(nx, ny, 16, 0.3);
      }

      // ── the travelling pulse (comet) ───────────────────────────────────
      if (!reduce) {
        for (let k = TAIL; k >= 0; k--) {
          const pp = (p - k * 0.006 + 1) % 1;
          const x = pulseX(pp);
          const y = conductorY(x);
          const a = (1 - k / TAIL);
          if (k === 0) {
            glow(x, y, 9, `rgba(${BLUE},0.9)`);
            dot(x, y, 2.6, `rgba(${WHITE},1)`);
          } else {
            dot(x, y, 2.2 * a, `rgba(${ICE},${0.55 * a})`);
          }
        }
      }
    }

    // ── tiny drawing helpers ──────────────────────────────────────────────
    function dot(x: number, y: number, r: number, fill: string) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    }
    function node(x: number, y: number, a: number) {
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ICE},${0.9 * a})`; ctx.fill();
    }
    function glow(x: number, y: number, r: number, color: string) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color); g.addColorStop(1, `rgba(${BLUE},0)`);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    }
    function ring(x: number, y: number, r: number, a: number) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${BLUE},${a})`; ctx.lineWidth = 1.2; ctx.stroke();
    }
    function roundRect(x: number, y: number, w: number, h: number, r: number, a: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.strokeStyle = `rgba(${ICE},${a})`; ctx.lineWidth = 1.5; ctx.stroke();
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

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      toggle();
    }, { threshold: 0.01 });
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
    <div className="trace panel corners">
      <div className="trace-stab" aria-hidden="true">
        <span>perceive</span><span>reason</span><span>act</span>
      </div>
      <div className="trace-canvas-wrap" ref={wrapRef}>
        <canvas ref={cvsRef} className="trace-canvas" />
      </div>
      <div className="trace-stages">
        {STAGES.map((s) => (
          <div className="trace-stage" key={s.t}>
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
