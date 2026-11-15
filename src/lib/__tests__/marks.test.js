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
//   5. A gesture over a name: the CSS box for one line, lines merged from
//      client rects, the circle round the whole name and the underline and
//      strike on its LAST line.
//   6. SOURCE SCAN: no other file under src/ declares a mark's path data.

import { readFileSync, readdirSync, statSync } from "node:fs";
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
    GESTURE_FIT, markBody, renderMark, markSize, glassFor, gestureStyle, nameLines, gestureBox,
  } = marks;

  console.log("\n═══ 1. The paths are exact — the design source, value for value ═══");

  await test("every table is the design source's (its PENCIL is PENCIL_MARKS here)", () => {
    assertEq(MARK_COLORS, design.MARK_COLORS, "MARK_COLORS");
    assertEq(MARK_WEIGHTS, design.MARK_WEIGHTS, "MARK_WEIGHTS");
    assertEq(GLASS_VIEWBOX, design.GLASS_VIEWBOX, "GLASS_VIEWBOX");
    assertEq(GLASS, design.GLASS, "GLASS");
    assertEq(SHADE, design.SHADE, "SHADE");
    assertEq(PENCIL_MARKS, design.PENCIL, "the pencil marks");
    assertEq(GESTURES, design.GESTURES, "GESTURES");
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

  await test("one line: the measured box is the CSS box, in px", () => {
    const line = [{ left: 100, top: 200, right: 300, bottom: 224 }];
    const origin = { left: 100, top: 200 };
    assertEq(gestureBox("circle", line, origin), { left: -12, top: -7, width: 224, height: 38 }, "circle");
    assertEq(gestureBox("underline", line, origin), { left: -2, top: 22, width: 204, height: 7 }, "underline: its bottom 5px under");
    assertEq(gestureBox("strike", line, origin), { left: -3, top: 12, width: 206, height: 7 }, "strike: from the middle");
  });

  await test("a wrapped name: circled whole, underlined and struck on its LAST line", () => {
    const lines = [
      { left: 20, top: 100, right: 210, bottom: 124 }, // "Domaine Huet Le Haut-Lieu"
      { left: 20, top: 124, right: 132, bottom: 148 }, // "Vouvray Sec 2021"
    ];
    const origin = { left: 20, top: 100 }; // the first line's top left, as an inline box's origin usually is
    assertEq(gestureBox("circle", lines, origin), { left: -12, top: -7, width: 214, height: 62 }, "circle: the whole block");
    assertEq(gestureBox("underline", lines, origin), { left: -2, top: 46, width: 116, height: 7 }, "underline: under the last line");
    assertEq(gestureBox("strike", lines, origin), { left: -3, top: 36, width: 118, height: 7 }, "strike: through the last line");
    // An engine that puts an inline box's origin elsewhere only moves the frame of reference
    const elsewhere = { left: 0, top: 90 };
    assertEq(gestureBox("underline", lines, elsewhere), { left: 18, top: 56, width: 116, height: 7 }, "measured from the origin given");
    // A last line wider than the first still decides the line
    const wider = [{ left: 60, top: 0, right: 120, bottom: 20 }, { left: 0, top: 20, right: 200, bottom: 40 }];
    assertEq(gestureBox("strike", wider, { left: 0, top: 0 }), { left: -3, top: 30, width: 206, height: 7 }, "the last line");
    assertEq(gestureBox("circle", wider, { left: 0, top: 0 }), { left: -12, top: -7, width: 224, height: 54 }, "the union");
  });

  await test("gestureBox: an unknown gesture, no lines or junk → null; a missing origin is 0,0", () => {
    const line = [{ left: 0, top: 0, right: 10, bottom: 10 }];
    for (const kind of [undefined, null, "", "star", "toString"]) assertEq(gestureBox(kind, line, { left: 0, top: 0 }), null, `kind ${JSON.stringify(kind)}`);
    for (const lines of [undefined, null, [], "lines", [null], [{ left: 0 }]]) assertEq(gestureBox("circle", lines, { left: 0, top: 0 }), null, `lines ${JSON.stringify(lines)}`);
    assertEq(gestureBox("underline", line, undefined), { left: -2, top: 8, width: 14, height: 7 }, "no origin");
    assertEq(gestureBox("underline", line, { left: NaN, top: "x" }), { left: -2, top: 8, width: 14, height: 7 }, "a junk origin");
  });

  console.log("\n═══ 6. SOURCE SCAN ═══");

  await test("SOURCE SCAN: no other file under src/ declares a mark's path data", () => {
    // Every path the module holds, and each one's opening — a copy that
    // drifted at its end is still a second copy
    const all = [
      GLASS.bowl, GLASS.stemAndFoot, ...Object.values(SHADE).flat(), ...Object.values(PENCIL_MARKS),
      ...Object.values(GESTURES).map((g) => g.d), ...Object.values(TOOLS).flatMap(pathsIn),
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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
