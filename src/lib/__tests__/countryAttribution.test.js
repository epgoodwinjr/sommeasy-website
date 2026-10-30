// Country Attribution — Regression Suite
// Run with: node src/lib/__tests__/countryAttribution.test.js
//
// Guards the country-misattribution class of bugs originally reported as:
//   - "Cassis, Clos Sainte Magdeleine" (Provence) displaying as US
//     (producer "Cass", Paso Robles, substring-matched inside "Cassis")
//   - "Pierre Gimonnet & Fils" (Champagne) displaying as Italy
//     (producer "Pier", Piedmont, substring-matched inside "Pierre")
//   - "Crozes-Hermitage" displaying as Portugal — PR #16's case
//     (producer "Rozès", Port house, substring-matched inside "Crozes")
//   - "Kumeu River, Maté's Vineyard" (NZ Chardonnay) crediting Italy —
//     the Tuscan producer "Máté" (norm "mate") matched inside the
//     possessive "Maté's" because both boundary classes treat the
//     apostrophe as a word edge. "X's <site>" names a vineyard after a
//     person; it is not a mention of producer X. Observed live July 30
//     2026 as estate=mate/region=tuscany/country=italy accumulation rows
//     from one loved NZ bottle.
//   - "Newton Johnson Chardonnay, Hemel-en-Aarde" (South Africa) showing
//     "US · CHARDONNAY" on /recommend, with US in the Somm payload (Oct
//     2026). WineMag keys the estate "Newton Johnson Vineyards"; the menu
//     drops "Vineyards", so the full name never matched and the
//     longest-first scan fell through to Napa's "Newton". "La Emperatriz
//     el Jardín" -> Stellenbosch's "Jardin" was the same bug in the
//     resolver (WineMag: "Finca La Emperatriz"; the menu drops "Finca").
//   - Namesakes no alias can fix: Sonoma's "Jordan" on a Stellenbosch
//     line, Israel's "Alexander" inside "Alexander Valley", Spain's
//     "La Val" inside "Amarone della Valpolicella". The engine let any
//     producer hit outvote the region the line named outright.
//
// Root cause: producer/varietal detection used raw substring includes()
// instead of word-boundary matching. Fixed July 2026 in matchEngine.js
// (detectWineAttributes + producer-term "&"/"et"/"and" aliases) and
// wineResolver.js (containsTerm boundary guard in matchProducer). The
// possessive fix adds a (?!'s…) lookahead to both boundary matchers so
// an apostrophe still bounds quoted names ('Clos du Mesnil') but never
// lets a possessive count as a producer mention.
//
// Oct 2026 — one principle, three rules: a producer hit is a guess, and
// the line's own words outrank it.
//   1. Core-name aliases (producerAliases.js, both engines): each producer
//      is also indexed under the name menus write ("newton johnson",
//      "la emperatriz"), so specificity beats the shorter namesake.
//      Every guardrail has a case below.
//   2. Stated geography outranks a producer (matchEngine): a producer
//      whose country contradicts the region/country the line names is a
//      namesake and contributes nothing — the engine's half of the
//      resolver's Step 3.5 guard. Geography inside the producer's own name
//      ("Concha y Toro", "Vega Sicilia") states nothing about the bottle.
//   3. Combined region names split into matchable parts, as varietals
//      already were: "Hemel-en-Aarde / Walker Bay" -> "hemel-en-aarde".
//
// The mirror sections below MIRROR matchEngine.js / wineResolver.js
// (ESM with bare JSON imports — same pattern as dnaEvolution.test.js).
// If you change the matching logic in production, update the mirror here.
// The final section imports the REAL wineResolver.js via the alias-loader
// (helpers/alias-loader.mjs supplies JSON import attributes), so the
// resolver regression cases also run against production code, mirror-drift
// notwithstanding.

const wineUnified = require("../wineUnified.json");
const aliasMirror = require("./helpers/producerAliasesMirror.js");
const COUNTRIES = wineUnified.countries;
const REGIONS = wineUnified.regions;
const VARIETALS = wineUnified.varietals;
const ESTATES = wineUnified.producers;
const REGION_LOOKUP = wineUnified.regionLookup;
const PRODUCER_LOOKUP = wineUnified.producerLookup;
const VARIETAL_LOOKUP = wineUnified.varietalLookup;

// ═══════════════════════════════════════════════════════
// MIRROR: matchEngine.js — search index + detection
// ═══════════════════════════════════════════════════════

