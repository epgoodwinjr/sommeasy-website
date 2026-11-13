// curatePicks — the engine's own picks, and Tonight's terms
// Run with: node src/lib/__tests__/curatePicks.test.js
//
// Tests the REAL matchEngine.js (alias loader for its JSON import), with the
// real matchTerms.js and sommPicks.js beside it.
//
// 1. THE LOCK. fixtures/curatePicksLock.json holds what curatePicks returned
//    at d5cdf53 — before the terms rule — for 1,496 list × palate × color ×
//    budget combinations. The rule may only remove what broke the terms:
//    wherever those picks already obeyed them (and the color wasn't one the
//    old engine ignored), today's engine must return exactly the same picks,
//    in the same order, with the same roles.
// 2. THE RULE (Ed, Nov 12, 2026). Picks come only from wines inside min–max,
//    plus at most one over-max wine up to 2× max, labeled Splurge; when a
//    color is chosen, only from that color. No backfill — even if that
//    leaves three, two, one or zero picks.
// 3. THE SOMM AGREES. buildSommPayload makes the same wines eligible under
//    the same terms, so what the Somm is asked for is the engine's count.

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
const { buildSommPayload, buildAdventurePayload } = await import("../sommPicks.js");
const fx = JSON.parse(readFileSync(new URL("./fixtures/curatePicksLock.json", import.meta.url), "utf8"));

const INITIAL = { top: "t", splurge: "s", value: "v", adventure: "a", wildcard: "w" };
const LABEL = { top: "top", splurge: "splurge", value: "value", adventure: "adventure", wildcard: "wildcard" };

// One scoring per list × palate, as the page does it
const scoredCache = new Map();
function scoring(list, palate) {
  const key = `${list}|${palate}`;
  if (!scoredCache.has(key)) {
    const entries = engine.parseWineList(fx.lists[list]);
    const p = fx.palates[palate].profile;
    const rated = fx.palates[palate].rated;
    const dna = { countries: p.countries, regions: p.regions, estates: p.estates, varietals: p.varietals, specificWines: p.specific_wines || [] };
    const { scoredEntries: scored, userDNA } = engine.matchWinesAgainstDNA(entries, dna, rated.length ? engine.buildFeedbackSignals(rated) : null);
    scoredCache.set(key, { entries, scored, userDNA, menuContext: engine.buildMenuContext(scored.filter((e) => e.score > 0)), profile: p, rated });
  }
  return scoredCache.get(key);
}

function curate(list, palate, color, min, max) {
  const s = scoring(list, palate);
  const maxPicks = engine.getPickCount(s.entries.length, color);
  const picks = engine.curatePicks(s.scored, { minPrice: min, maxPrice: max, colorPreference: color, maxPicks, menuContext: s.menuContext, userDNA: s.userDNA });
  return { ...s, picks, maxPicks };
}
const indexOf = (scored, pick) => scored.findIndex((e) => e.name === pick.name && e.price === pick.price);
const encode = (scored, picks) => picks.map((x) => `${indexOf(scored, x)}${INITIAL[x.pickType]}`).join(" ");
const decode = (scored, code) => (code ? code.split(" ") : []).map((c) => ({ ...scored[parseInt(c, 10)], pickType: Object.keys(INITIAL).find((k) => INITIAL[k] === c.slice(-1)) }));
const show = (picks) => picks.map((x) => `$${x.price} ${LABEL[x.pickType]}`).join(" | ") || "(no picks)";

/** What the terms allow from a scored list: the wines that may be picked,
 *  split into those inside the budget and those one stretch over it. */
function supply(scored, color, min, max) {
  const eligible = scored.filter((e) => terms.isPickable(e) && terms.fitsColor(e, color));
  return {
    eligible,
    inBudget: eligible.filter((e) => terms.budgetFit(e.price, min, max) === "in"),
    splurges: eligible.filter((e) => terms.budgetFit(e.price, min, max) === "splurge"),
  };
}

/** Every way a set of picks can break the terms; [] when it obeys them. */
function breaks(picks, color, min, max) {
  const out = [];
  let over = 0;
  for (const x of picks) {
    if (!terms.fitsColor(x, color)) out.push(`$${x.price} is not ${color}`);
    const fit = terms.budgetFit(x.price, min, max);
    if (fit === "out") out.push(`$${x.price} ${x.pickType} is outside ${min ?? "…"}–${max ?? "…"}`);
    if (fit === "splurge") {
      over++;
      if (x.pickType !== "splurge") out.push(`$${x.price} is over max but labeled ${x.pickType}`);
    }
  }
  if (over > 1) out.push(`${over} picks over max`);
  return out;
}

