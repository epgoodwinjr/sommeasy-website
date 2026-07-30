import { test, expect } from "@playwright/test";

/**
 * Never Lose a Palate — the anonymous quiz → signup handoff (Session 2).
 *
 * HARD-FAIL GUARDS (CLAUDE.md rule): spec A fails if the anonymous quiz
 * stops stashing its results; spec B fails if a signed-in landing stops
 * folding the stash into the account. Together they guard the exact seam
 * that destroyed a real user's results on July 29. Do NOT make these
 * outcome-tolerant.
 *
 * Data discipline: spec B logs into the dedicated e2e account with a stash
 * that is a SUBSET of its seeded founding answers — the union (and the
 * refine merge on top) is content-identical to what any refine save writes,
 * so the seeded fixture never drifts (same discipline as quiz-completion).
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

  test("HARD-FAIL GUARD: anonymous quiz → teaser reveal + stash written", async ({ page }) => {
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

    // The staged reveal theater still lands for anonymous users
    const archetype = page.getByTestId("reveal-archetype");
    await expect(archetype).toBeVisible({ timeout: 30_000 });
    expect((await archetype.textContent())?.trim().length).toBeGreaterThan(0);

    // Teaser gate: honest save promise + the fold-in sign-in path (S2.4)
    const gate = page.getByTestId("teaser-gate");
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("Create your account to meet your full palate");
    await expect(gate.getByRole("link", { name: /Save My Palate/ })).toHaveAttribute("href", "/signup");
    const signin = page.getByTestId("teaser-signin");
    await expect(signin).toContainText(/fold this into your palate/);
    await expect(signin).toHaveAttribute("href", "/login");

    // Partial read: the one-line palate signature
    await expect(page.getByTestId("teaser-signature")).toBeVisible();

    // Recs are a read-only taste: no rating affordances, no rating language
    await expect(page.getByText(/Rate the ones you know/)).toHaveCount(0);
    const recs = page.getByTestId("reveal-recs");
    await expect(recs).toBeVisible();
    await expect(recs.getByRole("button", { name: /Had it/ })).toHaveCount(0);
    await expect(recs.getByRole("button", { name: /Want to try/ })).toHaveCount(0);

    // No signed-in furniture leaks into the teaser
    await expect(page.getByTestId("reveal-saved")).toHaveCount(0);
    await expect(page.getByTestId("reveal-palate-cta")).toHaveCount(0);

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
