import { test, expect } from "@playwright/test";
import { testDb, countEvents, latestEvent } from "./fixtures/test-db";

/**
 * Log a bottle (/log — The House List, Phase 2): the search → rate path.
 * The first block is READ-ONLY — nothing there saves. It pins the rate
 * step's furniture (the as-written eyebrow, the editable name with its
 * vintage split off, Save gated on a rating) and that the editable name
 * never doubles its text under forced colors (the name is a transparent
 * textarea laid over a mirror of itself, and Windows high contrast forces
 * text colors on form controls).
 *
 * The second block SAVES, on the RICH account only (never the zero-state
 * one): editing a want's name before saving must move that row to the new
 * name — Phase 2 left the 📌 entry behind beside the logged bottle. Its
 * want row is seeded under an "[e2e]" name that resolves to nothing, the
 * rating is "It was fine" (0 points), and afterEach deletes both names and
 * restores the timeline and identity fields the milestone hook may touch.
 */

test.describe("Log a bottle — search → rate (no save)", () => {
  test("an as-written name reaches the rate step; Save waits for a rating", async ({ page }) => {
    await page.goto("/log?q=zzqx%20vintners%202019");
    await expect(page.getByTestId("log-search-input")).toHaveValue("zzqx vintners 2019", { timeout: 15_000 });
    await page.getByRole("button", { name: /as written/ }).click();

    const rate = page.getByTestId("bottle-confirm");
    await expect(rate).toBeVisible();
    await expect(rate).toContainText("🔍 As written");
    // The vintage is split off for display; the field holds the name
    await expect(page.getByTestId("bottle-wine-name")).toHaveValue("zzqx vintners");
    await expect(rate).toContainText("2019");

    await expect(page.getByTestId("log-save")).toBeDisabled();
    await rate.getByRole("radio", { name: "It was fine" }).click();
    await expect(page.getByTestId("log-save")).toBeEnabled();
    // …and it stops here: never saved
  });

  test("the editable name never doubles its text under forced colors", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/log?q=zzqx%20vintners");
    await expect(page.getByTestId("log-search-input")).toHaveValue("zzqx vintners", { timeout: 15_000 });
    await page.getByRole("button", { name: /as written/ }).click();
    const field = page.getByTestId("bottle-wine-name");
    await expect(field).toBeVisible();
    // Glyphs paint with -webkit-text-fill-color when it's set, and forced
    // colors leave it alone (they force `color` and the caret) — so the
    // textarea's own text stays invisible over the mirror while the caret
    // takes the system color. Lose the fill and the text doubles.
    const fill = await field.evaluate((el) => getComputedStyle(el).getPropertyValue("-webkit-text-fill-color"));
    expect(fill, "textarea glyph fill under forced colors").toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("Log a bottle — an edited want renames its row (hard-fail)", () => {
  const WANT = "[e2e] Zzyzx Rename Check 2020";
  const RENAMED = "[e2e] Zzyzx Rename Checked 2020";
  let restore: { identity: Record<string, unknown> | null; eventIds: Set<string> } | null = null;

  test.afterEach(async ({ page }) => {
    if (!restore) return;
    const { identity, eventIds } = restore;
    restore = null;
    const { supabase, userId } = await testDb();
    await page.goto("about:blank").catch(() => {});
    // 0 points, and neither name resolves: nothing ever accumulated, so a
    // plain delete is the exact restore
    await supabase.from("wine_interactions").delete().eq("user_id", userId).in("wine_name", [WANT, RENAMED]);
    const { data: eventsNow } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
    for (const e of eventsNow ?? []) {
      if (!eventIds.has(e.id)) await supabase.from("dna_timeline").delete().eq("id", e.id);
    }
    if (identity) await supabase.from("wine_profiles").update(identity).eq("user_id", userId);
  });

  test("editing a want's name before saving moves that row — the 📌 never lingers", async ({ page }) => {
    test.setTimeout(120_000);
    const { supabase, userId } = await testDb();
    await supabase.from("wine_interactions").delete().eq("user_id", userId).in("wine_name", [WANT, RENAMED]);
    const { data: identity } = await supabase
      .from("wine_profiles")
      .select("archetype, identity, red_count, white_count")
      .eq("user_id", userId)
      .single();
    const { data: events } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
    restore = { identity, eventIds: new Set((events ?? []).map((e) => e.id)) };
    // An unrated want, the way 📌 Want it leaves one (its provenance marks it)
    await supabase.from("wine_interactions").insert({
      user_id: userId, wine_name: WANT, interaction_type: "want", source_url: "e2e_rename",
    });
    const loggedBefore = await countEvents(supabase, userId, "bottle_logged");

    await page.goto("/log");
    await expect(page.getByTestId("log-find")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Zzyzx Rename Check 2020/ }).click();
    const rate = page.getByTestId("bottle-confirm");
    await expect(rate).toContainText("📌 From your want list");
    const field = page.getByTestId("bottle-wine-name");
    await expect(field).toHaveValue("[e2e] Zzyzx Rename Check");
    await field.fill("[e2e] Zzyzx Rename Checked");
    await rate.getByRole("radio", { name: "It was fine" }).click();
    await page.getByTestId("log-save").click();
    await expect(page.getByText("Noted in your journal")).toBeVisible({ timeout: 20_000 });

    // ONE row, under the new name, rated — the want moved, provenance and all
    await expect
      .poll(async () => {
        const { data } = await supabase
          .from("wine_interactions")
          .select("wine_name, interaction_type, rating, source_url")
          .eq("user_id", userId)
          .in("wine_name", [WANT, RENAMED]);
        return (data ?? []).map((r) => `${r.wine_name}|${r.interaction_type}|${r.rating}|${r.source_url}`);
      }, { timeout: 15_000 })
      .toEqual([`${RENAMED}|had|fine|e2e_rename`]);

    await expect
      .poll(async () => countEvents(supabase, userId, "bottle_logged"), { timeout: 15_000 })
      .toBe(loggedBefore + 1);
    const logged = await latestEvent(supabase, userId, "bottle_logged");
    expect(logged!.payload.wine).toBe(RENAMED);
    expect(logged!.payload.previous_rating).toBeNull();
  });
});
