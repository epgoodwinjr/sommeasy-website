import { COUNTRIES, REGIONS, ESTATES, VARIETALS } from "./wineData";

const WINE_RECS = {
  combos: [
    { regions: ["bordeaux"], varietals: ["cabernet_sauvignon", "merlot"], wine: "Château Léoville-Las Cases, Saint-Julien", why: "Classic Left Bank Bordeaux — structured Cab-Merlot blend from one of the Super Seconds" },
    { regions: ["bordeaux"], varietals: ["merlot"], wine: "Château Le Pin, Pomerol", why: "Right Bank Pomerol — Merlot-dominant and velvety" },
    { regions: ["burgundy"], varietals: ["pinot_noir"], wine: "Domaine Dujac, Morey-Saint-Denis", why: "Elegant Burgundian Pinot with terroir-driven complexity" },
    { regions: ["burgundy"], varietals: ["chardonnay"], wine: "Domaine Roulot, Meursault", why: "Precise, mineral-driven white Burgundy" },
    { regions: ["napa"], varietals: ["cabernet_sauvignon"], wine: "Dunn Vineyards, Howell Mountain", why: "Mountain-grown Napa Cab with serious aging potential" },
    { regions: ["napa", "sonoma"], varietals: ["pinot_noir"], wine: "Littorai, Sonoma Coast Pinot Noir", why: "Cool-climate California Pinot with Burgundian restraint" },
    { regions: ["willamette"], varietals: ["pinot_noir"], wine: "Cristom Vineyards, Eola-Amity Hills", why: "Oregon Pinot at its finest — pure, site-driven, age-worthy" },
    { regions: ["barossa"], varietals: ["syrah"], wine: "Henschke Hill of Grace", why: "Australia's most iconic single-vineyard Shiraz" },
    { regions: ["rhone"], varietals: ["syrah"], wine: "Jean-Louis Chave, Hermitage", why: "Northern Rhône benchmark — Syrah doesn't get more profound" },
    { regions: ["rhone"], varietals: ["grenache"], wine: "Château Rayas, Châteauneuf-du-Pape", why: "Southern Rhône legend — pure Grenache, hauntingly good" },
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
    usa: { wine: "Matthiasson, Napa Valley White", why: "The other side of Napa — a sophisticated, layered white blend" },
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

export function generateDNAProfile(answers) {
  const { countries, regions, estates, varietals, specificWines } = answers;
  const countryObjs = countries.map((id) => COUNTRIES.find((c) => c.id === id)).filter(Boolean);
  const countryNames = countryObjs.map((c) => c.name);
  const oldWorld = countryObjs.filter((c) => c.world === "old").length;
  const newWorld = countryObjs.filter((c) => c.world === "new").length;

  const allRegionIds = Object.values(regions).flat();
  const regionNames = allRegionIds.map((rId) => {
    for (const rl of Object.values(REGIONS)) {
      const f = rl.find((r) => r.id === rId);
      if (f) return f.name;
    }
    return null;
  }).filter(Boolean);

  const allEstateIds = Object.values(estates).flat();
  const estateNames = allEstateIds.map((eId) => {
    for (const el of Object.values(ESTATES)) {
      const f = el.find((e) => e.id === eId);
      if (f) return f.name;
    }
    return null;
  }).filter(Boolean);

  const varietalNames = varietals.map((id) => VARIETALS.find((v) => v.id === id)?.name).filter(Boolean);
  const reds = varietals.filter((id) => VARIETALS.find((v) => v.id === id)?.color === "red");
  const whites = varietals.filter((id) => VARIETALS.find((v) => v.id === id)?.color === "white");

  const depth = allEstateIds.length + (specificWines?.length || 0);
  const breadth = countries.length;
  const worldLeaning = oldWorld > newWorld * 1.5 ? "old" : newWorld > oldWorld * 1.5 ? "new" : "both";

  let archetype, archetypeEmoji, narrative;

  if (depth >= 4 && breadth >= 4) {
    archetype = "The Collector";
    archetypeEmoji = "🏛️";
    narrative = `You have the palate of someone who's been paying attention. Deep knowledge across ${countryNames.slice(0, 3).join(", ")}${countryNames.length > 3 ? " and beyond" : ""} — you don't just drink wine, you study it. You know your estates, you track your favorites, and you've built a mental map of what you love.`;
  } else if (depth >= 3 && breadth <= 3) {
    archetype = "The Deep Diver";
    archetypeEmoji = "🔬";
    const focus = countryNames[0] || "your chosen regions";
    narrative = `You'd rather know everything about ${focus} than a little about everywhere — that's a sign of a serious palate. You gravitate toward ${regionNames.slice(0, 3).join(", ")} and you've built real relationships with specific producers${estateNames.length > 0 ? ` like ${estateNames.slice(0, 2).join(" and ")}` : ""}.`;
  } else if (breadth >= 5 && depth < 3) {
    archetype = "The Explorer";
    archetypeEmoji = "🧭";
    narrative = `You're a wine globetrotter — ${countryNames.slice(0, 4).join(", ")}${countryNames.length > 4 ? ` and ${countryNames.length - 4} more` : ""} are all on your radar. You're drawn to variety and discovery over drilling deep into one place.${varietalNames.length > 0 ? ` Across all these regions, you keep coming back to ${varietalNames.slice(0, 2).join(" and ")}.` : ""}`;
  } else if (worldLeaning === "old" && breadth >= 2) {
    archetype = "The Classicist";
    archetypeEmoji = "📜";
    narrative = `You're drawn to wines with history. ${countryNames.join(" and ")} — these are places where winemaking traditions run centuries deep, and that resonance clearly matters to you.${regionNames.length > 0 ? ` Your affinity for ${regionNames.slice(0, 3).join(", ")} suggests you appreciate wines where place matters more than technique.` : ""}`;
  } else if (worldLeaning === "new" && breadth >= 2) {
    archetype = "The New Wave";
    archetypeEmoji = "🌊";
    narrative = `You gravitate toward the energy of New World wine — ${countryNames.join(", ")}. These are places where winemakers are still writing the rules, and that spirit resonates with you.${varietalNames.length > 0 ? ` ${varietalNames.slice(0, 2).join(" and ")} are your grapes, no matter where they're planted.` : ""}`;
  } else if (countries.length === 1 && allRegionIds.length >= 2) {
    archetype = "The Loyalist";
    archetypeEmoji = "🏡";
    narrative = `You know what you love: ${countryNames[0]}. And you've gone deep — ${regionNames.join(", ")} are your territory. You're the friend everyone asks when they need a ${countryNames[0]} recommendation.`;
  } else {
    archetype = "The Enthusiast";
    archetypeEmoji = "✨";
    narrative = `You know what you like, and that's the best starting point.${countryNames.length > 0 ? ` Your interest in ${countryNames.join(" and ")} gives us a clear direction.` : ""}${varietalNames.length > 0 ? ` Your taste for ${varietalNames.slice(0, 2).join(" and ")} tells us a lot.` : ""} Sommeasy is going to open up a lot of doors for you.`;
  }

  // Recommendations
  const recs = [];
  const used = new Set();
  for (const c of WINE_RECS.combos) {
    if (recs.length >= 5) break;
    const hasR = c.regions.some((r) => allRegionIds.includes(r));
    const hasV = c.varietals.length === 0 ? hasR : c.varietals.some((v) => varietals.includes(v));
    if (hasR && hasV && !used.has(c.wine)) { recs.push({ ...c, matchType: "region + grape" }); used.add(c.wine); }
  }
  for (const vId of varietals) {
    if (recs.length >= 5) break;
    const r = WINE_RECS.byVarietal[vId];
    if (r && !used.has(r.wine)) { recs.push({ ...r, matchType: "grape" }); used.add(r.wine); }
  }
  for (const cId of countries) {
    if (recs.length >= 5) break;
    const r = WINE_RECS.byCountry[cId];
    if (r && !used.has(r.wine)) { recs.push({ ...r, matchType: "discovery" }); used.add(r.wine); }
  }

  return {
    archetype, archetypeEmoji, narrative,
    countries: countryNames, regions: regionNames, estates: estateNames,
    varietals: varietalNames, specificWines: specificWines || [],
    recommendations: recs.slice(0, 5),
    redCount: reds.length, whiteCount: whites.length,
    // Raw IDs for saving to DB
    raw: { countries, regions, estates, varietals, specificWines },
  };
}
