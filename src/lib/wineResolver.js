// wineResolver.js — Wine Metadata Resolver
// Fuzzy-matches logged wine names against the 130k WineMag dataset
// to extract structured metadata (winery, varietal, region, country)
// Runs entirely client-side using wineReference-lookup.json

import lookupData from "./wineReference-lookup.json";
import { COUNTRIES as DNA_COUNTRIES, REGIONS as DNA_REGIONS, VARIETALS as DNA_VARIETALS, ESTATES as DNA_ESTATES } from "./wineData";


// ═══════════════════════════════════════════════════════
// MAPPING TABLES (mirrored from matchEngine.js)
// ═══════════════════════════════════════════════════════

const COUNTRY_TO_DNA = {
  "France": "france", "Italy": "italy", "Spain": "spain", "Portugal": "portugal",
  "Germany": "germany", "Austria": "austria", "US": "usa",
  "Argentina": "argentina", "Chile": "chile", "Australia": "australia",
  "New Zealand": "new_zealand", "South Africa": "south_africa",
};

const PROVINCE_TO_DNA_REGION = {
  "Bordeaux": "bordeaux", "Burgundy": "burgundy", "Champagne": "champagne",
  "Alsace": "alsace", "Provence": "provence",
  "Languedoc-Roussillon": "languedoc", "South of France": "languedoc",
  "Loire Valley": "loire", "Rhône Valley": "rhone",
  "Beaujolais": "beaujolais", "Southwest France": "southwest_france",
  "Tuscany": "tuscany", "Piedmont": "piedmont", "Veneto": "veneto",
  "Sicily & Sardinia": "sicily", "Southern Italy": "puglia", "Puglia": "puglia",
  "Northeastern Italy": "trentino", "Campania": "campania",
  "Northern Spain": "rioja", "Catalonia": "penedes",
  "Stellenbosch": "stellenbosch", "Simonsberg-Stellenbosch": "stellenbosch", "Coastal Region": "stellenbosch",
  "Constantia": "constantia", "Franschhoek": "franschhoek",
  "Swartland": "swartland", "Walker Bay": "walker_bay", "Paarl": "paarl",
  "Mendoza Province": "mendoza",
  "Maipo Valley": "maipo", "Colchagua Valley": "colchagua",
  "Casablanca Valley": "casablanca", "Aconcagua": "aconcagua",
  "South Australia": "barossa", "Western Australia": "margaret_river", "New South Wales": "hunter",
  "Marlborough": "marlborough", "Central Otago": "central_otago", "Hawke's Bay": "hawkes_bay",
  "Douro": "douro", "Alentejo": "alentejo", "Dão": "dao", "Vinho Verde": "vinho_verde",
  "Mosel": "mosel", "Rheingau": "rheingau", "Pfalz": "pfalz", "Rheinhessen": "rheinhessen",
  "Baden": "baden",
  "Niederösterreich": "kamptal", "Burgenland": "burgenland",
  "California": "napa", "Oregon": "willamette", "Washington": "walla_walla",
  "New York": "finger_lakes", "Virginia": "virginia",
};

