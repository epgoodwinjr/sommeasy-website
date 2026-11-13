// scanTruth — a photographed list is read as truthfully as a pasted one
// Run with: node src/lib/__tests__/scanTruth.test.js
//
// Tests the REAL matchEngine.js (alias loader for its JSON import).
//
// 1. BY THE GLASS (Ed, Nov 12, 2026: bottles only, but say so). A wine with
//    a bottle price is a bottle. Only wines poured by the glass ONLY stay
//    out of the picks — on a pasted list and on a photographed one.
// 2. THE PHOTO SCORER reads its fields through the indexes the text path
//    uses: split grape names, synonyms, accents folded, states and broad
//    areas as countries — and falls back to the wine's own name.
// 3. PARITY over a corpus built from wineUnified: every spelling the text
//    path resolves, the photo path resolves to the same thing; and every
//    producer's wine scores the same pasted or photographed.
// 4. THE REAL FAILURES: two lists modeled on scans that matched nothing,
//    as the real route read them (fixtures/scanTruthCaptured.json).

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
const wineUnified = JSON.parse(readFileSync(new URL("../wineUnified.json", import.meta.url), "utf8"));
const routeSource = readFileSync(new URL("../../app/api/parse-wine-list/route.js", import.meta.url), "utf8");
const captured = JSON.parse(readFileSync(new URL("./fixtures/scanTruthCaptured.json", import.meta.url), "utf8"));
const { lists: LISTS, palates: PALATES } = JSON.parse(readFileSync(new URL("../../../scripts/scan-truth/lists.json", import.meta.url), "utf8"));

// A palate that likes everything these cases mention — a miss is a miss of
// the reading, never of the palate
const WIDE = {
  countries: ["us", "france", "south_africa", "australia", "italy", "spain"],
  regions: {
    us: ["napa_valley", "sonoma", "willamette_valley", "livermore_valley"],
    france: ["loire_valley", "provence", "rhone_valley", "bordeaux"],
    south_africa: ["stellenbosch", "swartland", "hemel_en_aarde_walker_bay"],
  },
  estates: {},
  varietals: ["syrah", "pinot_grigio", "grenache", "cabernet_sauvignon", "merlot", "chenin_blanc", "mourvedre", "rose"],
  specificWines: [],
};
const dnaOf = (p) => ({ countries: p.countries, regions: p.regions, estates: p.estates, varietals: p.varietals, specificWines: p.specific_wines || p.specificWines || [] });

/** One entry through the real engine: the scored entry, or null when the
 *  engine left it out. */
function score(entry, dna = WIDE) {
  return engine.matchWinesAgainstDNA([entry], dna, null).scoredEntries[0] || null;
}
const pasted = (line, price = 50) => ({ name: line, price, originalLine: line });
const photo = (fields, name = "Cuvee Test 2021") => engine.entriesFromVision([{
  name, price: 50, is_btg: false, color: null, variety: null, region: null, country: null, producer: null, ...fields,
}])[0];
const ids = (s) => ({
  regions: [...(s.detectedRegionIds || [])].sort(),
  countries: [...(s.detectedCountryIds || [])].sort(),
  varietals: [...(s.detectedVarietalIds || [])].sort(),
});
const reasons = (s) => s.matchReasons.map((r) => r.type).sort();

// ═══════════════════════════════════════════════════════
console.log("\n═══ 1. By the glass: a wine with a bottle price is a bottle ═══");
// ═══════════════════════════════════════════════════════

const parse = (text) => engine.parseWineList(text);
const one = (line) => parse(line)[0];

test("a glass / bottle pair is a bottle at the bottle price — and keeps its glass price", () => {
  for (const line of ["Mullineux Syrah, Swartland 15/60", "Mullineux Syrah, Swartland $15 / $60", "Mullineux Syrah, Swartland 15 / 60."]) {
    const e = one(line);
    assertEq({ name: e.name, price: e.price, glass: e.glassPrice, btg: e.isByTheGlass },
      { name: "Mullineux Syrah, Swartland", price: 60, glass: 15, btg: false }, line);
  }
});