const combos = [];
for (const list of Object.keys(fx.lists)) for (const palate of Object.keys(fx.palates)) for (const color of fx.colors) for (const [min, max] of fx.budgets) {
  combos.push({ list, palate, color, min, max, key: [list, palate, color, min ?? "", max ?? ""].join("|") });
}

console.log("\n═══ The lock — where today's picks obeyed the terms, nothing moves ═══");

test("the fixture is the one captured before the rule: every combination has an entry", () => {
  assert(combos.length === 1496, `${combos.length} combinations`);
  for (const c of combos) assert(typeof fx.picks[c.key] === "string", `missing ${c.key}`);
});

test("no budget, no color: every list × palate returns exactly the captured picks", () => {
  let n = 0;
  for (const c of combos) {
    if (c.color !== "all" || c.min != null || c.max != null) continue;
    const { scored, picks } = curate(c.list, c.palate, c.color, c.min, c.max);
    assertEq(encode(scored, picks), fx.picks[c.key], `${c.key}: ${show(picks)} — was ${show(decode(scored, fx.picks[c.key]))}`);
    n++;
  }
  assert(n === 22, `${n} combinations`);
});

test("a color the old engine honored (three or more of it), no budget: the captured picks", () => {
  let n = 0;
  for (const c of combos) {
    if (c.color === "all" || c.min != null || c.max != null) continue;
    const { scored, picks } = curate(c.list, c.palate, c.color, c.min, c.max);
    if (scored.filter((e) => terms.fitsColor(e, c.color)).length < 3) continue; // the old engine ignored this color
    assertEq(encode(scored, picks), fx.picks[c.key], `${c.key}: ${show(picks)} — was ${show(decode(scored, fx.picks[c.key]))}`);
    n++;
  }
  assert(n >= 20, `only ${n} combinations — the lock would be vacuous`);
});

test("wherever the captured picks already obeyed the terms, the picks are the same — budgets included", () => {
  let same = 0, changed = 0;
  for (const c of combos) {
    const { scored, picks } = curate(c.list, c.palate, c.color, c.min, c.max);
    const was = decode(scored, fx.picks[c.key]);
    const colorHonored = c.color === "all" || scored.filter((e) => terms.fitsColor(e, c.color)).length >= 3;
    if (!colorHonored || breaks(was, c.color, c.min, c.max).length > 0) { changed++; continue; }
    // The old engine obeyed the terms here. It may still have shown FEWER
    // than the terms allow only if it ran out of wines — it never did less.
    assertEq(encode(scored, picks), fx.picks[c.key], `${c.key}: ${show(picks)} — was ${show(was)}`);
    same++;
  }
  // Measured at the rule's birth: 364 locked, 1,132 the old engine broke the
  // terms on (most of the grid is tight budgets on short lists). Both must
  // stay in the hundreds, or one half of this test has gone vacuous.
  assert(same >= 300, `only ${same} locked combinations (${changed} changed by the rule)`);
  assert(changed >= 300, `only ${changed} combinations broke the terms before — the fixture should hold hundreds`);
});

console.log("\n═══ The rule — every combination ═══");

test("no pick breaks the terms: color, min, max, at most one over max and it is the Splurge", () => {
  for (const c of combos) {
    const { picks } = curate(c.list, c.palate, c.color, c.min, c.max);
    const broken = breaks(picks, c.color, c.min, c.max);
    assert(broken.length === 0, `${c.key}: ${broken.join("; ")} — ${show(picks)}`);
  }
});

test("no backfill and no shortfall: the count is what fits the budget, plus one splurge if there is one", () => {
  for (const c of combos) {
    const { scored, picks, maxPicks } = curate(c.list, c.palate, c.color, c.min, c.max);
    const s = supply(scored, c.color, c.min, c.max);
    const expected = Math.min(maxPicks, s.inBudget.length + (s.splurges.length > 0 ? 1 : 0));
    assert(picks.length === expected, `${c.key}: ${picks.length} picks, the terms allow ${expected} (${s.inBudget.length} fit, ${s.splurges.length} within 2×) — ${show(picks)}`);
  }
});

test("every pick is a wine on the list with a score and a price, and none appears twice", () => {
  for (const c of combos) {
    const { scored, picks } = curate(c.list, c.palate, c.color, c.min, c.max);
    const seen = new Set();
    for (const x of picks) {
      const k = indexOf(scored, x);
      assert(k >= 0 && terms.isPickable(scored[k]), `${c.key}: $${x.price} ${x.name} is not pickable`);
      assert(!seen.has(k), `${c.key}: ${x.name} twice`);
      seen.add(k);
    }
  }
});

