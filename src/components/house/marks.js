// marks.js — House & Hand: the mark set (docs/marks/README.md §5–§6).
//
// The one copy of every mark's path data. Ported value for value from the
// design source Ed approved on Nov 15, 2026 (docs/marks/design/marks.js);
// marks.test.js holds the two together and source-scans that no other file
// under src/ declares a mark's path. Pure and dependency-free, the way
// palateMark.js is: ids in, SVG strings and plain data out, no DOM — so the
// unit tests load the real module in plain node.
//
// Two hands:
//   printed (the house)  hairline, currentColor: ink on cream, cream inside
//                        a filled circle, burgundy inside an outline one
//   pencil  (you)        burgundy, round caps, one weight. The pencil is only
//                        ever the user's: never on a pick role, a tool, a
//                        Somm line or an empty state
//
// Everything is drawn on a 24 grid except the glass, which sits in a tighter
// 20-unit frame (GLASS_VIEWBOX) so it reads at row size. Its hairline is
// 1.08, not 1.3: scaled by 20/24 so it prints at the tools' weight. Don't
// "fix" it to match (README §12).
//
// Who renders a mark: Mark (any id, settled), PencilGlass (a rating's glass,
// pencilled in when the user rates) and NameGesture (a circle, underline or
// strike over a name). Every mark is aria-hidden: the words beside it say
// the same thing and are its accessible name.
//
// Two departures from the design source, neither in a path: its PENCIL (the
// pencil marks) is PENCIL_MARKS here, because PENCIL in motion.js is the
// penciling's timing; and loopPath asks for a FINITE box (the design source
// would draw "Infinity" for an endless one). Every box a name can make gives
// the design source's path, value for value.

export const MARK_COLORS = { ink: "#1B3D2F", pencil: "#8B2332", cream: "#F5F0E8" };
export const MARK_WEIGHTS = { hairline: 1.3, glassHairline: 1.08, pencil: 1.6, shade: 0.62 };

// ── the glass ───────────────────────────────────────────────────────────
export const GLASS_VIEWBOX = "2 1.85 20 20";
export const GLASS = {
  bowl: "M8.1 3 C 7.1 5.4 6.5 7 6.5 8.7 C 6.5 11.5 8.9 13.5 12 13.5 C 15.1 13.5 17.5 11.5 17.5 8.7 C 17.5 7 16.9 5.4 15.9 3 Z",
  stemAndFoot: "M12 13.5 V20.1 M8.5 20.6 C 10 20.3 14 20.3 15.5 20.6",
  // "Not for me": the same glass, turned over
  turnedDown: "rotate(180 12 11.85)",
};

// The pencil shading, stroke by stroke, in drawing order. Stroke 0 is the
// wine's surface; the rest are the hatching, back and forth. Settled, all of
// them are drawn; when the user rates, one after another (README §7).
export const SHADE = {
  loved: [
    "M7.90 5.42 C 10.50 5.08 13.50 5.60 16.10 5.30",
    "M7.81 6.46 L8.35 5.80",
    "M9.60 5.60 L7.59 7.79",
    "M7.35 8.90 L10.79 5.73",
    "M11.92 5.83 L7.60 9.99",
    "M7.88 10.65 L12.81 5.65",
    "M13.93 5.71 L8.51 11.32",
    "M9.27 11.64 L15.32 5.59",
    "M16.12 6.12 L9.92 12.21",
    "M10.66 12.35 L16.02 7.06",
    "M16.64 7.65 L11.87 12.56",
    "M12.69 12.70 L16.59 8.88",
    "M16.22 10.19 L14.43 12.06",
  ],
  liked: [
    "M7.21 8.62 C 10.50 8.28 13.50 8.80 16.79 8.50",
    "M7.57 9.65 L8.64 8.70",
    "M9.82 8.69 L7.94 10.42",
    "M8.45 11.05 L10.86 8.87",
    "M11.78 8.85 L9.18 11.45",
    "M9.73 12.03 L13.06 8.77",
    "M14.13 8.88 L10.54 12.34",
    "M11.42 12.61 L15.26 8.87",
    "M16.25 9.03 L12.71 12.58",
    "M13.98 12.20 L16.47 9.82",
  ],
  fine: [
    "M7.66 10.82 C 10.50 10.48 13.50 11.00 16.34 10.70",
    "M8.90 11.66 L9.56 10.94",
    "M10.78 11.19 L9.82 11.97",
    "M10.59 12.20 L11.79 10.97",
    "M12.87 11.14 L11.39 12.52",
    "M12.73 12.63 L14.08 11.13",
    "M15.12 11.09 L14.10 12.06",
  ],
};

