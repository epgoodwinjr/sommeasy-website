// palateRecs — "Chosen for your palate" follows the palate
// Run with: node src/lib/__tests__/palateRecs.test.js
//
// Tests the REAL palateRecs.js, wineRecs.js, palateRecsRead.js and
// profileEngine.js (alias loader for the wine data), with the REAL
// resolver, bottleEvidence and thresholds building the canary's evidence.
//
// 1. THE CANARY (Nov 23, 2026, production): a Rhône quiz plus five loved
//    Burgundies — two Domaine Dujac — became "The Burgundy Archivist" while
//    home still led with Chave, Torbreck, Rayas and an Alsace discovery.
//    Evidence built bottle by bottle through the real engine's per-bottle
//    definition; the Burgundy picks must lead.
// 2. THE RANKING: points move the list before anything promotes; loved
//    places, grapes and estates rise, "not for me" ones fall (and out);
//    ties keep the curated order; a quiz-only palate still lists every wine
//    profileEngine's old four passes listed, best-matched first.
// 3. ONE RANKING EVERYWHERE: profileEngine stores what the ranker returns;
//    home, Search and the wine page rank on read and never read the stored
//    list; nothing on a rating's path writes or ranks recommendations.
// 4. THE READ: a failed points read is null (the reader shows nothing),
//    never a list ranked on half the evidence. Never rejects.
// 5. THE DATA: every id in wineRecs.js is one wineUnified knows, every
//    region sits in its wine's country.

import { register } from "node:module";
import { readFileSync } from "node:fs";
register("./helpers/alias-loader.mjs", import.meta.url);

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
function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); }
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`ASSERT FAILED: ${msg} — expected ${e}, got ${a}`);
}

const SRC = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, SRC), "utf8");

const { rankRecommendations, scoreRecommendation, palateAffinity, DNA_WEIGHT, PALATE_RECS_LIMIT } =
  await import("../palateRecs.js");
const { WINE_RECS } = await import("../wineRecs.js");
const { readPalateRecs, PALATE_RECS_COLUMNS } = await import("../palateRecsRead.js");
const { generateDNAProfile } = await import("../profileEngine.js");
const { bottleEvidence } = await import("../dnaEvolution.js");
const { PROMOTION_THRESHOLDS, RATING_POINTS } = await import("../dnaThresholds.js");
const wineUnified = JSON.parse(read("wineUnified.json"));

const wines = (list) => list.map((r) => r.wine);
const row = (dimension, dimension_value, points) => ({ dimension, dimension_value, points });
const BURGUNDY = new Set(WINE_RECS.filter((r) => r.regions.includes("burgundy")).map((r) => r.wine));

// The palate after rating `bottles` (name, rating) on top of a quiz: points
// per dimension from the REAL per-bottle definition (bottleEvidence — the
// resolver, the confidence gates, the points tables), and a promotion into
// the DNA wherever a mappable dimension reaches its REAL threshold — what
// the engine's applyPromotions writes to the profile's columns.
function palateAfter(quiz, bottles) {
  const points = new Map();
  const where = new Map(); // estate → the region its bottles came from
  for (const [name, rating] of bottles) {
    const ev = bottleEvidence(name, rating);
    for (const d of ev.dimensions) {
      const key = `${d.dimension}:${d.dimensionValue}`;
      const was = points.get(key) || { ...d, points: 0 };
      points.set(key, { ...was, points: was.points + ev.points });
      if (d.dimension === "estate") where.set(d.dimensionValue, ev.resolution.dnaMapping?.dnaRegionId);
    }
  }
  const profile = JSON.parse(JSON.stringify({ ...quiz, specific_wines: quiz.specificWines || [] }));
  for (const d of points.values()) {
    if (!d.mappable || d.points < PROMOTION_THRESHOLDS[d.dimension]) continue;
    if (d.dimension === "country" && !profile.countries.includes(d.dimensionValue)) profile.countries.push(d.dimensionValue);
    if (d.dimension === "varietal" && !profile.varietals.includes(d.dimensionValue)) profile.varietals.push(d.dimensionValue);
    if (d.dimension === "region") {
      const c = "france";
      profile.regions[c] = [...new Set([...(profile.regions[c] || []), d.dimensionValue])];
    }
    if (d.dimension === "estate") {
      const r = where.get(d.dimensionValue);
      profile.estates[r] = [...new Set([...(profile.estates[r] || []), d.dimensionValue])];
    }
  }
  const accumulation = [...points.values()].map((d) => row(d.dimension, d.dimensionValue, d.points));
  return { profile, accumulation, points };
}

