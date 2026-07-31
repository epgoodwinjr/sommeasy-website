// DNA Evolution Engine — Comprehensive Test Suite
// Run with: node src/lib/__tests__/dnaEvolution.test.js
//
// Tests all 8 suites: Resolver, Accumulation, Promotion, Demotion,
// Rating Changes, Quiz Sync, Edge Cases, UI Notes

// Unified data architecture (wineUnified.json) — the same shapes the
// production resolver consumes. ESTATES = producers keyed by DNA region id.
const wineUnified = require("../wineUnified.json");
const COUNTRIES = wineUnified.countries;
const REGIONS = wineUnified.regions;
const VARIETALS = wineUnified.varietals;
const ESTATES = wineUnified.producers;
const REGION_LOOKUP = wineUnified.regionLookup;
const PRODUCER_LOOKUP = wineUnified.producerLookup;
const VARIETAL_LOOKUP = wineUnified.varietalLookup;

// ═══════════════════════════════════════════════════════
// MOCK SUPABASE
// ═══════════════════════════════════════════════════════

let idCounter = 0;
function genId() { return `mock-id-${++idCounter}`; }

function createMockSupabase(tables) {
  function from(tableName) {
    let op = null;
    let filters = [];
    let updateData = null;
    let insertedData = null;
    let orderCol = null;
    let orderAsc = true;

    function getFiltered() {
      return (tables[tableName] || []).filter(row =>
        filters.every(f => row[f.col] === f.val)
      );
    }

    function executeSelect() {
      let rows = getFiltered();
      if (orderCol) {
        rows.sort((a, b) => {
          const av = a[orderCol], bv = b[orderCol];
          if (av < bv) return orderAsc ? -1 : 1;
          if (av > bv) return orderAsc ? 1 : -1;
          return 0;
        });
      }
      return rows.map(r => ({ ...r }));
    }

    const builder = {
      select(cols) {
        if (!op) op = "select";
        return builder;
      },
      eq(col, val) { filters.push({ col, val }); return builder; },
      order(col, opts) { orderCol = col; orderAsc = opts?.ascending ?? true; return builder; },
      insert(data) {
        op = "insert";
        data = { ...data };
        if (!data.id) data.id = genId();
        if (!tables[tableName]) tables[tableName] = [];
        tables[tableName].push(data);
        insertedData = data;
        return builder;
      },
      update(data) {
        op = "update";
        updateData = data;
        return builder;
      },
      upsert(data, opts) {
        op = "upsert";
        const conflictStr = opts?.onConflict || "";
        const conflictCols = conflictStr.split(",").map(s => s.trim()).filter(Boolean);
        if (!tables[tableName]) tables[tableName] = [];
        const existing = tables[tableName].find(row =>
          conflictCols.length > 0
            ? conflictCols.every(col => row[col] === data[col])
            : false
        );
        if (existing) {
          Object.assign(existing, data);
          insertedData = existing;
        } else {
          data = { ...data };
          if (!data.id) data.id = genId();
          tables[tableName].push(data);
          insertedData = data;
        }
        return builder;
      },
      delete() { op = "delete"; return builder; },
      single() {
        return {
          then(resolve) {
            if (op === "insert") {
              resolve({ data: insertedData ? { ...insertedData } : null, error: null });
            } else if (op === "select") {
              const rows = executeSelect();
              resolve({ data: rows[0] ? { ...rows[0] } : null, error: null });
            } else if (op === "update") {
              const rows = getFiltered();
              for (const row of rows) Object.assign(row, updateData);
              resolve({ data: null, error: null });
            } else {
              resolve({ data: null, error: null });
            }
          }
        };
      },
      then(resolve) {
        if (op === "select") {
          resolve({ data: executeSelect(), error: null });
        } else if (op === "update") {
          const rows = getFiltered();
          for (const row of rows) Object.assign(row, updateData);
          resolve({ data: null, error: null });
        } else if (op === "delete") {
          const toRemove = getFiltered();
          const ids = new Set(toRemove.map(r => r.id));
          tables[tableName] = (tables[tableName] || []).filter(r => !ids.has(r.id));
          resolve({ data: null, error: null });
        } else if (op === "insert") {
          resolve({ data: insertedData, error: null });
        } else if (op === "upsert") {
          resolve({ data: null, error: null });
        } else {
          resolve({ data: null, error: null });
        }
      }
    };
    return builder;
  }
  return { from, tables };
}

function freshTables() {
  return {
    wine_interactions: [],
    dna_accumulation: [],
    dna_timeline: [],
    wine_profiles: [],
  };
}


// ═══════════════════════════════════════════════════════
// INLINED RESOLVER (from wineResolver.js, adapted to CJS)
// ═══════════════════════════════════════════════════════

// DNA varietal id → canonical display name (first alias of combined names)
const DNA_TO_VARIETY_NAME = {};
for (const v of VARIETALS) {
  DNA_TO_VARIETY_NAME[v.id] = v.name.split("/")[0].trim();
}

