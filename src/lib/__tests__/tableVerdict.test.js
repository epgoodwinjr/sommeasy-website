// tableVerdict test suite — The Table Verdict session
// Run with: node src/lib/__tests__/tableVerdict.test.js
//
// Tests the REAL module via dynamic import (the sommPicks/pendingPalate
// pattern — tableVerdict.js is dependency-free so plain node loads it).
//
// The module answers one question from the append-only ledger: "does this
// user have a chosen-but-unrated Somm pick outstanding?" The home page asks
// it on load; the answer drives the one quiet "how was it?" prompt. The
// rules pinned here:
//   1. The LATEST table moment wins — a later bypass or a later choice
//      supersedes an earlier choice; append-only history never resurrects.
//   2. Only a rating-family event for the SAME wine, at-or-after the
//      choice, resolves it — rating remains the only gate that matters.
//   3. The ask expires (14 days) and honors dismissals — never a nag.
//   4. Junk tolerance: malformed rows are skipped, never thrown on — the
//      prompt must degrade to silence, exactly like the fire-and-forget
//      write path.

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

const NOW = Date.UTC(2026, 7, 3, 12, 0, 0); // Aug 3 2026 noon — fixed clock
const DAY = 24 * 60 * 60 * 1000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

let seq = 0;
function ev(type, payload, msAgo, id) {
  return { id: id || `ev_${++seq}`, event_type: type, payload, occurred_at: iso(msAgo) };
}
const chosen = (wine, msAgo, extra = {}, id) =>
  ev("pick_chosen", { wine, role: "top", session: "s_1", ...extra }, msAgo, id);
const bypassed = (msAgo, extra = {}) =>
  ev("somm_bypassed", { session: "s_1", ...extra }, msAgo);
const rated = (type, wine, msAgo) => ev(type, { wine, rating: "loved" }, msAgo);

