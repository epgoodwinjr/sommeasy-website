import { test, expect, type Page } from "@playwright/test";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb, countEvents, latestEvent } from "./fixtures/test-db";
// The REAL rule (dependency-free ESM): the guard asks it which wine the
// page must show, from the account's own lean, rather than hardcoding one
// @ts-expect-error — plain JS module, no types
import { loneAdventure, palateLean } from "../src/lib/matchTerms.js";

/**
 * The lone Adventure (hard-fail guard) — Ed's decision, Nov 13, 2026.
 *
 * When a list is read, wines reach the scorer and none of them scores above
 * zero, the page no longer ends in "No matches found". It shows ONE pick,
 * role Adventure, on the lone Splurge's principle:
 *
 *   - the engine's instant pick: one priced wine that fits tonight's color
 *     and budget — tonight's color (else the palate's lean), then the middle
 *     of the price range. No engine note: the engine has no reason for it
 *   - above it: "Nothing on this list is a clear match for your palate, so
 *     here’s the adventure we’d take." Below it, the way back to the quiz
 *   - the Somm is asked its own question: exactly one pick, from the priced
 *     wines that fit the terms (mode "adventure")
 *   - the page never says it "found matches" on a list where it found none:
 *     terms that shut out every wine say so; "No matches found" stays only
 *     where nothing can be offered (no wine shows a price)
 *   - a list with ANY match — even on a producer's rating alone — is exactly
 *     as it was
 *   - menu_analyzed says lone_adventure, and still keeps the sample
 *
 * The scan route is SCRIPTED (page.route → the shape the real route
 * returns); the Somm is blocked everywhere but the one test that scripts it.
 * No Claude calls. RICH account only — never the zero-state account. The
 * only durable writes are menu_analyzed / somm_curation / pick_chosen /
 * somm_bypassed events (asserted by delta) and one want row that the same
 * test removes (afterEach is its safety net).
 */

type Wine = Record<string, string | number | boolean | null>;
const wine = (name: string, f: Wine): Wine => ({
  name, vintage: null, price: null, glass_price: null, section: "Red", is_btg: false,
  color: "red", variety: null, region: null, country: null, producer: null, ...f,
});

// Invented producers on purpose (a producer the data knows scores on its
// reputation alone); grapes and places the seeded palate has never met
const SOAVE = "Tenuta Immaginaria Soave Classico";
const ALBARINO = "Bodegas Inventadas Albariño";
const RIESLING = "Weingut Erfunden Riesling Kabinett";
const NERO = "Fattoria Fittizia Nero d'Avola";
const TEMPRANILLO = "Bodegas Inventadas Tempranillo Reserva";
const TOURIGA = "Quinta Inventada Touriga Nacional";
const NO_MATCH: Wine[] = [
  wine(SOAVE, { price: 38, color: "white", section: "White", variety: "Garganega", region: "Veneto", country: "Italy" }),
  wine(ALBARINO, { price: 46, color: "white", section: "White", variety: "Albariño", region: "Rías Baixas", country: "Spain" }),
  wine(RIESLING, { price: 52, color: "white", section: "White", variety: "Riesling", region: "Mosel", country: "Germany" }),
  // ($48, not a rounder number: it makes the middle of all six a different
  // wine from the middle of the whites and from the middle of the reds, so
  // the card shows which rule the page really applied)
  wine(NERO, { price: 48, variety: "Nero d'Avola", region: "Sicily", country: "Italy" }),
  wine(TEMPRANILLO, { price: 74, variety: "Tempranillo", region: "Rioja", country: "Spain" }),
  wine(TOURIGA, { price: 88, variety: "Touriga Nacional", region: "Douro", country: "Portugal" }),
];
const GUARD_WINES = NO_MATCH.map((w) => w.name as string);

const LINE = "Nothing on this list is a clear match for your palate, so here’s the adventure we’d take.";
const NUDGE = "Know there’s more you love? Add it to your palate and we’ll spot it next time.";

