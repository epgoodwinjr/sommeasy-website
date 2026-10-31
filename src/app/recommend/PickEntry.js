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
// rated, and owns every write. The note is the Somm's once it lands
// (somm-note) and the engine's plain reason until then (pick-note). On the
// chosen pick the actions become the pill; its Change brings the choose
// buttons back to the quieted picks — nothing is un-chosen until another
// pick is chosen. The role is the section's heading (h2), the name the
// pick's (h3).

import { useEffect, useRef } from "react";
import { romanNumeral } from "@/lib/numerals";
import { ratedDoneLine } from "@/lib/houseCopy";
import SectionHead from "@/components/house/SectionHead";
import RatingTiles, { DoneLine } from "@/components/house/RatingTiles";
import TextAction, { TextActions } from "@/components/house/TextAction";
import { BURGUNDY, CREAM, GRADIENT, INK, PILL_SHADOW, SANS, SERIF, TYPE, ink, leader } from "@/components/house/tokens";

const flagStyle = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 700, lineHeight: 1.4, textTransform: "uppercase",
  letterSpacing: "0.14em", color: BURGUNDY, marginTop: 6,
};
const noteStyle = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "14.5px", lineHeight: 1.55, color: ink(0.75), marginTop: 10,
};

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

export default function PickEntry({
  index, wine, role, name, vintage, price, meta, flag, note, sommNote = false,
  chosen = false, quiet = false, changing = false, canChoose = false, canRate = false,
  tilesOpen = false, rating = null, onChoose, onOpenRate, onRate, onChange,
}) {
  return (
    <div data-testid="pick-card" data-wine={wine} style={{
      opacity: quiet ? 0.45 : 1, transition: "opacity 0.3s ease",
    }}>
      <SectionHead numeral={romanNumeral(index + 1)} label={role} style={{ margin: "32px 0 14px" }} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <h3 style={{
          margin: 0, minWidth: 0, overflowWrap: "anywhere",
          fontFamily: SERIF, fontSize: index === 0 ? "21px" : "19px", fontWeight: 600, lineHeight: 1.25, color: INK,
        }}>
          {name}
          {vintage && <> <span style={{ fontStyle: "italic", fontWeight: 400 }}>{vintage}</span></>}
        </h3>
        {price && (
          <>
            <span aria-hidden="true" style={{ flex: 1, minWidth: 14, borderBottom: leader(1.5), marginBottom: 6 }} />
            <span style={{
              flexShrink: 0, whiteSpace: "nowrap", fontFamily: SERIF, fontSize: "18px", lineHeight: 1.25, color: INK,
            }}>{price}</span>
          </>
        )}
      </div>
      {meta && <div style={{ ...TYPE.meta, lineHeight: 1.4, marginTop: 6 }}>{meta}</div>}
      {flag && <div style={flagStyle}>{flag}</div>}
      {note && <p data-testid={sommNote ? "somm-note" : "pick-note"} style={noteStyle}>“{note}”</p>}

      {chosen ? (
        <ChosenPill changing={changing} onChange={onChange} />
      ) : (canChoose || canRate) && (
        <TextActions style={{ marginTop: 4 }}>
          {canChoose && <TextAction testId="choose-pick" onClick={onChoose}>🥂 This one’s on the table</TextAction>}
          {canRate && <TextAction tone="secondary" opacity={0.55} onClick={onOpenRate}>Had it? Rate it</TextAction>}
        </TextActions>
      )}
      {tilesOpen && <RatingTiles autoFocus onRate={onRate} style={{ marginTop: 8 }} />}
      {rating && <DoneLine autoFocus>{ratedDoneLine(rating)}</DoneLine>}
    </div>
  );
}
