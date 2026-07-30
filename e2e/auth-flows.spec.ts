import { test, expect, Page, Route } from "@playwright/test";

/**
 * Auth flows — The Front Door (Session 1).
 *
 * Every mutating Supabase auth call is intercepted at the network layer
 * (Playwright route on /auth/v1/*), so these specs are deterministic and
 * create NO real users. The real-signup canary stays a manual pre-launch
 * step (Cowork, brief §6).
 *
 * HARD-FAIL GUARD (CLAUDE.md rule): the "signup happy path" spec below must
 * fail when account creation breaks — do not make it outcome-tolerant.
 */

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Intercept an /auth/v1/ endpoint, transparently handling CORS preflights. */
async function routeAuth(
  page: Page,
  pattern: string,
  handler: (route: Route) => Promise<void>
) {
  await page.route(pattern, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    await handler(route);
  });
}

const FAKE_EMAIL = "front-door-e2e@example.com";

const fakeUser = (identities: object[]) => ({
  id: "00000000-0000-4000-8000-00000000e2e0",
  aud: "authenticated",
  role: "authenticated",
  email: FAKE_EMAIL,
  phone: "",
  confirmation_sent_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  identities,
  user_metadata: {},
  app_metadata: { provider: "email", providers: ["email"] },
});

// ─────────────────────────────────────────────────────────────────────────
// Signed-out flows
// ─────────────────────────────────────────────────────────────────────────

