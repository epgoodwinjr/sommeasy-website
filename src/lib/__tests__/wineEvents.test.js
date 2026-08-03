// wineEvents test suite — The Long Memory session
// Run with: node src/lib/__tests__/wineEvents.test.js
//
// Tests the REAL module via dynamic import (the sommPicks/pendingPalate
// pattern — wineEvents.js only pulls dnaThresholds.js, which plain node can
// load). Pins the three contracts the session mandate names:
//   1. payload shaping (sanitized JSON, band from the real thresholds)
//   2. the occurred_at back-log rule (stash createdAt → occurred_at)
//   3. fire-and-forget error swallowing — an event failure must NEVER
//      reject the parent action, awaited or not.

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

/** Mock supabase client capturing wine_events inserts. */
function mockDb({ insertError = null, insertThrows = false, insertRejects = false } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      return {
        insert: (row) => {
          if (insertThrows) throw new Error("boom (sync)");
          if (insertRejects) return Promise.reject(new Error("boom (async)"));
          inserted.push({ table, row });
          return Promise.resolve({ error: insertError });
        },
      };
    },
  };
}

async function main() {
  const {
    WINE_EVENT_TYPES,
    confidenceBand,
    toOccurredAtISO,
    buildEventRow,
    ratingEventPayload,
    quizEventPayload,
    pickChosenPayload,
    sommBypassedPayload,
    recordEvent,
  } = await import("../wineEvents.js");
  const { CONFIDENCE_GATE, PARTIAL_CONFIDENCE_GATE } = await import("../dnaThresholds.js");

  const USER = "00000000-0000-4000-8000-000000000000";

  console.log("\n═══ Suite 1: the catalog ═══");

  await test("catalog is exactly the v2 set (13 types — Table Verdict added pick_chosen + somm_bypassed)", () => {
    const expected = [
      "quiz_completed", "menu_analyzed", "pick_rated", "bottle_logged",
      "rec_rated", "wine_wanted", "wine_skipped", "journal_rerated",
      "journal_deleted", "narrative_regenerated", "somm_curation",
      "pick_chosen", "somm_bypassed",
    ];
    assert(WINE_EVENT_TYPES.length === expected.length, `got ${WINE_EVENT_TYPES.length} types`);
    for (const t of expected) {
      assert(WINE_EVENT_TYPES.includes(t), `missing ${t}`);
    }
  });

  console.log("\n═══ Suite 2: payload shaping ═══");

  await test("confidenceBand follows the REAL thresholds (never a local copy)", () => {
    assert(confidenceBand(null) === "none", "null → none");
    assert(confidenceBand(undefined) === "none", "undefined → none");
    assert(confidenceBand("junk") === "none", "junk → none");
    assert(confidenceBand(PARTIAL_CONFIDENCE_GATE - 1) === "none", "below partial gate → none");
    assert(confidenceBand(PARTIAL_CONFIDENCE_GATE) === "partial", "at partial gate → partial");
    assert(confidenceBand(CONFIDENCE_GATE - 1) === "partial", "just under full gate → partial");
    assert(confidenceBand(CONFIDENCE_GATE) === "full", "at full gate → full");
    assert(confidenceBand(100) === "full", "100 → full");
  });

  await test("ratingEventPayload shapes old→new with the band", () => {
    const p = ratingEventPayload({
      wine: "Kanonkop Pinotage", rating: "loved", previousRating: "liked",
      surface: "recommend", confidence: 90,
    });
    assert(p.wine === "Kanonkop Pinotage", "wine");
    assert(p.rating === "loved" && p.previous_rating === "liked", "old→new");
    assert(p.surface === "recommend", "surface");
    assert(p.confidence_band === "full", "band");
  });

  await test("ratingEventPayload defaults previous_rating to null (first rating)", () => {
    const p = ratingEventPayload({ wine: "X", rating: "fine", surface: "home" });
    assert(p.previous_rating === null, "null default");
    assert(p.confidence_band === "none", "no confidence → none");
  });

  await test("quizEventPayload counts every dimension from raw answers", () => {
    const p = quizEventPayload({
      mode: "refine",
      raw: {
        countries: ["france", "south_africa"],
        regions: { france: ["burgundy", "rhone"], south_africa: ["stellenbosch"] },
        estates: { stellenbosch: ["kanonkop"] },
        varietals: ["pinot_noir"],
        specificWines: ["Meerlust Rubicon"],
      },
      title: "The Burgundy Purist",
    });
    assert(p.mode === "refine", "mode");
    assert(p.title === "The Burgundy Purist", "title");
    assert(p.counts.countries === 2, `countries ${p.counts.countries}`);
    assert(p.counts.regions === 3, `regions ${p.counts.regions}`);
    assert(p.counts.estates === 1, `estates ${p.counts.estates}`);
    assert(p.counts.varietals === 1, `varietals ${p.counts.varietals}`);
    assert(p.counts.wines === 1, `wines ${p.counts.wines}`);
  });

  await test("quizEventPayload tolerates an empty/missing raw (all zeros)", () => {
    const p = quizEventPayload({ mode: "fresh", raw: null, title: "The Instinctive Palate" });
    assert(
      p.counts.countries === 0 && p.counts.regions === 0 && p.counts.estates === 0 &&
      p.counts.varietals === 0 && p.counts.wines === 0,
      `got ${JSON.stringify(p.counts)}`
    );
  });

  await test("pickChosenPayload shapes the table declaration (wine identity + context)", () => {
    const p = pickChosenPayload({
      wine: "Ken Forrester Old Vine Chenin Blanc", role: "top", price: 38,
      steer: "  something South African  ", session: "s_abc123",
      replaced: "Kanonkop Pinotage",
    });
    assert(p.wine === "Ken Forrester Old Vine Chenin Blanc", "wine");
    assert(p.role === "top", "role");
    assert(p.price === 38, "price");
    assert(p.steer === "something South African", "steer trimmed");
    assert(p.session === "s_abc123", "session");
    assert(p.replaced === "Kanonkop Pinotage", "replaced (the table changed its mind)");
  });

  await test("pickChosenPayload defaults context to null; junk price dropped", () => {
    const p = pickChosenPayload({ wine: "X", price: "not a number" });
    assert(p.role === null && p.price === null && p.steer === null, "nulls");
    assert(p.session === null && p.replaced === null, "session/replaced null");
    const empty = pickChosenPayload({ wine: "X", steer: "   " });
    assert(empty.steer === null, "whitespace steer → null");
  });

  await test("pickChosenPayload caps a runaway steer at 200 chars (the shared cap)", () => {
    const p = pickChosenPayload({ wine: "X", steer: "z".repeat(500) });
    assert(p.steer.length === 200, `got ${p.steer.length}`);
  });

  await test("sommBypassedPayload shapes the walk-away (session context, no wine required)", () => {
    const p = sommBypassedPayload({
      session: "s_abc123", steer: "big reds", picksShown: 5,
      hadChosen: "Kanonkop Pinotage",
    });
    assert(p.session === "s_abc123", "session");
    assert(p.steer === "big reds", "steer");
    assert(p.picks_shown === 5, "picks_shown");
    assert(p.had_chosen === "Kanonkop Pinotage", "had_chosen (bypass superseded a choice)");
  });

  await test("sommBypassedPayload tolerates junk (all nulls, junk count dropped)", () => {
    const p = sommBypassedPayload({ picksShown: "many" });
    assert(p.session === null && p.steer === null, "nulls");
    assert(p.picks_shown === null && p.had_chosen === null, "junk count → null");
  });

  await test("buildEventRow accepts the two new types", () => {
    const chosen = buildEventRow(USER, "pick_chosen", pickChosenPayload({ wine: "X" }));
    assert(chosen.event_type === "pick_chosen", "pick_chosen accepted");
    const bypassed = buildEventRow(USER, "somm_bypassed", sommBypassedPayload({}));
    assert(bypassed.event_type === "somm_bypassed", "somm_bypassed accepted");
  });

  await test("buildEventRow sanitizes: undefined values dropped, payload defaults to {}", () => {
    const row = buildEventRow(USER, "wine_wanted", { wine: "X", junk: undefined });
    assert(row.user_id === USER && row.event_type === "wine_wanted", "identity");
    assert(!("junk" in row.payload), "undefined dropped");
    const bare = buildEventRow(USER, "wine_wanted");
    assert(JSON.stringify(bare.payload) === "{}", "payload defaults to {}");
  });

  await test("buildEventRow rejects an off-catalog type (programmer error, loud in dev)", () => {
    let threw = false;
    try { buildEventRow(USER, "palate_teleported", {}); } catch { threw = true; }
    assert(threw, "should throw");
  });

  console.log("\n═══ Suite 3: the occurred_at back-log rule ═══");

  await test("occurred_at is OMITTED by default — the DB default now() owns it", () => {
    const row = buildEventRow(USER, "pick_rated", { wine: "X" });
    assert(!("occurred_at" in row), "no occurred_at key");
  });

  await test("a stash createdAt (epoch ms) back-logs occurred_at as ISO", () => {
    const createdAt = Date.UTC(2026, 6, 30, 18, 30, 0); // the quiz actually happened here
    const row = buildEventRow(USER, "quiz_completed", { mode: "restore" }, { occurredAt: createdAt });
    assert(row.occurred_at === new Date(createdAt).toISOString(), `got ${row.occurred_at}`);
  });

  await test("toOccurredAtISO: Date and ISO string pass through; junk → null", () => {
    const d = new Date("2026-07-30T18:30:00.000Z");
    assert(toOccurredAtISO(d) === d.toISOString(), "Date");
    assert(toOccurredAtISO("2026-07-30T18:30:00.000Z") === d.toISOString(), "ISO string");
    assert(toOccurredAtISO("not a date") === null, "junk string");
    assert(toOccurredAtISO(NaN) === null, "NaN");
    assert(toOccurredAtISO(null) === null, "null");
    assert(toOccurredAtISO(-5) === null, "negative epoch");
  });

  await test("junk occurredAt degrades to omission, never a bad row", () => {
    const row = buildEventRow(USER, "quiz_completed", {}, { occurredAt: "not a date" });
    assert(!("occurred_at" in row), "junk → omitted → DB now()");
  });

  console.log("\n═══ Suite 4: fire-and-forget — a failed event never breaks the action ═══");

  await test("happy path inserts one row into wine_events and resolves true", async () => {
    const db = mockDb();
    const ok = await recordEvent(db, USER, "pick_rated",
      ratingEventPayload({ wine: "X", rating: "loved", surface: "recommend", confidence: 85 }));
    assert(ok === true, "resolves true");
    assert(db.inserted.length === 1 && db.inserted[0].table === "wine_events", "one insert");
    assert(db.inserted[0].row.payload.confidence_band === "full", "payload landed");
  });

  await test("back-logged occurred_at rides the inserted row", async () => {
    const db = mockDb();
    const createdAt = Date.UTC(2026, 6, 29, 12, 0, 0);
    await recordEvent(db, USER, "quiz_completed", { mode: "restore" }, { occurredAt: createdAt });
    assert(db.inserted[0].row.occurred_at === new Date(createdAt).toISOString(), "occurred_at inserted");
  });

  await test("a Supabase error result resolves false — no throw", async () => {
    const db = mockDb({ insertError: { message: "RLS says no" } });
    const ok = await recordEvent(db, USER, "wine_skipped", { wine: "X" });
    assert(ok === false, "false, not a throw");
  });

  await test("a synchronously-throwing client resolves false", async () => {
    const ok = await recordEvent(mockDb({ insertThrows: true }), USER, "wine_wanted", { wine: "X" });
    assert(ok === false, "swallowed");
  });

  await test("a rejecting insert resolves false — and un-awaited, never leaks an unhandled rejection", async () => {
    let unhandled = null;
    const trap = (err) => { unhandled = err; };
    process.on("unhandledRejection", trap);
    try {
      // The exact call pattern every surface uses: fire WITHOUT await.
      const pending = recordEvent(mockDb({ insertRejects: true }), USER, "journal_deleted", { wine: "X" });
      await new Promise((r) => setTimeout(r, 20)); // let any rejection surface
      assert(unhandled === null, `leaked: ${unhandled}`);
      assert((await pending) === false, "still resolves false");
    } finally {
      process.off("unhandledRejection", trap);
    }
  });

  await test("an off-catalog type is swallowed too (false, no throw)", async () => {
    const ok = await recordEvent(mockDb(), USER, "palate_teleported", {});
    assert(ok === false, "swallowed");
  });

  await test("a circular payload is swallowed (unserializable → false, no throw)", async () => {
    const circular = {}; circular.self = circular;
    const ok = await recordEvent(mockDb(), USER, "menu_analyzed", circular);
    assert(ok === false, "swallowed");
  });

  await test("a missing user resolves false (anonymous flows never write events)", async () => {
    const db = mockDb();
    const ok = await recordEvent(db, null, "menu_analyzed", { source: "paste" });
    assert(ok === false && db.inserted.length === 0, "no insert without a user");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
