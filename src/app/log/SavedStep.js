"use client";

// SavedStep — Log a bottle's last step (The House List §8.2; in motion since
// docs/motion/README.md §8.4, big moment 2).
//
// Presentation only: LogBottle hands it what the save found and it sets the
// screen. `saved` is { name, rating, meta, genome, genomeBefore, moment,
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
//
// The pencil (House & Hand §8.1–§8.2). On the quiet path the eyebrow IS the
// rating, and its glass is pencilled in as the eyebrow arrives — this is
// where a logged bottle's shading is drawn, once (`copy.glass`). A moment's
// eyebrow is plain small caps: the bloom is the picture. Once the headline
// is written, the pencil underlines the news in it — what just joined the
// DNA (`copy.emphasis`). The lines under the recap wear a proofreader's
// plus or minus. The entered bottle wears its glass, settled.

import { useState } from "react";
import { ratingFor } from "@/lib/ratings";
import { metaLine } from "@/lib/houseCopy";
import GrowthMoment from "@/components/GrowthMoment";
import Enter from "@/components/house/Enter";
import LeaderEntry from "@/components/house/LeaderEntry";
import Mark from "@/components/house/Mark";
import NameGesture from "@/components/house/NameGesture";
import PencilGlass from "@/components/house/PencilGlass";
import RuleDraw from "@/components/house/RuleDraw";
import WineRow from "@/components/house/WineRow";
import WriteIn from "@/components/house/WriteIn";
import useStagger from "@/components/house/useStagger";
import { GROWTH, ROW_STEP, SAVED, prefersReducedMotion } from "@/components/house/motion";
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
  display: "flex", alignItems: "flex-start", gap: 8,
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5, color: BURGUNDY, marginTop: 12,
};
const eyebrowLine = { ...TYPE.eyebrow, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 22 };
const rule = { display: "block", height: 1, background: ink(0.1) };

export default function SavedStep({ saved, onLogAnother }) {
  const grown = Boolean(saved.moment?.grow);
  const at = grown ? SAVED.grown : SAVED.quiet;
  const rated = ratingFor(saved.rating);
  const way = useStagger(at.ways);
  const lines = saved.copy.lines || [];
  const { headline: said, emphasis: news } = saved.copy;
  // The news is underlined once the headline is written (at once, when
  // nothing is written in). Only a headline that opens with it is split.
  const emphasis = typeof news === "string" && news && said.startsWith(news) ? news : null;
  const [written, setWritten] = useState(() => prefersReducedMotion());
  return (
    <div data-testid="log-saved" data-moment={grown ? "grown" : "quiet"}>
      <div style={{ textAlign: "center", paddingTop: 18 }}>
        <Enter duration={GROWTH.riseMs} style={{ display: "flex", justifyContent: "center" }}>
          <GrowthMoment genome={saved.genome} from={saved.genomeBefore} moment={saved.moment} size={at.size} />
        </Enter>
        <Enter kind="fade" delay={at.eyebrow} data-testid="saved-eyebrow" style={eyebrowLine}>
          {saved.copy.glass && (
            <PencilGlass rating={saved.copy.glass} size={20} draw="line" delay={at.eyebrow} style={{ flexShrink: 0, color: INK }} />
          )}
          <span>{saved.copy.eyebrow}</span>
        </Enter>
        {emphasis && written ? (
          <h1 style={headline}>
            <NameGesture gesture="underline" draw>{emphasis}</NameGesture>{said.slice(emphasis.length)}
          </h1>
        ) : (
          <WriteIn
            as="h1" text={said} delay={at.headline} onDone={emphasis ? () => setWritten(true) : undefined}
            step={SAVED.headlineStep} duration={SAVED.headlineMs} style={headline}
          />
        )}
        {saved.copy.sub && (
          <WriteIn as="p" text={saved.copy.sub} delay={at.sub} step={SAVED.subStep} style={reason} />
        )}
      </div>
      <div style={{ marginTop: 26 }}>
        <RuleDraw as="div" enterDelay={at.rule} style={rule} />
        <div style={{ padding: "16px 0" }}>
          <WineRow
            name={saved.name} mark={rated?.mark} meta={metaLine(saved.meta, "Today")}
            enterDelay={at.row} style={{ padding: 0, borderBottom: "none" }}
          />
        </div>
        <RuleDraw as="div" enterDelay={at.rule + SAVED.ruleGap} style={rule} />
      </div>
      {lines.map((line, i) => (
        <Enter key={line.text} as="p" kind="fade" delay={at.row + SAVED.linesAfter + i * ROW_STEP} style={alsoMoved}>
          <Mark id={line.mark} size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{line.text}</span>
        </Enter>
      ))}
      <LeaderEntry secondary label="See it in your palate" href="/palate" enterDelay={way()} style={{ marginTop: 28 }} />
      <LeaderEntry secondary label="Log another bottle" onClick={onLogAnother} enterDelay={way()} style={{ marginTop: 22 }} />
      <LeaderEntry secondary label="Back to your list" href="/" enterDelay={way()} style={{ marginTop: 22 }} />
    </div>
  );
}
