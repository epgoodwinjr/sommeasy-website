import wineUnified from "./wineUnified.json";
// The .js extension keeps this importable by plain node (the test suites
// load the real module through the alias loader)
import { composeIdentity } from "./identityEngine.js";

const { countries: COUNTRIES, regions: REGIONS, producers: PRODUCERS, varietals: VARIETALS } = wineUnified;

// ═══════════════════════════════════════════════════════
// WINE RECOMMENDATIONS — hand-curated editorial picks
// IDs match wineUnified.json (generated from WineMag 130k)
// ═══════════════════════════════════════════════════════

const WINE_RECS = {
  combos: [
    { regions: ["bordeaux"], varietals: ["cabernet_sauvignon", "merlot"], wine: "Château Léoville-Las Cases, Saint-Julien", why: "Classic Left Bank Bordeaux — structured Cab-Merlot blend from one of the Super Seconds" },
    { regions: ["bordeaux"], varietals: ["merlot"], wine: "Château Le Pin, Pomerol", why: "Right Bank Pomerol — Merlot-dominant and velvety" },
    { regions: ["burgundy"], varietals: ["pinot_noir"], wine: "Domaine Dujac, Morey-Saint-Denis", why: "Elegant Burgundian Pinot with terroir-driven complexity" },
    { regions: ["burgundy"], varietals: ["chardonnay"], wine: "Domaine Roulot, Meursault", why: "Precise, mineral-driven white Burgundy" },
    { regions: ["napa_valley"], varietals: ["cabernet_sauvignon"], wine: "Dunn Vineyards, Howell Mountain", why: "Mountain-grown Napa Cab with serious aging potential" },
    { regions: ["napa_valley", "sonoma"], varietals: ["pinot_noir"], wine: "Littorai, Sonoma Coast Pinot Noir", why: "Cool-climate California Pinot with Burgundian restraint" },
    { regions: ["willamette_valley"], varietals: ["pinot_noir"], wine: "Cristom Vineyards, Eola-Amity Hills", why: "Oregon Pinot at its finest — pure, site-driven, age-worthy" },
    { regions: ["barossa"], varietals: ["syrah"], wine: "Henschke Hill of Grace", why: "Australia's most iconic single-vineyard Shiraz" },
    { regions: ["rhone_valley"], varietals: ["syrah"], wine: "Jean-Louis Chave, Hermitage", why: "Northern Rhône benchmark — Syrah doesn't get more profound" },
    { regions: ["rhone_valley"], varietals: ["grenache"], wine: "Château Rayas, Châteauneuf-du-Pape", why: "Southern Rhône legend — pure Grenache, hauntingly good" },
    { regions: ["rioja"], varietals: ["tempranillo"], wine: "Artadi, Viña El Pisón", why: "Modern Rioja from old vines — Tempranillo at its most expressive" },
    { regions: ["tuscany"], varietals: ["sangiovese"], wine: "Montevertine, Le Pergole Torte", why: "Pure Sangiovese outside the rules — a cult favorite" },
    { regions: ["piedmont"], varietals: ["nebbiolo"], wine: "Roagna, Barolo Pira", why: "Traditional Barolo from one of the great old-guard families" },
    { regions: ["stellenbosch"], varietals: ["cabernet_sauvignon", "pinotage"], wine: "Kanonkop, Paul Sauer", why: "South Africa's answer to a Bordeaux blend" },
    { regions: ["constantia"], varietals: [], wine: "Constantia Glen Five", why: "One of Constantia's finest Bordeaux-style blends" },
    { regions: ["mendoza"], varietals: ["malbec"], wine: "Zuccardi, Finca Piedra Infinita", why: "High-altitude Mendoza Malbec with incredible depth" },
    { regions: ["marlborough"], varietals: ["sauvignon_blanc"], wine: "Greywacke, Wild Sauvignon", why: "From Cloudy Bay's founding winemaker — Marlborough Sauv Blanc with texture" },
    { regions: ["mosel"], varietals: ["riesling"], wine: "Joh. Jos. Prüm, Wehlener Sonnenuhr Spätlese", why: "Benchmark Mosel Riesling — precision, sweetness, electricity" },
    { regions: ["swartland"], varietals: ["syrah", "chenin_blanc"], wine: "The Sadie Family, Columella", why: "South Africa's most acclaimed red — Swartland Syrah-Mourvèdre" },
    { regions: ["priorat"], varietals: ["grenache"], wine: "Álvaro Palacios, L'Ermita", why: "Old-vine Garnacha from steep Priorat slopes" },
    { regions: ["douro"], varietals: [], wine: "Niepoort, Charme", why: "Modern Douro red — Portuguese elegance with serious structure" },
    { regions: ["champagne"], varietals: ["chardonnay", "pinot_noir"], wine: "Krug, Grande Cuvée", why: "The pinnacle of Champagne — richness, complexity, and power" },
    { regions: ["alsace"], varietals: ["riesling", "gewurztraminer"], wine: "Domaine Weinbach, Grand Cru Schlossberg", why: "Alsatian terroir at its most crystalline" },
    { regions: ["loire_valley"], varietals: ["chenin_blanc", "sauvignon_blanc"], wine: "Domaine Huet, Le Haut-Lieu Sec, Vouvray", why: "Loire Chenin at its most complex — biodynamic pioneer" },
    { regions: ["beaujolais"], varietals: ["grenache"], wine: "Marcel Lapierre, Morgon", why: "The natural wine movement started here — pure Gamay perfection" },
  ],
  byVarietal: {
    cabernet_sauvignon: { wine: "Ridge, Monte Bello", why: "One of California's greatest Cab blends — structure and longevity" },
    pinot_noir: { wine: "Felton Road, Block 5, Central Otago", why: "New Zealand Pinot Noir with silky purity" },
    syrah: { wine: "Torbreck, RunRig, Barossa Valley", why: "Massive but balanced Barossa Shiraz-Viognier" },
    merlot: { wine: "Duckhorn, Three Palms Vineyard, Napa", why: "The wine that proved Merlot belongs in Napa" },
    malbec: { wine: "Catena Zapata, Adrianna Vineyard Malbec", why: "High-altitude Argentine Malbec at its peak" },
    tempranillo: { wine: "Vega Sicilia, Único, Ribera del Duero", why: "Spain's most legendary red — Tempranillo royalty" },
    sangiovese: { wine: "Biondi-Santi, Brunello di Montalcino Riserva", why: "The estate that invented Brunello" },
    nebbiolo: { wine: "Giacomo Conterno, Barolo Monfortino", why: "Arguably Italy's greatest wine — Nebbiolo at its most majestic" },
    grenache: { wine: "Domaine du Vieux Télégraphe, Châteauneuf-du-Pape", why: "Southern Rhône benchmark — generous Grenache-based blend" },
    chardonnay: { wine: "Kumeu River, Maté's Vineyard, New Zealand", why: "World-class Chardonnay from an unexpected origin" },
    sauvignon_blanc: { wine: "Didier Dagueneau, Silex, Pouilly-Fumé", why: "The most serious Sauvignon Blanc on earth" },
    riesling: { wine: "Trimbach, Clos Sainte Hune, Alsace", why: "The gold standard for dry Riesling" },
    chenin_blanc: { wine: "Domaine Huet, Le Haut-Lieu Sec, Vouvray", why: "Loire Chenin at its most complex" },
    pinotage: { wine: "Kanonkop, Pinotage, Stellenbosch", why: "South Africa's signature grape from its signature estate" },
    zinfandel: { wine: "Bedrock, Old Vine Zinfandel, Sonoma", why: "Heritage Zin from some of California's oldest vines" },
    viognier: { wine: "Yalumba, The Virgilius, Eden Valley", why: "Australia's best Viognier — floral, rich, structured" },
    albarino: { wine: "Zárate, Albariño, Rías Baixas", why: "Salty, mineral Albariño from a historic Galician estate" },
    gruner_veltliner: { wine: "Nikolaihof, Grüner Veltliner Smaragd, Wachau", why: "Biodynamic Austrian icon — textured and age-worthy" },
    pinot_grigio: { wine: "Alois Lageder, Porer, Alto Adige", why: "Northern Italian Pinot Grigio with actual depth" },
    gewurztraminer: { wine: "Zind-Humbrecht, Grand Cru Hengst", why: "Alsatian Gewürz at its most exotic" },
    semillon: { wine: "Brokenwood, ILR Reserve Semillon, Hunter Valley", why: "Aged Hunter Valley Semillon — Australia's great white secret" },
    cabernet_franc: { wine: "Olga Raffault, Chinon Les Picasses", why: "Loire Cab Franc with pure varietal expression" },
    mourvedre: { wine: "Domaine Tempier, Bandol Cuvée Classique", why: "Provençal Mourvèdre that defined Bandol" },
  },
  byCountry: {
    france: { wine: "Domaine Weinbach, Riesling Grand Cru Schlossberg", why: "A French region you might not have explored — crystalline Alsatian Riesling" },
    italy: { wine: "COS, Cerasuolo di Vittoria, Sicily", why: "Sicily's only DOCG — a gorgeous, underexplored Italian red" },
    spain: { wine: "Raúl Pérez, Sketch, Rías Baixas", why: "Spain beyond Rioja — barrel-fermented Albariño" },
    us: { wine: "Matthiasson, Napa Valley White", why: "The other side of Napa — a sophisticated, layered white blend" },
    south_africa: { wine: "Mullineux, Schist Syrah, Swartland", why: "If you love SA wines, the Swartland is where the action is" },
    argentina: { wine: "Bodega Chacra, Pinot Noir Barda, Patagonia", why: "Argentina beyond Malbec — Patagonian Pinot with real purity" },
    chile: { wine: "Clos des Fous, Cauquenina, Itata", why: "Chile's exciting new wave — old-vine País from the south" },
    australia: { wine: "Gentle Folk, Vin de Sofa, Adelaide Hills", why: "Australia's natural wine scene — fresh, vibrant, unexpected" },
    new_zealand: { wine: "Pyramid Valley, Angel Flower Pinot Noir", why: "Beyond Marlborough — biodynamic NZ Pinot from a cult producer" },
    portugal: { wine: "Barca Velha, Douro", why: "Portugal's most legendary red — only made in exceptional years" },
    germany: { wine: "Keller, G-Max Riesling, Rheinhessen", why: "Germany's most sought-after dry Riesling" },
    austria: { wine: "F.X. Pichler, Grüner Veltliner Smaragd Kellerberg", why: "Austrian precision at its peak" },
  },
};