function termMatchesInText(term, text, wholePhrase) {
  if (term.length <= 2) return false;
  if (!wholePhrase && (term.includes(" ") || term.includes("-"))) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[\\s,;:()/\\-–—.'])${escaped}(?!'s(?:[\\s,;:()/\\-–—.']|$))(?:[\\s,;:()/\\-–—.']|$)`, "i");
  return re.test(text);
}

function buildSearchIndex() {
  const idx = { regionTerms: [], producerTerms: [], varietyTerms: [], countryTerms: [] };

  for (const [term, data] of Object.entries(REGION_LOOKUP)) {
    if (term.length < 4 || ["other", "america", "europe"].includes(term)) continue;
    idx.regionTerms.push({ term, dnaRegionId: data.regionId, dnaCountryId: data.country });
  }
  for (const [countryId, regions] of Object.entries(REGIONS)) {
    for (const region of regions) {
      const term = region.name.toLowerCase();
      if (term.length < 4) continue;
      const existing = idx.regionTerms.find(r => r.term === term);
      if (existing) {
        if (existing.dnaCountryId !== countryId) existing.sharedWith = (existing.sharedWith || []).concat(countryId);
        continue;
      }
      idx.regionTerms.push({ term, dnaRegionId: region.id, dnaCountryId: countryId });
    }
  }
  for (const combined of idx.regionTerms.filter(r => r.term.includes(" / "))) {
    for (const part of combined.term.split(" / ")) {
      const term = part.trim();
      if (term.length < 4 || idx.regionTerms.some(r => r.term === term)) continue;
      idx.regionTerms.push({ ...combined, term });
    }
  }
  idx.regionTerms.sort((a, b) => b.term.length - a.term.length);

  for (const [name, data] of Object.entries(PRODUCER_LOOKUP)) {
    if (name.length < 3) continue;
    idx.producerTerms.push({ term: name.toLowerCase(), name, dnaCountryId: data.country || null });
    const variants = [];
    if (name.includes(" et ")) variants.push(name.replace(/ et /g, " & "));
    if (name.includes(" and ")) variants.push(name.replace(/ and /g, " & "));
    if (name.includes(" & ")) variants.push(name.replace(/ & /g, " et "), name.replace(/ & /g, " and "));
    for (const v of variants) {
      idx.producerTerms.push({ term: v.toLowerCase(), name, dnaCountryId: data.country || null });
    }
  }

  for (const v of VARIETALS) {
    if (v.name.length < 4) continue;
    idx.varietyTerms.push({ term: v.name.toLowerCase(), name: v.name, color: v.color, dnaVarietalId: v.id });
    if (v.name.includes(" / ")) {
      for (const part of v.name.split(" / ")) {
        const partLower = part.trim().toLowerCase();
        if (partLower.length >= 4 && !idx.varietyTerms.some(vt => vt.term === partLower)) {
          idx.varietyTerms.push({ term: partLower, name: v.name, color: v.color, dnaVarietalId: v.id });
        }
      }
    }
  }
  for (const [synonym, canonicalId] of Object.entries(VARIETAL_LOOKUP)) {
    const synLower = synonym.toLowerCase().replace(/_/g, " ");
    if (synLower.length < 4 || idx.varietyTerms.some(v => v.term === synLower)) continue;
    const canonical = VARIETALS.find(v => v.id === canonicalId);
    if (!canonical) continue;
    idx.varietyTerms.push({ term: synLower, name: canonical.name, color: canonical.color, dnaVarietalId: canonicalId });
  }
  idx.varietyTerms.sort((a, b) => b.term.length - a.term.length);

  for (const c of COUNTRIES) {
    if (c.name.length < 3) continue;
    idx.countryTerms.push({ term: c.name.toLowerCase(), name: c.name, dnaCountryId: c.id });
  }
  idx.countryTerms.push({ term: "united states", name: "United States", dnaCountryId: "us" });
  idx.countryTerms.push({ term: "u.s.a.", name: "United States", dnaCountryId: "us" });
  const stateToUSA = ["california", "oregon", "washington", "new york", "virginia", "texas",
    "colorado", "arizona", "new mexico", "idaho", "michigan", "pennsylvania",
    "north carolina", "ohio", "missouri"];
  for (const s of stateToUSA) {
    if (!idx.regionTerms.some(r => r.term === s)) {
      idx.countryTerms.push({ term: s, name: "United States", dnaCountryId: "us" });
    }
  }
  for (const [core, name] of aliasMirror.buildCoreNameAliases(wineUnified)) {
    idx.producerTerms.push({ term: core, name, dnaCountryId: PRODUCER_LOOKUP[name].country || null, alias: true });
  }
  idx.producerTerms.sort((a, b) => b.term.length - a.term.length);
  return idx;
}

const SEARCH_INDEX = buildSearchIndex();

// Mirror of detectWineAttributes (matchEngine.js)
function detectWineAttributes(wineName) {
  const text = " " + wineName.toLowerCase() + " ";
  const regionIds = new Set();
  const countryIds = new Set();
  const varietalIds = new Set();
  const producerTerms = new Set();
  let color = null;
  const claimed = new Set();

  let producer = null;
  for (const prod of SEARCH_INDEX.producerTerms) {
    if (prod.term.length < 4) continue;
    if (termMatchesInText(prod.term, text, prod.alias)) {
      producer = prod;
      claimed.add(prod.term);
      break;
    }
  }
  let region = null;
  for (const reg of SEARCH_INDEX.regionTerms) {
    if (claimed.has(reg.term)) continue;
    if (termMatchesInText(reg.term, text)) {
      region = reg;
      if (reg.dnaRegionId) regionIds.add(reg.dnaRegionId);
      claimed.add(reg.term);
      break;
    }
  }
  for (const v of SEARCH_INDEX.varietyTerms) {
    if (termMatchesInText(v.term, text)) {
      if (v.dnaVarietalId) varietalIds.add(v.dnaVarietalId);
      if (v.color && !color) color = v.color;
      claimed.add(v.term);
      break;
    }
  }
  let statedCountry = null;
  for (const c of SEARCH_INDEX.countryTerms) {
    if (c.term.length < 4) continue;
    if (termMatchesInText(c.term, text)) {
      statedCountry = c;
      break;
    }
  }
  // Namesake guard: stated geography (not inside the producer's own name)
  // that contradicts the producer's country discards the producer; a region
  // name two countries share agrees with either
  if (producer && producer.dnaCountryId) {
    const stated = [region, statedCountry].filter(g => g && g.dnaCountryId && !producer.term.includes(g.term));
    const agrees = g => g.dnaCountryId === producer.dnaCountryId || (g.sharedWith || []).includes(producer.dnaCountryId);
    if (stated.length > 0 && !stated.some(agrees)) producer = null;
  }
  if (producer) {
    producerTerms.add(producer.name);
    if (producer.dnaCountryId) countryIds.add(producer.dnaCountryId);
  }
  if (region && region.dnaCountryId) countryIds.add(region.dnaCountryId);
  if (statedCountry && statedCountry.dnaCountryId) countryIds.add(statedCountry.dnaCountryId);
  return { regionIds, countryIds, varietalIds, producerTerms, color };
}

// detectedCountry = first inserted country id (matchEngine scoring return shape)
function detectedCountry(wineName) {
  const attrs = detectWineAttributes(wineName);
  return attrs.countryIds.size > 0 ? Array.from(attrs.countryIds)[0] : null;
}

// detectedProducer = the producer's canonical producerLookup key, or null
function detectedProducer(wineName) {
  const attrs = detectWineAttributes(wineName);
  return attrs.producerTerms.size > 0 ? Array.from(attrs.producerTerms)[0] : null;
}

// ═══════════════════════════════════════════════════════
// MIRROR: wineResolver.js — matchProducer boundary guard
// ═══════════════════════════════════════════════════════

function normalize(text) {
  return text.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\b(estate|vineyard|vineyards|winery|wines|wine|cellars|cellar|cuvee|domaine|chateau|château|bodega|tenuta|casa|cantina|fattoria|azienda|maison)\b/gi, "")
    .replace(/[^a-z0-9\s'.-]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function tokenize(text) { return normalize(text).split(/\s+/).filter(t => t.length >= 2); }

function containsTerm(haystack, needle, wholePhrase) {
  if (!wholePhrase && (needle.includes(" ") || needle.includes("-"))) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s'.])${escaped}(?!'s(?:[\\s'.]|$))(?:[\\s'.]|$)`).test(haystack);
}

