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
    occasion: null,
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

  test("occasion truncated to 200 chars, null when absent", () => {
    const p = buildSommPayload({ ...baseArgs, occasion: "x".repeat(300) });
    assert(p.occasion.length === 200, `${p.occasion.length}`);
    assert(buildSommPayload(baseArgs).occasion === null, "expected null");
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

  test("accepts a good response", () => {
    const r = validateSommResponse({ picks: goodPicks, sommSummary: "A strong list." }, ctx);
    assert(r.valid, r.reason);
    assert(r.picks.length === 3 && r.sommSummary === "A strong list.", JSON.stringify(r));
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
