import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import { testDb } from "./fixtures/test-db";

/**
 * Account (The House List §8.8) — Sign out since Phase 2; You, At the table,
 * Your data and Delete account since Phase 6. Hard-fail.
 *
 * Interception rules (never loosen them):
 *  - /auth/v1/logout is ALWAYS intercepted: a real call signs out with
 *    scope=global and would revoke the test account's sessions for every
 *    spec after this one. Intercepted, it clears only this test's context.
 *  - /api/account/delete is ALWAYS intercepted — the real route is never
 *    called from e2e, against any account (README §11).
 *  - /auth/v1/recover is intercepted: a real call emails the test inbox.
 * The two real writes here — the name (user_metadata) and the table
 * settings (wine_profiles.preferences) — snapshot first and restore in
 * afterEach (a finally doesn't run when a test times out). The preferences
 * matter most: every /recommend spec reads Tonight's terms from them.
 */

const DELETE_FAILED = "We couldn’t close your account just now. Give it a minute and try again.";

async function openAccount(page: Page) {
  await page.goto("/account");
  await expect(page.getByTestId("account-signout")).toBeVisible({ timeout: 15_000 });
}

/** A minimal RFC 4180 reader for the export (quoted commas and line breaks) */
function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r" && body[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

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

test.describe("Account — You, At the table, Your data (hard-fail)", () => {
  let restore: null | (() => Promise<void>) = null;

  test.afterEach(async () => {
    if (restore) await restore();
    restore = null;
  });

  test("three sections — You, At the table, Your data — and no Notifications (D7)", async ({ page }) => {
    await openAccount(page);
    const heads = page.locator("main section h2");
    await expect(heads).toHaveText([/You/, /At the table/, /Your data/]);
    await expect(page.getByText("Notifications")).toHaveCount(0);
    await expect(page.getByTestId("account-email")).toContainText(process.env.TEST_USER_EMAIL!);
    await expect(page.getByTestId("account-refine")).toHaveAttribute("href", "/?quiz=refine");
  });

  test("the name edits in place and saves to user_metadata — Enter saves, Escape doesn't", async ({ page }) => {
    const { supabase } = await testDb();
    const { data: before } = await supabase.auth.getUser();
    const original = before.user?.user_metadata?.name ?? null;
    restore = async () => {
      await supabase.auth.updateUser({ data: { name: original } });
    };

    await openAccount(page);
    const row = page.getByTestId("account-name");
    const line = row.getByRole("button", { name: /^Name/ });
    const input = page.getByTestId("account-name-input");

    // Escape closes without saving, focus back on the row
    await line.click();
    await expect(input).toBeFocused();
    await input.fill("Not Saved");
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(line).toBeFocused();
    await expect(row).not.toContainText("Not Saved");

    // Enter saves — through supabase.auth.updateUser, for real
    await line.click();
    await input.fill("  E2E Taster  ");
    await input.press("Enter");
    await expect(row).toContainText("E2E Taster");
    await expect(page.getByTestId("account-name-heading")).toHaveText("E2E Taster");
    await expect
      .poll(async () => (await supabase.auth.getUser()).data.user?.user_metadata?.name, { timeout: 15_000 })
      .toBe("E2E Taster");
    // …and the page reads it back after a reload
    await page.reload();
    await expect(page.getByTestId("account-name-heading")).toHaveText("E2E Taster", { timeout: 15_000 });

    // Tab (a blur) saves too — and focus goes where the Tab sent it, not back
    await line.click();
    await input.fill("E2E Taster Too");
    await input.press("Tab");
    await expect(row).toContainText("E2E Taster Too");
    await expect(page.getByTestId("account-password").getByRole("button", { name: /Password/ })).toBeFocused();
    await expect
      .poll(async () => (await supabase.auth.getUser()).data.user?.user_metadata?.name, { timeout: 15_000 })
      .toBe("E2E Taster Too");
  });

  test("Password › Change sends the reset link to the account's own address", async ({ page }) => {
    let recover: { url: string; body: any } | null = null;
    await page.route("**/auth/v1/recover**", async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
      recover = { url: route.request().url(), body: route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await openAccount(page);
    await page.getByTestId("account-password").getByRole("button", { name: /Password/ }).click();
    await expect(page.getByText("✓ Check your inbox — a reset link is on its way")).toBeVisible({ timeout: 15_000 });
    expect(recover, "the reset email request").not.toBeNull();
    expect(recover!.body.email).toBe(process.env.TEST_USER_EMAIL);
    expect(decodeURIComponent(recover!.url)).toContain("/api/auth/callback?next=/update-password");
  });

  test("At the table saves to the profile — and Tonight's terms on Match start from it (D8)", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const { data: profile } = await supabase.from("wine_profiles").select("preferences").eq("user_id", userId).single();
    const snapshot = profile!.preferences ?? {};
    restore = async () => {
      await supabase.from("wine_profiles").update({ preferences: snapshot }).eq("user_id", userId);
    };
    // Start from nothing set, so every value below is this test's own
    await supabase.from("wine_profiles").update({ preferences: {} }).eq("user_id", userId);

    await openAccount(page);
    const spend = page.getByTestId("account-spend");
    const color = page.getByTestId("account-color");
    await expect(spend).toContainText("Not set");
    await expect(color).toContainText("All wines");

    // Usual spend: the amount pair opens in place and saves as focus leaves
    // it — a reversed pair saves the way it was meant
    await spend.getByRole("button", { name: /Usual spend/ }).click();
    await expect(page.getByLabel("Usual spend, from")).toBeFocused();
    // Opening the pair and leaving it says nothing new — so nothing is written
    let profileWrites = 0;
    page.on("request", (req) => {
      if (req.method() === "PATCH" && req.url().includes("/rest/v1/wine_profiles")) profileWrites++;
    });
    await page.getByLabel("Usual spend, from").press("Tab");
    await page.getByLabel("Usual spend, up to").press("Tab");
    await page.waitForTimeout(800);
    expect(profileWrites, "leaving the pair untouched must not write").toBe(0);
    await expect(spend).toContainText("Not set");
    await page.getByLabel("Usual spend, from").fill("90");
    await page.getByLabel("Usual spend, up to").fill("40");
    await page.getByLabel("Usual spend, up to").press("Tab");
    await expect(spend).toContainText("$40 – $90");
    await expect
      .poll(async () => (await supabase.from("wine_profiles").select("preferences").eq("user_id", userId).single()).data?.preferences?.spend,
        { timeout: 15_000 })
      .toEqual({ min: 40, max: 90 });

    // Color: the options open under the row; a tap saves
    await color.getByRole("button", { name: /Color/ }).click();
    await page.getByTestId("account-color-white").click();
    await expect(color).toContainText("Whites");
    await expect(page.getByTestId("account-color-white")).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(async () => (await supabase.from("wine_profiles").select("preferences").eq("user_id", userId).single()).data?.preferences?.color,
        { timeout: 15_000 })
      .toBe("white");

    // Both survive a reload…
    await page.reload();
    await expect(page.getByTestId("account-spend")).toContainText("$40 – $90", { timeout: 15_000 });
    await expect(page.getByTestId("account-color")).toContainText("Whites");

    // …and Match starts from them (the input only — nothing is analyzed)
    await page.goto("/recommend");
    await expect(page.getByTestId("scan-button")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("radio", { name: "White" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Lowest price")).toHaveValue("40");
    await expect(page.getByLabel("Highest price")).toHaveValue("90");
  });

  test("Export your journal downloads every row as a CSV", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const { data: rows } = await supabase.from("wine_interactions").select("wine_name").eq("user_id", userId);
    const names = (rows || []).map((r) => r.wine_name).sort();
    expect(names.length, "the rich fixture has a journal").toBeGreaterThan(0);

    await openAccount(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("account-export").getByRole("button", { name: /Export your journal/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^sommeasy-journal-\d{4}-\d{2}-\d{2}\.csv$/);
    const records = parseCsv(fs.readFileSync((await download.path())!, "utf8"));
    expect(records[0]).toEqual([
      "wine_name", "interaction_type", "rating", "note", "place", "occasion", "somm_pick_role", "somm_note",
      "resolved_winery", "resolved_region", "resolved_country", "resolved_varietal", "created_at", "updated_at",
    ]);
    expect(records.slice(1).map((r) => r[0]).sort(), "one record per journal row").toEqual(names);
    await expect(page.getByText("✓ Journal exported — check your downloads")).toBeVisible();
  });

  test("Start fresh asks first, in place (D2) — Cancel hands focus back", async ({ page }) => {
    await openAccount(page);
    const trigger = page.getByTestId("start-fresh");
    await trigger.click();
    const confirm = page.getByTestId("start-fresh-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeFocused();
    await expect(confirm.getByRole("link", { name: "Start fresh" })).toHaveAttribute("href", "/?quiz=fresh");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test.describe("Account — Delete account (hard-fail; the route is ALWAYS intercepted)", () => {
  test("asks first; while it runs, every control waits; a failure says so and keeps the account", async ({ page }) => {
    let logoutCalls = 0;
    await page.route("**/auth/v1/logout**", (route) => { logoutCalls++; return route.fulfill({ status: 204, body: "" }); });
    let deleteRequest: { method: string; type: string | null; body: string | null } | null = null;
    await page.route("**/api/account/delete", async (route) => {
      deleteRequest = {
        method: route.request().method(),
        type: route.request().headers()["content-type"] ?? null,
        body: route.request().postData(),
      };
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "x" }) });
    });

    await openAccount(page);
    const trigger = page.getByTestId("account-delete");
    await trigger.click();
    const confirm = page.getByTestId("account-delete-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeFocused();
    await expect(confirm).toContainText(
      "Delete your account? This removes your palate, your journal and every bottle you’ve rated — for good."
    );
    // Keep my account closes it, focus back on the trigger, nothing sent
    await confirm.getByRole("button", { name: "Keep my account" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(deleteRequest).toBeNull();

    await trigger.click();
    await confirm.getByRole("button", { name: "Delete everything" }).click();
    // Pending: "Deleting…", every control disabled
    await expect(confirm.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    await expect(confirm.getByRole("button", { name: "Keep my account" })).toBeDisabled();
    await expect(page.getByTestId("account-signout")).toBeDisabled();
    // The failure lands in the confirm, focused; the account stays
    const alert = confirm.getByRole("alert");
    await expect(alert).toHaveText(DELETE_FAILED, { timeout: 15_000 });
    await expect(alert).toBeFocused();
    await expect(confirm.getByRole("button", { name: "Delete everything" })).toBeEnabled();
    await expect(page).toHaveURL(/\/account$/);
    expect(logoutCalls, "a failed delete never signs out").toBe(0);
    // The request: a POST of JSON, carrying no id (the route reads only the session)
    expect(deleteRequest!.method).toBe("POST");
    expect(deleteRequest!.type).toContain("application/json");
    expect(JSON.parse(deleteRequest!.body || "{}")).toEqual({});
  });

  test("success signs out, forgets this device's sommeasy.* keys, and lands on the closed-account line", async ({ page }) => {
    await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204, body: "" }));
    await page.route("**/api/account/delete", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    );
    await openAccount(page);
    await page.evaluate(() => {
      window.localStorage.setItem("sommeasy.recentSearches", JSON.stringify(["chenin"]));
      window.localStorage.setItem("sommeasy.verdictDismissed", JSON.stringify([]));
      window.localStorage.setItem("someone-else.key", "stays");
    });

    await page.getByTestId("account-delete").click();
    await page.getByTestId("account-delete-confirm").getByRole("button", { name: "Delete everything" }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
    await expect(page.getByTestId("welcome-notice")).toHaveText("Your account is closed. Everything in it is gone.",
      { timeout: 15_000 });
    // Signed out: the Welcome screen, and the notice left the address
    await expect(page.getByRole("button", { name: "Build My Profile" })).toBeVisible();
    await expect(page).toHaveURL((url) => url.search === "");
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys.filter((k) => k.startsWith("sommeasy.")), "every sommeasy.* key forgotten").toEqual([]);
    expect(keys).toContain("someone-else.key");
  });
});
