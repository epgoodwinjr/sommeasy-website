// matchTerms.js — Match & picks' pure helpers (The House List, Phase 3).
//
// Tonight's terms start from Account › At the table (wine_profiles
// .preferences, decision D8), and a pick meets the user's journal by
// normalized name — the match that lets a pick say "❤️ Loved it in August"
// and keeps an already-rated wine from being rated twice under a
// differently-written name. Dependency-free (matchTerms.test.js runs the
// real module); junk in → a safe default, never a throw.

export const COLORS = Object.freeze(["all", "red", "white", "sparkling"]);

// A saved price as the amount fields hold it: a digit string, or "".
function amount(value) {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return String(Math.round(value));
  return "";
}

/** { color, min, max } for the page's terms state — preferences shaped
 *  { spend: { min, max }, color } (migration 012), or All / empty. */
export function termsFromPreferences(preferences) {
  const p = preferences && typeof preferences === "object" ? preferences : {};
  const spend = p.spend && typeof p.spend === "object" ? p.spend : {};
  return {
    color: COLORS.includes(p.color) ? p.color : "all",
    min: amount(spend.min),
    max: amount(spend.max),
  };
}

// A saved price as preferences hold it: a whole number, or null
function price(value) {
  const digits = amount(value);
  return digits ? Number(digits) : null;
}

/** Account's amount pair (digit strings) as preferences.spend: numbers or
 *  null — a reversed pair ("$90 to $40") saves the way it was meant. */
export function spendFromAmounts(min, max) {
  let lo = price(min), hi = price(max);
  if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
  return { min: lo, max: hi };
}

/** The preferences with one setting changed — { spend } or { color } —
 *  everything else kept. A value that isn't one changes nothing. */
export function preferencesWith(preferences, change) {
  const next = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? { ...preferences } : {};
  const c = change && typeof change === "object" ? change : {};
  if (c.spend && typeof c.spend === "object") next.spend = { min: price(c.spend.min), max: price(c.spend.max) };
  if (COLORS.includes(c.color)) next.color = c.color;
  return next;
}

/** A wine name folded for matching: accents, case, punctuation and runs of
 *  space all fall away. */
export function normalizeWineName(name) {
  if (typeof name !== "string") return "";
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** The journal row a pick already has (wine_interactions rows), matched by
 *  normalized name. When two rows fold to the same name, a rated one wins
 *  — that's the one that decides whether the pick can be rated here. */
export function findJournalRow(name, rows) {
  const key = normalizeWineName(name);
  if (!key || !Array.isArray(rows)) return null;
  let found = null;
  for (const row of rows) {
    if (!row || typeof row !== "object" || normalizeWineName(row.wine_name) !== key) continue;
    if (row.rating) return row;
    found = found || row;
  }
  return found;
}