const SUBREGION_TO_DNA_REGION = {
  "napa valley": "napa", "napa": "napa", "oakville": "napa", "rutherford": "napa",
  "stags leap district": "napa", "howell mountain": "napa", "spring mountain district": "napa",
  "calistoga": "napa", "atlas peak": "napa", "mount veeder": "napa", "st. helena": "napa",
  "sonoma valley": "sonoma", "russian river valley": "sonoma", "dry creek valley": "sonoma",
  "alexander valley": "sonoma", "sonoma coast": "sonoma", "sonoma mountain": "sonoma",
  "willamette valley": "willamette", "dundee hills": "willamette", "eola-amity hills": "willamette",
  "ribbon ridge": "willamette", "chehalem mountains": "willamette",
  "paso robles": "paso_robles", "paso robles estrella district": "paso_robles",
  "santa barbara county": "santa_barbara", "santa ynez valley": "santa_barbara",
  "sta. rita hills": "santa_barbara", "santa rita hills": "santa_barbara",
  "santa maria valley": "santa_barbara", "happy canyon of santa barbara": "santa_barbara",
  "finger lakes": "finger_lakes", "walla walla valley": "walla_walla",
  "columbia valley": "walla_walla",
  "morgon": "beaujolais", "fleurie": "beaujolais", "moulin-à-vent": "beaujolais",
  "brouilly": "beaujolais", "juliénas": "beaujolais", "chiroubles": "beaujolais",
  "beaujolais-villages": "beaujolais", "saint-amour": "beaujolais",
  "côte de brouilly": "beaujolais", "régnié": "beaujolais", "chénas": "beaujolais",
  "cahors": "southwest_france", "madiran": "southwest_france", "gaillac": "southwest_france",
  "jurançon": "southwest_france", "bergerac": "southwest_france", "irouléguy": "southwest_france",
  "côte-rôtie": "rhone", "hermitage": "rhone", "châteauneuf-du-pape": "rhone",
  "chateauneuf-du-pape": "rhone", "gigondas": "rhone", "cornas": "rhone",
  "saint-joseph": "rhone", "crozes-hermitage": "rhone", "condrieu": "rhone",
  "vacqueyras": "rhone", "côtes du rhône": "rhone",
  "sancerre": "loire", "pouilly-fumé": "loire", "vouvray": "loire",
  "muscadet sèvre et maine": "loire", "chinon": "loire", "bourgueil": "loire",
  "savennières": "loire", "anjou": "loire", "saumur": "loire",
  "bandol": "provence", "côtes de provence": "provence",
  "rioja": "rioja", "ribera del duero": "ribera", "priorat": "priorat",
  "rías baixas": "rias_baixas", "jerez": "jerez", "rueda": "rueda", "penedès": "penedes",
  "barossa valley": "barossa", "eden valley": "barossa",
  "mclaren vale": "mclaren", "yarra valley": "yarra",
  "margaret river": "margaret_river", "hunter valley": "hunter", "coonawarra": "coonawarra",
  "uco valley": "mendoza", "luján de cuyo": "mendoza",
  "cafayate": "salta", "salta": "salta",
  "wachau": "wachau", "kamptal": "kamptal", "kremstal": "kamptal",
};

// WineMag varietal names → DNA varietal IDs
const VARIETY_TO_DNA = {};
const VARIETY_NAME_MAP = {
  cabernet_sauvignon: ["Cabernet Sauvignon"],
  merlot: ["Merlot"],
  pinot_noir: ["Pinot Noir", "Pinot Nero"],
  syrah: ["Syrah", "Shiraz"],
  malbec: ["Malbec"],
  tempranillo: ["Tempranillo", "Tinta de Toro", "Tinto Fino"],
  sangiovese: ["Sangiovese", "Sangiovese Grosso", "Prugnolo Gentile", "Brunello"],
  nebbiolo: ["Nebbiolo"],
  grenache: ["Grenache", "Garnacha"],
  zinfandel: ["Zinfandel"],
  pinotage: ["Pinotage"],
  mourvedre: ["Mourvèdre", "Monastrell"],
  cabernet_franc: ["Cabernet Franc"],
  petit_verdot: ["Petit Verdot"],
  chardonnay: ["Chardonnay"],
  sauvignon_blanc: ["Sauvignon Blanc", "Sauvignon"],
  riesling: ["Riesling"],
  pinot_grigio: ["Pinot Grigio", "Pinot Gris"],
  chenin_blanc: ["Chenin Blanc"],
  viognier: ["Viognier"],
  gruner_veltliner: ["Grüner Veltliner"],
  albarino: ["Albariño"],
  gewurztraminer: ["Gewürztraminer"],
  semillon: ["Sémillon", "Semillon"],
  muscadet: ["Muscadet", "Melon"],
  vermentino: ["Vermentino"],
};
for (const [dnaId, wmNames] of Object.entries(VARIETY_NAME_MAP)) {
  for (const n of wmNames) VARIETY_TO_DNA[n] = dnaId;
}

