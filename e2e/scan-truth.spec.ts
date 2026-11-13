import { test, expect, type Page } from "@playwright/test";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb, countEvents, latestEvent } from "./fixtures/test-db";

/**
 * Scans tell the truth (hard-fail guard) — Nov 12, 2026.
 *
 * Two real scans read 14 and 25 wines and matched nothing. Measured on the
 * real route: under a heading like "Wines by the Glass & Bottle" every wine
 * came back flagged by-the-glass, bottle price and all, and the engine
 * dropped every one; and the photo scorer could not read "Syrah", "USA" or
 * "Western Cape". This guard holds the page to what was decided:
 *
 *   - a wine with a bottle price is a bottle, whatever the page heading
 *     made the scan say (Ed: bottles only, but say so)
 *   - wines poured by the glass ONLY are left out — and the page says so
 *   - no picks never reads "No matches found" unless nothing matched: each
 *     cause (by-the-glass only, no prices, the terms, a true no-match) has
 *     its own heading
 *   - menu_analyzed says what the list held, and keeps a sample of a list
 *     that matched nothing
 *
 * The scan route is SCRIPTED (page.route → the shape the real route
 * returns) and the Somm is blocked, so this file makes no Claude calls and
 * the picks on screen are the engine's own. Nothing here rates or chooses;
 * the only writes are menu_analyzed events, asserted by delta. RICH account
 * only — its seeded palate (South Africa, France; Stellenbosch, Burgundy) is
 * the premise and is pinned first.
 */

type Wine = Record<string, string | number | boolean | null>;
const wine = (name: string, f: Wine): Wine => ({
  name, vintage: null, price: null, glass_price: null, section: "Red", is_btg: false,
  color: "red", variety: null, region: null, country: null, producer: null, ...f,
});

// The Aug 8 shape at its worst: every wine flagged by-the-glass, and every
// wine with a bottle price beside its glass price — in the spellings the
// photo path could not read
const GLASS_AND_BOTTLE: Wine[] = [
  wine("Kanonkop Pinotage, Stellenbosch", { price: 68, glass_price: 17, is_btg: true, variety: "Pinotage", region: "Stellenbosch", country: "South Africa", producer: "Kanonkop" }),
  wine("Mullineux Syrah, Swartland", { price: 72, glass_price: 18, is_btg: true, variety: "Syrah", region: "Swartland", country: "South Africa", producer: "Mullineux" }),
  wine("Qupe Syrah, Central Coast", { price: 50, glass_price: 13, is_btg: true, variety: "Syrah", region: "Central Coast", country: "USA", producer: "Qupe" }),
  wine("Joseph Drouhin Chorey-les-Beaune", { price: 74, glass_price: 19, is_btg: true, variety: "Pinot Noir", region: "Burgundy", country: "France", producer: "Joseph Drouhin" }),
  // No country: only "Western Cape" says this is South African
  wine("Raats Original Chenin Blanc", { price: 44, glass_price: 11, is_btg: true, color: "white", section: "White", variety: "Chenin Blanc", region: "Western Cape", producer: "Raats" }),
  wine("Louis Michel Chablis", { price: 66, glass_price: 17, is_btg: true, color: "white", section: "White", variety: "Chardonnay", region: "Burgundy", country: "France", producer: "Louis Michel" }),
];

// A real by-the-glass section (one price each: a glass) beside three bottles
const GLASSES: Wine[] = [
  wine("Ken Forrester Chenin Blanc, Stellenbosch", { glass_price: 12, is_btg: true, color: "white", section: "By the Glass", variety: "Chenin Blanc", region: "Stellenbosch", country: "South Africa" }),
  wine("Meerlust Rubicon, Stellenbosch", { glass_price: 24, is_btg: true, section: "By the Glass", variety: "Cabernet Sauvignon blend", region: "Stellenbosch", country: "South Africa" }),
  wine("Hamilton Russell Pinot Noir, Hemel-en-Aarde", { glass_price: 22, is_btg: true, section: "By the Glass", variety: "Pinot Noir", region: "Hemel-en-Aarde", country: "South Africa" }),
];
const BOTTLES = [GLASS_AND_BOTTLE[0], GLASS_AND_BOTTLE[3], GLASS_AND_BOTTLE[5]].map((w) => ({ ...w, glass_price: null, is_btg: false }));

const blockSomm = (page: Page) => page.route("**/api/somm-picks", (route) => route.abort());
const scriptScan = (page: Page, wines: Wine[]) =>
  page.route("**/api/parse-wine-list", (route) => route.fulfill({ json: { wines, metadata: {}, rawText: "", source: "vision" } }));

async function pinPalate() {
  const { supabase, userId } = await testDb();
  const { data: profile } = await supabase
    .from("wine_profiles").select("countries, varietals, preferences").eq("user_id", userId).single();
  expect(profile!.countries).toEqual(expect.arrayContaining(["south_africa", "france"]));
  // Nothing Italian, Spanish or American: the true no-match list relies on it
  for (const c of ["italy", "spain", "us"]) expect(profile!.countries).not.toContain(c);
  for (const v of ["corvina_rondinella_molinara", "tempranillo", "nero_d_avola", "syrah"]) expect(profile!.varietals).not.toContain(v);
  expect(profile!.preferences ?? {}).toEqual({});
}

/** Scan a (scripted) photo and wait for the picks view; returns the
 *  menu_analyzed event this analysis wrote. */
async function scan(page: Page, wines: Wine[]) {
  const { supabase, userId } = await testDb();
  const before = await countEvents(supabase, userId, "menu_analyzed");
  await blockSomm(page);
  await scriptScan(page, wines);
  const rec = new RecommendPage(page);
  await rec.goto();
  await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });
  await rec.uploadFile("label-test-01.jpg");
  await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
  const event = await latestEvent(supabase, userId, "menu_analyzed");
  return { rec, payload: event!.payload as Record<string, any> };
}

