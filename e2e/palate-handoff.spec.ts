import { test, expect } from "@playwright/test";
import { testDb } from "./fixtures/test-db";

/**
 * Never Lose a Palate — the anonymous quiz → signup handoff (Sessions 2+5).
 *
 * HARD-FAIL GUARDS (CLAUDE.md rule): spec A fails if the anonymous quiz
 * stops stashing its results — and, since The Velvet Rope (Aug 3), if the
 * teaser leaks the gated reading (epithet/narrative/signature line must be
 * absent from the render tree while the stash still carries the COMPLETE
 * profile); spec B fails if a signed-in landing stops
 * folding the localStorage stash into the account; spec C fails if a
 * signup that carried pending_palate METADATA stops restoring the palate —
 * the cross-device path the July 30 acceptance canary proved is the common
 * case (localStorage never survives a Hide My Email / in-app-browser
 * confirmation). Together they guard the exact seam that destroyed a real
 * user's results on July 29 and again on July 30. Do NOT make these
 * outcome-tolerant.
 *
 * Data discipline: specs B and C log into the dedicated e2e account with
 * answers that are a SUBSET of its seeded founding answers — the union (and
 * the refine merge on top) is content-identical to what any refine save
 * writes, so the seeded fixture never drifts (same discipline as
 * quiz-completion). Spec C's metadata seed is self-healing: if a run dies
 * before the app clears it, the next authenticated landing folds in the
 * same subset (content-identical) and clears it.
 */

const STASH_KEY = "sommeasy.pendingPalate";

// Subset of the seeded fixture (seed-test-account.spec.ts): SA + France,
// Stellenbosch + Burgundy, Kanonkop, Pinot Noir + Chardonnay.
const SEED_SUBSET_ANSWERS = {
  countries: ["south_africa", "france"],
  regions: { south_africa: ["stellenbosch"], france: ["burgundy"] },
  estates: { stellenbosch: ["kanonkop"] },
  varietals: ["pinot_noir", "chardonnay"],
  specificWines: [],
};

