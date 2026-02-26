// matchEngine.js — v2: Identity-first matching with curated picks
//
// Architecture informed by the Sommeasy app's scoring model:
// - Identity signals (estate > region > varietal > country) drive ranking
// - Word-boundary matching prevents false positives ("sa" in "SAINT")
// - Curated output: 5 distinct picks (Top, Splurge, Value, Adventure, +1)
// - DNA boost is additive to score (not just metadata)

import { COUNTRIES, REGIONS, ESTATES, VARIETALS } from "./wineData";

// ─── Word-boundary-safe matching ───
// Instead of text.includes(term), we check that the term appears
// as a whole word (not inside another word). This prevents:
// - "sa" matching inside "SAINT"
// - "port" matching inside "PORTFOLIO"
// - "asti" matching inside "FANTASTIC"

function termMatchesInText(term, text) {
  if (term.length <= 2) return false; // Skip very short terms entirely
  // Escape regex special chars in the term
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // For multi-word terms, just check includes (they're specific enough)
  if (term.includes(" ")) return text.includes(term);
  // For single words, require word boundary
  const re = new RegExp(`(?:^|[\\s,;:()/\\-–—.])${escaped}(?:[\\s,;:()/\\-–—.]|$)`, "i");
  return re.test(text);
}

// ─── Build search index ───

