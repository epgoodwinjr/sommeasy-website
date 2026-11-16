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

/**
 * The reveal (§8.3). A medallion waits over a line that says the Somm is
 * reading; the line starts to leave `lineLead` before the bloom draws; then
 * each part of the reading arrives, counted from the draw's first frame.
 * (The wait itself, and the draw, are the mark's: MARK_MOTION in
 * src/lib/palateMark.js.)
 */
export const REVEAL = {
  // The wait
  lineIn: 300, // the reading line fades in under the medallion
  lineLead: 250, // …and starts to leave this long before the draw
  lineOutMs: 300,
  // From the draw's first frame — §8.3's table
  eyebrow: 1500,
  title: 1750, titleStep: 110, titleMs: 700, // written
  epithet: 2350,
  divider: 2700,
  narrative: 2950, narrativeStep: 22, narrativeMs: 500, // written
  saved: 4300,
  cta: 4450, // the entry: its leader and circle follow by ENTRY_ENTER
  // Signed out: the gate rises where the divider draws
  gate: 2700,
  // The recs come last — after the CTA's circle has landed (signed in), or
  // once the gate has risen (signed out): head, its line, then the rows
  recs: 5200,
  teaserRecs: 3300,
  recsSub: 100,
  recsRows: 250,
  home: 700, // "take me home", after the recs' head
  // A save that failed and was retried: the draw is long over, so what the
  // retry brings arrives at once
  late: { saved: 0, cta: 150 },
};

/** Three dots after a line that is still being thought about (§8.3, §8.5):
 *  each breathes on `house-dot` (globals.css), one after another. Filled
 *  backwards, so a dot waiting its turn already rests where the loop starts
 *  instead of showing at full ink and snapping down. */
export const DOTS = { ms: 1400, step: 180, rest: 0.25 };
export const dotAnimation = (index) => `house-dot ${DOTS.ms}ms ease-in-out ${index * DOTS.step}ms infinite backwards`;

/**
 * A rating tile answering its tap (§8.4): the tapped tile presses and
 * settles while the other three step back; the tiles stay on screen for
 * `holdMs` before the done line takes their place. The save itself starts on
 * the tap — nothing waits on the press.
 */
export const PRESS = { ms: 380, easing: "ease-out", down: 0.88, up: 1.08, restMs: 220, rest: 0.25, holdMs: 430 };
export const PRESS_KEYFRAMES = [
  { offset: 0, transform: "none" },
  { offset: 0.3, transform: `scale(${PRESS.down})` },
  { offset: 0.65, transform: `scale(${PRESS.up})` },
  { offset: 1, transform: "none" },
];

/**
 * Penciling (docs/marks/README.md §7). What the user did is drawn the way a
 * hand would draw it, and only at the moment they do it (H3): the glass's
 * shading goes in stroke by stroke — the wine's surface, then the hatching,
 * back and forth — on the tile they tapped and on that rating's done line,
 * once; a circle, underline or strike is wiped across a name from the left
 * as they make it. Everywhere else a mark arrives settled.
 *
 *   surfaceMs, strokeMs   a done line: the surface (stroke 0), one stroke
 *   stepMs                of the hatching, and the gap between the starts
 *                         of two hatching strokes (pencilStrokes)
 *   tile                  on the tile it must end inside the press hold:
 *                         a shorter surface and stroke, and the step derived
 *                         so the last stroke ends `beforeHold` ahead of
 *                         PRESS.holdMs. The hold itself is never lengthened
 *   guide                 the opacity of a tile's resting shading
 *   gestureMs             a circle, underline or strike, SOFT_OUT
 *   gestureLineMs,        an underline or strike over a name that WRAPS is
 *   gestureStepMs         one stroke per line: each wiped in over
 *                         gestureLineMs, gestureStepMs after the line above
 *                         (gestureWipes). A one-line name keeps gestureMs
 *   flipMs                "Not for me" draws nothing: on its tile the glass
 *                         turns over, SOFT_OUT
 *   easing                one stroke (the approved reference's)
 *
 * A stroke animates stroke-dashoffset — the one property beyond opacity,
 * transform and clip-path that anything animates, and only on a pencil
 * stroke. Gestures are never dashed: dash lengths and a non-scaling stroke
 * don't agree across browsers, so they are clipped instead.
 */
export const PENCIL = {
  surfaceMs: 360, strokeMs: 200, stepMs: 85, guide: 0.22, gestureMs: 800, flipMs: 600,
  gestureLineMs: 520, gestureStepMs: 260,
  tile: { surfaceMs: 140, strokeMs: 90, beforeHold: 20 },
  easing: "ease-out",
};

