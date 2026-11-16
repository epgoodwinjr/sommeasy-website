"use client";

// /marks-specimen — every House & Hand mark and primitive, over sample
// content (docs/marks/README.md, Session 1). Not linked from anywhere. It
// exists so the foundations can be seen on the preview deploy before any
// real page uses them, and so e2e/marks.spec.ts has something real to
// drive. DELETE IT IN SESSION 3, the way /motion-specimen went: nothing
// here ships to main.
//
// All sample content: the wines are the design reference's, not anyone's
// data. The rating words come from RATINGS, never a local copy.

import { useEffect, useState } from "react";
import Mark from "@/components/house/Mark";
import NameGesture from "@/components/house/NameGesture";
import PencilGlass from "@/components/house/PencilGlass";
import SectionHead from "@/components/house/SectionHead";
import TextAction, { TextActions } from "@/components/house/TextAction";
import { PRESS, PRESS_KEYFRAMES, prefersReducedMotion } from "@/components/house/motion";
import { RATING_MARKS } from "@/components/house/marks";
import { usePressHold } from "@/components/house/RatingTiles";
import {
  BURGUNDY, COLUMN, CREAM, GRADIENT, GUTTER, INK, SANS, SERIF, TYPE, ink,
} from "@/components/house/tokens";
import { numeralCounter } from "@/lib/numerals";
import { savedCopy } from "@/lib/houseCopy";
import SavedStep from "@/app/log/SavedStep";
import { RATINGS } from "@/lib/ratings";

const TOOLS = [
  { id: "list", says: "Match the wine list" },
  { id: "camera", says: "Photograph the list" },
  { id: "bottle", says: "Log a bottle" },
  { id: "picture", says: "Upload a picture" },
  { id: "link", says: "Paste a link" },
  { id: "loupe", says: "Search by name" },
];
const PENCILLED = [
  { id: "star", says: "Want to try" },
  { id: "loop", says: "On the table" },
  { id: "plus", says: "Joined your DNA" },
  { id: "minus", says: "Left your DNA" },
  { id: "arrow", says: "You became…" },
  { id: "dot", says: "Your palate began" },
];
const GLASSES = [
  ...RATINGS.map((r) => ({ id: RATING_MARKS[r.id], rating: r.id, says: r.label })),
  { id: "glass-empty", rating: null, says: "Verdict pending" },
];
const SIZES = [20, 26, 34, 48];

const GESTURE_NAMES = [
  { kind: "circle", name: "Kanonkop Pinotage 2020", says: "Circled: the pick on the table" },
  { kind: "underline", name: "Meerlust Rubicon 2019", says: "Underlined: a bottle you loved" },
  { kind: "strike", name: "Constantia Glen Five", says: "Struck: a bottle you passed on" },
];
const LONG_NAME = "Domaine Huet Le Haut-Lieu Vouvray Sec 2021";
// The loop (README §13.1): circled names that wrap to two, three and four
// lines, a short last line, and a pick's name at a phone's width
const LOOPED = [
  { name: "Kanonkop Paul Sauer", width: 150 },
  { name: "Château de Beaucastel Châteauneuf-du-Pape Rouge 2019", width: 250 },
  { name: LONG_NAME, width: 130 },
  { name: "Hamilton Russell Vineyards Chardonnay, Hemel-en-Aarde Valley 2022", width: 303, size: "21px" },
];

const page = { maxWidth: COLUMN, margin: "0 auto", padding: `40px ${GUTTER}px 80px`, color: INK };
const caption = { ...TYPE.meta, margin: "8px 0 0" };
const grid = { display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-end" };
const cell = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 64 };
const said = { fontFamily: SANS, fontSize: "12px", lineHeight: 1.35, color: INK, opacity: 0.6, textAlign: "center" };
const nameStyle = { fontFamily: SERIF, fontSize: "19px", fontWeight: 600, lineHeight: 1.25, margin: 0 };

function circleOf(tone) {
  return {
    width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    ...(tone === "filled"
      ? { background: GRADIENT, color: CREAM }
      : { border: "1.5px solid rgba(139,35,50,0.3)", background: "rgba(139,35,50,0.04)", color: BURGUNDY }),
  };
}

