import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Direct DB access AS THE TEST USER (anon key + password sign-in, so RLS
 * applies exactly as in the app). Used by the seed spec and by fixture
 * ensure/restore steps in specs that mutate DNA state.
 *
 * Only ever points at the dedicated e2e account (TEST_USER_EMAIL) — Ed's
 * personal account is off-limits to automation (CLAUDE.md process rule).
 */
export async function testDb(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL!,
    password: process.env.TEST_USER_PASSWORD!,
  });
  if (error) throw new Error(`test-db sign-in failed: ${error.message}`);
  return { supabase, userId: data.user!.id };
}

/**
 * The account's one earned-promoted DNA fixture: Chenin Blanc, "earned" by
 * ratings (source='auto', promoted, 10 points = exactly at the varietal
 * threshold). The uncheck spec removes it through the real refine flow and
 * calls this again to restore — self-healing, so a crashed run can't leave
 * the account without its fixture.
 */
export const EARNED_FIXTURE = {
  dimension: "varietal",
  value: "chenin_blanc",
  displayName: "Chenin Blanc",
  points: 10,
  interactionCount: 5,
};

export async function ensureEarnedFixture(supabase: SupabaseClient, userId: string) {
  const f = EARNED_FIXTURE;
  const { data: existing } = await supabase
    .from("dna_accumulation")
    .select("id")
    .eq("user_id", userId)
    .eq("dimension", f.dimension)
    .eq("dimension_value", f.value)
    .single();

  if (existing) {
    await supabase.from("dna_accumulation").update({
      display_name: f.displayName,
      points: f.points,
      interaction_count: f.interactionCount,
      promoted: true,
      promoted_at: new Date().toISOString(),
      demoted_at: null,
      source: "auto",
      mappable: true,
    }).eq("id", existing.id);
  } else {
    await supabase.from("dna_accumulation").insert({
      user_id: userId,
      dimension: f.dimension,
      dimension_value: f.value,
      display_name: f.displayName,
      points: f.points,
      interaction_count: f.interactionCount,
      promoted: true,
      promoted_at: new Date().toISOString(),
      source: "auto",
      mappable: true,
    });
  }

  // One timeline event so "Recently evolved" has designed content. Insert
  // only once — repeated seeding must not stack duplicate events.
  const { data: events } = await supabase
    .from("dna_timeline")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", "promoted")
    .eq("dimension", f.dimension)
    .eq("dimension_value", f.value);
  if (!events || events.length === 0) {
    await supabase.from("dna_timeline").insert({
      user_id: userId,
      event_type: "promoted",
      dimension: f.dimension,
      dimension_value: f.value,
      display_name: f.displayName,
    });
  }

  const { data: profile } = await supabase
    .from("wine_profiles")
    .select("varietals")
    .eq("user_id", userId)
    .single();
  if (profile && !(profile.varietals || []).includes(f.value)) {
    await supabase.from("wine_profiles")
      .update({ varietals: [...(profile.varietals || []), f.value] })
      .eq("user_id", userId);
  }
}

export async function readEarnedFixtureRow(supabase: SupabaseClient, userId: string) {
  const f = EARNED_FIXTURE;
  const { data } = await supabase
    .from("dna_accumulation")
    .select("points, promoted, source, demoted_at")
    .eq("user_id", userId)
    .eq("dimension", f.dimension)
    .eq("dimension_value", f.value)
    .single();
  return data;
}
