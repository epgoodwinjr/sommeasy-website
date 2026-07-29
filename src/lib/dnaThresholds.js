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

export const PROMOTION_THRESHOLDS = {
  estate: 6,
  varietal: 10,
  region: 14,
  country: 20,
};

export const ROLLUP_THRESHOLDS = {
  region: 3,  // 3 promoted estates in a region → promote region
  country: 3, // 3 promoted regions in a country → promote country
};

export const DEMOTION_THRESHOLDS = {
  auto: -6,   // Auto-promoted items
  quiz: -10,  // Quiz-selected items (higher bar)
};

export const CONFIDENCE_GATE = 80;
