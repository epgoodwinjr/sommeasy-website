import { test, expect } from "@playwright/test";

/**
 * Account — Sign out (The House List, Phase 2: Sign out moved here from
 * home's header). Hard-fail: the "✓ Signed out" landing must mean the
 * sign-out really happened, and a failed sign-out must say so and stay.
 *
 * The logout request is ALWAYS intercepted (the auth-flows pattern): a real
 * call signs out with scope=global and would revoke the test account's
 * sessions for every spec after this one. Intercepted, it clears only this
 * test's own browser context.
 */

test.describe("Account — Sign out (hard-fail)", () => {
  test("signing out lands on /login with the notice", async ({ page }) => {
    await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204, body: "" }));
    await page.goto("/account");
    const signOut = page.getByTestId("account-signout");
    await expect(signOut).toBeVisible({ timeout: 15_000 });
    // An inner page: the running head and the service bar (decision D1)
    await expect(page.getByTestId("running-head")).toBeVisible();
    await expect(page.getByTestId("service-bar")).toBeVisible();

    await signOut.click();
    await page.waitForURL("/login?notice=signed_out", { timeout: 15_000 });
    await expect(page.getByTestId("auth-notice")).toHaveText("✓ Signed out");
  });

  test("a failed sign-out says so and stays — never a false notice", async ({ page }) => {
    await page.route("**/auth/v1/logout**", (route) => route.abort());
    await page.goto("/account");
    const signOut = page.getByTestId("account-signout");
    await expect(signOut).toBeVisible({ timeout: 15_000 });

    await signOut.click();
    await expect(page.getByTestId("account-signout-error")).toContainText("We couldn't sign you out just now");
    await expect(page).toHaveURL(/\/account$/);
    await expect(signOut).toBeEnabled();
  });
});