const producerIndex = [];
const byLookupKey = new Map();
for (const [name, data] of Object.entries(PRODUCER_LOOKUP)) {
  const norm = normalize(name);
  if (norm.length < 3) continue;
  const entry = {
    name, norm, tokens: new Set(tokenize(name)),
    dnaCountryId: data.country, dnaRegionId: data.regionId || null,
  };
  producerIndex.push(entry);
  byLookupKey.set(name, entry);
}
for (const [regionId, estates] of Object.entries(ESTATES)) {
  for (const estate of estates) {
    const norm = normalize(estate.name);
    if (producerIndex.some(p => p.norm === norm)) continue;
    producerIndex.push({ name: estate.name, norm, tokens: new Set(tokenize(estate.name)), dnaCountryId: null, dnaRegionId: regionId });
  }
}
// Core-name aliases, normalized; only names normalize() doesn't already reach
{
  const norms = new Set(producerIndex.map(p => p.norm));
  for (const [core, key] of aliasMirror.buildCoreNameAliases(wineUnified)) {
    const norm = normalize(core);
    if (norms.has(norm) || !norm.includes(" ") || !byLookupKey.has(key)) continue;
    producerIndex.push({ ...byLookupKey.get(key), norm, alias: true });
  }
}
producerIndex.sort((a, b) => b.norm.length - a.norm.length);

function tokenOverlap(inputTokens, candidateTokens) {
  if (inputTokens.length === 0 || candidateTokens.size === 0) return 0;
  let matches = 0;
  for (const t of inputTokens) {
    if (candidateTokens.has(t)) matches++;
    else { for (const ct of candidateTokens) {
      if ((t.length >= 4 && ct.startsWith(t)) || (ct.length >= 4 && t.startsWith(ct))) { matches += 0.7; break; }
    }}
  }
  return matches / Math.max(inputTokens.length, candidateTokens.size);
}

// Mirror of matchProducer (wineResolver.js) — Strategy 1 uses containsTerm
function matchProducer(wineName) {
  const normInput = normalize(wineName);
  const inputTokens = tokenize(wineName);
  let bestMatch = null, bestScore = 0;
  for (const prod of producerIndex) {
    let score = 0;
    if (prod.norm.length >= 4 && containsTerm(normInput, prod.norm, prod.alias)) {
      score = 0.5 + (prod.norm.length / normInput.length * 0.5);
    } else {
      const overlap = tokenOverlap(inputTokens, prod.tokens);
      if (overlap >= 0.4) score = overlap * 0.7;
    }
    if (score > bestScore) { bestScore = score; bestMatch = prod; }
    if (bestScore >= 0.95) break;
  }
  if (bestScore < 0.3) return null;
  return { producer: bestMatch, score: bestScore };
}

// ═══════════════════════════════════════════════════════
// TEST HARNESS
// ═══════════════════════════════════════════════════════

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }

console.log("\n═══ Country Attribution — Match Engine (text path) ═══");

