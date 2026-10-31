// MIRROR of src/lib/producerAliases.js for the CJS mirror sections of
// countryAttribution.test.js and dnaEvolution.test.js, which build their
// indexes synchronously at load. countryAttribution's real-module section
// asserts this mirror and the real module build the identical alias table
// over all of wineUnified.json — change one, change both.

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

function producerCoreName(name) {
  const words = name.trim().split(/\s+/);
  let start = 0;
  let end = words.length;
  while (end - start > 1 && LEADING_DESIGNATORS.has(words[start])) start++;
  while (end - start > 1 && TRAILING_DESIGNATORS.has(words[end - 1])) end--;
  if (end - start < 2 || (start === 0 && end === words.length)) return null;
  const first = words[start];
  if (start > 0 && (PREPOSITIONS.has(first) || /^d['’]/.test(first))) return null;
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

function buildCoreNameAliases({ producerLookup, regionLookup, regions, countries, varietals, varietalLookup }) {
  const producerNames = Object.keys(producerLookup);
  const placeAndGrapeTerms = [
    ...Object.keys(regionLookup),
    ...Object.values(regions).flat().map((r) => r.name.toLowerCase()),
    ...countries.map((c) => c.name.toLowerCase()),
    ...varietals.flatMap((v) => v.name.toLowerCase().split("/")),
    ...Object.keys(varietalLookup).map((s) => s.toLowerCase().replace(/_/g, " ")),
  ];

  const owners = new Map();
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

module.exports = { producerCoreName, buildCoreNameAliases };
