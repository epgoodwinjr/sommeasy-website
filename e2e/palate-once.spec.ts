import { test, expect, type Page, type Browser } from "@playwright/test";
import { testDb, countEvents } from "./fixtures/test-db";

/**
 * HARD-FAIL GUARD — the waiting palate is folded in EXACTLY ONCE (launch
 * prep, Nov 2026).
 *
 * Production, Nov 12–17, 2026: one account wrote 23 quiz_completed
 * "restore" events in five bursts. The account-side carrier
 * (user_metadata.pending_palate) was cleared only at the end of the save,
 * ~15s behind the event; every reload in between folded the quiz in again.
 * palate-handoff's guards B and C never saw it — each loads, waits, reloads
 * once, and its restores come in the expected pairs.
 *
 * This guard reproduces the shape that broke: BOTH carriers (a same-browser
 * signup), a second device signed in BEFORE the fold-in (its cached session
 * still carries the palate), and a reload the instant the profile write
 * lands — inside the window production's reloads hit. Then: exactly ONE
 * restore event; the carrier gone from the real auth record; and more
 * loads of "/", a second tab and the second device write ZERO further
 * quiz_completed rows and never show the welcome-back line.
 *
 * Data discipline: answers are a SUBSET of the account's seeded founding
 * answers (the palate-handoff discipline), so every fold-in is
 * content-identical and the fixture never drifts. wine_events is
 * append-forever: deltas only. afterEach clears a carrier a dead run left.
 */

const STASH_KEY = "sommeasy.pendingPalate";
const SEED_SUBSET_ANSWERS = {
  countries: ["south_africa", "france"],
  regions: { south_africa: ["stellenbosch"], france: ["burgundy"] },
  estates: { stellenbosch: ["kanonkop"] },
  varietals: ["pinot_noir", "chardonnay"],
  specificWines: [],
};

async function signIn(page: Page, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
  await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
  await page.locator('button[type="submit"]').click();
}

/** A plain signed-in landing: the profile, and no welcome-back line. */
async function expectPlainLanding(page: Page, label: string) {
  await expect(page.getByTestId("palate-strip"), `${label}: the profile renders`).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("welcome-back"), `${label}: no welcome-back`).toHaveCount(0);
}

/** Count what a page writes for the fold-in: profile saves and claims. A
 *  plain landing must make neither — a refold, even one that loses the
 *  claim and records nothing, is a whole quiz save on every load. */
function watchFoldWrites(page: Page) {
  const seen: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (req.method() === "POST" && url.includes("/rest/v1/wine_profiles")) seen.push("profile write");
    if (url.includes("/rest/v1/rpc/claim_pending_palate")) seen.push("claim");
  });
  return seen;
}

async function newSignedOutContext(browser: Browser) {
  return browser.newContext({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });
}

test.describe("The waiting palate is folded in once", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.afterEach(async () => {
    // Self-healing: a run that died before the fold-in must not leave the
    // carrier for the next spec's landing to fold
    const { supabase } = await testDb();
    await supabase.auth.updateUser({ data: { pending_palate: null } });
  });

  test("HARD-FAIL GUARD: a reload mid-fold, a stale second device and a second tab fold it in exactly once", async ({ page, browser }) => {
    test.setTimeout(150_000);
    expect(process.env.TEST_USER_EMAIL, "TEST_USER_EMAIL missing").toBeTruthy();
    const { supabase, userId } = await testDb();
    const before = await countEvents(supabase, userId, "quiz_completed");

    // The account-side carrier, as a signup leaves it
    const createdAt = Date.now();
    const { error: seedErr } = await supabase.auth.updateUser({
      data: { pending_palate: { version: 1, createdAt, answers: SEED_SUBSET_ANSWERS } },
    });
    expect(seedErr, `seeding pending_palate failed: ${seedErr?.message}`).toBeNull();

    // Device B signs in NOW — to the journal, not "/", so it folds nothing —
    // and its cached session keeps the palate the fold-in will clear
    const deviceB = await newSignedOutContext(browser);
    const pageB = await deviceB.newPage();
    await signIn(pageB, "/journal");
    await pageB.waitForURL(/\/journal/, { timeout: 15_000 });

    // Device A: the local stash too (a same-browser signup carries both)
    await page.goto("/login");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await page.evaluate(
      ([key, answers, at]) =>
        window.localStorage.setItem(key as string, JSON.stringify({ version: 1, createdAt: at, answers, profile: null })),
      [STASH_KEY, SEED_SUBSET_ANSWERS, createdAt] as const
    );

    // The production window: reload the instant the profile write lands,
    // while the rest of the fold-in is still running
    const profileWrite = page.waitForResponse(
      (r) => r.url().includes("/rest/v1/wine_profiles") && r.request().method() === "POST",
      { timeout: 30_000 }
    );
    await signIn(page);
    await page.waitForURL("/", { timeout: 15_000 });
    expect((await profileWrite).ok(), "the fold-in's profile write must land").toBe(true);
    await page.reload();

    // The reloaded page finishes whatever the first one didn't
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 30_000 });
    let welcomes = await page.getByTestId("welcome-back").count();

    // Exactly ONE restore event — never none (the claim records it in the
    // same transaction, so a reload can't lose it), never two
    await expect
      .poll(async () => (await countEvents(supabase, userId, "quiz_completed")) - before, { timeout: 20_000 })
      .toBe(1);

    // The carrier is gone from the real auth record, and the stash from A
    const { data: truth } = await supabase.auth.getUser();
    expect(truth.user?.user_metadata?.pending_palate ?? null, "the account-side carrier must be cleared").toBeNull();
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STASH_KEY), "the local stash must be cleared").toBeNull();

    // From here on, every landing is plain: no profile write, no claim
    const writesA = watchFoldWrites(page);

    // More loads of "/" — quick ones, back to back
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await expectPlainLanding(page, `reload ${i + 1}`);
    }
    // A second tab of the same browser
    const tab2 = await page.context().newPage();
    const writesTab2 = watchFoldWrites(tab2);
    await tab2.goto("/");
    await expectPlainLanding(tab2, "second tab");
    // Device B, whose cached session still says a palate is waiting
    const writesB = watchFoldWrites(pageB);
    await pageB.goto("/");
    await expectPlainLanding(pageB, "second device (stale session)");
    await pageB.reload();
    await expectPlainLanding(pageB, "second device, reloaded");

    // The welcome-back line was shown at most once, on the load that folded
    // it in — and the ledger gained nothing after that one row
    expect(welcomes, "welcome-back at most once").toBeLessThanOrEqual(1);
    expect(writesA, "reloads of the device that folded it in write nothing").toEqual([]);
    expect(writesTab2, "a second tab writes nothing").toEqual([]);
    expect(writesB, "a device whose cached session predates the fold-in asks the server and writes nothing").toEqual([]);
    await page.waitForTimeout(3_000); // let any fire-and-forget write land
    expect((await countEvents(supabase, userId, "quiz_completed")) - before, "no further quiz_completed rows").toBe(1);

    await tab2.close();
    await deviceB.close();
  });
});