// ── the pencil ──────────────────────────────────────────────────────────
// One stroke each (24 grid). `dot` is filled, not stroked.
export const PENCIL_MARKS = {
  star: "M12 3.4 C 13.5 8.7 15.2 14 16.9 19.4 C 12.6 16.2 8.1 12.8 3.8 9.6 C 9.3 9.6 14.9 9.4 20.4 9.2 C 16 12.6 11.4 16.1 7 19.6 C 8.7 14.3 10.5 9 12.3 3.9", // want to try
  loop: "M12.5 4 C 6.5 3.6 3 8 3.6 12.6 C 4.2 17.6 9 20.6 13.6 19.8 C 18.4 19 21.2 14.6 20.2 10 C 19.4 6.2 15.6 3.6 10.8 4.6", // on the table
  plus: "M12 5.4 C 12.2 9 11.8 15 12.1 18.7 M5.3 12.2 C 9 11.8 15 12.3 18.8 11.9", // joined your DNA
  minus: "M5.3 12.2 C 9 11.6 15 12.5 18.8 11.9", // left your DNA
  arrow: "M4.4 12.3 C 9 11.8 14 12.4 19.2 12 M14.2 7.4 C 15.8 9.3 17.5 10.8 19.4 12 C 17.6 13.3 16 14.9 14.5 16.8", // you became …
  dot: "M12 9.6 C 13.5 9.5 14.5 10.7 14.4 12.1 C 14.3 13.6 13.1 14.5 11.8 14.4 C 10.4 14.3 9.5 13.1 9.6 11.8 C 9.7 10.5 10.7 9.6 12 9.6 Z", // your palate began
};

// Gestures stretched over a name: an absolutely positioned <svg> with
// preserveAspectRatio="none" and vector-effect="non-scaling-stroke" on the
// path, so the line keeps its weight at any width (NameGesture).
export const GESTURES = {
  circle: { viewBox: "0 0 200 40", d: "M96 3 C 40 1 4 8 4 20 C 4 33 50 38 104 37 C 160 36 197 30 196 18 C 195 7 150 1 78 6" }, // the pick on the table
  underline: { viewBox: "0 0 200 8", d: "M2 4.5 C 40 1.5 80 6.5 120 3.5 C 150 1.5 180 5.5 198 3" }, // a bottle you loved
  strike: { viewBox: "0 0 200 8", d: "M2 5 C 50 2 110 6.5 198 2.5" }, // a bottle you passed on
};

