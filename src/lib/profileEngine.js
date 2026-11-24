import wineUnified from "./wineUnified.json";
// The .js extension keeps this importable by plain node (the test suites
// load the real module through the alias loader)
import { composeIdentity } from "./identityEngine.js";
import { rankRecommendations } from "./palateRecs.js";

const { countries: COUNTRIES, regions: REGIONS, producers: PRODUCERS, varietals: VARIETALS } = wineUnified;

// ═══════════════════════════════════════════════════════
// MAIN PROFILE GENERATOR
// ═══════════════════════════════════════════════════════

export function generateDNAProfile(answers, { accumulation = [] } = {}) {
  const { countries, regions, estates, varietals, specificWines } = answers;

  // ─── Resolve names from IDs ───
  const countryObjs = countries.map(id => COUNTRIES.find(c => c.id === id)).filter(Boolean);
  const countryNames = countryObjs.map(c => c.name);

  const allRegionIds = Object.values(regions).flat();
  const regionNames = allRegionIds.map(rId => {
    for (const regionList of Object.values(REGIONS)) {
      const f = regionList.find(r => r.id === rId);
      if (f) return f.name;
    }
    return null;
  }).filter(Boolean);

  const allEstateIds = Object.values(estates).flat();
  const estateNames = allEstateIds.map(eId => {
    for (const producerList of Object.values(PRODUCERS)) {
      const f = producerList.find(p => p.id === eId);
      if (f) return f.name;
    }
    return null;
  }).filter(Boolean);

  const varietalNames = varietals.map(id => VARIETALS.find(v => v.id === id)?.name).filter(Boolean);
  const reds = varietals.filter(id => VARIETALS.find(v => v.id === id)?.color === "red");
  const whites = varietals.filter(id => VARIETALS.find(v => v.id === id)?.color === "white");

  // ─── Compose the identity strand (Act III — the archetype engine is
  // retired; the title lives in the archetype column. No surface reads the
  // archetype_emoji column any more — House & Hand writes it empty) ───
  const identity = composeIdentity({
    countries, regions, estates, varietals,
    specificWines: specificWines || [],
  });
  const archetype = identity.title;
  const archetypeEmoji = "";
  const narrative = identity.narrative;

  // ─── Recommendations: the same ranking every surface reads with
  // (palateRecs.js), from the curated list in wineRecs.js. At a quiz save
  // the caller hands in the accumulation rows it already read, so the list
  // stored beside the profile (the reveal's) carries what ratings proved ───
  const recommendations = rankRecommendations({ profile: answers, accumulation });

  return {
    archetype, archetypeEmoji, narrative,
    epithet: identity.epithet, traits: identity.traits, genome: identity.genome,
    countries: countryNames, regions: regionNames, estates: estateNames,
    varietals: varietalNames, specificWines: specificWines || [],
    recommendations,
    redCount: reds.length, whiteCount: whites.length,
    raw: { countries, regions, estates, varietals, specificWines },
  };
}
