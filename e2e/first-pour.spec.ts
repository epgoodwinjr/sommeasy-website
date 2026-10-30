import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { freshDb, testDb } from "./fixtures/test-db";

/**
 * Hard-fail guards for The First Pour (Aug 2026), carried into The House
 * List (Phase 2, Oct 2026). The onboarding cards retired; home now teaches
 * the loop with its NEW-USER LAYOUT — "Your first entry" (name a bottle you
 * love → Log a bottle, or snap tonight's label) and Reserved rows that hold
 * two recommendations back until the first rating anywhere (decision D6).
 * The contract is unchanged: the layout is decided from durable truth (a
 * rating-bearing wine_interactions row, through firstPour.js), it retires
 * itself, and it never guesses.
 *
 * 1. Fresh state shows the new-user layout: Your first entry, two open
 *    recs, two Reserved rows and their caption — and none of the
 *    established furniture (the Log a bottle entry, From last night).
 * 2. Your first entry hands off to /log: a typed name opens the search step
 *    pre-filled (?q=), "snap tonight's label" links to /log. It stops
 *    there — nothing is logged.
 * 3. Rating through the real UI opens the Reserved rows IN PLACE while
 *    section II stays put (the page never rearranges under the thumb),
 *    retires the layout from DURABLE truth (established across a reload),
 *    and deleting that rating through the real journal UI honestly
 *    restores never-rated state — the new-user layout returns. This cycle
 *    is also what keeps this fixture account zero-state forever.
 * 4. A due verdict ask outranks onboarding: the established layout with
 *    From last night — no first entry, no Reserved rows, Log a bottle back.
 * 5. Blackhole: with wine_events unreachable, home settles on the
 *    established layout — no ask, no error. Onboarding is a courtesy,
 *    never a guess.
 * 6. The RICH account shows the established layout — the self-retiring
 *    contract, proven on real history (its menu_analyzed / bottle_logged /
 *    rating truth).
 *
 * Fixture discipline: this spec runs against the dedicated ZERO-STATE
 * account (TEST_FRESH_EMAIL — quiz-only profile, zero bottles, zero
 * menu/bottle events EVER; never analyze menus or log bottles as this user
 * — those events are append-forever. Test 2 stops at /log's search step on
 * purpose). Interactions rows are self-healed; identity-bearing profile
 * fields are snapshot/restored (the milestone hook may refresh them).
 */

/** The established layout's "II. Tonight, in" entry. */
const logEntry = (page: Page) => page.getByRole("link", { name: "Log a bottle", exact: true });

async function signInFresh(page: Page) {
  await page.goto("/login");
  await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
  await page.locator('input[type="email"]').fill(process.env.TEST_FRESH_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_FRESH_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/", { timeout: 15_000 });
  await expect(
    page.getByTestId("palate-strip").or(page.getByRole("button", { name: "Build My Profile" })).first()
  ).toBeVisible({ timeout: 15_000 });
}

/** Self-healing seed: a quiz-only profile through the real quiz UI (the
 *  seed-test-account selections, minus every rating — bottles stay zero). */
async function ensureProfile(page: Page) {
  const buildButton = page.getByRole("button", { name: "Build My Profile" });
  const palateStrip = page.getByTestId("palate-strip");
  await expect(buildButton.or(palateStrip).first()).toBeVisible({ timeout: 15_000 });
  if (!(await buildButton.isVisible().catch(() => false))) return;

  await buildButton.click();
  await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });
  const chip = async (name: string) => {
    await page.getByRole("button", { name: new RegExp(name) }).first().click();
  };
  const accordionChip = async (accordion: string, name: string) => {
    const chipBtn = page.getByRole("button", { name: new RegExp(name) }).first();
    if (!(await chipBtn.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: new RegExp(accordion) }).first().click();
    }
    await chip(name);
  };
  await chip("South Africa");
  await chip("France");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await accordionChip("South Africa", "Stellenbosch");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  await chip("Pinot Noir");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();
  await page.getByRole("button", { name: /See My Wine DNA|Update My Wine DNA/ }).click();
  await expect(page.getByTestId("reveal-saved")).toBeVisible({ timeout: 30_000 });
  // NO ratings here — the account's bottles must stay at zero
  await page.goto("/");
  await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
}

