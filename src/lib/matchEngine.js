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
  "Beaujolais": "beaujolais", "Southwest France": "southwest_france",
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
  "Mosel": "mosel", "Rheingau": "rheingau", "Pfalz": "pfalz", "Rheinhessen": "rheinhessen",
  "Baden": "baden",
  "Niederösterreich": "kamptal", "Burgenland": "burgenland",
  "California": "napa", "Oregon": "willamette", "Washington": "walla_walla",
  "New York": "finger_lakes", "Virginia": "virginia",
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
  "columbia valley": "walla_walla",
  "morgon": "beaujolais", "fleurie": "beaujolais", "moulin-à-vent": "beaujolais",
  "brouilly": "beaujolais", "juliénas": "beaujolais", "chiroubles": "beaujolais",
  "beaujolais-villages": "beaujolais", "saint-amour": "beaujolais",
  "côte de brouilly": "beaujolais", "régnié": "beaujolais", "chénas": "beaujolais",
  "cahors": "southwest_france", "madiran": "southwest_france", "gaillac": "southwest_france",
  "jurançon": "southwest_france", "bergerac": "southwest_france", "irouléguy": "southwest_france",
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

  // Add US aliases (since "US" is only 2 chars and gets filtered)
  idx.countryTerms.push({ term: "united states", name: "United States", dnaCountryId: "usa", count: 54504 });
  idx.countryTerms.push({ term: "u.s.a.", name: "United States", dnaCountryId: "usa", count: 54504 });

  // Add US state full names as country-level signals
  var stateToUSA = ["california", "oregon", "washington", "new york", "virginia", "texas",
    "colorado", "arizona", "new mexico", "idaho", "michigan", "pennsylvania",
    "north carolina", "ohio", "missouri"];
  for (var si = 0; si < stateToUSA.length; si++) {
    if (!idx.regionTerms.some(function(r) { return r.term === stateToUSA[si]; })) {
      idx.countryTerms.push({ term: stateToUSA[si], name: "United States", dnaCountryId: "usa", count: 1000 });
    }
  }

  return idx;
}

const SEARCH_INDEX = buildSearchIndex();

