import { test, expect, type Page } from "@playwright/test";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb } from "./fixtures/test-db";

/**
 * Tonight's terms hold (hard-fail guard) — Ed's rule, Nov 12, 2026.
 *
 * The picks come only from wines inside the budget, plus at most ONE wine
 * over the max and within twice it, labeled Splurge; a chosen color means
 * that color. No backfill: when two wines fit, the page shows two, and when
 * none do it says so — it never fills the page with wines that break the
 * terms. Until this rule the engine dropped a budget fewer than three wines
 * fit, and a color fewer than three wines had; no unit test and no spec saw
 * it, because every other spec analyzes with no terms set.
 *
 * Everything goes through the real Tonight's terms controls — on the input
 * view before the read, and under Adjust on the picks. Every test blocks the
 * Somm, so this file makes no Claude calls and the picks on screen are the
 * engine's own. Nothing here rates or chooses; the only writes are
 * menu_analyzed events. The RICH account's seeded palate is the premise and
 * is pinned first.
 */

// Five reds, two whites, one sparkling — every one a match for the seeded
// palate (South Africa, France; Stellenbosch, Burgundy)
const LIST = `REDS
Kanonkop Pinotage, Stellenbosch 2019...$68
Meerlust Rubicon, Stellenbosch 2018...$92
Joseph Drouhin Chorey-lès-Beaune 2020...$74
Hamilton Russell Pinot Noir, Hemel-en-Aarde 2021...$88
Domaine Dujac Morey-Saint-Denis 2019...$165

WHITES
Raats Original Chenin Blanc, Stellenbosch 2022...$44
Louis Michel Chablis 2021...$66

SPARKLING
Pierre Gimonnet Blanc de Blancs 1er Cru, Champagne NV...$110`;

const WHITES = ["Raats Original Chenin Blanc, Stellenbosch 2022", "Louis Michel Chablis 2021"];
const SPARKLING = ["Pierre Gimonnet Blanc de Blancs 1er Cru, Champagne NV"];

const blockSomm = (page: Page) => page.route("**/api/somm-picks", (route) => route.abort());

type Card = { wine: string; price: number; role: string };
const cards = (page: Page): Promise<Card[]> =>
  page.locator('[data-testid="pick-card"]').evaluateAll((els) =>
    els.map((el) => ({
      wine: (el as HTMLElement).dataset.wine || "",
      price: Number((el as HTMLElement).dataset.price),
      role: (el as HTMLElement).dataset.role || "",
    })));

/** The rule, read off the page: nothing over max but one Splurge within 2×. */
function expectWithinBudget(shown: Card[], max: number) {
  const over = shown.filter((c) => c.price > max);
  expect(over.length, `at most one pick over $${max}: ${JSON.stringify(shown)}`).toBeLessThanOrEqual(1);
  for (const c of over) {
    expect(c.role, `the pick over $${max} is the Splurge`).toBe("splurge");
    expect(c.price, `the Splurge is within twice the max`).toBeLessThanOrEqual(max * 2);
  }
  expect(shown.every((c) => Number.isFinite(c.price) && c.price > 0), "every card carries its price").toBe(true);
}

async function pinPalate() {
  const { supabase, userId } = await testDb();
  const { data: profile } = await supabase
    .from("wine_profiles").select("countries, preferences").eq("user_id", userId).single();
  expect(profile!.countries).toEqual(expect.arrayContaining(["south_africa", "france"]));
  // No saved terms: each test sets its own through the UI
  expect(profile!.preferences ?? {}).toEqual({});
}

async function adjust(page: Page) {
  if ((await page.getByPlaceholder("max").count()) === 0) await page.getByRole("button", { name: "Adjust ›" }).click();
  await expect(page.getByPlaceholder("max")).toBeVisible();
}