test("two price columns are a pair too — only across a column gap, never a bin number", () => {
  const cols = one("Mullineux Syrah, Swartland 2020    18    72");
  assertEq({ name: cols.name, price: cols.price, glass: cols.glassPrice, btg: cols.isByTheGlass },
    { name: "Mullineux Syrah, Swartland 2020", price: 72, glass: 18, btg: false }, "spaces");
  const tabs = one("Meerlust Rubicon, Stellenbosch 2019\t24\t95");
  assertEq({ name: tabs.name, price: tabs.price, glass: tabs.glassPrice }, { name: "Meerlust Rubicon, Stellenbosch 2019", price: 95, glass: 24 }, "tabs");
  // One space is not a column: "Bin 28" stays in the name
  const bin = one("Penfolds Bin 28 62");
  assertEq({ name: bin.name, price: bin.price, glass: bin.glassPrice ?? null }, { name: "Penfolds Bin 28", price: 62, glass: null }, "a bin number");
  // A vintage is never a glass price, and the dearer number is never the glass
  const year = one("Kanonkop Paul Sauer, Stellenbosch    2019    85");
  assertEq({ price: year.price, glass: year.glassPrice ?? null }, { price: 85, glass: null }, "a vintage column");
  const upside = one("Kanonkop Paul Sauer, Stellenbosch    85    14");
  assert((upside.glassPrice ?? null) === null, "a pair whose first number is the larger is not glass / bottle");
});

test("under a by-the-glass heading, one price is a glass — a pair is still a bottle", () => {
  const entries = parse([
    "BY THE GLASS",
    "Ken Forrester Chenin Blanc, Stellenbosch 12/48",
    "Kanonkop Kadette, Stellenbosch 14",
    "WINES BY THE BOTTLE",
    "Meerlust Rubicon, Stellenbosch 2019 95",
  ].join("\n"));
  assertEq(entries.map((e) => [e.name, e.price, e.isByTheGlass]), [
    ["Ken Forrester Chenin Blanc, Stellenbosch", 48, false],
    ["Kanonkop Kadette, Stellenbosch", 14, true],
    ["Meerlust Rubicon, Stellenbosch 2019", 95, false],
  ], "by section");
});

test("the engine scores every bottle and leaves out only the glass-only wines", () => {
  const entries = parse([
    "BY THE GLASS",
    "Ken Forrester Chenin Blanc, Stellenbosch 12/48",
    "Kanonkop Kadette, Stellenbosch 14",
    "BY THE BOTTLE",
    "Mullineux Syrah, Swartland 15/60",
    "Meerlust Rubicon, Stellenbosch 2019 95",
  ].join("\n"));
  const { scoredEntries } = engine.matchWinesAgainstDNA(entries, WIDE, null);
  assertEq(scoredEntries.map((s) => [s.name, s.price]), [
    ["Ken Forrester Chenin Blanc, Stellenbosch", 48],
    ["Mullineux Syrah, Swartland", 60],
    ["Meerlust Rubicon, Stellenbosch 2019", 95],
  ], "scored");
  assert(scoredEntries.every((s) => s.score > 0), "each of them matches this palate");
});

test("a photographed wine with a bottle price is a bottle, whatever the page heading made of it", () => {
  const [both, glassOnly, flagged, bottle, noPrice] = engine.entriesFromVision([
    { name: "Mullineux Syrah, Swartland", price: 60, glass_price: 15, is_btg: true },
    { name: "Kanonkop Kadette, Stellenbosch", price: null, glass_price: 14, is_btg: true },
    { name: "House Red", price: 12, is_btg: true },
    { name: "Meerlust Rubicon, Stellenbosch 2019", price: 95, is_btg: false },
    { name: "Raats Chenin Blanc", price: null, is_btg: false },
  ]);
  assertEq([both.price, both.glassPrice, both.isByTheGlass], [60, 15, false], "both prices: a bottle, even flagged");
  assertEq([glassOnly.price, glassOnly.glassPrice, glassOnly.isByTheGlass], [null, 14, true], "a glass price alone: by the glass");
  assertEq([flagged.price, flagged.isByTheGlass], [12, true], "flagged with one price and no glass price: still by the glass");
  assertEq([bottle.price, bottle.isByTheGlass], [95, false], "a bottle");
  assertEq([noPrice.price, noPrice.isByTheGlass], [null, false], "no price at all is not a glass");
});

