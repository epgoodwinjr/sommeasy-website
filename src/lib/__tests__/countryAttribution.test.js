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
//
// Root cause: producer/varietal detection used raw substring includes()
// instead of word-boundary matching. Fixed July 2026 in matchEngine.js
// (detectWineAttributes + producer-term "&"/"et"/"and" aliases) and
// wineResolver.js (containsTerm boundary guard in matchProducer).
//
// The logic below MIRRORS matchEngine.js / wineResolver.js (both are ESM
// with bare JSON imports, so plain node can't load them — same pattern as
// dnaEvolution.test.js). If you change the matching logic in production,
// update the mirror here.

const wineUnified = require("../wineUnified.json");
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

function termMatchesInText(term, text) {
  if (term.length <= 2) return false;
  if (term.includes(" ") || term.includes("-")) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[\\s,;:()/\\-–—.'])${escaped}(?:[\\s,;:()/\\-–—.']|$)`, "i");
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
      if (term.length < 4 || idx.regionTerms.some(r => r.term === term)) continue;
      idx.regionTerms.push({ term, dnaRegionId: region.id, dnaCountryId: countryId });
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
  idx.producerTerms.sort((a, b) => b.term.length - a.term.length);

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

  for (const prod of SEARCH_INDEX.producerTerms) {
    if (prod.term.length < 4) continue;
    if (termMatchesInText(prod.term, text)) {
      producerTerms.add(prod.term);
      if (prod.dnaCountryId) countryIds.add(prod.dnaCountryId);
      claimed.add(prod.term);
      break;
    }
  }
  for (const reg of SEARCH_INDEX.regionTerms) {
    if (claimed.has(reg.term)) continue;
    if (termMatchesInText(reg.term, text)) {
      if (reg.dnaRegionId) regionIds.add(reg.dnaRegionId);
      if (reg.dnaCountryId) countryIds.add(reg.dnaCountryId);
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
  for (const c of SEARCH_INDEX.countryTerms) {
    if (c.term.length < 4) continue;
    if (termMatchesInText(c.term, text)) {
      if (c.dnaCountryId) countryIds.add(c.dnaCountryId);
      break;
    }
  }
  return { regionIds, countryIds, varietalIds, producerTerms, color };
}

// detectedCountry = first inserted country id (matchEngine scoring return shape)
function detectedCountry(wineName) {
  const attrs = detectWineAttributes(wineName);
  return attrs.countryIds.size > 0 ? Array.from(attrs.countryIds)[0] : null;
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

function containsTerm(haystack, needle) {
  if (needle.includes(" ") || needle.includes("-")) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s'.])${escaped}(?:[\\s'.]|$)`).test(haystack);
}

const producerIndex = [];
for (const [name, data] of Object.entries(PRODUCER_LOOKUP)) {
  const norm = normalize(name);
  if (norm.length < 3) continue;
  producerIndex.push({
    name, norm, tokens: new Set(tokenize(name)),
    dnaCountryId: data.country, dnaRegionId: data.regionId || null,
  });
}
for (const [regionId, estates] of Object.entries(ESTATES)) {
  for (const estate of estates) {
    const norm = normalize(estate.name);
    if (producerIndex.some(p => p.norm === norm)) continue;
    producerIndex.push({ name: estate.name, norm, tokens: new Set(tokenize(estate.name)), dnaCountryId: null, dnaRegionId: regionId });
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
    if (prod.norm.length >= 4 && containsTerm(normInput, prod.norm)) {
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

console.log(`\nTotal: ${passed}/${passed + failed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
