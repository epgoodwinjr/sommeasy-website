// dnaNames.js — the DNA's display names, bound to the wine data: the
// `names` resolver palateView.js's dnaEntries takes (Your palate, Search).
// It lives apart from palateView.js because matchEngine brings the 2.9MB
// wineUnified.json with it — the pure modules (and their plain-node tests)
// take the names as an argument instead. A miss returns null, and
// dnaEntries falls back to the engine's display_name — never a raw id.

import wineUnified from "./wineUnified.json";
import { getCountryFlag, getCountryName, getRegionDisplayName, getVarietalDisplayName } from "./matchEngine";

const PRODUCERS = wineUnified.producers;

// Producers are filed under their region; look there first, then anywhere
function estateName(estateId, regionId) {
  const filed = (PRODUCERS[regionId] || []).find((p) => p.id === estateId);
  if (filed) return filed.name;
  for (const producers of Object.values(PRODUCERS)) {
    const found = producers.find((p) => p.id === estateId);
    if (found) return found.name;
  }
  return null;
}

export const DNA_NAMES = Object.freeze({
  country: getCountryName,
  flag: getCountryFlag,
  region: getRegionDisplayName,
  grape: getVarietalDisplayName,
  estate: estateName,
});
