import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb, countEvents, latestEvent } from "./fixtures/test-db";

/**
 * Hard-fail guards for The Table Verdict (Aug 2026) — closing the loop on
 * Somm picks, from our most active real user's feedback:
 *
 * 1. Declaring "this one's on the table" on a /recommend pick must write a
 *    pick_chosen wine_event (wine + session) AND a durable journal wishlist
 *    row — and must NEVER move DNA (choosing is intent, not evidence; the
 *    chenin_blanc earned fixture sits at exactly its promotion threshold,
 *    so any leak here would be a visible corruption).
 * 2. Returning to HOME with a chosen-but-unrated pick outstanding must show
 *    the one quiet "how was it?" prompt, and rating through it must run the
 *    real rate flow: wine_interactions upsert + pick_rated event (surface
 *    verdict_prompt, session carried from the choice). The ask must resolve
 *    from the LEDGER — it stays gone across a reload.
 * 3. "We went a different way tonight" must write somm_bypassed and offer
 *    the bottle-log handoff (/?log=1 opens the camera step on home).
 * 4. Replacing the chosen pick must clean up ONLY the wishlist row the
 *    choose itself created — a want row that pre-existed the sitting's
 *    choose must survive the banner moving (provenance is in-session:
 *    the client marks rows it created; nothing in the columns can tell
 *    them apart after the fact).
 *
 * Test 1 also pins the §11e session join in a REAL flow: menu_analyzed and
 * pick_chosen from the same sitting must carry the same client-minted
 * session id — that join is the watchtower funnel's backbone.
 *
 * Do NOT make these outcome-tolerant: if the chosen declaration stops
 * landing durably, a diner who ordered a pick and closed the tab is
 * indistinguishable from one who ignored every pick — the exact gap this
 * feature exists to close.
 *
 * wine_events discipline: append-forever — assertions are deltas +
 * latest-row shape, never absolute state, never deletes. The guard rating
 * is "It was fine" (0 evolution points — the engine early-returns before
 * any accumulation write), and the journal row is removed through the real
 * journal UI in the last test; the finally-style restore only puts back the
 * identity-bearing profile fields the milestone hook may silently refresh.
 *
 * Guard wine: Ken Forrester (chenin/stellenbosch/south_africa dims — all
 * pre-existing on the seeded account; deliberately NOT Kanonkop, which is
 * evidence-ledger's guard, nor Dujac, which is identity-shift's).
 */

const GUARD_LINE = "Ken Forrester Old Vine Chenin Blanc, Stellenbosch 2021...$38";

async function findGuardRows(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("wine_interactions")
    .select("wine_name, interaction_type, rating")
    .eq("user_id", userId)
    .eq("source_url", "text_paste")
    .ilike("wine_name", "%ken forrester%");
  return data ?? [];
}

// Test 5's wines — Stellenbosch / Walker Bay so the fixture DNA scores them
// into the picks, deliberately NOT any spec's guard wine (Kanonkop =
// evidence-ledger, Dujac = identity-shift, Ken Forrester = this spec's).
// Choosing never touches DNA (test 1 pins it), and these rows are cleaned
// by name here + healed in beforeAll/afterAll.
const REPLACE_WINE_PATTERNS = ["%meerlust%", "%hamilton russell%"];

async function cleanupReplacementRows(supabase: SupabaseClient, userId: string) {
  for (const pattern of REPLACE_WINE_PATTERNS) {
    await supabase
      .from("wine_interactions")
      .delete()
      .eq("user_id", userId)
      .ilike("wine_name", pattern);
  }
}

async function findRowsByName(supabase: SupabaseClient, userId: string, wineName: string) {
  const { data } = await supabase
    .from("wine_interactions")
    .select("wine_name, interaction_type, rating, source_url")
    .eq("user_id", userId)
    .eq("wine_name", wineName);
  return data ?? [];
}

async function readCheninPoints(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("dna_accumulation")
    .select("points, interaction_count")
    .eq("user_id", userId)
    .eq("dimension", "varietal")
    .eq("dimension_value", "chenin_blanc")
    .maybeSingle();
  return data ?? null;
}