// Reverse map: DNA varietal ID → canonical display name
const DNA_TO_VARIETY_NAME = {};
for (const [dnaId, wmNames] of Object.entries(VARIETY_NAME_MAP)) {
  DNA_TO_VARIETY_NAME[dnaId] = wmNames[0]; // First entry is the canonical name
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

  // From the WineMag 2,000 producers
  for (const [name, data] of Object.entries(lookupData.producers)) {
    const norm = normalize(name);
    if (norm.length < 3) continue;
    _producerIndex.push({
      name,          // Original display name
      norm,          // Normalized for matching
      tokens: new Set(tokenize(name)),
      country: data.country,
      province: data.province || "",
      dnaCountryId: COUNTRY_TO_DNA[data.country] || null,
      dnaRegionId: PROVINCE_TO_DNA_REGION[data.province] || SUBREGION_TO_DNA_REGION[(data.province || "").toLowerCase()] || null,
    });
  }

  // Also include DNA estates — merge dnaEstateId into existing WineMag entries
  for (const [regionId, estates] of Object.entries(DNA_ESTATES)) {
    for (const estate of estates) {
      const norm = normalize(estate.name);
      const existing = _producerIndex.find(p => p.norm === norm);
      if (existing) {
        // Producer exists in WineMag — enrich with DNA estate ID
        existing.dnaEstateId = estate.id;
        if (!existing.dnaRegionId) existing.dnaRegionId = regionId;
        continue;
      }
      // Find the country for this region
      let countryId = null;
      for (const [cId, regions] of Object.entries(DNA_REGIONS)) {
        if (regions.some(r => r.id === regionId)) { countryId = cId; break; }
      }
      const countryObj = countryId ? DNA_COUNTRIES.find(c => c.id === countryId) : null;
      _producerIndex.push({
        name: estate.name,
        norm,
        tokens: new Set(tokenize(estate.name)),
        country: countryObj ? countryObj.name : "",
        province: "",
        dnaCountryId: countryId,
        dnaRegionId: regionId,
        dnaEstateId: estate.id, // Direct estate ID from wineData
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
  for (const [name, data] of Object.entries(lookupData.varieties)) {
    const norm = normalize(name);
    if (norm.length < 3) continue;
    _varietalIndex.push({
      name,       // e.g., "Syrah"
      norm,
      color: data.color,
      dnaId: VARIETY_TO_DNA[name] || null,
      count: data.count || 0,
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
  for (const [key, data] of Object.entries(lookupData.regionLookup)) {
    if (key.length < 4 || ["other", "america", "europe"].includes(key)) continue;
    _regionIndex.push({
      term: key,
      country: data.country,
      province: data.province || "",
      subregion: data.subregion || "",
      dnaCountryId: COUNTRY_TO_DNA[data.country] || null,
      dnaRegionId: SUBREGION_TO_DNA_REGION[key] || PROVINCE_TO_DNA_REGION[data.province] || null,
      count: data.count || 0,
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

// Re-export mapping utilities needed by dnaEvolution.js
export { COUNTRY_TO_DNA, PROVINCE_TO_DNA_REGION, SUBREGION_TO_DNA_REGION, VARIETY_TO_DNA, VARIETY_NAME_MAP, DNA_TO_VARIETY_NAME };

/**
 * Find the country ID that contains a given region ID.
 * Used by the promotion engine to key estates/regions by country.
 */
export function findCountryForRegion(dnaRegionId) {
  for (const [countryId, regions] of Object.entries(DNA_REGIONS)) {
    if (regions.some(r => r.id === dnaRegionId)) return countryId;
  }
  return null;
}

/**
 * Check if a DNA varietal ID exists in wineData.js
 */
export function isValidDnaVarietal(dnaVarietalId) {
  return DNA_VARIETALS.some(v => v.id === dnaVarietalId);
}

/**
 * Check if a DNA region ID exists in wineData.js
 */
export function isValidDnaRegion(dnaRegionId) {
  for (const regions of Object.values(DNA_REGIONS)) {
    if (regions.some(r => r.id === dnaRegionId)) return true;
  }
  return false;
}

/**
 * Check if a DNA country ID exists in wineData.js
 */
export function isValidDnaCountry(dnaCountryId) {
  return DNA_COUNTRIES.some(c => c.id === dnaCountryId);
}

/**
 * Get display name for a DNA region ID
 */
export function getRegionDisplayName(dnaRegionId) {
  for (const regions of Object.values(DNA_REGIONS)) {
    const found = regions.find(r => r.id === dnaRegionId);
    if (found) return found.name;
  }
  return dnaRegionId;
}

/**
 * Get display name for a DNA country ID
 */
export function getCountryDisplayName(dnaCountryId) {
  const found = DNA_COUNTRIES.find(c => c.id === dnaCountryId);
  return found ? found.name : dnaCountryId;
}