test("when anything fits the budget, the Top Pick is in it", () => {
  for (const c of combos) {
    const { scored, picks } = curate(c.list, c.palate, c.color, c.min, c.max);
    if (supply(scored, c.color, c.min, c.max).inBudget.length === 0) continue;
    const top = picks.find((x) => x.pickType === "top");
    assert(top && terms.budgetFit(top.price, c.min, c.max) === "in", `${c.key}: ${show(picks)}`);
  }
});

console.log("\n═══ The rule — the 40-bottle list, row by row ═══");

const row = (title, list, palate, color, min, max, expected) =>
  test(title, () => assertEq(show(curate(list, palate, color, min, max).picks), expected, title));

row("no terms: five, as before", "realistic40", "e2e", "all", null, null, "$68 top | $165 splurge | $44 value | $78 adventure | $66 wildcard");
row("red, up to $80 (two fit): three — no $130 Adventure, no $84 Worth Trying", "realistic40", "e2e", "red", null, 80, "$68 top | $92 splurge | $78 value");
row("red, up to $80, the broader palate: three — the Top Pick is no longer a $160 bottle", "realistic40", "broad", "red", null, 80, "$78 top | $160 splurge | $68 value");
row("up to $60 (six or more fit): five, as before", "realistic40", "e2e", "all", null, 60, "$44 top | $68 splurge | $42 value | $58 adventure | $54 wildcard");
row("up to $45: four, as before", "realistic40", "e2e", "all", null, 45, "$44 top | $68 splurge | $42 value | $40 wildcard");
row("up to $41 (one fits): Top Pick and Splurge", "realistic40", "e2e", "all", null, 41, "$40 top | $68 splurge");
row("up to $39 (none fit, a splurge qualifies): the Splurge alone", "realistic40", "e2e", "all", null, 39, "$68 splurge");
row("up to $15 (none fit, nothing within 2×): no picks", "realistic40", "e2e", "all", null, 15, "(no picks)");
row("$250 and up (one fits): one pick, and it is not under the minimum", "realistic40", "e2e", "all", 250, null, "$280 top");
row("$100 to $130: five, as before", "realistic40", "e2e", "all", 100, 130, "$120 top | $165 splurge | $110 value | $130 adventure | $125 wildcard");
row("white, up to $45: three whites", "realistic40", "e2e", "white", null, 45, "$44 top | $66 splurge | $40 value");
row("the 7-wine list, up to $50: two", "e2e_7wine", "e2e", "all", null, 50, "$44 top | $85 splurge");
row("one $68 wine, up to $50: it is the Splurge, not a Top Pick over budget", "e2e_1wine_kanonkop", "e2e", "all", null, 50, "$68 splurge");
row("one $68 wine, up to $30: no picks", "e2e_1wine_kanonkop", "e2e", "all", null, 30, "(no picks)");

console.log("\n═══ The rule — min-only and max-only ═══");

test("a minimum alone: nothing under it, not even the stretch pick", () => {
  for (const min of [60, 100, 250]) for (const palate of ["e2e", "broad"]) {
    const { picks } = curate("realistic40", palate, "all", min, null);
    assert(picks.length > 0, `min ${min}/${palate}: no picks`);
    assert(picks.every((x) => x.price >= min), `min ${min}/${palate}: ${show(picks)}`);
  }
});

test("a maximum alone: nothing over it but one Splurge, and that within twice the max", () => {
  for (const max of [30, 41, 50, 60, 80, 100, 150]) for (const palate of ["e2e", "broad"]) {
    const { picks } = curate("realistic40", palate, "all", null, max);
    const over = picks.filter((x) => x.price > max);
    assert(over.length <= 1 && over.every((x) => x.pickType === "splurge" && x.price <= max * 2), `max ${max}/${palate}: ${show(picks)}`);
  }
});

test("a limit of zero or nothing is no limit (the amount fields hold \"\" or digits)", () => {
  const open = show(curate("realistic40", "e2e", "all", null, null).picks);
  assertEq(show(curate("realistic40", "e2e", "all", 0, 0).picks), open, "0 / 0");
  assertEq(show(curate("realistic40", "e2e", "all", undefined, undefined).picks), open, "undefined");
});

console.log("\n═══ The rule — a chosen color means that color ═══");

test("three or more of the color: the color, as before", () => {
  const { picks } = curate("colors_5r_2w_1s", "e2e", "red", null, null);
  assert(picks.length === 5 && picks.every((x) => x.detectedColor === "red"), show(picks));
});

