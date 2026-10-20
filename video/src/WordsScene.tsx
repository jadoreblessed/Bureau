import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, C, display } from "./brand";

// Four beats on a slow blue bloom. 6s at 30fps.

const BEATS = ["Launch a coin.", "Pick its mind.", "Lock its fees.", "Watch it work."];
const BEAT = 45;

export const WordsScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ color: C.ink, fontFamily: display }}>
      <Backdrop seed="words" count={120} bloom={`rgba(61,123,255,${0.18 + 0.08 * Math.sin(frame / 20)})`} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {BEATS.map((t, i) => {
          const s = i * BEAT;
          const isLast = i === BEATS.length - 1;
          const inn = interpolate(frame, [s, s + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
          const outt = isLast ? 1 : interpolate(frame, [s + BEAT - 10, s + BEAT], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={t} style={{
              position: "absolute", fontSize: 120, fontWeight: 700, letterSpacing: "-0.03em",
              opacity: inn * outt, filter: `blur(${(1 - inn) * 16 + (1 - outt) * 10}px)`,
              scale: interpolate(frame, [s, s + BEAT], [1.04, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              color: isLast ? C.ice : C.ink,
            }}>{t}</div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
