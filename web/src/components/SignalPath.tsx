import { useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   SignalPath — the agent's cognition as a river of light.
   The conductor is drawn from thousands of glowing atoms (the same particle
   language as the hero orb): dense along the line, thinning into a cloud,
   twinkling, colored by phase — cyan (Signal) → blue (Reasoning) → violet
   (Action). Sources stream in as particle feeds; a bright swell travels the
   whole path, igniting the atoms it passes; the move lands as a signed node.
   Sprite-based additive rendering, DPR-capped, paused when offscreen or
   hidden; a single committed frame under prefers-reduced-motion.
   ───────────────────────────────────────────────────────────────────────── */

const CYAN = [120, 224, 255] as const;
const BLUE = [61, 123, 255] as const;
const VIOLET = [150, 130, 255] as const;
const WARN = [242, 180, 90] as const;
const WHITE = [236, 244, 255] as const;

const PERIOD = 5200;

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

    let W = 0, H = 0, dpr = 1, raf = 0, start = 0, visible = true, litPhase = -1;

    // ── soft atom sprite, one per color (rendered once) ─────────────────────
    const SPR = 36;
    const sprites = new Map<string, HTMLCanvasElement>();
    function sprite(rgb: readonly number[]): HTMLCanvasElement {
      const key = rgb.join(",");
      let s = sprites.get(key);
      if (s) return s;
      s = document.createElement("canvas");
      s.width = s.height = SPR;
      const g = s.getContext("2d")!;
      const grad = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
      grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
      grad.addColorStop(0.25, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`);
      grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, SPR, SPR);
      sprites.set(key, s);
      return s;
    }

    // ── atoms: normalized along the conductor + gaussian scatter ────────────
    type Atom = { s: number; n: number; seed: number; sc: number };
    function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    let river: Atom[] = [];
    type Feed = { x: number; y: number; atoms: { t: number; n: number; seed: number; sc: number }[] };
    let feeds: Feed[] = [];

    function buildAtoms() {
      const RIVER = Math.round(Math.min(1, W / 900) * 520) + 240;
      river = [];
      for (let i = 0; i < RIVER; i++) {
        // bias s toward reasoning zone a touch; scatter tighter near the line
        const s = Math.random();
        river.push({ s, n: gauss() * 0.5, seed: Math.random() * 6.283, sc: 0.5 + Math.random() * 1.7 });
      }
      const anchors = [[0, 0.16], [0, 0.84], [0.11, 0.04], [0.11, 0.96], [0.015, 0.5]];
      feeds = anchors.map(([fx, fy]) => {
        const atoms = [];
        for (let i = 0; i < 26; i++) atoms.push({ t: Math.random(), n: gauss() * 0.4, seed: Math.random() * 6.283, sc: 0.4 + Math.random() * 1.1 });
        return { x: fx!, y: fy!, atoms };
      });
    }

    function resize() {
      const r = wrap.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      cvs.style.width = W + "px"; cvs.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildAtoms();
      if (reduce) { draw(0.985); light(2); }
    }

    const zA = () => 0.30 * W, zB = () => 0.66 * W, stepX = () => 0.82 * W, nodeX = () => 0.945 * W, cy = () => H * 0.5;

    function conductorY(x: number): number {
      const c = cy();
      if (x <= zA()) return c;
      if (x <= zB()) { const t = (x - zA()) / (zB() - zA()); return c + Math.sin(t * Math.PI) * -12 + Math.sin(t * Math.PI * 2) * 7; }
      if (x <= stepX()) return c;
      if (x <= nodeX()) { const t = (x - stepX()) / (nodeX() - stepX()); return c + t * -16; }
      return c - 16;
    }
    // vertical half-thickness of the cloud at a given x (fat in reasoning, tight at the ends)
    function spread(x: number): number {
      const base = H * 0.07;
      if (x < zA()) return base + (zA() - x) / zA() * H * 0.14;   // feeds fan open to the left
      if (x < zB()) { const t = (x - zA()) / (zB() - zA()); return base + Math.sin(t * Math.PI) * H * 0.16; }
      if (x < nodeX()) return base * (1 - (x - zB()) / (nodeX() - zB()) * 0.65);
      return base * 0.3;
    }
    function pulseX(p: number): number {
      if (p < 0.28) return lerp(0, zA(), p / 0.28);
      if (p < 0.72) return lerp(zA(), zB(), (p - 0.28) / 0.44);
      return lerp(zB(), W, (p - 0.72) / 0.28);
    }
    function phaseOf(p: number) { return p < 0.28 ? 0 : p < 0.72 ? 1 : 2; }
    function colorAt(x: number) { return x < zA() ? CYAN : x < zB() ? BLUE : VIOLET; }

    function atom(x: number, y: number, size: number, rgb: readonly number[], alpha: number) {
      if (alpha <= 0.01) return;
      const s = sprite(rgb);
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(s, x - size / 2, y - size / 2, size, size);
    }

    function draw(p: number) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const t = p * PERIOD / 1000;
      const px = pulseX(p);

      // ── source feeds: particles streaming inward ──────────────────────────
      const merge = { x: zA(), y: cy() };
      feeds.forEach((f) => {
        const ax = f.x * W, ay = f.y * H;
        f.atoms.forEach((a) => {
          const flow = (a.t + p * 1.6) % 1;
          const x = ax + (merge.x - ax) * flow;
          const y = ay + (merge.y - ay) * flow + a.n * H * 0.05 * (1 - flow);
          const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + a.seed));
          const fade = Math.sin(flow * Math.PI);
          atom(x, y, a.sc * 4.5, CYAN, tw * fade * 0.7);
        });
      });

      // ── the river of atoms along the conductor ────────────────────────────
      const pulseW = W * 0.11;
      for (let i = 0; i < river.length; i++) {
        const a = river[i]!;
        const x = a.s * W;
        const sp = spread(x);
        const y = conductorY(x) + a.n * sp;
        // density falls off from the line → dimmer further out
        const near = Math.exp(-Math.abs(a.n) * 1.05);
        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2 + a.seed));
        let bright = near * twinkle;
        const rgb = colorAt(x);
        // the travelling swell ignites atoms it passes
        const d = Math.abs(x - px);
        let size = a.sc * 4.2;
        if (d < pulseW) {
          const ig = (1 - d / pulseW);
          bright = Math.min(1, bright + ig * ig * 0.9);
          size += ig * ig * a.sc * 4;
          if (ig > 0.6) { atom(x, y, size * 1.4, WHITE, (ig - 0.6) * 1.6 * near); }
        }
        atom(x, y, size, rgb, bright * 0.85);
      }

      // ── a discarded branch: a faint particle wisp peeling off ─────────────
      const doubtA = { x: W * 0.46, y: cy() }, doubtB = { x: W * 0.60, y: cy() - 52 };
      const dp = 0.4 + 0.5 * Math.sin(p * Math.PI * 2);
      for (let i = 0; i < 14; i++) {
        const u = i / 13;
        const x = lerp(doubtA.x, doubtB.x, u);
        const y = lerp(doubtA.y, doubtB.y, u) + Math.sin(u * Math.PI) * -6;
        atom(x, y, 3.4, WARN, (1 - u) * dp * 0.5);
      }

      // ── the signed node ───────────────────────────────────────────────────
      const nx = nodeX(), ny = conductorY(nx);
      const arrived = p > 0.88 || p < 0.06;
      for (let r = 0; r < 10; r++) {
        const ang = (r / 10) * Math.PI * 2 + t * 0.5;
        atom(nx + Math.cos(ang) * 9, ny + Math.sin(ang) * 9, 4, VIOLET, (arrived ? 0.9 : 0.4));
      }
      atom(nx, ny, arrived ? 16 : 10, arrived ? WHITE : VIOLET, arrived ? 1 : 0.6);
      if (!reduce) {
        const rp = (p - 0.84) / 0.16;
        if (rp > 0 && rp < 1) { ctx.globalAlpha = (1 - rp) * 0.5; ctx.strokeStyle = `rgba(${VIOLET.join(",")},1)`; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(nx, ny, 10 + rp * 30, 0, Math.PI * 2); ctx.stroke(); }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (!reduce) light(phaseOf(p));
    }

    function light(phase: number) {
      if (phase === litPhase) return;
      litPhase = phase;
      stageEls.forEach((el, i) => el.classList.toggle("is-lit", i === phase));
    }

    function frame(now: number) {
      if (!start) start = now;
      draw(((now - start) % PERIOD) / PERIOD);
      raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; toggle(); }, { threshold: 0.01 });
    io.observe(wrap);
    function toggle() {
      const run = visible && !document.hidden && !reduce;
      if (run && !raf) { start = 0; raf = requestAnimationFrame(frame); }
      else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    document.addEventListener("visibilitychange", toggle); toggle();

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
