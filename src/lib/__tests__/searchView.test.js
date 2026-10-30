// Search view suite — The House List, Phase 5 (/search, README §8.6)
// Run with: node src/lib/__tests__/searchView.test.js
//
// Tests the REAL module via dynamic import (searchView.js depends only on
// the dependency-free wineSearch.js, matchTerms.js and houseCopy.js; a
// recommendation's facts come in as a resolver). The rules pinned here:
//   1. One matcher everywhere: every word of the query starts some word of
//      the candidate — case- and accent-insensitive, never a raw substring
//      ("nin" is not "Chenin"). Log a bottle's search uses the same one.
//   2. In your journal: every row (tried, wanted, passed) whose name,
//      producer, region, province, country or grape matches — journal order.
//   3. Chosen by the Somm: recommendations NOT already in the journal (a
//      name written differently is still the same wine), matched on the
//      name or the facts the resolver trusts.
//   4. Recent searches: the last five, newest first, one of each; storage is
//      SSR-safe and junk-tolerant — a corrupt list reads as empty, a failing
//      store never throws.
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

const JOURNAL = [
  { wine_name: "Sadie Family Palladius 2020", interaction_type: "want",
    resolved_region: "swartland", resolved_varietal: "Chenin-led blend" },
  { wine_name: "Raats Original Chenin Blanc 2022", interaction_type: "had", rating: "loved",
    resolved_winery: "Raats Family Wines", resolved_region: "stellenbosch", resolved_country: "South Africa",
    resolved_varietal: "Chenin Blanc" },
  { wine_name: "Domaine du Closel La Jalousie 2020", interaction_type: "had", rating: "fine",
    resolved_region: "savennières", resolved_province: "Loire Valley", resolved_country: "France",
    resolved_varietal: "Chenin Blanc" },
  { wine_name: "Kanonkop Paul Sauer 2019", interaction_type: "skip",
    resolved_winery: "Kanonkop", resolved_region: "stellenbosch", resolved_varietal: "Bordeaux-style Red Blend" },
  null,
  { wine_name: 3 },
];
const names = (rows) => rows.map((r) => r.wine_name);

const ENTRIES = [
  { kind: "country", id: "south_africa", name: "South Africa", flag: "🇿🇦", earned: true, bottles: 10 },
  { kind: "region", id: "stellenbosch", name: "Stellenbosch", flag: "", earned: true, bottles: 6 },
  { kind: "grape", id: "chenin_blanc", name: "Chenin Blanc", flag: "", earned: true, bottles: 5 },
  { kind: "grape", id: "sauvignon_blanc", name: "Sauvignon Blanc", flag: "", earned: false, bottles: 0 },
  { kind: "estate", id: "raats_family_wines", name: "Raats Family Wines", flag: "", earned: false, bottles: 1 },
];

const RECS = [
  { wine: "Domaine Huet Le Mont Sec, Vouvray 2021", matchType: "grape" },
  { wine: "Ken Forrester The FMC Chenin Blanc 2021", matchType: "region + grape" },
  { wine: "Raats Original Chenin Blanc 2022", matchType: "grape" },
  { wine: "raats original chenin blanc,  2022", matchType: "grape" },
  { wine: "Mullineux Schist Syrah, Swartland", matchType: "region" },
  { wine: "Ken Forrester The FMC Chenin Blanc 2021", matchType: "region + grape" },
  null,
  { wine: 4 },
];
const FACTS = {
  "Domaine Huet Le Mont Sec, Vouvray 2021": {
    winery: "Domaine Huët", region: "vouvray", province: "Loire Valley", country: "France", grape: "Chenin Blanc",
  },
};
const facts = (name) => FACTS[name] || null;

function fakeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem(k) { if (throws) throw new Error("denied"); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (throws) throw new Error("denied"); map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    map,
  };
}