function buildSearchIndex() {
  const index = { countries: [], regions: [], estates: [], varietals: [] };

  const countryAliases = {
    france: ["france", "french"],
    italy: ["italy", "italian", "italia"],
    spain: ["spain", "spanish"],
    portugal: ["portugal", "portuguese"],
    germany: ["germany", "german"],
    austria: ["austria", "austrian"],
    usa: ["united states", "american", "california", "oregon"],
    argentina: ["argentina", "argentine"],
    chile: ["chile", "chilean"],
    australia: ["australia", "australian"],
    new_zealand: ["new zealand"],
    south_africa: ["south africa", "south african"],
  };

  for (const country of COUNTRIES) {
    const aliases = countryAliases[country.id] || [country.name.toLowerCase()];
    index.countries.push({ id: country.id, name: country.name, terms: aliases });
  }

  // Region aliases — only terms that are specific enough for word-boundary matching
  const regionAliases = {
    burgundy: ["burgundy", "bourgogne", "chablis", "meursault", "puligny", "chassagne", "pommard", "volnay", "gevrey", "chambertin", "nuits-saint-georges", "côte de nuits", "cote de nuits", "côte de beaune", "cote de beaune", "vosne-romanée", "vosne romanee"],
    bordeaux: ["bordeaux", "médoc", "medoc", "saint-émilion", "saint emilion", "pomerol", "pauillac", "margaux", "saint-julien", "saint julien", "pessac-léognan", "pessac leognan", "graves", "sauternes", "haut-médoc", "haut medoc", "saint-estèphe", "saint estephe", "côtes de blaye", "cotes de blaye"],
    champagne: ["champagne"],
    rhone: ["rhône", "rhone", "châteauneuf-du-pape", "chateauneuf du pape", "hermitage", "côte-rôtie", "cote rotie", "cornas", "gigondas", "vacqueyras", "crozes-hermitage", "saint-joseph", "condrieu"],
    loire: ["loire", "sancerre", "pouilly-fumé", "pouilly fume", "vouvray", "muscadet", "chinon", "bourgueil", "savennières", "anjou", "saumur champigny", "saumur"],
    alsace: ["alsace", "alsatian"],
    provence: ["provence", "bandol", "côtes de provence", "cotes de provence"],
    languedoc: ["languedoc", "roussillon", "minervois", "corbières", "fitou"],
    tuscany: ["tuscany", "toscana", "chianti", "brunello", "montalcino", "bolgheri", "maremma"],
    piedmont: ["piedmont", "piemonte", "barolo", "barbaresco", "langhe", "roero", "gavi"],
    veneto: ["veneto", "valpolicella", "amarone", "soave", "prosecco"],
    sicily: ["sicily", "sicilia", "etna"],
    puglia: ["puglia", "primitivo", "salento"],
    trentino: ["trentino", "alto adige", "südtirol"],
    campania: ["campania", "taurasi", "irpinia", "fiano di avellino"],
    rioja: ["rioja"],
    ribera: ["ribera del duero"],
    priorat: ["priorat", "priorato"],
    rias_baixas: ["rías baixas", "rias baixas"],
    jerez: ["jerez", "sherry"],
    penedes: ["penedès", "penedes", "cava"],
    rueda: ["rueda"],
    napa: ["napa valley", "napa", "oakville", "rutherford", "stags leap", "howell mountain", "spring mountain", "calistoga"],
    sonoma: ["sonoma", "russian river", "dry creek", "alexander valley", "sonoma coast"],
    willamette: ["willamette", "eola-amity", "dundee hills"],
    paso_robles: ["paso robles"],
    santa_barbara: ["santa barbara", "santa ynez", "sta. rita hills", "santa rita hills"],
    finger_lakes: ["finger lakes"],
    walla_walla: ["walla walla"],
    stellenbosch: ["stellenbosch"],
    constantia: ["constantia"],
    franschhoek: ["franschhoek"],
    swartland: ["swartland"],
    walker_bay: ["walker bay", "hemel-en-aarde"],
    paarl: ["paarl"],
    mendoza: ["mendoza", "uco valley", "luján de cuyo", "lujan de cuyo"],
    salta: ["salta", "cafayate"],
    patagonia_ar: ["patagonia"],
    maipo: ["maipo valley", "maipo"],
    colchagua: ["colchagua"],
    casablanca: ["casablanca valley", "casablanca"],
    aconcagua: ["aconcagua"],
    barossa: ["barossa valley", "barossa"],
    mclaren: ["mclaren vale"],
    yarra: ["yarra valley", "yarra"],
    margaret_river: ["margaret river"],
    hunter: ["hunter valley"],
    coonawarra: ["coonawarra"],
    marlborough: ["marlborough"],
    central_otago: ["central otago"],
    hawkes_bay: ["hawke's bay", "hawkes bay"],
    douro: ["douro"],
    alentejo: ["alentejo"],
    dao: ["dão"],
    vinho_verde: ["vinho verde"],
    mosel: ["mosel"],
    rheingau: ["rheingau"],
    pfalz: ["pfalz"],
    baden: ["baden"],
    wachau: ["wachau"],
    kamptal: ["kamptal"],
    burgenland: ["burgenland"],
  };

  for (const [countryId, regionList] of Object.entries(REGIONS)) {
    for (const region of regionList) {
      const aliases = regionAliases[region.id] || [region.name.toLowerCase()];
      index.regions.push({ id: region.id, countryId, name: region.name, terms: aliases });
    }
  }

  for (const [regionId, estateList] of Object.entries(ESTATES)) {
    for (const estate of estateList) {
      const terms = [estate.name.toLowerCase()];
      const stripped = estate.name.toLowerCase()
        .replace(/^(domaine|château|chateau|tenuta|bodega|quinta|weingut)\s+/i, "")
        .replace(/\s*\(.*\)\s*/g, "");
      if (stripped !== estate.name.toLowerCase() && stripped.length > 3) terms.push(stripped);
      index.estates.push({ id: estate.id, regionId, name: estate.name, terms });
    }
  }

  // Varietals — careful with overlapping terms
  // "cabernet sauvignon" must NOT match "sauvignon blanc" and vice versa
  const varietalTerms = {
    cabernet_sauvignon: ["cabernet sauvignon"],
    merlot: ["merlot"],
    pinot_noir: ["pinot noir"],
    syrah: ["syrah", "shiraz"],
    malbec: ["malbec"],
    tempranillo: ["tempranillo", "tinto fino"],
    sangiovese: ["sangiovese"],
    nebbiolo: ["nebbiolo"],
    grenache: ["grenache", "garnacha"],
    zinfandel: ["zinfandel"],
    pinotage: ["pinotage"],
    mourvedre: ["mourvèdre", "mourvedre", "monastrell"],
    cabernet_franc: ["cabernet franc"],
    petit_verdot: ["petit verdot"],
    chardonnay: ["chardonnay"],
    sauvignon_blanc: ["sauvignon blanc"],
    riesling: ["riesling"],
    pinot_grigio: ["pinot grigio", "pinot gris"],
    chenin_blanc: ["chenin blanc", "chenin"],
    viognier: ["viognier"],
    gruner_veltliner: ["grüner veltliner", "gruner veltliner"],
    albarino: ["albariño", "albarino"],
    gewurztraminer: ["gewürztraminer", "gewurztraminer"],
    semillon: ["sémillon", "semillon"],
    muscadet: ["muscadet"],
    vermentino: ["vermentino"],
  };

  for (const varietal of VARIETALS) {
    const terms = varietalTerms[varietal.id] || [varietal.name.toLowerCase()];
    index.varietals.push({ id: varietal.id, name: varietal.name, color: varietal.color, terms });
  }

  return index;
}