// What production's canary looked like: the quiz behind "led with Chave,
// Torbreck, Rayas and an Alsace discovery" — France, the Rhône, Syrah —
// then five loved Burgundies, two of them Dujac
const CANARY_QUIZ = {
  countries: ["france"], regions: { france: ["rhone_valley"] }, estates: {}, varietals: ["syrah"], specificWines: [],
};
const CANARY_BOTTLES = [
  ["Domaine Dujac Clos de la Roche 2017", "loved"],
  ["Domaine Dujac Morey-Saint-Denis 2019", "loved"],
  ["Joseph Drouhin Chambolle-Musigny 2019", "loved"],
  ["Domaine Faiveley Nuits-Saint-Georges 2018", "loved"],
  ["Louis Jadot Gevrey-Chambertin 2018", "loved"],
];

// profileEngine's four passes as they shipped at 78c3c98 — the oracle a
// quiz-only palate is held to. Verbatim but for reading WINE_RECS' tiers.
function oldPasses(answers) {
  const { countries, regions, varietals, specificWines } = answers;
  const allRegionIds = Object.values(regions).flat();
  const combos = WINE_RECS.filter((r) => r.tier === "combo");
  const byVarietal = Object.fromEntries(WINE_RECS.filter((r) => r.tier === "grape").map((r) => [r.varietals[0], r]));
  const byCountry = Object.fromEntries(WINE_RECS.filter((r) => r.tier === "discovery").map((r) => [r.country, r]));
  const recs = [];
  const used = new Set();
  for (const sw of (specificWines || [])) used.add(sw.toLowerCase().trim());
  function isKnown(wineName) {
    const norm = wineName.toLowerCase().trim();
    for (const s of used) if (s === norm || norm.includes(s) || s.includes(norm)) return true;
    return false;
  }
  for (const c of combos) {
    if (recs.length >= 20) break;
    const hasR = c.regions.some((r) => allRegionIds.includes(r));
    const hasV = c.varietals.length === 0 ? hasR : c.varietals.some((v) => varietals.includes(v));
    if (hasR && hasV && !isKnown(c.wine)) { recs.push(c); used.add(c.wine.toLowerCase().trim()); }
  }
  for (const vId of varietals) {
    if (recs.length >= 20) break;
    const r = byVarietal[vId];
    if (r && !isKnown(r.wine)) { recs.push(r); used.add(r.wine.toLowerCase().trim()); }
  }
  for (const c of combos) {
    if (recs.length >= 20) break;
    const hasR = c.regions.some((r) => allRegionIds.includes(r));
    if (hasR && !isKnown(c.wine)) { recs.push(c); used.add(c.wine.toLowerCase().trim()); }
  }
  for (const cId of countries) {
    if (recs.length >= 20) break;
    const r = byCountry[cId];
    if (r && !isKnown(r.wine)) { recs.push(r); used.add(r.wine.toLowerCase().trim()); }
  }
  return recs.slice(0, 20);
}

// Seeded quiz palates drawn from the ids the curated list uses
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const REGION_COUNTRY = new Map(WINE_RECS.flatMap((r) => r.regions.map((g) => [g, r.country])));
const ALL_REGIONS = [...REGION_COUNTRY.keys()];
const ALL_VARIETALS = [...new Set(WINE_RECS.flatMap((r) => r.varietals))];
const ALL_COUNTRIES = [...new Set(WINE_RECS.map((r) => r.country))];
function randomQuiz(rand) {
  const pick = (list, n) => [...list].sort(() => rand() - 0.5).slice(0, n);
  const regionIds = pick(ALL_REGIONS, Math.floor(rand() * 4));
  const regions = {};
  for (const g of regionIds) (regions[REGION_COUNTRY.get(g)] ||= []).push(g);
  const countries = [...new Set([...Object.keys(regions), ...pick(ALL_COUNTRIES, Math.floor(rand() * 3))])];
  return { countries, regions, estates: {}, varietals: pick(ALL_VARIETALS, Math.floor(rand() * 4)), specificWines: [] };
}

