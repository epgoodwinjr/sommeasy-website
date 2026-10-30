// journalView.js — what the journal and a wine's page decide from the
// user's rows (The House List, Phase 4, README §8.4–8.5).
//
// A wine's standing comes from its ONE journal row (wine_interactions is
// unique on user_id + wine_name). Facts come from the row's stored
// resolution, and only a wine with none asks the resolver — at or above the
// confidence gate, so a guess never prints as a fact. "In the same vein" is
// drawn from the recommendations ∪ the journal.
//
// Pure: the resolver is passed in (`resolve`), so this module stays
// dependency-light and journalView.test.js runs the real thing in plain
// node. Junk in → a safe default, never a throw.

import { ratingFor } from "./ratings.js";
import { CONFIDENCE_GATE } from "./dnaThresholds.js";
import { normalizeWineName } from "./matchTerms.js";
import { monthLabel } from "./houseCopy.js";

/** "rated" | "unrated" (a had with no verdict) | "want" | "passed" | "none". */
export function wineStanding(row) {
  if (!row || typeof row !== "object") return "none";
  if (row.interaction_type === "had") return ratingFor(row.rating) ? "rated" : "unrated";
  if (row.interaction_type === "want") return "want";
  if (row.interaction_type === "skip") return "passed";
  return "none";
}

function rowTime(row) {
  const at = new Date(row?.updated_at ?? row?.created_at ?? NaN);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Tried rows (newest first) grouped by the month they were rated:
 * [{ key: "2026-09", label: "September", rows }]. A row with no usable date
 * still shows — in a last "Earlier" group, never dropped.
 */
export function groupByMonth(rows, now = new Date()) {
  if (!Array.isArray(rows)) return [];
  const groups = [];
  const undated = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const at = rowTime(row);
    if (!at) {
      undated.push(row);
      continue;
    }
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: monthLabel(at, now), rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  if (undated.length > 0) groups.push({ key: "undated", label: "Earlier", rows: undated });
  return groups;
}

const NO_FACTS = Object.freeze({ producer: null, region: null, province: null, country: null, grape: null });

/** The row carries a stored resolution (the engine stamped resolved_*) —
 *  then the resolver needn't run at all. */
export function hasStoredResolution(row) {
  return Boolean(row && typeof row === "object" &&
    (row.resolved_winery || row.resolved_region || row.resolved_country || row.resolved_varietal));
}

/**
 * What the page can state about a wine: { producer, region, province,
 * country, grape }. The row's stored resolution (resolved_*) when it has
 * one; otherwise `resolution` (a resolveWine result) only at or above the
 * confidence gate.
 */
export function wineFacts(row, resolution) {
  if (hasStoredResolution(row)) {
    const r = row;
    return {
      producer: r.resolved_winery || null,
      region: r.resolved_region || null,
      province: r.resolved_province || null,
      country: r.resolved_country || null,
      grape: r.resolved_varietal || null,
    };
  }
  if (resolution && resolution.confidence >= CONFIDENCE_GATE) {
    return {
      producer: resolution.winery || null,
      region: resolution.region || null,
      province: resolution.province || null,
      country: resolution.country || null,
      grape: resolution.varietal || null,
    };
  }
  return { ...NO_FACTS };
}

const sameText = (a, b) =>
  typeof a === "string" && typeof b === "string" && a.trim() !== "" && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * "In the same vein" (README §8.5): wines from the recommendations ∪ the
 * journal that share this wine's region or grape. Never the wine itself,
 * never a pass (the Somm steers around those), untried first — a rec not
 * yet in the journal, then a want — then tried bottles, journal order. A
 * rec already in the journal is its row. `resolve(name)` gives a rec's
 * trusted { region, grape } or null.
 * → [{ name, region, grape, row }] (row: its journal row, or null)
 */
export function sameVein({ name, region, grape, journal = [], recs = [], resolve = () => null, limit = 2 } = {}) {
  if (!region && !grape) return [];
  const self = normalizeWineName(name);
  const shares = (r, g) => sameText(r, region) || sameText(g, grape);
  const rows = Array.isArray(journal) ? journal.filter((row) => row && typeof row.wine_name === "string") : [];
  const inJournal = new Set(rows.map((row) => normalizeWineName(row.wine_name)));

  const fromRecs = [];
  for (const rec of Array.isArray(recs) ? recs : []) {
    // Recs lead the order, so once `limit` match, the rest can't place —
    // stop resolving (the resolver costs tens of ms a call)
    if (fromRecs.length >= limit) break;
    if (!rec || typeof rec.wine !== "string") continue;
    const key = normalizeWineName(rec.wine);
    if (!key || key === self || inJournal.has(key)) continue;
    const res = resolve(rec.wine);
    if (res && shares(res.region, res.grape)) {
      fromRecs.push({ name: rec.wine, region: res.region || null, grape: res.grape || null, row: null });
    }
  }

  const wants = [];
  const tried = [];
  for (const row of rows) {
    if (row.interaction_type === "skip" || normalizeWineName(row.wine_name) === self) continue;
    if (!shares(row.resolved_region, row.resolved_varietal)) continue;
    const entry = { name: row.wine_name, region: row.resolved_region || null, grape: row.resolved_varietal || null, row };
    (row.interaction_type === "had" ? tried : wants).push(entry);
  }

  return [...fromRecs, ...wants, ...tried].slice(0, Math.max(0, limit));
}
