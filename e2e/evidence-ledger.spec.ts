import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb, countEvents, latestEvent } from "./fixtures/test-db";

/**
 * Hard-fail guards for the evidence ledger (Act III, Session 1):
 *
 * 1. Rating a pick through the REAL /recommend UI must move dna_accumulation
 *    — restaurant ratings are the strongest taste signal in the product and
 *    used to add zero DNA — and must stamp resolved_* metadata on the row
 *    (the somm payload used to see null varietal/region for these rows).
 * 2. Deleting that row through the journal UI must reverse the points
 *    exactly (delete-first idempotency).
 * 3. (The Long Memory) Both moments must land in the wine_events ledger:
 *    the rating writes a pick_rated row (old→new, band), the delete writes
 *    a journal_deleted row (what was removed, points reversed).
 *
 * Do NOT make this outcome-tolerant. If accumulation doesn't move, the
 * /recommend evidence path is broken again.
 *
 * wine_events discipline: append-forever — the exact-restore in `finally`
 * deliberately does NOT touch wine_events (no DELETE policy exists, on
 * purpose). Event assertions are deltas + latest-row shape only.
 *
 * Data discipline: the guard wine (Kanonkop Pinotage, Stellenbosch —
 * resolves at 90) touches only dimensions that are already quiz-promoted on
 * the seeded account (stellenbosch, south_africa) or start far below
 * threshold (pinotage, the fuzzy stellenbosch_vineyards estate), so a single
 * +2 can never fire a promotion. Guard rows are identified by
 * source_url='text_paste' + name (only /recommend paste ratings set that),
 * healed at start, and the exact baseline is restored afterwards.
 */

const GUARD_LINE = "Kanonkop Pinotage, Stellenbosch 2019...$68";

// Dimensions the guard wine feeds (verified against the resolver: 90).
const DIMS: Array<[string, string]> = [
  ["varietal", "pinotage"],
  ["region", "stellenbosch"],
  ["country", "south_africa"],
  ["estate", "stellenbosch_vineyards"],
];

// Mirror of RATING_POINTS (dnaThresholds.js) — heal step only.
const RATING_POINTS: Record<string, number> = { loved: 2, liked: 1, fine: 0, not_for_me: -1 };

type DimRow = { points: number; interaction_count: number } | null;

async function readDims(supabase: SupabaseClient, userId: string) {
  const out: Record<string, DimRow> = {};
  for (const [dimension, value] of DIMS) {
    const { data } = await supabase
      .from("dna_accumulation")
      .select("points, interaction_count")
      .eq("user_id", userId)
      .eq("dimension", dimension)
      .eq("dimension_value", value)
      .maybeSingle();
    out[`${dimension}:${value}`] = data ?? null;
  }
  return out;
}

async function findGuardRows(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("wine_interactions")
    .select("wine_name, rating, match_confidence")
    .eq("user_id", userId)
    .eq("source_url", "text_paste")
    .ilike("wine_name", "%kanonkop%");
  return data ?? [];
}

// Remove any guard row a crashed earlier run left behind, reversing its
// points so the baseline this run captures is the true seeded state.
async function healStaleGuardRows(supabase: SupabaseClient, userId: string) {
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
          await supabase
            .from("dna_accumulation")
            .update({ points: acc.points - pts })
            .eq("id", acc.id);
        }
      }
    }
    await supabase
      .from("wine_interactions")
      .delete()
      .eq("user_id", userId)
      .eq("wine_name", row.wine_name);
  }
}

