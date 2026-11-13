// The lone Adventure — one pick from a list that matched nothing (Nov 2026)
// Run with: node src/lib/__tests__/loneAdventure.test.js
//
// Tests the REAL modules: matchEngine.js scores the lists (alias loader for
// its JSON import), matchTerms.js picks, sommPicks.js builds the Somm's ask
// and validates its answer, houseCopy.js says it.
//
// Ed's decision: when a list is read, wines reach the scorer and none of
// them scores above zero, the page no longer ends in "No matches found". It
// shows ONE pick, role Adventure, on the lone Splurge's principle.
//
// 1. THE TRIGGER. Nothing scored, and a priced wine fits tonight's terms. A
//    list with any match — even one that matches only on its producer's
//    rating — is exactly as it was: curatePicks decides, and over all 1,496
//    locked combinations there is no lone Adventure wherever anything
//    matched. curatePicks itself is untouched (curatePicks.test.js holds the
//    lock; this file never regenerates it).
// 2. THE ENGINE'S PICK. Tonight's color (else the palate's lean), then the
//    middle of the price range, inside the budget. No engine note: the
//    engine has no palate reason for it.
// 3. THE SOMM'S ASK. Its own slate — the priced wines that fit the terms, in
//    the engine's order, the engine's pick first — and an ask of exactly one.
//    The clamp and the validator agree (a property test, as for the picks).

import { register } from "node:module";
import { readFileSync } from "node:fs";
register("./helpers/alias-loader.mjs", import.meta.url);

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
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`ASSERT FAILED: ${msg}\n      expected ${e}\n      got      ${a}`);
}

const engine = await import("../matchEngine.js");
const terms = await import("../matchTerms.js");
const somm = await import("../sommPicks.js");
const copy = await import("../houseCopy.js");
const fx = JSON.parse(readFileSync(new URL("./fixtures/curatePicksLock.json", import.meta.url), "utf8"));

// Invented producers on purpose: a producer the data knows scores on its
// reputation alone (the engine's quality bonus), palate or no palate. Grapes
// and places the e2e palate (South Africa, France; Pinot Noir, Chardonnay,
// Chenin Blanc) has never met.
const NO_MATCH = `WHITES
Tenuta Immaginaria Soave Classico, Veneto 2022...$38
Bodegas Inventadas Albariño, Rías Baixas 2022...$46
Weingut Erfunden Riesling Kabinett, Mosel 2021...$52
Quinta Inventada Vinho Verde 2022...$34

REDS
Tenuta Immaginaria Valpolicella Superiore, Veneto 2020...$48
Bodegas Inventadas Tempranillo Reserva, Rioja 2016...$74
Fattoria Fittizia Nero d'Avola, Sicily 2021...$42
Cantina Finta Barbera d'Alba 2020...$56
Bodega Imaginada Malbec, Mendoza 2020...$64
Quinta Inventada Touriga Nacional, Douro 2018...$88

SPARKLING
Cantina Finta Prosecco Superiore NV...$44`;

const SOAVE = "Tenuta Immaginaria Soave Classico, Veneto 2022";
const VINHO_VERDE = "Quinta Inventada Vinho Verde 2022";
const RIESLING = "Weingut Erfunden Riesling Kabinett, Mosel 2021";
const VALPOLICELLA = "Tenuta Immaginaria Valpolicella Superiore, Veneto 2020";
const NERO = "Fattoria Fittizia Nero d'Avola, Sicily 2021";
const BARBERA = "Cantina Finta Barbera d'Alba 2020";
const PROSECCO = "Cantina Finta Prosecco Superiore NV";

const palate = (name) => fx.palates[name];
const dnaOf = (p) => ({ countries: p.countries, regions: p.regions, estates: p.estates, varietals: p.varietals, specificWines: p.specific_wines || [] });
function score(text, palateName = "e2e", rated = palate(palateName).rated) {
  const entries = engine.parseWineList(text);
  const { scoredEntries, userDNA } = engine.matchWinesAgainstDNA(entries, dnaOf(palate(palateName).profile), rated.length ? engine.buildFeedbackSignals(rated) : null);
  return { entries, scored: scoredEntries, userDNA };
}
const curate = (s, color = "all", min = null, max = null) => engine.curatePicks(s.scored, {
  minPrice: min, maxPrice: max, colorPreference: color, maxPicks: engine.getPickCount(s.entries.length, color),
  menuContext: engine.buildMenuContext(s.scored.filter((e) => e.score > 0)), userDNA: s.userDNA,
});
const display = { varietal: engine.getVarietalDisplayName, region: engine.getRegionDisplayName, country: engine.getCountryName };

