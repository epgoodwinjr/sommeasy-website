import { test, expect } from "@playwright/test";
import { RecommendPage, BottleLogPage } from "./fixtures/sommeasy-page";

test.describe("Edge Cases", () => {
  test.describe("Recommend Page — Scan Path", () => {
    let recPage: RecommendPage;

    test.beforeEach(async ({ page }) => {
      recPage = new RecommendPage(page);
      await recPage.goto();
    });

    test("Non-wine image does not crash", async () => {
      await recPage.uploadFile("not-wine.jpg");
      await recPage.waitForProcessing();

      const outcome = await recPage.getOutcome();
      // Should show error or no-matches — not a crash or garbage results
      expect(["error", "no-matches", "results"]).toContain(outcome);

      // If somehow results appeared, they shouldn't be meaningful wine data
      await recPage.screenshot("edge-not-wine-recommend");
    });

    test("Blank white image handled gracefully", async () => {
      await recPage.uploadFile("blank-white.png");
      await recPage.waitForProcessing();

      const outcome = await recPage.getOutcome();
      expect(["error", "no-matches"]).toContain(outcome);

      await recPage.screenshot("edge-blank-white-recommend");
    });

    test("Tiny image handled gracefully", async () => {
      await recPage.uploadFile("tiny-image.jpg");
      await recPage.waitForProcessing();

      const outcome = await recPage.getOutcome();
      // Should not crash
      expect(["error", "no-matches", "results"]).toContain(outcome);

      await recPage.screenshot("edge-tiny-image-recommend");
    });

    test("Rapid sequential uploads don't break state", async () => {
      // Upload first file
      await recPage.uploadFile("label-test-01.jpg");

      // Immediately upload second file (while first may still be processing)
      await recPage.page.waitForTimeout(500);
      await recPage.uploadFile("label-test-02.jpg");

      // Wait for processing to complete
      await recPage.waitForProcessing();

      // Page should still be in a valid state
      const outcome = await recPage.getOutcome();
      expect(["results", "no-matches", "error"]).toContain(outcome);

      await recPage.screenshot("edge-rapid-uploads");
    });
  });

  test.describe("Bottle Log — Edge Cases", () => {
    let bottlePage: BottleLogPage;

    test.beforeEach(async ({ page }) => {
      bottlePage = new BottleLogPage(page);
      await bottlePage.goto();
    });

    test("Non-wine image on bottle log does not crash", async () => {
      await bottlePage.uploadLabel("not-wine.jpg");
      await bottlePage.waitForProcessing();

      const outcome = await bottlePage.getOutcome();
      expect(["confirm", "error"]).toContain(outcome);

      await bottlePage.screenshot("edge-not-wine-bottle");
    });

    test("Blank image on bottle log handled gracefully", async () => {
      await bottlePage.uploadLabel("blank-white.png");
      await bottlePage.waitForProcessing();

      const outcome = await bottlePage.getOutcome();
      expect(["confirm", "error"]).toContain(outcome);

      await bottlePage.screenshot("edge-blank-bottle");
    });

    test("Tiny image on bottle log handled gracefully", async () => {
      await bottlePage.uploadLabel("tiny-image.jpg");
      await bottlePage.waitForProcessing();

      const outcome = await bottlePage.getOutcome();
      expect(["confirm", "error"]).toContain(outcome);

      await bottlePage.screenshot("edge-tiny-bottle");
    });
  });

  test.describe("URL Fetch — Edge Cases", () => {
    let recPage: RecommendPage;

    test.beforeEach(async ({ page }) => {
      recPage = new RecommendPage(page);
      await recPage.goto();
    });

    test("Invalid URL shows error", async () => {
      await recPage.urlInput.fill("not-a-url");
      await recPage.urlFetchButton.click();

      // Should show validation error
      await expect(recPage.errorMessage).toBeVisible({ timeout: 5_000 });

      await recPage.screenshot("edge-invalid-url");
    });

    test("Non-existent URL shows error gracefully", async () => {
      await recPage.fetchUrl("https://this-domain-definitely-does-not-exist-xyz.com/wine-list");
      await recPage.waitForProcessing();

      // Should show error, not crash
      const outcome = await recPage.getOutcome();
      expect(["error"]).toContain(outcome);

      await recPage.screenshot("edge-nonexistent-url");
    });
  });
});