// ═══════════════════════════════════════════════════════
// MAIN PROFILE GENERATOR
// ═══════════════════════════════════════════════════════

export function generateDNAProfile(answers) {
  const { countries, regions, estates, varietals, specificWines } = answers;

  // ─── Resolve names from IDs ───
  const countryObjs = countries.map(id => COUNTRIES.find(c => c.id === id)).filter(Boolean);
  const countryNames = countryObjs.map(c => c.name);

  const allRegionIds = Object.values(regions).flat();
  const regionNames = allRegionIds.map(rId => {
    for (const regionList of Object.values(REGIONS)) {
      const f = regionList.find(r => r.id === rId);
      if (f) return f.name;
    }
    return null;
  }).filter(Boolean);

  const allEstateIds = Object.values(estates).flat();
  const estateNames = allEstateIds.map(eId => {
    for (const producerList of Object.values(PRODUCERS)) {
      const f = producerList.find(p => p.id === eId);
      if (f) return f.name;
    }
    return null;
  }).filter(Boolean);

  const varietalNames = varietals.map(id => VARIETALS.find(v => v.id === id)?.name).filter(Boolean);
  const reds = varietals.filter(id => VARIETALS.find(v => v.id === id)?.color === "red");
  const whites = varietals.filter(id => VARIETALS.find(v => v.id === id)?.color === "white");

  // ─── Compose the identity strand (Act III — the archetype engine is
  // retired; the title lives in the archetype column, the emoji column
  // carries a neutral 🧬 until surfaces stop reading it) ───
  const identity = composeIdentity({
    countries, regions, estates, varietals,
    specificWines: specificWines || [],
  });
  const archetype = identity.title;
  const archetypeEmoji = "🧬";
  const narrative = identity.narrative;

  // ─── Build recommendations ───
  const recs = [];
  const used = new Set();
  for (const sw of (specificWines || [])) {
    used.add(sw.toLowerCase().trim());
  }
  function isKnown(wineName) {
    const norm = wineName.toLowerCase().trim();
    for (const s of used) {
      if (s === norm || norm.includes(s) || s.includes(norm)) return true;
    }
    return false;
  }
  // Pass 1: Region + varietal combos (strongest match)
  for (const c of WINE_RECS.combos) {
    if (recs.length >= 20) break;
    const hasR = c.regions.some(r => allRegionIds.includes(r));
    const hasV = c.varietals.length === 0 ? hasR : c.varietals.some(v => varietals.includes(v));
    if (hasR && hasV && !isKnown(c.wine)) { recs.push({ ...c, matchType: "region + grape" }); used.add(c.wine.toLowerCase().trim()); }
  }
  // Pass 2: Varietal-only matches
  for (const vId of varietals) {
    if (recs.length >= 20) break;
    const r = WINE_RECS.byVarietal[vId];
    if (r && !isKnown(r.wine)) { recs.push({ ...r, matchType: "grape" }); used.add(r.wine.toLowerCase().trim()); }
  }
  // Pass 3: Region-only matches
  for (const c of WINE_RECS.combos) {
    if (recs.length >= 20) break;
    const hasR = c.regions.some(r => allRegionIds.includes(r));
    if (hasR && !isKnown(c.wine)) { recs.push({ ...c, matchType: "region" }); used.add(c.wine.toLowerCase().trim()); }
  }
  // Pass 4: Country-level discovery picks
  for (const cId of countries) {
    if (recs.length >= 20) break;
    const r = WINE_RECS.byCountry[cId];
    if (r && !isKnown(r.wine)) { recs.push({ ...r, matchType: "discovery" }); used.add(r.wine.toLowerCase().trim()); }
  }

  return {
    archetype, archetypeEmoji, narrative,
    epithet: identity.epithet, traits: identity.traits, genome: identity.genome,
    countries: countryNames, regions: regionNames, estates: estateNames,
    varietals: varietalNames, specificWines: specificWines || [],
    recommendations: recs.slice(0, 20),
    redCount: reds.length, whiteCount: whites.length,
    raw: { countries, regions, estates, varietals, specificWines },
  };
}