/** One stroke pencilled in: on its own <path>, with pathLength="1" and
 *  stroke-dasharray 1, the dash slides in from the stroke's start. */
export const PENCIL_STROKE = [{ offset: 0, strokeDashoffset: "1" }, { offset: 1, strokeDashoffset: "0" }];
/** "Not for me" on its tile: the glass turns over. */
export const GLASS_FLIP = [{ offset: 0, transform: "rotate(-180deg)" }, { offset: 1, transform: "none" }];
/** A gesture wiped across its name from the left. The negative insets leave
 *  room for the round caps and for a line drawn past its box. */
export const GESTURE_WIPE = [
  { offset: 0, clipPath: "inset(-200% 100% -200% 0)" },
  { offset: 1, clipPath: "inset(-200% -5% -200% -5%)" },
];

/**
 * When each stroke of a gesture is wiped in, top line first, as
 * { delay, duration } from the draw's start (docs/marks/README.md §14.1). One
 * stroke — a circle, or an underline or strike on one line — takes
 * gestureMs. A name that wraps has a stroke per line: each takes
 * gestureLineMs and starts gestureStepMs after the one above. Junk → [].
 */
export function gestureWipes(count) {
  if (!Number.isInteger(count) || count < 1) return [];
  if (count === 1) return [{ delay: 0, duration: PENCIL.gestureMs }];
  return Array.from({ length: count }, (_, i) => ({ delay: i * PENCIL.gestureStepMs, duration: PENCIL.gestureLineMs }));
}

/**
 * When each stroke of a glass's shading is drawn, in drawing order — stroke
 * 0 the wine's surface, the rest the hatching — as { delay, duration } from
 * the draw's start. "line" is the table as written; "tile" ends its last
 * stroke `tile.beforeHold` before the press hold does, however many strokes
 * the glass has. Nothing to draw (junk) → [].
 */
export function pencilStrokes(count, mode = "line") {
  if (!Number.isInteger(count) || count < 1) return [];
  const tile = mode === "tile";
  const surface = tile ? PENCIL.tile.surfaceMs : PENCIL.surfaceMs;
  const stroke = tile ? PENCIL.tile.strokeMs : PENCIL.strokeMs;
  const hatches = count - 1;
  // On a tile the hatching spreads from the surface's end to the last start
  // that still lands inside the hold — never backwards
  const lastStart = Math.max(surface, PRESS.holdMs - PENCIL.tile.beforeHold - stroke);
  const start = (k) => {
    if (!tile) return surface + k * PENCIL.stepMs;
    return hatches === 1 ? lastStart : surface + ((lastStart - surface) * k) / (hatches - 1);
  };
  return [
    { delay: 0, duration: surface },
    ...Array.from({ length: hatches }, (_, k) => ({ delay: start(k), duration: stroke })),
  ];
}

/**
 * Play a pencil animation — a stroke, the flip, a wipe — filling backwards,
 * so it is held on its first frame through its delay and leaves nothing
 * behind. Null under reduced motion (the mark is simply settled, in the same
 * commit as its cause) or where the browser can't run it.
 */
export function playPencil(el, keyframes, { delay = 0, duration, easing = PENCIL.easing } = {}) {
  if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return null;
  try {
    return el.animate(keyframes, { delay: Math.max(0, Number(delay) || 0), duration, easing, fill: "backwards" });
  } catch {
    return null;
  }
}

/**
 * A promotion or a shift (§8.4): the bloom shows in its OLD shape, and
 * `delay` after it arrives it grows into the new one (the growth itself is
 * the mark's: MARK_MOTION in src/lib/palateMark.js). `inPlace` is the size
 * the growth takes on a page that has no bloom of its own (the wine page).
 */
export const GROWTH = { delay: 700, riseMs: 600, inPlace: 96 };

/**
 * Log a bottle's saved step (§8.4), counted from the step's arrival — the
 * README's table, less the 740ms it counts from the tap. `grown` is the big
 * moment; `quiet` a rating with no promotion and no shift, which should feel
 * finished, not smaller. Each line of what else moved follows the bottle's
 * row by `linesAfter`.
 */
export const SAVED = {
  grown: {
    size: 164, eyebrow: 1850, headline: 2050, sub: 2650, rule: 3350, row: 3450, ways: 4300,
  },
  quiet: {
    size: 132, eyebrow: 250, headline: 450, sub: 750, rule: 1050, row: 1150, ways: 1650,
  },
  headlineStep: 85, headlineMs: 650, // written
  subStep: 30, // written
  ruleGap: 200, // the row's second rule, after its first
  linesAfter: 500,
};