test.describe("Evidence ledger — /recommend rating feeds DNA (hard-fail)", () => {
  test("rating a pick moves dna_accumulation; journal delete reverses it exactly", async ({ page }) => {
    test.setTimeout(120_000);
    const { supabase, userId } = await testDb();

    await healStaleGuardRows(supabase, userId);
    const baseline = await readDims(supabase, userId);
    // Event-ledger baselines — deltas only, never absolute counts
    const pickRatedBefore = await countEvents(supabase, userId, "pick_rated");
    const journalDeletedBefore = await countEvents(supabase, userId, "journal_deleted");
    const { count: timelineBaseline } = await supabase
      .from("dna_timeline")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    // The milestone hook (Act III S3) may silently refresh identity
    // bookkeeping (milestones baseline, red/white recount) during the run —
    // capture the identity-bearing profile fields so the restore is exact
    const { data: baselineIdentity } = await supabase
      .from("wine_profiles")
      .select("archetype, identity, red_count, white_count")
      .eq("user_id", userId)
      .single();

    try {
      const recPage = new RecommendPage(page);
      await recPage.goto();
      await recPage.pasteAndAnalyze(GUARD_LINE);
      await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

      // The single-wine list must produce the Kanonkop pick — no tolerance
      const card = recPage.pickCards.first();
      await expect(card).toBeVisible();
      await expect(card).toContainText(/Kanonkop/);

      await card.getByRole("button", { name: "Had this wine? Rate it" }).click();
      await page.getByRole("button", { name: /Loved it/ }).click();
      await expect(page.getByText("Rating saved!")).toBeVisible();

      // The interaction row lands AND resolution stamps it — the metadata
      // write happens inside resolveAndAccumulate a beat after the upsert,
      // so the poll must wait for both
      let guardName = "";
      await expect
        .poll(async () => {
          const rows = await findGuardRows(supabase, userId);
          if (rows.length !== 1) return "no-row";
          guardName = rows[0].wine_name;
          if (rows[0].rating !== "loved") return "wrong-rating";
          if (rows[0].match_confidence == null) return "unresolved";
          return "ready";
        }, { timeout: 20_000 })
        .toBe("ready");

      const { data: guardRow } = await supabase
        .from("wine_interactions")
        .select("resolved_varietal, resolved_country, match_confidence")
        .eq("user_id", userId)
        .eq("wine_name", guardName)
        .single();
      expect(guardRow!.match_confidence).toBeGreaterThanOrEqual(80);
      expect(guardRow!.resolved_varietal).toBe("Pinotage");
      expect(guardRow!.resolved_country).toBe("South Africa");

      // THE guard: a loved restaurant bottle is +2 on every resolved dimension
      await expect
        .poll(async () => {
          const now = await readDims(supabase, userId);
          return DIMS.every(([d, v]) => {
            const key = `${d}:${v}`;
            const base = baseline[key]?.points ?? 0;
            return (now[key]?.points ?? 0) === base + 2;
          });
        }, { timeout: 15_000 })
        .toBe(true);

      // Nothing crossed a threshold — no timeline events (fixture discipline)
      const { count: timelineNow } = await supabase
        .from("dna_timeline")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      expect(timelineNow).toBe(timelineBaseline);

      // The Long Memory: the rating wrote its pick_rated event — old→new
      // with the resolved band (fire-and-forget, so poll for the landing)
      await expect
        .poll(async () => countEvents(supabase, userId, "pick_rated"), { timeout: 15_000 })
        .toBe(pickRatedBefore + 1);
      const pickEvent = await latestEvent(supabase, userId, "pick_rated");
      expect(pickEvent!.payload.wine).toBe(guardName);
      expect(pickEvent!.payload.rating).toBe("loved");
      expect(pickEvent!.payload.previous_rating).toBeNull();
      expect(pickEvent!.payload.surface).toBe("recommend");
      expect(pickEvent!.payload.confidence_band).toBe("full");

      // Leg 2 — deleting the journal row reverses the evidence exactly
      await page.goto("/journal");
      await expect(page.getByRole("heading", { name: "Wine Journal" })).toBeVisible();
      await expect(page.getByText(guardName, { exact: true })).toBeVisible();
      const journalCard = page
        .locator("div")
        .filter({ has: page.getByText(guardName, { exact: true }) })
        .filter({ has: page.getByRole("button", { name: "×" }) })
        .last();
      await journalCard.getByRole("button", { name: "×" }).click();
      await expect(page.getByText("✓ Removed")).toBeVisible();

      await expect
        .poll(async () => {
          const now = await readDims(supabase, userId);
          return DIMS.every(([d, v]) => {
            const key = `${d}:${v}`;
            return (now[key]?.points ?? 0) === (baseline[key]?.points ?? 0);
          });
        }, { timeout: 15_000 })
        .toBe(true);

      // The Long Memory: the delete wrote its journal_deleted event — what
      // was removed, and that evidence really was reversed
      await expect
        .poll(async () => countEvents(supabase, userId, "journal_deleted"), { timeout: 15_000 })
        .toBe(journalDeletedBefore + 1);
      const deleteEvent = await latestEvent(supabase, userId, "journal_deleted");
      expect(deleteEvent!.payload.wine).toBe(guardName);
      expect(deleteEvent!.payload.rating).toBe("loved");
      expect(deleteEvent!.payload.points_reversed).toBe(true);
    } finally {
      // Kill any in-flight page JS FIRST — on an assertion failure the
      // browser's resolveAndAccumulate may still be running, and cleaning
      // the DB under it lets the engine re-insert rows after the restore
      // (observed: two failed runs leaked +2 each and promoted pinotage)
      await page.goto("about:blank").catch(() => {});

      // Exact restore, downstream state included: guard interaction gone,
      // baseline-absent accumulation rows deleted, baseline rows restored
      for (const row of await findGuardRows(supabase, userId)) {
        await supabase
          .from("wine_interactions")
          .delete()
          .eq("user_id", userId)
          .eq("wine_name", row.wine_name);
      }
      for (const [dimension, value] of DIMS) {
        const base = baseline[`${dimension}:${value}`];
        if (base) {
          await supabase
            .from("dna_accumulation")
            .update({ points: base.points, interaction_count: base.interaction_count })
            .eq("user_id", userId)
            .eq("dimension", dimension)
            .eq("dimension_value", value);
        } else {
          await supabase
            .from("dna_accumulation")
            .delete()
            .eq("user_id", userId)
            .eq("dimension", dimension)
            .eq("dimension_value", value);
        }
      }
      if (baselineIdentity) {
        await supabase
          .from("wine_profiles")
          .update({
            archetype: baselineIdentity.archetype,
            identity: baselineIdentity.identity,
            red_count: baselineIdentity.red_count,
            white_count: baselineIdentity.white_count,
          })
          .eq("user_id", userId);
      }
    }
  });
});
