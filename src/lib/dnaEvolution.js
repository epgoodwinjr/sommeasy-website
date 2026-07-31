// dnaEvolution.js — DNA Evolution Engine
// Accumulation tracker, promotion/demotion engine, threshold constants
// Handles point tallying from resolved wine interactions and promotes
// new entries into wine_profiles when thresholds are reached.

import {
  resolveWine,
  findCountryForRegion,
  isValidDnaVarietal,
  isValidDnaRegion,
  isValidDnaCountry,
  getRegionDisplayName,
  getCountryDisplayName,
  DNA_TO_VARIETY_NAME,
} from "./wineResolver";
import wineUnified from "./wineUnified.json";
import {
  RATING_POINTS,
  PARTIAL_RATING_POINTS,
  PROMOTION_THRESHOLDS,
  ROLLUP_THRESHOLDS,
  DEMOTION_THRESHOLDS,
  CONFIDENCE_GATE,
  PARTIAL_CONFIDENCE_GATE,
} from "./dnaThresholds";

const PRODUCERS = wineUnified.producers;

// Confidence band → points table. Full credit at CONFIDENCE_GATE+, partial
// credit down to PARTIAL_CONFIDENCE_GATE, no accumulation below. resolveWine
// is deterministic, so a wine's band — and therefore its table — is stable
// across re-rates and deletions, which keeps deltas exactly reversible.
function pointsTableFor(confidence) {
  if (confidence >= CONFIDENCE_GATE) return RATING_POINTS;
  if (confidence >= PARTIAL_CONFIDENCE_GATE) return PARTIAL_RATING_POINTS;
  return null;
}


// ═══════════════════════════════════════════════════════
// RESOLVE AND ACCUMULATE
// ═══════════════════════════════════════════════════════

/**
 * Resolve a wine name and update accumulation points.
 * Called after saving a wine interaction.
 *
 * @param {object} supabase - Supabase client
 * @param {string} userId - Current user ID
 * @param {string} wineName - Wine name as entered
 * @param {string} rating - 'loved', 'liked', 'fine', 'not_for_me'
 * @param {string|null} previousRating - Previous rating if re-rating, null if new
 * @returns {object} { resolution, dimensions, promotions, demotions } —
 *   dimensions is what this wine's confidence band accumulates toward
 *   (empty below the partial gate), returned even on a zero delta so the
 *   milestone hook can judge the wine, not the delta
 */
