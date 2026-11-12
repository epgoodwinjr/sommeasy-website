"use client";

// SavedStep — Log a bottle's last step (The House List §8.2; in motion since
// docs/motion/README.md §8.4, big moment 2).
//
// Presentation only: LogBottle hands it what the save found and it sets the
// screen — so /motion-specimen can play the very same step over sample
// content. `saved` is { name, rating, meta, genome, genomeBefore, moment,
// copy }: `moment` is growthOf()'s reading of the engine result and `copy`
// is houseCopy's savedCopy(); none of the words are decided here.
//
//   A promotion or a shift (moment.grow) — the big moment: the bloom rises
//   in at 164px in its OLD shape and grows into the new one; the eyebrow,
//   the headline and the reason are written in while it does; then the
//   bottle is entered and the three ways on follow.
//
//   Anything else — the quiet path: the bloom stands settled at 132px, and
//   the same lines arrive sooner. It should feel finished, not smaller.
//
// Every timing is SAVED's (motion.js), counted from this step's arrival.
// Under reduced motion everything is simply there, and the bloom is already
// in its new shape.

import { ratingFor } from "@/lib/ratings";
import { metaLine } from "@/lib/houseCopy";
import GrowthMoment from "@/components/GrowthMoment";
import Enter from "@/components/house/Enter";
import LeaderEntry from "@/components/house/LeaderEntry";
import RuleDraw from "@/components/house/RuleDraw";
import WineRow from "@/components/house/WineRow";
import WriteIn from "@/components/house/WriteIn";
import useStagger from "@/components/house/useStagger";
import { GROWTH, ROW_STEP, SAVED } from "@/components/house/motion";
import { BURGUNDY, INK, SERIF, TYPE, ink } from "@/components/house/tokens";

const headline = {
  fontFamily: SERIF, fontSize: "27px", fontWeight: 700, lineHeight: 1.15,
  letterSpacing: "-0.01em", color: INK, marginTop: 10, textWrap: "balance",
};
const reason = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.55,
  color: ink(0.7), marginTop: 10, textWrap: "pretty",
};
const alsoMoved = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5, color: BURGUNDY, marginTop: 12,
};
const rule = { display: "block", height: 1, background: ink(0.1) };

export default function SavedStep({ saved, onLogAnother }) {
  const grown = Boolean(saved.moment?.grow);
  const at = grown ? SAVED.grown : SAVED.quiet;
  const rated = ratingFor(saved.rating);
  const way = useStagger(at.ways);
  const lines = saved.copy.lines || [];
  return (
    <div data-testid="log-saved" data-moment={grown ? "grown" : "quiet"}>
      <div style={{ textAlign: "center", paddingTop: 18 }}>
        <Enter duration={GROWTH.riseMs} style={{ display: "flex", justifyContent: "center" }}>
          <GrowthMoment genome={saved.genome} from={saved.genomeBefore} moment={saved.moment} size={at.size} />
        </Enter>
        <Enter kind="fade" delay={at.eyebrow} style={{ ...TYPE.eyebrow, marginTop: 22 }}>{saved.copy.eyebrow}</Enter>
        <WriteIn
          as="h1" text={saved.copy.headline} delay={at.headline}
          step={SAVED.headlineStep} duration={SAVED.headlineMs} style={headline}
        />
        {saved.copy.sub && (
          <WriteIn as="p" text={saved.copy.sub} delay={at.sub} step={SAVED.subStep} style={reason} />
        )}
      </div>
      <div style={{ marginTop: 26 }}>
        <RuleDraw as="div" enterDelay={at.rule} style={rule} />
        <div style={{ padding: "16px 0" }}>
          <WineRow
            name={saved.name} mark={rated?.emoji} meta={metaLine(saved.meta, "Today")}
            enterDelay={at.row} style={{ padding: 0, borderBottom: "none" }}
          />
        </div>
        <RuleDraw as="div" enterDelay={at.rule + SAVED.ruleGap} style={rule} />
      </div>
      {lines.map((line, i) => (
        <Enter key={line} as="p" kind="fade" delay={at.row + SAVED.linesAfter + i * ROW_STEP} style={alsoMoved}>{line}</Enter>
      ))}
      <LeaderEntry secondary label="See it in your palate" href="/palate" enterDelay={way()} style={{ marginTop: 28 }} />
      <LeaderEntry secondary label="Log another bottle" onClick={onLogAnother} enterDelay={way()} style={{ marginTop: 22 }} />
      <LeaderEntry secondary label="Back to your list" href="/" enterDelay={way()} style={{ marginTop: 22 }} />
    </div>
  );
}
