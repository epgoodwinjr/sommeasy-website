// Route tests for POST /api/lists — The List Ledger (Nov 2026)
// Run with: node src/lib/__tests__/listsRoute.test.js
//
// The REAL route module (the authRoutes / accountRoute pattern): the alias
// loader resolves "@/" and "next/server" for plain node, and globalThis.fetch
// is a scripted Supabase — GoTrue's /user lookup for the cookie session and
// PostgREST's /rpc/record_list_observation for the write. What these pin:
// no session → 401 and nothing written; anything but JSON → 415; the
// limiter runs first; the write goes through the service role ONLY and
// carries no user id, email or IP — even when the body tries to; the
// observation is keyed by the body's list_ref; junk is a 400, never a throw;
// origin follows VERCEL_ENV; a failed write is a logged 500.

import { register } from "node:module";
register("./helpers/alias-loader.mjs", import.meta.url);

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
const SERVICE_KEY = "stub-service-role-key";
delete process.env.VERCEL_ENV;

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

const SESSION_USER = "11111111-1111-4111-8111-111111111111";
const SESSION_EMAIL = "taster@example.com";
const REF = "6f1c2b9e-3d4a-4b5c-9d6e-7f8a9b0c1d2e";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function headerOf(init, name) {
  const h = init.headers;
  if (!h) return null;
  if (typeof h.get === "function") return h.get(name);
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : null;
}

let fetchLog = [];
let rpcReply = () => json({ list_id: "x", list: "new", observation: "new", restaurant: false });
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const method = init.method || "GET";
  fetchLog.push({ url, method, authorization: headerOf(init, "authorization"), apikey: headerOf(init, "apikey"), body: init.body ?? null });
  if (url.includes("/rest/v1/rpc/record_list_observation")) return rpcReply();
  if (url.endsWith("/auth/v1/user")) {
    return json({ id: SESSION_USER, email: SESSION_EMAIL, aud: "authenticated", role: "authenticated" });
  }
  throw new Error(`unscripted fetch: ${method} ${url}`);
};
const rpcCalls = () => fetchLog.filter((c) => c.url.includes("/rest/v1/"));

