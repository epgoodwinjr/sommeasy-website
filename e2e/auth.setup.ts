import { test as setup, expect } from "@playwright/test";

/**
 * Logs into Sommeasy and saves the authenticated browser state.
 * All other tests reuse this state so they don't need to log in individually.
 *
 * Set these env vars before running tests:
 *   TEST_USER_EMAIL    — a real Supabase account email
 *   TEST_USER_PASSWORD — the account's password
 *
 * Or create a .env.test file in the project root.
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing TEST_USER_EMAIL or TEST_USER_PASSWORD env vars.\n" +
      "Set them before running tests:\n" +
      "  TEST_USER_EMAIL=you@example.com TEST_USER_PASSWORD=yourpass npm run test:e2e"
    );
  }

  await page.goto("/login");

  // Fill in email and password
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to home page after successful login
  await page.waitForURL("/", { timeout: 15_000 });

  // Verify we're logged in — home page should show user content
  await expect(page.locator("text=Sign Out")).toBeVisible({ timeout: 10_000 });

  // Save the authenticated state
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
