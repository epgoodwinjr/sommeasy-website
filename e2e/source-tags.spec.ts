import { test, expect, Page, Route } from "@playwright/test";

/**
 * Where accounts came from (src/lib/sourceTag.js).
 *
 * A ?ref=<tag> on any page is kept on the device (first tag wins, 30 days);
 * email signup carries it as user_metadata.ref; any other signup (Google)
 * gets it written on its first signed-in load — only an account made in the
 * last 24 hours with no ref, once, never over a ref; the stored tag is
 * cleared once the account carries it.
 *
 * EVERY /auth/v1/* call is intercepted: no real user is created, read or
 * changed. The signed-in tests sign in a made-up account by answering the
 * password grant with a session of our own, which is as far as the browser
 * can tell how any provider's session arrives — the write doesn't ask which
 * provider made the account. They stay on /privacy and /terms, which read
 * nothing from the database. (The server's middleware can't refresh the
 * made-up session; it changes no cookie when that fails.)
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
};
const REF_KEY = "sommeasy.ref";
const DAY = 24 * 60 * 60 * 1000;

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

function madeUpUser(ageMs: number, metadata: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: "00000000-0000-4000-8000-0000000052ef",
    aud: "authenticated",
    role: "authenticated",
    email: "source-tags-e2e@example.com",
    phone: "",
    created_at: new Date(now - ageMs).toISOString(),
    updated_at: new Date(now).toISOString(),
    email_confirmed_at: new Date(now - ageMs).toISOString(),
    identities: [{ identity_id: "i-g", provider: "google" }],
    user_metadata: metadata,
    app_metadata: { provider: "google", providers: ["google"] },
  };
}

function session(user: ReturnType<typeof madeUpUser>) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    sub: user.id, exp, aud: "authenticated", role: "authenticated", email: user.email,
  })}.e2e-not-a-signature`;
  return {
    access_token: token, token_type: "bearer", expires_in: 3600, expires_at: exp,
    refresh_token: "e2e-refresh", user,
  };
}

/** Answer every /auth/v1/* call. The cached session says `cachedAgeMs`;
 *  GET /user answers with the server's user; PUT /user is the write, kept. */
async function madeUpAuth(page: Page, { cachedAgeMs, serverAgeMs = cachedAgeMs }: { cachedAgeMs: number; serverAgeMs?: number }) {
  const log = { getUser: 0, puts: [] as any[], other: [] as string[] };
  let server = madeUpUser(serverAgeMs);
  await page.route("**/auth/v1/**", async (route: Route) => {
    const req = route.request();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    if (url.pathname.endsWith("/token") && url.searchParams.get("grant_type") === "password") {
      return json(session(madeUpUser(cachedAgeMs)));
    }
    if (url.pathname.endsWith("/user") && req.method() === "GET") {
      log.getUser += 1;
      return json(server);
    }
    if (url.pathname.endsWith("/user") && req.method() === "PUT") {
      const body = req.postDataJSON();
      log.puts.push(body);
      server = { ...server, user_metadata: { ...server.user_metadata, ...body.data } };
      return json(server);
    }
    log.other.push(`${req.method()} ${url.pathname}`);
    return json({});
  });
  return log;
}

async function signIn(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  const submit = page.locator('button[type="submit"]');
  await expect(submit).toBeEnabled({ timeout: 15_000 }); // the hydration signal
  await page.locator('input[type="email"]').fill("source-tags-e2e@example.com");
  await page.locator('input[type="password"]').fill("a-fine-vintage-6");
  await submit.click();
  await page.waitForURL(`**${next}`, { timeout: 15_000 });
}

const storedTag = (page: Page) =>
  page.evaluate((k) => {
    const raw = window.localStorage.getItem(k);
    return raw ? JSON.parse(raw).tag : null;
  }, REF_KEY);

