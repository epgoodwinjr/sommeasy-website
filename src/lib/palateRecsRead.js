// palateRecsRead.js — the one read behind "Chosen for your palate".
//
// The ranking itself is pure (palateRecs.js); this is its I/O, kept apart
// the way identityRecompose.js keeps the identity engine's. Home, Search and
// the wine page each call it beside the reads they already make on load —
// never on a rating's path: a rating writes points, and the list follows on
// the next read.

import { rankRecommendations } from "./palateRecs.js";

/** The columns the ranking reads from dna_accumulation. */
export const PALATE_RECS_COLUMNS = "dimension, dimension_value, points";

/**
 * `profile` is the user's wine_profiles row (its DNA columns and
 * specific_wines). Resolves to the ranked recommendations, or null when
 * the points can't be read — unknown ≠ empty, so a caller shows nothing
 * rather than a list ranked on half the evidence. Never rejects.
 */
export async function readPalateRecs(supabase, userId, profile) {
  if (!userId || !profile) return null;
  try {
    const { data, error } = await supabase
      .from("dna_accumulation")
      .select(PALATE_RECS_COLUMNS)
      .eq("user_id", userId);
    if (error || !Array.isArray(data)) return null;
    return rankRecommendations({ profile, accumulation: data });
  } catch {
    return null;
  }
}
