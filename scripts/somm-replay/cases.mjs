// The Somm replay's cases: the lists, two palates, and the payload for each —
// built with the REAL engine modules exactly as src/app/recommend/MatchList.js
// builds them (analyzeEntries → askTheSomm). Nothing here reads a database:
// the test account's palate below is a frozen snapshot.
//
//   node scripts/somm-replay/cases.mjs        the shape of every case (free)

import { register } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

// The same resolve hook the unit suites use ("@/", next/server, JSON imports)
register("../../src/lib/__tests__/helpers/alias-loader.mjs", import.meta.url);

export const REPO = new URL("../../", import.meta.url);
const at = (path) => new URL(path, REPO).href;

const engine = await import(at("src/lib/matchEngine.js"));
const { buildSommPayload } = await import(at("src/lib/sommPicks.js"));

// ─── Palates ───

// The rich e2e account's profile and rated rows as they stood on Nov 12,
// 2026 — the fields the page reads, copied once. Not read live.
export const E2E_PALATE = {
  profile: {
    archetype: "The South African Curator",
    narrative:
      "Your palate leads with South Africa. From Stellenbosch and Burgundy, you've marked out territory, not just taste. You keep a short list and you keep it honest — every name on it earned its place. The Somm reads all of this before picking your glass — that's the point of it.",
    countries: ["south_africa", "france"],
    regions: { france: ["burgundy"], south_africa: ["stellenbosch"] },
    estates: { stellenbosch: ["kanonkop"] },
    varietals: ["pinot_noir", "chardonnay", "chenin_blanc"],
    specific_wines: [],
  },
  rated: [
    { wine_name: "Domaine Huet, Le Haut-Lieu Sec, Vouvray", rating: "liked", interaction_type: "had", resolved_varietal: null, resolved_region: "vouvray" },
    { wine_name: "Kumeu River, Maté's Vineyard, New Zealand", rating: "loved", interaction_type: "had", resolved_varietal: null, resolved_region: null },
    { wine_name: "Domaine Roulot, Meursault", rating: "liked", interaction_type: "had", resolved_varietal: null, resolved_region: "meursault" },
  ],
};

// A second, broader palate, so "would this hit a real user" isn't judged on
// one narrow DNA. Made up; the ids are real wineUnified ids.
export const BROAD_PALATE = {
  profile: {
    archetype: "The Rhône Wanderer",
    narrative: "You follow Syrah and Grenache wherever they lead, with a soft spot for Italian reds and a crisp white to start.",
    countries: ["france", "italy", "us", "spain"],
    regions: { france: ["rhone_valley", "burgundy"], italy: ["tuscany", "piedmont"], us: ["california"] },
    estates: {},
    varietals: ["syrah", "grenache", "sangiovese", "nebbiolo", "sauvignon_blanc", "cabernet_sauvignon"],
    specific_wines: [],
  },
  rated: [],
};

// ─── Lists ───

