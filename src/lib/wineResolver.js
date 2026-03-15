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
    .replace(/\b(estate|vineyard|vineyards|winery|wines|wine|cellars|cellar|domaine|chateau|château|bodega|tenuta|casa|cantina|fattoria|azienda|maison)\b/gi, "")
    .replace(/[^a-z0-9\s'.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      country: data.country,
      province: data.province || "",
      dnaCountryId: data.country,      // Direct — already a DNA country ID
      dnaRegionId: data.regionId || null, // Direct — already a DNA region ID
    });
  }

  // Also include producers from PRODUCERS (keyed by regionId) not already in PRODUCER_LOOKUP
  for (const [regionId, producers] of Object.entries(PRODUCERS)) {
    for (const producer of producers) {
      const norm = normalize(producer.name);
      if (_producerIndex.some(p => p.norm === norm)) continue;
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
  for (const v of VARIETALS) {
    const norm = normalize(v.name);
    if (norm.length < 3) continue;
    _varietalIndex.push({
      name: v.name,
      norm,
      color: v.color,
      dnaId: v.id,
      count: v.reviewCount || 0,
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
      country: data.country,
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

    // Strategy 1: Exact substring match (strongest signal)
    if (normInput.includes(prod.norm) && prod.norm.length >= 4) {
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
 * 60-79:  Producer match alone, or region+varietal without producer
 * Below 60: Too uncertain to use for accumulation
 */
function calculateConfidence(producerResult, varietalMatch, regionMatch, inputTokenCount) {
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

  // Step 4: Calculate confidence
  const confidence = calculateConfidence(producerResult, varietalMatch, regionMatch, inputTokens.length);

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
