import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, C, Mark, display, mono, rise } from "./brand";

// "85% of creator fees go to the agent": a rolling counter and a row of
// 3D bars growing into the locked split. 9s at 30fps.

const DIGIT_H = 210;

/** One odometer column that rolls from 0 to `to`, with a few extra turns for motion. */
const Roll: React.FC<{ to: number; start: number; turns: number }> = ({ to, start, turns }) => {
  const frame = useCurrentFrame();
  const pos = interpolate(frame, [start, start + 70], [0, turns * 10 + to], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  return (
    <div style={{ height: DIGIT_H, overflow: "hidden", display: "inline-block" }}>
      <div style={{ translate: `0px ${-(pos % 10) * DIGIT_H}px` }}>
        {[...Array(11)].map((_, i) => (
          <div key={i} style={{ height: DIGIT_H, lineHeight: `${DIGIT_H}px` }}>{i % 10}</div>
        ))}
      </div>
    </div>
  );
};

const Bar: React.FC<{ i: number; h: number; last: boolean }> = ({ i, h, last }) => {
  const frame = useCurrentFrame();
  const start = 40 + i * 9;
  const grow = interpolate(frame, [start, start + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const height = h * grow;
  const front = last ? "linear-gradient(180deg,#ffffff,#cfe3ff 40%,#7fb2ff)" : "linear-gradient(180deg,#7fb2ff,#3d7bff 55%,#1a3a8f)";
  const glow = last ? interpolate(frame, [start + 30, start + 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  return (
    <div style={{ position: "relative", width: 62, height: 640, display: "flex", alignItems: "flex-end" }}>
      <div style={{ position: "relative", width: 62, height }}>
        {/* front face */}
        <div style={{ position: "absolute", inset: 0, background: front, boxShadow: last ? `0 0 ${60 * glow}px rgba(207,227,255,${0.6 * glow})` : "none" }} />
        {/* side face */}
        <div style={{ position: "absolute", left: 62, bottom: 0, width: 18, height, background: last ? "#9fc3ff" : "#24489e", transformOrigin: "left bottom", transform: "skewY(-40deg)" }} />
        {/* top face */}
        <div style={{ position: "absolute", left: 0, top: -15, width: 62, height: 15, background: last ? "#ffffff" : "#a9c8ff", transformOrigin: "left bottom", transform: "skewX(-50deg)", opacity: grow > 0.02 ? 1 : 0 }} />
      </div>
      {last && (
        <div style={{ position: "absolute", top: 640 - h - 110, left: -20, width: 120, textAlign: "center", fontFamily: display, fontWeight: 700, fontSize: 64, color: C.ice, opacity: glow }}>85%</div>
      )}
    </div>
  );
};

export const FeeSplit: React.FC = () => {
  const frame = useCurrentFrame();
  const heights = [120, 150, 175, 205, 240, 270, 310, 350, 395, 470];
  const out = interpolate(frame, [240, 270], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ fontFamily: display, color: C.ink, opacity: out }}>
      <Backdrop seed="fees" />
      <AbsoluteFill style={{ padding: "100px 140px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, ...rise(frame, 0) }}>
          <Mark size={46} />
          <span style={{ fontFamily: mono, fontSize: 26, letterSpacing: "0.22em", color: C.ice }}>BUREAU</span>
          <span style={{ fontFamily: mono, fontSize: 22, letterSpacing: "0.16em", color: C.dim, marginLeft: 18 }}>· SOLANA</span>
        </div>
        <div style={{ marginTop: 44, fontSize: 84, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.02, maxWidth: 900, ...rise(frame, 8) }}>
          Every coin gets its own agent
        </div>
        <div style={{ marginTop: 36, fontFamily: mono, fontSize: 24, letterSpacing: "0.22em", color: C.blue2, ...rise(frame, 16) }}>CREATOR FEES TO THE AGENT</div>
        <div style={{ display: "flex", alignItems: "flex-start", fontSize: 200, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: `${DIGIT_H}px`, marginTop: 10, ...rise(frame, 18, 12) }}>
          <Roll to={8} start={22} turns={2} />
          <Roll to={5} start={26} turns={3} />
          <span style={{ color: C.blue2 }}>%</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 44, color: C.ice, ...rise(frame, 70) }}>locked on chain at launch</div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 }}>
          {[["Own wallet", "only the signer can open it"], ["Fee split", "admin revoked after launch"], ["Policy engine", "caps on every move"]].map(([k, v], i) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "14px 24px", border: `1px solid ${C.line}`, background: "rgba(4,8,18,.6)", fontSize: 30, ...rise(frame, 90 + i * 10) }}>
              <span>{k}</span><span style={{ fontFamily: mono, fontSize: 24, color: C.blue2 }}>{v}</span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", right: 150, bottom: 150, display: "flex", gap: 22, alignItems: "flex-end" }}>
        {heights.map((h, i) => <Bar key={i} i={i} h={h} last={i === heights.length - 1} />)}
      </div>
    </AbsoluteFill>
  );
};
