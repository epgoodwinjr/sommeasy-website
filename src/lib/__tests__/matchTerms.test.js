// Match terms suite — The House List, Phase 3
// Run with: node src/lib/__tests__/matchTerms.test.js
//
// Tests the REAL module via dynamic import (matchTerms.js is dependency-
// free). Match & picks' pure helpers, the rules pinned here:
//   1. Tonight's terms start from Account › At the table
//      (wine_profiles.preferences, decision D8) when set — and from All /
//      empty otherwise. A malformed preference never reaches the page.
//   2. A pick meets the user's journal by NORMALIZED name (accents, case,
//      punctuation and spacing folded) — so a wine rated at last month's
//      table is recognized on tonight's list, and a rated row wins a tie.
//   3. Junk in → a safe default, never a throw.

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
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`ASSERT FAILED: ${msg} — expected ${e}, got ${a}`);
}

async function main() {
  const terms = await import("../matchTerms.js");

  console.log("\n═══ Suite 1: tonight's terms from the profile's preferences ═══");

  await test("the four colors, in the order the terms line reads", () => {
    assertEq(terms.COLORS, ["all", "red", "white", "sparkling"], "colors");
  });

  await test("a saved color and spend pre-fill the terms", () => {
    assertEq(terms.termsFromPreferences({ color: "white", spend: { min: 40, max: 90 } }),
      { color: "white", min: "40", max: "90" }, "both set");
    assertEq(terms.termsFromPreferences({ spend: { min: null, max: 60 } }),
      { color: "all", min: "", max: "60" }, "a ceiling only");
  });

  await test("nothing saved → All and an open spend", () => {
    assertEq(terms.termsFromPreferences({}), { color: "all", min: "", max: "" }, "empty object");
    assertEq(terms.termsFromPreferences(null), { color: "all", min: "", max: "" }, "null");
    assertEq(terms.termsFromPreferences(undefined), { color: "all", min: "", max: "" }, "undefined");
  });

  await test("a malformed preference falls back instead of reaching the page", () => {
    assertEq(terms.termsFromPreferences({ color: "orange", spend: { min: -5, max: "lots" } }),
      { color: "all", min: "", max: "" }, "junk values");
    assertEq(terms.termsFromPreferences({ spend: "40-90" }), { color: "all", min: "", max: "" }, "spend not an object");
    assertEq(terms.termsFromPreferences({ spend: { min: 39.6, max: "90" } }),
      { color: "all", min: "40", max: "90" }, "a decimal rounds; a digit string passes");
    assertEq(terms.termsFromPreferences("junk"), { color: "all", min: "", max: "" }, "not an object");
  });

  console.log("\n═══ Suite 2: a pick meets the journal by name ═══");

  await test("names fold accents, case, punctuation and spacing", () => {
    assertEq(terms.normalizeWineName("Kanonkop Pinotage, Stellenbosch 2019"), "kanonkop pinotage stellenbosch 2019", "punctuation");
    assertEq(terms.normalizeWineName("  Château  Lynch-Bages, Pauillac "), "chateau lynch bages pauillac", "accents + spacing");
    assertEq(terms.normalizeWineName(null), "", "junk");
  });

  await test("the journal row for a pick — same wine, written differently", () => {
    const rows = [
      { wine_name: "Meerlust Rubicon, Stellenbosch 2018", interaction_type: "want", rating: null },
      { wine_name: "Kanonkop Pinotage, Stellenbosch 2019", interaction_type: "had", rating: "loved" },
    ];
    assertEq(terms.findJournalRow("KANONKOP Pinotage  Stellenbosch 2019", rows)?.rating, "loved", "matched");
    assertEq(terms.findJournalRow("Meerlust Rubicon, Stellenbosch 2018", rows)?.interaction_type, "want", "a want");
    assertEq(terms.findJournalRow("Kanonkop Pinotage, Stellenbosch 2020", rows), null, "another vintage is another wine");
  });

  await test("a rated row wins when two rows fold to the same name", () => {
    const rows = [
      { wine_name: "Raats Chenin Blanc 2022", interaction_type: "want", rating: null },
      { wine_name: "raats chenin blanc, 2022", interaction_type: "had", rating: "liked" },
    ];
    assertEq(terms.findJournalRow("Raats Chenin Blanc 2022", rows)?.rating, "liked", "rated first");
  });

  await test("junk never matches and never throws", () => {
    assertEq(terms.findJournalRow("", [{ wine_name: "" }]), null, "an empty name");
    assertEq(terms.findJournalRow("Kanonkop", null), null, "no rows");
    assertEq(terms.findJournalRow("Kanonkop", [null, 7, { wine_name: 5 }]), null, "junk rows");
  });

  console.log("\n═══ Suite 3: Account › At the table writes the preferences (Phase 6) ═══");

  await test("the amount pair saves as numbers or null — and a reversed pair reads the way it was meant", () => {
    assertEq(terms.spendFromAmounts("40", "90"), { min: 40, max: 90 }, "both");
    assertEq(terms.spendFromAmounts("", "90"), { min: null, max: 90 }, "a ceiling");
    assertEq(terms.spendFromAmounts("40", ""), { min: 40, max: null }, "a floor");
    assertEq(terms.spendFromAmounts("", ""), { min: null, max: null }, "cleared");
    assertEq(terms.spendFromAmounts("90", "40"), { min: 40, max: 90 }, "$90 to $40 means 40–90");
    assertEq(terms.spendFromAmounts("4a", null), { min: null, max: null }, "junk → open");
  });

  await test("a preference change keeps the rest of the preferences, and only real values land", () => {
    const saved = { spend: { min: 40, max: 90 }, color: "white", future: "kept" };
    assertEq(terms.preferencesWith(saved, { color: "red" }),
      { spend: { min: 40, max: 90 }, color: "red", future: "kept" }, "color changes, the rest stays");
    assertEq(terms.preferencesWith(saved, { spend: { min: null, max: 60 } }),
      { spend: { min: null, max: 60 }, color: "white", future: "kept" }, "spend changes, the rest stays");
    assertEq(terms.preferencesWith(saved, { color: "rosé" }), saved, "a color that isn't one changes nothing");
    assertEq(terms.preferencesWith(null, { color: "sparkling" }), { color: "sparkling" }, "nothing saved yet");
    assertEq(terms.preferencesWith("junk", { spend: "junk" }), {}, "junk in → a clean object");
    // Round trip: what Account writes, Match reads
    assertEq(terms.termsFromPreferences(terms.preferencesWith({}, { spend: terms.spendFromAmounts("90", "40") })),
      { color: "all", min: "40", max: "90" }, "Match pre-fills what Account saved");
  });

  // ─── The terms rule (Nov 2026): one copy of what "fits" means, read by
  // the engine's picks AND the Somm's slate ───

  const wine = (extra = {}) => ({ name: "A wine", price: 50, score: 2, detectedColor: null, ...extra });
  const vision = (color, extra = {}) => wine({ detectedColor: color, visionData: { color }, ...extra });

  await test("fitsColor: no color chosen fits everything", () => {
    for (const color of [null, undefined, "", "all"]) {
      assertEq(terms.fitsColor(wine({ detectedColor: "red" }), color), true, `${color}`);
      assertEq(terms.fitsColor(wine({ name: "Veuve Clicquot Brut, Champagne" }), color), true, `${color} / sparkling`);
    }
  });

  await test("fitsColor: red and white take their own color and a wine whose color is unknown — never the other, never a sparkling", () => {
    assertEq(terms.fitsColor(wine({ detectedColor: "red" }), "red"), true, "red is red");
    assertEq(terms.fitsColor(wine({ detectedColor: "white" }), "red"), false, "white is not red");
    assertEq(terms.fitsColor(wine({ detectedColor: "red" }), "white"), false, "red is not white");
    assertEq(terms.fitsColor(wine({ detectedColor: "rosé" }), "white"), false, "rosé is not white");
    assertEq(terms.fitsColor(wine(), "red"), true, "unknown stays under red (a text line with no clue)");
    assertEq(terms.fitsColor(wine(), "white"), true, "and under white");
    assertEq(terms.fitsColor(wine({ detectedColor: "white", name: "Graham Beck Brut" }), "white"), false, "a sparkling white is sparkling");
    assertEq(terms.fitsColor(wine({ section: "Champagne & Sparkling" }), "red"), false, "a wine under a sparkling header is sparkling");
  });

  await test("fitsColor: a wine Vision gave a color to must match it; one it gave none is of unknown color", () => {
    assertEq(terms.fitsColor(vision("white"), "white"), true, "Vision said white");
    assertEq(terms.fitsColor(vision("red"), "white"), false, "Vision said red");
    // Vision named a color the engine did not carry over: it is NOT "unknown"
    assertEq(terms.fitsColor(wine({ detectedColor: null, visionData: { color: "white" } }), "red"), false, "a colored wine with no detected color fits no other color");
    // Vision gave a color, the engine's detectedColor says otherwise (a rosé-only appellation)
    assertEq(terms.fitsColor(wine({ detectedColor: "rosé", visionData: { color: "red" } }), "red"), false, "the detected color decides");
    // Vision read the wine but gave no color: handled as any wine of unknown color
    assertEq(terms.fitsColor(wine({ visionData: { color: null } }), "red"), true, "no Vision color → unknown");
  });

  await test("fitsColor: sparkling takes only what reads as sparkling — by color, section, name or variety", () => {
    assertEq(terms.fitsColor(wine({ detectedColor: "sparkling" }), "sparkling"), true, "detected");
    assertEq(terms.fitsColor(vision("sparkling"), "sparkling"), true, "Vision");
    assertEq(terms.fitsColor(wine({ section: "Bubbles" }), "sparkling"), true, "section");
    assertEq(terms.fitsColor(wine({ name: "Pierre Gimonnet Blanc de Blancs 1er Cru, Champagne NV" }), "sparkling"), true, "name");
    assertEq(terms.fitsColor(wine({ visionData: { variety: "Champagne Blend" } }), "sparkling"), true, "variety");
    assertEq(terms.fitsColor(wine(), "sparkling"), false, "unknown is not sparkling");
    assertEq(terms.fitsColor(wine({ detectedColor: "white" }), "sparkling"), false, "a still white");
    assertEq(terms.isSparkling(wine({ name: "Cava Brut Nature" })), true, "isSparkling is the same reading");
    assertEq(terms.isSparkling(null), false, "junk → not sparkling, never a throw");
  });

  await test("budgetFit: inside min–max is in; over max up to twice it is the one stretch; anything else is out", () => {
    assertEq([40, 60, 80].map((p) => terms.budgetFit(p, 40, 80)), ["in", "in", "in"], "both ends are inside");
    assertEq([39, 30].map((p) => terms.budgetFit(p, 40, 80)), ["out", "out"], "under the minimum");
    assertEq([81, 120, 160].map((p) => terms.budgetFit(p, 40, 80)), ["splurge", "splurge", "splurge"], "over max, up to 2×");
    assertEq([161, 500].map((p) => terms.budgetFit(p, 40, 80)), ["out", "out"], "past twice the max");
    assertEq([10, 80, 81, 160, 161].map((p) => terms.budgetFit(p, null, 80)), ["in", "in", "splurge", "splurge", "out"], "a maximum alone");
    assertEq([10, 249, 250, 900].map((p) => terms.budgetFit(p, 250, null)), ["out", "out", "in", "in"], "a minimum alone has no stretch");
    assertEq([1, 50, 5000].map((p) => terms.budgetFit(p, null, null)), ["in", "in", "in"], "no budget");
  });

  await test("budgetFit: a limit that isn't a positive number is no limit", () => {
    for (const none of [null, undefined, 0, "", NaN, -5, "abc"]) {
      assertEq(terms.budgetFit(500, none, none), "in", `${String(none)}`);
    }
    assertEq(terms.budgetFit(90, "40", "80"), "splurge", "digit strings count (the amount fields hold them)");
  });

  await test("isPickable: a wine the palate scored, with a price", () => {
    assertEq(terms.isPickable(wine()), true, "scored and priced");
    assertEq(terms.isPickable(wine({ score: 0 })), false, "no score");
    assertEq(terms.isPickable(wine({ price: null })), false, "no price");
    assertEq(terms.isPickable(wine({ price: undefined })), false, "price missing");
    assertEq(terms.isPickable(null), false, "junk");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