test("entriesFromVision carries the photo's reading and survives junk", () => {
  const [e] = engine.entriesFromVision([{ name: "Kanonkop Pinotage 2020", vintage: "2020", price: 78, section: "Red", is_btg: false,
    color: "red", variety: "Pinotage", region: "Stellenbosch", country: "South Africa", producer: "Kanonkop" }]);
  assertEq(e, {
    name: "Kanonkop Pinotage 2020", price: 78, glassPrice: null, originalLine: "Kanonkop Pinotage 2020", section: "Red",
    isByTheGlass: false, sectionColor: "red", sectionVarietal: null, vintage: "2020",
    visionData: { color: "red", variety: "Pinotage", region: "Stellenbosch", country: "South Africa", producer: "Kanonkop", vintage: "2020" },
  }, "the entry MatchList always built");
  assertEq(engine.entriesFromVision(null), [], "null");
  assertEq(engine.entriesFromVision([null, 7, { price: "12" }]).map((x) => [x.name, x.price]), [["", null], ["", null], ["", null]], "junk rows");
});

test("the scan prompt asks for the bottle price and the glass price apart, and defines by-the-glass by them", () => {
  assert(/glass_price/.test(routeSource), "the prompt names glass_price");
  assert(/"glass_price":/.test(routeSource), "…and shows it in the example");
  assert(!/is_btg: true if this wine is in a "by the glass" section/.test(routeSource), "a section heading alone no longer makes a wine by-the-glass");
  assert(/is_btg: true ONLY/.test(routeSource), "is_btg is defined by the prices shown");
});

// ═══════════════════════════════════════════════════════
console.log("\n═══ 2. The photo scorer reads what the text path reads ═══");
// ═══════════════════════════════════════════════════════

test("a grape resolves under either half of its name: Syrah, Pinot Grigio, Grenache", () => {
  for (const [variety, id] of [["Syrah", "syrah"], ["Shiraz", "syrah"], ["Pinot Grigio", "pinot_grigio"], ["Pinot Gris", "pinot_grigio"],
    ["Grenache", "grenache"], ["Garnacha", "grenache"], ["Mourvèdre", "mourvedre"], ["Mourvedre", "mourvedre"], ["Monastrell", "mourvedre"]]) {
    const s = score(photo({ variety }));
    assertEq(s.detectedVarietalIds, [id], variety);
    assertEq(s.score, 2, `${variety} scores as a grape in the DNA`);
  }
});

test("two grapes are two grapes, with or without the word blend — and never a phantom third", () => {
  for (const variety of ["Cabernet Sauvignon, Merlot", "Cabernet Sauvignon / Merlot", "Cabernet Sauvignon-Merlot blend", "Cabernet Sauvignon & Merlot", "Merlot and Cabernet Sauvignon"]) {
    const s = score(photo({ variety }));
    assertEq([...s.detectedVarietalIds].sort(), ["cabernet_sauvignon", "merlot"], variety);
    assertEq(s.score, 4, `${variety} scores both`);
  }
  assertEq(score(photo({ variety: "Syrah / Shiraz" })).detectedVarietalIds, ["syrah"], "one grape under two names is one grape");
  assertEq(score(photo({ variety: "Grenache, Syrah, Mourvèdre" })).detectedVarietalIds.slice().sort(), ["grenache", "mourvedre", "syrah"], "three");
});

test("the United States is the United States however the photo writes it", () => {
  for (const country of ["USA", "United States", "US", "U.S.A.", "U.S.", "United States of America", "usa"]) {
    const s = score(photo({ country }));
    assertEq(s.detectedCountryIds, ["us"], country);
    assertEq(s.score, 1, `${country} scores as a country in the DNA`);
  }
});

