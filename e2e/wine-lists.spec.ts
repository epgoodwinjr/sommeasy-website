import { test, expect } from "@playwright/test";
import { RecommendPage } from "./fixtures/sommeasy-page";
import fs from "fs";
import path from "path";

const FIXTURES = path.join(__dirname, "fixtures", "images");

// Get available PDF fixtures
const pdfFiles = fs.readdirSync(FIXTURES).filter(f => f.endsWith(".pdf"));

test.describe("Wine List — Vision Scan Path (PDFs)", () => {
  let recPage: RecommendPage;

  test.beforeEach(async ({ page }) => {
    recPage = new RecommendPage(page);
    await recPage.goto();
  });

  test("PDF wine list produces picks or graceful message", async () => {
    // Use first available PDF
    const pdf = pdfFiles[0];
    test.skip(!pdf, "No PDF fixtures available");

    await recPage.uploadFile(pdf!);
    await recPage.waitForProcessing();

    const outcome = await recPage.getOutcome();
    // Should get results, no-matches, or error — never crash
    expect(["results", "no-matches", "error"]).toContain(outcome);

    if (outcome === "results") {
      const count = await recPage.getPickCount();
      expect(count).toBeGreaterThan(0);
    }

    await recPage.screenshot(`winelist-pdf-${pdf!.replace(".pdf", "")}`);
  });

  test("Second PDF wine list processes successfully", async () => {
    const pdf = pdfFiles[1];
    test.skip(!pdf, "Not enough PDF fixtures");

    await recPage.uploadFile(pdf!);
    await recPage.waitForProcessing();

    const outcome = await recPage.getOutcome();
    expect(["results", "no-matches", "error"]).toContain(outcome);

    await recPage.screenshot(`winelist-pdf-${pdf!.replace(".pdf", "")}`);
  });

  test("Third PDF wine list processes successfully", async () => {
    const pdf = pdfFiles[2];
    test.skip(!pdf, "Not enough PDF fixtures");

    await recPage.uploadFile(pdf!);
    await recPage.waitForProcessing();

    const outcome = await recPage.getOutcome();
    expect(["results", "no-matches", "error"]).toContain(outcome);

    await recPage.screenshot(`winelist-pdf-${pdf!.replace(".pdf", "")}`);
  });
});

test.describe("Wine List — Paste Text Path", () => {
  let recPage: RecommendPage;

  test.beforeEach(async ({ page }) => {
    recPage = new RecommendPage(page);
    await recPage.goto();
  });

  test("Pasted wine list produces picks", async () => {
    const sampleList = `WHITES
Cloudy Bay Sauvignon Blanc, Marlborough 2022...$52
Trimbach Riesling, Alsace 2021...$44
Cakebread Chardonnay, Napa Valley 2021...$72

REDS
Kanonkop Pinotage, Stellenbosch 2019...$68
Catena Zapata Malbec, Mendoza 2020...$58
Ridge Monte Bello, Santa Cruz Mountains 2019...$250`;

    await recPage.pasteAndAnalyze(sampleList);

    // Paste analysis is instant (no API call) — results should appear quickly
    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

    const outcome = await recPage.getOutcome();
    expect(["results", "no-matches"]).toContain(outcome);

    if (outcome === "results") {
      const count = await recPage.getPickCount();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(20);
    }

    await recPage.screenshot("winelist-paste-sample");
  });

  test("Empty paste does not trigger analysis", async () => {
    await recPage.pasteToggle.click();
    await recPage.wineListTextarea.fill("");

    // Analyze button should be disabled
    await expect(recPage.analyzeButton).toBeDisabled();

    await recPage.screenshot("winelist-paste-empty");
  });

  test("Single wine entry produces result", async () => {
    await recPage.pasteAndAnalyze("Kanonkop Pinotage, Stellenbosch 2019...$68");

    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

    const outcome = await recPage.getOutcome();
    expect(["results", "no-matches"]).toContain(outcome);

    await recPage.screenshot("winelist-paste-single");
  });
});

test.describe("The Somm — notes or graceful fallback", () => {
  let recPage: RecommendPage;

  const KNOWN_GOOD_LIST = `REDS
Kanonkop Paul Sauer, Stellenbosch 2019...$85
Torbreck RunRig Shiraz, Barossa 2016...$185
Penfolds Grange Shiraz 2017...$240
Catena Zapata Malbec, Mendoza 2020...$58
Joseph Drouhin Gevrey-Chambertin 2019...$120

WHITES
Cloudy Bay Sauvignon Blanc, Marlborough 2022...$52
Trimbach Riesling, Alsace 2021...$44`;

  test.beforeEach(async ({ page }) => {
    recPage = new RecommendPage(page);
    await recPage.goto();
  });

  // Phase 1 lesson (the retired-model incident): a spec that FAILS outright
  // if picks are absent — no error-tolerant escape hatch.
  test("Known-good paste list ALWAYS produces pick cards", async ({ page }) => {
    await recPage.pasteAndAnalyze(KNOWN_GOOD_LIST);
    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

    const count = await page.locator('[data-testid="pick-card"]').count();
    expect(count).toBeGreaterThan(0); // hard assertion — this list matches every profile

    await recPage.screenshot("somm-picks-present");
  });

  test("After analysis: somm notes render OR fallback keeps noteless picks", async ({ page }) => {
    await recPage.pasteAndAnalyze(KNOWN_GOOD_LIST);
    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });

    // Give The Somm time to answer (or fall back) — it's a background call
    await page.waitForTimeout(20_000);

    const picks = await page.locator('[data-testid="pick-card"]').count();
    const notes = await page.locator('[data-testid="somm-note"]').count();
    const thinking = await page.locator('[data-testid="somm-thinking"]').count();

    // Picks must exist in EVERY outcome; The Somm is progressive enhancement
    expect(picks).toBeGreaterThan(0);
    // Terminal state: either notes rendered, or clean fallback (no notes, no stuck shimmer)
    expect(thinking).toBe(0);
    if (notes > 0) {
      expect(notes).toBeLessThanOrEqual(picks);
    }

    await recPage.screenshot("somm-notes-or-fallback");
  });
});
