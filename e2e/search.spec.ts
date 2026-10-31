import { test, expect } from "@playwright/test";
import { testDb, ensureEarnedFixture, EARNED_FIXTURE } from "./fixtures/test-db";

/**
 * Hard-fail guards for Search (/search — The House List, Phase 5, §8.6).
 *
 * 1. No query: the DNA to browse — regions, grapes, estates, never
 *    countries — with ✦ only on what ratings earned; a tap fills the query.
 * 2. A query searches the journal, the DNA and the Somm's picks; a journal
 *    hit opens its wine page, the step back lands on the same results
 *    (?q= rides the URL), and the search waits under Recent.
 * 3. Nothing found says so — never a blank page — and offers the label
 *    camera.
 * 4. The 🔍 on home and on an inner page's running head both open Search.
 *
 * Do NOT make these outcome-tolerant: Search is the way back to any bottle
 * the journal holds, and the masthead's only door to it.
 *
 * Read-only on the RICH account: its seeded DNA (Stellenbosch and Burgundy,
 * Pinot Noir and Chardonnay, Kanonkop — plus the earned Chenin Blanc
 * fixture, self-healed in beforeAll) and its seeded want "Kanonkop, Paul
 * Sauer" are the premise. Searching writes nothing to the database: recent
 * searches live in this browser's localStorage only.
 */

test.describe("Search (hard-fail guard)", () => {
  test.beforeAll(async () => {
    const { supabase, userId } = await testDb();
    await ensureEarnedFixture(supabase, userId);
  });

  test("no query: browse the DNA — regions, grapes, estates — and a tap fills the query", async ({ page }) => {
    await page.goto("/search");
    const browse = page.getByTestId("search-browse");
    await expect(browse).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("search-input")).toBeFocused();

    // An inner page (decision D1) whose own 🔍 is hidden: out of the
    // accessibility tree, the head's grid kept balanced
    const head = page.getByTestId("running-head");
    await expect(head).toBeVisible();
    await expect(page.getByTestId("service-bar")).toBeVisible();
    await expect(head.getByRole("link", { name: "Search" })).toHaveCount(0);

    for (const [name, kind] of [
      ["Stellenbosch", "Region"], ["Burgundy", "Region"],
      ["Pinot Noir", "Grape"], ["Chardonnay", "Grape"], ["Chenin Blanc", "Grape"],
      ["Kanonkop", "Estate"],
    ]) {
      const row = browse.getByRole("button", { name: new RegExp(`^${name}`) });
      await expect(row, `${name} browses`).toBeVisible();
      await expect(row).toContainText(kind, { ignoreCase: true });
    }
    // Countries never browse
    await expect(browse.getByRole("button", { name: /South Africa|France/ })).toHaveCount(0);

    // ✦ only on what ratings earned — the Chenin Blanc fixture, never the
    // quiz's Pinot Noir — and the legend that says so
    const chenin = browse.getByRole("button", { name: /^Chenin Blanc/ });
    await expect(chenin.getByRole("img", { name: "earned by your ratings" })).toBeVisible();
    await expect(browse.getByRole("button", { name: /^Pinot Noir/ }).getByRole("img")).toHaveCount(0);
    await expect(browse.getByText("earned by your ratings, not the quiz")).toBeVisible();

    // A tap fills the query, and the results follow
    await chenin.click();
    await expect(page.getByTestId("search-input")).toHaveValue("Chenin Blanc");
    const dnaHit = page.getByTestId("search-dna-row").filter({ hasText: "Chenin Blanc" });
    await expect(dnaHit).toBeVisible();
    await expect(dnaHit).toContainText(`Grape · ${EARNED_FIXTURE.interactionCount} bottles`);
    await expect(dnaHit).toHaveAttribute("href", "/palate");
  });

  test("a query searches journal, DNA and picks — and the step back from a wine keeps it", async ({ page }) => {
    await page.goto("/search");
    const input = page.getByTestId("search-input");
    await expect(page.getByTestId("search-browse")).toBeVisible({ timeout: 15_000 });
    await input.fill("kanonkop");

    const results = page.getByTestId("search-results");
    // The journal: the seeded want, with its mark; the group's head counts
    // exactly the rows it holds
    const journalHit = results.locator('[data-testid="search-journal-row"][data-wine="Kanonkop, Paul Sauer"]');
    await expect(journalHit).toBeVisible();
    await expect(journalHit).toContainText("📌");
    const hits = await results.getByTestId("search-journal-row").count();
    await expect(results.getByRole("heading", { name: `In your journal · ${hits}` })).toBeVisible();
    // The DNA: the quiz's estate, with its kind and count line
    const dnaHit = results.getByTestId("search-dna-row").filter({ hasText: "Kanonkop" });
    await expect(dnaHit).toContainText(/Estate · (from your quiz|\d+ bottles?)/);

    // Open the journal hit: its wine page, and the head offers the way back
    await journalHit.click();
    await page.waitForURL(/\/wine\?name=/, { timeout: 15_000 });
    await expect(page.getByTestId("wine-page").getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    const back = page.getByTestId("running-head-back");
    await expect(back).toContainText("Search");
    await back.click();

    // The same results, the query restored from the URL
    await page.waitForURL(/\/search\?q=kanonkop/, { timeout: 15_000 });
    await expect(page.getByTestId("search-input")).toHaveValue("kanonkop", { timeout: 15_000 });
    await expect(page.getByTestId("search-results").locator('[data-wine="Kanonkop, Paul Sauer"]')).toBeVisible();

    // Clear: the field empties and keeps focus; the search waits under
    // Recent, and a tap brings it back
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByTestId("search-input")).toHaveValue("");
    await expect(page.getByTestId("search-input")).toBeFocused();
    const recent = page.getByTestId("search-recent");
    await expect(recent.getByRole("heading", { name: "Recent" })).toBeVisible();
    await recent.getByRole("button", { name: "kanonkop" }).click();
    await expect(page.getByTestId("search-input")).toHaveValue("kanonkop");
    await expect(page.getByTestId("search-results")).toBeVisible();
  });

  test("nothing found says so and offers the label camera — arriving with a query keeps the keyboard down", async ({ page }) => {
    await page.goto("/search?q=qwxzq%20vvq");
    const input = page.getByTestId("search-input");
    await expect(input).toHaveValue("qwxzq vvq", { timeout: 15_000 });
    await expect(page.getByText("Nothing for “qwxzq vvq” on our list yet.")).toBeVisible();
    await expect(page.getByText("Try a grape, a region or a producer.")).toBeVisible();
    await expect(page.getByRole("link", { name: "📸 Snap the label instead" })).toHaveAttribute("href", "/log");
    await expect(input).not.toBeFocused();
  });

  test("the 🔍 on home and on an inner page's running head opens Search", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "Search", exact: true }).click();
    await page.waitForURL("/search", { timeout: 15_000 });
    await expect(page.getByTestId("search-input")).toBeVisible({ timeout: 15_000 });

    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible({ timeout: 15_000 });
    const headSearch = page.getByTestId("running-head").getByRole("link", { name: "Search", exact: true });
    await expect(headSearch).toBeVisible();
    await headSearch.click();
    await page.waitForURL("/search", { timeout: 15_000 });
    await expect(page.getByTestId("search-input")).toBeVisible({ timeout: 15_000 });
  });
});
