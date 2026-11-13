// The before/after diff CLAUDE.md prescribes for a matcher change: one
// engine as it was, one as it is, the same corpus through both.
//
//   mkdir -p <before> && git archive <sha> src/lib | tar -x -C <before>
//   node scripts/scan-truth/corpus-diff.mjs <before> [out.json]
//
// TEXT corpus (pasted lines): every producer with its home province, every
// core-name alias, every region spelling (as written and without accents),
// every grape spelling, the pick-lock lists and the scan-truth lists.
// PHOTO corpus (structured wines): every producer's wine as four fields,
// every region / grape / country spelling alone in its field, and the
// captured scans.
//
// Each wine is scored against a palate that holds EVERYTHING, so a score is
// a reading of what was detected. Reads nothing but src/ and the fixtures;
// no network.

import { register } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const REPO = new URL("../../", import.meta.url);
register(new URL("src/lib/__tests__/helpers/alias-loader.mjs", REPO));
const [beforeRoot, outFile] = process.argv.slice(2);
if (!beforeRoot) { console.error("usage: corpus-diff.mjs <before-root> [out.json]"); process.exit(1); }

const after = await import(new URL("src/lib/matchEngine.js", REPO).href);
const before = await import(pathToFileURL(resolve(beforeRoot, "src/lib/matchEngine.js")).href);
const { buildCoreNameAliases } = await import(new URL("src/lib/producerAliases.js", REPO).href);
const u = JSON.parse(readFileSync(new URL("src/lib/wineUnified.json", REPO), "utf8"));
const lock = JSON.parse(readFileSync(new URL("src/lib/__tests__/fixtures/curatePicksLock.json", REPO), "utf8"));
const captured = JSON.parse(readFileSync(new URL("src/lib/__tests__/fixtures/scanTruthCaptured.json", REPO), "utf8"));
const { lists } = JSON.parse(readFileSync(new URL("scripts/scan-truth/lists.json", REPO), "utf8"));

const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const both = (s) => Array.from(new Set([s, fold(s)]));

// A palate that holds everything
const EVERYTHING = {
  countries: u.countries.map((c) => c.id),
  regions: Object.fromEntries(Object.entries(u.regions).map(([c, rs]) => [c, rs.map((r) => r.id)])),
  estates: Object.fromEntries(Object.entries(u.producers).map(([r, ps]) => [r, ps.map((p) => p.id)])),
  varietals: u.varietals.map((v) => v.id),
  specificWines: [],
};

// ─── The corpora ───
const text = new Set();
for (const [key, p] of Object.entries(u.producerLookup)) {
  text.add(key);
  if (p.province) text.add(`${key}, ${p.province}`);
}
for (const [core] of buildCoreNameAliases(u)) text.add(core);
const regionNames = new Set(Object.keys(u.regionLookup));
for (const rs of Object.values(u.regions)) for (const r of rs) { regionNames.add(r.name); for (const part of r.name.split(" / ")) regionNames.add(part.trim()); }
for (const name of regionNames) for (const s of both(name)) { text.add(s); text.add(`Cuvee Test, ${s}`); }
const grapeNames = new Set();
for (const v of u.varietals) { grapeNames.add(v.name); for (const part of v.name.split(" / ")) grapeNames.add(part.trim()); }
for (const syn of Object.keys(u.varietalLookup)) grapeNames.add(syn.replace(/_/g, " "));
for (const name of grapeNames) for (const s of both(name)) text.add(`Cuvee Test ${s}`);
const countryNames = u.countries.map((c) => c.name).concat(["United States", "USA", "U.S.A.", "California", "Oregon", "Washington", "Western Cape", "Central Coast"]);
for (const name of countryNames) text.add(`Cuvee Test, ${name}`);
const fixtureLines = [];
for (const list of Object.values(lock.lists)) fixtureLines.push(...list.split("\n"));
for (const list of Object.values(lists)) for (const section of list.sections) for (const w of section.wines) fixtureLines.push(w.name);
for (const line of fixtureLines) if (line.trim().length > 3) text.add(line.trim());