const shownWines = (page: Page) =>
  page.locator('[data-testid="pick-card"]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.wine || ""));

test.describe("Scans tell the truth", () => {
  test.beforeEach(async () => { await pinPalate(); });

  test("a page of glass-and-bottle prices is a page of bottles: every wine is scored, and the picks land", async ({ page }) => {
    const { rec, payload } = await scan(page, GLASS_AND_BOTTLE);
    await expect(rec.resultsHeading).toHaveText("Your picks");
    await expect(rec.pickCards).toHaveCount(5);
    const shown = await shownWines(page);
    // Read through its fields: "Western Cape" is South Africa, with no country stated
    expect(shown).toContain("Raats Original Chenin Blanc");
    expect(shown).toContain("Kanonkop Pinotage, Stellenbosch");
    // Every pick wears its BOTTLE price
    const prices = await rec.pickCards.evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.price)));
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(44);
    // Nothing was left out, so nothing is said about glasses
    await expect(page.getByTestId("glass-note")).toHaveCount(0);

    // The ledger says what the list held
    expect(payload).toMatchObject({
      source: "scan", wines_parsed: 6, wines_priced: 6, wines_btg: 0, wines_scored: 6, picks_shown: 5,
      terms: { min: null, max: null, color: null },
    });
    expect(payload.match_count).toBeGreaterThanOrEqual(5);
    expect(payload).not.toHaveProperty("sample");
  });

  test("wines poured by the glass only are left out — and the page says so", async ({ page }) => {
    const { rec, payload } = await scan(page, [...GLASSES, ...BOTTLES]);
    await expect(rec.resultsHeading).toHaveText("Your picks");
    await expect(rec.pickCards).toHaveCount(3);
    const shown = await shownWines(page);
    expect(shown.sort()).toEqual(BOTTLES.map((w) => w.name as string).sort());
    await expect(page.getByTestId("glass-note"))
      .toHaveText("3 wines here are poured by the glass only. We pick bottles, so we left them out.");
    expect(payload).toMatchObject({ wines_parsed: 6, wines_priced: 3, wines_btg: 3, wines_scored: 3, picks_shown: 3, match_count: 3 });
  });

  test("a list of glass pours alone says so — not that nothing matched — and the ledger keeps what was read", async ({ page }) => {
    const { rec, payload } = await scan(page, GLASSES);
    await expect(rec.resultsHeading).toHaveText("Only by-the-glass pours here");
    await expect(page.getByText(
      "We read 3 wines, and each is poured by the glass only. Our picks are bottles — add the bottle list and we’ll take it from there."
    )).toBeVisible();
    await expect(rec.pickCards).toHaveCount(0);
    await expect(page.getByText("none of them matches your palate")).toHaveCount(0);
    // The sub line said it; the note does not say it twice
    await expect(page.getByTestId("glass-note")).toHaveCount(0);
    await expect(page.getByTestId("somm-thinking")).toHaveCount(0);

    expect(payload).toMatchObject({ wines_parsed: 3, wines_priced: 0, wines_btg: 3, wines_scored: 0, picks_shown: 0, match_count: 0, somm: null });
    expect(payload.sample).toEqual([
      { name: "Ken Forrester Chenin Blanc, Stellenbosch", region: "Stellenbosch", country: "South Africa", variety: "Chenin Blanc", is_btg: true, has_price: false },
      { name: "Meerlust Rubicon, Stellenbosch", region: "Stellenbosch", country: "South Africa", variety: "Cabernet Sauvignon blend", is_btg: true, has_price: false },
      { name: "Hamilton Russell Pinot Noir, Hemel-en-Aarde", region: "Hemel-en-Aarde", country: "South Africa", variety: "Pinot Noir", is_btg: true, has_price: false },
    ]);
  });

  test("a true no-match says so, with its own next step, and tonight's terms ride the ledger", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const before = await countEvents(supabase, userId, "menu_analyzed");
    await blockSomm(page);
    const rec = new RecommendPage(page);
    await rec.goto();
    await page.getByRole("radio", { name: "Red" }).click();
    await page.getByPlaceholder("max").fill("90");
    // Invented producers on purpose: a producer the data knows scores on its
    // reputation alone (the engine's quality bonus), palate or no palate
    await rec.pasteAndAnalyze(`Tenuta Immaginaria Valpolicella Superiore, Veneto 2020...$48
Bodegas Inventadas Tempranillo Reserva, Rioja 2016...$74
Fattoria Fittizia Nero d'Avola, Sicily 2021...$42`);
    await expect(rec.resultsHeading).toHaveText("No matches found", { timeout: 10_000 });
    await expect(page.getByText(
      "We read 3 wines and none of them matches your palate yet. If something here is your kind of wine, add its grape or region to your palate and we’ll know it next time."
    )).toBeVisible();
    // Adjusting the terms would not help, and the page no longer says to
    await expect(page.getByText("Try adjusting tonight’s terms")).toHaveCount(0);

    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
    const payload = (await latestEvent(supabase, userId, "menu_analyzed"))!.payload as Record<string, any>;
    expect(payload).toMatchObject({
      source: "paste", wines_parsed: 3, wines_priced: 3, wines_btg: 0, wines_scored: 3, match_count: 0, picks_shown: 0,
      terms: { min: null, max: 90, color: "red" },
    });
    // A pasted line has only its name
    expect(payload.sample).toHaveLength(3);
    expect(payload.sample[0]).toEqual({ name: "Tenuta Immaginaria Valpolicella Superiore, Veneto 2020", region: null, country: null, variety: null, is_btg: false, has_price: true });
  });
});
