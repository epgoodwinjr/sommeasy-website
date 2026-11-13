// matchTerms.js — Match & picks' pure helpers (The House List, Phase 3).
//
// Tonight's terms start from Account › At the table (wine_profiles
// .preferences, decision D8), and a pick meets the user's journal by
// normalized name — the match that lets a pick say "❤️ Loved it in August"
// and keeps an already-rated wine from being rated twice under a
// differently-written name. Dependency-free (matchTerms.test.js runs the
// real module); junk in → a safe default, never a throw.

export const COLORS = Object.freeze(["all", "red", "white", "sparkling"]);

// A saved price as the amount fields hold it: a digit string, or "".
function amount(value) {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return String(Math.round(value));
  return "";
}

/** { color, min, max } for the page's terms state — preferences shaped
 *  { spend: { min, max }, color } (migration 012), or All / empty. */
export function termsFromPreferences(preferences) {
  const p = preferences && typeof preferences === "object" ? preferences : {};
  const spend = p.spend && typeof p.spend === "object" ? p.spend : {};
  return {
    color: COLORS.includes(p.color) ? p.color : "all",
    min: amount(spend.min),
    max: amount(spend.max),
  };
}

// A saved price as preferences hold it: a whole number, or null
function price(value) {
  const digits = amount(value);
  return digits ? Number(digits) : null;
}

/** Account's amount pair (digit strings) as preferences.spend: numbers or
 *  null — a reversed pair ("$90 to $40") saves the way it was meant. */
export function spendFromAmounts(min, max) {
  let lo = price(min), hi = price(max);
  if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
  return { min: lo, max: hi };
}

/** The preferences with one setting changed — { spend } or { color } —
 *  everything else kept. A value that isn't one changes nothing. */
export function preferencesWith(preferences, change) {
  const next = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? { ...preferences } : {};
  const c = change && typeof change === "object" ? change : {};
  if (c.spend && typeof c.spend === "object") next.spend = { min: price(c.spend.min), max: price(c.spend.max) };
  if (COLORS.includes(c.color)) next.color = c.color;
  return next;
}

/** A wine name folded for matching: accents, case, punctuation and runs of
 *  space all fall away. */
