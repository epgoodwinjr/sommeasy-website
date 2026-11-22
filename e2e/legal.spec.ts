import { test, expect, type Page } from "@playwright/test";
import { LEGAL_CONTACT, SIGNUP_CONSENT } from "../src/lib/legalCopy.js";

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
      }
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

    test("create account says what it agrees to, above the button, with both links", async ({ page }) => {
      await page.goto("/signup");
      await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
      const consent = page.getByTestId("signup-consent");
      await expect(consent).toHaveText(
        SIGNUP_CONSENT.lead + SIGNUP_CONSENT.terms + SIGNUP_CONSENT.and + SIGNUP_CONSENT.privacy + SIGNUP_CONSENT.end
      );
      await expect(consent.getByRole("link", { name: SIGNUP_CONSENT.terms })).toHaveAttribute("href", "/terms");
      await expect(consent.getByRole("link", { name: SIGNUP_CONSENT.privacy })).toHaveAttribute("href", "/privacy");
      // Above the button, not after it
      const consentBox = await consent.boundingBox();
      const buttonBox = await page.locator('button[type="submit"]').boundingBox();
      expect(consentBox!.y + consentBox!.height).toBeLessThanOrEqual(buttonBox!.y);
    });
  });

  test("Account links to both pages", async ({ page }) => {
    await page.goto("/account");
    await expectLegalLinks(page, "Account");
  });
});
