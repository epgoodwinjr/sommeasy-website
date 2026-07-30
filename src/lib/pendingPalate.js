// pendingPalate.js — "Never Lose a Palate" (auth overhaul, Session 2).
//
// An anonymous quiz stashes its results in localStorage at reveal time, so
// the signup/email-confirmation round trip can't destroy them (the exact
// failure the July 29 forensics traced: results lived in React state only).
// localStorage, not sessionStorage — the confirmation email opens in a new
// tab, and sessionStorage dies with the original one.
//
// Dependency-free on purpose: unit tests exercise this real module (the
// sommPicks.js pattern). All storage access goes through an injectable
// storage object ({ getItem, setItem, removeItem }) for the same reason.

export const PENDING_PALATE_KEY = "sommeasy.pendingPalate";
export const STASH_VERSION = 1;
export const STASH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Light shape check: a stash without answers worth saving is no stash. */
function answersLookValid(answers) {
  return !!(
    answers &&
    typeof answers === "object" &&
    Array.isArray(answers.countries) &&
    answers.countries.length > 0
  );
}

/** The serializable stash payload: { version, createdAt, answers, profile }. */
export function buildStash(answers, profile, now = Date.now()) {
  return {
    version: STASH_VERSION,
    createdAt: now,
    answers,
    profile: profile || null,
  };
}

/**
 * Parse + validate a raw stash string. Returns
 *   { valid: true, answers, profile, createdAt }
 * or
 *   { valid: false, reason: "empty" | "corrupt" | "version" | "expired" | "malformed" }
 */
export function parseStash(raw, now = Date.now()) {
  if (!raw) return { valid: false, reason: "empty" };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, reason: "corrupt" };
  }
  if (!parsed || typeof parsed !== "object") return { valid: false, reason: "corrupt" };
  if (parsed.version !== STASH_VERSION) return { valid: false, reason: "version" };
  if (typeof parsed.createdAt !== "number" || now - parsed.createdAt > STASH_MAX_AGE_MS) {
    return { valid: false, reason: "expired" };
  }
  if (!answersLookValid(parsed.answers)) return { valid: false, reason: "malformed" };
  return { valid: true, answers: parsed.answers, profile: parsed.profile || null, createdAt: parsed.createdAt };
}

/** Stash quiz results. Storage errors (private mode, quota) never throw. */
export function saveStash(storage, answers, profile, now = Date.now()) {
  if (!answersLookValid(answers)) return false;
  try {
    storage.setItem(PENDING_PALATE_KEY, JSON.stringify(buildStash(answers, profile, now)));
    return true;
  } catch {
    return false;
  }
}

export function clearStash(storage) {
  try {
    storage.removeItem(PENDING_PALATE_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * Read, validate, and REMOVE the stash in one synchronous step. The removal
 * is the two-tab idempotency guard: whichever authenticated tab claims it
 * first owns the save; a second tab (the email-confirmation landing racing
 * the original) finds nothing. Invalid stashes are cleared too — an expired
 * or alien-version stash should never be seen twice.
 *
 * Returns { answers, profile, createdAt } or null. If the subsequent save
 * fails, put it back with restoreStash so nothing is lost.
 */
export function claimStash(storage, now = Date.now()) {
  let raw = null;
  try {
    raw = storage.getItem(PENDING_PALATE_KEY);
  } catch {
    return null;
  }
  const parsed = parseStash(raw, now);
  clearStash(storage);
  if (!parsed.valid) return null;
  return { answers: parsed.answers, profile: parsed.profile, createdAt: parsed.createdAt };
}

/** Re-stash a claimed payload after a failed save, preserving its age. */
export function restoreStash(storage, claimed) {
  if (!claimed) return false;
  return saveStash(storage, claimed.answers, claimed.profile, claimed.createdAt);
}

// ─── Merge helper for restoring over an existing profile ───

function dedupe(list) {
  return [...new Set(list)];
}

/**
 * Union two raw-answers objects, per dimension. Used when a stashed
 * anonymous quiz is folded into an account that already has a profile: the
 * quiz never displayed the existing selections as chips, so nothing counts
 * as a deselection — the only never-clobber semantics are stash ∪ existing.
 * (mergeQuizWithEarnedDna then re-adds earned DNA on top, as on any refine.)
 *
 * specificWines dedupe case-insensitively — "meerlust rubicon" and
 * "Meerlust Rubicon" become one entry (formatWineName normalizes casing at
 * save time, which would otherwise leave literal duplicates).
 */
export function unionQuizRaw(a, b) {
  const left = a || {};
  const right = b || {};

  const regions = {};
  for (const src of [left.regions || {}, right.regions || {}]) {
    for (const [countryId, regionIds] of Object.entries(src)) {
      regions[countryId] = dedupe([...(regions[countryId] || []), ...(regionIds || [])]);
    }
  }

  const estates = {};
  for (const src of [left.estates || {}, right.estates || {}]) {
    for (const [regionId, estateIds] of Object.entries(src)) {
      estates[regionId] = dedupe([...(estates[regionId] || []), ...(estateIds || [])]);
    }
  }

  const specificWines = [];
  const seenWines = new Set();
  for (const wine of [...(left.specificWines || []), ...(right.specificWines || [])]) {
    const key = String(wine).toLowerCase().trim();
    if (!key || seenWines.has(key)) continue;
    seenWines.add(key);
    specificWines.push(wine);
  }

  return {
    countries: dedupe([...(left.countries || []), ...(right.countries || [])]),
    regions,
    estates,
    varietals: dedupe([...(left.varietals || []), ...(right.varietals || [])]),
    specificWines,
  };
}