export const LISTS = {
  // e2e: evidence-ledger.spec / wine-lists.spec single line
  e2e_1wine_kanonkop: "Kanonkop Pinotage, Stellenbosch 2019...$68",
  // e2e: table-verdict.spec GUARD_LINE
  e2e_1wine_kenforrester: "Ken Forrester Old Vine Chenin Blanc, Stellenbosch 2021...$38",
  // e2e: identity-shift.spec GUARD_LINE
  e2e_1wine_dujac: "Domaine Dujac Clos de la Roche 2019...$95",
  // e2e: table-verdict.spec TWO_LINES
  e2e_2wine: "Meerlust Rubicon, Stellenbosch 2018...$92\nHamilton Russell Pinot Noir, Walker Bay 2020...$85",
  // e2e: wine-lists.spec "Pasted wine list produces picks"
  e2e_6wine: `WHITES
Cloudy Bay Sauvignon Blanc, Marlborough 2022...$52
Trimbach Riesling, Alsace 2021...$44
Cakebread Chardonnay, Napa Valley 2021...$72

REDS
Kanonkop Pinotage, Stellenbosch 2019...$68
Catena Zapata Malbec, Mendoza 2020...$58
Ridge Monte Bello, Santa Cruz Mountains 2019...$250`,
  // e2e: wine-lists.spec KNOWN_GOOD_LIST
  e2e_7wine: `REDS
Kanonkop Paul Sauer, Stellenbosch 2019...$85
Torbreck RunRig Shiraz, Barossa 2016...$185
Penfolds Grange Shiraz 2017...$240
Catena Zapata Malbec, Mendoza 2020...$58
Joseph Drouhin Gevrey-Chambertin 2019...$120

WHITES
Cloudy Bay Sauvignon Blanc, Marlborough 2022...$52
Trimbach Riesling, Alsace 2021...$44`,
  // e2e: winelist-sample.pdf's text (e2e/fixtures/generate-fixtures.py), read
  // here by the text parser. The app sends this PDF through Vision — that
  // shape is VISION_PDF below.
  e2e_pdf_sample: `SAMPLE WINE LIST — BY THE BOTTLE

RED WINES
Kanonkop Paul Sauer, Stellenbosch 2019 ... 85
Penfolds Grange Shiraz, Barossa 2017 ... 240
Gaja Barbaresco, Piedmont 2018 ... 195
Catena Zapata Malbec, Mendoza 2018 ... 78

WHITE WINES
Trimbach Pinot Gris, Alsace 2020 ... 55
Santa Margherita Pinot Grigio 2022 ... 42

BY THE GLASS
House Red ... 12
House White ... 11`,
  // The app's own "Try an example list" (MatchList.js loadExample)
  example: `WHITES
Cloudy Bay Sauvignon Blanc, Marlborough 2022............$52
Domaine William Fèvre Chablis Premier Cru 2021.........$78
Trimbach Riesling, Alsace 2021..........................$44
Cakebread Chardonnay, Napa Valley 2021.................$72
Jordan Chardonnay, Russian River Valley 2021...........$64
Ken Forrester Old Vine Chenin Blanc, Stellenbosch......$38
Sancerre, Domaine Vacheron 2022........................$62

REDS
Hamilton Russell Pinot Noir, Walker Bay 2020...........$85
Kanonkop Pinotage, Stellenbosch 2019...................$68
Meerlust Rubicon, Stellenbosch 2018....................$92
Catena Zapata Malbec, Mendoza 2020.....................$58
Penfolds Bin 389 Cabernet Shiraz, South Australia......$74
Ridge Monte Bello, Santa Cruz Mountains 2019..........$250
Domaine de la Côte-Rôtie, E. Guigal 2019.............$115
Boekenhoutskloof Syrah, Swartland 2020.................$72
Château Lynch-Bages, Pauillac 2018....................$185
Viña Almaviva, Puente Alto 2019.......................$165
Marchesi Antinori Tignanello 2019.....................$145
Vega Sicilia Unico, Ribera del Duero 2012.............$350
Pommard Premier Cru, Domaine de Courcel 2019..........$132
Central Otago Pinot Noir, Felton Road 2021.............$95
Barolo, Giacomo Conterno 2018.........................$210`,
  // A realistic 40-bottle neighbourhood-restaurant list
  realistic40: `SPARKLING
Roederer Estate Brut, Anderson Valley NV...$62
Graham Beck Brut Rosé, Western Cape NV...$54
Pierre Gimonnet Blanc de Blancs 1er Cru, Champagne NV...$110
Veuve Clicquot Yellow Label, Champagne NV...$125

WHITE
Domaine Huet Le Mont Sec, Vouvray 2021...$68
Mullineux Old Vines White, Swartland 2021...$58
Raats Original Chenin Blanc, Stellenbosch 2022...$44
Domaine Vacheron Sancerre 2022...$72
Dog Point Sauvignon Blanc, Marlborough 2022...$48
Louis Michel Chablis 2021...$66
Domaine Roulot Bourgogne Blanc 2020...$120
Hamilton Russell Chardonnay, Hemel-en-Aarde 2021...$88
Kistler Les Noisetiers Chardonnay, Sonoma Coast 2021...$135
Dönnhoff Riesling Kabinett, Nahe 2021...$56
Pieropan Soave Classico 2022...$40
Terlano Pinot Grigio, Alto Adige 2022...$46
Do Ferreiro Albariño, Rías Baixas 2022...$52
Zind-Humbrecht Gewurztraminer, Alsace 2020...$64

ROSÉ
Domaine Tempier Bandol Rosé 2022...$85
Château d'Esclans Whispering Angel, Provence 2022...$54

RED
Domaine Dujac Morey-Saint-Denis 2019...$165
Joseph Drouhin Chorey-lès-Beaune 2020...$74
Felton Road Bannockburn Pinot Noir, Central Otago 2021...$98
Hamilton Russell Pinot Noir, Hemel-en-Aarde 2021...$92
Cristom Mt. Jefferson Cuvée Pinot Noir, Willamette Valley 2021...$78
Kanonkop Pinotage, Stellenbosch 2019...$68
Meerlust Rubicon, Stellenbosch 2018...$92
Boekenhoutskloof Syrah, Swartland 2020...$84
E. Guigal Côtes du Rhône 2020...$42
Domaine du Vieux Télégraphe Châteauneuf-du-Pape 2019...$145
Jean-Louis Chave Sélection Offerus, Saint-Joseph 2020...$76
Château Lynch-Bages, Pauillac 2016...$280
Château Gloria, Saint-Julien 2018...$115
Ridge Geyserville Zinfandel, Alexander Valley 2021...$82
Caymus Cabernet Sauvignon, Napa Valley 2021...$160
Catena Zapata Malbec Argentino, Mendoza 2019...$130
Marqués de Murrieta Rioja Reserva 2018...$64
Fontodi Chianti Classico 2020...$70
Produttori del Barbaresco, Barbaresco 2019...$96
Penfolds Bin 389 Cabernet Shiraz, South Australia 2020...$118`,
  // Six bottles whose prices didn't parse
  unpriced6: `Kanonkop Pinotage, Stellenbosch 2019
Meerlust Rubicon, Stellenbosch 2018
Hamilton Russell Pinot Noir, Hemel-en-Aarde 2021
Raats Original Chenin Blanc, Stellenbosch 2022
Joseph Drouhin Chorey-lès-Beaune 2020
Domaine Dujac Morey-Saint-Denis 2019`,
};

