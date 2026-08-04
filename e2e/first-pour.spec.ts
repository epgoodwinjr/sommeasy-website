import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { freshDb } from "./fixtures/test-db";

/**
 * Hard-fail guards for The First Pour (Aug 2026) — onboarding cards that
 * teach the loop to a zero-bottle user (the health report's 3-of-5 stall):
 *
 * 1. Fresh state shows the first two cards (rate-one, log-a-bottle) and the
 *    plain Log a Bottle module yields to its card (one camera entry at a
 *    time). bring-a-list waits its turn (MAX_VISIBLE_CARDS = 2).
 * 2. Dismissal is device-local: it hides a card and yields its slot, it
 *    persists across reload, and a clean context shows the card again —
 *    only DOING the thing retires a card.
 * 3. Rating through the real UI retires rate-one from DURABLE truth (gone
 *    across a reload), and deleting that rating through the real journal UI
 *    honestly restores never-rated state — the card returns. This cycle is
 *    also what keeps this fixture account zero-state forever.
 * 4. The verdict ask outranks evergreen cards: when an ask is due, zero
 *    cards render and the camera module returns.
 * 5. Blackhole: with wine_events unreachable, home shows no cards, no ask,
 *    no error — silence, never a spinner.
 * 6. The RICH account shows zero cards — the self-retiring contract, proven
 *    on real history (its menu_analyzed / bottle_logged / rating truth).
 *
 * Fixture discipline: this spec runs against the dedicated ZERO-STATE
 * account (TEST_FRESH_EMAIL — quiz-only profile, zero bottles, zero
 * menu/bottle events EVER; do not analyze menus or log bottles as this
 * user, those events are append-forever and would permanently retire its
 * cards). Interactions rows are self-healed; identity-bearing profile
 * fields are snapshot/restored (the milestone hook may refresh them).
 */

const CARD = (id: string) => `first-pour-card-${id}`;

async function signInFresh(page: Page) {
  await page.goto("/login");
  await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
  await page.locator('input[type="email"]').fill(process.env.TEST_FRESH_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_FRESH_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/", { timeout: 15_000 });
  await expect(page.locator("text=Sign Out")).toBeVisible({ timeout: 10_000 });
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

  test("fresh state shows the first two cards; the camera module yields to its card", async ({ page }) => {
    test.setTimeout(180_000);
    await signInFresh(page);
    await ensureProfile(page);

    await expect(page.getByTestId(CARD("rate-one"))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(CARD("log-a-bottle"))).toBeVisible();
    // Max two at once — the third waits its turn
    await expect(page.getByTestId(CARD("bring-a-list"))).toBeHidden();
    // One camera entry at a time: the plain module yields while its card shows
    await expect(page.getByText("Photo a label to add it to your collection")).toBeHidden();
    // The cards join existing furniture, never replace it
    await expect(page.getByTestId("palate-strip")).toBeVisible();
    await expect(page.getByTestId("wine-rec-list")).toBeVisible();
  });

  test("dismissal hides a card, yields its slot, and persists across reload", async ({ page }) => {
    test.setTimeout(120_000);
    await signInFresh(page);
    await expect(page.getByTestId(CARD("rate-one"))).toBeVisible({ timeout: 15_000 });

    await page.getByTestId(CARD("rate-one")).getByTestId("first-pour-dismiss").click();
    await expect(page.getByTestId(CARD("rate-one"))).toBeHidden();
    // The third card surfaces into the freed slot
    await expect(page.getByTestId(CARD("bring-a-list"))).toBeVisible();

    await page.reload();
    await expect(page.getByTestId(CARD("log-a-bottle"))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(CARD("bring-a-list"))).toBeVisible();
    await expect(page.getByTestId(CARD("rate-one"))).toBeHidden();
  });

  test("rating retires rate-one from durable truth; the journal delete restores it", async ({ page }) => {
    test.setTimeout(180_000);
    await signInFresh(page);
    // A clean context: the dismissal above was device-local, so the card is
    // back — only doing the thing retires it
    await expect(page.getByTestId(CARD("rate-one"))).toBeVisible({ timeout: 15_000 });

    // Rate the first rec through the real UI. "It was fine" = 0 evolution
    // points — the engine early-returns, DNA untouched, delete fully restores
    const card = page.getByTestId("wine-rec-list").getByTestId("rec-card").first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /Had it/ }).click();
    await page.getByRole("button", { name: /It was fine/ }).click();
    await expect(page.getByText(/Noted!/)).toBeVisible();

    // Durable truth: the card is gone across a reload
    await expect
      .poll(async () => {
        const { data } = await supabase
          .from("wine_interactions")
          .select("wine_name, rating")
          .eq("user_id", userId)
          .not("rating", "is", null);
        return data?.length ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);
    await page.reload();
    await expect(page.getByTestId(CARD("log-a-bottle"))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(CARD("bring-a-list"))).toBeVisible();
    await expect(page.getByTestId(CARD("rate-one"))).toBeHidden();

    // The honest restore: deleting the only rated bottle returns the account
    // to never-rated — through the real journal UI
    const { data: rows } = await supabase
      .from("wine_interactions")
      .select("wine_name")
      .eq("user_id", userId)
      .not("rating", "is", null);
    const wineName = rows![0].wine_name as string;
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
    await expect(page.getByTestId(CARD("rate-one"))).toBeVisible({ timeout: 15_000 });
  });

  test("the verdict ask outranks cards; the camera module returns", async ({ page }) => {
    test.setTimeout(120_000);
    await signInFresh(page);
    // Synthesize an outstanding verdict at the network layer — never a real
    // pick_chosen row (append-forever would dirty this account's ledger).
    // The ask query filters event_type=in.(pick_chosen,...); the cards query
    // filters in.(bottle_logged,menu_analyzed) — route on that difference.
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
    await expect(page.getByTestId("verdict-ask")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="first-pour-card-"]')).toHaveCount(0);
    // Cards suppressed → the plain camera module is back
    await expect(page.getByText("Photo a label to add it to your collection")).toBeVisible();
  });

  test("blackholed wine_events → no cards, no ask, no error — silence", async ({ page }) => {
    test.setTimeout(120_000);
    await signInFresh(page);
    await page.route("**/rest/v1/wine_events**", (route) => route.abort());
    await page.goto("/");
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("wine-rec-list")).toBeVisible();
    await expect(page.locator('[data-testid^="first-pour-card-"]')).toHaveCount(0);
    await expect(page.getByTestId("verdict-ask")).toBeHidden();
    await expect(page.getByText("Photo a label to add it to your collection")).toBeVisible();
  });
});

test.describe("The First Pour — rich account (hard-fail)", () => {
  test("a full journal shows zero cards — the self-retiring contract on real history", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid^="first-pour-card-"]')).toHaveCount(0);
    // No card → the plain camera module stands
    await expect(page.getByText("Photo a label to add it to your collection")).toBeVisible();
  });
});
