import { test, expect } from "@playwright/test";
import { findRawIdTextNodes } from "./fixtures/raw-id-scan";
import { testDb, ensureEarnedFixture, readEarnedFixtureRow, EARNED_FIXTURE } from "./fixtures/test-db";

/**
 * Hard-fail guard for the quiz completion flow (The Reveal session).
 *
 * Completing the quiz must: auto-save the profile (NO save button, no state
 * where a completed quiz sits unsaved), land the reveal (archetype +
 * narrative) with the palate CTA, and render ratable recommendations wired to
 * the shared WineRecList — and rating one must succeed.
 *
 * Do NOT make this outcome-tolerant. If the reveal doesn't render, the save
 * failed or the flow broke — both are real failures.
 *
 * Data discipline: the spec completes the quiz in REFINE mode, so the save
 * merges the seeded account's own answers back (content-identical profile),
 * and the rating uses "It was fine" (0 evolution points — the seeded DNA
 * never drifts). The created journal row is deleted through the journal UI
 * afterwards, so repeated runs start from the same state.
 */

test.describe("Quiz completion — The Reveal (hard-fail guard)", () => {
  test("complete quiz → auto-saved reveal with ratable recs → rating succeeds", async ({ page }) => {
    await page.goto("/?quiz=refine");

    // Refine mode opens on step 1 with seeded answers. Wait for each step
    // indicator between clicks — the 200ms step animation re-renders the nav
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });
    for (let step = 2; step <= 5; step++) {
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
    }
    await page.getByRole("button", { name: "Update My Wine DNA" }).click();

    // The reveal lands — already saved (auto-save runs behind the reading
    // moment; the reveal renders the row the save returned)
    const archetype = page.getByTestId("reveal-archetype");
    await expect(archetype).toBeVisible({ timeout: 30_000 });
    expect((await archetype.textContent())?.trim().length).toBeGreaterThan(0);
    await expect(page.getByTestId("reveal-saved")).toBeVisible();

    // Auto-save means NO save button, and the reveal is a moment, not a
    // parallel profile page — no Full Profile tab, the room is /palate
    await expect(page.getByText(/Save My Wine DNA/)).toHaveCount(0);
    await expect(page.getByText("Full Profile", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("reveal-palate-cta")).toBeVisible();

    // Display-name discipline holds on the reveal too
    const offenders = await findRawIdTextNodes(page);
    expect(offenders, `Raw internal IDs rendered on reveal: ${offenders.join(", ")}`).toEqual([]);

    // Ratable recs via the shared component
    const recs = page.getByTestId("reveal-recs");
    await expect(recs).toBeVisible();
    const firstCard = recs.getByTestId("rec-card").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /Had it/ })).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /Want to try/ })).toBeVisible();
    await expect(firstCard.getByRole("button", { name: /Not for me/ })).toBeVisible();

    // Rating one succeeds: Had it → rating modal → saved toast → card leaves
    const cardText = await firstCard.innerText();
    const wineName = cardText.split("\n").map((l) => l.trim()).filter(Boolean)[1];
    expect(wineName?.length).toBeGreaterThan(0);

    await firstCard.getByRole("button", { name: /Had it/ }).click();
    await page.getByRole("button", { name: /It was fine/ }).click();
    await expect(page.getByText("✓ Noted!")).toBeVisible();
    await expect(recs.getByText(wineName, { exact: true })).toHaveCount(0);

    // Cleanup: delete the journal row the rating created so the suite is
    // idempotent (reverseAccumulation is a no-op for a 0-point rating)
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
  });

  /**
   * The uncheck is honored (Ed's August 2026 decision): an earned item that
   * was pre-checked at refine start and explicitly unchecked leaves the
   * profile, its promotion un-flags, and its points survive.
   *
   * Self-healing: the earned Chenin Blanc fixture is (re)asserted before the
   * flow and restored after it, so the account's fixture state is identical
   * before and after every run — even a crashed one heals on the next pass.
   */
  test("refine marks earned DNA with ✦; unchecking it removes it, points survive", async ({ page }) => {
    const { supabase, userId } = await testDb();
    await ensureEarnedFixture(supabase, userId);

    await page.goto("/?quiz=refine");
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });

    // The legend and the ✦ tell the user what an uncheck costs
    await expect(page.getByTestId("earned-legend")).toBeVisible();

    for (let step = 2; step <= 4; step++) {
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
    }

    // Step 4 (varietals): the earned chip wears the ✦ and is pre-checked
    const cheninChip = page.getByRole("button", { name: /Chenin Blanc/ }).first();
    await expect(cheninChip).toContainText("✦");
    await expect(cheninChip).toContainText("✓");
    await cheninChip.click(); // the explicit uncheck
    await expect(cheninChip).not.toContainText("✓");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await page.getByRole("button", { name: "Update My Wine DNA" }).click();
    await expect(page.getByTestId("reveal-saved")).toBeVisible({ timeout: 30_000 });

    // The uncheck landed: profile no longer carries it, the accumulation row
    // is un-flagged, and the points survived (continued love re-promotes)
    const { data: profile } = await supabase
      .from("wine_profiles").select("varietals").eq("user_id", userId).single();
    expect(profile!.varietals).not.toContain(EARNED_FIXTURE.value);
    const row = await readEarnedFixtureRow(supabase, userId);
    expect(row!.promoted).toBe(false);
    expect(row!.points).toBe(EARNED_FIXTURE.points);
    expect(row!.source).toBe("auto");

    // Restore the fixture for the rest of the suite and the next run
    await ensureEarnedFixture(supabase, userId);
    const restored = await readEarnedFixtureRow(supabase, userId);
    expect(restored!.promoted).toBe(true);
  });
});