test.describe("Never Lose a Palate — anonymous quiz stash", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("HARD-FAIL GUARD: anonymous quiz → velvet-rope teaser + complete stash", async ({ page }) => {
    // The Velvet Rope (Aug 3): the whole spec runs at 375×812 — the teaser
    // must compose untruncated at the narrowest real phone width
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "Build My Profile" }).click();
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });

    // Step 1 — a country; steps 2/4 add depth so the signature and recs land
    await page.getByRole("button", { name: /South Africa/ }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
    await page.getByRole("button", { name: /Stellenbosch/ }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 3 of 5")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 4 of 5")).toBeVisible();
    await page.getByRole("button", { name: /Pinot Noir/ }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await page.getByRole("button", { name: "See My Wine DNA" }).click();

    // The hook still lands for anonymous users: title + bloom
    const archetype = page.getByTestId("reveal-archetype");
    await expect(archetype).toBeVisible({ timeout: 30_000 });
    expect((await archetype.textContent())?.trim().length).toBeGreaterThan(0);

    // The Signature (Act III S4): the mark renders for anonymous users too —
    // composed client-side from the local genome, no DB, no account
    const teaserMark = page.getByTestId("palate-mark").first();
    await expect(teaserMark).toBeVisible();
    await expect(teaserMark.locator("svg circle").first()).toBeAttached();

    // The Velvet Rope (Aug 3): epithet, narrative, and signature line are
    // ABSENT FROM THE RENDER TREE for anonymous users — count assertions,
    // not visibility, so CSS-hiding can never fake a pass
    await expect(page.getByTestId("reveal-epithet")).toHaveCount(0);
    await expect(page.getByTestId("reveal-narrative")).toHaveCount(0);
    await expect(page.getByTestId("teaser-signature")).toHaveCount(0);

    // Teaser gate: sells the gated reading, honest save promise, fold-in
    // sign-in path (S2.4 — the hrefs are the funnel)
    const gate = page.getByTestId("teaser-gate");
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("Your full reading is ready");
    await expect(gate).toContainText("it evolves with every bottle you rate");
    await expect(gate).toContainText("Held on this device for 7 days");
    await expect(gate.getByRole("link", { name: /Save My Wine DNA/ })).toHaveAttribute("href", "/signup");
    const signin = page.getByTestId("teaser-signin");
    await expect(signin).toContainText(/fold this into your palate/);
    await expect(signin).toHaveAttribute("href", "/login");

    // Recs are ONE read-only taste: a single card proves the matching works,
    // the "more wines" tail sells the rest, no rating affordances anywhere
    await expect(page.getByText(/Rate the ones you know/)).toHaveCount(0);
    const recs = page.getByTestId("reveal-recs");
    await expect(recs).toBeVisible();
    await expect(recs).toContainText("The first bottle we'd pour you");
    await expect(recs.getByTestId("rec-card")).toHaveCount(1);
    await expect(recs.getByText(/more wines to explore/)).toBeVisible();
    await expect(recs.getByRole("button", { name: /Had it/ })).toHaveCount(0);
    await expect(recs.getByRole("button", { name: /Want to try/ })).toHaveCount(0);

    // No signed-in furniture leaks into the teaser
    await expect(page.getByTestId("reveal-saved")).toHaveCount(0);
    await expect(page.getByTestId("reveal-palate-cta")).toHaveCount(0);

    // 375px composition guard (the steer-placeholder lesson, programmatic):
    // nothing overflows horizontally — not the page, not the gate card
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(pageOverflow, "teaser must not overflow horizontally at 375px").toBeLessThanOrEqual(1);
    const gateOverflow = await gate.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(gateOverflow, "gate copy must wrap inside its card at 375px").toBeLessThanOrEqual(1);

    // THE stash: written at reveal time, versioned, carrying the answers
    const stash = await page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key) || "null"),
      STASH_KEY
    );
    expect(stash, "anonymous quiz must stash its results at reveal time").not.toBeNull();
    expect(stash.version).toBe(1);
    expect(typeof stash.createdAt).toBe("number");
    expect(stash.answers.countries).toContain("south_africa");
    expect(stash.answers.regions.south_africa).toContain("stellenbosch");
    expect(stash.answers.varietals).toContain("pinot_noir");

    // Velvet-rope invariant: gating what's SHOWN never gates what's CAPTURED.
    // The stash must carry the COMPLETE profile — the post-save reveal and
    // the fold-in deliver the full payoff from exactly this payload
    expect(stash.profile, "stash must carry the full generated profile").not.toBeNull();
    expect(typeof stash.profile.narrative).toBe("string");
    expect(stash.profile.narrative.length).toBeGreaterThan(0);
    expect(typeof stash.profile.epithet).toBe("string");
    expect(stash.profile.genome && typeof stash.profile.genome).toBe("object");
    expect(stash.profile.recommendations.length).toBeGreaterThanOrEqual(1);

    // Content-level backstop: the composed narrative text itself must not be
    // rendered ANYWHERE on the teaser — testids can move, prose can't hide
    const firstSentence = stash.profile.narrative.split(/(?<=\.)\s/)[0];
    expect(firstSentence.length).toBeGreaterThan(10);
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(
      bodyText.includes(firstSentence),
      "the gated narrative leaked into the anonymous teaser render"
    ).toBe(false);
  });

  test("HARD-FAIL GUARD: stash → sign-in → auto-save → welcome back (idempotent)", async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL!;
    const password = process.env.TEST_USER_PASSWORD!;
    expect(email, "TEST_USER_EMAIL missing").toBeTruthy();

    // Plant the stash the anonymous quiz would have left (seed-subset →
    // content-identical merge, no fixture drift), then sign in for real.
    await page.goto("/login");
    // The submit button enables when React has hydrated — fill only after,
    // so the controlled inputs actually capture the values
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await page.evaluate(
      ([key, answers]) =>
        window.localStorage.setItem(
          key as string,
          JSON.stringify({ version: 1, createdAt: Date.now(), answers, profile: null })
        ),
      [STASH_KEY, SEED_SUBSET_ANSWERS] as const
    );

    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("/", { timeout: 15_000 });

    // The moment: the pending palate was folded in on this load
    await expect(page.getByTestId("welcome-back")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("welcome-back")).toContainText("Welcome back. Your palate was waiting.");
    await expect(page.getByTestId("palate-strip")).toBeVisible();

    // The stash was claimed — nothing left to double-apply
    const remaining = await page.evaluate((key) => window.localStorage.getItem(key), STASH_KEY);
    expect(remaining, "stash must be cleared after a successful fold-in").toBeNull();

    // Idempotency: a reload is a plain landing — no second moment
    await page.reload();
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("welcome-back")).toHaveCount(0);
  });

  test("HARD-FAIL GUARD: pending_palate metadata → sign-in restores the palate (cross-device, no stash)", async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL!;
    const password = process.env.TEST_USER_PASSWORD!;
    expect(email, "TEST_USER_EMAIL missing").toBeTruthy();

    // The July 30 canary: quiz in one browser, confirmation opened in
    // another — localStorage never makes the trip. The account-side carrier
    // (user_metadata.pending_palate, attached at signup) must restore the
    // palate ALONE. Seeding it directly via updateUser stands in for the
    // signup carry, which the auth-flows guard covers without real users.
    const { supabase } = await testDb();
    const { error: seedErr } = await supabase.auth.updateUser({
      data: {
        pending_palate: { version: 1, createdAt: Date.now(), answers: SEED_SUBSET_ANSWERS },
      },
    });
    expect(seedErr, `seeding pending_palate metadata failed: ${seedErr?.message}`).toBeNull();

    await page.goto("/login");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });

    // Stash-free on purpose: the metadata is the carrier under test
    const preStash = await page.evaluate((key) => window.localStorage.getItem(key), STASH_KEY);
    expect(preStash, "this spec must run stash-free").toBeNull();

    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("/", { timeout: 15_000 });

    // The metadata carrier fires the same welcome-back moment — if this
    // never appears, cross-device signups are losing their quiz again
    await expect(page.getByTestId("welcome-back")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("welcome-back")).toContainText("Welcome back. Your palate was waiting.");
    await expect(page.getByTestId("palate-strip")).toBeVisible();

    // The account-side carrier is cleared after the fold-in — verified
    // against the real auth record, not the browser's cached session
    const { data: refreshed, error: getErr } = await supabase.auth.getUser();
    expect(getErr).toBeNull();
    expect(
      refreshed.user?.user_metadata?.pending_palate ?? null,
      "pending_palate metadata must be cleared after a successful fold-in"
    ).toBeNull();

    // Idempotency: a reload is a plain landing — no second moment
    await page.reload();
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("welcome-back")).toHaveCount(0);
  });

  test("signed-out /palate gate preserves the destination through login", async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL!;
    const password = process.env.TEST_USER_PASSWORD!;

    await page.goto("/palate");
    const gateLink = page.getByRole("link", { name: "Sign In" });
    await expect(gateLink).toBeVisible({ timeout: 15_000 });
    await expect(gateLink).toHaveAttribute("href", "/login?next=%2Fpalate");
    await gateLink.click();

    // The submit button enables when React has hydrated — filling earlier
    // loses the input to hydration, and clicking earlier fires a NATIVE
    // form submission that reloads /login and drops ?next entirely
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Lands where the user was headed, signed in
    await page.waitForURL("/palate", { timeout: 15_000 });
    await expect(page.getByTestId("palate-archetype")).toBeVisible({ timeout: 15_000 });
  });
});
