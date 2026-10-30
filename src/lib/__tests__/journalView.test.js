// Journal view suite — The House List, Phase 4 (the journal + a wine's page)
// Run with: node src/lib/__tests__/journalView.test.js
//
// Tests the REAL module via dynamic import (journalView.js depends only on
// the dependency-free ratings.js, dnaThresholds.js, matchTerms.js and
// houseCopy.js). The rules pinned here:
//   1. A wine's standing comes from its one journal row: rated, a legacy
//      had with no verdict, a want, a pass — or none.
//   2. Tried rows group by the month they were rated, newest first, the
//      year joining a month that isn't this year's.
//   3. Facts come from the row's stored resolution; a wine with none falls
//      back to the resolver only at or above the confidence gate — a guess
//      never prints as a fact.
//   4. "In the same vein": recommendations ∪ journal sharing the region or
//      grape — never the wine itself, never a pass, untried first, two at
//      most.
//   5. Junk in → a safe default, never a throw.

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
  const view = await import("../journalView.js");
  const { CONFIDENCE_GATE } = await import("../dnaThresholds.js");

  await test("a wine's standing: rated, verdict pending, wanted, passed — or none", () => {
    assertEq(view.wineStanding({ interaction_type: "had", rating: "loved" }), "rated", "rated");
    assertEq(view.wineStanding({ interaction_type: "had", rating: null }), "unrated", "a legacy had");
    assertEq(view.wineStanding({ interaction_type: "had", rating: "superb" }), "unrated", "a junk rating is no verdict");
    assertEq(view.wineStanding({ interaction_type: "want" }), "want", "want");
    assertEq(view.wineStanding({ interaction_type: "skip" }), "passed", "a pass");
    assertEq(view.wineStanding(null), "none", "no row");
    assertEq(view.wineStanding({ interaction_type: "mystery" }), "none", "junk");
  });

  await test("tried rows group by month, newest first, the year joining another year's month", () => {
    const now = new Date(2026, 9, 30);
    const row = (name, y, m, d) => ({ wine_name: name, updated_at: new Date(y, m, d, 20).toISOString() });
    const groups = view.groupByMonth([
      row("A", 2026, 8, 29), row("B", 2026, 8, 2), row("C", 2026, 7, 15), row("D", 2025, 8, 30),
    ], now);
    assertEq(groups.map((g) => g.label), ["September", "August", "September 2025"], "labels");
    assertEq(groups.map((g) => g.rows.map((r) => r.wine_name)), [["A", "B"], ["C"], ["D"]], "members, in order");
    assertEq(groups.map((g) => g.key), ["2026-09", "2026-08", "2025-09"], "stable keys");
  });

  await test("an undatable row still shows, at the end — never dropped", () => {
    const now = new Date(2026, 9, 30);
    const groups = view.groupByMonth([
      { wine_name: "A", updated_at: new Date(2026, 8, 1).toISOString() },
      { wine_name: "B", updated_at: "junk" },
      { wine_name: "C", created_at: new Date(2026, 8, 3).toISOString() },
    ], now);
    assertEq(groups.map((g) => [g.label, g.rows.map((r) => r.wine_name)]),
      [["September", ["A", "C"]], ["Earlier", ["B"]]], "created_at stands in; the undated go last");
    assertEq(view.groupByMonth(null, now), [], "junk");
  });

  await test("facts: the stored resolution first, the resolver only at the gate", () => {
    const row = {
      resolved_winery: "Domaine Huët", resolved_region: "vouvray", resolved_province: "Loire Valley",
      resolved_country: "France", resolved_varietal: null, match_confidence: 90,
    };
    assertEq(view.wineFacts(row, null), {
      producer: "Domaine Huët", region: "vouvray", province: "Loire Valley", country: "France", grape: null,
    }, "stored");
    const resolution = (confidence) => ({
      winery: "Raats Family Wines", region: "stellenbosch", province: "Stellenbosch",
      country: "South Africa", varietal: "Chenin Blanc", confidence,
    });
    assertEq(view.wineFacts({ resolved_region: "vouvray" }, resolution(95)).region, "vouvray",
      "a stored resolution beats a fresh one");
    assertEq(view.wineFacts(null, resolution(CONFIDENCE_GATE)), {
      producer: "Raats Family Wines", region: "stellenbosch", province: "Stellenbosch",
      country: "South Africa", grape: "Chenin Blanc",
    }, "the resolver at the gate");
    assertEq(view.wineFacts({ interaction_type: "want" }, resolution(CONFIDENCE_GATE - 1)), {
      producer: null, region: null, province: null, country: null, grape: null,
    }, "below the gate: nothing, never a guess");
    assertEq(view.wineFacts(null, null).country, null, "junk");
    assertEq(view.hasStoredResolution(row), true, "a stamped row needs no resolver");
    assertEq(view.hasStoredResolution({ interaction_type: "want" }), false, "a want row was never resolved");
    assertEq(view.hasStoredResolution(null), false, "no row");
  });

  await test("the same vein: shared region or grape, never itself, never a pass, untried first, two at most", () => {
    const journal = [
      { wine_name: "Raats Original Chenin Blanc 2022", interaction_type: "had", rating: "loved",
        resolved_region: "stellenbosch", resolved_varietal: "Chenin Blanc" },
      { wine_name: "Domaine du Closel La Jalousie 2020", interaction_type: "had", rating: "fine",
        resolved_region: "savennières", resolved_varietal: "Chenin Blanc" },
      { wine_name: "François Chidaine Clos du Breuil, Montlouis 2021", interaction_type: "want",
        resolved_region: "montlouis-sur-loire", resolved_varietal: "Chenin Blanc" },
      { wine_name: "Mullineux Old Vines White 2021", interaction_type: "skip",
        resolved_region: "swartland", resolved_varietal: "Chenin Blanc" },
      { wine_name: "Kanonkop Pinotage 2019", interaction_type: "had", rating: "loved",
        resolved_region: "stellenbosch", resolved_varietal: "Pinotage" },
    ];
    const recs = [
      { wine: "Domaine Huet Le Mont Sec, Vouvray 2021" },
      { wine: "Raats Original Chenin Blanc 2022" }, // also in the journal — the row wins
      { wine: "Penfolds Bin 389" },
    ];
    const resolved = {
      "Domaine Huet Le Mont Sec, Vouvray 2021": { region: "vouvray", grape: "Chenin Blanc" },
      "Penfolds Bin 389": null, // below the gate
    };
    const resolve = (name) => resolved[name] ?? null;
    const vein = view.sameVein({
      name: "Raats Original Chenin Blanc 2022", region: "stellenbosch", grape: "Chenin Blanc",
      journal, recs, resolve,
    });
    assertEq(vein.map((v) => v.name), [
      "Domaine Huet Le Mont Sec, Vouvray 2021",
      "François Chidaine Clos du Breuil, Montlouis 2021",
    ], "an untried rec, then a want — the tried and the passed wait");
    assertEq(vein[1].row?.interaction_type, "want", "a journal wine carries its row (its mark)");
    assertEq(vein[0].row, null, "a rec not in the journal carries none");

    const more = view.sameVein({
      name: "Domaine Huet Le Mont Sec, Vouvray 2021", region: "vouvray", grape: "Chenin Blanc",
      journal, recs, resolve, limit: 5,
    });
    assertEq(more.map((v) => v.name), [
      "François Chidaine Clos du Breuil, Montlouis 2021",
      "Raats Original Chenin Blanc 2022",
      "Domaine du Closel La Jalousie 2020",
    ], "untried, then tried in journal order; itself, passes and non-matches never");
  });

  await test("the same vein stops resolving once enough recommendations place — the resolver is the slow step", () => {
    const calls = [];
    const resolve = (name) => { calls.push(name); return { region: "stellenbosch", grape: "Chenin Blanc" }; };
    const recs = ["A", "B", "C", "D", "E"].map((wine) => ({ wine }));
    const vein = view.sameVein({ name: "X", region: "stellenbosch", grape: null, recs, resolve });
    assertEq(vein.map((v) => v.name), ["A", "B"], "the first two recs");
    assertEq(calls, ["A", "B"], "the rest are never resolved");
  });

  await test("the same vein matches names, regions and grapes loosely — and needs something to match on", () => {
    const journal = [
      { wine_name: "Kanonkop Pinotage 2019", interaction_type: "had", rating: "loved",
        resolved_region: "Stellenbosch", resolved_varietal: "pinotage" },
    ];
    const vein = view.sameVein({ name: "kanonkop  pinotage 2019", region: "stellenbosch", grape: null, journal });
    assertEq(vein, [], "the same wine, written differently, is still itself");
    assertEq(view.sameVein({ name: "X", region: "STELLENBOSCH", grape: null, journal }).map((v) => v.name),
      ["Kanonkop Pinotage 2019"], "case-insensitive region");
    assertEq(view.sameVein({ name: "X", region: null, grape: null, journal }), [], "nothing to match on");
    assertEq(view.sameVein({ name: "X", region: "stellenbosch", journal: "junk", recs: [null, { wine: 3 }] }), [], "junk");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