async function main() {
  const {
    VERDICT_WINDOW_DAYS,
    VERDICT_EVENT_TYPES,
    VERDICT_READ_LIMIT,
    resolveOutstandingVerdict,
    readVerdictAsk,
    readDismissedVerdicts,
    dismissVerdict,
  } = await import("../tableVerdict.js");

  console.log("\n═══ Suite 1: the outstanding ask ═══");

  await test("no events → no ask", () => {
    assert(resolveOutstandingVerdict([], { now: NOW }) === null, "empty");
    assert(resolveOutstandingVerdict(null, { now: NOW }) === null, "null tolerated");
    assert(resolveOutstandingVerdict("junk", { now: NOW }) === null, "non-array tolerated");
  });

  await test("a recent chosen-but-unrated pick → the ask, carrying its context", () => {
    const c = chosen("Ken Forrester Old Vine Chenin Blanc", 2 * DAY, {}, "ev_chosen");
    const ask = resolveOutstandingVerdict([c], { now: NOW });
    assert(ask !== null, "ask exists");
    assert(ask.wine === "Ken Forrester Old Vine Chenin Blanc", "wine");
    assert(ask.id === "ev_chosen", "event id (the dismissal key)");
    assert(ask.role === "top", "role rides along");
    assert(ask.session === "s_1", "session rides along");
    assert(ask.chosenAt === c.occurred_at, "chosenAt");
  });

  await test(`the ask expires after ${14} days (VERDICT_WINDOW_DAYS)`, () => {
    assert(VERDICT_WINDOW_DAYS === 14, "window constant");
    const stale = resolveOutstandingVerdict([chosen("X", 15 * DAY)], { now: NOW });
    assert(stale === null, "15 days → expired");
    const fresh = resolveOutstandingVerdict([chosen("X", 13 * DAY)], { now: NOW });
    assert(fresh !== null, "13 days → still asks");
  });

  console.log("\n═══ Suite 2: rating is the only resolver ═══");

  await test("a later rating of the SAME wine resolves the ask — every rating surface counts", () => {
    for (const type of ["pick_rated", "rec_rated", "journal_rerated", "bottle_logged"]) {
      const events = [chosen("Kanonkop Pinotage", 2 * DAY), rated(type, "Kanonkop Pinotage", 1 * DAY)];
      assert(resolveOutstandingVerdict(events, { now: NOW }) === null, `${type} resolves`);
    }
  });

  await test("a rating of a DIFFERENT wine does not resolve it", () => {
    const events = [chosen("Kanonkop Pinotage", 2 * DAY), rated("pick_rated", "Meerlust Rubicon", 1 * DAY)];
    assert(resolveOutstandingVerdict(events, { now: NOW }) !== null, "still asks");
  });

  await test("a rating BEFORE the choice does not resolve it (she's re-ordering a known wine)", () => {
    const events = [rated("journal_rerated", "Kanonkop Pinotage", 30 * DAY), chosen("Kanonkop Pinotage", 2 * DAY)];
    assert(resolveOutstandingVerdict(events, { now: NOW }) !== null, "still asks");
  });

  await test("wine matching is case- and whitespace-insensitive", () => {
    const events = [chosen("  Kanonkop Pinotage ", 2 * DAY), rated("pick_rated", "kanonkop pinotage", 1 * DAY)];
    assert(resolveOutstandingVerdict(events, { now: NOW }) === null, "resolved despite case/space");
  });

  await test("a rating at the exact same moment counts as after (table-side rating)", () => {
    const events = [chosen("X", 2 * DAY), rated("pick_rated", "X", 2 * DAY)];
    assert(resolveOutstandingVerdict(events, { now: NOW }) === null, ">= resolves");
  });

  console.log("\n═══ Suite 3: the latest table moment wins ═══");

  await test("a later bypass supersedes the choice — no ask", () => {
    const events = [chosen("X", 2 * DAY), bypassed(1 * DAY)];
    assert(resolveOutstandingVerdict(events, { now: NOW }) === null, "bypassed");
  });

  await test("a bypass BEFORE a later choice does not kill it", () => {
    const events = [bypassed(3 * DAY), chosen("X", 1 * DAY)];
    assert(resolveOutstandingVerdict(events, { now: NOW }) !== null, "later choice stands");
  });

  await test("two choices → only the latest asks; rating the EARLIER wine doesn't resolve it", () => {
    const events = [
      chosen("First Wine", 3 * DAY),
      chosen("Second Wine", 1 * DAY),
      rated("pick_rated", "First Wine", 0.5 * DAY),
    ];
    const ask = resolveOutstandingVerdict(events, { now: NOW });
    assert(ask !== null && ask.wine === "Second Wine", "latest choice stands");
  });

  await test("event order in the array doesn't matter (DB order is not a contract)", () => {
    const events = [bypassed(1 * DAY), chosen("X", 2 * DAY)];
    const shuffled = [events[1], events[0]];
    assert(resolveOutstandingVerdict(events, { now: NOW }) === null, "order A");
    assert(resolveOutstandingVerdict(shuffled, { now: NOW }) === null, "order B");
  });

  console.log("\n═══ Suite 4: dismissal + junk tolerance ═══");

  await test("a dismissed ask stays dismissed", () => {
    const c = chosen("X", 2 * DAY, {}, "ev_dismissed_1");
    assert(resolveOutstandingVerdict([c], { now: NOW, dismissedIds: ["ev_dismissed_1"] }) === null, "dismissed");
    assert(resolveOutstandingVerdict([c], { now: NOW, dismissedIds: ["other"] }) !== null, "others don't");
  });

  await test("junk rows are skipped, never thrown on", () => {
    const events = [
      { id: "j1", event_type: "pick_chosen", payload: null, occurred_at: iso(1 * DAY) },
      { id: "j2", event_type: "pick_chosen", payload: { role: "top" }, occurred_at: iso(1 * DAY) }, // no wine
      { id: "j3", event_type: "pick_chosen", payload: { wine: "X" }, occurred_at: "not a date" },
      null,
      "junk",
    ];
    assert(resolveOutstandingVerdict(events, { now: NOW }) === null, "all junk → silence");
    const withValid = [...events, chosen("Real Wine", 2 * DAY)];
    const ask = resolveOutstandingVerdict(withValid, { now: NOW });
    assert(ask !== null && ask.wine === "Real Wine", "valid row still found among junk");
  });

  console.log("\n═══ Suite 5: dismissal storage (SSR-safe, junk-tolerant) ═══");

  await test("without localStorage (plain node/SSR): read → [], dismiss → no throw", () => {
    assert(Array.isArray(readDismissedVerdicts()) && readDismissedVerdicts().length === 0, "[]");
    dismissVerdict("ev_x"); // must not throw
  });

  await test("with localStorage: dismiss/read roundtrip, deduped, junk-tolerant", () => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    };
    try {
      dismissVerdict("ev_a");
      dismissVerdict("ev_b");
      dismissVerdict("ev_a"); // dedupe
      const ids = readDismissedVerdicts();
      assert(ids.includes("ev_a") && ids.includes("ev_b"), "roundtrip");
      assert(ids.filter((x) => x === "ev_a").length === 1, "deduped");
      store[Object.keys(store)[0]] = "{corrupt"; // junk stored value
      assert(readDismissedVerdicts().length === 0, "junk → []");
    } finally {
      delete globalThis.localStorage;
    }
  });

  await test("dismissal storage caps its memory (old ids age out, storage never grows unbounded)", () => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    };
    try {
      for (let i = 0; i < 60; i++) dismissVerdict(`ev_${i}`);
      const ids = readDismissedVerdicts();
      assert(ids.length <= 20, `capped, got ${ids.length}`);
      assert(ids.includes("ev_59"), "newest kept");
      assert(!ids.includes("ev_0"), "oldest aged out");
    } finally {
      delete globalThis.localStorage;
    }
  });

  console.log("\n═══ Suite 4: the read — newest first, bounded (Nov 23, 2026) ═══");

  // A scripted PostgREST over one user's events, kept in INSERTION order (the
  // heap order an append-forever table returns with no ORDER BY). It applies
  // the filters the query names, its order and its limit, then the server's
  // own row cap — so an unordered read gets the OLDEST rows, exactly what
  // dropped the newest choice once the e2e account passed 1,000 events.
  const SERVER_MAX_ROWS = 1000;
  function fakeDb(rows, { fail = null } = {}) {
    const calls = [];
    const client = {
      calls,
      from(table) {
        calls.push(["from", table]);
        const q = { filters: [], order: null, limit: null };
        const chain = {
          select(cols) { calls.push(["select", cols]); return chain; },
          eq(col, v) { calls.push(["eq", col, v]); q.filters.push((r) => (col === "user_id" ? true : r[col] === v)); return chain; },
          in(col, vs) { calls.push(["in", col, vs]); q.filters.push((r) => vs.includes(r[col])); return chain; },
          gte(col, v) { calls.push(["gte", col, v]); q.filters.push((r) => r[col] >= v); return chain; },
          order(col, opts) { calls.push(["order", col, opts]); q.order = { col, asc: opts?.ascending !== false }; return chain; },
          limit(n) { calls.push(["limit", n]); q.limit = n; return chain; },
          then(resolve, reject) {
            if (fail === "throw") return Promise.reject(new Error("network")).then(resolve, reject);
            if (fail === "error") return Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve, reject);
            let out = rows.filter((r) => q.filters.every((f) => f(r)));
            if (q.order) {
              const { col, asc } = q.order;
              out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
            }
            if (q.limit != null) out = out.slice(0, q.limit);
            out = out.slice(0, SERVER_MAX_ROWS);
            return Promise.resolve({ data: out, error: null }).then(resolve, reject);
          },
        };
        return chain;
      },
    };
    return client;
  }
  // `count` events spread over the window, oldest first, then `tail` (newest)
  function history(count, tail = []) {
    const rows = [];
    for (let i = 0; i < count; i++) {
      const msAgo = 13 * DAY - Math.floor((i * 12 * DAY) / Math.max(count, 1));
      rows.push(i % 3 === 0 ? chosen(`Old Wine ${i}`, msAgo) : rated("rec_rated", `Old Wine ${i}`, msAgo - 1000));
    }
    return [...rows, ...tail];
  }

  await test("the read asks for the newest events first, at most VERDICT_READ_LIMIT of them", async () => {
    const db = fakeDb(history(5));
    await readVerdictAsk(db, "u1", { now: NOW });
    const order = db.calls.filter((c) => c[0] === "order");
    const limit = db.calls.filter((c) => c[0] === "limit");
    assert(order.length === 1 && order[0][1] === "occurred_at" && order[0][2]?.ascending === false,
      `newest first by occurred_at, got ${JSON.stringify(order)}`);
    assert(limit.length === 1 && limit[0][1] === VERDICT_READ_LIMIT, `limited to VERDICT_READ_LIMIT, got ${JSON.stringify(limit)}`);
    assert(db.calls.some((c) => c[0] === "from" && c[1] === "wine_events"), "reads wine_events");
    assert(db.calls.some((c) => c[0] === "in" && JSON.stringify(c[2]) === JSON.stringify(VERDICT_EVENT_TYPES)), "the verdict types");
    const gte = db.calls.find((c) => c[0] === "gte");
    assert(gte && gte[1] === "occurred_at" && gte[2] === new Date(NOW - VERDICT_WINDOW_DAYS * DAY).toISOString(), "the window");
  });

  await test("the limit is comfortably above what the resolver needs, and under the server's cap", () => {
    // The resolver needs the newest choice and what came after it; a cap at or
    // over the server's would let the server choose the rows again
    assert(Number.isInteger(VERDICT_READ_LIMIT), "an integer");
    assert(VERDICT_READ_LIMIT >= 100, `room for a long night after a choice (${VERDICT_READ_LIMIT})`);
    assert(VERDICT_READ_LIMIT < SERVER_MAX_ROWS, `under the cap (${VERDICT_READ_LIMIT})`);
  });

  await test("1,062 events in the window (the e2e account, Nov 23): the newest choice is still asked about", async () => {
    const newest = chosen("Ken Forrester Old Vine Reserve Chenin Blanc", 60 * 1000, {}, "ev_newest");
    const rows = history(1061, [newest]);
    // The premise: the old read (no order, no limit) loses it to the cap
    const old = await fakeDb(rows).from("wine_events").select("*").eq("user_id", "u1").in("event_type", VERDICT_EVENT_TYPES)
      .gte("occurred_at", new Date(NOW - VERDICT_WINDOW_DAYS * DAY).toISOString());
    assert(old.data.length === SERVER_MAX_ROWS && !old.data.some((r) => r.id === "ev_newest"), "premise: the capped page drops the newest");
    assert(resolveOutstandingVerdict(old.data, { now: NOW })?.id !== "ev_newest", "premise: and the ask is lost");
    const ask = await readVerdictAsk(fakeDb(rows), "u1", { now: NOW });
    assert(ask && ask.id === "ev_newest" && /Ken Forrester/.test(ask.wine), `the newest choice, got ${JSON.stringify(ask)}`);
  });

  await test("a rating of the chosen wine on the same page still resolves it", async () => {
    const rows = history(1200, [chosen("Meerlust Rubicon", 2 * 3600 * 1000), rated("pick_rated", "Meerlust Rubicon", 3600 * 1000)]);
    assert((await readVerdictAsk(fakeDb(rows), "u1", { now: NOW })) === null, "rated → no ask");
    const walkedAway = history(1200, [chosen("Meerlust Rubicon", 2 * 3600 * 1000), bypassed(3600 * 1000)]);
    assert((await readVerdictAsk(fakeDb(walkedAway), "u1", { now: NOW })) === null, "bypassed → no ask");
  });

  await test("a choice followed by a page of other ratings falls silent, never wrong", async () => {
    const choice = chosen("Meerlust Rubicon", 2 * 3600 * 1000, {}, "ev_c");
    const later = (n) => Array.from({ length: n }, (_, i) => rated("rec_rated", `Other ${i}`, 3600 * 1000 - i * 10));
    const ask = async (n) => readVerdictAsk(fakeDb([choice, ...later(n)]), "u1", { now: NOW });
    assert((await ask(VERDICT_READ_LIMIT - 2))?.id === "ev_c", "room left on the page → the ask");
    assert((await ask(VERDICT_READ_LIMIT - 1)) === null, "a full page ending on the choice → silence");
    assert((await ask(VERDICT_READ_LIMIT)) === null, "the choice pushed off the page → silence");
  });

  await test("a full page that may have cut a moment in two never asks on it", () => {
    // The oldest timestamp on a full page can have siblings past the cut — a
    // rating at the very moment of the choice. Not full, the page is the
    // whole story; full, a choice newer than its oldest row still asks.
    const at = 2 * 3600 * 1000;
    const page = [chosen("Meerlust Rubicon", at, {}, "ev_c")];
    for (let i = 0; i < 4; i++) page.push(rated("rec_rated", `Other ${i}`, at - 1000 * (i + 1)));
    assert(resolveOutstandingVerdict(page, { now: NOW, pageLimit: 5 }) === null, "full, choice at the oldest moment → silence");
    assert(resolveOutstandingVerdict(page, { now: NOW, pageLimit: 6 })?.id === "ev_c", "not full → the ask");
    assert(resolveOutstandingVerdict(page, { now: NOW })?.id === "ev_c", "no page given → the ask, as before");
    const older = [...page, rated("rec_rated", "Older", at + 1000)];
    assert(resolveOutstandingVerdict(older, { now: NOW, pageLimit: 6 })?.id === "ev_c", "full, choice newer than the oldest → the ask");
  });

  await test("a failed read is undefined — never an ask, never a throw", async () => {
    assert((await readVerdictAsk(fakeDb([], { fail: "error" }), "u1", { now: NOW })) === undefined, "an error");
    assert((await readVerdictAsk(fakeDb([], { fail: "throw" }), "u1", { now: NOW })) === undefined, "a rejection");
    assert((await readVerdictAsk({ from() { throw new Error("no client"); } }, "u1", { now: NOW })) === undefined, "a throwing client");
    const db = fakeDb([]);
    assert((await readVerdictAsk(db, null, { now: NOW })) === undefined && db.calls.length === 0, "no user → no read");
    assert((await readVerdictAsk(fakeDb([]), "u1", { now: NOW })) === null, "an empty read is a real 'no ask'");
  });

  await test("dismissals still silence the ask through the read", async () => {
    const rows = [chosen("Meerlust Rubicon", 3600 * 1000, {}, "ev_d")];
    assert((await readVerdictAsk(fakeDb(rows), "u1", { now: NOW, dismissedIds: ["ev_d"] })) === null, "dismissed");
  });

  console.log("\n═══ Suite 5: no read of the ledger lets the server choose its rows ═══");

  // wine_events only grows. A read with no limit returns at most the server's
  // 1,000 rows, and with no order WHICH 1,000 is the planner's call — the
  // Nov 23, 2026 bug. Every read of it in the app must say how many rows it
  // wants (or only count them). Comments are stripped; tests are exempt.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  function sourceFiles(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__") sourceFiles(p, out); }
      else if (/\.(js|jsx|ts|tsx|mjs)$/.test(e.name)) out.push(p);
    }
    return out;
  }
  // Each .from("wine_events") chain, up to the end of its statement or argument
  function ledgerChains(src) {
    const chains = [];
    const re = /\.from\(\s*["']wine_events["']\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      let depth = 0, j = m.index;
      for (; j < src.length; j++) {
        const c = src[j];
        if (c === "(") depth++;
        else if (c === ")") { if (depth === 0) break; depth--; }
        else if ((c === ";" || c === ",") && depth === 0) break;
      }
      chains.push(src.slice(m.index, j).replace(/\s+/g, " "));
    }
    return chains;
  }

  await test("every read of wine_events under src/ names a limit, or only counts", () => {
    let reads = 0;
    const open = [];
    for (const file of sourceFiles(SRC)) {
      for (const chain of ledgerChains(stripComments(fs.readFileSync(file, "utf8")))) {
        if (!/\.select\(/.test(chain)) continue; // a write
        reads++;
        const bounded = /\.limit\(/.test(chain) || /head:\s*true/.test(chain) || /\.(single|maybeSingle)\(\)/.test(chain);
        if (!bounded) open.push(`${path.relative(SRC, file)}: ${chain.slice(0, 120)}`);
      }
    }
    // Today: the verdict ask (tableVerdict.js) and First Pour's existence
    // check (home) — the scan must at least see those two
    assert(reads >= 2, `the scan found the reads (${reads})`);
    assert(open.length === 0, `unbounded wine_events reads:\n      ${open.join("\n      ")}`);
  });

  await test("the scan itself catches an unbounded read", () => {
    const bad = ledgerChains(`supabase.from("wine_events").select("event_type").eq("user_id", id).in("event_type", T);`);
    assert(bad.length === 1 && !/\.limit\(/.test(bad[0]), "an unbounded chain reads as unbounded");
    const good = ledgerChains(`supabase.from("wine_events").select("x").order("occurred_at", { ascending: false }).limit(5), other()`);
    assert(good.length === 1 && /\.limit\(5\)/.test(good[0]) && !/other/.test(good[0]), "a chain stops at its argument's end");
  });

  await test("home reads the verdict through readVerdictAsk, never a query of its own", () => {
    const home = stripComments(fs.readFileSync(path.join(SRC, "app", "page.js"), "utf8"));
    assert(/readVerdictAsk\(/.test(home), "home calls readVerdictAsk");
    assert(!/VERDICT_EVENT_TYPES/.test(home), "home builds no verdict query of its own");
    const verdict = stripComments(fs.readFileSync(path.join(SRC, "lib", "tableVerdict.js"), "utf8"));
    const chains = ledgerChains(verdict);
    assert(chains.length === 1, `one read in tableVerdict.js (${chains.length})`);
    assert(/\.order\(\s*"occurred_at",\s*\{\s*ascending:\s*false\s*\}\s*\)/.test(chains[0]), "newest first");
    assert(/\.limit\(\s*VERDICT_READ_LIMIT\s*\)/.test(chains[0]), "at most VERDICT_READ_LIMIT");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