test("a state or a broad area in the region field is a country, not a miss — and never a wrong region", () => {
  for (const [region, country] of [["California", "us"], ["Oregon", "us"], ["Washington", "us"], ["Western Cape", "south_africa"], ["Central Coast", "us"]]) {
    const s = score(photo({ region }));
    assertEq([s.detectedRegionIds, s.detectedCountryIds], [[], [country]], region);
    assertEq(reasons(s), ["country"], `${region} scores as its country`);
  }
});

test("a region resolves by its short name, without its accents, or without its hyphen", () => {
  for (const [region, id] of [["Loire", "loire_valley"], ["Loire Valley", "loire_valley"], ["Rhône", "rhone_valley"], ["Rhone", "rhone_valley"],
    ["Rhone Valley", "rhone_valley"], ["Cotes de Provence", "provence"], ["Côtes de Provence", "provence"], ["Cotes du Rhone", "rhone_valley"],
    ["Côtes du Rhône", "rhone_valley"], ["Willamette", "willamette_valley"], ["Hemel en Aarde", "hemel_en_aarde_walker_bay"], ["Napa", "napa_valley"]]) {
    const s = score(photo({ region }));
    assertEq(s.detectedRegionIds, [id], region);
    assertEq(s.score, 3, `${region} scores as a region in the DNA`);
  }
});

test("when the photo's region resolves to nothing, the wine's own name is read", () => {
  const s = score(photo({ region: "Coastal Region" }, "Kanonkop Pinotage, Stellenbosch 2020"));
  assertEq(s.detectedRegionIds, ["stellenbosch"], "the name's region");
  assert(s.score >= 3, `scores the region (${s.score})`);
  // …and a field the photo left empty is filled from the name the same way
  const noRegion = score(photo({ region: null, variety: null }, "Mullineux Syrah, Swartland 2020"));
  assertEq([noRegion.detectedRegionIds, noRegion.detectedVarietalIds], [["swartland"], ["syrah"]], "no fields at all");
});

test("the photo's fields count even when it read no region", () => {
  const s = score(photo({ region: null, variety: "Chenin Blanc", country: "South Africa" }, "Old Vines White 2022"));
  assertEq(ids(s), { regions: [], countries: ["south_africa"], varietals: ["chenin_blanc"] }, "variety and country");
  assertEq(s.score, 3, "a grape and a country");
});

test("a producer is found the way a pasted line finds it: by its core name, with its estate", () => {
  const dna = { ...WIDE, estates: { hemel_en_aarde_walker_bay: ["newton_johnson_vineyards"], stellenbosch: ["kanonkop"] } };
  const nj = score(photo({ producer: "Newton Johnson", region: "Hemel-en-Aarde", country: "South Africa", variety: "Chardonnay" }, "Newton Johnson Family Vineyards Chardonnay"), dna);
  assert(nj.matchReasons.some((r) => r.type === "estate"), `Newton Johnson is the estate in the DNA (${JSON.stringify(nj.matchReasons)})`);
  assertEq(nj.detectedProducerId, "newton_johnson_vineyards", "its id");
  const text = score(pasted("Newton Johnson Family Vineyards Chardonnay, Hemel-en-Aarde, South Africa"), dna);
  assertEq(nj.score, text.score, "the same score pasted");
  // No producer field: the name is read
  const k = score(photo({ producer: null, region: "Stellenbosch" }, "Kanonkop Paul Sauer 2019"), dna);
  assert(k.matchReasons.some((r) => r.type === "estate"), "Kanonkop from the name");
});

test("a producer with a short name is found whole in the producer field, as the exact lookup always found it", () => {
  // Scanning a line skips names under four letters; a producer FIELD that is
  // exactly "COS" can be nothing else (found by the before/after corpus diff)
  const dna = { ...WIDE, countries: ["italy", "south_africa"], estates: { sicily: ["cos"], paarl: ["kwv"] } };
  const cos = score(photo({ producer: "COS", variety: "Nero d'Avola", region: "Sicily", country: "Italy" }, "COS Nero d'Avola"), dna);
  assertEq(cos.detectedProducerId, "cos", "COS");
  assert(cos.matchReasons.some((r) => r.type === "estate"), "…and it is the estate in the DNA");
  assertEq(score(photo({ producer: "KWV", region: "Paarl" }, "KWV Chardonnay"), dna).detectedProducerId, "kwv", "KWV");
});