const SEARCH_INDEX = buildSearchIndex();

// ─── Detect country from a region match (for "adventure" picks) ───
function getCountryForRegion(regionId) {
  for (const [countryId, regions] of Object.entries(REGIONS)) {
    if (regions.some(r => r.id === regionId)) return countryId;
  }
  return null;
}

// ─── Parse wine list text into entries ───

function smartTitleCase(name) {
  // If mostly uppercase, convert to title case for readability
  const letters = name.replace(/[^a-zA-Z]/g, "");
  const upperRatio = letters.length > 0 ? (letters.replace(/[^A-Z]/g, "").length / letters.length) : 0;
  if (upperRatio < 0.7) return name; // Already mixed case, leave it

  // French/wine words that should stay lowercase (except at start)
  const lowerWords = new Set(["de", "du", "des", "le", "la", "les", "et", "en", "au", "aux", "di", "del", "della", "delle", "dei", "degli", "von", "van", "der", "das"]);

  return name.toLowerCase().replace(/(?:^|\s)(\S)/g, (match, char, offset) => {
    // Check if this word should stay lowercase
    const wordMatch = name.toLowerCase().slice(offset).match(/^\s*(\S+)/);
    if (wordMatch && lowerWords.has(wordMatch[1]) && offset > 0) {
      return match;
    }
    return match.slice(0, -1) + char.toUpperCase();
  }).replace(/^./, c => c.toUpperCase()); // Ensure first char is always upper
}

export function parseWineList(text) {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 3);
  const entries = [];
  const seenNorm = new Set();

  // Category headers to skip
  const skipPatterns = /^(reds?|whites?|rosés?|roses?|sparkling|dessert|beer|cocktails?|spirits?|by the glass|by the bottle|wine list|beverages?|drinks?|half bottles?|magnums?|reserve list|champagne|bordeaux|burgundy|rhône|rhone|alsace|loire|tuscany|piedmont|rioja|south\s*africa|napa|sonoma)\s*$/i;

  for (const line of lines) {
    if (skipPatterns.test(line.replace(/[^a-zA-Z\s]/g, "").trim())) continue;
    if (/^\d+\s*$/.test(line)) continue;
    if (line.length > 200) continue;

    // Extract price - look for $ or number at end
    const priceMatch = line.match(/\$?\s*(\d{1,4}(?:\.\d{2})?)\s*$/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : null;
    // Skip if price looks like a year (1900-2030)
    const priceVal = priceMatch ? parseFloat(priceMatch[1]) : null;
    const isYear = priceVal && priceVal >= 1900 && priceVal <= 2030;
    const finalPrice = (priceVal && !isYear) ? priceVal : null;

    let name = priceMatch ? line.slice(0, priceMatch.index).trim() : line;

    // Clean up formatting artifacts
    name = name
      .replace(/[.\s]*\.{2,}[.\s]*$/g, "")  // trailing dots (including ". . . . .")
      .replace(/[\s.]+$/g, "")                // trailing spaces/dots
      .replace(/_{2,}/g, "")                  // underscores
      .replace(/\s{3,}/g, " ")               // excessive whitespace
      .replace(/^\d+\.\s*/, "")              // leading "1. "
      .replace(/['']/g, "'")                  // smart quotes → straight
      .trim();

    // Strip leading bin numbers like "B44", "747A", "B60"
    name = name.replace(/^[A-Z]?\d{1,4}[A-Z]?\s+/i, "").trim();

    // Strip trailing vintage years if they're the last thing
    // (we keep the year info but don't include it in the display name if it's just "2019")
    name = name.replace(/,?\s*\d{4}\s*$/, "").trim();

    if (name.length < 4) continue;

    // Skip lines that are just a region/appellation name with "France"/"Italy" etc (section headers)
    if (/^[A-Za-zÀ-ÿ\s-]+,\s*(France|Italy|Spain|Germany|Austria|Portugal)\s*$/i.test(name)) {
      // Check if it's JUST a region + country (like "Bordeaux, France" or "Saint-Julien, France")
      // Only skip if there's no producer/wine name component
      const parts = name.split(",").map(p => p.trim());
      if (parts.length === 2 && parts[0].split(/\s+/).length <= 3) continue;
    }

    // Title case for display
    const displayName = smartTitleCase(name);

    // Normalize for dedup (strip accents, lowercase, alphanum only)
    const normKey = displayName.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    if (seenNorm.has(normKey)) continue;
    seenNorm.add(normKey);

    entries.push({ name: displayName, price: finalPrice, originalLine: line });
  }

  return entries;
}