// ── the printed tools ───────────────────────────────────────────────────
// Inner SVG for a 24 viewBox; the parent <g> carries
//   fill="none" stroke="currentColor" stroke-width="1.3"
//   stroke-linecap="round" stroke-linejoin="round"
export const TOOLS = {
  list: "<path d=\"M7.2 3.5 H16.8 C 17.2 3.5 17.5 3.8 17.5 4.2 V19.8 C 17.5 20.2 17.2 20.5 16.8 20.5 H7.2 C 6.8 20.5 6.5 20.2 6.5 19.8 V4.2 C 6.5 3.8 6.8 3.5 7.2 3.5 Z\"/><path d=\"M9.2 8 H14.8 M9.2 11.6 H14.8 M9.2 15.2 H12.6\"/>",
  camera: "<path d=\"M4.6 8 H7.7 L9.2 5.5 H14.8 L16.3 8 H19.4 C 20 8 20.5 8.5 20.5 9.1 V17.9 C 20.5 18.5 20 19 19.4 19 H4.6 C 4 19 3.5 18.5 3.5 17.9 V9.1 C 3.5 8.5 4 8 4.6 8 Z\"/><circle cx=\"12\" cy=\"13.4\" r=\"3.3\"/>",
  bottle: "<path d=\"M10.6 2.8 H13.4 V7.4 C 13.4 9 15.7 9.9 15.7 12.3 V20.2 C 15.7 20.75 15.25 21.2 14.7 21.2 H9.3 C 8.75 21.2 8.3 20.75 8.3 20.2 V12.3 C 8.3 9.9 10.6 9 10.6 7.4 Z\"/><path d=\"M10.6 5 H13.4 M8.3 13.8 H15.7 M8.3 18 H15.7\"/>",
  picture: "<rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"13\" rx=\"1.4\"/><path d=\"M4 16.4 L9 11.6 L12.4 15 L14.9 12.8 L20 17.3\"/><circle cx=\"15.6\" cy=\"9.3\" r=\"1.3\"/>",
  link: "<g transform=\"rotate(-45 12 12)\"><rect x=\"2.4\" y=\"9.3\" width=\"11\" height=\"5.4\" rx=\"2.7\"/><rect x=\"10.6\" y=\"9.3\" width=\"11\" height=\"5.4\" rx=\"2.7\"/></g>",
  loupe: "<circle cx=\"10.5\" cy=\"10.5\" r=\"6\"/><path d=\"M15 15 L20.2 20.2\"/>",
};

/** Each rating's glass (the ids are RATINGS' — @/lib/ratings). */
export const RATING_MARKS = { loved: "glass-loved", liked: "glass-liked", fine: "glass-fine", not_for_me: "glass-down" };

export const MARK_IDS = [
  "glass-loved", "glass-liked", "glass-fine", "glass-down", "glass-empty",
  "star", "loop", "plus", "minus", "arrow", "dot",
  "list", "camera", "bottle", "picture", "link", "loupe",
];