test("folding accents never turns a producer into a place: Gård is not the Gard", () => {
  // "Gård" (Washington) folds to "gard", a Languedoc appellation — the
  // producer's own name states no region (found by the before/after corpus diff)
  for (const line of ["Gård Riesling", "Gård Riesling, Washington"]) {
    const t = score(pasted(line), { ...WIDE, countries: ["us", "france"] });
    assertEq([t.detectedRegionIds, t.detectedCountryIds, t.detectedProducerId], [[], ["us"], "gard"], line);
  }
  const p = score(photo({ producer: "Gård", variety: "Riesling", region: null, country: null }, "Gård Riesling"));
  assertEq([p.detectedRegionIds, p.detectedCountryIds], [[], ["us"]], "photographed");
});

test("a namesake producer gives way to the place the photo states", () => {
  // Napa's "Newton" on a Hemel-en-Aarde wine: the stated place outranks it
  const s = score(photo({ producer: "Newton", region: "Hemel-en-Aarde", country: "South Africa" }, "Newton Chardonnay"));
  assertEq(s.detectedCountryIds, ["south_africa"], "no United States from the namesake");
  assertEq(s.detectedProducerId, null, "and no estate id");
});

test("the photo's country comes first; its color stands; a missing color falls to the grape", () => {
  const s = score(photo({ country: "France", region: "Stellenbosch" }));
  assertEq(s.detectedCountry, "france", "the stated country leads");
  assertEq(score(photo({ color: "rosé", variety: "Syrah" })).detectedColor, "rosé", "the photo's color");
  assertEq(score(photo({ color: null, variety: "Syrah" })).detectedColor, "red", "the grape's color");
});

test("the same wine scores the same pasted or photographed", () => {
  const cases = [
    ["Mullineux Syrah, Swartland, South Africa", { producer: "Mullineux", variety: "Syrah", region: "Swartland", country: "South Africa" }, "Mullineux Syrah"],
    ["Qupe Syrah, Central Coast, USA", { producer: "Qupe", variety: "Syrah", region: "Central Coast", country: "USA" }, "Qupe Syrah"],
    ["Santa Margherita Pinot Grigio, Alto Adige, Italy", { producer: "Santa Margherita", variety: "Pinot Grigio", region: "Alto Adige", country: "Italy" }, "Santa Margherita Pinot Grigio"],
    ["Whispering Angel, Cotes de Provence, France", { producer: null, variety: null, region: "Cotes de Provence", country: "France" }, "Whispering Angel"],
    ["Domaine Vacheron Sancerre, Loire, France", { producer: "Domaine Vacheron", variety: null, region: "Loire", country: "France" }, "Domaine Vacheron Sancerre"],
    ["Meiomi Pinot Noir, California", { producer: "Meiomi", variety: "Pinot Noir", region: "California", country: null }, "Meiomi Pinot Noir"],
    ["Mulderbosch Sauvignon Blanc, Western Cape", { producer: "Mulderbosch", variety: "Sauvignon Blanc", region: "Western Cape", country: null }, "Mulderbosch Sauvignon Blanc"],
  ];
  for (const [line, fields, name] of cases) {
    const t = score(pasted(line)), p = score(photo(fields, name));
    assertEq(p.score, t.score, `score — ${line}`);
    assertEq(ids(p), ids(t), `what was detected — ${line}`);
  }
});

