// producerAliases.js — the name a wine list actually writes for a producer.
//
// WineMag keys a producer by its full name ("Newton Johnson Vineyards",
// "Finca La Emperatriz"); menus drop the generic designator ("Newton
// Johnson", "La Emperatriz el Jardín"). When the full name can't match, the
// longest-first producer scan falls through to a SHORTER producer named by
// one of the remaining words — Napa's "Newton", Stellenbosch's "Jardin" —
// and that producer's country rides along. Indexing each producer under its
// core name lets specificity decide: "newton johnson" outranks "newton".
//
// matchEngine and wineResolver both build their alias tables here, so the
// two engines can't disagree about what a producer is called (the resolver
// matched Newton Johnson only because its normalize() happens to strip
// "vineyards"; the engine never did). Dependency-free, so tests import it.

// Generic designators: the resolver's normalize() vocabulary minus "cuvee"
// (it names a wine, not a winery), plus the plurals its \b regex misses
// and "finca"
const LEADING_DESIGNATORS = new Set([
  "château", "chateau", "châteaux", "chateaux", "domaine", "domaines",
  "bodega", "bodegas", "finca", "tenuta", "tenute", "cantina", "cantine",
  "fattoria", "azienda", "casa", "maison",
]);
const TRAILING_DESIGNATORS = new Set([
  "vineyard", "vineyards", "winery", "wineries", "wine", "wines",
  "estate", "estates", "cellar", "cellars",
]);

// What a LEADING designator leaves behind is often its modifier, not a
// name: "Cantina di Montalcino" -> "di montalcino" would claim every
// Brunello, and US "Bodega del Sur" -> "del sur" Argentina's "Alma del Sur"
const PREPOSITIONS = new Set([
  "de", "du", "des", "di", "da", "do", "dos", "das", "del", "della", "delle",
  "dello", "dei", "degli", "of", "y", "e", "et", "and", "&",
]);
const isPreposition = (word) => PREPOSITIONS.has(word) || /^d['’]/.test(word);

/**
 * Core name of a lowercase producer name ("newton johnson vineyards" ->
 * "newton johnson"), or null when it has none worth indexing. A core is
 * always two or more words: a phrase is strictly more specific than any
 * single word inside it, while a one-word core ("Bodegas Mauro" -> "mauro")
 * would be a new short alias — exactly how Jardín-class bugs are born.
 */
export function producerCoreName(name) {
  const words = name.trim().split(/\s+/);
  let start = 0;
  let end = words.length;
  while (end - start > 1 && LEADING_DESIGNATORS.has(words[start])) start++;
  while (end - start > 1 && TRAILING_DESIGNATORS.has(words[end - 1])) end--;
  if (end - start < 2 || (start === 0 && end === words.length)) return null;
  if (start > 0 && isPreposition(words[start])) return null;
  return words.slice(start, end).join(" ");
}

// Word runs as the matchers see them: their boundary characters split
// words, so "la fleur" counts as inside "la fleur-pétrus"
function words(text) {
  return text.split(/[\s,;:()/\-–—.'’]+/).filter(Boolean);
}

function eachWordRun(text, fn) {
  const w = words(text);
  for (let i = 0; i < w.length; i++) {
    for (let j = i + 1; j <= w.length; j++) fn(w.slice(i, j).join(" "));
  }
}

// Every place and grape name in the dataset, lowercase
function placeAndGrapeNames({ regionLookup, regions, countries, varietals, varietalLookup }) {
  return [
    ...Object.keys(regionLookup),
    ...Object.values(regions).flat().map((r) => r.name.toLowerCase()),
    ...countries.map((c) => c.name.toLowerCase()),
    ...varietals.flatMap((v) => v.name.toLowerCase().split("/")),
    ...Object.keys(varietalLookup).map((s) => s.toLowerCase().replace(/_/g, " ")),
  ];
}

/**
 * Core name -> producerLookup key, for every core that is safe to index:
 * no OTHER producer answers to it (shares the core, or has it inside its
 * own name — "Meyer Family" is a US cellar AND a Canadian vineyard), and
 * it names no place or grape ("Dry Creek Vineyard" -> "dry creek" would
 * claim every Dry Creek Valley wine). Callers must match these aliases as
 * whole phrases ("lo alto" must never fire inside "Cielo Alto").
 * Takes the whole wineUnified dataset so both engines build one table.
 */
export function buildCoreNameAliases(data) {
  const producerNames = Object.keys(data.producerLookup);
  const placeAndGrapeTerms = placeAndGrapeNames(data);

  const owners = new Map();   // core phrase (as words) -> { core, names }
  for (const name of producerNames) {
    const core = producerCoreName(name);
    if (!core) continue;
    const key = words(core).join(" ");
    const entry = owners.get(key) || { core, names: new Set() };
    entry.names.add(name);
    owners.set(key, entry);
  }

  const ambiguous = new Set();
  for (const name of producerNames) {
    eachWordRun(name, (run) => {
      const entry = owners.get(run);
      if (entry && !entry.names.has(name)) ambiguous.add(run);
    });
  }
  for (const term of placeAndGrapeTerms) {
    eachWordRun(term, (run) => { if (owners.has(run)) ambiguous.add(run); });
  }

  const aliases = new Map();
  for (const [key, entry] of owners) {
    if (entry.names.size !== 1 || ambiguous.has(key)) continue;
    aliases.set(entry.core, entry.names.values().next().value);
  }
  return aliases;
}

const ARTICLES = new Set(["la", "le", "les", "el", "los", "las", "il", "lo"]);

/**
 * The place-and-grape guardrail for a name a matcher has already SHORTENED
 * — the resolver's normalize() drops designators anywhere in a name, so
 * "Dry Creek Vineyard" becomes "dry creek" (every Dry Creek Valley wine).
 * Returns a test (short, full) => true when the short form is a place or
 * grape name, or a preposition its stripped designator left in front of
 * one: "Cantina di Montalcino" -> "di montalcino" (every Brunello), but
 * "Château de Beaucastel" -> "de beaucastel" stays a name. Unlike a core
 * alias, a short form is how menus already find the producer ("Coudoulet
 * de Beaucastel", "Ch. d'Yquem"), so a preposition alone never condemns
 * it. `norm` puts place and grape names in the caller's normalized form;
 * both arguments to the test are already in it.
 */
export function buildShortNameGuard(data, norm) {
  const placeRuns = new Set();
  for (const term of placeAndGrapeNames(data)) eachWordRun(norm(term), (run) => placeRuns.add(run));
  const isPlace = (text) => placeRuns.has(words(text).join(" "));
  return (short, full) => {
    if (isPlace(short)) return true;
    const w = short.split(" ");
    // Only a preposition the stripped designator exposed: "De Loach" is a name
    if (w[0] === full.split(" ")[0] || !isPreposition(w[0])) return false;
    let i = 0;
    while (i < w.length - 1 && (PREPOSITIONS.has(w[i]) || ARTICLES.has(w[i]))) i++;
    return isPlace(w.slice(i).join(" ").replace(/^[dl]['’]/, ""));
  };
}
