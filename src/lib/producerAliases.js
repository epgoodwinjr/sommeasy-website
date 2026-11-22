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

// ─── Initials ───
//
// WineMag writes a producer's initials one way ("G D Vajra", "A.A.
// Badenhorst", "E. Guigal") and lists write them every way: "G.D.", "G. D.",
// "GD", "G D". One spelling for all of them: a run of initials becomes its
// letters, run together — "g.d. vajra", "g. d. vajra", "g d vajra" and "gd
// vajra" are all "gd vajra"; "e. guigal" and "e guigal" are "e guigal".
// An initial is a letter with a dot ("g.", "a.a."), or a lone letter in a run
// of two or more ("g d"). A lone letter with no dot is a word ("Badia a
// Coltibuono", "Isole e Olena", "Concha y Toro") and is left alone.
// Both engines fold the producer names they index AND the text they search,
// so every spelling meets every other.
// A run may end on punctuation ("Dios Baco S.L., Andalucía"), which stays
const INITIALS = /^((?:\p{L}\.)+\p{L}?|\p{L})([,;:)\]]*)$/u;

export function foldInitials(text) {
  const parts = String(text).split(/(\s+)/);  // words at even indexes, spaces between
  let out = "";
  for (let i = 0; i < parts.length;) {
    let j = i;
    let letters = "";
    let tail = "";
    let dotted = false;
    for (let m; j < parts.length && !tail && (m = INITIALS.exec(parts[j])); j += 2) {
      letters += m[1].replace(/\./g, "");
      if (m[1].includes(".")) dotted = true;
      tail = m[2];
    }
    if (j > i && (dotted || letters.length > 1)) {
      out += letters + tail + (parts[j - 1] ?? "");
      i = j;
    } else {
      out += parts[i] + (parts[i + 1] ?? "");
      i += 2;
    }
  }
  return out;
}

// ─── Words ───

/**
 * Whether `term` occurs in `text` as words: no letter or digit touching
 * either end of it. "baden" is not in "badenhorst", "port" not in
 * "portugal", "napa" not in "anapamu", "asti" not in "sebastiani". Hyphens
 * and apostrophes bound a word ("crozes-hermitage" states "hermitage",
 * "barbera d'asti" states "asti"), as they do in matchEngine's
 * termMatchesInText. Both texts in one spelling (the caller's).
 */
export function includesWord(text, term) {
  if (!term) return false;
  for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + 1)) {
    if (!/[\p{L}\p{N}]/u.test(text[at - 1] || "") && !/[\p{L}\p{N}]/u.test(text[at + term.length] || "")) return true;
  }
  return false;
}

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
  // Cores in the one spelling of initials both engines search in
  const folded = new Map(producerNames.map((name) => [name, foldInitials(name)]));

  const owners = new Map();   // core phrase (as words) -> { core, names }
  for (const name of producerNames) {
    const core = producerCoreName(folded.get(name));
    if (!core) continue;
    const key = words(core).join(" ");
    const entry = owners.get(key) || { core, names: new Set() };
    entry.names.add(name);
    owners.set(key, entry);
  }

  const ambiguous = new Set();
  for (const name of producerNames) {
    eachWordRun(folded.get(name), (run) => {
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

/**
 * One winery the data keys twice: two producerLookup keys that are the same
 * name once initials are folded and designators set aside ("AA Badenhorst"
 * and "A.A. Badenhorst Family Wines"), in the same region, EACH with an
 * estate of its own. Split, a diner's bottles of that winery count toward
 * two estates and neither promotes. Returns key -> canonical key for the
 * twin that gives way: the canonical is the one with more reviews (then the
 * longer name). A twin pair with ONE estate between them is not merged here
 * — nothing is split, and which name a list writes decides the estate.
 */
const TWIN_DESIGNATORS = new Set([...TRAILING_DESIGNATORS, "family"]);

export function buildProducerTwins(data) {
  const estateOf = (key) => {
    const p = data.producerLookup[key];
    return (data.producers[p.regionId] || []).find((e) => e.id === p.producerId) || null;
  };
  const plain = (key) => words(foldInitials(key)).join(" ");
  const byPlain = new Map();
  for (const key of Object.keys(data.producerLookup)) byPlain.set(plain(key), key);

  const twins = new Map();
  for (const key of Object.keys(data.producerLookup)) {
    const w = plain(key).split(" ");
    while (w.length > 1 && TWIN_DESIGNATORS.has(w[w.length - 1])) w.pop();
    const other = byPlain.get(w.join(" "));
    if (!other || other === key) continue;
    const a = data.producerLookup[key], b = data.producerLookup[other];
    const ea = estateOf(key), eb = estateOf(other);
    if (a.regionId !== b.regionId || !ea || !eb || ea.id === eb.id) continue;
    const keyWins = (ea.reviewCount || 0) > (eb.reviewCount || 0)
      || ((ea.reviewCount || 0) === (eb.reviewCount || 0) && key.length > other.length);
    if (keyWins) twins.set(other, key); else twins.set(key, other);
  }
  return twins;
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