test("Cassis (Provence) does not attribute to US via producer 'Cass'", () => {
  const c = detectedCountry("Cassis, Clos Sainte Magdeleine");
  assert(c !== "us", `detectedCountry: ${c}`);
  // Cassis the appellation isn't in the WineMag-derived regionLookup, so
  // null (no attribution) is the correct floor here — never a wrong country.
  assert(c === null || c === "france", `expected null or france, got: ${c}`);
});

test("Pierre Gimonnet & Fils (Champagne) attributes to France, not Italy", () => {
  const c = detectedCountry("Pierre Gimonnet & Fils, Cuis 1er Cru");
  assert(c === "france", `detectedCountry: ${c}`);
});

test("Crozes-Hermitage attributes to France, not Portugal (PR #16 case)", () => {
  const c = detectedCountry("Crozes-Hermitage, Alain Graillot");
  assert(c === "france", `detectedCountry: ${c}`);
});

test("Domaine Tempier Bandol attributes to France, not Italy via 'Pier'", () => {
  const c = detectedCountry("Bandol Rouge, Domaine Tempier");
  assert(c === "france", `detectedCountry: ${c}`);
});

test("La Rioja Alta attributes to Spain", () => {
  const c = detectedCountry("Rioja Reserva, La Rioja Alta");
  assert(c === "spain", `detectedCountry: ${c}`);
});

test("Sancerre attributes to France", () => {
  const c = detectedCountry("Sancerre, Domaine Vacheron");
  assert(c === "france", `detectedCountry: ${c}`);
});

test("Etna Rosso attributes to Italy", () => {
  const c = detectedCountry("Etna Rosso, Tenuta delle Terre Nere");
  assert(c === "italy", `detectedCountry: ${c}`);
});

test("Legit short producer 'Cass' still matches on word boundary", () => {
  const c = detectedCountry("Cass Grenache, Paso Robles");
  assert(c === "us", `detectedCountry: ${c}`);
});

test("Varietal 'Port' does not fire inside 'Portal'/'Portugal' (color guard)", () => {
  const attrs = detectWineAttributes("Douro Tinto, Quinta do Portal");
  assert(!attrs.varietalIds.has("port"), `varietals: ${[...attrs.varietalIds]}`);
});

test("Possessive 'Máté's Vineyard' does not attribute Italy (Kumeu River case)", () => {
  // matchEngine keeps accents, so the producer term is "máté" — the
  // both-accents spelling is the form that exercises this path.
  const c = detectedCountry("Kumeu River, Máté's Vineyard, New Zealand");
  assert(c !== "italy", `detectedCountry: ${c}`);
  assert(c === "new_zealand", `expected new_zealand, got: ${c}`);
});

test("termMatchesInText: possessive 's never counts as a mention; closing quote still bounds", () => {
  assert(!termMatchesInText("máté", " kumeu river, máté's vineyard, new zealand "),
    "term matched inside possessive máté's");
  // Deliberate trade: even a REAL producer written possessively ("Krug's
  // cuvée") does not count — a false country override poisons the DNA,
  // a missed producer merely lowers confidence.
  assert(!termMatchesInText("krug", " krug's clos du mesnil "),
    "term matched inside possessive krug's");
  // The apostrophe stays a boundary when it is a quote, not a possessive
  assert(termMatchesInText("mesnil", " krug 'clos du mesnil' champagne "),
    "closing-quote apostrophe boundary must still match");
});

console.log("\n═══ Country Attribution — Core Names and Namesakes (text path) ═══");

test("Newton Johnson, Hemel-en-Aarde: South Africa + Hemel-en-Aarde, not Napa's Newton", () => {
  const line = "Newton Johnson Chardonnay, Hemel-en-Aarde 2023";
  const attrs = detectWineAttributes(line);
  assert(detectedCountry(line) === "south_africa", `detectedCountry: ${detectedCountry(line)}`);
  assert(attrs.regionIds.has("hemel_en_aarde_walker_bay"), `regions: ${[...attrs.regionIds]}`);
  assert(detectedProducer(line) === "newton johnson vineyards", `producer: ${detectedProducer(line)}`);
});

test("Newton Johnson with no geography still finds the estate by its core name", () => {
  // Only the core-name alias reaches this form: there is no stated
  // geography for the namesake guard to weigh
  const line = "Newton Johnson Chardonnay";
  assert(detectedProducer(line) === "newton johnson vineyards", `producer: ${detectedProducer(line)}`);
  assert(detectedCountry(line) === "south_africa", `detectedCountry: ${detectedCountry(line)}`);
});

test("Napa's Newton still matches its own wines (no over-tightening)", () => {
  const line = "Newton Unfiltered Chardonnay, Napa Valley 2021";
  assert(detectedProducer(line) === "newton", `producer: ${detectedProducer(line)}`);
  assert(detectedCountry(line) === "us", `detectedCountry: ${detectedCountry(line)}`);
});

test("Bare 'Hemel-en-Aarde' is a region term (combined 'Hemel-en-Aarde / Walker Bay' split)", () => {
  const line = "Hemel-en-Aarde Chardonnay 2022";
  assert(detectWineAttributes(line).regionIds.has("hemel_en_aarde_walker_bay"), "region not detected");
  assert(detectedCountry(line) === "south_africa", `detectedCountry: ${detectedCountry(line)}`);
});

