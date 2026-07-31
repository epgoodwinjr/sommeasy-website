// dnaThresholds.js — the DNA evolution engine's scoring constants.
//
// Kept apart from dnaEvolution.js so UI surfaces (the Palate view's
// "building now" progress) can show the real thresholds without pulling
// wineUnified.json into their bundle. dnaEvolution.js imports these back —
// there is exactly one copy of these numbers.

export const RATING_POINTS = {
  loved: 2,
  liked: 1,
  fine: 0,
  not_for_me: -1,
};

// Partial-credit points for medium-confidence resolutions (60–79): the
// strongest signal is halved (loved 2→1) and the rest clamp to ±1. The table
// stays integer-valued on purpose — points is an INTEGER column, and deltas
// (re-rates, deletes) only reverse exactly when points-per-rating is a fixed
// integer function, never a rounded fraction. Applies to varietal/region/
// country only — estate loyalty requires a confident producer match.
export const PARTIAL_RATING_POINTS = {
  loved: 1,
  liked: 1,
  fine: 0,
  not_for_me: -1,
};

// Promotions fire at a real drinking pace: 2 loved bottles to an estate,
// 3 to a varietal, 5 to a region, 7 to a country (loved = 2 points).
export const PROMOTION_THRESHOLDS = {
  estate: 4,
  varietal: 6,
  region: 10,
  country: 14,
};

export const ROLLUP_THRESHOLDS = {
  region: 3,  // 3 promoted estates in a region → promote region
  country: 3, // 3 promoted regions in a country → promote country
};

export const DEMOTION_THRESHOLDS = {
  auto: -6,   // Auto-promoted items
  quiz: -10,  // Quiz-selected items (higher bar)
};

// Full credit at 80+, partial credit (PARTIAL_RATING_POINTS) down to 60,
// nothing below — an unrecognized wine is not evidence.
export const CONFIDENCE_GATE = 80;
export const PARTIAL_CONFIDENCE_GATE = 60;

// A region may pull a title's anchor region-ward only at 4+ evidence points
// (two loved bottles — deliberately the same bar estate loyalty pays).
// Every rating writes region and country points together, so a first bottle
// always produces a region-country TIE; below this floor that tie carries no
// information about region-vs-country preference and must not retitle
// anyone. Tie-tolerance above the floor stays: an estate promotion at 4
// implies its region is at 4, so the address sharpens exactly at the first
// real loyalty moment. (S4 readout radar item, Ed-approved in S5.)
export const REGION_ANCHOR_EVIDENCE_FLOOR = 4;
