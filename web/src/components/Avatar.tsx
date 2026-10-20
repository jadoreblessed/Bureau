import { memo } from "react";
import { rng } from "../lib/data";

// Procedural agent portrait: a lit particle sigil in the Vexon orb palette.
// Deterministic per seed, pure SVG, no network.
const PALETTES = [
  ["#0b1a4a", "#3d7bff", "#cfe3ff"],
  ["#0a1630", "#4aa3ff", "#e6f3ff"],
  ["#140c36", "#7a6bff", "#e1dcff"],
  ["#06202a", "#2fc4d9", "#d6fbff"],
  ["#0d1838", "#5d8cff", "#ffffff"],
  ["#1a0f2e", "#a77bff", "#f0e6ff"],
];

function shapePoints(kind: number, r: () => number, n: number) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0;
    const t = r() * Math.PI * 2;
    const g = Math.sqrt(-2 * Math.log(r() + 1e-6)) * Math.cos(2 * Math.PI * r());
    if (kind === 0) { const rad = 30 + Math.abs(g) * 9; x = Math.cos(t) * rad; y = Math.sin(t) * rad; } // ring
    else if (kind === 1) { const rad = Math.sqrt(r()) * 34; x = Math.cos(t) * rad; y = Math.sin(t) * rad * 0.55; } // eye
    else if (kind === 2) { const k = Math.floor(r() * 4); const s = r() * 70 - 35; const o = g * 3; [x, y] = k === 0 ? [s, -30 + o] : k === 1 ? [s, 30 + o] : k === 2 ? [-30 + o, s] : [30 + o, s]; } // square
    else if (kind === 3) { const a = Math.floor(r() * 3) * (Math.PI * 2 / 3) + t * 0.08; const d = r() * 40; x = Math.cos(a) * d + g * 2; y = Math.sin(a) * d + g * 2; } // tri-star
    else if (kind === 4) { const rad = 12 + r() * 30; const sp = rad * 0.18; x = Math.cos(t + sp) * rad; y = Math.sin(t + sp) * rad; } // spiral disk
    else { const s = r() * 2 - 1; x = s * 36 + g * 3; y = Math.sin(s * Math.PI * 1.5) * 18 + g * 3; } // wave
    const vertical = Math.max(0, Math.min(1, (-y + 45) / 90));
    pts.push([x, y, vertical]);
  }
  return pts;
}

export const Avatar = memo(function Avatar({ seed, label, image, className = "", dots = 260 }: { seed: number; label?: string; image?: string; className?: string; dots?: number }) {
  const src = image ?? sigil(seed, dots, label);
  return (<div className={`ava ${className}`}><img src={src} alt="" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>);
});

/* Drawn once per (seed, dots, label) into a canvas and cached as an image:
   a 260-circle SVG per card meant tens of thousands of live DOM nodes on the
   agents page. Same 160x100 scene as before, so object-fit: cover crops it
   the way preserveAspectRatio="slice" did. */
const SIGILS = new Map<string, string>();
function sigil(seed: number, dots: number, label?: string): string {
  const key = `${seed}:${dots}:${label ?? ""}`;
  const hit = SIGILS.get(key);
  if (hit) return hit;
  const r = rng(seed);
  const pal = PALETTES[Math.floor(r() * PALETTES.length)];
  const kind = Math.floor(r() * 6);
  const pts = shapePoints(kind, r, dots);
  const rot = (Math.floor(r() * 360) * Math.PI) / 180;

  const S = dots >= 200 ? 3 : 1.5; // px per scene unit
  const c = document.createElement("canvas");
  c.width = 160 * S; c.height = 100 * S;
  const g = c.getContext("2d")!;
  g.scale(S, S);
  g.translate(80, 50);
  // background: elliptical radial gradient (objectBoundingBox r=80% of 160x100)
  g.save(); g.translate(0, -50 + 28); g.scale(1, 100 / 160);
  const bg = g.createRadialGradient(0, 0, 0, 0, 0, 128);
  bg.addColorStop(0, pal[0]); bg.addColorStop(0.55, "#03050c"); bg.addColorStop(1, "#000");
  g.fillStyle = bg; g.fillRect(-200, -200, 400, 400); g.restore();
  // faint dot grid
  g.fillStyle = "rgba(255,255,255,.07)";
  for (let y = -48.5; y < 50; y += 3) for (let x = -78.5; x < 80; x += 3) { g.beginPath(); g.arc(x, y, 0.35, 0, 6.283); g.fill(); }
  // top glow
  g.save(); g.translate(0, -46.4); g.scale(1, 30.6 / 63);
  const hg = g.createRadialGradient(0, 0, 0, 0, 0, 63);
  hg.addColorStop(0, pal[2] + "59"); hg.addColorStop(1, pal[1] + "00");
  g.fillStyle = hg; g.beginPath(); g.ellipse(0, (-26 + 46.4) * (63 / 30.6), 70, 34 * (63 / 30.6), 0, 0, 6.283); g.fill(); g.restore();
  // the particle sigil
  g.save(); g.rotate(rot);
  pts.forEach(([x, y, v], i) => {
    g.globalAlpha = 0.25 + v * 0.7;
    g.fillStyle = v > 0.62 ? pal[2] : pal[1];
    g.beginPath(); g.arc(x, y, 0.35 + (i % 7) * 0.09, 0, 6.283); g.fill();
  });
  g.restore(); g.globalAlpha = 1;
  if (label) {
    g.globalAlpha = 0.55; g.fillStyle = "#fff"; g.textAlign = "center";
    g.font = "6.5px 'JetBrains Mono', monospace";
    g.letterSpacing = "2px";
    g.fillText("$" + label, 0, 40);
  }
  const url = c.toDataURL("image/webp", 0.85);
  SIGILS.set(key, url);
  return url;
}
