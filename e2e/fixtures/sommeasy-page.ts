import { type Page, type Locator, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "images");

/** A journal row by its exact stored name (rows carry data-wine). */
export function journalRow(page: Page, wineName: string): Locator {
  return page.locator(`[data-testid="journal-row"][data-wine=${JSON.stringify(wineName)}]`);
}

/**
 * Remove a journal row the way a user does (House List Phase 4): open it
 * from the journal's Tried tab, then "Remove from journal" on its wine page
 * and its in-place confirm (Phase 6) — the journal delete (delete first,
 * reverse only what that call removed, then journal_deleted). The page
 * steps back to the journal, which says so and no longer lists the bottle.
 * Every guard that cleans up a rating comes through here.
 */
export async function removeFromJournal(page: Page, wineName: string) {
  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible({ timeout: 15_000 });
  const row = journalRow(page, wineName);
  await expect(row).toBeVisible();
  await row.click();
  const wine = page.getByTestId("wine-page");
  await expect(wine.getByTestId("wine-remove")).toBeVisible({ timeout: 15_000 });
  await wine.getByTestId("wine-remove").click();
  // Remove asks first, in place (House List Phase 6)
  await wine.getByTestId("wine-remove-confirm").getByRole("button", { name: "Remove it" }).click();
  await page.waitForURL(/\/journal/, { timeout: 15_000 });
  await expect(page.getByText("Removed from your journal")).toBeVisible();
  // The heading renders once the rows are read — only then is "gone" real
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(journalRow(page, wineName)).toHaveCount(0);
}

/**
 * The failure-proof half of a guard's cleanup — call it from test.afterEach,
 * which Playwright runs after a failed OR timed-out test, on its own time
 * budget, with the page still open (a finally in the test body doesn't
 * survive a timeout). A test that dies right after the tap may leave the
 * upsert still landing, so the row gets a few seconds to appear; if it never
 * does, there's nothing to clean.
 */