export async function resolveAndAccumulate(supabase, userId, wineName, rating, previousRating = null) {
  // Step 1: Resolve wine metadata
  const resolution = resolveWine(wineName);

  // Step 2: Write resolved metadata back to wine_interactions
  if (resolution.confidence > 0) {
    await supabase.from("wine_interactions").update({
      resolved_winery: resolution.winery,
      resolved_varietal: resolution.varietal,
      resolved_region: resolution.region,
      resolved_province: resolution.province,
      resolved_country: resolution.country,
      match_confidence: resolution.confidence,
      resolved_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("wine_name", wineName);
  }

  // Step 3: Only accumulate if confidence reaches at least the partial band
  const pointsTable = pointsTableFor(resolution.confidence);
  if (!pointsTable) {
    return { resolution, dimensions: [], promotions: [], demotions: [] };
  }
  const partial = pointsTable === PARTIAL_RATING_POINTS;

  // Step 4: Determine which dimensions this band accumulates toward
  const dimensionUpdates = buildDimensionUpdates(resolution, { partial });

  // Step 5: Calculate point delta
  const newPoints = pointsTable[rating] ?? 0;
  const oldPoints = previousRating ? (pointsTable[previousRating] ?? 0) : 0;
  const pointDelta = newPoints - oldPoints;

  if (pointDelta === 0) {
    return { resolution, dimensions: dimensionUpdates, promotions: [], demotions: [] };
  }

  // Step 6: Apply point deltas to dna_accumulation
  for (const dim of dimensionUpdates) {
    await upsertAccumulation(supabase, userId, dim, pointDelta);
  }

  // Step 7: Check promotions and demotions
  const promotions = await checkPromotions(supabase, userId, dimensionUpdates);
  const demotions = await checkDemotions(supabase, userId, dimensionUpdates);

  // Step 8: Apply promotions to wine_profiles
  if (promotions.length > 0) {
    await applyPromotions(supabase, userId, promotions);
  }

  // Step 9: Apply demotions to wine_profiles
  if (demotions.length > 0) {
    await applyDemotions(supabase, userId, demotions);
  }

  return { resolution, dimensions: dimensionUpdates, promotions, demotions };
}


// ═══════════════════════════════════════════════════════
// DIMENSION UPDATES
// ═══════════════════════════════════════════════════════

/**
 * Build the list of dimensions to update from a resolution result.
 * Each entry: { dimension, dimensionValue, displayName, mappable }
 * In the partial band the estate dimension is skipped entirely — a fuzzy
 * producer match must not accrue toward an estate promotion.
 */
function buildDimensionUpdates(resolution, { partial = false } = {}) {
  const updates = [];
  const { dnaMapping, isBlend } = resolution;
  if (!dnaMapping) return updates;

  // Estate (winery) — only if it maps to a DNA estate
  if (resolution.winery && !partial) {
    // Try to find the estate in PRODUCERS
    let estateId = dnaMapping.dnaEstateId;
    let estateMappable = dnaMapping.estateMappable;

    if (!estateId) {
      // Producer is in WineMag but not in DNA estates — still accumulate but mark unmappable
      // Use normalized winery name as the dimension_value
      const normName = resolution.winery.toLowerCase().replace(/[^a-z0-9]/g, "_");
      updates.push({
        dimension: "estate",
        dimensionValue: normName,
        displayName: resolution.winery,
        mappable: false,
      });
    } else {
      updates.push({
        dimension: "estate",
        dimensionValue: estateId,
        displayName: resolution.winery,
        mappable: true,
      });
    }
  }

  // Varietal — skip blends per spec
  if (dnaMapping.dnaVarietalId && !isBlend) {
    updates.push({
      dimension: "varietal",
      dimensionValue: dnaMapping.dnaVarietalId,
      displayName: DNA_TO_VARIETY_NAME[dnaMapping.dnaVarietalId] || resolution.varietal,
      mappable: dnaMapping.varietalMappable !== false,
    });
  }

  // Region
  if (dnaMapping.dnaRegionId) {
    updates.push({
      dimension: "region",
      dimensionValue: dnaMapping.dnaRegionId,
      displayName: getRegionDisplayName(dnaMapping.dnaRegionId),
      mappable: dnaMapping.regionMappable !== false,
    });
  }

  // Country
  if (dnaMapping.dnaCountryId) {
    updates.push({
      dimension: "country",
      dimensionValue: dnaMapping.dnaCountryId,
      displayName: getCountryDisplayName(dnaMapping.dnaCountryId),
      mappable: dnaMapping.countryMappable !== false,
    });
  }

  return updates;
}


// ═══════════════════════════════════════════════════════
// ACCUMULATION
// ═══════════════════════════════════════════════════════

async function upsertAccumulation(supabase, userId, dim, pointDelta) {
  // Try to fetch existing row
  const { data: existing } = await supabase
    .from("dna_accumulation")
    .select("id, points, interaction_count")
    .eq("user_id", userId)
    .eq("dimension", dim.dimension)
    .eq("dimension_value", dim.dimensionValue)
    .single();

  if (existing) {
    // Update existing row
    await supabase.from("dna_accumulation").update({
      points: existing.points + pointDelta,
      interaction_count: existing.interaction_count + (pointDelta > 0 ? 1 : 0),
      display_name: dim.displayName,
      mappable: dim.mappable,
    }).eq("id", existing.id);
  } else {
    // Insert new row
    await supabase.from("dna_accumulation").insert({
      user_id: userId,
      dimension: dim.dimension,
      dimension_value: dim.dimensionValue,
      display_name: dim.displayName,
      points: pointDelta,
      interaction_count: pointDelta > 0 ? 1 : 0,
      mappable: dim.mappable,
      source: "auto",
    });
  }
}


// ═══════════════════════════════════════════════════════
// PROMOTION CHECKS
// ═══════════════════════════════════════════════════════

async function checkPromotions(supabase, userId, dimensionUpdates) {
  const promotions = [];

  for (const dim of dimensionUpdates) {
    // Skip unmappable dimensions — can't write to wine_profiles
    if (!dim.mappable) continue;

    const { data: acc } = await supabase
      .from("dna_accumulation")
      .select("id, points, promoted, dimension, dimension_value, display_name")
      .eq("user_id", userId)
      .eq("dimension", dim.dimension)
      .eq("dimension_value", dim.dimensionValue)
      .single();

    if (!acc || acc.promoted) continue;

    const threshold = PROMOTION_THRESHOLDS[dim.dimension];
    if (acc.points >= threshold) {
      promotions.push({
        id: acc.id,
        dimension: acc.dimension,
        dimensionValue: acc.dimension_value,
        displayName: acc.display_name,
      });
    }
  }

  // Check roll-up promotions (estates → region, regions → country)
  const rollupPromotions = await checkRollupPromotions(supabase, userId);
  promotions.push(...rollupPromotions);

  return promotions;
}

async function checkRollupPromotions(supabase, userId) {
  const promotions = [];

  // Check: 3+ promoted estates in same region → promote that region
  const { data: promotedEstates } = await supabase
    .from("dna_accumulation")
    .select("dimension_value")
    .eq("user_id", userId)
    .eq("dimension", "estate")
    .eq("promoted", true);

  if (promotedEstates && promotedEstates.length >= ROLLUP_THRESHOLDS.region) {
    // Count estates per region
    const regionCounts = {};
    for (const est of promotedEstates) {
      // Find which region this estate belongs to
      for (const [regionId, estates] of Object.entries(PRODUCERS)) {
        if (estates.some(e => e.id === est.dimension_value)) {
          regionCounts[regionId] = (regionCounts[regionId] || 0) + 1;
          break;
        }
      }
    }

    for (const [regionId, count] of Object.entries(regionCounts)) {
      if (count >= ROLLUP_THRESHOLDS.region && isValidDnaRegion(regionId)) {
        // Check if region is already promoted
        const { data: regionAcc } = await supabase
          .from("dna_accumulation")
          .select("id, promoted")
          .eq("user_id", userId)
          .eq("dimension", "region")
          .eq("dimension_value", regionId)
          .single();

        if (regionAcc && !regionAcc.promoted) {
          promotions.push({
            id: regionAcc.id,
            dimension: "region",
            dimensionValue: regionId,
            displayName: getRegionDisplayName(regionId),
            isRollup: true,
          });
        } else if (!regionAcc) {
          // Create the accumulation row and promote it
          const { data: newAcc } = await supabase.from("dna_accumulation").insert({
            user_id: userId,
            dimension: "region",
            dimension_value: regionId,
            display_name: getRegionDisplayName(regionId),
            points: 0,
            interaction_count: 0,
            mappable: true,
            source: "auto",
          }).select("id").single();

          if (newAcc) {
            promotions.push({
              id: newAcc.id,
              dimension: "region",
              dimensionValue: regionId,
              displayName: getRegionDisplayName(regionId),
              isRollup: true,
            });
          }
        }
      }
    }
  }

  // Check: 3+ promoted regions in same country → promote that country
  const { data: promotedRegions } = await supabase
    .from("dna_accumulation")
    .select("dimension_value")
    .eq("user_id", userId)
    .eq("dimension", "region")
    .eq("promoted", true);

  if (promotedRegions && promotedRegions.length >= ROLLUP_THRESHOLDS.country) {
    const countryCounts = {};
    for (const reg of promotedRegions) {
      const countryId = findCountryForRegion(reg.dimension_value);
      if (countryId) {
        countryCounts[countryId] = (countryCounts[countryId] || 0) + 1;
      }
    }

    for (const [countryId, count] of Object.entries(countryCounts)) {
      if (count >= ROLLUP_THRESHOLDS.country && isValidDnaCountry(countryId)) {
        const { data: countryAcc } = await supabase
          .from("dna_accumulation")
          .select("id, promoted")
          .eq("user_id", userId)
          .eq("dimension", "country")
          .eq("dimension_value", countryId)
          .single();

        if (countryAcc && !countryAcc.promoted) {
          promotions.push({
            id: countryAcc.id,
            dimension: "country",
            dimensionValue: countryId,
            displayName: getCountryDisplayName(countryId),
            isRollup: true,
          });
        } else if (!countryAcc) {
          const { data: newAcc } = await supabase.from("dna_accumulation").insert({
            user_id: userId,
            dimension: "country",
            dimension_value: countryId,
            display_name: getCountryDisplayName(countryId),
            points: 0,
            interaction_count: 0,
            mappable: true,
            source: "auto",
          }).select("id").single();

          if (newAcc) {
            promotions.push({
              id: newAcc.id,
              dimension: "country",
              dimensionValue: countryId,
              displayName: getCountryDisplayName(countryId),
              isRollup: true,
            });
          }
        }
      }
    }
  }

  return promotions;
}


// ═══════════════════════════════════════════════════════
// DEMOTION CHECKS
// ═══════════════════════════════════════════════════════

async function checkDemotions(supabase, userId, dimensionUpdates) {
  const demotions = [];

  for (const dim of dimensionUpdates) {
    if (!dim.mappable) continue;

    const { data: acc } = await supabase
      .from("dna_accumulation")
      .select("id, points, promoted, source, dimension, dimension_value, display_name")
      .eq("user_id", userId)
      .eq("dimension", dim.dimension)
      .eq("dimension_value", dim.dimensionValue)
      .single();

    if (!acc || !acc.promoted) continue;

    const threshold = acc.source === "quiz" ? DEMOTION_THRESHOLDS.quiz : DEMOTION_THRESHOLDS.auto;
    if (acc.points <= threshold) {
      demotions.push({
        id: acc.id,
        dimension: acc.dimension,
        dimensionValue: acc.dimension_value,
        displayName: acc.display_name,
      });
    }
  }

  return demotions;
}


// ═══════════════════════════════════════════════════════
// APPLY PROMOTIONS TO WINE_PROFILES
// ═══════════════════════════════════════════════════════

async function applyPromotions(supabase, userId, promotions) {
  // Fetch current profile
  const { data: profile } = await supabase
    .from("wine_profiles")
    .select("countries, regions, estates, varietals")
    .eq("user_id", userId)
    .single();

  if (!profile) return;

  let countries = profile.countries || [];
  let regions = profile.regions || {};
  let estates = profile.estates || {};
  let varietals = profile.varietals || [];
  let changed = false;

  for (const promo of promotions) {
    const { dimension, dimensionValue, displayName, id } = promo;

    if (dimension === "country") {
      if (!countries.includes(dimensionValue)) {
        countries = [...countries, dimensionValue];
        changed = true;
      }
    } else if (dimension === "region") {
      const countryId = findCountryForRegion(dimensionValue);
      if (countryId) {
        const countryRegions = regions[countryId] || [];
        if (!countryRegions.includes(dimensionValue)) {
          regions = { ...regions, [countryId]: [...countryRegions, dimensionValue] };
          changed = true;
        }
      }
    } else if (dimension === "estate") {
      // Find which region this estate belongs to
      let estateRegion = null;
      for (const [regionId, estateList] of Object.entries(PRODUCERS)) {
        if (estateList.some(e => e.id === dimensionValue)) {
          estateRegion = regionId;
          break;
        }
      }
      if (estateRegion) {
        const regionEstates = estates[estateRegion] || [];
        if (!regionEstates.includes(dimensionValue)) {
          estates = { ...estates, [estateRegion]: [...regionEstates, dimensionValue] };
          changed = true;
        }
      }
    } else if (dimension === "varietal") {
      if (!varietals.includes(dimensionValue)) {
        varietals = [...varietals, dimensionValue];
        changed = true;
      }
    }

    // Mark as promoted in dna_accumulation
    await supabase.from("dna_accumulation").update({
      promoted: true,
      promoted_at: new Date().toISOString(),
      demoted_at: null,
    }).eq("id", id);

    // Log to timeline
    await supabase.from("dna_timeline").insert({
      user_id: userId,
      event_type: "promoted",
      dimension,
      dimension_value: dimensionValue,
      display_name: displayName,
    });
  }

  if (changed) {
    await supabase.from("wine_profiles").update({
      countries, regions, estates, varietals,
    }).eq("user_id", userId);
  }
}


// ═══════════════════════════════════════════════════════
// APPLY DEMOTIONS TO WINE_PROFILES
// ═══════════════════════════════════════════════════════

async function applyDemotions(supabase, userId, demotions) {
  const { data: profile } = await supabase
    .from("wine_profiles")
    .select("countries, regions, estates, varietals")
    .eq("user_id", userId)
    .single();

  if (!profile) return;

  let countries = profile.countries || [];
  let regions = profile.regions || {};
  let estates = profile.estates || {};
  let varietals = profile.varietals || [];
  let changed = false;

  for (const demo of demotions) {
    const { dimension, dimensionValue, displayName, id } = demo;

    if (dimension === "country") {
      const filtered = countries.filter(c => c !== dimensionValue);
      if (filtered.length !== countries.length) { countries = filtered; changed = true; }
    } else if (dimension === "region") {
      for (const [countryId, regionList] of Object.entries(regions)) {
        const filtered = regionList.filter(r => r !== dimensionValue);
        if (filtered.length !== regionList.length) {
          regions = { ...regions, [countryId]: filtered };
          changed = true;
        }
      }
    } else if (dimension === "estate") {
      for (const [regionId, estateList] of Object.entries(estates)) {
        const filtered = estateList.filter(e => e !== dimensionValue);
        if (filtered.length !== estateList.length) {
          estates = { ...estates, [regionId]: filtered };
          changed = true;
        }
      }
    } else if (dimension === "varietal") {
      const filtered = varietals.filter(v => v !== dimensionValue);
      if (filtered.length !== varietals.length) { varietals = filtered; changed = true; }
    }

    // Mark as demoted in dna_accumulation
    await supabase.from("dna_accumulation").update({
      promoted: false,
      demoted_at: new Date().toISOString(),
    }).eq("id", id);

    // Log to timeline
    await supabase.from("dna_timeline").insert({
      user_id: userId,
      event_type: "demoted",
      dimension,
      dimension_value: dimensionValue,
      display_name: displayName,
    });
  }

  if (changed) {
    await supabase.from("wine_profiles").update({
      countries, regions, estates, varietals,
    }).eq("user_id", userId);
  }
}


// ═══════════════════════════════════════════════════════
// REVERSE POINTS (for rating changes and deletions)
// ═══════════════════════════════════════════════════════

/**
 * Fully reverse points for a deleted interaction.
 * Called when a user deletes a wine from their journal.
 *
 * Callers that delete the row FIRST (so a failed delete + retry can't
 * double-reverse) pass the pre-read interaction data — by the time this
 * runs, the row is gone.
 */
export async function reverseAccumulation(supabase, userId, wineName, interactionData = null) {
  // Get the stored resolved data for this interaction
  let interaction = interactionData;
  if (!interaction) {
    const { data } = await supabase
      .from("wine_interactions")
      .select("rating, match_confidence")
      .eq("user_id", userId)
      .eq("wine_name", wineName)
      .single();
    interaction = data;
  }

  // A row with no stored confidence was never resolved, so it never
  // accumulated — nothing to reverse (the historical /recommend rows)
  if (!interaction || !interaction.rating || interaction.match_confidence == null) {
    return { demotions: [] };
  }

  // Re-resolve to get the dimension mappings; the deterministic resolver
  // lands in the same confidence band the accumulation used
  const resolution = resolveWine(wineName);
  const pointsTable = pointsTableFor(resolution.confidence);
  if (!pointsTable) return { demotions: [] };
  const partial = pointsTable === PARTIAL_RATING_POINTS;

  const points = pointsTable[interaction.rating] ?? 0;
  if (points === 0) return { demotions: [] };

  const dimensionUpdates = buildDimensionUpdates(resolution, { partial });

  // Reverse the points
  for (const dim of dimensionUpdates) {
    await upsertAccumulation(supabase, userId, dim, -points);
  }

  // Check for demotions triggered by the reversal
  const demotions = await checkDemotions(supabase, userId, dimensionUpdates);
  if (demotions.length > 0) {
    await applyDemotions(supabase, userId, demotions);
  }

  return { demotions };
}


// ═══════════════════════════════════════════════════════
// QUIZ SYNC — Mark quiz-selected items in accumulation
// ═══════════════════════════════════════════════════════

/**
 * When a user saves quiz results, mark all quiz-selected items
 * with source='quiz' in dna_accumulation so they get the higher
 * demotion threshold.
 */
export async function syncQuizSelections(supabase, userId, quizAnswers) {
  const { countries, regions, estates, varietals } = quizAnswers;

  const items = [];

  // Countries
  for (const countryId of (countries || [])) {
    if (isValidDnaCountry(countryId)) {
      items.push({
        dimension: "country",
        dimensionValue: countryId,
        displayName: getCountryDisplayName(countryId),
      });
    }
  }

  // Regions
  for (const [countryId, regionIds] of Object.entries(regions || {})) {
    for (const regionId of regionIds) {
      if (isValidDnaRegion(regionId)) {
        items.push({
          dimension: "region",
          dimensionValue: regionId,
          displayName: getRegionDisplayName(regionId),
        });
      }
    }
  }

  // Estates
  for (const [regionId, estateIds] of Object.entries(estates || {})) {
    for (const estateId of estateIds) {
      // Find display name
      const estateList = PRODUCERS[regionId] || [];
      const estate = estateList.find(e => e.id === estateId);
      if (estate) {
        items.push({
          dimension: "estate",
          dimensionValue: estateId,
          displayName: estate.name,
        });
      }
    }
  }

  // Varietals
  for (const varietalId of (varietals || [])) {
    if (isValidDnaVarietal(varietalId)) {
      items.push({
        dimension: "varietal",
        dimensionValue: varietalId,
        displayName: DNA_TO_VARIETY_NAME[varietalId] || varietalId,
      });
    }
  }

  // Upsert each quiz selection into dna_accumulation with source='quiz'
  for (const item of items) {
    const { data: existing } = await supabase
      .from("dna_accumulation")
      .select("id, source, promoted")
      .eq("user_id", userId)
      .eq("dimension", item.dimension)
      .eq("dimension_value", item.dimensionValue)
      .single();

    if (existing) {
      // A row already earned by ratings keeps its provenance — the quiz
      // agreeing with the palate doesn't turn earned DNA into founding DNA
      if (existing.promoted && existing.source === "auto") continue;
      // Only update source to quiz — don't reset points
      await supabase.from("dna_accumulation").update({
        source: "quiz",
        promoted: true,
        promoted_at: new Date().toISOString(),
        display_name: item.displayName,
        mappable: true,
      }).eq("id", existing.id);
    } else {
      await supabase.from("dna_accumulation").insert({
        user_id: userId,
        dimension: item.dimension,
        dimension_value: item.dimensionValue,
        display_name: item.displayName,
        points: 0,
        interaction_count: 0,
        promoted: true,
        promoted_at: new Date().toISOString(),
        source: "quiz",
        mappable: true,
      });
    }
  }
}


// ═══════════════════════════════════════════════════════
// QUIZ MERGE — quiz selections ∪ earned DNA
// ═══════════════════════════════════════════════════════

// Flatten a raw answers object into one Set of values per dimension,
// matching dna_accumulation's dimension names.
function collectDimensionValues(raw) {
  return {
    country: new Set(raw.countries || []),
    region: new Set(Object.values(raw.regions || {}).flat()),
    estate: new Set(Object.values(raw.estates || {}).flat()),
    varietal: new Set(raw.varietals || []),
  };
}

/**
 * Merge quiz answers with DNA earned from rated bottles.
 *
 * The quiz manages founding DNA; ratings manage earned DNA. Saving a refined
 * quiz must never SILENTLY erase what real bottles proved, so promoted
 * source='auto' accumulation rows are unioned back into the arrays the
 * profile save will write — with one deliberate exception (Ed's call,
 * August 2026): an EXPLICIT deselection is honored. Explicit means the item
 * was pre-checked when the refine started (present in initialRaw) and is
 * unchecked at save (absent from quizRaw). The quiz never removes values it
 * didn't render — deselecting a country leaves its regions in the answers
 * untouched — so initial-minus-final is exactly the set of chips the user
 * saw and turned off. Earned items the quiz couldn't display (or that
 * promoted mid-quiz) are still preserved. Un-flagging the deselected row's
 * promotion is reconcileQuizPromotions' job; its points survive, so
 * continued love re-promotes.
 *
 * @param {object} supabase - Supabase client
 * @param {string} userId - Current user ID
 * @param {object} quizRaw - { countries, regions, estates, varietals, specificWines }
 * @param {object|null} initialRaw - the answers the refine was seeded with
 * @returns {object} merged raw arrays, same shape as quizRaw
 */
export async function mergeQuizWithEarnedDna(supabase, userId, quizRaw, initialRaw = null) {
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

  const { data: earnedRows } = await supabase
    .from("dna_accumulation")
    .select("dimension, dimension_value")
    .eq("user_id", userId)
    .eq("promoted", true)
    .eq("source", "auto")
    .eq("mappable", true);

  for (const row of earnedRows || []) {
    const value = row.dimension_value;
    if (explicitlyDeselected(row.dimension, value)) continue;
    if (row.dimension === "country") {
      if (isValidDnaCountry(value) && !merged.countries.includes(value)) {
        merged.countries.push(value);
      }
    } else if (row.dimension === "varietal") {
      if (isValidDnaVarietal(value) && !merged.varietals.includes(value)) {
        merged.varietals.push(value);
      }
    } else if (row.dimension === "region") {
      const countryId = findCountryForRegion(value);
      if (countryId) {
        const list = merged.regions[countryId] || (merged.regions[countryId] = []);
        if (!list.includes(value)) list.push(value);
      }
    } else if (row.dimension === "estate") {
      let estateRegion = null;
      for (const [regionId, estateList] of Object.entries(PRODUCERS)) {
        if (estateList.some((e) => e.id === value)) { estateRegion = regionId; break; }
      }
      if (estateRegion) {
        const list = merged.estates[estateRegion] || (merged.estates[estateRegion] = []);
        if (!list.includes(value)) list.push(value);
      }
    }
  }

  return merged;
}

/**
 * After a quiz save, un-flag promoted accumulation rows that are no longer in
 * the saved DNA. Without this, a removed item stays promoted=true forever and
 * checkPromotions can never promote it again, even with fresh rating evidence.
 *
 * On a refine save the merged arrays contain every earned row by construction,
 * so only deliberately removed founding items are touched. On a "Start fresh"
 * save the quiz answers ARE the arrays, so stale earned rows get un-flagged
 * too — points survive (the bottles were real), so continued love re-promotes.
 *
 * Deliberate user edits, not rating evidence — so no dna_timeline events.
 */
export async function reconcileQuizPromotions(supabase, userId, savedRaw) {
  const inDna = {
    country: new Set(savedRaw.countries || []),
    region: new Set(Object.values(savedRaw.regions || {}).flat()),
    estate: new Set(Object.values(savedRaw.estates || {}).flat()),
    varietal: new Set(savedRaw.varietals || []),
  };

  const { data: promoted } = await supabase
    .from("dna_accumulation")
    .select("id, dimension, dimension_value")
    .eq("user_id", userId)
    .eq("promoted", true);

  for (const row of promoted || []) {
    const set = inDna[row.dimension];
    if (set && !set.has(row.dimension_value)) {
      await supabase.from("dna_accumulation").update({
        promoted: false,
        demoted_at: new Date().toISOString(),
      }).eq("id", row.id);
    }
  }
}


// ═══════════════════════════════════════════════════════
// TIMELINE FETCH
// ═══════════════════════════════════════════════════════

/**
 * Fetch DNA timeline entries for a user, newest first.
 */
export async function fetchDnaTimeline(supabase, userId) {
  const { data, error } = await supabase
    .from("dna_timeline")
    .select("*")
    .eq("user_id", userId)
    .order("event_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch DNA timeline:", error);
    return [];
  }
  return data || [];
}
