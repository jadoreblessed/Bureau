import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, C, Mark, display, mono } from "./brand";

// Logo end card. 4s at 30fps.
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const inn = interpolate(frame, [0, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill style={{ color: C.ink, fontFamily: display }}>
      <Backdrop seed="end" count={200} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
        <div style={{ opacity: inn, scale: interpolate(inn, [0, 1], [0.8, 1]), rotate: `${interpolate(frame, [0, 120], [-8, 0])}deg` }}>
          <Mark size={170} color={C.ice} />
        </div>
        <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: "0.06em", opacity: inn, translate: `0px ${(1 - inn) * 30}px` }}>BUREAU</div>
        <div style={{ fontFamily: mono, fontSize: 30, letterSpacing: "0.3em", color: C.blue2, opacity: interpolate(frame, [18, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          EVERY COIN GETS ITS OWN AGENT
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