console.log("\n1. The canary");

await test("premise: the five loved Burgundies promote Burgundy and Dujac, as production's did", () => {
  const { points } = palateAfter(CANARY_QUIZ, CANARY_BOTTLES);
  assert((points.get("region:burgundy")?.points || 0) >= PROMOTION_THRESHOLDS.region, "Burgundy reaches its threshold");
  assert((points.get("estate:domaine_dujac")?.points || 0) >= PROMOTION_THRESHOLDS.estate, "Dujac reaches its threshold");
  assertEq(points.get("region:burgundy").points, 5 * RATING_POINTS.loved, "every bottle at full credit");
});

await test("before the ratings, the Rhône leads (the quiz is all the list knows)", () => {
  const before = rankRecommendations({ profile: CANARY_QUIZ, accumulation: [] });
  assertEq(before[0].wine, "Jean-Louis Chave, Hermitage", "Chave first");
  assert(!before.slice(0, 4).some((r) => BURGUNDY.has(r.wine)), "no Burgundy in the top four");
});

await test("after them, the Burgundy picks lead — Dujac, then Roulot", () => {
  const { profile, accumulation } = palateAfter(CANARY_QUIZ, CANARY_BOTTLES);
  const after = rankRecommendations({ profile, accumulation });
  assertEq(wines(after).slice(0, 2), ["Domaine Dujac, Morey-Saint-Denis", "Domaine Roulot, Meursault"], "the top two");
  const lastBurgundy = Math.max(...after.map((r, i) => (BURGUNDY.has(r.wine) ? i : -1)));
  const firstOther = after.findIndex((r) => !BURGUNDY.has(r.wine));
  assert(lastBurgundy < firstOther, "every Burgundy ahead of every other wine");
  // The Rhône quiz still counts: Chave stays on the list, below Burgundy
  assert(wines(after).includes("Jean-Louis Chave, Hermitage"), "Chave still listed");
  assert(after.findIndex((r) => r.wine === "Jean-Louis Chave, Hermitage") > 1, "Chave below the Burgundies");
  // France's points ride every French wine, but faintly: the Syrah the
  // quiz named still outranks a Bordeaux that shares only the country
  assert(after.findIndex((r) => r.wine === "Torbreck, RunRig, Barossa Valley")
    < after.findIndex((r) => r.wine === "Château Léoville-Las Cases, Saint-Julien"), "Torbreck before Léoville");
  // And the Alsace discovery that led home no longer comes before them
  const weinbach = after.findIndex((r) => r.wine === "Domaine Weinbach, Riesling Grand Cru Schlossberg");
  assert(weinbach === -1 || weinbach > 1, "the discovery is not in front");
});

await test("home's four, the journal's rows filtered as WineRecList does: Burgundy first", () => {
  const { profile, accumulation } = palateAfter(CANARY_QUIZ, CANARY_BOTTLES);
  // Had Dujac's listed bottle been rated, the list moves on to Roulot
  const acted = new Set(["Domaine Dujac, Morey-Saint-Denis"]);
  const shown = rankRecommendations({ profile, accumulation }).filter((r) => !acted.has(r.wine)).slice(0, 4);
  assertEq(shown[0].wine, "Domaine Roulot, Meursault", "Roulot leads once Dujac is in the journal");
});

console.log("\n2. The ranking");

await test("points move the list before anything promotes", () => {
  // Burgundy and the Rhône both quizzed; one loved Rhône bottle (2 points,
  // far from the region's 10) lifts Chave over Roulot, which led on the tie
  const profile = { countries: ["france"], regions: { france: ["burgundy", "rhone_valley"] }, estates: {}, varietals: ["syrah", "chardonnay"] };
  const tied = wines(rankRecommendations({ profile }));
  assert(tied.indexOf("Domaine Roulot, Meursault") < tied.indexOf("Jean-Louis Chave, Hermitage"), "the tie keeps the curated order");
  const moved = wines(rankRecommendations({ profile, accumulation: [row("region", "rhone_valley", 2)] }));
  assert(moved.indexOf("Jean-Louis Chave, Hermitage") < moved.indexOf("Domaine Roulot, Meursault"), "one loved bottle moves it");
});

