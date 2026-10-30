// palateView.js — what Your palate and Search decide from the user's DNA
// (The House List, Phase 5, README §8.6–8.7).
//
// The DNA as rows — countries, regions, grapes, estates — in the names a
// person reads (never an internal id), ✦ on what ratings EARNED (promoted
// with source 'auto'), and the bottles the engine counted
// (dna_accumulation.interaction_count); what's building toward a
// promotion; and the newest moments the palate moved.
//
// Display names come in as a resolver (`names` — dnaNames.js binds it to
// the wine data), so this module stays dependency-light and
// palateView.test.js runs the real thing in plain node. Unknown ≠ empty:
// accumulation or a timeline that couldn't be read arrives as null, and
// whatever depends on it stays unknown — never "from your quiz" or "nothing
// yet" on a guess. Junk in → a safe default, never a throw.

import { PROMOTION_THRESHOLDS } from "./dnaThresholds.js";
import { lovedBottlesAway, shortDate, timelineLine } from "./houseCopy.js";
import { wineHref } from "./navTrail.js";

const KINDS = ["country", "region", "grape", "estate"];
// A kind's dna_accumulation dimension, and back
const DIMENSION_OF = { country: "country", region: "region", grape: "varietal", estate: "estate" };
const KIND_OF = { country: "country", region: "region", varietal: "grape", estate: "estate" };
const GROUP_LABELS = { country: "Countries", region: "Regions", grape: "Grapes", estate: "Estates" };

export const TIMELINE_HREF = "/journal?tab=timeline";

const isId = (v) => typeof v === "string" && v.trim() !== "";
const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const list = (v) => (Array.isArray(v) ? v : []);
const groups = (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.entries(v) : []);

// The last resort before a raw id could ever print: "cote_rotie" → "Cote Rotie"
function prettifyId(id) {
  return id.split("_").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// The profile's DNA in quiz order, each item once: { kind, id, parent } —
// a region's parent is its country, an estate's its region
function listed(profile) {
  const out = [];
  const seen = new Set();
  const add = (kind, id, parent = null) => {
    if (!isId(id) || seen.has(`${kind}:${id}`)) return;
    seen.add(`${kind}:${id}`);
    out.push({ kind, id, parent });
  };
  list(profile.countries).forEach((id) => add("country", id));
  groups(profile.regions).forEach(([countryId, ids]) => list(ids).forEach((id) => add("region", id, countryId)));
  list(profile.varietals).forEach((id) => add("grape", id));
  groups(profile.estates).forEach(([regionId, ids]) => list(ids).forEach((id) => add("estate", id, regionId)));
  return out;
}

function lookup(fn, ...args) {
  try {
    return typeof fn === "function" ? text(fn(...args)) : null;
  } catch {
    return null;
  }
}

const bottlesOf = (row) =>
  Number.isInteger(row?.interaction_count) && row.interaction_count > 0 ? row.interaction_count : 0;

// Within a kind: earned first, then the most bottles, then quiz order
const byStanding = (a, b) =>
  (b.earned - a.earned) || ((b.bottles ?? 0) - (a.bottles ?? 0)) || (a.order - b.order);

/**
 * The DNA as rows: [{ kind, id, name, flag, earned, bottles }], countries →
 * regions → grapes → estates. `names` resolves display names: { country(id),
 * flag(id), region(id, countryId), grape(id), estate(id, regionId) }; a miss
 * falls back to the engine's display_name, then a prettified id. bottles is
 * null when the accumulation is unknown (null).
 */
export function dnaEntries({ profile, accumulation, names = {} } = {}) {
  if (!profile || typeof profile !== "object") return [];
  const known = Array.isArray(accumulation);
  const rows = new Map();
  for (const row of known ? accumulation : []) {
    if (row && typeof row === "object" && isId(row.dimension) && isId(row.dimension_value)) {
      rows.set(`${row.dimension}:${row.dimension_value}`, row);
    }
  }
  const entries = listed(profile).map(({ kind, id, parent }, order) => {
    const row = rows.get(`${DIMENSION_OF[kind]}:${id}`);
    const looked = kind === "country" ? lookup(names.country, id)
      : kind === "region" ? lookup(names.region, id, parent)
      : kind === "grape" ? lookup(names.grape, id)
      : lookup(names.estate, id, parent);
    return {
      kind,
      id,
      name: looked || text(row?.display_name) || prettifyId(id),
      flag: kind === "country" ? lookup(names.flag, id) || "" : "",
      earned: Boolean(known && row?.promoted && row.source === "auto"),
      bottles: known ? bottlesOf(row) : null,
      order,
    };
  });
  return KINDS.flatMap((kind) => entries.filter((e) => e.kind === kind).sort(byStanding))
    .map(({ order: _order, ...entry }) => entry);
}

/** The palate's DNA groups — Countries, Regions, Grapes, Estates — only the
 *  ones with rows: [{ kind, label, entries }]. */
export function dnaGroups(entries) {
  if (!Array.isArray(entries)) return [];
  return KINDS
    .map((kind) => ({ kind, label: GROUP_LABELS[kind], entries: entries.filter((e) => e?.kind === kind) }))
    .filter((g) => g.entries.length > 0);
}

/** Search's Browse your DNA: regions, grapes and estates — not countries. */
export function browseDna(entries) {
  return Array.isArray(entries) ? entries.filter((e) => e && e.kind !== "country") : [];
}

/**
 * Building now: what can genuinely promote — not yet promoted, points on
 * the board, mappable (an unmappable row can never join the DNA, so its
 * "progress" would be a lie), named — closest first, capped at `limit`.
 * → { rows: [{ key, name, kind, dimension, points, threshold, ratio, away }],
 * more } — or null when the accumulation is unknown.
 */
export function buildingNow(accumulation, { limit = 6 } = {}) {
  if (!Array.isArray(accumulation)) return null;
  const building = [];
  for (const row of accumulation) {
    if (!row || typeof row !== "object" || row.promoted || row.mappable === false) continue;
    const threshold = PROMOTION_THRESHOLDS[row.dimension];
    const kind = KIND_OF[row.dimension];
    const points = Number(row.points);
    const name = text(row.display_name);
    if (!threshold || !kind || !(points > 0) || !name) continue;
    building.push({
      key: `${row.dimension}:${row.dimension_value}`,
      name,
      kind,
      dimension: row.dimension,
      points,
      threshold,
      ratio: Math.min(1, points / threshold),
      away: lovedBottlesAway(row.dimension, points),
    });
  }
  building.sort((a, b) => b.ratio - a.ratio);
  const cap = Math.max(0, limit);
  return { rows: building.slice(0, cap), more: Math.max(0, building.length - cap) };
}

/**
 * Recently evolved: the newest `limit` timeline rows the journal can tell
 * (houseCopy's timelineLine), in the order read (newest first). A row that
 * names its wine (dna_timeline.wine_name) opens that wine's page; the rest
 * open the full history. → [{ key, line, date, href }], or null when the
 * timeline is unknown.
 */
export function evolutionRows(timeline, { limit = 3, now = new Date() } = {}) {
  if (!Array.isArray(timeline)) return null;
  const rows = [];
  for (const event of timeline) {
    if (rows.length >= limit) break;
    const line = timelineLine(event);
    if (!line) continue;
    rows.push({
      key: event.id ?? `${event.event_type}:${event.event_at}:${rows.length}`,
      line,
      date: shortDate(event.event_at, now),
      href: isId(event.wine_name) ? wineHref(event.wine_name) : TIMELINE_HREF,
    });
  }
  return rows;
}
