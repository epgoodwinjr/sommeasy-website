// identityEngine.js — the identity strand (Act III, "One of One").
//
// composeIdentity(evidence) replaces the 15 shared archetypes with a
// per-user identity composed from taste content. Deterministic and PURE:
// same evidence → same strand, no DB, no LLM, no randomness — the anonymous
// teaser and the pendingPalate restore regenerate the strand client-side
// and must keep doing so.
//
// The strand:
//   title     — "The {Anchor} {Persona}". Anchor precedence: region →
//               country → signature grape; a long anchor name steps down
//               the precedence rather than shipping clunk.
//   epithet   — up to three composed phrases ("Mosel-centered ·
//               white-leaning · estate-loyal").
//   traits    — the structured selection (persisted for prompts, the
//               visual, and recompute diffing).
//   genome    — deterministic visual parameters (Session 4 renders them).
//   narrative — composed template seed; the Somm evolves it thereafter.
//
// Grammar non-negotiables (the brief): built only from the user's own
// selections — never fabricate a place or grape they didn't give us;
// confident present tense at every input depth; NON-HIERARCHICAL — every
// persona is a shape, never a rank. A two-bottle palate is different,
// never lesser.

import wineUnified from "./wineUnified.json";
import { REGION_ANCHOR_EVIDENCE_FLOOR } from "./dnaThresholds.js";

const { countries: COUNTRIES, regions: REGIONS, producers: PRODUCERS, varietals: VARIETALS } = wineUnified;

// ═══════════════════════════════════════════════════════
// PERSONA VOCABULARY
// ═══════════════════════════════════════════════════════
//
// Fifteen shape-words, selected deterministically by the ordered rules in
// pickPersona(). Each is a relationship to wine — loyalty, memory, focus,
// travel, tradition — chosen so it reads after a region ("The Stellenbosch
// Loyalist"), a country ("The Italy Cartographer"), or a grape ("The
// Cabernet Instinct"). No tier words: nothing here outranks anything else.
//
//   Loyalist      — backs producers by name (estates ≥ 2)
//   Archivist     — remembers specific bottles (named wines ≥ 2)
//   Curator       — keeps a short, earned list (an estate and a bottle)
//   Purist        — one or two grapes, known completely
//   Cartographer  — maps one country region by region (anchor regions ≥ 4)
//   Devotee       — deep in one place's map (anchor regions ≥ 3)
//   Voyager       — five countries or more
//   Classicist    — rooted in the Old World
//   Pioneer       — drawn to the New World
//   Wayfarer      — crosses between worlds
//   Regular       — one country, a mapped spot, known well
//   Faithful      — picked their ground and stands on it
//   Seeker        — follows one grape across borders
//   Instinct      — a grape and a gut, both sound
//   (degenerate)  — "The Instinctive Palate": no anchor at all, still an
//                   identity in the present tense, never a waiting room

const PERSONA_LINES = {
  Loyalist: "You back producers the way old friends back each other — by name, bottle after bottle.",
  Archivist: "You remember wines the way other people remember songs — precisely, and with affection.",
  Curator: "You keep a short list and you keep it honest — every name on it earned its place.",
  Purist: "You'd rather know two grapes completely than twenty in passing.",
  Cartographer: "You're building the map one appellation at a time, and the map is getting good.",
  Devotee: "You've gone deep where most people skim, and it shows in every pick.",
  Voyager: "Your palate holds more stamps than most passports.",
  Classicist: "You trust places that have been getting this right for centuries.",
  Pioneer: "You like your wine from places still writing their own rules.",
  Wayfarer: "You cross between worlds without picking a side, and your table is better for it.",
  Regular: "You know your spot, and knowing it that well is its own kind of range.",
  Faithful: "You've picked your ground, and plenty of drinkers never do.",
  Seeker: "You follow the grape wherever it grows, and it keeps rewarding you.",
  Instinct: "You order on instinct, and your instinct is sound.",
};

