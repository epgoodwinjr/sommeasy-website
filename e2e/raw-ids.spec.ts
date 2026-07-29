import { test, expect } from "@playwright/test";
import { findRawIdTextNodes } from "./fixtures/raw-id-scan";

/**
 * Permanent regression guard (Palate Act II brief, non-negotiable):
 * no visible text node may be a raw internal ID like "south_africa",
 * "hemel_en_aarde_walker_bay", or "pinot_noir" — on the home page, the
 * Palate view, or the journal. Display-name discipline everywhere.
 * (The scanner lives in fixtures/raw-id-scan.ts so the quiz-completion
 * reveal spec runs the same check.)
 *
 * HARD FAIL by design — like the fail-if-no-picks spec, this must never be
 * made outcome-tolerant. If it fails, either a display regressed to raw IDs
 * or a page failed to render its content; both are real failures.
 */

test.describe("No raw internal IDs (permanent guard)", () => {
  test("home page shows no raw IDs", async ({ page }) => {
    await page.goto("/");
    // The DNA strip (door to the palate) must render — a blank page passing
    // the scan would be outcome-tolerance in disguise
    await expect(page.getByTestId("palate-strip")).toBeVisible();
    const offenders = await findRawIdTextNodes(page);
    expect(offenders, `Raw internal IDs rendered: ${offenders.join(", ")}`).toEqual([]);
  });

  test("palate view shows no raw IDs", async ({ page }) => {
    await page.goto("/palate");
    await expect(page.getByTestId("palate-dna")).toBeVisible();
    await expect(page.getByText("Grapes", { exact: true })).toBeVisible();
    const offenders = await findRawIdTextNodes(page);
    expect(offenders, `Raw internal IDs rendered: ${offenders.join(", ")}`).toEqual([]);
  });

  test("journal (all tabs) shows no raw IDs", async ({ page }) => {
    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "Wine Journal" })).toBeVisible();
    for (const tab of [/^Tried \(/, /^Want to Try \(/, /^Skipped \(/, /^DNA Timeline$/]) {
      await page.getByRole("button", { name: tab }).click();
      const offenders = await findRawIdTextNodes(page);
      expect(offenders, `Raw internal IDs rendered on tab ${tab}: ${offenders.join(", ")}`).toEqual([]);
    }
  });
});
