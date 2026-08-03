// tableVerdict.js — The Table Verdict: "did the diner order a pick, and did
// they ever tell us how it was?"
//
// The /recommend results screen is pure client state — nothing survives a
// reload, and a real dinner is analyze-at-7, order-at-7:15, rate-at-9-or-
// tomorrow. So the chosen pick is made durable the moment it's declared
// (a pick_chosen wine_event + a journal wishlist row), and this module
// answers the follow-up from the append-only ledger: the home page loads
// the user's recent verdict-and-rating events and asks
// resolveOutstandingVerdict() whether ONE quiet "how was it?" prompt is due.
//
// This is a UI read of usage history — the DNA/identity engines still never
// read wine_events. Dependency-free on purpose so the unit suite runs the
// real module in plain node (the sommPicks/pendingPalate pattern).

/** The ask expires — a two-week-old dinner is a memory, not a prompt. */
export const VERDICT_WINDOW_DAYS = 14;

/** Every event type the home page needs to resolve the verdict: the two
 *  table declarations plus the rating family (rating anywhere resolves). */
export const VERDICT_EVENT_TYPES = [
  "pick_chosen",
  "somm_bypassed",
  "pick_rated",
  "rec_rated",
  "journal_rerated",
  "bottle_logged",
];

const RATING_TYPES = new Set(["pick_rated", "rec_rated", "journal_rerated", "bottle_logged"]);

/** Case/whitespace-insensitive wine-name key. */
function wineKey(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : null;
}

/** Parse an event's occurred_at to epoch ms, or null when unusable. */
function eventTime(event) {
  const t = new Date(event?.occurred_at ?? NaN).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * The one question: is there a chosen-but-unrated pick outstanding?
 *
 * Rules (pinned by tableVerdict.test.js):
 *  - The LATEST table moment wins: the most recent valid pick_chosen asks;
 *    any somm_bypassed at-or-after it supersedes (the table walked away).
 *  - Only a rating-family event for the SAME wine at-or-after the choice
 *    resolves it — rating remains the only gate.
 *  - Expired (past VERDICT_WINDOW_DAYS) or dismissed asks are silent.
 *  - Junk rows are skipped, never thrown on — the prompt degrades to
 *    silence, same posture as the fire-and-forget write path.
 *
 * @param {Array} events rows of { id, event_type, payload, occurred_at }
 * @param {object} opts  { now?: epoch ms, dismissedIds?: string[] }
 * @returns {null | { id, wine, role, session, chosenAt }}
 */
export function resolveOutstandingVerdict(events, { now = Date.now(), dismissedIds = [] } = {}) {
  if (!Array.isArray(events)) return null;
  const windowStart = now - VERDICT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  let latestChosen = null;
  let latestChosenAt = null;
  for (const event of events) {
    if (!event || typeof event !== "object" || event.event_type !== "pick_chosen") continue;
    const at = eventTime(event);
    const wine = wineKey(event.payload?.wine);
    if (at === null || at < windowStart || at > now || !wine) continue;
    if (latestChosenAt === null || at > latestChosenAt) {
      latestChosen = event;
      latestChosenAt = at;
    }
  }
  if (!latestChosen) return null;
  if (dismissedIds.includes(latestChosen.id)) return null;

  const chosenWine = wineKey(latestChosen.payload.wine);
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const at = eventTime(event);
    if (at === null || at < latestChosenAt) continue;
    if (event.event_type === "somm_bypassed") return null;
    if (RATING_TYPES.has(event.event_type) && wineKey(event.payload?.wine) === chosenWine) return null;
  }

  return {
    id: latestChosen.id,
    wine: latestChosen.payload.wine,
    role: latestChosen.payload.role ?? null,
    session: latestChosen.payload.session ?? null,
    chosenAt: latestChosen.occurred_at,
  };
}

// ─── Dismissal storage ───
// Device-local by design: dismissing the ask is a "not now", not a record —
// worst case it reappears on another device, which is honest. Capped so the
// key never grows unbounded. Every path swallows storage errors (private
// browsing, SSR, quota) — a broken localStorage must never break the page.

const DISMISS_KEY = "sommeasy.verdictDismissed";
const DISMISS_CAP = 20;

export function readDismissedVerdicts() {
  try {
    const raw = globalThis.localStorage?.getItem(DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function dismissVerdict(eventId) {
  if (!eventId || typeof eventId !== "string") return;
  try {
    const ids = readDismissedVerdicts().filter((id) => id !== eventId);
    ids.push(eventId);
    globalThis.localStorage?.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-DISMISS_CAP)));
  } catch {
    // storage unavailable — the ask may reappear; never break the caller
  }
}