test("two of the color: two picks — the list's reds no longer fill the page", () => {
  const { picks } = curate("colors_5r_2w_1s", "e2e", "white", null, null);
  assertEq(picks.map((x) => x.price).sort((a, b) => a - b), [44, 66], show(picks));
  assert(picks.every((x) => x.detectedColor === "white"), show(picks));
  // and the 7-wine list has two whites of its own
  assertEq(curate("e2e_7wine", "e2e", "white", null, null).picks.map((x) => x.price).sort((a, b) => a - b), [44, 52], "e2e_7wine");
});

test("one of the color: one pick", () => {
  assertEq(show(curate("colors_5r_2w_1s", "e2e", "sparkling", null, null).picks).replace(/ \w+$/, ""), "$110", "the one sparkling");
  // the broader palate scores only one of the two whites
  assertEq(curate("colors_5r_2w_1s", "broad", "white", null, null).picks.map((x) => x.price), [66], "one white with a score");
});

test("none of the color: no picks", () => {
  assertEq(curate("e2e_7wine", "e2e", "sparkling", null, null).picks, [], "no sparkling on the list");
  assertEq(curate("example", "broad", "sparkling", null, null).picks, [], "nor on the example list");
});

test("a wine whose color is unknown is handled as it was: red or white takes it, sparkling does not", () => {
  // \"Domaine Dujac Clos de la Roche 2019\": no section, no varietal — no detected color
  assert(scoring("e2e_1wine_dujac", "e2e").scored[0].detectedColor == null, "fixture premise: color unknown");
  assert(curate("e2e_1wine_dujac", "e2e", "red", null, null).picks.length === 1, "red keeps it");
  assert(curate("e2e_1wine_dujac", "e2e", "white", null, null).picks.length === 1, "white keeps it");
  assert(curate("e2e_1wine_dujac", "e2e", "sparkling", null, null).picks.length === 0, "sparkling asks for a sparkling wine");
});

test("color and budget together: both hold", () => {
  for (const [color, max] of [["white", 45], ["red", 80], ["sparkling", 60], ["white", 30]]) {
    const { picks } = curate("realistic40", "e2e", color, null, max);
    assert(breaks(picks, color, null, max).length === 0, `${color} ≤ ${max}: ${show(picks)}`);
  }
});

console.log("\n═══ The Somm agrees with the page ═══");

function payloadFor(c, steer = null) {
  const r = curate(c.list, c.palate, c.color, c.min, c.max);
  const payload = buildSommPayload({
    scoredEntries: r.scored, algorithmicPicks: r.picks, pickCount: r.maxPicks, profile: r.profile, ratedInteractions: r.rated,
    totalParsed: r.entries.length, budget: { min: c.min, max: c.max }, color: c.color === "all" ? null : c.color, steer,
  });
  return { ...r, payload };
}
const entryOf = (scored, cand) => scored.find((e) => e.name === cand.name && e.price === cand.price);

test("what the Somm is asked for is the engine's count — every combination", () => {
  for (const c of combos) {
    const { picks, payload } = payloadFor(c);
    assert(payload.pickCount === picks.length, `${c.key}: the page shows ${picks.length}, the Somm is asked for ${payload.pickCount} of ${payload.candidates.length}`);
  }
});

test("the same wines are eligible: every candidate obeys the terms, and nothing eligible is left out", () => {
  for (const c of combos) {
    const { scored, payload } = payloadFor(c);
    const s = supply(scored, c.color, c.min, c.max);
    const eligible = new Set([...s.inBudget, ...s.splurges]);
    for (const cand of payload.candidates) assert(eligible.has(entryOf(scored, cand)), `${c.key}: candidate $${cand.price} ${cand.name} is not eligible under the terms`);
    assert(payload.candidates.length === Math.min(25, eligible.size), `${c.key}: ${payload.candidates.length} candidates of ${eligible.size} eligible`);
  }
});

test("the page's own picks are always candidates, so the Somm can keep any of them", () => {
  for (const c of combos) {
    const { picks, payload } = payloadFor(c);
    assert(payload.algorithmicPicks.length === picks.length, `${c.key}: ${payload.algorithmicPicks.length} of ${picks.length} picks are in the slate`);
  }
});

