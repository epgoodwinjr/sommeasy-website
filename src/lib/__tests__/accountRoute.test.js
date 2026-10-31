// Route tests for POST /api/account/delete — The House List, Phase 6 (§10.2)
// Run with: node src/lib/__tests__/accountRoute.test.js
//
// Tests the REAL route module (the authRoutes pattern): the alias loader
// resolves "@/" and "next/server" for plain node, and globalThis.fetch is a
// scripted GoTrue — the cookie session's /user lookup, the admin API's
// DELETE /admin/users/:id, and /logout. What these pin: the user id comes
// ONLY from the session (a body naming someone else is ignored), no session
// never reaches the admin API, a missing service key is a 503 that never
// reaches it either, a failed delete keeps the session, the limiter runs
// before anything else, and success clears the session cookies. The
// service key rides only the admin call and never comes back out.

import { register } from "node:module";
register("./helpers/alias-loader.mjs", import.meta.url);

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
const SERVICE_KEY = "stub-service-role-key";

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }

// ——— scripted GoTrue ———
const SESSION_USER = "11111111-1111-4111-8111-111111111111";
const SOMEONE_ELSE = "22222222-2222-4222-8222-222222222222";

let fetchLog = [];
let adminReply = () => json({ id: SESSION_USER });
let logoutReply = () => new Response(null, { status: 204 });

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function headerOf(init, name) {
  const h = init.headers;
  if (!h) return null;
  if (typeof h.get === "function") return h.get(name);
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : null;
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const method = init.method || "GET";
  fetchLog.push({ url, method, authorization: headerOf(init, "authorization"), apikey: headerOf(init, "apikey") });
  if (url.includes("/auth/v1/admin/users/")) return adminReply();
  if (url.includes("/auth/v1/logout")) return logoutReply();
  if (url.endsWith("/auth/v1/user")) {
    return json({ id: SESSION_USER, email: "taster@example.com", aud: "authenticated", role: "authenticated" });
  }
  throw new Error(`unscripted fetch: ${method} ${url}`);
};

const adminCalls = () => fetchLog.filter((c) => c.url.includes("/auth/v1/admin/"));

