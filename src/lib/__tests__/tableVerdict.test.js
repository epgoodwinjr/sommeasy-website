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
    resolveOutstandingVerdict,
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

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