test("a crowded slate can't lose the in-budget wines: thirty high-scoring splurges, three that fit", () => {
  const mk = (name, price, score) => ({ name, price, score, detectedColor: "red", detectedVarietalIds: [], detectedRegionIds: [], detectedCountryIds: [], matchReasons: [{ label: "r", type: "country" }] });
  const scored = [
    ...Array.from({ length: 30 }, (_, k) => mk(`Stretch ${k}`, 120 + k, 9 - k * 0.01)),
    mk("Fits A", 60, 1.2), mk("Fits B", 70, 1.1), mk("Fits C", 80, 1.0),
  ];
  const picks = engine.curatePicks(scored, { minPrice: null, maxPrice: 80, colorPreference: "all", maxPicks: 5, menuContext: null, userDNA: null });
  assertEq(show(picks).split(" | ").length, 4, `three that fit and one splurge: ${show(picks)}`);
  const payload = buildSommPayload({ scoredEntries: scored, algorithmicPicks: picks, pickCount: 5, profile: {}, ratedInteractions: [], totalParsed: scored.length, budget: { min: null, max: 80 }, color: null, steer: null });
  assert(payload.candidates.length === 25, `capped at 25 (${payload.candidates.length})`);
  assert(payload.pickCount === 4, `asked for ${payload.pickCount}, the page shows 4`);
  assert(["Fits A", "Fits B", "Fits C"].every((n) => payload.candidates.some((cand) => cand.name === n)), "the wines that fit are in the slate");
  assert(payload.candidates.every((cand, i) => cand.i === i) && payload.candidates.every((cand, i, all) => i === 0 || all[i - 1].score >= cand.score), "still numbered in order, best first");
});

test("a steer adds candidates under the same terms — it can raise the ask, never lower it, never break them", () => {
  let raised = 0;
  for (const steer of ["focus on Chenin", "something sparkling", "big reds from the Rhône", "Champagne"]) {
    for (const c of combos) {
      if (c.list !== "realistic40" || !(c.max === 45 || c.max === 80 || c.max == null) || c.min != null) continue;
      const { scored, picks, payload } = payloadFor(c, steer);
      for (const cand of payload.candidates) {
        const e = entryOf(scored, cand);
        assert(terms.fitsColor(e, c.color), `${c.key} "${steer}": $${cand.price} ${cand.name} is not ${c.color}`);
        assert(terms.budgetFit(e.price, c.min, c.max) !== "out", `${c.key} "${steer}": $${cand.price} ${cand.name} is outside the budget`);
      }
      assert(payload.pickCount >= picks.length, `${c.key} "${steer}": asked ${payload.pickCount}, the page shows ${picks.length}`);
      if (payload.pickCount > picks.length) raised++;
    }
  }
  assert(raised > 0, "premise: at least one steer surfaces a wine the palate didn't score");
});

console.log("\n═══ A red whose name hides a sparkling word is a red (Nov 2026) ═══");

// "asti" in Castillo, "cava" in Cavallotto, "mcc" in McCrea, "brut" in
// Brutocao: until isSparkling read words, these reds were left out under
// Reds and offered under Sparkling — by the picks, the Somm's slate and the
// lone Adventure alike. Its own list: the lock fixture is never touched.
const HIDDEN = [
  "Marqués de Murrieta Castillo Ygay Rioja Gran Reserva 2011...$120",
  "Cavallotto Barolo Bricco Boschis 2018...$95",
  "Vietti Barbera d'Asti Tre Vigne 2021...$48",
  "McCrea Syrah, Washington 2019...$60",
  "Brutocao Zinfandel, Mendocino 2020...$44",
  "Segura Viudas Cava Brut Reserva NV...$36",
  "Saracco Moscato d'Asti 2023...$40",
].join("\n");
const STILL_REDS = [120, 95, 48, 60, 44], FIZZ = [36, 40];
const sorted = (prices) => prices.slice().sort((a, b) => a - b);
function hidden(dna) {
  const entries = engine.parseWineList(HIDDEN);
  const { scoredEntries: scored, userDNA } = engine.matchWinesAgainstDNA(entries, dna, null);
  return { entries, scored, userDNA, menuContext: engine.buildMenuContext(scored.filter((e) => e.score > 0)) };
}
const LOVES_THEM = {
  countries: ["spain", "italy", "us"], regions: { spain: ["rioja"], italy: ["piedmont"] }, estates: {},
  varietals: ["tempranillo", "nebbiolo", "barbera", "syrah", "zinfandel", "moscato"], specificWines: [],
};

