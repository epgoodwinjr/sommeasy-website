// The waiting palate is folded in exactly once (launch prep, Nov 2026).
// Run with: node src/lib/__tests__/pendingPalateRestore.test.js
//
// Production evidence (Nov 12–17, 2026): one account wrote 23 quiz_completed
// "restore" events in five bursts. The account-side carrier
// (user_metadata.pending_palate) was cleared only at the very END of the
// save — behind ~88 sequential accumulation writes, about 15 seconds on a
// phone — while the event was written near the start. Any reload in between
// left the carrier in place, and the next load folded it in again.
//
// This suite runs the REAL restore + saveQuizProfile (alias loader) against a
// scripted Supabase that models what matters here: ONE server (auth user +
// tables) shared by DEVICES, each with its own localStorage and its own
// cached session user (getSession() is a cache — lead (d)), and a page that
// can die after any network call (a reload, a closed in-app browser).

const { register } = require("node:module");
const { pathToFileURL } = require("node:url");
register("./helpers/alias-loader.mjs", pathToFileURL(__filename));

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
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const UID = "user-restore-1";
const ANSWERS = {
  countries: ["france", "south_africa"],
  regions: { france: ["bordeaux"], south_africa: ["stellenbosch"] },
  estates: { stellenbosch: ["kanonkop"] },
  varietals: ["cabernet_sauvignon", "chenin_blanc"],
  specificWines: ["Kanonkop Paul Sauer 2019"],
};
const CREATED_AT = 1_794_000_000_000;

// ─── The scripted server ───

function makeServer({ metadata = true, rpc = true } = {}) {
  return {
    rpcAvailable: rpc,
    user: {
      id: UID,
      user_metadata: metadata
        ? { name: "Test", pending_palate: { version: 1, createdAt: CREATED_AT, answers: clone(ANSWERS) } }
        : { name: "Test" },
    },
    tables: { wine_profiles: [], wine_events: [], dna_accumulation: [], wine_interactions: [] },
    seq: 0,
  };
}

const DEAD = Symbol("dead");

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// A device: its own storage and cached session user. Its pages share them.
function makeDevice(server) {
  return { server, storage: fakeStorage(), cachedUser: clone(server.user) };
}