const list = score(NO_MATCH);
const pickOf = (t) => terms.loneAdventure(list.scored, t)?.name ?? null;

console.log("\n═══ The trigger — a list that matched nothing ═══");

test("PREMISE: the real engine reads all eleven wines, every one priced, and scores none of them", () => {
  assertEq(list.scored.length, 11, "wines scored");
  assertEq(list.scored.filter((e) => e.score !== 0).map((e) => e.name), [], "wines with any score");
  assertEq(list.scored.filter((e) => e.price == null).length, 0, "wines without a price");
});

test("the engine's own picks are untouched: curatePicks still returns none for it, under any terms", () => {
  for (const color of ["all", "red", "white", "sparkling"]) for (const max of [null, 40, 60]) {
    assertEq(curate(list, color, null, max), [], `${color} / max ${max}`);
  }
});

test("…and the lone Adventure is the one pick the page gets", () => {
  const pick = terms.loneAdventure(list.scored, { lean: "white" });
  assert(pick, "a pick");
  assertEq(pick.pickType, "adventure", "its role is the existing Adventure");
  assertEq(engine.getPickTypeInfo(pick.pickType).label, "Adventure", "the badge it will wear");
  assertEq(typeof pick.price, "number", "it has a price");
});

test("a list with ANY match has no lone Adventure — all 1,496 locked combinations, under either lean", () => {
  let matchedLists = 0, checked = 0;
  for (const listName of Object.keys(fx.lists)) for (const palateName of Object.keys(fx.palates)) {
    const s = score(fx.lists[listName], palateName);
    const anyMatch = s.scored.some((e) => e.score > 0);
    if (anyMatch) matchedLists++;
    for (const color of fx.colors) for (const [min, max] of fx.budgets) for (const lean of [null, "red", "white"]) {
      const pick = terms.loneAdventure(s.scored, { color, min, max, lean });
      if (anyMatch) assert(pick === null, `${listName}|${palateName}|${color}|${min}|${max}: a lone Adventure beside real matches`);
      checked++;
    }
  }
  assert(checked === 1496 * 3, `${checked} checked`);
  assert(matchedLists >= 20, `only ${matchedLists} of 22 list × palate pairs matched anything — the premise moved`);
});

test("a list whose only match is a producer's rating stays exactly as it is: its picks, and no Adventure", () => {
  // A producer the data knows, a grape and a place the palate does not: the
  // engine's quality bonus scores it on reputation alone (Ed: leave for launch)
  const s = score(`Zenato Valpolicella Superiore, Veneto 2020...$48\n${NO_MATCH}`);
  const matches = s.scored.filter((e) => e.score > 0);
  assertEq(matches.map((e) => e.name), ["Zenato Valpolicella Superiore, Veneto 2020"], "the one match");
  assertEq(matches[0].matchReasons.map((r) => r.type), ["quality"], "matched on its producer's rating alone");
  assertEq(terms.loneAdventure(s.scored, { lean: "white" }), null, "no lone Adventure");
  assertEq(curate(s).map((p) => p.name), ["Zenato Valpolicella Superiore, Veneto 2020"], "the picks it always had");
});

console.log("\n═══ The engine's pick — the real list, row by row ═══");

test("no terms: the palate's lean, then the middle of the price range", () => {
  assertEq(pickOf({ lean: "white" }), SOAVE, "a white lean: the middle of four whites ($34 $38 $46 $52 → $38)");
  assertEq(pickOf({ lean: "red" }), BARBERA, "a red lean: the middle of six reds ($42 $48 $56 $64 $74 $88 → $56)");
  assertEq(pickOf({}), VALPOLICELLA, "no lean: the middle of all eleven ($48)");
});

