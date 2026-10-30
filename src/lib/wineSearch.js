// wineSearch.js — Search by name on Log a bottle (The House List, Phase 2).
//
// Matches a typed query against the user's journal first, then the wine
// catalog (wineAutocomplete.json, loaded by the caller when the search step
// opens — it's 140KB). Word-prefix, case- and accent-insensitive: every word
// of the query must start some word of a candidate's name, producer, region
// or grape. Name matches outrank region/grape matches inside each source.
//
// Journal rows: { wine_name, interaction_type, rating, resolved_winery,
// resolved_region, resolved_varietal }. Catalog entries: { w: producer,
// v: grape, r: region, c: country }. Pure; wineSearch.test.js runs the real
// module in plain node. Junk rows are skipped, never thrown on.

import { journalMark, metaLine } from "./houseCopy.js";

function fold(text) {
  return typeof text === "string"
    ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    : "";
}

function words(...texts) {
  return texts.flatMap((t) => fold(t).split(/[^a-z0-9]+/)).filter(Boolean);
}

const prefixesAll = (queryWords, candidateWords) =>
  queryWords.every((q) => candidateWords.some((w) => w.startsWith(q)));

/** 0 = the name/producer carries every query word, 1 = with region/grape
 *  help, null = no match. */
function tier(queryWords, nameFields, otherFields) {
  const nameWords = words(...nameFields);
  if (prefixesAll(queryWords, nameWords)) return 0;
  if (prefixesAll(queryWords, [...nameWords, ...words(...otherFields)])) return 1;
  return null;
}

/** A catalog pick logs as "{producer} {grape}" unless the producer already
 *  says the grape; no grape → the producer alone. */
function catalogLogName(entry) {
  const grape = typeof entry.v === "string" ? entry.v.trim() : "";
  if (!grape || fold(entry.w).includes(fold(grape))) return entry.w.trim();
  return `${entry.w.trim()} ${grape}`;
}

const byTier = (a, b) => a.tier - b.tier;

/**
 * searchWines("chenin", { journal, catalog }) → up to `limit` results:
 * [{ key, name, meta, mark, logName, source: "journal" | "catalog" }]
 */
export function searchWines(query, { journal = [], catalog = [], limit = 6 } = {}) {
  const queryWords = words(query);
  if (queryWords.length === 0) return [];

  const fromJournal = [];
  const journalNames = new Set();
  for (const row of Array.isArray(journal) ? journal : []) {
    if (!row || typeof row.wine_name !== "string" || !row.wine_name.trim()) continue;
    journalNames.add(fold(row.wine_name.trim()));
    const t = tier(queryWords, [row.wine_name, row.resolved_winery], [row.resolved_region, row.resolved_varietal]);
    if (t === null) continue;
    fromJournal.push({
      tier: t,
      key: `j:${row.wine_name}`,
      name: row.wine_name,
      meta: metaLine(row.resolved_region, row.resolved_varietal),
      mark: journalMark(row),
      logName: row.wine_name,
      source: "journal",
    });
  }

  const fromCatalog = [];
  const seen = new Set();
  for (const entry of Array.isArray(catalog) ? catalog : []) {
    if (!entry || typeof entry.w !== "string" || !entry.w.trim()) continue;
    const t = tier(queryWords, [entry.w], [entry.r, entry.v]);
    if (t === null) continue;
    const logName = catalogLogName(entry);
    const id = fold(logName);
    if (journalNames.has(id) || seen.has(id)) continue;
    seen.add(id);
    fromCatalog.push({
      tier: t,
      key: `c:${logName}`,
      name: entry.w.trim(),
      meta: metaLine(entry.r, entry.v),
      mark: null,
      logName,
      source: "catalog",
    });
  }

  return [...fromJournal.sort(byTier), ...fromCatalog.sort(byTier)]
    .slice(0, limit)
    .map(({ tier: _tier, ...result }) => result);
}
