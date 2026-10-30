// houseRoutes.js — which House List pages have shipped (README §5).
//
// The redesign lands one phase at a time and every phase must leave the
// preview deploy usable, so a link to a page that hasn't shipped yet stays
// dark instead of 404ing: the wine page (Phase 4) and Search (Phase 5) flip
// on here when they land. Delete this file once both are true.

export const HOUSE_PAGES = Object.freeze({
  wine: false,
  search: false,
});