// One page load's client. `dieAfter` = how many network calls reach the
// server before the page dies (null = never). After death nothing is sent
// and every pending call hangs forever, as it does when a tab goes away.
function makeClient(device, { dieAfter = null, hooks = {} } = {}) {
  const { server } = device;
  let calls = 0;
  const log = [];
  const hang = () => new Promise(() => {});
  function network(label, run) {
    if (dieAfter !== null && calls >= dieAfter) return hang();
    calls++;
    log.push(label);
    const intercepted = hooks[label]?.();
    if (intercepted === DEAD) return hang();
    if (intercepted) return Promise.resolve(intercepted);
    return Promise.resolve(run());
  }

  function rowMatches(row, filters) {
    return filters.every(([kind, col, val]) => {
      const v = row[col];
      if (kind === "eq") return v === val;
      if (kind === "in") return val.includes(v);
      if (kind === "not-is") return val === null ? v != null : v !== val;
      return true;
    });
  }

  function from(table) {
    const q = { op: "select", filters: [], data: null, single: null, count: false, returning: false };
    const rows = () => (server.tables[table] ||= []);
    function exec() {
      if (q.op === "insert") {
        const items = Array.isArray(q.data) ? q.data : [q.data];
        for (const it of items) rows().push({ id: `row-${++server.seq}`, created_at: new Date(++server.seq).toISOString(), ...clone(it) });
        return { data: null, error: null };
      }
      if (q.op === "update") {
        for (const r of rows().filter((r) => rowMatches(r, q.filters))) Object.assign(r, clone(q.data));
        return { data: null, error: null };
      }
      if (q.op === "upsert" && q.onConflict) {
        // A bulk upsert on a unique key: DO UPDATE sets only the columns
        // sent; ignoreDuplicates is DO NOTHING
        const keys = q.onConflict.split(",");
        const written = [];
        for (const it of (Array.isArray(q.data) ? q.data : [q.data])) {
          const hit = rows().find((r) => keys.every((k) => r[k] === it[k]));
          if (hit) { if (!q.ignoreDuplicates) { Object.assign(hit, clone(it)); written.push(hit); } }
          else { const row = { id: `row-${++server.seq}`, ...clone(it) }; rows().push(row); written.push(row); }
        }
        if (!q.returning) return { data: null, error: null };
        return { data: q.single ? clone(written[0] ?? null) : clone(written), error: null };
      }
      if (q.op === "upsert") {
        const existing = rows().find((r) => r.user_id === q.data.user_id);
        let row;
        if (existing) { Object.assign(existing, clone(q.data)); row = existing; }
        else { row = { id: `row-${++server.seq}`, ...clone(q.data) }; rows().push(row); }
        if (!q.returning) return { data: null, error: null };
        return { data: clone(row), error: null };
      }
      const found = rows().filter((r) => rowMatches(r, q.filters)).map(clone);
      if (q.count) return { data: null, count: found.length, error: null };
      if (q.single === "single") {
        return found.length === 1
          ? { data: found[0], error: null }
          : { data: null, error: { code: "PGRST116", message: "no rows" } };
      }
      if (q.single === "maybe") return { data: found[0] || null, error: null };
      return { data: found, error: null };
    }
    const b = {
      select(_cols, opts) { if (q.op === "select") { if (opts?.count) q.count = true; } else q.returning = true; return b; },
      eq(col, val) { q.filters.push(["eq", col, val]); return b; },
      in(col, vals) { q.filters.push(["in", col, vals]); return b; },
      not(col, op, val) { if (op === "is") q.filters.push(["not-is", col, val]); return b; },
      order() { return b; },
      limit() { return b; },
      insert(data) { q.op = "insert"; q.data = data; return b; },
      update(data) { q.op = "update"; q.data = data; return b; },
      upsert(data, opts) {
        q.op = "upsert"; q.data = data;
        q.onConflict = opts?.onConflict || null; q.ignoreDuplicates = !!opts?.ignoreDuplicates;
        return b;
      },
      single() { q.single = "single"; return b; },
      maybeSingle() { q.single = "maybe"; return b; },
      then(res, rej) { return network(`${q.op}:${table}`, exec).then(res, rej); },
    };
    return b;
  }

  const supabase = {
    from,
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: clone(device.cachedUser) } }, error: null }),
      getUser: () => network("auth:getUser", () => ({ data: { user: clone(server.user) }, error: null })),
      updateUser: ({ data }) => network("auth:updateUser", () => {
        for (const [k, v] of Object.entries(data || {})) {
          if (v === null) delete server.user.user_metadata[k];
          else server.user.user_metadata[k] = clone(v);
        }
        // supabase-js saves the returned user into this device's session
        device.cachedUser = clone(server.user);
        return { data: { user: clone(server.user) }, error: null };
      }),
    },
    rpc: (name, args) => network(`rpc:${name}`, () => {
      if (!server.rpcAvailable || name !== "claim_pending_palate") {
        return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      }
      // Migration 013, one transaction: remove the carrier, record the
      // fold-in with it, hand the palate back. Like any direct SQL write it
      // does NOT refresh a device's cached session user.
      const claimed = server.user.user_metadata.pending_palate ?? null;
      if (claimed == null) return { data: null, error: null };
      delete server.user.user_metadata.pending_palate;
      server.tables.wine_events.push({
        id: `row-${++server.seq}`, user_id: UID, event_type: "quiz_completed",
        payload: clone(args?.p_payload ?? {}), occurred_at: args?.p_occurred_at ?? null,
      });
      return { data: claimed, error: null };
    }),
  };
  return { supabase, log, calls: () => calls };
}

