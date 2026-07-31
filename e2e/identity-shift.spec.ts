import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb, ensureEarnedFixture } from "./fixtures/test-db";
// The identity engine is pure and client-runnable — the spec uses the REAL
// engine to verify the hook wrote exactly what the evidence composes.
import { composeIdentity } from "../src/lib/identityEngine.js";

/**
 * Hard-fail guard for the Living Strand (Act III, Session 3):
 *
 * A milestone earned through the REAL UI must shift the identity. The
 * seeded account holds Domaine Dujac at 2 accumulation points (one loved
 * bottle shy of the estate threshold). Rating "Domaine Dujac Clos de la
 * Roche" loved through the /recommend paste UI promotes the estate —
 * a milestone — so maybeRecomposeIdentity must recompose the strand:
 * a second estate makes the persona a Loyalist, so the title AND epithet
 * change, a dna_timeline 'shifted' row must land (dimension 'identity',
 * before→after in dimension_value), and the shift toast must show.
 *
 * Do NOT make this outcome-tolerant. If the shifted row or the celebrated
 * surface goes missing, identity milestones are dead again.
 *
 * Data discipline (the pinotage guard's rules): the guard wine touches ONLY
 * dujac/burgundy/france — zero overlap with evidence-ledger's dims, so the
 * two guards can never corrupt each other's baselines. Guard interactions
 * are identified by source_url='text_paste' (the seeded Dujac rating has no
 * source_url). Stale state from crashed runs is healed at start, and the
 * exact baseline — identity jsonb and timeline included — is restored in
 * finally, after about:blank kills any in-flight page JS.
 */

const GUARD_LINE = "Domaine Dujac Clos de la Roche 2019...$95";

// Dimensions the guard wine feeds (verified against the resolver: 90).
const DIMS: Array<[string, string]> = [
  ["estate", "domaine_dujac"],
  ["region", "burgundy"],
  ["country", "france"],
];

// The spec's own fixture: Dujac exactly one loved bottle from the estate
// threshold (dnaThresholds.js: estate 4). Healed to this state at start.
const SHIFT_FIXTURE = {
  dimension: "estate",
  value: "domaine_dujac",
  displayName: "Domaine Dujac",
  points: 2,
  interactionCount: 1,
};

type AccRow = {
  points: number; interaction_count: number; promoted: boolean;
  promoted_at: string | null; demoted_at: string | null;
  source: string; mappable: boolean; display_name: string;
} | null;

async function readDims(supabase: SupabaseClient, userId: string) {
  const out: Record<string, AccRow> = {};
  for (const [dimension, value] of DIMS) {
    const { data } = await supabase
      .from("dna_accumulation")
      .select("points, interaction_count, promoted, promoted_at, demoted_at, source, mappable, display_name")
      .eq("user_id", userId)
      .eq("dimension", dimension)
      .eq("dimension_value", value)
      .maybeSingle();
    out[`${dimension}:${value}`] = (data as AccRow) ?? null;
  }
  return out;
}

async function findGuardRows(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("wine_interactions")
    .select("wine_name, rating")
    .eq("user_id", userId)
    .eq("source_url", "text_paste")
    .ilike("wine_name", "%dujac%");
  return data ?? [];
}

const RATING_POINTS: Record<string, number> = { loved: 2, liked: 1, fine: 0, not_for_me: -1 };

async function readProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("wine_profiles")
    .select("archetype, identity, countries, regions, estates, varietals, specific_wines, red_count, white_count")
    .eq("user_id", userId)
    .single();
  return data!;
}

/**
 * Heal anything a crashed earlier run left behind, then normalize the
 * Dujac fixture to its canonical one-bottle-away state.
 */
