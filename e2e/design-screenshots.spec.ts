import { test, expect } from "@playwright/test";
import path from "path";
import { renderPalateMark } from "../src/lib/palateMark";

/**
 * Design-review screenshot capture (Act III S4, "The Signature").
 *
 * Env-gated like the seeder: runs only with SCREENSHOTS=1, so normal e2e
 * runs skip it. Reusable for every aesthetic iteration round — it writes
 * the full review set to docs/palate-act-iii-s4-screens/:
 *
 *   home-strip-{mobile,desktop}.png   — authenticated home, the strip
 *   palate-hero-{mobile,desktop}.png  — /palate hero
 *   reveal-{mobile,desktop}.png       — signed-in reveal (ONE refine save,
 *                                       content-identical merge; desktop is
 *                                       a viewport resize, not a second run)
 *   teaser-{mobile,desktop}.png       — anonymous reveal (stash only, no DB)
 *   gallery.png                       — all 7 production marks + growth strip
 *
 * Uses the test account exclusively (storageState), per CLAUDE.md.
 */

const RUN = process.env.SCREENSHOTS === "1";
const OUT = path.resolve(__dirname, "../docs/palate-act-iii-s4-screens");
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

// July 31, 2026 production genome snapshot (read-only SQL) — the same
// fixtures palateMark.test.js locks distinctness on
const GALLERY = [
  { label: "The Italian Faithful", sub: "blairfg", genome: { seed: 3523612936, color: 0.5, depth: 0, focus: 0, range: 0, world: 0, spread: 0 } },
  { label: "The Stellenbosch Loyalist", sub: "Ed (FTI)", genome: { seed: 530334102, color: 1 / 3, depth: 1, focus: 1, range: 0.75, world: 4 / 9, spread: 1 } },
  { label: "The Stellenbosch Loyalist", sub: "Ed", genome: { seed: 464996349, color: 1 / 3, depth: 1, focus: 1, range: 1, world: 4 / 9, spread: 1 } },
  { label: "The South African Curator", sub: "e2e", genome: { seed: 3024288059, color: 0.5, depth: 1 / 6, focus: 1 / 6, range: 0.25, world: 0.5, spread: 0.25 } },
  { label: "The French Purist", sub: "+local", genome: { seed: 1819852250, color: 0, depth: 0, focus: 1 / 6, range: 0.25, world: 0.5, spread: 0 } },
  { label: "The French Purist", sub: "+prod (identical pair)", genome: { seed: 1819852250, color: 0, depth: 0, focus: 1 / 6, range: 0.25, world: 0.5, spread: 0 } },
  { label: "The Bordeaux Regular", sub: "inbuilt.wit", genome: { seed: 149395124, color: 0, depth: 1 / 6, focus: 0, range: 0.125, world: 0, spread: 0.125 } },
];

// The e2e account's palate, grown twice — the continuity story
const GROWTH = [
  { label: "today", genome: GALLERY[3].genome },
  { label: "first estate promotion", genome: { ...GALLERY[3].genome, seed: 901234567, depth: 0.5, spread: 0.375 } },
  { label: "a year of bottles later", genome: { ...GALLERY[3].genome, seed: 87654321, depth: 1, spread: 0.75, range: 0.5, focus: 1 / 3, color: 0.4 } },
];

test.describe("Design screenshots (SCREENSHOTS=1 only)", () => {
  test.skip(!RUN, "Set SCREENSHOTS=1 to capture the design-review set");

  test("home strip + palate hero, mobile and desktop", async ({ page }) => {
    for (const [tag, vp] of [["mobile", MOBILE], ["desktop", DESKTOP]] as const) {
      await page.setViewportSize(vp);
      await page.goto("/");
      await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: path.join(OUT, `home-strip-${tag}.png`) });

      await page.goto("/palate");
      await expect(page.getByTestId("palate-archetype")).toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: path.join(OUT, `palate-hero-${tag}.png`) });
    }
  });

  test("signed-in reveal (one refine save, resized for desktop)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/?quiz=refine");
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 20_000 });
    for (let step = 2; step <= 5; step++) {
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
    }
    await page.getByRole("button", { name: "Update My Wine DNA" }).click();
    await expect(page.getByTestId("reveal-archetype")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("palate-mark").first()).toBeVisible();
    await page.waitForTimeout(2600); // let the staged entrance settle
    await page.screenshot({ path: path.join(OUT, "reveal-mobile.png") });
    await page.setViewportSize(DESKTOP);
    await page.screenshot({ path: path.join(OUT, "reveal-desktop.png") });
  });

  test("gallery: all 7 production marks + the growth strip", async ({ page }) => {
    const cell = (r: { label: string; sub: string; genome: object }, size: number) => `
      <div class="cell">
        ${renderPalateMark(r.genome, { size })}
        <div class="lbl">${r.label}</div>
        <div class="sub">${r.sub}</div>
      </div>`;
    await page.setViewportSize({ width: 1360, height: 1300 });
    await page.setContent(`<!doctype html><meta charset="utf-8">
      <style>
        body { font-family: Georgia, serif; background: #F5F0E8; margin: 28px; color: #1B3D2F; }
        h2 { font-weight: 600; margin: 20px 0 14px; }
        .row { display: flex; flex-wrap: wrap; gap: 26px; align-items: flex-start; margin-bottom: 8px; }
        .cell { text-align: center; max-width: 190px; }
        .lbl { font-size: 14px; margin-top: 8px; font-weight: 700; }
        .sub { font-size: 11px; opacity: 0.6; margin-top: 2px; font-family: sans-serif; }
      </style>
      <h2>The 7 production marks — rendered from the live genomes (July 31, 2026)</h2>
      <div class="row">${GALLERY.map((r) => cell(r, 172)).join("")}</div>
      <h2>Growth continuity — the e2e account's palate, grown</h2>
      <div class="row">${GROWTH.map((r) => cell({ ...r, sub: r.label, label: "" }, 172)).join("")}</div>`);
    await page.screenshot({ path: path.join(OUT, "gallery.png"), fullPage: true });
  });
});

test.describe("Design screenshots — anonymous (SCREENSHOTS=1 only)", () => {
  // The empty storageState is what makes this context anonymous —
  // browser.newContext() would inherit the signed-in project state
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(!RUN, "Set SCREENSHOTS=1 to capture the design-review set");

  test("anonymous teaser (no account, stash only)", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await page.getByRole("button", { name: "Build My Profile" }).click();
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /South Africa/ }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
    await page.getByRole("button", { name: /Stellenbosch/ }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 3 of 5")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 4 of 5")).toBeVisible();
    await page.getByRole("button", { name: /Pinot Noir/ }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await page.getByRole("button", { name: "See My Wine DNA" }).click();
    await expect(page.getByTestId("teaser-gate")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(OUT, "teaser-mobile.png"), fullPage: true });
    await page.setViewportSize(DESKTOP);
    await page.screenshot({ path: path.join(OUT, "teaser-desktop.png"), fullPage: true });
  });
});
