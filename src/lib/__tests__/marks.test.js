// Marks — House & Hand's mark set (docs/marks/README.md §5–§6, §10)
// Run with: node src/lib/__tests__/marks.test.js
//
// Tests the REAL module: src/components/house/marks.js is dependency-free,
// loaded via dynamic import, beside the design source it was ported from
// (docs/marks/design/marks.js). What's locked:
//
//   1. The paths are exact: every value the design source holds is the
//      production module's, and every mark renders byte for byte the same.
//   2. Every id in MARK_IDS renders; every rating in RATINGS names a glass
//      that exists; renderMark is deterministic and returns "" for junk —
//      inherited keys ("toString", "__proto__") included.
//   3. The two hands: the house prints in currentColor at its hairline, the
//      pencil is burgundy at one weight, the glass's hairline is 20/24 of
//      the tools'. The shading arrays are non-empty, stroke 0 is the wine's
//      surface and the rest are single hatching strokes.
//   4. glassFor: a rating's glass, its shading and whether it is turned down.
//   5. A gesture over a name (README §14.1): the CSS box for one line, lines
//      merged from client rects, the circle ONE box round the whole name,
//      and the underline and strike one box PER LINE, in order, each on its
//      own line — with no two neighbouring lines sharing a drawing.
//   6. SOURCE SCAN: no other file under src/ declares a mark's path data.
//   7. The loop is gone (README §14.1): the circle is the one stretched
//      drawing, and nothing under src/ builds another.
//   8. SOURCE SCANS for Session 2: where the pencil plays (H3) — a glass is
//      pencilled in only on a tile, a done line, home's reply, the wine
//      page's verdict and Log's saved eyebrow; a gesture only where the user
//      makes it — and no mark rides inside a written line.
//   9. THE EMOJI SCAN (Session 3, README §10): no file under src/, comments
//      and tests included, contains an emoji other than a country's flag —
//      written out or as an escape — and the house's furniture names its
//      printed tools by id.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`ASSERT FAILED: ${msg} — expected ${e}, got ${a}`);
}

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const MODULE = join(SRC, "components", "house", "marks.js");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(js|jsx|ts|tsx|css|svg)$/.test(name) ? [path] : [];
  });
}

/** Every `d="…"` inside a fragment of SVG markup. */
const pathsIn = (markup) => [...markup.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);

/** A rect as a browser reports it. */
const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