test.describe("Auth — signed-out flows", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("HARD-FAIL GUARD: signup happy path → check-your-inbox with gated resend, stash rides as metadata", async ({ page }) => {
    let signupBody: any = null;
    await routeAuth(page, "**/auth/v1/signup**", (route) => {
      signupBody = route.request().postDataJSON();
      return fulfillJson(route, fakeUser([{ identity_id: "i-1", provider: "email" }]));
    });

    await page.goto("/signup");
    // Never Lose a Palate (Session 5): a pending anonymous quiz must ride
    // the signup as user_metadata — localStorage doesn't survive a
    // cross-device confirmation (the July 30 canary). Plant the stash the
    // quiz would have left, then assert the request body carries it.
    await page.evaluate(() =>
      window.localStorage.setItem(
        "sommeasy.pendingPalate",
        JSON.stringify({
          version: 1,
          createdAt: Date.now(),
          answers: {
            countries: ["south_africa"],
            regions: { south_africa: ["stellenbosch"] },
            estates: {},
            varietals: ["pinot_noir"],
            specificWines: [],
          },
          profile: null,
        })
      )
    );
    await page.locator('input[type="email"]').fill(FAKE_EMAIL);
    await page.locator('input[type="password"]').fill("a-fine-vintage-6");
    await page.locator('button[type="submit"]').click();

    // The dedicated check-your-inbox state: address shown, spam note, resend
    // gated by the 60s countdown. If this state never appears, account
    // creation is broken — that is a REAL failure, never soften this spec.
    const inbox = page.getByTestId("auth-check-inbox");
    await expect(inbox).toBeVisible({ timeout: 15_000 });
    await expect(inbox).toContainText(FAKE_EMAIL);
    await expect(inbox).toContainText(/spam/i);

    const resend = page.getByTestId("auth-resend");
    await expect(resend).toBeVisible();
    await expect(resend).toBeDisabled();
    await expect(resend).toContainText(/Resend the link in \d+s/);

    // HARD-FAIL GUARD (Session 5): the signup request must carry the pending
    // palate as user_metadata — compact answers, no generated profile. If
    // this stops, cross-device signups silently lose the quiz again.
    expect(signupBody, "signup request body not captured").not.toBeNull();
    const carried = signupBody?.data?.pending_palate;
    expect(carried, "signup must carry pending_palate metadata when a stash exists").toBeTruthy();
    expect(carried.version).toBe(1);
    expect(carried.answers.countries).toContain("south_africa");
    expect(carried.answers.regions.south_africa).toContain("stellenbosch");
    expect(carried.answers.varietals).toContain("pinot_noir");
    expect(carried.answers.narrative, "only compact answers may travel").toBeUndefined();

    // Peek, never claim: abandoning signup must leave the same-browser
    // localStorage path intact, so the stash survives the carry.
    const survivor = await page.evaluate(() =>
      window.localStorage.getItem("sommeasy.pendingPalate")
    );
    expect(survivor, "the stash must survive the signup carry (peek, not claim)").not.toBeNull();
  });

  test("already-registered fake success → truthful state with sign-in and reset links", async ({ page }) => {
    // Supabase anti-enumeration: repeated signup returns 200 with
    // identities: [] — the old form said "check your email" forever.
    await routeAuth(page, "**/auth/v1/signup**", (route) =>
      fulfillJson(route, fakeUser([]))
    );

    await page.goto("/signup");
    await page.locator('input[type="email"]').fill(FAKE_EMAIL);
    await page.locator('input[type="password"]').fill("a-fine-vintage-6");
    await page.locator('button[type="submit"]').click();

    const state = page.getByTestId("auth-already-registered");
    await expect(state).toBeVisible({ timeout: 15_000 });
    await expect(state).toContainText(/already have an account/i);
    // No email theater
    await expect(page.getByTestId("auth-check-inbox")).toHaveCount(0);

    // Both exits carry the email over
    const encoded = encodeURIComponent(FAKE_EMAIL);
    await expect(state.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/login?email=${encoded}`);
    await expect(state.getByRole("link", { name: /Reset your password/ })).toHaveAttribute("href", `/forgot-password?email=${encoded}`);
  });

  test("wrong password → brand copy, never the raw Supabase string", async ({ page }) => {
    await routeAuth(page, "**/auth/v1/token**", (route) =>
      fulfillJson(route, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400)
    );

    await page.goto("/login");
    await page.locator('input[type="email"]').fill(FAKE_EMAIL);
    await page.locator('input[type="password"]').fill("not-the-password");
    await page.locator('button[type="submit"]').click();

    const error = page.getByTestId("auth-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/don't match our books/);
    await expect(page.getByText("Invalid login credentials")).toHaveCount(0);
    // Focus lands on the error (S3): screen readers hear it, keyboards reach it
    await expect(error).toBeFocused();
    // The submit button recovered (try/finally) — not stuck on a pending label
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });

  test("confirm/callback failure landing: /login?error=link_expired&email= renders copy + prefill", async ({ page }) => {
    await page.goto(`/login?error=link_expired&email=${encodeURIComponent(FAKE_EMAIL)}`);

    const error = page.getByTestId("auth-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/expired/i);
    await expect(page.locator('input[type="email"]')).toHaveValue(FAKE_EMAIL);
  });

  test("unknown/legacy error params still render brand copy (no more silent ?error=auth)", async ({ page }) => {
    await page.goto("/login?error=auth");
    const error = page.getByTestId("auth-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/went sideways/i);
  });

  test("forgot-password request → anti-enumeration copy (no account existence leak)", async ({ page }) => {
    await routeAuth(page, "**/auth/v1/recover**", (route) => fulfillJson(route, {}));

    await page.goto("/forgot-password");
    await page.locator('input[type="email"]').fill(FAKE_EMAIL);
    await page.locator('button[type="submit"]').click();

    const sent = page.getByTestId("reset-sent");
    await expect(sent).toBeVisible({ timeout: 15_000 });
    await expect(sent).toContainText(/If that email has an account with us/);
  });

  test("login page offers the forgot-password door", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: /Forgot your password/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /^\/forgot-password/);
  });

  test("update-password without a recovery session → honest guidance, not a doomed form", async ({ page }) => {
    await page.goto("/update-password");
    const missing = page.getByTestId("reset-session-missing");
    await expect(missing).toBeVisible({ timeout: 15_000 });
    await expect(missing.getByRole("link", { name: /Request a reset link/ })).toHaveAttribute("href", "/forgot-password");
    // No password form rendered
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("Google button stays hidden while the provider flag is off", async ({ page }) => {
    // A real user hit "provider is not enabled" twice — the button must not
    // render unless NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1.
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByText("Continue with Google")).toHaveCount(0);

    await page.goto("/signup");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByText("Continue with Google")).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Polish the Brass (Session 3): form fundamentals, states, magic link
// ─────────────────────────────────────────────────────────────────────────

const MAGIC_ON = process.env.NEXT_PUBLIC_MAGIC_LINK_ENABLED === "1";

test.describe("Auth — polish (Session 3)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("HARD-FAIL GUARD: password-manager vocabulary on login + signup", async ({ page }) => {
    // If a password field loses its autoComplete attribute, iOS/1Password
    // stop offering to save/generate passwords — the single biggest
    // forgot-password preventer. Never soften this spec.
    await page.goto("/login");
    await expect(page.locator("input#email")).toHaveAttribute("autocomplete", "email");
    await expect(page.locator("input#email")).toHaveAttribute("name", "email");
    await expect(page.locator("input#password")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.locator("input#password")).toHaveAttribute("name", "password");

    await page.goto("/signup");
    await expect(page.locator("input#email")).toHaveAttribute("autocomplete", "email");
    await expect(page.locator("input#password")).toHaveAttribute("autocomplete", "new-password");
    await expect(page.locator("input#password")).toHaveAttribute("minlength", "8");
  });

  test("labels, autofocus, helper, and visibility toggle", async ({ page }) => {
    await page.goto("/signup");
    // Visible labels, properly associated
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    // Email autofocused for the fast path
    await expect(page.locator("input#email")).toBeFocused();
    // The quiet requirements helper
    await expect(page.getByText("At least 8 characters.")).toBeVisible();

    // Show/Hide toggle
    const password = page.locator("input#password");
    await password.fill("a-fine-vintage-8");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");

    // Forgot-password page has the same field discipline
    await page.goto("/forgot-password");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.locator("input#email")).toHaveAttribute("autocomplete", "email");
    await expect(page.locator("input#email")).toBeFocused();
  });

  test("pending state: real copy, everything disabled while in flight", async ({ page }) => {
    // A slow token exchange keeps the pending state observable
    await routeAuth(page, "**/auth/v1/token**", async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await fulfillJson(route, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
    });

    await page.goto("/login");
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await page.locator("input#email").fill(FAKE_EMAIL);
    await page.locator("input#password").fill("whatever-password");
    await submit.click();

    await expect(submit).toContainText("Signing you in…");
    await expect(submit).toBeDisabled();
    if (MAGIC_ON) {
      await expect(page.getByTestId("magic-link")).toBeDisabled();
    }

    // Then the failure lands, focused, and the form recovers
    await expect(page.getByTestId("auth-error")).toBeVisible({ timeout: 15_000 });
    await expect(submit).toBeEnabled();
  });

  test("error boxes carry role=alert + aria-live", async ({ page }) => {
    await page.goto(`/login?error=link_expired&email=${encodeURIComponent(FAKE_EMAIL)}`);
    const error = page.getByTestId("auth-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toHaveAttribute("aria-live", "polite");
  });

  test("logo links home from auth pages", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Sommeasy home" })).toHaveAttribute("href", "/");
  });

  test(`magic link ${MAGIC_ON ? "flow (flag on)" : "stays hidden (flag off)"}`, async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });

    if (!MAGIC_ON) {
      await expect(page.getByTestId("magic-link")).toHaveCount(0);
      return;
    }

    const magic = page.getByTestId("magic-link");
    await expect(magic).toBeVisible();
    await expect(magic).toContainText("Email me a sign-in link instead");

    // Without an email: a warm nudge, not a dead click
    await magic.click();
    await expect(page.getByTestId("auth-error")).toContainText(/Tell us your email first/);

    // With an email: intercepted OTP send → the check-inbox state with
    // anti-enumeration copy and the gated resend
    await routeAuth(page, "**/auth/v1/otp**", (route) => fulfillJson(route, {}));
    await page.locator("input#email").fill(FAKE_EMAIL);
    await magic.click();

    const inbox = page.getByTestId("auth-check-inbox");
    await expect(inbox).toBeVisible({ timeout: 15_000 });
    await expect(inbox).toContainText(/If that email has an account with us/);
    await expect(inbox).toContainText(FAKE_EMAIL);
    const resend = page.getByTestId("auth-resend");
    await expect(resend).toBeDisabled();
    await expect(resend).toContainText(/Resend the link in \d+s/);
  });

  test("magic link is signup-page-free and anti-enumeration on unknown emails", async ({ page }) => {
    test.skip(!MAGIC_ON, "magic link flag off in this environment");

    // No magic link on signup — it's a sign-in affordance
    await page.goto("/signup");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("magic-link")).toHaveCount(0);

    // Unknown email (shouldCreateUser:false rejection) lands on the SAME
    // check-inbox state — the form never confirms account existence
    await routeAuth(page, "**/auth/v1/otp**", (route) =>
      fulfillJson(route, { code: 422, error_code: "otp_disabled", msg: "Signups not allowed for otp" }, 422)
    );
    await page.goto("/login");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await page.locator("input#email").fill("nobody-here@example.com");
    await page.getByTestId("magic-link").click();

    const inbox = page.getByTestId("auth-check-inbox");
    await expect(inbox).toBeVisible({ timeout: 15_000 });
    await expect(inbox).toContainText(/If that email has an account with us/);
    await expect(page.getByText("Signups not allowed for otp")).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Negative-path sweep (Session 4): the failure modes a real user hits when
// the network or Supabase misbehaves. All intercepted — no real users.
// ─────────────────────────────────────────────────────────────────────────

test.describe("Auth — negative paths (Session 4)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("network failure on login → 'reach our cellar' brand copy, form recovers", async ({ page }) => {
    await page.route("**/auth/v1/token**", (route) => route.abort("failed"));
    await page.goto("/login");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await page.locator("input#email").fill(FAKE_EMAIL);
    await page.locator("input#password").fill("whatever-password");
    await page.locator('button[type="submit"]').click();

    const error = page.getByTestId("auth-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/couldn't reach our cellar/i);
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });

  test("network failure on forgot-password → brand copy (not a hang)", async ({ page }) => {
    await page.route("**/auth/v1/recover**", (route) => route.abort("failed"));
    await page.goto("/forgot-password");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await page.locator("input#email").fill(FAKE_EMAIL);
    await page.locator('button[type="submit"]').click();

    const error = page.getByTestId("auth-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/couldn't reach our cellar/i);
  });

  test("rate-limited login → warm 'easy does it' copy, never the raw string", async ({ page }) => {
    await routeAuth(page, "**/auth/v1/token**", (route) =>
      fulfillJson(route, { code: 429, error_code: "over_request_rate_limit", msg: "For security purposes, you can only request this after 51 seconds." }, 429)
    );
    await page.goto("/login");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await page.locator("input#email").fill(FAKE_EMAIL);
    await page.locator("input#password").fill("whatever-password");
    await page.locator('button[type="submit"]').click();

    const error = page.getByTestId("auth-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/easy does it/i);
    await expect(page.getByText("For security purposes")).toHaveCount(0);
  });

  test("expired-link + unconfirmed-email landings render distinct brand copy", async ({ page }) => {
    await page.goto(`/login?error=link_expired`);
    await expect(page.getByTestId("auth-error")).toContainText(/expired/i);

    await page.goto(`/login?error=exchange_failed`);
    await expect(page.getByTestId("auth-error")).toContainText(/couldn't finish signing you in/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Recovery-session flow (uses the seeded auth state as the session; the
// password mutation itself is intercepted — the e2e account is never changed)
// ─────────────────────────────────────────────────────────────────────────

test.describe("Auth — update password with a session", () => {
  test("visibility toggle + updateUser → quiet confirmation → lands home", async ({ page }) => {
    await page.route("**/auth/v1/user**", async (route) => {
      const method = route.request().method();
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }
      if (method === "PUT") {
        await fulfillJson(route, fakeUser([{ identity_id: "i-1", provider: "email" }]));
        return;
      }
      await route.fallback(); // real GET /user — read-only session check
    });

    await page.goto("/update-password");
    const input = page.locator('input[placeholder="New password"]');
    await expect(input).toBeVisible({ timeout: 15_000 });
    // Password-manager guard on the reset path: new-password triggers
    // iOS/1Password strong-password generation
    await expect(input).toHaveAttribute("autocomplete", "new-password");
    await expect(input).toHaveAttribute("minlength", "8");

    await input.fill("a-new-fine-vintage-6");
    // Visibility toggle from day one on this page
    await expect(input).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(input).toHaveAttribute("type", "password");

    await page.locator('button[type="submit"]').click();
    await expect(page.getByTestId("password-updated")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("password-updated")).toContainText(/welcome back/i);

    // The quiet beat, then home — signed in
    await page.waitForURL("/", { timeout: 15_000 });
  });

  test("network failure on update-password → brand copy (all three forms covered)", async ({ page }) => {
    await page.route("**/auth/v1/user**", async (route) => {
      const method = route.request().method();
      if (method === "OPTIONS") { await route.fulfill({ status: 204, headers: CORS_HEADERS }); return; }
      if (method === "PUT") { await route.abort("failed"); return; }
      await route.fallback(); // real GET /user — recovery session check
    });

    await page.goto("/update-password");
    const input = page.locator('input[placeholder="New password"]');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill("a-new-fine-vintage-8");
    await page.locator('button[type="submit"]').click();

    const error = page.getByTestId("auth-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/couldn't reach our cellar/i);
    // Focus moved to the error (S3 a11y), form recovered
    await expect(error).toBeFocused();
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });
});
