// matchEngine.js — v3: WineMag 130k integrated
// Uses wineReference-lookup.json (processed from 130k WineMag reviews)
// NO dependency on wineDatabase.js

import lookupData from "./wineReference-lookup.json";
import { COUNTRIES as DNA_COUNTRIES, REGIONS as DNA_REGIONS, VARIETALS as DNA_VARIETALS, ESTATES as DNA_ESTATES } from "./wineData";

// ═══════════════════════════════════════════════════════
// MAPPING TABLES: WineMag names → DNA profile IDs
// ═══════════════════════════════════════════════════════

const COUNTRY_TO_DNA = {
  "France": "france", "Italy": "italy", "Spain": "spain", "Portugal": "portugal",
  "Germany": "germany", "Austria": "austria", "US": "usa",
  "Argentina": "argentina", "Chile": "chile", "Australia": "australia",
  "New Zealand": "new_zealand", "South Africa": "south_africa",
};

const PROVINCE_TO_DNA_REGION = {
  "Bordeaux": "bordeaux", "Burgundy": "burgundy", "Champagne": "champagne",
  "Alsace": "alsace", "Provence": "provence",
  "Languedoc-Roussillon": "languedoc", "South of France": "languedoc",
  "Loire Valley": "loire", "Rhône Valley": "rhone",
  "Tuscany": "tuscany", "Piedmont": "piedmont", "Veneto": "veneto",
  "Sicily & Sardinia": "sicily", "Southern Italy": "puglia", "Puglia": "puglia",
  "Northeastern Italy": "trentino", "Campania": "campania",
  "Northern Spain": "rioja", "Catalonia": "penedes",
  "Stellenbosch": "stellenbosch", "Coastal Region": "stellenbosch",
  "Constantia": "constantia", "Franschhoek": "franschhoek",
  "Swartland": "swartland", "Walker Bay": "walker_bay", "Paarl": "paarl",
  "Mendoza Province": "mendoza",
  "Maipo Valley": "maipo", "Colchagua Valley": "colchagua",
  "Casablanca Valley": "casablanca", "Aconcagua": "aconcagua",
  "South Australia": "barossa", "Western Australia": "margaret_river", "New South Wales": "hunter",
  "Marlborough": "marlborough", "Central Otago": "central_otago", "Hawke's Bay": "hawkes_bay",
  "Douro": "douro", "Alentejo": "alentejo", "Dão": "dao", "Vinho Verde": "vinho_verde",
  "Mosel": "mosel", "Rheingau": "rheingau", "Pfalz": "pfalz",
  "Niederösterreich": "kamptal", "Burgenland": "burgenland",
};

