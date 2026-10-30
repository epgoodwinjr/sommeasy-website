import { test, expect } from "@playwright/test";
import { testDb, ensureEarnedFixture } from "./fixtures/test-db";

/**
 * ONE-TIME SEEDER for the dedicated e2e account (TEST_USER_EMAIL). Gated
 * behind SEED_TEST_ACCOUNT so normal suite runs skip it:
 *
 *   SEED_TEST_ACCOUNT=1 npx playwright test e2e/seed-test-account.spec.ts
 *
 * Builds the stable fixture the suite depends on, through the REAL product
 * flows wherever possible:
 * - Quiz (fresh) via the UI: South Africa + France; Stellenbosch + Burgundy;
 *   Kanonkop; Pinot Noir + Chardonnay. palate.spec's named assertions
 *   (South Africa / Stellenbosch / Pinot Noir) ride on these.
 * - Post-quiz reveal ratings via the UI: two loved/liked (journal Tried rows
 *   + building-now accumulation), one want (wishlist row).
 * - One earned-promoted varietal (Chenin Blanc ✦) via test-db — the fixture
 *   the refine-uncheck spec exercises and restores.
 *
 * Safe to re-run: the quiz save is an upsert, rec ratings only apply to
 * still-unrated recs, and ensureEarnedFixture is idempotent.
 */

test.describe("Seed the dedicated test account", () => {
  test.skip(!process.env.SEED_TEST_ACCOUNT, "Seeder — run explicitly with SEED_TEST_ACCOUNT=1");

  test("seed fixture profile through real flows", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/");

    // Fresh account lands on the welcome screen; a re-run lands on the
    // profile view — wait for either to settle, then enter the quiz
    // accordingly (refine keeps selections)
    const buildButton = page.getByRole("button", { name: "Build My Profile" });
    const palateStrip = page.getByTestId("palate-strip");
    await expect(buildButton.or(palateStrip)).toBeVisible({ timeout: 15_000 });
    if (await buildButton.isVisible()) {
      await buildButton.click();
    } else {
      await page.goto("/?quiz=refine");
    }
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });

    // Ensure-selected: skip a chip already checked from a re-run. Country
    // chips carry a flag-emoji prefix, so match by substring, not anchor.
    const ensureChip = async (name: string) => {
      const chip = page.getByRole("button", { name: new RegExp(name) }).first();
      const label = await chip.textContent();
      if (!label?.includes("✓")) await chip.click();
    };

    // Step 1 — countries
    await ensureChip("South Africa");
    await ensureChip("France");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 5")).toBeVisible();

    // Accordion-grouped steps: which group opens first follows the saved
    // profile's order, so open the chip's accordion when it isn't visible
    const ensureAccordionChip = async (accordion: string, chip: string) => {
      const chipBtn = page.getByRole("button", { name: new RegExp(chip) }).first();
      if (!(await chipBtn.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: new RegExp(accordion) }).first().click();
      }
      await ensureChip(chip);
    };

    // Step 2 — regions, grouped by country accordion
    await ensureAccordionChip("South Africa", "Stellenbosch");
    await ensureAccordionChip("France", "Burgundy");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 3 of 5")).toBeVisible();

    // Step 3 — producers, grouped by region accordion
    await ensureAccordionChip("Stellenbosch", "Kanonkop");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 4 of 5")).toBeVisible();

    // Step 4 — varietals
    await ensureChip("Pinot Noir");
    await ensureChip("Chardonnay");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();

    // Step 5 — no specific wines; complete (auto-saves)
    await page.getByRole("button", { name: /See My Wine DNA|Update My Wine DNA/ }).click();
    await expect(page.getByTestId("reveal-saved")).toBeVisible({ timeout: 30_000 });

    // Rate recs through the reveal: loved, liked, want — real rating path,
    // so accumulation/building-now rows are genuine. Rows acted on stay put
    // with a done line (House List rows), so each step pins the first row
    // still offering its actions by its data-wine
    const recs = page.getByTestId("reveal-recs");
    const nextOpenRow = async () => {
      const open = recs.getByTestId("rec-card")
        .filter({ has: page.getByRole("button", { name: /Had it/ }) }).first();
      if (!(await open.isVisible().catch(() => false))) return null;
      const wine = (await open.getAttribute("data-wine")) ?? "";
      return recs.locator(`[data-testid="rec-card"][data-wine="${wine.replace(/"/g, '\\"')}"]`);
    };
    const rateNext = async (ratingId: string, label: string) => {
      const row = await nextOpenRow();
      if (!row) return;
      await row.getByRole("button", { name: /Had it/ }).click();
      await row.getByTestId(`rating-tile-${ratingId}`).click();
      await expect(row).toContainText(`${label} — noted in your journal.`);
      await page.waitForTimeout(2500); // let resolveAndAccumulate settle
    };
    if (await recs.isVisible().catch(() => false)) {
      await rateNext("loved", "Loved it");
      await rateNext("liked", "Liked it");
      const wantRow = await nextOpenRow();
      if (wantRow) {
        await wantRow.getByRole("button", { name: /Want it/ }).click();
        await expect(wantRow).toContainText("On your want list");
      }
    }

    // The earned-promoted ✦ fixture (Chenin Blanc)
    const { supabase, userId } = await testDb();
    await ensureEarnedFixture(supabase, userId);

    // Prove the seeded palate renders
    await page.goto("/palate");
    await expect(page.getByTestId("palate-archetype")).toBeVisible({ timeout: 15_000 });
    const dna = page.getByTestId("palate-dna");
    await expect(dna.getByText("South Africa").first()).toBeVisible();
    await expect(dna.getByText("Stellenbosch").first()).toBeVisible();
    await expect(dna.getByText("Pinot Noir").first()).toBeVisible();
    await expect(dna.getByText("Chenin Blanc").first()).toBeVisible();
  });
});