await test("points alone, with nothing in the DNA, bring a wine onto the list", () => {
  const profile = { countries: [], regions: {}, estates: {}, varietals: [] };
  assertEq(rankRecommendations({ profile }), [], "an empty palate lists nothing");
  const listed = wines(rankRecommendations({ profile, accumulation: [row("varietal", "malbec", 2)] }));
  assert(listed.includes("Zuccardi, Finca Piedra Infinita") && listed.includes("Catena Zapata, Adrianna Vineyard Malbec"), "the Malbecs");
});

await test("loved estates rise; an estate outranks a place", () => {
  const profile = { countries: ["france"], regions: { france: ["alsace"] }, estates: {}, varietals: ["riesling"] };
  const base = wines(rankRecommendations({ profile }));
  const withEstate = wines(rankRecommendations({ profile, accumulation: [row("estate", "trimbach", 4)] }));
  assert(withEstate.indexOf("Trimbach, Clos Sainte Hune, Alsace") < base.indexOf("Trimbach, Clos Sainte Hune, Alsace"), "Trimbach rises");
  assertEq(withEstate[0], "Trimbach, Clos Sainte Hune, Alsace", "to the top");
});

await test("\"not for me\" falls — and out, once it outweighs the rest", () => {
  const profile = { countries: [], regions: {}, estates: {}, varietals: ["pinot_noir", "syrah"] };
  const base = wines(rankRecommendations({ profile }));
  assert(base.includes("Torbreck, RunRig, Barossa Valley"), "premise: Torbreck listed");
  // Chave (Syrah) and Felton Road (Pinot) tie on the quiz, Chave first in
  // the curated order; one not-for-me Syrah puts the Pinot ahead
  assert(base.indexOf("Jean-Louis Chave, Hermitage") < base.indexOf("Felton Road, Block 5, Central Otago"), "premise: the tie");
  const one = wines(rankRecommendations({ profile, accumulation: [row("varietal", "syrah", -1)] }));
  assert(one.indexOf("Jean-Louis Chave, Hermitage") > one.indexOf("Felton Road, Block 5, Central Otago"), "one not-for-me pulls it down");
  const lots = wines(rankRecommendations({ profile, accumulation: [row("varietal", "syrah", -6)] }));
  assert(!lots.includes("Torbreck, RunRig, Barossa Valley") && !lots.includes("Jean-Louis Chave, Hermitage"), "enough and the Syrahs leave");
  assert(lots.includes("Felton Road, Block 5, Central Otago"), "the Pinots stay");
});

await test("a disliked place pulls down a wine the palate otherwise likes", () => {
  const profile = { countries: [], regions: {}, estates: {}, varietals: ["chardonnay"] };
  const base = wines(rankRecommendations({ profile }));
  const KUMEU = "Kumeu River, Maté's Vineyard, New Zealand";
  assert(base.indexOf("Domaine Roulot, Meursault") < base.indexOf(KUMEU), "premise: Roulot ahead");
  const some = wines(rankRecommendations({ profile, accumulation: [row("region", "burgundy", -3)] }));
  assert(some.indexOf("Domaine Roulot, Meursault") > some.indexOf(KUMEU), "three not-for-me Burgundies pull Roulot down");
  const more = wines(rankRecommendations({ profile, accumulation: [row("region", "burgundy", -5)] }));
  assert(!more.includes("Domaine Roulot, Meursault"), "five and it leaves");
  assert(more.includes(KUMEU), "a Chardonnay from elsewhere stays");
});

await test("a blend counts its best grape — and its worst when nothing in it is liked", () => {
  const leoville = WINE_RECS.find((r) => r.wine.startsWith("Château Léoville"));
  const loveOne = palateAffinity({ accumulation: [row("varietal", "merlot", 4), row("varietal", "cabernet_sauvignon", -2)] });
  assertEq(scoreRecommendation(leoville, loveOne).score, 4 * 4, "the loved Merlot, not the sum");
  const hateOne = palateAffinity({ accumulation: [row("varietal", "cabernet_sauvignon", -2), row("region", "bordeaux", 4)] });
  assertEq(scoreRecommendation(leoville, hateOne).score, 4 * 4 - 4 * 2, "the disliked Cab still costs");
});

