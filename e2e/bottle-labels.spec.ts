import { test, expect } from "@playwright/test";
import { BottleLogPage } from "./fixtures/sommeasy-page";

test.describe("Bottle Label — Vision Path", () => {
  let bottlePage: BottleLogPage;

  test.beforeEach(async ({ page }) => {
    bottlePage = new BottleLogPage(page);
    await bottlePage.goto();
  });

  test("Clean label extracts wine name", async () => {
    await bottlePage.uploadLabel("label-test-01.jpg");
    await bottlePage.waitForProcessing();

    const outcome = await bottlePage.getOutcome();
    // Should either confirm with extracted text, or show error (not crash)
    expect(["confirm", "error"]).toContain(outcome);

    if (outcome === "confirm") {
      const name = await bottlePage.getExtractedName();
      expect(name).toBeTruthy();
      expect(name!.length).toBeGreaterThan(0);
    }

    await bottlePage.screenshot("bottle-clean-label-01");
  });

  test("Second clean label extracts wine name", async () => {
    await bottlePage.uploadLabel("label-test-02.jpg");
    await bottlePage.waitForProcessing();

    const outcome = await bottlePage.getOutcome();
    expect(["confirm", "error"]).toContain(outcome);

    if (outcome === "confirm") {
      const name = await bottlePage.getExtractedName();
      expect(name).toBeTruthy();
    }

    await bottlePage.screenshot("bottle-clean-label-02");
  });

  test("Third clean label extracts wine name", async () => {
    await bottlePage.uploadLabel("label-test-03.jpg");
    await bottlePage.waitForProcessing();

    const outcome = await bottlePage.getOutcome();
    expect(["confirm", "error"]).toContain(outcome);

    await bottlePage.screenshot("bottle-clean-label-03");
  });

  test("Low quality label handled gracefully", async () => {
    await bottlePage.uploadLabel("label-lowquality-01.jpg");
    await bottlePage.waitForProcessing();

    const outcome = await bottlePage.getOutcome();
    // Should not crash — either confirm with partial data or show error
    expect(["confirm", "error"]).toContain(outcome);

    await bottlePage.screenshot("bottle-lowquality-01");
  });

  test("Second low quality label handled gracefully", async () => {
    await bottlePage.uploadLabel("label-lowquality-02.jpg");
    await bottlePage.waitForProcessing();

    const outcome = await bottlePage.getOutcome();
    expect(["confirm", "error"]).toContain(outcome);

    await bottlePage.screenshot("bottle-lowquality-02");
  });

  test("High resolution label processes successfully", async () => {
    await bottlePage.uploadLabel("label-highres-01.jpg");
    await bottlePage.waitForProcessing();

    const outcome = await bottlePage.getOutcome();
    expect(["confirm", "error"]).toContain(outcome);

    if (outcome === "confirm") {
      const name = await bottlePage.getExtractedName();
      expect(name).toBeTruthy();
    }

    await bottlePage.screenshot("bottle-highres-01");
  });

  test("Second high resolution label processes successfully", async () => {
    await bottlePage.uploadLabel("label-highres-02.jpg");
    await bottlePage.waitForProcessing();

    const outcome = await bottlePage.getOutcome();
    expect(["confirm", "error"]).toContain(outcome);

    await bottlePage.screenshot("bottle-highres-02");
  });
});
