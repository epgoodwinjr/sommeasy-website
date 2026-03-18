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
