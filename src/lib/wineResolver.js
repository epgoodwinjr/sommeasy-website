// wineResolver.js — Wine Metadata Resolver
// Fuzzy-matches logged wine names against the 130k WineMag dataset
// to extract structured metadata (winery, varietal, region, country)
// Runs entirely client-side using wineUnified.json

import wineUnified from "./wineUnified.json";

const COUNTRIES = wineUnified.countries;
const REGIONS = wineUnified.regions;
const PRODUCERS = wineUnified.producers;
const VARIETALS = wineUnified.varietals;
const REGION_LOOKUP = wineUnified.regionLookup;
const PRODUCER_LOOKUP = wineUnified.producerLookup;
const VARIETAL_LOOKUP = wineUnified.varietalLookup;


// ═══════════════════════════════════════════════════════
// VARIETAL MAPPING (built from VARIETALS + VARIETAL_LOOKUP)
// ═══════════════════════════════════════════════════════

// WineMag varietal names → DNA varietal IDs
const VARIETY_TO_DNA = {};

// Map each varietal's canonical name to its ID
for (const v of VARIETALS) {
  VARIETY_TO_DNA[v.name] = v.id;
}

// Map each synonym to the canonical ID
for (const [synonym, canonicalId] of Object.entries(VARIETAL_LOOKUP)) {
  // Capitalize the synonym for display-name matching
  const displaySynonym = synonym.charAt(0).toUpperCase() + synonym.slice(1);
  VARIETY_TO_DNA[displaySynonym] = canonicalId;
}

// Reverse map: DNA varietal ID → canonical display name
const DNA_TO_VARIETY_NAME = {};
for (const v of VARIETALS) {
  DNA_TO_VARIETY_NAME[v.id] = v.name;
}


// ═══════════════════════════════════════════════════════
// NORMALIZATION
// ═══════════════════════════════════════════════════════

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[''`]/g, "'")        // normalize quotes
    .replace(/\b(19|20)\d{2}\b/g, "")  // strip vintage years
    .replace(/\b(estate|vineyard|vineyards|winery|wines|wine|cellars|cellar|cuvee|domaine|chateau|château|bodega|tenuta|casa|cantina|fattoria|azienda|maison)\b/gi, "")
    .replace(/[^a-z0-9\s'.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Boundary-aware containment over normalized text (charset [a-z0-9\s'.-]).
 * Single-token needles must sit on word boundaries — a producer normalized
 * to "cass" or "rozes" must not match inside "cassis" or "crozes-hermitage".
 * A possessive never counts as a mention: "X's <site>" names a vineyard
 * after a person (Kumeu River "Maté's Vineyard" is not the Tuscan producer
 * "Máté"), so the apostrophe bounds quoted names but not 's. Missing a
 * possessive producer only lowers confidence; a false hit overrides the
 * wine's country and poisons DNA accumulation.
 * Multi-word/hyphenated needles keep plain substring semantics.
 */
function containsTerm(haystack, needle) {
  if (needle.includes(" ") || needle.includes("-")) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s'.])${escaped}(?!'s(?:[\\s'.]|$))(?:[\\s'.]|$)`).test(haystack);
}

function tokenize(text) {
  return normalize(text).split(/\s+/).filter(t => t.length >= 2);
}


// ═══════════════════════════════════════════════════════
// BLEND DETECTION
// ═══════════════════════════════════════════════════════

const BLEND_PATTERNS = [
  /\bred\s+blend\b/i,
  /\bwhite\s+blend\b/i,
  /\bbordeaux.style\b/i,
  /\brhone.style\b/i,
  /\bgms\b/i,  // Grenache-Mourvèdre-Syrah
  /\bmeritage\b/i,
];

function isBlend(varietalName) {
  if (!varietalName) return false;
  // Contains hyphen between grape names (e.g., "Cabernet Sauvignon-Merlot")
  if (/-/.test(varietalName) && /[A-Z].*-.*[A-Z]/.test(varietalName)) return true;
  for (const pat of BLEND_PATTERNS) {
    if (pat.test(varietalName)) return true;
  }
  return false;
}


// ═══════════════════════════════════════════════════════
// PRODUCER INDEX (built once, sorted by name length desc)
// ═══════════════════════════════════════════════════════

let _producerIndex = null;

