// identityRecompose.js — the milestone hook (Act III, "The Living Strand").
//
// maybeRecomposeIdentity runs AFTER resolveAndAccumulate / reverseAccumulation
// completes, non-blocking, from every rating surface. identityEngine stays
// pure — this hook owns all the I/O: it detects milestones, recomposes the
// strand from current evidence (quiz DNA ∪ earned accumulation), writes the
// live red/white recount, and celebrates a changed strand with a dna_timeline
// 'shifted' event. An unchanged strand refreshes traits/genome silently.
//
// Milestones (Ed's locked decisions):
//   1. Promotions & demotions — the engine call already returns them.
//   2. Every 5th rated bottle since the last recompose. The baseline is the
//      LIVE rated-bottle count at the last recompose, stored in
//      identity.milestones.ratedCountAtLastRecompose and reset by every
//      recompose — including quiz saves, which recompose the strand
//      themselves (so a milestone right after a refine can't fire a no-op).
//      Deleting a journal row lowers the live count, so deletes subtract
//      milestone progress instead of being free bottles.
//   3. First-time firsts — first earned promotion ever, first loved bottle
//      fully outside the DNA, first demotion. Durable has-fired flags live
//      in identity.milestones.firsts; they are recorded only here, never by
//      a migration or regeneration (those write no timeline events and run
//      no hook, by construction).
//
// "Outside the DNA", precisely: the engine resolved this wine to at least
// one dimension its confidence band accumulates toward, and NONE of those
// dimension values appear in the profile arrays (countries / flattened
// regions / flattened estates / varietals) as read after the engine run —
// so a bottle whose own rating just promoted its dimension counts as
// inside, and is celebrated as a promotion instead.
//
// Two-tab discipline: the strand write is a compare-and-swap on the stored
// title + epithet, and the 'shifted' event is written only by the winner.
// Two tabs composing the same shift → one event. Residual window: a crash
// between the CAS and the event insert loses the celebration (never
// doubles it); two tabs composing genuinely different shifts in sequence
// each earn their own event, which is correct.
//
// The narrative is deliberately NOT touched here: the shifted event lands
// after narrative_updated_at, which re-arms /api/palate-narrative's
// staleness gate — The Somm rewrites the prose on the next /palate visit.

import { composeIdentity } from "./identityEngine.js";
import wineUnified from "./wineUnified.json";

const VARIETALS = wineUnified.varietals;

/** Every Nth rated bottle since the last recompose is a milestone. */
export const RECOMPOSE_RATED_INTERVAL = 5;

/** Somm-voice toast for a celebrated shift — one copy for every surface. */
export function shiftToastMessage(shift) {
  if (shift.titleChanged) {
    return `🧬 Your DNA has shifted: you're now ${shift.title}`;
  }
  return `🧬 Your DNA has shifted: ${shift.epithet}`;
}

/** Live rated-bottle count — the milestone baseline's unit. Shared with
 *  saveQuizProfile so quiz saves reset the same number the hook reads. */
