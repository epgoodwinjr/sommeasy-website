// palateMark.js — the visual DNA signature (Act III, "The Signature").
//
// renderPalateMark(genome) → an inline SVG string; renderPalateMarkDocument
// → the same mark as a standalone SVG document (a future share card / OG
// image consumes it unchanged). Pure and dependency-free: same genome →
// byte-identical SVG, no DB, no DOM, no chart library — the anonymous
// teaser renders it client-side from a locally composed genome.
//
// The form is a bloom on a medallion — the brand's protea, grown from the
// user's own data. Every genome dial owns one visible feature, so the mark
// moves only when the palate does, and moves CONTINUOUSLY — a milestone
// shift reads as the same bloom grown fuller (longer petals, another berry,
// a turned ring), never a replacement:
//
//   focus  → petal count (a new country adds a petal)
//   spread → petal length (regions fill the medallion toward its rim —
//            the empty band IS the room to grow)
//   world  → petal tip geometry (pointed classic ↔ rounded modern)
//   range  → stamen reach between petals (the protea echo)
//   depth  → berries carried on the petals (estates and named bottles)
//   color  → the inner ring's burgundy↔cream sweep (the red/white rail)
//   seed   → phase only: the ring's rotation and which petals bear fruit —
//            individuality without changing the macro form, so equal-dial
//            palates look related and equal-genome palates look identical
//
// All geometry lives in MARK_GEOMETRY and all color in MARK_PALETTE so an
// aesthetic pass is a constants edit, not a surgery.
//
// The mark in motion (docs/motion/README.md §7). The draw goes through a
// STATE — every feature's position, reach and opacity at one instant:
//
//   markParams(genome) → settledState(params) → renderMarkState(state)
//
// renderPalateMark is exactly that chain, and its bytes are what they were
// before the state existed. revealState(params, t, think) and
// growState(paramsA, paramsB, t, duration) return the state at a time t (ms)
// — the bloom drawing itself, and the same bloom grown — and both END on
// the settled state exactly, so a finished animation is byte-identical to
// the static mark. Still pure: time comes in as a number; nothing here
// reads a clock or touches the DOM. All timing lives in MARK_MOTION.

// Brand palette only (CLAUDE.md), plus the app's own existing tints: the
// petal fill is the home-strip gradient's lighter forest stop, the line
// work is the whisper text's light sage.
export const MARK_PALETTE = {
  disc: "#1B3D2F", // deep forest green
  petal: "#2A5540", // forest, one step lighter (existing gradient stop)
  line: "#C9DAC4", // light sage (existing whisper tint)
  sage: "#6B8F5E", // sage
  cream: "#F5F0E8", // cream
  burgundy: "#8B2332", // burgundy
};

export const MARK_GEOMETRY = {
  view: 160, // viewBox is 0 0 160 160; center 80,80
  discR: 74,
  frameOuterR: 71,
  frameInnerR: 67.5,
  orbitR: 56, // constant beaded circle — the bloom grows through it
  orbitDash: "0.2 5.8",
  petalBaseR: 24,
  petalTipMinR: 47, // spread 0
  petalTipMaxR: 66, // spread 1 — almost touching the frame
  petalMinCount: 5,
  petalExtraCount: 4, // focus 1 → 9 petals
  petalWidthFactor: 0.36, // of the petal's angular sector
  petalWidthCapDeg: 18,
  petalShoulder: 0.65, // lateral bulge sits toward the tip — slim calyx base
  tipBulgeMin: 0.8, // world 0 — pointed
  tipBulgeMax: 5, // world 1 — rounded
  stamenBaseR: 22,
  stamenTipMinR: 34, // range 0
  stamenTipMaxR: 60, // range 1
  ringR: 18.5, // the red/white ring — two open crescents, never a gauge
  ringWidth: 4.2,
  ringGapDeg: 8, // breathing room at each junction
  ringSliverDeg: 10, // neither color ever fully vanishes
  berryMax: 6,
  berryR: 2.4,
  coreR: 6.5,
};

// ─── Deterministic helpers ───