const SUBREGION_TO_DNA_REGION = {
  "napa valley": "napa", "napa": "napa", "oakville": "napa", "rutherford": "napa",
  "stags leap district": "napa", "howell mountain": "napa", "spring mountain district": "napa",
  "calistoga": "napa", "atlas peak": "napa", "mount veeder": "napa", "st. helena": "napa",
  "sonoma valley": "sonoma", "russian river valley": "sonoma", "dry creek valley": "sonoma",
  "alexander valley": "sonoma", "sonoma coast": "sonoma", "sonoma mountain": "sonoma",
  "willamette valley": "willamette", "dundee hills": "willamette", "eola-amity hills": "willamette",
  "ribbon ridge": "willamette", "chehalem mountains": "willamette",
  "paso robles": "paso_robles", "paso robles estrella district": "paso_robles",
  "santa barbara county": "santa_barbara", "santa ynez valley": "santa_barbara",
  "sta. rita hills": "santa_barbara", "santa rita hills": "santa_barbara",
  "santa maria valley": "santa_barbara", "happy canyon of santa barbara": "santa_barbara",
  "finger lakes": "finger_lakes", "walla walla valley": "walla_walla",
  "côte-rôtie": "rhone", "hermitage": "rhone", "châteauneuf-du-pape": "rhone",
  "chateauneuf-du-pape": "rhone", "gigondas": "rhone", "cornas": "rhone",
  "saint-joseph": "rhone", "crozes-hermitage": "rhone", "condrieu": "rhone",
  "vacqueyras": "rhone", "côtes du rhône": "rhone",
  "sancerre": "loire", "pouilly-fumé": "loire", "vouvray": "loire",
  "muscadet sèvre et maine": "loire", "chinon": "loire", "bourgueil": "loire",
  "savennières": "loire", "anjou": "loire", "saumur": "loire",
  "bandol": "provence", "côtes de provence": "provence",
  "rioja": "rioja", "ribera del duero": "ribera", "priorat": "priorat",
  "rías baixas": "rias_baixas", "jerez": "jerez", "rueda": "rueda", "penedès": "penedes",
  "barossa valley": "barossa", "eden valley": "barossa",
  "mclaren vale": "mclaren", "yarra valley": "yarra",
  "margaret river": "margaret_river", "hunter valley": "hunter", "coonawarra": "coonawarra",
  "uco valley": "mendoza", "luján de cuyo": "mendoza",
  "cafayate": "salta", "salta": "salta",
  "wachau": "wachau", "kamptal": "kamptal", "kremstal": "kamptal",
};

const VARIETY_TO_DNA = {};
const varietyNameMap = {
  cabernet_sauvignon: ["Cabernet Sauvignon"],
  merlot: ["Merlot"],
  pinot_noir: ["Pinot Noir", "Pinot Nero"],
  syrah: ["Syrah", "Shiraz"],
  malbec: ["Malbec"],
  tempranillo: ["Tempranillo", "Tinta de Toro", "Tinto Fino"],
  sangiovese: ["Sangiovese", "Sangiovese Grosso", "Prugnolo Gentile", "Brunello"],
  nebbiolo: ["Nebbiolo"],
  grenache: ["Grenache", "Garnacha"],
  zinfandel: ["Zinfandel"],
  pinotage: ["Pinotage"],
  mourvedre: ["Mourvèdre", "Monastrell"],
  cabernet_franc: ["Cabernet Franc"],
  petit_verdot: ["Petit Verdot"],
  chardonnay: ["Chardonnay"],
  sauvignon_blanc: ["Sauvignon Blanc", "Sauvignon"],
  riesling: ["Riesling"],
  pinot_grigio: ["Pinot Grigio", "Pinot Gris"],
  chenin_blanc: ["Chenin Blanc"],
  viognier: ["Viognier"],
  gruner_veltliner: ["Grüner Veltliner"],
  albarino: ["Albariño"],
  gewurztraminer: ["Gewürztraminer"],
  semillon: ["Sémillon", "Semillon"],
  muscadet: ["Muscadet", "Melon"],
  vermentino: ["Vermentino"],
};
for (const [dnaId, wmNames] of Object.entries(varietyNameMap)) {
  for (const n of wmNames) VARIETY_TO_DNA[n] = dnaId;
}


// ═══════════════════════════════════════════════════════
// BUILD SEARCH INDEX
// ═══════════════════════════════════════════════════════