function Printed() {
  return (
    <>
      <div style={grid}>
        {TOOLS.map((t) => (
          <div key={t.id} style={cell} data-testid={`specimen-mark-${t.id}`}>
            <Mark id={t.id} size={26} />
            <span style={said}>{t.says}</span>
          </div>
        ))}
      </div>
      <p style={caption}>Ink on cream, 26px</p>
      <div style={{ ...grid, marginTop: 18 }}>
        {TOOLS.map((t) => (
          <div key={t.id} style={cell}>
            <span style={circleOf("filled")}><Mark id={t.id} size={24} /></span>
            <span style={circleOf("outline")}><Mark id={t.id} size={24} /></span>
          </div>
        ))}
      </div>
      <p style={caption}>Cream in a filled circle, burgundy in an outline one</p>
    </>
  );
}

function Pencil() {
  return (
    <>
      <div style={grid}>
        {PENCILLED.map((m) => (
          <div key={m.id} style={cell} data-testid={`specimen-mark-${m.id}`}>
            <Mark id={m.id} size={26} />
            <span style={said}>{m.says}</span>
          </div>
        ))}
      </div>
      <p style={caption}>Only ever the user’s</p>
      <div data-testid="specimen-unknown-mark" style={{ display: "none" }}>
        <Mark id="nonsense" />
        <Mark id="toString" />
      </div>
    </>
  );
}

function Glasses() {
  return (
    <>
      {SIZES.map((size) => (
        <div key={size} style={{ ...grid, marginTop: size === SIZES[0] ? 0 : 16 }}>
          {GLASSES.map((g) => (
            <div key={g.id} style={cell} data-testid={size === 26 ? `specimen-mark-${g.id}` : undefined}>
              <Mark id={g.id} size={size} />
              {size === SIZES[SIZES.length - 1] && <span style={said}>{g.says}</span>}
            </div>
          ))}
        </div>
      ))}
      <p style={caption}>Mark at 20, 26, 34 and 48px</p>
      <div style={{ ...grid, marginTop: 18 }}>
        {GLASSES.filter((g) => g.rating).map((g) => (
          <div key={g.id} style={cell} data-testid={`specimen-glass-${g.rating}`}>
            <PencilGlass rating={g.rating} size={26} />
          </div>
        ))}
      </div>
      <p style={caption}>PencilGlass, settled — the same markup as Mark</p>
    </>
  );
}

function Tile({ rating, onRate, chosen, aside, disabled }) {
  return (
    <button
      type="button" aria-label={rating.label} title={rating.label} data-testid={`specimen-tile-${rating.id}`}
      disabled={disabled || chosen || aside}
      onClick={(e) => {
        const el = e.currentTarget;
        if (typeof el.animate === "function" && !prefersReducedMotion()) {
          try { el.animate(PRESS_KEYFRAMES, { duration: PRESS.ms, easing: PRESS.easing }); } catch { /* still rates */ }
        }
        onRate(rating.id);
      }}
      style={{
        width: 46, height: 46, flexShrink: 0, padding: 0, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center", color: INK,
        border: `1px solid ${chosen ? "rgba(139,35,50,0.45)" : ink(0.12)}`,
        background: chosen ? "rgba(139,35,50,0.09)" : "rgba(255,255,255,0.5)",
        opacity: aside ? PRESS.rest : 1, cursor: chosen || aside ? "default" : "pointer",
        transition: aside ? `opacity ${PRESS.restMs}ms ease` : "all 0.15s ease",
      }}
    >
      <PencilGlass rating={rating.id} size={30} guide draw={chosen ? "tile" : false} />
    </button>
  );
}