// Grape variety names that should never be treated as wine entries on their own
const GRAPE_SKIP_LIST = new Set([
  "pinot noir", "pinot grigio", "pinot gris", "cabernet sauvignon", "merlot",
  "malbec", "chardonnay", "sauvignon blanc", "riesling", "moscato", "tempranillo",
  "sangiovese", "nebbiolo", "syrah", "shiraz", "zinfandel", "grenache", "garnacha",
  "mourvedre", "viognier", "gewurztraminer", "chenin blanc", "albarino",
  "gruner veltliner", "vermentino", "semillon", "muscadet", "barbera", "dolcetto",
  "cabernet franc", "petit verdot", "pinotage", "carmenere", "gamay", "mencia",
  "primitivo", "nero davola", "aglianico", "touriga nacional", "torrontes",
  "verdejo", "godello", "treixadura", "alvarinho", "glera", "prosecco",
  "red blend", "white blend", "rose", "ros\u00e9", "sparkling",
  "red wine", "white wine", "sparkling wine", "rose wine", "dessert wine",
]);


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
  const lowerWords = new Set(["de", "du", "des", "le", "la", "les", "et", "en", "au", "aux", "di", "del", "della", "delle", "dei", "degli", "von", "van", "der", "das", "d", "e", "y"]);
  return name.toLowerCase().split(/([\s\-]+)/).map((word, i) => {
    if (word.match(/^[\s\-]+$/)) return word;
    if (i > 0 && lowerWords.has(word)) return word;
    // Handle L' D' prefix
    if (word.startsWith("l'") || word.startsWith("d'")) return word.charAt(0).toUpperCase() + "'" + word.charAt(2).toUpperCase() + word.slice(3);
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join("");
}

// Detect tasting note / description lines (should not be parsed as wine entries)
function isTastingNote(text) {
  var lower = text.toLowerCase();
  // High-signal tasting note phrases
  var tastingPhrases = [
    "aroma of", "aromas of", "aroma and", "aromas and",
    "palate", "nose", "finish", "tannin", "acidity", "body",
    "notes of", "flavors of", "hints of", "layers of", "touch of",
    "on the palate", "on the nose", "bright and", "rich and", "fresh and",
    "crisp and", "smooth and", "elegant and", "balanced with", "pairs with",
    "medium-bodied", "full-bodied", "light-bodied",
    "ferment", "stainless steel", "oak aged", "barrel aged", "lees",
    "cherry and", "berry and", "citrus and", "apple and", "peach and",
    "tropical fruit", "red fruit", "dark fruit", "stone fruit",
    "this wine", "this red", "this white", "this blend",
    "deep red", "ruby", "golden", "straw", "purple color",
    "concentrated", "mineral", "minerality",
    "grapefruit", "blackberry", "raspberry", "strawberry",
    "vanilla spice", "toasty oak", "oak finish",
    "mouth feel", "mouthfeel", "lightly sparkling",
  ];
  var matchCount = 0;
  for (var i = 0; i < tastingPhrases.length; i++) {
    if (lower.includes(tastingPhrases[i])) matchCount++;
  }
  // If 2+ tasting phrases, it's a description
  if (matchCount >= 2) return true;
  // If even 1 match and the line is long, likely a note
  if (matchCount >= 1 && text.length > 50) return true;
  // If starts with descriptive adjective and is long, likely a note
  if (text.length > 40 && /^(a |an |the |this |has |deep |bright |rich |fresh |crisp |smooth |elegant |complex |balanced|fragrant|aromatic|attractive|sweet and|dry,)/i.test(text)) return true;
  return false;
}

export function parseWineList(text) {
  if (!text || !text.trim()) return [];
  var lines = text.split(/\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 3; });
  var entries = [];
  var seenNorm = new Set();

  // US state abbreviation → full name (for wine-producing states)
  var US_STATE_ABBREVS = {
    "CA": "California", "OR": "Oregon", "WA": "Washington",
    "NY": "New York", "VA": "Virginia", "TX": "Texas",
    "CO": "Colorado", "AZ": "Arizona", "NM": "New Mexico",
    "ID": "Idaho", "MI": "Michigan", "PA": "Pennsylvania",
    "NC": "North Carolina", "OH": "Ohio", "MO": "Missouri",
    "NJ": "New Jersey", "CT": "Connecticut", "MD": "Maryland",
  };

  // Pre-process: expand US state abbreviations in wine lines
  // Matches patterns like ", OR 2023", ", CA 2024", "Valley CA 2023"
  lines = lines.map(function(line) {
    return line.replace(/,?\s+([A-Z]{2})\s+(\d{4})\b/g, function(match, abbr, year) {
      if (US_STATE_ABBREVS[abbr]) {
        return ", " + US_STATE_ABBREVS[abbr] + " " + year;
      }
      return match;
    });
  });

  // Category headers / section labels to skip (but track for context)
  var skipPatterns = /^(reds?|whites?|ros[eé]s?|sparkling|dessert|beer|cocktails?|spirits?|by the glass|by the bottle|wine list|beverages?|drinks?|half bottles?|magnums?|reserve list|champagne|bordeaux|burgundy|rh[oô]ne|rhone|alsace|loire|tuscany|piedmont|rioja|south\s*africa|napa|sonoma|california|italy|france|spain|australia|argentina|chile|germany|austria|portugal|new\s*zealand|red wine|white wine|sparkling wine|ros[eé] wine|pinot noir|pinot grigio|cabernet sauvignon|merlot|malbec|chardonnay|sauvignon blanc|riesling|moscato|tempranillo|sangiovese|nebbiolo|syrah|shiraz|zinfandel|grenache|mourv[eè]dre|viognier|gew[uü]rztraminer|chenin blanc|red blend|white blend|champagne\s+sparkling|sparkling\s+champagne|wines?\s*by\s*the\s*glass|wines?\s*by\s*the\s*bottle|aperitivi?|digestivi?|non[\s]*vintage|vintage|large\s*format|magnums?|half\s*bottles?|selection|our\s*picks?|house\s*wines?|premium|super\s*premium|featured?\s*wines?|sommeliers?\s*selection|zero\s*proof\s*cocktails?)\s*$/i;

  // Varietal names we can use as section context
  var varietalHeaders = {
    "pinot noir": "Pinot Noir", "pinot grigio": "Pinot Grigio", "pinot gris": "Pinot Gris",
    "cabernet sauvignon": "Cabernet Sauvignon", "cabernet": "Cabernet Sauvignon",
    "merlot": "Merlot", "malbec": "Malbec", "chardonnay": "Chardonnay",
    "sauvignon blanc": "Sauvignon Blanc", "riesling": "Riesling",
    "moscato": "Moscato", "tempranillo": "Tempranillo", "sangiovese": "Sangiovese",
    "nebbiolo": "Nebbiolo", "syrah": "Syrah", "shiraz": "Shiraz",
    "zinfandel": "Zinfandel", "grenache": "Grenache", "garnacha": "Grenache",
    "mourvedre": "Mourvèdre", "mourvèdre": "Mourvèdre", "viognier": "Viognier",
    "gewurztraminer": "Gewürztraminer", "gewürztraminer": "Gewürztraminer",
    "chenin blanc": "Chenin Blanc", "rosé": "Rosé", "rose": "Rosé",
    "prosecco": "Prosecco", "red blend": "Red Blend", "white blend": "White Blend",
    "pinotage": "Pinotage", "cabernet franc": "Cabernet Franc",
    "petit verdot": "Petit Verdot", "albarino": "Albariño", "albariño": "Albariño",
    "gruner veltliner": "Grüner Veltliner", "grüner veltliner": "Grüner Veltliner",
    "vermentino": "Vermentino", "semillon": "Sémillon", "sémillon": "Sémillon",
    "muscadet": "Muscadet", "barbera": "Barbera", "dolcetto": "Dolcetto",
    "gamay": "Gamay", "carmenere": "Carmenère", "carménère": "Carmenère",
    "glera": "Glera", "trebbiano": "Trebbiano", "corvina": "Corvina",
    "nero d'avola": "Nero d'Avola", "aglianico": "Aglianico",
    "torrontes": "Torrontés", "torrontés": "Torrontés",
    "touriga nacional": "Touriga Nacional", "primitivo": "Primitivo",
    "verdejo": "Verdejo", "godello": "Godello",
  };

  // Section-type headers that indicate color context (not varietal)
  var colorHeaders = {
    "red": "red", "reds": "red", "red wine": "red", "red wines": "red",
    "white": "white", "whites": "white", "white wine": "white", "white wines": "white",
    "rosé": "rosé", "rose": "rosé", "rosés": "rosé", "rosé wine": "rosé",
    "sparkling": "sparkling", "sparkling wine": "sparkling", "sparkling wines": "sparkling",
    "champagne": "sparkling", "champagne sparkling": "sparkling",
    "sparkling champagne": "sparkling",
  };

  // Track current section context
  var currentVarietal = null;
  var currentColor = null;
  var inBTGSection = false;

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    var stripped = line.replace(/[^a-zA-Z\u00C0-\u00FF\s]/g, "").trim();
    var strippedLower = stripped.toLowerCase();

    // Check if this line is a section header
    if (skipPatterns.test(stripped)) {
      // Track by-the-glass vs bottle section state
      if (/^(wines?\s*by\s*the\s*glass|by\s*the\s*glass|glass\s*pours?|by\s*glass|tasting\s*pours?)\s*$/i.test(stripped)) {
        inBTGSection = true;
      } else if (/^(wines?\s*by\s*the\s*bottle|by\s*the\s*bottle|bottle\s*list|full\s*bottles?|bottled?\s*wines?|bottle\s*selections?)\s*$/i.test(stripped)) {
        inBTGSection = false;
      }
      // Update context based on header type
      if (varietalHeaders[strippedLower]) {
        currentVarietal = varietalHeaders[strippedLower];
        // Also set color context from varietal
        var vMatch = SEARCH_INDEX.varietyTerms.find(function(v) { return v.name === currentVarietal; });
        if (vMatch && vMatch.color) currentColor = vMatch.color;
      } else if (colorHeaders[strippedLower]) {
        currentColor = colorHeaders[strippedLower];
        currentVarietal = null; // Reset varietal when we hit a broad color header
      }
      continue;
    }

    // Also check ALL CAPS version
    if (stripped === stripped.toUpperCase() && stripped.length > 2) {
      var upperLower = stripped.toLowerCase().trim();
      if (varietalHeaders[upperLower]) {
        currentVarietal = varietalHeaders[upperLower];
        var vMatch2 = SEARCH_INDEX.varietyTerms.find(function(v) { return v.name === currentVarietal; });
        if (vMatch2 && vMatch2.color) currentColor = vMatch2.color;
        continue;
      }
      if (colorHeaders[upperLower]) {
        currentColor = colorHeaders[upperLower];
        currentVarietal = null;
        continue;
      }
      // Skip other ALL CAPS headers like "BEVERAGE", "OOKA DOYLESTOWN" etc.
      if (skipPatterns.test(upperLower)) continue;
    }

    if (/^\d+\s*$/.test(line)) continue;
    if (line.length > 200) continue;

    // Skip tasting note lines
    if (isTastingNote(line)) continue;

    // Skip blend composition lines like "90% Glera 10% Pinot Noir"
    if (/^\d{1,3}%\s+\w+/.test(line.trim())) continue;

    // Skip pure description lines (no producer/winery info)
    if (/^(a |an |the |this |has |deep |bright |rich |fresh |crisp |smooth |elegant |complex |balanced|fragrant|aromatic|attractive|sweet|dry |pairs|serve|enjoy|california coastline)/i.test(line.trim()) && line.length > 30) continue;

    // Also skip lines that are just "Page | N" style page numbers
    if (/^page\s*\|\s*\d+$/i.test(line.trim())) continue;

    // Price extraction — handle multiple formats:
    // "$95", "95", "25.", "10/40" (glass/bottle), "$10/$40"
    var price = null;
    var name = line;
    var isGlassBottlePrice = false;

    // Format: "10/40" or "$10/$40" (glass/bottle) — take bottle price, flag as BTG
    var glassBottle = line.match(/\$?\s*(\d{1,3})\s*\/\s*\$?\s*(\d{1,4})\s*\.?\s*$/);
    if (glassBottle) {
      price = parseFloat(glassBottle[2]);
      name = line.slice(0, glassBottle.index).trim();
      isGlassBottlePrice = true;
    } else {
      // Standard: "$95" or "95" or "95." at end
      var priceMatch = line.match(/\$?\s*(\d{1,4}(?:\.\d{2})?)\s*\.?\s*$/);
      if (priceMatch) {
        var priceVal = parseFloat(priceMatch[1]);
        var isYear = priceVal >= 1900 && priceVal <= 2030;
        price = (!isYear) ? priceVal : null;
        name = priceMatch ? line.slice(0, priceMatch.index).trim() : line;
      }
    }

    // Clean formatting artifacts
    name = name
      .replace(/[.\s]*\.{2,}[.\s]*/g, " ")   // dots anywhere (". . . .")
      .replace(/[\s.]+$/g, "")                 // trailing dots/spaces
      .replace(/_{2,}/g, "")                   // underscores
      .replace(/\s{3,}/g, " ")                // excess whitespace
      .replace(/^\d+\.\s*/, "")               // leading "1. "
      .replace(/[\u2018\u2019]/g, "'")         // smart quotes
      .trim();

    // Strip leading bin/ID numbers: "1454}", "1454)", "B44", "747A", "1320}"
    name = name.replace(/^\d{1,5}[}\])\u007D\u007B\u2774\u2775]\s*/i, "").trim();
    name = name.replace(/^[A-Z]?\d{1,4}[A-Z]?\s+/i, "").trim();
    // Also strip "Bin 44" style prefixes
    name = name.replace(/^Bin\s+\d+\s*/i, "").trim();

    if (name.length < 4) continue;

    // After cleaning, skip if name matches a known grape variety
    var nameLC = name.toLowerCase().replace(/[^a-z\s]/g, "").trim();
    if (GRAPE_SKIP_LIST.has(nameLC)) continue;

    // Skip bare "Region, Country" headers
    if (/^[A-Za-z\u00C0-\u00FF\s\-']+,\s*(France|Italy|Spain|Germany|Austria|Portugal|Chile|Argentina|Australia|South Africa|New Zealand|United States)\s*$/i.test(name)) {
      var parts = name.split(",").map(function(p) { return p.trim(); });
      if (parts.length === 2 && parts[0].split(/\s+/).length <= 4) continue;
    }

    var displayName = smartTitleCase(name);

    // Context injection: if entry has no varietal/region info and we have section context,
    // append the varietal to help the match engine
    var hasVarietal = false;
    var hasRegionOrCountry = false;
    var textLower = displayName.toLowerCase();
    
    for (var vi = 0; vi < SEARCH_INDEX.varietyTerms.length; vi++) {
      if (textLower.includes(SEARCH_INDEX.varietyTerms[vi].term)) { hasVarietal = true; break; }
    }
    for (var ri = 0; ri < Math.min(SEARCH_INDEX.regionTerms.length, 200); ri++) {
      if (SEARCH_INDEX.regionTerms[ri].term.length >= 4 && textLower.includes(SEARCH_INDEX.regionTerms[ri].term)) { hasRegionOrCountry = true; break; }
    }
    if (!hasRegionOrCountry) {
      for (var ci = 0; ci < SEARCH_INDEX.countryTerms.length; ci++) {
        if (SEARCH_INDEX.countryTerms[ci].term.length >= 4 && textLower.includes(SEARCH_INDEX.countryTerms[ci].term)) { hasRegionOrCountry = true; break; }
      }
    }

    // If entry looks sparse (no varietal and no region), inject section context
    if (!hasVarietal && currentVarietal) {
      displayName = displayName + ", " + currentVarietal;
    }

    var normKey = displayName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (normKey.length < 3 || seenNorm.has(normKey)) continue;
    seenNorm.add(normKey);
    entries.push({
      name: displayName,
      price: price,
      originalLine: line,
      sectionVarietal: currentVarietal || null,
      sectionColor: currentColor || null,
      isByTheGlass: inBTGSection || isGlassBottlePrice,
    });
  }
  return entries;
}