test("the picks: Reds offers the five reds and neither sparkler; Sparkling offers the two and no red", () => {
  const s = hidden(LOVES_THEM);
  assertEq(s.scored.length, 7, "fixture premise: seven wines read");
  assert(s.scored.every((e) => e.score > 0), "fixture premise: the palate scores every wine — " + s.scored.filter((e) => !(e.score > 0)).map((e) => e.name).join(", "));
  const pick = (color) => engine.curatePicks(s.scored, { minPrice: null, maxPrice: null, colorPreference: color, maxPicks: 7, menuContext: s.menuContext, userDNA: s.userDNA });
  assertEq(sorted(s.scored.filter((e) => terms.fitsColor(e, "red")).map((e) => e.price)), sorted(STILL_REDS), "what fits Reds");
  assertEq(sorted(s.scored.filter((e) => terms.fitsColor(e, "sparkling")).map((e) => e.price)), sorted(FIZZ), "what fits Sparkling");
  const reds = pick("red").map((x) => x.price), fizz = pick("sparkling").map((x) => x.price);
  assert(reds.length >= 3 && reds.every((p) => STILL_REDS.includes(p)), `Reds: ${reds}`);
  assertEq(sorted(fizz), sorted(FIZZ), "Sparkling");
});

test("the Somm's slate: the same wines, under the same color", () => {
  const s = hidden(LOVES_THEM);
  const slate = (color) => buildSommPayload({
    scoredEntries: s.scored, algorithmicPicks: [], pickCount: 5, profile: { ...LOVES_THEM, specific_wines: [] }, ratedInteractions: [],
    totalParsed: 7, budget: { min: null, max: null }, color, steer: null,
  }).candidates;
  assertEq(sorted(slate("red").map((c) => c.price)), sorted(STILL_REDS), "Reds");
  assertEq(sorted(slate("sparkling").map((c) => c.price)), sorted(FIZZ), "Sparkling");
});

// The same trap words on producers the data has never met (a producer it
// knows scores on its rating alone, and a list with any match has no Adventure)
const HIDDEN_STRANGERS = [
  "Castillo de Nadie Tempranillo Reserva 2016...$120",
  "Cavallina Rossa Nebbiolo 2018...$95",
  "Azienda Nessuno Barbera d'Asti 2021...$48",
  "McCorkle Hollow Syrah 2019...$60",
  "Brutovski Zinfandel 2020...$44",
  "Casa Nadie Cava Brut Reserva NV...$36",
  "Azienda Nessuno Moscato d'Asti 2023...$40",
].join("\n");

test("the lone Adventure: on a list the palate knows nothing on, Reds ranks the reds and Sparkling the sparklers — and the Somm is told which is which", () => {
  const dna = { countries: ["new_zealand"], regions: {}, estates: {}, varietals: ["sauvignon_blanc"], specificWines: [] };
  const { scoredEntries: scored } = engine.matchWinesAgainstDNA(engine.parseWineList(HIDDEN_STRANGERS), dna, null);
  assertEq(scored.length, 7, "fixture premise: seven wines read");
  assert(scored.every((e) => !(e.score > 0)), "fixture premise: nothing matches — " + scored.filter((e) => e.score > 0).map((e) => e.name).join(", "));
  assertEq(sorted(terms.rankAdventures(scored, { color: "red" }).map((e) => e.price)), sorted(STILL_REDS), "Reds");
  assertEq(sorted(terms.rankAdventures(scored, { color: "sparkling" }).map((e) => e.price)), sorted(FIZZ), "Sparkling");
  const payload = buildAdventurePayload({
    scoredEntries: scored, profile: { ...dna, specific_wines: [] }, ratedInteractions: [], totalParsed: 7,
    budget: { min: null, max: null }, color: null, lean: null, steer: null,
  });
  const told = Object.fromEntries(payload.candidates.map((c) => [c.price, c.color]));
  assertEq(STILL_REDS.map((p) => told[p]), STILL_REDS.map(() => "red"), "the reds, as the Somm is told");
  assertEq(FIZZ.map((p) => told[p]), FIZZ.map(() => "sparkling"), "the sparklers");
});

console.log("\n═══ An unknown color is no color ═══");

// wineUnified files two grapes under the color "unknown" — "Sauvignon" and
// "Corvina, Rondinella, Molinara". Until Nov 2026 the engine handed that
// string on as the wine's detectedColor and the terms rule read it as a
// color: such a wine fit Red, White and Sparkling alike — none of them — and
// the placeholder even outranked the heading the wine was printed under.

const wineUnified = JSON.parse(readFileSync(new URL("../wineUnified.json", import.meta.url), "utf8"));
const REAL_COLORS = ["red", "white", "rosé", "sparkling"];
const ANY_PALATE = { countries: ["italy", "france"], regions: {}, estates: {}, varietals: ["sauvignon", "corvina_rondinella_molinara", "nebbiolo", "pinot_grigio"], specificWines: [] };
const score = (entries, dna = ANY_PALATE) => engine.matchWinesAgainstDNA(entries, dna, null).scoredEntries;