function sessionCookie() {
  const session = {
    access_token: "fake-access-token", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "fake-refresh-token",
    user: { id: SESSION_USER, email: SESSION_EMAIL, aud: "authenticated" },
  };
  return `sb-stub-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
}

const listBody = (extra = {}) => ({
  list_ref: REF,
  source_kind: "scan",
  source_host: null,
  restaurant: { name: null, city: null, website: null },
  items: [{ name: "Kanonkop Pinotage 2019", price: 60, glass_price: null, is_btg: false }, { name: "Raats Chenin Blanc", price: 48, glass_price: 12 }],
  ...extra,
});

let ipSeq = 0;
const IP_BASE = "198.51.100.";
function makeRequest(NextRequest, { cookie, body, raw, ip, contentType = "application/json" } = {}) {
  return new NextRequest("http://localhost:3000/api/lists", {
    method: "POST",
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      // A fresh address per request unless a test means to share one: the
      // limiter is live here (no E2E flag, no NODE_ENV=test)
      "x-forwarded-for": ip || `${IP_BASE}${++ipSeq}`,
      ...(cookie ? { cookie } : {}),
    },
    body: raw ?? JSON.stringify(body ?? listBody()),
  });
}

const logs = [];
const origLog = console.log, origError = console.error;
function captureLogs() {
  logs.length = 0;
  console.error = (...a) => { logs.push(a.join(" ")); };
  console.log = (...a) => { if (typeof a[0] === "string" && a[0].startsWith("[lists]")) logs.push(a.join(" ")); else origLog(...a); };
}
function releaseLogs() { console.log = origLog; console.error = origError; }
async function quietly(fn) {
  captureLogs();
  try { return await fn(); } finally { releaseLogs(); }
}

async function main() {
  const { NextRequest } = await import("next/server.js");
  const route = await import("../../app/api/lists/route.js");
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

  console.log("\n═══ POST /api/lists ═══");

  await test("no session → 401, and nothing is written", async () => {
    fetchLog = [];
    const res = await route.POST(makeRequest(NextRequest, {}));
    assert(res.status === 401, `status ${res.status}`);
    assert(rpcCalls().length === 0, `written: ${JSON.stringify(rpcCalls())}`);
  });

  await test("anything but JSON → 415, before the session is even asked", async () => {
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", null]) {
      fetchLog = [];
      const res = await route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), contentType }));
      assert(res.status === 415, `${contentType}: status ${res.status}`);
      assert(fetchLog.length === 0, `${contentType}: called ${JSON.stringify(fetchLog)}`);
    }
  });

  await test("a session → ONE write through the service role, keyed by the body's list_ref", async () => {
    fetchLog = [];
    const res = await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie() })));
    assert(res.status === 200, `status ${res.status}`);
    assert((await res.json()).ok === true, "ok");
    const calls = rpcCalls();
    assert(calls.length === 1 && calls[0].method === "POST", `one rpc call: ${JSON.stringify(calls.map((c) => c.url))}`);
    assert(calls[0].authorization === `Bearer ${SERVICE_KEY}` && calls[0].apikey === SERVICE_KEY, `service role: ${calls[0].authorization}`);
    const lookup = fetchLog.find((c) => c.url.endsWith("/auth/v1/user"));
    assert(lookup?.authorization === "Bearer fake-access-token", "the session is the user's own token");
    const args = JSON.parse(calls[0].body);
    // exactly the database function's fifteen arguments (migration 015) — nothing rides along
    const want = ["p_list_ref", "p_observed_on", "p_source_kind", "p_source_host", "p_origin", "p_parser_version", "p_fingerprint",
      "p_wine_count", "p_priced_count", "p_btg_count", "p_read_name", "p_read_city", "p_read_website", "p_restaurant", "p_items"];
    assert(JSON.stringify(Object.keys(args).sort()) === JSON.stringify([...want].sort()), `arguments ${Object.keys(args)}`);
    const sql = (await import("node:fs")).readFileSync(new URL("../../../supabase/migrations/015_list_ledger.sql", import.meta.url), "utf8");
    const declared = [...sql.match(/function public\.record_list_observation\(([\s\S]*?)\)\s*returns/)[1].matchAll(/(p_\w+)/g)].map((m) => m[1]);
    assert(JSON.stringify(declared.sort()) === JSON.stringify([...want].sort()), `the function declares ${declared}`);
    assert(args.p_list_ref === REF, `list_ref ${args.p_list_ref}`);
    assert(args.p_origin === "test" && args.p_source_kind === "scan" && args.p_wine_count === 2 && args.p_priced_count === 2, "the list's facts");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(args.p_observed_on), `a day, not a time: ${args.p_observed_on}`);
    assert(/^[0-9a-f]{64}$/.test(args.p_fingerprint), `a sha256 fingerprint: ${args.p_fingerprint}`);
    assert(args.p_items.length === 2 && args.p_items[1].glass_price === 12, "the lines");
  });

  await test("no user id, email or IP reaches the catalog — even when the body carries them", async () => {
    fetchLog = [];
    const IP = "203.0.113.77";
    const sneaky = listBody({
      user_id: SESSION_USER, userId: SESSION_USER, email: SESSION_EMAIL, ip: IP,
      restaurant: { name: SESSION_EMAIL, city: null, website: null, user_id: SESSION_USER },
      items: [{ name: "Kanonkop Pinotage 2019", price: 60, user_id: SESSION_USER, email: SESSION_EMAIL, ip: IP }],
    });
    const res = await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), body: sneaky, ip: IP })));
    assert(res.status === 200, `status ${res.status}`);
    const written = rpcCalls()[0].body;
    assert(!written.includes(SESSION_USER), "the session's user id was written");
    assert(!written.includes(IP), "the IP was written");
    assert(!/user_?id|"email"|"ip"/i.test(written), `a user field was written: ${written}`);
    // (a diner who types their email where a restaurant name goes is kept as
    // a name read off the page — the route can't know; the prompt only
    // fills what's printed on a LIST)
  });

  await test("the same list_ref twice → two writes on the same observation key", async () => {
    fetchLog = [];
    await quietly(async () => {
      await route.POST(makeRequest(NextRequest, { cookie: sessionCookie() }));
      await route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), body: listBody({ items: [...listBody().items, { name: "Third Wine", price: 70 }] }) }));
    });
    const refs = rpcCalls().map((c) => JSON.parse(c.body).p_list_ref);
    const fps = rpcCalls().map((c) => JSON.parse(c.body).p_fingerprint);
    assert(refs.length === 2 && refs.every((r) => r === REF), `refs ${refs}`);
    assert(fps[0] !== fps[1], "the fuller page is a new version — the database moves the observation onto it");
  });

  await test("junk is a 400 and writes nothing — never a throw", async () => {
    const junk = [
      { raw: "{not json" },
      { body: listBody({ list_ref: "a1b2c3d4" }) },
      { body: listBody({ source_kind: "paste" }) },
      { body: listBody({ items: [] }) },
      { body: listBody({ items: [{ price: 50 }, null, 4] }) },
      { raw: "null" },
      { raw: "[]" },
    ];
    for (const j of junk) {
      fetchLog = [];
      const res = await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), ...j })));
      assert(res.status === 400, `${JSON.stringify(j).slice(0, 60)}: status ${res.status}`);
      assert(rpcCalls().length === 0, "written");
    }
  });

  await test("a body over 1MB → 413, nothing written", async () => {
    fetchLog = [];
    const big = listBody({ items: Array.from({ length: 1000 }, (_, i) => ({ name: `Wine ${i} ` + "x".repeat(1200), price: 50 })) });
    const res = await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), body: big })));
    assert(res.status === 413, `status ${res.status}`);
    assert(rpcCalls().length === 0, "written");
  });

  await test("origin is live only under VERCEL_ENV=production", async () => {
    const originFor = async (env) => {
      if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
      fetchLog = [];
      await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie() })));
      return JSON.parse(rpcCalls()[0].body).p_origin;
    };
    try {
      assert(await originFor("production") === "live", "production → live");
      assert(await originFor("preview") === "test", "preview → test");
      assert(await originFor(undefined) === "test", "local → test");
    } finally {
      delete process.env.VERCEL_ENV;
    }
    // and a live read is a different fingerprint from a test read of the same list
  });

  await test("no service key → 503, logged, nothing written", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    fetchLog = [];
    let res;
    try {
      res = await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie() })));
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    }
    assert(res.status === 503, `status ${res.status}`);
    assert(rpcCalls().length === 0, "written");
    assert(logs.some((l) => l.includes("[lists] write failed: no_service_key")), `logs ${JSON.stringify(logs)}`);
  });

  await test("a failed write → 500 with its code logged — never the list", async () => {
    rpcReply = () => json({ code: "23514", message: "new row violates check constraint", details: null, hint: null }, 400);
    fetchLog = [];
    let res;
    try {
      res = await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie() })));
    } finally {
      rpcReply = () => json({ list_id: "x", list: "new", observation: "new", restaurant: false });
    }
    assert(res.status === 500, `status ${res.status}`);
    assert(logs.some((l) => l.includes("[lists] write failed: 23514")), `logs ${JSON.stringify(logs)}`);
    assert(!logs.join(" ").includes("Kanonkop"), "the list never reaches the log");
  });

  await test("a success logs counts, never names, users or the list ref", async () => {
    fetchLog = [];
    await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie() })));
    const line = logs.find((l) => l.startsWith("[lists] write ok"));
    assert(line && line.includes("2 wines"), `log ${JSON.stringify(logs)}`);
    for (const secret of ["Kanonkop", REF, SESSION_USER, SESSION_EMAIL]) assert(!line.includes(secret), `${secret} logged`);
  });

  await test("the limiter runs first: request 61 from one address → 429, nothing called", async () => {
    const ip = "192.0.2.200";
    fetchLog = [];
    let last;
    await quietly(async () => {
      for (let i = 0; i < 60; i++) {
        last = await route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), ip }));
        assert(last.status === 200, `request ${i + 1}: ${last.status}`);
      }
    });
    const before = fetchLog.length;
    const res = await route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), ip }));
    assert(res.status === 429, `status ${res.status}`);
    assert(Number(res.headers.get("retry-after")) > 0, "Retry-After");
    assert(fetchLog.length === before, "nothing called once limited");
    const other = await quietly(() => route.POST(makeRequest(NextRequest, { cookie: sessionCookie(), ip: "192.0.2.201" })));
    assert(other.status === 200, "another address is not limited");
  });

  await test("POST only, and per request", async () => {
    assert(route.dynamic === "force-dynamic", "force-dynamic");
    assert(typeof route.GET === "undefined" && typeof route.PUT === "undefined" && typeof route.DELETE === "undefined", "POST only");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
