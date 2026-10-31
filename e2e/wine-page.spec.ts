import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { testDb, countEvents, latestEvent } from "./fixtures/test-db";
import { journalRow } from "./fixtures/sommeasy-page";
import { splitVintage } from "../src/lib/vintage.js";
import { wineHref } from "../src/lib/navTrail.js";

/**
 * Hard-fail guards for a wine's own page (/wine — The House List, Phase 4),
 * where the journal's row actions live now:
 *
 * 1. Home's rec name opens its page, not yet in the journal: Had it → a
 *    tile writes the verdict in place (rec_rated, surface wine_page); the
 *    note saves itself and survives a reload; Change → Keep cancels, and
 *    Change → a tile re-rates through the journal path (journal_rerated,
 *    old→new); Remove from journal steps back home, says so, and the row
 *    is gone (journal_deleted).
 * 2. Want it → "On your want list" (wine_wanted) that survives a reload;
 *    Remove takes it off again — back to the not-yet-tried actions.
 * 3. A name with no journal row and no recommendation → the designed
 *    empty state, never a broken page.
 * 4. The journal: counted tabs, a Want-tab round trip through a wine page
 *    that comes back to its tab (?tab= rides the URL), rows that link to
 *    their wine, and the Timeline deep link with its founding row.
 *
 * Do NOT make these outcome-tolerant: this page is the only place a rating
 * can be changed or a bottle removed — if it breaks, the journal is
 * read-only.
 *
 * Data discipline (the RICH account): every rating is "It was fine" (0
 * points — the engine early-returns, DNA never moves). afterEach deletes any
 * row a failed run left (a 0-point or unrated row reverses nothing),
 * removes timeline rows the run wrote, and puts back the identity-bearing
 * profile fields the milestone hook may silently refresh. wine_events is
 * append-forever: deltas only. Test 4 only reads (the seeded want rows are
 * its premise).
 */

type Snapshot = {
  wine: string;
  identity: Record<string, unknown> | null;
  eventIds: Set<string>;
};

async function snapshot(supabase: SupabaseClient, userId: string, wine: string): Promise<Snapshot> {
  const { data: identity } = await supabase
    .from("wine_profiles")
    .select("archetype, identity, red_count, white_count")
    .eq("user_id", userId)
    .single();
  const { data: events } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
  return { wine, identity, eventIds: new Set((events ?? []).map((e) => e.id)) };
}

async function readRow(supabase: SupabaseClient, userId: string, wine: string) {
  const { data } = await supabase
    .from("wine_interactions")
    .select("interaction_type, rating, note")
    .eq("user_id", userId)
    .eq("wine_name", wine)
    .maybeSingle();
  return data;
}

/** The first recommendation home lists — one not yet in the journal. */
async function firstHomeRec(page: Page) {
  await page.goto("/");
  const card = page.getByTestId("wine-rec-list").getByTestId("rec-card").first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  const wine = (await card.getAttribute("data-wine")) ?? "";
  expect(wine.length, "home must list a recommendation").toBeGreaterThan(0);
  return { card, wine };
}