test("fixture premise: the data still files exactly these two grapes under \"unknown\"", () => {
  assertEq(wineUnified.varietals.filter((v) => !["red", "white", "rosé"].includes(v.color)).map((v) => `${v.name} = ${v.color}`).sort(),
    ["Corvina, Rondinella, Molinara = unknown", "Sauvignon = unknown"], "the grapes with no real color");
});

test("a pasted line: no grape, synonym or half of a combined name hands a wine a color that isn't one", () => {
  const spellings = new Set();
  for (const v of wineUnified.varietals) { spellings.add(v.name); for (const part of v.name.split(" / ")) spellings.add(part.trim()); }
  for (const synonym of Object.keys(wineUnified.varietalLookup)) spellings.add(synonym.replace(/_/g, " "));
  assert(spellings.size > 100, `fixture premise: every spelling (${spellings.size})`);
  // Each line read on its own: a list drops a line that repeats another
  // once folded ("Sémillon" / "Semillon")
  const scored = score([...spellings].flatMap((s) => engine.parseWineList(`Bodega Nadie ${s} 2021...$50`)));
  assertEq(scored.length, spellings.size, "one wine per spelling");
  const odd = scored.filter((e) => e.detectedColor != null && !REAL_COLORS.includes(e.detectedColor)).map((e) => `${e.name} → ${e.detectedColor}`);
  assertEq(odd, [], "colors that are not colors");
  const of = (grape) => scored.find((e) => e.name === `Bodega Nadie ${grape} 2021`).detectedColor;
  assertEq([of("Sauvignon"), of("Corvina, Rondinella, Molinara")], [null, null], "the two grapes: no color");
  assertEq([of("Sauvignon Blanc"), of("Cabernet Sauvignon"), of("Shiraz")], ["white", "red", "red"], "their neighbours keep theirs");
});

test("a photographed wine: the same, read from its variety field — and the photo's own color stands", () => {
  const wines = wineUnified.varietals.map((v, i) => ({ name: `Bodega Nadie Cuvée ${i}`, price: 50, variety: v.name, color: null }));
  const scored = score(engine.entriesFromVision(wines));
  const odd = scored.filter((e) => e.detectedColor != null && !REAL_COLORS.includes(e.detectedColor)).map((e) => `${e.visionData.variety} → ${e.detectedColor}`);
  assertEq(odd, [], "colors that are not colors");
  const read = (color) => score(engine.entriesFromVision([{ name: "Venica Ronco delle Mele", price: 80, variety: "Sauvignon", region: "Collio", color }]))[0];
  assertEq(read(null).detectedColor, null, "no color read, an unknown grape: no color");
  assertEq(read("white").detectedColor, "white", "the photo said white");
  assertEq(read("unknown").detectedColor, null, "a photo that says \"unknown\" said nothing");
  assertEq(REAL_COLORS.filter((c) => terms.fitsColor(read("unknown"), c)), ["red", "white", "rosé"], "…and the wine is one of unknown color");
});

test("the heading a wine is printed under colors it, as it does any wine with no color of its own", () => {
  const [sauvignon, amarone, stranger] = score(engine.parseWineList([
    "WHITE WINES", "Casa Nadie Sauvignon 2022...$40",
    "RED WINES", "Tenuta Nessuno Corvina, Rondinella, Molinara 2019...$70", "Somebody Else Estate 2022...$33",
  ].join("\n")));
  assertEq([sauvignon.detectedColor, amarone.detectedColor, stranger.detectedColor], ["white", "red", "red"], "the section's color");
  assertEq([terms.fitsColor(sauvignon, "red"), terms.fitsColor(amarone, "white")], [false, false], "and a known color still excludes");
});

const UNFILED = [
  "Livio Nessuno Sauvignon, Collio 2021...$62",
  "Azienda Nessuno Amarone, Corvina, Rondinella, Molinara 2017...$120",
  "Cantina Nessuno Nebbiolo, Langhe 2020...$70",
  "Cantina Nessuno Pinot Grigio, Alto Adige 2022...$40",
  "Casa Nessuno Prosecco Superiore NV...$36",
].join("\n");
function unfiled(dna = ANY_PALATE) {
  const entries = engine.parseWineList(UNFILED);
  const { scoredEntries: scored, userDNA } = engine.matchWinesAgainstDNA(entries, dna, null);
  return { entries, scored, userDNA, menuContext: engine.buildMenuContext(scored.filter((e) => e.score > 0)) };
}
const pricesOf = (list) => list.map((e) => e.price).sort((a, b) => a - b);

