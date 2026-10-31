import { test, expect } from "@playwright/test";
import { RecommendPage } from "./fixtures/sommeasy-page";
import path from "path";

const FIXTURES = path.join(__dirname, "fixtures", "images");

// Hard-fail guard for the multi-page scan's failure path (PR #21, ported to
// The House List's Match & picks). Another page reads in the full-screen
// reading view and commits nothing until it reads, so a failure lands back
// on the picks exactly as they were — and it must SAY so, beside the control
// that retries it (`add-page-error`), never vanish: on the old page the
// results view never rendered the error, so a timeout, the rate limit, a
// 422, or a no-list scan all looked like a page that simply never arrived.
// tiny-image.jpg is the dependable page-2 failure: since PR #20 it always
// ends in a branded no_wines error (empty wines, or the not-a-list gate).
// WHICH copy appears is deliberately not asserted — only that the route's
// own error reaches the screen and the page-1 picks survive it.
test.describe("Multi-page scan — a failed page is never invisible", () => {
  test("page-2 failure shows inline, keeps page-1 picks, clears on retry and Scan Again", async ({ page }) => {
    // A PDF scan + The Somm's worst legitimate case (~120s, see
    // wine-lists.spec.ts) + one page-2 Vision call
    test.setTimeout(300_000);
    const recPage = new RecommendPage(page);
    await recPage.goto();

    // ── Page 1: real picks on screen ──
    await recPage.uploadFile("winelist-sample.pdf");
    await recPage.waitForProcessing(90_000);
    await expect(recPage.resultsHeading).toHaveText("Your picks");
    // Let The Somm settle first: its re-curation replaces the picks, which
    // would read as the page-2 failure touching them
    await expect
      .poll(async () => page.locator('[data-testid="somm-thinking"]').count(), { timeout: 130_000 })
      .toBe(0);
    const picksBefore = await recPage.getPickNames();
    expect(picksBefore.length).toBeGreaterThan(0); // hard: this list matches the rich fixture

    // ── Page 2 fails — through the real button and its hidden input ──
    const addAnotherPage = page.getByRole("button", { name: /Add another page/ });
    const addPageError = page.locator('[data-testid="add-page-error"]');

    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), addAnotherPage.click()]);
    expect(await chooser.element().getAttribute("data-testid")).toBe("file-input-add-page");

    const page2Response = page.waitForResponse((r) => r.url().includes("/api/parse-wine-list"), { timeout: 90_000 });
    await chooser.setFiles(path.join(FIXTURES, "tiny-image.jpg"));
    // Another page reads where the first one did: the full-screen reading view
    await expect(recPage.processingSpinner, "page 2 reads in the reading view").toBeVisible();
    const body = await (await page2Response).json();
    expect(body.error, `page 2 must fail through the route; got ${JSON.stringify(body).slice(0, 200)}`).toBeTruthy();
    test.info().annotations.push({ type: "page-2 errorType", description: String(body.errorType) });

    await expect(addPageError, "the route's error must reach the picks").toBeVisible();
    await expect(addPageError).toHaveText(body.error);
    await expect(recPage.processingSpinner).toHaveCount(0);
    await expect(addAnotherPage).toBeVisible();
    await expect(recPage.resultsHeading).toHaveText("Your picks");
    expect(await recPage.getPickNames(), "a failed page must not touch the page-1 picks").toEqual(picksBefore);
    await recPage.screenshot("multi-page-scan-page2-error");

    // ── The next attempt clears it ──
    const firstError = (await addPageError.textContent()) || "";
    const [retry] = await Promise.all([page.waitForEvent("filechooser"), addAnotherPage.click()]);
    await expect(addPageError, "a new attempt starts clean").toHaveCount(0);
    // An oversized file fails client-side (no paid call): a second, fresh
    // error for Scan Again to clear
    await retry.setFiles({ name: "too-big.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(addPageError).toBeVisible();
    await expect(addPageError).not.toHaveText(firstError);
    await expect(addAnotherPage).toBeVisible();
    expect(await recPage.getPickNames()).toEqual(picksBefore);

    // ── Scan Again clears it ──
    await recPage.scanAgainButton.click();
    await expect(recPage.scanButton).toBeVisible();
    await expect(addPageError).toHaveCount(0);
    await expect(recPage.errorMessage, "the stale page error must not follow into a fresh sitting").toHaveCount(0);
  });
});