async function healStaleState(supabase: SupabaseClient, userId: string) {
  // 1. Stale guard interactions: reverse their points, then delete
  for (const row of await findGuardRows(supabase, userId)) {
    const pts = RATING_POINTS[row.rating ?? ""] ?? 0;
    if (pts !== 0) {
      for (const [dimension, value] of DIMS) {
        const { data: acc } = await supabase
          .from("dna_accumulation")
          .select("id, points")
          .eq("user_id", userId)
          .eq("dimension", dimension)
          .eq("dimension_value", value)
          .maybeSingle();
        if (acc) {
          await supabase.from("dna_accumulation")
            .update({ points: acc.points - pts })
            .eq("id", acc.id);
        }
      }
    }
    await supabase.from("wine_interactions")
      .delete().eq("user_id", userId).eq("wine_name", row.wine_name);
  }

  // 2. The account's baseline holds no shifted events and no promoted-Dujac
  // event — remove any a crashed run left
  await supabase.from("dna_timeline").delete()
    .eq("user_id", userId).eq("event_type", "shifted");
  await supabase.from("dna_timeline").delete()
    .eq("user_id", userId).eq("event_type", "promoted")
    .eq("dimension", "estate").eq("dimension_value", SHIFT_FIXTURE.value);

  // 3. Normalize the Dujac accumulation fixture (self-healing, like chenin)
  const { data: dujac } = await supabase
    .from("dna_accumulation").select("id")
    .eq("user_id", userId)
    .eq("dimension", SHIFT_FIXTURE.dimension)
    .eq("dimension_value", SHIFT_FIXTURE.value)
    .maybeSingle();
  const fixtureRow = {
    display_name: SHIFT_FIXTURE.displayName,
    points: SHIFT_FIXTURE.points,
    interaction_count: SHIFT_FIXTURE.interactionCount,
    promoted: false,
    promoted_at: null,
    demoted_at: null,
    source: "auto",
    mappable: true,
  };
  if (dujac) {
    await supabase.from("dna_accumulation").update(fixtureRow).eq("id", dujac.id);
  } else {
    await supabase.from("dna_accumulation").insert({
      user_id: userId,
      dimension: SHIFT_FIXTURE.dimension,
      dimension_value: SHIFT_FIXTURE.value,
      ...fixtureRow,
    });
  }

  // 4. A crashed run may have left the post-shift profile: Dujac in the
  // estates map and the Loyalist strand. Remove the estate and recompose
  // the canonical quiz-shape strand (no accumulation — the S2 baseline).
  const profile = await readProfile(supabase, userId);
  const burgundyEstates: string[] = profile.estates?.burgundy ?? [];
  const shifted = burgundyEstates.includes(SHIFT_FIXTURE.value) ||
    /Loyalist/.test(profile.archetype ?? "");
  if (shifted) {
    const estates = { ...profile.estates };
    if (estates.burgundy) {
      estates.burgundy = estates.burgundy.filter((e: string) => e !== SHIFT_FIXTURE.value);
      if (estates.burgundy.length === 0) delete estates.burgundy;
    }
    const strand = composeIdentity({
      countries: profile.countries || [],
      regions: profile.regions || {},
      estates,
      varietals: profile.varietals || [],
      specificWines: profile.specific_wines || [],
    });
    await supabase.from("wine_profiles").update({
      estates,
      archetype: strand.title,
      identity: { epithet: strand.epithet, traits: strand.traits, genome: strand.genome },
    }).eq("user_id", userId);
  }
}

