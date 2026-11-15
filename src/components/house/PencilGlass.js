"use client";

// PencilGlass — the printed glass for a rating, shaded in the user's pencil
// (docs/marks/README.md §6–§7, H2–H3):
//
//   <PencilGlass rating="loved" size={26} />            settled
//   <PencilGlass rating="loved" guide />                a tile at rest
//   <PencilGlass rating="loved" guide draw="tile" />    the tile just tapped
//   <PencilGlass rating="loved" draw="line" />          that rating's done line
//
// Full for loved, half for liked, a sip for fine, turned down for not for
// me (`rating` is a RATINGS id; anything else renders nothing). Settled —
// no `draw`, no `guide` — its markup is exactly Mark's for the rating's
// glass, so a settled glass reads the same whichever draws it.
//
// `guide` makes it a tile: at rest it shows its level faintly
// (PENCIL.guide), and the firm shading goes in only when the tile is
// pencilled in. `draw` pencils it in, ONCE, when it is set — on mount, or
// when it changes from false: the surface line, then the hatching in array
// order, each stroke its own <path> drawn by its dash. (One path holding
// every stroke would dash each subpath on its own, and they would all
// appear together at the end: the first study's bug.) "line" takes the
// table as written; "tile" ends inside the press hold. "Not for me" draws
// nothing: on a tile the glass turns over (PENCIL.flipMs); on a line it is
// simply there.
//
// Nothing is left behind: the dash (pathLength, stroke-dasharray) goes on a
// stroke for its draw and comes off when the stroke lands or is cancelled,
// so a drawn glass ends on its settled markup. Under reduced motion nothing
// draws — the glass is settled in the same commit as its cause. Decorative:
// the words beside it, or a tile's aria-label, are the accessible name.

import { useRef } from "react";
import { GLASS, GLASS_VIEWBOX, MARK_COLORS, MARK_WEIGHTS, glassFor, markSize } from "./marks";
import { GLASS_FLIP, PENCIL, PENCIL_STROKE, SOFT_OUT, pencilStrokes, playPencil, prefersReducedMotion } from "./motion";
import { useIsoLayoutEffect } from "./useEntrance";

// Each stroke being drawn, with the animation that owns its dash. A
// cancelled draw is only heard a microtask later — after a re-run (React's
// double effects) may have started a new draw on the same path — so only
// the current owner takes the dash off.
const DRAWING = new WeakMap();

function drawStroke(path, timing) {
  if (!path) return () => {};
  path.setAttribute("pathLength", "1");
  path.setAttribute("stroke-dasharray", "1");
  const animation = playPencil(path, PENCIL_STROKE, { ...timing, easing: PENCIL.easing });
  DRAWING.set(path, animation);
  const settle = () => {
    if (DRAWING.get(path) !== animation) return; // a newer draw has this stroke
    DRAWING.delete(path);
    path.removeAttribute("pathLength");
    path.removeAttribute("stroke-dasharray");
  };
  if (!animation) {
    settle();
    return () => {};
  }
  animation.finished.then(settle, settle);
  return () => {
    animation.cancel();
    settle();
  };
}

export default function PencilGlass({ rating, size = 20, draw = false, guide = false, style }) {
  const glass = glassFor(rating);
  const svg = useRef(null);
  const strokes = useRef([]);
  // A tile shows its firm shading only once it is pencilled in
  const shaded = Boolean(glass?.shade.length) && (!guide || Boolean(draw));

  useIsoLayoutEffect(() => {
    if (!draw || !glass || prefersReducedMotion()) return undefined;
    if (glass.turned) {
      if (draw !== "tile") return undefined;
      const flip = playPencil(svg.current, GLASS_FLIP, { duration: PENCIL.flipMs, easing: SOFT_OUT });
      return () => flip?.cancel();
    }
    const plan = pencilStrokes(glass.shade.length, draw);
    const drawn = plan.map((timing, i) => drawStroke(strokes.current[i], timing));
    return () => drawn.forEach((cancel) => cancel());
    // Once per change of `draw` (or of the glass): a re-render never redraws
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, rating]);

  if (!glass) return null;
  const px = markSize(size);
  return (
    <svg
      ref={svg} viewBox={GLASS_VIEWBOX} width={px} height={px} aria-hidden="true" focusable="false"
      data-mark={glass.mark} style={style}
    >
      {guide && glass.shade.length > 0 && (
        <path
          d={glass.shade.join(" ")} fill="none" stroke={MARK_COLORS.pencil} strokeWidth={MARK_WEIGHTS.shade}
          strokeLinecap="round" opacity={PENCIL.guide} data-guide=""
        />
      )}
      {shaded && (
        <g fill="none" stroke={MARK_COLORS.pencil} strokeLinecap="round" strokeLinejoin="round" strokeWidth={MARK_WEIGHTS.shade}>
          {glass.shade.map((d, i) => (
            <path key={d} ref={(el) => { strokes.current[i] = el; }} d={d} />
          ))}
        </g>
      )}
      <g
        fill="none" stroke="currentColor" strokeWidth={MARK_WEIGHTS.glassHairline} strokeLinecap="round"
        strokeLinejoin="round" transform={glass.turned ? GLASS.turnedDown : undefined}
      >
        <path d={GLASS.bowl} />
        <path d={GLASS.stemAndFoot} />
      </g>
    </svg>
  );
}