function buildSearchIndex() {
  const idx = { regionTerms: [], producerTerms: [], varietyTerms: [], countryTerms: [] };

  // Regions (1,097 from WineMag + manual subregions)
  for (const [regionKey, data] of Object.entries(lookupData.regionLookup)) {
    if (regionKey.length < 4 || ["other", "america", "europe"].includes(regionKey)) continue;
    const dnaCountryId = COUNTRY_TO_DNA[data.country] || null;
    const dnaRegionId = SUBREGION_TO_DNA_REGION[regionKey] || PROVINCE_TO_DNA_REGION[data.province] || null;
    idx.regionTerms.push({
      term: regionKey, wmCountry: data.country, wmProvince: data.province || "",
      subregion: data.subregion || "", dnaCountryId, dnaRegionId, count: data.count || 0,
    });
  }
  for (const [term, dnaRegionId] of Object.entries(SUBREGION_TO_DNA_REGION)) {
    if (term.length < 4 || idx.regionTerms.some(r => r.term === term.toLowerCase())) continue;
    let dnaCountryId = null;
    for (const [cId, regions] of Object.entries(DNA_REGIONS)) {
      if (regions.some(r => r.id === dnaRegionId)) { dnaCountryId = cId; break; }
    }
    idx.regionTerms.push({ term: term.toLowerCase(), wmCountry: "", wmProvince: "", subregion: "", dnaCountryId, dnaRegionId, count: 0 });
  }
  idx.regionTerms.sort((a, b) => b.term.length - a.term.length);

  // Producers (2,000 from WineMag + DNA estates)
  for (const [name, data] of Object.entries(lookupData.producers)) {
    if (name.length < 3) continue;
    idx.producerTerms.push({
      term: name.toLowerCase(), name, wmCountry: data.country,
      wmProvince: data.province || "", dnaCountryId: COUNTRY_TO_DNA[data.country] || null,
    });
  }
  for (const [regionId, estates] of Object.entries(DNA_ESTATES)) {
    for (const estate of estates) {
      if (!idx.producerTerms.some(p => p.term === estate.name.toLowerCase())) {
        let countryId = null;
        for (const [cId, regions] of Object.entries(DNA_REGIONS)) {
          if (regions.some(r => r.id === regionId)) { countryId = cId; break; }
        }
        idx.producerTerms.push({ term: estate.name.toLowerCase(), name: estate.name, wmCountry: "", wmProvince: "", dnaCountryId: countryId });
      }
    }
  }
  idx.producerTerms.sort((a, b) => b.term.length - a.term.length);

  // Varieties (488 from WineMag)
  for (const [name, data] of Object.entries(lookupData.varieties)) {
    if (name.length < 4 || /^(red|white|rosé|sparkling)\s+blend$/i.test(name)) continue;
    idx.varietyTerms.push({
      term: name.toLowerCase(), name, color: data.color,
      dnaVarietalId: VARIETY_TO_DNA[name] || null, count: data.count || 0,
    });
  }
  idx.varietyTerms.sort((a, b) => b.term.length - a.term.length);

  // Countries
  for (const [name, count] of Object.entries(lookupData.countries)) {
    if (name.length < 3) continue;
    idx.countryTerms.push({ term: name.toLowerCase(), name, dnaCountryId: COUNTRY_TO_DNA[name] || null, count });
  }

  return idx;
}

const SEARCH_INDEX = buildSearchIndex();


// ═══════════════════════════════════════════════════════
// MATCHING HELPERS
// ═══════════════════════════════════════════════════════