test.describe("Identity shift — a milestone earned in the real UI moves the strand (hard-fail)", () => {
  test("estate promotion shifts the title, writes the shifted event, and celebrates", async ({ page }) => {
    test.setTimeout(150_000);
    const { supabase, userId } = await testDb();

    await ensureEarnedFixture(supabase, userId);
    await healStaleState(supabase, userId);

    // ── Exact baseline capture (post-heal) ──
    const baselineProfile = await readProfile(supabase, userId);
    const baselineDims = await readDims(supabase, userId);
    const { data: baselineEvents } = await supabase
      .from("dna_timeline").select("id").eq("user_id", userId);
    const baselineEventIds = new Set((baselineEvents ?? []).map((e) => e.id));
    const { count: baselineRated } = await supabase
      .from("wine_interactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("rating", "is", null);

    // Fixture premises — fail loudly if the account drifts
    expect(baselineDims["estate:domaine_dujac"]?.points).toBe(SHIFT_FIXTURE.points);
    expect(baselineDims["estate:domaine_dujac"]?.promoted).toBe(false);
    expect(baselineProfile.archetype).not.toMatch(/Loyalist/);

    try {
      // ── Drive the milestone through the real UI ──
      const recPage = new RecommendPage(page);
      await recPage.goto();
      await recPage.pasteAndAnalyze(GUARD_LINE);
      await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });
      const card = recPage.pickCards.first();
      await expect(card).toBeVisible();
      await expect(card).toContainText(/Dujac/);

      await card.getByRole("button", { name: "Had this wine? Rate it" }).click();
      await page.getByRole("button", { name: /Loved it/ }).click();
      await expect(page.getByText("Rating saved!")).toBeVisible();

      // ── The celebrated surface: promotion toast, then the shift toast ──
      await expect(page.getByText(/Domaine Dujac added to your estates/))
        .toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Your DNA has shifted: you're now The .+/))
        .toBeVisible({ timeout: 20_000 });

      // ── The shifted record ──
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from("dna_timeline").select("id")
            .eq("user_id", userId).eq("event_type", "shifted");
          return (data ?? []).length;
        }, { timeout: 15_000 })
        .toBe(1);

      const { data: shiftedEvent } = await supabase
        .from("dna_timeline")
        .select("dimension, dimension_value, display_name")
        .eq("user_id", userId).eq("event_type", "shifted")
        .single();
      const after = await readProfile(supabase, userId);

      // The title/epithet change: a second estate makes a Loyalist
      expect(after.archetype).not.toBe(baselineProfile.archetype);
      expect(after.archetype).toMatch(/Loyalist$/);
      expect(after.identity.epithet).toContain("estate-loyal");
      expect(after.identity.epithet).not.toBe(baselineProfile.identity.epithet);

      // The event row: identity dimension, new title as display name,
      // before→after carried in dimension_value
      expect(shiftedEvent!.dimension).toBe("identity");
      expect(shiftedEvent!.display_name).toBe(after.archetype);
      const change = JSON.parse(shiftedEvent!.dimension_value);
      expect(change.from.title).toBe(baselineProfile.archetype);
      expect(change.from.epithet).toBe(baselineProfile.identity.epithet);
      expect(change.to.title).toBe(after.archetype);
      expect(change.to.epithet).toBe(after.identity.epithet);

      // Engine consistency: the stored strand is EXACTLY what the pure
      // engine composes from the live evidence — the hook invented nothing
      const { data: accRows } = await supabase
        .from("dna_accumulation")
        .select("dimension, dimension_value, points")
        .eq("user_id", userId);
      const expected = composeIdentity({
        countries: after.countries || [],
        regions: after.regions || {},
        estates: after.estates || {},
        varietals: after.varietals || [],
        specificWines: after.specific_wines || [],
        accumulation: accRows || [],
      });
      expect(after.archetype).toBe(expected.title);
      expect(after.identity.epithet).toBe(expected.epithet);

      // Milestone bookkeeping: baseline reset, first-promotion armed
      expect(after.identity.milestones.ratedCountAtLastRecompose).toBe((baselineRated ?? 0) + 1);
      expect(after.identity.milestones.firsts.earnedPromotion).toBe(true);

      // Exactly the promotion + the shift — no stray events
      const { data: allEvents } = await supabase
        .from("dna_timeline").select("id").eq("user_id", userId);
      expect((allEvents ?? []).length).toBe(baselineEventIds.size + 2);
    } finally {
      // Kill in-flight page JS BEFORE touching the DB (the teardown-race
      // rule: a live resolveAndAccumulate/hook can re-insert rows under us)
      await page.goto("about:blank").catch(() => {});

      // Exact restore: guard interactions gone, accumulation rows back to
      // baseline, new timeline events removed, profile row (identity jsonb
      // included) restored verbatim
      for (const row of await findGuardRows(supabase, userId)) {
        await supabase.from("wine_interactions")
          .delete().eq("user_id", userId).eq("wine_name", row.wine_name);
      }
      for (const [dimension, value] of DIMS) {
        const base = baselineDims[`${dimension}:${value}`];
        if (base) {
          await supabase.from("dna_accumulation").update(base)
            .eq("user_id", userId).eq("dimension", dimension).eq("dimension_value", value);
        } else {
          await supabase.from("dna_accumulation").delete()
            .eq("user_id", userId).eq("dimension", dimension).eq("dimension_value", value);
        }
      }
      const { data: eventsNow } = await supabase
        .from("dna_timeline").select("id").eq("user_id", userId);
      for (const e of eventsNow ?? []) {
        if (!baselineEventIds.has(e.id)) {
          await supabase.from("dna_timeline").delete().eq("id", e.id);
        }
      }
      await supabase.from("wine_profiles").update({
        archetype: baselineProfile.archetype,
        identity: baselineProfile.identity,
        estates: baselineProfile.estates,
        varietals: baselineProfile.varietals,
        red_count: baselineProfile.red_count,
        white_count: baselineProfile.white_count,
      }).eq("user_id", userId);
    }
  });
});
