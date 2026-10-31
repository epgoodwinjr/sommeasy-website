// Wine search suite — The House List, Phase 2 (Log a bottle › Search by name)
// Run with: node src/lib/__tests__/wineSearch.test.js
//
// Tests the REAL module via dynamic import (wineSearch.js depends only on
// the dependency-free ratings.js and houseCopy.js). The rules pinned here:
//   1. Word-prefix, case- and accent-insensitive: every word of the query
//      must start some word of the candidate's name, producer, region or
//      grape ("chat" finds Château, "ken for" finds Ken Forrester).
//   2. The user's journal first, then the catalog (wineAutocomplete.json);
//      inside each, name matches before region/grape matches.
//   3. At most `limit` results (6 by default).
//   4. A journal row wears the user's mark (rating emoji, 🥂 verdict
//      pending, 📌 want, 👋 pass — houseCopy's journalMark, the one copy);
//      a catalog pick logs as "{producer} {grape}" unless the producer
//      already says the grape, and never duplicates a journal row.
//   5. An empty query and junk rows are silence, never a throw.

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

const JOURNAL = [
  { wine_name: "Raats Original Chenin Blanc 2022", interaction_type: "had", rating: "loved", resolved_winery: "Raats", resolved_region: "Stellenbosch", resolved_varietal: "Chenin Blanc" },
  { wine_name: "Sadie Family Palladius 2020", interaction_type: "want", rating: null, resolved_region: "Swartland" },
  { wine_name: "Kanonkop Pinotage 2019", interaction_type: "skip", rating: null },
  { wine_name: "Hamilton Russell Chardonnay", interaction_type: "had", rating: null, resolved_region: "Hemel-en-Aarde", resolved_varietal: "Chardonnay" },
];

const CATALOG = [
  { w: "Domaine Huet", v: "Chenin Blanc", r: "Vouvray", c: "France" },
  { w: "Chenin Chenin", v: "", r: "Swartland", c: "South Africa" },
  { w: "Château Musar", v: "Red Blend", r: "Bekaa Valley", c: "Lebanon" },
  { w: "Ken Forrester", v: "Chenin Blanc", r: "Stellenbosch", c: "South Africa" },
  { w: "Pinot Noir Estate", v: "Pinot Noir", r: "Willamette Valley", c: "US" },
];

async function main() {
  const { searchWines } = await import("../wineSearch.js");
  const names = (results) => results.map((r) => r.name);

  console.log("\n═══ Suite 1: what matches ═══");

  await test("word-prefix across name, producer, region and grape", () => {
    assertEq(names(searchWines("ken for", { catalog: CATALOG })), ["Ken Forrester"], "two-word prefix");
    assertEq(names(searchWines("vouv", { catalog: CATALOG })), ["Domaine Huet"], "region prefix");
    assertEq(names(searchWines("hemel-en", { journal: JOURNAL })), ["Hamilton Russell Chardonnay"], "hyphenated region");
  });

  await test("case- and accent-insensitive", () => {
    assertEq(names(searchWines("CHAT", { catalog: CATALOG })), ["Château Musar"], "Château");
    assertEq(names(searchWines("château", { catalog: CATALOG })), ["Château Musar"], "accent in the query");
  });

  await test("a word must START a word — no matching mid-word", () => {
    assertEq(searchWines("enin", { journal: JOURNAL, catalog: CATALOG }), [], "mid-word");
  });

  await test("empty and whitespace queries are silence", () => {
    assertEq(searchWines("", { journal: JOURNAL, catalog: CATALOG }), [], "empty");
    assertEq(searchWines("   ", { journal: JOURNAL, catalog: CATALOG }), [], "whitespace");
    assertEq(searchWines(null, { journal: JOURNAL }), [], "null");
  });

  console.log("\n═══ Suite 2: order and limit ═══");

  await test("journal first; inside each source, name matches before grape/region matches", () => {
    assertEq(names(searchWines("chenin", { journal: JOURNAL, catalog: CATALOG })), [
      "Raats Original Chenin Blanc 2022", // journal, name
      "Chenin Chenin",                    // catalog, name
      "Domaine Huet",                     // catalog, grape
      "Ken Forrester",                    // catalog, grape
    ], "tiers");
  });

  await test("at most six results by default, or the limit given", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ w: `Cellar ${i}`, v: "Syrah", r: "Swartland", c: "South Africa" }));
    assertEq(searchWines("syrah", { catalog: many }).length, 6, "default limit");
    assertEq(searchWines("syrah", { catalog: many, limit: 3 }).length, 3, "custom limit");
  });

  console.log("\n═══ Suite 3: what each result carries ═══");

  await test("journal rows wear the user's mark and log under their own name", () => {
    const [raats] = searchWines("raats", { journal: JOURNAL });
    assertEq([raats.mark, raats.logName, raats.meta, raats.source], ["❤️", "Raats Original Chenin Blanc 2022", "Stellenbosch · Chenin Blanc", "journal"], "rated");
    assertEq(searchWines("sadie", { journal: JOURNAL })[0].mark, "📌", "want");
    assertEq(searchWines("kanonkop", { journal: JOURNAL })[0].mark, "👋", "pass");
    assertEq(searchWines("hamilton", { journal: JOURNAL })[0].mark, "🥂", "had, verdict pending (the journal's mark)");
  });

  await test("catalog picks log as producer + grape, unless the producer says it", () => {
    const [ken] = searchWines("ken", { catalog: CATALOG });
    assertEq([ken.logName, ken.meta, ken.mark, ken.source], ["Ken Forrester Chenin Blanc", "Stellenbosch · Chenin Blanc", null, "catalog"], "composed");
    assertEq(searchWines("pinot noir est", { catalog: CATALOG })[0].logName, "Pinot Noir Estate", "no doubled grape");
    assertEq(searchWines("chenin chenin", { catalog: CATALOG })[0].logName, "Chenin Chenin", "no grape");
  });

  await test("a catalog pick never duplicates a journal row", () => {
    const journal = [{ wine_name: "Ken Forrester Chenin Blanc", interaction_type: "had", rating: "liked" }];
    const results = searchWines("ken", { journal, catalog: CATALOG });
    assertEq(results.map((r) => [r.source, r.logName]), [["journal", "Ken Forrester Chenin Blanc"]], "deduped");
  });

  await test("every result has a unique key", () => {
    const results = searchWines("chenin", { journal: JOURNAL, catalog: CATALOG });
    assertEq(new Set(results.map((r) => r.key)).size, results.length, "keys");
  });

  await test("junk rows are skipped, never thrown on", () => {
    const results = searchWines("ken", { journal: [null, 4, { interaction_type: "had" }], catalog: [null, {}, { w: 7 }, ...CATALOG] });
    assertEq(names(results), ["Ken Forrester"], "junk skipped");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