test("the picks: Reds and Whites each offer the two wines of unknown color beside their own; Sparkling offers neither", () => {
  const { entries, scored, userDNA, menuContext } = unfiled();
  // (Prosecco is a white grape in the data; the wine is sparkling by its name)
  assertEq(scored.map((e) => e.detectedColor), [null, null, "red", "white", "white"], "fixture premise: two unknown, a red, a white, a sparkler");
  assertEq(scored.map((e) => terms.isSparkling(e)), [false, false, false, false, true], "fixture premise: one sparkling wine");
  assert(scored.every((e) => e.score > 0), "fixture premise: the palate scores all five — " + scored.map((e) => e.score).join(", "));
  const picks = (color) => pricesOf(engine.curatePicks(scored, { minPrice: null, maxPrice: null, colorPreference: color, maxPicks: engine.getPickCount(entries.length, color), menuContext, userDNA }));
  assertEq(picks("red"), [62, 70, 120], "Reds: the Nebbiolo and the two unknowns");
  assertEq(picks("white"), [40, 62, 120], "Whites: the Pinot Grigio and the two unknowns");
  assertEq(picks("sparkling"), [36], "Sparkling: the Prosecco alone");
});

test("the Somm's slate: the same wines — and it is told no color, never \"unknown\"", () => {
  const { entries, scored, userDNA, menuContext } = unfiled();
  const slate = (color) => {
    const maxPicks = engine.getPickCount(entries.length, color);
    const picks = engine.curatePicks(scored, { minPrice: null, maxPrice: null, colorPreference: color, maxPicks, menuContext, userDNA });
    return buildSommPayload({
      scoredEntries: scored, algorithmicPicks: picks, pickCount: maxPicks, profile: { ...ANY_PALATE, specific_wines: [] }, ratedInteractions: [],
      totalParsed: entries.length, budget: { min: null, max: null }, color, steer: null,
    });
  };
  assertEq(pricesOf(slate("red").candidates), [62, 70, 120], "Reds");
  assertEq(slate("red").pickCount, 3, "and it is asked for all three");
  assertEq(pricesOf(slate("white").candidates), [40, 62, 120], "Whites");
  const all = slate(null);
  assert(!JSON.stringify(all).includes("unknown"), "the payload never says \"unknown\"");
});

test("the lone Adventure: an unknown-colored stranger ranks after the palate's color and before the rest, and the Somm is told no color", () => {
  const dna = { countries: ["new_zealand"], regions: {}, estates: {}, varietals: ["pinot_noir"], specificWines: [] };
  const scored = score(engine.parseWineList([
    "Bodega Nadie Sauvignon 2022...$45",
    "Bodega Nadie Pinot Grigio 2022...$40",
    "Bodega Nadie Tempranillo 2020...$60",
  ].join("\n")), dna);
  assert(scored.every((e) => !(e.score > 0)), "fixture premise: nothing matches — " + scored.map((e) => `${e.name} ${e.score}`).join(", "));
  assertEq(terms.rankAdventures(scored, { lean: "red" }).map((e) => e.price), [60, 45, 40], "red lean: the red, the unknown, the white");
  assertEq(terms.rankAdventures(scored, { lean: "white" }).map((e) => e.price), [40, 45, 60], "white lean: the white, the unknown, the red");
  assertEq(pricesOf(terms.rankAdventures(scored, { color: "red" })), [45, 60], "Reds: the red and the unknown");
  const payload = buildAdventurePayload({
    scoredEntries: scored, profile: { ...dna, specific_wines: [] }, ratedInteractions: [], totalParsed: 3,
    budget: { min: null, max: null }, color: null, lean: "red", steer: null,
  });
  assertEq(payload.candidates.map((c) => [c.price, c.color]), [[60, "red"], [45, null], [40, "white"]], "as the Somm is told");
  // …and whatever hands it an entry: the builder's own reading, not only the engine's
  const filed = [{ name: "A", price: 50, score: 0, detectedColor: "unknown" }, { name: "B", price: 60, score: 0, visionData: { color: "Unknown" } }];
  const direct = buildAdventurePayload({ scoredEntries: filed, profile: { ...dna, specific_wines: [] }, ratedInteractions: [], totalParsed: 2, budget: {}, color: null, lean: null, steer: null });
  assertEq(direct.candidates.map((c) => c.color), [null, null], "an entry filed under \"unknown\" is told as no color");
});

console.log(`\nTotal: ${passed}/${passed + failed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
