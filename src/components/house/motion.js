// motion.js — The House List motion tokens (docs/motion/README.md §5.1).
//
// The one copy of every motion value, the way tokens.js is for color. Two
// families and nothing else: Ink (text rises, leaders and rules draw, marks
// land, prose is written) and Bloom (the palate mark — its timings live with
// its geometry, in src/lib/palateMark.js).
//
// Pure and dependency-free, so the unit tests load it in plain node. The
// rules every entrance follows:
//   · A settled transform is "none" — never a zero translate, which is still
//     a transform and re-parents position:fixed descendants (toasts).
//   · Only opacity, transform and clip-path animate.
//   · Entrances fill "backwards": held on the first keyframe through the
//     delay, then released, so the element rests in its natural state.
//   · Reduced motion collapses every entrance to a short fade with no
//     movement and no waiting (§5.2).

export const SOFT_OUT = "cubic-bezier(0.22,1,0.36,1)";
export const EASE = "ease";

/** Durations and gaps, in ms (§5.1). */
export const D_TAP = 150; // hover, press and selected states
export const D_FADE = 500; // opacity-only entrances
export const D_RISE = 700; // rise: fade + a short climb
export const D_LEADER = 650; // a leader or rule drawing its full width
export const D_POP = 420; // a mark landing
export const D_EXIT = 300; // a view leaving
export const WORD_STEP = 30; // gap between words in written prose
export const D_WORD = 450; // one word
export const ROW_STEP = 130; // gap between sibling rows or entries
export const PICK_STEP = 450; // gap between picks

/** Distances and scales the entrances start from. */
export const RISE_PX = 12;
export const WORD_PX = 6;
export const EXIT_PX = 8;
export const POP_FROM = 0.6;

/** Reduced motion: every Ink entrance becomes this fade (§5.2). */
export const D_REDUCED = 150;

/** How long written headlines wait for web fonts before splitting (§11). */
export const FONT_WAIT_MS = 300;

/** Inside a primitive given `enterDelay`, when each part follows the first
 *  (§8.1's entry, §8.5's pick). */
export const HEAD_ENTER = { rule: 80 };
export const ENTRY_ENTER = { leader: 200, leaderMs: 700, sub: 400, mark: 650 };
export const ROW_ENTER = { leader: 220, end: 560 };

/** The Somm's wait: the settled bloom breathes (§7.5). The keyframes are
 *  `house-breathe` in globals.css — motion.test.js holds the two together. */
export const BREATHE_MS = 3400;
export const BREATHE_SCALE = 1.045;
export const BREATHE_ANIMATION = `house-breathe ${BREATHE_MS}ms ease-in-out infinite`;

/**
 * The Ink entrances. `to` never names opacity: the element ends on its own
 * (a struck row at 0.4, a sub line at 0.55), and its transform ends on none.
 */
export const ENTRANCES = {
  rise: {
    from: { opacity: 0, transform: `translateY(${RISE_PX}px)` },
    to: { transform: "none" }, duration: D_RISE, easing: SOFT_OUT,
  },
  fade: { from: { opacity: 0 }, to: {}, duration: D_FADE, easing: EASE },
  pop: {
    from: { opacity: 0, transform: `scale(${POP_FROM})` },
    to: { transform: "none" }, duration: D_POP, easing: SOFT_OUT,
  },
  // Clipped, not scaled: scaling a dotted border stretches its dots
  leader: {
    from: { clipPath: "inset(0 100% 0 0)" },
    to: { clipPath: "inset(0 0 0 0)" }, duration: D_LEADER, easing: SOFT_OUT,
  },
  rule: {
    from: { transform: "scaleX(0)" },
    to: { transform: "none" }, duration: D_LEADER, easing: SOFT_OUT,
  },
  word: {
    from: { opacity: 0, transform: `translateY(${WORD_PX}px)` },
    to: { transform: "none" }, duration: D_WORD, easing: SOFT_OUT,
  },
};

/** A line that changes in place — Welcome's demo status (§8.1), the reading
 *  line (§8.5): the old words fade out, then the new ones rise in. */
export const SWAP = { outMs: 140, inMs: 320, risePx: 4 };

/** The quiz (§8.2): the leaving step fades and moves left; the arriving
 *  step's options settle in a few ms apart, the whole stagger capped; the
 *  header bloom grows (and first opens) over `bloomMs` per change. */
export const QUIZ_STEP = { exitMs: 200, exitPx: 8, optionStep: 20, optionCap: 300, optionPx: 6, bloomMs: 600 };

/** A view leaving (§5.1). Callers remove the view when it finishes. */
export const EXIT = {
  from: { opacity: 1, transform: "none" },
  to: { opacity: 0, transform: `translateY(-${EXIT_PX}px)` },
  duration: D_EXIT, easing: EASE,
};

/** A line swapping its words (SWAP): out, then in with a short climb. */
export const SWAP_OUT = { from: { opacity: 1 }, to: { opacity: 0 }, duration: SWAP.outMs, easing: EASE };
export const SWAP_IN = {
  from: { opacity: 0, transform: `translateY(${SWAP.risePx}px)` },
  to: { transform: "none" }, duration: SWAP.inMs, easing: SOFT_OUT,
};

/** What an entrance wears in server HTML, before it can start. */
export const HIDDEN = { opacity: 0 };

/** The viewer asked for less motion. False on the server. */
export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The two keyframes of an entrance; `distance` overrides a rise's climb. */
export function entranceKeyframes(kind, { distance } = {}) {
  const recipe = ENTRANCES[kind] || ENTRANCES.fade;
  const from = distance != null && (kind === "rise" || kind === "word")
    ? { ...recipe.from, transform: `translateY(${distance}px)` }
    : recipe.from;
  return [{ offset: 0, ...from }, { offset: 1, ...recipe.to }];
}

/** The timing of an entrance — under reduced motion, a short fade at once. */
export function entranceTiming(kind, { delay = 0, duration, easing } = {}, reduced = false) {
  if (reduced) return { duration: D_REDUCED, delay: 0, easing: EASE, fill: "backwards" };
  const recipe = ENTRANCES[kind] || ENTRANCES.fade;
  return {
    duration: duration ?? recipe.duration,
    delay: Math.max(0, Number(delay) || 0),
    easing: easing ?? recipe.easing,
    fill: "backwards",
  };
}

/**
 * Play an entrance on an element. Returns the Animation, or null where the
 * browser can't run it — the element then simply shows, which is the right
 * failure: an entrance is never the reason content is missing.
 */
export function playEntrance(el, kind, options = {}) {
  if (!el || typeof el.animate !== "function") return null;
  const reduced = prefersReducedMotion();
  try {
    return el.animate(
      reduced ? entranceKeyframes("fade") : entranceKeyframes(kind, options),
      entranceTiming(kind, options, reduced),
    );
  } catch {
    return null;
  }
}
