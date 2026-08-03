// Somm Picks — payload builder + validator test suite
// Run with: node src/lib/__tests__/sommPicks.test.js
//
// Unlike the older suites, this tests the REAL module (sommPicks.js is
// dependency-free ESM, loaded via dynamic import — no mirror drift).

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

function makeEntry(name, price, score, extra = {}) {
  return {
    name, price, score,
    vintage: extra.vintage || null,
    section: extra.section || null,
    detectedColor: extra.color ?? null,
    detectedVarietalId: extra.varietalId || null,
    detectedRegionIds: extra.regionIds || [],
    detectedCountry: extra.country || null,
    matchReasons: extra.reasons || [{ label: "r1" }, { label: "r2" }, { label: "r3" }, { label: "r4" }],
  };
}

async function main() {
  const { buildSommPayload, validateSommResponse, extractJson } = await import("../sommPicks.js");

  console.log("\n═══ buildSommPayload ═══");

  const manyEntries = Array.from({ length: 40 }, (_, k) =>
    makeEntry(`Wine ${k}`, 50 + k, 40 - k, { country: k % 2 ? "france" : "italy", regionIds: [k % 3 ? "burgundy" : "rhone_valley"] })
  );
  const baseArgs = {
    scoredEntries: manyEntries,
    algorithmicPicks: [manyEntries[0], manyEntries[3]],
    pickCount: 5,
    profile: {
      archetype: "The Connoisseur",
      narrative: "n",
      countries: ["france", "italy", "spain", "us", "australia", "germany", "austria", "portugal", "chile", "argentina"],
      varietals: ["pinot_noir", "syrah", "riesling", "chardonnay", "malbec", "nebbiolo", "tempranillo", "grenache", "gamay", "zinfandel"],
      estates: { burgundy: ["domaine_faiveley", "joseph_drouhin"], barossa: ["henschke", "torbreck", "penfolds", "kaesler", "langmeil", "glaetzer", "yalumba"] },
      specific_wines: ["a", "b", "c", "d", "e", "f", "g"],
    },
    ratedInteractions: [
      ...Array.from({ length: 14 }, (_, k) => ({ wine_name: `Loved ${k}`, rating: "loved", resolved_varietal: "Syrah", resolved_region: "Barossa" })),
      ...Array.from({ length: 12 }, (_, k) => ({ wine_name: `Nope ${k}`, rating: "not_for_me", resolved_varietal: null, resolved_region: null })),
      { wine_name: "Fine wine", rating: "fine" },
    ],
    totalParsed: 60,
    budget: { min: null, max: null },
    color: null,
    steer: null,
  };

  test("candidates capped at 25, sorted by score desc, i = array index", () => {
    const p = buildSommPayload(baseArgs);
    assert(p.candidates.length === 25, `got ${p.candidates.length}`);
    assert(p.candidates[0].score >= p.candidates[24].score, "not sorted desc");
    assert(p.candidates.every((c, idx) => c.i === idx), "i mismatch");
  });

  test("filters out zero-score and null-price entries", () => {
    const p = buildSommPayload({
      ...baseArgs,
      scoredEntries: [makeEntry("Zero", 20, 0), makeEntry("NoPrice", null, 8), makeEntry("Good", 30, 5)],
    });
    assert(p.candidates.length === 1 && p.candidates[0].name === "Good", JSON.stringify(p.candidates.map(c => c.name)));
  });

  test("budget filter keeps up-to-2x-max (splurge slate) and drops beyond", () => {
    const p = buildSommPayload({
      ...baseArgs,
      budget: { min: 20, max: 50 },
      scoredEntries: [makeEntry("Cheap", 10, 9), makeEntry("In", 40, 8), makeEntry("Splurgey", 95, 7), makeEntry("TooRich", 101, 6)],
    });
    const names = p.candidates.map(c => c.name);
    assert(!names.includes("Cheap") && names.includes("In") && names.includes("Splurgey") && !names.includes("TooRich"), JSON.stringify(names));
  });

  test("color filter excludes explicit mismatch, keeps unknown color", () => {
    const p = buildSommPayload({
      ...baseArgs,
      color: "red",
      scoredEntries: [makeEntry("Red", 30, 9, { color: "red" }), makeEntry("White", 30, 8, { color: "white" }), makeEntry("Unknown", 30, 7)],
    });
    const names = p.candidates.map(c => c.name);
    assert(names.includes("Red") && !names.includes("White") && names.includes("Unknown"), JSON.stringify(names));
  });

  test("reasons capped at 3", () => {
    const p = buildSommPayload(baseArgs);
    assert(p.candidates.every(c => c.reasons.length <= 3), "reason cap violated");
  });

  test("dna caps: 8 countries, 8 varietals, 8 estates, 5 specific wines", () => {
    const p = buildSommPayload(baseArgs);
    assert(p.dna.countries.length === 8, `countries ${p.dna.countries.length}`);
    assert(p.dna.varietals.length === 8, `varietals ${p.dna.varietals.length}`);
    assert(p.dna.topEstates.length === 8, `estates ${p.dna.topEstates.length}`);
    assert(p.dna.specificWines.length === 5, `wines ${p.dna.specificWines.length}`);
    assert(p.dna.topEstates[0] === "Domaine Faiveley", `prettify: ${p.dna.topEstates[0]}`);
  });

  test("feedback capped 10/10 with {name, varietal, region} shape", () => {
    const p = buildSommPayload(baseArgs);
    assert(p.feedback.loved.length === 10 && p.feedback.notForMe.length === 10, `${p.feedback.loved.length}/${p.feedback.notForMe.length}`);
    assert(p.feedback.loved[0].varietal === "Syrah" && p.feedback.loved[0].region === "Barossa", JSON.stringify(p.feedback.loved[0]));
  });

  test("steer trimmed + capped to 200 chars, null when absent or blank", () => {
    const p = buildSommPayload({ ...baseArgs, steer: "x".repeat(300) });
    assert(p.steer.length === 200, `${p.steer.length}`);
    assert(buildSommPayload(baseArgs).steer === null, "expected null when absent");
    assert(buildSommPayload({ ...baseArgs, steer: "   " }).steer === null, "expected null when blank");
    assert(buildSommPayload({ ...baseArgs, steer: "  focus on chenin  " }).steer === "focus on chenin", "expected trim");
    assert(!("occasion" in p), "occasion key must be gone");
  });

  test("algorithmicPicks map to candidate indices", () => {
    const p = buildSommPayload(baseArgs);
    assert(Array.isArray(p.algorithmicPicks) && p.algorithmicPicks.includes(0), JSON.stringify(p.algorithmicPicks));
  });

  test("display helpers are applied to candidates and dna", () => {
    const p = buildSommPayload({
      ...baseArgs,
      display: { varietal: (v) => `V:${v}`, region: (r) => `R:${r}`, country: (c) => `C:${c}` },
    });
    assert(p.dna.varietals[0] === "V:pinot_noir", p.dna.varietals[0]);
    assert(p.candidates[0].country.startsWith("C:"), p.candidates[0].country);
  });

  console.log("\n═══ steer-aware candidate slate ═══");

  // A menu the DNA loves (30 positive-score wines, no Chenin) plus wines the
  // DNA has never met (score 0) — the exact case the steer must rescue.
  const dnaFavorites = Array.from({ length: 30 }, (_, k) =>
    makeEntry(`Barossa Shiraz ${k}`, 40 + k, 30 - k, { country: "australia", varietalId: "syrah_shiraz" })
  );
  const chenins = [
    makeEntry("Raats Original Chenin Blanc", 38, 0, { country: "south_africa", varietalId: "chenin_blanc", color: "white" }),
    makeEntry("Ken Forrester Old Vine Reserve", 45, 0, { country: "south_africa", varietalId: "chenin_blanc", color: "white" }),
    makeEntry("Domaine Huet Le Mont Sec", 60, 0, { country: "france", varietalId: "chenin_blanc", color: "white" }),
  ];
  const steerArgs = { ...baseArgs, scoredEntries: [...dnaFavorites, ...chenins], totalParsed: 33 };

  test("no steer: no steerMatch fields, slate byte-identical to today", () => {
    const p = buildSommPayload(steerArgs);
    assert(p.candidates.length === 25, `got ${p.candidates.length}`);
    assert(p.candidates.every((c) => !("steerMatch" in c)), "steerMatch must be absent without a steer");
  });

  test("steer pulls DNA-invisible matches into the slate (the Chenin case)", () => {
    const base = buildSommPayload(steerArgs);
    const p = buildSommPayload({ ...steerArgs, steer: "focus on Chenin tonight" });
    assert(p.candidates.length === 28, `got ${p.candidates.length}`);
    // Additive-only: the existing slate survives untouched as a prefix
    for (let k = 0; k < 25; k++) {
      assert(p.candidates[k].name === base.candidates[k].name, `prefix diverged at ${k}`);
    }
    const extras = p.candidates.slice(25);
    assert(extras.every((c) => /Chenin|Forrester|Huet/.test(c.name)), JSON.stringify(extras.map((c) => c.name)));
    assert(extras.every((c) => c.steerMatch === true), "extras must carry steerMatch");
    assert(p.candidates.every((c, idx) => c.i === idx), "i must stay sequential");
  });

  test("steer flags matching candidates already in the slate", () => {
    const p = buildSommPayload({ ...steerArgs, steer: "something Australian" });
    // All 30 Australians match: 25 in the base slate (flagged in place) plus
    // the 5 below the cutoff appended as extras. The Chenins don't match.
    assert(p.candidates.length === 30, `got ${p.candidates.length}`);
    assert(p.candidates.every((c) => c.steerMatch === true), "every Australian must be flagged");
    assert(!p.candidates.some((c) => /Chenin|Forrester|Huet/.test(c.name)), "non-matching wines must not ride along");
  });

  test("demonym steers reach the wines they mean ('something South African')", () => {
    const p = buildSommPayload({ ...steerArgs, steer: "something South African" });
    const extras = p.candidates.slice(25);
    assert(extras.length === 2, `got ${extras.length}`);
    assert(extras.every((c) => /Raats|Forrester/.test(c.name)), JSON.stringify(extras.map((c) => c.name)));
  });

  test("negated terms never augment ('no Chardonnay', 'nothing Californian')", () => {
    const chard = makeEntry("Kistler Les Noisetiers Chardonnay", 90, 0, { country: "us", varietalId: "chardonnay", color: "white" });
    const p = buildSommPayload({
      ...steerArgs,
      scoredEntries: [...dnaFavorites, chard],
      steer: "no Chardonnay please",
    });
    assert(p.candidates.length === 25, `got ${p.candidates.length}`);
    assert(p.candidates.every((c) => !("steerMatch" in c)), "a purely negative steer must not flag or augment");
  });

  test("steer extras respect budget, color, and the 6-wine cap", () => {
    const manyChenins = Array.from({ length: 10 }, (_, k) =>
      makeEntry(`Chenin Blanc ${k}`, 30 + k, 0, { country: "south_africa", varietalId: "chenin_blanc", color: "white" })
    );
    const overBudget = makeEntry("Unicorn Chenin Blanc", 500, 0, { varietalId: "chenin_blanc", color: "white" });
    const capped = buildSommPayload({
      ...steerArgs,
      scoredEntries: [...dnaFavorites, ...manyChenins, overBudget],
      budget: { min: null, max: 60 },
      steer: "focus on Chenin",
    });
    const extras = capped.candidates.slice(-6);
    assert(capped.candidates.length === 25 + 6, `cap: got ${capped.candidates.length}`);
    assert(!capped.candidates.some((c) => c.name === "Unicorn Chenin Blanc"), "budget must still gate extras");

    const colorGated = buildSommPayload({
      ...steerArgs,
      scoredEntries: [...dnaFavorites, ...chenins],
      color: "red",
      steer: "focus on Chenin",
    });
    assert(!colorGated.candidates.some((c) => /Chenin|Forrester|Huet/.test(c.name)), "color must still gate extras");
    assert(extras.every((c) => c.steerMatch === true), "extras must carry steerMatch");
  });

  console.log("\n═══ validateSommResponse ═══");

  const candidates = [
    { i: 0, name: "A", price: 40 },
    { i: 1, name: "B", price: 60 },
    { i: 2, name: "C", price: 90 },
    { i: 3, name: "D", price: 30 },
  ];
  const ctx = { candidates, pickCount: 3, budget: { min: null, max: 60 } };
  const goodPicks = [
    { i: 0, role: "top", note: "A lovely wine that matches your palate." },
    { i: 3, role: "value", note: "Punches far above its price." },
    { i: 2, role: "splurge", note: "Worth the stretch tonight." },
  ];

  test("accepts a good response with empty salvaged", () => {
    const r = validateSommResponse({ picks: goodPicks, sommSummary: "A strong list." }, ctx);
    assert(r.valid, r.reason);
    assert(r.picks.length === 3 && r.sommSummary === "A strong list.", JSON.stringify(r));
    assert(Array.isArray(r.salvaged) && r.salvaged.length === 0, JSON.stringify(r.salvaged));
  });

  test("rejects too few picks", () => {
    const r = validateSommResponse({ picks: goodPicks.slice(0, 2) }, ctx);
    assert(!r.valid, "should fail");
  });

  test("trims extra picks beyond pickCount instead of rejecting", () => {
    const r = validateSommResponse(
      { picks: [...goodPicks, { i: 1, role: "adventure", note: "A fourth pick that should be dropped." }], sommSummary: "s" },
      ctx
    );
    assert(r.valid, r.reason);
    assert(r.picks.length === 3 && r.picks.every((p) => p.i !== 1), JSON.stringify(r.picks.map((p) => p.i)));
    assert(r.salvaged.includes("trimmed 1 extra pick"), JSON.stringify(r.salvaged));
  });

  test("rejects out-of-range index", () => {
    const r = validateSommResponse({ picks: [{ i: 9, role: "top", note: "x" }, goodPicks[1], goodPicks[2]] }, ctx);
    assert(!r.valid && /index/.test(r.reason), r.reason);
  });

  test("rejects duplicate index", () => {
    const r = validateSommResponse({ picks: [goodPicks[0], { ...goodPicks[1], i: 0 }, goodPicks[2]] }, ctx);
    assert(!r.valid && /duplicate/.test(r.reason), r.reason);
  });

  test("promotes an unlabeled over-budget pick to splurge when the slot is free", () => {
    // C is $90 with max $60 — legal splurge territory, but the model said "top"
    const r = validateSommResponse(
      { picks: [{ i: 2, role: "top", note: "Over budget but tasty." }, goodPicks[0], { i: 3, role: "value", note: "ok note" }] },
      ctx
    );
    assert(r.valid, r.reason);
    assert(r.picks[0].role === "splurge", JSON.stringify(r.picks.map((p) => p.role)));
    assert(r.salvaged.includes("promoted splurge i=2"), JSON.stringify(r.salvaged));
  });

  test("rejects a second over-budget pick when the splurge slot is taken", () => {
    // max 50: B ($60) and C ($90) are both over; C takes splurge, B can't be saved
    const r = validateSommResponse(
      { picks: [{ i: 2, role: "splurge", note: "Worth it." }, { i: 1, role: "top", note: "Also over budget." }, { i: 3, role: "value", note: "ok note" }] },
      { candidates, pickCount: 3, budget: { min: null, max: 50 } }
    );
    assert(!r.valid && /budget/.test(r.reason), r.reason);
  });

  test("rejects splurge above 2x budget max", () => {
    const r = validateSommResponse(
      { picks: [{ i: 2, role: "splurge", note: "n" }, goodPicks[0], { i: 3, role: "value", note: "n2" }] },
      { candidates, pickCount: 3, budget: { min: null, max: 40 } }
    );
    assert(!r.valid && /splurge/.test(r.reason), r.reason);
  });

  test("rejects empty/missing note", () => {
    const empty = validateSommResponse({ picks: [{ i: 0, role: "top", note: "  " }, goodPicks[1], goodPicks[2]] }, ctx);
    const missing = validateSommResponse({ picks: [{ i: 0, role: "top" }, goodPicks[1], goodPicks[2]] }, ctx);
    assert(!empty.valid && !missing.valid, `${empty.valid}/${missing.valid}`);
  });

  test("clips an overlong note at a sentence boundary instead of rejecting", () => {
    const sentence = "This wine sings with the bright cherry fruit you loved in that Barossa Syrah. ";
    const longNote = sentence.repeat(9); // ~700 chars of real sentences
    const r = validateSommResponse({ picks: [{ i: 0, role: "top", note: longNote }, goodPicks[1], goodPicks[2]] }, ctx);
    assert(r.valid, r.reason);
    assert(r.picks[0].note.length <= 500, `len ${r.picks[0].note.length}`);
    assert(/\.$/.test(r.picks[0].note), `should end on a sentence: "...${r.picks[0].note.slice(-20)}"`);
    assert(r.salvaged.includes("clipped note i=0"), JSON.stringify(r.salvaged));
  });

  test("clips a degenerate no-space overlong note to the cap", () => {
    const r = validateSommResponse({ picks: [{ i: 0, role: "top", note: "x".repeat(700) }, goodPicks[1], goodPicks[2]] }, ctx);
    assert(r.valid, r.reason);
    assert(r.picks[0].note.length <= 500, `len ${r.picks[0].note.length}`);
  });

  test("coerces unknown roles and duplicate core roles to wildcard", () => {
    const r = validateSommResponse(
      { picks: [
        { i: 0, role: "banger", note: "great" },
        { i: 1, role: "top", note: "also great" },
        { i: 3, role: "top", note: "third" },
      ] },
      { candidates, pickCount: 3, budget: { min: null, max: 100 } }
    );
    assert(r.valid, r.reason);
    assert(r.picks[0].role === "wildcard" && r.picks[1].role === "top" && r.picks[2].role === "wildcard", JSON.stringify(r.picks.map(p => p.role)));
  });

  test("rejects non-object and missing picks", () => {
    assert(!validateSommResponse(null, ctx).valid, "null");
    assert(!validateSommResponse({ nope: 1 }, ctx).valid, "no picks");
  });

  test("extractJson strips markdown fences", () => {
    const parsed = JSON.parse(extractJson('```json\n{"a":1}\n```'));
    assert(parsed.a === 1, "fence strip failed");
  });

  console.log(`\nTotal: ${passed}/${passed + failed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error("Test runner crashed:", err); process.exit(1); });