const blockSomm = (page: Page) => page.route("**/api/somm-picks", (route) => route.abort());
const scriptScan = (page: Page, wines: Wine[]) =>
  page.route("**/api/parse-wine-list", (route) => route.fulfill({ json: { wines, metadata: {}, rawText: "", source: "vision" } }));

type Card = { wine: string; price: number; role: string };
const cards = (page: Page): Promise<Card[]> =>
  page.locator('[data-testid="pick-card"]').evaluateAll((els) =>
    els.map((el) => ({
      wine: (el as HTMLElement).dataset.wine || "",
      price: Number((el as HTMLElement).dataset.price),
      role: (el as HTMLElement).dataset.role || "",
    })));

/** The palate the premise rests on, and the lean the rule will read. */
async function pinPalate(): Promise<"red" | "white" | null> {
  const { supabase, userId } = await testDb();
  const { data: profile } = await supabase
    .from("wine_profiles").select("countries, varietals, preferences, red_count, white_count").eq("user_id", userId).single();
  expect(profile!.countries).toEqual(expect.arrayContaining(["south_africa", "france"]));
  for (const c of ["italy", "spain", "germany", "portugal"]) expect(profile!.countries).not.toContain(c);
  for (const v of ["riesling", "albarino", "tempranillo", "nero_d_avola", "touriga_nacional", "garganega"]) {
    expect(profile!.varietals).not.toContain(v);
  }
  // No saved terms: each test sets its own through the UI
  expect(profile!.preferences ?? {}).toEqual({});
  return palateLean(profile);
}

/** What the real rule picks from NO_MATCH under these terms. */
function expected(lean: string | null, terms: { color?: string; min?: number; max?: number } = {}): string | null {
  const entries = NO_MATCH.map((w) => ({
    name: w.name, price: w.price, score: 0, matchReasons: [], detectedColor: w.color, visionData: { color: w.color },
  }));
  return loneAdventure(entries, { ...terms, lean })?.name ?? null;
}

/** Scan the (scripted) no-match photo and wait for the picks view; returns
 *  the menu_analyzed event this analysis wrote. */
async function scanNoMatch(page: Page) {
  const { supabase, userId } = await testDb();
  const before = await countEvents(supabase, userId, "menu_analyzed");
  await scriptScan(page, NO_MATCH);
  const rec = new RecommendPage(page);
  await rec.goto();
  await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });
  await rec.uploadFile("label-test-01.jpg");
  await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
  const event = await latestEvent(supabase, userId, "menu_analyzed");
  return { rec, payload: event!.payload as Record<string, any> };
}

async function adjust(page: Page) {
  if ((await page.getByPlaceholder("max").count()) === 0) await page.getByRole("button", { name: "Adjust ›" }).click();
  await expect(page.getByPlaceholder("max")).toBeVisible();
}