// What page.js's init() does with a session, minus React.
async function loadHome(restore, device, opts) {
  const { supabase, log } = makeClient(device, opts);
  const { data: { session } } = await supabase.auth.getSession();
  const user = session.user;
  const { data: existing } = await supabase.from("wine_profiles").select("*").eq("user_id", user.id).single();
  const out = await restore({ supabase, user, existingRow: existing, storage: device.storage });
  // The old module returned the row; the fixed one returns { row, welcomeBack }
  const norm = out && Object.prototype.hasOwnProperty.call(out, "welcomeBack")
    ? out
    : { row: out || null, welcomeBack: !!out };
  return { ...norm, log };
}

// A load that dies mid-way never returns; race it against a settle tick.
async function loadHomeUntilDeath(restore, device, opts) {
  const settled = loadHome(restore, device, opts).then((r) => ({ done: true, ...r }));
  const tick = new Promise((r) => setTimeout(() => r({ done: false }), 30));
  return Promise.race([settled, tick]);
}

const restoreEvents = (server) =>
  server.tables.wine_events.filter((e) => e.event_type === "quiz_completed" && e.payload?.mode === "restore");

async function main() {
  const { restorePendingPalate } = await import("../pendingPalateRestore.js");
  const { saveStash } = await import("../pendingPalate.js");

  // How many network calls an uninterrupted fold-in makes (from a cold load)
  const probe = makeServer();
  const probeDevice = makeDevice(probe);
  const full = await loadHome(restorePendingPalate, probeDevice);
  const TOTAL = full.log.length;
  // Where the fold-in claims the carrier (1-based call index)
  const CLAIM_AT = full.log.indexOf("rpc:claim_pending_palate") + 1;

  console.log("\n═══ the production shape ═══");

  await test("an uninterrupted fold-in writes one restore event and shows welcome-back once", async () => {
    assert(CLAIM_AT > 0, `the fold-in claims the carrier (calls: ${full.log.join(", ")})`);
    assert(full.row && full.welcomeBack, "the first load folds and welcomes back");
    assert(restoreEvents(probe).length === 1, `restore events: ${restoreEvents(probe).length}`);
    assert(probe.user.user_metadata.pending_palate === undefined, "carrier cleared on the server");
    const again = await loadHome(restorePendingPalate, probeDevice);
    assert(!again.welcomeBack, "a second load is not welcomed back");
    assert(restoreEvents(probe).length === 1, "and writes no second event");
  });

  await test("a page that dies at ANY network call, then reloads three times: one event, one welcome-back, palate kept", async () => {
    const failures = [];
    for (let k = 1; k <= TOTAL; k++) {
      const server = makeServer();
      const device = makeDevice(server);
      const first = await loadHomeUntilDeath(restorePendingPalate, device, { dieAfter: k });
      let welcomes = first.done && first.welcomeBack ? 1 : 0;
      for (let i = 0; i < 3; i++) {
        const r = await loadHome(restorePendingPalate, device);
        if (r.welcomeBack) welcomes++;
      }
      const events = restoreEvents(server).length;
      const profile = server.tables.wine_profiles[0];
      const kept = profile && ANSWERS.countries.every((c) => profile.countries.includes(c));
      // The claim and its record commit together: wherever the page dies,
      // exactly one event — never none, never two
      if (events !== 1 || welcomes > 1 || !kept || server.user.user_metadata.pending_palate) {
        failures.push(`die after ${k}: events=${events} welcomes=${welcomes} kept=${!!kept} carrier=${!!server.user.user_metadata.pending_palate}`);
      }
    }
    assert(failures.length === 0, `\n      ${failures.join("\n      ")}`);
  });

  await test("a reload in the production window (event written, carrier not yet cleared) does not fold again", async () => {
    const server = makeServer();
    const device = makeDevice(server);
    // Die on the first accumulation write after the profile is saved — the
    // ~15 seconds production spent there are where the reloads landed
    let sawUpsert = false;
    const hooks = {
      "upsert:wine_profiles": () => { sawUpsert = true; return undefined; },
      "select:dna_accumulation": () => (sawUpsert ? DEAD : undefined),
    };
    await loadHomeUntilDeath(restorePendingPalate, device, { hooks });
    for (let i = 0; i < 4; i++) await loadHome(restorePendingPalate, device);
    assert(restoreEvents(server).length === 1, `restore events: ${restoreEvents(server).length}`);
  });

  await test("the claim records the event the save would have: mode restore, the quiz's moment, its title", async () => {
    const server = makeServer();
    const device = makeDevice(server);
    await loadHome(restorePendingPalate, device);
    const [e] = restoreEvents(server);
    assert(e.payload.mode === "restore", `mode: ${e.payload.mode}`);
    assert(e.occurred_at === new Date(CREATED_AT).toISOString(), `occurred_at: ${e.occurred_at}`);
    assert(typeof e.payload.title === "string" && e.payload.title.length > 0, "title");
    const direct = server.tables.wine_events.filter((x) => x.event_type === "quiz_completed");
    assert(direct.length === 1, "and nothing recorded beside it");
  });

  console.log("\n═══ caches, devices and tabs ═══");

  await test("a device whose cached session still carries the palate asks the server and folds nothing", async () => {
    const server = makeServer();
    const phone = makeDevice(server);
    const laptop = makeDevice(server); // signed in before the phone folded it
    const a = await loadHome(restorePendingPalate, phone);
    assert(a.welcomeBack, "the phone folds it");
    assert(laptop.cachedUser.user_metadata.pending_palate, "premise: the laptop's cache is stale");
    const b = await loadHome(restorePendingPalate, laptop);
    assert(!b.welcomeBack, "the laptop is not welcomed back");
    assert(restoreEvents(server).length === 1, `restore events: ${restoreEvents(server).length}`);
  });

  await test("two devices loading at the same moment: one fold-in event, one welcome-back", async () => {
    const server = makeServer();
    const a = makeDevice(server);
    const b = makeDevice(server);
    const [ra, rb] = await Promise.all([loadHome(restorePendingPalate, a), loadHome(restorePendingPalate, b)]);
    assert(restoreEvents(server).length === 1, `restore events: ${restoreEvents(server).length}`);
    assert([ra, rb].filter((r) => r.welcomeBack).length === 1, "exactly one welcome-back");
    assert(ra.row && rb.row, "both land on the profile");
  });

  await test("two tabs of one browser (shared storage and session) at the same moment: one event", async () => {
    const server = makeServer();
    const browser = makeDevice(server);
    saveStash(browser.storage, ANSWERS, null, Date.now());
    await Promise.all([loadHome(restorePendingPalate, browser), loadHome(restorePendingPalate, browser)]);
    assert(restoreEvents(server).length === 1, `restore events: ${restoreEvents(server).length}`);
  });

  await test("with the claim function missing (deploy before the migration), sequential loads still fold once", async () => {
    const server = makeServer({ rpc: false });
    const device = makeDevice(server);
    const first = await loadHome(restorePendingPalate, device);
    assert(first.welcomeBack, "folds through the fallback");
    for (let i = 0; i < 3; i++) await loadHome(restorePendingPalate, device);
    const other = makeDevice(server);
    other.cachedUser.user_metadata.pending_palate = { version: 1, createdAt: CREATED_AT, answers: clone(ANSWERS) };
    await loadHome(restorePendingPalate, other);
    assert(restoreEvents(server).length === 1, `restore events: ${restoreEvents(server).length}`);
    assert(!server.user.user_metadata.pending_palate, "carrier cleared");
  });

  console.log("\n═══ a save the caller treats as failed writes nothing to the ledger ═══");

  await test("a profile write that fails writes no quiz_completed and keeps both carriers", async () => {
    const server = makeServer();
    const device = makeDevice(server);
    saveStash(device.storage, ANSWERS, null, Date.now());
    const hooks = { "upsert:wine_profiles": () => ({ data: null, error: { message: "boom" } }) };
    const r = await loadHome(restorePendingPalate, device, { hooks });
    assert(!r.row && !r.welcomeBack, "no row, no welcome-back");
    assert(restoreEvents(server).length === 0, "no event");
    assert(server.user.user_metadata.pending_palate, "metadata carrier kept");
    assert(device.storage.getItem("sommeasy.pendingPalate"), "local stash put back");
    const retry = await loadHome(restorePendingPalate, device);
    assert(retry.welcomeBack && restoreEvents(server).length === 1, "the next load folds it, once");
  });

  await test("an empty read-back after the write no longer turns a landed save into a failure", async () => {
    // Lead (c): saveQuizProfile recorded the event, then re-read the profile;
    // an empty read made the restore count as failed — re-stash, skip the
    // clear, and the next load folded again with the event already written
    const server = makeServer();
    const device = makeDevice(server);
    saveStash(device.storage, ANSWERS, null, Date.now()); // both carriers, as after a same-browser signup
    let upserted = false;
    const hooks = {
      "upsert:wine_profiles": () => { upserted = true; return undefined; },
      "select:wine_profiles": () => (upserted ? { data: null, error: { code: "PGRST116", message: "no rows" } } : undefined),
    };
    await loadHome(restorePendingPalate, device, { hooks });
    await loadHome(restorePendingPalate, device);
    await loadHome(restorePendingPalate, device);
    assert(restoreEvents(server).length === 1, `restore events: ${restoreEvents(server).length}`);
  });

  await test("a failed server check of the carrier folds nothing now and keeps the local stash", async () => {
    const server = makeServer();
    const device = makeDevice(server);
    saveStash(device.storage, ANSWERS, null, Date.now());
    const hooks = { "auth:getUser": () => ({ data: { user: null }, error: { message: "offline" } }) };
    const r = await loadHome(restorePendingPalate, device, { hooks });
    assert(!r.welcomeBack, "no welcome-back on an unverified carrier");
    assert(restoreEvents(server).length === 0, "no event");
    assert(device.storage.getItem("sommeasy.pendingPalate"), "local stash put back");
    const retry = await loadHome(restorePendingPalate, device);
    assert(retry.welcomeBack && restoreEvents(server).length === 1, "the next load folds it, once");
  });

  await test("a plain sign-in with only the local stash folds once and never asks the server about metadata", async () => {
    const server = makeServer({ metadata: false });
    const device = makeDevice(server);
    saveStash(device.storage, ANSWERS, null, Date.now());
    const r = await loadHome(restorePendingPalate, device);
    assert(r.welcomeBack, "welcomed back");
    assert(!r.log.includes("auth:getUser") && !r.log.some((l) => l.startsWith("rpc:")), "no metadata round trips");
    const again = await loadHome(restorePendingPalate, device);
    assert(!again.welcomeBack && restoreEvents(server).length === 1, "once");
  });

  await test("no carrier at all: no network calls beyond the page's own", async () => {
    const server = makeServer({ metadata: false });
    const device = makeDevice(server);
    const r = await loadHome(restorePendingPalate, device);
    assert(!r.row && !r.welcomeBack, "nothing to fold");
    assert(r.log.length === 1, `calls: ${r.log.join(", ")}`);
  });

  await test("a restore over an existing profile unions it in and still writes one event", async () => {
    const server = makeServer();
    server.tables.wine_profiles.push({ id: "p1", user_id: UID, countries: ["italy"], regions: {}, estates: {}, varietals: [], specific_wines: [] });
    const device = makeDevice(server);
    const r = await loadHome(restorePendingPalate, device);
    assert(r.welcomeBack, "welcomed back");
    const p = server.tables.wine_profiles[0];
    assert(["italy", "france", "south_africa"].every((c) => p.countries.includes(c)), `countries: ${p.countries}`);
    assert(restoreEvents(server).length === 1, "one event");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