test.describe("Tonight's terms hold — budget, color, and what is left (hard-fail)", () => {
  test.beforeEach(async ({ page }) => {
    await pinPalate();
    await blockSomm(page);
  });

  test("a budget: no pick over the max but one Splurge — down to two picks, one, and none", async ({ page }) => {
    const rec = new RecommendPage(page);
    await rec.goto();
    // Set before the read, on the input view
    await page.getByPlaceholder("max").fill("80");
    await rec.pasteAndAnalyze(LIST);
    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 10_000 });
    await expect.poll(async () => page.getByTestId("somm-thinking").count(), { timeout: 15_000 }).toBe(0);

    // Up to $80: four wines fit ($44, $66, $68, $74) and one stretch — five
    let shown = await cards(page);
    expect(shown).toHaveLength(5);
    expectWithinBudget(shown, 80);
    expect(shown.filter((c) => c.price <= 80)).toHaveLength(4);

    // Up to $60, under Adjust: ONE wine fits. The page shows it and a
    // Splurge — two picks, not five
    await adjust(page);
    await page.getByPlaceholder("max").fill("60");
    await expect(rec.pickCards).toHaveCount(2);
    shown = await cards(page);
    expectWithinBudget(shown, 60);
    expect(shown.map((c) => c.role).sort()).toEqual(["splurge", "top"]);
    expect(shown.find((c) => c.role === "top")!.price).toBe(44);
    await expect(page.getByTestId("lone-splurge-line")).toHaveCount(0);

    // Up to $40: nothing fits, one stretch qualifies. The Splurge stands
    // alone, and the page says the budget fit nothing
    await page.getByPlaceholder("max").fill("40");
    await expect(rec.pickCards).toHaveCount(1);
    shown = await cards(page);
    expectWithinBudget(shown, 40);
    expect(shown[0].role).toBe("splurge");
    await expect(page.getByTestId("lone-splurge-line"))
      .toHaveText("None of your matches fit tonight’s terms. This one is worth the stretch.");
    await expect(rec.resultsHeading).toHaveText("Your picks");

    // Up to $20: nothing fits and nothing is within twice it. No picks —
    // and the page says the TERMS did it, with the way back
    await page.getByPlaceholder("max").fill("20");
    await expect(rec.pickCards).toHaveCount(0);
    await expect(rec.resultsHeading).toHaveText("Nothing fits tonight’s terms");
    await expect(page.getByText(
      "We read 8 wines and found matches for your palate, but none that fit tonight’s terms. Adjust them to see your matches."
    )).toBeVisible();
    await expect(page.getByText("none of them matches your palate")).toHaveCount(0);

    // The way back: clear the max and the picks return
    await page.getByPlaceholder("max").fill("");
    await expect(rec.pickCards).toHaveCount(5);
    await expect(rec.resultsHeading).toHaveText("Your picks");
  });

  test("a minimum: nothing under it", async ({ page }) => {
    const rec = new RecommendPage(page);
    await rec.goto();
    await page.getByPlaceholder("min").fill("100");
    await rec.pasteAndAnalyze(LIST);
    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 10_000 });
    // Two wines at $100 and up ($110, $165) — two picks, neither under it
    await expect(rec.pickCards).toHaveCount(2);
    const shown = await cards(page);
    expect(shown.map((c) => c.price).sort((a, b) => a - b)).toEqual([110, 165]);
  });

  test("a color: two whites on the list means two picks — and one sparkling means one", async ({ page }) => {
    const rec = new RecommendPage(page);
    await rec.goto();
    await page.getByRole("radio", { name: "White" }).click();
    await rec.pasteAndAnalyze(LIST);
    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 10_000 });

    // The list's five reds no longer fill the page
    await expect(rec.pickCards).toHaveCount(2);
    expect((await cards(page)).map((c) => c.wine).sort()).toEqual([...WHITES].sort());

    await adjust(page);
    await page.getByRole("radio", { name: "Sparkling" }).click();
    await expect(rec.pickCards).toHaveCount(1);
    expect((await cards(page)).map((c) => c.wine)).toEqual(SPARKLING);

    await page.getByRole("radio", { name: "Red" }).click();
    await expect(rec.pickCards).toHaveCount(5);
    const reds = await cards(page);
    expect(reds.some((c) => [...WHITES, ...SPARKLING].includes(c.wine)), "no white or sparkling under Red").toBe(false);

    // Color and budget together: whites up to $50 — one fits ($44), one stretch ($66)
    await page.getByRole("radio", { name: "White" }).click();
    await page.getByPlaceholder("max").fill("50");
    await expect(rec.pickCards).toHaveCount(2);
    const whites = await cards(page);
    expectWithinBudget(whites, 50);
    expect(whites.map((c) => c.wine).sort()).toEqual([...WHITES].sort());
  });

  test("terms that fit nothing, set before the read: the new copy, and no picks", async ({ page }) => {
    const rec = new RecommendPage(page);
    await rec.goto();
    await page.getByRole("radio", { name: "Sparkling" }).click();
    await page.getByPlaceholder("max").fill("30");
    await rec.pasteAndAnalyze(LIST);
    await expect(rec.resultsHeading).toHaveText("Nothing fits tonight’s terms", { timeout: 10_000 });
    await expect(page.getByText(
      "We read 8 wines and found matches for your palate, but none that fit tonight’s terms. Adjust them to see your matches."
    )).toBeVisible();
    await expect(rec.pickCards).toHaveCount(0);
    await expect(page.getByTestId("somm-thinking")).toHaveCount(0);
    // Adjust is right there, and it works: All wines, any price
    await adjust(page);
    await page.getByRole("radio", { name: "All" }).click();
    await page.getByPlaceholder("max").fill("");
    await expect(rec.pickCards).toHaveCount(5);
  });

  test("a list with no prices is not the terms' doing — and says what is: no prices to pick by", async ({ page }) => {
    const rec = new RecommendPage(page);
    await rec.goto();
    await page.getByPlaceholder("max").fill("80");
    await rec.pasteAndAnalyze(`Kanonkop Pinotage, Stellenbosch 2019
Meerlust Rubicon, Stellenbosch 2018
Raats Original Chenin Blanc, Stellenbosch 2022`);
    // The palate matched all three; none shows a price (scan-truth, Nov 2026:
    // until then this read "No matches found")
    await expect(rec.resultsHeading).toHaveText("No prices to pick by", { timeout: 10_000 });
    await expect(page.getByText(
      "We read 3 wines and found matches for your palate, but none of them shows a price — and a pick needs one. Try a photo or a page that shows the prices."
    )).toBeVisible();
    await expect(page.getByText("none that fit tonight’s terms")).toHaveCount(0);
    await expect(page.getByText("none of them matches your palate")).toHaveCount(0);
  });
});