test.describe.serial("The Table Verdict — chosen, funneled, bypassed (hard-fail)", () => {
  let supabase: SupabaseClient;
  let userId: string;
  let baselineChenin: { points: number; interaction_count: number } | null = null;
  let baselineIdentity: Record<string, unknown> | null = null;
  let guardName = "";
  let sessionA: string | null = null;

  test.beforeAll(async () => {
    ({ supabase, userId } = await testDb());
    // Heal any guard row a crashed earlier run left behind ("fine" carries
    // 0 points in every band, so a plain delete restores the baseline)
    for (const row of await findGuardRows(supabase, userId)) {
      await supabase
        .from("wine_interactions")
        .delete()
        .eq("user_id", userId)
        .eq("wine_name", row.wine_name);
    }
    await cleanupReplacementRows(supabase, userId);
    baselineChenin = await readCheninPoints(supabase, userId);
    const { data } = await supabase
      .from("wine_profiles")
      .select("archetype, identity, red_count, white_count")
      .eq("user_id", userId)
      .single();
    baselineIdentity = data;
  });

  test.afterAll(async () => {
    // Exact restore: any leftover guard row out (0-point, nothing to
    // reverse), identity-bearing fields back (the milestone hook may have
    // silently refreshed red/white counts or the milestones baseline).
    // wine_events is deliberately untouched — append-forever.
    if (!supabase) return;
    for (const row of await findGuardRows(supabase, userId)) {
      await supabase
        .from("wine_interactions")
        .delete()
        .eq("user_id", userId)
        .eq("wine_name", row.wine_name);
    }
    await cleanupReplacementRows(supabase, userId);
    if (baselineIdentity) {
      await supabase.from("wine_profiles").update(baselineIdentity).eq("user_id", userId);
    }
  });

  test("choosing a pick writes pick_chosen + a durable wishlist row — and never DNA", async ({ page }) => {
    test.setTimeout(120_000);
    const chosenBefore = await countEvents(supabase, userId, "pick_chosen");
    const menuBefore = await countEvents(supabase, userId, "menu_analyzed");

    const recPage = new RecommendPage(page);
    await recPage.goto();
    await recPage.pasteAndAnalyze(GUARD_LINE);
    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

    const card = recPage.pickCards.first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Ken Forrester/);

    // The declaration: visually unmistakable on the card afterwards
    await card.getByTestId("choose-pick").click();
    await expect(card.getByTestId("chosen-banner")).toBeVisible();
    await expect(card.getByTestId("chosen-banner")).toContainText(/On the table/i);

    // The ledger record (fire-and-forget → poll for the landing)
    await expect
      .poll(async () => countEvents(supabase, userId, "pick_chosen"), { timeout: 15_000 })
      .toBe(chosenBefore + 1);
    const chosenEvent = await latestEvent(supabase, userId, "pick_chosen");
    expect(chosenEvent!.payload.wine).toContain("Ken Forrester");
    expect(typeof chosenEvent!.payload.session).toBe("string");
    expect(chosenEvent!.payload.role).toBeTruthy();
    guardName = chosenEvent!.payload.wine as string;
    sessionA = chosenEvent!.payload.session as string;

    // The durable carrier: a wishlist row, unrated — the 9pm rating may
    // happen long after this tab is dead
    await expect
      .poll(async () => {
        const rows = await findGuardRows(supabase, userId);
        return rows.length === 1 ? `${rows[0].interaction_type}:${rows[0].rating}` : "no-row";
      }, { timeout: 15_000 })
      .toBe("want:null");

    // NEVER DNA: the chenin earned fixture must not have moved a point
    const chenin = await readCheninPoints(supabase, userId);
    expect(chenin?.points ?? null).toBe(baselineChenin?.points ?? null);
    expect(chenin?.interaction_count ?? null).toBe(baselineChenin?.interaction_count ?? null);

    // The §11e session join, proven in a real flow: this sitting's analysis
    // and its choice must ride the SAME client-minted session id. The
    // menu_analyzed write waits for the somm outcome, so give it the somm's
    // worst case to land.
    await expect
      .poll(async () => countEvents(supabase, userId, "menu_analyzed"), { timeout: 30_000 })
      .toBe(menuBefore + 1);
    const menuEvent = await latestEvent(supabase, userId, "menu_analyzed");
    expect(menuEvent!.payload.session).toBe(sessionA);
  });

  test("home shows the one quiet ask; rating through it runs the real rate flow", async ({ page }) => {
    test.setTimeout(120_000);
    expect(guardName, "test 1 must have captured the chosen wine").toBeTruthy();
    const pickRatedBefore = await countEvents(supabase, userId, "pick_rated");

    await page.goto("/");
    const ask = page.getByTestId("verdict-ask");
    await expect(ask).toBeVisible({ timeout: 15_000 });
    await expect(ask).toContainText(/Ken Forrester/);

    await ask.getByTestId("verdict-rate").click();
    await page.getByRole("button", { name: /It was fine/ }).click();
    await expect(ask).toBeHidden();

    // The real rate flow: the wishlist row became a rated journal row…
    await expect
      .poll(async () => {
        const rows = await findGuardRows(supabase, userId);
        return rows.length === 1 ? `${rows[0].interaction_type}:${rows[0].rating}` : "no-row";
      }, { timeout: 15_000 })
      .toBe("had:fine");

    // …and the ledger got its pick_rated, carrying the choice's session
    await expect
      .poll(async () => countEvents(supabase, userId, "pick_rated"), { timeout: 15_000 })
      .toBe(pickRatedBefore + 1);
    const ratedEvent = await latestEvent(supabase, userId, "pick_rated");
    expect(ratedEvent!.payload.wine).toBe(guardName);
    expect(ratedEvent!.payload.rating).toBe("fine");
    expect(ratedEvent!.payload.previous_rating).toBeNull();
    expect(ratedEvent!.payload.surface).toBe("verdict_prompt");
    expect(ratedEvent!.payload.session).toBe(sessionA);

    // "fine" is 0 points — the engine early-returns, DNA untouched
    const chenin = await readCheninPoints(supabase, userId);
    expect(chenin?.points ?? null).toBe(baselineChenin?.points ?? null);

    // Resolved from the LEDGER, not component state: gone across a reload
    await page.reload();
    await expect(page.getByTestId("wine-rec-list").or(page.getByText("Log a Bottle")).first())
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("verdict-ask")).toBeHidden();
  });

  test("'went a different way' writes somm_bypassed and offers the bottle-log handoff", async ({ page }) => {
    test.setTimeout(120_000);
    const bypassedBefore = await countEvents(supabase, userId, "somm_bypassed");

    const recPage = new RecommendPage(page);
    await recPage.goto();
    await recPage.pasteAndAnalyze(GUARD_LINE);
    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("bypass-somm").click();
    const noted = page.getByTestId("bypass-noted");
    await expect(noted).toBeVisible();
    await expect(noted.getByTestId("bypass-log-link")).toHaveAttribute("href", "/?log=1");

    await expect
      .poll(async () => countEvents(supabase, userId, "somm_bypassed"), { timeout: 15_000 })
      .toBe(bypassedBefore + 1);
    const bypassEvent = await latestEvent(supabase, userId, "somm_bypassed");
    expect(typeof bypassEvent!.payload.session).toBe("string");
    expect(bypassEvent!.payload.session).not.toBe(sessionA); // a new night, a new session
    expect(bypassEvent!.payload.picks_shown).toBeGreaterThanOrEqual(1);

    // Skippable in one tap
    await noted.getByTestId("bypass-skip").click();
    await expect(noted).toBeHidden();

    // The handoff lands: /?log=1 opens the camera step, ready to tap
    await page.goto("/?log=1");
    await expect(page.getByRole("button", { name: /Take a photo/ })).toBeVisible({ timeout: 15_000 });

    // No ask on home now — the latest table moment is the bypass
    await page.goto("/");
    await expect(page.getByTestId("wine-rec-list").or(page.getByText("Log a Bottle")).first())
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("verdict-ask")).toBeHidden();
  });

  test("journal cleanup: deleting the guard row leaves the account at baseline", async ({ page }) => {
    test.setTimeout(120_000);
    expect(guardName, "earlier tests must have run").toBeTruthy();
    const journalDeletedBefore = await countEvents(supabase, userId, "journal_deleted");

    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "Wine Journal" })).toBeVisible();
    await expect(page.getByText(guardName, { exact: true })).toBeVisible();
    const journalCard = page
      .locator("div")
      .filter({ has: page.getByText(guardName, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "×" }) })
      .last();
    await journalCard.getByRole("button", { name: "×" }).click();
    await expect(page.getByText("✓ Removed")).toBeVisible();

    await expect
      .poll(async () => (await findGuardRows(supabase, userId)).length, { timeout: 15_000 })
      .toBe(0);
    await expect
      .poll(async () => countEvents(supabase, userId, "journal_deleted"), { timeout: 15_000 })
      .toBe(journalDeletedBefore + 1);
    const deleteEvent = await latestEvent(supabase, userId, "journal_deleted");
    expect(deleteEvent!.payload.wine).toBe(guardName);
    expect(deleteEvent!.payload.points_reversed).toBe(false); // "fine" carried no points
  });

  test("replacing the chosen pick removes only the row the choose created", async ({ page }) => {
    test.setTimeout(180_000);
    const TWO_LINES = [
      "Meerlust Rubicon, Stellenbosch 2018...$92",
      "Hamilton Russell Pinot Noir, Walker Bay 2020...$85",
    ].join("\n");
    const chosenBefore = await countEvents(supabase, userId, "pick_chosen");

    // ── Round 1: both rows are choose-created; replacement cleans the loser ──
    const recPage = new RecommendPage(page);
    await recPage.goto();
    await recPage.pasteAndAnalyze(TWO_LINES);
    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

    const cardP = recPage.pickCards.filter({ hasText: /Meerlust/ }).first();
    const cardQ = recPage.pickCards.filter({ hasText: /Hamilton Russell/ }).first();
    await expect(cardP).toBeVisible();
    await expect(cardQ).toBeVisible();

    await cardP.getByTestId("choose-pick").click();
    await expect(cardP.getByTestId("chosen-banner")).toBeVisible();
    await expect
      .poll(async () => countEvents(supabase, userId, "pick_chosen"), { timeout: 15_000 })
      .toBe(chosenBefore + 1);
    const eventP = await latestEvent(supabase, userId, "pick_chosen");
    const nameP = eventP!.payload.wine as string;
    expect(eventP!.payload.replaced).toBeNull();
    // Wait for P's wishlist row (and with it the in-session provenance mark)
    await expect
      .poll(async () => (await findRowsByName(supabase, userId, nameP)).length, { timeout: 15_000 })
      .toBe(1);

    // The change of mind: banner moves, `replaced` records it in the ledger
    await cardQ.getByTestId("choose-pick").click();
    await expect(cardQ.getByTestId("chosen-banner")).toBeVisible();
    await expect(cardP.getByTestId("chosen-banner")).toBeHidden();
    await expect
      .poll(async () => countEvents(supabase, userId, "pick_chosen"), { timeout: 15_000 })
      .toBe(chosenBefore + 2);
    const eventQ = await latestEvent(supabase, userId, "pick_chosen");
    const nameQ = eventQ!.payload.wine as string;
    expect(eventQ!.payload.replaced).toBe(nameP);

    // THE CLEANUP: P's row was created by this sitting's choose — the banner
    // moving must remove it (state, not history — the ledger keeps `replaced`)
    await expect
      .poll(async () => (await findRowsByName(supabase, userId, nameP)).length, { timeout: 15_000 })
      .toBe(0);
    // …while Q's row (the new choice) stands, unrated
    await expect
      .poll(async () => {
        const rows = await findRowsByName(supabase, userId, nameQ);
        return rows.length === 1 ? `${rows[0].interaction_type}:${rows[0].rating}` : "no-row";
      }, { timeout: 15_000 })
      .toBe("want:null");

    // ── Round 2: a want row that PRE-EXISTED the sitting's choose survives ──
    await supabase.from("wine_interactions").insert({
      user_id: userId,
      wine_name: nameP,
      interaction_type: "want",
      source_url: "e2e_preexist",
    });
    await recPage.scanAgainButton.click(); // new sitting: fresh session, cleared provenance
    await recPage.pasteAndAnalyze(TWO_LINES);
    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

    const cardP2 = recPage.pickCards.filter({ hasText: /Meerlust/ }).first();
    const cardQ2 = recPage.pickCards.filter({ hasText: /Hamilton Russell/ }).first();
    await cardP2.getByTestId("choose-pick").click();
    await expect(cardP2.getByTestId("chosen-banner")).toBeVisible();
    await expect
      .poll(async () => countEvents(supabase, userId, "pick_chosen"), { timeout: 15_000 })
      .toBe(chosenBefore + 3);

    await cardQ2.getByTestId("choose-pick").click();
    await expect(cardQ2.getByTestId("chosen-banner")).toBeVisible();
    await expect
      .poll(async () => countEvents(supabase, userId, "pick_chosen"), { timeout: 15_000 })
      .toBe(chosenBefore + 4);
    const eventQ2 = await latestEvent(supabase, userId, "pick_chosen");
    expect(eventQ2!.payload.replaced).toBe(nameP);

    // Q's fresh row landing proves the replacement flow (upsert + any
    // cleanup) has run — NOW assert P's pre-existing row survived it
    await expect
      .poll(async () => (await findRowsByName(supabase, userId, nameQ)).length, { timeout: 15_000 })
      .toBe(1);
    const survivors = await findRowsByName(supabase, userId, nameP);
    expect(survivors.length).toBe(1);
    expect(survivors[0].interaction_type).toBe("want");

    // Leave no outstanding ask for later specs: the bypass supersedes
    await page.getByTestId("bypass-somm").click();
    await page.getByTestId("bypass-noted").getByTestId("bypass-skip").click();

    // wine_interactions is state, not history — direct cleanup is fine here
    // (wine_events stays append-forever, untouched)
    await cleanupReplacementRows(supabase, userId);
  });
});
