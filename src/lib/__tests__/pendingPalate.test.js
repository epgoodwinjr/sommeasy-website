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
    PENDING_PALATE_KEY, STASH_VERSION, STASH_MAX_AGE_MS,
    buildStash, parseStash, saveStash, claimStash, clearStash, restoreStash,
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
