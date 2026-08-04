// firstPour.js — The First Pour: "which onboarding cards does this user
// still need?"
//
// Three quiet cards on home teach the loop's verbs to a zero-bottle user
// (the Aug 3 health report's 3-of-5 stall): rate a wine you know, log
// tonight's bottle, bring us a wine list. Cards are state-aware and
// self-retiring — completion is derived from durable truth
// (wine_interactions / wine_events), NEVER a "seen" flag — so they double
// as feature discovery for light existing users: you only see the cards
// for verbs you haven't done.
//
// This is a UI read of usage history — the DNA/identity engines still never
// read wine_events. Dependency-free on purpose so the unit suite runs the
// real module in plain node (the tableVerdict pattern).

/** Fixed teach order — ascending real-world commitment: a wine you already
 *  know (right now, no bottle needed), tonight's bottle, the next
 *  restaurant. */
export const FIRST_POUR_ORDER = ["rate-one", "log-a-bottle", "bring-a-list"];

/** At most two cards at once — the third surfaces as earlier ones retire. */
export const MAX_VISIBLE_CARDS = 2;

/** source_url values that prove the user has been through /recommend —
 *  the pre-ledger fallback for accounts whose scans predate wine_events. */
function isRecommendProvenance(src) {
  return src === "photo_scan" || src === "text_paste" || /^https?:\/\//.test(src || "");
}

/**
 * Resolve the visible cards from durable truth.
 *
 * Unknown ≠ empty: a null/non-array input means a read FAILED — return
 * silence, never guess (the blackhole posture; a broken table must never
 * surface onboarding to a veteran). Empty arrays are truth: a fresh user.
 *
 * Completion rules (pinned by firstPour.test.js):
 *  - rate-one: any rating-BEARING interaction row. Interactions ONLY, on
 *    purpose — deleting your last rated bottle honestly returns you to
 *    never-rated, whatever the append-forever ledger says (and it keeps
 *    the zero-state e2e fixture restorable).
 *  - log-a-bottle: any bottle_logged event (rows carry no source — the
 *    event is the only durable trace of the camera path).
 *  - bring-a-list: any menu_analyzed event, or provenance in source_url.
 *
 * @param {object} args { interactions: [{rating, source_url}], events:
 *   [{event_type}], dismissedIds: string[] }
 * @returns {string[]} card ids, teach order, at most MAX_VISIBLE_CARDS
 */
export function resolveFirstPourCards({ interactions, events, dismissedIds = [] } = {}) {
  if (!Array.isArray(interactions) || !Array.isArray(events)) return [];

  const rows = interactions.filter((r) => r && typeof r === "object");
  const types = new Set(
    events.filter((e) => e && typeof e === "object").map((e) => e.event_type)
  );

  const done = {
    "rate-one": rows.some((r) => r.rating != null),
    "log-a-bottle": types.has("bottle_logged"),
    "bring-a-list": types.has("menu_analyzed") || rows.some((r) => isRecommendProvenance(r.source_url)),
  };

  return FIRST_POUR_ORDER
    .filter((id) => !done[id] && !dismissedIds.includes(id))
    .slice(0, MAX_VISIBLE_CARDS);
}

// ─── Dismissal storage ───
// Device-local by design (the tableVerdict pattern): dismissing is a "not
// now", not a record — doing the thing is what retires a card everywhere.
// Capped, and every path swallows storage errors (private browsing, SSR,
// quota) — a broken localStorage must never break the page.

const DISMISS_KEY = "sommeasy.firstPourDismissed";
const DISMISS_CAP = 10;

export function readDismissedFirstPour() {
  try {
    const raw = globalThis.localStorage?.getItem(DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function dismissFirstPourCard(cardId) {
  if (!cardId || typeof cardId !== "string") return;
  try {
    const ids = readDismissedFirstPour().filter((id) => id !== cardId);
    ids.push(cardId);
    globalThis.localStorage?.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-DISMISS_CAP)));
  } catch {
    // storage unavailable — the card may reappear; never break the caller
  }
}
