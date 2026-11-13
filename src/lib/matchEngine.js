// matchEngine.js — v4: Unified data architecture
// Single data source: wineUnified.json (built from 130k WineMag reviews)

import wineUnified from "./wineUnified.json";
import { buildCoreNameAliases } from "./producerAliases.js";
import { fitsColor, budgetFit, budgetLimits, isPickable, isSparkling } from "./matchTerms.js";

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

// One spelling for matching: lowercase, accents folded. A list prints "Cotes
// du Rhone" as often as "Côtes du Rhône", and a photo reads what is printed.
export function foldText(text) {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Areas wider than any one region here: they name a country and nothing
// finer. regionLookup files "central coast" under Livermore Valley (one of
// the dozen regions it spans), which made every Central Coast wine a
// Livermore wine; the Western Cape is most of South Africa's vineyard.
const BROAD_AREAS = { "western cape": "south_africa", "central coast": "us" };

// Regions the trade calls by a shorter name than the data's
const SHORT_REGION_NAMES = { "loire": "loire valley", "rhône": "rhône valley" };

// A grape name that, without its accent, is also a plain word ("Rosé" /
// "Château La Rose"): in a wine's NAME only the accented spelling counts.
// A variety field is a statement about the grape, so there either does.
const ACCENT_ONLY_IN_NAMES = new Set(["rose"]);

function buildSearchIndex() {
  const idx = { regionTerms: [], producerTerms: [], varietyTerms: [], countryTerms: [] };

  // Regions from unified regionLookup (992 entries)
  for (const [term, data] of Object.entries(REGION_LOOKUP)) {
    if (term.length < 4 || ["other", "america", "europe"].includes(term) || BROAD_AREAS[term]) continue;
    idx.regionTerms.push({
      term, dnaRegionId: data.regionId, dnaCountryId: data.country, count: 0,
    });
  }
  // Also add canonical region names as terms
  for (const [countryId, regions] of Object.entries(REGIONS)) {
    for (const region of regions) {
      const term = region.name.toLowerCase();
      if (term.length < 4) continue;
      const existing = idx.regionTerms.find(r => r.term === term);
      if (existing) {
        // One name, two countries ("Central Valley": California's and Chile's)
        if (existing.dnaCountryId !== countryId) existing.sharedWith = (existing.sharedWith || []).concat(countryId);
        continue;
      }
      idx.regionTerms.push({
        term, dnaRegionId: region.id, dnaCountryId: countryId, count: region.reviewCount || 0,
      });
    }
  }
  // Combined names ("Hemel-en-Aarde / Walker Bay") never appear whole on a
  // menu line — index each part, as the varietals do for "Syrah / Shiraz"
  for (const combined of idx.regionTerms.filter(r => r.term.includes(" / "))) {
    for (const part of combined.term.split(" / ")) {
      const term = part.trim();
      if (term.length < 4 || idx.regionTerms.some(r => r.term === term)) continue;
      idx.regionTerms.push({ ...combined, term });
    }
  }
  for (const [short, long] of Object.entries(SHORT_REGION_NAMES)) {
    const full = idx.regionTerms.find(r => r.term === long);
    if (full && !idx.regionTerms.some(r => r.term === short)) idx.regionTerms.push({ ...full, term: short });
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
  idx.countryTerms.push({ term: "usa", name: "United States", dnaCountryId: "us", count: usCount });

  // Add US state full names as country-level signals
  var stateToUSA = ["california", "oregon", "washington", "new york", "virginia", "texas",
    "colorado", "arizona", "new mexico", "idaho", "michigan", "pennsylvania",
    "north carolina", "ohio", "missouri"];
  for (var si = 0; si < stateToUSA.length; si++) {
    if (!idx.regionTerms.some(function(r) { return r.term === stateToUSA[si]; })) {
      idx.countryTerms.push({ term: stateToUSA[si], name: "United States", dnaCountryId: "us", count: 1000 });
    }
  }

  // Broad areas: a country-level signal, like the states
  for (const [area, countryId] of Object.entries(BROAD_AREAS)) {
    const country = COUNTRIES.find(c => c.id === countryId);
    idx.countryTerms.push({ term: area, name: countryId === "us" ? "United States" : country.name, dnaCountryId: countryId, count: 1000 });
  }

  // Regions, grapes and countries are matched in one folded spelling
  for (const r of idx.regionTerms) r.fold = foldText(r.term);
  for (const c of idx.countryTerms) c.fold = foldText(c.term);
  for (const v of idx.varietyTerms) {
    v.fold = foldText(v.term);
    if (v.fold !== v.term && ACCENT_ONLY_IN_NAMES.has(v.fold)) v.accentOnlyInNames = true;
  }

  // A region FIELD may hold a name too short to scan a line for ("Dão"):
  // every region spelling, by its folded form, for whole-field matches
  idx.regionByFold = new Map();
  for (const r of idx.regionTerms) if (!idx.regionByFold.has(r.fold)) idx.regionByFold.set(r.fold, r);
  for (const [term, data] of Object.entries(REGION_LOOKUP)) {
    const key = foldText(term);
    if (idx.regionByFold.has(key) || ["other", "america", "europe"].includes(term) || BROAD_AREAS[term]) continue;
    idx.regionByFold.set(key, { term, fold: key, dnaRegionId: data.regionId, dnaCountryId: data.country, count: 0 });
  }

  // Core-name aliases: menus write "Newton Johnson", WineMag keys "Newton
  // Johnson Vineyards" — without the alias the longest-first scan falls
  // through to Napa's "Newton". Whole-phrase matches only (producerAliases.js)
  for (const [core, name] of buildCoreNameAliases(wineUnified)) {
    idx.producerTerms.push({ term: core, name, dnaCountryId: PRODUCER_LOOKUP[name].country || null, alias: true });
  }
  idx.producerTerms.sort((a, b) => b.term.length - a.term.length);

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

// Multi-word terms match as plain substrings unless wholePhrase: core-name
// aliases must sit on boundaries at both ends ("lo alto" never in "Cielo Alto")
function termMatchesInText(term, text, wholePhrase) {
  if (term.length <= 2) return false;
  if (!wholePhrase && (term.includes(" ") || term.includes("-"))) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // (?!'s...): a possessive never counts as a mention -- "Mate's Vineyard"
  // is not the producer Mate (the apostrophe still bounds quoted names)
  const re = new RegExp(`(?:^|[\\s,;:()/\\-\u2013\u2014.'])${escaped}(?!'s(?:[\\s,;:()/\\-\u2013\u2014.']|$))(?:[\\s,;:()/\\-\u2013\u2014.']|$)`, "i");
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

    // "Wines by the Glass & Bottle", the "GLASS  BOTTLE" over two price
    // columns: a heading, and what follows is offered both ways
    if (/^(wines?\s+)?(by\s+the\s+)?glass\s+(and\s+|or\s+)?(by\s+the\s+)?bottle$/i.test(stripped.replace(/\s+/g, " "))) {
      inBTGSection = false;
      continue;
    }

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
    var glassPrice = null;

    // A glass price and a bottle price — "10/40", "$10 / $40", or two price
    // columns set apart by a gap ("…   18    72"): the wine is a BOTTLE at
    // the bottle price. (Until Nov 2026 a pair flagged the wine by-the-glass
    // and the engine dropped it — every wine on a glass-and-bottle list.)
    // One space is not a column: "Penfolds Bin 28 62" keeps its bin number.
    var glassBottle = line.match(/\$?\s*(\d{1,3})\s*\/\s*\$?\s*(\d{1,4})\s*\.?\s*$/);
    if (!glassBottle) {
      var columns = line.match(/(?:\s{2,}|\t+)\$?(\d{1,3})(?:\s{2,}|\t+)\$?(\d{1,4})\s*\.?\s*$/);
      if (columns && parseFloat(columns[1]) < parseFloat(columns[2])) glassBottle = columns;
    }
    if (glassBottle) {
      price = parseFloat(glassBottle[2]);
      glassPrice = parseFloat(glassBottle[1]);
      name = line.slice(0, glassBottle.index).trim();
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
      glassPrice: glassPrice,
      // By the glass ONLY: under a by-the-glass heading, with no bottle price
      isByTheGlass: inBTGSection && glassPrice == null,
    });
  }
  return entries;
}


// ═══════════════════════════════════════════════════════
// ATTRIBUTE DETECTION (shared by scoring + feedback)
// ═══════════════════════════════════════════════════════
//
// One set of lookups reads a pasted line and a photographed wine. A line is
// read whole; a photo's fields are each read for what they are (a region
// field for a region, a variety field for grapes) through the SAME terms
// and the same matcher, and whatever a field doesn't settle falls back to
// the wine's own name. Texts arrive padded with a space at each end;
// "folded" texts are lowercase with accents removed (foldText), "raw" ones
// lowercase only — producer names keep their accents, as their keys do.

const pad = function(text) { return " " + text + " "; };

// Producers — word-boundary matching, NOT raw substring: producers named
// "Cass"/"Pier"/"Rozès" must not hit inside "Cassis"/"Pierre"/
// "Crozes-Hermitage" (the country-misattribution bugs)
function findProducer(raw) {
  for (var pi = 0; pi < SEARCH_INDEX.producerTerms.length; pi++) {
    const prod = SEARCH_INDEX.producerTerms[pi];
    if (prod.term.length < 4) continue;
    if (termMatchesInText(prod.term, raw, prod.alias)) return prod;
  }
  return null;
}

// The longest region term the text states. A term that IS the producer's
// name is passed over (`claimed` holds that name, folded — "Gård" the
// Washington producer is not the Gard)
function findRegion(folded, claimed) {
  for (var ri = 0; ri < SEARCH_INDEX.regionTerms.length; ri++) {
    const reg = SEARCH_INDEX.regionTerms[ri];
    if (claimed && claimed.has(reg.fold)) continue;
    if (termMatchesInText(reg.fold, folded)) return reg;
  }
  return null;
}

// The longest grape term the text states — word-boundary matching ("Port"
// must not hit inside "Portugal"/"Porto" and force a wrong color)
function findVarietal(folded, raw) {
  for (var vi = 0; vi < SEARCH_INDEX.varietyTerms.length; vi++) {
    const v = SEARCH_INDEX.varietyTerms[vi];
    if (v.accentOnlyInNames ? termMatchesInText(v.term, raw) : termMatchesInText(v.fold, folded)) return v;
  }
  return null;
}

function findCountry(folded) {
  for (var ci = 0; ci < SEARCH_INDEX.countryTerms.length; ci++) {
    const c = SEARCH_INDEX.countryTerms[ci];
    if (c.term.length < 3) continue;
    if (termMatchesInText(c.fold, folded)) return c;
  }
  return null;
}

// A producer hit is a guess; the region or country a wine names outright
// is not. A producer whose home contradicts it is a namesake — Sonoma's
// Jordan on a Stellenbosch line, Israel's Alexander inside "Alexander
// Valley" — and contributes nothing (the engine's half of wineResolver's
// Step 3.5 guard). Geography inside the producer's own name ("Concha y
// Toro", "Vega Sicilia") says nothing about the bottle, and a region name
// two countries share ("Central Valley") agrees with either.
function isNamesake(producer, region, statedCountry) {
  if (!producer || !producer.dnaCountryId) return false;
  const ownName = foldText(producer.term);
  const stated = [region, statedCountry].filter(function(g) {
    return g && g.dnaCountryId && ownName.indexOf(g.fold) < 0;
  });
  const agrees = function(g) {
    return g.dnaCountryId === producer.dnaCountryId || (g.sharedWith || []).indexOf(producer.dnaCountryId) >= 0;
  };
  return stated.length > 0 && !stated.some(agrees);
}

function detectWineAttributes(wineName) {
  const raw = pad(wineName.toLowerCase());
  const folded = pad(foldText(wineName));
  const regionIds = new Set();
  const countryIds = new Set();
  const varietalIds = new Set();
  const producerTerms = new Set();
  const regionLabels = new Map();
  var color = null;
  const claimed = new Set();

  var producer = findProducer(raw);
  if (producer) claimed.add(foldText(producer.term));

  const region = findRegion(folded, claimed);
  if (region && region.dnaRegionId) {
    regionIds.add(region.dnaRegionId);
    regionLabels.set(region.dnaRegionId, region.term);
  }

  const varietal = findVarietal(folded, raw);
  if (varietal) {
    if (varietal.dnaVarietalId) varietalIds.add(varietal.dnaVarietalId);
    if (varietal.color) color = varietal.color;
  }

  const statedCountry = findCountry(folded);

  if (isNamesake(producer, region, statedCountry)) producer = null;

  // Canonical name, whichever form matched ("& Fils", a core-name alias), so
  // estate, feedback and producer-id lookups see one producer
  if (producer) {
    producerTerms.add(producer.name);
    if (producer.dnaCountryId) countryIds.add(producer.dnaCountryId);
  }
  if (region && region.dnaCountryId) countryIds.add(region.dnaCountryId);
  if (statedCountry && statedCountry.dnaCountryId) countryIds.add(statedCountry.dnaCountryId);

  return { regionIds, countryIds, varietalIds, producerTerms, color, regionLabels };
}

// ─── A photographed wine: its fields, then its name ───

// What a field holds, or "" — Vision writes null, and sometimes "null"
function fieldText(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text && text.toLowerCase() !== "null" ? text : "";
}

// A producer field: the whole field as a producer's own key first — which
// reaches names a line is never scanned for ("COS", "KWV": under four
// letters) — then the longest producer inside it ("Justin Vineyards & Winery")
function findProducerInField(field) {
  if (!field) return null;
  const exact = PRODUCER_LOOKUP[field];
  if (exact) return { term: field, name: field, dnaCountryId: exact.country || null };
  return findProducer(pad(field));
}

// A region field: the whole field as one name first (which reaches names
// too short to scan a line for, and "Crozes Hermitage" without its hyphen),
// then the longest region inside it ("Sonoma Coast, California"), then the
// valley it can only mean ("Willamette")
function findRegionInField(field) {
  if (!field) return null;
  const spellings = [field, field.replace(/\s+/g, "-"), field.replace(/-/g, " ")];
  for (var i = 0; i < spellings.length; i++) {
    const exact = SEARCH_INDEX.regionByFold.get(spellings[i]);
    if (exact) return exact;
  }
  for (var j = 0; j < spellings.length; j++) {
    const inside = findRegion(pad(spellings[j]), null);
    if (inside) return inside;
  }
  return SEARCH_INDEX.regionByFold.get(field + " valley") || null;
}

// A variety field: EVERY grape it names, in the order it names them —
// "Cabernet Sauvignon, Merlot", "Grenache-Syrah blend". Each term found is
// blanked out before the next, so "Cabernet Sauvignon" never also reads as
// "Sauvignon", and a grape under two names ("Syrah / Shiraz") is one grape.
function findVarietalsInField(field) {
  if (!field) return [];
  var work = pad(field);
  const found = [];
  for (var vi = 0; vi < SEARCH_INDEX.varietyTerms.length; vi++) {
    const v = SEARCH_INDEX.varietyTerms[vi];
    if (!termMatchesInText(v.fold, work)) continue;
    const at = work.indexOf(v.fold);
    if (!found.some(function(f) { return f.term.dnaVarietalId === v.dnaVarietalId; })) found.push({ term: v, at: at });
    work = work.split(v.fold).join(",".repeat(v.fold.length));
  }
  return found.sort(function(a, b) { return a.at - b.at; }).map(function(f) { return f.term; });
}

// The United States as a country FIELD holds it. "US" is no word to scan a
// line for; alone in a country field it can be nothing else.
const US_FIELD_NAMES = new Set(["us", "usa", "u.s", "u.s.", "u.s.a", "u.s.a.", "united states", "united states of america", "america"]);

function findCountryInField(field) {
  if (!field) return null;
  if (US_FIELD_NAMES.has(field)) return SEARCH_INDEX.countryTerms.find(function(c) { return c.term === "united states"; });
  return findCountry(pad(field));
}

function detectVisionAttributes(entry) {
  const vd = entry.visionData || {};
  const name = typeof entry.name === "string" ? entry.name : "";
  const nameRaw = pad(name.toLowerCase());
  const nameFolded = pad(foldText(name));
  const regionIds = new Set();
  const countryIds = new Set();
  const varietalIds = new Set();
  const producerTerms = new Set();
  const regionLabels = new Map();
  const claimed = new Set();

  // Producer: the photo's producer field, else the name
  const producerField = fieldText(vd.producer);
  var producer = findProducerInField(producerField.toLowerCase()) || findProducer(nameRaw);
  if (producer) claimed.add(foldText(producer.term));

  // Region: the field's own words, else the name's
  const regionField = foldText(fieldText(vd.region));
  const region = findRegionInField(regionField) || findRegion(nameFolded, claimed);
  if (region && region.dnaRegionId) {
    regionIds.add(region.dnaRegionId);
    regionLabels.set(region.dnaRegionId, region.term);
  }

  // Grapes: every one the field names, else the first the name does
  var varietals = findVarietalsInField(foldText(fieldText(vd.variety)));
  if (varietals.length === 0) {
    const fromName = findVarietal(nameFolded, nameRaw);
    if (fromName) varietals = [fromName];
  }
  var varietalColor = null;
  for (var vi = 0; vi < varietals.length; vi++) {
    if (varietals[vi].dnaVarietalId) varietalIds.add(varietals[vi].dnaVarietalId);
    if (varietals[vi].color && !varietalColor) varietalColor = varietals[vi].color;
  }

  // Country: the field; else a state or a broad area in the region field
  // ("California", "Western Cape"); else the name
  const statedCountry = findCountryInField(foldText(fieldText(vd.country)))
    || (regionField ? findCountry(pad(regionField)) : null)
    || findCountry(nameFolded);

  if (isNamesake(producer, region, statedCountry)) producer = null;

  // The country the photo states leads (it is the surest reading on the page)
  if (statedCountry && statedCountry.dnaCountryId) countryIds.add(statedCountry.dnaCountryId);
  if (producer) {
    producerTerms.add(producer.name);
    if (producer.dnaCountryId) countryIds.add(producer.dnaCountryId);
  }
  if (region && region.dnaCountryId) countryIds.add(region.dnaCountryId);

  return {
    regionIds, countryIds, varietalIds, producerTerms, regionLabels,
    // The photo's color stands; without one, the grape's
    color: fieldText(vd.color) || varietalColor,
    // The producer as the photo read it — the estate reason's words, and
    // the producer a wine keeps (for variety among the picks) when the data
    // doesn't know it
    producerReading: producerField || null,
  };
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

// ONE scorer for a pasted line and a photographed wine: what differs between
// them is only how their attributes were read (detectWineAttributes for a
// line, detectVisionAttributes for a photo's fields). Until Nov 2026 the
// photo had a scorer of its own with exact-match lookups, and the same wine
// could score 5 pasted and 0 photographed.
function scoreWithAttributes(entry, attrs, userDNA, feedbackSignals) {
  const text = " " + entry.name.toLowerCase() + " ";
  var score = 0;
  const matchReasons = [];
  const detectedRegionIds = attrs.regionIds;
  const detectedCountryIds = attrs.countryIds;
  var detectedColor = attrs.color;
  // A region reason says the place the wine itself states
  const regionLabel = function(regId) { return attrs.regionLabels.get(regId) || regId; };

  // Extract producer name and ID for diversity checks and quality bonus
  var detectedProducerName = attrs.producerReading || null;
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
      matchReasons.push({ type: "estate", label: attrs.producerReading || (prodEntry ? prodEntry.name : prodTerm), weight: 5 });
    }
  }

  // REGION (weight: 3 direct, 1 adjacent)
  for (const regId of detectedRegionIds) {
    if (userDNA.regions.has(regId)) {
      score += 3;
      matchReasons.push({ type: "region", label: regionLabel(regId), weight: 3 });
    } else {
      // Check country-level match for this region
      for (const cId of detectedCountryIds) {
        if (userDNA.countries.has(cId)) {
          var cName = COUNTRIES.find(function(c) { return c.id === cId; });
          var regLabel = regionLabel(regId);
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
    vintage: (entry.visionData && entry.visionData.vintage) || entry.vintage || null,
    visionData: entry.visionData || null,
  };
}

function scoreEntry(entry, userDNA, feedbackSignals) {
  const attrs = entry.visionData ? detectVisionAttributes(entry) : detectWineAttributes(entry.name);
  return scoreWithAttributes(entry, attrs, userDNA, feedbackSignals);
}

/**
 * The wines /api/parse-wine-list read from a photo or PDF, as the entries
 * the engine scores — one shape with parseWineList's.
 *
 * By the glass (Ed, Nov 2026: bottles only): a wine with a bottle price is a
 * bottle. `price` is the bottle price and `glass_price` the glass price; a
 * wine is by the glass ONLY when it shows a glass price and no bottle price.
 * The route's `is_btg` alone is not trusted to say so — under a heading like
 * "Wines by the Glass & Bottle" it came back true for every wine on the
 * page, bottle price and all — except where it is all there is to go on: a
 * flagged wine with one price and no glass price is taken for a glass.
 */
export function entriesFromVision(wines) {
  if (!Array.isArray(wines)) return [];
  const num = function(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; };
  return wines.map(function(wine) {
    const w = wine && typeof wine === "object" ? wine : {};
    const name = typeof w.name === "string" ? w.name : "";
    const price = num(w.price);
    const glassPrice = num(w.glass_price);
    const glassOnly = price == null ? glassPrice != null : (w.is_btg === true && glassPrice == null);
    return {
      name: name,
      price: price,
      glassPrice: glassPrice,
      originalLine: name,
      section: w.section || null,
      isByTheGlass: glassOnly,
      sectionColor: w.color || null,
      sectionVarietal: null,
      vintage: w.vintage || null,
      visionData: {
        color: w.color || null,
        variety: w.variety || null,
        region: w.region || null,
        country: w.country || null,
        producer: w.producer || null,
        vintage: w.vintage || null,
      },
    };
  });
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

// One reading of "sparkling", shared with the terms rule (matchTerms.js)
export const isSparklingWine = isSparkling;

export function curatePicks(scoredEntries, options) {
  const minPrice = options.minPrice;
  const maxPrice = options.maxPrice;
  const colorPreference = options.colorPreference;
  const maxPicks = options.maxPicks || 5;
  const menuContext = options.menuContext || null;
  const userDNA = options.userDNA || null;

  // ─── Tonight's terms (matchTerms.js — the rule's one copy) ───
  // A chosen color means that color, and the budget is the budget: picks
  // come only from wines inside min–max, plus at most one wine over max and
  // within twice it, the Splurge. No backfill — when two wines fit, the page
  // shows two (plus that one Splurge), and when none do, none.
  //
  // Until Nov 12, 2026 both terms gave way under three: a color with fewer
  // than three wines was ignored, and a budget fewer than three wines fit
  // was DROPPED, so "$250 and up" showed five bottles under $170 and
  // "up to $41" a $165 Worth Trying.
  const pool = scoredEntries.filter(function(e) { return fitsColor(e, colorPreference); });

  // Only wines with a score AND a price can be picks
  const matched = pool.filter(isPickable).sort(function(a, b) { return b.score - a.score; });
  if (matched.length === 0) return [];

  // The wines that fit the budget — every pick but the Splurge comes from here
  const hasMax = budgetLimits(minPrice, maxPrice).max != null;
  const mainPool = matched.filter(function(e) { return budgetFit(e.price, minPrice, maxPrice) === "in"; });

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

  // 1. TOP — best scoring wine within budget (none, when nothing fits it)
  pickFrom(mainPool, "top");

  // 2. SPLURGE — with a max: the one wine over it, never past twice it (worth
  // the stretch). With no max there is no "over": the stretch pick is a
  // pricier bottle among the wines that fit (65th–95th percentile of the
  // matched prices), so under a minimum alone it still honors the minimum.
  var splurgePool;
  if (hasMax) {
    splurgePool = matched.filter(function(e) { return budgetFit(e.price, minPrice, maxPrice) === "splurge"; });
  } else {
    var prices = matched.map(function(e) { return e.price; }).sort(function(a, b) { return a - b; });
    var floor = prices[Math.floor(prices.length * 0.65)];
    var ceiling = prices[Math.floor(prices.length * 0.95)];
    splurgePool = mainPool.filter(function(e) { return e.price > floor && (!ceiling || e.price <= ceiling); });
  }
  splurgePool.sort(function(a, b) { return b.score - a.score; });
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

  // 5. WILDCARD — fill remaining slots from the wines that fit, respecting diversity
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

/** A matched producer's display name ("Kanonkop", "Domaine Dujac") — the
 *  name its estate wears in the DNA — from what a scored entry carries:
 *  `detectedProducer` (the producerLookup key on the text path, Vision's
 *  reading on the image path) and `detectedProducerId`. Display only;
 *  matching never reads it. A producer the data can't name → null, never
 *  the key ("kanonkop"). */
export function getProducerDisplayName(producer, producerId) {
  const key = typeof producer === "string" ? producer.toLowerCase().trim() : "";
  const lookup = key ? PRODUCER_LOOKUP[key] : null;
  const id = (typeof producerId === "string" && producerId) || (lookup && lookup.producerId) || null;
  if (!id) return null;
  const byId = function(p) { return p.id === id; };
  // Filed under its own region first, then anywhere (dnaNames' estate rule)
  const found = ((lookup && PRODUCERS[lookup.regionId]) || []).find(byId)
    || Object.values(PRODUCERS).reduce(function(hit, ps) { return hit || ps.find(byId); }, null);
  const name = found && typeof found.name === "string" ? found.name.trim() : "";
  return name || null;
}

export function getVarietalColor(varietalId) {
  if (!varietalId) return null;
  const varietal = VARIETALS.find(function(v) { return v.id === varietalId; });
  return varietal && varietal.color && varietal.color !== "unknown" ? varietal.color : null;
}