export async function removeFromJournalIfPresent(
  page: Page, supabase: SupabaseClient, userId: string, wineName: string
) {
  const rowExists = async () => {
    const { data } = await supabase
      .from("wine_interactions")
      .select("id")
      .eq("user_id", userId)
      .eq("wine_name", wineName)
      .maybeSingle();
    return Boolean(data);
  };
  const deadline = Date.now() + 5_000;
  while (!(await rowExists())) {
    if (Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await removeFromJournal(page, wineName);
  await expect.poll(rowExists, { timeout: 15_000 }).toBe(false);
}

/**
 * Records every 429 our own API answers on this page. A throttled scan
 * renders as an ordinary error-message / bottle-error, and the scan specs'
 * outcome checks accept "error" — so a live rate limiter used to turn them
 * vacuously green. getOutcome() runs the returned check before classifying.
 */
function watchFor429s(page: Page): () => Promise<void> {
  const seen: Promise<string>[] = [];
  page.on("response", (res) => {
    const { pathname } = new URL(res.url());
    if (res.status() !== 429 || !pathname.startsWith("/api/")) return;
    seen.push(res.json().then((body) => `${pathname} → "${body?.error}"`, () => pathname));
  });
  return async () => {
    if (seen.length === 0) return;
    throw new Error(
      `${(await Promise.all(seen)).join("; ")}: a 429 from our API means this spec never ` +
        "exercised the path it tests. If that's the scan-limit copy, the dev server isn't running " +
        "with E2E_DISABLE_RATE_LIMIT=1 — Playwright reuses whatever already listens on :3000: " +
        "stop it, or restart it with `E2E_DISABLE_RATE_LIMIT=1 npm run dev`."
    );
  };
}

/**
 * Page Object Model for Sommeasy's /recommend page.
 * Encapsulates all interactions for the wine list scan/paste/URL flow.
 */
export class RecommendPage {
  readonly page: Page;

  // Input view
  readonly fileInput: Locator;
  readonly scanButton: Locator;
  readonly urlInput: Locator;
  readonly urlFetchButton: Locator;
  readonly pasteToggle: Locator;
  readonly wineListTextarea: Locator;
  readonly analyzeButton: Locator;

  // Processing
  readonly processingSpinner: Locator;

  // Results
  readonly resultsHeading: Locator;
  readonly picksContainer: Locator;
  readonly pickCards: Locator;
  readonly scanAgainButton: Locator;

  // Error
  readonly errorMessage: Locator;

  /** Throws if our API answered this page with a 429 (see watchFor429s) */
  readonly assertNo429s: () => Promise<void>;

  constructor(page: Page) {
    this.page = page;
    this.fileInput = page.locator('[data-testid="file-input-scan"]');
    this.scanButton = page.locator('[data-testid="scan-button"]');
    this.urlInput = page.locator('[data-testid="url-input"]');
    this.urlFetchButton = page.locator('[data-testid="url-fetch-button"]');
    this.pasteToggle = page.locator('[data-testid="paste-mode-toggle"]');
    this.wineListTextarea = page.locator('[data-testid="wine-list-textarea"]');
    this.analyzeButton = page.locator('[data-testid="analyze-button"]');
    this.processingSpinner = page.locator('[data-testid="processing-spinner"]');
    this.resultsHeading = page.locator('[data-testid="results-heading"]');
    this.picksContainer = page.locator('[data-testid="picks-container"]');
    this.pickCards = page.locator('[data-testid="pick-card"]');
    this.scanAgainButton = page.locator('[data-testid="scan-again-button"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
    this.assertNo429s = watchFor429s(page);
  }

  async goto() {
    await this.page.goto("/recommend");
  }

  /** Upload a file from e2e/fixtures/images/ by filename */
  async uploadFile(filename: string) {
    const filePath = path.join(FIXTURES_DIR, filename);
    await this.fileInput.setInputFiles(filePath);
  }

  /** Wait for the reading state to finish (processing-spinner — "The Somm is
   *  reading" since House List Phase 3 — appears, then gives way to the
   *  picks or the input with an error) */
  async waitForProcessing(timeoutMs = 60_000) {
    // Wait for spinner to appear (if not already visible)
    try {
      await this.processingSpinner.waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      // Spinner may already be gone if processing was fast
    }
    // Wait for spinner to disappear — this means processing is done
    await this.processingSpinner.waitFor({ state: "hidden", timeout: timeoutMs });
  }

  /** Check if results or error appeared after processing */
  async getOutcome(): Promise<"results" | "no-matches" | "error" | "unknown"> {
    await this.assertNo429s();
    // Check for error first
    if (await this.errorMessage.isVisible()) return "error";
    // Check for results heading
    if (await this.resultsHeading.isVisible()) {
      const text = await this.resultsHeading.textContent();
      if (text?.includes("No matches")) return "no-matches";
      return "results";
    }
    return "unknown";
  }

  /** Get the text content of the error message, if visible */
  async getErrorText(): Promise<string | null> {
    if (await this.errorMessage.isVisible()) {
      return await this.errorMessage.textContent();
    }
    return null;
  }

  /** Get the number of wine pick cards displayed */
  async getPickCount(): Promise<number> {
    return await this.pickCards.count();
  }

  /** Get wine names from pick cards */
  async getPickNames(): Promise<string[]> {
    const count = await this.pickCards.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const h3 = this.pickCards.nth(i).locator("h3");
      const text = await h3.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /** Paste wine list text and click analyze */
  async pasteAndAnalyze(text: string) {
    await this.pasteToggle.click();
    await this.wineListTextarea.fill(text);
    await this.analyzeButton.click();
  }

  /** Open "Paste a link" — the URL row is closed until it's asked for */
  async openLinkRow() {
    if (!(await this.urlInput.isVisible())) {
      await this.page.getByRole("button", { name: /Paste a link/ }).click();
    }
    await expect(this.urlInput).toBeVisible();
  }

  /** Fetch wine list from a URL */
  async fetchUrl(url: string) {
    await this.openLinkRow();
    await this.urlInput.fill(url);
    await this.urlFetchButton.click();
  }

  /** Reset to input view */
  async reset() {
    if (await this.scanAgainButton.isVisible()) {
      await this.scanAgainButton.click();
    }
  }

  /** Take a named screenshot */
  async screenshot(name: string) {
    await this.page.screenshot({
      path: `test-results/${name}.png`,
      fullPage: true,
    });
  }
}

/**
 * Page Object Model for Log a bottle (/log — moved out of home in The House
 * List, Phase 2). The label inputs keep their ids; a failed scan returns to
 * the find step with bottle-error, a read one lands on bottle-confirm.
 */
export class BottleLogPage {
  readonly page: Page;

  readonly galleryInput: Locator;
  readonly cameraInput: Locator;
  readonly processingState: Locator;
  readonly confirmState: Locator;
  readonly wineNameInput: Locator;
  readonly errorState: Locator;

  /** Throws if our API answered this page with a 429 (see watchFor429s) */
  readonly assertNo429s: () => Promise<void>;

  constructor(page: Page) {
    this.page = page;
    this.galleryInput = page.locator('[data-testid="bottle-gallery-input"]');
    this.cameraInput = page.locator('[data-testid="bottle-camera-input"]');
    this.processingState = page.locator('[data-testid="bottle-processing"]');
    this.confirmState = page.locator('[data-testid="bottle-confirm"]');
    this.wineNameInput = page.locator('[data-testid="bottle-wine-name"]');
    this.errorState = page.locator('[data-testid="bottle-error"]');
    this.assertNo429s = watchFor429s(page);
  }

  async goto() {
    await this.page.goto("/log");
    // The inputs mount once the session read settles — the find step is
    // the hydration signal
    await expect(this.page.getByTestId("log-find")).toBeVisible({ timeout: 15_000 });
  }

  /** Upload a bottle label image from fixtures */
  async uploadLabel(filename: string) {
    const filePath = path.join(FIXTURES_DIR, filename);
    await this.galleryInput.setInputFiles(filePath);
  }

  /** Wait for bottle OCR processing to finish */
  async waitForProcessing(timeoutMs = 60_000) {
    try {
      await this.processingState.waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      // May already be done
    }
    await this.processingState.waitFor({ state: "hidden", timeout: timeoutMs });
  }

  /** Get the extracted wine name, or null if not in confirm state */
  async getExtractedName(): Promise<string | null> {
    if (await this.confirmState.isVisible()) {
      return await this.wineNameInput.inputValue();
    }
    return null;
  }

  /** Check outcome after processing */
  async getOutcome(): Promise<"confirm" | "error" | "unknown"> {
    await this.assertNo429s();
    if (await this.confirmState.isVisible()) return "confirm";
    if (await this.errorState.isVisible()) return "error";
    return "unknown";
  }

  /** Take a named screenshot */
  async screenshot(name: string) {
    await this.page.screenshot({
      path: `test-results/${name}.png`,
      fullPage: true,
    });
  }
}
