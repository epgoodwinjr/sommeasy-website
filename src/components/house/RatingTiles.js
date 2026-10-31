"use client";

// RatingTiles — THE quick rating control (README §7.9; it retires
// RatingModal):
//
//   How was it?        [❤️] [👍] [😐] [👎]
//
// Tapping a tile rates at once — no confirm. Variants by surface:
//   row     — rec rows and picks: 42px tiles, 14px prompt at 0.7
//   verdict — From last night: 46px tiles, 16px prompt at 0.75
//   page    — the wine page: 46px tiles, 17px full-ink prompt
//             ("Change your verdict" when re-rating)
// The prompt shrinks and wraps before a tile ever does. Tiles, their
// labels and order come from RATINGS (@/lib/ratings); each carries
// data-testid rating-tile-{id} and its label as its accessible name.

import { useEffect, useRef, useState } from "react";
import { RATINGS } from "@/lib/ratings";
import { BURGUNDY, INK, SANS, SERIF, TRANSITION, ink } from "./tokens";

const VARIANTS = {
  row: { tile: 42, emoji: "18px", rest: "rgba(255,255,255,0.55)", prompt: "14px", promptAlpha: 0.7 },
  verdict: { tile: 46, emoji: "19px", rest: "rgba(255,255,255,0.5)", prompt: "16px", promptAlpha: 0.75 },
  page: { tile: 46, emoji: "19px", rest: "rgba(255,255,255,0.5)", prompt: "17px", promptAlpha: 1 },
};

function isFocusVisible(el) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true; // no :focus-visible support — show the ring on any focus
  }
}

function Tile({ rating, v, onRate, disabled, autoFocus }) {
  const [hovered, setHovered] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const lit = (hovered || keyboard) && !disabled;
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      aria-label={rating.label}
      title={rating.label}
      data-testid={`rating-tile-${rating.id}`}
      disabled={disabled}
      onClick={() => onRate?.(rating.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => setKeyboard(isFocusVisible(e.currentTarget))}
      onBlur={() => setKeyboard(false)}
      style={{
        width: v.tile, height: v.tile, flexShrink: 0, padding: 0, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${lit ? "rgba(139,35,50,0.3)" : ink(0.12)}`,
        background: lit ? "rgba(139,35,50,0.05)" : v.rest,
        fontSize: v.emoji, lineHeight: 1,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
        transition: TRANSITION,
      }}
    >{rating.emoji}</button>
  );
}

// `autoFocus` puts focus on the first tile when the tiles replace the
// control that opened them (a rec's "Had it"), so keyboard focus never
// falls back to the top of the page.
export default function RatingTiles({ onRate, prompt = "How was it?", variant = "row", disabled = false, autoFocus = false, style }) {
  const v = VARIANTS[variant] || VARIANTS.row;
  return (
    <div role="group" aria-label={prompt} style={{ display: "flex", alignItems: "center", gap: 6, ...style }}>
      <span style={{
        marginRight: "auto", fontFamily: SERIF, fontStyle: "italic", fontSize: v.prompt,
        lineHeight: 1.3, color: INK, opacity: v.promptAlpha,
      }}>{prompt}</span>
      {RATINGS.map((r, i) => (
        <Tile key={r.id} rating={r} v={v} onRate={onRate} disabled={disabled} autoFocus={autoFocus && i === 0} />
      ))}
    </div>
  );
}

/** The done line that replaces a rec's or pick's actions once acted on
 *  (§7.9): "❤️ Loved it — noted in your journal." With `autoFocus` it takes
 *  focus as it replaces the tapped control, so keyboard and screen-reader
 *  users hear it and keep their place (no ring — it isn't a control). */
export function DoneLine({ children, autoFocus = false, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <p ref={ref} tabIndex={autoFocus ? -1 : undefined} style={{
      fontFamily: SANS, fontSize: "13px", fontWeight: 600, lineHeight: 1.45,
      color: BURGUNDY, marginTop: 10, outline: "none", ...style,
    }}>{children}</p>
  );
}
