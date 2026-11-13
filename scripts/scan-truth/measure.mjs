// The real failures, before and after: how many wines each list × palate
// reads, leaves out, scores, matches and picks — photographed (the captured
// replies of the real route) and pasted (the same page as text).
//
//   mkdir -p <before> && git archive <sha> src/lib | tar -x -C <before>
//   node scripts/scan-truth/measure.mjs <before>
//
// "before" = the engine at <sha> reading what the route returned under the
// prompt of that day (fixtures/scanTruthCaptured.json, `before`), mapped as
// MatchList.js mapped it then. "after" = today's engine, today's captures,
// entriesFromVision. The two middle rows separate the causes. No network.

import { register } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const REPO = new URL("../../", import.meta.url);
register(new URL("src/lib/__tests__/helpers/alias-loader.mjs", REPO));
const [beforeRoot] = process.argv.slice(2);
if (!beforeRoot) { console.error("usage: measure.mjs <before-root>"); process.exit(1); }

const after = await import(new URL("src/lib/matchEngine.js", REPO).href);
const before = await import(pathToFileURL(resolve(beforeRoot, "src/lib/matchEngine.js")).href);
const captured = JSON.parse(readFileSync(new URL("src/lib/__tests__/fixtures/scanTruthCaptured.json", REPO), "utf8"));
const { lists, palates, headings } = JSON.parse(readFileSync(new URL("scripts/scan-truth/lists.json", REPO), "utf8"));

// The photo entry as MatchList.js built it before entriesFromVision existed
const legacyEntries = (wines) => wines.map((w) => ({
  name: w.name || "", price: typeof w.price === "number" ? w.price : null, originalLine: w.name || "", section: w.section || null,
  isByTheGlass: w.is_btg || false, sectionColor: w.color || null, sectionVarietal: null, vintage: w.vintage || null,
  visionData: { color: w.color || null, variety: w.variety || null, region: w.region || null, country: w.country || null, producer: w.producer || null, vintage: w.vintage || null },
}));

function analyze(engine, entries, profile) {
  const dna = { countries: profile.countries, regions: profile.regions, estates: profile.estates, varietals: profile.varietals, specificWines: profile.specific_wines || [] };
  const { scoredEntries, userDNA } = engine.matchWinesAgainstDNA(entries, dna, null);
  const matched = scoredEntries.filter((e) => e.score > 0);
  const picks = engine.curatePicks(scoredEntries, {
    minPrice: null, maxPrice: null, colorPreference: "all", maxPicks: engine.getPickCount(entries.length, "all"),
    menuContext: engine.buildMenuContext(matched), userDNA,
  });
  const total = Math.round(scoredEntries.reduce((sum, e) => sum + e.score, 0) * 10) / 10;
  return `${String(entries.length).padStart(4)} read ${String(entries.length - scoredEntries.length).padStart(4)} left out ${String(scoredEntries.length).padStart(4)} scored ${String(matched.length).padStart(4)} matched ${String(picks.length).padStart(3)} picks   (scores total ${total})`;
}

// The page as text: a heading, then "name   13   52" or "name 13 / 52"
function asText(list, heading) {
  const lines = [heading];
  if (list.priceStyle === "columns") lines.push("GLASS    BOTTLE");
  for (const section of list.sections) {
    lines.push("", section.name);
    for (const w of section.wines) {
      lines.push("price" in w ? `${w.name} ${w.price}`
        : list.priceStyle === "columns" ? `${w.name}    ${w.glass}    ${w.bottle}` : `${w.name} ${w.glass} / ${w.bottle}`);
    }
  }
  return lines.join("\n");
}

for (const [key, palate] of Object.entries(palates)) {
  const list = lists[palate.list];
  console.log(`\n═══ ${palate.list} — ${key}: ${palate.about}`);
  for (const [variant, heading] of Object.entries(headings)) {
    const scan = `${palate.list}-${variant}`;
    console.log(`  photographed under "${heading}"`);
    console.log(`    before (old prompt, old engine)   ${analyze(before, legacyEntries(captured.before[scan]), palate.profile)}`);
    console.log(`    old prompt, new engine            ${analyze(after, after.entriesFromVision(captured.before[scan]), palate.profile)}`);
    console.log(`    new prompt, old engine            ${analyze(before, legacyEntries(captured.after[scan]), palate.profile)}`);
    console.log(`    after  (new prompt, new engine)   ${analyze(after, after.entriesFromVision(captured.after[scan]), palate.profile)}`);
    const text = asText(list, heading);
    console.log(`  pasted under "${heading}"`);
    console.log(`    before                            ${analyze(before, before.parseWineList(text), palate.profile)}`);
    console.log(`    after                             ${analyze(after, after.parseWineList(text), palate.profile)}`);
  }
}

console.log(`\n═══ mixed (the control) — aug8's palate`);
console.log(`    before (old prompt, old engine)   ${analyze(before, legacyEntries(captured.before.mixed), palates.aug8.profile)}`);
console.log(`    after  (new prompt, new engine)   ${analyze(after, after.entriesFromVision(captured.after.mixed), palates.aug8.profile)}`);
