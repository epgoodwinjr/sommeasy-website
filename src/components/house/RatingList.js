"use client";

// RatingList — Log a bottle's rating picker (README §7.10). Four full-width
// lines, one chosen, saved separately by "Save to journal":
//
//   ❤️   Loved it ························ (✓)
//
// role="radiogroup" of role="radio" lines; arrows move and select. The
// ratings come from RATINGS (@/lib/ratings).

import { RATINGS } from "@/lib/ratings";
import { choiceKeyDown, tabStop } from "./radio";
import { BURGUNDY, CREAM, INK, SANS, SERIF, TRANSITION, ink, leader } from "./tokens";

const IDS = RATINGS.map((r) => r.id);

export default function RatingList({ value, onChange, label = "How was it?", style }) {
  const stop = tabStop(IDS, value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => choiceKeyDown(e, IDS, value, onChange)}
      style={style}
    >
      {RATINGS.map((r) => {
        const on = r.id === value;
        return (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={r.label}
            tabIndex={r.id === stop ? 0 : -1}
            data-choice={r.id}
            onClick={() => onChange?.(r.id)}
            style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              padding: "13px 0", border: "none", borderBottom: `1px solid ${ink(0.07)}`,
              background: "none", textAlign: "left", cursor: "pointer",
            }}
          >
            <span aria-hidden="true" style={{
              width: 26, flexShrink: 0, textAlign: "center", fontSize: "19px", lineHeight: 1,
            }}>{r.emoji}</span>
            <span style={{
              fontFamily: SERIF, fontSize: "19px", lineHeight: 1.3, whiteSpace: "nowrap",
              color: on ? BURGUNDY : INK, fontWeight: on ? 600 : 400, transition: TRANSITION,
            }}>{r.label}</span>
            <span aria-hidden="true" style={{
              flex: 1, minWidth: 12, alignSelf: "flex-end", marginBottom: 9, borderBottom: leader(1.5, 0.2),
            }} />
            <span aria-hidden="true" style={{
              width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1.5px solid ${on ? BURGUNDY : ink(0.25)}`,
              background: on ? BURGUNDY : "transparent",
              fontFamily: SANS, fontSize: "12px", fontWeight: 700, color: CREAM,
              transition: TRANSITION,
            }}>{on ? "✓" : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