test("A namesake yields to the region the line names (Sonoma's Jordan on a Stellenbosch line)", () => {
  // WineMag has both Jordans, but menus write "Jordan" for each: no core
  // name can tell them apart, only the line's own geography can
  const line = "Jordan Chardonnay, Stellenbosch 2021";
  assert(detectedCountry(line) === "south_africa", `detectedCountry: ${detectedCountry(line)}`);
  assert(detectedProducer(line) === null, `namesake kept: ${detectedProducer(line)}`);
});

test("A producer inside a region name yields to it (Israel's Alexander, Spain's La Val)", () => {
  assert(detectedCountry("Jordan Cabernet Sauvignon, Alexander Valley 2018") === "us",
    `Alexander Valley: ${detectedCountry("Jordan Cabernet Sauvignon, Alexander Valley 2018")}`);
  assert(detectedCountry("Amarone della Valpolicella, Masi 2016") === "italy",
    `Amarone: ${detectedCountry("Amarone della Valpolicella, Masi 2016")}`);
});

test("An uncontested namesake keeps its producer (Jordan with no geography stays Sonoma)", () => {
  const line = "Jordan Cabernet Sauvignon 2018";
  assert(detectedProducer(line) === "jordan", `producer: ${detectedProducer(line)}`);
  assert(detectedCountry(line) === "us", `detectedCountry: ${detectedCountry(line)}`);
});

test("Geography inside the producer's own name states nothing (Concha y Toro, Vega Sicilia)", () => {
  // "toro" (Spain) sits inside Chile's "Concha y Toro", "sicilia" (Italy)
  // inside Spain's "Vega Sicilia" — neither line contradicts its producer
  const toro = "Concha y Toro Casillero del Diablo Cabernet Sauvignon";
  assert(detectedProducer(toro) === "concha y toro", `producer: ${detectedProducer(toro)}`);
  assert(detectedCountry(toro) === "chile", `detectedCountry: ${detectedCountry(toro)}`);
  const vega = "Vega Sicilia Único 2011";
  assert(detectedProducer(vega) === "vega sicilia", `producer: ${detectedProducer(vega)}`);
  assert(detectedCountry(vega) === "spain", `detectedCountry: ${detectedCountry(vega)}`);
});

test("A region name two countries share contradicts neither (Chile's Central Valley)", () => {
  // regionLookup maps "central valley" to California; Chile has its own.
  // Read as US-only, it vetoed every Chilean producer naming its home region.
  const line = "Miguel Torres Santa Digna Cabernet Sauvignon, Central Valley 2020";
  assert(detectedProducer(line) === "miguel torres", `producer: ${detectedProducer(line)}`);
  assert(detectedCountry(line) === "chile", `detectedCountry: ${detectedCountry(line)}`);
});

// Core-name guardrails: each is a real collision in wineUnified.json

test("Guardrail: 'Cantina di Montalcino' never claims every Brunello", () => {
  const p = detectedProducer("Brunello di Montalcino, Biondi-Santi 2015");
  assert(p !== "cantina di montalcino", `producer: ${p}`);
});

test("Guardrail: a preposition left after the designator is not a name (US 'Casa de la Cruz')", () => {
  // "de la cruz" is a modifier, not a name — indexed, it puts a Spanish
  // Tempranillo in California
  const line = "Hacienda de la Cruz Tempranillo 2019";
  assert(detectedProducer(line) !== "casa de la cruz", `producer: ${detectedProducer(line)}`);
  assert(detectedCountry(line) !== "us", `detectedCountry: ${detectedCountry(line)}`);
});

test("Guardrail: a core inside another producer's name is not indexed ('San Mauro', Italy vs Spain)", () => {
  // Italy's Tenuta San Mauro sits inside Spain's Pazo San Mauro
  const line = "San Mauro Albariño 2021";
  assert(detectedProducer(line) === null, `producer: ${detectedProducer(line)}`);
  assert(detectedCountry(line) === null, `detectedCountry: ${detectedCountry(line)}`);
});

test("Guardrail: core names match whole phrases only ('Lo Alto' never inside 'Cielo Alto')", () => {
  const p = detectedProducer("Cielo Alto Malbec 2020");
  assert(p !== "finca casa lo alto", `producer: ${p}`);
  assert(!termMatchesInText("lo alto", " cielo alto malbec ", true), "whole-phrase term matched mid-word");
  assert(termMatchesInText("lo alto", " lo alto crianza, la mancha ", true), "whole-phrase term missed a real mention");
});

test("Guardrail: a core name that is or sits inside a place is not indexed ('Dry Creek')", () => {
  // "Dry Creek Vineyard" -> "dry creek" would claim every Dry Creek Valley wine
  const p = detectedProducer("Zinfandel, Dry Creek Valley 2019");
  assert(p !== "dry creek vineyard", `producer: ${p}`);
});

test("Guardrail: a core name two producers share is not indexed ('Meyer Family', US vs Canada)", () => {
  // Meyer Family Cellars (US) and Meyer Family Vineyards (Canada): no
  // attribution is the honest floor — never a coin-flip country
  const line = "Meyer Family Pinot Noir 2019";
  assert(detectedProducer(line) === null, `producer: ${detectedProducer(line)}`);
  assert(detectedCountry(line) === null, `detectedCountry: ${detectedCountry(line)}`);
});

console.log("\n═══ Country Attribution — Resolver (matchProducer) ═══");

test("Resolver: 'Cassis...' does not match producer Cass (US)", () => {
  const m = matchProducer("Cassis, Clos Sainte Magdeleine");
  assert(!m || m.producer.norm !== "cass", `matched: ${m && m.producer.name} (${m && m.score})`);
});

