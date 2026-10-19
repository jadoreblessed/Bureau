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
  if (image) return (<div className={`ava ${className}`}><img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>);
  const r = rng(seed);
  const pal = PALETTES[Math.floor(r() * PALETTES.length)];
  const kind = Math.floor(r() * 6);
  const pts = shapePoints(kind, r, dots);
  const rot = Math.floor(r() * 360);
  const id = "g" + seed.toString(36);
  return (
    <div className={`ava ${className}`}>
      <svg viewBox="-80 -50 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id={id + "b"} cx="50%" cy="28%" r="80%">
            <stop offset="0" stopColor={pal[0]} stopOpacity="1" />
            <stop offset=".55" stopColor="#03050c" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
          <radialGradient id={id + "h"} cx="50%" cy="20%" r="45%">
            <stop offset="0" stopColor={pal[2]} stopOpacity=".35" />
            <stop offset="1" stopColor={pal[1]} stopOpacity="0" />
          </radialGradient>
          <pattern id={id + "p"} width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="3" height="3" fill="transparent" />
            <circle cx="1.5" cy="1.5" r=".35" fill="#fff" opacity=".07" />
          </pattern>
        </defs>
        <rect x="-80" y="-50" width="160" height="100" fill={`url(#${id}b)`} />
        <rect x="-80" y="-50" width="160" height="100" fill={`url(#${id}p)`} />
        <ellipse cx="0" cy="-26" rx="70" ry="34" fill={`url(#${id}h)`} />
        <g transform={`rotate(${rot})`}>
          {pts.map(([x, y, v], i) => (
            <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={(0.35 + (i % 7) * 0.09).toFixed(2)} fill={v > 0.62 ? pal[2] : pal[1]} opacity={(0.25 + v * 0.7).toFixed(2)} />
          ))}
        </g>
        {label && (
          <text x="0" y="40" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6.5" letterSpacing="2" fill="#fff" opacity=".55">{"$" + label}</text>
        )}
      </svg>
    </div>
  );
});
