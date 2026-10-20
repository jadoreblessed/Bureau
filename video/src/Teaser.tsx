import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop, C, Mark, display, mono } from "./brand";

// Teaser: blurred screens of the product drift behind one line, then "SOON".
// 8s at 30fps.

const SHOTS = [
  { src: "shots/hero.png", x: -120, y: 120, w: 980, rot: -6, speed: 0.55 },
  { src: "shots/agents.png", x: 1040, y: 60, w: 900, rot: 5, speed: -0.45 },
  { src: "shots/launch.png", x: 520, y: 640, w: 860, rot: -3, speed: 0.4 },
  { src: "shots/explore.png", x: 1260, y: 620, w: 760, rot: 7, speed: -0.6 },
  { src: "shots/kinds.png", x: -60, y: 700, w: 720, rot: 4, speed: 0.5 },
];

const Line: React.FC<{ text: string; from: number; to: number; size: number; spacing?: string; family?: string }> = ({ text, from, to, size, spacing = "-0.02em", family = display }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  const exit = interpolate(frame, [to - 12, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ display: "flex", gap: size * 0.28, justifyContent: "center", flexWrap: "wrap", fontFamily: family, fontSize: size, fontWeight: 700, letterSpacing: spacing, opacity: exit, filter: `blur(${(1 - exit) * 12}px)` }}>
      {words.map((w, i) => {
        const s = from + i * 5;
        return (
          <span key={i} style={{
            opacity: interpolate(frame, [s, s + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            filter: `blur(${interpolate(frame, [s, s + 14], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
            translate: interpolate(frame, [s, s + 14], ["0px 24px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) }),
          }}>{w}</span>
        );
      })}
    </div>
  );
};

export const Teaser: React.FC = () => {
  const frame = useCurrentFrame();
  const soon = interpolate(frame, [150, 175], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill style={{ color: C.ink, background: C.bg }}>
      <Backdrop seed="teaser" count={160} bloom="rgba(61,123,255,.14)" />
      {SHOTS.map((s, i) => (
        <Img key={s.src} src={staticFile(s.src)} style={{
          position: "absolute", left: s.x + frame * s.speed, top: s.y - frame * s.speed * 0.3, width: s.w,
          rotate: `${s.rot}deg`, borderRadius: 18, border: `1px solid ${C.line}`,
          filter: `blur(${interpolate(frame, [0, 120, 240], [6, 9, 14])}px) brightness(.55)`,
          opacity: interpolate(frame, [i * 6, i * 6 + 30], [0, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          boxShadow: "0 40px 120px rgba(0,0,0,.6)",
        }} />
      ))}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 55% 40% at 50% 50%, rgba(2,4,10,.82), rgba(2,4,10,.25) 75%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 160px" }}>
        <Line text="Every coin gets its own agent." from={12} to={150} size={104} />
        <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 34, opacity: soon, scale: interpolate(soon, [0, 1], [1.12, 1]) }}>
          <Mark size={96} color={C.ice} />
          <div style={{ fontFamily: display, fontSize: 220, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1 }}>SOON</div>
          <div style={{ fontFamily: mono, fontSize: 30, letterSpacing: "0.3em", color: C.blue2 }}>BUREAU · MAINNET</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
