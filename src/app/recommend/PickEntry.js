"use client";

// One pick on Your picks (The House List §8.3), set like a list's
// by-the-bottle page:
//
//   I. 🏆 TOP PICK ——————————————————————————————
//   Newton Johnson Chardonnay 2023 ··········· $78
//   HEMEL-EN-AARDE · CHARDONNAY
//   ❤️ LOVED IT IN AUGUST
//   “With the roast chicken, this is the bottle…”
//   🥂 This one’s on the table     Had it? Rate it
//
// Presentation only: the page decides what's chosen, quiet, ratable and
// rated, and owns every write. On the chosen pick the actions become the
// pill; its Change brings the choose buttons back to the quieted picks —
// nothing is un-chosen until another pick is chosen. The role is the
// section's heading (h2), the name the pick's (h3).
//
// The note is the engine's plain reason (`note`, pick-note) until the
// Somm's lands (`sommNote`, somm-note). When it lands over a pick that is
// already on screen, the engine's note fades out and the Somm's is written
// in over it, `sommDelay` after the landing, while the note's box eases to
// its new height (docs/motion/README.md §8.5, decision M8). A pick that
// arrives with the Somm's note simply shows it.
//
// In motion (§8.5): given `enterDelay` (ms), the pick is written in part by
// part — PICKS.pick in motion.js, counted from the pick's own start. That
// is for the picks' arrival only. A pick that joins a list already on
// screen (the Somm chose a different bottle, the terms changed) is handed
// `swapIn` instead and fades in whole, in place; one the Somm didn't keep
// is `going` for a moment first. With none of them, nothing plays.

import { useEffect, useRef } from "react";
import { romanNumeral } from "@/lib/numerals";
import { ratedDoneLine } from "@/lib/houseCopy";
import SectionHead from "@/components/house/SectionHead";
import LeaderDraw from "@/components/house/LeaderDraw";
import RatingTiles, { DoneLine, usePressHold } from "@/components/house/RatingTiles";
import TextAction, { TextActions } from "@/components/house/TextAction";
import WriteIn from "@/components/house/WriteIn";
import useEntrance, { withEntrance } from "@/components/house/useEntrance";
import useRewrite from "@/components/house/useRewrite";
import { PICKS, SOMM } from "@/components/house/motion";
import { BURGUNDY, CREAM, GRADIENT, INK, PILL_SHADOW, SANS, SERIF, TYPE, ink, leader } from "@/components/house/tokens";

const flagStyle = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 700, lineHeight: 1.4, textTransform: "uppercase",
  letterSpacing: "0.14em", color: BURGUNDY, marginTop: 6,
};
const noteStyle = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "14.5px", lineHeight: 1.55, color: ink(0.75), marginTop: 10,
};
// flow-root: the note's margin is inside the height that eases
const noteBox = { display: "flow-root" };

function ChosenPill({ changing, onChange }) {
  const ref = useRef(null);
  // The pill replaces the tapped "This one's on the table" — focus follows
  // it, so keyboard and screen-reader users keep their place (no ring: the
  // pill itself isn't a control)
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return (
    <div ref={ref} tabIndex={-1} data-testid="chosen-banner" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      marginTop: 14, padding: "12px 18px", borderRadius: 100, outline: "none",
      background: GRADIENT, boxShadow: PILL_SHADOW,
    }}>
      <span style={{ fontFamily: SANS, fontSize: "13px", fontWeight: 700, lineHeight: 1.4, color: CREAM }}>
        🥂 On the table tonight
      </span>
      {/* 40px hit area, cancelled by margin so the pill keeps its height */}
      <button type="button" aria-pressed={changing} onClick={onChange} style={{
        padding: "10px 0", margin: "-10px 0", border: "none", background: "none", cursor: "pointer",
        fontFamily: SANS, fontSize: "12px", fontWeight: 600, color: CREAM, opacity: 0.8, whiteSpace: "nowrap",
      }}>Change</button>
    </div>
  );
}

/** The pick's note: the engine's, then the Somm's written in over it. */
function PickNote({ engine, somm, sommDelay, enterDelay }) {
  const text = somm || engine || null;
  const key = somm ? `somm:${somm}` : engine ? `engine:${engine}` : "";
  const { shown, leaving, boxRef, outRef } = useRewrite(key, { text, somm: Boolean(somm) }, { delay: sommDelay });
  const entering = useEntrance(boxRef, "rise", { delay: enterDelay, play: enterDelay != null });
  const note = shown.payload;
  const style = leaving ? { ...noteStyle, opacity: 0 } : noteStyle;
  const testId = note.somm ? "somm-note" : "pick-note";
  return (
    <div ref={boxRef} style={withEntrance(noteBox, entering)}>
      {note.text && (shown.rewritten ? (
        <WriteIn
          key={shown.key} ref={outRef} as="p" data-testid={testId}
          text={`“${note.text}”`} step={SOMM.noteWordStep} style={style}
        />
      ) : (
        <p key={shown.key} ref={outRef} data-testid={testId} style={style}>“{note.text}”</p>
      ))}
    </div>
  );
}

