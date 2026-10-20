import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop, C, Mark, display, mono } from "./brand";

// A ring of agents orbits a counter, then gives way to the "live" tile. 10s at 30fps.

const COVERS = ["clerk", "halc", "saint", "moth", "static", "fndry", "rook", "fox", "tide", "monk"];
const GLYPHS = ["∗", "◆", "◎", "▣", "✦", "◉"];
const TILES = Array.from({ length: 16 }, (_, i) => (i % 8 < 5 ? { cover: COVERS[(i * 3) % COVERS.length] } : { glyph: GLYPHS[i % GLYPHS.length] }));
const R = 400;
const SIZE = 96;

export const RingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const spin = frame * 0.18; // degrees
  const count = Math.round(interpolate(frame, [10, 120], [1, 10], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.33, 1, 0.68, 1) }));
  const phase2 = interpolate(frame, [140, 170], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill style={{ color: C.ink, fontFamily: display }}>
      <Backdrop seed="ring" />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {TILES.map((t, i) => {
          const a = ((i / TILES.length) * 360 + spin) * (Math.PI / 180);
          const appear = interpolate(frame, [i * 4, i * 4 + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
          return (
            <div key={i} style={{
              position: "absolute", width: SIZE, height: SIZE, borderRadius: 22, overflow: "hidden",
              translate: `${Math.cos(a) * R * appear}px ${Math.sin(a) * R * appear}px`,
              opacity: appear * interpolate(phase2, [0, 1], [1, 0.32]),
              scale: interpolate(appear, [0, 1], [0.4, 1]),
              filter: `grayscale(${phase2})`,
              border: `1px solid ${C.line}`, background: "rgba(10,16,32,.9)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 12px 40px rgba(0,0,0,.5)",
            }}>
              {"cover" in t
                ? <Img src={staticFile(`agents/${t.cover}.webp`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 46, color: C.blue2 }}>{t.glyph}</span>}
            </div>
          );
        })}

        {/* phase 1: counter */}
        <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", opacity: 1 - phase2, scale: interpolate(phase2, [0, 1], [1, 0.9]) }}>
          <div style={{ fontSize: 46, color: C.ice }}>agents working on</div>
          <div style={{ fontSize: 210, fontWeight: 700, lineHeight: 1.05, color: C.blue2, letterSpacing: "-0.03em" }}>{String(count).padStart(2, "0")}</div>
          <div style={{ fontFamily: mono, fontSize: 26, letterSpacing: "0.3em", color: C.dim }}>BUREAU · DAY ONE</div>
        </div>

        {/* phase 2: live tile */}
        <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 26, opacity: phase2, translate: `0px ${(1 - phase2) * 40}px` }}>
          <div style={{
            width: 160, height: 160, borderRadius: 36, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(160deg,#ffffff,#cfe3ff 55%,#7fb2ff)", boxShadow: `0 0 ${60 + 30 * Math.sin(frame / 10)}px rgba(127,178,255,.55)`,
          }}>
            <Mark size={96} color="#02040a" />
          </div>
          <div style={{ fontSize: 50, color: C.ice }}>BUREAU is live on</div>
          <div style={{ fontSize: 84, fontWeight: 700, color: C.blue2, letterSpacing: "-0.02em" }}>Solana devnet</div>
          <div style={{ fontFamily: mono, fontSize: 28, letterSpacing: "0.26em", color: C.dim, opacity: interpolate(frame, [215, 240], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>MAINNET NEXT</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
