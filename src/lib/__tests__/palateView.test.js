// Palate view suite — The House List, Phase 5 (Your palate + Search)
// Run with: node src/lib/__tests__/palateView.test.js
//
// Tests the REAL module via dynamic import (palateView.js depends only on
// the dependency-free dnaThresholds.js, houseCopy.js and navTrail.js — the
// display names come in as a resolver, so the 2.9MB wine data never loads
// here). The rules pinned here:
//   1. The DNA as rows: countries, regions, grapes, estates, each with its
//      display name (never a raw id), ✦ only for what ratings EARNED
//      (promoted + source 'auto'), and bottles from dna_accumulation.
//      Within a kind: earned first, then the most bottles, then quiz order.
//   2. Unknown ≠ empty: accumulation that couldn't be read leaves bottle
//      counts unknown (null) and marks nothing earned — never "from your
//      quiz" on a guess.
//   3. Building now: only what can genuinely promote, closest first, the
//      distance in loved bottles from the REAL thresholds.
//   4. Recently evolved: the journal's timeline lines, newest three; a row
//      that names its wine links to that wine's page, the rest to the full
//      history.
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

const NAMES = {
  country: (id) => ({ south_africa: "South Africa", france: "France" })[id] || null,
  flag: (id) => ({ south_africa: "🇿🇦", france: "🇫🇷" })[id] || "",
  region: (id) => ({ stellenbosch: "Stellenbosch", swartland: "Swartland", vouvray: "Vouvray" })[id] || null,
  grape: (id) => ({ chenin_blanc: "Chenin Blanc", chardonnay: "Chardonnay", cabernet_sauvignon: "Cabernet Sauvignon" })[id] || null,
  estate: (id) => ({ kanonkop: "Kanonkop", raats_family_wines: "Raats Family Wines" })[id] || null,
};

// Screen 25's palate, as the tables hold it
const PROFILE = {
  countries: ["france", "south_africa"],
  regions: { south_africa: ["swartland", "stellenbosch"], france: ["vouvray"] },
  estates: { stellenbosch: ["kanonkop", "raats_family_wines"] },
  varietals: ["chardonnay", "chenin_blanc", "cabernet_sauvignon"],
};
const acc = (dimension, value, extra) => ({
  dimension, dimension_value: value, promoted: true, source: "quiz", interaction_count: 0, points: 0, ...extra,
});
const ACCUMULATION = [
  acc("country", "south_africa", { source: "auto", interaction_count: 10 }),
  acc("country", "france", { interaction_count: 2 }),
  acc("region", "stellenbosch", { source: "auto", interaction_count: 6 }),
  acc("region", "swartland", { source: "auto", interaction_count: 3 }),
  acc("varietal", "chenin_blanc", { source: "auto", interaction_count: 5 }),
  acc("varietal", "chardonnay", { interaction_count: 1 }),
  acc("varietal", "cabernet_sauvignon", { interaction_count: 1 }),
  acc("estate", "kanonkop", { interaction_count: 1 }),
  acc("estate", "raats_family_wines", { interaction_count: 1 }),
];

