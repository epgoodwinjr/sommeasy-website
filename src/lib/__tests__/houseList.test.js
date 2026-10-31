// House List foundations suite — The House List, Phase 1
// Run with: node src/lib/__tests__/houseList.test.js
//
// Tests the REAL modules via dynamic import (ratings.js, numerals.js and
// navTrail.js are dependency-free). The rules pinned here:
//   1. ONE rating vocabulary: RATINGS is the four ratings in tile order, its
//      ids are exactly the engine's (RATING_POINTS / PARTIAL_RATING_POINTS
//      keys — the UI can never offer a rating the engine can't score), and
//      a SOURCE SCAN fails if any other file under src/ re-declares the
//      labels instead of importing them.
//   2. Section numerals count only what renders: numeralCounter() hands out
//      I., II., … per call, so a section that doesn't render never takes one.
//   3. The back trail mirrors real history: same page replaces the top
//      (pathname identity, except /wine where the name is the page), a
//      popstate landing on the entry below pops, a link pushes, a fresh tab
//      starts over, 20-entry cap, and storage junk reads as empty — never a
//      throw, never a lying back label.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

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

const SRC = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(js|jsx|ts|tsx)$/.test(name) ? [path] : [];
  });
}

function fakeStorage() {
  const store = {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
}

async function main() {
  const { RATINGS, ratingFor } = await import("../ratings.js");
  const { RATING_POINTS, PARTIAL_RATING_POINTS } = await import("../dnaThresholds.js");
  const { romanNumeral, numeralCounter } = await import("../numerals.js");
  const {
    NAV_TRAIL_KEY, NAV_TRAIL_CAP, HOME_TITLE, PAGE_TITLES,
    titleForPath, wineHref, pageKey, applyVisit, backTarget, backAction,
    readTrail, recordVisit, stepBack,
  } = await import("../navTrail.js");

  console.log("\n═══ Suite 1: one rating vocabulary ═══");

  await test("RATINGS is the four ratings, warmest first, with the house copy", () => {
    assertEq(RATINGS.map((r) => [r.id, r.emoji, r.label]), [
      ["loved", "❤️", "Loved it"],
      ["liked", "👍", "Liked it"],
      ["fine", "😐", "It was fine"],
      ["not_for_me", "👎", "Not for me"],
    ], "catalog");
  });

  await test("the ids are exactly the engine's scoring vocabulary", () => {
    const ids = RATINGS.map((r) => r.id).sort();
    assertEq(ids, Object.keys(RATING_POINTS).sort(), "RATING_POINTS keys");
    assertEq(ids, Object.keys(PARTIAL_RATING_POINTS).sort(), "PARTIAL_RATING_POINTS keys");
  });

  await test("the list and its entries are frozen", () => {
    assert(Object.isFrozen(RATINGS), "list frozen");
    assert(RATINGS.every((r) => Object.isFrozen(r)), "entries frozen");
  });

  await test("ratingFor finds by id; anything else is null", () => {
    assertEq(ratingFor("fine"), { id: "fine", emoji: "😐", label: "It was fine" }, "fine");
    for (const junk of ["meh", null, undefined, 2, ""]) {
      assert(ratingFor(junk) === null, `junk ${JSON.stringify(junk)} → null`);
    }
  });

  await test("SOURCE SCAN: no file under src/ re-declares the rating labels", () => {
    const declared = /(["'`])(Loved it|Liked it|It was fine)\1/;
    const offenders = sourceFiles(SRC)
      .filter((path) => !path.endsWith(join("lib", "ratings.js")))
      .filter((path) => declared.test(readFileSync(path, "utf-8")))
      .map((path) => relative(SRC, path));
    assertEq(offenders, [], "import RATINGS from @/lib/ratings instead");
  });

  console.log("\n═══ Suite 2: section numerals ═══");

  await test("roman numerals with the trailing period", () => {
    assertEq(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 19, 40].map((n) => romanNumeral(n)),
      ["I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII.", "IX.", "X.", "XI.", "XII.", "XIV.", "XIX.", "XL."],
      "upper"
    );
    assertEq([1, 4, 9].map((n) => romanNumeral(n, { lower: true })), ["i.", "iv.", "ix."], "lower (rec rows)");
  });

  await test("nothing below one, nothing from junk", () => {
    for (const junk of [0, -1, 0.5, NaN, null, undefined, "x"]) {
      assertEq(romanNumeral(junk), "", `junk ${String(junk)}`);
    }
  });

  await test("a counter numbers only the sections that render", () => {
    const next = numeralCounter();
    const verdictDue = false;
    const heads = ["Tonight, out", "Tonight, in"].map((label) => ({ label, numeral: next() }));
    if (verdictDue) heads.push({ label: "From last night", numeral: next() });
    heads.push({ label: "Chosen for your palate", numeral: next() });
    assertEq(heads.map((h) => h.numeral), ["I.", "II.", "III."], "the hidden section took no numeral");
    const rows = numeralCounter({ lower: true });
    assertEq([rows(), rows()], ["i.", "ii."], "independent lowercase counter");
  });

  console.log("\n═══ Suite 3: the back trail (pure) ═══");

  const at = (path) => ({ path, title: titleForPath(path.split("?")[0]) || "Wine" });
  const visit = (paths, opts) => paths.reduce((trail, p) => applyVisit(trail, at(p), opts), []);

  await test("every House List page has its README title; others have none", () => {
    assertEq(PAGE_TITLES, {
      "/": "Your list", "/recommend": "Match a list", "/log": "Log a bottle", "/journal": "Journal",
      "/wine": "Wine", "/search": "Search", "/palate": "Your palate", "/account": "Account",
    }, "titles");
    assert(HOME_TITLE === "Your list", "home title");
    assert(titleForPath("/login") === null && titleForPath("/nope") === null, "non-House pages → null");
  });

  await test("wine links encode the name; junk degrades to an empty name", () => {
    assertEq(wineHref("Château Musar 1999 & Co"), "/wine?name=Ch%C3%A2teau%20Musar%201999%20%26%20Co", "encoded");
    assertEq(wineHref(null), "/wine?name=", "junk");
  });

  await test("page identity: pathname, except the wine page's name", () => {
    assertEq(pageKey("/journal?tab=want"), "/journal", "journal tabs are one page");
    assertEq(pageKey("/wine?name=A"), "/wine?name=A", "each wine is its own page");
    assert(pageKey("/wine?name=A") !== pageKey("/wine?name=B"), "two wines differ");
  });

  await test("links push; the back label is the previous page", () => {
    const trail = visit(["/", "/journal", "/wine?name=Raats"]);
    assertEq(trail.map((e) => e.path), ["/", "/journal", "/wine?name=Raats"], "pushed");
    assertEq(backTarget(trail), { label: "Journal", hasPrevious: true }, "label");
  });

  await test("the same page again replaces the top (remount, Your picks, tab switch)", () => {
    let trail = visit(["/", "/recommend"]);
    trail = applyVisit(trail, { path: "/recommend", title: "Your picks" });
    assertEq(trail, [at("/"), { path: "/recommend", title: "Your picks" }], "title replaced, no duplicate");
    trail = visit(["/", "/journal?tab=tried", "/journal?tab=want"]);
    assertEq(trail.map((e) => e.path), ["/", "/journal?tab=want"], "tab switch replaced");
  });

  await test("wine to wine is a real step", () => {
    const trail = visit(["/journal", "/wine?name=A", "/wine?name=B"]);
    assertEq(trail.length, 3, "both wines kept");
    assertEq(backTarget(trail).label, "Wine", "label");
  });

  await test("a traversal onto the entry below pops; a LINK to it pushes", () => {
    const base = visit(["/", "/palate", "/journal"]);
    assertEq(applyVisit(base, at("/palate"), { traversal: true }).map((e) => e.path), ["/", "/palate"], "back gesture pops");
    assertEq(
      applyVisit(base, at("/palate")).map((e) => e.path),
      ["/", "/palate", "/journal", "/palate"],
      "'See what's building' link pushes — back still says Journal"
    );
    assertEq(applyVisit(base, at("/search"), { traversal: true }).map((e) => e.path), ["/", "/palate", "/journal", "/search"], "forward traversal pushes");
  });

  await test("a fresh tab starts a new trail", () => {
    const copied = visit(["/", "/journal"]);
    assertEq(applyVisit(copied, at("/wine?name=X"), { freshTab: true }), [at("/wine?name=X")], "reset");
    assertEq(backTarget([at("/wine?name=X")]), { label: "Your list", hasPrevious: false }, "nowhere back → Your list");
  });

  await test("capped at 20, keeping the newest", () => {
    const paths = Array.from({ length: 25 }, (_, i) => `/wine?name=${i}`);
    const trail = visit(paths);
    assert(NAV_TRAIL_CAP === 20, "cap");
    assertEq(trail.length, 20, "length");
    assertEq(trail[0].path, "/wine?name=5", "oldest dropped");
  });

  await test("junk entries and trails are ignored, never thrown on", () => {
    const trail = applyVisit([null, 42, { path: "nope", title: "x" }, { path: "/", title: "" }, at("/journal")], at("/palate"));
    assertEq(trail.map((e) => e.path), ["/journal", "/palate"], "junk dropped");
    assertEq(applyVisit("garbage", { path: 7 }), [], "junk trail + junk entry");
    assertEq(backTarget(null), { label: "Your list", hasPrevious: false }, "junk trail label");
  });

  await test("back steps through history only when there is some", () => {
    const trail = visit(["/", "/journal"]);
    assertEq(backAction(trail, 3), "back", "previous + history");
    assertEq(backAction(trail, 1), "home", "previous but a fresh tab");
    assertEq(backAction(visit(["/journal"]), 5), "home", "no previous entry");
  });

  console.log("\n═══ Suite 4: storage + traversal wiring ═══");

  await test("SSR (no window, no sessionStorage): reads empty, records without throwing", () => {
    delete globalThis.sessionStorage;
    delete globalThis.window;
    assertEq(readTrail(), [], "empty");
    assertEq(recordVisit(at("/journal")), [at("/journal")], "recorded in memory only");
    assertEq(stepBack(), "home", "nowhere to go → home");
  });

  // A browser stand-in: sessionStorage, history.length, and the popstate the
  // trail listens for (fired the way the browser does — URL first).
  const storage = fakeStorage();
  let onPopstate = null;
  globalThis.sessionStorage = storage;
  globalThis.window = {
    addEventListener: (type, fn) => { if (type === "popstate") onPopstate = fn; },
    history: { length: 10 },
    location: { pathname: "/", search: "" },
  };
  const navigate = (path) => {
    const [pathname, query] = path.split("?");
    window.location.pathname = pathname;
    window.location.search = query ? `?${query}` : "";
  };
  const popTo = (path) => { navigate(path); onPopstate?.(); };
  const land = (path) => recordVisit(at(path));
  const stored = () => readTrail().map((e) => e.path);

  await test("our back button: pop, router.back(), the landing page refreshes itself", () => {
    storage.store[NAV_TRAIL_KEY] = "[]";
    land("/"); land("/journal"); land("/wine?name=Raats");
    assert(typeof onPopstate === "function", "listening for popstate");
    assertEq(stepBack(), "back", "steps back");
    assertEq(stored(), ["/", "/journal"], "popped before router.back()");
    popTo("/journal");
    land("/journal");
    assertEq(stored(), ["/", "/journal"], "landing replaced, no duplicate");
    assertEq(backTarget(readTrail()).label, "Your list", "label on Journal");
  });

  await test("the browser back gesture pops instead of stacking", () => {
    storage.store[NAV_TRAIL_KEY] = "[]";
    land("/"); land("/journal"); land("/wine?name=Raats");
    popTo("/journal");
    land("/journal");
    assertEq(stored(), ["/", "/journal"], "gesture back");
  });

  await test("a link to the page below pushes — a stale popstate never leaks", () => {
    storage.store[NAV_TRAIL_KEY] = "[]";
    land("/"); land("/palate"); land("/journal");
    popTo("/login");      // traversal to a page that records nothing…
    land("/palate");      // …then a plain link: must push, not pop
    assertEq(stored(), ["/", "/palate", "/journal", "/palate"], "pushed");
    assertEq(backTarget(readTrail()).label, "Journal", "label");
  });

  await test("a fresh tab resets a copied trail; back goes home", () => {
    storage.store[NAV_TRAIL_KEY] = JSON.stringify([at("/"), at("/journal")]);
    window.history.length = 1;
    land("/wine?name=Raats");
    assertEq(stored(), ["/wine?name=Raats"], "new trail");
    assertEq(stepBack(), "home", "home");
    window.history.length = 10;
  });

  await test("storage junk reads as empty; a throwing store never breaks a visit", () => {
    storage.store[NAV_TRAIL_KEY] = "{corrupt";
    assertEq(readTrail(), [], "corrupt → empty");
    storage.store[NAV_TRAIL_KEY] = JSON.stringify({ not: "an array" });
    assertEq(readTrail(), [], "non-array → empty");
    globalThis.sessionStorage = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    };
    assertEq(land("/journal"), [at("/journal")], "visit survives");
    assertEq(stepBack(), "home", "back survives");
    globalThis.sessionStorage = storage;
  });

  delete globalThis.sessionStorage;
  delete globalThis.window;

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