test("Resolver: 'Crozes-Hermitage...' does not match producer Rozès (Portugal)", () => {
  const m = matchProducer("Crozes-Hermitage, Alain Graillot");
  assert(!m || m.producer.norm !== "rozes", `matched: ${m && m.producer.name} (${m && m.score})`);
});

test("Resolver: 'Pierre Gimonnet...' does not match producer Pier (Italy)", () => {
  const m = matchProducer("Pierre Gimonnet & Fils, Cuis 1er Cru");
  assert(!m || m.producer.norm !== "pier", `matched: ${m && m.producer.name} (${m && m.score})`);
});

test("Resolver: Krug still matches on word boundary (no over-tightening)", () => {
  const m = matchProducer("Krug Grande Cuvée");
  assert(m && m.producer.norm === "krug", `matched: ${m && m.producer.name}`);
});

test("Resolver: legit 'Cass Grenache' still matches producer Cass", () => {
  const m = matchProducer("Cass Grenache 2019");
  assert(m && m.producer.norm === "cass", `matched: ${m && m.producer.name} (${m && m.score})`);
});

test("Resolver: 'Kumeu River, Maté's Vineyard...' does not match producer Máté (Italy)", () => {
  // The resolver strips accents, so the real-world spelling ("Maté's",
  // é only) collides with producer norm "mate" — the observed live bug.
  const m = matchProducer("Kumeu River, Maté's Vineyard, New Zealand");
  assert(!m || m.producer.norm !== "mate", `matched: ${m && m.producer.name} (${m && m.score})`);
});

test("Resolver: nominative 'Máté Sangiovese' still matches producer Máté", () => {
  const m = matchProducer("Máté Sangiovese");
  assert(m && m.producer.norm === "mate", `matched: ${m && m.producer.name} (${m && m.score})`);
});

test("containsTerm: possessive 's blocked, quote/space boundaries intact", () => {
  assert(!containsTerm("kumeu river mate's new zealand", "mate"), "mate matched inside mate's");
  assert(containsTerm("mate sangiovese", "mate"), "nominative mate must still match");
  assert(containsTerm("krug 'clos du mesnil'", "mesnil"), "closing-quote boundary must still match");
});

test("Resolver: 'La Emperatriz el Jardín' matches Finca La Emperatriz (Spain), not Jardin (South Africa)", () => {
  // The menu drops "Finca"; the core name "la emperatriz" outranks the
  // Stellenbosch producer "Jardin" by covering more of the line
  const m = matchProducer("La Emperatriz el Jardín");
  assert(m && m.producer.name === "finca la emperatriz", `matched: ${m && m.producer.name} (${m && m.score})`);
  assert(m.producer.dnaCountryId === "spain", `dnaCountryId: ${m.producer.dnaCountryId}`);
});

test("containsTerm: core names match whole phrases only", () => {
  assert(!containsTerm("cielo alto malbec", "lo alto", true), "whole-phrase needle matched mid-word");
  assert(containsTerm("lo alto crianza", "lo alto", true), "whole-phrase needle missed a real mention");
});

// ═══════════════════════════════════════════════════════
// REAL MODULE: resolveWine via alias-loader (no mirror drift)
// ═══════════════════════════════════════════════════════

