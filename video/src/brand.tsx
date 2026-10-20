import { loadFont as loadDisplay } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";

// BUREAU brand for video: the site's ice-blue palette and type.
export const display = loadDisplay("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

export const C = {
  bg: "#02040a",
  ink: "#ffffff",
  ice: "#cfe3ff",
  blue: "#3d7bff",
  blue2: "#7fb2ff",
  dim: "#5d6676",
  line: "rgba(127,178,255,.16)",
};

export const ease = [0.16, 1, 0.3, 1] as const;

/** The BUREAU globe mark (same drawing as the site's logo). */
export const Mark: React.FC<{ size: number; color?: string }> = ({ size, color = C.ink }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={color}>
    <circle cx="16" cy="16" r="13.5" strokeWidth="2" />
    <ellipse cx="16" cy="16" rx="5.5" ry="13.5" strokeWidth="1.6" />
    <ellipse cx="16" cy="16" rx="10.5" ry="13.5" strokeWidth="1.1" opacity=".55" />
    <path d="M3.4 11h25.2M3.4 21h25.2" strokeWidth="1.4" />
    <path d="M2.5 16h27" strokeWidth="1.1" opacity=".55" />
    <circle cx="22.6" cy="8.6" r="2.4" fill={color} stroke="none" />
  </svg>
);

/** Deep background: a blue bloom plus slowly drifting particle dust, like the site's orb. */
export const Backdrop: React.FC<{ count?: number; bloom?: string; seed?: string }> = ({ count = 260, bloom = "rgba(61,123,255,.22)", seed = "dust" }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 55% at 50% 45%, ${bloom}, transparent 70%)` }} />
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: count }, (_, i) => {
          const x0 = random(`${seed}x${i}`) * width;
          const y0 = random(`${seed}y${i}`) * height;
          const speed = 0.15 + random(`${seed}s${i}`) * 0.5;
          const r = 0.6 + random(`${seed}r${i}`) * 1.8;
          const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame / 18 + i));
          const y = (y0 - frame * speed + height) % height;
          return <circle key={i} cx={x0 + Math.sin((frame + i * 20) / 60) * 6} cy={y} r={r} fill={i % 5 === 0 ? C.ice : C.blue2} opacity={0.12 + 0.5 * tw * random(`${seed}o${i}`)} />;
        })}
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.75))" }} />
    </AbsoluteFill>
  );
};

/** Fade + rise in, used for most text. */
export const rise = (frame: number, start: number, dur = 18) => ({
  opacity: interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  translate: interpolate(frame, [start, start + dur], ["0px 28px", "0px 0px"], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
});
