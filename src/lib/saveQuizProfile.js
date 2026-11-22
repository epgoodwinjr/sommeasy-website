import { generateDNAProfile } from "./profileEngine";
import { formatWineName } from "./matchEngine";
import { mergeQuizWithEarnedDna, reconcileQuizPromotions, syncQuizSelections } from "./dnaEvolution";
import { countRatedBottles } from "./identityRecompose";
import { recordEvent, quizEventPayload, toOccurredAtISO } from "./wineEvents";

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
 *
 * The Long Memory: every successful save fires ONE quiz_completed
 * wine_events row (fire-and-forget — a failed event never fails the save).
 * eventMode overrides the recorded mode ("restore" for the pending-palate
 * fold-in, which runs as a refine/fresh save but is a different funnel
 * moment); occurredAt back-logs the stash's createdAt — the moment the quiz
 * actually happened, which is why occurred_at and created_at are separate
 * columns. This writes wine_events ONLY: quiz saves never touch the DNA
 * timeline table (Suite 12 source-scans this file to keep it that way).
 *
 * Exactly-once (launch prep, Nov 2026): the event is recorded only for a
 * save that LANDED — the upsert returns the row it wrote, and that row is
 * what the caller gets, so nothing after the write can turn a landed save
 * into a "failure" the caller retries. (The old trailing re-read did: an
 * empty read returned null after the event was already written, and the
 * pending-palate restore folded the same quiz in again on the next load.)
 * beforeEvent(row, event), when given, runs right after the write: it gets
 * the event this save would record ({ payload, occurredAt }) and returns
 * true to have it recorded here, false to withhold it. The pending-palate
 * restore uses it to claim the account's carrier — the claim records the
 * event in the same transaction, so only the load that wins it records.
 */
export async function saveQuizProfile(
  supabase, userId, rawAnswers,
  { mode = "fresh", initialRaw = null, eventMode = null, occurredAt = null, beforeEvent = null } = {}
) {
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

    // Milestone continuity (Act III S3): a quiz save IS a recompose, so it
    // resets the every-5th baseline to the live rated count — while the
    // first-time-firsts flags survive VERBATIM (they fire once per account;
    // a refine must never re-arm them). Quiz saves stay silent by
    // construction: nothing here writes a timeline event.
    let milestones = { ratedCountAtLastRecompose: 0, firsts: {} };
    try {
      const [{ data: existing }, ratedCount] = await Promise.all([
        supabase.from("wine_profiles").select("identity").eq("user_id", userId).single(),
        countRatedBottles(supabase, userId),
      ]);
      milestones = {
        ratedCountAtLastRecompose: ratedCount,
        firsts: existing?.identity?.milestones?.firsts || {},
      };
    } catch (msErr) {
      console.error("Milestone continuity read failed (non-blocking):", msErr);
    }

    const { data: savedRow, error } = await supabase.from("wine_profiles").upsert({
      user_id: userId,
      archetype: finalProfile.archetype,
      archetype_emoji: finalProfile.archetypeEmoji,
      narrative: finalProfile.narrative,
      // The identity strand (Act III): epithet + traits + genome ride the
      // jsonb column from migration 006; the title stays in archetype
      identity: {
        epithet: finalProfile.epithet,
        traits: finalProfile.traits,
        genome: finalProfile.genome,
        milestones,
      },
      countries: merged.countries,
      regions: merged.regions,
      estates: merged.estates,
      varietals: merged.varietals,
      specific_wines: merged.specificWines,
      recommendations: finalProfile.recommendations,
      red_count: finalProfile.redCount,
      white_count: finalProfile.whiteCount,
    }, { onConflict: "user_id" }).select().single();
    if (error || !savedRow) { console.error("Save error:", error || "no row returned"); return null; }

    // The save has landed. A caller's gate decides whether this save is the
    // one the ledger records (a throwing gate records nothing — never two)
    const event = {
      payload: quizEventPayload({ mode: eventMode || mode, raw: merged, title: finalProfile.archetype }),
      occurredAt: toOccurredAtISO(occurredAt),
    };
    let record = true;
    if (beforeEvent) {
      try { record = (await beforeEvent(savedRow, event)) === true; } catch { record = false; }
    }
    // The ledger record — fired without await so a slow insert can't delay
    // the reveal by a frame
    if (record) {
      recordEvent(
        supabase, userId, "quiz_completed", event.payload,
        event.occurredAt ? { occurredAt: event.occurredAt } : {}
      );
    }

    try {
      // Un-flag promoted accumulation rows no longer in the DNA, then mark
      // the declared selections as founding (earned rows keep provenance)
      await reconcileQuizPromotions(supabase, userId, merged);
      await syncQuizSelections(supabase, userId, quizRaw);
    } catch (syncErr) {
      console.error("Quiz sync error (non-blocking):", syncErr);
    }

    // The row the write returned: the steps above touch accumulation rows,
    // never the profile, so a re-read could only fail, never differ
    return savedRow;
  } catch (err) {
    console.error("Save error:", err);
    return null;
  }
}
