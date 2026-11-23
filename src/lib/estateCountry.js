// estateCountry.js — the country of a DNA estate (wineUnified's producers
// are filed under their region; the region's country is the estate's).
// Its one job is display: houseCopy's estateName keeps an Italian family
// name's "De" ("Marchesi De Gregorio"). Kept apart from dnaNames.js, which
// brings matchEngine with it, so the wine page can name an estate without
// it. An estate the data doesn't file (an unmappable winery) → null.

import wineUnified from "./wineUnified.json";

let index = null;

function build() {
  const regionCountry = {};
  for (const [countryId, regions] of Object.entries(wineUnified.regions || {})) {
    for (const r of regions) regionCountry[r.id] = countryId;
  }
  const byEstate = new Map();
  for (const [regionId, producers] of Object.entries(wineUnified.producers || {})) {
    for (const p of producers) if (!byEstate.has(p.id)) byEstate.set(p.id, regionCountry[regionId] || null);
  }
  return { regionCountry, byEstate };
}

/** "italy" for "marchesi_de_gregorio"; the region's country first when the
 *  caller knows the region the estate is filed under. Junk → null. */
export function estateCountry(estateId, regionId = null) {
  if (typeof estateId !== "string" || !estateId) return null;
  if (!index) index = build();
  if (regionId && index.regionCountry[regionId]) {
    const filed = (wineUnified.producers[regionId] || []).some((p) => p.id === estateId);
    if (filed) return index.regionCountry[regionId];
  }
  return index.byEstate.get(estateId) ?? null;
}
