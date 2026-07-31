// Palate Mark — the visual DNA signature test suite (Act III, "The Signature")
// Run with: node src/lib/__tests__/palateMark.test.js
//
// Tests the REAL module (palateMark.js is dependency-free ESM, loaded via
// dynamic import — same pattern as sommPicks). The locked invariants:
// determinism (same genome → byte-identical SVG), distinctness across the
// 7 production genomes (6 unique — the +local/+prod pair is genuinely the
// same palate and MUST render identically), brand palette only, and growth
// continuity (a grown palate changes macro numbers monotonically — never a
// different mark, always a fuller one).

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }

// The 7 production genomes as of July 31, 2026 (read-only SQL snapshot,
// S4 session). If production regenerates, these stay valid as FIXTURES —
// they are real palate shapes, not live data the suite depends on.
const PRODUCTION_GENOMES = {
  italianFaithful: { v: 1, seed: 3523612936, color: 0.5, depth: 0, focus: 0, range: 0, world: 0, spread: 0 },
  stellenboschFti: { v: 1, seed: 530334102, color: 0.3333333333333333, depth: 1, focus: 1, range: 0.75, world: 0.4444444444444444, spread: 1 },
  stellenboschEd: { v: 1, seed: 464996349, color: 0.3333333333333333, depth: 1, focus: 1, range: 1, world: 0.4444444444444444, spread: 1 },
  saCurator: { v: 1, seed: 3024288059, color: 0.5, depth: 0.16666666666666666, focus: 0.16666666666666666, range: 0.25, world: 0.5, spread: 0.25 },
  frenchPuristLocal: { v: 1, seed: 1819852250, color: 0, depth: 0, focus: 0.16666666666666666, range: 0.25, world: 0.5, spread: 0 },
  frenchPuristProd: { v: 1, seed: 1819852250, color: 0, depth: 0, focus: 0.16666666666666666, range: 0.25, world: 0.5, spread: 0 },
  bordeauxRegular: { v: 1, seed: 149395124, color: 0, depth: 0.16666666666666666, focus: 0, range: 0.125, world: 0, spread: 0.125 },
};