// ═══════════════════════════════════════════════════════
// COUNTRY TITLE ADJECTIVES
// ═══════════════════════════════════════════════════════
//
// Country-anchored titles read as adjectives — "The Italian Faithful", not
// "The Italy Faithful" — through the same titleName mechanism grape anchors
// use. TITLES ONLY: epithets ("Italy-anchored") and narrative prose ("leads
// with Italy") keep the place noun. Wine-register choices: "Argentine" (the
// trade's traditional form, as in Argentine Malbec) over "Argentinian";
// "American" for the US. New Zealand deliberately keeps its noun — the
// trade says "New Zealand Pinot", and "New Zealander" names a person, not
// a wine. Every country in wineUnified.json has an entry (identityVoice
// enforces completeness), so a new catalog country fails a test instead of
// silently clunking.
export const COUNTRY_TITLE_NAMES = {
  us: "American",
  france: "French",
  italy: "Italian",
  spain: "Spanish",
  portugal: "Portuguese",
  chile: "Chilean",
  argentina: "Argentine",
  austria: "Austrian",
  australia: "Australian",
  germany: "German",
  new_zealand: "New Zealand", // deliberate noun — see above
  south_africa: "South African",
  israel: "Israeli",
  greece: "Greek",
  canada: "Canadian",
  hungary: "Hungarian",
  bulgaria: "Bulgarian",
  romania: "Romanian",
  uruguay: "Uruguayan",
};

// ═══════════════════════════════════════════════════════
// LOOKUPS (never show an internal id)
// ═══════════════════════════════════════════════════════

function countryObj(id) {
  return COUNTRIES.find((c) => c.id === id) || null;
}

function regionObj(id) {
  for (const list of Object.values(REGIONS)) {
    const r = list.find((x) => x.id === id);
    if (r) return r;
  }
  return null;
}

