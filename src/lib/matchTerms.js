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

const SPARKLING_SECTION = /sparkling|champagne|bubbles|fizz|pétillant|spumante|mousseux/;
const SPARKLING_NAME_TERMS = [
  "champagne", "cava", "prosecco", "crémant", "cremant",
  "brut", "blanc de blancs", "blanc de noirs",
  "méthode traditionnelle", "methode cap classique", "mcc",
  "sekt", "spumante", "franciacorta", "asti",
  "pétillant naturel", "pet-nat", "ancestrale",
];

/** Does this entry read as a sparkling wine — by its detected color, its
 *  Vision color, its section header, its name or its variety? */
export function isSparkling(entry) {
  if (!entry || typeof entry !== "object") return false;
  const name = (entry.name || "").toLowerCase();
  const section = (entry.section || "").toLowerCase();
  const variety = (entry.visionData && entry.visionData.variety ? entry.visionData.variety : "").toLowerCase();
  const visionColor = (entry.visionData && entry.visionData.color ? entry.visionData.color : "").toLowerCase();
  const detectedColor = (entry.detectedColor || "").toLowerCase();

  if (detectedColor === "sparkling") return true;
  if (visionColor === "sparkling") return true;
  if (SPARKLING_SECTION.test(section)) return true;
  if (SPARKLING_NAME_TERMS.some((term) => name.indexOf(term) >= 0)) return true;
  return /champagne blend|sparkling/.test(variety);
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
