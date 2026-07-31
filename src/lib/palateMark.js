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

// ─── The mark itself ───

function markBody(p) {
  const G = MARK_GEOMETRY;
  const C = MARK_PALETTE;
  const parts = [];

  // Medallion ground + engraved frame + the constant beaded orbit (label
  // beadwork — a deep bloom grows through it)
  parts.push(`<circle cx="80" cy="80" r="${fmt(G.discR)}" fill="${C.disc}"/>`);
  parts.push(
    `<circle cx="80" cy="80" r="${fmt(G.frameOuterR)}" fill="none" stroke="${C.cream}" stroke-width="1.1"/>`
  );
  parts.push(
    `<circle cx="80" cy="80" r="${fmt(G.frameInnerR)}" fill="none" stroke="${C.sage}" stroke-width="0.5"/>`
  );
  parts.push(
    `<circle cx="80" cy="80" r="${fmt(G.orbitR)}" fill="none" stroke="${C.sage}" stroke-width="1" stroke-dasharray="${G.orbitDash}" stroke-linecap="round"/>`
  );

  // Stamens — behind the petals, reaching into the gaps between them
  for (let i = 0; i < p.petals; i++) {
    const a = p.bloomPhase + (i + 0.5) * p.sector;
    parts.push(line(G.stamenBaseR, p.stamenTipR, a, C.line, 0.8));
    const [dx, dy] = polar(p.stamenTipR + 1.8, a);
    parts.push(`<circle cx="${fmt(dx)}" cy="${fmt(dy)}" r="1.3" fill="${C.line}"/>`);
  }

  // Petals + midribs
  for (let i = 0; i < p.petals; i++) {
    const a = p.bloomPhase + i * p.sector;
    parts.push(
      `<path d="${petalPath(a, p)}" fill="${C.petal}" stroke="${C.line}" stroke-width="1.2" stroke-linejoin="round"/>`
    );
    parts.push(
      line(G.petalBaseR + 4, G.petalBaseR + (p.tipR - G.petalBaseR) * 0.72, a, C.cream, 0.7)
    );
  }

  // Berries — fruit on the midribs; the seed picks which petals bear it
  for (let k = 0; k < p.berries; k++) {
    const petalIndex = p.berryPetalOrder[k % p.petals];
    const a = p.bloomPhase + petalIndex * p.sector;
    const rf = k < p.petals ? 0.52 : 0.34; // second pass sits lower
    const r = MARK_GEOMETRY.petalBaseR + (p.tipR - MARK_GEOMETRY.petalBaseR) * rf;
    const [bx, by] = polar(r, a);
    parts.push(
      `<circle cx="${fmt(bx)}" cy="${fmt(by)}" r="${fmt(G.berryR)}" fill="${C.burgundy}" stroke="${C.cream}" stroke-width="0.8"/>`
    );
  }

  // The red/white ring — two open crescents (round caps, a breath of green
  // at each junction): burgundy sweep is the red share, cream the white;
  // neither ever vanishes (a palate is never absolute)
  const gap = G.ringGapDeg;
  const creamSweep = 360 - 2 * gap - p.burgundySweepDeg;
  parts.push(
    `<path d="${arcPath(G.ringR, p.ringPhase, p.burgundySweepDeg)}" fill="none" stroke="${C.burgundy}" stroke-width="${fmt(G.ringWidth)}" stroke-linecap="round"/>`
  );
  parts.push(
    `<path d="${arcPath(G.ringR, p.ringPhase + p.burgundySweepDeg + gap, creamSweep)}" fill="none" stroke="${C.cream}" stroke-width="${fmt(G.ringWidth)}" stroke-linecap="round"/>`
  );

  // Core — the heart of the bloom, a single quiet berry
  parts.push(
    `<circle cx="80" cy="80" r="${fmt(G.coreR)}" fill="${C.burgundy}" stroke="${C.cream}" stroke-width="1"/>`
  );

  return parts.join("");
}

/**
 * The inline mark: decorative (aria-hidden) — every surface shows the title
 * text beside it, which is the accessible name. Returns "" for a missing
 * genome so surfaces degrade to text-only exactly as they do today.
 */
export function renderPalateMark(genome, { size = 96 } = {}) {
  const p = markParams(genome);
  if (!p) return "";
  const v = MARK_GEOMETRY.view;
  return `<svg viewBox="0 0 ${v} ${v}" width="${fmt(size)}" height="${fmt(size)}" aria-hidden="true" role="presentation" focusable="false">${markBody(p)}</svg>`;
}

/**
 * The standalone document: the same mark, complete with xmlns, usable
 * outside React (share card, OG image). Genome in, SVG document out.
 */
export function renderPalateMarkDocument(genome, { size = 640 } = {}) {
  const p = markParams(genome);
  if (!p) return "";
  const v = MARK_GEOMETRY.view;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}" width="${fmt(size)}" height="${fmt(size)}">${markBody(p)}</svg>`;
}