// winelist-sample.pdf as Path A delivers it: structured wines from Vision
// (MatchList.js maps them to entries; this is that mapping's input)
const VISION_PDF = [
  ["Kanonkop Paul Sauer", 85, "red", "Bordeaux Blend", "Stellenbosch", "South Africa", "Kanonkop", "2019", "Red Wines"],
  ["Penfolds Grange Shiraz", 240, "red", "Shiraz", "Barossa", "Australia", "Penfolds", "2017", "Red Wines"],
  ["Gaja Barbaresco", 195, "red", "Nebbiolo", "Piedmont", "Italy", "Gaja", "2018", "Red Wines"],
  ["Catena Zapata Malbec", 78, "red", "Malbec", "Mendoza", "Argentina", "Catena Zapata", "2018", "Red Wines"],
  ["Trimbach Pinot Gris", 55, "white", "Pinot Gris", "Alsace", "France", "Trimbach", "2020", "White Wines"],
  ["Santa Margherita Pinot Grigio", 42, "white", "Pinot Grigio", null, "Italy", "Santa Margherita", "2022", "White Wines"],
  ["House Red", 12, "red", null, null, null, null, null, "By the Glass", true],
  ["House White", 11, "white", null, null, null, null, null, "By the Glass", true],
].map(([name, price, color, variety, region, country, producer, vintage, section, btg = false]) => ({
  name, price, originalLine: name, section, isByTheGlass: btg, sectionColor: color, sectionVarietal: null, vintage,
  visionData: { color, variety, region, country, producer, vintage },
}));

// ─── Payloads ───

/** Exactly the page's path: score → curate → the Somm's payload. `eng` is the
 *  match engine to score with (today's, unless a case replays an older one). */
function payloadFor(entries, { palate = E2E_PALATE, min = null, max = null, color = "all", steer = null, eng = engine } = {}) {
  const { profile, rated } = palate;
  const dna = {
    countries: profile.countries || [],
    regions: profile.regions || {},
    estates: profile.estates || {},
    varietals: profile.varietals || [],
    specificWines: profile.specific_wines || [],
  };
  const feedback = rated.length > 0 ? eng.buildFeedbackSignals(rated) : null;
  const { scoredEntries: scored, userDNA } = eng.matchWinesAgainstDNA(entries, dna, feedback);
  const matched = scored.filter((e) => e.score > 0);
  const asked = eng.getPickCount(entries.length, color);
  const curated = eng.curatePicks(scored, {
    minPrice: min, maxPrice: max, colorPreference: color, maxPicks: asked,
    menuContext: eng.buildMenuContext(matched), userDNA,
  });
  const payload = buildSommPayload({
    scoredEntries: scored,
    algorithmicPicks: curated,
    pickCount: asked,
    profile,
    ratedInteractions: rated,
    totalParsed: entries.length,
    budget: { min, max },
    color: color === "all" ? null : color,
    steer,
    display: { varietal: eng.getVarietalDisplayName, region: eng.getRegionDisplayName, country: eng.getCountryName },
  });
  return {
    payload,
    shape: {
      parsed: entries.length, matched: matched.length, enginePicks: curated.length,
      candidates: payload.candidates.length,
      asked,                         // what the page's pick count says (never under 5)
      pickCount: payload.pickCount,  // what the Somm is actually asked for
    },
  };
}