export default function PickEntry({
  index, wine, role, name, vintage, price, meta, flag, note, sommNote = null, sommDelay = 0,
  chosen = false, quiet = false, changing = false, canChoose = false, canRate = false,
  tilesOpen = false, rating = null, onChoose, onOpenRate, onRate, onChange,
  enterDelay, swapIn = false, going = false,
}) {
  // The tapped tile answers before the done line takes the tiles' place
  const [held, press] = usePressHold();
  const rate = (r) => {
    press(r);
    onRate?.(r);
  };

  const rootRef = useRef(null);
  const nameRef = useRef(null);
  const priceRef = useRef(null);
  const metaRef = useRef(null);
  const flagRef = useRef(null);
  const actionsRef = useRef(null);
  const play = enterDelay != null;
  const at = (offset) => (play ? enterDelay + offset : undefined);
  const swapping = useEntrance(rootRef, "fade", { duration: SOMM.swapMs, play: swapIn && !play });
  const nameEntering = useEntrance(nameRef, "rise", { delay: at(PICKS.pick.name), play });
  const priceEntering = useEntrance(priceRef, "fade", { delay: at(PICKS.pick.price), play });
  const metaEntering = useEntrance(metaRef, "fade", { delay: at(PICKS.pick.meta), play });
  const flagEntering = useEntrance(flagRef, "fade", { delay: at(PICKS.pick.meta), play });
  const actionsEntering = useEntrance(actionsRef, "fade", { delay: at(PICKS.pick.actions), play });

  return (
    <div ref={rootRef} data-testid="pick-card" data-wine={wine} style={withEntrance({
      // `going`: the Somm didn't keep this pick — it fades before the
      // Somm's own takes its place
      opacity: going ? 0 : quiet ? 0.45 : 1,
      transition: going ? `opacity ${SOMM.outMs}ms ease` : "opacity 0.3s ease",
    }, swapping)}>
      <SectionHead numeral={romanNumeral(index + 1)} label={role} enterDelay={enterDelay} style={{ margin: "32px 0 14px" }} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <h3 ref={nameRef} style={withEntrance({
          margin: 0, minWidth: 0, overflowWrap: "anywhere",
          fontFamily: SERIF, fontSize: index === 0 ? "21px" : "19px", fontWeight: 600, lineHeight: 1.25, color: INK,
        }, nameEntering)}>
          {name}
          {vintage && <> <span style={{ fontStyle: "italic", fontWeight: 400 }}>{vintage}</span></>}
        </h3>
        {price && (
          <>
            <LeaderDraw
              enterDelay={at(PICKS.pick.leader)}
              style={{ flex: 1, minWidth: 14, borderBottom: leader(1.5), marginBottom: 6 }}
            />
            <span ref={priceRef} style={withEntrance({
              flexShrink: 0, whiteSpace: "nowrap", fontFamily: SERIF, fontSize: "18px", lineHeight: 1.25, color: INK,
            }, priceEntering)}>{price}</span>
          </>
        )}
      </div>
      {meta && <div ref={metaRef} style={withEntrance({ ...TYPE.meta, lineHeight: 1.4, marginTop: 6 }, metaEntering)}>{meta}</div>}
      {flag && <div ref={flagRef} style={withEntrance(flagStyle, flagEntering)}>{flag}</div>}
      <PickNote engine={note} somm={sommNote} sommDelay={sommDelay} enterDelay={at(PICKS.pick.note)} />

      <div ref={actionsRef} style={actionsEntering || undefined}>
        {chosen ? (
          <ChosenPill changing={changing} onChange={onChange} />
        ) : (canChoose || canRate) && (
          <TextActions style={{ marginTop: 4 }}>
            {canChoose && <TextAction testId="choose-pick" onClick={onChoose}>🥂 This one’s on the table</TextAction>}
            {canRate && <TextAction tone="secondary" opacity={0.55} onClick={onOpenRate}>Had it? Rate it</TextAction>}
          </TextActions>
        )}
        {(tilesOpen || held) && <RatingTiles autoFocus onRate={rate} rated={held} style={{ marginTop: 8 }} />}
        {rating && !held && <DoneLine autoFocus>{ratedDoneLine(rating)}</DoneLine>}
      </div>
    </div>
  );
}
