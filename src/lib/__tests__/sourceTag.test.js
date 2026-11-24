// sourceTag test suite — where an account came from (Nov 2026)
// Run with: node src/lib/__tests__/sourceTag.test.js
//
// Tests the REAL module via dynamic import (sourceTag.js is dependency-free).
// The rules pinned here: what a tag is (and that anything else is ignored,
// never repaired), the first tag winning for 30 days, junk or throwing
// storage degrading to "no tag", and the account write — only a new account,
// only one with no ref, once, never over a ref the server holds, and the
// stored tag cleared once the account carries it.

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

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}
const throwingStorage = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
  removeItem() { throw new Error("SecurityError"); },
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-23T12:00:00Z");

// A scripted Supabase auth: the cached session user, the server's user, and
// a log of every call
function scriptedAuth({ cached, server = cached, getUserError = null, updateError = null } = {}) {
  const calls = [];
  const auth = {
    async getSession() { calls.push("getSession"); return { data: { session: cached ? { user: cached } : null } }; },
    async getUser() {
      calls.push("getUser");
      return getUserError ? { data: { user: null }, error: getUserError } : { data: { user: server }, error: null };
    },
    async updateUser(attrs) {
      calls.push(["updateUser", attrs]);
      if (updateError) return { data: { user: null }, error: updateError };
      server = { ...server, user_metadata: { ...(server?.user_metadata || {}), ...attrs.data } };
      return { data: { user: server }, error: null };
    },
  };
  return { supabase: { auth }, calls, writes: () => calls.filter((c) => Array.isArray(c)) };
}
const user = (ageMs, metadata = {}) => ({
  id: "u1", created_at: new Date(NOW - ageMs).toISOString(), user_metadata: metadata,
});