test.describe.serial("The First Pour — fresh account (hard-fail)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let supabase: SupabaseClient;
  let userId: string;
  let baselineIdentity: Record<string, unknown> | null = null;

  test.beforeAll(async () => {
    ({ supabase, userId } = await freshDb());
    // Self-heal: a crashed earlier run may have left a rated row behind
    await supabase.from("wine_interactions").delete().eq("user_id", userId);
    const { data } = await supabase
      .from("wine_profiles")
      .select("archetype, identity, red_count, white_count")
      .eq("user_id", userId)
      .maybeSingle();
    baselineIdentity = data ?? null;
  });

  test.afterAll(async () => {
    if (!supabase) return;
    await supabase.from("wine_interactions").delete().eq("user_id", userId);
    if (baselineIdentity) {
      await supabase.from("wine_profiles").update(baselineIdentity).eq("user_id", userId);
    }
  });

  test("fresh state shows the new-user layout: first entry + two Reserved rows", async ({ page }) => {
    test.setTimeout(180_000);
    await signInFresh(page);
    await ensureProfile(page);

    const entry = page.getByTestId("first-entry");
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await expect(entry).toContainText("Name a bottle you already love");
    // The inline "snap tonight's label" link still clears the 40px tap floor
    const snapBox = await entry.getByTestId("first-entry-snap").boundingBox();
    expect(snapBox!.height, "first-entry-snap tap target").toBeGreaterThanOrEqual(40);
    const recs = page.getByTestId("wine-rec-list");
    await expect(recs.getByTestId("rec-card")).toHaveCount(2);
    await expect(recs.getByTestId("reserved-row")).toHaveCount(2);
    await expect(recs).toContainText("Two more selections open after your first rating.");
    // The new user's crest line — and none of the established furniture
    await expect(page.getByTestId("palate-strip")).toContainText("Your first list — it rewrites itself as you rate");
    await expect(logEntry(page)).toHaveCount(0);
    await expect(page.getByTestId("verdict-ask")).toHaveCount(0);
  });

  test("Your first entry hands off to Log a bottle — search pre-filled, nothing logged", async ({ page }) => {
    test.setTimeout(120_000);
    await signInFresh(page);
    const entry = page.getByTestId("first-entry");
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await expect(entry.getByTestId("first-entry-snap")).toHaveAttribute("href", "/log");

    await entry.getByTestId("first-entry-input").fill("Cloudy Bay");
    await entry.getByTestId("first-entry-submit").click();
    await page.waitForURL(/\/log\?q=Cloudy%20Bay$/, { timeout: 15_000 });
    await expect(page.getByTestId("log-search-input")).toHaveValue("Cloudy Bay", { timeout: 15_000 });
    // Stop here: the zero-state account never logs a bottle
  });

  test("a rating opens the Reserved rows in place, retires the layout, and the journal delete restores it", async ({ page }) => {
    test.setTimeout(180_000);
    await signInFresh(page);
    const recs = page.getByTestId("wine-rec-list");
    await expect(recs.getByTestId("reserved-row")).toHaveCount(2, { timeout: 15_000 });

    // Rate the first rec through the real UI. "It was fine" = 0 evolution
    // points — the engine early-returns, DNA untouched, delete fully restores
    const card = recs.getByTestId("rec-card").first();
    const wineName = (await card.getAttribute("data-wine")) ?? "";
    expect(wineName.length).toBeGreaterThan(0);
    await card.getByRole("button", { name: /Had it/ }).click();
    await card.getByTestId("rating-tile-fine").click();
    await expect(card).toContainText("😐 It was fine — noted in your journal.");

    // The first rating opens the Reserved rows in place — and section II
    // stays put until the next load
    await expect(recs.getByTestId("reserved-row")).toHaveCount(0);
    await expect(recs.getByTestId("rec-card")).toHaveCount(4);
    await expect(recs).not.toContainText("open after your first rating");
    await expect(page.getByTestId("first-entry")).toBeVisible();

    // Durable truth: the rated row landed…
    await expect
      .poll(async () => {
        const { data } = await supabase
          .from("wine_interactions")
          .select("wine_name, rating")
          .eq("user_id", userId)
          .not("rating", "is", null);
        return data?.map((r) => `${r.wine_name}:${r.rating}`) ?? [];
      }, { timeout: 15_000 })
      .toEqual([`${wineName}:fine`]);
    // …and the next load is the established layout
    await page.reload();
    await expect(logEntry(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("first-entry")).toHaveCount(0);
    await expect(page.getByTestId("reserved-row")).toHaveCount(0);

    // The honest restore: deleting the only rated bottle returns the account
    // to never-rated — through the real journal UI
    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "Wine Journal" })).toBeVisible();
    const journalCard = page
      .locator("div")
      .filter({ has: page.getByText(wineName, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: "×" }) })
      .last();
    await journalCard.getByRole("button", { name: "×" }).click();
    await expect(page.getByText("✓ Removed")).toBeVisible();
    await expect
      .poll(async () => {
        const { data } = await supabase
          .from("wine_interactions")
          .select("id")
          .eq("user_id", userId);
        return data?.length ?? 0;
      }, { timeout: 15_000 })
      .toBe(0);

    await page.goto("/");
    await expect(page.getByTestId("first-entry")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("reserved-row")).toHaveCount(2);
  });

  test("a due verdict ask outranks onboarding: the established layout with From last night", async ({ page }) => {
    test.setTimeout(120_000);
    await signInFresh(page);
    // Synthesize an outstanding verdict at the network layer — never a real
    // pick_chosen row (append-forever would dirty this account's ledger).
    // The ask query filters event_type=in.(pick_chosen,...); the layout's
    // read filters in.(bottle_logged,menu_analyzed) — route on that difference.
    await page.route("**/rest/v1/wine_events**", async (route) => {
      const url = route.request().url();
      if (route.request().method() === "GET" && url.includes("pick_chosen")) {
        await route.fulfill({
          json: [{
            id: "e2e-synthetic-ask",
            event_type: "pick_chosen",
            payload: { wine: "Kanonkop Pinotage 2019", role: "top", session: "s_e2e" },
            occurred_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          }],
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/");
    const ask = page.getByTestId("verdict-ask");
    await expect(ask).toBeVisible({ timeout: 15_000 });
    await expect(ask).toContainText("Kanonkop Pinotage");
    await expect(ask).toContainText("From last night");
    await expect(page.getByTestId("first-entry")).toHaveCount(0);
    await expect(page.getByTestId("reserved-row")).toHaveCount(0);
    // Onboarding yielded → the established Log a bottle entry is back
    await expect(logEntry(page)).toBeVisible();
  });

  test("blackholed wine_events → the established layout, no ask, no error", async ({ page }) => {
    test.setTimeout(120_000);
    await signInFresh(page);
    await page.route("**/rest/v1/wine_events**", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
    // The layout settled (sections render only once it's decided)…
    await expect(logEntry(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("wine-rec-list")).toBeVisible();
    // …and without its event truth, onboarding never guesses
    await expect(page.getByTestId("first-entry")).toHaveCount(0);
    await expect(page.getByTestId("reserved-row")).toHaveCount(0);
    await expect(page.getByTestId("verdict-ask")).toHaveCount(0);
  });

  test("a stalled ledger read can't hold home hostage: the established layout lands anyway", async ({ page }) => {
    test.setTimeout(120_000);
    await signInFresh(page);
    // Every wine_events read hangs — neither failure nor success, the way a
    // stalled request on a phone does. Home must stop waiting and show its
    // actions (and still never guess the new-user layout)
    await page.route("**/rest/v1/wine_events**", () => new Promise(() => {}));
    await page.goto("/");
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
    await expect(logEntry(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("first-entry")).toHaveCount(0);
    await expect(page.getByTestId("verdict-ask")).toHaveCount(0);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("a failed journal read is silence: no recommendation rows from a guess", async ({ page }) => {
    test.setTimeout(120_000);
    await signInFresh(page);
    let failedReads = 0;
    page.on("requestfailed", (r) => { if (r.url().includes("/rest/v1/wine_interactions")) failedReads++; });
    await page.route("**/rest/v1/wine_interactions**", (route) =>
      route.request().method() === "GET" ? route.abort() : route.continue());
    await page.goto("/");
    // Home's read failed → the established layout (never a guess)…
    await expect(logEntry(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("first-entry")).toHaveCount(0);
    // …and once the list's own read has failed too, it renders no rows it
    // couldn't vet (a rated rec re-rated with no previous rating would
    // double-count its evidence)
    await expect.poll(() => failedReads, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("rec-card")).toHaveCount(0);
  });
});

test.describe("The First Pour — rich account (hard-fail)", () => {
  test("a full journal shows the established layout — the self-retiring contract on real history", async ({ page }) => {
    test.setTimeout(120_000);

    // The premise, pinned in the DB (Aug 3 hardening): all three completion
    // truths must genuinely exist on this account. Without this, the
    // established-layout check below could pass for the wrong reason.
    // If one of these fails: perform the missing act ONCE through the real
    // UI as the rich account (a bottle log may be journal-deleted after —
    // the append-forever event is the truth, not the row).
    const { supabase, userId } = await testDb();
    const [rated, logged, menus] = await Promise.all([
      supabase.from("wine_interactions").select("id", { count: "exact", head: true })
        .eq("user_id", userId).not("rating", "is", null),
      supabase.from("wine_events").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("event_type", "bottle_logged"),
      supabase.from("wine_events").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("event_type", "menu_analyzed"),
    ]);
    expect(rated.count ?? 0, "rich fixture must have a rated bottle (rate-one truth)").toBeGreaterThan(0);
    expect(logged.count ?? 0, "rich fixture must have a bottle_logged event (log-a-bottle truth)").toBeGreaterThan(0);
    expect(menus.count ?? 0, "rich fixture must have a menu_analyzed event (bring-a-list truth)").toBeGreaterThan(0);

    // Settle gate: the layout's event read must complete, and the sections
    // render only once the layout is decided — so the zero counts below are
    // a resolved conclusion, not a not-yet-loaded coincidence
    const layoutRead = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/wine_events") && r.url().includes("bottle_logged"),
      { timeout: 15_000 }
    );
    await page.goto("/");
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
    await layoutRead;
    await expect(logEntry(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("first-entry")).toHaveCount(0);
    await expect(page.getByTestId("reserved-row")).toHaveCount(0);
  });
});
