"use client";

// NameGesture — the user's pencil over a name (docs/marks/README.md §6–§7,
// §14.1, H4):
//
//   <NameGesture gesture="circle" draw={justChosen}>{name}</NameGesture>
//
// "circle" round the pick on the table, "underline" under a bottle you
// loved, "strike" through one you passed on; no gesture (null) is the name
// as it was. The name and its DOM are untouched: it stays in normal inline
// flow, wraps where it always wrapped, and its textContent is the name — the
// pencil is absolutely positioned <svg> beside it, aria-hidden, taking no
// taps, stretched over the name (preserveAspectRatio="none") with a
// non-scaling stroke so the line keeps its weight at any width.
//
// Where it goes: on the first paint (server HTML), CSS over the name's own
// box — exact for a name on one line. Then the name is measured (marks.js's
// gestureBoxes). The circle is the ONE approved drawing, always: one line or
// four, it is stretched round the whole name and crosses the corners of the
// first and last lines, as a quick hand-drawn loop does. The underline and
// the strike go on EVERY line — one <svg> per line (data-line), each sized
// to its own line, and no two neighbouring lines share a drawing
// (gestureDrawing: line i takes drawing i mod 3, so a one-line name draws
// what it always drew). The name is measured again when its block changes
// width or a web font lands. The origin it is measured from is a zero-size
// marker at the wrapper's own left/top — whatever an engine makes of an
// inline box that spans two lines, the marker says where 0,0 is.
//
// `draw` wipes the gesture in from the left, once, when it is set — the
// moment the user makes the mark; everywhere else it arrives settled. One
// stroke takes PENCIL.gestureMs; a wrapped underline or strike is drawn top
// line first (motion.js's gestureWipes). The plan is made once the name has
// been measured — in the same layout pass as the first commit, so nothing
// paints in between — and a later re-wrap never replays it. Under reduced
// motion every stroke is simply there.
//
// Keep it inside a line of text (an h3, a p). As a flex item it would be
// blockified: still measured right, but no longer flowing with its line.

import { useRef, useState } from "react";
import { GESTURES, MARK_COLORS, MARK_WEIGHTS, gestureBoxes, gestureDrawing, gestureStyle, nameLines } from "./marks";
import { GESTURE_WIPE, SOFT_OUT, gestureWipes, playPencil } from "./motion";
import { useIsoLayoutEffect } from "./useEntrance";

const WRAP = { position: "relative" };
const ORIGIN = { position: "absolute", left: 0, top: 0, width: 0, height: 0 };
const OVER = { position: "absolute", overflow: "visible", pointerEvents: "none" };

const sameBox = (a, b) => ["left", "top", "width", "height"].every((k) => Math.abs(a[k] - b[k]) < 0.5);
const same = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((box, i) => sameBox(box, b[i])));

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
  const [boxes, setBoxes] = useState(null);
  const measuring = useRef(false); // a first measurement is about to re-render: the draw waits for it
  const text = typeof children === "string" || typeof children === "number" ? String(children) : null;

  useIsoLayoutEffect(() => {
    if (!kind) {
      measuring.current = false;
      setBoxes(null);
      return undefined;
    }
    const measure = () => {
      const el = wrap.current;
      const zero = origin.current;
      if (!el || !zero) return;
      const range = el.ownerDocument.createRange();
      range.setStart(el, 0);
      range.setEndBefore(zero); // the name, not the pencil beside it
      const measured = gestureBoxes(kind, nameLines(range.getClientRects()), zero.getBoundingClientRect());
      const next = measured.length ? measured : null;
      measuring.current = Boolean(next);
      setBoxes((prev) => (same(prev, next) ? prev : next));
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

  // Planned when the name is first measured (how many lines it has is only
  // known then): the measurement above re-renders before paint, so the draw
  // starts once, on that commit — and never again when the name merely
  // re-wraps later. A name that can't be measured draws its one CSS-placed
  // stroke at once.
  const measured = Boolean(boxes);
  useIsoLayoutEffect(() => {
    if (!kind || !draw || !wrap.current) return undefined;
    if (!measured && measuring.current) return undefined;
    const strokes = [...wrap.current.querySelectorAll(":scope > svg")];
    const plan = gestureWipes(strokes.length);
    const wipes = strokes.map((svg, i) => playPencil(svg, GESTURE_WIPE, { ...plan[i], easing: SOFT_OUT }));
    return () => wipes.forEach((wipe) => wipe?.cancel());
  }, [kind, draw, measured]);

  // One <svg> per stroke, keyed by its line: the first is the same element
  // before and after the name is measured
  const strokes = kind ? boxes || [gestureStyle(kind)] : [];
  return (
    <span ref={wrap} data-gesture={kind || undefined} style={WRAP}>
      {children}
      {kind && <span ref={origin} aria-hidden="true" style={ORIGIN} />}
      {strokes.map((geometry, line) => (
        <svg
          key={line} viewBox={GESTURES[kind].viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false"
          data-line={line} style={{ ...OVER, ...geometry }}
        >
          <path
            d={gestureDrawing(kind, line)} fill="none" stroke={MARK_COLORS.pencil} strokeWidth={MARK_WEIGHTS.pencil}
            strokeLinecap="round" vectorEffect="non-scaling-stroke"
          />
        </svg>
      ))}
    </span>
  );
}