test.describe("Source tags", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a visit keeps the first valid tag; anything else is ignored", async ({ page }) => {
    await page.goto("/privacy?ref=Not_A_Tag");
    await expect(page.locator("h1")).toBeVisible();
    expect(await storedTag(page), "an invalid tag is ignored").toBeNull();
    await page.goto("/terms?ref=insta");
    await expect.poll(() => storedTag(page)).toBe("insta");
    await page.goto("/privacy?ref=card");
    await expect(page.locator("h1")).toBeVisible();
    // The first tag wins while it's unexpired
    await expect.poll(() => storedTag(page)).toBe("insta");
    const setAt = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k)!).setAt, REF_KEY);
    expect(Math.abs(Date.now() - setAt), "stored with the time it was set").toBeLessThan(60_000);
  });

  test("HARD-FAIL GUARD: email signup carries the stored tag as data.ref, beside the name and the palate", async ({ page }) => {
    let body: any = null;
    await page.route("**/auth/v1/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      if (new URL(req.url()).pathname.endsWith("/signup")) body = req.postDataJSON();
      const user = madeUpUser(0);
      return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ ...user, identities: [{ identity_id: "i-1", provider: "email" }] }) });
    });
    await page.goto("/?ref=insta");
    await expect.poll(() => storedTag(page)).toBe("insta");
    await page.evaluate(() => window.localStorage.setItem("sommeasy.pendingPalate", JSON.stringify({
      version: 1, createdAt: Date.now(),
      answers: { countries: ["france"], regions: {}, estates: {}, varietals: ["pinot_noir"], specificWines: [] },
      profile: null,
    })));
    await page.goto("/signup");
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await page.locator("input#name").fill("Source Tester");
    await page.locator('input[type="email"]').fill("source-tags-e2e@example.com");
    await page.locator('input[type="password"]').fill("a-fine-vintage-6");
    await submit.click();
    await expect(page.getByTestId("auth-check-inbox")).toBeVisible({ timeout: 15_000 });
    expect(body, "the signup request was sent").not.toBeNull();
    expect(body.data.ref).toBe("insta");
    expect(body.data.name).toBe("Source Tester");
    expect(body.data.pending_palate?.answers?.countries).toEqual(["france"]);
    // Not on the account until it's confirmed: the tag stays for that load
    expect(await storedTag(page)).toBe("insta");
  });

  test("email signup with no stored tag sends no ref", async ({ page }) => {
    let body: any = null;
    await page.route("**/auth/v1/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      if (new URL(req.url()).pathname.endsWith("/signup")) body = req.postDataJSON();
      return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({ ...madeUpUser(0), identities: [{ identity_id: "i-1", provider: "email" }] }) });
    });
    await page.goto("/signup?ref=Bad_Tag");
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await page.locator("input#name").fill("Source Tester");
    await page.locator('input[type="email"]').fill("source-tags-e2e@example.com");
    await page.locator('input[type="password"]').fill("a-fine-vintage-6");
    await submit.click();
    await expect(page.getByTestId("auth-check-inbox")).toBeVisible({ timeout: 15_000 });
    expect(body, "the signup request was sent").not.toBeNull();
    expect("ref" in body.data, "no ref key at all").toBe(false);
    expect(body.data.name).toBe("Source Tester");
  });

  test("HARD-FAIL GUARD: a new account with no ref gets the tag once on its first signed-in load", async ({ page }) => {
    const log = await madeUpAuth(page, { cachedAgeMs: 2 * 60 * 1000 });
    await page.goto("/privacy?ref=card");
    await expect.poll(() => storedTag(page)).toBe("card");
    await signIn(page, "/terms");
    await expect.poll(() => log.puts.length, { timeout: 15_000 }).toBe(1);
    // The ref alone (supabase-js adds its own PKCE fields beside data)
    expect(log.puts[0].data).toEqual({ ref: "card" });
    expect(log.getUser, "the server was asked before the write").toBeGreaterThanOrEqual(1);
    // Cleared once it's on the account…
    await expect.poll(() => storedTag(page)).toBeNull();
    // …so later loads, and a later tag, write nothing more
    await page.goto("/privacy?ref=insta");
    await expect(page.locator("h1")).toBeVisible();
    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await expect.poll(() => storedTag(page)).toBe("insta");
    // The account now says card (the PUT answered with it): never overwritten
    await page.waitForLoadState("networkidle");
    expect(log.puts.length, "written once, never again").toBe(1);
  });

  test("an older account is never tagged — and asks nothing of the server", async ({ page }) => {
    const log = await madeUpAuth(page, { cachedAgeMs: 400 * DAY });
    await page.goto("/privacy?ref=card");
    await expect.poll(() => storedTag(page)).toBe("card");
    await signIn(page, "/terms");
    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(log.puts, "no write").toEqual([]);
    expect(log.getUser, "decided from the cached session alone").toBe(0);
    expect(await storedTag(page), "the tag stays for a new account on this device").toBe("card");
  });

  test("an account the server says is old is never tagged, even when the cache says new", async ({ page }) => {
    const log = await madeUpAuth(page, { cachedAgeMs: 60 * 1000, serverAgeMs: 30 * DAY });
    await page.goto("/privacy?ref=card");
    await expect.poll(() => storedTag(page)).toBe("card");
    await signIn(page, "/terms");
    // The premise: the check ran far enough to ask the server
    await expect.poll(() => log.getUser, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await page.waitForLoadState("networkidle");
    expect(log.puts, "no write").toEqual([]);
  });
});