test("the text path reads the same spellings: USA, an unaccented appellation, a broad area", () => {
  assertEq(ids(score(pasted("Cuvee Test, USA"))).countries, ["us"], "USA");
  assertEq(ids(score(pasted("Cuvee Test, Cotes du Rhone"))).regions, ["rhone_valley"], "Cotes du Rhone");
  assertEq(ids(score(pasted("Cuvee Test Mourvedre"))).varietals, ["mourvedre"], "Mourvedre");
  assertEq(ids(score(pasted("Cuvee Test, Western Cape"))), { regions: [], countries: ["south_africa"], varietals: [] }, "Western Cape");
  assertEq(ids(score(pasted("Cuvee Test, Central Coast"))), { regions: [], countries: ["us"], varietals: [] }, "Central Coast is not Livermore");
  assertEq(ids(score(pasted("Cuvee Test, Loire"))).regions, ["loire_valley"], "Loire");
  assertEq(ids(score(pasted("Cuvee Test, Rhône"))).regions, ["rhone_valley"], "Rhône");
});

test("a word that only looks like a grape without its accent is not one in a name", () => {
  // "Rose" is a word and a name; "Rosé" is a wine. In a variety FIELD either is the wine
  assertEq(score(pasted("Chateau La Rose Bellevue, Bordeaux")).detectedVarietalIds, [], "La Rose is not rosé");
  assertEq(score(pasted("Chateau La Rose Bellevue, Bordeaux")).detectedColor, null, "…and has no rosé color");
  assertEq(score(pasted("Whispering Angel Rosé")).detectedVarietalIds, ["rose"], "Rosé is");
  assertEq(score(photo({ variety: "Rose" })).detectedVarietalIds, ["rose"], "the variety field says so either way");
});

test("a region reason says the place the wine states, not another name for the same region", () => {
  const t = score(pasted("Cuvee Test, Napa Valley"));
  assertEq(t.matchReasons.find((r) => r.type === "region").label, "napa valley", "pasted");
  const p = score(photo({ region: "Napa Valley" }));
  assertEq(p.matchReasons.find((r) => r.type === "region").label, "napa valley", "photographed");
});

// ═══════════════════════════════════════════════════════
console.log("\n═══ 3. Parity over wineUnified ═══");
// ═══════════════════════════════════════════════════════

const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const spellings = (name) => Array.from(new Set([name, fold(name)]));
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

test("every grape spelling the text path resolves, the photo path resolves to the same grape", () => {
  const names = new Set();
  for (const v of wineUnified.varietals) { names.add(v.name); for (const part of v.name.split(" / ")) names.add(part.trim()); }
  for (const syn of Object.keys(wineUnified.varietalLookup)) names.add(syn.replace(/_/g, " "));
  let checked = 0; const misses = [];
  for (const name of names) for (const spelling of spellings(name)) {
    const t = score(pasted(`Cuvee Test ${spelling}`)), p = score(photo({ variety: spelling }));
    if (t.detectedVarietalIds.length === 0) continue; // a name the text path can't read either (under 4 letters)
    checked++;
    if (!sameSet(t.detectedVarietalIds, p.detectedVarietalIds)) misses.push(`${spelling}: pasted [${t.detectedVarietalIds}] photo [${p.detectedVarietalIds}]`);
  }
  assert(checked > 100, `a real corpus (${checked})`);
  assertEq(misses, [], `${misses.length} of ${checked} grape spellings differ`);
});

test("every region spelling the text path resolves, the photo path resolves to the same region", () => {
  const names = new Set(Object.keys(wineUnified.regionLookup));
  for (const regions of Object.values(wineUnified.regions)) for (const r of regions) { names.add(r.name); for (const part of r.name.split(" / ")) names.add(part.trim()); }
  let checked = 0; const misses = [];
  for (const name of names) for (const spelling of spellings(name)) {
    const t = score(pasted(`Cuvee Test, ${spelling}`)), p = score(photo({ region: spelling }));
    if (t.detectedRegionIds.length === 0) continue;
    checked++;
    if (!sameSet(t.detectedRegionIds, p.detectedRegionIds)) misses.push(`${spelling}: pasted [${t.detectedRegionIds}] photo [${p.detectedRegionIds}]`);
  }
  assert(checked > 1100, `a real corpus (${checked})`);
  assertEq(misses, [], `${misses.length} of ${checked} region spellings differ`);
});