const photo = [];
const countryName = Object.fromEntries(u.countries.map((c) => [c.id, c.id === "us" ? "USA" : c.name]));
const regionOf = {};
for (const [countryId, rs] of Object.entries(u.regions)) for (const r of rs) regionOf[r.id] = { ...r, countryId };
const grapeName = Object.fromEntries(u.varietals.map((v) => [v.id, v.name.split(" / ")[0]]));
for (const [key, p] of Object.entries(u.producerLookup)) {
  const region = regionOf[p.regionId];
  if (!region || region.countryId !== p.country) continue;
  const estate = (u.producers[p.regionId] || []).find((e) => e.id === p.producerId);
  const grapeId = ((estate && estate.topVarietals) || [])[0] || (region.topVarietals || [])[0];
  if (!grapeId) continue;
  const producer = estate ? estate.name : key;
  photo.push({ name: `${producer} ${grapeName[grapeId]}`, producer, variety: grapeName[grapeId], region: region.name.split(" / ")[0], country: countryName[p.country] });
}
for (const name of regionNames) for (const s of both(name)) photo.push({ name: "Cuvee Test", region: s });
for (const name of grapeNames) for (const s of both(name)) photo.push({ name: "Cuvee Test", variety: s });
for (const name of countryNames) { photo.push({ name: "Cuvee Test", country: name }); photo.push({ name: "Cuvee Test", region: name }); }
for (const scan of Object.values(captured.before)) photo.push(...scan.map((w) => ({ ...w, is_btg: false })));

// ─── Through both engines ───
// The photo entry as MatchList.js built it before entriesFromVision existed
const legacyEntry = (w) => ({
  name: w.name || "", price: 50, originalLine: w.name || "", section: w.section || null, isByTheGlass: false,
  sectionColor: w.color || null, sectionVarietal: null, vintage: w.vintage || null,
  visionData: { color: w.color || null, variety: w.variety || null, region: w.region || null, country: w.country || null, producer: w.producer || null, vintage: w.vintage || null },
});
const reading = (engine, entry) => {
  const s = engine.matchWinesAgainstDNA([entry], EVERYTHING, null).scoredEntries[0];
  return {
    score: s.score,
    regions: s.detectedRegionIds, countries: s.detectedCountryIds, grapes: s.detectedVarietalIds,
    producerId: s.detectedProducerId, color: s.detectedColor,
    reasons: s.matchReasons.map((r) => `${r.type}:${r.weight}`),
    labels: s.matchReasons.map((r) => r.label),
  };
};
const strip = ({ labels, ...rest }) => JSON.stringify(rest);

function diff(label, items, toEntry, show) {
  const changed = [], labelOnly = [];
  let up = 0, down = 0, level = 0;
  for (const item of items) {
    const entry = toEntry(item);
    const b = reading(before, entry), a = reading(after, entry);
    if (strip(b) === strip(a)) {
      if (JSON.stringify(b.labels) !== JSON.stringify(a.labels)) labelOnly.push({ line: show(item), before: b.labels, after: a.labels });
      continue;
    }
    if (a.score > b.score) up++; else if (a.score < b.score) down++; else level++;
    changed.push({ line: show(item), before: b, after: a });
  }
  console.log(`\n${label}: ${items.length} wines — ${changed.length} read differently (${up} score higher, ${down} lower, ${level} the same score); ${labelOnly.length} differ only in a reason's words`);
  return { changed, labelOnly };
}

const textResult = diff("TEXT", [...text], (line) => ({ name: line, price: 50, originalLine: line }), (line) => line);
const photoResult = diff("PHOTO", photo, legacyEntry, (w) => JSON.stringify({ name: w.name, producer: w.producer, variety: w.variety, region: w.region, country: w.country }));

const lower = (r) => r.changed.filter((c) => c.after.score < c.before.score);
for (const [label, r] of [["TEXT", textResult], ["PHOTO", photoResult]]) {
  console.log(`\n${label} — every wine that scores LOWER (${lower(r).length}):`);
  for (const c of lower(r)) console.log(`  ${c.line}\n     before ${strip(c.before)}\n     after  ${strip(c.after)}`);
}
if (outFile) {
  writeFileSync(outFile, JSON.stringify({ text: textResult, photo: photoResult }, null, 1) + "\n");
  console.log("\nwrote", outFile);
}