// ─── Score a single wine entry against DNA ───

function scoreEntry(entry, userDNA) {
  const text = ` ${entry.name.toLowerCase()} `; // pad for boundary matching
  let score = 0;
  const matchReasons = [];
  const detectedRegions = [];
  const detectedCountries = [];

  // Estate match (strongest signal — weight: 5)
  for (const estateData of SEARCH_INDEX.estates) {
    if (estateData.terms.some(t => text.includes(t.toLowerCase()))) {
      if (userDNA.estates.has(estateData.id)) {
        score += 5;
        matchReasons.push({ type: "estate", label: estateData.name, weight: 5 });
      }
    }
  }

  // Region match (strong signal — weight: 3)
  for (const regionData of SEARCH_INDEX.regions) {
    if (regionData.terms.some(t => termMatchesInText(t, text))) {
      detectedRegions.push(regionData);
      if (userDNA.regions.has(regionData.id)) {
        score += 3;
        matchReasons.push({ type: "region", label: regionData.name, weight: 3 });
      } else if (userDNA.countries.has(regionData.countryId)) {
        score += 1;
        const countryName = COUNTRIES.find(c => c.id === regionData.countryId)?.name || "";
        matchReasons.push({ type: "country_region", label: `${regionData.name} (you like ${countryName})`, weight: 1 });
      }
      detectedCountries.push(regionData.countryId);
    }
  }

  // Varietal match (weight: 2) — use exact multi-word matching
  let detectedColor = null;
  for (const varietalData of SEARCH_INDEX.varietals) {
    if (varietalData.terms.some(t => text.includes(t.toLowerCase()))) {
      if (!detectedColor) detectedColor = varietalData.color;
      if (userDNA.varietals.has(varietalData.id)) {
        score += 2;
        matchReasons.push({ type: "varietal", label: varietalData.name, weight: 2 });
      }
    }
  }

  // Country match (weakest standalone signal — weight: 1)
  // Only if we didn't already score via region
  for (const countryData of SEARCH_INDEX.countries) {
    if (detectedCountries.includes(countryData.id)) continue; // Already counted via region
    if (countryData.terms.some(t => termMatchesInText(t, text))) {
      detectedCountries.push(countryData.id);
      if (userDNA.countries.has(countryData.id)) {
        score += 1;
        matchReasons.push({ type: "country", label: countryData.name, weight: 1 });
      }
    }
  }

  // Specific wine match (strongest — weight: 10)
  for (const fav of userDNA.specificWines) {
    const favLower = fav.toLowerCase();
    if (text.includes(favLower)) {
      score += 10;
      matchReasons.push({ type: "favorite", label: fav, weight: 10 });
    }
  }

  return {
    ...entry,
    score,
    matchReasons: matchReasons.sort((a, b) => b.weight - a.weight),
    detectedColor,
    detectedRegions: detectedRegions.map(r => r.id),
    detectedCountries,
  };
}

// ─── Curate 5 picks from scored results ───
//
// Pick types:
// 1. TOP PICK — highest score overall
// 2. SPLURGE — highest score among wines above budget max (or top 25% by price)
// 3. VALUE — highest score among wines at or below budget min (or bottom 25% by price)
// 4. ADVENTURE — highest score from a country/region the user did NOT select
// 5. WILD CARD — next best that wasn't already picked

