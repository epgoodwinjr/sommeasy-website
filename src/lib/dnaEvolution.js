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

// A rated bottle pushes a dimension while its rating earns positive points
// in its band — loved and liked do; fine and not-for-me are rated but make
// no case. interaction_count counts the bottles pushing each dimension, so
// it moves by the same differential the points do: a re-rate by
// pushCount(new) − pushCount(old), a delete takes the bottle back off.
function pushCount(points) {
  return points > 0 ? 1 : 0;
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
 * @returns {object} { resolution, dimensions, promotions, demotions, wineName } —
 *   dimensions is what this wine's confidence band accumulates toward
 *   (empty below the partial gate), returned even on a zero delta so the
 *   milestone hook can judge the wine, not the delta. wineName rides along
 *   so the hook can name the rated wine on the timeline rows it writes
 *   (dna_timeline.wine_name — the wine page's "What it did to your palate")
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
    return { resolution, dimensions: [], promotions: [], demotions: [], wineName };
  }
  const partial = pointsTable === PARTIAL_RATING_POINTS;

  // Step 4: Determine which dimensions this band accumulates toward
  const dimensionUpdates = buildDimensionUpdates(resolution, { partial });

  // Step 5: Calculate point delta, and the bottle-count delta beside it
  // (equal points push alike, so a zero point delta moves no count either)
  const newPoints = pointsTable[rating] ?? 0;
  const oldPoints = previousRating ? (pointsTable[previousRating] ?? 0) : 0;
  const pointDelta = newPoints - oldPoints;
  const countDelta = pushCount(newPoints) - pushCount(oldPoints);

  if (pointDelta === 0) {
    return { resolution, dimensions: dimensionUpdates, promotions: [], demotions: [], wineName };
  }

  // Step 6: Apply point and count deltas to dna_accumulation
  for (const dim of dimensionUpdates) {
    await upsertAccumulation(supabase, userId, dim, pointDelta, countDelta);
  }

  // Step 7: Check promotions and demotions
  const promotions = await checkPromotions(supabase, userId, dimensionUpdates);
  const demotions = await checkDemotions(supabase, userId, dimensionUpdates);

  // Step 8: Apply promotions to wine_profiles
  if (promotions.length > 0) {
    await applyPromotions(supabase, userId, promotions, wineName);
  }

  // Step 9: Apply demotions to wine_profiles
  if (demotions.length > 0) {
    await applyDemotions(supabase, userId, demotions, wineName);
  }

  return { resolution, dimensions: dimensionUpdates, promotions, demotions, wineName };
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

// countDelta moves interaction_count (see pushCount). It never goes below
// zero: a reversal can land on a row that never counted its bottle (a
// pre-fix ledger, or a resolver change since the rating), and a negative
// bottle count means nothing.
async function upsertAccumulation(supabase, userId, dim, pointDelta, countDelta) {
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
      interaction_count: Math.max(0, existing.interaction_count + countDelta),
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
      interaction_count: Math.max(0, countDelta),
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

// wineName is the bottle whose rating earned these (null when nothing
// named one) — it links each timeline row to that wine's page
async function applyPromotions(supabase, userId, promotions, wineName = null) {
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
      wine_name: wineName,
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

async function applyDemotions(supabase, userId, demotions, wineName = null) {
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
      wine_name: wineName,
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

  // Reverse the points, and take the bottle off every count it was on
  for (const dim of dimensionUpdates) {
    await upsertAccumulation(supabase, userId, dim, -points, -pushCount(points));
  }

  // Check for demotions triggered by the reversal. They name no wine: only
  // a rating does — the deleted bottle has left the journal and has no page
  const demotions = await checkDemotions(supabase, userId, dimensionUpdates);
  if (demotions.length > 0) {
    await applyDemotions(supabase, userId, demotions, null);
  }

  return { demotions };
}


// ═══════════════════════════════════════════════════════
// BOTTLE EVIDENCE — one rated bottle's worth, without I/O
// ═══════════════════════════════════════════════════════

/**
 * What one rated bottle is worth to the ledger under today's engine: the
 * points its rating earns in its confidence band, whether it pushes (counts
 * toward interaction_count), and the dimensions it writes. Summed over a
 * user's rated interactions, it is what dna_accumulation should hold — the
 * recount in scripts/recount-interaction-count.mjs is built on it, so the
 * recount and the engine can't disagree about a bottle.
 *
 * @returns {object} { resolution, points, pushes, dimensions }
 */
export function bottleEvidence(wineName, rating) {
  const resolution = resolveWine(wineName);
  const pointsTable = pointsTableFor(resolution.confidence);
  if (!pointsTable) return { resolution, points: 0, pushes: false, dimensions: [] };
  const points = pointsTable[rating] ?? 0;
  return {
    resolution,
    points,
    pushes: pushCount(points) === 1,
    dimensions: buildDimensionUpdates(resolution, { partial: pointsTable === PARTIAL_RATING_POINTS }),
  };
}


// ═══════════════════════════════════════════════════════
// QUIZ SYNC — Mark quiz-selected items in accumulation
// ═══════════════════════════════════════════════════════

/**
 * When a user saves quiz results, mark all quiz-selected items
 * with source='quiz' in dna_accumulation so they get the higher
 * demotion threshold.
 *
 * A HANDFUL OF REQUESTS, WHATEVER THE QUIZ SIZE (launch prep, Nov 2026). It
 * used to read and write each item in turn — two sequential requests per
 * item, ~88 round trips for a full quiz, ~15s on a phone with the home
 * loading screen and the signed-in reveal waiting on it. Now: one read of
 * the rows these items name, then at most two writes sent together (the
 * rows that exist, the rows that don't). Row for row the result is what the
 * loop wrote:
 *  - a row already earned by ratings (promoted, source 'auto') is skipped —
 *    the quiz agreeing with the palate doesn't turn earned DNA into founding
 *    DNA, so the ✦ survives a refine;
 *  - an existing row becomes source 'quiz', promoted, its display name and
 *    mappable refreshed — its points and bottle count untouched (the upsert
 *    names neither column, so ON CONFLICT DO UPDATE leaves them alone);
 *  - a missing row is created at zero points, promoted, source 'quiz'. Its
 *    write ignores a conflict, as the loop's insert failed alone on one: a
 *    row that appears in between (a rating landing) keeps what it holds;
 *  - an item listed twice (an estate filed under two regions) is one row
 *    whose display name is the LAST listing's — the loop inserted it, then
 *    updated it.
 * `rows`, when given, are the user's accumulation rows as the caller just
 * read them (saveQuizProfile reads once, before its write, for the merge,
 * the reconcile and this) — then the writes are the only requests.
 * A failed read or write throws (the caller logs it; the save has landed).
 * quizSave.test.js holds it to the loop, row for row, over seeded states.
 */
export async function syncQuizSelections(supabase, userId, quizAnswers, rows = null) {
  const { countries, regions, estates, varietals } = quizAnswers;

  const items = new Map(); // `${dimension}\u0000${value}` → item (last listing wins)
  const add = (dimension, dimensionValue, displayName) =>
    items.set(`${dimension}\u0000${dimensionValue}`, { dimension, dimensionValue, displayName });

  // Countries
  for (const countryId of (countries || [])) {
    if (isValidDnaCountry(countryId)) add("country", countryId, getCountryDisplayName(countryId));
  }

  // Regions
  for (const regionIds of Object.values(regions || {})) {
    for (const regionId of regionIds) {
      if (isValidDnaRegion(regionId)) add("region", regionId, getRegionDisplayName(regionId));
    }
  }

  // Estates
  for (const [regionId, estateIds] of Object.entries(estates || {})) {
    for (const estateId of estateIds) {
      const estate = (PRODUCERS[regionId] || []).find((e) => e.id === estateId);
      if (estate) add("estate", estateId, estate.name);
    }
  }

  // Varietals
  for (const varietalId of (varietals || [])) {
    if (isValidDnaVarietal(varietalId)) {
      add("varietal", varietalId, DNA_TO_VARIETY_NAME[varietalId] || varietalId);
    }
  }

  if (items.size === 0) return;

  if (!rows) {
    const values = [...new Set([...items.values()].map((i) => i.dimensionValue))];
    const { data, error: readErr } = await supabase
      .from("dna_accumulation")
      .select("dimension, dimension_value, source, promoted")
      .eq("user_id", userId)
      .in("dimension_value", values);
    if (readErr) throw readErr;
    rows = data || [];
  }

  const existing = new Map(
    rows.map((r) => [`${r.dimension}\u0000${r.dimension_value}`, r])
  );
  const now = new Date().toISOString();
  const updates = [];
  const inserts = [];
  for (const [key, item] of items) {
    const row = existing.get(key);
    const base = {
      user_id: userId,
      dimension: item.dimension,
      dimension_value: item.dimensionValue,
      display_name: item.displayName,
      promoted: true,
      promoted_at: now,
      source: "quiz",
      mappable: true,
    };
    if (!row) inserts.push({ ...base, points: 0, interaction_count: 0 });
    else if (!(row.promoted && row.source === "auto")) updates.push(base);
  }

  const onConflict = "user_id,dimension,dimension_value";
  const writes = [];
  if (updates.length) {
    writes.push(supabase.from("dna_accumulation").upsert(updates, { onConflict }));
  }
  if (inserts.length) {
    writes.push(
      supabase.from("dna_accumulation").upsert(inserts, { onConflict, ignoreDuplicates: true })
    );
  }
  const results = await Promise.all(writes);
  const writeErr = results.find((r) => r?.error)?.error;
  if (writeErr) throw writeErr;
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
 * @param {object[]|null} rows - the user's accumulation rows, if already read
 * @returns {object} merged raw arrays, same shape as quizRaw
 */
export async function mergeQuizWithEarnedDna(supabase, userId, quizRaw, initialRaw = null, rows = null) {
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

  // `rows`: the user's accumulation rows, already read by the caller
  const earnedRows = rows
    ? rows.filter((r) => r.promoted === true && r.source === "auto" && r.mappable === true)
    : (await supabase
      .from("dna_accumulation")
      .select("dimension, dimension_value")
      .eq("user_id", userId)
      .eq("promoted", true)
      .eq("source", "auto")
      .eq("mappable", true)).data;

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
 *
 * One read and at most one write (launch prep, Nov 2026). It touches only
 * rows OUTSIDE savedRaw, and syncQuizSelections only rows INSIDE the quiz
 * answers (a subset of savedRaw — the merge only ever adds), so the two can
 * run side by side. `rows`, when given, are the user's accumulation rows as
 * the caller read them (then only the write is sent). A failed read or
 * write throws; the caller logs it.
 */
export async function reconcileQuizPromotions(supabase, userId, savedRaw, rows = null) {
  const inDna = {
    country: new Set(savedRaw.countries || []),
    region: new Set(Object.values(savedRaw.regions || {}).flat()),
    estate: new Set(Object.values(savedRaw.estates || {}).flat()),
    varietal: new Set(savedRaw.varietals || []),
  };

  let promoted;
  if (rows) promoted = rows.filter((r) => r.promoted === true);
  else {
    const { data, error: readErr } = await supabase
      .from("dna_accumulation")
      .select("id, dimension, dimension_value")
      .eq("user_id", userId)
      .eq("promoted", true);
    if (readErr) throw readErr;
    promoted = data;
  }

  // One write for every row that left the DNA (it was one write per row)
  const stale = (promoted || [])
    .filter((row) => inDna[row.dimension] && !inDna[row.dimension].has(row.dimension_value))
    .map((row) => row.id);
  if (stale.length === 0) return;
  const { error: writeErr } = await supabase.from("dna_accumulation").update({
    promoted: false,
    demoted_at: new Date().toISOString(),
  }).in("id", stale);
  if (writeErr) throw writeErr;
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