// ═══════════════════════════════════════════════════════
// ATTRIBUTE DETECTION (shared by scoring + feedback)
// ═══════════════════════════════════════════════════════

function detectWineAttributes(wineName) {
  const text = " " + wineName.toLowerCase() + " ";
  const regionIds = new Set();
  const countryIds = new Set();
  const varietalIds = new Set();
  const producerTerms = new Set();
  var color = null;
  const claimed = new Set();

  // Producer detection
  for (var pi = 0; pi < SEARCH_INDEX.producerTerms.length; pi++) {
    const prod = SEARCH_INDEX.producerTerms[pi];
    if (prod.term.length < 4) continue;
    if (text.includes(prod.term)) {
      producerTerms.add(prod.term);
      if (prod.dnaCountryId) countryIds.add(prod.dnaCountryId);
      claimed.add(prod.term);
      break;
    }
  }

  // Region detection
  for (var ri = 0; ri < SEARCH_INDEX.regionTerms.length; ri++) {
    const reg = SEARCH_INDEX.regionTerms[ri];
    if (claimed.has(reg.term)) continue;
    if (termMatchesInText(reg.term, text)) {
      if (reg.dnaRegionId) regionIds.add(reg.dnaRegionId);
      if (reg.dnaCountryId) countryIds.add(reg.dnaCountryId);
      claimed.add(reg.term);
      break;
    }
  }

  // Varietal detection
  for (var vi = 0; vi < SEARCH_INDEX.varietyTerms.length; vi++) {
    const v = SEARCH_INDEX.varietyTerms[vi];
    if (text.includes(v.term)) {
      if (v.dnaVarietalId) varietalIds.add(v.dnaVarietalId);
      if (v.color && !color) color = v.color;
      claimed.add(v.term);
      break;
    }
  }

  // Country detection
  for (var ci = 0; ci < SEARCH_INDEX.countryTerms.length; ci++) {
    const c = SEARCH_INDEX.countryTerms[ci];
    if (c.term.length < 4) continue;
    if (termMatchesInText(c.term, text)) {
      if (c.dnaCountryId) countryIds.add(c.dnaCountryId);
      break;
    }
  }

  return { regionIds, countryIds, varietalIds, producerTerms, color };
}


