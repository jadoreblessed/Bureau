import { AbsoluteFill, Easing, Img, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { C, Mark, display, mono } from "./brand";

// "Registry": a dark grid draws itself, agent covers flicker on cell by cell, the centre cell
// becomes the BUREAU card, the camera dives into it for four decoded lines, pulls back out
// as every cell wakes, and ends on the mark between converging brackets. 18s at 30fps.

const W = 1920, H = 1080, CX = W / 2, CY = H / 2;
const CW = 240, CH = 160; // one cell; the centre cell sits exactly in the middle of the frame
const COLS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
const ROWS = [-3, -2, -1, 0, 1, 2, 3];

const AGENTS = [
  "abacus", "lantrn", "choir", "glass", "salt", "herald", "vellum", "kettle", "orchrd", "pale", "abbot", "mintc",
];

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const io = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);

// a 5x3 block whose middle three cells hold the BUREAU card, leaving exactly 12 for the agents
const CELLS = [-2, -1, 0, 1, 2].flatMap((c) => [-1, 0, 1].map((r) => ({ c, r })))
  .filter(({ c, r }) => r !== 0 || Math.abs(c) > 1)
  .sort((a, b) => random(`cell${a.c},${a.r}`) - random(`cell${b.c},${b.r}`))
  .slice(0, AGENTS.length)
  .map((cell, i) => ({ ...cell, id: AGENTS[i], on: 40 + i * 9 }));

/** Camera zoom around the frame centre: 1 → 7 into the centre cell, then back out. */
const zoomAt = (f: number) =>
  f < 240 ? 1
  : f < 300 ? interpolate(f, [240, 300], [1, 7.2], { ...clamp, easing: io })
  : f < 452 ? 7.2
  : interpolate(f, [452, 488], [7.2, 1], { ...clamp, easing: out });

/** Flicker on like a tube light: a few hard blinks, then steady. */
const flicker = (f: number, on: number, seed: string) => {
  const t = f - on;
  if (t < 0) return 0;
  if (t > 8) return 1;
  return random(`${seed}${Math.floor(t)}`) > 0.45 ? 0.35 + 0.65 * (t / 8) : 0.05;
};

const SCRAMBLE = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%$/<>";

/** Characters settle left to right; unsettled ones cycle through glyphs every two frames. */
const Decode: React.FC<{ text: string; start: number; end: number; accent: string; size?: number }> = ({ text, start, end, accent, size = 108 }) => {
  const f = useCurrentFrame();
  if (f < start - 2 || f > end + 8) return null;
  const leave = interpolate(f, [end, end + 8], [0, 1], clamp);
  let k = 0;
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      fontFamily: display, fontWeight: 700, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1.04, color: C.ink,
      opacity: 1 - leave, filter: `blur(${leave * 18}px)`, translate: `0px ${-leave * 30}px`, padding: "0 140px",
    }}>
      <div>
        {text.split(" ").map((word, wi) => {
          const hot = word.replace(/[.,]/g, "") === accent;
          return (
            <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap", marginRight: "0.26em", color: hot ? C.blue2 : C.ink, textShadow: hot ? "0 0 38px rgba(127,178,255,.55)" : undefined }}>
              {[...word].map((ch) => {
                const at = start + (k++) * 0.7;
                const settled = f >= at + 6;
                const shown = f < at ? "" : settled ? ch : SCRAMBLE[Math.floor(random(`${text}${k}${Math.floor(f / 2)}`) * SCRAMBLE.length)];
                return (
                  <span key={k} style={{ display: "inline-block", minWidth: f < at ? "0.55em" : undefined, opacity: f < at ? 0 : settled ? 1 : 0.55, fontFamily: settled ? display : mono, fontWeight: settled ? 700 : 500 }}>
                    {shown}
                  </span>
                );
              })}
            </span>
          );
        })}
      </div>
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode; style: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: "absolute", fontFamily: mono, fontSize: 18, letterSpacing: "0.22em", color: C.dim, ...style }}>{children}</div>
);