export function curatePicks(scoredEntries, { minPrice, maxPrice, colorPreference }) {
  // Filter by color preference
  let pool = scoredEntries;
  if (colorPreference && colorPreference !== "all") {
    const colorFiltered = pool.filter(e => {
      if (!e.detectedColor) return true; // Keep if we can't detect
      return e.detectedColor === colorPreference;
    });
    // Only apply filter if it leaves us with enough results
    if (colorFiltered.length >= 3) pool = colorFiltered;
  }

  // Only consider wines with score > 0
  const matched = pool.filter(e => e.score > 0).sort((a, b) => b.score - a.score);
  if (matched.length === 0) return [];

  const picks = [];
  const usedIndices = new Set();

  // Helper: pick best from a subset
  function pickBest(subset, pickType) {
    for (const entry of subset) {
      const idx = matched.indexOf(entry);
      if (idx >= 0 && !usedIndices.has(idx)) {
        usedIndices.add(idx);
        picks.push({ ...entry, pickType });
        return true;
      }
    }
    return false;
  }

  // 1. TOP PICK — highest score
  pickBest(matched, "top");

  // 2. SPLURGE — highest score among pricier wines
  const pricedWines = matched.filter(e => e.price !== null);
  if (pricedWines.length > 0) {
    const priceThreshold = maxPrice || Math.max(...pricedWines.map(e => e.price)) * 0.65;
    const splurgePool = pricedWines.filter(e => e.price > priceThreshold).sort((a, b) => b.score - a.score);
    pickBest(splurgePool, "splurge");
  }

  // 3. VALUE — highest score among cheaper wines
  if (pricedWines.length > 0) {
    const valueThreshold = minPrice || Math.min(...pricedWines.map(e => e.price)) * 1.5 || 50;
    const valuePool = pricedWines.filter(e => e.price <= valueThreshold).sort((a, b) => b.score - a.score);
    pickBest(valuePool, "value");
  }

  // 4. ADVENTURE — good score but from a country or region they didn't select
  // This leverages the "discovery" concept from the DNA profile recs
  const userCountrySet = new Set(); // rebuild from DNA - passed via scoredEntries metadata
  const adventurePool = matched.filter(e => {
    // Has some score (we like something about it) but at least one detected region/country is NOT in user's picks
    if (e.score < 1) return false;
    const hasUnknownRegion = e.detectedRegions?.some(rId => {
      // Check if region is NOT in user's selected regions
      for (const entry of SEARCH_INDEX.regions) {
        if (entry.id === rId) return true; // It's a valid region
      }
      return false;
    });
    // Prefer wines where the match came from varietal, not region/country
    const regionScore = e.matchReasons.filter(r => r.type === "region" || r.type === "country").reduce((s, r) => s + r.weight, 0);
    const varietalScore = e.matchReasons.filter(r => r.type === "varietal").reduce((s, r) => s + r.weight, 0);
    return varietalScore > 0 && varietalScore >= regionScore;
  }).sort((a, b) => b.score - a.score);
  pickBest(adventurePool, "adventure");

  // 5. WILD CARD — next best match not yet picked
  for (let i = 0; i < matched.length && picks.length < 5; i++) {
    if (!usedIndices.has(i)) {
      usedIndices.add(i);
      picks.push({ ...matched[i], pickType: "wildcard" });
    }
  }

  return picks.slice(0, 5);
}

// ─── Main entry point ───

export function matchWinesAgainstDNA(entries, dnaProfile) {
  if (!dnaProfile || !entries.length) return [];

  const userDNA = {
    countries: new Set(dnaProfile.countries || []),
    regions: new Set(Object.values(dnaProfile.regions || {}).flat()),
    estates: new Set(Object.values(dnaProfile.estates || {}).flat()),
    varietals: new Set(dnaProfile.varietals || []),
    specificWines: dnaProfile.specificWines || [],
  };

  return entries.map(entry => scoreEntry(entry, userDNA));
}

// ─── Pick type display info ───

export function getPickTypeInfo(pickType) {
  switch (pickType) {
    case "top": return { label: "Top Pick", emoji: "🏆", color: "#8B2332", bg: "rgba(139,35,50,0.1)" };
    case "splurge": return { label: "Splurge", emoji: "✨", color: "#1B3D2F", bg: "rgba(27,61,47,0.08)" };
    case "value": return { label: "Great Value", emoji: "💰", color: "#6B8F5E", bg: "rgba(107,143,94,0.1)" };
    case "adventure": return { label: "Adventure", emoji: "🧭", color: "#8B6914", bg: "rgba(139,105,20,0.08)" };
    case "wildcard": return { label: "Worth Trying", emoji: "🍷", color: "#1B3D2F", bg: "rgba(27,61,47,0.05)" };
    default: return { label: "Match", emoji: "🍷", color: "#1B3D2F", bg: "rgba(27,61,47,0.05)" };
  }
}
