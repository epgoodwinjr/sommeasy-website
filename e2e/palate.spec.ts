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

  test("the DNA strip on home is the door to the palate", async ({ page }) => {
    await page.goto("/");
    const strip = page.getByTestId("palate-strip");
    await expect(strip).toBeVisible();
    // The strip carries the visual mark (Act III S4) without growing: the
    // mark is capped at 44px so the text block still owns the strip height
    const stripMark = strip.getByTestId("palate-mark");
    await expect(stripMark).toBeVisible();
    const markBox = await stripMark.boundingBox();
    expect(markBox && markBox.height).toBeLessThanOrEqual(44);
    await strip.click();
    await page.waitForURL("/palate");
    await expect(page.getByTestId("palate-archetype")).toBeVisible();
  });
});
