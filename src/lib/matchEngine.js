// matchEngine.js — Parses wine list text and matches against a user's DNA profile

import { COUNTRIES, REGIONS, ESTATES, VARIETALS } from "./wineData";

// ─── Build lookup maps for fast matching ───

// Flatten all data into searchable terms
function buildSearchIndex() {
  const index = {
    countries: [],
    regions: [],
    estates: [],
    varietals: [],
  };

  // Countries + common aliases
  const countryAliases = {
    france: ["france", "french", "français"],
    italy: ["italy", "italian", "italia", "italiano"],
    spain: ["spain", "spanish", "españa", "espana"],
    portugal: ["portugal", "portuguese"],
    germany: ["germany", "german", "deutschland"],
    austria: ["austria", "austrian", "österreich"],
    usa: ["usa", "united states", "american", "california", "oregon", "washington", "new york"],
    argentina: ["argentina", "argentine", "argentinian"],
    chile: ["chile", "chilean"],
    australia: ["australia", "australian"],
    new_zealand: ["new zealand", "new zealand", "nz", "kiwi"],
    south_africa: ["south africa", "south african", "sa"],
  };

  for (const country of COUNTRIES) {
    const aliases = countryAliases[country.id] || [country.name.toLowerCase()];
    index.countries.push({ id: country.id, name: country.name, terms: aliases });
  }

  // Regions + aliases
  const regionAliases = {
    burgundy: ["burgundy", "bourgogne", "côte de nuits", "cote de nuits", "côte de beaune", "cote de beaune", "chablis", "meursault", "puligny", "chassagne", "pommard", "volnay", "gevrey", "chambertin", "vosne", "nuits-saint-georges", "nuits saint georges"],
    bordeaux: ["bordeaux", "médoc", "medoc", "saint-émilion", "saint emilion", "pomerol", "pauillac", "margaux", "saint-julien", "saint julien", "pessac-léognan", "pessac leognan", "graves", "sauternes", "haut-médoc", "haut medoc"],
    champagne: ["champagne"],
    rhone: ["rhône", "rhone", "châteauneuf-du-pape", "chateauneuf du pape", "hermitage", "côte-rôtie", "cote rotie", "cornas", "gigondas", "vacqueyras", "crozes-hermitage", "crozes hermitage", "saint-joseph", "saint joseph", "condrieu"],
    loire: ["loire", "sancerre", "pouilly-fumé", "pouilly fume", "vouvray", "muscadet", "chinon", "bourgueil", "savennières", "savenrieres", "anjou"],
    alsace: ["alsace", "alsatian"],
    provence: ["provence", "bandol", "cassis", "côtes de provence", "cotes de provence"],
    languedoc: ["languedoc", "roussillon", "minervois", "corbières", "corbieres", "fitou", "pic saint-loup"],
    tuscany: ["tuscany", "toscana", "chianti", "brunello", "montalcino", "bolgheri", "vino nobile", "montepulciano", "maremma"],
    piedmont: ["piedmont", "piemonte", "barolo", "barbaresco", "barbera", "langhe", "roero", "gavi", "asti"],
    veneto: ["veneto", "valpolicella", "amarone", "soave", "prosecco", "bardolino"],
    sicily: ["sicily", "sicilia", "etna"],
    puglia: ["puglia", "primitivo", "salento"],
    trentino: ["trentino", "alto adige", "südtirol"],
    campania: ["campania", "aglianico", "fiano", "greco", "taurasi", "irpinia"],
    rioja: ["rioja"],
    ribera: ["ribera del duero"],
    priorat: ["priorat", "priorato"],
    rias_baixas: ["rías baixas", "rias baixas"],
    jerez: ["jerez", "sherry"],
    penedes: ["penedès", "penedes", "cava"],
    rueda: ["rueda"],
    napa: ["napa", "napa valley", "oakville", "rutherford", "stags leap", "howell mountain", "spring mountain", "atlas peak", "calistoga", "st. helena"],
    sonoma: ["sonoma", "russian river", "dry creek", "alexander valley", "sonoma coast", "sonoma mountain"],
    willamette: ["willamette", "eola-amity", "dundee hills", "ribbon ridge"],
    paso_robles: ["paso robles"],
    santa_barbara: ["santa barbara", "santa ynez", "sta. rita hills", "santa rita hills"],
    finger_lakes: ["finger lakes"],
    walla_walla: ["walla walla"],
    stellenbosch: ["stellenbosch"],
    constantia: ["constantia"],
    franschhoek: ["franschhoek"],
    swartland: ["swartland"],
    walker_bay: ["walker bay", "hemel-en-aarde", "hemel en aarde"],
    paarl: ["paarl"],
    mendoza: ["mendoza", "uco valley", "luján de cuyo", "lujan de cuyo"],
    salta: ["salta", "cafayate"],
    patagonia_ar: ["patagonia"],
    maipo: ["maipo"],
    colchagua: ["colchagua"],
    casablanca: ["casablanca"],
    aconcagua: ["aconcagua"],
    barossa: ["barossa", "barossa valley"],
    mclaren: ["mclaren vale"],
    yarra: ["yarra", "yarra valley"],
    margaret_river: ["margaret river"],
    hunter: ["hunter valley"],
    coonawarra: ["coonawarra"],
    marlborough: ["marlborough"],
    central_otago: ["central otago"],
    hawkes_bay: ["hawke's bay", "hawkes bay"],
    douro: ["douro", "porto", "port"],
    alentejo: ["alentejo"],
    dao: ["dão", "dao"],
    vinho_verde: ["vinho verde"],
    mosel: ["mosel", "moselle"],
    rheingau: ["rheingau"],
    pfalz: ["pfalz", "palatinate"],
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

  // Estates
  for (const [regionId, estateList] of Object.entries(ESTATES)) {
    for (const estate of estateList) {
      // Build search terms from estate name + common abbreviations
      const terms = [estate.name.toLowerCase()];
      // Add without common prefixes
      const stripped = estate.name.toLowerCase()
        .replace(/^(domaine|château|chateau|tenuta|bodega|quinta|weingut)\s+/i, "")
        .replace(/\s*\(.*\)\s*/g, "");
      if (stripped !== estate.name.toLowerCase()) terms.push(stripped);
      index.estates.push({ id: estate.id, regionId, name: estate.name, terms });
    }
  }

  // Varietals + aliases
  const varietalAliases = {
    cabernet_sauvignon: ["cabernet sauvignon", "cab sauv", "cabernet"],
    merlot: ["merlot"],
    pinot_noir: ["pinot noir", "pinot"],
    syrah: ["syrah", "shiraz"],
    malbec: ["malbec"],
    tempranillo: ["tempranillo", "tinto fino", "tinta de toro"],
    sangiovese: ["sangiovese", "brunello", "morellino"],
    nebbiolo: ["nebbiolo", "barolo", "barbaresco"],
    grenache: ["grenache", "garnacha"],
    zinfandel: ["zinfandel", "zin", "primitivo"],
    pinotage: ["pinotage"],
    mourvedre: ["mourvèdre", "mourvedre", "monastrell", "mataro"],
    cabernet_franc: ["cabernet franc", "cab franc"],
    petit_verdot: ["petit verdot"],
    chardonnay: ["chardonnay"],
    sauvignon_blanc: ["sauvignon blanc", "sauvignon", "fumé blanc", "fume blanc"],
    riesling: ["riesling"],
    pinot_grigio: ["pinot grigio", "pinot gris"],
    chenin_blanc: ["chenin blanc", "chenin"],
    viognier: ["viognier"],
    gruner_veltliner: ["grüner veltliner", "gruner veltliner", "grüner", "gruner"],
    albarino: ["albariño", "albarino"],
    gewurztraminer: ["gewürztraminer", "gewurztraminer"],
    semillon: ["sémillon", "semillon"],
    muscadet: ["muscadet", "melon de bourgogne"],
    vermentino: ["vermentino", "rolle"],
  };

  for (const varietal of VARIETALS) {
    const aliases = varietalAliases[varietal.id] || [varietal.name.toLowerCase()];
    index.varietals.push({ id: varietal.id, name: varietal.name, color: varietal.color, terms: aliases });
  }

  return index;
}

const SEARCH_INDEX = buildSearchIndex();

// ─── Parse a wine list into individual entries ───

export function parseWineList(text) {
  if (!text || !text.trim()) return [];

  const lines = text
    .split(/\n/)
    .map(l => l.trim())
    .filter(l => l.length > 3); // Skip very short lines

  const entries = [];
  const seenNames = new Set();

  for (const line of lines) {
    // Skip obvious non-wine lines
    if (/^(red|white|rosé|rose|sparkling|dessert|beer|cocktail|spirit|by the glass|by the bottle|wine list|beverages|drinks)\s*$/i.test(line)) continue;
    if (/^\d+\s*$/.test(line)) continue; // Just a number
    if (line.length > 200) continue; // Too long to be a wine entry

    // Extract price if present (remove it from the name)
    const priceMatch = line.match(/\$?\s*(\d{1,4}(?:\.\d{2})?)\s*$/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : null;
    let name = priceMatch ? line.slice(0, priceMatch.index).trim() : line;

    // Clean up common artifacts
    name = name
      .replace(/\.\.\.*\s*$/, "") // Trailing dots
      .replace(/_{2,}/, "") // Underscores used as spacers
      .replace(/\s{3,}/g, " ") // Excessive whitespace
      .replace(/^\d+\.\s*/, "") // Leading numbers like "1. "
      .replace(/^\d+\s+/, "") // Bin numbers
      .trim();

    if (name.length < 4) continue;

    // Deduplicate
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    entries.push({ name, price, originalLine: line });
  }

  return entries;
}

// ─── Match wine entries against a DNA profile ───

export function matchWinesAgainstDNA(entries, dnaProfile) {
  if (!dnaProfile || !entries.length) return [];

  // Extract user preferences from DNA profile raw data
  const userCountries = new Set(dnaProfile.countries || []);
  const userRegions = new Set(Object.values(dnaProfile.regions || {}).flat());
  const userEstates = new Set(Object.values(dnaProfile.estates || {}).flat());
  const userVarietals = new Set(dnaProfile.varietals || []);

  const results = [];

  for (const entry of entries) {
    const text = entry.name.toLowerCase();
    let score = 0;
    const matchReasons = [];

    // Check country matches
    for (const countryData of SEARCH_INDEX.countries) {
      if (countryData.terms.some(t => text.includes(t))) {
        if (userCountries.has(countryData.id)) {
          score += 1;
          matchReasons.push({ type: "country", label: countryData.name, weight: 1 });
        }
        break; // Only match first country
      }
    }

    // Check region matches (stronger signal)
    for (const regionData of SEARCH_INDEX.regions) {
      if (regionData.terms.some(t => text.includes(t))) {
        if (userRegions.has(regionData.id)) {
          score += 3;
          matchReasons.push({ type: "region", label: regionData.name, weight: 3 });
        } else if (userCountries.has(regionData.countryId)) {
          // Region from a country they like, but not a specific region they picked
          score += 1;
          matchReasons.push({ type: "country_region", label: `${regionData.name} (you like ${COUNTRIES.find(c => c.id === regionData.countryId)?.name})`, weight: 1 });
        }
      }
    }

    // Check estate matches (strongest signal)
    for (const estateData of SEARCH_INDEX.estates) {
      if (estateData.terms.some(t => text.includes(t))) {
        if (userEstates.has(estateData.id)) {
          score += 5;
          matchReasons.push({ type: "estate", label: estateData.name, weight: 5 });
        }
      }
    }

    // Check varietal matches
    for (const varietalData of SEARCH_INDEX.varietals) {
      if (varietalData.terms.some(t => text.includes(t))) {
        if (userVarietals.has(varietalData.id)) {
          score += 2;
          matchReasons.push({ type: "varietal", label: varietalData.name, weight: 2 });
        }
      }
    }

    // Check against specific favorite wines (exact or fuzzy match)
    const specificWines = dnaProfile.specificWines || [];
    for (const fav of specificWines) {
      const favLower = fav.toLowerCase();
      if (text.includes(favLower) || favLower.includes(text.slice(0, 20))) {
        score += 10;
        matchReasons.push({ type: "favorite", label: fav, weight: 10 });
      }
    }

    results.push({
      ...entry,
      score,
      matchReasons: matchReasons.sort((a, b) => b.weight - a.weight),
    });
  }

  // Sort by score descending, then alphabetically for ties
  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// ─── Filter results by preferences ───

export function filterResults(results, { colorPreference, minPrice, maxPrice }) {
  return results.filter(r => {
    // Price filter
    if (r.price !== null) {
      if (minPrice && r.price < minPrice) return false;
      if (maxPrice && r.price > maxPrice) return false;
    }

    // Color filter (best-effort based on detected varietal)
    if (colorPreference && colorPreference !== "all") {
      const text = r.name.toLowerCase();
      const detectedVarietals = SEARCH_INDEX.varietals.filter(v =>
        v.terms.some(t => text.includes(t))
      );
      if (detectedVarietals.length > 0) {
        const isRed = detectedVarietals.some(v => v.color === "red");
        const isWhite = detectedVarietals.some(v => v.color === "white");
        if (colorPreference === "red" && !isRed && isWhite) return false;
        if (colorPreference === "white" && !isWhite && isRed) return false;
      }
      // If we can't detect the color, keep it in the results
    }

    return true;
  });
}

// ─── Get match tier label ───

export function getMatchTier(score) {
  if (score >= 8) return { label: "Perfect for you", color: "#8B2332", bg: "rgba(139,35,50,0.1)" };
  if (score >= 5) return { label: "Strong match", color: "#1B3D2F", bg: "rgba(27,61,47,0.08)" };
  if (score >= 2) return { label: "Worth trying", color: "#6B8F5E", bg: "rgba(107,143,94,0.1)" };
  if (score >= 1) return { label: "Loose match", color: "#1B3D2F", bg: "rgba(27,61,47,0.04)" };
  return { label: "No match data", color: "#1B3D2F", bg: "rgba(27,61,47,0.02)" };
}