test("every country the text path resolves, the photo path resolves — in the country field or the region field", () => {
  const names = wineUnified.countries.map((c) => c.name).concat(["United States", "U.S.A.", "USA", "California", "Oregon", "Washington", "New York", "Texas", "Western Cape", "Central Coast"]);
  let checked = 0; const misses = [];
  for (const name of names) {
    const t = score(pasted(`Cuvee Test, ${name}`));
    if (t.detectedCountryIds.length === 0) continue; // "US" alone is not a word a line can be read by
    checked++;
    for (const field of ["country", "region"]) {
      const p = score(photo({ [field]: name }));
      if (!sameSet(t.detectedCountryIds, p.detectedCountryIds)) misses.push(`${name} as ${field}: pasted [${t.detectedCountryIds}] photo [${p.detectedCountryIds}]`);
    }
  }
  assert(checked >= 25, `a real corpus (${checked})`);
  assertEq(misses, [], `${misses.length} country spellings differ`);
});

// Every producer in wineUnified as one wine: "Producer Grape, Region, Country"
// pasted, and the same four facts photographed. The palate holds exactly
// that wine's estate, region, grape and country.
function producerWines() {
  const wines = [];
  const countryName = Object.fromEntries(wineUnified.countries.map((c) => [c.id, c.id === "us" ? "USA" : c.name]));
  const regionOf = {};
  for (const [countryId, regions] of Object.entries(wineUnified.regions)) for (const r of regions) regionOf[r.id] = { ...r, countryId };
  const grapeName = Object.fromEntries(wineUnified.varietals.map((v) => [v.id, v.name.split(" / ")[0]]));
  for (const [key, p] of Object.entries(wineUnified.producerLookup)) {
    const region = regionOf[p.regionId];
    if (!region || region.countryId !== p.country) continue;
    // The estate's display name where the data lists one; else its key
    const estate = (wineUnified.producers[p.regionId] || []).find((e) => e.id === p.producerId);
    const grapeId = ((estate && estate.topVarietals) || [])[0] || (region.topVarietals || [])[0];
    if (!grapeId || !grapeName[grapeId]) continue;
    wines.push({
      key, producer: estate ? estate.name : key, grape: grapeName[grapeId], grapeId, region: region.name.split(" / ")[0], regionId: region.id,
      country: countryName[p.country], countryId: p.country, estateId: p.producerId,
    });
  }
  return wines;
}

test("no producer's wine scores lower photographed than pasted — and where the two differ, the photo read the wine's own facts", () => {
  const wines = producerWines();
  assert(wines.length > 8000, `a real corpus (${wines.length})`);
  const lower = [], misread = [];
  let same = 0, differ = 0;
  const classes = { "a producer named like the stated region took it from the pasted line": 0, "a region name too short to scan a line for": 0, other: 0 };
  for (const w of wines) {
    const dna = { countries: [w.countryId], regions: { [w.countryId]: [w.regionId] }, estates: { [w.regionId]: [w.estateId] }, varietals: [w.grapeId], specificWines: [] };
    const name = `${w.producer} ${w.grape}`;
    const t = score(pasted(`${name}, ${w.region}, ${w.country}`), dna);
    const p = score(photo({ producer: w.producer, variety: w.grape, region: w.region, country: w.country }, name), dna);
    if (p.score < t.score) lower.push(`${w.key}: pasted ${t.score}, photo ${p.score}`);
    if (t.score === p.score && JSON.stringify(ids(t)) === JSON.stringify(ids(p))) { same++; continue; }
    differ++;
    // The pasted line is read whole, longest term first, so a producer's own
    // words can pass for another grape or place, and a producer named like
    // the stated region ("Santa Barbara", an Italian estate) takes the
    // region's words and is then discarded as a namesake — the region and
    // the real producer both lost (CLAUDE.md, resolver follow-up d: not
    // booked). The photo keeps its fields apart. What must hold: where the
    // two differ, the photo read exactly this wine's region, grape, country.
    // (One region name belongs to two countries: Chile's Central Valley is
    // filed under California's in regionLookup. Both paths read it alike.)
    const filedElsewhere = (wineUnified.regionLookup[w.region.toLowerCase()] || {}).regionId;
    const sharedName = filedElsewhere && filedElsewhere !== w.regionId;
    if (!sharedName && JSON.stringify(ids(p)) !== JSON.stringify({ regions: [w.regionId], countries: [w.countryId], varietals: [w.grapeId] })) {
      misread.push(`${w.key}: photo ${JSON.stringify(ids(p))}, the wine is ${w.regionId} / ${w.countryId} / ${w.grapeId}`);
    }
    if (w.region.length < 4) classes["a region name too short to scan a line for"]++;
    else if (t.detectedRegionIds.length === 0 && wineUnified.producerLookup[w.region.toLowerCase()]) classes["a producer named like the stated region took it from the pasted line"]++;
    else classes.other++;
  }
  console.log(`      ${wines.length} wines: ${same} score the same; ${differ} higher photographed — ${Object.entries(classes).map(([k, n]) => `${n} ${k}`).join("; ")}`);
  assertEq(lower, [], `${lower.length} wines score LOWER photographed`);
  assertEq(misread.slice(0, 10), [], `${misread.length} differing wines where the photo did not read the wine's own facts`);
  assert(differ < wines.length * 0.03, `the pasted line's misreadings stay a small, known set (${differ})`);
});

