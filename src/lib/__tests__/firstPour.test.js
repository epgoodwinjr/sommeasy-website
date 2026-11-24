// firstPour test suite — The First Pour session
// Run with: node src/lib/__tests__/firstPour.test.js
//
// Tests the REAL module via dynamic import (the tableVerdict pattern —
// firstPour.js is dependency-free so plain node loads it).
//
// The module answers one question from durable data: "which onboarding cards
// does this user still need?" The rules pinned here:
//   1. Cards are state-aware and self-retiring — completion comes from
//      wine_interactions / wine_events truth, never a "seen" flag:
//      rate-one retires on any rating-BEARING interaction row (interactions
//      ONLY, deliberately — deleting your last rated bottle honestly returns
//      you to never-rated, and it keeps the zero-state e2e fixture
//      restorable under append-forever wine_events);
//      log-a-bottle retires on any bottle_logged event;
//      bring-a-list retires on any menu_analyzed event OR an interaction row
//      with /recommend provenance in source_url (the pre-ledger fallback).
//   2. Fixed teach order [rate-one, log-a-bottle, bring-a-list], at most
//      MAX_VISIBLE_CARDS shown — the third surfaces as earlier ones retire
//      or are dismissed.
//   3. Unknown ≠ empty: a null/non-array input means a read FAILED — the
//      resolver returns silence (no cards), never guesses. Empty arrays are
//      truth (fresh user) and show cards.
//   4. Junk rows are skipped, never thrown on; the dismissal store is
//      SSR-safe and capped (the tableVerdict pattern).

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
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`ASSERT FAILED: ${msg} — expected ${e}, got ${a}`);
}

const row = (rating = null, source_url = null) => ({ rating, source_url });

