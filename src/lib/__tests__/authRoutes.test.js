// Route tests for /api/auth/confirm + /api/auth/callback — Session 1
// Run with: node src/lib/__tests__/authRoutes.test.js
//
// Tests the REAL route modules (no mirrors): a module.register() hook
// resolves the "@/" alias and "next/server" for plain node, and
// globalThis.fetch is patched so the real @supabase/ssr client talks to a
// scripted GoTrue. The point of these tests: cookies MUST be written onto
// the redirect response (the original callback bug), failures MUST land on
// /login with a mapped reason (never a silent bounce), and `next` MUST be
// sanitized (open-redirect kill).

import { register } from "node:module";
register("./helpers/alias-loader.mjs", import.meta.url);

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";

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
let fetchLog = [];
let gotrueScript = () => { throw new Error("no gotrue script set"); };

const SESSION_BODY = () => ({
  access_token: "fake-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "fake-refresh-token",
  user: { id: "user-1", email: "taster@example.com", aud: "authenticated" },
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const call = { url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null };
  fetchLog.push(call);
  return gotrueScript(call);
};

function scriptSuccess() {
  fetchLog = [];
  gotrueScript = () => json(SESSION_BODY());
}
function scriptFailure(status, body) {
  fetchLog = [];
  gotrueScript = () => json(body, status);
}

const ORIGIN = "http://localhost:3000";
const VERIFIER_COOKIE = "sb-stub-auth-token-code-verifier=fake-verifier-value";

function makeRequest(NextRequest, path, cookieHeader) {
  return new NextRequest(`${ORIGIN}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

function location(res) { return res.headers.get("location"); }
function setCookies(res) {
  return typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie().join("; ")
    : String(res.headers.get("set-cookie") || "");
}

async function main() {
  const { NextRequest } = await import("next/server.js");
  const confirm = await import("../../app/api/auth/confirm/route.js");
  const callback = await import("../../app/api/auth/callback/route.js");

  console.log("\n═══ /api/auth/confirm — token_hash verifyOtp ═══");

  await test("valid signup link → redirect to next with session cookies SET", async () => {
    scriptSuccess();
    const res = await confirm.GET(makeRequest(NextRequest, "/api/auth/confirm?token_hash=th_1&type=signup&next=/palate"));
    assert(res.status === 307 || res.status === 302, `status ${res.status}`);
    assert(location(res) === `${ORIGIN}/palate`, `location ${location(res)}`);
    const cookies = setCookies(res);
    assert(cookies.includes("sb-stub-auth-token"), `no auth cookie on response: ${cookies}`);
    assert(fetchLog.some((c) => c.url.includes("/auth/v1/verify") && c.body?.token_hash === "th_1" && c.body?.type === "signup"),
      "verifyOtp not called with token_hash");
  });

  await test("recovery link with no next → defaults to /update-password", async () => {
    scriptSuccess();
    const res = await confirm.GET(makeRequest(NextRequest, "/api/auth/confirm?token_hash=th_2&type=recovery"));
    assert(location(res) === `${ORIGIN}/update-password`, `location ${location(res)}`);
    assert(setCookies(res).includes("sb-stub-auth-token"), "recovery session cookie missing");
  });

  const evilNexts = ["//evil.com", "https://evil.com", encodeURIComponent("/\\evil.com"), "@evil.com"];
  for (const evil of evilNexts) {
    await test(`open-redirect probe next=${decodeURIComponent(evil)} → bounces to /`, async () => {
      scriptSuccess();
      const res = await confirm.GET(makeRequest(NextRequest, `/api/auth/confirm?token_hash=th_3&type=signup&next=${evil}`));
      assert(location(res) === `${ORIGIN}/`, `location ${location(res)}`);
    });
  }

  await test("expired/used token → /login?error=link_expired (never silent)", async () => {
    scriptFailure(403, { error_code: "otp_expired", msg: "Email link is invalid or has expired" });
    const res = await confirm.GET(makeRequest(NextRequest, "/api/auth/confirm?token_hash=th_dead&type=signup"));
    assert(location(res) === `${ORIGIN}/login?error=link_expired`, `location ${location(res)}`);
  });

  await test("missing token_hash → /login?error=link_expired", async () => {
    scriptSuccess();
    const res = await confirm.GET(makeRequest(NextRequest, "/api/auth/confirm?type=signup"));
    assert(location(res) === `${ORIGIN}/login?error=link_expired`, `location ${location(res)}`);
  });

  await test("invalid type → /login?error=link_expired (no verifyOtp call)", async () => {
    scriptSuccess();
    const res = await confirm.GET(makeRequest(NextRequest, "/api/auth/confirm?token_hash=th_4&type=hax"));
    assert(location(res) === `${ORIGIN}/login?error=link_expired`, `location ${location(res)}`);
    assert(fetchLog.length === 0, "should not have called gotrue");
  });

  await test("?code= arriving at confirm (transition era) still exchanges", async () => {
    scriptSuccess();
    const res = await confirm.GET(makeRequest(NextRequest, "/api/auth/confirm?code=abc&next=/update-password", VERIFIER_COOKIE));
    assert(location(res) === `${ORIGIN}/update-password`, `location ${location(res)}`);
    assert(setCookies(res).includes("sb-stub-auth-token"), "session cookie missing");
  });

  console.log("\n═══ /api/auth/callback — PKCE exchange ═══");

  await test("code + verifier cookie → redirect / with session cookies SET (the original bug)", async () => {
    scriptSuccess();
    const res = await callback.GET(makeRequest(NextRequest, "/api/auth/callback?code=code_1", VERIFIER_COOKIE));
    assert(res.status === 307 || res.status === 302, `status ${res.status}`);
    assert(location(res) === `${ORIGIN}/`, `location ${location(res)}`);
    assert(setCookies(res).includes("sb-stub-auth-token"), `no auth cookie: ${setCookies(res)}`);
    assert(fetchLog.some((c) => c.url.includes("grant_type=pkce")), "pkce exchange not attempted");
  });

  await test("code + next=/journal → lands on /journal", async () => {
    scriptSuccess();
    const res = await callback.GET(makeRequest(NextRequest, "/api/auth/callback?code=code_2&next=/journal", VERIFIER_COOKIE));
    assert(location(res) === `${ORIGIN}/journal`, `location ${location(res)}`);
  });

  for (const evil of evilNexts) {
    await test(`open-redirect probe next=${decodeURIComponent(evil)} → bounces to /`, async () => {
      scriptSuccess();
      const res = await callback.GET(makeRequest(NextRequest, `/api/auth/callback?code=code_3&next=${evil}`, VERIFIER_COOKIE));
      assert(location(res) === `${ORIGIN}/`, `location ${location(res)}`);
    });
  }

  await test("code WITHOUT verifier cookie (cross-browser click) → /login?error=exchange_failed", async () => {
    scriptSuccess();
    const res = await callback.GET(makeRequest(NextRequest, "/api/auth/callback?code=code_4"));
    assert(location(res) === `${ORIGIN}/login?error=exchange_failed`, `location ${location(res)}`);
  });

  await test("no code at all → /login?error=exchange_failed", async () => {
    scriptSuccess();
    const res = await callback.GET(makeRequest(NextRequest, "/api/auth/callback"));
    assert(location(res) === `${ORIGIN}/login?error=exchange_failed`, `location ${location(res)}`);
    assert(fetchLog.length === 0, "should not have called gotrue");
  });

  await test("gotrue rejects the exchange → /login?error=exchange_failed", async () => {
    scriptFailure(400, { error_code: "flow_state_not_found", msg: "invalid flow state" });
    const res = await callback.GET(makeRequest(NextRequest, "/api/auth/callback?code=code_5", VERIFIER_COOKIE));
    assert(location(res) === `${ORIGIN}/login?error=exchange_failed`, `location ${location(res)}`);
  });

  await test("provider error with otp_expired → /login?error=link_expired", async () => {
    scriptSuccess();
    const res = await callback.GET(makeRequest(NextRequest, "/api/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+expired"));
    assert(location(res) === `${ORIGIN}/login?error=link_expired`, `location ${location(res)}`);
  });

  await test("generic provider error → /login?error=exchange_failed", async () => {
    scriptSuccess();
    const res = await callback.GET(makeRequest(NextRequest, "/api/auth/callback?error=server_error&error_description=provider+is+not+enabled"));
    assert(location(res) === `${ORIGIN}/login?error=exchange_failed`, `location ${location(res)}`);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
