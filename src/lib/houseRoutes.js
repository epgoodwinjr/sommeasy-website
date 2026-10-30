// houseRoutes.js — which House List pages have shipped (README §5).
//
// The redesign lands one phase at a time and every phase must leave the
// preview deploy usable, so a link to a page that hasn't shipped yet stays
// dark instead of 404ing. The wine page landed in Phase 4; Search (Phase 5)
// flips on here when it lands. Delete this file once both are true.

export const HOUSE_PAGES = Object.freeze({
  wine: true,
  search: false,
});