await test("a quiz pick is worth two loved bottles", () => {
  const a = palateAffinity({ profile: { varietals: ["syrah"] } });
  const b = palateAffinity({ accumulation: [row("varietal", "syrah", 2 * RATING_POINTS.loved)] });
  assertEq(a.get("varietal:syrah"), b.get("varietal:syrah"), "equal");
  assertEq(DNA_WEIGHT, 2 * RATING_POINTS.loved, "DNA_WEIGHT");
});

await test("matchType says what the palate shares, in the labels the rows print", () => {
  const profile = { countries: ["france"], regions: { france: ["burgundy"] }, estates: {}, varietals: ["syrah"] };
  const by = Object.fromEntries(rankRecommendations({ profile }).map((r) => [r.wine, r.matchType]));
  assertEq(by["Domaine Roulot, Meursault"], "region", "region");
  assertEq(by["Torbreck, RunRig, Barossa Valley"], "grape", "grape");
  assertEq(by["Jean-Louis Chave, Hermitage"], "grape", "Chave shares the grape here, not the place");
  assertEq(by["Château Le Pin, Pomerol"], "discovery", "country alone");
  const both = Object.fromEntries(rankRecommendations({ profile: { ...profile, varietals: ["pinot_noir"] } }).map((r) => [r.wine, r.matchType]));
  assertEq(both["Domaine Dujac, Morey-Saint-Denis"], "region + grape", "both");
});

await test("a quiz-only palate lists every wine the old four passes listed, in tier order", () => {
  const rand = mulberry32(20261123);
  let quizzes = 0;
  for (let i = 0; i < 400; i++) {
    const quiz = randomQuiz(rand);
    const old = oldPasses(quiz);
    if (old.length >= PALATE_RECS_LIMIT) continue; // a full old list was cut, not chosen
    quizzes++;
    const now = wines(rankRecommendations({ profile: quiz, limit: Infinity }));
    for (const r of old) assert(now.includes(r.wine), `quiz ${i}: ${r.wine} (${JSON.stringify(quiz)})`);
    // Pass 1's wines (region AND grape) lead every wine sharing one fact
    const pass1 = old.filter((r) => r.tier === "combo" && r.varietals.length && r.regions.some((g) => Object.values(quiz.regions).flat().includes(g))
      && r.varietals.some((v) => quiz.varietals.includes(v)));
    const onlyCountry = now.filter((w) => rankRecommendations({ profile: quiz, limit: Infinity }).find((r) => r.wine === w).matchType === "discovery");
    for (const p of pass1) for (const d of onlyCountry) assert(now.indexOf(p.wine) < now.indexOf(d), `quiz ${i}: ${p.wine} before ${d}`);
  }
  assert(quizzes > 300, `enough quizzes compared (${quizzes})`);
});

await test("named wines stay off, each bottle once, a limit, the stored shape", () => {
  const profile = { countries: [], regions: {}, estates: {}, varietals: ["chenin_blanc"], specific_wines: ["domaine huet, le haut-lieu sec, vouvray"] };
  assert(!wines(rankRecommendations({ profile })).includes("Domaine Huet, Le Haut-Lieu Sec, Vouvray"), "a named wine is left off (any case)");
  const twice = wines(rankRecommendations({ profile: { ...profile, specific_wines: [] } }));
  assertEq(twice.filter((w) => w.startsWith("Domaine Huet")).length, 1, "Huet listed under two passes, shown once");
  const many = rankRecommendations({ profile: { countries: ALL_COUNTRIES, regions: {}, estates: {}, varietals: ALL_VARIETALS } });
  assertEq(many.length, PALATE_RECS_LIMIT, "capped");
  assert(many.every((r) => JSON.stringify(Object.keys(r)) === '["wine","why","matchType"]'), "{ wine, why, matchType }");
  assertEq(rankRecommendations({ profile: { varietals: ["syrah"] }, limit: 2 }).length, 2, "a limit");
});

