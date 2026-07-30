import { generateDNAProfile } from "./profileEngine";
import { formatWineName } from "./matchEngine";
import { mergeQuizWithEarnedDna, reconcileQuizPromotions, syncQuizSelections } from "./dnaEvolution";

/**
 * The ONE quiz-save path — extracted from page.js's handleSaveProfile
 * (semantics unchanged) so the pending-palate restore can run the exact
 * same code as a live quiz completion. Returns the saved wine_profiles row
 * (the reveal renders it) or null on failure.
 *
 * MERGE, DON'T CLOBBER: in refine mode the arrays written are quiz
 * selections ∪ earned-promoted DNA — a retaken quiz never erases what real
 * bottles proved. initialRaw (the answers the refine was seeded with) lets
 * the merge honor explicit deselections; pass null when nothing was
 * displayed as pre-checked (the pending-palate restore), so nothing counts
 * as a deselection. "Start fresh" (mode "fresh") is the one deliberate
 * wipe. Journal data is never touched by quiz edits. The narrative
 * regenerates from the merged palate; narrative_updated_at is left alone so
 * The Somm re-evolves it under its usual staleness gate.
 */
export async function saveQuizProfile(supabase, userId, rawAnswers, { mode = "fresh", initialRaw = null } = {}) {
  try {
    const quizRaw = {
      ...rawAnswers,
      // Fix casing at the source ("Meerlust rubicon" → "Meerlust Rubicon")
      specificWines: (rawAnswers.specificWines || []).map(formatWineName),
    };
    const merged = mode === "refine"
      ? await mergeQuizWithEarnedDna(supabase, userId, quizRaw, initialRaw)
      : quizRaw;
    const finalProfile = generateDNAProfile(merged);

    const { error } = await supabase.from("wine_profiles").upsert({
      user_id: userId,
      archetype: finalProfile.archetype,
      archetype_emoji: finalProfile.archetypeEmoji,
      narrative: finalProfile.narrative,
      countries: merged.countries,
      regions: merged.regions,
      estates: merged.estates,
      varietals: merged.varietals,
      specific_wines: merged.specificWines,
      recommendations: finalProfile.recommendations,
      red_count: finalProfile.redCount,
      white_count: finalProfile.whiteCount,
    }, { onConflict: "user_id" });
    if (error) { console.error("Save error:", error); return null; }

    try {
      // Un-flag promoted accumulation rows no longer in the DNA, then mark
      // the declared selections as founding (earned rows keep provenance)
      await reconcileQuizPromotions(supabase, userId, merged);
      await syncQuizSelections(supabase, userId, quizRaw);
    } catch (syncErr) {
      console.error("Quiz sync error (non-blocking):", syncErr);
    }

    const { data } = await supabase.from("wine_profiles").select("*").eq("user_id", userId).single();
    return data || null;
  } catch (err) {
    console.error("Save error:", err);
    return null;
  }
}