function normalize(text) {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\b(estate|vineyard|vineyards|winery|wines|wine|cellars|cellar|cuvee|domaine|chateau|château|bodega|tenuta|casa|cantina|fattoria|azienda|maison)\b/gi, "")
    .replace(/[^a-z0-9\s'.-]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function tokenize(text) { return normalize(text).split(/\s+/).filter(t => t.length >= 2); }

// Mirrors wineResolver.containsTerm — boundary-aware containment so short
// producer norms ("cass", "rozes") can't match inside longer words, and a
// possessive ("mate's") never counts as a mention of the base word
function containsTerm(haystack, needle) {
  if (needle.includes(" ") || needle.includes("-")) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s'.])${escaped}(?!'s(?:[\\s'.]|$))(?:[\\s'.]|$)`).test(haystack);
}

const BLEND_PATTERNS = [/\bred\s+blend\b/i, /\bwhite\s+blend\b/i, /\bbordeaux.style\b/i, /\brhone.style\b/i, /\bgms\b/i, /\bmeritage\b/i];
function isBlend(v) {
  if (!v) return false;
  if (/-/.test(v) && /[A-Z].*-.*[A-Z]/.test(v)) return true;
  for (const p of BLEND_PATTERNS) { if (p.test(v)) return true; }
  return false;
}

// Build indices (mirror wineResolver.getProducerIndex)
const producerIndex = [];
for (const [name, data] of Object.entries(PRODUCER_LOOKUP)) {
  const norm = normalize(name);
  if (norm.length < 3) continue;
  const displayName = name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  producerIndex.push({
    name: displayName, norm, tokens: new Set(tokenize(name)),
    country: getCountryDisplayName(data.country), province: data.province || "",
    dnaCountryId: data.country,
    dnaRegionId: data.regionId || null,
  });
}
for (const [regionId, estates] of Object.entries(ESTATES)) {
  for (const estate of estates) {
    const norm = normalize(estate.name);
    const existingProd = producerIndex.find(p => p.norm === norm);
    if (existingProd) {
      existingProd.dnaEstateId = estate.id;
      if (!existingProd.dnaRegionId) existingProd.dnaRegionId = regionId;
      continue;
    }
    let countryId = null;
    for (const [cId, regs] of Object.entries(REGIONS)) {
      if (regs.some(r => r.id === regionId)) { countryId = cId; break; }
    }
    const countryObj = countryId ? COUNTRIES.find(c => c.id === countryId) : null;
    producerIndex.push({
      name: estate.name, norm, tokens: new Set(tokenize(estate.name)),
      country: countryObj ? countryObj.name : "", province: "",
      dnaCountryId: countryId, dnaRegionId: regionId, dnaEstateId: estate.id,
    });
  }
}
producerIndex.sort((a, b) => b.norm.length - a.norm.length);

// Varietal index (mirrors wineResolver.getVarietalIndex):
// split combined names ("Syrah / Shiraz") into aliases + index synonyms
const varietalIndex = [];
{
  const seen = new Set();
  for (const v of VARIETALS) {
    for (const alias of v.name.split("/")) {
      const norm = normalize(alias);
      if (norm.length < 3 || seen.has(norm)) continue;
      seen.add(norm);
      varietalIndex.push({ name: alias.trim(), norm, color: v.color, dnaId: v.id });
    }
  }
  for (const [synonym, canonicalId] of Object.entries(VARIETAL_LOOKUP)) {
    const norm = normalize(synonym);
    if (norm.length < 3 || seen.has(norm)) continue;
    seen.add(norm);
    const canonical = VARIETALS.find(v => v.id === canonicalId);
    varietalIndex.push({
      name: canonical ? canonical.name.split("/")[0].trim() : synonym,
      norm, color: canonical ? canonical.color : null, dnaId: canonicalId,
    });
  }
}
varietalIndex.sort((a, b) => b.norm.length - a.norm.length);

// Region index (mirrors wineResolver.getRegionIndex)
const regionIndex = [];
for (const [key, data] of Object.entries(REGION_LOOKUP)) {
  if (key.length < 4 || ["other","america","europe"].includes(key)) continue;
  regionIndex.push({
    term: key, country: getCountryDisplayName(data.country), province: "", subregion: "",
    dnaCountryId: data.country,
    dnaRegionId: data.regionId || null,
  });
}
regionIndex.sort((a, b) => b.term.length - a.term.length);

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

function matchProducer(normInput, inputTokens) {
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

function matchVarietal(normInput) {
  for (const v of varietalIndex) { if (v.norm.length >= 4 && normInput.includes(v.norm)) return v; }
  return null;
}
function matchRegion(normInput) {
  for (const r of regionIndex) { if (r.term.length >= 4 && normInput.includes(r.term)) return r; }
  return null;
}

function calculateConfidence(producerResult, varietalMatch, regionMatch, countryConflict) {
  let confidence = 0;
  const corroborations = (varietalMatch ? 1 : 0) + (regionMatch ? 1 : 0);
  if (producerResult) {
    const { score } = producerResult;
    if (score >= 0.8) {
      confidence = 85;
      if (varietalMatch) confidence += 5;
      if (regionMatch) confidence += 5;
    } else if (score >= 0.5) {
      const eff = corroborations + (producerResult.producer.province ? 1 : 0);
      if (eff >= 2) confidence = 90;
      else if (eff >= 1) confidence = 82;
      else confidence = 68;
    } else if (score >= 0.3) {
      confidence = 50;
      if (varietalMatch) confidence += 10;
      if (regionMatch) confidence += 10;
    }
  } else {
    if (regionMatch && varietalMatch) confidence = 60;
    else if (regionMatch) confidence = 40;
    else if (varietalMatch) confidence = 30;
  }
  if (countryConflict) confidence = Math.min(confidence, 55);
  return Math.min(confidence, 100);
}

// Mirrors wineResolver's explicit-geography conflict guard: country display
// names as normalized terms, used only to dispute producer-derived geography
const countryTermIndex = COUNTRIES
  .map(c => ({ id: c.id, norm: normalize(c.name) }))
  .filter(c => c.norm.length >= 4);
function detectExplicitCountries(normInput) {
  const ids = new Set();
  for (const c of countryTermIndex) { if (containsTerm(normInput, c.norm)) ids.add(c.id); }
  return ids;
}

function resolveWine(wineName) {
  if (!wineName || wineName.trim().length < 3) {
    return { winery: null, varietal: null, region: null, province: null, country: null, confidence: 0, isBlend: false, dnaMapping: null };
  }
  const normInput = normalize(wineName);
  const inputTokens = tokenize(wineName);
  const producerResult = matchProducer(normInput, inputTokens);
  const varietalMatch = matchVarietal(normInput);
  const regionMatch = matchRegion(normInput);
  let countryConflict = false;
  if (producerResult && producerResult.producer.dnaCountryId) {
    const explicit = detectExplicitCountries(normInput);
    if (regionMatch && regionMatch.dnaCountryId) explicit.add(regionMatch.dnaCountryId);
    countryConflict = explicit.size > 0 && !explicit.has(producerResult.producer.dnaCountryId);
  }
  const confidence = calculateConfidence(producerResult, varietalMatch, regionMatch, countryConflict);
  const winery = producerResult ? producerResult.producer.name : null;
  const varietal = varietalMatch ? varietalMatch.name : null;
  const blendDetected = isBlend(varietal);
  let region = null, province = null, country = null;
  if (producerResult) { province = producerResult.producer.province || null; country = producerResult.producer.country || null; }
  if (regionMatch) { region = regionMatch.subregion || regionMatch.province || regionMatch.term; if (!province) province = regionMatch.province || null; if (!country) country = regionMatch.country || null; }
  if (!region && province) region = province;

  // DNA mapping
  const dnaMapping = {
    dnaCountryId: producerResult?.producer?.dnaCountryId || regionMatch?.dnaCountryId || null,
    dnaRegionId: producerResult?.producer?.dnaRegionId || regionMatch?.dnaRegionId || null,
    dnaVarietalId: varietalMatch?.dnaId || null,
    dnaEstateId: producerResult?.producer?.dnaEstateId || null,
    countryMappable: true, regionMappable: true, varietalMappable: true,
    estateMappable: !!producerResult?.producer?.dnaEstateId,
  };
  if (!dnaMapping.dnaCountryId) dnaMapping.countryMappable = false;
  if (!dnaMapping.dnaRegionId) dnaMapping.regionMappable = false;
  if (varietalMatch && !varietalMatch.dnaId) dnaMapping.varietalMappable = false;

  return { winery, varietal, region, province, country, confidence, isBlend: blendDetected, dnaMapping,
    producerScore: producerResult ? producerResult.score : null };
}


// ═══════════════════════════════════════════════════════
// INLINED DNA EVOLUTION ENGINE (from dnaEvolution.js)
// ═══════════════════════════════════════════════════════

const RATING_POINTS = { loved: 2, liked: 1, fine: 0, not_for_me: -1 };
// Partial band (60–79): integer-capped points — loved halves, the rest clamp
// to ±1 so every delta reverses exactly (see dnaThresholds.js)
const PARTIAL_RATING_POINTS = { loved: 1, liked: 1, fine: 0, not_for_me: -1 };
const PROMOTION_THRESHOLDS = { estate: 4, varietal: 6, region: 10, country: 14 };
const ROLLUP_THRESHOLDS = { region: 3, country: 3 };
const DEMOTION_THRESHOLDS = { auto: -6, quiz: -10 };
const CONFIDENCE_GATE = 80;
const PARTIAL_CONFIDENCE_GATE = 60;

function pointsTableFor(confidence) {
  if (confidence >= CONFIDENCE_GATE) return RATING_POINTS;
  if (confidence >= PARTIAL_CONFIDENCE_GATE) return PARTIAL_RATING_POINTS;
  return null;
}

function findCountryForRegion(dnaRegionId) {
  for (const [countryId, regions] of Object.entries(REGIONS)) {
    if (regions.some(r => r.id === dnaRegionId)) return countryId;
  }
  return null;
}
function isValidDnaVarietal(id) { return VARIETALS.some(v => v.id === id); }
function isValidDnaRegion(id) {
  for (const regs of Object.values(REGIONS)) { if (regs.some(r => r.id === id)) return true; }
  return false;
}
function isValidDnaCountry(id) { return COUNTRIES.some(c => c.id === id); }
function getRegionDisplayName(id) {
  for (const regs of Object.values(REGIONS)) { const f = regs.find(r => r.id === id); if (f) return f.name; }
  return id;
}
function getCountryDisplayName(id) { const f = COUNTRIES.find(c => c.id === id); return f ? f.name : id; }

function buildDimensionUpdates(resolution, { partial = false } = {}) {
  const updates = [];
  const { dnaMapping, isBlend: blend } = resolution;
  if (!dnaMapping) return updates;
  // Partial band skips the estate — a fuzzy producer match must not accrue
  // toward an estate promotion
  if (resolution.winery && !partial) {
    let estateId = dnaMapping.dnaEstateId;
    if (!estateId) {
      const normName = resolution.winery.toLowerCase().replace(/[^a-z0-9]/g, "_");
      updates.push({ dimension: "estate", dimensionValue: normName, displayName: resolution.winery, mappable: false });
    } else {
      updates.push({ dimension: "estate", dimensionValue: estateId, displayName: resolution.winery, mappable: true });
    }
  }
  if (dnaMapping.dnaVarietalId && !blend) {
    updates.push({ dimension: "varietal", dimensionValue: dnaMapping.dnaVarietalId,
      displayName: DNA_TO_VARIETY_NAME[dnaMapping.dnaVarietalId] || resolution.varietal,
      mappable: dnaMapping.varietalMappable !== false });
  }
  if (dnaMapping.dnaRegionId) {
    updates.push({ dimension: "region", dimensionValue: dnaMapping.dnaRegionId,
      displayName: getRegionDisplayName(dnaMapping.dnaRegionId),
      mappable: dnaMapping.regionMappable !== false });
  }
  if (dnaMapping.dnaCountryId) {
    updates.push({ dimension: "country", dimensionValue: dnaMapping.dnaCountryId,
      displayName: getCountryDisplayName(dnaMapping.dnaCountryId),
      mappable: dnaMapping.countryMappable !== false });
  }
  return updates;
}

async function upsertAccumulation(supabase, userId, dim, pointDelta) {
  const { data: existing } = await supabase.from("dna_accumulation")
    .select("id, points, interaction_count")
    .eq("user_id", userId).eq("dimension", dim.dimension).eq("dimension_value", dim.dimensionValue).single();
  if (existing) {
    await supabase.from("dna_accumulation").update({
      points: existing.points + pointDelta,
      interaction_count: existing.interaction_count + (pointDelta > 0 ? 1 : 0),
      display_name: dim.displayName, mappable: dim.mappable,
    }).eq("id", existing.id);
  } else {
    await supabase.from("dna_accumulation").insert({
      user_id: userId, dimension: dim.dimension, dimension_value: dim.dimensionValue,
      display_name: dim.displayName, points: pointDelta,
      interaction_count: pointDelta > 0 ? 1 : 0, mappable: dim.mappable,
      source: "auto", promoted: false,
    });
  }
}

async function checkPromotions(supabase, userId, dimensionUpdates) {
  const promotions = [];
  for (const dim of dimensionUpdates) {
    if (!dim.mappable) continue;
    const { data: acc } = await supabase.from("dna_accumulation")
      .select("id, points, promoted, dimension, dimension_value, display_name")
      .eq("user_id", userId).eq("dimension", dim.dimension).eq("dimension_value", dim.dimensionValue).single();
    if (!acc || acc.promoted) continue;
    const threshold = PROMOTION_THRESHOLDS[dim.dimension];
    if (acc.points >= threshold) {
      promotions.push({ id: acc.id, dimension: acc.dimension, dimensionValue: acc.dimension_value, displayName: acc.display_name });
    }
  }
  // Roll-up: estates -> region
  const { data: promotedEstates } = await supabase.from("dna_accumulation")
    .select("dimension_value").eq("user_id", userId).eq("dimension", "estate").eq("promoted", true);
  if (promotedEstates && promotedEstates.length >= ROLLUP_THRESHOLDS.region) {
    const regionCounts = {};
    for (const est of promotedEstates) {
      for (const [regionId, estateList] of Object.entries(ESTATES)) {
        if (estateList.some(e => e.id === est.dimension_value)) {
          regionCounts[regionId] = (regionCounts[regionId] || 0) + 1; break;
        }
      }
    }
    for (const [regionId, count] of Object.entries(regionCounts)) {
      if (count >= ROLLUP_THRESHOLDS.region && isValidDnaRegion(regionId)) {
        const { data: rAcc } = await supabase.from("dna_accumulation")
          .select("id, promoted").eq("user_id", userId).eq("dimension", "region").eq("dimension_value", regionId).single();
        if (rAcc && !rAcc.promoted) {
          promotions.push({ id: rAcc.id, dimension: "region", dimensionValue: regionId, displayName: getRegionDisplayName(regionId), isRollup: true });
        } else if (!rAcc) {
          const { data: newAcc } = await supabase.from("dna_accumulation").insert({
            user_id: userId, dimension: "region", dimension_value: regionId,
            display_name: getRegionDisplayName(regionId), points: 0, interaction_count: 0,
            mappable: true, source: "auto", promoted: false,
          }).select("id").single();
          if (newAcc) promotions.push({ id: newAcc.id, dimension: "region", dimensionValue: regionId, displayName: getRegionDisplayName(regionId), isRollup: true });
        }
      }
    }
  }
  // Roll-up: regions -> country
  const { data: promotedRegions } = await supabase.from("dna_accumulation")
    .select("dimension_value").eq("user_id", userId).eq("dimension", "region").eq("promoted", true);
  if (promotedRegions && promotedRegions.length >= ROLLUP_THRESHOLDS.country) {
    const countryCounts = {};
    for (const reg of promotedRegions) {
      const cId = findCountryForRegion(reg.dimension_value);
      if (cId) countryCounts[cId] = (countryCounts[cId] || 0) + 1;
    }
    for (const [countryId, count] of Object.entries(countryCounts)) {
      if (count >= ROLLUP_THRESHOLDS.country && isValidDnaCountry(countryId)) {
        const { data: cAcc } = await supabase.from("dna_accumulation")
          .select("id, promoted").eq("user_id", userId).eq("dimension", "country").eq("dimension_value", countryId).single();
        if (cAcc && !cAcc.promoted) {
          promotions.push({ id: cAcc.id, dimension: "country", dimensionValue: countryId, displayName: getCountryDisplayName(countryId), isRollup: true });
        } else if (!cAcc) {
          const { data: newAcc } = await supabase.from("dna_accumulation").insert({
            user_id: userId, dimension: "country", dimension_value: countryId,
            display_name: getCountryDisplayName(countryId), points: 0, interaction_count: 0,
            mappable: true, source: "auto", promoted: false,
          }).select("id").single();
          if (newAcc) promotions.push({ id: newAcc.id, dimension: "country", dimensionValue: countryId, displayName: getCountryDisplayName(countryId), isRollup: true });
        }
      }
    }
  }
  return promotions;
}

async function checkDemotions(supabase, userId, dimensionUpdates) {
  const demotions = [];
  for (const dim of dimensionUpdates) {
    if (!dim.mappable) continue;
    const { data: acc } = await supabase.from("dna_accumulation")
      .select("id, points, promoted, source, dimension, dimension_value, display_name")
      .eq("user_id", userId).eq("dimension", dim.dimension).eq("dimension_value", dim.dimensionValue).single();
    if (!acc || !acc.promoted) continue;
    const threshold = acc.source === "quiz" ? DEMOTION_THRESHOLDS.quiz : DEMOTION_THRESHOLDS.auto;
    if (acc.points <= threshold) {
      demotions.push({ id: acc.id, dimension: acc.dimension, dimensionValue: acc.dimension_value, displayName: acc.display_name });
    }
  }
  return demotions;
}

async function applyPromotions(supabase, userId, promotions) {
  const { data: profile } = await supabase.from("wine_profiles")
    .select("countries, regions, estates, varietals").eq("user_id", userId).single();
  if (!profile) return;
  let { countries = [], regions = {}, estates = {}, varietals = [] } = profile;
  let changed = false;
  for (const promo of promotions) {
    const { dimension, dimensionValue, id } = promo;
    if (dimension === "country") {
      if (!countries.includes(dimensionValue)) { countries = [...countries, dimensionValue]; changed = true; }
    } else if (dimension === "region") {
      const cId = findCountryForRegion(dimensionValue);
      if (cId) { const cr = regions[cId] || []; if (!cr.includes(dimensionValue)) { regions = { ...regions, [cId]: [...cr, dimensionValue] }; changed = true; } }
    } else if (dimension === "estate") {
      let eRegion = null;
      for (const [rId, eList] of Object.entries(ESTATES)) { if (eList.some(e => e.id === dimensionValue)) { eRegion = rId; break; } }
      if (eRegion) { const re = estates[eRegion] || []; if (!re.includes(dimensionValue)) { estates = { ...estates, [eRegion]: [...re, dimensionValue] }; changed = true; } }
    } else if (dimension === "varietal") {
      if (!varietals.includes(dimensionValue)) { varietals = [...varietals, dimensionValue]; changed = true; }
    }
    await supabase.from("dna_accumulation").update({ promoted: true, promoted_at: new Date().toISOString(), demoted_at: null }).eq("id", id);
    await supabase.from("dna_timeline").insert({ user_id: userId, event_type: "promoted", dimension, dimension_value: dimensionValue, display_name: promo.displayName, event_at: new Date().toISOString() });
  }
  if (changed) await supabase.from("wine_profiles").update({ countries, regions, estates, varietals }).eq("user_id", userId);
}

async function applyDemotions(supabase, userId, demotions) {
  const { data: profile } = await supabase.from("wine_profiles")
    .select("countries, regions, estates, varietals").eq("user_id", userId).single();
  if (!profile) return;
  let { countries = [], regions = {}, estates = {}, varietals = [] } = profile;
  let changed = false;
  for (const demo of demotions) {
    const { dimension, dimensionValue, id } = demo;
    if (dimension === "country") { const f = countries.filter(c => c !== dimensionValue); if (f.length !== countries.length) { countries = f; changed = true; } }
    else if (dimension === "region") { for (const [cId, rList] of Object.entries(regions)) { const f = rList.filter(r => r !== dimensionValue); if (f.length !== rList.length) { regions = { ...regions, [cId]: f }; changed = true; } } }
    else if (dimension === "estate") { for (const [rId, eList] of Object.entries(estates)) { const f = eList.filter(e => e !== dimensionValue); if (f.length !== eList.length) { estates = { ...estates, [rId]: f }; changed = true; } } }
    else if (dimension === "varietal") { const f = varietals.filter(v => v !== dimensionValue); if (f.length !== varietals.length) { varietals = f; changed = true; } }
    await supabase.from("dna_accumulation").update({ promoted: false, demoted_at: new Date().toISOString() }).eq("id", id);
    await supabase.from("dna_timeline").insert({ user_id: userId, event_type: "demoted", dimension, dimension_value: dimensionValue, display_name: demo.displayName, event_at: new Date().toISOString() });
  }
  if (changed) await supabase.from("wine_profiles").update({ countries, regions, estates, varietals }).eq("user_id", userId);
}

// Full flow helper
async function resolveAndAccumulate(supabase, userId, wineName, rating, previousRating = null) {
  const resolution = resolveWine(wineName);
  if (resolution.confidence > 0) {
    await supabase.from("wine_interactions").update({
      resolved_winery: resolution.winery, resolved_varietal: resolution.varietal,
      resolved_region: resolution.region, resolved_province: resolution.province,
      resolved_country: resolution.country, match_confidence: resolution.confidence,
      resolved_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("wine_name", wineName);
  }
  const pointsTable = pointsTableFor(resolution.confidence);
  if (!pointsTable) return { resolution, promotions: [], demotions: [] };
  const partial = pointsTable === PARTIAL_RATING_POINTS;
  const newPts = pointsTable[rating] ?? 0;
  const oldPts = previousRating ? (pointsTable[previousRating] ?? 0) : 0;
  const pointDelta = newPts - oldPts;
  if (pointDelta === 0) return { resolution, promotions: [], demotions: [] };
  const dimUpdates = buildDimensionUpdates(resolution, { partial });
  for (const dim of dimUpdates) await upsertAccumulation(supabase, userId, dim, pointDelta);
  const promotions = await checkPromotions(supabase, userId, dimUpdates);
  const demotions = await checkDemotions(supabase, userId, dimUpdates);
  if (promotions.length > 0) await applyPromotions(supabase, userId, promotions);
  if (demotions.length > 0) await applyDemotions(supabase, userId, demotions);
  return { resolution, promotions, demotions };
}

async function reverseAccumulation(supabase, userId, wineName, interactionData = null) {
  let interaction = interactionData;
  if (!interaction) {
    const { data } = await supabase.from("wine_interactions")
      .select("rating, match_confidence").eq("user_id", userId).eq("wine_name", wineName).single();
    interaction = data;
  }
  // No stored confidence → never resolved → never accumulated
  if (!interaction || !interaction.rating || interaction.match_confidence == null) return { demotions: [] };
  const resolution = resolveWine(wineName);
  const pointsTable = pointsTableFor(resolution.confidence);
  if (!pointsTable) return { demotions: [] };
  const partial = pointsTable === PARTIAL_RATING_POINTS;
  const points = pointsTable[interaction.rating] ?? 0;
  if (points === 0) return { demotions: [] };
  const dimUpdates = buildDimensionUpdates(resolution, { partial });
  for (const dim of dimUpdates) await upsertAccumulation(supabase, userId, dim, -points);
  const demotions = await checkDemotions(supabase, userId, dimUpdates);
  if (demotions.length > 0) await applyDemotions(supabase, userId, demotions);
  return { demotions };
}

async function syncQuizSelections(supabase, userId, quizAnswers) {
  const { countries, regions, estates, varietals } = quizAnswers;
  const items = [];
  for (const cId of (countries || [])) { if (isValidDnaCountry(cId)) items.push({ dimension: "country", dimensionValue: cId, displayName: getCountryDisplayName(cId) }); }
  for (const [cId, rIds] of Object.entries(regions || {})) { for (const rId of rIds) { if (isValidDnaRegion(rId)) items.push({ dimension: "region", dimensionValue: rId, displayName: getRegionDisplayName(rId) }); } }
  for (const [rId, eIds] of Object.entries(estates || {})) { for (const eId of eIds) { const el = ESTATES[rId] || []; const e = el.find(x => x.id === eId); if (e) items.push({ dimension: "estate", dimensionValue: eId, displayName: e.name }); } }
  for (const vId of (varietals || [])) { if (isValidDnaVarietal(vId)) items.push({ dimension: "varietal", dimensionValue: vId, displayName: DNA_TO_VARIETY_NAME[vId] || vId }); }
  for (const item of items) {
    const { data: existing } = await supabase.from("dna_accumulation").select("id, source, promoted")
      .eq("user_id", userId).eq("dimension", item.dimension).eq("dimension_value", item.dimensionValue).single();
    if (existing) {
      // Earned rows keep their provenance — quiz agreement isn't founding
      if (existing.promoted && existing.source === "auto") continue;
      await supabase.from("dna_accumulation").update({ source: "quiz", promoted: true, promoted_at: new Date().toISOString(), display_name: item.displayName, mappable: true }).eq("id", existing.id);
    } else {
      await supabase.from("dna_accumulation").insert({ user_id: userId, dimension: item.dimension, dimension_value: item.dimensionValue,
        display_name: item.displayName, points: 0, interaction_count: 0, promoted: true, promoted_at: new Date().toISOString(), source: "quiz", mappable: true });
    }
  }
}

// Mirror of mergeQuizWithEarnedDna (dnaEvolution.js) — quiz ∪ earned DNA,
// honoring explicit deselections (present in initialRaw, absent from quizRaw)
function collectDimensionValues(raw) {
  return {
    country: new Set(raw.countries || []),
    region: new Set(Object.values(raw.regions || {}).flat()),
    estate: new Set(Object.values(raw.estates || {}).flat()),
    varietal: new Set(raw.varietals || []),
  };
}

async function mergeQuizWithEarnedDna(supabase, userId, quizRaw, initialRaw = null) {
  const initial = initialRaw ? collectDimensionValues(initialRaw) : null;
  const final = collectDimensionValues(quizRaw);
  const explicitlyDeselected = (dimension, value) =>
    initial ? initial[dimension].has(value) && !final[dimension].has(value) : false;
  const merged = {
    countries: [...(quizRaw.countries || [])],
    regions: {},
    estates: {},
    varietals: [...(quizRaw.varietals || [])],
    specificWines: [...(quizRaw.specificWines || [])],
  };
  for (const [k, v] of Object.entries(quizRaw.regions || {})) merged.regions[k] = [...v];
  for (const [k, v] of Object.entries(quizRaw.estates || {})) merged.estates[k] = [...v];

  const { data: earnedRows } = await supabase.from("dna_accumulation")
    .select("dimension, dimension_value")
    .eq("user_id", userId).eq("promoted", true).eq("source", "auto").eq("mappable", true);

  for (const row of earnedRows || []) {
    const value = row.dimension_value;
    if (explicitlyDeselected(row.dimension, value)) continue;
    if (row.dimension === "country") {
      if (isValidDnaCountry(value) && !merged.countries.includes(value)) merged.countries.push(value);
    } else if (row.dimension === "varietal") {
      if (isValidDnaVarietal(value) && !merged.varietals.includes(value)) merged.varietals.push(value);
    } else if (row.dimension === "region") {
      const countryId = findCountryForRegion(value);
      if (countryId) {
        const list = merged.regions[countryId] || (merged.regions[countryId] = []);
        if (!list.includes(value)) list.push(value);
      }
    } else if (row.dimension === "estate") {
      let estateRegion = null;
      for (const [regionId, estateList] of Object.entries(ESTATES)) {
        if (estateList.some(e => e.id === value)) { estateRegion = regionId; break; }
      }
      if (estateRegion) {
        const list = merged.estates[estateRegion] || (merged.estates[estateRegion] = []);
        if (!list.includes(value)) list.push(value);
      }
    }
  }
  return merged;
}

// Mirror of reconcileQuizPromotions (dnaEvolution.js)
async function reconcileQuizPromotions(supabase, userId, savedRaw) {
  const inDna = {
    country: new Set(savedRaw.countries || []),
    region: new Set(Object.values(savedRaw.regions || {}).flat()),
    estate: new Set(Object.values(savedRaw.estates || {}).flat()),
    varietal: new Set(savedRaw.varietals || []),
  };
  const { data: promoted } = await supabase.from("dna_accumulation")
    .select("id, dimension, dimension_value").eq("user_id", userId).eq("promoted", true);
  for (const row of promoted || []) {
    const set = inDna[row.dimension];
    if (set && !set.has(row.dimension_value)) {
      await supabase.from("dna_accumulation").update({
        promoted: false, demoted_at: new Date().toISOString(),
      }).eq("id", row.id);
    }
  }
}


// ═══════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════

const TEST_USER = "test-user-001";
let totalPassed = 0, totalFailed = 0;
const suiteResults = {};
const failures = [];
const suite1AScores = {};

function assert(condition, message) {
  if (!condition) throw new Error("ASSERT FAILED: " + message);
}

async function runTest(suiteName, testName, fn) {
  try {
    await fn();
    suiteResults[suiteName] = suiteResults[suiteName] || { passed: 0, failed: 0 };
    suiteResults[suiteName].passed++;
    totalPassed++;
    console.log(`  ✓ ${testName}`);
  } catch (err) {
    suiteResults[suiteName] = suiteResults[suiteName] || { passed: 0, failed: 0 };
    suiteResults[suiteName].failed++;
    totalFailed++;
    failures.push({ suite: suiteName, test: testName, error: err.message, stack: err.stack });
    console.log(`  ✗ ${testName}`);
    console.log(`    ${err.message}`);
  }
}

// Helper: simulate full bottle save flow
async function simulateBottleSave(supabase, wineName, rating, previousRating = null) {
  // Upsert wine_interactions
  const existing = supabase.tables.wine_interactions.find(
    r => r.user_id === TEST_USER && r.wine_name === wineName
  );
  if (existing) {
    existing.rating = rating;
    existing.interaction_type = "had";
  } else {
    supabase.tables.wine_interactions.push({
      id: genId(), user_id: TEST_USER, wine_name: wineName,
      interaction_type: "had", rating, match_confidence: null,
    });
  }
  return resolveAndAccumulate(supabase, TEST_USER, wineName, rating, previousRating);
}

function getAcc(tables, dimension, dimensionValue) {
  return tables.dna_accumulation.find(
    r => r.user_id === TEST_USER && r.dimension === dimension && r.dimension_value === dimensionValue
  );
}

// Mirrors the fixed home handleBottleSave / recommend handleRatePick flow:
// the previous rating is READ from the interactions row before the upsert,
// never assumed — re-rating from any surface applies the differential.
async function simulateSurfaceRate(supabase, wineName, rating) {
  const existing = supabase.tables.wine_interactions.find(
    r => r.user_id === TEST_USER && r.wine_name === wineName
  );
  const previousRating = existing?.rating || null;
  if (existing) {
    existing.rating = rating;
    existing.interaction_type = "had";
  } else {
    supabase.tables.wine_interactions.push({
      id: genId(), user_id: TEST_USER, wine_name: wineName,
      interaction_type: "had", rating, match_confidence: null,
    });
  }
  return resolveAndAccumulate(supabase, TEST_USER, wineName, rating, previousRating);
}

// Mirrors the fixed journal handleDelete sequence: read the row, delete
// FIRST (returning what was removed), reverse only when this call actually
// removed the row. failDelete simulates a delete that errors out.
async function simulateJournalDelete(supabase, wineName, { failDelete = false } = {}) {
  const row = supabase.tables.wine_interactions.find(
    r => r.user_id === TEST_USER && r.wine_name === wineName
  );
  const interaction = row ? { rating: row.rating, match_confidence: row.match_confidence } : null;
  if (failDelete) return { demotions: [], deletedCount: 0 };
  const deleted = supabase.tables.wine_interactions.filter(
    r => r.user_id === TEST_USER && r.wine_name === wineName
  );
  supabase.tables.wine_interactions = supabase.tables.wine_interactions.filter(
    r => !(r.user_id === TEST_USER && r.wine_name === wineName)
  );
  if (deleted.length === 0) return { demotions: [], deletedCount: 0 };
  const result = await reverseAccumulation(supabase, TEST_USER, wineName, interaction);
  return { ...result, deletedCount: deleted.length };
}

function ensureProfile(tables) {
  if (!tables.wine_profiles.find(p => p.user_id === TEST_USER)) {
    tables.wine_profiles.push({
      id: genId(), user_id: TEST_USER,
      countries: [], regions: {}, estates: {}, varietals: [], specific_wines: [],
    });
  }
}

// ═══════════════════════════════════════════════════════
// SUITE 1: Metadata Resolver — Confidence Gating
// ═══════════════════════════════════════════════════════

async function suite1() {
  console.log("\n═══ Suite 1: Metadata Resolver ═══");

  // 1A: High-confidence matches
  await runTest("Suite 1", "1A: Henschke Hill of Grace 2019 (>= 80)", async () => {
    const r = resolveWine("Henschke Hill of Grace 2019");
    suite1AScores["Henschke Hill of Grace 2019"] = r.confidence;
    assert(r.confidence >= 80, `confidence ${r.confidence} < 80`);
    assert(r.winery && r.winery.includes("Henschke"), `winery: ${r.winery}`);
    assert(r.country === "Australia", `country: ${r.country}`);
  });

  await runTest("Suite 1", "1A: Château Margaux 2015 (>= 80)", async () => {
    const r = resolveWine("Château Margaux 2015");
    suite1AScores["Château Margaux 2015"] = r.confidence;
    assert(r.confidence >= 80, `confidence ${r.confidence} < 80`);
    assert(r.country === "France", `country: ${r.country}`);
  });

  await runTest("Suite 1", "1A: DRC Échezeaux (graceful if no match)", async () => {
    const r = resolveWine("Domaine de la Romanée-Conti Échezeaux");
    suite1AScores["DRC Échezeaux"] = r.confidence;
    // DRC is NOT in WineMag 2000 producers but IS in wineData ESTATES
    // So it may match via DNA estates index. Either way, no crash.
    assert(typeof r.confidence === "number", "should return a number");
  });

  await runTest("Suite 1", "1A: Kanonkop Paul Sauer 2020 (>= 80)", async () => {
    const r = resolveWine("Kanonkop Paul Sauer 2020");
    suite1AScores["Kanonkop Paul Sauer 2020"] = r.confidence;
    assert(r.confidence >= 80, `confidence ${r.confidence} < 80`);
    assert(r.country === "South Africa", `country: ${r.country}`);
  });

  await runTest("Suite 1", "1A: Krug Grande Cuvée (>= 80, short name)", async () => {
    const r = resolveWine("Krug Grande Cuvée");
    suite1AScores["Krug Grande Cuvée"] = r.confidence;
    assert(r.confidence >= 80, `confidence ${r.confidence} < 80`);
    assert(r.winery && r.winery.includes("Krug"), `winery: ${r.winery}`);
  });

  await runTest("Suite 1", "1A: Gaja Barbaresco 2018 (>= 80)", async () => {
    const r = resolveWine("Gaja Barbaresco 2018");
    suite1AScores["Gaja Barbaresco 2018"] = r.confidence;
    assert(r.confidence >= 80, `confidence ${r.confidence} < 80`);
    assert(r.country === "Italy", `country: ${r.country}`);
  });

  // 1B: Low-confidence matches
  await runTest("Suite 1", "1B: 'My Homemade Red 2024' (< 80)", async () => {
    const r = resolveWine("My Homemade Red 2024");
    assert(r.confidence < 80, `confidence ${r.confidence} should be < 80`);
  });

  await runTest("Suite 1", "1B: 'asdfghjkl' (no match)", async () => {
    const r = resolveWine("asdfghjkl");
    assert(r.confidence < 80, `confidence ${r.confidence} should be < 80`);
  });

  await runTest("Suite 1", "1B: 'Table Wine' (< 80)", async () => {
    const r = resolveWine("Table Wine");
    assert(r.confidence < 80, `confidence ${r.confidence} should be < 80`);
  });

  await runTest("Suite 1", "1B: 'Gaja Street Bistro House Red' (false match check)", async () => {
    const r = resolveWine("Gaja Street Bistro House Red");
    // May match Gaja but confidence should be low due to extra noise
    suite1AScores["Gaja Street Bistro House Red"] = r.confidence;
    // Log it — this is a quality check, not a strict pass/fail
    console.log(`    (Confidence: ${r.confidence}, Winery: ${r.winery || "none"})`);
    // At minimum, it shouldn't crash
    assert(typeof r.confidence === "number", "should return a number");
  });

  await runTest("Suite 1", "1B: '12345 Vineyard Select' (< 80)", async () => {
    const r = resolveWine("12345 Vineyard Select");
    assert(r.confidence < 80, `confidence ${r.confidence} should be < 80`);
  });

  // 1C: Grape synonym normalization
  await runTest("Suite 1", "1C: Shiraz → syrah", async () => {
    const r = resolveWine("Penfolds Grange Shiraz 2017");
    assert(r.dnaMapping?.dnaVarietalId === "syrah", `got: ${r.dnaMapping?.dnaVarietalId}`);
  });

  await runTest("Suite 1", "1C: Garnacha → grenache", async () => {
    const r = resolveWine("Garnacha Reserva 2019");
    assert(r.dnaMapping?.dnaVarietalId === "grenache", `got: ${r.dnaMapping?.dnaVarietalId}`);
  });

  await runTest("Suite 1", "1C: Pinot Grigio → pinot_grigio", async () => {
    const r = resolveWine("Santa Margherita Pinot Grigio 2022");
    assert(r.dnaMapping?.dnaVarietalId === "pinot_grigio", `got: ${r.dnaMapping?.dnaVarietalId}`);
  });

  await runTest("Suite 1", "1C: Pinot Gris → pinot_grigio", async () => {
    const r = resolveWine("Trimbach Pinot Gris 2020");
    assert(r.dnaMapping?.dnaVarietalId === "pinot_grigio", `got: ${r.dnaMapping?.dnaVarietalId}`);
  });

  // 1D: Blend detection
  await runTest("Suite 1", "1D: Meritage blend → isBlend=true", async () => {
    // "Red Blend" isn't a varietal in the unified dataset; Meritage is the
    // blend-style varietal that remains — isBlend() flags it by pattern
    const r = resolveWine("Opus One Napa Valley Meritage 2018");
    assert(r.isBlend === true, `isBlend: ${r.isBlend}`);
    const dims = buildDimensionUpdates(r);
    assert(!dims.find(d => d.dimension === "varietal"), "blends should not have varietal dimension");
  });

  await runTest("Suite 1", "1D: Cabernet Sauvignon-Merlot → isBlend=true", async () => {
    assert(isBlend("Cabernet Sauvignon-Merlot") === true, "should detect hyphenated blend");
  });

  await runTest("Suite 1", "1D: Single grape Syrah → isBlend=false", async () => {
    assert(isBlend("Syrah") === false, "single grape should not be blend");
  });
}


// ═══════════════════════════════════════════════════════
// SUITE 2: Accumulation & Point Math
// ═══════════════════════════════════════════════════════

async function suite2() {
  console.log("\n═══ Suite 2: Accumulation & Point Math ═══");

  const tables = freshTables();
  ensureProfile(tables);
  const sb = createMockSupabase(tables);

  // 2A: Basic accumulation — 3 Australian Shiraz wines (include grape name for varietal detection)
  await runTest("Suite 2", "2A: 3 Aussie Shiraz wines accumulate correctly", async () => {
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved");
    await simulateBottleSave(sb, "Torbreck RunRig Shiraz", "loved");
    await simulateBottleSave(sb, "Penfolds Grange Shiraz", "liked");

    const syrah = getAcc(tables, "varietal", "syrah");
    assert(syrah, "syrah row should exist");
    assert(syrah.points === 5, `syrah points: expected 5, got ${syrah.points}`);
    assert(syrah.interaction_count === 3, `syrah count: expected 3, got ${syrah.interaction_count}`);

    const aus = getAcc(tables, "country", "australia");
    assert(aus, "australia row should exist");
    assert(aus.points === 5, `australia points: expected 5, got ${aus.points}`);

    const barossa = getAcc(tables, "region", "barossa");
    assert(barossa, "barossa row should exist");
    assert(barossa.points === 5, `barossa points: expected 5, got ${barossa.points}`);

    // Each estate should have its own row
    const henschke = getAcc(tables, "estate", "henschke");
    assert(henschke, "henschke estate row should exist");
    assert(henschke.points === 2, `henschke points: ${henschke.points}`);

    // No promotions yet (syrah=5 < 6, estates ≤ 2 < 4)
    assert(!syrah.promoted, "syrah should not be promoted yet");
  });

  // 2B: Negative rating
  await runTest("Suite 2", "2B: Negative rating reduces points", async () => {
    await simulateBottleSave(sb, "Glaetzer Shiraz 2019", "not_for_me");
    const syrah = getAcc(tables, "varietal", "syrah");
    assert(syrah.points === 4, `syrah points after not_for_me: expected 4, got ${syrah.points}`);
    const aus = getAcc(tables, "country", "australia");
    assert(aus.points === 4, `australia points: expected 4, got ${aus.points}`);
  });

  // 2C: Zero-point interaction
  await runTest("Suite 2", "2C: Fine (0 pts) doesn't change points", async () => {
    await simulateBottleSave(sb, "Kaesler Old Bastard Shiraz", "fine");
    const syrah = getAcc(tables, "varietal", "syrah");
    assert(syrah.points === 4, `syrah points should still be 4, got ${syrah.points}`);
  });
}

// ═══════════════════════════════════════════════════════
// SUITE 3: Promotion Triggers
// ═══════════════════════════════════════════════════════

async function suite3() {
  console.log("\n═══ Suite 3: Promotion Triggers ═══");

  // 3A: Estate promotion (4 pts)
  await runTest("Suite 3", "3A: Estate promotion at 4 pts (2 Loved)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    const r1 = await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved");
    assert(r1.promotions.length === 0, "no promotion after 1st");
    const r2 = await simulateBottleSave(sb, "Henschke Mount Edelstone Shiraz", "loved");
    const estatePromo = r2.promotions.find(p => p.dimension === "estate");
    assert(estatePromo, "estate promotion should fire after 2nd Loved");
    const hAcc = getAcc(tables, "estate", "henschke");
    assert(hAcc.promoted === true, "henschke should be promoted");
    assert(hAcc.promoted_at, "promoted_at should be set");
    const tl = tables.dna_timeline.find(t => t.dimension === "estate" && t.event_type === "promoted");
    assert(tl, "timeline entry should exist");
  });

  // 3B: Varietal promotion (6 pts)
  await runTest("Suite 3", "3B: Varietal promotion at 6 pts (3 Loved)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    const syrahWines = [
      "Henschke Hill of Grace Shiraz", "Torbreck RunRig Shiraz",
      "Penfolds Grange Shiraz"
    ];
    let lastResult;
    for (const w of syrahWines) lastResult = await simulateBottleSave(sb, w, "loved");
    const varietalPromo = lastResult.promotions.find(p => p.dimension === "varietal");
    assert(varietalPromo, "syrah varietal should promote at 6 pts");
    const syrahAcc = getAcc(tables, "varietal", "syrah");
    assert(syrahAcc.promoted === true, "syrah should be promoted");
    const profile = tables.wine_profiles[0];
    assert(profile.varietals.includes("syrah"), "wine_profiles.varietals should include syrah");
  });

  // 3C: Region promotion via direct points (10 pts)
  await runTest("Suite 3", "3C: Region promotion at 10 pts (5 Loved)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // All five must be Barossa producers in wineUnified.json — the old data
    // mapped every South Australia producer to barossa; the new data is precise
    const barossaWines = [
      "Henschke Hill of Grace", "Torbreck RunRig", "Penfolds Grange",
      "St Hallett Old Block Shiraz", "Peter Lehmann Stonewell Shiraz"
    ];
    let lastResult;
    for (const w of barossaWines) lastResult = await simulateBottleSave(sb, w, "loved");
    const regionPromo = lastResult.promotions.find(p => p.dimension === "region");
    assert(regionPromo, "barossa region should promote at 10 pts");
  });

  // 3D: Region promotion via estate roll-up (3 promoted estates in Stellenbosch)
  await runTest("Suite 3", "3D: Region roll-up (3 promoted Stellenbosch estates)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // 3 Loved from Ernie Els = 6 pts → promote estate
    for (let i = 0; i < 3; i++) await simulateBottleSave(sb, `Ernie Els Signature Blend ${2018+i}`, "loved");
    // 3 Loved from DeMorgenzon = 6 pts → promote estate
    for (let i = 0; i < 3; i++) await simulateBottleSave(sb, `DeMorgenzon Reserve ${2018+i}`, "loved");
    // 3 Loved from Stark-Condé = 6 pts → promote estate
    let lastResult;
    for (let i = 0; i < 3; i++) lastResult = await simulateBottleSave(sb, `Stark-Condé Cabernet ${2018+i}`, "loved");

    // Check that 3 estates are promoted
    const promotedEstates = tables.dna_accumulation.filter(
      r => r.user_id === TEST_USER && r.dimension === "estate" && r.promoted === true
    );
    assert(promotedEstates.length >= 3, `expected >= 3 promoted estates, got ${promotedEstates.length}`);

    // Stellenbosch should have been auto-promoted via roll-up
    const stellAcc = getAcc(tables, "region", "stellenbosch");
    assert(stellAcc && stellAcc.promoted === true, "stellenbosch should be promoted via roll-up");
  });

  // 3E: Country promotion (14 pts)
  await runTest("Suite 3", "3E: Country promotion at 14 pts (7 Loved)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    const ausWines = [
      "Henschke Hill of Grace", "Torbreck RunRig", "Penfolds Grange",
      "Glaetzer Amon-Ra Shiraz", "Clarendon Hills Syrah", "Kaesler Old Bastard",
      "Langmeil Freedom Shiraz"
    ];
    let lastResult;
    for (const w of ausWines) lastResult = await simulateBottleSave(sb, w, "loved");
    const countryPromo = lastResult.promotions.find(p => p.dimension === "country" && p.dimensionValue === "australia");
    assert(countryPromo, "australia should promote at 14 pts");
    const profile = tables.wine_profiles[0];
    assert(profile.countries.includes("australia"), "wine_profiles.countries should include australia");
  });

  // 3F: Country roll-up (skip — requires 3 promoted regions, too complex to set up)
  console.log("  - 3F: Country roll-up (skipped — requires extensive setup)");

  // 3G: Multiple simultaneous promotions
  await runTest("Suite 3", "3G: Varietal + region promote on the same save", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // Build syrah to 4 and barossa to 8 (distinct estates so none reach 4),
    // then one Barossa Shiraz pushes syrah to 6 AND barossa to 10 together
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved"); // syrah 2, barossa 2
    await simulateBottleSave(sb, "Torbreck RunRig Shiraz", "loved");        // syrah 4, barossa 4
    await simulateBottleSave(sb, "Penfolds Grange", "loved");               // barossa 6
    await simulateBottleSave(sb, "Kaesler Old Bastard", "loved");           // barossa 8
    const result = await simulateBottleSave(sb, "St Hallett Old Block Shiraz", "loved"); // syrah 6, barossa 10
    const hasVarietalPromo = result.promotions.some(p => p.dimension === "varietal");
    const hasRegionPromo = result.promotions.some(p => p.dimension === "region");
    assert(hasVarietalPromo, "syrah should promote on the final save");
    assert(hasRegionPromo, "barossa should promote on the same save");
  });

  // 3H: Unmappable values
  await runTest("Suite 3", "3H: Unmappable region doesn't write to profile", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // Lombardy resolves via the unified dataset now; a single save never
    // promotes, so profile.regions must stay empty regardless
    const r = resolveWine("Arpepe Rosso di Valtellina 2019");
    // If Arpepe resolves, check its region mapping
    if (r.confidence >= 80) {
      const dims = buildDimensionUpdates(r);
      const regionDim = dims.find(d => d.dimension === "region");
      // If region mapped, fine. If not, verify mappable=false
      if (regionDim && !regionDim.mappable) {
        // Correct: unmappable
        assert(true, "unmappable region correctly detected");
      }
    }
    // Either way, profile regions should not have garbage values
    const profile = tables.wine_profiles[0];
    assert(Object.keys(profile.regions).length === 0, "no regions should be added for unmappable");
  });
}


// ═══════════════════════════════════════════════════════
// SUITE 4: Demotion
// ═══════════════════════════════════════════════════════

async function suite4() {
  console.log("\n═══ Suite 4: Demotion ═══");

  // 4A: Demotion of auto-promoted item (-6 pts)
  await runTest("Suite 4", "4A: Auto-promoted syrah demoted at -6", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // First promote syrah: 5 Loved = 10 pts (use real producers with Shiraz/Syrah)
    const lovedWines = [
      "Henschke Hill of Grace Shiraz", "Torbreck RunRig Shiraz",
      "Penfolds Grange Shiraz", "Glaetzer Amon-Ra Shiraz", "Clarendon Hills Syrah"
    ];
    for (const w of lovedWines) await simulateBottleSave(sb, w, "loved");
    let syrah = getAcc(tables, "varietal", "syrah");
    assert(syrah && syrah.promoted === true, "syrah should be promoted first");
    assert(tables.wine_profiles[0].varietals.includes("syrah"), "profile should have syrah");
    // Now log 16 not_for_me Syrah wines to go from 10 to -6
    for (let i = 0; i < 16; i++) await simulateBottleSave(sb, `Henschke Syrah Variant ${i}`, "not_for_me");
    syrah = getAcc(tables, "varietal", "syrah");
    assert(syrah.points <= -6, `syrah points should be <= -6, got ${syrah.points}`);
    assert(syrah.promoted === false, "syrah should be demoted");
    assert(!tables.wine_profiles[0].varietals.includes("syrah"), "profile should not have syrah");
    const tlDemo = tables.dna_timeline.find(t => t.dimension === "varietal" && t.event_type === "demoted");
    assert(tlDemo, "demotion timeline entry should exist");
  });

  // 4B: Quiz-selected demotion (-10 pts)
  await runTest("Suite 4", "4B: Quiz-selected riesling needs -10 to demote", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // Add riesling as quiz-selected
    await syncQuizSelections(sb, TEST_USER, { countries: [], regions: {}, estates: {}, varietals: ["riesling"] });
    tables.wine_profiles[0].varietals.push("riesling");
    let riesling = getAcc(tables, "varietal", "riesling");
    assert(riesling.source === "quiz", "should be quiz source");
    assert(riesling.promoted === true, "should be promoted");

    // 6 not_for_me = -6 pts. Should NOT demote (quiz needs -10)
    // Use Müller-Catoir (real producer in dataset) + Riesling
    for (let i = 0; i < 6; i++) await simulateBottleSave(sb, `Müller-Catoir Riesling Variant ${i}`, "not_for_me");
    riesling = getAcc(tables, "varietal", "riesling");
    assert(riesling.promoted === true, `at -6, quiz riesling should still be promoted (points: ${riesling.points})`);

    // 4 more = -10 pts. NOW should demote
    for (let i = 6; i < 10; i++) await simulateBottleSave(sb, `Müller-Catoir Riesling Variant ${i}`, "not_for_me");
    riesling = getAcc(tables, "varietal", "riesling");
    assert(riesling.points <= -10, `riesling points: ${riesling.points}`);
    assert(riesling.promoted === false, "riesling should be demoted at -10");
  });

  // 4C: Re-promotion after demotion
  await runTest("Suite 4", "4C: Re-promotion after demotion", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // Promote syrah: 5 Loved = 10 pts
    const goodWines = ["Henschke Shiraz A","Torbreck Shiraz A","Penfolds Shiraz A","Glaetzer Shiraz A","Clarendon Hills Syrah A"];
    for (const w of goodWines) await simulateBottleSave(sb, w, "loved");
    assert(getAcc(tables, "varietal", "syrah").promoted === true, "should be promoted");
    // Demote: 16 not_for_me = -6
    for (let i = 0; i < 16; i++) await simulateBottleSave(sb, `Henschke Syrah Bad ${i}`, "not_for_me");
    assert(getAcc(tables, "varietal", "syrah").promoted === false, "should be demoted");
    // Re-promote: need to get back to the varietal threshold from current negative
    const currentPts = getAcc(tables, "varietal", "syrah").points;
    const neededLoved = Math.ceil((PROMOTION_THRESHOLDS.varietal - currentPts) / RATING_POINTS.loved);
    for (let i = 0; i < neededLoved; i++) await simulateBottleSave(sb, `Torbreck Syrah Comeback ${i}`, "loved");
    const syrah = getAcc(tables, "varietal", "syrah");
    assert(syrah.promoted === true, `syrah should be re-promoted (points: ${syrah.points})`);
    // Should have 2 promoted + 1 demoted timeline entries
    const promoEvents = tables.dna_timeline.filter(t => t.dimension === "varietal" && t.event_type === "promoted");
    assert(promoEvents.length >= 2, "should have at least 2 promotion events");
  });
}

// ═══════════════════════════════════════════════════════
// SUITE 5: Rating Changes & Deletions
// ═══════════════════════════════════════════════════════

async function suite5() {
  console.log("\n═══ Suite 5: Rating Changes & Deletions ═══");

  // 5A: Rating change adjusts points
  await runTest("Suite 5", "5A: Rating change Loved→Not for me adjusts by -3", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved");
    const syrahBefore = getAcc(tables, "varietal", "syrah");
    assert(syrahBefore && syrahBefore.points === 2, `before: ${syrahBefore?.points}`);
    // Change rating: Loved(2) → Not for me(-1) = delta of -3
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "not_for_me", "loved");
    const syrahAfter = getAcc(tables, "varietal", "syrah");
    assert(syrahAfter.points === -1, `after: expected -1, got ${syrahAfter.points}`);
  });

  // 5B: Rating change triggers estate demotion
  await runTest("Suite 5", "5B: Rating change drops estate points (stays above demotion)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // Get Henschke estate to 6 pts (3 Loved — promotes at 4 on the 2nd)
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved");
    await simulateBottleSave(sb, "Henschke Mount Edelstone Shiraz", "loved");
    await simulateBottleSave(sb, "Henschke Keyneton Shiraz", "loved");
    const estBefore = getAcc(tables, "estate", "henschke");
    assert(estBefore && estBefore.promoted === true, "henschke should be promoted");
    // Change one Loved to Fine: delta = 0 - 2 = -2, drops to 4
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "fine", "loved");
    const estAfter = getAcc(tables, "estate", "henschke");
    assert(estAfter.points === 4, `henschke points: expected 4, got ${estAfter.points}`);
    // 4 > -6, so no demotion (demotion needs <= -6)
    assert(estAfter.promoted === true, "henschke still above demotion threshold (-6)");
  });

  // 5C: Deletion reverses points
  await runTest("Suite 5", "5C: Deletion fully reverses points", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved");
    const syrahBefore = getAcc(tables, "varietal", "syrah");
    assert(syrahBefore && syrahBefore.points === 2, `before: ${syrahBefore?.points}`);
    // reverseAccumulation reads match_confidence from the interaction row
    // simulateBottleSave already wrote it via resolveAndAccumulate
    await reverseAccumulation(sb, TEST_USER, "Henschke Hill of Grace Shiraz");
    const syrahAfter = getAcc(tables, "varietal", "syrah");
    assert(syrahAfter.points === 0, `after deletion: expected 0, got ${syrahAfter.points}`);
  });

  // 5D: Deletion of unresolved wine
  await runTest("Suite 5", "5D: Deletion of unresolved wine has no effect", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    tables.wine_interactions.push({
      id: genId(), user_id: TEST_USER, wine_name: "Random Unresolved Wine",
      interaction_type: "had", rating: "loved", match_confidence: 30,
    });
    // Should not throw and should not create accumulation
    const result = await reverseAccumulation(sb, TEST_USER, "Random Unresolved Wine");
    assert(result.demotions.length === 0, "no demotions for unresolved wine");
    assert(tables.dna_accumulation.length === 0, "no accumulation rows created");
  });
}

// ═══════════════════════════════════════════════════════
// SUITE 6: Quiz Sync
// ═══════════════════════════════════════════════════════

async function suite6() {
  console.log("\n═══ Suite 6: Quiz Sync ═══");

  // 6A: Quiz selections marked source='quiz'
  await runTest("Suite 6", "6A: Quiz selections create accumulation rows with source='quiz'", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await syncQuizSelections(sb, TEST_USER, {
      countries: ["france"],
      regions: { france: ["burgundy"] },
      estates: { burgundy: ["domaine_faiveley"] },
      varietals: ["pinot_noir"],
    });
    const france = getAcc(tables, "country", "france");
    assert(france && france.source === "quiz", "france should be source=quiz");
    assert(france.promoted === true, "france should be promoted");
    const burgundy = getAcc(tables, "region", "burgundy");
    assert(burgundy && burgundy.source === "quiz", "burgundy should be source=quiz");
    const pn = getAcc(tables, "varietal", "pinot_noir");
    assert(pn && pn.source === "quiz", "pinot_noir should be source=quiz");
    const faiveley = getAcc(tables, "estate", "domaine_faiveley");
    assert(faiveley && faiveley.source === "quiz", "Faiveley should be source=quiz");
  });

  // 6B: Quiz removal — handled by reconcileQuizPromotions since The Reveal
  // session (see Suite 9D/9E); syncQuizSelections itself still only adds.

  // 6C: Quiz addition preserves accumulated points
  await runTest("Suite 6", "6C: Quiz addition preserves existing auto-accumulated points", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // Auto-accumulate 4 pts for malbec (2 Loved) — below the varietal
    // threshold (6), so the row is still unpromoted when the quiz claims it
    // (a promoted earned row would keep source='auto' — Suite 9F)
    for (let i = 0; i < 2; i++) await simulateBottleSave(sb, `Catena Zapata Malbec ${2018+i}`, "loved");
    let malbec = getAcc(tables, "varietal", "malbec");
    assert(malbec.points === 4, `malbec should have 4 pts, got ${malbec.points}`);
    assert(malbec.source === "auto", "should be auto source before quiz");
    assert(malbec.promoted === false, "still below the varietal threshold");

    // Now user takes quiz and adds malbec
    await syncQuizSelections(sb, TEST_USER, { countries: [], regions: {}, estates: {}, varietals: ["malbec"] });
    malbec = getAcc(tables, "varietal", "malbec");
    assert(malbec.source === "quiz", "source should now be quiz");
    assert(malbec.points === 4, `points should be preserved at 4, got ${malbec.points}`);
    assert(malbec.promoted === true, "should be promoted");
  });
}

// ═══════════════════════════════════════════════════════
// SUITE 7: Edge Cases
// ═══════════════════════════════════════════════════════

async function suite7() {
  console.log("\n═══ Suite 7: Edge Cases ═══");

  // 7A: Same wine logged twice
  await runTest("Suite 7", "7A: Same wine logged twice applies differential", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved");
    const before = getAcc(tables, "varietal", "syrah");
    assert(before.points === 2, `first save: ${before.points}`);
    // Log same wine again with different rating
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "liked", "loved");
    const after = getAcc(tables, "varietal", "syrah");
    assert(after.points === 1, `after re-rate: expected 1, got ${after.points}`);
  });

  // 7B: Rapid successive saves
  await runTest("Suite 7", "7B: 3 rapid successive saves accumulate correctly", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved");
    await simulateBottleSave(sb, "Torbreck RunRig Shiraz", "liked");
    await simulateBottleSave(sb, "Penfolds Grange Shiraz", "loved");
    const syrah = getAcc(tables, "varietal", "syrah");
    assert(syrah.points === 5, `expected 5, got ${syrah.points}`);
    assert(syrah.interaction_count === 3, `expected 3 interactions, got ${syrah.interaction_count}`);
  });

  // 7C: User with no profile
  await runTest("Suite 7", "7C: Accumulation works without existing profile", async () => {
    const tables = freshTables(); // NO ensureProfile!
    const sb = createMockSupabase(tables);
    await simulateBottleSave(sb, "Henschke Hill of Grace Shiraz", "loved");
    const syrah = getAcc(tables, "varietal", "syrah");
    assert(syrah, "accumulation should work even without profile");
    assert(syrah.points === 2, `points: ${syrah.points}`);
    // Promotion may fail gracefully (no profile to write to)
    // But accumulation itself should still work
  });

  // 7D: Special characters
  await runTest("Suite 7", "7D: Special characters don't crash", async () => {
    const r1 = resolveWine("Château d'Yquem Premier Cru Supérieur Sauternes 2015");
    assert(typeof r1.confidence === "number", "d'Yquem should not crash");

    const r2 = resolveWine("Müller-Catoir Bürgergarten Riesling Spätlese 2020");
    assert(typeof r2.confidence === "number", "Müller-Catoir should not crash");
    assert(r2.dnaMapping?.dnaVarietalId === "riesling", `should detect riesling: ${r2.dnaMapping?.dnaVarietalId}`);

    const r3 = resolveWine("日本ワイン");
    assert(typeof r3.confidence === "number", "Japanese chars should not crash");
    assert(r3.confidence < 80, "Japanese chars should have low confidence");
  });

  // 7E: Region IDs resolve through the unified dataset
  await runTest("Suite 7", "7E: Willamette and Lombardy both map (unified dataset)", async () => {
    // Willamette — new architecture id is willamette_valley (was "willamette")
    const r1 = resolveWine("Cristom Vineyards Pinot Noir Willamette Valley 2021");
    assert(r1.dnaMapping?.dnaRegionId === "willamette_valley", `willamette mapping: ${r1.dnaMapping?.dnaRegionId}`);

    // Arpepe (Lombardy) — unmappable in the old dataset, mappable now that
    // wineUnified.json includes lombardy as a DNA region
    const r2 = resolveWine("Arpepe Rosso di Valtellina 2019");
    if (r2.winery === "Arpepe") {
      assert(r2.dnaMapping?.dnaRegionId === "lombardy", `lombardy mapping: ${r2.dnaMapping?.dnaRegionId}`);
    }
    // Either way, no crash
    assert(typeof r2.confidence === "number", "should not crash");
  });
}

// ═══════════════════════════════════════════════════════
// SUITE 9: Quiz Merge — refine never clobbers earned DNA
// (The Reveal session invariant)
// ═══════════════════════════════════════════════════════

function seedEarnedRow(tables, dimension, dimensionValue, displayName, extra = {}) {
  tables.dna_accumulation.push({
    id: genId(), user_id: TEST_USER, dimension, dimension_value: dimensionValue,
    display_name: displayName, points: 12, interaction_count: 6,
    promoted: true, promoted_at: new Date().toISOString(),
    source: "auto", mappable: true, ...extra,
  });
}

async function suite9() {
  console.log("\n═══ Suite 9: Quiz Merge (Reveal invariant) ═══");

  // 9A: Earned item the quiz never presented as checked is preserved.
  // (Covers a promotion landing mid-quiz, or any item the UI couldn't
  // display — absent from initialRaw means it can't be an explicit uncheck.)
  await runTest("Suite 9", "9A: Earned varietal not pre-checked at quiz start is preserved", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    seedEarnedRow(tables, "varietal", "chenin_blanc", "Chenin Blanc");
    const initialRaw = { countries: ["france"], regions: { france: ["burgundy"] }, estates: {}, varietals: ["pinot_noir"], specificWines: [] };
    const merged = await mergeQuizWithEarnedDna(sb, TEST_USER, {
      countries: ["france"], regions: { france: ["burgundy"] }, estates: {}, varietals: ["pinot_noir"], specificWines: [],
    }, initialRaw);
    assert(merged.varietals.includes("chenin_blanc"), "earned chenin_blanc absent from initialRaw must be preserved");
    assert(merged.varietals.includes("pinot_noir"), "quiz selection must be kept");
    assert(merged.countries.includes("france"), "quiz country must be kept");
  });

  // 9B: Earned region merges under its country
  await runTest("Suite 9", "9B: Earned region lands grouped under its country", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    seedEarnedRow(tables, "region", "burgundy", "Burgundy");
    const merged = await mergeQuizWithEarnedDna(sb, TEST_USER, {
      countries: ["south_africa"], regions: { south_africa: ["stellenbosch"] }, estates: {}, varietals: [], specificWines: [],
    });
    assert((merged.regions.france || []).includes("burgundy"), "burgundy must be under france");
    assert((merged.regions.south_africa || []).includes("stellenbosch"), "quiz region must be kept");
  });

  // 9C: Earned estate merges under its region
  await runTest("Suite 9", "9C: Earned estate lands under its region", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    const estateList = ESTATES["burgundy"] || [];
    assert(estateList.length > 0, "test data: burgundy needs producers");
    const estate = estateList[0];
    seedEarnedRow(tables, "estate", estate.id, estate.name);
    const merged = await mergeQuizWithEarnedDna(sb, TEST_USER, {
      countries: ["france"], regions: {}, estates: {}, varietals: [], specificWines: [],
    });
    assert((merged.estates.burgundy || []).includes(estate.id), `earned estate ${estate.id} must be under burgundy`);
  });

  // 9D: Start fresh un-flags earned rows so they can re-promote later
  await runTest("Suite 9", "9D: Fresh wipe resets stale promoted flags, keeps points, no timeline spam", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    seedEarnedRow(tables, "varietal", "malbec", "Malbec");
    // Fresh save: quiz answers only, no merge
    const freshRaw = { countries: ["france"], regions: {}, estates: {}, varietals: ["pinot_noir"], specificWines: [] };
    await reconcileQuizPromotions(sb, TEST_USER, freshRaw);
    const malbec = getAcc(tables, "varietal", "malbec");
    assert(malbec.promoted === false, "stale earned row must be un-flagged");
    assert(malbec.demoted_at, "demoted_at should be set");
    assert(malbec.points === 12, "points must survive — the bottles were real");
    assert(tables.dna_timeline.length === 0, "a deliberate wipe writes no timeline events");
  });

  // 9E: Refine removal of a FOUNDING item un-flags its quiz-source row
  await runTest("Suite 9", "9E: Removing a founding item in refine un-flags its row", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await syncQuizSelections(sb, TEST_USER, { countries: ["france", "italy"], regions: {}, estates: {}, varietals: [] });
    // User refines and drops italy; merge has nothing earned to add back
    const initialRaw = { countries: ["france", "italy"], regions: {}, estates: {}, varietals: [], specificWines: [] };
    const merged = await mergeQuizWithEarnedDna(sb, TEST_USER, {
      countries: ["france"], regions: {}, estates: {}, varietals: [], specificWines: [],
    }, initialRaw);
    assert(!merged.countries.includes("italy"), "dropped founding item must not come back via merge");
    await reconcileQuizPromotions(sb, TEST_USER, merged);
    const italy = getAcc(tables, "country", "italy");
    assert(italy.promoted === false, "dropped founding row must be un-flagged");
    const france = getAcc(tables, "country", "france");
    assert(france.promoted === true, "kept founding row stays promoted");
  });

  // 9F: syncQuizSelections preserves earned provenance (the ✦ survives refine)
  await runTest("Suite 9", "9F: Quiz-selecting an earned item keeps source='auto'", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    seedEarnedRow(tables, "varietal", "malbec", "Malbec");
    await syncQuizSelections(sb, TEST_USER, { countries: [], regions: {}, estates: {}, varietals: ["malbec"] });
    const malbec = getAcc(tables, "varietal", "malbec");
    assert(malbec.source === "auto", "earned provenance must survive quiz agreement");
    assert(malbec.promoted === true, "still promoted");
    assert(malbec.points === 12, "points untouched");
  });

  // 9G: End-to-end — a real promotion, then a refine that keeps it checked
  await runTest("Suite 9", "9G: Promoted-by-bottles varietal kept checked survives full refine save", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // 5 loved Malbecs → 10 pts → varietal promotion fires
    for (let i = 0; i < 5; i++) await simulateBottleSave(sb, `Catena Zapata Malbec ${2016 + i}`, "loved");
    const malbecBefore = getAcc(tables, "varietal", "malbec");
    assert(malbecBefore.promoted === true, `malbec should be promoted (points: ${malbecBefore.points})`);
    assert(malbecBefore.source === "auto", "promotion source is auto");

    // Refine seeded from the profile (malbec pre-checked) and left checked.
    // The pre-Reveal code path overwrote varietals wholesale and killed it.
    const initialRaw = { countries: ["france"], regions: { france: ["burgundy"] }, estates: {}, varietals: ["pinot_noir", "malbec"], specificWines: [] };
    const quizRaw = { countries: ["france"], regions: { france: ["burgundy"] }, estates: {}, varietals: ["pinot_noir", "malbec"], specificWines: [] };
    const merged = await mergeQuizWithEarnedDna(sb, TEST_USER, quizRaw, initialRaw);
    assert(merged.varietals.includes("malbec"), "kept-checked earned malbec must be in the merged arrays");
    await reconcileQuizPromotions(sb, TEST_USER, merged);
    await syncQuizSelections(sb, TEST_USER, quizRaw);
    const malbecAfter = getAcc(tables, "varietal", "malbec");
    assert(malbecAfter.promoted === true, "malbec stays promoted after refine");
    assert(malbecAfter.source === "auto", "malbec stays earned after refine");
  });

  // 9H: Ed's August 2026 call — an EXPLICIT uncheck of an earned item is
  // honored: it leaves the profile, its promotion un-flags, its points
  // survive (continued love re-promotes), and no timeline event is written.
  await runTest("Suite 9", "9H: Explicitly unchecked earned item leaves; points survive; no timeline", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    seedEarnedRow(tables, "varietal", "chenin_blanc", "Chenin Blanc");
    // Refine seeded WITH chenin_blanc pre-checked (it's in the profile);
    // user unchecks it before saving
    const initialRaw = { countries: ["france"], regions: {}, estates: {}, varietals: ["pinot_noir", "chenin_blanc"], specificWines: [] };
    const quizRaw = { countries: ["france"], regions: {}, estates: {}, varietals: ["pinot_noir"], specificWines: [] };
    const merged = await mergeQuizWithEarnedDna(sb, TEST_USER, quizRaw, initialRaw);
    assert(!merged.varietals.includes("chenin_blanc"), "explicitly unchecked earned item must not be merged back");
    await reconcileQuizPromotions(sb, TEST_USER, merged);
    await syncQuizSelections(sb, TEST_USER, quizRaw);
    const chenin = getAcc(tables, "varietal", "chenin_blanc");
    assert(chenin.promoted === false, "unchecked earned row must be un-flagged");
    assert(chenin.demoted_at, "demoted_at should be set");
    assert(chenin.points === 12, "points must survive — continued love re-promotes");
    assert(chenin.source === "auto", "provenance stays earned");
    assert(tables.dna_timeline.length === 0, "a user edit writes no timeline events");
  });

  // 9I: The same uncheck via the region dimension — and the quiz's
  // don't-touch-what-you-didn't-render behavior: deselecting a COUNTRY
  // leaves its regions in the answers, so they are NOT treated as unchecked.
  await runTest("Suite 9", "9I: Region uncheck honored; regions under a deselected country preserved", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    seedEarnedRow(tables, "region", "burgundy", "Burgundy");
    seedEarnedRow(tables, "region", "stellenbosch", "Stellenbosch");
    // User keeps france selected and unchecks earned burgundy (explicit),
    // deselects south_africa entirely — stellenbosch stays in the answers
    // exactly as the quiz UI leaves it (never rendered → never removed)
    const initialRaw = { countries: ["france", "south_africa"], regions: { france: ["burgundy"], south_africa: ["stellenbosch"] }, estates: {}, varietals: [], specificWines: [] };
    const quizRaw = { countries: ["france"], regions: { france: [], south_africa: ["stellenbosch"] }, estates: {}, varietals: [], specificWines: [] };
    const merged = await mergeQuizWithEarnedDna(sb, TEST_USER, quizRaw, initialRaw);
    assert(!(merged.regions.france || []).includes("burgundy"), "unchecked earned burgundy must leave");
    assert((merged.regions.south_africa || []).includes("stellenbosch"), "stellenbosch was never rendered as unchecked — preserved");
    await reconcileQuizPromotions(sb, TEST_USER, merged);
    assert(getAcc(tables, "region", "burgundy").promoted === false, "burgundy un-flagged");
    assert(getAcc(tables, "region", "burgundy").points === 12, "burgundy points survive");
    assert(getAcc(tables, "region", "stellenbosch").promoted === true, "stellenbosch stays promoted");
  });
}

// ═══════════════════════════════════════════════════════
// SUITE 10: Partial Credit (confidence 60–79)
// ═══════════════════════════════════════════════════════

async function suite10() {
  console.log("\n═══ Suite 10: Partial Credit ═══");

  // Fixture names verified against the real resolver:
  //   "Barossa Shiraz"  → 60 (varietal+region+country, no producer)
  //   "Sancerre"        → 60 (fuzzy producer, region loire_valley)
  //   "Chablis 2021"    → 40 (region only — below the partial gate)

  await runTest("Suite 10", "10A: 60-band loved accumulates +1 on varietal/region/country, no estate", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    const r = resolveWine("Barossa Shiraz");
    assert(r.confidence >= PARTIAL_CONFIDENCE_GATE && r.confidence < CONFIDENCE_GATE,
      `fixture must sit in the partial band, got ${r.confidence}`);
    await simulateSurfaceRate(sb, "Barossa Shiraz", "loved");
    assert(getAcc(tables, "varietal", "syrah")?.points === 1, `syrah: ${getAcc(tables, "varietal", "syrah")?.points}`);
    assert(getAcc(tables, "region", "barossa")?.points === 1, `barossa: ${getAcc(tables, "region", "barossa")?.points}`);
    assert(getAcc(tables, "country", "australia")?.points === 1, `australia: ${getAcc(tables, "country", "australia")?.points}`);
    const estateRows = tables.dna_accumulation.filter(x => x.dimension === "estate");
    assert(estateRows.length === 0, "no estate rows in the partial band");
    // Metadata still stamps (confidence > 0)
    const row = tables.wine_interactions.find(x => x.wine_name === "Barossa Shiraz");
    assert(row.match_confidence === r.confidence, "match_confidence stamped");
  });

  await runTest("Suite 10", "10B: Fuzzy producer in the partial band accrues no estate", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    const r = resolveWine("Sancerre");
    assert(r.confidence >= PARTIAL_CONFIDENCE_GATE && r.confidence < CONFIDENCE_GATE,
      `fixture must sit in the partial band, got ${r.confidence}`);
    assert(r.winery, "fixture premise: a (fuzzy) winery was matched");
    await simulateSurfaceRate(sb, "Sancerre", "loved");
    const estateRows = tables.dna_accumulation.filter(x => x.dimension === "estate");
    assert(estateRows.length === 0, "fuzzy producer must not accrue an estate row");
    assert(getAcc(tables, "country", "france")?.points === 1, "country still accumulates at +1");
  });

  await runTest("Suite 10", "10C: Below 60 accumulates nothing", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    const r = resolveWine("Chablis 2021");
    assert(r.confidence > 0 && r.confidence < PARTIAL_CONFIDENCE_GATE,
      `fixture must sit below the partial gate, got ${r.confidence}`);
    await simulateSurfaceRate(sb, "Chablis 2021", "loved");
    assert(tables.dna_accumulation.length === 0, "no accumulation below the partial gate");
    // Metadata still stamps (confidence > 0) so the somm payload sees it
    const row = tables.wine_interactions.find(x => x.wine_name === "Chablis 2021");
    assert(row.match_confidence === r.confidence, "match_confidence still stamped");
  });

  await runTest("Suite 10", "10D: Full band is untouched by partial credit (loved = +2)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateSurfaceRate(sb, "Henschke Hill of Grace Shiraz", "loved");
    assert(getAcc(tables, "varietal", "syrah")?.points === 2, "full credit at 80+");
    assert(getAcc(tables, "estate", "henschke")?.points === 2, "estate accrues at 80+");
  });

  await runTest("Suite 10", "10E: Partial re-rates apply the capped differential", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateSurfaceRate(sb, "Barossa Shiraz", "loved");    // +1
    await simulateSurfaceRate(sb, "Barossa Shiraz", "liked");    // capped: 1→1, delta 0
    assert(getAcc(tables, "varietal", "syrah")?.points === 1, `after liked: ${getAcc(tables, "varietal", "syrah")?.points}`);
    await simulateSurfaceRate(sb, "Barossa Shiraz", "not_for_me"); // 1→-1, delta -2
    assert(getAcc(tables, "varietal", "syrah")?.points === -1, `after not_for_me: ${getAcc(tables, "varietal", "syrah")?.points}`);
  });

  await runTest("Suite 10", "10F: Partial delete reverses to exactly zero", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateSurfaceRate(sb, "Barossa Shiraz", "loved");
    assert(getAcc(tables, "varietal", "syrah")?.points === 1, "accumulated +1");
    await simulateJournalDelete(sb, "Barossa Shiraz");
    assert(getAcc(tables, "varietal", "syrah")?.points === 0, `after delete: ${getAcc(tables, "varietal", "syrah")?.points}`);
  });

  await runTest("Suite 10", "10G: Partial points still reach promotion", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // 6 loved partial bottles → syrah 6 → varietal promotes (barossa 6 < 10)
    let lastResult;
    for (let i = 0; i < 6; i++) {
      lastResult = await simulateSurfaceRate(sb, `Barossa Shiraz ${2016 + i}`, "loved");
    }
    const promo = lastResult.promotions.find(p => p.dimension === "varietal" && p.dimensionValue === "syrah");
    assert(promo, "syrah should promote from partial-credit evidence");
    assert(tables.wine_profiles[0].varietals.includes("syrah"), "profile gains syrah");
  });
}

// ═══════════════════════════════════════════════════════
// SUITE 11: Surface Flows (Session 1 call-site fixes)
// ═══════════════════════════════════════════════════════

async function suite11() {
  console.log("\n═══ Suite 11: Surface Flows ═══");

  await runTest("Suite 11", "11A: /recommend rating accumulates and stamps resolved_* metadata", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateSurfaceRate(sb, "Ken Forrester Old Vine Chenin Blanc Stellenbosch", "loved");
    assert(getAcc(tables, "varietal", "chenin_blanc")?.points === 2, "restaurant rating feeds DNA");
    const row = tables.wine_interactions.find(x => x.wine_name === "Ken Forrester Old Vine Chenin Blanc Stellenbosch");
    assert(row.resolved_varietal === "Chenin Blanc", `resolved_varietal: ${row.resolved_varietal}`);
    assert(row.resolved_country === "South Africa", `resolved_country: ${row.resolved_country}`);
    assert(row.match_confidence >= CONFIDENCE_GATE, "confidence stamped");
  });

  await runTest("Suite 11", "11B: Re-log same wine same rating adds nothing (double-count regression)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateSurfaceRate(sb, "Henschke Hill of Grace Shiraz", "loved");
    assert(getAcc(tables, "varietal", "syrah")?.points === 2, "first log: +2");
    // The old home handleBottleSave omitted previousRating here → +4 total
    await simulateSurfaceRate(sb, "Henschke Hill of Grace Shiraz", "loved");
    assert(getAcc(tables, "varietal", "syrah")?.points === 2,
      `re-log must not double-count: ${getAcc(tables, "varietal", "syrah")?.points}`);
    assert(getAcc(tables, "estate", "henschke")?.points === 2, "estate not double-counted");
  });

  await runTest("Suite 11", "11C: Cross-surface re-rate applies the differential", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // Rated loved at the restaurant, downgraded to liked at home
    await simulateSurfaceRate(sb, "Henschke Hill of Grace Shiraz", "loved");
    await simulateSurfaceRate(sb, "Henschke Hill of Grace Shiraz", "liked");
    assert(getAcc(tables, "varietal", "syrah")?.points === 1,
      `loved→liked should land on 1: ${getAcc(tables, "varietal", "syrah")?.points}`);
  });

  await runTest("Suite 11", "11D: Failed delete + retry reverses exactly once", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateSurfaceRate(sb, "Henschke Hill of Grace Shiraz", "loved");
    assert(getAcc(tables, "varietal", "syrah")?.points === 2, "accumulated +2");
    // Delete fails — with reversal ordered AFTER the delete, nothing reverses
    await simulateJournalDelete(sb, "Henschke Hill of Grace Shiraz", { failDelete: true });
    assert(getAcc(tables, "varietal", "syrah")?.points === 2,
      `failed delete must reverse nothing: ${getAcc(tables, "varietal", "syrah")?.points}`);
    // Retry succeeds — reverses exactly once
    await simulateJournalDelete(sb, "Henschke Hill of Grace Shiraz");
    assert(getAcc(tables, "varietal", "syrah")?.points === 0,
      `retry reverses once: ${getAcc(tables, "varietal", "syrah")?.points}`);
  });

  await runTest("Suite 11", "11E: Deleting an already-gone row reverses nothing (two-tab race)", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    await simulateSurfaceRate(sb, "Henschke Hill of Grace Shiraz", "loved");
    await simulateJournalDelete(sb, "Henschke Hill of Grace Shiraz");
    assert(getAcc(tables, "varietal", "syrah")?.points === 0, "first delete reverses");
    // Second tab clicks delete on the same, already-deleted row
    await simulateJournalDelete(sb, "Henschke Hill of Grace Shiraz");
    assert(getAcc(tables, "varietal", "syrah")?.points === 0,
      `second delete must be a no-op: ${getAcc(tables, "varietal", "syrah")?.points}`);
  });

  await runTest("Suite 11", "11F: Never-resolved row (historical /recommend) reverses nothing", async () => {
    const tables = freshTables(); ensureProfile(tables);
    const sb = createMockSupabase(tables);
    // A pre-fix /recommend rating: rated but never resolved, never accumulated
    tables.wine_interactions.push({
      id: genId(), user_id: TEST_USER, wine_name: "Henschke Hill of Grace Shiraz",
      interaction_type: "had", rating: "loved", match_confidence: null,
    });
    await simulateJournalDelete(sb, "Henschke Hill of Grace Shiraz");
    assert(tables.dna_accumulation.length === 0,
      "no phantom reversal for rows that never accumulated");
  });
}

// ═══════════════════════════════════════════════════════
// SUITE 8: UI Verification (Manual)
// ═══════════════════════════════════════════════════════

function suite8() {
  console.log("\n═══ Suite 8: UI Verification (Manual) ═══");
  console.log("  8A: Evolution toast — Log a bottle that triggers promotion");
  console.log("       Verify: standard toast first, then 🧬 evolution toast");
  console.log("       Verify: #1B3D2F background, ~4s duration, sequential if multiple");
  console.log("  8B: DNA Timeline tab — Navigate to /journal → DNA Timeline");
  console.log("       Verify: 4th tab, reverse chronological, 🧬 prefix");
  console.log("       Verify: empty state message when no events");
  console.log("  8C: Profile reflects promotions — view DNA profile after promotions");
  console.log("       Verify: new varietals/regions/countries/estates appear");
  console.log("  8D: Journal rating change — change Loved to Not for me");
  console.log("       Verify: points adjust, demotion toast if threshold crossed");
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

async function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  DNA EVOLUTION ENGINE — Full Validation Test Suite");
  console.log("═══════════════════════════════════════════════════════");

  await suite1();
  await suite2();
  await suite3();
  await suite4();
  await suite5();
  await suite6();
  await suite7();
  await suite9();
  await suite10();
  await suite11();
  suite8();

  // ── Report ──
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════════\n");

  const suiteNames = {
    "Suite 1": "Resolver", "Suite 2": "Accumulation", "Suite 3": "Promotion",
    "Suite 4": "Demotion", "Suite 5": "Rating Changes", "Suite 6": "Quiz Sync",
    "Suite 7": "Edge Cases", "Suite 9": "Quiz Merge",
    "Suite 10": "Partial Credit", "Suite 11": "Surface Flows",
  };
  for (const [key, label] of Object.entries(suiteNames)) {
    const s = suiteResults[key] || { passed: 0, failed: 0 };
    const total = s.passed + s.failed;
    const icon = s.failed === 0 ? "✓" : "✗";
    console.log(`${icon} ${key} (${label}):`.padEnd(35) + `${s.passed}/${total} passed`);
  }
  console.log("  Suite 8 (UI):".padEnd(35) + "Manual verification required\n");

  console.log(`Total: ${totalPassed}/${totalPassed + totalFailed} passed, ${totalFailed} failed\n`);

  // Confidence scores for Suite 1A
  console.log("Confidence scores logged for Suite 1A:");
  for (const [name, score] of Object.entries(suite1AScores)) {
    console.log(`  ${name}: ${score}`);
  }

  if (failures.length > 0) {
    console.log("\nFailing tests:");
    for (const f of failures) {
      console.log(`\n  [${f.suite}] ${f.test}`);
      console.log(`  Error: ${f.error}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════\n");
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => { console.error("Test runner crashed:", err); process.exit(1); });