/** The table's own key — never one it inherits ("toString", "__proto__"). */
const owns = (table, id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(table, id);

/** A size in px: a positive finite number, else the default 20. */
export function markSize(size) {
  return typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 20;
}

const pencilAttrs = `fill="none" stroke="${MARK_COLORS.pencil}" stroke-linecap="round" stroke-linejoin="round"`;
const glass = (extra = "") =>
  `<g fill="none" stroke="currentColor" stroke-width="${MARK_WEIGHTS.glassHairline}" stroke-linecap="round" stroke-linejoin="round"${extra}><path d="${GLASS.bowl}"/><path d="${GLASS.stemAndFoot}"/></g>`;
const shade = (id) =>
  `<g ${pencilAttrs} stroke-width="${MARK_WEIGHTS.shade}">${SHADE[id].map((d) => `<path d="${d}"/>`).join("")}</g>`;

/** Every mark id → { viewBox, body }; null for anything else. */
export function markBody(id) {
  if (id === "glass-loved") return { viewBox: GLASS_VIEWBOX, body: shade("loved") + glass() };
  if (id === "glass-liked") return { viewBox: GLASS_VIEWBOX, body: shade("liked") + glass() };
  if (id === "glass-fine") return { viewBox: GLASS_VIEWBOX, body: shade("fine") + glass() };
  if (id === "glass-down") return { viewBox: GLASS_VIEWBOX, body: glass(` transform="${GLASS.turnedDown}"`) };
  if (id === "glass-empty") return { viewBox: GLASS_VIEWBOX, body: glass() };
  if (id === "dot") return { viewBox: "0 0 24 24", body: `<path d="${PENCIL_MARKS.dot}" fill="${MARK_COLORS.pencil}"/>` };
  if (owns(PENCIL_MARKS, id)) {
    return { viewBox: "0 0 24 24", body: `<path d="${PENCIL_MARKS[id]}" ${pencilAttrs} stroke-width="${MARK_WEIGHTS.pencil}"/>` };
  }
  if (owns(TOOLS, id)) {
    return {
      viewBox: "0 0 24 24",
      body: `<g fill="none" stroke="currentColor" stroke-width="${MARK_WEIGHTS.hairline}" stroke-linecap="round" stroke-linejoin="round">${TOOLS[id]}</g>`,
    };
  }
  return null;
}

/** The inline mark: decorative (aria-hidden) — the words beside it are the
 *  accessible name. Unknown id → "" so a surface degrades to its words. */
export function renderMark(id, options) {
  const m = markBody(id);
  if (!m) return "";
  const size = markSize(options?.size ?? 20);
  return `<svg viewBox="${m.viewBox}" width="${size}" height="${size}" aria-hidden="true" focusable="false" data-mark="${id}">${m.body}</svg>`;
}

/**
 * A rating's glass, as PencilGlass draws it: its mark id, its shading in
 * drawing order (none for "not for me") and whether it is turned down. Null
 * for anything that isn't a rating.
 */
export function glassFor(rating) {
  if (!owns(RATING_MARKS, rating)) return null;
  const mark = RATING_MARKS[rating];
  return { mark, shade: owns(SHADE, rating) ? SHADE[rating] : [], turned: mark === "glass-down" };
}

// ── a gesture over a name ───────────────────────────────────────────────
// Where each gesture sits, from the approved reference (px): how far past
// the name it reaches left and right (`reach`), and — the circle — above
// and below (`rise`); the two lines carry their own height, the underline
// its bottom `drop` under the line, the strike its top `at` down the line.
export const GESTURE_FIT = {
  circle: { reach: 12, rise: 7 },
  underline: { reach: 2, height: 7, drop: 5 },
  strike: { reach: 3, height: 7, at: 0.5 },
};

/**
 * The gesture's box before anything is measured — server HTML, a first
 * paint — as CSS over its name's own box. Exact for a name on one line.
 */
export function gestureStyle(kind) {
  if (!owns(GESTURE_FIT, kind)) return null;
  const fit = GESTURE_FIT[kind];
  if (kind === "circle") {
    return { left: -fit.reach, top: -fit.rise, width: `calc(100% + ${2 * fit.reach}px)`, height: `calc(100% + ${2 * fit.rise}px)` };
  }
  const box = { left: -fit.reach, width: `calc(100% + ${2 * fit.reach}px)`, height: fit.height };
  return kind === "underline" ? { ...box, bottom: -fit.drop } : { ...box, top: `${fit.at * 100}%` };
}

const finite = (n) => typeof n === "number" && Number.isFinite(n);
const isRect = (r) => r && finite(r.left) && finite(r.top) && finite(r.right) && finite(r.bottom);

/**
 * Client rects → the name's lines, top to bottom. Rects that share a line
 * (a run split by an element, a link's box and its text) merge into one;
 * slivers narrower than a pixel (a collapsed space at a break) don't count.
 */
export function nameLines(rects) {
  const usable = Array.from(rects || [])
    .filter((r) => isRect(r) && r.right - r.left >= 1 && r.bottom > r.top)
    .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  for (const r of usable) {
    const line = lines[lines.length - 1];
    const shared = line ? Math.min(line.bottom, r.bottom) - Math.max(line.top, r.top) : 0;
    if (line && shared > Math.min(line.bottom - line.top, r.bottom - r.top) / 2) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ ...r });
    }
  }
  return lines;
}

