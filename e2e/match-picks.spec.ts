import { test, expect, type Page } from "@playwright/test";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb, countEvents, latestEvent } from "./fixtures/test-db";

/**
 * Hard-fail guards for Match & picks' own contracts (The House List,
 * Phase 3):
 *
 * 1. The reading state commits NOTHING until the picks land. Cancel leaves
 *    the input exactly as it was — the pasted list kept — with no picks,
 *    no Somm call and no menu_analyzed row (delta-asserted: wine_events is
 *    append-forever).
 * 2. The Somm is progressive enhancement: with /api/somm-picks unreachable
 *    the picks still land, each keeping the engine's own note (pick-note,
 *    never somm-note), "The Somm says" is omitted, and menu_analyzed
 *    records the fallback exactly once.
 * 3. A pick the user already knows wears its flag, matched to the journal
 *    by name: a rated wine shows "{emoji} {label} in {Month}" and offers
 *    ONLY the choose action (it can't be rated again here); a want shows
 *    "📌 On your want list" and keeps both actions.
 *
 * Every test blackholes the Somm, so this file makes no Claude calls, and
 * nothing here chooses or rates — the only writes are menu_analyzed events.
 * The RICH account's seeded DNA and journal are the premises; they're
 * pinned first so a drifted fixture fails loudly instead of flaking.
 */

const blockSomm = (page: Page) => page.route("**/api/somm-picks", (route) => route.abort());

test.describe("Match & picks — reading, fallback, flags (hard-fail)", () => {
  test("Cancel mid-read commits nothing: the list stays, no picks, no ledger row", async ({ page }) => {
    const { supabase, userId } = await testDb();
    await blockSomm(page);
    const LIST = "Raats Original Chenin Blanc, Stellenbosch 2022...$48\nMullineux Syrah, Swartland 2020...$72";
    const analyzedBefore = await countEvents(supabase, userId, "menu_analyzed");

    const recPage = new RecommendPage(page);
    await recPage.goto();
    await recPage.pasteAndAnalyze(LIST);
    await expect(recPage.processingSpinner).toBeVisible();
    await expect(page.getByTestId("running-head")).toHaveCount(0); // full screen while reading
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible();
    await expect(recPage.wineListTextarea).toHaveValue(LIST);
    // Outlast every reading beat: a cancelled read must never land later
    await page.waitForTimeout(3_000);
    await expect(recPage.resultsHeading).toHaveCount(0);
    expect(await countEvents(supabase, userId, "menu_analyzed")).toBe(analyzedBefore);
  });

  test("the Somm unreachable: picks keep the engine's notes, no Somm block, one fallback event", async ({ page }) => {
    const { supabase, userId } = await testDb();
    // Premise: Stellenbosch and Chenin Blanc are both in the seeded DNA
    const { data: dna } = await supabase
      .from("wine_profiles").select("regions, varietals").eq("user_id", userId).single();
    expect(dna!.regions.south_africa).toContain("stellenbosch");
    expect(dna!.varietals).toContain("chenin_blanc");

    await blockSomm(page);
    const analyzedBefore = await countEvents(supabase, userId, "menu_analyzed");
    const recPage = new RecommendPage(page);
    await recPage.goto();
    await recPage.pasteAndAnalyze("Raats Original Chenin Blanc, Stellenbosch 2022...$48");
    await expect(recPage.resultsHeading).toHaveText("Your picks", { timeout: 15_000 });

    const card = recPage.pickCards.filter({ hasText: /Raats/ }).first();
    await expect(card.getByTestId("pick-note")).toHaveText("“Chenin Blanc from Stellenbosch — both already in your DNA.”");
    await expect.poll(async () => page.getByTestId("somm-thinking").count(), { timeout: 15_000 }).toBe(0);
    await expect(page.getByTestId("somm-summary")).toHaveCount(0);
    await expect(page.getByTestId("somm-note")).toHaveCount(0);

    await expect
      .poll(async () => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 })
      .toBe(analyzedBefore + 1);
    const event = await latestEvent(supabase, userId, "menu_analyzed");
    expect(event!.payload.source).toBe("paste");
    expect(event!.payload.somm.outcome).toBe("fallback");
  });

  test("a known wine wears its flag; a rated one offers only the choose action", async ({ page }) => {
    const { supabase, userId } = await testDb();
    // Premises: the seeded journal rows, and the DNA that puts both wines
    // on the slate (Kanonkop is an earned estate, Meursault is Burgundy)
    const { data: rows } = await supabase
      .from("wine_interactions").select("wine_name, interaction_type, rating")
      .eq("user_id", userId).in("wine_name", ["Domaine Roulot, Meursault", "Kanonkop, Paul Sauer"]);
    const byName = Object.fromEntries((rows ?? []).map((r) => [r.wine_name, r]));
    expect(byName["Domaine Roulot, Meursault"]?.rating).toBe("liked");
    expect(byName["Kanonkop, Paul Sauer"]?.interaction_type).toBe("want");
    const { data: dna } = await supabase
      .from("wine_profiles").select("regions, estates").eq("user_id", userId).single();
    expect(dna!.regions.france).toContain("burgundy");
    expect(dna!.estates.stellenbosch).toContain("kanonkop");

    await blockSomm(page);
    const recPage = new RecommendPage(page);
    await recPage.goto();
    // Written as a list writes them — the match is by normalized name
    await recPage.pasteAndAnalyze("DOMAINE ROULOT  Meursault...$140\nKanonkop - Paul Sauer...$85");
    await expect(recPage.resultsHeading).toHaveText("Your picks", { timeout: 15_000 });

    const roulot = recPage.pickCards.filter({ hasText: /Roulot/i }).first();
    await expect(roulot).toContainText(/👍 Liked it in [A-Z][a-z]+/);
    await expect(roulot.getByTestId("choose-pick")).toBeVisible();
    await expect(roulot.getByRole("button", { name: "Had it? Rate it" })).toHaveCount(0);

    const kanonkop = recPage.pickCards.filter({ hasText: /Paul Sauer/i }).first();
    await expect(kanonkop).toContainText("📌 On your want list");
    await expect(kanonkop.getByTestId("choose-pick")).toBeVisible();
    await expect(kanonkop.getByRole("button", { name: "Had it? Rate it" })).toBeVisible();
  });
});
