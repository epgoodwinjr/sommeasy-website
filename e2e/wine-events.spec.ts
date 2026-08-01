import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { testDb } from "./fixtures/test-db";

/**
 * Hard-fail guard for the event ledger's ONE structural promise (The Long
 * Memory): event writes appear in ZERO critical paths. With every
 * wine_events request blackholed at the network layer, the full quiz →
 * reveal → rate → journal-delete flow must behave IDENTICALLY — same
 * beats, same toasts, same data — and the ledger must gain nothing.
 *
 * If this spec fails on a UI beat, an event write crept into a critical
 * path (an await before a user-visible step, an unswallowed rejection). If
 * it fails on the count, the blocking pattern no longer matches the
 * endpoint — fix the pattern, not the contract.
 *
 * Data discipline: mirrors the quiz-completion guard — refine save is
 * content-identical, the rating is "It was fine" (0 points), the created
 * journal row is deleted through the UI. No wine_events cleanup exists or
 * is needed: the whole point is that nothing gets written.
 */

async function countAllEvents(supabase: SupabaseClient, userId: string) {
  const { count } = await supabase
    .from("wine_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

test.describe("Event ledger — fire-and-forget (hard-fail guard)", () => {
  test("with wine_events blackholed, every user-visible beat still lands", async ({ page }) => {
    test.setTimeout(120_000);
    const { supabase, userId } = await testDb();
    const eventsBefore = await countAllEvents(supabase, userId);

    // Blackhole every wine_events REST call the app makes (the spec's own
    // node-side client above is not routed through the page, so assertions
    // still see the DB)
    await page.route("**/rest/v1/wine_events**", (route) => route.abort());

    // Quiz → reveal (quiz_completed blocked underneath)
    await page.goto("/?quiz=refine");
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });
    for (let step = 2; step <= 5; step++) {
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
    }
    await page.getByRole("button", { name: "Update My Wine DNA" }).click();
    await expect(page.getByTestId("reveal-saved")).toBeVisible({ timeout: 30_000 });

    // Rate a rec (rec_rated blocked underneath) — the toast must still land
    const recs = page.getByTestId("reveal-recs");
    await expect(recs).toBeVisible();
    const firstCard = recs.getByTestId("rec-card").first();
    const cardText = await firstCard.innerText();
    const wineName = cardText.split("\n").map((l) => l.trim()).filter(Boolean)[1];
    expect(wineName?.length).toBeGreaterThan(0);
    await firstCard.getByRole("button", { name: /Had it/ }).click();
    await page.getByRole("button", { name: /It was fine/ }).click();
    await expect(page.getByText("✓ Noted!")).toBeVisible();
    await expect(recs.getByText(wineName, { exact: true })).toHaveCount(0);

    // Journal delete (journal_deleted blocked underneath) — still works
    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "Wine Journal" })).toBeVisible();
    await expect(page.getByText(wineName, { exact: true })).toBeVisible();
    const journalCard = page
      .locator("div")
      .filter({ has: page.getByText(wineName, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "×" }) })
      .last();
    await journalCard.getByRole("button", { name: "×" }).click();
    await expect(page.getByText("✓ Removed")).toBeVisible();
    await expect(page.getByText(wineName, { exact: true })).toHaveCount(0);

    // The ledger gained NOTHING — every insert was aborted and swallowed.
    // Settle a beat first so a straggling (blocked) request can't race the
    // read; then a hard equality.
    await page.waitForTimeout(2_000);
    expect(await countAllEvents(supabase, userId)).toBe(eventsBefore);
  });
});