function getProducerIndex() {
  if (_producerIndex) return _producerIndex;

  _producerIndex = [];

  // From PRODUCER_LOOKUP (keyed by lowercase name)
  for (const [name, data] of Object.entries(PRODUCER_LOOKUP)) {
    const norm = normalize(name);
    if (norm.length < 3) continue;
    // Display name: use the original key with first-letter capitalization
    const displayName = name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    _producerIndex.push({
      name: displayName,
      norm,
      tokens: new Set(tokenize(name)),
      country: getCountryDisplayName(data.country), // display name; the DNA id lives in dnaCountryId
      province: data.province || "",
      dnaCountryId: data.country,      // Direct — already a DNA country ID
      dnaRegionId: data.regionId || null, // Direct — already a DNA region ID
    });
  }

  // Also include producers from PRODUCERS (keyed by regionId) —
  // merge dnaEstateId into existing WineMag entries instead of skipping them
  for (const [regionId, producers] of Object.entries(PRODUCERS)) {
    for (const producer of producers) {
      const norm = normalize(producer.name);
      const existing = _producerIndex.find(p => p.norm === norm);
      if (existing) {
        // Producer exists in WineMag — enrich with DNA estate ID
        existing.dnaEstateId = producer.id;
        if (!existing.dnaRegionId) existing.dnaRegionId = regionId;
        continue;
      }
      // Find the country for this region
      let countryId = null;
      for (const [cId, regionList] of Object.entries(REGIONS)) {
        if (regionList.some(r => r.id === regionId)) { countryId = cId; break; }
      }
      const countryObj = countryId ? COUNTRIES.find(c => c.id === countryId) : null;
      _producerIndex.push({
        name: producer.name,
        norm,
        tokens: new Set(tokenize(producer.name)),
        country: countryObj ? countryObj.name : "",
        province: "",
        dnaCountryId: countryId,
        dnaRegionId: regionId,
        dnaEstateId: producer.id,
      });
    }
  }

  // Sort by normalized name length descending (longer matches first)
  _producerIndex.sort((a, b) => b.norm.length - a.norm.length);

  return _producerIndex;
}


// ═══════════════════════════════════════════════════════
// VARIETAL INDEX (built once)
// ═══════════════════════════════════════════════════════

let _varietalIndex = null;

function getVarietalIndex() {
  if (_varietalIndex) return _varietalIndex;

  _varietalIndex = [];
  const seen = new Set();

  // Combined names ("Syrah / Shiraz") can never substring-match a wine name —
  // index each alias separately, all pointing at the canonical DNA id
  for (const v of VARIETALS) {
    for (const alias of v.name.split("/")) {
      const norm = normalize(alias);
      if (norm.length < 3 || seen.has(norm)) continue;
      seen.add(norm);
      _varietalIndex.push({
        name: alias.trim(),
        norm,
        color: v.color,
        dnaId: v.id,
        count: v.reviewCount || 0,
      });
    }
  }

  // Synonyms from VARIETAL_LOOKUP (e.g. "garnacha" → grenache) must also be
  // matchable, not just translatable
  for (const [synonym, canonicalId] of Object.entries(VARIETAL_LOOKUP)) {
    const norm = normalize(synonym);
    if (norm.length < 3 || seen.has(norm)) continue;
    seen.add(norm);
    const canonical = VARIETALS.find(v => v.id === canonicalId);
    _varietalIndex.push({
      name: canonical ? canonical.name.split("/")[0].trim() : synonym,
      norm,
      color: canonical ? canonical.color : null,
      dnaId: canonicalId,
      count: canonical ? canonical.reviewCount || 0 : 0,
    });
  }

  // Sort by name length descending (match "Cabernet Sauvignon" before "Sauvignon")
  _varietalIndex.sort((a, b) => b.norm.length - a.norm.length);

  return _varietalIndex;
}


// ═══════════════════════════════════════════════════════
// REGION INDEX (built once)
// ═══════════════════════════════════════════════════════

let _regionIndex = null;

function getRegionIndex() {
  if (_regionIndex) return _regionIndex;

  _regionIndex = [];
  for (const [key, data] of Object.entries(REGION_LOOKUP)) {
    if (key.length < 4 || ["other", "america", "europe"].includes(key)) continue;
    _regionIndex.push({
      term: key,
      country: getCountryDisplayName(data.country), // display name; the DNA id lives in dnaCountryId
      province: "",
      subregion: "",
      dnaCountryId: data.country,      // Direct — already a DNA country ID
      dnaRegionId: data.regionId || null, // Direct — already a DNA region ID
      count: 0,
    });
  }

  _regionIndex.sort((a, b) => b.term.length - a.term.length);

  return _regionIndex;
}


// ═══════════════════════════════════════════════════════
// COUNTRY TERMS (explicit-geography conflict guard)
// ═══════════════════════════════════════════════════════

