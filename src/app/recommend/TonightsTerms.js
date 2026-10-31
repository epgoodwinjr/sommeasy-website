"use client";

// Tonight's terms (The House List §8.3) — the old filter card, set as three
// ruled lines:
//
//   Color ··················· All  Red  White  Sparkling
//   Spend ······························ $ [40] to $ [90]
//   Steer the Somm  optional
//   A grape, a place, a mood…
//
// The same lines open on Match's input and, through "Adjust ›", in place
// over Your picks. Presentation only: the page owns the values, refilters
// on a change, and sends the steer. The steer's guidance lives in its label
// and helper (which wrap), never in a long placeholder (which clips at
// phone width — the original steer truncation bug).

import { COLORS } from "@/lib/matchTerms";
import ChoiceLine, { TermLine } from "@/components/house/ChoiceLine";
import RuledField, { AmountRange } from "@/components/house/RuledField";
import { INK, SANS, SERIF, ink } from "@/components/house/tokens";

export const STEER_MAX = 200;

const COLOR_LABELS = { all: "All", red: "Red", white: "White", sparkling: "Sparkling" };
const COLOR_CHOICES = COLORS.map((id) => ({ id, label: COLOR_LABELS[id] }));

export default function TonightsTerms({
  color, onColor, min, max, onMin, onMax, steer, onSteer, steerId,
}) {
  return (
    <div>
      <ChoiceLine label="Color" options={COLOR_CHOICES} value={color} onChange={onColor} />
      <TermLine label="Spend" style={{ marginTop: 16 }}>
        <AmountRange min={min} max={max} onMinChange={onMin} onMaxChange={onMax} />
      </TermLine>
      <label htmlFor={steerId} style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 24 }}>
        <span style={{ fontFamily: SERIF, fontSize: "18px", lineHeight: 1.3, color: INK }}>Steer the Somm</span>
        <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "13px", color: ink(0.45) }}>optional</span>
      </label>
      <RuledField
        variant="entry"
        id={steerId}
        data-testid={steerId}
        type="text"
        maxLength={STEER_MAX}
        value={steer}
        onChange={(e) => onSteer(e.target.value)}
        placeholder="A grape, a place, a mood…"
        autoComplete="off"
      />
      <p style={{ fontFamily: SANS, fontSize: "12px", lineHeight: 1.5, color: ink(0.5), marginTop: 8 }}>
        Try “something South African”, “no Chardonnay”, or “big reds for a steak night”.
      </p>
    </div>
  );
}