async function main() {
  const view = await import("../palateView.js");
  const { PROMOTION_THRESHOLDS, RATING_POINTS } = await import("../dnaThresholds.js");
  const { wineHref } = await import("../navTrail.js");

  await test("the DNA as rows: named, flagged, earned only by ratings, bottles from the accumulation", () => {
    const entries = view.dnaEntries({ profile: PROFILE, accumulation: ACCUMULATION, names: NAMES });
    assertEq(entries.map((e) => [e.kind, e.name, e.earned, e.bottles]), [
      ["country", "South Africa", true, 10],
      ["country", "France", false, 2],
      ["region", "Stellenbosch", true, 6],
      ["region", "Swartland", true, 3],
      ["region", "Vouvray", false, 0],
      ["grape", "Chenin Blanc", true, 5],
      ["grape", "Chardonnay", false, 1],
      ["grape", "Cabernet Sauvignon", false, 1],
      ["estate", "Kanonkop", false, 1],
      ["estate", "Raats Family Wines", false, 1],
    ], "screen 25: earned first, then the most bottles, then quiz order");
    assertEq(entries.filter((e) => e.kind === "country").map((e) => e.flag), ["🇿🇦", "🇫🇷"], "countries wear their flag");
    assertEq(entries.find((e) => e.name === "Vouvray").flag, "", "nothing else does");
    assertEq(entries.find((e) => e.name === "Kanonkop").id, "kanonkop", "the id rides along for keys");
  });

  await test("a quiz-promoted row is never ✦ — only a promotion the ratings earned", () => {
    const entries = view.dnaEntries({
      profile: { varietals: ["chenin_blanc", "chardonnay"] },
      accumulation: [
        acc("varietal", "chenin_blanc", { source: "quiz", interaction_count: 9 }),
        acc("varietal", "chardonnay", { source: "auto", promoted: false, interaction_count: 2 }),
      ],
      names: NAMES,
    });
    assertEq(entries.map((e) => [e.name, e.earned]), [["Chenin Blanc", false], ["Chardonnay", false]],
      "quiz source or not promoted → no ✦");
  });

  await test("where a row came from rides on its source, never its count", () => {
    const entries = view.dnaEntries({
      profile: { regions: { france: ["burgundy"] }, varietals: ["chenin_blanc", "pinot_noir", "chardonnay"] },
      accumulation: [
        // Earned, then every bottle behind it deleted (honest counts reach 0),
        // and a rollup-created region that never had a bottle of its own
        acc("varietal", "chenin_blanc", { source: "auto", interaction_count: 0, points: 0 }),
        acc("region", "burgundy", { source: "auto", interaction_count: 0 }),
        acc("varietal", "pinot_noir", { source: "quiz", interaction_count: 4 }),
      ],
      names: NAMES,
    });
    assertEq(entries.map((e) => [e.id, e.earned, e.bottles, e.source]), [
      ["burgundy", true, 0, "auto"],
      ["chenin_blanc", true, 0, "auto"],
      ["pinot_noir", false, 4, "quiz"],
      ["chardonnay", false, 0, "quiz"],
    ], "an earned row at zero stays earned; a listed row with no accumulation row is the quiz's");
    const unknown = view.dnaEntries({ profile: { varietals: ["chardonnay"] }, accumulation: null, names: NAMES });
    assertEq(unknown[0].source, null, "unreadable accumulation → the source is unknown too");
  });

  await test("names: the lookup first, then the engine's display name, then a prettified id — never a raw one", () => {
    const calls = [];
    const names = {
      ...NAMES,
      region: (id, countryId) => { calls.push(["region", id, countryId]); return NAMES.region(id); },
      estate: (id, regionId) => { calls.push(["estate", id, regionId]); return NAMES.estate(id); },
    };
    const entries = view.dnaEntries({
      profile: {
        regions: { south_africa: ["stellenbosch", "hemel_en_aarde"], france: ["cote_rotie"] },
        estates: { stellenbosch: ["kanonkop"] },
      },
      accumulation: [acc("region", "hemel_en_aarde", { display_name: "Hemel-en-Aarde" })],
      names,
    });
    assertEq(entries.map((e) => e.name), ["Stellenbosch", "Hemel-en-Aarde", "Cote Rotie", "Kanonkop"],
      "engine display name, then a prettified id");
    assertEq(calls.filter((c) => c[0] === "region").map((c) => c[2]), ["south_africa", "south_africa", "france"],
      "a region is looked up with its country");
    assertEq(calls.find((c) => c[0] === "estate")[2], "stellenbosch", "an estate with its region");
  });

  await test("unknown ≠ empty: unreadable accumulation leaves counts unknown and nothing earned", () => {
    const entries = view.dnaEntries({ profile: PROFILE, accumulation: null, names: NAMES });
    assertEq(entries.every((e) => e.bottles === null && e.earned === false), true, "no guesses");
    assertEq(entries.filter((e) => e.kind === "grape").map((e) => e.name),
      ["Chardonnay", "Chenin Blanc", "Cabernet Sauvignon"], "quiz order stands");
  });

  await test("the DNA rows are junk-tolerant and never repeat themselves", () => {
    assertEq(view.dnaEntries({ profile: null, accumulation: [], names: NAMES }), [], "no profile");
    assertEq(view.dnaEntries({ profile: "junk", accumulation: "junk", names: NAMES }), [], "junk profile");
    const entries = view.dnaEntries({
      profile: {
        countries: ["france", 7, null, "france"],
        regions: "junk",
        estates: { stellenbosch: ["kanonkop"], swartland: ["kanonkop", 3] },
        varietals: null,
      },
      accumulation: [null, 5, { dimension: "country" }],
      names: NAMES,
    });
    assertEq(entries.map((e) => [e.kind, e.name, e.bottles]), [["country", "France", 0], ["estate", "Kanonkop", 0]],
      "junk skipped, duplicates once");
  });

  await test("DNA groups: Countries, Regions, Grapes, Estates — only the ones with rows", () => {
    const groups = view.dnaGroups(view.dnaEntries({ profile: PROFILE, accumulation: ACCUMULATION, names: NAMES }));
    assertEq(groups.map((g) => [g.label, g.entries.length]),
      [["Countries", 2], ["Regions", 3], ["Grapes", 3], ["Estates", 2]], "labels and sizes");
    const sparse = view.dnaGroups(view.dnaEntries({ profile: { varietals: ["chardonnay"] }, accumulation: [], names: NAMES }));
    assertEq(sparse.map((g) => g.label), ["Grapes"], "empty groups never render");
    assertEq(view.dnaGroups("junk"), [], "junk");
  });

  await test("browsing the DNA leaves countries out", () => {
    const entries = view.dnaEntries({ profile: PROFILE, accumulation: ACCUMULATION, names: NAMES });
    assertEq(view.browseDna(entries).map((e) => e.kind),
      ["region", "region", "region", "grape", "grape", "grape", "estate", "estate"], "regions, grapes, estates");
    assertEq(view.browseDna(null), [], "junk");
  });

  await test("building now: only what can promote, closest first, distance from the REAL thresholds", () => {
    const away = (dim, points) => Math.max(1, Math.ceil((PROMOTION_THRESHOLDS[dim] - points) / RATING_POINTS.loved));
    const rows = [
      { dimension: "region", dimension_value: "hemel_en_aarde", display_name: "Hemel-en-Aarde", points: 4, promoted: false, mappable: true },
      { dimension: "estate", dimension_value: "ken_forrester", display_name: "Ken Forrester", points: 3, promoted: false },
      { dimension: "varietal", dimension_value: "chenin_blanc", display_name: "Chenin Blanc", points: 9, promoted: true },
      { dimension: "varietal", dimension_value: "pinotage", display_name: "Pinotage", points: 0, promoted: false },
      { dimension: "varietal", dimension_value: "syrah", display_name: "Syrah", points: -2, promoted: false },
      { dimension: "region", dimension_value: "somewhere", display_name: "Somewhere", points: 5, promoted: false, mappable: false },
      { dimension: "region", dimension_value: "nameless", display_name: null, points: 5, promoted: false },
      { dimension: "mystery", dimension_value: "x", display_name: "X", points: 5, promoted: false },
      null,
    ];
    const built = view.buildingNow(rows);
    assertEq(built.rows.map((r) => r.name), ["Ken Forrester", "Hemel-en-Aarde"],
      "promoted, pointless, negative, unmappable, nameless and unknown dimensions never show");
    const kf = built.rows[0];
    assertEq([kf.kind, kf.away, kf.ratio], ["estate", away("estate", 3), Math.min(1, 3 / PROMOTION_THRESHOLDS.estate)],
      "an estate's distance and fill");
    assertEq(built.rows[1].away, away("region", 4), "a region's distance");
    assertEq(built.more, 0, "nothing held back");
  });

  await test("building now caps the list and says how many more are building", () => {
    // Points 1…9 against the region threshold: every row still short of it
    const rows = Array.from({ length: 9 }, (_, i) => ({
      dimension: "region", dimension_value: `r${i}`, display_name: `Region ${i}`,
      points: Math.min(i + 1, PROMOTION_THRESHOLDS.region - 1), promoted: false,
    }));
    const built = view.buildingNow(rows, { limit: 6 });
    assertEq(built.rows.length, 6, "six shown");
    assertEq(built.rows[0].name, "Region 8", "closest first");
    assertEq(built.more, 3, "three more");
    const over = view.buildingNow([{ dimension: "estate", dimension_value: "e", display_name: "E", points: 99, promoted: false }]);
    assertEq(over.rows[0].ratio, 1, "a fill never runs past full");
    assertEq(view.buildingNow(null), null, "unreadable → unknown, not empty");
    assertEq(view.buildingNow([]), { rows: [], more: 0 }, "nothing building");
  });

  await test("recently evolved: the journal's lines, the newest three, linked to their wine or the history", () => {
    const now = new Date(2026, 9, 30);
    const at = (m, d) => new Date(2026, m, d, 12).toISOString();
    const shift = { from: { title: "The South African Curator" }, to: { title: "The Stellenbosch Loyalist" } };
    const rows = view.evolutionRows([
      { id: "a", event_type: "promoted", dimension: "region", display_name: "Swartland", event_at: at(8, 12), wine_name: "Mullineux Old Vines White 2021" },
      { id: "b", event_type: "shifted", dimension: "identity", display_name: "The Stellenbosch Loyalist", dimension_value: JSON.stringify(shift), event_at: at(7, 1), wine_name: null },
      { id: "junk", event_type: "mystery", display_name: "?", event_at: at(7, 1) },
      { id: "c", event_type: "promoted", dimension: "varietal", display_name: "Chenin Blanc", event_at: at(7, 1) },
      { id: "d", event_type: "demoted", dimension: "estate", display_name: "Kanonkop", event_at: at(6, 3) },
    ], { now });
    assertEq(rows.map((r) => [r.key, r.line.emoji, r.line.text, r.line.strong, r.date]), [
      ["a", "🧬", "Swartland joined your regions", false, "Sep 12"],
      ["b", "✨", "You became The Stellenbosch Loyalist", true, "Aug 1"],
      ["c", "🧬", "Chenin Blanc joined your DNA", false, "Aug 1"],
    ], "junk dropped, three at most, newest first as read");
    assertEq(rows.map((r) => r.href), [wineHref("Mullineux Old Vines White 2021"), "/journal?tab=timeline", "/journal?tab=timeline"],
      "a named wine opens its page; the rest open the full history");
    assertEq(view.evolutionRows(null), null, "unreadable → unknown, not empty");
    assertEq(view.evolutionRows([]), [], "nothing yet");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