/**
 * Where a gesture goes over a name that has been measured, in px from
 * `origin` (the top left its <svg> is positioned from). The circle goes
 * round the whole name; the underline and the strike go on its LAST line,
 * so a name that wraps is underlined or struck where it ends. Null for an
 * unknown gesture or a name with no lines.
 */
export function gestureBox(kind, lines, origin) {
  if (!owns(GESTURE_FIT, kind) || !Array.isArray(lines) || !lines.length || !lines.every(isRect)) return null;
  const o = { x: finite(origin?.left) ? origin.left : 0, y: finite(origin?.top) ? origin.top : 0 };
  const fit = GESTURE_FIT[kind];
  if (kind === "circle") {
    const left = Math.min(...lines.map((l) => l.left));
    const right = Math.max(...lines.map((l) => l.right));
    const top = Math.min(...lines.map((l) => l.top));
    const bottom = Math.max(...lines.map((l) => l.bottom));
    return {
      left: left - fit.reach - o.x, top: top - fit.rise - o.y,
      width: right - left + 2 * fit.reach, height: bottom - top + 2 * fit.rise,
    };
  }
  const last = lines[lines.length - 1];
  const top = kind === "underline"
    ? last.bottom + fit.drop - fit.height
    : last.top + (last.bottom - last.top) * fit.at;
  return {
    left: last.left - fit.reach - o.x, top: top - o.y,
    width: last.right - last.left + 2 * fit.reach, height: fit.height,
  };
}

// ── the loop: the circle round a WRAPPED name (README §13.1) ────────────
// GESTURES.circle, stretched, is right for a name on one line. Over a name
// that wraps it becomes a tall ellipse and cuts across the corners of the
// first and last lines. The loop is built in pixels for the box it goes
// round, so its corners keep one radius however tall the name is. Pure: the
// same box gives the same path. w, h are the loop's own box in px (the
// name's block plus the circle's padding — gestureBox("circle", …)); the
// path starts top-centre, runs anticlockwise and overlaps its start, as the
// approved one-line circle does. "" for a box that isn't one.
export function loopPath(w, h) {
  if (!finite(w) || !finite(h) || !(w > 0) || !(h > 0)) return "";
  const r = Math.min(18, h / 2 - 1, w / 4);
  const k = 0.55 * r;
  const f = (n) => String(Math.round(n * 100) / 100);
  const p = (x, y) => `${f(x)} ${f(y)}`;
  // an edge with a slight wobble: a hand never draws a ruler line
  const edge = (x1, y1, x2, y2, wob) => {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * wob, ny = (dx / len) * wob;
    return `C ${p(x1 + dx / 3 + nx, y1 + dy / 3 + ny)} ${p(x1 + (2 * dx) / 3 - nx, y1 + (2 * dy) / 3 - ny)} ${p(x2, y2)}`;
  };
  return [
    `M ${p(w * 0.5, 2)}`,
    edge(w * 0.5, 2, r + 1, 1.4, 0.9),
    `C ${p(r + 1 - k, 1.4)} ${p(1.4, r + 1 - k)} ${p(1.4, r + 1)}`,
    edge(1.4, r + 1, 2.2, h - r - 1, 1.1),
    `C ${p(2.2, h - r - 1 + k)} ${p(r + 1 - k, h - 1.6)} ${p(r + 1, h - 1.6)}`,
    edge(r + 1, h - 1.6, w - r - 1, h - 2.4, 1.2),
    `C ${p(w - r - 1 + k, h - 2.4)} ${p(w - 1.4, h - r - 1 + k)} ${p(w - 1.4, h - r - 1)}`,
    edge(w - 1.4, h - r - 1, w - 2.4, r + 1, 1.1),
    `C ${p(w - 2.4, r + 1 - k)} ${p(w - r - 1 + k, 2.6)} ${p(w - r - 1, 2.6)}`,
    edge(w - r - 1, 2.6, w * 0.4, 4.6, 0.9),
  ].join(" ");
}