// The cookie @supabase/ssr reads: sb-<ref>-auth-token = "base64-" + base64url(session JSON)
function sessionCookie() {
  const session = {
    access_token: "fake-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "fake-refresh-token",
    user: { id: SESSION_USER, email: "taster@example.com", aud: "authenticated" },
  };
  return `sb-stub-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

let ipSeq = 0;
function makeRequest(NextRequest, { cookie, body, ip } = {}) {
  return new NextRequest("http://localhost:3000/api/account/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // A fresh address per request unless a test means to share one: the
      // limiter is live here (no E2E flag, no NODE_ENV=test)
      "x-forwarded-for": ip || `203.0.113.${++ipSeq}`,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

function setCookies(res) {
  return typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [String(res.headers.get("set-cookie") || "")].filter(Boolean);
}

// Capture the route's log lines
const logs = [];
const origLog = console.log, origError = console.error;
function captureLogs() {
  logs.length = 0;
  console.error = (...a) => { logs.push(a.join(" ")); };
  console.log = (...a) => { if (typeof a[0] === "string" && a[0].startsWith("[account]")) logs.push(a.join(" ")); else origLog(...a); };
}
function releaseLogs() { console.log = origLog; console.error = origError; }

async function main() {
  const { NextRequest } = await import("next/server.js");
  const route = await import("../../app/api/account/delete/route.js");

  console.log("\n═══ POST /api/account/delete ═══");

  await test("no session → 401, and the admin API is never called", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    fetchLog = [];
    const res = await route.POST(makeRequest(NextRequest, { body: { user_id: SOMEONE_ELSE } }));
    assert(res.status === 401, `status ${res.status}`);
    assert(adminCalls().length === 0, `admin called: ${JSON.stringify(adminCalls())}`);
    const body = await res.json();
    assert(typeof body.error === "string" && body.error.length > 0, "brand copy in the body");
  });

  await test("a session → deleteUser with the SESSION's id, even when the body names someone else", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    fetchLog = [];
    adminReply = () => json({ id: SESSION_USER });
    captureLogs();
    let res;
    try {
      res = await route.POST(makeRequest(NextRequest, {
        cookie: sessionCookie(), body: { user_id: SOMEONE_ELSE, id: SOMEONE_ELSE, userId: SOMEONE_ELSE },
      }));
    } finally { releaseLogs(); }
    assert(res.status === 200, `status ${res.status}`);
    const body = await res.json();
    assert(body.ok === true, `body ${JSON.stringify(body)}`);
    const calls = adminCalls();
    assert(calls.length === 1, `one admin call, got ${calls.length}`);
    assert(calls[0].method === "DELETE", `method ${calls[0].method}`);
    assert(calls[0].url.endsWith(`/auth/v1/admin/users/${SESSION_USER}`), `url ${calls[0].url}`);
    assert(!fetchLog.some((c) => c.url.includes(SOMEONE_ELSE)), "the body's id must never reach GoTrue");
    assert(logs.includes("[account] delete ok"), `logs ${JSON.stringify(logs)}`);
  });

  await test("the service key rides only the admin call — the session lookup uses the user's token", async () => {
    const lookup = fetchLog.find((c) => c.url.endsWith("/auth/v1/user"));
    const admin = adminCalls()[0];
    assert(lookup && lookup.authorization === "Bearer fake-access-token", `lookup auth ${lookup?.authorization}`);
    assert(admin && admin.authorization === `Bearer ${SERVICE_KEY}`, `admin auth ${admin?.authorization}`);
    assert(admin.apikey === SERVICE_KEY, `admin apikey ${admin?.apikey}`);
  });

  await test("success clears the session cookies on the response — and never leaks the key", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    fetchLog = [];
    const res = await route.POST(makeRequest(NextRequest, { cookie: sessionCookie() }));
    const cookies = setCookies(res);
    const auth = cookies.filter((c) => c.startsWith("sb-stub-auth-token"));
    assert(auth.length > 0, `no auth cookie written: ${JSON.stringify(cookies)}`);
    assert(auth.every((c) => /max-age=0/i.test(c) || /expires=thu, 01 jan 1970/i.test(c)),
      `the session cookie must be cleared: ${JSON.stringify(auth)}`);
    const text = await res.text();
    assert(!text.includes(SERVICE_KEY) && !cookies.join(" ").includes(SERVICE_KEY), "the service key came back out");
  });

  await test("a deleted user's logout answering 404 still clears the cookies", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    fetchLog = [];
    logoutReply = () => json({ code: 404, error_code: "user_not_found", msg: "User not found" }, 404);
    try {
      const res = await route.POST(makeRequest(NextRequest, { cookie: sessionCookie() }));
      assert(res.status === 200, `status ${res.status}`);
      const auth = setCookies(res).filter((c) => c.startsWith("sb-stub-auth-token"));
      assert(auth.length > 0 && auth.every((c) => /max-age=0/i.test(c)), `cookies ${JSON.stringify(auth)}`);
    } finally {
      logoutReply = () => new Response(null, { status: 204 });
    }
  });

  await test("no SUPABASE_SERVICE_ROLE_KEY → 503, logged, the admin API never called", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    fetchLog = [];
    captureLogs();
    let res;
    try {
      res = await route.POST(makeRequest(NextRequest, { cookie: sessionCookie() }));
    } finally { releaseLogs(); }
    assert(res.status === 503, `status ${res.status}`);
    assert(adminCalls().length === 0, "admin called without a key");
    assert(logs.some((l) => l.includes("[account] delete failed: no_service_key")), `logs ${JSON.stringify(logs)}`);
    assert(setCookies(res).filter((c) => c.startsWith("sb-stub-auth-token")).length === 0,
      "a failed delete must keep the session");
  });

  await test("the admin API failing → 500, logged with its reason, the session kept", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    fetchLog = [];
    adminReply = () => json({ code: 500, error_code: "unexpected_failure", msg: "Database error deleting user" }, 500);
    captureLogs();
    let res;
    try {
      res = await route.POST(makeRequest(NextRequest, { cookie: sessionCookie() }));
    } finally {
      releaseLogs();
      adminReply = () => json({ id: SESSION_USER });
    }
    assert(res.status === 500, `status ${res.status}`);
    assert(logs.some((l) => l.startsWith("[account] delete failed: ") && !l.includes("no_service_key")),
      `logs ${JSON.stringify(logs)}`);
    assert(!fetchLog.some((c) => c.url.includes("/auth/v1/logout")), "no sign-out after a failed delete");
    assert(setCookies(res).filter((c) => c.startsWith("sb-stub-auth-token")).length === 0, "session kept");
    const body = await res.json();
    assert(typeof body.error === "string" && !/database|unexpected/i.test(body.error), "brand copy, never the raw reason");
  });

  await test("the limiter runs first: request MAX_REQUESTS+1 from one address → 429, nothing called", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    const { MAX_REQUESTS } = await import("../rateLimit.js");
    const ip = "198.51.100.7";
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const res = await route.POST(makeRequest(NextRequest, { ip }));
      assert(res.status === 401, `request ${i + 1}: status ${res.status}`);
    }
    fetchLog = [];
    const res = await route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), ip }));
    assert(res.status === 429, `status ${res.status}`);
    assert(fetchLog.length === 0, `nothing past the limiter: ${JSON.stringify(fetchLog)}`);
    assert(res.headers.get("retry-after"), "Retry-After set");
    const body = await res.json();
    assert(typeof body.error === "string" && body.error.length > 0, "brand copy");
  });

  await test("only the page's own JSON request: what a cross-site form can send → 415, nothing called", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    for (const type of ["application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "text/plain", null]) {
      fetchLog = [];
      const headers = { "x-forwarded-for": `203.0.113.${++ipSeq}`, cookie: sessionCookie() };
      if (type) headers["content-type"] = type;
      const res = await route.POST(new NextRequest("http://localhost:3000/api/account/delete", {
        method: "POST", headers, body: "user_id=x",
      }));
      assert(res.status === 415, `${type}: status ${res.status}`);
      assert(fetchLog.length === 0, `${type}: nothing past the check, got ${JSON.stringify(fetchLog)}`);
    }
  });

  await test("GET is not a delete", async () => {
    assert(typeof route.GET === "undefined", "the route exports only POST");
    assert(route.dynamic === "force-dynamic", "never statically prerendered");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