/**
 * Home (§8.6), counted from the moment the layout is chosen: the crest rises
 * as one, the divider draws, the date line (or the whisper, written) follows,
 * then each numbered section — its head, and `follow` later its entry or
 * rows — `sectionStep` apart; the footer follows the last of them by
 * `footer`. `crestWait` is the longest the crest holds for the layout before
 * it rises on its own.
 */
export const HOME = { crestWait: 900, divider: 120, date: 200, sections: 220, sectionStep: 110, follow: 70, footer: 260 };

/** Your palate (§8.6): the strand rises, the divider draws, and each
 *  section's head draws as it mounts, `step` apart. Nothing else enters. */
export const PALATE = { divider: 150, heads: 250, step: 110 };

/** What opens in place — Match's link field, the pasted list, Adjust, a
 *  bypass noted: a quick rise, as it has always been. */
export const QUICK_RISE = { duration: 300, distance: 10 };

/** The quiet pages (§8.6) — Journal, Search, Account, a wine's page, and
 *  the first view of Match and Log: the title rises, and everything under
 *  it fades in together. Lists are for scanning; nothing staggers. */
export const PAGE_REST = { kind: "fade", duration: 300, delay: 100 };

/** The reading view (§8.5): under the bar, the names on the list flick
 *  past one at a time — a new one every `step`, each fading up from `from`
 *  — and the last fades out when the reading moves on. */
export const TICKER = { step: 190, fadeMs: 160, from: 0.2, outMs: 250 };

/**
 * Your picks (§8.5's table), counted from the view's arrival. Pick n starts
 * at `first` + `step`·n — pickDelay(n) — and inside it each part follows the
 * pick's own start by `pick` (its numeral, label and rule are the head's:
 * HEAD_ENTER). The closing divider draws `after` the last pick starts.
 */
export const PICKS = {
  title: 80, sub: 180, terms: 300, termsText: 450, somm: 600,
  first: 800, step: PICK_STEP,
  pick: { name: 160, leader: 380, meta: 420, note: 520, price: 720, actions: 780 },
  after: 800,
};
export const pickDelay = (index) => PICKS.first + PICKS.step * index;
export const picksCloseDelay = (count) => (count > 0 ? pickDelay(count - 1) + PICKS.after : PICKS.first);

/**
 * The Somm lands (§8.5, decision M8). "The Somm is tasting…" fades out over
 * `outMs` and the summary is written in at `summaryStep` a word while its
 * block eases to fit over `heightMs`. From `notes` later, pick by pick,
 * `noteStep` apart — sommNoteDelay(n) — the engine's note fades out (`outMs`)
 * and the Somm's is written in at `noteWordStep` a word, its box easing to
 * its new height. A pick the Somm changed fades in, in place, over `swapMs`.
 */
export const SOMM = {
  outMs: 200, summaryStep: 30, heightMs: 450,
  notes: 1250, noteStep: 520, noteWordStep: 26,
  swapMs: 320,
};
export const sommNoteDelay = (index) => SOMM.notes + SOMM.noteStep * index;

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

/**
 * The one layout animation in the system (§8.5): a box whose content has
 * just changed eases from the height it HAD (`from`, px — measured before
 * the change) to the height it has now, so nothing under it jumps. Call it
 * before the paint that would show the new content. Nothing is left on the
 * box: no fill, no inline height, and its own overflow back when the ease
 * ends or is cancelled. Under reduced motion — or where the browser can't —
 * it does nothing, and the new height is simply there.
 */
export function easeHeight(el, from) {
  if (!el || typeof el.animate !== "function" || !Number.isFinite(from) || prefersReducedMotion()) return null;
  const to = el.getBoundingClientRect().height;
  if (Math.abs(to - from) < 0.5) return null;
  // What doesn't fit yet is clipped while the box grows. A box already
  // easing is wearing the last ease's clipping, not its own style — a
  // cancelled ease is only heard a microtask later — so the box's own
  // overflow is remembered from the first ease, and put back by the last
  const inFlight = EASING.get(el);
  const ease = { own: inFlight ? inFlight.own : el.style.overflow };
  EASING.set(el, ease);
  el.style.overflow = "hidden";
  const restore = () => {
    if (EASING.get(el) !== ease) return; // a later ease has the box now
    EASING.delete(el);
    el.style.overflow = ease.own;
  };
  try {
    const animation = el.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: SOMM.heightMs, easing: SOFT_OUT },
    );
    animation.finished.then(restore, restore);
    return animation;
  } catch {
    restore();
    return null;
  }
}

// The boxes easing right now, each with the overflow it had before any ease
const EASING = new WeakMap();