async function main() {
  const view = await import("../searchView.js");

  await test("the journal: word-prefix on name, producer, region, province, country and grape — journal order", () => {
    assertEq(names(view.searchJournal("chenin", JOURNAL)),
      ["Sadie Family Palladius 2020", "Raats Original Chenin Blanc 2022", "Domaine du Closel La Jalousie 2020"],
      "a grape word (even inside 'Chenin-led'), a name word — tried, wanted, in journal order");
    assertEq(names(view.searchJournal("raats family", JOURNAL)), ["Raats Original Chenin Blanc 2022"], "the producer");
    assertEq(names(view.searchJournal("loire", JOURNAL)), ["Domaine du Closel La Jalousie 2020"], "the province");
    assertEq(names(view.searchJournal("south africa", JOURNAL)), ["Raats Original Chenin Blanc 2022"], "the country");
    assertEq(names(view.searchJournal("kanonkop sauer", JOURNAL)), ["Kanonkop Paul Sauer 2019"],
      "every word must land — a pass is still in the journal");
  });

  await test("the journal match is case- and accent-insensitive, and never a raw substring", () => {
    assertEq(names(view.searchJournal("CHENIN", JOURNAL)).length, 3, "case");
    assertEq(names(view.searchJournal("savennieres", JOURNAL)), ["Domaine du Closel La Jalousie 2020"], "accents");
    assertEq(view.searchJournal("nin", JOURNAL), [], "'nin' is not a word of 'Chenin'");
    assertEq(view.searchJournal("   ", JOURNAL), [], "no query, no rows");
    assertEq(view.searchJournal("chenin", "junk"), [], "junk journal");
  });

  await test("the DNA: matched by name, countries included", () => {
    assertEq(view.searchDna("chenin", ENTRIES).map((e) => e.name), ["Chenin Blanc"], "a grape");
    assertEq(view.searchDna("blanc", ENTRIES).map((e) => e.name), ["Chenin Blanc", "Sauvignon Blanc"], "every match");
    assertEq(view.searchDna("south", ENTRIES).map((e) => e.name), ["South Africa"], "a country");
    assertEq(view.searchDna("raats", ENTRIES).map((e) => e.name), ["Raats Family Wines"], "an estate");
    assertEq(view.searchDna("", ENTRIES), [], "no query");
    assertEq(view.searchDna("chenin", null), [], "junk");
  });

  await test("chosen by the Somm: only wines not yet in the journal, by name or the facts the resolver trusts", () => {
    const found = view.searchRecs("chenin", { recs: RECS, journal: JOURNAL, facts });
    assertEq(found.map((r) => r.wine), ["Domaine Huet Le Mont Sec, Vouvray 2021", "Ken Forrester The FMC Chenin Blanc 2021"],
      "Huet by its grape, Ken Forrester by name — Raats is in the journal, however it's written; each wine once");
    assertEq(view.searchRecs("loire", { recs: RECS, journal: JOURNAL, facts }).map((r) => r.wine),
      ["Domaine Huet Le Mont Sec, Vouvray 2021"], "the province");
    assertEq(view.searchRecs("chenin", { recs: RECS, journal: JOURNAL }).map((r) => r.wine),
      ["Ken Forrester The FMC Chenin Blanc 2021"], "facts not resolved yet → names only");
    assertEq(found[0].matchType, "grape", "the rec itself comes back, match tag and all");
    assertEq(view.searchRecs("chenin", { recs: "junk", journal: JOURNAL, facts }), [], "junk recs");
    assertEq(view.searchRecs("", { recs: RECS, journal: JOURNAL, facts }), [], "no query");
  });

  await test("recent searches: newest first, one of each, five at most", () => {
    assertEq(view.addRecentSearch([], "  chenin "), ["chenin"], "trimmed");
    assertEq(view.addRecentSearch(["Kanonkop", "chenin"], "Chenin"), ["Chenin", "Kanonkop"],
      "the same search moves to the front, as last typed");
    assertEq(view.addRecentSearch(["Hemel-en-Aarde"], "hemel en aarde"), ["hemel en aarde"], "written differently is the same search");
    assertEq(view.addRecentSearch(["a", "b", "c", "d", "e"], "f"), ["f", "a", "b", "c", "d"], "five at most");
    assertEq(view.addRecentSearch(["a"], "   "), ["a"], "an empty search isn't one");
    assertEq(view.addRecentSearch(null, "x"), ["x"], "junk list");
    assertEq(view.addRecentSearch(["a", 3, "", "A"], "b"), ["b", "a"], "junk entries dropped, duplicates once");
  });

  await test("recent searches persist in localStorage — SSR-safe, junk-tolerant, never a throw", () => {
    assertEq(view.RECENT_SEARCHES_KEY, "sommeasy.recentSearches", "the key (README §10.3)");
    const hadStorage = "localStorage" in globalThis;
    const original = globalThis.localStorage;
    try {
      delete globalThis.localStorage;
      assertEq(view.readRecentSearches(), [], "no storage (the server) → nothing");
      assertEq(view.rememberSearch("chenin"), ["chenin"], "no storage → the list, unsaved");

      const store = fakeStorage();
      globalThis.localStorage = store;
      view.rememberSearch("chenin");
      view.rememberSearch("Kanonkop");
      assertEq(view.readRecentSearches(), ["Kanonkop", "chenin"], "remembered, newest first");
      assertEq(JSON.parse(store.map.get("sommeasy.recentSearches")), ["Kanonkop", "chenin"], "stored as a JSON array");

      store.map.set("sommeasy.recentSearches", "{not json");
      assertEq(view.readRecentSearches(), [], "corrupt → empty");
      store.map.set("sommeasy.recentSearches", JSON.stringify({ a: 1 }));
      assertEq(view.readRecentSearches(), [], "not a list → empty");
      store.map.set("sommeasy.recentSearches", JSON.stringify(["a", 2, " ", "b", "A", "c", "d", "e", "f"]));
      assertEq(view.readRecentSearches(), ["a", "b", "c", "d", "e"], "junk dropped, duplicates once, five at most");

      globalThis.localStorage = fakeStorage({ throws: true });
      assertEq(view.readRecentSearches(), [], "a store that throws reads as empty");
      assertEq(view.rememberSearch("x"), ["x"], "and never throws on write");
    } finally {
      if (hadStorage) globalThis.localStorage = original;
      else delete globalThis.localStorage;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
