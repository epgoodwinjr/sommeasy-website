"use client";

// NameGesture — the user's pencil over a name (docs/marks/README.md §6–§7,
// H4):
//
//   <NameGesture gesture="circle" draw={justChosen}>{name}</NameGesture>
//
// "circle" round the pick on the table, "underline" under a bottle you
// loved, "strike" through one you passed on; no gesture (null) is the name
// as it was. The name and its DOM are untouched: it stays in normal inline
// flow, wraps where it always wrapped, and its textContent is the name — the
// pencil is an absolutely positioned <svg> beside it, aria-hidden, taking no
// taps, stretched over the name (preserveAspectRatio="none") with a
// non-scaling stroke so the line keeps its weight at any width.
//
// Where it goes: on the first paint (server HTML), CSS over the name's own
// box — exact for a name on one line. Then the name is measured: the circle
// goes round the whole name, and the underline and the strike go on its
// LAST line, so a wrapped name is underlined or struck where it ends
// (marks.js's gestureBox). It is measured again when its block changes
// width or a web font lands. The origin it is measured from is a zero-size
// marker at the wrapper's own left/top — whatever an engine makes of an
// inline box that spans two lines, the marker says where 0,0 is.
//
// `draw` wipes the gesture in from the left (PENCIL.gestureMs), once, when
// it is set — the moment the user makes the mark; everywhere else it
// arrives settled. Under reduced motion it is simply there.
//
// Keep it inside a line of text (an h3, a p). As a flex item it would be
// blockified: still measured right, but no longer flowing with its line.

import { useRef, useState } from "react";
import { GESTURES, MARK_COLORS, MARK_WEIGHTS, gestureBox, gestureStyle, nameLines } from "./marks";
import { GESTURE_WIPE, PENCIL, SOFT_OUT, playPencil } from "./motion";
import { useIsoLayoutEffect } from "./useEntrance";

const WRAP = { position: "relative" };
const ORIGIN = { position: "absolute", left: 0, top: 0, width: 0, height: 0 };
const OVER = { position: "absolute", overflow: "visible", pointerEvents: "none" };

const same = (a, b) => a === b || (a && b && ["left", "top", "width", "height"].every((k) => Math.abs(a[k] - b[k]) < 0.5));

/** The nearest ancestor that lays out a block — the box whose width decides
 *  where the name breaks. */
function blockOf(el) {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).display !== "inline") return node;
  }
  return null;
}

export default function NameGesture({ gesture = null, draw = false, children }) {
  const kind = gestureStyle(gesture) ? gesture : null;
  const wrap = useRef(null);
  const origin = useRef(null);
  const svg = useRef(null);
  const [box, setBox] = useState(null);
  const text = typeof children === "string" || typeof children === "number" ? String(children) : null;

  useIsoLayoutEffect(() => {
    if (!kind) return undefined;
    const measure = () => {
      const el = wrap.current;
      const zero = origin.current;
      if (!el || !zero) return;
      const range = el.ownerDocument.createRange();
      range.setStart(el, 0);
      range.setEndBefore(zero); // the name, not the pencil beside it
      const next = gestureBox(kind, nameLines(range.getClientRects()), zero.getBoundingClientRect());
      setBox((prev) => (same(prev, next) ? prev : next));
    };
    measure();
    const block = blockOf(wrap.current);
    const resize = typeof ResizeObserver === "function" && block ? new ResizeObserver(measure) : null;
    if (resize) resize.observe(block);
    else window.addEventListener("resize", measure);
    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", measure);
    return () => {
      if (resize) resize.disconnect();
      else window.removeEventListener("resize", measure);
      fonts?.removeEventListener?.("loadingdone", measure);
    };
  }, [kind, text]);

  useIsoLayoutEffect(() => {
    if (!kind || !draw) return undefined;
    const wipe = playPencil(svg.current, GESTURE_WIPE, { duration: PENCIL.gestureMs, easing: SOFT_OUT });
    return () => wipe?.cancel();
  }, [kind, draw]);

  const geometry = box || gestureStyle(kind);
  return (
    <span ref={wrap} data-gesture={kind || undefined} style={WRAP}>
      {children}
      {kind && <span ref={origin} aria-hidden="true" style={ORIGIN} />}
      {kind && (
        <svg
          ref={svg} viewBox={GESTURES[kind].viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false"
          style={{ ...OVER, ...geometry }}
        >
          <path
            d={GESTURES[kind].d} fill="none" stroke={MARK_COLORS.pencil} strokeWidth={MARK_WEIGHTS.pencil}
            strokeLinecap="round" vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </span>
  );
}