export const Registry: React.FC = () => {
  const f = useCurrentFrame();
  const s = zoomAt(f);
  const X = (x: number) => CX + (x - CX) * s;
  const Y = (y: number) => CY + (y - CY) * s;
  const cellX = (c: number) => CX - CW / 2 + c * CW;
  const cellY = (r: number) => CY - CH / 2 + r * CH;

  // the whole grid recedes behind the end card
  const endFade = interpolate(f, [486, 508], [1, 0.28], clamp);
  // cells dim while the centre card takes focus, then all wake together on the pull-back
  const dimRest = interpolate(f, [200, 230], [1, 0.22], clamp);
  const wave = (c: number, r: number) => interpolate(f, [454 + Math.hypot(c, r * 1.5) * 4, 464 + Math.hypot(c, r * 1.5) * 4], [0, 1], clamp);

  // centre card
  const card = interpolate(f, [150, 185], [0, 1], { ...clamp, easing: out });
  const cardInner = interpolate(f, [255, 280], [1, 0], clamp) * card;
  const glow = interpolate(f, [150, 200], [0, 1], clamp) * interpolate(f, [452, 484], [1, 0.35], clamp);

  // end card
  const end = interpolate(f, [486, 512], [0, 1], { ...clamp, easing: out });
  const bracket = interpolate(f, [484, 516], [420, 0], { ...clamp, easing: out });
  const hud = interpolate(f, [18, 40], [0, 1], clamp) * interpolate(f, [482, 498], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      {/* glow of the centre cell, which becomes the backdrop once the camera is inside it */}
      <AbsoluteFill style={{
        opacity: glow,
        background: `radial-gradient(${CW * 2.6 * s}px ${CH * 1.7 * s}px at 50% 50%, rgba(61,123,255,.30), rgba(61,123,255,.06) 55%, transparent 75%)`,
      }} />

      <AbsoluteFill style={{ opacity: endFade }}>
        {/* agent cells */}
        {CELLS.map(({ c, r, id, on }) => {
          const lit = flicker(f, on, id) * Math.max(dimRest, wave(c, r)) * (f < 250 || f > 449 ? 1 : interpolate(f, [250, 270], [1, 0], clamp));
          if (lit <= 0.01) return null;
          const x = X(cellX(c)), y = Y(cellY(r)), w = CW * s, h = CH * s;
          if (x > W || y > H || x + w < 0 || y + h < 0) return null;
          return (
            <div key={id} style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: lit, overflow: "hidden" }}>
              <Img src={staticFile(`agents/${id}.webp`)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.15) brightness(.75)" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(61,123,255,.38), rgba(2,4,10,.75))", mixBlendMode: "multiply" }} />
              <div style={{ position: "absolute", inset: 0, background: "rgba(61,123,255,.18)", mixBlendMode: "screen" }} />
              <div style={{ position: "absolute", left: 10 * s, bottom: 8 * s, fontFamily: mono, fontSize: 11 * s, letterSpacing: "0.14em", color: C.ice }}>${id.toUpperCase()}</div>
              <div style={{ position: "absolute", right: 10 * s, top: 9 * s, width: 6 * s, height: 6 * s, borderRadius: "50%", background: C.blue2, boxShadow: `0 0 ${8 * s}px ${C.blue2}` }} />
            </div>
          );
        })}

        {/* centre card */}
        {card > 0 && (
          <div style={{
            position: "absolute", left: X(cellX(-1)), top: Y(cellY(0)), width: 3 * CW * s, height: CH * s, opacity: card,
            background: "radial-gradient(ellipse at 50% 55%, rgba(61,123,255,.28), rgba(2,4,10,.9) 75%)",
            boxShadow: `inset 0 0 0 1px rgba(127,178,255,${0.35 * cardInner})`,
          }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 * s, opacity: cardInner }}>
              <Mark size={50 * s} />
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 46 * s, letterSpacing: "0.04em", color: C.ink }}>BUREAU</div>
            </div>
            {([["AGENT · 001", { left: 9, top: 7 }], ["SOLANA", { right: 9, top: 7 }], ["FEES 85/5/5/5", { left: 9, bottom: 7 }], ["LOCKED", { right: 9, bottom: 7 }]] as const).map(([t, pos]) => (
              <div key={t} style={{
                position: "absolute", fontFamily: mono, fontSize: 8 * s, letterSpacing: "0.16em", color: C.dim, opacity: cardInner * interpolate(f, [175, 195], [0, 1], clamp),
                ...Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, v * s])),
              }}>{t}</div>
            ))}
          </div>
        )}

        {/* grid lines draw out from the centre */}
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          {[...COLS, 5].map((c) => {
            const x = X(cellX(c));
            const p = interpolate(f, [Math.abs(c - 0.5) * 3, 30 + Math.abs(c - 0.5) * 3], [0, 1], { ...clamp, easing: out });
            return <line key={`v${c}`} x1={x} x2={x} y1={CY - CY * 1.2 * p} y2={CY + CY * 1.2 * p} stroke="rgba(127,178,255,.13)" strokeWidth={1} />;
          })}
          {[...ROWS, 4].map((r) => {
            const y = Y(cellY(r));
            const p = interpolate(f, [Math.abs(r - 0.5) * 3, 30 + Math.abs(r - 0.5) * 3], [0, 1], { ...clamp, easing: out });
            return <line key={`h${r}`} y1={y} y2={y} x1={CX - CX * 1.2 * p} x2={CX + CX * 1.2 * p} stroke="rgba(127,178,255,.13)" strokeWidth={1} />;
          })}
          {[...COLS, 5].flatMap((c) => [...ROWS, 4].map((r) => {
            const x = X(cellX(c)), y = Y(cellY(r));
            const o = interpolate(f, [24 + Math.hypot(c, r) * 2, 34 + Math.hypot(c, r) * 2], [0, 0.55], clamp);
            const a = 5;
            return <path key={`p${c},${r}`} d={`M${x - a} ${y}H${x + a}M${x} ${y - a}V${y + a}`} stroke={C.ice} strokeOpacity={o} strokeWidth={1.2} />;
          }))}
        </svg>
      </AbsoluteFill>

      {/* inside the centre cell */}
      <Decode text="Launch a coin." accent="coin" start={292} end={326} />
      <Decode text="It wakes up with its own agent." accent="agent" start={332} end={372} />
      <Decode text="85% of fees fund its wallet." accent="85%" start={378} end={416} />
      <Decode text="Locked on chain." accent="Locked" start={422} end={452} />

      {/* end card */}
      {end > 0 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", padding: "46px 70px", opacity: end }}>
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => (
              <div key={`${sx}${sy}`} style={{
                position: "absolute", width: 34, height: 34,
                left: sx < 0 ? -bracket : undefined, right: sx > 0 ? -bracket : undefined,
                top: sy < 0 ? -bracket * 0.55 : undefined, bottom: sy > 0 ? -bracket * 0.55 : undefined,
                borderLeft: sx < 0 ? `2px solid ${C.ice}` : undefined, borderRight: sx > 0 ? `2px solid ${C.ice}` : undefined,
                borderTop: sy < 0 ? `2px solid ${C.ice}` : undefined, borderBottom: sy > 0 ? `2px solid ${C.ice}` : undefined,
              }} />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 26, filter: `drop-shadow(0 0 ${30 * end}px rgba(127,178,255,.5))` }}>
              <Mark size={92} />
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 104, letterSpacing: "0.03em", color: C.ink }}>BUREAU</div>
            </div>
          </div>
          <div style={{ marginTop: 34, fontFamily: mono, fontSize: 22, letterSpacing: "0.32em", color: C.ice, opacity: interpolate(f, [498, 514], [0, 1], clamp) }}>EVERY COIN GETS ITS OWN AGENT</div>
        </AbsoluteFill>
      )}

      {/* HUD */}
      <div style={{ opacity: hud }}>
        <Label style={{ left: 56, top: 44 }}>[ BUREAU / REGISTRY ]</Label>
        <Label style={{ right: 56, top: 44 }}>{`00:${String(Math.floor(f / 30)).padStart(2, "0")}:${String(f % 30).padStart(2, "0")}`}</Label>
        <Label style={{ left: 56, bottom: 44 }}>SOLANA · PUMP</Label>
        <Label style={{ right: 56, bottom: 44 }}>EVERY COIN · ONE AGENT</Label>
      </div>

      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,.7))", pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
