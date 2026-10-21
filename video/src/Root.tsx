import { Composition, Folder } from "remotion";
import { EndCard } from "./EndCard";
import { FeeSplit } from "./FeeSplit";
import { Launch } from "./Launch";
import { Registry } from "./Registry";
import { RingScene } from "./RingScene";
import { Teaser } from "./Teaser";
import { WordsScene } from "./WordsScene";

const HD = { width: 1920, height: 1080, fps: 30 } as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="FeeSplit" component={FeeSplit} durationInFrames={270} {...HD} />
    <Composition id="Registry" component={Registry} durationInFrames={540} {...HD} />
    <Composition id="Teaser" component={Teaser} durationInFrames={240} {...HD} />
    {/* 300 + 180 + 120 frames, minus two 15-frame fades */}
    <Composition id="Launch" component={Launch} durationInFrames={570} {...HD} />
    <Folder name="Launch-Scenes">
      <Composition id="Ring" component={RingScene} durationInFrames={300} {...HD} />
      <Composition id="Words" component={WordsScene} durationInFrames={180} {...HD} />
      <Composition id="End" component={EndCard} durationInFrames={120} {...HD} />
    </Folder>
  </>
);
