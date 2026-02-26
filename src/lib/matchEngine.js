// matchEngine.js — v3: Producer-first identification + identity matching + curated picks
import { WINE_DATABASE } from "./wineDatabase";
import { COUNTRIES, REGIONS, ESTATES, VARIETALS } from "./wineData";

function normalize(s) {
  return s.toLowerCase()
    .replace(/[éèêë]/g, "e").replace(/[àâäá]/g, "a").replace(/[ùûüú]/g, "u")
    .replace(/[ôöóò]/g, "o").replace(/[îïíì]/g, "i").replace(/[ñ]/g, "n").replace(/[ç]/g, "c")
    .replace(/[''"]/g, "").replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}

function termMatchesInText(term, text) {
  if (term.length <= 2) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (term.includes(" ")) return text.includes(term);
  const re = new RegExp(`(?:^|[\\s,;:()/\\-\u2013\u2014.])${escaped}(?:[\\s,;:()/\\-\u2013\u2014.]|$)`, "i");
  return re.test(text);
}

// Phase 1: Producer identification via WINE_DATABASE
function identifyProducer(wineName) {
  const norm = normalize(wineName);
  let bestMatch = null;
  let bestScore = 0;
  for (const entry of WINE_DATABASE) {
    for (const searchTerm of entry.search) {
      if (searchTerm.length < 3) continue;
      if (norm.includes(searchTerm)) {
        const score = searchTerm.length;
        if (score > bestScore) { bestScore = score; bestMatch = entry; }
      }
    }
  }
  return bestScore >= 4 ? bestMatch : null;
}

// Build alias search index for fallback
function buildSearchIndex() {
  const index = { countries: [], regions: [], varietals: [] };
  const countryAliases = {
    france: ["france", "french"], italy: ["italy", "italian", "italia"],
    spain: ["spain", "spanish"], portugal: ["portugal", "portuguese"],
    germany: ["germany", "german"], austria: ["austria", "austrian"],
    usa: ["united states", "american", "california", "oregon"],
    argentina: ["argentina", "argentine"], chile: ["chile", "chilean"],
    australia: ["australia", "australian"], new_zealand: ["new zealand"],
    south_africa: ["south africa", "south african"],
  };
  for (const country of COUNTRIES) {
    const aliases = countryAliases[country.id] || [country.name.toLowerCase()];
    index.countries.push({ id: country.id, name: country.name, terms: aliases });
  }
  const regionAliases = {
    burgundy: ["burgundy", "bourgogne", "chablis", "meursault", "puligny", "chassagne", "pommard", "volnay", "gevrey", "chambertin", "nuits-saint-georges", "cote de nuits", "cote de beaune", "vosne-romanee"],
    bordeaux: ["bordeaux", "medoc", "saint-emilion", "pomerol", "pauillac", "margaux", "saint-julien", "pessac-leognan", "graves", "sauternes", "haut-medoc", "saint-estephe"],
    champagne: ["champagne"],
    rhone: ["rhone", "chateauneuf-du-pape", "hermitage", "cote-rotie", "cornas", "gigondas", "crozes-hermitage", "condrieu"],
    loire: ["loire", "sancerre", "pouilly-fume", "vouvray", "muscadet", "chinon", "saumur champigny", "saumur"],
    alsace: ["alsace", "alsatian"],
    provence: ["provence", "bandol"], languedoc: ["languedoc", "roussillon"],
    tuscany: ["tuscany", "toscana", "chianti", "brunello", "montalcino", "bolgheri"],
    piedmont: ["piedmont", "piemonte", "barolo", "barbaresco", "langhe"],
    veneto: ["veneto", "valpolicella", "amarone", "soave", "prosecco"],
    sicily: ["sicily", "sicilia", "etna"],
    rioja: ["rioja"], ribera: ["ribera del duero"],
    priorat: ["priorat"], napa: ["napa valley", "napa", "oakville", "rutherford"],
    sonoma: ["sonoma", "russian river", "dry creek", "alexander valley"],
    willamette: ["willamette", "dundee hills"],
    stellenbosch: ["stellenbosch"], swartland: ["swartland"],
    walker_bay: ["walker bay", "hemel-en-aarde"],
    franschhoek: ["franschhoek"], constantia: ["constantia"], paarl: ["paarl"],
    mendoza: ["mendoza", "uco valley"], salta: ["salta"],
    barossa: ["barossa valley", "barossa"], mclaren: ["mclaren vale"],
    margaret_river: ["margaret river"], marlborough: ["marlborough"],
    central_otago: ["central otago"], hawkes_bay: ["hawkes bay"],
    douro: ["douro"], mosel: ["mosel"], rheingau: ["rheingau"],
    wachau: ["wachau"], maipo: ["maipo valley", "maipo"], colchagua: ["colchagua"],
  };
  for (const [countryId, regionList] of Object.entries(REGIONS)) {
    for (const region of regionList) {
      const aliases = regionAliases[region.id] || [region.name.toLowerCase()];
      index.regions.push({ id: region.id, countryId, name: region.name, terms: aliases });
    }
  }
  const varietalTerms = {
    cabernet_sauvignon: ["cabernet sauvignon"], merlot: ["merlot"],
    pinot_noir: ["pinot noir"], syrah: ["syrah", "shiraz"], malbec: ["malbec"],
    tempranillo: ["tempranillo"], sangiovese: ["sangiovese"],
    nebbiolo: ["nebbiolo"], grenache: ["grenache", "garnacha"],
    zinfandel: ["zinfandel"], pinotage: ["pinotage"],
    mourvedre: ["mourvedre", "monastrell"], cabernet_franc: ["cabernet franc"],
    chardonnay: ["chardonnay"], sauvignon_blanc: ["sauvignon blanc"],
    riesling: ["riesling"], pinot_grigio: ["pinot grigio", "pinot gris"],
    chenin_blanc: ["chenin blanc", "chenin"], viognier: ["viognier"],
    gruner_veltliner: ["gruner veltliner"], albarino: ["albarino"],
    gewurztraminer: ["gewurztraminer"], semillon: ["semillon"], vermentino: ["vermentino"],
  };
  for (const varietal of VARIETALS) {
    const terms = varietalTerms[varietal.id] || [varietal.name.toLowerCase()];
    index.varietals.push({ id: varietal.id, name: varietal.name, color: varietal.color, terms });
  }
  return index;
}
const SEARCH_INDEX = buildSearchIndex();

// Map database fields to DNA IDs
function mapCountryToId(n) {
  const m = { "France":"france","Italy":"italy","Spain":"spain","Portugal":"portugal","Germany":"germany","Austria":"austria","USA":"usa","Argentina":"argentina","Chile":"chile","Australia":"australia","New Zealand":"new_zealand","South Africa":"south_africa" };
  return m[n] || null;
}
function mapRegionToId(n) {
  const m = { "Bordeaux":"bordeaux","Burgundy":"burgundy","Champagne":"champagne","Rhône":"rhone","Loire":"loire","Alsace":"alsace","Provence":"provence","Languedoc":"languedoc","Beaujolais":"burgundy","Tuscany":"tuscany","Piedmont":"piedmont","Veneto":"veneto","Sicily":"sicily","Campania":"campania","Friuli":"trentino","Rioja":"rioja","Ribera del Duero":"ribera","Priorat":"priorat","California":"napa","Oregon":"willamette","South Australia":"barossa","Western Australia":"margaret_river","Stellenbosch":"stellenbosch","Walker Bay":"walker_bay","Swartland":"swartland","Mendoza":"mendoza","Patagonia":"patagonia_ar","Marlborough":"marlborough","Central Otago":"central_otago","Hawke's Bay":"hawkes_bay","Auckland":"marlborough","Wairarapa":"hawkes_bay","Douro":"douro","Mosel":"mosel","Rheingau":"rheingau","Wachau":"wachau","Maipo Valley":"maipo","Colchagua Valley":"colchagua","Aconcagua Valley":"aconcagua","Sonoma":"sonoma","New South Wales":"hunter" };
  return m[n] || null;
}
function mapVarietyToId(n) {
  const m = { "Cabernet Sauvignon":"cabernet_sauvignon","Merlot":"merlot","Pinot Noir":"pinot_noir","Syrah":"syrah","Shiraz":"syrah","Malbec":"malbec","Tempranillo":"tempranillo","Sangiovese":"sangiovese","Nebbiolo":"nebbiolo","Grenache":"grenache","Zinfandel":"zinfandel","Pinotage":"pinotage","Mourvèdre":"mourvedre","Cabernet Franc":"cabernet_franc","Chardonnay":"chardonnay","Sauvignon Blanc":"sauvignon_blanc","Riesling":"riesling","Pinot Grigio":"pinot_grigio","Pinot Gris":"pinot_grigio","Chenin Blanc":"chenin_blanc","Viognier":"viognier","Grüner Veltliner":"gruner_veltliner","Sémillon":"semillon","Gewürztraminer":"gewurztraminer","Albariño":"albarino","Vermentino":"vermentino","Touriga Nacional":"tempranillo","Corvina":"sangiovese","Aglianico":"nebbiolo","Fiano":"chenin_blanc","Nero d'Avola":"sangiovese","Gamay":"pinot_noir","Carignan":"grenache","Cinsault":"grenache","Pinot Meunier":"pinot_noir" };
  return m[n] || null;
}

function findEstateById(estateId) {
  for (const [, estateList] of Object.entries(ESTATES)) {
    const found = estateList.find(e => e.id === estateId);
    if (found) return found;
  }
  return null;
}

// Parse wine list text
export function parseWineList(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 3);
  const entries = [];
  const seenNorm = new Set();
  const skipPatterns = /^(reds?|whites?|ros[eé]s?|sparkling|dessert|beer|cocktails?|spirits?|by the glass|by the bottle|wine list|beverages?|drinks?|half bottles?|magnums?|reserve list|appetizers?|entr[eé]es?|mains?|starters?)\s*$/i;

  for (const line of lines) {
    if (skipPatterns.test(line)) continue;
    if (/^\d+\s*$/.test(line)) continue;
    if (line.length > 200) continue;
    const priceMatch = line.match(/\$?\s*(\d{1,4}(?:\.\d{2})?)\s*$/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : null;
    let name = priceMatch ? line.slice(0, priceMatch.index).trim() : line;
    // Clean formatting artifacts
    name = name.replace(/[\s.·…]{2,}\s*$/, "").replace(/\.+\s*$/, "");
    name = name.replace(/_{2,}/g, " ").replace(/\s{3,}/g, " ");
    name = name.replace(/^#?\d+\.\s*/, "");
    name = name.replace(/^[A-Z]?\d{1,4}[A-Z]?\s+/i, "");
    name = name.replace(/,\s*$/, "").trim();
    if (name.length < 4) continue;
    const normKey = normalize(name).replace(/[^a-z0-9]/g, "");
    if (seenNorm.has(normKey)) continue;
    seenNorm.add(normKey);
    entries.push({ name, price, originalLine: line });
  }
  return entries;
}

// Score a single wine entry against DNA
function scoreEntry(entry, userDNA) {
  const text = ` ${entry.name.toLowerCase()} `;
  const normText = ` ${normalize(entry.name)} `;
  let score = 0;
  const matchReasons = [];
  let detectedColor = null;
  const detectedCountryIds = [];
  const detectedRegionIds = [];
  let producerIdentified = false;

  // Phase 1: Producer database lookup
  const dbMatch = identifyProducer(entry.name);
  if (dbMatch) {
    producerIdentified = true;
    const countryId = mapCountryToId(dbMatch.country);
    const regionId = mapRegionToId(dbMatch.region);
    if (countryId) detectedCountryIds.push(countryId);
    if (regionId) detectedRegionIds.push(regionId);

    // Estate/producer match
    for (const estateId of userDNA.estates) {
      const estateData = findEstateById(estateId);
      if (estateData) {
        const en = normalize(estateData.name);
        const pn = normalize(dbMatch.name);
        if (pn.includes(en) || en.includes(pn)) {
          score += 5;
          matchReasons.push({ type: "estate", label: dbMatch.name, weight: 5 });
          break;
        }
      }
    }
    // Region match
    if (regionId && userDNA.regions.has(regionId)) {
      score += 3;
      matchReasons.push({ type: "region", label: dbMatch.subregion || dbMatch.region, weight: 3 });
    } else if (countryId && userDNA.countries.has(countryId)) {
      score += 1;
      matchReasons.push({ type: "country", label: dbMatch.country, weight: 1 });
    }
    // Varietal match from database metadata
    for (const variety of dbMatch.varieties) {
      const varietalId = mapVarietyToId(variety);
      if (varietalId) {
        const vData = VARIETALS.find(v => v.id === varietalId);
        if (vData && !detectedColor) detectedColor = vData.color;
        if (userDNA.varietals.has(varietalId)) {
          score += 2;
          matchReasons.push({ type: "varietal", label: variety, weight: 2 });
          break;
        }
      }
    }
    // Specific wine match
    for (const fav of userDNA.specificWineTerms) {
      if (normText.includes(fav)) {
        score += 10;
        matchReasons.push({ type: "favorite", label: "One of your favorites", weight: 10 });
        break;
      }
    }
  }

  // Phase 2: Fallback alias matching
  if (!producerIdentified) {
    for (const [, estateList] of Object.entries(ESTATES)) {
      for (const estate of estateList) {
        const terms = [estate.name.toLowerCase()];
        const stripped = estate.name.toLowerCase().replace(/^(domaine|ch[aâ]teau|tenuta|bodega|quinta|weingut)\s+/i, "");
        if (stripped !== estate.name.toLowerCase() && stripped.length > 3) terms.push(stripped);
        if (terms.some(t => text.includes(t))) {
          if (userDNA.estates.has(estate.id)) {
            score += 5;
            matchReasons.push({ type: "estate", label: estate.name, weight: 5 });
          }
        }
      }
    }
    for (const regionData of SEARCH_INDEX.regions) {
      if (regionData.terms.some(t => termMatchesInText(t, text))) {
        detectedRegionIds.push(regionData.id);
        detectedCountryIds.push(regionData.countryId);
        if (userDNA.regions.has(regionData.id)) {
          score += 3;
          matchReasons.push({ type: "region", label: regionData.name, weight: 3 });
        } else if (userDNA.countries.has(regionData.countryId)) {
          score += 1;
          const cn = COUNTRIES.find(c => c.id === regionData.countryId)?.name || "";
          matchReasons.push({ type: "country_region", label: `${regionData.name} (you like ${cn})`, weight: 1 });
        }
      }
    }
    for (const varietalData of SEARCH_INDEX.varietals) {
      if (varietalData.terms.some(t => text.includes(t.toLowerCase()))) {
        if (!detectedColor) detectedColor = varietalData.color;
        if (userDNA.varietals.has(varietalData.id)) {
          score += 2;
          matchReasons.push({ type: "varietal", label: varietalData.name, weight: 2 });
        }
      }
    }
    for (const countryData of SEARCH_INDEX.countries) {
      if (detectedCountryIds.includes(countryData.id)) continue;
      if (countryData.terms.some(t => termMatchesInText(t, text))) {
        detectedCountryIds.push(countryData.id);
        if (userDNA.countries.has(countryData.id)) {
          score += 1;
          matchReasons.push({ type: "country", label: countryData.name, weight: 1 });
        }
      }
    }
    for (const fav of userDNA.specificWineTerms) {
      if (normText.includes(fav)) {
        score += 10;
        matchReasons.push({ type: "favorite", label: "One of your favorites", weight: 10 });
        break;
      }
    }
  }

  return { ...entry, score, matchReasons: matchReasons.sort((a, b) => b.weight - a.weight), detectedColor, detectedCountryIds: [...new Set(detectedCountryIds)], detectedRegionIds: [...new Set(detectedRegionIds)], producerMatch: dbMatch, producerIdentified };
}

// Curate 5 picks
export function curatePicks(scoredEntries, { minPrice, maxPrice, colorPreference }) {
  let pool = scoredEntries;
  if (colorPreference && colorPreference !== "all") {
    const cf = pool.filter(e => !e.detectedColor || e.detectedColor === colorPreference);
    if (cf.length >= 3) pool = cf;
  }
  const matched = pool.filter(e => e.score > 0).sort((a, b) => b.score - a.score);
  if (matched.length === 0) return [];
  const picks = [];
  const used = new Set();
  function pickBest(subset, pickType) {
    for (const entry of subset) {
      const idx = matched.indexOf(entry);
      if (idx >= 0 && !used.has(idx)) { used.add(idx); picks.push({ ...entry, pickType }); return true; }
    }
    return false;
  }
  // 1. TOP PICK
  pickBest(matched, "top");
  // 2. SPLURGE
  const priced = matched.filter(e => e.price !== null);
  if (priced.length > 0) {
    const prices = priced.map(e => e.price).sort((a, b) => a - b);
    const thresh = maxPrice || prices[Math.floor(prices.length * 0.65)] || 100;
    pickBest(priced.filter(e => e.price > thresh).sort((a, b) => b.score - a.score), "splurge");
  }
  // 3. VALUE
  if (priced.length > 0) {
    const prices = priced.map(e => e.price).sort((a, b) => a - b);
    const thresh = minPrice || prices[Math.floor(prices.length * 0.35)] || 60;
    pickBest(priced.filter(e => e.price <= thresh).sort((a, b) => b.score - a.score), "value");
  }
  // 4. ADVENTURE
  const adventurePool = matched.filter(e => {
    if (e.score < 1) return false;
    const hasVarietal = e.matchReasons.some(r => r.type === "varietal");
    const hasRegion = e.matchReasons.some(r => r.type === "region" || r.type === "country");
    return hasVarietal && !hasRegion;
  }).sort((a, b) => b.score - a.score);
  pickBest(adventurePool, "adventure");
  // 5. WILD CARD
  for (let i = 0; i < matched.length && picks.length < 5; i++) {
    if (!used.has(i)) { used.add(i); picks.push({ ...matched[i], pickType: "wildcard" }); }
  }
  return picks.slice(0, 5);
}

// Main entry point
export function matchWinesAgainstDNA(entries, dnaProfile) {
  if (!dnaProfile || !entries.length) return [];
  const userDNA = {
    countries: new Set(dnaProfile.countries || []),
    regions: new Set(Object.values(dnaProfile.regions || {}).flat()),
    estates: new Set(Object.values(dnaProfile.estates || {}).flat()),
    varietals: new Set(dnaProfile.varietals || []),
    specificWineTerms: (dnaProfile.specificWines || []).map(w => normalize(w)),
  };
  return entries.map(entry => scoreEntry(entry, userDNA));
}

// Pick type display info
export function getPickTypeInfo(pickType) {
  switch (pickType) {
    case "top": return { label: "Top Pick", emoji: "\u{1F3C6}", color: "#8B2332", bg: "rgba(139,35,50,0.1)" };
    case "splurge": return { label: "Splurge", emoji: "\u2728", color: "#1B3D2F", bg: "rgba(27,61,47,0.08)" };
    case "value": return { label: "Great Value", emoji: "\u{1F4B0}", color: "#6B8F5E", bg: "rgba(107,143,94,0.1)" };
    case "adventure": return { label: "Adventure", emoji: "\u{1F9ED}", color: "#8B6914", bg: "rgba(139,105,20,0.08)" };
    case "wildcard": return { label: "Worth Trying", emoji: "\u{1F377}", color: "#1B3D2F", bg: "rgba(27,61,47,0.05)" };
    default: return { label: "Match", emoji: "\u{1F377}", color: "#1B3D2F", bg: "rgba(27,61,47,0.05)" };
  }
}