// mulberry32: integer-arithmetic PRNG — identical output on every JS engine
function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Two decimals, no trailing zeros, no "-0" — byte-stable across engines
function fmt(n) {
  const r = Math.round(n * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [80 + r * Math.cos(rad), 80 + r * Math.sin(rad)];
}

function pt(r, deg) {
  const [x, y] = polar(r, deg);
  return `${fmt(x)} ${fmt(y)}`;
}

function line(r1, r2, deg, stroke, width) {
  const [x1, y1] = polar(r1, deg);
  const [x2, y2] = polar(r2, deg);
  return `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${stroke}" stroke-width="${fmt(width)}"/>`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function dial(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : fallback;
}

// ─── Genome intake ───

// Tolerant of a malformed or legacy identity jsonb: every dial clamps to
// [0,1] with the engine's own neutral defaults; junk never renders NaN.
export function normalizeGenome(genome) {
  if (!genome || typeof genome !== "object") return null;
  return {
    seed: Number.isFinite(genome.seed) ? genome.seed >>> 0 : 0,
    world: dial(genome.world, 0.5),
    color: dial(genome.color, 0.5),
    focus: dial(genome.focus, 0),
    depth: dial(genome.depth, 0),
    spread: dial(genome.spread, 0),
    range: dial(genome.range, 0),
  };
}

// The derived geometry, exported so tests can assert growth continuity on
// numbers instead of parsing path strings
export function markParams(genome) {
  const g = normalizeGenome(genome);
  if (!g) return null;
  const G = MARK_GEOMETRY;
  const rng = mulberry32(g.seed);
  // Fixed draw order for the rng so a dial moving (with the seed unchanged)
  // never re-phases the rest of the mark
  const ringPhase = rng() * 360;
  const petals = G.petalMinCount + Math.round(g.focus * G.petalExtraCount);
  const sector = 360 / petals;
  const bloomPhase = -90 + rng() * sector; // symmetric beyond one sector
  // Which petals carry fruit: a seeded shuffle of petal indices
  const order = Array.from({ length: petals }, (_, i) => i);
  for (let i = petals - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    genome: g,
    petals,
    sector,
    bloomPhase,
    ringPhase,
    tipR: lerp(G.petalTipMinR, G.petalTipMaxR, g.spread),
    tipBulge: lerp(G.tipBulgeMin, G.tipBulgeMax, g.world),
    petalHalfWidthDeg: Math.min(sector * G.petalWidthFactor, G.petalWidthCapDeg),
    stamenTipR: lerp(G.stamenTipMinR, G.stamenTipMaxR, g.range),
    berries: Math.round(g.depth * G.berryMax),
    berryPetalOrder: order,
    // The ring is two open crescents; the sweep budget excludes both gaps
    burgundySweepDeg:
      G.ringSliverDeg +
      (1 - g.color) * (360 - 2 * G.ringGapDeg - 2 * G.ringSliverDeg),
  };
}

// ─── Shape builders ───

function petalPath(angle, p) {
  const G = MARK_GEOMETRY;
  const w = p.petalHalfWidthDeg;
  const midR = G.petalBaseR * (1 - G.petalShoulder) + p.tipR * G.petalShoulder;
  const tipHalf = w * 0.25;
  const tipInset = 1.5;
  const base = pt(G.petalBaseR, angle);
  const left = pt(midR, angle - w);
  const right = pt(midR, angle + w);
  const tipL = pt(p.tipR - tipInset, angle - tipHalf);
  const tipR = pt(p.tipR - tipInset, angle + tipHalf);
  const bulgeL = pt(p.tipR + p.tipBulge, angle - tipHalf * 0.4);
  const bulgeR = pt(p.tipR + p.tipBulge, angle + tipHalf * 0.4);
  return `M ${base} Q ${left} ${tipL} C ${bulgeL} ${bulgeR} ${tipR} Q ${right} ${base} Z`;
}

function arcPath(r, startDeg, sweepDeg) {
  const start = pt(r, startDeg);
  const end = pt(r, startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${start} A ${fmt(r)} ${fmt(r)} 0 ${large} 1 ${end}`;
}

// ─── The mark in motion: timings ───

// Every number the bloom moves by (docs/motion/README.md §7.3–7.4), in ms
// unless it says otherwise.
export const MARK_MOTION = {
  // The reveal: a medallion waits, then the bloom draws itself
  thinkMs: 1900, // the shortest wait before the draw
  discFadeMs: 500,
  arriveScale: 0.94, // the whole mark settles from here…
  arriveMs: 700, // …over this long
  frameStartMs: 120,
  frameMs: 900,
  orbitFadeStartMs: 300,
  orbitFadeMs: 800,
  orbitDegPerMs: 0.02, // the beads turn while the mark waits
  orbitCoastMinDeg: 11, // …and coast at least this far to rest once it draws
  corePulse: 0.2, // the heart swells to 1.2…
  corePulseMs: 1500, // …on this cycle while waiting
  coreSettleMs: 260,
  ringBurgundyMs: 700,
  ringCreamStartMs: 450,
  ringCreamMs: 650,
  stamenStartMs: 250,
  stamenStepMs: 45,
  stamenMs: 500,
  petalStartMs: 500,
  petalStepMs: 120,
  petalMs: 750,
  petalOpenWidth: 0.35, // a petal opens from this share of its width
  berryAfterPetalMs: 250,
  berryStepMs: 110,
  berryMs: 420,
  berryLandScale: 1.9,
  // Growth: the same bloom, from one genome to the next
  growMs: 2100,
  swell: 0.06,
  swellSpan: 1.05, // of the duration
  pulseAt: 0.42, // of the duration: one wide pulse from the heart
  pulseMs: 1100,
  pulseFromR: 22,
  pulseToR: 68,
  pulseOpacity: 0.5,
  pulseWidth: 1.1,
  newBerryAt: 0.5, // of the duration (same petal count)
  newBerryStepMs: 140,
  newBerryMs: 460,
  newBerryScale: 2.4,
  rippleLagsMs: [120, 400], // two ripples where a berry lands
  rippleMs: 900,
  rippleFromR: 3,
  rippleToR: 18,
  rippleOpacity: 0.85,
  rippleWidth: 0.9,
  newPetalAt: 0.3, // of the duration; a new petal opens at its final angle
  newPetalSpan: 0.75,
  newStamenAt: 0.45,
  newStamenSpan: 0.6,
  newStamenFadeSpan: 0.4,
  berryLiftSpan: 0.28, // a new petal re-deals the fruit: it lifts…
  berryRelandAt: 0.8, // …and lands again from here
  closeSpan: 0.45, // what a smaller genome drops closes over this share
};

// ─── Motion helpers ───

// Like lerp, but exact at both ends: a + (b − a) can miss b by one ulp,
// and an animation's last frame has to BE the settled mark
function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return a + (b - a) * t;
}

// Quartic ease-out of t over [start, start + span]
function easeOut(t, start, span) {
  const x = clamp01((t - start) / span);
  return 1 - Math.pow(1 - x, 4);
}

function easeInOut(x) {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

// Motion-only attributes (scale, opacity, rotation) step finer than the
// geometry does: at two decimals a 6% swell is six visible jumps
function fine(n) {
  const r = Math.round(n * 10000) / 10000;
  return String(r === 0 ? 0 : r);
}

const RING_SPAN_DEG = 360 - 2 * MARK_GEOMETRY.ringGapDeg;

// The beaded orbit is a dashed circle, and its circumference is not a whole
// number of beads — there is a seam. Only a full turn renders it the same
// again, so a turning orbit cannot simply stop where it is. While it turns
// it is drawn EVEN (the same bead count, spaced to close the seam), which
// makes every bead-step of rotation identical; as it coasts to rest the
// spacing eases back and the rotation lands on exactly 0.
const ORBIT_PERIOD = MARK_GEOMETRY.orbitDash.split(" ").reduce((sum, n) => sum + Number(n), 0);
const ORBIT_LENGTH = 2 * Math.PI * MARK_GEOMETRY.orbitR;
const ORBIT_BEADS = Math.ceil(ORBIT_LENGTH / ORBIT_PERIOD);
const ORBIT_EVEN_LENGTH = ORBIT_BEADS * ORBIT_PERIOD;
const ORBIT_STEP_DEG = 360 / ORBIT_BEADS;

function berryRf(k, petals) {
  return k < petals ? 0.52 : 0.34; // second pass sits lower
}

// ─── State ───

/**
 * The settled state of a mark: what renderPalateMark draws. Every animated
 * state is this one with some features part-way there.
 *
 *   disc      opacity of the whole medallion          scale     of the whole mark
 *   frame     how much of the two frame circles is drawn (0–1, from 12 o'clock)
 *   orbit     the beads' opacity                      orbitRot  their turn, in degrees
 *   orbitEven 1 while the beads turn (see ORBIT_PERIOD above), 0 at rest
 *   stamens   [{ angle, tip, opacity }]
 *   petals    [{ angle, tip, halfWidth, opacity }]
 *   berries   [{ petalIndex, rf, scale, opacity }] — rf is how far up its petal
 *   ring      { phase, burgundy, burgundyFull, cream } — sweeps in degrees;
 *             burgundyFull is where the cream crescent starts from
 *   core      scale of the heart                      tipBulge  the petals' tip roundness
 *   ripples   [{ x, y, r, opacity, width }] — overlays, gone by the end
 */
export function settledState(params) {
  if (!params) return null;
  const state = {
    disc: 1,
    scale: 1,
    frame: 1,
    orbit: 1,
    orbitRot: 0,
    orbitEven: 0,
    stamens: [],
    petals: [],
    berries: [],
    ring: {
      phase: params.ringPhase,
      burgundy: params.burgundySweepDeg,
      burgundyFull: params.burgundySweepDeg,
      cream: RING_SPAN_DEG - params.burgundySweepDeg,
    },
    core: 1,
    tipBulge: params.tipBulge,
    ripples: [],
  };
  for (let i = 0; i < params.petals; i++) {
    state.stamens.push({
      angle: params.bloomPhase + (i + 0.5) * params.sector, tip: params.stamenTipR, opacity: 1,
    });
    state.petals.push({
      angle: params.bloomPhase + i * params.sector, tip: params.tipR,
      halfWidth: params.petalHalfWidthDeg, opacity: 1,
    });
  }
  for (let k = 0; k < params.berries; k++) {
    state.berries.push({
      petalIndex: params.berryPetalOrder[k % params.petals],
      rf: berryRf(k, params.petals), scale: 1, opacity: 1,
    });
  }
  return state;
}

// ─── Rendering a state ───

// An attribute only a moving mark carries; at rest it is simply absent
function motionAttr(name, value, rest) {
  const text = fine(value);
  return text === rest ? "" : ` ${name}="${text}"`;
}

function faded(markup, opacity) {
  const text = fine(opacity);
  return text === "1" ? markup : `<g opacity="${text}">${markup}</g>`;
}

function berryPoint(state, berry) {
  const petal = state.petals[berry.petalIndex];
  if (!petal) return null;
  const G = MARK_GEOMETRY;
  return polar(G.petalBaseR + (petal.tip - G.petalBaseR) * berry.rf, petal.angle);
}

function stateBody(state) {
  const G = MARK_GEOMETRY;
  const C = MARK_PALETTE;
  const parts = [];

  // Medallion ground + engraved frame + the constant beaded orbit (label
  // beadwork — a deep bloom grows through it)
  parts.push(`<circle cx="80" cy="80" r="${fmt(G.discR)}" fill="${C.disc}"/>`);
  if (state.frame > 0.01) {
    // Part-drawn: clockwise from 12 o'clock
    const draw = state.frame < 1
      ? ` pathLength="1" stroke-dasharray="${fine(state.frame)} 1" transform="rotate(-90 80 80)"`
      : "";
    parts.push(
      `<circle cx="80" cy="80" r="${fmt(G.frameOuterR)}" fill="none" stroke="${C.cream}" stroke-width="1.1"${draw}/>`
    );
    parts.push(
      `<circle cx="80" cy="80" r="${fmt(G.frameInnerR)}" fill="none" stroke="${C.sage}" stroke-width="0.5"${draw}/>`
    );
  }
  const orbitTurn = fine(state.orbitRot);
  const orbitMotion =
    (state.orbitEven > 0
      ? ` pathLength="${fine(mix(ORBIT_LENGTH, ORBIT_EVEN_LENGTH, state.orbitEven))}"`
      : "") +
    motionAttr("opacity", state.orbit, "1") +
    (orbitTurn === "0" ? "" : ` transform="rotate(${orbitTurn} 80 80)"`);
  parts.push(
    `<circle cx="80" cy="80" r="${fmt(G.orbitR)}" fill="none" stroke="${C.sage}" stroke-width="1" stroke-dasharray="${G.orbitDash}" stroke-linecap="round"${orbitMotion}/>`
  );

  // Stamens — behind the petals, reaching into the gaps between them
  for (const stamen of state.stamens) {
    if (stamen.tip <= G.stamenBaseR + 0.5 || fine(stamen.opacity) === "0") continue;
    const [dx, dy] = polar(stamen.tip + 1.8, stamen.angle);
    parts.push(faded(
      line(G.stamenBaseR, stamen.tip, stamen.angle, C.line, 0.8) +
        `<circle cx="${fmt(dx)}" cy="${fmt(dy)}" r="1.3" fill="${C.line}"/>`,
      stamen.opacity
    ));
  }

  // Petals + midribs
  for (const petal of state.petals) {
    if (fine(petal.opacity) === "0") continue;
    const ribEnd = G.petalBaseR + (petal.tip - G.petalBaseR) * 0.72;
    parts.push(faded(
      `<path d="${petalPath(petal.angle, { petalHalfWidthDeg: petal.halfWidth, tipR: petal.tip, tipBulge: state.tipBulge })}" fill="${C.petal}" stroke="${C.line}" stroke-width="1.2" stroke-linejoin="round"/>` +
        // A petal still opening is too short to carry its midrib
        (ribEnd > G.petalBaseR + 4.5 ? line(G.petalBaseR + 4, ribEnd, petal.angle, C.cream, 0.7) : ""),
      petal.opacity
    ));
  }

  // Berries — fruit on the midribs; the seed picks which petals bear it
  for (const berry of state.berries) {
    const at = berryPoint(state, berry);
    if (!at || fine(berry.opacity) === "0") continue;
    parts.push(
      `<circle cx="${fmt(at[0])}" cy="${fmt(at[1])}" r="${fmt(G.berryR * berry.scale)}" fill="${C.burgundy}" stroke="${C.cream}" stroke-width="0.8"${motionAttr("opacity", berry.opacity, "1")}/>`
    );
  }

  // The red/white ring — two open crescents (round caps, a breath of green
  // at each junction): burgundy sweep is the red share, cream the white;
  // neither ever vanishes (a palate is never absolute)
  const ring = state.ring;
  if (ring.burgundy > 0.4) {
    parts.push(
      `<path d="${arcPath(G.ringR, ring.phase, ring.burgundy)}" fill="none" stroke="${C.burgundy}" stroke-width="${fmt(G.ringWidth)}" stroke-linecap="round"/>`
    );
  }
  if (ring.cream > 0.4) {
    parts.push(
      `<path d="${arcPath(G.ringR, ring.phase + ring.burgundyFull + G.ringGapDeg, ring.cream)}" fill="none" stroke="${C.cream}" stroke-width="${fmt(G.ringWidth)}" stroke-linecap="round"/>`
    );
  }

  // Core — the heart of the bloom, a single quiet berry
  parts.push(
    `<circle cx="80" cy="80" r="${fmt(G.coreR * state.core)}" fill="${C.burgundy}" stroke="${C.cream}" stroke-width="1"/>`
  );

  // Ripples and pulses — overlays that have fully faded by the end
  for (const ripple of state.ripples || []) {
    if (fine(ripple.opacity) === "0") continue;
    parts.push(
      `<circle cx="${fmt(ripple.x)}" cy="${fmt(ripple.y)}" r="${fmt(ripple.r)}" fill="none" stroke="${C.cream}" stroke-width="${fmt(ripple.width)}" opacity="${fine(ripple.opacity)}"/>`
    );
  }

  const body = parts.join("");
  const scale = fine(state.scale);
  const group =
    (scale === "1" ? "" : ` transform="translate(80 80) scale(${scale}) translate(-80 -80)"`) +
    motionAttr("opacity", state.disc, "1");
  return group ? `<g${group}>${body}</g>` : body;
}

/**
 * A state as the inline mark: decorative (aria-hidden) — every surface
 * shows the title text beside it, which is the accessible name.
 */
export function renderMarkState(state, { size = 96 } = {}) {
  if (!state) return "";
  const v = MARK_GEOMETRY.view;
  return `<svg viewBox="0 0 ${v} ${v}" width="${fmt(size)}" height="${fmt(size)}" aria-hidden="true" role="presentation" focusable="false">${stateBody(state)}</svg>`;
}

/**
 * The inline mark at rest. Returns "" for a missing genome so surfaces
 * degrade to text-only exactly as they do today.
 */
export function renderPalateMark(genome, { size = 96 } = {}) {
  return renderMarkState(settledState(markParams(genome)), { size });
}

/**
 * The standalone document: the same mark, complete with xmlns, usable
 * outside React (share card, OG image). Genome in, SVG document out.
 */
export function renderPalateMarkDocument(genome, { size = 640 } = {}) {
  const state = settledState(markParams(genome));
  if (!state) return "";
  const v = MARK_GEOMETRY.view;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}" width="${fmt(size)}" height="${fmt(size)}">${stateBody(state)}</svg>`;
}

// ─── The reveal: the bloom draws itself ───

/** How long the draw runs once it starts. At think + this, the state IS
 *  the settled mark. */
export function revealLength(params) {
  if (!params) return 0;
  const M = MARK_MOTION;
  return (
    M.petalStartMs + M.petalStepMs * params.petals +
    M.berryAfterPetalMs + M.berryStepMs * params.berries + M.berryMs
  );
}

/**
 * The mark `t` ms after the medallion appears. Until `thinkMs` it waits —
 * disc, frame, turning beads, a pulsing heart — and then draws: ring,
 * stamens, petals, berries (README §7.3). Pass Infinity for thinkMs while
 * the wait's end isn't known yet; nothing before the draw depends on it.
 */
export function revealState(params, t, thinkMs = MARK_MOTION.thinkMs) {
  const state = settledState(params);
  if (!state) return null;
  const M = MARK_MOTION;
  const G = MARK_GEOMETRY;
  const d = t - thinkMs; // time into the draw; negative while waiting

  state.disc = easeOut(t, 0, M.discFadeMs);
  state.scale = mix(M.arriveScale, 1, easeOut(t, 0, M.arriveMs));
  state.frame = easeOut(t, M.frameStartMs, M.frameMs);
  state.orbit = easeOut(t, M.orbitFadeStartMs, M.orbitFadeMs);

  // The beads turn at a steady pace, then coast: a straight-line slowing
  // from that pace to nothing, over the shortest distance (≥ the minimum)
  // that brings them to rest on exactly 0
  if (d < 0) {
    state.orbitRot = (M.orbitDegPerMs * t) % ORBIT_STEP_DEG;
    state.orbitEven = 1;
  } else {
    const turned = (M.orbitDegPerMs * thinkMs) % ORBIT_STEP_DEG;
    let coast = ORBIT_STEP_DEG - turned;
    while (coast < M.orbitCoastMinDeg) coast += ORBIT_STEP_DEG;
    const left = Math.pow(1 - clamp01(d / ((2 * coast) / M.orbitDegPerMs)), 2);
    state.orbitRot = left > 0 ? -coast * left : 0;
    state.orbitEven = left;
  }

  // The heart pulses while it waits and settles as the draw begins
  const pulse = d < 0 ? 1 : Math.pow(1 - clamp01(d / M.coreSettleMs), 2);
  state.core = pulse > 0
    ? 1 + M.corePulse * pulse * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / M.corePulseMs))
    : 1;

  state.ring.burgundy = mix(0, params.burgundySweepDeg, easeOut(d, 0, M.ringBurgundyMs));
  state.ring.cream = mix(0, RING_SPAN_DEG - params.burgundySweepDeg, easeOut(d, M.ringCreamStartMs, M.ringCreamMs));

  for (let i = 0; i < params.petals; i++) {
    const reach = easeOut(d, M.stamenStartMs + i * M.stamenStepMs, M.stamenMs);
    state.stamens[i].tip = mix(G.stamenBaseR, params.stamenTipR, reach);
    state.stamens[i].opacity = reach;
    // A petal opens from its base: the tip grows, the width fills out, and
    // it is fully there a third of the way in
    const open = easeOut(d, M.petalStartMs + i * M.petalStepMs, M.petalMs);
    state.petals[i].tip = mix(G.petalBaseR, params.tipR, open);
    state.petals[i].halfWidth = mix(params.petalHalfWidthDeg * M.petalOpenWidth, params.petalHalfWidthDeg, open);
    state.petals[i].opacity = Math.min(1, open * 3);
  }

  // Berries land once the last petal is on its way
  const firstBerry = M.petalStartMs + (params.petals - 1) * M.petalStepMs + M.berryAfterPetalMs;
  state.berries.forEach((berry, k) => {
    const land = easeOut(d, firstBerry + k * M.berryStepMs, M.berryMs);
    berry.scale = mix(M.berryLandScale, 1, land);
    berry.opacity = land;
  });
  return state;
}

// ─── The bare medallion, and the bloom opening from it ───
//
// The quiz's header mark starts with nothing to show: disc, frame, beads and
// the heart, still (docs/motion/README.md §8.2). Its first answer opens the
// bloom from there — the reveal's own draw, with the wait already over. Both
// are read off revealState at a moment past every fade-in, on a whole beat
// of the heart's pulse, so the bare frame is the draw's first frame exactly
// (nothing jumps when it starts) and holds no trace of any genome.

// One heart-pulse cycle: every medallion fade-in has finished by then, and
// the pulse is back at rest
const BARE_AT = MARK_MOTION.corePulseMs;

/** The medallion alone — no ring, stamens, petals or fruit. The same for
 *  every genome; `params` only has to be a real mark's. */
export function bareState(params) {
  return revealState(params, BARE_AT, BARE_AT);
}

/** How long the bloom takes to open from the bare medallion at its own
 *  pace (the reveal's draw). */
export function openLength(params) {
  return revealLength(params);
}

/**
 * The bloom `t` ms into opening from the bare medallion, over `duration` ms
 * (the reveal's draw, sped up or slowed to fit). At t = 0 it is bareState;
 * at t = duration it IS the settled mark. Run t backwards to close it.
 */
export function openState(params, t, duration = openLength(params)) {
  if (!params) return null;
  const natural = revealLength(params);
  const span = duration > 0 ? duration : natural;
  const d = Math.min(natural, Math.max(0, t) * (natural / span));
  return revealState(params, BARE_AT + d, BARE_AT);
}

// ─── Growth: the same bloom, grown ───

function sameFruit(a, b) {
  if (a.petals !== b.petals) return false;
  const shared = Math.min(Math.max(a.berries, b.berries), a.petals);
  for (let k = 0; k < shared; k++) {
    if (a.berryPetalOrder[k] !== b.berryPetalOrder[k]) return false;
  }
  return true;
}

/** How long a growth runs. At this time the state IS genome B's settled
 *  mark — the swell, the pulse and every ripple have finished. */
export function growLength(paramsA, paramsB, duration = MARK_MOTION.growMs) {
  if (!paramsA || !paramsB) return 0;
  const M = MARK_MOTION;
  let end = Math.max(duration * M.swellSpan, duration * M.pulseAt + M.pulseMs);
  if (sameFruit(paramsA, paramsB)) {
    const added = paramsB.berries - paramsA.berries;
    if (added > 0) {
      const lastLands = duration * M.newBerryAt + (added - 1) * M.newBerryStepMs;
      end = Math.max(end, lastLands + Math.max(M.newBerryMs, Math.max(...M.rippleLagsMs) + M.rippleMs));
    }
  } else if (paramsB.berries > 0) {
    end = Math.max(end, duration * M.berryRelandAt + (paramsB.berries - 1) * M.berryStepMs + M.berryMs);
  }
  return end;
}

/**
 * The mark `t` ms into growing from genome A's shape to genome B's
 * (README §7.4). It needs no idea of what was promoted — only the two
 * shapes. Dials that grew never pass through a smaller value on the way.
 */
export function growState(paramsA, paramsB, t, duration = MARK_MOTION.growMs) {
  const state = settledState(paramsB);
  if (!state || !paramsA) return state;
  const M = MARK_MOTION;
  const G = MARK_GEOMETRY;
  const u = easeInOut(t / duration);

  // The whole mark swells and settles; one wide pulse crosses from the
  // heart, whatever it was that grew
  const swell = clamp01(t / (duration * M.swellSpan));
  state.scale = swell < 1 ? 1 + M.swell * Math.sin(Math.PI * swell) : 1;
  const pulse = clamp01((t - duration * M.pulseAt) / M.pulseMs);
  if (pulse > 0 && pulse < 1) {
    state.ripples.push({
      x: 80, y: 80, r: mix(M.pulseFromR, M.pulseToR, 1 - Math.pow(1 - pulse, 3)),
      opacity: M.pulseOpacity * (1 - pulse), width: M.pulseWidth,
    });
  }

  state.tipBulge = mix(paramsA.tipBulge, paramsB.tipBulge, u);
  state.ring.phase = mix(paramsA.ringPhase, paramsB.ringPhase, u);
  state.ring.burgundy = mix(paramsA.burgundySweepDeg, paramsB.burgundySweepDeg, u);
  state.ring.burgundyFull = state.ring.burgundy;
  state.ring.cream = RING_SPAN_DEG - state.ring.burgundy;

  for (let i = 0; i < paramsB.petals; i++) {
    const petal = state.petals[i];
    const stamen = state.stamens[i];
    if (i < paramsA.petals) {
      // A petal both shapes have: it slides, lengthens and fills out
      petal.angle = mix(paramsA.bloomPhase + i * paramsA.sector, petal.angle, u);
      petal.tip = mix(paramsA.tipR, paramsB.tipR, u);
      petal.halfWidth = mix(paramsA.petalHalfWidthDeg, paramsB.petalHalfWidthDeg, u);
      stamen.angle = mix(paramsA.bloomPhase + (i + 0.5) * paramsA.sector, stamen.angle, u);
      stamen.tip = mix(paramsA.stamenTipR, paramsB.stamenTipR, u);
    } else {
      // A new petal opens at its final angle while the others make room
      const open = easeOut(t, duration * M.newPetalAt, duration * M.newPetalSpan);
      petal.tip = mix(G.petalBaseR, paramsB.tipR, open);
      petal.halfWidth = mix(paramsB.petalHalfWidthDeg * M.petalOpenWidth, paramsB.petalHalfWidthDeg, open);
      petal.opacity = Math.min(1, open * 3);
      stamen.tip = mix(G.stamenBaseR, paramsB.stamenTipR, easeOut(t, duration * M.newStamenAt, duration * M.newStamenSpan));
      stamen.opacity = easeOut(t, duration * M.newStamenAt, duration * M.newStamenFadeSpan);
    }
  }

  // A smaller shape (a re-rate down, a bottle deleted): what it no longer
  // has closes and fades instead of vanishing
  const closing = 1 - easeOut(t, 0, duration * M.closeSpan);
  if (closing > 0) {
    for (let i = paramsB.petals; i < paramsA.petals; i++) {
      state.petals.push({
        angle: paramsA.bloomPhase + i * paramsA.sector,
        tip: mix(G.petalBaseR, paramsA.tipR, closing),
        halfWidth: paramsA.petalHalfWidthDeg, opacity: closing,
      });
      state.stamens.push({
        angle: paramsA.bloomPhase + (i + 0.5) * paramsA.sector,
        tip: mix(G.stamenBaseR, paramsA.stamenTipR, closing), opacity: closing,
      });
    }
  }

  if (sameFruit(paramsA, paramsB)) {
    // The fruit already there rides its petal; each new berry lands, and
    // two ripples spread from where it does
    for (let k = paramsA.berries; k < paramsB.berries; k++) {
      const berry = state.berries[k];
      const lands = duration * M.newBerryAt + (k - paramsA.berries) * M.newBerryStepMs;
      const land = easeOut(t, lands, M.newBerryMs);
      berry.scale = mix(M.newBerryScale, 1, land);
      berry.opacity = land;
      const at = berryPoint(state, berry);
      if (!at) continue;
      for (const lag of M.rippleLagsMs) {
        const spread = clamp01((t - lands - lag) / M.rippleMs);
        if (spread > 0 && spread < 1) {
          state.ripples.push({
            x: at[0], y: at[1], r: mix(M.rippleFromR, M.rippleToR, 1 - Math.pow(1 - spread, 3)),
            opacity: M.rippleOpacity * (1 - spread), width: M.rippleWidth,
          });
        }
      }
    }
    if (closing > 0) {
      for (let k = paramsB.berries; k < paramsA.berries; k++) {
        state.berries.push({
          petalIndex: paramsA.berryPetalOrder[k % paramsA.petals],
          rf: berryRf(k, paramsA.petals), scale: 1, opacity: closing,
        });
      }
    }
  } else {
    // A new petal count re-deals which petals bear fruit (the seeded
    // shuffle depends on it): the old fruit lifts away, then the new lands
    const lift = 1 - easeOut(t, 0, duration * M.berryLiftSpan);
    state.berries.forEach((berry, k) => {
      const land = easeOut(t, duration * M.berryRelandAt + k * M.berryStepMs, M.berryMs);
      berry.scale = mix(M.berryLandScale, 1, land);
      berry.opacity = land;
    });
    if (lift > 0) {
      const lifting = [];
      for (let k = 0; k < paramsA.berries; k++) {
        lifting.push({
          petalIndex: paramsA.berryPetalOrder[k % paramsA.petals],
          rf: berryRf(k, paramsA.petals), scale: 1, opacity: lift,
        });
      }
      state.berries = lifting.concat(state.berries);
    }
  }
  return state;
}