await test("junk in, an empty or partial list out — never a throw", () => {
  for (const profile of [undefined, null, 7, "x", {}, { countries: "france", regions: [1, null], varietals: [null, 3] }]) {
    assert(Array.isArray(rankRecommendations({ profile })), `profile ${JSON.stringify(profile)}`);
  }
  assertEq(rankRecommendations(), [], "no arguments");
  const junkRows = [null, 1, { dimension: "region" }, row("planet", "mars", 9), row("region", "burgundy", "lots"), row("region", "burgundy", NaN)];
  assertEq(rankRecommendations({ accumulation: junkRows }), [], "junk rows count for nothing");
  assert(wines(rankRecommendations({ accumulation: [row("region", "burgundy", "4")] })).includes("Domaine Roulot, Meursault"), "a numeric string counts");
});

console.log("\n3. One ranking everywhere");

await test("profileEngine stores the ranker's list — with the points a quiz save hands it", () => {
  const dna = generateDNAProfile(CANARY_QUIZ);
  assertEq(dna.recommendations, rankRecommendations({ profile: CANARY_QUIZ }), "quiz only");
  const { accumulation } = palateAfter(CANARY_QUIZ, CANARY_BOTTLES);
  assertEq(generateDNAProfile(CANARY_QUIZ, { accumulation }).recommendations,
    rankRecommendations({ profile: CANARY_QUIZ, accumulation }), "with points");
});

await test("SOURCE: saveQuizProfile reads the points it ranks with, in the read it already makes", () => {
  const s = read("saveQuizProfile.js");
  assert(/select\("id, dimension, dimension_value, source, promoted, mappable, points"\)/.test(s), "points in the one read");
  assert(/generateDNAProfile\(merged, \{ accumulation: accRows \|\| \[\] \}\)/.test(s), "handed to the engine");
});

