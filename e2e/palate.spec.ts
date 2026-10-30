import { test, expect } from "@playwright/test";

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
});