// ═══════════════════════════════════════════════════════
// FEEDBACK SIGNALS (from rated wines)
// ═══════════════════════════════════════════════════════

export function buildFeedbackSignals(interactions) {
  const signals = {
    boostedRegions: new Map(),      // regionId → { weight, count }
    boostedVarietals: new Map(),    // varietalId → { weight, count }
    boostedProducers: new Map(),    // producerTerm → { weight, count }
    suppressedRegions: new Set(),
    suppressedVarietals: new Set(),
    suppressedProducers: new Set(),
    suppressedWineNames: [],
  };

  const BOOST_WEIGHTS = { loved: 2, liked: 1 };
  const PRODUCER_BOOST_WEIGHTS = { loved: 3, liked: 1 };

  for (var i = 0; i < interactions.length; i++) {
    const inter = interactions[i];
    if (!inter.rating || inter.rating === "fine") continue;
    if (inter.interaction_type !== "had") continue;

    const attrs = detectWineAttributes(inter.wine_name);

    if (inter.rating === "not_for_me") {
      attrs.regionIds.forEach(function(id) { signals.suppressedRegions.add(id); });
      attrs.varietalIds.forEach(function(id) { signals.suppressedVarietals.add(id); });
      attrs.producerTerms.forEach(function(t) { signals.suppressedProducers.add(t); });
      signals.suppressedWineNames.push(inter.wine_name);
    } else {
      var w = BOOST_WEIGHTS[inter.rating];
      var pw = PRODUCER_BOOST_WEIGHTS[inter.rating];
      if (!w) continue;

      attrs.regionIds.forEach(function(id) {
        var existing = signals.boostedRegions.get(id);
        if (existing) { existing.count++; existing.weight = Math.max(existing.weight, w); }
        else { signals.boostedRegions.set(id, { weight: w, count: 1 }); }
      });

      attrs.varietalIds.forEach(function(id) {
        var existing = signals.boostedVarietals.get(id);
        if (existing) { existing.count++; existing.weight = Math.max(existing.weight, w); }
        else { signals.boostedVarietals.set(id, { weight: w, count: 1 }); }
      });

      attrs.producerTerms.forEach(function(t) {
        var existing = signals.boostedProducers.get(t);
        if (existing) { existing.count++; existing.weight = Math.max(existing.weight, pw); }
        else { signals.boostedProducers.set(t, { weight: pw, count: 1 }); }
      });
    }
  }

  // Suppression wins over boost when conflicting
  signals.suppressedRegions.forEach(function(id) { signals.boostedRegions.delete(id); });
  signals.suppressedVarietals.forEach(function(id) { signals.boostedVarietals.delete(id); });
  signals.suppressedProducers.forEach(function(t) { signals.boostedProducers.delete(t); });

  return signals;
}


