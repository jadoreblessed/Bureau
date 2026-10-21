import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { EndCard } from "./EndCard";
import { RingScene } from "./RingScene";
import { WordsScene } from "./WordsScene";

// Launch announcement: ring of agents → "live on Solana" → four beats → logo.
export const Launch: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence name="Ring" durationInFrames={300}>
      <RingScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
    <TransitionSeries.Sequence name="Words" durationInFrames={180}>
      <WordsScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
    <TransitionSeries.Sequence name="End" durationInFrames={120}>
      <EndCard />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