async function main() {
  const marks = await import("../../components/house/marks.js");
  const design = await import("../../../docs/marks/design/marks.js");
  const { RATINGS } = await import("../ratings.js");
  const {
    MARK_COLORS, MARK_WEIGHTS, GLASS_VIEWBOX, GLASS, SHADE, PENCIL_MARKS, GESTURES, TOOLS, RATING_MARKS, MARK_IDS,
    GESTURE_FIT, markBody, renderMark, markSize, glassFor, gestureStyle, nameLines, gestureBoxes, gestureDrawing,
  } = marks;

  console.log("\n═══ 1. The paths are exact — the design source, value for value ═══");

  await test("every table is the design source's (its PENCIL is PENCIL_MARKS here)", () => {
    assertEq(MARK_COLORS, design.MARK_COLORS, "MARK_COLORS");
    assertEq(MARK_WEIGHTS, design.MARK_WEIGHTS, "MARK_WEIGHTS");
    assertEq(GLASS_VIEWBOX, design.GLASS_VIEWBOX, "GLASS_VIEWBOX");
    assertEq(GLASS, design.GLASS, "GLASS");
    assertEq(SHADE, design.SHADE, "SHADE");
    assertEq(PENCIL_MARKS, design.PENCIL, "the pencil marks");
    assertEq(GESTURES, design.GESTURES, "GESTURES — `more`, the further drawings for a wrapped name, included");
    for (const kind of ["underline", "strike"]) {
      assertEq(GESTURES[kind].more.length, 2, `${kind}: two further drawings (§14.1)`);
      assertEq(GESTURES[kind].more, design.GESTURES[kind].more, `${kind}.more`);
    }
    assert(!("more" in GESTURES.circle), "the circle is one drawing, always");
    assert(!("loopPath" in design) && !("loopPath" in marks), "no loop: neither module builds one (§14.1)");
    assertEq(TOOLS, design.TOOLS, "TOOLS");
    assertEq(RATING_MARKS, design.RATING_MARKS, "RATING_MARKS");
    assertEq(MARK_IDS, design.MARK_IDS, "MARK_IDS");
  });

  await test("every mark renders byte for byte as the design source draws it, at every size", () => {
    for (const id of MARK_IDS) {
      assertEq(markBody(id), design.markBody(id), `markBody(${id})`);
      for (const size of [undefined, 14, 20, 26, 30, 48, 12.5]) {
        const options = size === undefined ? undefined : { size };
        assertEq(renderMark(id, options), design.renderMark(id, options), `renderMark(${id}, ${size})`);
      }
    }
  });

  console.log("\n═══ 2. Every mark renders; junk renders nothing ═══");

  await test("every id in MARK_IDS renders: one svg, aria-hidden, unfocusable, data-mark, its size", () => {
    assertEq(new Set(MARK_IDS).size, MARK_IDS.length, "no id twice");
    for (const id of MARK_IDS) {
      const svg = renderMark(id, { size: 26 });
      assert(svg.startsWith("<svg ") && svg.endsWith("</svg>"), `${id} is one svg`);
      assertEq((svg.match(/<svg\b/g) || []).length, 1, `${id}: one svg element`);
      assert(svg.includes(' aria-hidden="true"') && svg.includes(' focusable="false"'), `${id} is decorative`);
      assert(svg.includes(` data-mark="${id}"`), `${id} carries data-mark`);
      assert(svg.includes(' width="26" height="26"'), `${id} takes its size`);
      assert(pathsIn(svg).length > 0 || /<(rect|circle)\b/.test(svg), `${id} draws something`);
      assert(!/undefined|NaN|\[object/.test(svg), `${id} leaks a junk value`);
    }
  });

  await test("every rating in RATINGS names a glass that exists — and nothing else does", () => {
    assertEq(Object.keys(RATING_MARKS).sort(), RATINGS.map((r) => r.id).sort(), "one glass per rating, no extras");
    for (const r of RATINGS) {
      assert(MARK_IDS.includes(RATING_MARKS[r.id]), `${r.id} names ${RATING_MARKS[r.id]}, which isn't a mark`);
      assert(renderMark(RATING_MARKS[r.id]) !== "", `${r.id}'s glass renders`);
    }
    assertEq(new Set(Object.values(RATING_MARKS)).size, RATINGS.length, "four ratings, four glasses");
    // THE rating vocabulary names the same glass (Session 2: `mark` replaced `emoji`)
    for (const r of RATINGS) assertEq(r.mark, RATING_MARKS[r.id], `ratings.js: ${r.id}'s mark`);
  });

  await test("renderMark is deterministic", () => {
    for (const id of MARK_IDS) {
      const a = renderMark(id, { size: 30 });
      const b = renderMark(id, { size: 30 });
      assert(a === b, `${id} twice`);
    }
  });

  await test("junk renders nothing — inherited keys included — and never throws", () => {
    const junk = [
      undefined, null, "", "nonsense", "Star", " star", "glass", "glass-", 0, 1, true, {}, [], ["star"],
      "toString", "constructor", "__proto__", "hasOwnProperty", "valueOf", "circle", "underline", "strike",
    ];
    for (const id of junk) {
      assertEq(markBody(id), null, `markBody(${JSON.stringify(id)})`);
      assertEq(renderMark(id), "", `renderMark(${JSON.stringify(id)})`);
      assertEq(renderMark(id, { size: 20 }), "", `renderMark(${JSON.stringify(id)}, size)`);
    }
  });

  await test("a size is a positive finite number, else 20 — never NaN in the markup", () => {
    assertEq(markSize(26), 26, "a number");
    assertEq(markSize(12.5), 12.5, "a fraction");
    for (const junk of [undefined, null, 0, -4, NaN, Infinity, "26", {}, true]) {
      assertEq(markSize(junk), 20, `markSize(${String(junk)})`);
    }
    assert(renderMark("star", { size: NaN }).includes(' width="20" height="20"'), "a NaN size draws at 20");
    assert(renderMark("star", null).includes(' width="20"'), "null options draw at 20");
  });

  console.log("\n═══ 3. Two hands ═══");

  const TOOL_IDS = Object.keys(TOOLS);
  const PENCIL_IDS = Object.keys(PENCIL_MARKS);
  const GLASS_IDS = MARK_IDS.filter((id) => id.startsWith("glass-"));

  await test("MARK_IDS is the five glasses, the six pencil marks and the six tools", () => {
    assertEq(GLASS_IDS, ["glass-loved", "glass-liked", "glass-fine", "glass-down", "glass-empty"], "the glasses");
    assertEq(PENCIL_IDS, ["star", "loop", "plus", "minus", "arrow", "dot"], "the pencil marks");
    assertEq(TOOL_IDS, ["list", "camera", "bottle", "picture", "link", "loupe"], "the six tools (H8)");
    assertEq([...MARK_IDS].sort(), [...GLASS_IDS, ...PENCIL_IDS, ...TOOL_IDS].sort(), "nothing else");
  });

  await test("the house prints: tools in currentColor at the hairline, no color of their own", () => {
    for (const id of TOOL_IDS) {
      const svg = renderMark(id);
      assert(svg.includes('stroke="currentColor"') && svg.includes(`stroke-width="${MARK_WEIGHTS.hairline}"`), `${id} prints`);
      assert(!svg.includes("#"), `${id} names a color — the house prints in currentColor`);
      assert(svg.includes('viewBox="0 0 24 24"'), `${id} is on the 24 grid`);
    }
    assertEq(MARK_WEIGHTS.hairline, 1.3, "hairline (§5)");
  });

  await test("the pencil is burgundy, one weight, round caps — and only ever the pencil", () => {
    assertEq(MARK_COLORS.pencil, "#8B2332", "burgundy");
    assertEq(MARK_WEIGHTS.pencil, 1.6, "one weight (§5)");
    for (const id of PENCIL_IDS) {
      const svg = renderMark(id);
      const colors = [...svg.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0]);
      assert(colors.length > 0 && colors.every((c) => c === MARK_COLORS.pencil), `${id} is pencil only`);
      assert(!svg.includes("currentColor"), `${id} takes no printed ink`);
      if (id === "dot") assert(svg.includes(`fill="${MARK_COLORS.pencil}"`) && !svg.includes("stroke="), "the dot is filled, not stroked");
      else assert(svg.includes(`stroke-width="${MARK_WEIGHTS.pencil}"`) && svg.includes('stroke-linecap="round"'), `${id}'s stroke`);
    }
  });

  await test("the glass: printed in currentColor at 20/24 of the hairline, shaded in pencil at 0.62", () => {
    assertEq(GLASS_VIEWBOX, "2 1.85 20 20", "the tighter 20-unit frame");
    assertEq(MARK_WEIGHTS.glassHairline, 1.08, "1.08, not 1.3 — don't fix it to match (§12)");
    assert(Math.abs(MARK_WEIGHTS.glassHairline - MARK_WEIGHTS.hairline * 20 / 24) < 0.005, "it prints at the tools' weight");
    assertEq(MARK_WEIGHTS.shade, 0.62, "the shading is finer");
    for (const id of GLASS_IDS) {
      const svg = renderMark(id);
      assert(svg.includes(`viewBox="${GLASS_VIEWBOX}"`), `${id}'s frame`);
      assert(svg.includes(`stroke="currentColor" stroke-width="${MARK_WEIGHTS.glassHairline}"`), `${id} is printed`);
      assert(svg.includes(`d="${GLASS.bowl}"`) && svg.includes(`d="${GLASS.stemAndFoot}"`), `${id} is the glass`);
    }
    assertEq(pathsIn(renderMark("glass-empty")), [GLASS.bowl, GLASS.stemAndFoot], "pending: the empty glass, upright");
    assert(!renderMark("glass-empty").includes("transform"), "upright");
    assert(renderMark("glass-down").includes(`transform="${GLASS.turnedDown}"`), "not for me: turned down");
    assertEq(pathsIn(renderMark("glass-down")), [GLASS.bowl, GLASS.stemAndFoot], "…and empty: it draws nothing (§7)");
    assertEq(GLASS.turnedDown, "rotate(180 12 11.85)", "turned about the frame's centre");
  });

  await test("the shading: full, half, a sip — stroke 0 the surface, the rest single hatching strokes", () => {
    assertEq(Object.keys(SHADE), ["loved", "liked", "fine"], "three levels; not for me has none");
    const surfaces = {};
    for (const [level, strokes] of Object.entries(SHADE)) {
      assert(Array.isArray(strokes) && strokes.length > 1, `${level} has a surface and hatching`);
      assert(/^M[\d.]+ [\d.]+ C [\d. ]+$/.test(strokes[0]), `${level}'s stroke 0 is a curve — the wine's surface`);
      for (const d of strokes.slice(1)) {
        assert(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/.test(d), `${level}: "${d}" is one straight hatching stroke`);
      }
      assertEq(new Set(strokes).size, strokes.length, `${level}: no stroke twice`);
      surfaces[level] = Number(strokes[0].split(" ")[1]);
      const svg = renderMark(`glass-${level}`);
      assertEq(pathsIn(svg), [...strokes, GLASS.bowl, GLASS.stemAndFoot], `glass-${level} draws its shading under the glass`);
      assert(svg.includes(`stroke-width="${MARK_WEIGHTS.shade}"`), `glass-${level}'s shading is fine`);
    }
    assert(surfaces.loved < surfaces.liked && surfaces.liked < surfaces.fine, "full sits highest, a sip lowest");
    assert(SHADE.loved.length > SHADE.liked.length && SHADE.liked.length > SHADE.fine.length, "more wine, more strokes");
  });

  console.log("\n═══ 4. glassFor ═══");

  await test("a rating's glass: its mark, its shading in drawing order, turned only for not for me", () => {
    for (const level of ["loved", "liked", "fine"]) {
      assertEq(glassFor(level), { mark: `glass-${level}`, shade: SHADE[level], turned: false }, level);
      assert(glassFor(level).shade === SHADE[level], `${level} hands back THE shading, not a copy`);
    }
    assertEq(glassFor("not_for_me"), { mark: "glass-down", shade: [], turned: true }, "not for me");
    for (const junk of [undefined, null, "", "Loved", "glass-loved", "toString", "__proto__", 3, {}]) {
      assertEq(glassFor(junk), null, `glassFor(${JSON.stringify(junk)})`);
    }
  });

  console.log("\n═══ 5. A gesture over a name ═══");

  await test("the CSS box for one line: the approved reference's placements", () => {
    assertEq(GESTURE_FIT, {
      circle: { reach: 12, rise: 7 },
      underline: { reach: 2, height: 7, drop: 5 },
      strike: { reach: 3, height: 7, at: 0.5 },
    }, "GESTURE_FIT");
    assertEq(gestureStyle("circle"), { left: -12, top: -7, width: "calc(100% + 24px)", height: "calc(100% + 14px)" }, "circle");
    assertEq(gestureStyle("underline"), { left: -2, width: "calc(100% + 4px)", height: 7, bottom: -5 }, "underline");
    assertEq(gestureStyle("strike"), { left: -3, width: "calc(100% + 6px)", height: 7, top: "50%" }, "strike");
    for (const junk of [undefined, null, "", "star", "loop", "toString", "Circle"]) {
      assertEq(gestureStyle(junk), null, `gestureStyle(${JSON.stringify(junk)})`);
    }
  });

  await test("nameLines: one line per line, top to bottom — runs on a line merge, slivers drop", () => {
    const lines = nameLines([
      rect(40, 30, 120, 52), // line 2 — a run of text
      rect(10, 4, 180, 26), // line 1
      rect(120, 31, 150, 51), // line 2 — a nested link's text, same line
      rect(180, 4, 180.4, 26), // a collapsed space at the break
      rect(118, 28, 152, 53), // line 2 — that link's own box
    ]);
    assertEq(lines, [
      { left: 10, top: 4, right: 180, bottom: 26 },
      { left: 40, top: 28, right: 152, bottom: 53 },
    ], "two lines");
    assertEq(nameLines([]), [], "no rects");
    for (const junk of [undefined, null, 7, "rects", [null, {}, { left: NaN, top: 0, right: 2, bottom: 2 }]]) {
      assertEq(nameLines(junk), [], `nameLines(${JSON.stringify(junk)})`);
    }
    // A DOMRectList is array-like, not an array
    assertEq(nameLines({ length: 1, 0: rect(0, 0, 50, 20) }), [{ left: 0, top: 0, right: 50, bottom: 20 }], "array-like");
  });

  await test("one line: one box, the CSS box in px — and the approved drawing, unchanged", () => {
    const line = [{ left: 100, top: 200, right: 300, bottom: 224 }];
    const origin = { left: 100, top: 200 };
    assertEq(gestureBoxes("circle", line, origin), [{ left: -12, top: -7, width: 224, height: 38 }], "circle");
    assertEq(gestureBoxes("underline", line, origin), [{ left: -2, top: 22, width: 204, height: 7 }], "underline: its bottom 5px under");
    assertEq(gestureBoxes("strike", line, origin), [{ left: -3, top: 12, width: 206, height: 7 }], "strike: from the middle");
    for (const kind of ["circle", "underline", "strike"]) {
      assertEq(gestureDrawing(kind), GESTURES[kind].d, `${kind}: a one-line name draws what it always drew`);
      assertEq(gestureDrawing(kind, 0), GESTURES[kind].d, `${kind}, line 0`);
    }
  });

  const WRAPPED = [
    { left: 20, top: 100, right: 210, bottom: 124 }, // "Domaine Huet Le Haut-Lieu"
    { left: 20, top: 128, right: 132, bottom: 152 }, // "Vouvray Sec 2021"
  ];

  await test("a wrapped name is circled whole: ONE box, the one stretched drawing (§14.1)", () => {
    const origin = { left: 20, top: 100 }; // the first line's top left, as an inline box's origin usually is
    assertEq(gestureBoxes("circle", WRAPPED, origin), [{ left: -12, top: -7, width: 214, height: 66 }], "circle: the whole block");
    const wider = [{ left: 60, top: 0, right: 120, bottom: 20 }, { left: 0, top: 20, right: 200, bottom: 40 }];
    assertEq(gestureBoxes("circle", wider, { left: 0, top: 0 }), [{ left: -12, top: -7, width: 224, height: 54 }], "the union");
    const four = [0, 1, 2, 3].map((i) => ({ left: 0, top: i * 26, right: 100 + i, bottom: i * 26 + 22 }));
    assertEq(gestureBoxes("circle", four, null).length, 1, "four lines, still one circle");
    for (const line of [1, 2, 3, 7]) assertEq(gestureDrawing("circle", line), GESTURES.circle.d, `the circle has one drawing (line ${line})`);
  });

  await test("a wrapped name is underlined and struck on EVERY line: one box per line, in order, each on its own line", () => {
    const origin = { left: 20, top: 100 };
    assertEq(gestureBoxes("underline", WRAPPED, origin), [
      { left: -2, top: 22, width: 194, height: 7 },
      { left: -2, top: 50, width: 116, height: 7 },
    ], "underline: under each line, each its own width");
    assertEq(gestureBoxes("strike", WRAPPED, origin), [
      { left: -3, top: 12, width: 196, height: 7 },
      { left: -3, top: 40, width: 118, height: 7 },
    ], "strike: through each line");
    // An engine that puts an inline box's origin elsewhere only moves the frame of reference
    assertEq(gestureBoxes("underline", WRAPPED, { left: 0, top: 90 }), [
      { left: 18, top: 32, width: 194, height: 7 },
      { left: 18, top: 60, width: 116, height: 7 },
    ], "measured from the origin given");
    // Any number of lines, ragged widths, a last line wider than the first:
    // box i belongs to line i — inside its vertical band (the underline's
    // drop under it aside) and exactly as wide as that line plus its reach
    const ragged = [
      { left: 60, top: 0, right: 120, bottom: 22 }, { left: 0, top: 26, right: 200, bottom: 48 },
      { left: 0, top: 52, right: 90, bottom: 74 }, { left: 0, top: 78, right: 143.5, bottom: 100 },
    ];
    for (const kind of ["underline", "strike"]) {
      const fit = GESTURE_FIT[kind];
      const boxes = gestureBoxes(kind, ragged, { left: 0, top: 0 });
      assertEq(boxes.length, ragged.length, `${kind}: as many boxes as lines`);
      boxes.forEach((box, i) => {
        const line = ragged[i];
        assert(box.top >= line.top && box.top <= line.bottom, `${kind} ${i}: starts inside its own line (${box.top})`);
        assert(box.top + box.height <= line.bottom + (kind === "underline" ? fit.drop : 0), `${kind} ${i}: ends with its own line`);
        if (ragged[i + 1]) assert(box.top + box.height <= ragged[i + 1].top + (kind === "underline" ? fit.drop : 0), `${kind} ${i}: clear of the next line's words`);
        assertEq(box.left, line.left - fit.reach, `${kind} ${i}: its own line's left`);
        assertEq(box.width, line.right - line.left + 2 * fit.reach, `${kind} ${i}: its own line's width`);
        assertEq(box.height, fit.height, `${kind} ${i}: a single line's height`);
        if (i) assert(box.top > boxes[i - 1].top, `${kind}: top line first`);
      });
    }
  });

  await test("no two neighbouring lines share a drawing: line i takes drawing i mod 3, the approved d first", () => {
    for (const kind of ["underline", "strike"]) {
      const drawings = [GESTURES[kind].d, ...GESTURES[kind].more];
      assertEq(new Set(drawings).size, 3, `${kind}: three different drawings`);
      for (let i = 0; i < 9; i++) {
        assertEq(gestureDrawing(kind, i), drawings[i % 3], `${kind}, line ${i}`);
        assert(gestureDrawing(kind, i) !== gestureDrawing(kind, i + 1), `${kind}: lines ${i} and ${i + 1} differ`);
      }
      // Every drawing runs the box's width, left to right, inside the 200 × 8 frame
      for (const d of drawings) {
        const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
        const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
        assert(xs[0] <= 3 && xs[xs.length - 1] >= 197, `${kind}: "${d}" spans its line`);
        assert(xs.every((x) => x >= 0 && x <= 200) && ys.every((y) => y >= 0 && y <= 8), `${kind}: "${d}" stays in its frame`);
        assert(/^M[\d.]+ [\d.]+( C( [\d.]+){6})+$/.test(d), `${kind}: one stroke`);
      }
    }
  });

  await test("junk gives nothing: an unknown gesture, no lines or junk lines → []; a missing origin is 0,0", () => {
    const line = [{ left: 0, top: 0, right: 10, bottom: 10 }];
    for (const kind of [undefined, null, "", "star", "toString", "more"]) {
      assertEq(gestureBoxes(kind, line, { left: 0, top: 0 }), [], `kind ${JSON.stringify(kind)}`);
      assertEq(gestureDrawing(kind), "", `gestureDrawing(${JSON.stringify(kind)})`);
      assertEq(gestureDrawing(kind, 2), "", `gestureDrawing(${JSON.stringify(kind)}, 2)`);
    }
    for (const kind of ["circle", "underline", "strike"]) {
      for (const lines of [undefined, null, [], "lines", [null], [{ left: 0 }], [line[0], null]]) {
        assertEq(gestureBoxes(kind, lines, { left: 0, top: 0 }), [], `${kind}: lines ${JSON.stringify(lines)}`);
      }
      // A junk line number is the first line's drawing, never undefined
      for (const junk of [undefined, null, -1, 1.5, NaN, Infinity, "2", {}]) {
        assertEq(gestureDrawing(kind, junk), GESTURES[kind].d, `${kind}: gestureDrawing(${String(junk)})`);
      }
    }
    assertEq(gestureBoxes("underline", line, undefined), [{ left: -2, top: 8, width: 14, height: 7 }], "no origin");
    assertEq(gestureBoxes("underline", line, { left: NaN, top: "x" }), [{ left: -2, top: 8, width: 14, height: 7 }], "a junk origin");
  });

  console.log("\n═══ 6. SOURCE SCAN ═══");

  await test("SOURCE SCAN: no other file under src/ declares a mark's path data", () => {
    // Every path the module holds, and each one's opening — a copy that
    // drifted at its end is still a second copy
    const all = [
      GLASS.bowl, GLASS.stemAndFoot, ...Object.values(SHADE).flat(), ...Object.values(PENCIL_MARKS),
      ...Object.values(GESTURES).flatMap((g) => [g.d, ...(g.more || [])]), ...Object.values(TOOLS).flatMap(pathsIn),
    ];
    assert(all.length > 40, "the scan knows the paths");
    const openings = [...new Set(all.map((d) => d.slice(0, 14)))];
    const toolShapes = Object.values(TOOLS).flatMap((t) => [...t.matchAll(/<(rect|circle)\b[^>]*>/g)].map((m) => m[0].slice(0, 26)));
    const offenders = sourceFiles(SRC)
      .filter((path) => path !== MODULE)
      .filter((path) => {
        const source = readFileSync(path, "utf-8");
        return openings.some((d) => source.includes(d)) || toolShapes.some((s) => source.includes(s));
      })
      .map((path) => relative(SRC, path));
    assertEq(offenders, [], "import the mark from @/components/house/marks (or render <Mark>)");
  });

  await test("SOURCE SCAN: the scan would catch a copy (it sees the design source's own)", () => {
    const designSource = readFileSync(join(REPO, "docs", "marks", "design", "marks.js"), "utf-8");
    assert(designSource.includes(GLASS.bowl.slice(0, 14)), "the design source holds the bowl");
    assert(designSource.includes(SHADE.loved[3].slice(0, 14)), "and the shading");
  });

  console.log("\n═══ 7. The loop is gone (§14.1) ═══");

  await test("SOURCE SCAN: the circle is the one stretched drawing — nothing under src/ builds a loop", () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => /\bloopPath\b|data-loop|0\.55 \* r|h \/ 2 - 1, w \/ 4/.test(readFileSync(path, "utf-8")))
      .map((path) => relative(SRC, path));
    assertEq(offenders, [], "a wrapped name's circle is GESTURES.circle, stretched");
    const gesture = readFileSync(join(SRC, "components", "house", "NameGesture.js"), "utf-8");
    assert(/viewBox=\{GESTURES\[kind\]\.viewBox\} preserveAspectRatio="none"/.test(gesture), "every stroke is stretched over its own box");
    assert(/d=\{gestureDrawing\(kind, line\)\}/.test(gesture) && /gestureBoxes\(kind,/.test(gesture), "one <svg> per box, its drawing chosen by its line");
  });

  console.log("\n═══ 8. Where the pencil plays (README §7, H3) ═══");

  const using = (pattern) => sourceFiles(SRC)
    .filter((path) => pattern.test(readFileSync(path, "utf-8").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")))
    .map((path) => relative(SRC, path))
    .sort();

  await test("the specimen is gone: nothing under src/ or e2e/ is a marks specimen (Session 3)", () => {
    assert(!existsSync(join(SRC, "app", "marks-specimen")), "src/app/marks-specimen is deleted");
    assert(!existsSync(join(REPO, "e2e", "marks.spec.ts")), "e2e/marks.spec.ts went with it");
    const offenders = sourceFiles(SRC).filter((path) => /marks-specimen/.test(readFileSync(path, "utf-8"))).map((path) => relative(SRC, path));
    assertEq(offenders, [], "nothing links to it");
  });

  await test("SOURCE SCAN: a glass is pencilled in only when you rate — the tile, the done line, home's reply, the wine page's verdict, Log's saved eyebrow", () => {
    assertEq(using(/draw=\{[^}]*"tile"/), [join("components", "house", "RatingTiles.js")], 'draw "tile": the tapped tile, nowhere else');
    assertEq(using(/draw=("line"|\{[^}]*"line")/), [
      join("app", "log", "SavedStep.js"), join("app", "page.js"), join("app", "wine", "WinePage.js"),
      join("components", "house", "RatingTiles.js"),
    ].sort(), 'draw "line": that rating\'s done line, and the three surfaces that have no DoneLine');
    // Every other glass is a settled Mark or PencilGlass: no draw at all
    const tiles = readFileSync(join(SRC, "components", "house", "RatingTiles.js"), "utf-8");
    assert(/<PencilGlass rating=\{rating\.id\} size=\{v\.glass\} guide draw=\{chosen \? "tile" : false\}/.test(tiles), "a tile: its guide at rest, drawn when it is the answer");
    const list = readFileSync(join(SRC, "components", "house", "RatingList.js"), "utf-8");
    assert(!/PencilGlass|draw=/.test(list), "Log's rating list shows settled glasses: choosing a line isn't rating yet");
  });

  await test("SOURCE SCAN: a gesture is pencilled in only where the user makes it — a pick chosen, a rec passed on, the saved step's news", () => {
    assertEq(using(/<NameGesture[^>]*\bdraw\b/), [
      join("app", "log", "SavedStep.js"), join("app", "recommend", "PickEntry.js"), join("components", "house", "WineRow.js"),
    ].sort(), "NameGesture draw");
    // WineRow only draws when its caller says the mark was just made
    assertEq(using(/\bdrawGesture\b/), [join("components", "WineRecList.js"), join("components", "house", "WineRow.js")].sort(), "drawGesture");
    const pick = readFileSync(join(SRC, "app", "recommend", "PickEntry.js"), "utf-8");
    assert(/draw=\{chosenHere\.current\}/.test(pick), "a pick's circle is drawn only when it was chosen here");
  });

  await test("SOURCE SCAN: a mark is never inside a written line (README §12) — DoneLine sets it beside the words", () => {
    const tiles = readFileSync(join(SRC, "components", "house", "RatingTiles.js"), "utf-8");
    const done = tiles.slice(tiles.indexOf("export function DoneLine"));
    assert(/<WriteIn text=\{children\} data-done-text=""/.test(done), "the written part is the words alone");
    assert(done.indexOf("<PencilGlass") < done.indexOf("<WriteIn text={children} data-done-text"), "the glass comes before the words, a sibling");
    // No file hands WriteIn anything but text
    const offenders = sourceFiles(SRC).filter((path) => readFileSync(path, "utf-8").includes("</WriteIn>")).map((path) => relative(SRC, path));
    assertEq(offenders, [], "WriteIn takes `text`, never children");
  });

  await test("SOURCE SCAN: no component reads a rating's emoji — the vocabulary names a mark", () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => /\b(rated|rating|r)\??\.emoji\b|ratingFor\([^)]*\)\??\.emoji/.test(readFileSync(path, "utf-8")))
      .map((path) => relative(SRC, path));
    assertEq(offenders, [], "use the rating's `mark` with <Mark> or <PencilGlass>");
    const ratings = readFileSync(join(SRC, "lib", "ratings.js"), "utf-8");
    assert(!/emoji:/.test(ratings), "ratings.js declares no emoji");
  });

  console.log("\n═══ 9. The emoji leave (README §8, §10, H9) ═══");

  // What counts as an emoji: anything Unicode draws as a picture
  // (Extended_Pictographic), the selector that turns a text glyph into one
  // (U+FE0F), a skin tone, a joiner or a keycap. What doesn't: a flag — two
  // regional indicators, the one emoji that stays (H9) — and type: the
  // glyphs below are Extended_Pictographic by the standard but are set as
  // text here and never carry U+FE0F. The scan's own pattern is written in
  // escapes, so this file passes it too.
  const TYPE_GLYPHS = new Set(["©", "®", "™", "↔", "↗", "↘"]); // © ® ™ ↔ ↗ ↘
  const PICTURE = /\p{Extended_Pictographic}|[\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;
  const emojiIn = (text) => (text.match(PICTURE) || []).filter((c) => !TYPE_GLYPHS.has(c));
  // …and the same thing spelled as an escape, in source that ships (a test
  // may need one to say what it forbids): a surrogate pair, a braced code
  // point, a bare sparkle or selector, an HTML entity
  const ESCAPED = /\\u(?:[dD]8[3-9a-fA-F][0-9a-fA-F]|[dD][c-fC-F][0-9a-fA-F]{2}|2728|2[bB]50|[fF][eE]0[fF]|200[dD])|\\u\{1[fF][0-9a-fA-F]{3}\}|&#x1[fF][0-9a-fA-F]{3};/g;
  const everyFile = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return everyFile(path);
    return /\.(js|jsx|mjs|ts|tsx|css|json|svg|html|md|txt)$/.test(name) ? [path] : [];
  });

  await test("the scan sees an emoji however it is written, and lets flags and type through", () => {
    const glass = String.fromCodePoint(0x1F377), heart = String.fromCodePoint(0x2764, 0xFE0F), sparkles = String.fromCodePoint(0x2728);
    const pin = String.fromCodePoint(0x1F4CC), dna = String.fromCodePoint(0x1F9EC), frame = String.fromCodePoint(0x1F5BC);
    for (const e of [glass, heart, sparkles, pin, dna, frame]) assert(emojiIn(`Loved it ${e}`).length > 0, `the scan misses U+${e.codePointAt(0).toString(16)}`);
    assert(emojiIn(`a bare ${String.fromCodePoint(0xFE0F)} selector`).length === 1, "a variation selector alone is caught");
    const southAfrica = String.fromCodePoint(0x1F1FF, 0x1F1E6), france = String.fromCodePoint(0x1F1EB, 0x1F1F7);
    assertEq(emojiIn(`${southAfrica} South Africa · ${france} France`), [], "flags stay (H9)");
    assertEq(emojiIn("✦ ‹ › → ✓ ✗ × · … — “ ↔ ©"), [], "type is type (README §5)");
    for (const escaped of ["\\uD83C\\uDF77", "\\u{1F377}", "\\u2728", "\\uFE0F", "&#x1F377;"]) {
      ESCAPED.lastIndex = 0;
      assert(ESCAPED.test(escaped), `the escape scan misses ${escaped}`);
    }
    ESCAPED.lastIndex = 0;
    assert(!ESCAPED.test("\\u00A0 \\u2014 \\u2192 \\u2717 \\u{FE0F0}"), "ordinary escapes pass");
  });

  await test("THE EMOJI SCAN: no file under src/ contains an emoji other than a flag — comments and tests included", () => {
    const files = everyFile(SRC);
    assert(files.length > 150, `the scan reads the whole of src/ (${files.length} files)`);
    assert(files.some((f) => f.endsWith("wineUnified.json")), "…the data included");
    const offenders = [];
    for (const path of files) {
      const source = readFileSync(path, "utf-8");
      source.split("\n").forEach((line, i) => {
        const found = emojiIn(line);
        if (found.length) offenders.push(`${relative(SRC, path)}:${i + 1} ${found.map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase()).join(" ")}`);
      });
      if (path.includes(`${join("lib", "__tests__")}`)) continue;
      ESCAPED.lastIndex = 0;
      const escaped = source.match(ESCAPED);
      if (escaped) offenders.push(`${relative(SRC, path)} escapes ${[...new Set(escaped)].join(" ")}`);
    }
    assertEq(offenders, [], "the house prints a Mark or sets type; the user pencils (docs/marks/README.md §8)");
  });

  await test("the flags are still there: every country in the data keeps its emoji flag (H9)", () => {
    const data = JSON.parse(readFileSync(join(SRC, "lib", "wineUnified.json"), "utf-8"));
    assert(Array.isArray(data.countries) && data.countries.length > 10, "the countries");
    for (const c of data.countries) {
      const points = [...(c.emoji || "")].map((ch) => ch.codePointAt(0));
      assert(points.length >= 2 && points.slice(0, 2).every((cp) => cp >= 0x1F1E6 && cp <= 0x1F1FF), `${c.name}'s flag is "${c.emoji}"`);
    }
  });

  await test("SOURCE SCAN: the furniture names its tools by id — a LeaderEntry mark is a printed tool or the arrow, an EmptyState mark a printed tool", () => {
    const tools = Object.keys(TOOLS);
    const seen = { entry: new Set(), empty: new Set() };
    for (const path of sourceFiles(SRC)) {
      const source = readFileSync(path, "utf-8");
      for (const m of source.matchAll(/<LeaderEntry\b[^>]*?\bmark=("([^"]*)"|\{[^}]*\})/gs)) {
        assert(m[2] !== undefined, `${relative(SRC, path)}: a LeaderEntry mark is a literal id (${m[1]})`);
        assert(m[2] === "→" || tools.includes(m[2]), `${relative(SRC, path)}: LeaderEntry mark "${m[2]}" is not a tool`);
        seen.entry.add(m[2]);
      }
      for (const m of source.matchAll(/<EmptyState\b[^>]*?\bmark="([^"]*)"/gs)) {
        assert(tools.includes(m[1]), `${relative(SRC, path)}: EmptyState mark "${m[1]}" is not a tool`);
        seen.empty.add(m[1]);
      }
      assert(!/<EmptyState\b[^>]*?\bemoji=/s.test(source), `${relative(SRC, path)}: EmptyState takes \`mark\`, not \`emoji\``);
    }
    // H8: six tools, each in use; the bottle is Log a bottle's, the camera only ever a photograph
    assertEq([...seen.entry].filter((id) => id !== "→").sort(), [...tools].sort(), "every tool heads an entry somewhere");
    assertEq([...seen.empty].sort(), ["camera", "list", "loupe"], "empty states: the list, the loupe, the camera — nothing else (§8.4)");
    const home = readFileSync(join(SRC, "app", "page.js"), "utf-8");
    assert(/mark="bottle" label="Log a bottle"/.test(home) && /mark="list" label="Match the wine list"/.test(home), "home: the list and the bottle");
    const bar = readFileSync(join(SRC, "components", "house", "ServiceBar.js"), "utf-8");
    assert(/<Mark id="list"[^>]*\/>Match a list/.test(bar) && /<Mark id="bottle"[^>]*\/>Log a bottle/.test(bar), "the service bar: the list and the bottle");
    for (const m of sourceFiles(SRC).flatMap((path) => [...readFileSync(path, "utf-8").matchAll(/mark="camera" label="([^"]+)"/g)])) {
      assert(/Photograph|Snap/.test(m[1]), `the camera only ever means a photograph ("${m[1]}")`);
    }
  });

  await test("SOURCE SCAN: the house never picks up the pencil — no pencil mark on a tool slot, a pick role, a Somm line or an empty state", () => {
    const pencil = Object.keys(PENCIL_MARKS).concat(GLASS_IDS);
    const entry = readFileSync(join(SRC, "components", "house", "LeaderEntry.js"), "utf-8");
    const empty = readFileSync(join(SRC, "components", "house", "EmptyState.js"), "utf-8");
    assert(/<Mark id=\{mark\}/.test(entry) && /<Mark id=\{mark\}/.test(empty), "both render their mark through Mark");
    for (const path of sourceFiles(SRC)) {
      const source = readFileSync(path, "utf-8");
      for (const m of source.matchAll(/<(?:LeaderEntry|EmptyState)\b[^>]*?\bmark="([^"]*)"/gs)) {
        assert(!pencil.includes(m[1]), `${relative(SRC, path)}: the pencil mark "${m[1]}" on the house's furniture`);
      }
    }
    // H6, H7: roles and tags are type; the Somm's one mark is a glyph
    const somm = readFileSync(join(SRC, "app", "recommend", "SommSays.js"), "utf-8");
    assert(/aria-hidden="true" data-testid="somm-quote"[^>]*>“<\/span>The Somm says/.test(somm), "The Somm says, behind one hanging quotation mark");
    assert(!/<Mark\b|<svg\b|PencilGlass|NameGesture/.test(somm), "…a glyph, not a drawing");
    const pick = readFileSync(join(SRC, "app", "recommend", "PickEntry.js"), "utf-8");
    assert(!/<Mark[^>]*id=\{?role/.test(pick), "a pick's role is type only (H6)");
    const reading = readFileSync(join(SRC, "components", "ReadingView.js"), "utf-8");
    assert(!/PencilGlass|NameGesture/.test(reading), "the reading view is the house's");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