// ═══════════════════════════════════════════════════════
console.log("\n═══ 4. The real failures, as the real route read them ═══");
// ═══════════════════════════════════════════════════════

/** What the page would show for one scan and one palate. */
function analyze(wines, palate) {
  const entries = engine.entriesFromVision(wines);
  const { scoredEntries, userDNA } = engine.matchWinesAgainstDNA(entries, dnaOf(palate.profile), null);
  const matched = scoredEntries.filter((e) => e.score > 0);
  const picks = engine.curatePicks(scoredEntries, {
    minPrice: null, maxPrice: null, colorPreference: "all", maxPicks: engine.getPickCount(entries.length, "all"),
    menuContext: engine.buildMenuContext(matched), userDNA,
  });
  return { read: entries.length, leftOut: entries.filter((e) => e.isByTheGlass).length, scored: scoredEntries.length, matched: matched.length, picks: picks.length };
}
const wineCount = (list) => LISTS[list].sections.reduce((n, s) => n + s.wines.length, 0);

for (const [key, palate] of Object.entries(PALATES)) {
  test(`${palate.list} for ${key}: under either heading every wine is a bottle, and the palate finds its wines`, () => {
    for (const heading of ["plain", "glass"]) {
      const scan = captured.after[`${palate.list}-${heading}`];
      const a = analyze(scan, palate);
      assertEq([a.read, a.leftOut, a.scored], [wineCount(palate.list), 0, wineCount(palate.list)], `${heading} heading: read, left out, scored`);
      assert(a.matched >= Math.floor(a.read * 0.4), `${heading} heading: ${a.matched} of ${a.read} match`);
      assert(a.picks >= 5, `${heading} heading: ${a.picks} picks`);
    }
  });
}

test("the two headings read the same: a page's title no longer decides what is a bottle", () => {
  for (const [key, palate] of Object.entries(PALATES)) {
    const plain = analyze(captured.after[`${palate.list}-plain`], palate), glass = analyze(captured.after[`${palate.list}-glass`], palate);
    assertEq([glass.scored, glass.leftOut], [plain.scored, plain.leftOut], key);
  }
});

test("the control: a real by-the-glass section stays out, the bottle list is scored", () => {
  const a = analyze(captured.after.mixed, PALATES.aug8);
  assertEq([a.read, a.leftOut, a.scored], [14, 6, 8], "read, left out, scored");
});

test("what the route returned before the prompt changed is kept, and still reads as it did", () => {
  // The Aug 8 shape: under the by-the-glass heading every wine came back
  // flagged, with no glass price to say a bottle price was there too
  const old = captured.before["aug8-glass"];
  assert(old.every((w) => w.is_btg === true && typeof w.price === "number" && w.glass_price === undefined), "flagged, one price, no glass price");
  const a = analyze(old, PALATES.aug8);
  assertEq([a.read, a.leftOut, a.scored, a.matched], [25, 25, 0, 0], "nothing can tell those prices are bottles");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