function termMatchesInText(term, text) {
  if (term.length <= 2) return false;
  if (term.includes(" ") || term.includes("-")) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[\\s,;:()/\\-\u2013\u2014.'])${escaped}(?:[\\s,;:()/\\-\u2013\u2014.']|$)`, "i");
  return re.test(text);
}


// ═══════════════════════════════════════════════════════
// PARSE WINE LIST
// ═══════════════════════════════════════════════════════

function smartTitleCase(name) {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  const upperRatio = letters.length > 0 ? (letters.replace(/[^A-Z]/g, "").length / letters.length) : 0;
  if (upperRatio < 0.7) return name;
  const lowerWords = new Set(["de", "du", "des", "le", "la", "les", "et", "en", "au", "aux", "di", "del", "della", "delle", "dei", "degli", "von", "van", "der", "das", "d"]);
  return name.toLowerCase().split(/(\s+)/).map((word, i) => {
    if (word.match(/^\s+$/)) return word;
    if (i > 0 && lowerWords.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join("");
}

export function parseWineList(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 3);
  const entries = [];
  const seenNorm = new Set();
  const skipPatterns = /^(reds?|whites?|ros\u00e9s?|roses?|sparkling|dessert|beer|cocktails?|spirits?|by the glass|by the bottle|wine list|beverages?|drinks?|half bottles?|magnums?|reserve list|champagne|bordeaux|burgundy|rh\u00f4ne|rhone|alsace|loire|tuscany|piedmont|rioja|south\s*africa|napa|sonoma|california|italy|france|spain|australia|argentina|chile|germany|austria|portugal|new\s*zealand)\s*$/i;

  for (const line of lines) {
    const stripped = line.replace(/[^a-zA-Z\u00C0-\u00FF\s]/g, "").trim();
    if (skipPatterns.test(stripped)) continue;
    if (/^\d+\s*$/.test(line)) continue;
    if (line.length > 200) continue;

    const priceMatch = line.match(/\$?\s*(\d{1,4}(?:\.\d{2})?)\s*$/);
    const priceVal = priceMatch ? parseFloat(priceMatch[1]) : null;
    const isYear = priceVal && priceVal >= 1900 && priceVal <= 2030;
    const price = (priceVal && !isYear) ? priceVal : null;
    let name = priceMatch ? line.slice(0, priceMatch.index).trim() : line;

    name = name.replace(/[.\s]*\.{2,}[.\s]*$/g, "").replace(/[\s.]+$/g, "")
      .replace(/_{2,}/g, "").replace(/\s{3,}/g, " ").replace(/^\d+\.\s*/, "")
      .replace(/[\u2018\u2019]/g, "'").trim();
    name = name.replace(/^[A-Z]?\d{1,4}[A-Z]?\s+/i, "").trim();

    if (name.length < 4) continue;

    if (/^[A-Za-z\u00C0-\u00FF\s\-']+,\s*(France|Italy|Spain|Germany|Austria|Portugal|Chile|Argentina|Australia|South Africa|New Zealand|United States)\s*$/i.test(name)) {
      const parts = name.split(",").map(p => p.trim());
      if (parts.length === 2 && parts[0].split(/\s+/).length <= 4) continue;
    }

    const displayName = smartTitleCase(name);
    const normKey = displayName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (normKey.length < 3 || seenNorm.has(normKey)) continue;
    seenNorm.add(normKey);
    entries.push({ name: displayName, price, originalLine: line });
  }
  return entries;
}


// ═══════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════

function scoreEntry(entry, userDNA) {
  const text = " " + entry.name.toLowerCase() + " ";
  var score = 0;
  const matchReasons = [];
  const detectedRegionIds = new Set();
  const detectedCountryIds = new Set();
  var detectedColor = null;
  const claimed = new Set();

  // PRODUCER (weight: 5)
  for (var pi = 0; pi < SEARCH_INDEX.producerTerms.length; pi++) {
    const prod = SEARCH_INDEX.producerTerms[pi];
    if (prod.term.length < 4) continue;
    if (text.includes(prod.term)) {
      if (prod.dnaCountryId) detectedCountryIds.add(prod.dnaCountryId);
      if (userDNA.estateNames.has(prod.term)) {
        score += 5;
        matchReasons.push({ type: "estate", label: prod.name, weight: 5 });
      }
      claimed.add(prod.term);
      break;
    }
  }

  // REGION (weight: 3 direct, 1 adjacent)
  for (var ri = 0; ri < SEARCH_INDEX.regionTerms.length; ri++) {
    const reg = SEARCH_INDEX.regionTerms[ri];
    if (claimed.has(reg.term)) continue;
    if (termMatchesInText(reg.term, text)) {
      if (reg.dnaRegionId) detectedRegionIds.add(reg.dnaRegionId);
      if (reg.dnaCountryId) detectedCountryIds.add(reg.dnaCountryId);
      if (reg.dnaRegionId && userDNA.regions.has(reg.dnaRegionId)) {
        score += 3;
        matchReasons.push({ type: "region", label: reg.subregion || reg.wmProvince || reg.term, weight: 3 });
      } else if (reg.dnaCountryId && userDNA.countries.has(reg.dnaCountryId)) {
        score += 1;
        const cName = DNA_COUNTRIES.find(function(c) { return c.id === reg.dnaCountryId; });
        const countryLabel = cName ? cName.name : reg.wmCountry;
        matchReasons.push({ type: "country_region", label: (reg.subregion || reg.wmProvince || reg.term) + " (you like " + countryLabel + ")", weight: 1 });
      }
      claimed.add(reg.term);
      break;
    }
  }

  // VARIETAL (weight: 2)
  for (var vi = 0; vi < SEARCH_INDEX.varietyTerms.length; vi++) {
    const v = SEARCH_INDEX.varietyTerms[vi];
    if (text.includes(v.term)) {
      if (v.color && !detectedColor) detectedColor = v.color;
      if (v.dnaVarietalId && userDNA.varietals.has(v.dnaVarietalId)) {
        score += 2;
        matchReasons.push({ type: "varietal", label: v.name, weight: 2 });
      }
      claimed.add(v.term);
      break;
    }
  }

  // COUNTRY (weight: 1, only if no region already scored)
  if (!matchReasons.some(function(r) { return r.type === "region" || r.type === "country_region"; })) {
    for (var ci = 0; ci < SEARCH_INDEX.countryTerms.length; ci++) {
      const c = SEARCH_INDEX.countryTerms[ci];
      if (c.term.length < 4) continue;
      if (termMatchesInText(c.term, text)) {
        if (c.dnaCountryId) detectedCountryIds.add(c.dnaCountryId);
        if (c.dnaCountryId && userDNA.countries.has(c.dnaCountryId)) {
          score += 1;
          matchReasons.push({ type: "country", label: c.name, weight: 1 });
        }
        break;
      }
    }
  }

  // FAVORITE WINE (weight: 10)
  for (var fi = 0; fi < userDNA.specificWines.length; fi++) {
    const fav = userDNA.specificWines[fi];
    if (fav.length >= 4 && text.includes(fav.toLowerCase())) {
      score += 10;
      matchReasons.push({ type: "favorite", label: fav, weight: 10 });
    }
  }

  return {
    name: entry.name,
    price: entry.price,
    originalLine: entry.originalLine,
    score: score,
    matchReasons: matchReasons.sort(function(a, b) { return b.weight - a.weight; }),
    detectedColor: detectedColor,
    detectedRegionIds: Array.from(detectedRegionIds),
    detectedCountryIds: Array.from(detectedCountryIds),
  };
}


// ═══════════════════════════════════════════════════════
// CURATE 5 PICKS
// ═══════════════════════════════════════════════════════

export function curatePicks(scoredEntries, options) {
  const minPrice = options.minPrice;
  const maxPrice = options.maxPrice;
  const colorPreference = options.colorPreference;

  var pool = scoredEntries;
  if (colorPreference && colorPreference !== "all") {
    const filtered = pool.filter(function(e) { return !e.detectedColor || e.detectedColor === colorPreference; });
    if (filtered.length >= 3) pool = filtered;
  }
  const matched = pool.filter(function(e) { return e.score > 0; }).sort(function(a, b) { return b.score - a.score; });
  if (matched.length === 0) return [];

  const picks = [];
  const used = new Set();

  function pickFrom(subset, type) {
    for (var i = 0; i < subset.length; i++) {
      const idx = matched.indexOf(subset[i]);
      if (idx >= 0 && !used.has(idx)) { used.add(idx); picks.push(Object.assign({}, subset[i], { pickType: type })); return true; }
    }
    return false;
  }

  // 1. TOP
  pickFrom(matched, "top");

  // 2. SPLURGE
  const priced = matched.filter(function(e) { return e.price !== null; });
  if (priced.length >= 2) {
    const prices = priced.map(function(e) { return e.price; }).sort(function(a, b) { return a - b; });
    const floor = maxPrice || prices[Math.floor(prices.length * 0.65)];
    pickFrom(priced.filter(function(e) { return e.price > floor; }).sort(function(a, b) { return b.score - a.score; }), "splurge");
  }

  // 3. VALUE
  if (priced.length >= 2) {
    const prices = priced.map(function(e) { return e.price; }).sort(function(a, b) { return a - b; });
    const ceil = minPrice || prices[Math.floor(prices.length * 0.35)];
    pickFrom(priced.filter(function(e) { return e.price <= ceil; }).sort(function(a, b) { return b.score - a.score; }), "value");
  }

  // 4. ADVENTURE
  const adv = matched.filter(function(e) {
    const hasVarietal = e.matchReasons.some(function(r) { return r.type === "varietal"; });
    const hasDirectRegion = e.matchReasons.some(function(r) { return r.type === "region"; });
    return e.score >= 1 && hasVarietal && !hasDirectRegion;
  }).sort(function(a, b) { return b.score - a.score; });
  pickFrom(adv, "adventure");

  // 5. WILDCARD
  for (var i = 0; i < matched.length && picks.length < 5; i++) {
    if (!used.has(i)) { used.add(i); picks.push(Object.assign({}, matched[i], { pickType: "wildcard" })); }
  }

  return picks.slice(0, 5);
}


// ═══════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

export function matchWinesAgainstDNA(entries, dnaProfile) {
  if (!dnaProfile || !entries.length) return [];
  const estateNames = new Set();
  const allEstates = dnaProfile.estates || {};
  for (const regionId of Object.keys(allEstates)) {
    const estateIds = allEstates[regionId] || [];
    for (var i = 0; i < estateIds.length; i++) {
      const estateId = estateIds[i];
      for (const [, estates] of Object.entries(DNA_ESTATES)) {
        const found = estates.find(function(est) { return est.id === estateId; });
        if (found) { estateNames.add(found.name.toLowerCase()); break; }
      }
    }
  }

  const userDNA = {
    countries: new Set(dnaProfile.countries || []),
    regions: new Set(Object.values(dnaProfile.regions || {}).flat()),
    varietals: new Set(dnaProfile.varietals || []),
    specificWines: dnaProfile.specificWines || [],
    estateNames: estateNames,
  };
  return entries.map(function(entry) { return scoreEntry(entry, userDNA); });
}

export function getPickTypeInfo(pickType) {
  switch (pickType) {
    case "top": return { label: "Top Pick", emoji: "\uD83C\uDFC6", color: "#8B2332", bg: "rgba(139,35,50,0.1)" };
    case "splurge": return { label: "Splurge", emoji: "\u2728", color: "#1B3D2F", bg: "rgba(27,61,47,0.08)" };
    case "value": return { label: "Great Value", emoji: "\uD83D\uDCB0", color: "#6B8F5E", bg: "rgba(107,143,94,0.1)" };
    case "adventure": return { label: "Adventure", emoji: "\uD83E\uDDED", color: "#8B6914", bg: "rgba(139,105,20,0.08)" };
    case "wildcard": return { label: "Worth Trying", emoji: "\uD83C\uDF77", color: "#1B3D2F", bg: "rgba(27,61,47,0.05)" };
    default: return { label: "Match", emoji: "\uD83C\uDF77", color: "#1B3D2F", bg: "rgba(27,61,47,0.05)" };
  }
}

export function getIndexStats() {
  return {
    regions: SEARCH_INDEX.regionTerms.length,
    producers: SEARCH_INDEX.producerTerms.length,
    varieties: SEARCH_INDEX.varietyTerms.length,
    countries: SEARCH_INDEX.countryTerms.length,
  };
}