async function realModuleTests() {
  const { register } = require("node:module");
  const { pathToFileURL } = require("node:url");
  register("./helpers/alias-loader.mjs", pathToFileURL(__filename));
  const { resolveWine } = await import("../wineResolver.js");
  const engine = await import("../matchEngine.js");
  const { buildSommPayload } = await import("../sommPicks.js");
  const realAliases = await import("../producerAliases.js");

  const NO_DNA = { countries: [], regions: {}, varietals: [], estates: {}, specificWines: [] };
  const scoreLine = (line, dna = NO_DNA, feedback = null) =>
    engine.matchWinesAgainstDNA([{ name: line, price: 78 }], dna, feedback).scoredEntries[0];

  console.log("\n═══ Country Attribution — REAL producerAliases ═══");

  test("Mirror lock: the CJS mirror builds the real alias table over all of wineUnified", () => {
    // Both test files' mirror sections index producers through
    // helpers/producerAliasesMirror.js — any drift from production fails here
    const real = realAliases.buildCoreNameAliases(wineUnified);
    const mirror = aliasMirror.buildCoreNameAliases(wineUnified);
    assert(real.size > 0, "real alias table is empty");
    assert(real.size === mirror.size, `real ${real.size} aliases vs mirror ${mirror.size}`);
    for (const [core, name] of real) {
      assert(mirror.get(core) === name, `"${core}": real -> ${name}, mirror -> ${mirror.get(core)}`);
    }
  });

  console.log("\n═══ Country Attribution — REAL resolveWine ═══");

  test("Real resolveWine: Kumeu River Maté's Vineyard never lands on Italy/Tuscany/Máté", () => {
    const r = resolveWine("Kumeu River, Maté's Vineyard, New Zealand");
    assert(r.country !== "Italy", `country: ${r.country}`);
    const dna = r.dnaMapping || {};
    assert(dna.dnaCountryId !== "italy", `dnaCountryId: ${dna.dnaCountryId}`);
    assert(dna.dnaRegionId !== "tuscany", `dnaRegionId: ${dna.dnaRegionId}`);
    assert(dna.dnaEstateId !== "mate", `dnaEstateId: ${dna.dnaEstateId}`);
  });

  test("Real resolveWine: nominative Máté still resolves to Italy", () => {
    const r = resolveWine("Máté Sangiovese");
    assert(r.winery === "Máté", `winery: ${r.winery}`);
    assert(r.country === "Italy", `country: ${r.country}`);
    // No over-capping: uncontested producer matches must stay above the
    // DNA accumulation gate (CONFIDENCE_GATE = 80 in dnaThresholds.js)
    assert(r.confidence >= 80, `confidence: ${r.confidence}`);
  });

  test("Real resolveWine: explicit-geography conflict caps confidence below even the partial band", () => {
    // Producer Máté (Italy) matches nominatively here, but the name
    // explicitly places the bottle in New Zealand (Marlborough + the
    // country name). Every bug in this suite shared one shape: a fuzzy
    // producer hit silently outvoting what the menu line says outright.
    // The cap must land below PARTIAL_CONFIDENCE_GATE (60), not just
    // CONFIDENCE_GATE (80): the 60-79 band accumulates partial credit on
    // region/country — exactly the producer-derived dimensions a
    // geography conflict disputes. A disputed match accumulates NOTHING.
    const r = resolveWine("Máté Marlborough Sauvignon Blanc, New Zealand");
    assert(r.confidence < 60, `confidence: ${r.confidence}`);
  });

  test("Real resolveWine: 'La Emperatriz el Jardín' is Finca La Emperatriz (Spain), not Jardin", () => {
    const r = resolveWine("La Emperatriz el Jardín");
    assert(r.winery === "Finca La Emperatriz", `winery: ${r.winery}`);
    assert(r.dnaMapping.dnaCountryId === "spain", `dnaCountryId: ${r.dnaMapping.dnaCountryId}`);
  });

  test("Real resolveWine: bare 'Hemel-en-Aarde' now trips the conflict cap (Santa Barbara's Storm)", () => {
    // Was confidence 90: the cap never saw the region, so a South African
    // bottle accumulated US/Santa Barbara points. "Walker Bay" capped already.
    const r = resolveWine("Storm Pinot Noir, Hemel-en-Aarde 2021");
    assert(r.confidence < 60, `confidence: ${r.confidence}`);
  });

  test("Real resolveWine: Newton Johnson stays South Africa with its estate", () => {
    const r = resolveWine("Newton Johnson Chardonnay, Hemel-en-Aarde 2023");
    assert(r.dnaMapping.dnaCountryId === "south_africa", `dnaCountryId: ${r.dnaMapping.dnaCountryId}`);
    assert(r.dnaMapping.dnaEstateId === "newton_johnson_vineyards", `dnaEstateId: ${r.dnaMapping.dnaEstateId}`);
    assert(r.confidence >= 80, `confidence: ${r.confidence}`);
  });

  test("Real resolveWine: core names match whole phrases only ('Lo Alto' never inside 'Cielo Alto')", () => {
    // Guards only the whole-phrase rule. The resolver still reads the single
    // word "alto" as Stellenbosch's Alto Wine Estate — a lone common word with
    // no stated geography, the residual case CLAUDE.md tracks.
    const r = resolveWine("Cielo Alto Malbec 2020");
    assert(r.winery !== "Finca Casa Lo Alto", `winery: ${r.winery}`);
  });

  console.log("\n═══ Country Attribution — REAL matchEngine (text path) ═══");

  test("Real engine: the reported paste line is South Africa · Hemel-en-Aarde, not US", () => {
    const entries = engine.parseWineList("Newton Johnson Chardonnay, Hemel-en-Aarde 2023...$78");
    const s = engine.matchWinesAgainstDNA(entries, NO_DNA, null).scoredEntries[0];
    assert(s.detectedCountry === "south_africa", `detectedCountry: ${s.detectedCountry}`);
    assert(s.detectedRegionIds[0] === "hemel_en_aarde_walker_bay", `regions: ${s.detectedRegionIds}`);
    assert(s.detectedProducer === "newton johnson vineyards", `producer: ${s.detectedProducer}`);
  });

  test("Real Somm payload: the reported line reaches The Somm as South Africa, not US", () => {
    // The Somm's own note called out "the wrong country flag" — the payload
    // country is getCountryName(detectedCountry)
    const dna = { ...NO_DNA, countries: ["south_africa"], varietals: ["chardonnay"] };
    const s = scoreLine("Newton Johnson Chardonnay, Hemel-en-Aarde 2023", dna);
    const payload = buildSommPayload({
      scoredEntries: [s], algorithmicPicks: [], pickCount: 1, profile: {}, ratedInteractions: [],
      totalParsed: 1, budget: { min: null, max: null }, color: null, steer: null,
      display: { varietal: engine.getVarietalDisplayName, region: engine.getRegionDisplayName, country: engine.getCountryName },
    });
    assert(payload.candidates.length === 1, `candidates: ${payload.candidates.length}`);
    assert(payload.candidates[0].country === "South Africa", `country: ${payload.candidates[0].country}`);
    assert(payload.candidates[0].region === "Hemel-en-Aarde / Walker Bay", `region: ${payload.candidates[0].region}`);
  });

  test("Real engine: Newton Johnson with no geography still finds the estate; Napa's Newton keeps its own", () => {
    const nj = scoreLine("Newton Johnson Chardonnay");
    assert(nj.detectedProducer === "newton johnson vineyards" && nj.detectedCountry === "south_africa",
      `Newton Johnson: ${nj.detectedProducer} / ${nj.detectedCountry}`);
    const napa = scoreLine("Newton Unfiltered Chardonnay, Napa Valley 2021");
    assert(napa.detectedProducer === "newton" && napa.detectedCountry === "us",
      `Napa Newton: ${napa.detectedProducer} / ${napa.detectedCountry}`);
  });

  test("Real engine: a namesake yields to the region the line names", () => {
    const cases = [
      ["Jordan Chardonnay, Stellenbosch 2021", "south_africa"],          // Sonoma's Jordan
      ["Jordan Cabernet Sauvignon, Alexander Valley 2018", "us"],         // Israel's Alexander
      ["Amarone della Valpolicella, Masi 2016", "italy"],                 // Spain's La Val
      ["Sanford Pinot Noir, Santa Barbara County 2021", "us"],            // Italy's Santa Barbara
      ["Chandon Brut, Mendoza", "argentina"],                             // Napa's Chandon
    ];
    for (const [line, want] of cases) {
      const s = scoreLine(line);
      assert(s.detectedCountry === want, `${line}: ${s.detectedCountry} (producer ${s.detectedProducer})`);
    }
  });

  test("Real engine: geography inside the producer's own name states nothing", () => {
    const toro = scoreLine("Concha y Toro Casillero del Diablo Cabernet Sauvignon");
    assert(toro.detectedProducer === "concha y toro" && toro.detectedCountry === "chile",
      `Concha y Toro: ${toro.detectedProducer} / ${toro.detectedCountry}`);
    const vega = scoreLine("Vega Sicilia Único 2011");
    assert(vega.detectedProducer === "vega sicilia" && vega.detectedCountry === "spain",
      `Vega Sicilia: ${vega.detectedProducer} / ${vega.detectedCountry}`);
    const jordan = scoreLine("Jordan Cabernet Sauvignon 2018");
    assert(jordan.detectedProducer === "jordan" && jordan.detectedCountry === "us",
      `uncontested Jordan: ${jordan.detectedProducer} / ${jordan.detectedCountry}`);
  });

  test("Real engine: a region name two countries share contradicts neither (Chile's Central Valley)", () => {
    const s = scoreLine("Miguel Torres Santa Digna Cabernet Sauvignon, Central Valley 2020");
    assert(s.detectedProducer === "miguel torres" && s.detectedCountry === "chile",
      `Central Valley: ${s.detectedProducer} / ${s.detectedCountry}`);
  });

  test("Real engine: core-name guardrails hold", () => {
    const brunello = scoreLine("Brunello di Montalcino, Biondi-Santi 2015");
    assert(brunello.detectedProducer !== "cantina di montalcino", `Brunello producer: ${brunello.detectedProducer}`);
    const cielo = scoreLine("Cielo Alto Malbec 2020");
    assert(cielo.detectedProducer !== "finca casa lo alto", `Cielo Alto producer: ${cielo.detectedProducer}`);
    const dryCreek = scoreLine("Zinfandel, Dry Creek Valley 2019");
    assert(dryCreek.detectedProducer !== "dry creek vineyard", `Dry Creek producer: ${dryCreek.detectedProducer}`);
    const meyer = scoreLine("Meyer Family Pinot Noir 2019");
    assert(meyer.detectedProducer === null && meyer.detectedCountry === null,
      `Meyer Family: ${meyer.detectedProducer} / ${meyer.detectedCountry}`);
    const cruz = scoreLine("Hacienda de la Cruz Tempranillo 2019");
    assert(cruz.detectedProducer !== "casa de la cruz" && cruz.detectedCountry !== "us",
      `de la Cruz: ${cruz.detectedProducer} / ${cruz.detectedCountry}`);
    const mauro = scoreLine("San Mauro Albariño 2021");
    assert(mauro.detectedProducer === null && mauro.detectedCountry === null,
      `San Mauro: ${mauro.detectedProducer} / ${mauro.detectedCountry}`);
  });

  test("Real engine: a loved estate is recognized under its core name", () => {
    // The estate boost keys on the producer's full name; the menu writes the core
    const dna = { ...NO_DNA, estates: { hemel_en_aarde_walker_bay: ["newton_johnson_vineyards"] } };
    const s = scoreLine("Newton Johnson Chardonnay, Hemel-en-Aarde 2023", dna);
    assert(s.matchReasons.some((r) => r.type === "estate"), `reasons: ${s.matchReasons.map((r) => r.type)}`);
  });

  test("Real engine: feedback rated under the full estate name reaches its core-name menu form", () => {
    const feedback = engine.buildFeedbackSignals([
      { wine_name: "Newton Johnson Vineyards Chardonnay 2021", rating: "loved", interaction_type: "had" },
    ]);
    const s = scoreLine("Newton Johnson Pinot Noir, Walker Bay 2022", NO_DNA, feedback);
    assert(s.matchReasons.some((r) => r.type === "feedback_boost" && /producer/.test(r.label)),
      `reasons: ${s.matchReasons.map((r) => r.type + ":" + r.label)}`);
  });
}

realModuleTests()
  .catch((err) => { failed++; console.error("Real-module suite crashed:", err); })
  .then(() => {
    console.log(`\nTotal: ${passed}/${passed + failed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
  });
