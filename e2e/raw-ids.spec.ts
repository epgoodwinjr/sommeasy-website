import { test, expect, Page } from "@playwright/test";

/**
 * Permanent regression guard (Palate Act II brief, non-negotiable):
 * no visible text node may be a raw internal ID like "south_africa",
 * "hemel_en_aarde_walker_bay", or "pinot_noir" — on the home page, the
 * Palate view, or the journal. Display-name discipline everywhere.
 *
 * HARD FAIL by design — like the fail-if-no-picks spec, this must never be
 * made outcome-tolerant. If it fails, either a display regressed to raw IDs
 * or a page failed to render its content; both are real failures.
 */

async function findRawIdTextNodes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const RAW_ID = /^[a-z0-9]+(_[a-z0-9]+)+$/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const offenders: string[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || "").trim();
      if (!text || !RAW_ID.test(text)) continue;
      const el = node.parentElement;
      if (!el) continue;
      if (el.closest("script, style, noscript, [hidden]")) continue;
      if (typeof el.checkVisibility === "function" && !el.checkVisibility()) continue;
      offenders.push(text);
    }
    return offenders;
  });
}

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