function estateObj(id) {
  for (const list of Object.values(PRODUCERS)) {
    const p = list.find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

function varietalObj(id) {
  return VARIETALS.find((v) => v.id === id) || null;
}

// Combined varietal names ("Syrah / Shiraz") display as their first alias
function varietalDisplayName(v) {
  return v ? v.name.split("/")[0].trim() : null;
}

function joinList(items, max = 3) {
  const s = items.slice(0, max);
  if (s.length === 0) return "";
  if (s.length === 1) return s[0];
  if (s.length === 2) return s[0] + " and " + s[1];
  return s.slice(0, -1).join(", ") + ", and " + s[s.length - 1];
}

// ═══════════════════════════════════════════════════════
// GENOME SEED — deterministic hash of the evidence
// ═══════════════════════════════════════════════════════

// FNV-1a over the canonical (sorted) evidence ids: two different palates
// get different seeds, the same palate always gets the same one.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ═══════════════════════════════════════════════════════
// TITLE GRAMMAR
// ═══════════════════════════════════════════════════════

// The clunk rule: a title anchor should scan like a wine label, not a
// mailing address. Long or many-worded names step DOWN the anchor
// precedence (region → country → grape) rather than shipping
// "The Russian River Valley Loyalist".
function anchorReads(name) {
  if (!name) return false;
  return name.length <= 14 && name.trim().split(/\s+/).length <= 2;
}

// Grape names get one honest shortening before the clunk rule judges them:
// the first word, when it can stand alone ("Cabernet Sauvignon" →
// "Cabernet", "Chenin Blanc" → "Chenin"). Never invented — always a prefix
// of the real name.
function grapeTitleName(name) {
  if (!name) return null;
  if (anchorReads(name)) return name;
  const first = name.split(/\s+/)[0];
  if (first.length >= 5) return first;
  return name;
}

// ═══════════════════════════════════════════════════════
// COMPOSE
// ═══════════════════════════════════════════════════════

/**
 * Compose the identity strand from evidence.
 *
 * evidence: { countries, regions, estates, varietals, specificWines,
 *             accumulation? } — the raw quiz/profile shape. accumulation
 * (dna_accumulation rows) is optional; when present, evidence points pick
 * the anchor region and signature grape (Session 3's milestone recompute
 * passes it; quiz-time composition runs without it).
 *
 * Returns { title, epithet, traits, genome, narrative }.
 */
export function composeIdentity(evidence) {
  const countries = evidence.countries || [];
  const regionsByCountry = evidence.regions || {};
  const estatesByRegion = evidence.estates || {};
  const varietals = evidence.varietals || [];
  const specificWines = evidence.specificWines || evidence.specific_wines || [];
  const accumulation = evidence.accumulation || [];

  const regionIds = Object.values(regionsByCountry).flat();
  const estateIds = Object.values(estatesByRegion).flat();

  const countryObjs = countries.map(countryObj).filter(Boolean);
  const oldWorld = countryObjs.filter((c) => c.world === "old").length;
  const newWorld = countryObjs.filter((c) => c.world === "new").length;
  const knownWorld = oldWorld + newWorld;
  const oldShare = knownWorld > 0 ? oldWorld / knownWorld : null;

  const varietalObjs = varietals.map(varietalObj).filter(Boolean);
  const redCount = varietalObjs.filter((v) => v.color === "red").length;
  const whiteCount = varietalObjs.filter((v) => v.color === "white").length;
  const colorTotal = redCount + whiteCount;
  const whiteShare = colorTotal > 0 ? whiteCount / colorTotal : null;

  const breadth = countries.length;
  const regionCount = regionIds.length;
  const estateCount = estateIds.length;
  const wineCount = specificWines.length;
  const varietalCount = varietals.length;

  // ─── Anchor country: holds the most selected regions (first-selected
  // wins ties — the user's own ordering is the deterministic tiebreak) ───
  let anchorCountryId = countries[0] || null;
  let anchorCountryRegions = anchorCountryId ? (regionsByCountry[anchorCountryId] || []).length : 0;
  for (const cId of countries) {
    const n = (regionsByCountry[cId] || []).length;
    if (n > anchorCountryRegions) {
      anchorCountryRegions = n;
      anchorCountryId = cId;
    }
  }

  // ─── Anchor region: within the anchor country, the region the user's
  // ratings back hardest; their first selection when there's no signal ───
  let anchorRegionId = null;
  if (anchorCountryId) {
    const candidates = regionsByCountry[anchorCountryId] || [];
    let bestPoints = 0;
    for (const row of accumulation) {
      if (row.dimension === "region" && candidates.includes(row.dimension_value) && row.points > bestPoints) {
        bestPoints = row.points;
        anchorRegionId = row.dimension_value;
      }
    }
    if (!anchorRegionId && candidates.length > 0) anchorRegionId = candidates[0];
  }

  // ─── Signature grape: the varietal their ratings back hardest; their
  // first selection otherwise ───
  let signatureGrapeId = varietals[0] || null;
  {
    let bestPoints = 0;
    for (const row of accumulation) {
      if (row.dimension === "varietal" && varietals.includes(row.dimension_value) && row.points > bestPoints) {
        bestPoints = row.points;
        signatureGrapeId = row.dimension_value;
      }
    }
  }
  const signatureGrapeObj = signatureGrapeId ? varietalObj(signatureGrapeId) : null;
  const signatureGrapeName = varietalDisplayName(signatureGrapeObj);

  // ─── Anchor precedence: region → country → grape, stepping down when a
  // name would clunk in the title ───
  // The evidence floor: a region "leads" only at REGION_ANCHOR_EVIDENCE_FLOOR
  // points or more. Ties above the floor still lead (every rating writes
  // region and country together, so a strict lead essentially cannot occur);
  // below it, a first-bottle tie is noise and must not retitle anyone.
  const regionEvidenceLeads = accumulation.some(
    (row) => row.dimension === "region" && row.points >= REGION_ANCHOR_EVIDENCE_FLOOR &&
      !accumulation.some((o) => o.dimension !== "region" && o.points > row.points)
  );
  const anchorRegion = anchorRegionId ? regionObj(anchorRegionId) : null;
  const anchorCountry = anchorCountryId ? countryObj(anchorCountryId) : null;
  // The adjective ships in the title, so the clunk rule judges the adjective
  const anchorCountryTitle = anchorCountry
    ? COUNTRY_TITLE_NAMES[anchorCountryId] || anchorCountry.name
    : null;

  // Varietal dominance: one grape, no mapped places, several countries —
  // the grape IS the through-line, so it outranks the place anchors
  const grapeDominates =
    varietalCount === 1 && regionCount === 0 && estateCount === 0 && breadth >= 2;

  let anchor = null;
  if (grapeDominates && signatureGrapeName) {
    anchor = {
      type: "grape", id: signatureGrapeId, name: signatureGrapeName,
      titleName: grapeTitleName(signatureGrapeName),
    };
  } else if (anchorRegion && (anchorCountryRegions >= 2 || regionEvidenceLeads || breadth === 1) && anchorReads(anchorRegion.name)) {
    anchor = { type: "region", id: anchorRegionId, name: anchorRegion.name };
  } else if (anchorCountry && anchorReads(anchorCountryTitle)) {
    anchor = { type: "country", id: anchorCountryId, name: anchorCountry.name, titleName: anchorCountryTitle };
  } else if (anchorRegion && anchorReads(anchorRegion.name)) {
    // Country name clunked but a readable region exists — use it
    anchor = { type: "region", id: anchorRegionId, name: anchorRegion.name };
  } else if (signatureGrapeName) {
    const titleName = grapeTitleName(signatureGrapeName);
    anchor = { type: "grape", id: signatureGrapeId, name: signatureGrapeName, titleName };
  } else if (anchorCountry) {
    // Nothing reads cleanly but a country exists — a long true name beats
    // no identity
    anchor = { type: "country", id: anchorCountryId, name: anchorCountry.name, titleName: anchorCountryTitle };
  }

  // ─── Persona: ordered rules, first match wins — total and tie-free ───
  const worldLean = oldShare == null ? null : oldShare >= 0.75 ? "old" : oldShare <= 0.25 ? "new" : "both";
  const colorLean = whiteShare == null ? null : whiteShare >= 0.65 ? "white" : whiteShare <= 0.35 ? "red" : "mixed";

  function pickPersona() {
    if (!anchor) return null;
    if (anchor.type === "grape") {
      if (estateCount >= 2) return "Loyalist";
      if (wineCount >= 2) return "Archivist";
      if (breadth >= 3) return "Seeker";
      if (regionCount >= 2) return "Devotee";
      return "Instinct";
    }
    // Place anchors (region / country)
    if (estateCount >= 2) return "Loyalist";
    if (wineCount >= 2) return "Archivist";
    if ((estateCount >= 1 && wineCount >= 1) || (estateCount === 1 && regionCount >= 2)) return "Curator";
    if (varietalCount >= 1 && varietalCount <= 2 && (regionCount >= 2 || breadth >= 2)) return "Purist";
    if (anchorCountryRegions >= 4) return "Cartographer";
    if (anchorCountryRegions >= 3) return "Devotee";
    if (breadth >= 5) return "Voyager";
    if (worldLean === "old" && breadth >= 2) return "Classicist";
    if (worldLean === "new" && breadth >= 2) return "Pioneer";
    if (breadth >= 3) return "Wayfarer";
    if (breadth === 1 && regionCount >= 1) return "Regular";
    return "Faithful";
  }
  const persona = pickPersona();

  // ─── Title ───
  const title = anchor
    ? `The ${anchor.titleName || anchor.name} ${persona}`
    : "The Instinctive Palate";

  // ─── Epithet: up to three phrases, most anchored first ───
  const epithetParts = [];
  if (anchor?.type === "region") epithetParts.push(`${anchor.name}-centered`);
  else if (anchor?.type === "country") epithetParts.push(`${anchor.name}-anchored`);
  else if (anchor?.type === "grape" && anchorCountry) epithetParts.push(`${anchorCountry.name}-anchored`);

  if (colorLean === "white") epithetParts.push("white-leaning");
  else if (colorLean === "red") epithetParts.push("red-leaning");
  else if (colorLean === "mixed") epithetParts.push("red & white");

  if (estateCount >= 2) epithetParts.push("estate-loyal");
  else if (breadth >= 5) epithetParts.push("wide-ranging");
  else if (breadth === 1 && regionCount >= 2) epithetParts.push("single-country deep");
  else if (worldLean === "old") epithetParts.push("Old World-rooted");
  else if (worldLean === "new") epithetParts.push("New World-minded");

  const epithet = epithetParts.slice(0, 3).join(" · ");

  // ─── Traits (persisted for prompts, the visual, recompute diffing) ───
  const traits = {
    anchor: anchor ? { type: anchor.type, id: anchor.id, name: anchor.name } : null,
    persona: persona || "Instinctive",
    signatureGrape: signatureGrapeObj ? { id: signatureGrapeId, name: signatureGrapeName } : null,
    worldLean,
    colorLean,
    breadth,
    regionCount,
    estateCount,
    wineCount,
    varietalCount,
  };

  // ─── Genome (Session 4 renders it; persisted now so the visual can ship
  // without a data migration) ───
  const canonical = [
    [...countries].sort().join(","),
    [...regionIds].sort().join(","),
    [...estateIds].sort().join(","),
    [...varietals].sort().join(","),
  ].join("|");
  const genome = {
    v: 1,
    seed: fnv1a(canonical),
    world: knownWorld > 0 ? newWorld / knownWorld : 0.5,
    color: whiteShare == null ? 0.5 : whiteShare,
    focus: Math.min(1, Math.max(0, (breadth - 1) / 6)),
    depth: Math.min(1, (estateCount + wineCount) / 6),
    spread: Math.min(1, regionCount / 8),
    range: Math.min(1, varietalCount / 8),
  };

  // ─── Narrative seed ───
  const narrative = composeNarrative({
    anchor, persona, breadth, regionCount, estateCount, wineCount,
    countryObjs, regionIds, estateIds, varietalObjs, oldShare,
    anchorCountry, anchorCountryId, regionsByCountry, estatesByRegion,
  });

  return { title, epithet, traits, genome, narrative };
}

// ═══════════════════════════════════════════════════════
// NARRATIVE — anchor opening, evidence middle, persona close
// ═══════════════════════════════════════════════════════
//
// Everything named here is something the user gave us. The reveal is the
// payoff of the quiz: present tense, confident at every depth. (The banned
// deferral phrases live in identityVoice.test.js's scan — not quoted here.)

// "US" needs its article in running prose ("your palate leads with the US");
// a display adjustment, never a different name
function proseCountry(name) {
  return name === "US" ? "the US" : name;
}

function composeNarrative(ctx) {
  const {
    anchor, persona, breadth, regionCount, estateCount, wineCount,
    countryObjs, regionIds, estateIds, varietalObjs, oldShare,
    anchorCountry, anchorCountryId, regionsByCountry,
  } = ctx;

  const countryNames = countryObjs.map((c) => c.name);
  // Anchor-country regions and anchor-region estates lead their lists — the
  // narrative should reach for the names closest to home first
  const anchorRegionIds = anchorCountryId ? (regionsByCountry[anchorCountryId] || []) : [];
  const orderedRegionIds = [
    ...anchorRegionIds,
    ...regionIds.filter((id) => !anchorRegionIds.includes(id)),
  ];
  const regionNames = orderedRegionIds.map((id) => regionObj(id)?.name).filter(Boolean);
  const anchorEstateIds = anchor?.type === "region" ? (ctx.estatesByRegion?.[anchor.id] || []) : [];
  const orderedEstateIds = [
    ...anchorEstateIds,
    ...estateIds.filter((id) => !anchorEstateIds.includes(id)),
  ];
  const estateNames = orderedEstateIds.map((id) => estateObj(id)?.name).filter(Boolean);
  const varietalNames = varietalObjs.map(varietalDisplayName).filter(Boolean);

  const sentences = [];

  // Opening — the anchor claim
  if (!anchor) {
    sentences.push(
      "You trust your own taste over the trend of the week, and that's rarer than it sounds."
    );
    sentences.push(
      "A focused palate isn't a smaller one — it's one that knows what it loves, and that clarity is exactly what a sommelier hopes to find across the table."
    );
    sentences.push("The Somm's job with you is simple: honor it.");
    return sentences.join(" ");
  }

  if (anchor.type === "region") {
    const home = anchorCountry && anchorCountry.name !== anchor.name ? `${anchor.name}` : anchor.name;
    sentences.push(`Your palate has an address, and it's ${home}.`);
  } else if (anchor.type === "country") {
    sentences.push(`Your palate leads with ${proseCountry(anchor.name)}.`);
  } else {
    sentences.push(`${anchor.name} is your throughline — the grape your palate keeps coming back to.`);
  }

  // Middle — the evidence, in their own names
  if (anchor.type === "grape") {
    if (countryNames.length >= 2) {
      sentences.push(`You follow it from ${joinList(countryNames.map(proseCountry), 3)}, and each place shows you a different side of it.`);
    } else if (countryNames.length === 1) {
      sentences.push(`${proseCountry(countryNames[0])} is where you drink it best, and that pairing says plenty about what you value in a glass.`);
    } else {
      sentences.push(`Wherever the list comes from, that's the column your eye finds first.`);
    }
  } else {
    const otherRegions = regionNames.filter((n) => n !== anchor.name);
    if (estateNames.length >= 2) {
      sentences.push(`You know producers like ${joinList(estateNames, 2)} by name — loyalty most drinkers never get around to.`);
    } else if (otherRegions.length >= 2) {
      sentences.push(`From ${joinList(otherRegions, 3)}, you've marked out territory, not just taste.`);
    } else if (varietalNames.length >= 1) {
      sentences.push(`${joinList(varietalNames, 2)} in the glass — that's a choice made on purpose, and it tells the Somm exactly where to start.`);
    } else if (countryNames.length >= 2) {
      sentences.push(`${joinList(countryNames.map(proseCountry), 3)} on the label — that's a real position, not a shrug.`);
    } else if (oldShare != null && oldShare >= 0.75) {
      sentences.push(`That's a classic place to stand — the places you're drawn to have spent centuries earning exactly that kind of trust.`);
    } else if (oldShare != null && oldShare <= 0.25) {
      sentences.push(`That's a modern place to stand — you're drawn to places still writing their own rules, and that says something.`);
    }
    if (wineCount >= 2) {
      sentences.push(`And you keep receipts — bottles named, remembered, and worth repeating.`);
    }
  }

  // Close — the persona's line, then the Somm's stance
  if (persona && PERSONA_LINES[persona]) sentences.push(PERSONA_LINES[persona]);
  sentences.push("The Somm reads all of this before picking your glass — that's the point of it.");

  return sentences.join(" ");
}
