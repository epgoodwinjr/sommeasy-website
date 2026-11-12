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
//
// The tap is answered at once (docs/motion/README.md §8.4): the tapped tile
// presses and settles, and — while the caller holds the tiles on screen,
// passing the rating back as `rated` — it wears burgundy, the other three
// step back and every tile is disabled. usePressHold() is that hold: call
// press(rating) in the same handler that saves, keep rendering the tiles
// while it returns a rating, and show the done line after. The save never
// waits on any of it. Under reduced motion there is no hold at all — the
// done line takes the tiles' place on the tap, as it always did.

import { useCallback, useEffect, useRef, useState } from "react";
import { RATINGS } from "@/lib/ratings";
import WriteIn from "./WriteIn";
import { PRESS, PRESS_KEYFRAMES, prefersReducedMotion } from "./motion";
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

/** The press: the tile dips, springs a little past its size and settles —
 *  on the element itself, so it answers before React has re-rendered. */
function playPress(el) {
  if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return;
  try {
    el.animate(PRESS_KEYFRAMES, { duration: PRESS.ms, easing: PRESS.easing });
  } catch { /* a tile that can't animate still rates */ }
}

// `chosen`: this tile is the answer (burgundy). `aside`: another one is.
function Tile({ rating, v, onRate, disabled, autoFocus, chosen, aside }) {
  const [hovered, setHovered] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const answered = chosen || aside;
  const lit = (hovered || keyboard) && !disabled && !answered;
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      aria-label={rating.label}
      title={rating.label}
      data-testid={`rating-tile-${rating.id}`}
      data-pressed={chosen ? "" : undefined}
      disabled={disabled || answered}
      onClick={(e) => {
        playPress(e.currentTarget);
        onRate?.(rating.id);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => setKeyboard(isFocusVisible(e.currentTarget))}
      onBlur={() => setKeyboard(false)}
      style={{
        width: v.tile, height: v.tile, flexShrink: 0, padding: 0, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${chosen ? "rgba(139,35,50,0.45)" : lit ? "rgba(139,35,50,0.3)" : ink(0.12)}`,
        background: chosen ? "rgba(139,35,50,0.09)" : lit ? "rgba(139,35,50,0.05)" : v.rest,
        fontSize: v.emoji, lineHeight: 1,
        cursor: disabled || answered ? "default" : "pointer",
        opacity: chosen ? 1 : aside ? PRESS.rest : disabled ? 0.5 : 1,
        transition: aside ? `opacity ${PRESS.restMs}ms ease` : TRANSITION,
      }}
    >{rating.emoji}</button>
  );
}

// `autoFocus` puts focus on the first tile when the tiles replace the
// control that opened them (a rec's "Had it"), so keyboard focus never
// falls back to the top of the page. `rated` is the answer just given
// (usePressHold): its tile stays lit, the rest step back, none can be tapped.
export default function RatingTiles({
  onRate, prompt = "How was it?", variant = "row", disabled = false, autoFocus = false, rated = null, style,
}) {
  const v = VARIANTS[variant] || VARIANTS.row;
  return (
    <div role="group" aria-label={prompt} style={{ display: "flex", alignItems: "center", gap: 6, ...style }}>
      <span style={{
        marginRight: "auto", fontFamily: SERIF, fontStyle: "italic", fontSize: v.prompt,
        lineHeight: 1.3, color: INK, opacity: v.promptAlpha,
      }}>{prompt}</span>
      {RATINGS.map((r, i) => (
        <Tile
          key={r.id} rating={r} v={v} onRate={onRate} disabled={disabled}
          autoFocus={autoFocus && i === 0 && !rated}
          chosen={rated === r.id} aside={Boolean(rated) && rated !== r.id}
        />
      ))}
    </div>
  );
}

/**
 * The hold after a tap (§8.4): [held, press]. `press(rating)` — called in
 * the same handler that saves — returns the tiles to the screen for
 * PRESS.holdMs with `held` as their `rated`; then `held` is null again and
 * the done line can take their place. Under reduced motion press() does
 * nothing, so the swap happens on the tap.
 */
export function usePressHold() {
  const [held, setHeld] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const press = useCallback((rating) => {
    if (!rating || prefersReducedMotion()) return;
    setHeld(rating);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHeld(null), PRESS.holdMs);
  }, []);
  return [held, press];
}

/** The done line that replaces a rec's or pick's actions once acted on
 *  (§7.9): "❤️ Loved it — noted in your journal." It is written in, word by
 *  word (docs/motion §8.4), and settles into the plain line it always was.
 *  With `autoFocus` it takes focus as it replaces the tapped control, so
 *  keyboard and screen-reader users hear it and keep their place (no ring —
 *  it isn't a control). */
export function DoneLine({ children, autoFocus = false, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const line = {
    fontFamily: SANS, fontSize: "13px", fontWeight: 600, lineHeight: 1.45,
    color: BURGUNDY, marginTop: 10, outline: "none", ...style,
  };
  const tabIndex = autoFocus ? -1 : undefined;
  return typeof children === "string"
    ? <WriteIn as="p" ref={ref} tabIndex={tabIndex} text={children} style={line} />
    : <p ref={ref} tabIndex={tabIndex} style={line}>{children}</p>;
}
