// palateSignature.js — Pillar 4 of the Palate Act II brief: turn the stored
// wine_profiles row into the dimensions the palate signature renders (Old
// World lean, focus, red/white balance, concentration). Mirrors what
// profileEngine computes at quiz time, but works from the persisted shape —
// so the signature stays true as DNA evolution edits the profile.

import wineUnified from "./wineUnified.json";

const { countries: COUNTRIES, regions: REGIONS } = wineUnified;

// Never show an internal ID (Act II non-negotiable) — same last-resort
// prettifier the display helpers fall back to
function prettifyId(id) {
  if (!id || typeof id !== "string") return "";
  return id.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function countryName(countryId) {
  const c = COUNTRIES.find((x) => x.id === countryId);
  return c ? c.name : prettifyId(countryId);
}

function regionName(regionId, countryId) {
  if (countryId && REGIONS[countryId]) {
    const r = REGIONS[countryId].find((x) => x.id === regionId);
    if (r) return r.name;
  }
  for (const list of Object.values(REGIONS)) {
    const r = list.find((x) => x.id === regionId);
    if (r) return r.name;
  }
  return prettifyId(regionId);
}

/**
 * Compute the palate signature from a stored profile.
 *
 * accumulation (optional): dna_accumulation rows for the user — used to pick
 * the "center" region (the anchor country's highest-scoring region, i.e. the
 * one the user's actual ratings back hardest). Falls back to the anchor's
 * first quiz region when there's no signal.
 */
export function computeSignature(profile, accumulation) {
  const countries = profile?.countries || [];
  const regions = profile?.regions || {};
  const estates = Object.values(profile?.estates || {}).flat();
  const specificWines = profile?.specific_wines || [];

  const countryObjs = countries.map((id) => COUNTRIES.find((c) => c.id === id)).filter(Boolean);
  const oldWorld = countryObjs.filter((c) => c.world === "old").length;
  const newWorld = countryObjs.filter((c) => c.world === "new").length;
  const known = oldWorld + newWorld;
  // Position on the Old ↔ New rail: 0 = fully Old World, 1 = fully New World
  const newWorldShare = known > 0 ? newWorld / known : 0.5;

  const breadth = countries.length;
  const regionCount = Object.values(regions).flat().length;
  const depth = estates.length + specificWines.length;

  // Focus rail: one country = fully focused, seven+ = fully wide-ranging
  const focusShare = Math.min(1, Math.max(0, (breadth - 1) / 6));

  const redCount = profile?.red_count || 0;
  const whiteCount = profile?.white_count || 0;
  const colorTotal = redCount + whiteCount;
  const whiteShare = colorTotal > 0 ? whiteCount / colorTotal : 0.5;

  // Anchor: the country holding the most of the user's regions
  let anchorId = null;
  let anchorRegionCount = 0;
  for (const cId of countries) {
    const n = (regions[cId] || []).length;
    if (n > anchorRegionCount) {
      anchorRegionCount = n;
      anchorId = cId;
    }
  }

  // Center: within the anchor, the region the user's ratings back hardest
  let centerId = null;
  if (anchorId) {
    const anchorRegions = regions[anchorId] || [];
    let bestPoints = 0;
    for (const row of accumulation || []) {
      if (row.dimension === "region" && anchorRegions.includes(row.dimension_value) && row.points > bestPoints) {
        bestPoints = row.points;
        centerId = row.dimension_value;
      }
    }
    if (!centerId && anchorRegions.length > 0) centerId = anchorRegions[0];
  }

  return {
    newWorldShare,
    oldWorldCount: oldWorld,
    newWorldCount: newWorld,
    focusShare,
    breadth,
    regionCount,
    depth,
    redCount,
    whiteCount,
    whiteShare,
    anchor: anchorId ? { id: anchorId, name: countryName(anchorId) } : null,
    center: centerId ? { id: centerId, name: regionName(centerId, anchorId) } : null,
  };
}

/**
 * The concentration phrase ("South Africa-anchored, Stellenbosch-centered").
 * Empty string when the profile has no regional anchor yet.
 */
export function concentrationPhrase(sig) {
  if (!sig?.anchor) return "";
  let phrase = `${sig.anchor.name}-anchored`;
  if (sig.center) phrase += `, ${sig.center.name}-centered`;
  return phrase;
}

/**
 * One-line palate signature for the DNA strip (Pillar 1): a wine-label back,
 * not a dashboard. E.g. "Both worlds · South Africa-anchored · mostly red".
 */
export function signatureLine(profile, accumulation) {
  const sig = computeSignature(profile, accumulation);
  const parts = [];

  if (sig.oldWorldCount + sig.newWorldCount > 0) {
    if (sig.newWorldShare <= 0.35) parts.push("Old World lean");
    else if (sig.newWorldShare >= 0.65) parts.push("New World lean");
    else parts.push("Both worlds");
  }

  if (sig.anchor) parts.push(`${sig.anchor.name}-anchored`);
  else if (sig.breadth > 0) parts.push(sig.breadth === 1 ? "one country deep" : `${sig.breadth} countries wide`);

  if (sig.redCount + sig.whiteCount > 0) {
    if (sig.whiteShare <= 0.35) parts.push("mostly red");
    else if (sig.whiteShare >= 0.65) parts.push("mostly white");
    else parts.push("red & white");
  }

  return parts.join(" · ");
}