let _countryTermIndex = null;

function getCountryTermIndex() {
  if (_countryTermIndex) return _countryTermIndex;
  // Country display names as normalized terms ("new zealand", "france").
  // "US" normalizes to 2 chars and is dropped — US wines flag conflicts
  // through their regions instead (regionLookup rows carry the country).
  _countryTermIndex = COUNTRIES
    .map(c => ({ id: c.id, norm: normalize(c.name) }))
    .filter(c => c.norm.length >= 4);
  return _countryTermIndex;
}

/**
 * Countries the wine name mentions explicitly ("...Marlborough, New Zealand").
 * Used ONLY as a conflict guard against producer-derived geography — never
 * as an attribution source on its own.
 */
function detectExplicitCountries(normInput) {
  const ids = new Set();
  for (const c of getCountryTermIndex()) {
    if (containsTerm(normInput, c.norm)) ids.add(c.id);
  }
  return ids;
}


// ═══════════════════════════════════════════════════════
// MATCHING ENGINE
// ═══════════════════════════════════════════════════════

/**
 * Calculate token overlap score between two token sets.
 * Returns a ratio (0-1) based on how many input tokens appear in the candidate.
 */
function tokenOverlap(inputTokens, candidateTokens) {
  if (inputTokens.length === 0 || candidateTokens.size === 0) return 0;
  let matches = 0;
  for (const t of inputTokens) {
    if (candidateTokens.has(t)) matches++;
    // Also check partial matches (input token starts with candidate or vice versa)
    else {
      for (const ct of candidateTokens) {
        if ((t.length >= 4 && ct.startsWith(t)) || (ct.length >= 4 && t.startsWith(ct))) {
          matches += 0.7;
          break;
        }
      }
    }
  }
  return matches / Math.max(inputTokens.length, candidateTokens.size);
}

/**
 * Find the best matching producer for a wine name.
 * Returns { producer, score } or null.
 */