function Rating() {
  const [rated, setRated] = useState(null);
  const [held, press] = usePressHold();
  const [keep, setKeep] = useState(false);
  const showTiles = !rated || held || keep;
  const rate = (id) => {
    setRated(id);
    press(id);
  };
  const label = RATINGS.find((r) => r.id === rated)?.label;
  return (
    <>
      <p style={{ ...nameStyle, fontSize: "21px" }}>Kanonkop Kadette Cape Blend</p>
      {showTiles ? (
        <div role="group" aria-label="How was it?" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <span style={{ marginRight: "auto", fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", opacity: 0.75 }}>
            How was it?
          </span>
          {RATINGS.map((r) => (
            <Tile
              key={r.id} rating={r} onRate={rate}
              chosen={Boolean(rated) && (held || keep) ? rated === r.id : false}
              aside={Boolean(rated) && (held || keep) && rated !== r.id}
            />
          ))}
        </div>
      ) : (
        <p data-testid="specimen-done" style={{
          display: "flex", alignItems: "center", gap: 8, margin: "12px 0 0",
          fontFamily: SANS, fontSize: "13px", fontWeight: 600, color: BURGUNDY,
        }}>
          <PencilGlass rating={rated} size={22} draw="line" />
          <span>{label} — pencilled into your journal.</span>
        </p>
      )}
      <TextActions style={{ marginTop: 6 }}>
        <TextAction tone="quiet" testId="specimen-rate-again" onClick={() => setRated(null)}>Rate again</TextAction>
        <TextAction tone="quiet" testId="specimen-keep" ariaExpanded={keep} onClick={() => { setKeep((k) => !k); setRated(null); }}>
          {keep ? "Swap in the done line" : "Keep the tile"}
        </TextAction>
      </TextActions>
      <p style={caption}>Tap a glass. The tile pencils it in inside the press hold; the done line, at its own pace.</p>
    </>
  );
}

function Gestures() {
  const [plays, setPlays] = useState(0);
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {GESTURE_NAMES.map((g) => (
          <div key={g.kind}>
            <p style={nameStyle} data-testid={`specimen-gesture-${g.kind}`}>
              <NameGesture key={plays} gesture={g.kind} draw={plays > 0}>{g.name}</NameGesture>
            </p>
            <p style={{ ...said, textAlign: "left", marginTop: 4 }}>{g.says}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 26 }}>
        {GESTURE_NAMES.map((g) => (
          <p key={g.kind} style={{ ...nameStyle, width: 190 }} data-testid={`specimen-wrapped-${g.kind}`}>
            <NameGesture key={plays} gesture={g.kind} draw={plays > 0}>{LONG_NAME}</NameGesture>
          </p>
        ))}
      </div>
      <p style={caption}>A name that wraps: underlined and struck on its last line, circled whole</p>
      <div style={{ display: "flex", gap: "28px 30px", flexWrap: "wrap", alignItems: "flex-start", marginTop: 30 }}>
        {LOOPED.map((l, i) => (
          <p key={l.name + l.width} style={{ ...nameStyle, width: l.width, fontSize: l.size || nameStyle.fontSize }} data-testid={`specimen-loop-${i}`}>
            <NameGesture key={plays} gesture="circle" draw={plays > 0}>{l.name}</NameGesture>
          </p>
        ))}
      </div>
      <p style={caption}>The loop: round a wrapped name the circle keeps one corner radius, however tall the name is</p>
      <TextActions style={{ marginTop: 6 }}>
        <TextAction testId="specimen-pencil-again" onClick={() => setPlays((n) => n + 1)}>Pencil them in</TextAction>
      </TextActions>
    </>
  );
}

// Log's saved step on a promotion with no shift — the one path a test
// account can't reach on demand (Session 2): the eyebrow in plain small
// caps, the news underlined once the headline is written, a second
// promotion and a demotion as pencilled lines. Sample content; no bloom.
const MOMENT = {
  name: "Meerlust Rubicon 2019", rating: "loved", meta: "Stellenbosch · Bordeaux blend",
  genome: null, genomeBefore: null, moment: null,
  copy: savedCopy({
    rating: "loved",
    promotions: [{ displayName: "Meerlust", dimension: "estate" }, { displayName: "Stellenbosch", dimension: "region" }],
    demotions: [{ displayName: "Merlot" }],
  }),
};

function Moment() {
  const [plays, setPlays] = useState(0);
  return (
    <>
      <div data-testid="specimen-moment">
        <SavedStep key={plays} saved={MOMENT} onLogAnother={() => setPlays((n) => n + 1)} />
      </div>
      <p style={caption}>Log’s saved step when something joins your DNA. “Log another bottle” plays it again.</p>
    </>
  );
}

export default function MarksSpecimen() {
  // Hydrated: e2e/marks.spec.ts waits for this before it taps
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const numeral = numeralCounter();
  const head = { margin: "34px 0 16px" };
  return (
    <main data-ready={ready ? "" : undefined} style={{ background: CREAM, minHeight: "100vh" }}>
      <div style={page}>
        <h1 style={TYPE.h1}>House &amp; Hand</h1>
        <p style={{ ...TYPE.sub, marginTop: 8 }}>
          The house prints; you pencil. Every mark and primitive for the preview, over sample content.
        </p>
        <SectionHead numeral={numeral()} label="The house prints" style={head} />
        <Printed />
        <SectionHead numeral={numeral()} label="You pencil" style={head} />
        <Pencil />
        <SectionHead numeral={numeral()} label="The glass" style={head} />
        <Glasses />
        <SectionHead numeral={numeral()} label="Pencilled in" style={head} />
        <Rating />
        <SectionHead numeral={numeral()} label="Over a name" style={head} />
        <div data-testid="specimen-gestures"><Gestures /></div>
        <SectionHead numeral={numeral()} label="The big moment" style={head} />
        <Moment />
      </div>
    </main>
  );
}
