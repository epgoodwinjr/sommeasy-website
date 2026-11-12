"use client";

// /motion-specimen — every motion primitive, playing over sample content
// (docs/motion/README.md, Session 1). Not linked from anywhere. It exists so
// the foundations can be seen on the preview deploy before any real page
// uses them, and so e2e/motion.spec.ts has something real to drive.
// DELETE IT WITH THE LAST SESSION, the way /house-specimen went: nothing
// here ships to main.
//
// All sample content: the wines, the note and the palate are the motion
// study's ("The Stellenbosch Loyalist"), not anyone's data.

import { useState } from "react";
import SavedStep from "@/app/log/SavedStep";
import GrowthMoment from "@/components/GrowthMoment";
import PalateMark from "@/components/PalateMark";
import PalateMarkLive from "@/components/PalateMarkLive";
import RatingTiles, { DoneLine, usePressHold } from "@/components/house/RatingTiles";
import Divider from "@/components/house/Divider";
import Enter from "@/components/house/Enter";
import LeaderEntry from "@/components/house/LeaderEntry";
import RunningHead from "@/components/house/RunningHead";
import SectionHead from "@/components/house/SectionHead";
import SettingRow, { FactRow } from "@/components/house/SettingRow";
import TextAction, { TextActions } from "@/components/house/TextAction";
import WineRow from "@/components/house/WineRow";
import WriteIn from "@/components/house/WriteIn";
import useReducedMotion from "@/components/house/useReducedMotion";
import useStagger from "@/components/house/useStagger";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, TYPE, ink } from "@/components/house/tokens";
import { numeralCounter } from "@/lib/numerals";
import { growthOf } from "@/lib/growthMoment";
import { ratedDoneLine, savedCopy } from "@/lib/houseCopy";

const GENOME = { seed: 20260730, world: 0.62, color: 0.6, focus: 0.5, depth: 0.5, spread: 0.55, range: 0.6 };
// Each shape has its own seed, as production's do: the identity engine
// derives the seed from the DNA's contents, so every promotion re-deals the
// ring's phase, the bloom's phase and the fruit (README §14).
const SHAPES = [
  { id: "base", label: "As it was", genome: GENOME },
  { id: "region", label: "A region", genome: { ...GENOME, spread: 0.85, seed: 418201733 } },
  { id: "estate", label: "An estate", genome: { ...GENOME, depth: 0.5 + 1 / 6, seed: 1903486215 } },
  { id: "country", label: "A country", genome: { ...GENOME, focus: 0.75, seed: 2750139408 } },
];

// The saved step's two paths (§8.4), over the study's sample bottle. The
// words are houseCopy's and the moment is growthOf's — as Log computes them.
const BOTTLE = { name: "Ken Forrester The FMC Chenin Blanc 2021", meta: "Stellenbosch · Chenin Blanc" };
const PROMOTED = [{ displayName: "Ken Forrester", dimension: "estate" }];
const SAVED_STEPS = {
  grown: {
    ...BOTTLE, rating: "loved", genomeBefore: GENOME, genome: SHAPES[2].genome,
    moment: growthOf({ promotions: PROMOTED }),
    copy: savedCopy({ rating: "loved", promotions: PROMOTED }),
  },
  quiet: {
    ...BOTTLE, rating: "liked", genomeBefore: GENOME, genome: GENOME,
    moment: growthOf({}),
    copy: savedCopy({ rating: "liked" }),
  },
};

const HEADLINE = "Never guess at a wine list again.";
const NOTE = "Old-vine Chenin with real grip — the one to pour with the line fish. It has the waxy weight you keep coming back to, and enough salt on the finish to stand up to the lemon.";
const WINES = [
  { name: "Raats Original Chenin Blanc", vintage: "2022", meta: "Stellenbosch · Chenin Blanc" },
  { name: "Kanonkop Kadette Pinotage", mark: "❤️", meta: "Stellenbosch · Pinotage" },
  { name: "Hamilton Russell Chardonnay", action: "Log it ›", meta: "Hemel-en-Aarde · Chardonnay" },
];