function matchProducer(normInput, inputTokens) {
  const producers = getProducerIndex();
  let bestMatch = null;
  let bestScore = 0;

  for (const prod of producers) {
    let score = 0;

    // Strategy 1: Boundary-aware substring match (strongest signal)
    if (prod.norm.length >= 4 && containsTerm(normInput, prod.norm)) {
      // Score based on what fraction of the input the producer name covers
      const coverage = prod.norm.length / normInput.length;
      score = 0.5 + (coverage * 0.5); // 0.5–1.0 range
    }
    // Strategy 2: Token overlap
    else {
      const overlap = tokenOverlap(inputTokens, prod.tokens);
      if (overlap >= 0.4) {
        score = overlap * 0.7; // Cap at 0.7 for token-only matches
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = prod;
    }

    // Perfect match, stop searching
    if (bestScore >= 0.95) break;
  }

  // Minimum threshold to count as a producer match
  if (bestScore < 0.3) return null;
  return { producer: bestMatch, score: bestScore };
}

/**
 * Find varietal mentioned in the wine name.
 * Returns the varietal entry or null.
 */
function matchVarietal(normInput) {
  const varietals = getVarietalIndex();
  for (const v of varietals) {
    if (v.norm.length >= 4 && normInput.includes(v.norm)) {
      return v;
    }
  }
  return null;
}

/**
 * Find region mentioned in the wine name.
 * Returns the region entry or null.
 */
function matchRegion(normInput) {
  const regions = getRegionIndex();
  for (const r of regions) {
    if (r.term.length >= 4 && normInput.includes(r.term)) {
      return r;
    }
  }
  return null;
}


// ═══════════════════════════════════════════════════════
// CONFIDENCE SCORING
// ═══════════════════════════════════════════════════════

/**
 * Calculate confidence score (0-100) based on what was resolved.
 *
 * 90-100: Strong winery match + region AND varietal confirmed
 * 80-89:  Producer match + at least one corroborating field (region or varietal)
 * 60-79:  Producer match alone, or region+varietal without producer —
 *         accumulates PARTIAL credit (varietal/region/country, never estate)
 * Below PARTIAL_CONFIDENCE_GATE (60, dnaThresholds.js): no accumulation
 *
 * countryConflict (the name explicitly places the wine in a country the
 * producer doesn't belong to) caps the result at 55. The cap sitting below
 * PARTIAL_CONFIDENCE_GATE (60) — not merely CONFIDENCE_GATE (80) — is
 * load-bearing: the partial band still writes region/country points, and
 * producer-derived region/country are exactly the dimensions a geography
 * conflict disputes. A disputed match must accumulate nothing.
 * Guarded by dnaEvolution Suite 10H and the countryAttribution real-module
 * conflict test.
 */
function calculateConfidence(producerResult, varietalMatch, regionMatch, inputTokenCount, countryConflict) {
  let confidence = 0;
  const corroborations = (varietalMatch ? 1 : 0) + (regionMatch ? 1 : 0);

  if (producerResult) {
    const { score } = producerResult;

    if (score >= 0.8) {
      // Strong producer match (high coverage of input)
      confidence = 85;
      if (varietalMatch) confidence += 5;
      if (regionMatch) confidence += 5;
    } else if (score >= 0.5) {
      // Medium producer match — the producer name was found as substring
      // but covers less of the input (typical for "Krug Grande Cuvée" or
      // "Henschke Hill of Grace 2018" where the wine/vineyard name is longer)
      // Count the producer's own province data as inherent corroboration —
      // the dataset itself confirms the geography for this producer.
      const effectiveCorroborations = corroborations + (producerResult.producer.province ? 1 : 0);
      if (effectiveCorroborations >= 2) {
        confidence = 90;
      } else if (effectiveCorroborations >= 1) {
        confidence = 82;
      } else {
        confidence = 68;
      }
    } else if (score >= 0.3) {
      // Weak producer match — token overlap only
      confidence = 50;
      if (varietalMatch) confidence += 10;
      if (regionMatch) confidence += 10;
    }
  } else {
    // No producer match — rely on region + varietal
    if (regionMatch && varietalMatch) {
      confidence = 60;
    } else if (regionMatch) {
      confidence = 40;
    } else if (varietalMatch) {
      confidence = 30;
    }
  }

  if (countryConflict) {
    confidence = Math.min(confidence, 55);
  }

  return Math.min(confidence, 100);
}


// ═══════════════════════════════════════════════════════
// DNA ID MAPPING
// ═══════════════════════════════════════════════════════

/**
 * Map resolved WineMag metadata to DNA profile IDs.
 * Returns { dnaCountryId, dnaRegionId, dnaVarietalId, dnaEstateId, mappable }
 */
function mapToDnaIds(producerResult, varietalMatch, regionMatch) {
  const mapping = {
    dnaCountryId: null,
    dnaRegionId: null,
    dnaVarietalId: null,
    dnaEstateId: null,
    countryMappable: true,
    regionMappable: true,
    varietalMappable: true,
    estateMappable: true,
  };

  // Country — from producer or region
  if (producerResult) {
    mapping.dnaCountryId = producerResult.producer.dnaCountryId;
  }
  if (!mapping.dnaCountryId && regionMatch) {
    mapping.dnaCountryId = regionMatch.dnaCountryId;
  }
  if (!mapping.dnaCountryId) {
    mapping.countryMappable = false;
  }

  // Region — from producer (via province) or direct region match
  if (producerResult && producerResult.producer.dnaRegionId) {
    mapping.dnaRegionId = producerResult.producer.dnaRegionId;
  }
  if (!mapping.dnaRegionId && regionMatch && regionMatch.dnaRegionId) {
    mapping.dnaRegionId = regionMatch.dnaRegionId;
  }
  if (!mapping.dnaRegionId) {
    mapping.regionMappable = false;
  }

  // Varietal
  if (varietalMatch && varietalMatch.dnaId) {
    mapping.dnaVarietalId = varietalMatch.dnaId;
  } else if (varietalMatch) {
    mapping.varietalMappable = false;
  }

  // Estate — only if the producer is in the DNA estates list
  if (producerResult && producerResult.producer.dnaEstateId) {
    mapping.dnaEstateId = producerResult.producer.dnaEstateId;
  } else if (producerResult) {
    // Producer found in WineMag but not in DNA estates — not mappable as estate
    mapping.estateMappable = false;
  }

  return mapping;
}


// ═══════════════════════════════════════════════════════
// MAIN RESOLVER
// ═══════════════════════════════════════════════════════

/**
 * Resolve a wine name against the WineMag dataset.
 *
 * @param {string} wineName - The wine name as entered by the user
 * @returns {object} Resolution result with metadata and confidence
 *
 * Output shape:
 * {
 *   winery: string|null,         // Matched producer display name
 *   varietal: string|null,       // Matched varietal display name
 *   region: string|null,         // Specific region (subregion or province)
 *   province: string|null,       // Broader region (WineMag province)
 *   country: string|null,        // Country name
 *   confidence: number,          // 0-100
 *   isBlend: boolean,            // Whether the varietal is a blend
 *   dnaMapping: object,          // Mapped DNA profile IDs
 * }
 */
export function resolveWine(wineName) {
  if (!wineName || wineName.trim().length < 3) {
    return { winery: null, varietal: null, region: null, province: null, country: null, confidence: 0, isBlend: false, dnaMapping: null };
  }

  const normInput = normalize(wineName);
  const inputTokens = tokenize(wineName);

  // Step 1: Match producer
  const producerResult = matchProducer(normInput, inputTokens);

  // Step 2: Match varietal in the wine name
  const varietalMatch = matchVarietal(normInput);

  // Step 3: Match region in the wine name
  const regionMatch = matchRegion(normInput);

  // Step 3.5: Explicit-geography conflict — the name places the wine in a
  // country the matched producer doesn't belong to. Every bug in the
  // country-misattribution class (Cassis→US, Gimonnet→Italy,
  // Crozes→Portugal, Maté's Vineyard→Italy) shared one shape: a fuzzy
  // producer hit silently outvoting what the menu line says outright.
  // The producer keeps its display fields, but confidence is capped below
  // PARTIAL_CONFIDENCE_GATE so a disputed match earns no DNA accumulation
  // at all — not even the partial band's region/country credit.
  let countryConflict = false;
  if (producerResult && producerResult.producer.dnaCountryId) {
    const explicit = detectExplicitCountries(normInput);
    if (regionMatch && regionMatch.dnaCountryId) explicit.add(regionMatch.dnaCountryId);
    countryConflict = explicit.size > 0 && !explicit.has(producerResult.producer.dnaCountryId);
  }

  // Step 4: Calculate confidence
  const confidence = calculateConfidence(producerResult, varietalMatch, regionMatch, inputTokens.length, countryConflict);

  // Step 5: Assemble result
  const winery = producerResult ? producerResult.producer.name : null;
  const varietal = varietalMatch ? varietalMatch.name : null;
  const blendDetected = isBlend(varietal);

  // Region: prefer the more specific source
  let region = null;
  let province = null;
  let country = null;

  if (producerResult) {
    province = producerResult.producer.province || null;
    country = producerResult.producer.country || null;
  }
  if (regionMatch) {
    region = regionMatch.subregion || regionMatch.province || regionMatch.term;
    if (!province) province = regionMatch.province || null;
    if (!country) country = regionMatch.country || null;
  }
  if (!region && province) {
    region = province;
  }

  // Step 6: Map to DNA IDs
  const dnaMapping = mapToDnaIds(producerResult, varietalMatch, regionMatch);

  return {
    winery,
    varietal,
    region,
    province,
    country,
    confidence,
    isBlend: blendDetected,
    dnaMapping,
  };
}


// ═══════════════════════════════════════════════════════
// EXPORTS FOR DNA EVOLUTION ENGINE
// ═══════════════════════════════════════════════════════

export { VARIETY_TO_DNA, DNA_TO_VARIETY_NAME };

/**
 * Find the country ID that contains a given region ID.
 * Used by the promotion engine to key estates/regions by country.
 */
export function findCountryForRegion(dnaRegionId) {
  for (const [countryId, regionList] of Object.entries(REGIONS)) {
    if (regionList.some(r => r.id === dnaRegionId)) return countryId;
  }
  return null;
}

/**
 * Check if a DNA varietal ID exists in wineUnified.json
 */
export function isValidDnaVarietal(dnaVarietalId) {
  return VARIETALS.some(v => v.id === dnaVarietalId);
}

/**
 * Check if a DNA region ID exists in wineUnified.json
 */
export function isValidDnaRegion(dnaRegionId) {
  for (const regionList of Object.values(REGIONS)) {
    if (regionList.some(r => r.id === dnaRegionId)) return true;
  }
  return false;
}

/**
 * Check if a DNA country ID exists in wineUnified.json
 */
export function isValidDnaCountry(dnaCountryId) {
  return COUNTRIES.some(c => c.id === dnaCountryId);
}

/**
 * Get display name for a DNA region ID
 */
export function getRegionDisplayName(dnaRegionId) {
  for (const regionList of Object.values(REGIONS)) {
    const found = regionList.find(r => r.id === dnaRegionId);
    if (found) return found.name;
  }
  return dnaRegionId;
}

/**
 * Get display name for a DNA country ID
 */
export function getCountryDisplayName(dnaCountryId) {
  const found = COUNTRIES.find(c => c.id === dnaCountryId);
  return found ? found.name : dnaCountryId;
}