const text = (list, opts) => () => payloadFor(engine.parseWineList(LISTS[list]), opts);

/** The 7-wine list as the engine scored it before the Oct 30, 2026 resolver
 *  change (six candidates, not seven) — the payload that retried 18 of 18
 *  times in the ledger. The old engine is read out of git into results/. */
const OLD_ENGINE_COMMIT = "033dd1c^";
async function oldEngine7() {
  const dir = new URL("./results/.old-engine/", import.meta.url);
  const file = new URL("src/lib/matchEngine.js", dir);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("sh", ["-c",
      `git -C "${fileURLToPath(REPO)}" archive ${OLD_ENGINE_COMMIT} src/lib/matchEngine.js src/lib/wineUnified.json | tar -x -C "${fileURLToPath(dir)}"`]);
  }
  const old = await import(file.href);
  return payloadFor(old.parseWineList(LISTS.e2e_7wine), { eng: old });
}

/** Six candidates with no price, under a budget, five asked. The page can't
 *  send this — buildSommPayload drops unpriced wines from the slate — so the
 *  payload is built as a caller that KEEPS them would: the real engine's
 *  scores and reasons, the price withheld. It is here because the route
 *  can't assume its caller, and its clamp once answered this with silence. */
function unpricedUnderBudget() {
  const entries = engine.parseWineList(LISTS.unpriced6).map((e) => ({ ...e, price: 1 }));
  const built = payloadFor(entries, { max: 60 });
  for (const c of built.payload.candidates) c.price = null;
  built.payload.pickCount = 5;
  built.shape.pickCount = 5;
  return built;
}

/** label → () => { payload, shape }. The first 18 are the Nov 12, 2026
 *  diagnosis's ninety runs (five each); the rest were added since. */
export const CASES = [
  ["e2e_1wine_kanonkop", text("e2e_1wine_kanonkop")],
  ["e2e_1wine_kenforrester", text("e2e_1wine_kenforrester")],
  ["e2e_1wine_dujac", text("e2e_1wine_dujac")],
  ["e2e_2wine", text("e2e_2wine")],
  ["e2e_6wine", text("e2e_6wine")],
  ["e2e_7wine", text("e2e_7wine")],
  ["e2e_pdf_sample", text("e2e_pdf_sample")],
  ["example", text("example")],
  ["example/broad", text("example", { palate: BROAD_PALATE })],
  ["realistic40", text("realistic40")],
  ["realistic40/broad", text("realistic40", { palate: BROAD_PALATE })],
  ["realistic40 white", text("realistic40", { color: "white" })],
  ["realistic40 max$60", text("realistic40", { max: 60 })],
  ["realistic40 max$50", text("realistic40", { max: 50 })],
  ["realistic40 red max$80", text("realistic40", { color: "red", max: 80 })],
  ["realistic40/broad red max$80", text("realistic40", { color: "red", max: 80, palate: BROAD_PALATE })],
  ["e2e_7wine (pre-Oct-30 engine)", oldEngine7],
  ["e2e_pdf_sample (Vision path)", () => payloadFor(VISION_PDF)],
  // The terms rule (Nov 12, 2026): a budget one wine fits, and one none do
  ["realistic40 max$41", text("realistic40", { max: 41 })],
  ["realistic40 max$39 (lone splurge)", text("realistic40", { max: 39 })],
  ["unpriced x6 max$60 (direct caller)", unpricedUnderBudget],  // labels carry no commas: --only splits on them
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("case".padEnd(38), "parsed matched engine-picks candidates  page-asks → Somm-asked");
  for (const [label, build] of CASES) {
    let s;
    try { s = (await build()).shape; } catch (err) { console.log(label.padEnd(38), `— could not build: ${err.message.split("\n")[0]}`); continue; }
    console.log(
      label.padEnd(38), String(s.parsed).padStart(6), String(s.matched).padStart(7), String(s.enginePicks).padStart(12),
      String(s.candidates).padStart(10), `${String(s.asked).padStart(10)} → ${s.pickCount}`
    );
  }
}
