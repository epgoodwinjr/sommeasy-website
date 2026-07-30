// Pending palate (Never Lose a Palate, Session 2) test suite
// Run with: node src/lib/__tests__/pendingPalate.test.js
//
// Tests the REAL module (pendingPalate.js is dependency-free ESM, loaded via
// dynamic import). Storage is an injectable fake, so the stash lifecycle —
// expiry, version gate, claim idempotency, restore-on-failure — is fully
// unit-testable.

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }
function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _size: () => map.size,
  };
}

const ANSWERS = {
  countries: ["south_africa"],
  regions: { south_africa: ["stellenbosch"] },
  estates: { stellenbosch: ["kanonkop"] },
  varietals: ["pinot_noir"],
  specificWines: ["Kanonkop Paul Sauer 2019"],
};
const PROFILE = { archetype: "The Loyalist", raw: ANSWERS };

async function main() {
  const {
    PENDING_PALATE_KEY, STASH_VERSION, STASH_MAX_AGE_MS, METADATA_MAX_CHARS,
    buildStash, parseStash, saveStash, claimStash, clearStash, restoreStash,
    peekStash, buildMetadataPayload, parseMetadataStash,
    unionQuizRaw,
  } = await import("../pendingPalate.js");

  const NOW = 1_800_000_000_000; // fixed clock for determinism

  console.log("\n═══ stash lifecycle ═══");

  test("buildStash carries version, createdAt, answers, profile", () => {
    const s = buildStash(ANSWERS, PROFILE, NOW);
    assert(s.version === STASH_VERSION, "version");
    assert(s.createdAt === NOW, "createdAt");
    assert(deepEq(s.answers, ANSWERS), "answers");
    assert(deepEq(s.profile, PROFILE), "profile");
  });

  test("save → claim roundtrip returns the answers and removes the stash", () => {
    const storage = fakeStorage();
    assert(saveStash(storage, ANSWERS, PROFILE, NOW) === true, "saveStash true");
    assert(storage.getItem(PENDING_PALATE_KEY) !== null, "stored");
    const claimed = claimStash(storage, NOW + 1000);
    assert(claimed !== null, "claimed");
    assert(deepEq(claimed.answers, ANSWERS), "answers roundtrip");
    assert(claimed.createdAt === NOW, "createdAt preserved");
    assert(storage.getItem(PENDING_PALATE_KEY) === null, "stash removed on claim");
  });

  test("claim is idempotent — the second tab finds nothing (double-apply guard)", () => {
    const storage = fakeStorage();
    saveStash(storage, ANSWERS, PROFILE, NOW);
    assert(claimStash(storage, NOW) !== null, "first claim wins");
    assert(claimStash(storage, NOW) === null, "second claim gets null");
  });

  test("restoreStash after a failed save preserves the original createdAt", () => {
    const storage = fakeStorage();
    saveStash(storage, ANSWERS, PROFILE, NOW);
    const claimed = claimStash(storage, NOW + 5000);
    assert(restoreStash(storage, claimed) === true, "restored");
    const reclaimed = claimStash(storage, NOW + 10_000);
    assert(reclaimed !== null, "reclaimable");
    assert(reclaimed.createdAt === NOW, "age not reset — expiry still honest");
  });

  console.log("\n═══ expiry + version gate ═══");

  test("stash within 7 days is valid; a minute past is not (and is cleared)", () => {
    const storage = fakeStorage();
    saveStash(storage, ANSWERS, PROFILE, NOW);
    assert(claimStash(storage, NOW + STASH_MAX_AGE_MS) !== null, "exactly 7 days: valid");

    saveStash(storage, ANSWERS, PROFILE, NOW);
    assert(claimStash(storage, NOW + STASH_MAX_AGE_MS + 60_000) === null, "7 days + 1 min: expired");
    assert(storage.getItem(PENDING_PALATE_KEY) === null, "expired stash cleared");
  });

  test("alien version is rejected and cleared", () => {
    const storage = fakeStorage();
    const alien = { ...buildStash(ANSWERS, PROFILE, NOW), version: STASH_VERSION + 1 };
    storage.setItem(PENDING_PALATE_KEY, JSON.stringify(alien));
    assert(claimStash(storage, NOW) === null, "rejected");
    assert(storage.getItem(PENDING_PALATE_KEY) === null, "cleared");
  });

  test("missing createdAt is treated as expired", () => {
    const r = parseStash(JSON.stringify({ version: STASH_VERSION, answers: ANSWERS }), NOW);
    assert(!r.valid && r.reason === "expired", `got ${r.reason}`);
  });

  console.log("\n═══ corrupt + malformed stashes ═══");

  test("corrupt JSON → invalid + cleared, never throws", () => {
    const storage = fakeStorage();
    storage.setItem(PENDING_PALATE_KEY, "{not json![");
    assert(claimStash(storage, NOW) === null, "null on corrupt");
    assert(storage.getItem(PENDING_PALATE_KEY) === null, "cleared");
  });

  test("empty/absent stash → null", () => {
    assert(claimStash(fakeStorage(), NOW) === null, "absent");
    assert(parseStash(null, NOW).reason === "empty", "null raw");
    assert(parseStash("", NOW).reason === "empty", "empty raw");
  });

  test("answers without countries are malformed — nothing worth saving", () => {
    const bad = [{}, { countries: [] }, { countries: "france" }, null];
    for (const answers of bad) {
      const r = parseStash(JSON.stringify(buildStash(answers, null, NOW)), NOW);
      assert(!r.valid && r.reason === "malformed", `accepted ${JSON.stringify(answers)}`);
    }
  });

  test("saveStash refuses malformed answers (never stashes junk)", () => {
    const storage = fakeStorage();
    assert(saveStash(storage, { countries: [] }, null, NOW) === false, "refused");
    assert(storage._size() === 0, "nothing written");
  });

  test("throwing storage (private mode) never propagates", () => {
    const angry = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    assert(saveStash(angry, ANSWERS, PROFILE, NOW) === false, "save returns false");
    assert(claimStash(angry, NOW) === null, "claim returns null");
    clearStash(angry); // must not throw
  });

  console.log("\n═══ metadata carry (Session 5) — the cross-device fix ═══");

  test("peekStash reads without claiming — the stash survives the peek", () => {
    const storage = fakeStorage();
    saveStash(storage, ANSWERS, PROFILE, NOW);
    const peeked = peekStash(storage, NOW + 1000);
    assert(peeked !== null, "peeked");
    assert(deepEq(peeked.answers, ANSWERS), "answers");
    assert(peeked.createdAt === NOW, "createdAt");
    assert(storage.getItem(PENDING_PALATE_KEY) !== null, "stash must survive — abandon-signup path");
  });

  test("peekStash on absent/expired/throwing storage → null, never throws", () => {
    assert(peekStash(fakeStorage(), NOW) === null, "absent");
    const storage = fakeStorage();
    saveStash(storage, ANSWERS, PROFILE, NOW);
    assert(peekStash(storage, NOW + STASH_MAX_AGE_MS + 60_000) === null, "expired");
    const angry = { getItem: () => { throw new Error("denied"); } };
    assert(peekStash(angry, NOW) === null, "throwing storage");
  });

  test("buildMetadataPayload carries version, createdAt, and ONLY the five quiz dimensions", () => {
    const dirty = { ...ANSWERS, narrative: "x".repeat(500), archetype: "The Loyalist", extras: [1, 2] };
    const payload = buildMetadataPayload(dirty, NOW);
    assert(payload !== null, "built");
    assert(payload.version === STASH_VERSION, "version");
    assert(payload.createdAt === NOW, "createdAt");
    assert(deepEq(payload.answers, ANSWERS), "compact answers only");
    assert(!("narrative" in payload.answers) && !("archetype" in payload.answers), "junk keys dropped");
  });

  test("buildMetadataPayload refuses malformed answers — the carry never gates signup", () => {
    assert(buildMetadataPayload(null, NOW) === null, "null");
    assert(buildMetadataPayload({ countries: [] }, NOW) === null, "empty countries");
    assert(buildMetadataPayload({ varietals: ["syrah"] }, NOW) === null, "no countries at all");
  });

  test("buildMetadataPayload size guard: an implausibly huge stash → null (localStorage-only fallback)", () => {
    const huge = {
      ...ANSWERS,
      specificWines: Array.from({ length: 500 }, (_, i) => `Château Longwinded Grand Cru Classé Bottling No. ${i}`),
    };
    assert(JSON.stringify(huge).length > METADATA_MAX_CHARS, "fixture actually oversized");
    assert(buildMetadataPayload(huge, NOW) === null, "oversized → null");
  });

  test("build → parse metadata roundtrip is content-identical", () => {
    const parsed = parseMetadataStash(buildMetadataPayload(ANSWERS, NOW));
    assert(parsed !== null, "parsed");
    assert(deepEq(parsed.answers, ANSWERS), "answers roundtrip");
    assert(parsed.createdAt === NOW, "createdAt roundtrip");
  });

  test("parseMetadataStash rejects junk: null, strings, arrays, missing/empty answers, alien version", () => {
    const junk = [
      null, undefined, "a string", 42, [],
      {}, { version: STASH_VERSION }, { version: STASH_VERSION, answers: {} },
      { version: STASH_VERSION, answers: { countries: [] } },
      { version: STASH_VERSION + 1, answers: ANSWERS },
    ];
    for (const v of junk) {
      assert(parseMetadataStash(v) === null, `accepted ${JSON.stringify(v)}`);
    }
  });

  test("metadata has NO expiry — a slow email confirmer keeps their palate", () => {
    // The stash's 7-day window protects a shared browser from replaying a
    // stale quiz; metadata is bound to the account the user explicitly
    // created to keep these answers. Three weeks later must still restore.
    const old = { version: STASH_VERSION, createdAt: NOW - 21 * 24 * 60 * 60 * 1000, answers: ANSWERS };
    const parsed = parseMetadataStash(old);
    assert(parsed !== null, "21-day-old metadata still valid");
    assert(deepEq(parsed.answers, ANSWERS), "answers intact");
  });

  test("parseMetadataStash tolerates a missing createdAt (older payloads) — answers still restore", () => {
    const parsed = parseMetadataStash({ version: STASH_VERSION, answers: ANSWERS });
    assert(parsed !== null, "valid without createdAt");
    assert(parsed.createdAt === null, "createdAt null, not NaN/undefined");
  });

  console.log("\n═══ unionQuizRaw — merge, never clobber ═══");

  const EXISTING = {
    countries: ["south_africa", "france"],
    regions: { south_africa: ["stellenbosch"], france: ["burgundy"] },
    estates: { stellenbosch: ["kanonkop"] },
    varietals: ["pinot_noir", "chardonnay", "chenin_blanc"],
    specificWines: ["Meerlust Rubicon"],
  };

  test("stash ⊂ existing → union is content-identical to existing", () => {
    const u = unionQuizRaw(ANSWERS, EXISTING);
    assert(deepEq(new Set(u.countries), new Set(EXISTING.countries)) || deepEq([...u.countries].sort(), [...EXISTING.countries].sort()), "countries");
    assert(deepEq([...u.varietals].sort(), [...EXISTING.varietals].sort()), "varietals");
    assert(deepEq(u.regions.south_africa, ["stellenbosch"]), "regions.za");
    assert(deepEq(u.regions.france, ["burgundy"]), "regions.fr");
    assert(deepEq(u.estates.stellenbosch, ["kanonkop"]), "estates");
  });

  test("disjoint answers → both sides fully survive (never clobber)", () => {
    const stash = {
      countries: ["italy"], regions: { italy: ["tuscany"] },
      estates: {}, varietals: ["sangiovese"], specificWines: ["Tignanello 2019"],
    };
    const u = unionQuizRaw(stash, EXISTING);
    for (const c of ["italy", "south_africa", "france"]) assert(u.countries.includes(c), `country ${c}`);
    assert(deepEq(u.regions.italy, ["tuscany"]), "new region map key");
    assert(deepEq(u.regions.france, ["burgundy"]), "old region map key survives");
    assert(u.varietals.includes("sangiovese") && u.varietals.includes("chenin_blanc"), "varietals both");
    assert(u.specificWines.includes("Tignanello 2019") && u.specificWines.includes("Meerlust Rubicon"), "wines both");
  });

  test("same-country region lists merge without duplicates", () => {
    const u = unionQuizRaw(
      { countries: ["south_africa"], regions: { south_africa: ["stellenbosch", "swartland"] }, estates: {}, varietals: [], specificWines: [] },
      EXISTING
    );
    assert(deepEq([...u.regions.south_africa].sort(), ["stellenbosch", "swartland"]), `got ${u.regions.south_africa}`);
  });

  test("specificWines dedupe case-insensitively (formatWineName would collide them at save)", () => {
    const u = unionQuizRaw(
      { countries: ["south_africa"], regions: {}, estates: {}, varietals: [], specificWines: ["meerlust rubicon"] },
      EXISTING
    );
    assert(u.specificWines.length === 1, `got ${JSON.stringify(u.specificWines)}`);
  });

  test("null/missing sides are tolerated", () => {
    const u = unionQuizRaw(null, EXISTING);
    assert(deepEq([...u.countries].sort(), [...EXISTING.countries].sort()), "null left");
    const u2 = unionQuizRaw(ANSWERS, undefined);
    assert(deepEq([...u2.countries].sort(), [...ANSWERS.countries].sort()), "undefined right");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
