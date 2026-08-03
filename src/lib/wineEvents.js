// wineEvents.js — The Long Memory: the append-forever usage ledger's ONE
// write path (migration 009).
//
// Sommeasy stores state — what a palate IS — in wine_profiles /
// dna_accumulation; wine_events stores history — what the user DID and
// when. The split with dna_timeline: identity history (promotions,
// demotions, shifts) lives THERE and is never duplicated here; wine_events
// records usage — quiz completions, menu analyses, ratings old→new, intent
// signals, deletions, LLM cost records. The two tables together are the
// full history.
//
// FIRE-AND-FORGET IS THE CONTRACT: recordEvent never throws and never
// rejects — a failed or slow event write must never break, block, or slow
// the user action it describes (same posture as the toasts and the
// recompose hook). Surfaces call it WITHOUT await; server routes may await
// it (a serverless function can freeze un-awaited work) but the swallow
// guarantee holds either way.
//
// occurred_at vs created_at: pass opts.occurredAt ONLY when back-logging a
// moment that happened earlier than the write — today that's exactly one
// path, the anonymous quiz stash folding in after signup (occurredAt = the
// stash's createdAt). Everything else omits it and the DB default now()
// owns both columns.
//
// No PII in payloads beyond what the wine tables already hold (wine names,
// ratings, counts, ids). No IP, no user agent, no location.
//
// Dependency-light on purpose (dnaThresholds only) so the unit suite runs
// the real module in plain node — the sommPicks/pendingPalate pattern.

import { CONFIDENCE_GATE, PARTIAL_CONFIDENCE_GATE } from "./dnaThresholds.js";

/** The catalog — mirrors the wine_events CHECK constraint exactly
 *  (migration 009 v1 set + migration 011's Table Verdict pair). */
export const WINE_EVENT_TYPES = [
  "quiz_completed",        // mode fresh/refine/restore, dimension counts, composed title
  "menu_analyzed",         // source scan/url/paste/pdf, wines parsed, match count, somm outcome
  "pick_rated",            // Somm-pick rating (surface recommend/verdict_prompt): wine, old→new, confidence band
  "bottle_logged",         // label-scan logging: wine, old→new, confidence band
  "rec_rated",             // WineRecList (home/reveal) rating: wine, old→new, confidence band
  "wine_wanted",           // intent: "Want to try"
  "wine_skipped",          // intent: "Not for me"
  "journal_rerated",       // journal rating change (old may be null — first rating from the journal)
  "journal_deleted",       // what was removed, whether points were reversed
  "narrative_regenerated", // cost record: tokens + estCostUSD (server-side)
  "somm_curation",         // cost record: tokens + estCostUSD + outcome
  "pick_chosen",           // Table Verdict: "this one's on the table" — intent, never DNA evidence
  "somm_bypassed",         // Table Verdict: the table went a different way tonight
];

/**
 * The resolution confidence band the evolution engine actually used — from
 * the REAL gates in dnaThresholds, never a local copy. "none" means the
 * rating accumulated nothing (not evidence), "partial" the 60–79 band,
 * "full" 80+.
 */
export function confidenceBand(confidence) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "none";
  if (confidence >= CONFIDENCE_GATE) return "full";
  if (confidence >= PARTIAL_CONFIDENCE_GATE) return "partial";
  return "none";
}

/**
 * Normalize a back-log timestamp (epoch ms, Date, or ISO string) to ISO —
 * or null when it isn't a usable moment, in which case the row simply
 * omits occurred_at and the DB default now() applies. Junk must degrade to
 * omission, never to a rejected insert.
 */
