// MIRROR of src/lib/producerAliases.js (foldInitials, includesWord, the
// alias table, the producer twins, the short-name guard) for the CJS mirror sections of
// countryAttribution.test.js and dnaEvolution.test.js, which build their
// indexes synchronously at load. countryAttribution's real-module section
// asserts this mirror and the real module build the identical alias table
// and short-name guard over all of wineUnified.json — change one, change both.

// Initials in one spelling ("g.d."/"g. d."/"g d"/"gd" -> "gd"); a lone
// letter with no dot is a word. Punctuation may end a run ("s.l.,")
const INITIALS = /^((?:\p{L}\.)+\p{L}?|\p{L})([,;:)\]]*)$/u;
function foldInitials(text) {
  const parts = String(text).split(/(\s+)/);
  let out = "";
  for (let i = 0; i < parts.length;) {
    let j = i, letters = "", tail = "", dotted = false;
    for (let m; j < parts.length && !tail && (m = INITIALS.exec(parts[j])); j += 2) {
      letters += m[1].replace(/\./g, "");
      if (m[1].includes(".")) dotted = true;
      tail = m[2];
    }
    if (j > i && (dotted || letters.length > 1)) { out += letters + tail + (parts[j - 1] ?? ""); i = j; }
    else { out += parts[i] + (parts[i + 1] ?? ""); i += 2; }
  }
  return out;
}

// A term as words: no letter or digit touching either end
function includesWord(text, term) {
  if (!term) return false;
  for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + 1)) {
    if (!/[\p{L}\p{N}]/u.test(text[at - 1] || "") && !/[\p{L}\p{N}]/u.test(text[at + term.length] || "")) return true;
  }
  return false;
}

const LEADING_DESIGNATORS = new Set([
  "château", "chateau", "châteaux", "chateaux", "domaine", "domaines",
  "bodega", "bodegas", "finca", "tenuta", "tenute", "cantina", "cantine",
  "fattoria", "azienda", "casa", "maison",
]);
const TRAILING_DESIGNATORS = new Set([
  "vineyard", "vineyards", "winery", "wineries", "wine", "wines",
  "estate", "estates", "cellar", "cellars",
]);
const PREPOSITIONS = new Set([
  "de", "du", "des", "di", "da", "do", "dos", "das", "del", "della", "delle",
  "dello", "dei", "degli", "of", "y", "e", "et", "and", "&",
]);
const isPreposition = (word) => PREPOSITIONS.has(word) || /^d['’]/.test(word);

function producerCoreName(name) {
  const words = name.trim().split(/\s+/);
  let start = 0;
  let end = words.length;
  while (end - start > 1 && LEADING_DESIGNATORS.has(words[start])) start++;
  while (end - start > 1 && TRAILING_DESIGNATORS.has(words[end - 1])) end--;
  if (end - start < 2 || (start === 0 && end === words.length)) return null;
  if (start > 0 && isPreposition(words[start])) return null;
  return words.slice(start, end).join(" ");
}

function words(text) {
  return text.split(/[\s,;:()/\-–—.'’]+/).filter(Boolean);
}

function eachWordRun(text, fn) {
  const w = words(text);
  for (let i = 0; i < w.length; i++) {
    for (let j = i + 1; j <= w.length; j++) fn(w.slice(i, j).join(" "));
  }
}

function placeAndGrapeNames({ regionLookup, regions, countries, varietals, varietalLookup }) {
  return [
    ...Object.keys(regionLookup),
    ...Object.values(regions).flat().map((r) => r.name.toLowerCase()),
    ...countries.map((c) => c.name.toLowerCase()),
    ...varietals.flatMap((v) => v.name.toLowerCase().split("/")),
    ...Object.keys(varietalLookup).map((s) => s.toLowerCase().replace(/_/g, " ")),
  ];
}

function buildCoreNameAliases(data) {
  const producerNames = Object.keys(data.producerLookup);
  const placeAndGrapeTerms = placeAndGrapeNames(data);
  const folded = new Map(producerNames.map((name) => [name, foldInitials(name)]));

  const owners = new Map();
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

// One winery keyed twice: same name once initials fold and designators
// (and "family") go, same region, each with its own estate -> the twin with
// more reviews (then the longer name) is canonical
const TWIN_DESIGNATORS = new Set([...TRAILING_DESIGNATORS, "family"]);
function buildProducerTwins(data) {
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

function buildShortNameGuard(data, norm) {
  const placeRuns = new Set();
  for (const term of placeAndGrapeNames(data)) eachWordRun(norm(term), (run) => placeRuns.add(run));
  const isPlace = (text) => placeRuns.has(words(text).join(" "));
  return (short, full) => {
    if (isPlace(short)) return true;
    const w = short.split(" ");
    if (w[0] === full.split(" ")[0] || !isPreposition(w[0])) return false;
    let i = 0;
    while (i < w.length - 1 && (PREPOSITIONS.has(w[i]) || ARTICLES.has(w[i]))) i++;
    return isPlace(w.slice(i).join(" ").replace(/^[dl]['’]/, ""));
  };
}

module.exports = { producerCoreName, buildCoreNameAliases, buildShortNameGuard, buildProducerTwins, foldInitials, includesWord };
