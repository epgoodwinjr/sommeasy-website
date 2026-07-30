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

  test("HARD-FAIL GUARD: signup happy path → check-your-inbox with gated resend", async ({ page }) => {
    await routeAuth(page, "**/auth/v1/signup**", (route) =>
      fulfillJson(route, fakeUser([{ identity_id: "i-1", provider: "email" }]))
    );

    await page.goto("/signup");
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
});
