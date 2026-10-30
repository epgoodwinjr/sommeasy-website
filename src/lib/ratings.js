// ratings.js — THE rating vocabulary (The House List).
//
// One list for every surface: RatingTiles, RatingList, journal rows, pick
// flags, done lines and "Keep ❤️ Loved it" all take their emoji and words
// from here, never from a local copy (houseList.test.js source-scans src/
// for re-declared labels). The ids are the engine's rating vocabulary —
// exactly the keys of RATING_POINTS in dnaThresholds.js — in the order the
// tiles read, warmest first. Dependency-free so plain-node tests import the
// real module.

export const RATINGS = Object.freeze([
  Object.freeze({ id: "loved", emoji: "❤️", label: "Loved it" }),
  Object.freeze({ id: "liked", emoji: "👍", label: "Liked it" }),
  Object.freeze({ id: "fine", emoji: "😐", label: "It was fine" }),
  Object.freeze({ id: "not_for_me", emoji: "👎", label: "Not for me" }),
]);

/** The rating for an id, or null (a legacy unrated row, junk) — callers
 *  choose their own fallback. */
export function ratingFor(id) {
  return RATINGS.find((r) => r.id === id) || null;
}