async function main() {
  const { renderPalateMark, renderPalateMarkDocument, markParams, normalizeGenome, MARK_PALETTE } =
    await import("../palateMark.js");

  console.log("\n═══ Determinism ═══");

  test("same genome renders byte-identical SVG across calls", () => {
    const g = PRODUCTION_GENOMES.stellenboschEd;
    assert(renderPalateMark(g) === renderPalateMark(g), "two calls differ");
  });

  test("a deep-cloned genome renders byte-identical SVG", () => {
    const g = PRODUCTION_GENOMES.saCurator;
    const clone = JSON.parse(JSON.stringify(g));
    assert(renderPalateMark(g) === renderPalateMark(clone), "clone differs");
  });

  test("document render is deterministic too", () => {
    const g = PRODUCTION_GENOMES.bordeauxRegular;
    assert(renderPalateMarkDocument(g) === renderPalateMarkDocument(g), "doc calls differ");
  });

  console.log("\n═══ Distinctness (the 7 production genomes) ═══");

  test("7 production genomes render exactly 6 distinct marks", () => {
    const svgs = Object.values(PRODUCTION_GENOMES).map((g) => renderPalateMark(g));
    assert(svgs.every((s) => s.length > 0), "a production genome rendered empty");
    assert(new Set(svgs).size === 6, `expected 6 unique, got ${new Set(svgs).size}`);
  });

  test("the identical-palate pair (+local/+prod) renders identical marks — correct, same palate", () => {
    assert(
      renderPalateMark(PRODUCTION_GENOMES.frenchPuristLocal) ===
        renderPalateMark(PRODUCTION_GENOMES.frenchPuristProd),
      "identical genomes rendered differently"
    );
  });

  test("Ed's two similar-but-different rows render related, non-identical marks", () => {
    const a = markParams(PRODUCTION_GENOMES.stellenboschEd);
    const b = markParams(PRODUCTION_GENOMES.stellenboschFti);
    assert(
      renderPalateMark(PRODUCTION_GENOMES.stellenboschEd) !==
        renderPalateMark(PRODUCTION_GENOMES.stellenboschFti),
      "different genomes rendered identically"
    );
    // Related: same macro form (petal count, petal length, berries)…
    assert(a.petals === b.petals, "sibling palates lost shared petal count");
    assert(a.tipR === b.tipR, "sibling palates lost shared petal length");
    assert(a.berries === b.berries, "sibling palates lost shared berry count");
    // …differing where the palates differ (range) and in seed phase
    assert(a.stamenTipR > b.stamenTipR, "range 1 vs 0.75 should extend the stamens");
  });

  console.log("\n═══ Growth continuity ═══");

  test("growing every dial grows the mark — same form, fuller", () => {
    const young = { seed: 12345, color: 0.4, depth: 0.2, focus: 0.2, range: 0.2, world: 0.5, spread: 0.2 };
    const grown = { seed: 99999, color: 0.4, depth: 0.6, focus: 0.4, range: 0.5, world: 0.5, spread: 0.6 };
    const a = markParams(young);
    const b = markParams(grown);
    assert(b.petals >= a.petals, "focus growth lost petals");
    assert(b.tipR > a.tipR, "spread growth shortened petals");
    assert(b.berries > a.berries, "depth growth lost berries");
    assert(b.stamenTipR > a.stamenTipR, "range growth shortened stamens");
  });

  test("a dial moving with the seed unchanged never re-phases the rest of the mark", () => {
    const base = { seed: 777, color: 0.3, depth: 0.5, focus: 0.5, range: 0.5, world: 0.5, spread: 0.5 };
    const recolored = { ...base, color: 0.7 };
    const a = markParams(base);
    const b = markParams(recolored);
    assert(a.ringPhase === b.ringPhase, "ring phase moved on a color-only change");
    assert(a.bloomPhase === b.bloomPhase, "bloom phase moved on a color-only change");
    assert(a.burgundySweepDeg > b.burgundySweepDeg, "whiter palate should shrink the burgundy sweep");
  });

  console.log("\n═══ Brand palette only ═══");

  test("every fill and stroke in every production mark is a brand color", () => {
    const allowed = new Set([...Object.values(MARK_PALETTE), "none"]);
    for (const [name, g] of Object.entries(PRODUCTION_GENOMES)) {
      const svg = renderPalateMark(g);
      for (const m of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
        assert(allowed.has(m[1]), `${name} uses off-palette value ${m[1]}`);
      }
    }
  });

  console.log("\n═══ Output shape ═══");

  test("inline render is decorative: aria-hidden, presentation role, no focus", () => {
    const svg = renderPalateMark(PRODUCTION_GENOMES.italianFaithful);
    assert(svg.startsWith("<svg "), "not an svg root");
    assert(svg.includes('aria-hidden="true"'), "missing aria-hidden");
    assert(svg.includes('role="presentation"'), "missing presentation role");
    assert(svg.includes('focusable="false"'), "missing focusable=false");
  });

  test("size option sets width/height; viewBox stays constant", () => {
    const s48 = renderPalateMark(PRODUCTION_GENOMES.saCurator, { size: 48 });
    const s320 = renderPalateMark(PRODUCTION_GENOMES.saCurator, { size: 320 });
    assert(s48.includes('width="48" height="48"'), "48px size not applied");
    assert(s320.includes('width="320" height="320"'), "320px size not applied");
    assert(s48.includes('viewBox="0 0 160 160"') && s320.includes('viewBox="0 0 160 160"'), "viewBox drifted");
  });

  test("document render is standalone (xmlns) with the identical body", () => {
    const inline = renderPalateMark(PRODUCTION_GENOMES.stellenboschEd, { size: 96 });
    const doc = renderPalateMarkDocument(PRODUCTION_GENOMES.stellenboschEd, { size: 640 });
    assert(doc.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), "doc missing xmlns");
    const body = (s) => s.slice(s.indexOf(">") + 1);
    assert(body(inline) === body(doc), "inline and document bodies diverged");
  });

  test("no NaN, no undefined, balanced tags in every production mark", () => {
    for (const [name, g] of Object.entries(PRODUCTION_GENOMES)) {
      const svg = renderPalateMark(g);
      assert(!svg.includes("NaN") && !svg.includes("undefined"), `${name} rendered junk`);
      const opens = (svg.match(/<(?!\/)/g) || []).length;
      const closes = (svg.match(/\/>/g) || []).length + (svg.match(/<\//g) || []).length;
      assert(opens === closes, `${name} has unbalanced tags (${opens} opens, ${closes} closes)`);
    }
  });

  console.log("\n═══ Malformed genome tolerance ═══");

  test("null / non-object genome renders empty string (surfaces degrade to text)", () => {
    assert(renderPalateMark(null) === "", "null should render empty");
    assert(renderPalateMark(undefined) === "", "undefined should render empty");
    assert(renderPalateMark("junk") === "", "string should render empty");
    assert(renderPalateMarkDocument(null) === "", "doc null should render empty");
  });

  test("missing or junk dials clamp to defaults and still render clean", () => {
    const svg = renderPalateMark({ seed: 42 });
    assert(svg.startsWith("<svg ") && !svg.includes("NaN"), "dial-less genome broke");
    const junk = renderPalateMark({ seed: "x", color: 9, depth: -3, focus: "a", world: Infinity });
    assert(junk.startsWith("<svg ") && !junk.includes("NaN"), "junk dials broke");
    const n = normalizeGenome({ color: 9, depth: -3 });
    assert(n.color === 1 && n.depth === 0, "clamping failed");
    assert(n.seed === 0 && n.world === 0.5, "defaults failed");
  });

  console.log(`\n${"═".repeat(40)}\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