test.describe("A wine's page — verdicts, notes, removal (hard-fail)", () => {
  // Set the moment before the first write; afterEach restores from it even
  // when the test failed or timed out
  let touched: Snapshot | null = null;

  test.afterEach(async ({ page }) => {
    if (!touched) return;
    const { wine, identity, eventIds } = touched;
    touched = null;
    const { supabase, userId } = await testDb();
    // Kill in-flight page JS before touching the DB (the teardown-race rule)
    await page.goto("about:blank").catch(() => {});
    await supabase.from("wine_interactions").delete().eq("user_id", userId).eq("wine_name", wine);
    const { data: eventsNow } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
    for (const e of eventsNow ?? []) {
      if (!eventIds.has(e.id)) await supabase.from("dna_timeline").delete().eq("id", e.id);
    }
    if (identity) await supabase.from("wine_profiles").update(identity).eq("user_id", userId);
  });

  test("a rec's page: rate it, note it, change it, remove it", async ({ page }) => {
    test.setTimeout(150_000);
    const { supabase, userId } = await testDb();
    const { card, wine } = await firstHomeRec(page);
    const recRatedBefore = await countEvents(supabase, userId, "rec_rated");
    const reratedBefore = await countEvents(supabase, userId, "journal_rerated");
    const deletedBefore = await countEvents(supabase, userId, "journal_deleted");

    // The rec's name is the door to its page
    await card.getByRole("link").first().click();
    await page.waitForURL(/\/wine\?name=/);
    const winePage = page.getByTestId("wine-page");
    await expect(winePage.getByRole("heading", { level: 1 })).toHaveText(splitVintage(wine).base, { timeout: 15_000 });
    await expect(page.getByTestId("running-head-back")).toContainText("Your list");
    await expect(page.getByTestId("service-bar")).toBeVisible();
    // Not in the journal yet: the Somm's reason, the three actions
    await expect(winePage).toContainText("Why the Somm chose it");
    await expect(winePage.getByTestId("journal-somm-note")).toBeVisible();

    // Had it → a tile: the verdict lands in place
    touched = await snapshot(supabase, userId, wine);
    await winePage.getByRole("button", { name: "🍷 Had it" }).click();
    await winePage.getByTestId("rating-tile-fine").click();
    const verdict = winePage.getByTestId("wine-verdict");
    await expect(verdict).toContainText("😐 It was fine");
    await expect(verdict).toContainText("Today");
    await expect(winePage).toContainText("The Somm said");
    await expect
      .poll(async () => { const r = await readRow(supabase, userId, wine); return r ? `${r.interaction_type}:${r.rating}` : "none"; },
        { timeout: 15_000 })
      .toBe("had:fine");
    await expect
      .poll(async () => countEvents(supabase, userId, "rec_rated"), { timeout: 15_000 })
      .toBe(recRatedBefore + 1);
    const rated = await latestEvent(supabase, userId, "rec_rated");
    expect(rated!.payload.wine).toBe(wine);
    expect(rated!.payload.surface).toBe("wine_page");
    expect(rated!.payload.previous_rating).toBeNull();

    // The note saves itself — and is there after a reload
    const NOTE = "Crisp at the table — an e2e line, removed with its row.";
    await winePage.getByTestId("wine-note").fill(NOTE);
    await expect.poll(async () => (await readRow(supabase, userId, wine))?.note, { timeout: 15_000 }).toBe(NOTE);
    await page.reload();
    await expect(page.getByTestId("wine-note")).toHaveValue(NOTE, { timeout: 15_000 });

    // Change → Keep cancels, the verdict untouched…
    await page.getByTestId("wine-change").click();
    await expect(page.getByRole("group", { name: "Change your verdict" })).toBeVisible();
    await page.getByRole("button", { name: "Keep 😐 It was fine" }).click();
    await expect(page.getByTestId("wine-verdict")).toContainText("😐 It was fine");
    // …and Change → a tile re-rates through the journal path, old → new
    await page.getByTestId("wine-change").click();
    await page.getByTestId("rating-tile-fine").click();
    await expect(page.getByTestId("wine-verdict")).toContainText("😐 It was fine");
    await expect
      .poll(async () => countEvents(supabase, userId, "journal_rerated"), { timeout: 15_000 })
      .toBe(reratedBefore + 1);
    const rerated = await latestEvent(supabase, userId, "journal_rerated");
    expect(rerated!.payload.wine).toBe(wine);
    expect(rerated!.payload.previous_rating).toBe("fine");
    expect(rerated!.payload.rating).toBe("fine");
    expect(rerated!.payload.surface).toBe("wine_page");

    // Remove from journal asks first, in place — and asking deletes nothing
    const removeTrigger = page.getByTestId("wine-remove");
    const confirm = page.getByTestId("wine-remove-confirm");
    await removeTrigger.click();
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeFocused();
    await expect(confirm).toContainText("Your verdict and note go with it, and so does its pull on your palate.");
    await expect(removeTrigger).toHaveAttribute("aria-expanded", "true");
    expect(await readRow(supabase, userId, wine), "opening the confirm must not delete").not.toBeNull();
    // Keep it closes it and hands focus back to the trigger, nothing removed
    await confirm.getByRole("button", { name: "Keep it" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(removeTrigger).toBeFocused();
    expect(await readRow(supabase, userId, wine), "Keep it must not delete").not.toBeNull();
    expect(await countEvents(supabase, userId, "journal_deleted")).toBe(deletedBefore);
    // Remove it: steps back home, which says so — the row gone
    await removeTrigger.click();
    await confirm.getByRole("button", { name: "Remove it" }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
    await expect(page.getByText("Removed from your journal")).toBeVisible();
    await expect.poll(async () => readRow(supabase, userId, wine), { timeout: 15_000 }).toBeNull();
    await expect
      .poll(async () => countEvents(supabase, userId, "journal_deleted"), { timeout: 15_000 })
      .toBe(deletedBefore + 1);
    const removed = await latestEvent(supabase, userId, "journal_deleted");
    expect(removed!.payload.wine).toBe(wine);
    expect(removed!.payload.rating).toBe("fine");
    expect(removed!.payload.points_reversed).toBe(false);
  });

  test("Want it lands on the want list; Remove takes it off again", async ({ page }) => {
    test.setTimeout(120_000);
    const { supabase, userId } = await testDb();
    const { wine } = await firstHomeRec(page);
    const wantedBefore = await countEvents(supabase, userId, "wine_wanted");
    const deletedBefore = await countEvents(supabase, userId, "journal_deleted");

    // The deep link works on its own, too
    await page.goto(wineHref(wine));
    const winePage = page.getByTestId("wine-page");
    await expect(winePage.getByRole("button", { name: "📌 Want it" })).toBeVisible({ timeout: 15_000 });

    touched = await snapshot(supabase, userId, wine);
    await winePage.getByRole("button", { name: "📌 Want it" }).click();
    await expect(winePage).toContainText("📌 On your want list");
    await expect(winePage).toContainText("Saved Today");
    await expect
      .poll(async () => { const r = await readRow(supabase, userId, wine); return r ? `${r.interaction_type}:${r.rating}` : "none"; },
        { timeout: 15_000 })
      .toBe("want:null");
    await expect
      .poll(async () => countEvents(supabase, userId, "wine_wanted"), { timeout: 15_000 })
      .toBe(wantedBefore + 1);
    const wanted = await latestEvent(supabase, userId, "wine_wanted");
    expect(wanted!.payload.wine).toBe(wine);
    expect(wanted!.payload.surface).toBe("wine_page");

    // Durable: still wanted after a reload — no note on a bottle not yet had
    await page.reload();
    await expect(page.getByTestId("wine-page")).toContainText("📌 On your want list", { timeout: 15_000 });
    await expect(page.getByTestId("wine-note")).toHaveCount(0);

    // Remove: off the list, back to the not-yet-tried actions
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("button", { name: "📌 Want it" })).toBeVisible();
    await expect.poll(async () => readRow(supabase, userId, wine), { timeout: 15_000 }).toBeNull();
    await expect
      .poll(async () => countEvents(supabase, userId, "journal_deleted"), { timeout: 15_000 })
      .toBe(deletedBefore + 1);
    const removed = await latestEvent(supabase, userId, "journal_deleted");
    expect(removed!.payload.wine).toBe(wine);
    expect(removed!.payload.interaction_type).toBe("want");
    expect(removed!.payload.points_reversed).toBe(false);
  });

  test("a bottle with no row and no recommendation gets the designed empty state", async ({ page }) => {
    await page.goto(wineHref("[e2e] No Such Bottle 1999"));
    const winePage = page.getByTestId("wine-page");
    await expect(winePage).toContainText("We couldn’t find that bottle", { timeout: 15_000 });
    await expect(winePage).toContainText("It may have left your journal.");
    await expect(winePage.getByRole("link", { name: "Back to your list" })).toHaveAttribute("href", "/");
    // Nothing to act on — no verdict, no actions
    await expect(winePage.getByRole("button", { name: "🍷 Had it" })).toHaveCount(0);
  });
});

test.describe("The journal — tabs, rows, the timeline (hard-fail)", () => {
  test("counted tabs; a Want round trip keeps its tab; the Timeline deep link", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tab", { name: /^Tried, \d+$/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("service-bar")).toBeVisible();

    // Premise: the rich account's seeded want rows
    await page.getByRole("tab", { name: /^Want, \d+$/ }).click();
    await expect(page).toHaveURL(/[?&]tab=want/);
    const want = page.getByTestId("journal-row").first();
    await expect(want).toBeVisible();
    const wantName = (await want.getAttribute("data-wine")) ?? "";
    expect(wantName.length, "the rich account keeps want rows").toBeGreaterThan(0);
    await expect(want).toContainText("📌");

    // A row opens its wine; back comes home to the Want tab
    await want.click();
    await expect(page.getByTestId("wine-page")).toContainText("📌 On your want list", { timeout: 15_000 });
    await expect(page.getByTestId("running-head-back")).toContainText("Journal");
    await page.getByTestId("running-head-back").click();
    await expect(page.getByRole("tab", { name: /^Want, \d+$/ })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    await expect(journalRow(page, wantName)).toBeVisible();

    // The Timeline deep link (the Palate view's "Full history") and its
    // founding row
    await page.goto("/journal?tab=timeline");
    await expect(page.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    await expect(page.getByText("Your palate began — quiz complete")).toBeVisible();
    await expect(page.getByRole("link", { name: /See what’s building in your palate/ })).toHaveAttribute("href", "/palate");
  });
});