test("tonight's color decides before the lean does", () => {
  assertEq(pickOf({ color: "red", lean: "white" }), BARBERA, "red tonight");
  assertEq(pickOf({ color: "white", lean: "red" }), SOAVE, "white tonight");
  assertEq(pickOf({ color: "sparkling", lean: "red" }), PROSECCO, "sparkling tonight");
});

test("tonight's budget holds: the pick is inside it, and a budget nothing fits means no pick", () => {
  assertEq(pickOf({ color: "white", max: 40 }), VINHO_VERDE, "white up to $40: $34 and $38 → the lower middle");
  assertEq(pickOf({ lean: "white", min: 50 }), RIESLING, "a white lean, $50 and up: the one white");
  assertEq(pickOf({ lean: "red", max: 45 }), NERO, "a red lean, up to $45: the one red");
  assertEq(pickOf({ lean: "red", max: 40 }), VINHO_VERDE, "no red fits: the middle of what does");
  assertEq(pickOf({ max: 30 }), null, "nothing at or under $30 — no Adventure, never a stretch");
  assertEq(pickOf({ min: 100 }), null, "nothing at $100 and up");
  assertEq(pickOf({ color: "sparkling", max: 40 }), null, "the one sparkling wine is over the max");
});

test("every pick, under every color × budget × lean, fits tonight's terms and is a wine on the list", () => {
  let picks = 0;
  for (const color of fx.colors) for (const [min, max] of fx.budgets) for (const lean of [null, "red", "white"]) {
    const pick = terms.loneAdventure(list.scored, { color, min, max, lean });
    const fits = list.scored.filter((e) => e.price != null && terms.fitsColor(e, color) && terms.budgetFit(e.price, min, max) === "in");
    assertEq(pick === null, fits.length === 0, `${color}|${min}|${max}|${lean}: a pick exactly when a priced wine fits the terms`);
    if (!pick) continue;
    picks++;
    assert(list.scored.some((e) => e.name === pick.name && e.price === pick.price), "on the list");
    assert(terms.fitsColor(pick, color), `${pick.name} is not ${color}`);
    assertEq(terms.budgetFit(pick.price, min, max), "in", `${pick.name} $${pick.price} against ${min}–${max}`);
  }
  assert(picks > 60, `only ${picks} picks were checked`);
});

test("its card carries no engine note: the engine has no palate reason for it", () => {
  const pick = terms.loneAdventure(list.scored, { lean: "white" });
  assertEq(pick.matchReasons, [], "no reasons");
  assertEq(copy.pickNote({ reasons: pick.matchReasons.map((r) => r.type), region: "Veneto", grape: null, country: "Italy" }), null, "no note");
  assertEq(copy.loneAdventureLine({ picks: [pick], matched: 0 }),
    "Nothing on this list is a clear match for your palate, so here’s the adventure we’d take.", "the line above it");
});

test("a wine the diner rated against is never the Adventure", () => {
  // The white lean's pick, rated "not for me": the engine scores it below
  // zero, and its grape and place with it — the pick moves to another wine
  const rated = [{ wine_name: SOAVE, rating: "not_for_me", interaction_type: "had" }];
  const s = score(NO_MATCH, "e2e", rated);
  const soave = s.scored.find((e) => e.name === SOAVE);
  assert(soave.score < 0, `the disliked wine scores ${soave.score}`);
  assert(!s.scored.some((e) => e.score > 0), "still nothing matched");
  const pick = terms.loneAdventure(s.scored, { lean: "white" });
  assert(pick && pick.name !== SOAVE, `picked ${pick?.name}`);
  assert(!(pick.score < 0), "and never another wine scored against");
  assert(!terms.rankAdventures(s.scored, {}).some((e) => e.score < 0), "none in the ranking either");
});

console.log("\n═══ The Somm's ask — its own slate, exactly one pick ═══");

const profile = { ...palate("e2e").profile, red_count: 1, white_count: 2 };
const build = (extra = {}) => somm.buildAdventurePayload({
  scoredEntries: list.scored, profile, ratedInteractions: palate("e2e").rated, totalParsed: list.entries.length,
  budget: { min: null, max: null }, color: null, lean: terms.palateLean(profile), steer: null, display, ...extra,
});

