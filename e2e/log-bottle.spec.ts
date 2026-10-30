import { test, expect } from "@playwright/test";

/**
 * Log a bottle (/log — The House List, Phase 2): the search → rate path.
 * READ-ONLY — nothing here saves, so no journal row or ledger event is
 * written. Pins the rate step's furniture (the as-written eyebrow, the
 * editable name with its vintage split off, Save gated on a rating) and
 * that the editable name never doubles its text under forced colors (the
 * name is a transparent textarea laid over a mirror of itself, and Windows
 * high contrast forces text colors on form controls).
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
