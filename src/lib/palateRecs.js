// palateRecs.js — "Chosen for your palate", ranked from the palate as it
// stands. Pure and dependency-free (the curated list is plain data), so
// home, Search, the wine page and the quiz's reveal run the SAME ranking
// with no wineUnified in their bundles.
//
// Until Nov 23, 2026 the list was built once, at the quiz, and stored in
// wine_profiles.recommendations; nothing rebuilt it as the palate grew. The
// production canary showed it: a Rhône quiz plus five loved Burgundies
// became "The Burgundy Archivist" while home still led with Chave, Torbreck,
// Rayas and an Alsace discovery. Now every surface ranks on read, from:
//
//   the DNA       the profile's countries / regions / estates / varietals —
//                 the quiz's picks AND what ratings promoted (promotions
//                 write the same columns)
//   the points    dna_accumulation.points per dimension — so a rating moves
//                 the list before anything is promoted, and a "not for me"
//                 (negative points) pulls a place, grape or estate down
//
// A dimension's affinity is DNA_WEIGHT if it is in the DNA, plus its
// points. A wine's score is the weighted sum, over estate / region / grape /
// country, of its best affinity in each (its worst, when nothing in that
// dimension is liked — a blend with a disliked grape and nothing loved
// still pays for it). Wines scoring above zero are listed, best first; ties
// keep the curated order (region + grape, then grape, then discovery), so a
// quiz-only palate ranks much as profileEngine's old four passes did.
//
// Reading the list never writes anything: no timeline rows, no toasts, no
// celebrations — a reorder is not a moment. And a reader whose evidence
// read FAILED must not call this with a guess: unknown ≠ empty.

import { WINE_RECS } from "./wineRecs.js";

/** A quiz pick (or a promotion) counts as two loved bottles — the bar an
 *  estate's loyalty pays (PROMOTION_THRESHOLDS.estate). Saying "I love
 *  Syrah" is worth more than one bottle of it. */
export const DNA_WEIGHT = 4;

/** How much each kind of fact moves a wine. Country is the faintest: every
 *  rating writes a country's points beside its region's, so at full weight
 *  five loved Burgundies would lift every French wine — a Bordeaux included
 *  — over the Syrah the quiz named. */
export const DIMENSION_WEIGHTS = Object.freeze({ estate: 6, region: 4, varietal: 4, country: 1 });

/** The most wines a ranking returns (profileEngine stored 20 too). */
export const PALATE_RECS_LIMIT = 20;

// A DNA column is an array of ids, or (regions, estates) an object of
// arrays keyed by country / region
function idsOf(column) {
  if (Array.isArray(column)) return column.filter((v) => typeof v === "string");
  if (column && typeof column === "object") {
    return Object.values(column).flatMap((v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []));
  }
  return [];
}

/**
 * The palate's affinity for every dimension it knows: `dimension:id` →
 * number. `profile` is a wine_profiles row or quiz answers (the same four
 * columns); `accumulation` is dna_accumulation rows (dimension,
 * dimension_value, points).
 */
export function palateAffinity({ profile, accumulation } = {}) {
  const affinity = new Map();
  const add = (key, n) => affinity.set(key, (affinity.get(key) || 0) + n);
  const p = profile && typeof profile === "object" ? profile : {};
  for (const id of new Set(idsOf(p.countries))) add(`country:${id}`, DNA_WEIGHT);
  for (const id of new Set(idsOf(p.regions))) add(`region:${id}`, DNA_WEIGHT);
  for (const id of new Set(idsOf(p.estates))) add(`estate:${id}`, DNA_WEIGHT);
  for (const id of new Set(idsOf(p.varietals))) add(`varietal:${id}`, DNA_WEIGHT);
  for (const row of Array.isArray(accumulation) ? accumulation : []) {
    if (!row || typeof row.dimension_value !== "string" || !(row.dimension in DIMENSION_WEIGHTS)) continue;
    const points = Number(row.points);
    if (Number.isFinite(points) && points !== 0) add(`${row.dimension}:${row.dimension_value}`, points);
  }
  return affinity;
}

// The best affinity among a wine's values in one dimension — or, when none
// is above zero, the worst (a disliked grape in a blend still counts)
function dimensionAffinity(affinity, dimension, ids) {
  let best = 0;
  let worst = 0;
  for (const id of ids || []) {
    const a = affinity.get(`${dimension}:${id}`) || 0;
    if (a > best) best = a;
    if (a < worst) worst = a;
  }
  return best > 0 ? best : worst;
}

/**
 * One wine against an affinity map: `{ score, matchType }`. matchType is
 * what the palate shares with it, in the labels the rows already print
 * (houseCopy's matchTag): region + grape, grape, region, else discovery.
 */
export function scoreRecommendation(rec, affinity) {
  const parts = {
    estate: dimensionAffinity(affinity, "estate", rec?.estates),
    region: dimensionAffinity(affinity, "region", rec?.regions),
    varietal: dimensionAffinity(affinity, "varietal", rec?.varietals),
    country: dimensionAffinity(affinity, "country", rec?.country ? [rec.country] : []),
  };
  let score = 0;
  for (const [dimension, a] of Object.entries(parts)) score += DIMENSION_WEIGHTS[dimension] * a;
  const matchType = parts.region > 0 && parts.varietal > 0 ? "region + grape"
    : parts.varietal > 0 ? "grape"
      : parts.region > 0 ? "region"
        : "discovery";
  return { score, matchType };
}

const norm = (s) => (typeof s === "string" ? s.toLowerCase().trim() : "");

/**
 * The palate's recommendations, best first: `[{ wine, why, matchType }]` —
 * the shape wine_profiles.recommendations always had. Wines the palate
 * names (the quiz's "Wines you named") are left out, as profileEngine did;
 * rows the journal already holds are the reader's to filter.
 */
export function rankRecommendations({ profile, accumulation, limit = PALATE_RECS_LIMIT, recs = WINE_RECS } = {}) {
  const affinity = palateAffinity({ profile, accumulation });
  const named = idsOf(profile?.specificWines ?? profile?.specific_wines).map(norm).filter(Boolean);
  const isNamed = (wine) => {
    const w = norm(wine);
    return named.some((s) => s === w || w.includes(s) || s.includes(w));
  };
  const seen = new Set();
  const scored = [];
  (Array.isArray(recs) ? recs : []).forEach((rec, index) => {
    if (!rec || typeof rec.wine !== "string") return;
    const key = norm(rec.wine);
    if (seen.has(key)) return; // the same bottle listed under two passes
    seen.add(key);
    if (isNamed(rec.wine)) return;
    const { score, matchType } = scoreRecommendation(rec, affinity);
    if (score > 0) scored.push({ rec, score, matchType, index });
  });
  // Ties keep the curated order — combos, then grape picks, then
  // discoveries, as wineRecs.js lists them
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, Math.max(0, limit)).map(({ rec, matchType }) => ({ wine: rec.wine, why: rec.why, matchType }));
}
