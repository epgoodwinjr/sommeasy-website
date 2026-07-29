// matchEngine.js — v4: Unified data architecture
// Single data source: wineUnified.json (built from 130k WineMag reviews)

import wineUnified from "./wineUnified.json";

const COUNTRIES = wineUnified.countries;
const REGIONS = wineUnified.regions;
const PRODUCERS = wineUnified.producers;
const VARIETALS = wineUnified.varietals;
const REGION_LOOKUP = wineUnified.regionLookup;
const PRODUCER_LOOKUP = wineUnified.producerLookup;
const VARIETAL_LOOKUP = wineUnified.varietalLookup;


// ═══════════════════════════════════════════════════════
// BUILD SEARCH INDEX
// ═══════════════════════════════════════════════════════

function buildSearchIndex() {
  const idx = { regionTerms: [], producerTerms: [], varietyTerms: [], countryTerms: [] };

  // Regions from unified regionLookup (992 entries)
  for (const [term, data] of Object.entries(REGION_LOOKUP)) {
    if (term.length < 4 || ["other", "america", "europe"].includes(term)) continue;
    idx.regionTerms.push({
      term, dnaRegionId: data.regionId, dnaCountryId: data.country, count: 0,
    });
  }
  // Also add canonical region names as terms
  for (const [countryId, regions] of Object.entries(REGIONS)) {
    for (const region of regions) {
      const term = region.name.toLowerCase();
      if (term.length < 4 || idx.regionTerms.some(r => r.term === term)) continue;
      idx.regionTerms.push({
        term, dnaRegionId: region.id, dnaCountryId: countryId, count: region.reviewCount || 0,
      });
    }
  }
  idx.regionTerms.sort((a, b) => b.term.length - a.term.length);

  // Producers from unified producerLookup (8,882 entries)
  for (const [name, data] of Object.entries(PRODUCER_LOOKUP)) {
    if (name.length < 3) continue;
    idx.producerTerms.push({
      term: name.toLowerCase(), name, dnaCountryId: data.country || null,
    });
    // Menus write "& Fils" where WineMag writes "et Fils" (and vice versa) —
    // index conjunction variants so both spellings match
    const variants = [];
    if (name.includes(" et ")) variants.push(name.replace(/ et /g, " & "));
    if (name.includes(" and ")) variants.push(name.replace(/ and /g, " & "));
    if (name.includes(" & ")) variants.push(name.replace(/ & /g, " et "), name.replace(/ & /g, " and "));
    for (const v of variants) {
      idx.producerTerms.push({ term: v.toLowerCase(), name, dnaCountryId: data.country || null });
    }
  }
  idx.producerTerms.sort((a, b) => b.term.length - a.term.length);

  // Varietals from unified varietals array (71 entries)
  for (const v of VARIETALS) {
    if (v.name.length < 4) continue;
    idx.varietyTerms.push({
      term: v.name.toLowerCase(), name: v.name, color: v.color,
      dnaVarietalId: v.id, count: v.reviewCount || 0,
    });
    // Add synonym terms (e.g., "shiraz" for "syrah")
    if (v.name.includes(" / ")) {
      for (const part of v.name.split(" / ")) {
        const partLower = part.trim().toLowerCase();
        if (partLower.length >= 4 && !idx.varietyTerms.some(vt => vt.term === partLower)) {
          idx.varietyTerms.push({
            term: partLower, name: v.name, color: v.color,
            dnaVarietalId: v.id, count: v.reviewCount || 0,
          });
        }
      }
    }
  }
  // Add varietalLookup synonyms as additional search terms
  for (const [synonym, canonicalId] of Object.entries(VARIETAL_LOOKUP)) {
    const synLower = synonym.toLowerCase().replace(/_/g, " ");
    if (synLower.length < 4 || idx.varietyTerms.some(v => v.term === synLower)) continue;
    const canonical = VARIETALS.find(v => v.id === canonicalId);
    if (!canonical) continue;
    idx.varietyTerms.push({
      term: synLower, name: canonical.name, color: canonical.color,
      dnaVarietalId: canonicalId, count: canonical.reviewCount || 0,
    });
  }
  idx.varietyTerms.sort((a, b) => b.term.length - a.term.length);

  // Countries from unified countries array
  for (const c of COUNTRIES) {
    if (c.name.length < 3) continue;
    idx.countryTerms.push({ term: c.name.toLowerCase(), name: c.name, dnaCountryId: c.id, count: c.reviewCount || 0 });
  }

  // Add US aliases (since "US" is only 2 chars and gets filtered)
  const usCountry = COUNTRIES.find(c => c.id === "us");
  const usCount = usCountry ? usCountry.reviewCount : 54504;
  idx.countryTerms.push({ term: "united states", name: "United States", dnaCountryId: "us", count: usCount });
  idx.countryTerms.push({ term: "u.s.a.", name: "United States", dnaCountryId: "us", count: usCount });

  // Add US state full names as country-level signals
  var stateToUSA = ["california", "oregon", "washington", "new york", "virginia", "texas",
    "colorado", "arizona", "new mexico", "idaho", "michigan", "pennsylvania",
    "north carolina", "ohio", "missouri"];
  for (var si = 0; si < stateToUSA.length; si++) {
    if (!idx.regionTerms.some(function(r) { return r.term === stateToUSA[si]; })) {
      idx.countryTerms.push({ term: stateToUSA[si], name: "United States", dnaCountryId: "us", count: 1000 });
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

export function smartTitleCase(name) {
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

export function formatWineName(name) {
  if (!name) return "";
  let formatted = smartTitleCase(name);

  // If smartTitleCase didn't trigger (< 70% uppercase), still fix individual ALL CAPS words
  // e.g., "Domaine Alain Graillot CROZES-HERMITAGE 2019" → fix CROZES-HERMITAGE
  var lowerWords = new Set(["de", "du", "des", "le", "la", "les", "et", "en", "au", "aux", "di", "del", "della", "delle", "dei", "degli", "von", "van", "der", "das", "d", "e", "y"]);
  var preserveUpper = new Set(["AOC", "DOC", "DOCG", "IGT", "AVA", "MCC", "NV", "GC", "GCC", "1ER", "CRU", "II", "III", "IV"]);
  formatted = formatted.replace(/[A-ZÀ-ÖÙ-Ý][A-ZÀ-ÖÙ-Ý\-]{2,}/g, function(match) {
    if (preserveUpper.has(match)) return match;
    // Convert ALL CAPS word to Title Case, handling hyphens
    return match.toLowerCase().split("-").map(function(part) {
      if (lowerWords.has(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join("-");
  });

  // Fix all-lowercase words too (OCR and pasted menus often emit "chateau
  // margaux 2015"): capitalize any word that starts with a lowercase letter,
  // leaving connector words (de, du, des…) lowercase except at the start.
  // Words that already contain an uppercase letter are left alone.
  var isFirstWord = true;
  formatted = formatted.split(/([\s\-]+)/).map(function(word) {
    if (/^[\s\-]*$/.test(word)) return word;
    var first = isFirstWord;
    isFirstWord = false;
    if (!first && lowerWords.has(word)) return word;
    if (/^[a-zà-öù-ý]/.test(word)) {
      if (word.startsWith("l'") || word.startsWith("d'")) {
        return word.charAt(0).toUpperCase() + "'" + (word.length > 2 ? word.charAt(2).toUpperCase() + word.slice(3) : "");
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word;
  }).join("");

  // Restore known abbreviations
  const abbreviations = ["AOC", "DOC", "DOCG", "IGT", "AVA", "MCC", "NV"];
  for (const abbr of abbreviations) {
    const regex = new RegExp("\\b" + abbr.toLowerCase() + "\\b", "gi");
    formatted = formatted.replace(regex, abbr);
  }
  return formatted;
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

  // Producer detection — word-boundary matching, NOT raw substring:
  // producers named "Cass"/"Pier"/"Rozès" must not hit inside
  // "Cassis"/"Pierre"/"Crozes-Hermitage" (the country-misattribution bugs)
  for (var pi = 0; pi < SEARCH_INDEX.producerTerms.length; pi++) {
    const prod = SEARCH_INDEX.producerTerms[pi];
    if (prod.term.length < 4) continue;
    if (termMatchesInText(prod.term, text)) {
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

  // Varietal detection — word-boundary matching ("Port" must not hit
  // inside "Portugal"/"Porto" and force a wrong color)
  for (var vi = 0; vi < SEARCH_INDEX.varietyTerms.length; vi++) {
    const v = SEARCH_INDEX.varietyTerms[vi];
    if (termMatchesInText(v.term, text)) {
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
// QUALITY BONUS (from WineMag producer reputation data)
// ═══════════════════════════════════════════════════════

function getQualityBonus(producerName) {
  var normalized = producerName.toLowerCase().trim();
  var lookupEntry = PRODUCER_LOOKUP[normalized];

  if (!lookupEntry) return { bonus: 0, confidence: "unknown" };

  // Two-hop: lookup → regionId → PRODUCERS array → find by producerId
  var regionProducers = PRODUCERS[lookupEntry.regionId] || [];
  var producerData = regionProducers.find(function(p) { return p.id === lookupEntry.producerId; });

  if (!producerData) return { bonus: 0, confidence: "unknown" };

  var avgRating = producerData.avgRating || 0;
  var reviewCount = producerData.reviewCount || 0;

  // Rating-based bonus (tiebreaker, max 2.0)
  var ratingBonus = 0;
  if (avgRating >= 95) ratingBonus = 2.0;
  else if (avgRating >= 93) ratingBonus = 1.5;
  else if (avgRating >= 90) ratingBonus = 1.0;
  else if (avgRating >= 87) ratingBonus = 0.5;

  // Confidence modifier based on review count
  var confidence = "low";
  var confidenceMultiplier = 0.5;
  if (reviewCount >= 50) { confidence = "high"; confidenceMultiplier = 1.0; }
  else if (reviewCount >= 20) { confidence = "medium"; confidenceMultiplier = 0.8; }
  else if (reviewCount >= 5) { confidence = "low-medium"; confidenceMultiplier = 0.6; }

  var bonus = ratingBonus * confidenceMultiplier;

  return { bonus: Math.round(bonus * 10) / 10, confidence: confidence, avgRating: avgRating, reviewCount: reviewCount };
}


// ═══════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════

function scoreEntryFromText(entry, userDNA, feedbackSignals) {
  const text = " " + entry.name.toLowerCase() + " ";
  var score = 0;
  const matchReasons = [];
  const attrs = detectWineAttributes(entry.name);
  const detectedRegionIds = attrs.regionIds;
  const detectedCountryIds = attrs.countryIds;
  var detectedColor = attrs.color;

  // Extract producer name and ID for diversity checks and quality bonus
  var detectedProducerName = null;
  var detectedProducerId = null;
  if (attrs.producerTerms.size > 0) {
    var firstProdTerm = Array.from(attrs.producerTerms)[0];
    var prodSearchEntry = SEARCH_INDEX.producerTerms.find(function(p) { return p.term === firstProdTerm; });
    detectedProducerName = prodSearchEntry ? prodSearchEntry.name : firstProdTerm;
    var prodLookupEntry = PRODUCER_LOOKUP[firstProdTerm];
    detectedProducerId = prodLookupEntry ? prodLookupEntry.producerId : null;
  }

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
      matchReasons.push({ type: "region", label: regEntry ? regEntry.term : regId, weight: 3 });
    } else {
      // Check country-level match for this region
      for (const cId of detectedCountryIds) {
        if (userDNA.countries.has(cId)) {
          var cName = COUNTRIES.find(function(c) { return c.id === cId; });
          var regEntry2 = SEARCH_INDEX.regionTerms.find(function(r) { return r.dnaRegionId === regId; });
          var regLabel = regEntry2 ? regEntry2.term : regId;
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

  // QUALITY BONUS — tiebreaker based on producer reputation (max +2.0)
  var qualityProducerName = detectedProducerName;
  if (qualityProducerName) {
    var quality = getQualityBonus(qualityProducerName);
    if (quality.bonus > 0) {
      score += quality.bonus;
      matchReasons.push({ type: "quality", label: quality.avgRating + " pts (" + quality.reviewCount + " reviews)", weight: quality.bonus });
    }
  }

  // ESTATE + REGION COMBO BONUS (+1 when both match)
  var hasEstateMatch = matchReasons.some(function(r) { return r.type === "estate"; });
  var hasRegionMatch = matchReasons.some(function(r) { return r.type === "region"; });
  if (hasEstateMatch && hasRegionMatch) {
    score += 1;
  }

  var finalColor = detectedColor || entry.sectionColor || null;
  // Rosé-only appellation override (e.g., Tavel is always rosé)
  if (isRoseOnlyAppellation(entry)) finalColor = "rosé";

  return {
    name: entry.name,
    price: entry.price,
    originalLine: entry.originalLine,
    section: entry.section || null,
    score: score,
    matchReasons: matchReasons.sort(function(a, b) { return (b.weight || 0) - (a.weight || 0); }),
    detectedColor: finalColor,
    detectedRegionIds: Array.from(detectedRegionIds),
    detectedCountryIds: Array.from(detectedCountryIds),
    detectedCountry: detectedCountryIds.size > 0 ? Array.from(detectedCountryIds)[0] : null,
    detectedVarietalId: attrs.varietalIds.size > 0 ? Array.from(attrs.varietalIds)[0] : null,
    detectedVarietalIds: Array.from(attrs.varietalIds),
    detectedProducer: detectedProducerName,
    detectedProducerId: detectedProducerId,
    vintage: entry.vintage || null,
    visionData: entry.visionData || null,
  };
}

function scoreEntryFromVision(entry, userDNA, feedbackSignals) {
  var score = 0;
  var matchReasons = [];
  var vd = entry.visionData;

  // PRODUCER (weight: 5) — use visionData.producer against estateNames
  var detectedProducerName = vd.producer || null;
  var detectedProducerId = null;
  if (detectedProducerName) {
    var prodNorm = detectedProducerName.toLowerCase().trim();
    var prodLookup = PRODUCER_LOOKUP[prodNorm];
    if (prodLookup) {
      detectedProducerId = prodLookup.producerId;
    }
    // userDNA.estateNames is a Set of lowercase name strings (e.g., "kanonkop")
    if (userDNA.estateNames.has(prodNorm)) {
      score += 5;
      matchReasons.push({ type: "estate", label: detectedProducerName, weight: 5 });
    }
  }

  // COUNTRY first — Vision's country is most reliable source, must be detectedCountryIds[0]
  var detectedRegionIds = [];
  var detectedCountryIds = [];
  var visionCountryId = null;
  if (vd.country) {
    var countryNorm = vd.country.toLowerCase().trim();
    var countryObj = COUNTRIES.find(function(c) { return c.name.toLowerCase() === countryNorm || c.id === countryNorm; });
    visionCountryId = countryObj ? countryObj.id : null;
    if (visionCountryId) detectedCountryIds.push(visionCountryId);
  }

  // REGION (weight: 3 direct, 1 adjacent)
  if (vd.region) {
    var regionNorm = vd.region.toLowerCase().trim();
    // Try direct REGION_LOOKUP first
    var regionEntry = REGION_LOOKUP[regionNorm];
    // Fallback: try without hyphens (Vision may return "Crozes Hermitage" vs "crozes-hermitage")
    if (!regionEntry) {
      var withHyphens = regionNorm.replace(/\s+/g, "-");
      regionEntry = REGION_LOOKUP[withHyphens];
    }
    if (!regionEntry) {
      var withSpaces = regionNorm.replace(/-/g, " ");
      regionEntry = REGION_LOOKUP[withSpaces];
    }
    // Fallback: search SEARCH_INDEX.regionTerms for substring match
    if (!regionEntry) {
      var searchHit = SEARCH_INDEX.regionTerms.find(function(r) { return r.term === regionNorm || r.term === regionNorm.replace(/\s+/g, "-") || r.term === regionNorm.replace(/-/g, " "); });
      if (searchHit) {
        regionEntry = { regionId: searchHit.dnaRegionId, country: searchHit.dnaCountryId };
      }
    }
    if (regionEntry) {
      detectedRegionIds.push(regionEntry.regionId);
      // Only add region's country if we don't already have a Vision country
      if (regionEntry.country && detectedCountryIds.indexOf(regionEntry.country) < 0) {
        detectedCountryIds.push(regionEntry.country);
      }
      if (userDNA.regions.has(regionEntry.regionId)) {
        score += 3;
        matchReasons.push({ type: "region", label: regionEntry.regionId, weight: 3 });
      } else {
        // Check country-level match (use Vision country or region country)
        var effectiveCountry = visionCountryId || regionEntry.country;
        if (effectiveCountry && userDNA.countries.has(effectiveCountry)) {
          score += 1;
          var cName = COUNTRIES.find(function(c) { return c.id === effectiveCountry; });
          matchReasons.push({ type: "country_region", label: regionNorm + " (you like " + (cName ? cName.name : effectiveCountry) + ")", weight: 1 });
        }
      }
    }
  }

  // COUNTRY scoring (weight: 1, only if no region already scored)
  if (visionCountryId && !matchReasons.some(function(r) { return r.type === "region" || r.type === "country_region"; })) {
    if (userDNA.countries.has(visionCountryId)) {
      var countryObj2 = COUNTRIES.find(function(c) { return c.id === visionCountryId; });
      score += 1;
      matchReasons.push({ type: "country", label: countryObj2 ? countryObj2.name : visionCountryId, weight: 1 });
    }
  }

  // VARIETAL (weight: 2) — handle blends by splitting
  var detectedVarietalIds = [];
  if (vd.variety) {
    var varietyLower = vd.variety.toLowerCase().trim();
    var varietyTerms = [varietyLower];
    if (varietyLower.indexOf("blend") >= 0) {
      var parts = varietyLower.replace(/\s*blend\s*/g, "").split(/[-,\/]/);
      for (var vi = 0; vi < parts.length; vi++) {
        var pt = parts[vi].trim();
        if (pt.length >= 3) varietyTerms.push(pt);
      }
    }
    for (var vi = 0; vi < varietyTerms.length; vi++) {
      var vTerm = varietyTerms[vi];
      var varLookup = VARIETAL_LOOKUP[vTerm];
      var varId = varLookup || null;
      if (!varId) {
        var foundVar = VARIETALS.find(function(v) { return v.name.toLowerCase() === vTerm; });
        if (foundVar) varId = foundVar.id;
      }
      if (varId && detectedVarietalIds.indexOf(varId) < 0) {
        detectedVarietalIds.push(varId);
        if (userDNA.varietals.has(varId)) {
          score += 2;
          var varEntry = VARIETALS.find(function(v) { return v.id === varId; });
          matchReasons.push({ type: "varietal", label: varEntry ? varEntry.name : varId, weight: 2 });
        }
      }
    }
  }

  // FAVORITE WINE (weight: 10) — scan name
  var text = " " + entry.name.toLowerCase() + " ";
  for (var fi = 0; fi < userDNA.specificWines.length; fi++) {
    var fav = userDNA.specificWines[fi];
    if (fav.length >= 4 && text.indexOf(fav.toLowerCase()) >= 0) {
      score += 10;
      matchReasons.push({ type: "favorite", label: fav, weight: 10 });
    }
  }

  // FEEDBACK SIGNALS
  if (feedbackSignals) {
    for (var si = 0; si < feedbackSignals.suppressedWineNames.length; si++) {
      var suppressed = feedbackSignals.suppressedWineNames[si];
      if (suppressed.length >= 4 && text.indexOf(suppressed.toLowerCase()) >= 0) {
        var favIdx = matchReasons.findIndex(function(r) { return r.type === "favorite"; });
        if (favIdx >= 0) { score -= matchReasons[favIdx].weight; matchReasons.splice(favIdx, 1); }
        score -= 5;
        matchReasons.push({ type: "feedback_suppress", label: "You didn't enjoy this wine", weight: -5 });
      }
    }
    for (var ri = 0; ri < detectedRegionIds.length; ri++) {
      var regId = detectedRegionIds[ri];
      var rBoost = feedbackSignals.boostedRegions.get(regId);
      if (rBoost) { score += rBoost.weight; matchReasons.push({ type: "feedback_boost", label: "You " + (rBoost.weight >= 2 ? "loved" : "liked") + " wines from this region", weight: rBoost.weight }); }
      if (feedbackSignals.suppressedRegions.has(regId)) { score -= 2; matchReasons.push({ type: "feedback_suppress", label: "Similar region to a wine you didn't enjoy", weight: -2 }); }
    }
    for (var vsi = 0; vsi < detectedVarietalIds.length; vsi++) {
      var varIdFb = detectedVarietalIds[vsi];
      var vBoost = feedbackSignals.boostedVarietals.get(varIdFb);
      if (vBoost) { score += vBoost.weight; matchReasons.push({ type: "feedback_boost", label: "You " + (vBoost.weight >= 2 ? "loved" : "liked") + " wines with this grape", weight: vBoost.weight }); }
      if (feedbackSignals.suppressedVarietals.has(varIdFb)) { score -= 2; matchReasons.push({ type: "feedback_suppress", label: "Similar grape to a wine you didn't enjoy", weight: -2 }); }
    }
    if (detectedProducerName) {
      var pTerm = detectedProducerName.toLowerCase().trim();
      var pBoost = feedbackSignals.boostedProducers.get(pTerm);
      if (pBoost) { score += pBoost.weight; matchReasons.push({ type: "feedback_boost", label: "You've enjoyed this producer before", weight: pBoost.weight }); }
      if (feedbackSignals.suppressedProducers.has(pTerm)) { score -= 3; matchReasons.push({ type: "feedback_suppress", label: "You didn't enjoy this producer", weight: -3 }); }
    }
  }

  // QUALITY BONUS
  if (detectedProducerName) {
    var quality = getQualityBonus(detectedProducerName);
    if (quality.bonus > 0) {
      score += quality.bonus;
      matchReasons.push({ type: "quality", label: quality.avgRating + " pts (" + quality.reviewCount + " reviews)", weight: quality.bonus });
    }
  }

  // ESTATE + REGION COMBO
  var hasEstate = matchReasons.some(function(r) { return r.type === "estate"; });
  var hasRegion = matchReasons.some(function(r) { return r.type === "region"; });
  if (hasEstate && hasRegion) score += 1;

  var detectedColor = vd.color || entry.sectionColor || null;
  // Rosé-only appellation override (e.g., Tavel is always rosé)
  if (isRoseOnlyAppellation(entry)) detectedColor = "rosé";

  return {
    name: entry.name,
    price: entry.price,
    originalLine: entry.originalLine,
    section: entry.section || null,
    score: score,
    matchReasons: matchReasons.sort(function(a, b) { return (b.weight || 0) - (a.weight || 0); }),
    detectedColor: detectedColor,
    detectedRegionIds: detectedRegionIds,
    detectedCountryIds: detectedCountryIds,
    detectedCountry: detectedCountryIds.length > 0 ? detectedCountryIds[0] : null,
    detectedVarietalId: detectedVarietalIds.length > 0 ? detectedVarietalIds[0] : null,
    detectedVarietalIds: detectedVarietalIds,
    detectedProducer: detectedProducerName,
    detectedProducerId: detectedProducerId,
    vintage: (vd.vintage || entry.vintage || null),
    visionData: entry.visionData,
  };
}

function scoreEntry(entry, userDNA, feedbackSignals) {
  if (entry.visionData && entry.visionData.region) {
    return scoreEntryFromVision(entry, userDNA, feedbackSignals);
  }
  return scoreEntryFromText(entry, userDNA, feedbackSignals);
}


// ═══════════════════════════════════════════════════════
// CURATE 5 PICKS
// ═══════════════════════════════════════════════════════

export function getPickCount(totalWines, colorFilter) {
  if (colorFilter && colorFilter !== "all") return 5;
  var count = Math.max(5, Math.floor(totalWines / 30));
  return Math.min(count, 10);
}

export function buildMenuContext(scoredEntries) {
  var countries = new Set();
  var regions = new Set();
  for (var i = 0; i < scoredEntries.length; i++) {
    var entry = scoredEntries[i];
    (entry.detectedCountryIds || []).forEach(function(c) { countries.add(c); });
    (entry.detectedRegionIds || []).forEach(function(r) { regions.add(r); });
  }
  return {
    totalWines: scoredEntries.length,
    distinctCountries: countries.size,
    distinctRegions: regions.size,
    countrySet: countries,
    regionSet: regions,
  };
}

// Rosé-only appellations — always override detectedColor to "rosé"
var ROSE_ONLY_APPELLATIONS = new Set(["tavel", "rosé d'anjou", "rose d'anjou", "cabernet d'anjou"]);

function isRoseOnlyAppellation(entry) {
  // Check region from Vision data
  if (entry.visionData && entry.visionData.region) {
    if (ROSE_ONLY_APPELLATIONS.has(entry.visionData.region.toLowerCase().trim())) return true;
  }
  // Check detected region IDs (tavel maps to rhone_valley, so also check the name directly)
  var name = (entry.name || "").toLowerCase();
  for (var term of ROSE_ONLY_APPELLATIONS) {
    if (termMatchesInText(term, " " + name + " ")) return true;
  }
  // Check section header
  var section = (entry.section || "").toLowerCase();
  for (var term of ROSE_ONLY_APPELLATIONS) {
    if (section.includes(term)) return true;
  }
  return false;
}

export function isSparklingWine(entry) {
  var name = (entry.name || "").toLowerCase();
  var section = (entry.section || "").toLowerCase();
  var variety = (entry.visionData && entry.visionData.variety ? entry.visionData.variety : "").toLowerCase();
  var visionColor = (entry.visionData && entry.visionData.color ? entry.visionData.color : "").toLowerCase();
  var detectedColor = (entry.detectedColor || "").toLowerCase();

  // Already detected as sparkling by scorer or Vision
  if (detectedColor === "sparkling") return true;
  if (visionColor === "sparkling") return true;

  // Section header indicates sparkling
  if (/sparkling|champagne|bubbles|fizz|pétillant|spumante|mousseux/.test(section)) return true;

  // Name contains sparkling indicators
  var sparklingTerms = [
    "champagne", "cava", "prosecco", "crémant", "cremant",
    "brut", "blanc de blancs", "blanc de noirs",
    "méthode traditionnelle", "methode cap classique", "mcc",
    "sekt", "spumante", "franciacorta", "asti",
    "pétillant naturel", "pet-nat", "ancestrale"
  ];
  for (var i = 0; i < sparklingTerms.length; i++) {
    if (name.indexOf(sparklingTerms[i]) >= 0) return true;
  }

  // Variety indicates sparkling
  if (/champagne blend|sparkling/.test(variety)) return true;

  return false;
}

export function curatePicks(scoredEntries, options) {
  const minPrice = options.minPrice;
  const maxPrice = options.maxPrice;
  const colorPreference = options.colorPreference;
  const maxPicks = options.maxPicks || 5;
  const menuContext = options.menuContext || null;
  const userDNA = options.userDNA || null;

  var pool = scoredEntries;
  if (colorPreference && colorPreference !== "all") {
    // Helper: does this entry have Vision-provided color metadata?
    var hasVisionColor = function(e) { return e.visionData && e.visionData.color; };

    var filtered;
    if (colorPreference === "sparkling") {
      filtered = pool.filter(function(e) { return isSparklingWine(e); });
    } else if (colorPreference === "white") {
      filtered = pool.filter(function(e) {
        if (isSparklingWine(e)) return false;
        // Vision entries: require explicit color match
        if (hasVisionColor(e)) return e.detectedColor === "white";
        // Text entries: include if color matches or is unknown
        return !e.detectedColor || e.detectedColor === "white";
      });
    } else if (colorPreference === "red") {
      filtered = pool.filter(function(e) {
        if (isSparklingWine(e)) return false;
        if (hasVisionColor(e)) return e.detectedColor === "red";
        return !e.detectedColor || e.detectedColor === "red";
      });
    } else {
      // rosé or other color
      filtered = pool.filter(function(e) {
        if (hasVisionColor(e)) return e.detectedColor === colorPreference;
        if (!e.detectedColor) return true;
        return e.detectedColor === colorPreference;
      });
    }
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

  function wouldViolateDiversity(candidate, existingPicks) {
    var candidateVarietals = candidate.detectedVarietalIds || [];
    var candidateRegions = candidate.detectedRegionIds || [];
    var candidateProducer = (candidate.detectedProducer || "").toLowerCase();

    var varietalOverlap = 0;
    var regionOverlap = 0;
    var producerMatch = false;

    for (var i = 0; i < existingPicks.length; i++) {
      var pick = existingPicks[i];
      var sameVarietal = candidateVarietals.some(function(v) { return (pick.detectedVarietalIds || []).indexOf(v) >= 0; });
      var sameRegion = candidateRegions.some(function(r) { return (pick.detectedRegionIds || []).indexOf(r) >= 0; });

      if (sameVarietal) varietalOverlap++;
      if (sameRegion) regionOverlap++;

      var pickProducer = (pick.detectedProducer || "").toLowerCase();
      if (candidateProducer && pickProducer && candidateProducer === pickProducer) {
        producerMatch = true;
      }

      // Pairwise duplicate check: same varietal AND same region as any single existing pick
      // This catches Top+Splurge being identical (e.g., both Pinot Noir from Bordeaux)
      if (sameVarietal && sameRegion && candidateVarietals.length > 0 && candidateRegions.length > 0) {
        return true;
      }
    }

    return varietalOverlap >= 2 || regionOverlap >= 2 || producerMatch;
  }

  function pickFrom(subset, type) {
    // First pass: respect diversity constraints
    for (var i = 0; i < subset.length; i++) {
      var idx = matched.indexOf(subset[i]);
      if (idx >= 0 && !used.has(idx) && !wouldViolateDiversity(subset[i], picks)) {
        used.add(idx);
        picks.push(Object.assign({}, subset[i], { pickType: type }));
        return true;
      }
    }
    // Fallback: if ALL candidates violate diversity, take the best one
    for (var i = 0; i < subset.length; i++) {
      var idx = matched.indexOf(subset[i]);
      if (idx >= 0 && !used.has(idx)) {
        used.add(idx);
        picks.push(Object.assign({}, subset[i], { pickType: type }));
        return true;
      }
    }
    return false;
  }

  // 1. TOP — best scoring wine within budget
  pickFrom(mainPool, "top");

  // 2. SPLURGE — intentionally above the budget ceiling (worth the stretch), capped at ~2x max
  var splurgePool = matched.filter(function(e) {
    var floor = maxPrice || null;
    var ceiling = maxPrice ? maxPrice * 2 : null;
    if (!floor) {
      // No max set: use 65th percentile as floor, 95th as ceiling
      var prices = matched.map(function(e) { return e.price; }).sort(function(a, b) { return a - b; });
      floor = prices[Math.floor(prices.length * 0.65)];
      ceiling = prices[Math.floor(prices.length * 0.95)];
    }
    return e.price > floor && (!ceiling || e.price <= ceiling);
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

  // 4. ADVENTURE — context-aware tiered selection
  if (userDNA && menuContext) {
    var adventureFound = false;

    // Tier 1: Diverse international menu (5+ countries) → different country
    if (!adventureFound && menuContext.distinctCountries >= 5) {
      var advTier1 = mainPool.filter(function(e) {
        if (e.score < 1) return false;
        var fromUserCountry = (e.detectedCountryIds || []).some(function(cId) { return userDNA.countries.has(cId); });
        return !fromUserCountry && e.matchReasons.length > 0;
      }).sort(function(a, b) { return b.score - a.score; });
      if (advTier1.length > 0) adventureFound = pickFrom(advTier1, "adventure");
    }

    // Tier 2: Limited country diversity (2-4) → different region
    if (!adventureFound && menuContext.distinctCountries >= 2) {
      var advTier2 = mainPool.filter(function(e) {
        if (e.score < 1) return false;
        var fromUserRegion = (e.detectedRegionIds || []).some(function(rId) { return userDNA.regions.has(rId); });
        return !fromUserRegion && e.matchReasons.length > 0;
      }).sort(function(a, b) { return b.score - a.score; });
      if (advTier2.length > 0) adventureFound = pickFrom(advTier2, "adventure");
    }

    // Tier 3: Single-country menu → different varietal
    if (!adventureFound && menuContext.distinctCountries === 1) {
      var advTier3 = mainPool.filter(function(e) {
        if (e.score < 1) return false;
        var fromUserVarietal = (e.detectedVarietalIds || []).some(function(vId) { return userDNA.varietals.has(vId); });
        return !fromUserVarietal;
      }).sort(function(a, b) { return b.score - a.score; });
      if (advTier3.length > 0) adventureFound = pickFrom(advTier3, "adventure");
    }

    // Tier 4: Skip adventure if nothing qualifies
  } else {
    // Fallback: original logic if no userDNA/menuContext
    var adv = mainPool.filter(function(e) {
      var hasVarietal = e.matchReasons.some(function(r) { return r.type === "varietal"; });
      var hasDirectRegion = e.matchReasons.some(function(r) { return r.type === "region"; });
      return e.score >= 1 && hasVarietal && !hasDirectRegion;
    }).sort(function(a, b) { return b.score - a.score; });
    pickFrom(adv, "adventure");
  }

  // 5. WILDCARD — fill remaining slots from budget pool, respecting diversity
  for (var i = 0; i < mainPool.length && picks.length < maxPicks; i++) {
    var idx = matched.indexOf(mainPool[i]);
    if (idx >= 0 && !used.has(idx) && !wouldViolateDiversity(mainPool[i], picks)) {
      used.add(idx);
      picks.push(Object.assign({}, mainPool[i], { pickType: "wildcard" }));
    }
  }
  // Second pass fallback: if diversity prevented filling, allow duplicates
  for (var i = 0; i < mainPool.length && picks.length < maxPicks; i++) {
    var idx = matched.indexOf(mainPool[i]);
    if (idx >= 0 && !used.has(idx)) {
      used.add(idx);
      picks.push(Object.assign({}, mainPool[i], { pickType: "wildcard" }));
    }
  }

  return picks.slice(0, maxPicks);
}


// ═══════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

export function matchWinesAgainstDNA(entries, dnaProfile, feedbackSignals) {
  if (!dnaProfile || !entries.length) return { scoredEntries: [], userDNA: null };
  const estateNames = new Set();
  const allEstates = dnaProfile.estates || {};
  for (const regionId of Object.keys(allEstates)) {
    const estateIds = allEstates[regionId] || [];
    const regionProducers = PRODUCERS[regionId] || [];
    for (var i = 0; i < estateIds.length; i++) {
      const estateId = estateIds[i];
      const found = regionProducers.find(function(p) { return p.id === estateId; });
      if (found) { estateNames.add(found.name.toLowerCase()); }
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
  const scored = bottleEntries.map(function(entry) { return scoreEntry(entry, userDNA, feedbackSignals || null); });
  return { scoredEntries: scored, userDNA: userDNA };
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
var COUNTRY_NAMES = {};
for (var ci = 0; ci < COUNTRIES.length; ci++) {
  COUNTRY_FLAGS[COUNTRIES[ci].id] = COUNTRIES[ci].emoji;
  COUNTRY_NAMES[COUNTRIES[ci].id] = COUNTRIES[ci].name;
}

export function getCountryFlag(countryId) {
  return COUNTRY_FLAGS[countryId] || "";
}

export function getCountryName(countryId) {
  return COUNTRY_NAMES[countryId] || "";
}

export function getRegionDisplayName(regionId, countryId) {
  if (!regionId) return null;
  if (countryId && REGIONS[countryId]) {
    const region = REGIONS[countryId].find(function(r) { return r.id === regionId; });
    if (region) return region.name;
  }
  for (const cId of Object.keys(REGIONS)) {
    const region = REGIONS[cId].find(function(r) { return r.id === regionId; });
    if (region) return region.name;
  }
  return null;
}

export function getVarietalDisplayName(varietalId) {
  if (!varietalId) return null;
  const varietal = VARIETALS.find(function(v) { return v.id === varietalId; });
  return varietal ? varietal.name : null;
}

export function getVarietalColor(varietalId) {
  if (!varietalId) return null;
  const varietal = VARIETALS.find(function(v) { return v.id === varietalId; });
  return varietal && varietal.color && varietal.color !== "unknown" ? varietal.color : null;
}
