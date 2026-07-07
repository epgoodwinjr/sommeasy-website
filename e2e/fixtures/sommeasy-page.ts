import { type Page, type Locator, expect } from "@playwright/test";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "images");

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
  }

  async goto() {
    await this.page.goto("/recommend");
  }

  /** Upload a file from e2e/fixtures/images/ by filename */
  async uploadFile(filename: string) {
    const filePath = path.join(FIXTURES_DIR, filename);
    await this.fileInput.setInputFiles(filePath);
  }

  /** Wait for Vision API processing to complete (spinner appears then disappears) */
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

  /** Fetch wine list from a URL */
  async fetchUrl(url: string) {
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
 * Page Object Model for the home page's Log a Bottle feature.
 */
export class BottleLogPage {
  readonly page: Page;

  readonly galleryInput: Locator;
  readonly cameraInput: Locator;
  readonly processingState: Locator;
  readonly confirmState: Locator;
  readonly wineNameInput: Locator;
  readonly errorState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.galleryInput = page.locator('[data-testid="bottle-gallery-input"]');
    this.cameraInput = page.locator('[data-testid="bottle-camera-input"]');
    this.processingState = page.locator('[data-testid="bottle-processing"]');
    this.confirmState = page.locator('[data-testid="bottle-confirm"]');
    this.wineNameInput = page.locator('[data-testid="bottle-wine-name"]');
    this.errorState = page.locator('[data-testid="bottle-error"]');
  }

  async goto() {
    await this.page.goto("/");
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