export function normalizeWineName(name) {
  if (typeof name !== "string") return "";
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** The journal row a pick already has (wine_interactions rows), matched by
 *  normalized name. When two rows fold to the same name, a rated one wins
 *  — that's the one that decides whether the pick can be rated here. */
export function findJournalRow(name, rows) {
  const key = normalizeWineName(name);
  if (!key || !Array.isArray(rows)) return null;
  let found = null;
  for (const row of rows) {
    if (!row || typeof row !== "object" || normalizeWineName(row.wine_name) !== key) continue;
    if (row.rating) return row;
    found = found || row;
  }
  return found;
}

// ═══════════════════════════════════════════════════════
// THE TERMS RULE (Nov 2026)
// ═══════════════════════════════════════════════════════
//
// What "fits tonight's terms" means — the ONE copy, read by the engine's
// picks (matchEngine's curatePicks) and by the Somm's slate (sommPicks'
// buildSommPayload). Two readers of one rule can't disagree, which is the
// point: the page shows what the Somm will be asked to choose from, and
// what the Somm is asked for is what the page shows.
//
//   Color   a chosen color means that color. No "too few, show them all".
//   Budget  picks come from wines inside min–max, plus at most ONE wine over
//           max, never past twice it — the Splurge. No backfill: three, two,
//           one or no picks is the honest answer when that is what fits.
//
// Until Nov 12, 2026 the engine dropped the budget whenever fewer than three
// wines fit it, and the color whenever fewer than three wines had it — a
// "$250 and up" search showed five bottles under $170.

// Reading "sparkling" — WORDS, never letters inside a longer word. Every
// text is folded first as normalizeWineName folds a name (lowercase, no
// accents, single spaces between words), so the terms below are written
// folded and "Crémant", "CREMANT", "Pét-Nat" and "Pet Nat" are one spelling
// each. Until Nov 2026 the name was tested with indexOf: "asti" sat inside
// Castillo and Sebastiani, "cava" inside Cavallotto, "mcc" inside McCrea,
// "brut" inside Brutocao — reds left out under Reds, offered under Sparkling.

// A heading or a variety is read from the START of a word: a plural
// ("Champagnes", "Sparkling Wines") is still the heading
const SPARKLING_SECTION = /(?:^| )(?:sparkling|champagne|bubbles|fizz|petillant|spumante|mousseux)/;
const SPARKLING_VARIETY = /(?:^| )(?:champagne blend|sparkling)/;

// In a name: a whole word, or a run of whole words
const SPARKLING_NAME_TERMS = [
  "champagne", "cava", "prosecco", "cremant",
  "brut", "blanc de blancs", "blanc de noirs",
  "methode traditionnelle", "methode cap classique", "mcc",
  "spumante", "franciacorta",
  "petillant naturel", "pet nat", "ancestrale",
];

// Sekt is the one term German writes inside a longer word, as its head
// ("Winzersekt", "Jahrgangssekt") or its first part ("Sektkellerei")
function isSektWord(word) {
  return word.startsWith("sekt") || word.endsWith("sekt");
}

// "Asti" is the sparkling wine only as the wine's own name — "Asti", "Asti
// Spumante", "Moscato d'Asti". After any other grape ("Barbera d'Asti",
// Dolcetto, Grignolino, Freisa) it is where a still wine is from.
function namesAsti(words) {
  const moscato = words.includes("moscato");
  return words.some((word, i) => word === "asti" && (moscato || (words[i - 1] !== "d" && words[i - 1] !== "di")));
}

/** Does this entry read as a sparkling wine — by its detected color, its
 *  Vision color, its section header, its name or its variety? */
export function isSparkling(entry) {
  if (!entry || typeof entry !== "object") return false;
  const vision = entry.visionData || {};
  const detectedColor = normalizeWineName(entry.detectedColor); // "rosé" folds to "rose"
  const visionColor = normalizeWineName(vision.color);

  if (detectedColor === "sparkling") return true;
  if (visionColor === "sparkling") return true;
  if (SPARKLING_SECTION.test(normalizeWineName(entry.section))) return true;

  const name = normalizeWineName(entry.name);
  const padded = ` ${name} `;
  if (SPARKLING_NAME_TERMS.some((term) => padded.includes(` ${term} `))) return true;
  const words = name.split(" ");
  if (words.some(isSektWord)) return true;
  // Asti is made from Moscato Bianco: a wine known to be red or rosé that
  // says "Asti" ("Barbera, Vietti, Asti") is naming the place. Only Asti
  // yields to the color — a Brut rosé or a sparkling Shiraz is sparkling.
  const color = detectedColor || visionColor;
  if (namesAsti(words) && color !== "red" && color !== "rose") return true;
  return SPARKLING_VARIETY.test(normalizeWineName(vision.variety));
}

/** Does this entry fit the color the diner chose? No color (or "all") fits
 *  everything. A wine whose color is unknown — a text line with no clue —
 *  fits red, white or rosé as it always has; a wine Vision gave a color to
 *  must match it; sparkling takes only what reads as sparkling, and a
 *  sparkling wine is never a red or a white. */
export function fitsColor(entry, color) {
  if (!color || color === "all") return true;
  if (!entry || typeof entry !== "object") return false;
  if (color === "sparkling") return isSparkling(entry);
  if ((color === "red" || color === "white") && isSparkling(entry)) return false;
  if (entry.visionData && entry.visionData.color) return entry.detectedColor === color;
  return !entry.detectedColor || entry.detectedColor === color;
}

// A limit as the page may hold it: a positive number, or digits. Anything
// else — null, "", 0, junk — is no limit.
function limit(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** The budget as the rule reads it: { min, max }, each a positive number or null. */
export function budgetLimits(min, max) {
  return { min: limit(min), max: limit(max) };
}

/** Where a price stands against the budget:
 *    "in"       inside min–max (both ends included; a missing end is open)
 *    "splurge"  over max, up to twice it — the one stretch a slate may hold
 *    "out"      under min, or past twice the max
 *  A minimum alone has no stretch: there is no "over" without a max. */
export function budgetFit(price, min, max) {
  const b = budgetLimits(min, max);
  if (b.min != null && price < b.min) return "out";
  if (b.max != null && price > b.max) return price <= b.max * 2 ? "splurge" : "out";
  return "in";
}

/** A wine that can be a pick at all: the palate scored it, and it has a price. */
export function isPickable(entry) {
  return Boolean(entry) && entry.score > 0 && entry.price != null;
}

// ═══════════════════════════════════════════════════════
// THE LONE ADVENTURE (Nov 2026)
// ═══════════════════════════════════════════════════════
//
// A list was read, wines reached the scorer, and none of them scored: the
// palate knows nothing on it. The diner is still at the table. So the page
// shows ONE wine — role Adventure — on the lone Splurge's principle, rather
// than ending in "No matches found" (Ed's decision).
//
//   Trigger   nothing on the list scored above zero. One match anywhere —
//             even a wine that scores on its producer's rating alone — and
//             the list is an ordinary one: curatePicks decides, as before.
//   Eligible  a wine with a price that the palate has nothing AGAINST (a
//             negative score is a wine, grape or place the diner rated "not
//             for me"), in tonight's color, INSIDE tonight's budget. Never
//             the Splurge band: a wine that is a stretch for the palate is
//             not also a stretch for the wallet.
//   The pick  the engine has no taste to go on, so its rule is plain and
//             deterministic: the color the diner asked for — or, with no
//             color chosen, the one their palate leans to — then the middle
//             of the price range (the lower middle of an even count; never
//             the cheapest bottle, never the dearest).
//
// The engine's pick is a placeholder with manners. The Somm, asked with the
// palate as context, chooses the wine nearest in spirit from the same wines
// (sommPicks' buildAdventurePayload reads rankAdventures — one rule, two
// readers, as with the terms).

/** The color the palate has more of — "red", "white", or null when it is
 *  even or unknown. `profile` carries red_count / white_count (the same
 *  counts Your palate's Red ↔ White rail is drawn from). */
export function palateLean(profile) {
  const count = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const p = profile && typeof profile === "object" ? profile : {};
  const red = count(p.red_count), white = count(p.white_count);
  if (red === white) return null;
  return red > white ? "red" : "white";
}

/** A wine that could be the lone Adventure under no terms at all: it shows
 *  a price, and the palate has nothing against it. */
export function canAdventure(entry) {
  return Boolean(entry) && typeof entry === "object" && entry.price != null && !(entry.score < 0);
}

/** …and under tonight's terms: the chosen color, inside the budget. */
export function fitsAdventure(entry, { color, min, max } = {}) {
  return canAdventure(entry) && fitsColor(entry, color) && budgetFit(entry.price, min, max) === "in";
}

// A wine's color as far as anyone can tell: sparkling however it reads as
// one, else what the engine (or the photo) detected, else unknown
function colorOf(entry) {
  if (isSparkling(entry)) return "sparkling";
  const color = entry.detectedColor || (entry.visionData && entry.visionData.color) || "";
  return String(color).toLowerCase() || null;
}

/**
 * Every wine the lone Adventure could be under tonight's terms, in the
 * engine's order — its first is the pick. [] when the list matched anything
 * at all (the trigger), or when nothing fits.
 *
 * Order: wines of the target color (tonight's color; else the palate's
 * `lean`), then wines whose color is unknown, then the rest — and within
 * each, from the middle of its price range outward, the cheaper of two
 * equally near first. Equal prices keep the list's order.
 */
export function rankAdventures(scoredEntries, { color, min, max, lean } = {}) {
  if (!Array.isArray(scoredEntries)) return [];
  if (scoredEntries.some((e) => e && e.score > 0)) return [];
  const terms = { color, min, max };
  const eligible = scoredEntries.filter((e) => fitsAdventure(e, terms));
  const target = color && color !== "all" ? color : lean || null;
  const tiers = [[], [], []];
  for (const entry of eligible) {
    const c = colorOf(entry);
    tiers[!target || c === target ? 0 : c == null ? 1 : 2].push(entry);
  }
  return tiers.flatMap((tier) => {
    const byPrice = tier.slice().sort((a, b) => a.price - b.price); // stable: ties keep list order
    const middle = Math.floor((byPrice.length - 1) / 2);
    return byPrice
      .map((entry, k) => ({ entry, away: Math.abs(k - middle), k }))
      .sort((a, b) => a.away - b.away || a.k - b.k)
      .map((x) => x.entry);
  });
}

/** The lone Adventure: the first of rankAdventures as a pick (a copy,
 *  pickType "adventure"), or null when there is none to offer. */
export function loneAdventure(scoredEntries, terms) {
  const [first] = rankAdventures(scoredEntries, terms);
  return first ? Object.assign({}, first, { pickType: "adventure" }) : null;
}