async function main() {
  const {
    REF_KEY, REF_MAX_AGE_MS, NEW_ACCOUNT_MS,
    cleanRef, refFromSearch, readStoredRef, rememberRef, clearStoredRef,
    accountRef, isNewAccount, tagAccount,
  } = await import("../sourceTag.js");

  console.log("\nSuite 1: what a tag is");

  await test("lowercase letters, digits and hyphens, 1–24 characters", () => {
    for (const ok of ["card", "insta", "ig-nov", "a", "2026", "x-1-y", "a".repeat(24), "-", "invite-from-nicola"]) {
      assertEq(cleanRef(ok), ok, `"${ok}" is a tag`);
    }
  });

  await test("anything else is ignored — never trimmed, lowercased or cut down", () => {
    const bad = [
      "", "a".repeat(25), "Card", "CARD", "card ", " card", "ig_nov", "ig.nov", "ig/nov", "café",
      "card\n", "card%20", "<script>", "a b", "ig+nov", null, undefined, 12, {}, ["card"], true,
    ];
    for (const value of bad) assertEq(cleanRef(value), null, `${JSON.stringify(value)} is not a tag`);
  });

  await test("a page's query string: the ref param, valid or nothing", () => {
    assertEq(refFromSearch("?ref=card"), "card", "the tag");
    assertEq(refFromSearch("?quiz=refine&ref=insta"), "insta", "beside other params");
    assertEq(refFromSearch("?ref=card&ref=insta"), "card", "the first of two");
    assertEq(refFromSearch("?ref=Card"), null, "uppercase is ignored");
    assertEq(refFromSearch("?ref="), null, "empty is ignored");
    assertEq(refFromSearch("?ref=" + "a".repeat(25)), null, "too long is ignored");
    assertEq(refFromSearch("?ref=ig%20nov"), null, "a space is ignored");
    assertEq(refFromSearch("?referrer=card"), null, "another param is not ref");
    assertEq(refFromSearch(""), null, "no query");
    assertEq(refFromSearch(undefined), null, "no string");
  });

  console.log("\nSuite 2: the first tag wins, for 30 days");

  await test("a tag is stored with the time it was set", () => {
    const s = memoryStorage();
    assertEq(rememberRef(s, "card", NOW), "card", "stored");
    assertEq(JSON.parse(s.data[REF_KEY]), { tag: "card", setAt: NOW }, "the stored shape");
    assertEq(readStoredRef(s, NOW), { tag: "card", setAt: NOW }, "read back");
  });

  await test("a later tag never replaces an unexpired one", () => {
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    assertEq(rememberRef(s, "insta", NOW + DAY), "card", "the first is kept");
    assertEq(rememberRef(s, "insta", NOW + REF_MAX_AGE_MS - 1), "card", "kept to its last millisecond");
    assertEq(readStoredRef(s, NOW + 2 * DAY).tag, "card", "still the first");
  });

  await test("an invalid tag never touches what's stored, or stores anything", () => {
    const s = memoryStorage();
    assertEq(rememberRef(s, "Not-A-Tag", NOW), null, "nothing stored");
    assertEq(s.data[REF_KEY], undefined, "storage untouched");
    rememberRef(s, "card", NOW);
    rememberRef(s, "Bad Tag", NOW + 1);
    assertEq(readStoredRef(s, NOW + 2).tag, "card", "the stored tag stands");
  });

  await test("it expires 30 days after it was set; then the next tag takes its place", () => {
    assertEq(REF_MAX_AGE_MS, 30 * DAY, "thirty days");
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    assertEq(readStoredRef(s, NOW + REF_MAX_AGE_MS), null, "expired at thirty days");
    assertEq(s.data[REF_KEY], undefined, "the expired entry is removed");
    const t = memoryStorage();
    rememberRef(t, "card", NOW);
    assertEq(rememberRef(t, "insta", NOW + REF_MAX_AGE_MS), "insta", "the next tag after expiry");
    assertEq(readStoredRef(t, NOW + REF_MAX_AGE_MS).setAt, NOW + REF_MAX_AGE_MS, "set at its own time");
  });

  await test("junk in storage reads as no tag, is removed, and a new tag can be stored", () => {
    const junk = [
      "not json", "null", "42", "[]", "{}", JSON.stringify({ tag: "card" }),
      JSON.stringify({ tag: "Card", setAt: NOW }), JSON.stringify({ tag: "card", setAt: "yesterday" }),
      JSON.stringify({ tag: "card", setAt: NOW + DAY }), // set in the future: a clock that jumped
      JSON.stringify({ tag: "", setAt: NOW }),
    ];
    for (const raw of junk) {
      const s = memoryStorage({ [REF_KEY]: raw });
      assertEq(readStoredRef(s, NOW), null, `${raw} reads as nothing`);
      assertEq(s.data[REF_KEY], undefined, `${raw} is removed`);
      const t = memoryStorage({ [REF_KEY]: raw });
      assertEq(rememberRef(t, "insta", NOW), "insta", `a tag stores over ${raw}`);
    }
  });

  await test("throwing, missing or half-built storage never throws", () => {
    for (const s of [throwingStorage, null, undefined, {}, { getItem: () => null }]) {
      assertEq(readStoredRef(s, NOW), null, "nothing read");
      assertEq(rememberRef(s, "card", NOW), null, "nothing stored");
      clearStoredRef(s);
    }
    const quota = { getItem: () => null, setItem() { throw new Error("QuotaExceededError"); }, removeItem() {} };
    assertEq(rememberRef(quota, "card", NOW), null, "a full storage stores nothing and says so");
  });

  await test("clearing removes the tag", () => {
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    clearStoredRef(s);
    assertEq(readStoredRef(s, NOW), null, "gone");
  });

  console.log("\nSuite 3: which accounts are tagged");

  await test("an account's ref, and nothing else", () => {
    assertEq(accountRef(user(0, { ref: "card" })), "card", "a ref");
    assertEq(accountRef(user(0, {})), null, "none");
    assertEq(accountRef(user(0, { ref: "" })), null, "an empty ref is none");
    assertEq(accountRef(user(0, { ref: 4 })), null, "junk is none");
    assertEq(accountRef(null), null, "no user");
  });

  await test("new means made in the last 24 hours", () => {
    assertEq(NEW_ACCOUNT_MS, DAY, "a day");
    assert(isNewAccount(user(0), NOW), "made just now");
    assert(isNewAccount(user(DAY - 1), NOW), "made a day ago, less a millisecond");
    assert(!isNewAccount(user(DAY), NOW), "a day old is not new");
    assert(!isNewAccount(user(400 * DAY), NOW), "a year old is not new");
    assert(isNewAccount(user(-60 * 1000), NOW), "a server clock a minute ahead still counts");
    assert(!isNewAccount(user(-2 * DAY), NOW), "a creation date far in the future is junk");
    assert(!isNewAccount({ created_at: "soon" }, NOW), "an unreadable date is not new");
    assert(!isNewAccount(null, NOW), "no user");
  });

  console.log("\nSuite 4: the signed-in write (the Google path)");

  await test("a new account with no ref gets the stored tag, once, and the tag is cleared", async () => {
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    const a = scriptedAuth({ cached: user(60 * 1000) });
    assertEq(await tagAccount({ supabase: a.supabase, storage: s, now: NOW }), "tagged", "tagged");
    assertEq(a.writes(), [["updateUser", { data: { ref: "card" } }]], "one write, the ref alone");
    assertEq(s.data[REF_KEY], undefined, "the stored tag is cleared");
    assertEq(await tagAccount({ supabase: a.supabase, storage: s, now: NOW }), "none", "nothing left to do");
    assertEq(a.writes().length, 1, "still one write");
  });

  await test("two calls at once (StrictMode, a page change) write once", async () => {
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    const a = scriptedAuth({ cached: user(1000) });
    const [x, y] = await Promise.all([
      tagAccount({ supabase: a.supabase, storage: s, now: NOW }),
      tagAccount({ supabase: a.supabase, storage: s, now: NOW }),
    ]);
    assertEq([x, y], ["tagged", "tagged"], "the same answer");
    assertEq(a.writes().length, 1, "one write");
  });

  await test("an older account is never tagged, and asks the server nothing", async () => {
    for (const age of [DAY, 3 * DAY, 400 * DAY]) {
      const s = memoryStorage();
      rememberRef(s, "card", NOW);
      const a = scriptedAuth({ cached: user(age) });
      assertEq(await tagAccount({ supabase: a.supabase, storage: s, now: NOW }), "old", `${age / DAY} days old`);
      assertEq(a.calls, ["getSession"], "no request beyond the cached session");
      assertEq(readStoredRef(s, NOW)?.tag, "card", "the tag stays for a new account on this device");
    }
  });

  await test("a ref is never overwritten — cached or only on the server", async () => {
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    const cachedRef = scriptedAuth({ cached: user(1000, { ref: "insta" }) });
    assertEq(await tagAccount({ supabase: cachedRef.supabase, storage: s, now: NOW }), "other_ref", "cached ref");
    assertEq(cachedRef.writes().length, 0, "no write");
    assertEq(readStoredRef(s, NOW)?.tag, "card", "a different tag stays");

    // The session predates a ref written on another device
    const serverRef = scriptedAuth({ cached: user(1000), server: user(1000, { ref: "invite" }) });
    assertEq(await tagAccount({ supabase: serverRef.supabase, storage: s, now: NOW }), "other_ref", "the server's ref");
    assertEq(serverRef.writes().length, 0, "no write over it");
  });

  await test("an account that already carries this tag (email signup) clears it with no write", async () => {
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    const a = scriptedAuth({ cached: user(1000, { ref: "card" }) });
    assertEq(await tagAccount({ supabase: a.supabase, storage: s, now: NOW }), "carried", "carried");
    assertEq(a.calls, ["getSession"], "no request");
    assertEq(s.data[REF_KEY], undefined, "cleared");
    const late = memoryStorage();
    rememberRef(late, "card", NOW);
    const b = scriptedAuth({ cached: user(1000), server: user(1000, { ref: "card" }) });
    assertEq(await tagAccount({ supabase: b.supabase, storage: late, now: NOW }), "carried", "found on the server");
    assertEq(b.writes().length, 0, "no write");
    assertEq(late.data[REF_KEY], undefined, "cleared");
  });

  await test("no stored tag, or signed out: nothing is asked", async () => {
    const empty = scriptedAuth({ cached: user(1000) });
    assertEq(await tagAccount({ supabase: empty.supabase, storage: memoryStorage(), now: NOW }), "none", "no tag");
    assertEq(empty.calls, [], "not even the session");
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    const out = scriptedAuth({ cached: null });
    assertEq(await tagAccount({ supabase: out.supabase, storage: s, now: NOW }), "signed_out", "signed out");
    assertEq(readStoredRef(s, NOW)?.tag, "card", "kept for the signup to come");
  });

  await test("a failure is silent, writes nothing wrong, and keeps the tag for the next load", async () => {
    const cases = [
      scriptedAuth({ cached: user(1000), getUserError: new Error("offline") }),
      scriptedAuth({ cached: user(1000), updateError: new Error("500") }),
      { supabase: { auth: { getSession: async () => { throw new Error("boom"); } } }, writes: () => [] },
      { supabase: null, writes: () => [] },
    ];
    for (const a of cases) {
      const s = memoryStorage();
      rememberRef(s, "card", NOW);
      assertEq(await tagAccount({ supabase: a.supabase, storage: s, now: NOW }), "failed", "failed quietly");
      assertEq(readStoredRef(s, NOW)?.tag, "card", "the tag stays");
    }
    const t = scriptedAuth({ cached: user(1000) });
    assertEq(await tagAccount({ supabase: t.supabase, storage: throwingStorage, now: NOW }), "none", "throwing storage: nothing");
  });

  await test("no write while the account still carries a waiting palate — cached or on the server — then a later page writes", async () => {
    const PALATE = { version: 1, createdAt: NOW - 60 * 1000, answers: { countries: ["france"] } };
    // The cached session still carries the carrier: no request at all
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    const cached = scriptedAuth({ cached: user(1000, { pending_palate: PALATE }) });
    assertEq(await tagAccount({ supabase: cached.supabase, storage: s, now: NOW }), "palate_waiting", "cached carrier");
    assertEq(cached.calls, ["getSession"], "nothing asked, nothing written");
    assertEq(readStoredRef(s, NOW)?.tag, "card", "the tag waits for a later page");

    // The cache is clean but the server still holds it (claimed on another
    // load a moment from now): no write either
    const server = scriptedAuth({ cached: user(1000), server: user(1000, { pending_palate: PALATE }) });
    assertEq(await tagAccount({ supabase: server.supabase, storage: s, now: NOW }), "palate_waiting", "server carrier");
    assertEq(server.writes().length, 0, "no write while the server holds it");
    assertEq(readStoredRef(s, NOW)?.tag, "card", "still waiting");

    // Once the claim has removed it (null, as the fallback clear leaves it),
    // the next page writes the tag — and only the tag
    const claimed = scriptedAuth({ cached: user(1000, { pending_palate: null }), server: user(1000, { pending_palate: null }) });
    assertEq(await tagAccount({ supabase: claimed.supabase, storage: s, now: NOW + 5000 }), "tagged", "tagged after the claim");
    assertEq(claimed.writes(), [["updateUser", { data: { ref: "card" } }]], "the write never names pending_palate");
    assertEq(s.data[REF_KEY], undefined, "cleared");
  });

  await test("the server's word on the account's age wins over the cache", async () => {
    const s = memoryStorage();
    rememberRef(s, "card", NOW);
    const a = scriptedAuth({ cached: user(1000), server: user(5 * DAY) });
    assertEq(await tagAccount({ supabase: a.supabase, storage: s, now: NOW }), "old", "old on the server");
    assertEq(a.writes().length, 0, "no write");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
