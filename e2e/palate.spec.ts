import { test, expect } from "@playwright/test";
import { testDb, ensureEarnedFixture, EARNED_FIXTURE } from "./fixtures/test-db";

/**
 * Hard-fail guard for the Palate view (Palate Act II, Session 2).
 *
 * The Palate must render with a real archetype, named (never raw-ID)
 * countries/regions/varietals, and the evolution sections — including the
 * designed empty state when no timeline events exist yet. Do NOT make this
 * outcome-tolerant: if any of these fail to render, the page is broken.
 *
 * Named assertions ride on the seeded test account (TEST_USER_EMAIL), whose
 * quiz DNA includes South Africa / Stellenbosch / Pinot Noir.
 */

test.describe("Palate view (hard-fail guard)", () => {
  test("renders archetype, signature, named DNA, and evolution sections", async ({ page }) => {
    await page.goto("/palate");

    // Identity: a non-empty archetype headline + the strand's epithet
    const archetype = page.getByTestId("palate-archetype");
    await expect(archetype).toBeVisible();
    expect((await archetype.textContent())?.trim().length).toBeGreaterThan(0);
    const epithet = page.getByTestId("palate-epithet");
    await expect(epithet).toBeVisible();
    expect((await epithet.textContent())?.trim().length).toBeGreaterThan(0);

    // The Signature (Act III S4): the visual mark renders in the hero as a
    // real SVG — a genome that fails to render would silently drop it
    const heroMark = page.getByTestId("palate-mark").first();
    await expect(heroMark).toBeVisible();
    await expect(heroMark.locator("svg circle").first()).toBeAttached();

    // Pillar 4: the palate signature card
    await expect(page.getByTestId("palate-signature")).toBeVisible();
    await expect(page.getByText("Palate Signature", { exact: true })).toBeVisible();

    // Pillar 3: both living-palate sections render (content or designed
    // empty state — never absent, never broken)
    await expect(page.getByTestId("palate-evolution")).toBeVisible();
    await expect(page.getByTestId("palate-building")).toBeVisible();

    // Pillar 2: named DNA, not raw IDs
    const dna = page.getByTestId("palate-dna");
    await expect(dna).toBeVisible();
    await expect(dna.getByText("South Africa").first()).toBeVisible();
    await expect(dna.getByText("Stellenbosch").first()).toBeVisible();
    await expect(dna.getByText("Pinot Noir").first()).toBeVisible();
  });

  test("the crest on home is the door to the palate", async ({ page }) => {
    await page.goto("/");
    const strip = page.getByTestId("palate-strip");
    await expect(strip).toBeVisible();
    // The House List crest (Phase 2, §8.1.2) carries the visual mark at its
    // designed 76px, above the strand's title — the old strip's 44px cap
    // retired with the strip
    const stripMark = strip.getByTestId("palate-mark");
    await expect(stripMark).toBeVisible();
    const markBox = await stripMark.boundingBox();
    expect(markBox, "the crest mark must render").not.toBeNull();
    expect(Math.abs(markBox!.height - 76)).toBeLessThanOrEqual(1);
    // The date line's link and the footer links hold the 40px tap floor
    // (CLAUDE.md) even at 10px / 13px type
    const footerLinks = page.getByRole("navigation", { name: "Your Sommeasy" }).getByRole("link");
    await expect(footerLinks).toHaveCount(3, { timeout: 15_000 });
    const targets = [page.getByRole("link", { name: "Your palate ›" }), ...(await footerLinks.all())];
    for (const link of targets) {
      const box = await link.boundingBox();
      expect(box!.height, `tap target: ${await link.textContent()}`).toBeGreaterThanOrEqual(40);
    }
    await strip.click();
    await page.waitForURL("/palate");
    await expect(page.getByTestId("palate-archetype")).toBeVisible();
  });

  // The House List (Phase 5, §8.7): an inner page — the running head and
  // the service bar (decision D1) — of numbered sections, where only what
  // ratings earned wears ✦, and Start fresh asks before it opens the quiz
  // (decision D2). The earned Chenin Blanc fixture (self-healed here) and
  // its timeline row are the premise.
  test("House List palate: numbered sections, the earned ✦, and Start fresh asks first", async ({ page }) => {
    const { supabase, userId } = await testDb();
    await ensureEarnedFixture(supabase, userId);

    await page.goto("/palate");
    await expect(page.getByTestId("palate-archetype")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("running-head")).toBeVisible();
    await expect(page.getByTestId("service-bar")).toBeVisible();
    const heroMark = page.getByTestId("palate-mark").first();
    const markBox = await heroMark.boundingBox();
    expect(markBox, "the hero mark must render").not.toBeNull();
    expect(Math.abs(markBox!.height - 176)).toBeLessThanOrEqual(1);
    for (const label of ["Recently evolved", "Building now", "Your DNA"]) {
      await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    }

    // Recently evolved: the journal's lines (the fixture's timeline row
    // guarantees content, so never the empty state here), each a link, and
    // the way to the full history
    const evolution = page.getByTestId("palate-evolution");
    const moments = evolution.getByRole("link", { name: /joined your|left your|You became|Your signature shifted/ });
    await expect(moments.first()).toBeVisible();
    expect(await moments.count()).toBeLessThanOrEqual(3);
    await expect(evolution.getByRole("link", { name: "Full history →" })).toHaveAttribute("href", "/journal?tab=timeline");

    // The DNA: the earned grape wears ✦ and its bottle count; the quiz's
    // grape wears no ✦
    const dna = page.getByTestId("palate-dna");
    const row = (name: string) => dna.getByTestId("palate-dna-row").filter({ hasText: name });
    await expect(row("Chenin Blanc")).toContainText(`${EARNED_FIXTURE.interactionCount} bottles`);
    await expect(row("Chenin Blanc").getByRole("img", { name: "earned by your ratings" })).toBeVisible();
    await expect(row("Pinot Noir").getByRole("img")).toHaveCount(0);
    await expect(row("Pinot Noir")).toContainText(/from your quiz|\d+ bottles?/);
    await expect(dna.getByText("earned by your ratings, not the quiz")).toBeVisible();

    // The quiz links: Adjust goes straight in; Start fresh asks first
    await expect(page.getByRole("link", { name: "Adjust quiz answers" })).toHaveAttribute("href", "/?quiz=refine");
    const startFresh = page.getByTestId("start-fresh");
    await expect(startFresh).toHaveAttribute("aria-expanded", "false");
    await startFresh.click();
    const confirm = page.getByTestId("start-fresh-confirm");
    await expect(confirm).toContainText("Start over with a blank quiz?");
    await expect(confirm.getByRole("link", { name: "Start fresh" })).toHaveAttribute("href", "/?quiz=fresh");
    await expect(startFresh).toHaveAttribute("aria-expanded", "true");
    // Cancel closes it and hands focus back — nothing opened, nothing saved
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(startFresh).toBeFocused();
    await expect(page).toHaveURL(/\/palate$/);
  });
});