test.describe("The lone Adventure — one pick from a list that matched nothing (hard-fail)", () => {
  let lean: "red" | "white" | null = null;
  test.beforeEach(async () => { lean = await pinPalate(); });

  // Safety net for the one test that chooses: a want row its own walk-away
  // didn't remove (a failed or timed-out run) must not outlive it
  test.afterEach(async ({ page }) => {
    await page.goto("about:blank");
    const { supabase, userId } = await testDb();
    await supabase.from("wine_interactions").delete()
      .eq("user_id", userId).in("wine_name", GUARD_WINES).eq("interaction_type", "want").is("rating", null);
  });

  test("a list that matched nothing shows ONE pick — the Adventure — with its line, the way back to the quiz, and no engine note", async ({ page }) => {
    await blockSomm(page);
    const { rec, payload } = await scanNoMatch(page);
    // The premise, said by the ledger: six wines scored, none matched
    expect(payload).toMatchObject({ source: "scan", wines_parsed: 6, wines_priced: 6, wines_scored: 6, match_count: 0 });

    await expect(rec.resultsHeading).toHaveText("Your picks");
    await expect(page.getByText("No matches found")).toHaveCount(0);
    await expect(rec.pickCards).toHaveCount(1);
    const [card] = await cards(page);
    expect(card.role).toBe("adventure");
    expect(card.wine).toBe(expected(lean));
    expect(GUARD_WINES).toContain(card.wine);
    // The premise that makes that a test of the LEAN: with no lean the rule
    // picks a different wine (the account leans; if it stops, this says so)
    expect(expected(lean)).not.toBe(expected(null));
    await expect(rec.pickCards.first().getByRole("heading", { level: 2 })).toContainText("Adventure");

    // Its line above, Ed's words exactly
    await expect(page.getByTestId("lone-adventure-line")).toHaveText(LINE);
    await expect(page.getByTestId("lone-splurge-line")).toHaveCount(0);
    // Below it, the way back to the quiz — the link is the middle of the sentence
    const nudge = page.getByTestId("palate-nudge");
    await expect(nudge).toHaveText(NUDGE);
    await expect(page.getByTestId("palate-nudge-link")).toHaveText("Add it to your palate");
    await expect(page.getByTestId("palate-nudge-link")).toHaveAttribute("href", "/?quiz=refine");
    // The nudge sits under the pick, the line over it
    const y = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
    const cardY = (await rec.pickCards.first().boundingBox())!.y;
    expect(await y("lone-adventure-line")).toBeLessThan(cardY);
    expect(await y("palate-nudge")).toBeGreaterThan(cardY);

    // The engine has no palate reason for it: no note — and with the Somm
    // unreachable, none arrives (the silent fallback)
    await expect.poll(() => page.getByTestId("somm-thinking").count(), { timeout: 15_000 }).toBe(0);
    await expect(page.getByTestId("pick-note")).toHaveCount(0);
    await expect(page.getByTestId("somm-note")).toHaveCount(0);
    // The numbers rule: six is a word, and it opens the line
    await expect(page.getByText("Six wines — here’s where to start")).toBeVisible();
    // It is a pick like any other: it can be chosen or rated
    await expect(page.getByTestId("choose-pick")).toHaveCount(1);
    await expect(page.getByText("Had it? Rate it")).toHaveCount(1);

    // The ledger says what was shown, and still keeps what was read
    expect(payload).toMatchObject({ picks_shown: 1, lone_adventure: true, terms: { min: null, max: null, color: null } });
    expect(payload.somm).toMatchObject({ outcome: "fallback" });
    expect(payload.sample).toHaveLength(6);
    expect(payload.sample[0]).toEqual({ name: SOAVE, region: "Veneto", country: "Italy", variety: "Garganega", is_btg: false, has_price: true });
  });

  test("tonight's terms hold for it: the color, the budget — and terms that shut out every wine never claim matches", async ({ page }) => {
    await blockSomm(page);
    const { rec } = await scanNoMatch(page);
    await expect(rec.pickCards).toHaveCount(1);
    await adjust(page);

    // Up to $40: one wine fits, whatever the lean
    await page.getByPlaceholder("max").fill("40");
    await expect.poll(async () => (await cards(page))[0]?.wine).toBe(SOAVE);
    expect(expected(lean, { max: 40 })).toBe(SOAVE);
    await expect(page.getByTestId("lone-adventure-line")).toHaveText(LINE);

    // Up to $30: nothing is inside the budget. No pick — never a stretch —
    // and the page says the terms did it, without claiming a match it never found
    await page.getByPlaceholder("max").fill("30");
    await expect(rec.pickCards).toHaveCount(0);
    await expect(rec.resultsHeading).toHaveText("Nothing fits tonight’s terms");
    await expect(page.getByText(
      "We read six wines. None is a clear match for your palate, and tonight’s terms leave no room for an adventure. Adjust them and we’ll find one worth taking."
    )).toBeVisible();
    await expect(page.getByText(/found matches/)).toHaveCount(0);
    await expect(page.getByText(/see your matches/)).toHaveCount(0);
    await expect(page.getByText("No matches found")).toHaveCount(0);
    await expect(page.getByTestId("lone-adventure-line")).toHaveCount(0);
    // The next step here is the terms, not the quiz
    await expect(page.getByTestId("palate-nudge")).toHaveCount(0);

    // The way back: clear the max and the Adventure returns
    await page.getByPlaceholder("max").fill("");
    await expect(rec.pickCards).toHaveCount(1);
    expect((await cards(page))[0].wine).toBe(expected(lean));

    // A chosen color decides before the lean does
    await page.getByRole("radio", { name: "Red" }).click();
    await expect.poll(async () => (await cards(page))[0]?.wine).toBe(TEMPRANILLO);
    expect(expected(lean, { color: "red" })).toBe(TEMPRANILLO);
    await page.getByRole("radio", { name: "White" }).click();
    await expect.poll(async () => (await cards(page))[0]?.wine).toBe(ALBARINO);
    // Both terms at once: red, up to $50 — the one red inside it
    await page.getByRole("radio", { name: "Red" }).click();
    await page.getByPlaceholder("max").fill("50");
    await expect.poll(async () => (await cards(page))[0]?.wine).toBe(NERO);
    expect((await cards(page))[0]).toMatchObject({ role: "adventure", price: 48 });

    // No sparkling on the list: no Adventure, and the terms line again
    await page.getByRole("radio", { name: "Sparkling" }).click();
    await expect(rec.pickCards).toHaveCount(0);
    await expect(rec.resultsHeading).toHaveText("Nothing fits tonight’s terms");
    await expect(page.getByText(/found matches/)).toHaveCount(0);
  });

  test("terms set BEFORE the read hold too: white, up to $50 — the read lands on the one wine the rule picks inside them", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const before = await countEvents(supabase, userId, "menu_analyzed");
    await blockSomm(page);
    await scriptScan(page, NO_MATCH);
    const rec = new RecommendPage(page);
    await rec.goto();
    await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("radio", { name: "White" }).click();
    await page.getByPlaceholder("max").fill("50");
    await rec.uploadFile("label-test-01.jpg");
    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 30_000 });
    await expect(rec.pickCards).toHaveCount(1);
    // Two whites are inside $50 ($38, $46): the lower middle. Ignoring the
    // color, or the budget, or both would each land on another wine
    expect((await cards(page))[0]).toMatchObject({ wine: SOAVE, role: "adventure", price: 38 });
    expect(expected(lean, { color: "white", max: 50 })).toBe(SOAVE);
    for (const loose of [{ max: 50 }, { color: "white" }, {}]) expect(expected(null, loose)).not.toBe(SOAVE);
    await expect(page.getByTestId("lone-adventure-line")).toHaveText(LINE);

    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
    const payload = (await latestEvent(supabase, userId, "menu_analyzed"))!.payload as Record<string, any>;
    expect(payload).toMatchObject({ match_count: 0, picks_shown: 1, lone_adventure: true, terms: { min: null, max: 50, color: "white" } });
  });

  test("the Somm is asked for exactly ONE Adventure from the wines that fit — and its choice and note take the engine's place", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const curations = await countEvents(supabase, userId, "somm_curation");
    const NOTE = "Not your usual Chenin, and nowhere near the Cape — but Riesling from the Mosel has the same bright, stony line you love. The nearest thing on this list.";
    let asked: Record<string, any> | null = null;
    // The reply is built from the request's own candidates, in the shape the
    // real route answers with
    await page.route("**/api/somm-picks", async (route) => {
      asked = route.request().postDataJSON();
      const i = asked!.candidates.findIndex((c: { name: string }) => c.name === RIESLING);
      await route.fulfill({ json: {
        picks: [{ i, role: "adventure", note: NOTE }], sommSummary: "",
        meta: {
          outcome: "first_attempt", attempts: 1, salvagedCount: 0, durationMs: 4200,
          usage: { inputTokens: 2074, outputTokens: 122, estCostUSD: 0.0081 },
          // (no `mode` here, as an older deploy of the route would answer:
          // the page must say which question it asked — sommRoute.test.js
          // holds the real route to saying it too)
          reasons: [], candidates: asked!.candidates.length, pickCount: 1, model: "scripted",
        },
      } });
    });
    const { rec, payload } = await scanNoMatch(page);

    // Its own slate and its own ask
    expect(asked).not.toBeNull();
    expect(asked!.mode).toBe("adventure");
    expect(asked!.pickCount).toBe(1);
    expect(asked!.candidates.map((c: { name: string }) => c.name).sort()).toEqual([...GUARD_WINES].sort());
    expect(asked!.candidates.every((c: { price: unknown }) => typeof c.price === "number")).toBe(true);
    expect(asked!.candidates[0].name).toBe(expected(lean));       // the engine's pick leads
    expect(asked!.algorithmicPicks).toEqual([0]);
    expect(asked!.candidates.find((c: { name: string }) => c.name === RIESLING)).toMatchObject({ price: 52, color: "white", country: "Germany", varietal: "Riesling" });
    expect(asked!.dna.countries).toEqual(expect.arrayContaining(["South Africa", "France"]));
    expect(asked!.lean).toBe(lean);
    // The premise of the swap below: the Somm chose a different wine
    expect(expected(lean)).not.toBe(RIESLING);

    // Its choice takes the engine's place: still ONE pick, still the Adventure
    await expect(page.getByTestId("somm-note")).toHaveText(`“${NOTE}”`, { timeout: 15_000 });
    await expect(rec.pickCards).toHaveCount(1);
    expect((await cards(page))[0]).toMatchObject({ wine: RIESLING, role: "adventure", price: 52 });
    await expect(page.getByTestId("lone-adventure-line")).toHaveText(LINE);
    await expect(page.getByTestId("palate-nudge")).toHaveText(NUDGE);
    // The page's own line frames it: no summary block, nothing left "tasting"
    await expect(page.getByTestId("somm-summary")).toHaveCount(0);
    await expect(page.getByTestId("somm-thinking")).toHaveCount(0);
    await expect(page.getByTestId("pick-note")).toHaveCount(0);

    // The ledger: the analysis, and the cost record naming the question
    expect(payload).toMatchObject({ match_count: 0, picks_shown: 1, lone_adventure: true });
    expect(payload.somm).toMatchObject({ outcome: "first_attempt" });
    await expect.poll(() => countEvents(supabase, userId, "somm_curation"), { timeout: 15_000 }).toBe(curations + 1);
    const curation = (await latestEvent(supabase, userId, "somm_curation"))!.payload as Record<string, any>;
    expect(curation).toMatchObject({ mode: "adventure", outcome: "first_attempt", candidates: 6, pick_count: 1 });

    // Its choice stays while it fits the terms, and gives way when it doesn't
    await adjust(page);
    await page.getByPlaceholder("max").fill("60");
    await expect(rec.pickCards).toHaveCount(1);
    expect((await cards(page))[0].wine).toBe(RIESLING);
    await expect(page.getByTestId("somm-note")).toHaveCount(1);
    await page.getByPlaceholder("max").fill("40");
    await expect.poll(async () => (await cards(page))[0]?.wine).toBe(SOAVE);
    await expect(page.getByTestId("somm-note")).toHaveCount(0);
  });

  test("no wine shows a price: nothing can be offered — \"No matches found\", and its line points to the quiz the same way", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const before = await countEvents(supabase, userId, "menu_analyzed");
    let sommCalls = 0;
    await page.route("**/api/somm-picks", (route) => { sommCalls++; return route.abort(); });
    const rec = new RecommendPage(page);
    await rec.goto();
    await rec.pasteAndAnalyze(`Tenuta Immaginaria Valpolicella Superiore, Veneto 2020
Bodegas Inventadas Tempranillo Reserva, Rioja 2016
Fattoria Fittizia Nero d'Avola, Sicily 2021`);
    await expect(rec.resultsHeading).toHaveText("No matches found", { timeout: 10_000 });
    await expect(page.getByText("We read three wines and none of them matches your palate yet.")).toBeVisible();
    await expect(page.getByTestId("palate-nudge")).toHaveText(NUDGE);
    await expect(page.getByTestId("palate-nudge-link")).toHaveAttribute("href", "/?quiz=refine");
    await expect(rec.pickCards).toHaveCount(0);
    await expect(page.getByTestId("lone-adventure-line")).toHaveCount(0);
    await expect(page.getByText(/found matches/)).toHaveCount(0);

    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
    const payload = (await latestEvent(supabase, userId, "menu_analyzed"))!.payload as Record<string, any>;
    expect(payload).toMatchObject({
      source: "paste", wines_parsed: 3, wines_priced: 0, wines_scored: 3, match_count: 0, picks_shown: 0,
      lone_adventure: false, somm: null,
    });
    expect(payload.sample).toHaveLength(3);
    expect(sommCalls).toBe(0);
  });

  test("a list with ANY match stays exactly as it is — even one matched on a producer's rating alone", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const before = await countEvents(supabase, userId, "menu_analyzed");
    await blockSomm(page);
    const rec = new RecommendPage(page);
    await rec.goto();
    // Zenato is a producer the data knows; its grape and place are not this
    // palate's. The engine scores it on its reviews alone (Ed: leave for launch)
    await rec.pasteAndAnalyze(`Zenato Valpolicella Superiore, Veneto 2020...$48
Bodegas Inventadas Tempranillo Reserva, Rioja 2016...$74
Fattoria Fittizia Nero d'Avola, Sicily 2021...$42`);
    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 10_000 });
    await expect(rec.pickCards).toHaveCount(1);
    const [card] = await cards(page);
    expect(card.wine).toBe("Zenato Valpolicella Superiore, Veneto 2020");
    expect(card.role).not.toBe("adventure");
    await expect(page.getByTestId("lone-adventure-line")).toHaveCount(0);
    await expect(page.getByTestId("palate-nudge")).toHaveCount(0);

    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
    const payload = (await latestEvent(supabase, userId, "menu_analyzed"))!.payload as Record<string, any>;
    expect(payload).toMatchObject({ match_count: 1, picks_shown: 1, lone_adventure: false });
    expect(payload).not.toHaveProperty("sample");
  });

  test("choosing the Adventure takes the normal path: pick_chosen with its role, a want row — and walking away removes it", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const [chosenBefore, bypassedBefore] = await Promise.all([
      countEvents(supabase, userId, "pick_chosen"), countEvents(supabase, userId, "somm_bypassed"),
    ]);
    const points = async () => {
      const { data } = await supabase.from("dna_accumulation").select("dimension, dimension_value, points").eq("user_id", userId);
      return JSON.stringify((data ?? []).sort((a, b) => `${a.dimension}${a.dimension_value}`.localeCompare(`${b.dimension}${b.dimension_value}`)));
    };
    const pointsBefore = await points();
    const wantRow = async (name: string) => {
      const { data } = await supabase.from("wine_interactions").select("interaction_type, rating").eq("user_id", userId).eq("wine_name", name);
      return data ?? [];
    };
    await blockSomm(page);
    const { rec, payload } = await scanNoMatch(page);
    const [card] = await cards(page);
    expect(card.role).toBe("adventure");
    expect(await wantRow(card.wine)).toEqual([]);

    await page.getByTestId("choose-pick").click();
    await expect(page.getByTestId("chosen-banner")).toBeVisible();
    await expect.poll(() => countEvents(supabase, userId, "pick_chosen"), { timeout: 15_000 }).toBe(chosenBefore + 1);
    const chosen = (await latestEvent(supabase, userId, "pick_chosen"))!.payload as Record<string, any>;
    expect(chosen).toMatchObject({ wine: card.wine, role: "adventure", price: card.price, session: payload.session });
    await expect.poll(() => wantRow(card.wine), { timeout: 15_000 }).toEqual([{ interaction_type: "want", rating: null }]);
    // Choosing is intent, never evidence — for an Adventure as for any pick
    expect(await points()).toBe(pointsBefore);

    // The table went a different way: the choice is superseded and its row leaves
    await page.getByTestId("bypass-somm").click();
    await expect(page.getByTestId("bypass-noted")).toBeVisible();
    await expect.poll(() => countEvents(supabase, userId, "somm_bypassed"), { timeout: 15_000 }).toBe(bypassedBefore + 1);
    await expect.poll(() => wantRow(card.wine), { timeout: 15_000 }).toEqual([]);
    await expect(rec.pickCards).toHaveCount(1);
    expect(await points()).toBe(pointsBefore);
  });
});