test("the payload asks for ONE Adventure, from the priced wines that fit the terms, the engine's pick first", () => {
  const p = build();
  assertEq(p.mode, "adventure", "its mode");
  assertEq(p.pickCount, 1, "exactly one");
  assertEq(p.candidates.length, 11, "every wine on this list fits no terms");
  assertEq(p.candidates.map((c) => c.i), p.candidates.map((_, k) => k), "numbered in order");
  assertEq(p.candidates[0].name, pickOf({ lean: "white" }), "candidate 0 is the engine's pick");
  assertEq(p.algorithmicPicks, [0], "…and it is named as the engine's choice");
  assertEq(p.candidates.map((c) => c.name), terms.rankAdventures(list.scored, { lean: "white" }).map((e) => e.name), "the engine's order");
});

test("a candidate says what the list said — name, price, and the grape, place and color where known — and no score", () => {
  const p = build();
  const riesling = p.candidates.find((c) => c.name === RIESLING);
  // (a pasted line keeps its vintage in its name; a photographed wine has the field)
  assertEq(riesling, { i: riesling.i, name: RIESLING, price: 52, vintage: null, section: null, varietal: "Riesling", region: "Mosel", country: "Germany", color: "white" }, "a candidate");
  for (const c of p.candidates) {
    assert(!("score" in c) && !("reasons" in c), `${c.name} carries a score or reasons — there are none to carry`);
    assert(typeof c.price === "number", `${c.name} has no price`);
  }
  assertEq(p.candidates.find((c) => c.name === PROSECCO).color, "sparkling", "a sparkling wine says so");
});

test("the palate rides along as context — the same DNA and feedback blocks the ordinary ask sends", () => {
  const p = build();
  const ordinary = somm.buildSommPayload({
    scoredEntries: list.scored, algorithmicPicks: [], pickCount: 5, profile, ratedInteractions: palate("e2e").rated,
    totalParsed: list.entries.length, budget: { min: null, max: null }, color: null, steer: null, display,
  });
  assertEq(p.dna, ordinary.dna, "dna");
  assertEq(p.feedback, ordinary.feedback, "feedback");
  assertEq(p.dna.countries, ["South Africa", "France"], "display names, never ids");
  assertEq(p.menu, { totalWines: 11 }, "the list's size");
  assertEq(p.lean, "white", "the palate's lean");
  // …while the ordinary ask has nothing to choose from on this list
  assertEq(ordinary.candidates, [], "the ordinary slate is empty: only scored wines are eligible for it");
  assertEq(ordinary.pickCount, 0, "…so it asks for nothing");
});

test("tonight's terms shape the slate: only wines of the color, inside the budget", () => {
  const p = build({ color: "red", budget: { min: null, max: 60 } });
  assertEq(p.color, "red", "the color");
  assertEq(p.budget, { min: null, max: 60 }, "the budget");
  assert(p.candidates.length > 0, "candidates");
  for (const c of p.candidates) {
    assert(c.price <= 60, `${c.name} $${c.price} is over the max`);
    assert(c.color !== "white" && c.color !== "sparkling", `${c.name} is ${c.color}`);
  }
  assertEq(p.candidates[0].name, pickOf({ color: "red", max: 60 }), "the engine's pick under the same terms");
  // Limits as the page may hold them
  assertEq(build({ budget: { min: "", max: "60" } }).budget, { min: null, max: 60 }, "digit strings and blanks");
});

test("nothing to offer → nothing to ask: an empty slate asks for zero picks", () => {
  const none = build({ budget: { min: null, max: 30 } });
  assertEq([none.candidates, none.pickCount, none.algorithmicPicks], [[], 0, []], "a budget nothing fits");
  const matched = score(`Kanonkop Pinotage, Stellenbosch 2019...$68\n${NO_MATCH}`);
  const p = somm.buildAdventurePayload({ scoredEntries: matched.scored, profile, ratedInteractions: [], totalParsed: 12, budget: {}, color: null, lean: "white", steer: null, display });
  assertEq([p.candidates, p.pickCount], [[], 0], "a list that matched anything is not an Adventure's to ask about");
  assertEq(somm.buildAdventurePayload({}).pickCount, 0, "junk in → nothing asked, never a throw");
});

