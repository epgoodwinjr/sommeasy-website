// navTrail.js — the running head's back trail (The House List, README §9.1).
//
// Every House List page records { path, title } in sessionStorage
// (sommeasy.navTrail) on mount. The RunningHead's back button wears the
// previous entry's title and steps back to it, so the trail has to mirror
// the browser's own history — or the label lies ("‹ Journal" that lands on
// home):
//   - The same page again (a remount, a title change like Match a list →
//     Your picks, a journal tab switch, our own back button landing) replaces
//     the top entry. "Same page" means the same pathname — except /wine,
//     where the wine IS the page: /wine?name=A → /wine?name=B is a real step.
//   - A browser back gesture or button (a popstate traversal) landing on the
//     entry below the top pops the top, instead of stacking a duplicate.
//   - A fresh tab (history.length 1 — "open in new tab" can copy
//     sessionStorage) starts a new trail: there's nowhere to go back to.
//   - At most 20 entries.
// The decisions are pure functions over arrays (houseList.test.js runs the
// real module); storage access is SSR-safe and junk-tolerant — a corrupt
// trail reads as empty, never a throw. The React side (useNavTrail) lives
// in components/house/RunningHead.js.

export const NAV_TRAIL_KEY = "sommeasy.navTrail";
export const NAV_TRAIL_CAP = 20;
export const HOME_TITLE = "Your list";

/** Each page's title — the back label it lends the page after it. */
export const PAGE_TITLES = Object.freeze({
  "/": HOME_TITLE,
  "/recommend": "Match a list",
  "/log": "Log a bottle",
  "/journal": "Journal",
  "/wine": "Wine",
  "/search": "Search",
  "/palate": "Your palate",
  "/account": "Account",
});

export function titleForPath(pathname) {
  return PAGE_TITLES[pathname] || null;
}

/** The wine page for a wine name — the one URL every row links with. */
export function wineHref(name) {
  return `/wine?name=${encodeURIComponent(typeof name === "string" ? name : "")}`;
}

// Pages whose query string is part of their identity (see the header).
const KEYED_BY_QUERY = new Set(["/wine"]);

/** What makes two trail entries "the same page". */
export function pageKey(path) {
  const pathname = String(path).split("?")[0];
  return KEYED_BY_QUERY.has(pathname) ? String(path) : pathname;
}

function isEntry(e) {
  return !!e && typeof e.path === "string" && e.path.startsWith("/")
    && typeof e.title === "string" && e.title.length > 0;
}

function clean(trail) {
  return Array.isArray(trail) ? trail.filter(isEntry) : [];
}

/** Record a visit (pure): the trail after landing on `entry`. */
export function applyVisit(trail, entry, { traversal = false, freshTab = false } = {}) {
  const current = clean(trail);
  if (!isEntry(entry)) return current;
  if (freshTab) return [entry];
  const key = pageKey(entry.path);
  const top = current[current.length - 1];
  if (top && pageKey(top.path) === key) return [...current.slice(0, -1), entry];
  const below = current[current.length - 2];
  if (traversal && below && pageKey(below.path) === key) return [...current.slice(0, -2), entry];
  return [...current, entry].slice(-NAV_TRAIL_CAP);
}

/** The back button's label, and whether there's a previous entry at all. */
export function backTarget(trail) {
  const current = clean(trail);
  const previous = current[current.length - 2];
  return previous
    ? { label: previous.title, hasPrevious: true }
    : { label: HOME_TITLE, hasPrevious: false };
}

/** "back" steps through real history (the trail has a previous entry AND
 *  the tab has history to step through); otherwise "home". */
export function backAction(trail, historyLength) {
  return backTarget(trail).hasPrevious && historyLength > 1 ? "back" : "home";
}

export function readTrail() {
  try {
    const raw = globalThis.sessionStorage?.getItem(NAV_TRAIL_KEY);
    return raw ? clean(JSON.parse(raw)).slice(-NAV_TRAIL_CAP) : [];
  } catch {
    return [];
  }
}

function writeTrail(trail) {
  try {
    globalThis.sessionStorage?.setItem(NAV_TRAIL_KEY, JSON.stringify(trail));
  } catch { /* private mode / quota: the trail is a nicety, never a blocker */ }
}

// Where the last popstate (browser back/forward, or our own router.back())
// landed. The visit recorded AT that path is a traversal; any other visit is
// a link — the difference between "went back to Journal" and "tapped a link
// to Journal", which is the difference between pop and push.
let traversalTo = null;
let listening = false;

function listenForTraversals() {
  if (listening || typeof window === "undefined" || !window.addEventListener) return;
  listening = true;
  window.addEventListener("popstate", () => {
    traversalTo = window.location.pathname + window.location.search;
  });
}

/** A House List page mounting at `entry` ({ path, title }). Returns the
 *  trail as recorded. */
export function recordVisit(entry) {
  listenForTraversals();
  const traversal = traversalTo !== null && traversalTo === entry?.path;
  traversalTo = null;
  const freshTab = typeof window !== "undefined" && (window.history?.length ?? 2) <= 1;
  const trail = applyVisit(readTrail(), entry, { traversal, freshTab });
  writeTrail(trail);
  return trail;
}

/** Our back button: "back" pops the top entry first (the page we land on
 *  then finds itself on top and refreshes it); the caller acts on the
 *  answer with the router — router.back() or router.push("/"). */
export function stepBack() {
  const trail = readTrail();
  const historyLength = typeof window !== "undefined" ? window.history?.length ?? 1 : 1;
  const action = backAction(trail, historyLength);
  if (action === "back") writeTrail(trail.slice(0, -1));
  return action;
}