export function toOccurredAtISO(occurredAt) {
  if (occurredAt == null) return null;
  let date = null;
  if (occurredAt instanceof Date) date = occurredAt;
  else if (typeof occurredAt === "number") {
    if (!Number.isFinite(occurredAt) || occurredAt <= 0) return null;
    date = new Date(occurredAt);
  } else if (typeof occurredAt === "string") date = new Date(occurredAt);
  else return null;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Shape one insert-ready row. Throws on programmer error (unknown type,
 * missing user, unserializable payload) — recordEvent swallows those, so
 * production stays safe while dev tests stay loud. The JSON round-trip
 * both proves serializability and drops undefined values.
 */
export function buildEventRow(userId, eventType, payload = {}, { occurredAt } = {}) {
  if (!userId || typeof userId !== "string") {
    throw new Error("wine_events rows need a user — anonymous flows never write events");
  }
  if (!WINE_EVENT_TYPES.includes(eventType)) {
    throw new Error(`unknown wine_events type: ${eventType}`);
  }
  const row = {
    user_id: userId,
    event_type: eventType,
    payload: JSON.parse(JSON.stringify(payload ?? {})),
  };
  const iso = toOccurredAtISO(occurredAt);
  if (iso) row.occurred_at = iso;
  return row;
}

/** The shared shape for every rating-family event (pick_rated,
 *  bottle_logged, rec_rated, journal_rerated): the old→new history the
 *  upsert model discards. */
export function ratingEventPayload({ wine, rating, previousRating = null, surface, confidence } = {}) {
  return {
    wine: wine ?? null,
    rating: rating ?? null,
    previous_rating: previousRating ?? null,
    surface: surface ?? null,
    confidence_band: confidenceBand(confidence),
  };
}

/** quiz_completed payload: mode, per-dimension counts, the composed title. */
export function quizEventPayload({ mode, raw, title } = {}) {
  const r = raw || {};
  const flat = (obj) => Object.values(obj || {}).reduce((n, list) => n + (list || []).length, 0);
  return {
    mode: mode ?? null,
    counts: {
      countries: (r.countries || []).length,
      regions: flat(r.regions),
      estates: flat(r.estates),
      varietals: (r.varietals || []).length,
      wines: (r.specificWines || []).length,
    },
    title: title ?? null,
  };
}

/** Trim + cap a diner steer for an event payload — the same 200-char cap the
 *  somm payload builder and route enforce. Junk or empty → null. */
function eventSteer(steer) {
  if (typeof steer !== "string") return null;
  const trimmed = steer.trim().slice(0, 200);
  return trimmed || null;
}

/**
 * pick_chosen payload (The Table Verdict): the diner declared "this one's on
 * the table". Intent, not evidence — choosing NEVER touches DNA; rating
 * remains the only gate. `session` is the client-minted analysis-session id
 * (also on menu_analyzed / somm_bypassed) so the funnel counts dinners, not
 * page-scans; `replaced` names the previously chosen wine when the table
 * changed its mind.
 */
export function pickChosenPayload({ wine, role, price, steer, session, replaced } = {}) {
  return {
    wine: wine ?? null,
    role: role ?? null,
    price: typeof price === "number" && Number.isFinite(price) ? price : null,
    steer: eventSteer(steer),
    session: session ?? null,
    replaced: replaced ?? null,
  };
}

/**
 * somm_bypassed payload (The Table Verdict): the table went a different way.
 * Session-level — no wine required. `had_chosen` records a pick_chosen this
 * bypass superseded, so the funnel can resolve that session as bypassed.
 */
export function sommBypassedPayload({ session, steer, picksShown, hadChosen } = {}) {
  return {
    session: session ?? null,
    steer: eventSteer(steer),
    picks_shown: typeof picksShown === "number" && Number.isFinite(picksShown) ? picksShown : null,
    had_chosen: hadChosen ?? null,
  };
}

/**
 * Write one event. Never throws, never rejects — resolves false on ANY
 * failure (bad input, RLS refusal, network, a client that throws). Callers
 * on user surfaces fire this without await.
 */
export async function recordEvent(supabase, userId, eventType, payload, opts = {}) {
  try {
    if (!supabase) return false;
    const row = buildEventRow(userId, eventType, payload, opts);
    const { error } = await supabase.from("wine_events").insert(row);
    if (error) {
      console.warn(`[wine-events] ${eventType} insert failed: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[wine-events] ${eventType} failed:`, err?.message || err);
    return false;
  }
}
