import { test, expect } from "@playwright/test";
import { RecommendPage, BottleLogPage } from "./fixtures/sommeasy-page";
import { MAX_REQUESTS, RATE_LIMIT_MESSAGE } from "../src/lib/rateLimit.js";

// The scan specs' harness guard. Their outcome checks accept "error" (a tiny
// or blank image legitimately fails), and our limiter's 429 renders as an
// ordinary error message — so a live limiter turned them vacuously green.
// playwright.config.ts launches `next dev` with E2E_DISABLE_RATE_LIMIT=1, and
// getOutcome() refuses to classify a page that saw a 429 from our API. These
// tests pin both halves, without spending a Claude call.

test.describe("Rate limit — never a silent outcome in e2e", () => {
  test("the e2e dev server never throttles", async ({ request }) => {
    // The empty-body 400 comes from the route AFTER the limiter lets the
    // request through, so MAX_REQUESTS + 1 of them prove the bypass. They go
    // back to back on purpose: any `next dev` compile resets the limiter's
    // in-memory window, which is why scan-heavy runs only throttle sometimes.
    for (let i = 1; i <= MAX_REQUESTS + 1; i++) {
      const res = await request.post("/api/parse-wine-list", { data: {} });
      expect(
        res.status(),
        `request ${i} was throttled — this dev server isn't running with E2E_DISABLE_RATE_LIMIT=1. ` +
          "Playwright reuses whatever already listens on :3000: stop it, or restart it with " +
          "`E2E_DISABLE_RATE_LIMIT=1 npm run dev`."
      ).not.toBe(429);
      expect(res.status(), `request ${i}: want the route's own empty-body 400`).toBe(400);
    }
  });

  test("a throttled menu scan fails the outcome check", async ({ page }) => {
    await page.route("**/api/parse-wine-list", (route) =>
      route.fulfill({ status: 429, json: { error: RATE_LIMIT_MESSAGE, errorType: "rate_limited" } })
    );
    const recPage = new RecommendPage(page);
    await recPage.goto();
    await recPage.uploadFile("tiny-image.jpg");
    await recPage.waitForProcessing();

    // Premise: the 429 renders as an ordinary error — the vacuous green
    await expect(recPage.errorMessage).toHaveText(RATE_LIMIT_MESSAGE);
    await expect(recPage.getOutcome()).rejects.toThrow(/429/);
  });

  test("a throttled label scan fails the outcome check", async ({ page }) => {
    await page.route("**/api/scan-label", (route) =>
      route.fulfill({ status: 429, json: { error: RATE_LIMIT_MESSAGE } })
    );
    const bottlePage = new BottleLogPage(page);
    await bottlePage.goto();
    await bottlePage.uploadLabel("tiny-image.jpg");
    await bottlePage.waitForProcessing();

    await expect(bottlePage.errorState).toHaveText(RATE_LIMIT_MESSAGE);
    await expect(bottlePage.getOutcome()).rejects.toThrow(/429/);
  });
});