test("the slate is capped, the engine's pick kept, and a steer's wines are never cut off", () => {
  const many = Array.from({ length: 70 }, (_, k) => ({
    name: `Invented Cuvée ${k}${k === 69 ? " Assyrtiko" : ""}`, price: 30 + k, score: 0, matchReasons: [], detectedColor: "white",
  }));
  const p = somm.buildAdventurePayload({ scoredEntries: many, profile, ratedInteractions: [], totalParsed: 70, budget: {}, color: null, lean: "white", steer: null, display });
  assertEq(p.candidates.length, somm.ADVENTURE_CANDIDATE_CAP, "the cap");
  assertEq(p.candidates[0].name, terms.loneAdventure(many, { lean: "white" }).name, "the engine's pick leads");
  assert(!p.candidates.some((c) => c.name.includes("Assyrtiko")), "the dearest wine is outside the cap without a steer");
  const steered = somm.buildAdventurePayload({ scoredEntries: many, profile, ratedInteractions: [], totalParsed: 70, budget: {}, color: null, lean: "white", steer: "  something Greek — an Assyrtiko  ", display });
  assertEq(steered.steer, "something Greek — an Assyrtiko", "the steer, trimmed");
  assertEq(steered.candidates.length, somm.ADVENTURE_CANDIDATE_CAP, "still capped");
  const hit = steered.candidates.find((c) => c.name.includes("Assyrtiko"));
  assert(hit && hit.steerMatch === true, "the wine the steer names is a candidate, and flagged");
  assertEq(steered.candidates[0].name, p.candidates[0].name, "the engine's pick still leads");
  // Every wine but the engine's pick is one the steer names: the pick still leads
  const pickName = terms.loneAdventure(many, { lean: "white" }).name;
  const allGreek = many.map((e) => (e.name === pickName ? e : { ...e, name: `${e.name} Assyrtiko` }));
  const crowded = somm.buildAdventurePayload({ scoredEntries: allGreek, profile, ratedInteractions: [], totalParsed: 70, budget: {}, color: null, lean: "white", steer: "Assyrtiko", display });
  assertEq([crowded.candidates.length, crowded.candidates[0].name, crowded.algorithmicPicks], [somm.ADVENTURE_CANDIDATE_CAP, pickName, [0]], "a steer can't push the engine's pick off the slate");
  assertEq(somm.buildAdventurePayload({ scoredEntries: many, profile, budget: {}, steer: "x".repeat(500), display }).steer.length, 200, "the steer is capped");
});

console.log("\n═══ The Somm's answer — one pick, inside the budget, honest about its role ═══");

const CANDS = [
  { i: 0, name: "A", price: 40 }, { i: 1, name: "B", price: 60 }, { i: 2, name: "C", price: 95 }, { i: 3, name: "D" },
];
const answer = (i, extra = {}) => ({ picks: [{ i, role: "adventure", note: "Not your usual grape, and the nearest thing here to the Chenin you love.", ...extra }], sommSummary: "" });

test("a good answer is one pick: its index, the Adventure role, its note — and no summary", () => {
  const r = somm.validateAdventureResponse(answer(1), { candidates: CANDS, budget: { max: 80 } });
  assertEq(r, { valid: true, picks: [{ i: 1, role: "adventure", note: answer(1).picks[0].note }], sommSummary: "", salvaged: [] }, "accepted as written");
});

test("the role is the Adventure whatever the model called it, and a summary is never passed on", () => {
  const r = somm.validateAdventureResponse({ ...answer(0, { role: "top" }), sommSummary: "A list with nothing for you." }, { candidates: CANDS, budget: {} });
  assertEq([r.valid, r.picks[0].role, r.sommSummary], [true, "adventure", ""], "normalized");
  assertEq(somm.validateAdventureResponse(answer(0, { role: "splurge" }), { candidates: CANDS, budget: { max: 80 } }).picks[0].role, "adventure", "even a splurge label");
});