await test("SOURCE: home, Search and the wine page rank on read, never from the stored list", () => {
  for (const [file, ranks] of [
    ["../app/page.js", /readPalateRecs\(supabase, user\?\.id, profile\)/],
    ["../app/search/page.js", /rankRecommendations\(\{ profile, accumulation \}\)/],
    ["../app/wine/WinePage.js", /rankRecommendations\(\{ profile: profile\.data, accumulation: acc\.data/],
  ]) {
    const s = read(file);
    assert(ranks.test(s), `${file} ranks`);
    assert(!/\.recommendations\b/.test(s) && !/select\([^)]*recommendations/.test(s), `${file} never reads the stored list`);
  }
  // Home's new-user layout and its Reserved rows are the same WineRecList
  // over the same ranked list
  const home = read("../app/page.js");
  assert(/recs=\{recs\}/.test(home) && /holdBack=\{isNew/.test(home), "one list, Reserved rows included");
});

await test("SOURCE: nothing on a rating's path ranks or writes recommendations", () => {
  for (const file of ["dnaEvolution.js", "identityRecompose.js", "growthMoment.js", "../components/WineRecList.js", "../app/log/LogBottle.js"]) {
    // Code only: comments may say where a list comes from
    const s = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert(!/recommendations\s*:|\.recommendations\b|palateRecs|rankRecommendations/.test(s), `${file} stays out of it`);
  }
});

await test("SOURCE: the ranking is dependency-free — no wine data in its readers' bundles", () => {
  const imports = (s) => [...s.matchAll(/^import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
  assertEq(imports(read("palateRecs.js")), ["./wineRecs.js"], "palateRecs imports only the list");
  assertEq(imports(read("wineRecs.js")), [], "the list imports nothing");
  assertEq(imports(read("palateRecsRead.js")), ["./palateRecs.js"], "the read imports only the ranking");
});

console.log("\n4. The read");

function fakeSupabase(result, log = []) {
  return {
    from(table) {
      log.push(table);
      const q = {
        select(cols) { log.push(cols); return q; },
        eq() { return typeof result === "function" ? result() : Promise.resolve(result); },
      };
      return q;
    },
  };
}
const PROFILE = { countries: ["france"], regions: { france: ["burgundy"] }, estates: {}, varietals: ["pinot_noir"], specific_wines: [] };

await test("reads dna_accumulation's points and ranks with them", async () => {
  const log = [];
  const got = await readPalateRecs(fakeSupabase({ data: [row("region", "rhone_valley", 20)], error: null }, log), "u1", PROFILE);
  assertEq(got, rankRecommendations({ profile: PROFILE, accumulation: [row("region", "rhone_valley", 20)] }), "ranked");
  assertEq(log, ["dna_accumulation", PALATE_RECS_COLUMNS], "one read, its columns");
  assert(/points/.test(PALATE_RECS_COLUMNS), "points read");
});

await test("a failed read is null — never a list ranked without the points", async () => {
  assertEq(await readPalateRecs(fakeSupabase({ data: null, error: { message: "x" } }), "u1", PROFILE), null, "error");
  assertEq(await readPalateRecs(fakeSupabase({ data: null, error: null }), "u1", PROFILE), null, "no data");
  assertEq(await readPalateRecs(fakeSupabase(() => Promise.reject(new Error("net"))), "u1", PROFILE), null, "rejected");
  assertEq(await readPalateRecs({ from() { throw new Error("boom"); } }, "u1", PROFILE), null, "throws");
  assertEq(await readPalateRecs(fakeSupabase({ data: [], error: null }), null, PROFILE), null, "no user");
  assertEq(await readPalateRecs(fakeSupabase({ data: [], error: null }), "u1", null), null, "no profile");
});

console.log("\n5. The data");

await test("sixty wines, their words and order as profileEngine had them", () => {
  assertEq(WINE_RECS.length, 60, "count");
  assertEq(WINE_RECS.filter((r) => r.tier === "combo").length, 25, "combos");
  assertEq(WINE_RECS.filter((r) => r.tier === "grape").length, 23, "grape picks");
  assertEq(WINE_RECS.filter((r) => r.tier === "discovery").length, 12, "discoveries");
  assert(WINE_RECS.every((r) => typeof r.why === "string" && r.why.length > 10), "every wine says why");
  assert(Object.isFrozen(WINE_RECS) && WINE_RECS.every(Object.isFrozen), "frozen");
});

await test("every id is one wineUnified knows, every region in its wine's country", () => {
  const regionCountry = new Map(Object.entries(wineUnified.regions).flatMap(([c, rs]) => rs.map((r) => [r.id, c])));
  const varietals = new Set(wineUnified.varietals.map((v) => v.id));
  const countries = new Set(wineUnified.countries.map((c) => c.id));
  const estates = new Set([
    ...Object.values(wineUnified.producerLookup).map((p) => p.producerId),
    ...Object.values(wineUnified.producers).flat().map((p) => p.id),
  ]);
  for (const r of WINE_RECS) {
    assert(countries.has(r.country), `${r.wine}: country ${r.country}`);
    for (const g of r.regions) {
      assert(regionCountry.has(g), `${r.wine}: region ${g}`);
      assertEq(regionCountry.get(g), r.country, `${r.wine}: ${g} is in ${r.country}`);
    }
    for (const v of r.varietals) assert(varietals.has(v), `${r.wine}: varietal ${v}`);
    for (const e of r.estates) assert(estates.has(e), `${r.wine}: estate ${e}`);
    if (r.tier === "discovery") assertEq([r.regions, r.varietals, r.estates], [[], [], []], `${r.wine}: a discovery is its country alone`);
  }
});

await test("an estate is the one a rating of that bottle would record, wherever the resolver is sure", () => {
  // Where the resolver names a producer at full credit, a rating of the rec
  // itself writes that estate's points — the rec must carry the same id, or
  // loving the bottle would never lift it
  let checked = 0;
  for (const r of WINE_RECS) {
    const ev = bottleEvidence(r.wine, "loved");
    const estate = ev.dimensions.find((d) => d.dimension === "estate" && d.mappable);
    if (!estate || ev.resolution.confidence < 80) continue;
    checked++;
    assert(r.estates.includes(estate.dimensionValue) || r.tier === "discovery", `${r.wine}: ${estate.dimensionValue} not in ${JSON.stringify(r.estates)}`);
  }
  assert(checked >= 25, `enough checked (${checked})`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
