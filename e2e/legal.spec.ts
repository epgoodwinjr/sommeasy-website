import { test, expect, type Page } from "@playwright/test";
import { BACKUP_RETENTION_DAYS, LEGAL_CONTACT, LEGAL_EFFECTIVE, LEGAL_OPERATOR, LEGAL_UPDATED, SIGNUP_CONSENT, SIGNUP_CONSENT_WITH_GOOGLE } from "../src/lib/legalCopy.js";

const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";

/**
 * The Privacy Policy and Terms (launch prep, Nov 2026): reachable from
 * Welcome's footer, sign in and Account; create account names both in its
 * consent line above the button. Read-only — nothing here writes.
 */

async function expectLegalLinks(page: Page, label: string) {
  const nav = page.getByTestId("legal-links");
  await expect(nav, `${label}: legal links`).toBeVisible({ timeout: 15_000 });
  await expect(nav.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(nav.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
}

test.describe("Privacy and Terms", () => {
  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("both pages render their sections, the contact address and the age rule", async ({ page }) => {
      for (const [path, id, title] of [["/privacy", "privacy-page", "Privacy"], ["/terms", "terms-page", "Terms"]]) {
        await page.goto(path);
        const main = page.getByTestId(id);
        await expect(main.getByRole("heading", { level: 1, name: title })).toBeVisible();
        await expect(main.getByRole("heading", { level: 2 }).first()).toBeVisible();
        await expect(main.locator(`a[href="mailto:${LEGAL_CONTACT}"]`).first()).toBeVisible();
        await expect(main).toContainText("21 in the United States");
        // Who runs it, and when the text takes effect (launch prep Session 2b)
        await expect(main.getByRole("heading", { level: 2 }).first()).toContainText("Who we are");
        await expect(main).toContainText(LEGAL_OPERATOR);
        await expect(main.getByTestId("legal-dates")).toHaveText(`Effective ${LEGAL_EFFECTIVE} · Last updated ${LEGAL_UPDATED}`);
      }
    });

    test("the Terms follow Pennsylvania law; the policy says what Do Not Track changes and how long backups live", async ({ page }) => {
      await page.goto("/terms");
      await expect(page.getByTestId("terms-page")).toContainText("governed by the laws of the Commonwealth of Pennsylvania");
      await page.goto("/privacy");
      const privacy = page.getByTestId("privacy-page");
      await expect(privacy).toContainText("Do Not Track");
      await expect(privacy).toContainText(`keep each one for ${BACKUP_RETENTION_DAYS} days`);
      // The fonts are self-hosted now: the policy no longer names Google Fonts
      await expect(privacy).not.toContainText("Google Fonts");
    });

    test("Welcome's footer and sign in link to both pages", async ({ page }) => {
      await page.goto("/");
      await expectLegalLinks(page, "Welcome");
      await page.getByTestId("legal-links").getByRole("link", { name: "Terms" }).click();
      await expect(page).toHaveURL(/\/terms$/);
      await expect(page.getByTestId("terms-page")).toBeVisible();

      await page.goto("/login");
      await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
      await expectLegalLinks(page, "sign in");
    });

    test("create account says what it agrees to ONCE, above both ways in, with both links", async ({ page }) => {
      await page.goto("/signup");
      await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
      // One line, whatever the Google flag: worded for both ways in when
      // Google is on, and exactly as before when it's off
      const copy = GOOGLE_ON ? SIGNUP_CONSENT_WITH_GOOGLE : SIGNUP_CONSENT;
      const consent = page.getByTestId("signup-consent");
      await expect(consent).toHaveCount(1);
      await expect(page.getByTestId("google-consent")).toHaveCount(0);
      await expect(page.getByText("legal drinking age")).toHaveCount(1);
      await expect(consent).toHaveText(copy.lead + copy.terms + copy.and + copy.privacy + copy.end);
      if (!GOOGLE_ON) {
        await expect(consent).toHaveText(
          "By creating an account you confirm you’re of legal drinking age where you live and agree to our Terms and Privacy Policy."
        );
      }
      await expect(consent.getByRole("link", { name: copy.terms })).toHaveAttribute("href", "/terms");
      await expect(consent.getByRole("link", { name: copy.privacy })).toHaveAttribute("href", "/privacy");
      // Above the button, not after it — and so above Continue with Google
      const consentBox = await consent.boundingBox();
      const buttonBox = await page.locator('button[type="submit"]').boundingBox();
      expect(consentBox!.y + consentBox!.height).toBeLessThanOrEqual(buttonBox!.y);
      if (GOOGLE_ON) {
        const googleBox = await page.getByRole("button", { name: "Continue with Google" }).boundingBox();
        expect(consentBox!.y + consentBox!.height).toBeLessThanOrEqual(googleBox!.y);
      }
    });
  });

  test("Account links to both pages", async ({ page }) => {
    await page.goto("/account");
    await expectLegalLinks(page, "Account");
  });
});
