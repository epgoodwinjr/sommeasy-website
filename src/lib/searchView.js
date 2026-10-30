// searchView.js — what Search decides (The House List, Phase 5, README §8.6).
//
// One query, three places to look: the user's journal (every row — tried,
// wanted, passed), their DNA (palateView's entries) and the Somm's
// recommendations not yet in the journal. One matcher for all of it, the
// one Log a bottle's search uses (wineSearch.js): every word of the query
// starts some word of the candidate, case- and accent-insensitive — never
// a raw substring. Plus the last five searches, kept in localStorage.
//
// Pure: a recommendation's facts come in as a resolver (`facts`), so
// searchView.test.js runs the real module in plain node. Storage access is
// SSR-safe and junk-tolerant — a corrupt list reads as empty, a failing
// store never throws. Junk in → a safe default, never a throw.

import { prefixMatch, queryWords } from "./wineSearch.js";
import { normalizeWineName } from "./matchTerms.js";

export const RECENT_SEARCHES_KEY = "sommeasy.recentSearches";
export const RECENT_SEARCHES_CAP = 5;

const journalRows = (rows) => (Array.isArray(rows)
  ? rows.filter((r) => r && typeof r === "object" && typeof r.wine_name === "string" && r.wine_name.trim())
  : []);

/** Journal rows whose name, producer, region, province, country or grape
 *  matches — in the order given (the journal's: newest first). */
export function searchJournal(query, rows) {
  const words = queryWords(query);
  if (words.length === 0) return [];
  return journalRows(rows).filter((r) => prefixMatch(words,
    r.wine_name, r.resolved_winery, r.resolved_region, r.resolved_province, r.resolved_country, r.resolved_varietal));
}

/** DNA entries (palateView's dnaEntries) whose name matches. */
export function searchDna(query, entries) {
  const words = queryWords(query);
  if (words.length === 0 || !Array.isArray(entries)) return [];
  return entries.filter((e) => e && typeof e.name === "string" && prefixMatch(words, e.name));
}

/**
 * Recommendations not yet in the journal (by normalized name — written
 * differently is still the same wine), each once, matched on the name or
 * on `facts(name)` → { winery, region, province, country, grape } (the
 * resolver's, trusted only at the confidence gate; null until known).
 */
export function searchRecs(query, { recs, journal, facts } = {}) {
  const words = queryWords(query);
  if (words.length === 0 || !Array.isArray(recs)) return [];
  const taken = new Set(journalRows(journal).map((r) => normalizeWineName(r.wine_name)));
  const found = [];
  for (const rec of recs) {
    if (!rec || typeof rec.wine !== "string") continue;
    const key = normalizeWineName(rec.wine);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    const f = typeof facts === "function" ? facts(rec.wine) : null;
    if (prefixMatch(words, rec.wine, f?.winery, f?.region, f?.province, f?.country, f?.grape)) found.push(rec);
  }
  return found;
}

// Trimmed strings, one of each (written differently is the same search),
// five at most
function cleanRecent(items) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item !== "string") continue;
    const query = item.trim();
    const key = normalizeWineName(query);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= RECENT_SEARCHES_CAP) break;
  }
  return out;
}

/** The list after searching `query`: it moves to the front, as last typed. */
export function addRecentSearch(items, query) {
  const q = typeof query === "string" ? query.trim() : "";
  return cleanRecent(q ? [q, ...(Array.isArray(items) ? items : [])] : items);
}

export function readRecentSearches() {
  try {
    const raw = globalThis.localStorage?.getItem(RECENT_SEARCHES_KEY);
    return raw ? cleanRecent(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Save a search (opening a result, or Enter). Returns the new list. */
export function rememberSearch(query) {
  const next = addRecentSearch(readRecentSearches(), query);
  try {
    globalThis.localStorage?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch { /* private mode / quota: recents are a nicety, never a blocker */ }
  return next;
}