// ═══════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════

function scoreEntry(entry, userDNA, feedbackSignals) {
  const text = " " + entry.name.toLowerCase() + " ";
  var score = 0;
  const matchReasons = [];
  const attrs = detectWineAttributes(entry.name);
  const detectedRegionIds = attrs.regionIds;
  const detectedCountryIds = attrs.countryIds;
  var detectedColor = attrs.color;

  // PRODUCER (weight: 5)
  for (const prodTerm of attrs.producerTerms) {
    if (userDNA.estateNames.has(prodTerm)) {
      var prodEntry = SEARCH_INDEX.producerTerms.find(function(p) { return p.term === prodTerm; });
      score += 5;
      matchReasons.push({ type: "estate", label: prodEntry ? prodEntry.name : prodTerm, weight: 5 });
    }
  }

  // REGION (weight: 3 direct, 1 adjacent)
  for (const regId of detectedRegionIds) {
    if (userDNA.regions.has(regId)) {
      var regEntry = SEARCH_INDEX.regionTerms.find(function(r) { return r.dnaRegionId === regId; });
      score += 3;
      matchReasons.push({ type: "region", label: regEntry ? (regEntry.subregion || regEntry.wmProvince || regEntry.term) : regId, weight: 3 });
    } else {
      // Check country-level match for this region
      for (const cId of detectedCountryIds) {
        if (userDNA.countries.has(cId)) {
          var cName = DNA_COUNTRIES.find(function(c) { return c.id === cId; });
          var regEntry2 = SEARCH_INDEX.regionTerms.find(function(r) { return r.dnaRegionId === regId; });
          var regLabel = regEntry2 ? (regEntry2.subregion || regEntry2.wmProvince || regEntry2.term) : regId;
          score += 1;
          matchReasons.push({ type: "country_region", label: regLabel + " (you like " + (cName ? cName.name : cId) + ")", weight: 1 });
          break;
        }
      }
    }
  }

  // VARIETAL (weight: 2)
  for (const varId of attrs.varietalIds) {
    if (userDNA.varietals.has(varId)) {
      var varEntry = SEARCH_INDEX.varietyTerms.find(function(v) { return v.dnaVarietalId === varId; });
      score += 2;
      matchReasons.push({ type: "varietal", label: varEntry ? varEntry.name : varId, weight: 2 });
    }
  }

  // COUNTRY (weight: 1, only if no region already scored)
  if (!matchReasons.some(function(r) { return r.type === "region" || r.type === "country_region"; })) {
    for (const cId of detectedCountryIds) {
      if (userDNA.countries.has(cId)) {
        var countryEntry = SEARCH_INDEX.countryTerms.find(function(c) { return c.dnaCountryId === cId; });
        score += 1;
        matchReasons.push({ type: "country", label: countryEntry ? countryEntry.name : cId, weight: 1 });
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

  // FEEDBACK SIGNALS — boost or suppress based on past ratings
  if (feedbackSignals) {
    // Suppress specific wines the user rated "not for me"
    for (var si = 0; si < feedbackSignals.suppressedWineNames.length; si++) {
      var suppressed = feedbackSignals.suppressedWineNames[si];
      if (suppressed.length >= 4 && text.includes(suppressed.toLowerCase())) {
        // Remove any favorite bonus that was incorrectly added
        var favIdx = matchReasons.findIndex(function(r) { return r.type === "favorite"; });
        if (favIdx >= 0) {
          score -= matchReasons[favIdx].weight;
          matchReasons.splice(favIdx, 1);
        }
        score -= 5;
        matchReasons.push({ type: "feedback_suppress", label: "You didn't enjoy this wine", weight: -5 });
      }
    }

    // Boosted regions
    for (const regId of detectedRegionIds) {
      var boost = feedbackSignals.boostedRegions.get(regId);
      if (boost) {
        score += boost.weight;
        var countLabel = boost.count > 1 ? (boost.count + " wines") : "a wine";
        matchReasons.push({ type: "feedback_boost", label: "You " + (boost.weight >= 2 ? "loved" : "liked") + " " + countLabel + " from this region", weight: boost.weight });
      }
      if (feedbackSignals.suppressedRegions.has(regId)) {
        score -= 2;
        matchReasons.push({ type: "feedback_suppress", label: "Similar region to a wine you didn't enjoy", weight: -2 });
      }
    }

    // Boosted varietals
    for (const varId of attrs.varietalIds) {
      var vBoost = feedbackSignals.boostedVarietals.get(varId);
      if (vBoost) {
        score += vBoost.weight;
        var vCountLabel = vBoost.count > 1 ? (vBoost.count + " wines") : "a wine";
        matchReasons.push({ type: "feedback_boost", label: "You " + (vBoost.weight >= 2 ? "loved" : "liked") + " " + vCountLabel + " with this grape", weight: vBoost.weight });
      }
      if (feedbackSignals.suppressedVarietals.has(varId)) {
        score -= 2;
        matchReasons.push({ type: "feedback_suppress", label: "Similar grape to a wine you didn't enjoy", weight: -2 });
      }
    }

    // Boosted/suppressed producers
    for (const prodTerm of attrs.producerTerms) {
      var pBoost = feedbackSignals.boostedProducers.get(prodTerm);
      if (pBoost) {
        score += pBoost.weight;
        matchReasons.push({ type: "feedback_boost", label: "You've enjoyed this producer before", weight: pBoost.weight });
      }
      if (feedbackSignals.suppressedProducers.has(prodTerm)) {
        score -= 3;
        matchReasons.push({ type: "feedback_suppress", label: "You didn't enjoy this producer", weight: -3 });
      }
    }
  }

  return {
    name: entry.name,
    price: entry.price,
    originalLine: entry.originalLine,
    score: score,
    matchReasons: matchReasons.sort(function(a, b) { return (b.weight || 0) - (a.weight || 0); }),
    detectedColor: detectedColor || entry.sectionColor || null,
    detectedRegionIds: Array.from(detectedRegionIds),
    detectedCountryIds: Array.from(detectedCountryIds),
    detectedCountry: detectedCountryIds.size > 0 ? Array.from(detectedCountryIds)[0] : null,
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

  // Only consider wines with scores AND prices for the 5 picks
  const matched = pool.filter(function(e) { return e.score > 0 && e.price !== null; }).sort(function(a, b) { return b.score - a.score; });
  if (matched.length === 0) return [];

  // Budget-aware pool: wines within the user's price range (for non-splurge picks)
  const budgetPool = matched.filter(function(e) {
    if (minPrice && e.price < minPrice) return false;
    if (maxPrice && e.price > maxPrice) return false;
    return true;
  });
  // Use budget pool if it has enough wines, otherwise fall back to all priced matches
  const mainPool = budgetPool.length >= 3 ? budgetPool : matched;

  const picks = [];
  const used = new Set();

  function pickFrom(subset, type) {
    for (var i = 0; i < subset.length; i++) {
      const idx = matched.indexOf(subset[i]);
      if (idx >= 0 && !used.has(idx)) { used.add(idx); picks.push(Object.assign({}, subset[i], { pickType: type })); return true; }
    }
    return false;
  }

  // 1. TOP — best scoring wine within budget
  pickFrom(mainPool, "top");

  // 2. SPLURGE — intentionally above the budget ceiling (worth the stretch)
  var splurgePool = matched.filter(function(e) {
    var floor = maxPrice || null;
    if (!floor) {
      // No max set: use 65th percentile of all prices
      var prices = matched.map(function(e) { return e.price; }).sort(function(a, b) { return a - b; });
      floor = prices[Math.floor(prices.length * 0.65)];
    }
    return e.price > floor;
  }).sort(function(a, b) { return b.score - a.score; });
  if (splurgePool.length > 0) {
    pickFrom(splurgePool, "splurge");
  }

  // 3. VALUE — best match in the lower third of the budget range
  var valueCeil;
  if (minPrice && maxPrice) {
    // Lower third of user's budget range
    valueCeil = minPrice + (maxPrice - minPrice) * 0.35;
  } else if (minPrice) {
    valueCeil = minPrice * 1.3; // 30% above minimum
  } else {
    // No budget: use 35th percentile of all prices
    var allPrices = matched.map(function(e) { return e.price; }).sort(function(a, b) { return a - b; });
    valueCeil = allPrices[Math.floor(allPrices.length * 0.35)];
  }
  var valuePool = mainPool.filter(function(e) { return e.price <= valueCeil; }).sort(function(a, b) { return b.score - a.score; });
  if (valuePool.length > 0) {
    pickFrom(valuePool, "value");
  }

  // 4. ADVENTURE — matches varietal but not direct region, within budget
  const adv = mainPool.filter(function(e) {
    const hasVarietal = e.matchReasons.some(function(r) { return r.type === "varietal"; });
    const hasDirectRegion = e.matchReasons.some(function(r) { return r.type === "region"; });
    return e.score >= 1 && hasVarietal && !hasDirectRegion;
  }).sort(function(a, b) { return b.score - a.score; });
  pickFrom(adv, "adventure");

  // 5. WILDCARD — fill remaining slots from budget pool
  for (var i = 0; i < mainPool.length && picks.length < 5; i++) {
    var idx = matched.indexOf(mainPool[i]);
    if (idx >= 0 && !used.has(idx)) { used.add(idx); picks.push(Object.assign({}, mainPool[i], { pickType: "wildcard" })); }
  }

  return picks.slice(0, 5);
}


// ═══════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

export function matchWinesAgainstDNA(entries, dnaProfile, feedbackSignals) {
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

  // Filter out suppressed wines from specificWines so they don't get the weight-10 boost
  var specificWines = dnaProfile.specificWines || [];
  if (feedbackSignals && feedbackSignals.suppressedWineNames.length > 0) {
    var suppressedLower = new Set(
      feedbackSignals.suppressedWineNames.map(function(n) { return n.toLowerCase(); })
    );
    specificWines = specificWines.filter(function(w) { return !suppressedLower.has(w.toLowerCase()); });
  }

  const userDNA = {
    countries: new Set(dnaProfile.countries || []),
    regions: new Set(Object.values(dnaProfile.regions || {}).flat()),
    varietals: new Set(dnaProfile.varietals || []),
    specificWines: specificWines,
    estateNames: estateNames,
  };
  const bottleEntries = entries.filter(function(entry) { return !entry.isByTheGlass; });
  return bottleEntries.map(function(entry) { return scoreEntry(entry, userDNA, feedbackSignals || null); });
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

var COUNTRY_FLAGS = {};
for (var ci = 0; ci < DNA_COUNTRIES.length; ci++) {
  COUNTRY_FLAGS[DNA_COUNTRIES[ci].id] = DNA_COUNTRIES[ci].emoji;
}

export function getCountryFlag(dnaCountryId) {
  return COUNTRY_FLAGS[dnaCountryId] || "";
}

export function getCountryName(dnaCountryId) {
  for (var i = 0; i < DNA_COUNTRIES.length; i++) {
    if (DNA_COUNTRIES[i].id === dnaCountryId) return DNA_COUNTRIES[i].name;
  }
  return "";
}