async function main() {
  const {
    FIRST_POUR_ORDER,
    MAX_VISIBLE_CARDS,
    resolveFirstPourCards,
    FIRST_POUR_EVENT_TYPES,
    readDismissedFirstPour,
    dismissFirstPourCard,
  } = await import("../firstPour.js");

  console.log("\n═══ Suite 1: the card set and its order ═══");

  await test("the catalog is the three loop verbs in teach order", () => {
    assertEq(FIRST_POUR_ORDER, ["rate-one", "log-a-bottle", "bring-a-list"], "order");
    assert(MAX_VISIBLE_CARDS === 2, "max visible is 2");
  });

  await test("fresh state (empty truth) → the first two cards", () => {
    assertEq(
      resolveFirstPourCards({ interactions: [], events: [] }),
      ["rate-one", "log-a-bottle"],
      "fresh"
    );
  });

  console.log("\n═══ Suite 2: self-retiring completion ═══");

  await test("any rating-bearing interaction retires rate-one", () => {
    assertEq(
      resolveFirstPourCards({ interactions: [row("fine")], events: [] }),
      ["log-a-bottle", "bring-a-list"],
      "rated"
    );
  });

  await test("a rating-less want row does NOT retire rate-one", () => {
    assertEq(
      resolveFirstPourCards({ interactions: [row(null)], events: [] }),
      ["rate-one", "log-a-bottle"],
      "want row is not a rating"
    );
  });

  await test("a bottle_logged event retires log-a-bottle", () => {
    assertEq(
      resolveFirstPourCards({ interactions: [], events: [{ event_type: "bottle_logged" }] }),
      ["rate-one", "bring-a-list"],
      "bottle logged"
    );
  });

  await test("a menu_analyzed event retires bring-a-list", () => {
    assertEq(
      resolveFirstPourCards({
        interactions: [row("loved")],
        events: [{ event_type: "bottle_logged" }, { event_type: "menu_analyzed" }],
      }),
      [],
      "all three done"
    );
  });

  await test("rate-one is interactions-ONLY: rating events alone never retire it", () => {
    // The deliberate rule: a user who deleted their last rated bottle is
    // honestly never-rated again, whatever the append-forever ledger says
    assertEq(
      resolveFirstPourCards({
        interactions: [],
        events: [{ event_type: "rec_rated" }, { event_type: "pick_rated" }, { event_type: "bottle_logged" }],
      }),
      ["rate-one", "bring-a-list"],
      "events don't retire rate-one"
    );
  });

  console.log("\n═══ Suite 3: the pre-ledger provenance fallback ═══");

  await test("photo_scan / text_paste / http source_url retire bring-a-list", () => {
    for (const src of ["photo_scan", "text_paste", "https://bistro.example/wine", "http://menus.example"]) {
      assertEq(
        resolveFirstPourCards({ interactions: [row(null, src)], events: [] }),
        ["rate-one", "log-a-bottle"],
        `provenance ${src} retires bring-a-list (still 3rd, so same two show)`
      );
      assertEq(
        resolveFirstPourCards({ interactions: [row("loved", src)], events: [] }),
        ["log-a-bottle"],
        `provenance ${src} + rating → only log-a-bottle remains`
      );
    }
  });

  await test("non-provenance source_url does NOT retire bring-a-list", () => {
    assertEq(
      resolveFirstPourCards({ interactions: [row("loved", "e2e_preexist")], events: [] }),
      ["log-a-bottle", "bring-a-list"],
      "junk source is not provenance"
    );
    assertEq(
      resolveFirstPourCards({ interactions: [row("loved", null)], events: [] }),
      ["log-a-bottle", "bring-a-list"],
      "null source is not provenance"
    );
  });

  console.log("\n═══ Suite 4: dismissal filtering + the visible cap ═══");

  await test("a dismissed card yields its slot to the next", () => {
    assertEq(
      resolveFirstPourCards({ interactions: [], events: [], dismissedIds: ["rate-one"] }),
      ["log-a-bottle", "bring-a-list"],
      "dismissed rate-one"
    );
  });

  await test("dismissing everything → no cards", () => {
    assertEq(
      resolveFirstPourCards({
        interactions: [], events: [],
        dismissedIds: ["rate-one", "log-a-bottle", "bring-a-list"],
      }),
      [],
      "all dismissed"
    );
  });

  await test("never more than MAX_VISIBLE_CARDS", () => {
    const cards = resolveFirstPourCards({ interactions: [], events: [] });
    assert(cards.length <= MAX_VISIBLE_CARDS, "cap respected");
  });

  console.log("\n═══ Suite 5: unknown ≠ empty (blackhole tolerance) ═══");

  await test("a failed read (null/undefined/non-array) → silence, never a guess", () => {
    assertEq(resolveFirstPourCards({ interactions: null, events: [] }), [], "interactions failed");
    assertEq(resolveFirstPourCards({ interactions: [], events: null }), [], "events failed");
    assertEq(resolveFirstPourCards({}), [], "both missing");
    assertEq(resolveFirstPourCards({ interactions: "junk", events: [] }), [], "non-array");
    assertEq(resolveFirstPourCards(), [], "no args at all");
  });

  await test("junk rows are skipped, never thrown on", () => {
    assertEq(
      resolveFirstPourCards({
        interactions: [null, "str", 42, {}, row("loved")],
        events: [null, "str", {}, { event_type: "menu_analyzed" }],
      }),
      ["log-a-bottle"],
      "junk tolerated, truth still read"
    );
  });

  console.log("\n═══ Suite 6: the dismissal store (SSR-safe, capped) ═══");

  await test("no localStorage → read returns [], dismiss never throws", () => {
    delete globalThis.localStorage;
    assertEq(readDismissedFirstPour(), [], "SSR read");
    dismissFirstPourCard("rate-one"); // must not throw
  });

  await test("round-trips, dedupes, ignores junk ids, survives corrupt storage", () => {
    let store = {};
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    };
    dismissFirstPourCard("rate-one");
    dismissFirstPourCard("log-a-bottle");
    dismissFirstPourCard("rate-one"); // dedupe
    assertEq(readDismissedFirstPour(), ["log-a-bottle", "rate-one"], "dedupe keeps latest-last");
    dismissFirstPourCard(null);
    dismissFirstPourCard(42);
    assertEq(readDismissedFirstPour(), ["log-a-bottle", "rate-one"], "junk ids ignored");
    store["sommeasy.firstPourDismissed"] = "{corrupt";
    assertEq(readDismissedFirstPour(), [], "corrupt storage reads as empty");
    delete globalThis.localStorage;
  });

  console.log("\n═══ Suite 6: one row of each type is the whole answer (Nov 23, 2026) ═══");

  await test("the event types are exactly the ones completion reads", () => {
    assertEq([...FIRST_POUR_EVENT_TYPES], ["bottle_logged", "menu_analyzed"], "the two types");
    assert(Object.isFrozen(FIRST_POUR_EVENT_TYPES), "frozen");
  });

  await test("one row of each type gives the same cards as the whole history, at any length", () => {
    // Home reads `.eq(type).limit(1)` per type instead of the history: the
    // cards must not care. Seeded, so a failure replays.
    let seed = 1062;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pool = ["bottle_logged", "menu_analyzed", "pick_rated", "quiz_completed"];
    for (let trial = 0; trial < 300; trial++) {
      const n = [0, 1, 2, 5, 999, 1000, 1500][trial % 7];
      const history = Array.from({ length: n }, () => ({ event_type: pool[Math.floor(rand() * pool.length)] }));
      const onePerType = FIRST_POUR_EVENT_TYPES.flatMap((t) => history.filter((e) => e.event_type === t).slice(0, 1));
      const interactions = rand() < 0.5 ? [] : [{ rating: rand() < 0.5 ? null : "liked", source_url: rand() < 0.3 ? "recommend" : null }];
      const dismissedIds = rand() < 0.3 ? ["log-a-bottle"] : [];
      assertEq(
        resolveFirstPourCards({ interactions, events: onePerType, dismissedIds }),
        resolveFirstPourCards({ interactions, events: history, dismissedIds }),
        `trial ${trial} (${n} events)`);
    }
  });

  await test("a capped page of the history could hide a type — the reason home reads one of each", () => {
    // 1,000 menu_analyzed rows, then a bottle_logged: the server's first page
    // holds no bottle_logged at all
    const history = [...Array.from({ length: 1000 }, () => ({ event_type: "menu_analyzed" })), { event_type: "bottle_logged" }];
    const capped = history.slice(0, 1000);
    const onePerType = FIRST_POUR_EVENT_TYPES.flatMap((t) => history.filter((e) => e.event_type === t).slice(0, 1));
    const interactions = [{ rating: null, source_url: null }];
    assert(resolveFirstPourCards({ interactions, events: capped }).includes("log-a-bottle"), "premise: the capped page shows the card");
    assert(!resolveFirstPourCards({ interactions, events: onePerType }).includes("log-a-bottle"), "one of each: the card is done");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