const caption = { ...TYPE.meta, margin: "26px 0 10px" };
const stage = { display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" };

function Ink() {
  const next = useStagger(900);
  const numeral = numeralCounter();
  const [taps, setTaps] = useState(0);
  return (
    <>
      <WriteIn as="h1" text={HEADLINE} delay={150} step={70} duration={600} awaitFonts
        data-testid="specimen-headline"
        style={{ ...TYPE.h1, fontSize: "36px", lineHeight: 1.08, textWrap: "balance" }} />
      <Enter delay={650} style={{ ...TYPE.sub, fontSize: "16px", marginTop: 12 }} data-testid="specimen-rise">
        Tell us what you like. We’ll find it on the menu.
      </Enter>

      <LeaderEntry label="Build your palate" mark="→" tone="filled" sub={`Takes about two minutes. Tapped ${taps}×.`}
        onClick={() => setTaps((n) => n + 1)} enterDelay={850} testId="specimen-entry" style={{ marginTop: 28 }} />

      <Divider enterDelay={1500} style={{ margin: "30px 0 4px" }} />

      <SectionHead numeral={numeral()} label="Rows, one after another" enterDelay={1650} style={{ margin: "22px 0 2px" }} />
      <div data-testid="specimen-rows">
        {WINES.map((wine) => (
          <WineRow key={wine.name} {...wine} enterDelay={next() + 950} />
        ))}
      </div>

      <SectionHead numeral={numeral()} label="Settings and facts" enterDelay={3100} style={{ margin: "30px 0 2px" }} />
      <SettingRow label="Usual spend" value="$40 – $90" onClick={() => {}} enterDelay={3250} />
      <FactRow label="Region" value="Stellenbosch, South Africa" enterDelay={3380} />
      <LeaderEntry label="See it in your palate" secondary onClick={() => {}} enterDelay={3600} style={{ marginTop: 22 }} />

      <SectionHead numeral={numeral()} label="The Somm, written in" enterDelay={3900} style={{ margin: "30px 0 12px" }} />
      <WriteIn as="p" text={NOTE} delay={4050} step={26} data-testid="specimen-note"
        style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", lineHeight: 1.6, color: ink(0.8) }} />
      <div style={{ display: "flex", gap: 26, marginTop: 20, alignItems: "center" }}>
        <Enter kind="pop" delay={4400} as="span" data-testid="specimen-pop" style={{ fontSize: "22px", lineHeight: 1 }}>🏆</Enter>
        <Enter kind="fade" delay={4400} as="span" data-testid="specimen-fade" style={{ ...TYPE.eyebrow }}>Top pick</Enter>
      </div>
    </>
  );
}

function Bloom() {
  const [saved, setSaved] = useState(false);
  const [shape, setShape] = useState("base");
  const [breathing, setBreathing] = useState(false);
  // On, the way GrowthMoment will have it (Session 4); off is the default
  const [celebrate, setCelebrate] = useState(true);
  const [drawn, setDrawn] = useState("waiting");
  const genome = SHAPES.find((s) => s.id === shape).genome;
  return (
    <>
      <p style={caption}>The reveal — a medallion waits, then draws once the save lands</p>
      <div style={stage}>
        <span data-testid="specimen-reveal">
          <PalateMarkLive genome={GENOME} size={176} reveal ready={saved}
            onDrawStart={() => setDrawn("drawing")} onSettled={() => setDrawn("settled")} />
        </span>
        <span data-testid="specimen-static"><PalateMark genome={GENOME} size={176} /></span>
        <span data-testid="specimen-reveal-state" style={{ ...TYPE.meta }}>{drawn}</span>
      </div>
      <TextActions style={{ marginTop: 12 }}>
        <TextAction onClick={() => setSaved(true)} testId="specimen-save">The save lands</TextAction>
      </TextActions>

      <p style={caption}>
        Growth — the same bloom, from one shape to the next (164px), each under a new seed: the ring turns
        the short way, the petals shift by less than half a sector, the fruit lifts and lands again. {celebrate
          ? "Celebrated, as a promotion is: a swell, a pulse, and the new berry landing last with its ripples — never for a smaller shape."
          : "Quiet, as the quiz’s bloom grows: the shapes change and nothing else plays."}
      </p>
      <div style={stage}>
        <span data-testid="specimen-grow">
          <PalateMarkLive genome={genome} size={164} breathing={breathing} celebrate={celebrate} />
        </span>
        <span data-testid="specimen-grow-static"><PalateMark genome={genome} size={164} /></span>
      </div>
      <TextActions style={{ marginTop: 12 }}>
        {SHAPES.map((s) => (
          <TextAction key={s.id} onClick={() => setShape(s.id)} testId={`specimen-shape-${s.id}`}
            tone={s.id === shape ? "secondary" : "primary"}>{s.label}</TextAction>
        ))}
        <TextAction onClick={() => setBreathing((b) => !b)} testId="specimen-breathe">
          {breathing ? "Stop breathing" : "Breathe"}
        </TextAction>
        <TextAction onClick={() => setCelebrate((c) => !c)} testId="specimen-celebrate">
          {celebrate ? "Grow quietly" : "Celebrate"}
        </TextAction>
      </TextActions>

      <p style={caption}>A promotion on arrival — the old shape, then grown 700ms later</p>
      <div style={stage}>
        <span data-testid="specimen-promotion">
          <GrowthMoment genome={SHAPES[2].genome} from={GENOME} moment={growthOf({ promotions: PROMOTED })} size={164} />
        </span>
        <span data-testid="specimen-promotion-static"><PalateMark genome={SHAPES[2].genome} size={164} /></span>
      </div>
    </>
  );
}

// Session 4 — the rewards (§8.4): a tile answering its tap, the done line
// written in, and Log's saved step on both of its paths
function Rewards() {
  const [rating, setRating] = useState(null);
  const [held, press] = usePressHold();
  const [step, setStep] = useState(null); // { kind, run }
  const play = (kind) => setStep((now) => ({ kind, run: (now?.run || 0) + 1 }));
  return (
    <>
      <p style={caption}>A rating tile answers its tap — it presses, the others step back, then the done line is written</p>
      <div data-testid="specimen-tiles">
        {(!rating || held) && (
          <RatingTiles variant="verdict" rated={held} onRate={(r) => { press(r); setRating(r); }} />
        )}
        {rating && !held && <DoneLine autoFocus>{ratedDoneLine(rating)}</DoneLine>}
      </div>
      <TextActions style={{ marginTop: 8 }}>
        <TextAction onClick={() => setRating(null)} testId="specimen-tiles-reset">Rate again</TextAction>
      </TextActions>

      <p style={caption}>Log a bottle’s saved step — the big moment (a promotion), and the quiet path</p>
      <TextActions>
        <TextAction onClick={() => play("grown")} testId="specimen-saved-play-grown">A promotion lands</TextAction>
        <TextAction onClick={() => play("quiet")} testId="specimen-saved-play-quiet">The quiet path</TextAction>
      </TextActions>
      <div data-testid="specimen-saved" style={{ marginTop: 12 }}>
        {step && <SavedStep key={step.run} saved={SAVED_STEPS[step.kind]} onLogAnother={() => setStep(null)} />}
      </div>
      {/* What the saved step's bloom starts as and ends as, at rest */}
      <div style={{ ...stage, marginTop: 16 }}>
        <span data-testid="specimen-saved-before"><PalateMark genome={SAVED_STEPS.grown.genomeBefore} size={164} /></span>
        <span data-testid="specimen-saved-after"><PalateMark genome={SAVED_STEPS.grown.genome} size={164} /></span>
        <span data-testid="specimen-saved-quiet-mark"><PalateMark genome={SAVED_STEPS.quiet.genome} size={132} /></span>
      </div>
    </>
  );
}

export default function MotionSpecimen() {
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();
  return (
    <div>
      <RunningHead title="Motion specimen" />
      <main style={{ maxWidth: COLUMN, margin: "0 auto", padding: `22px ${GUTTER}px 72px` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 22 }}>
          <span style={{ ...TYPE.eyebrow }}>Motion specimen · Sessions 1–4</span>
          <button type="button" data-testid="specimen-replay" onClick={() => setRun((n) => n + 1)} style={{
            minHeight: 40, padding: "0 4px", border: "none", background: "none", cursor: "pointer",
            fontFamily: SANS, fontSize: "13px", fontWeight: 700, color: BURGUNDY,
          }}>Replay ↻</button>
        </div>
        <p data-testid="specimen-preference" style={{
          fontFamily: SANS, fontSize: "13px", lineHeight: 1.5, color: INK, opacity: 0.55, marginBottom: 26,
        }}>
          {reduced
            ? "Reduced motion is on: every entrance is a short fade and the bloom is already settled."
            : "Motion is on. Sample content throughout — nothing here is anyone’s data."}
        </p>

        {/* A new key remounts everything below: entrances play once per mount */}
        <div key={run}>
          <Ink />
          <Divider style={{ margin: "40px 0 6px" }} />
          <Bloom />
          <Divider style={{ margin: "40px 0 6px" }} />
          <Rewards />
        </div>
      </main>
    </div>
  );
}