test("more than one pick is trimmed to the first, and an overlong note clipped — both counted as salvage", () => {
  const two = { picks: [answer(0).picks[0], answer(1).picks[0]], sommSummary: "" };
  const r = somm.validateAdventureResponse(two, { candidates: CANDS, budget: {} });
  assertEq([r.valid, r.picks.length, r.picks[0].i, r.salvaged], [true, 1, 0, ["trimmed 1 extra pick"]], "trimmed");
  const long = somm.validateAdventureResponse(answer(0, { note: "A sentence of some length. ".repeat(40) }), { candidates: CANDS, budget: {} });
  assert(long.valid && long.picks[0].note.length <= 500 && long.salvaged.length === 1, JSON.stringify(long.salvaged));
});

test("what it rejects: no pick, a wine that isn't a candidate, no note, and a wine over the max — an Adventure is never a stretch", () => {
  const bad = (parsed, budget = {}) => somm.validateAdventureResponse(parsed, { candidates: CANDS, budget });
  assertEq(bad(null).valid, false, "not an object");
  assertEq(bad({ sommSummary: "" }).reason, "picks not an array", "no picks");
  assertEq(bad({ picks: [], sommSummary: "" }).reason, "pick count 0 < 1", "an empty answer");
  assertEq(bad(answer(7)).reason, "index 7 not in candidates", "an invented wine");
  assertEq(bad(answer(0, { note: "  " })).reason, "note missing for index 0", "no note");
  assertEq(bad(answer(2), { max: 80 }).reason, "adventure 95 > budget max", "over the max, though within twice it");
  assertEq(bad(answer(2, { role: "splurge" }), { max: 80 }).reason, "adventure 95 > budget max", "a splurge label doesn't excuse it");
  assertEq(bad(answer(1), { max: 60 }).valid, true, "exactly the max is inside it");
  assertEq(bad(answer(3), { max: 80 }).valid, true, "a wine with no price can't be shown to be over (the ordinary validator's reading)");
});

test("PROPERTY: the ask (feasibleAdventureCount) is one exactly when the validator can accept a pick — every subset of seeded slates", () => {
  let seed = 20261113;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let slates = 0;
  for (let round = 0; round < 60; round++) {
    const pool = Array.from({ length: 6 }, (_, i) => {
      const roll = rand();
      const price = roll < 0.15 ? undefined : roll < 0.25 ? null : 10 + Math.floor(rand() * 20) * 10;
      return { i, name: `W${i}`, ...(price === undefined ? {} : { price }) };
    });
    const priced = pool.map((c) => c.price).filter((x) => typeof x === "number");
    const budgets = [{}, { max: null }, { max: 0 }, { max: 50 }, { max: 100 }, { max: 150 }, { min: 80, max: 120 }];
    if (priced.length) budgets.push({ max: priced[0] }, { max: priced[0] - 1 }, { max: priced[0] / 2 });
    for (let mask = 0; mask < 64; mask++) {
      const candidates = pool.filter((_, i) => mask & (1 << i)).map((c, i) => ({ ...c, i }));
      for (const budget of budgets) {
        const acceptable = candidates.some((c) => somm.validateAdventureResponse(answer(c.i), { candidates, budget }).valid);
        assertEq(somm.feasibleAdventureCount(candidates, budget), acceptable ? 1 : 0,
          `slate ${JSON.stringify(candidates.map((c) => c.price ?? null))} under ${JSON.stringify(budget)}`);
        slates++;
      }
    }
  }
  assert(slates > 20000, `${slates} slates`);
  assertEq(somm.feasibleAdventureCount(null, {}), 0, "junk");
  assertEq(somm.feasibleAdventureCount([], { max: 50 }), 0, "an empty slate");
});

test("the page's payload always passes its own clamp: what the builder asks for, the validator can accept", () => {
  for (const color of fx.colors) for (const [min, max] of fx.budgets) {
    const p = build({ color: color === "all" ? null : color, budget: { min, max } });
    assertEq(p.pickCount, somm.feasibleAdventureCount(p.candidates, p.budget), `${color}|${min}|${max}`);
    assertEq(p.pickCount, terms.loneAdventure(list.scored, { color, min, max, lean: "white" }) ? 1 : 0, `${color}|${min}|${max}: asked exactly when the page shows a pick`);
    if (p.pickCount) assert(somm.validateAdventureResponse(answer(0), { candidates: p.candidates, budget: p.budget }).valid, "the engine's pick is acceptable");
  }
});

console.log(`\nTotal: ${passed}/${passed + failed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
