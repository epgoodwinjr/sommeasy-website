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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