export async function countRatedBottles(supabase, userId) {
  const { count } = await supabase
    .from("wine_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("rating", "is", null);
  return count ?? 0;
}

// Red/white recount over the CURRENT varietal set (quiz ∪ earned) — the same
// formula generateDNAProfile uses at quiz save, so the Red↔White rail reads
// one consistent number whichever path wrote it last. Earned varietal
// promotions/demotions move the array; this recount is what finally lets
// the rail follow them.
function recountColors(varietalIds) {
  let red = 0, white = 0;
  for (const id of varietalIds || []) {
    const v = VARIETALS.find((x) => x.id === id);
    if (v?.color === "red") red++;
    else if (v?.color === "white") white++;
  }
  return { redCount: red, whiteCount: white };
}

function isOutsideDna(dimensions, profile) {
  if (!dimensions || dimensions.length === 0) return false;
  const inProfile = {
    country: new Set(profile.countries || []),
    region: new Set(Object.values(profile.regions || {}).flat()),
    estate: new Set(Object.values(profile.estates || {}).flat()),
    varietal: new Set(profile.varietals || []),
  };
  return dimensions.every((d) => !inProfile[d.dimension]?.has(d.dimensionValue));
}

/**
 * Detect milestones and recompose the identity strand when one fires.
 *
 * @param {object} supabase - Supabase client
 * @param {string} userId - Current user ID
 * @param {object} engineResult - what the evolution engine just returned,
 *   plus context: { promotions, demotions, dimensions, rating, isReversal }
 * @returns {object|null} null when no milestone fired; otherwise
 *   { shifted, titleChanged, title, previousTitle, epithet, previousEpithet }
 *   — shifted=true means a 'shifted' event was written and the surface
 *   should celebrate.
 */
export async function maybeRecomposeIdentity(supabase, userId, engineResult = {}) {
  const promotions = engineResult.promotions || [];
  const demotions = engineResult.demotions || [];

  const { data: profile } = await supabase
    .from("wine_profiles")
    .select("archetype, identity, countries, regions, estates, varietals, specific_wines")
    .eq("user_id", userId)
    .single();
  if (!profile) return null; // no palate yet — nothing to recompose

  const identity = profile.identity || {};
  const milestones = identity.milestones || {};
  const firsts = milestones.firsts || {};

  const ratedCount = await countRatedBottles(supabase, userId);
  const baseline = milestones.ratedCountAtLastRecompose ?? 0;

  let milestone = promotions.length > 0 || demotions.length > 0 ||
    ratedCount >= baseline + RECOMPOSE_RATED_INTERVAL;

  // First-time firsts: each observed at most once per account, recorded in
  // the durable flags whenever seen (even when a regular milestone also
  // fired on the same engine call — the flag must not stay armed).
  const newFirsts = { ...firsts };
  if (promotions.length > 0 && !firsts.earnedPromotion) {
    newFirsts.earnedPromotion = true;
    milestone = true;
  }
  if (demotions.length > 0 && !firsts.demotion) {
    newFirsts.demotion = true;
    milestone = true;
  }
  if (
    !engineResult.isReversal &&
    engineResult.rating === "loved" &&
    !firsts.lovedOutsideDna &&
    isOutsideDna(engineResult.dimensions, profile)
  ) {
    newFirsts.lovedOutsideDna = true;
    milestone = true;
  }

  if (!milestone) return null;

  // Recompose from current evidence: the profile arrays already hold
  // quiz ∪ earned-promoted DNA (promotions edit them), and the accumulation
  // rows let evidence points pick the anchor region / signature grape.
  const { data: accumulation } = await supabase
    .from("dna_accumulation")
    .select("dimension, dimension_value, points")
    .eq("user_id", userId);

  const strand = composeIdentity({
    countries: profile.countries || [],
    regions: profile.regions || {},
    estates: profile.estates || {},
    varietals: profile.varietals || [],
    specificWines: profile.specific_wines || [],
    accumulation: accumulation || [],
  });
  const { redCount, whiteCount } = recountColors(profile.varietals);

  const previousTitle = profile.archetype;
  const previousEpithet = identity.epithet ?? null;
  const titleChanged = strand.title !== previousTitle;
  const epithetChanged = strand.epithet !== (previousEpithet || "");
  const changed = titleChanged || epithetChanged;

  const newIdentity = {
    epithet: strand.epithet,
    traits: strand.traits,
    genome: strand.genome,
    milestones: {
      ratedCountAtLastRecompose: ratedCount,
      firsts: newFirsts,
    },
  };

  if (!changed) {
    // Silent refresh — traits/genome/recount move, no event, no noise
    await supabase.from("wine_profiles").update({
      identity: newIdentity,
      red_count: redCount,
      white_count: whiteCount,
    }).eq("user_id", userId);
    return { shifted: false, titleChanged: false, title: strand.title, previousTitle, epithet: strand.epithet, previousEpithet };
  }

  // Compare-and-swap on the strand we read: if another tab recomposed in
  // between, this matches zero rows and nobody double-celebrates.
  let cas = supabase.from("wine_profiles").update({
    archetype: strand.title,
    identity: newIdentity,
    red_count: redCount,
    white_count: whiteCount,
  }).eq("user_id", userId).eq("archetype", previousTitle);
  cas = previousEpithet == null
    ? cas.is("identity->>epithet", null)
    : cas.eq("identity->>epithet", previousEpithet);
  const { data: won } = await cas.select("user_id");
  if (!won || won.length === 0) {
    return { shifted: false, titleChanged: false, title: strand.title, previousTitle, epithet: strand.epithet, previousEpithet };
  }

  // The celebrated record: display_name is what every surface renders (the
  // new title); dimension_value carries the full before→after strand.
  await supabase.from("dna_timeline").insert({
    user_id: userId,
    event_type: "shifted",
    dimension: "identity",
    dimension_value: JSON.stringify({
      from: { title: previousTitle, epithet: previousEpithet },
      to: { title: strand.title, epithet: strand.epithet },
    }),
    display_name: strand.title,
  });

  return {
    shifted: true,
    titleChanged,
    title: strand.title,
    previousTitle,
    epithet: strand.epithet,
    previousEpithet,
  };
}
