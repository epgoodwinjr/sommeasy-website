import { COUNTRIES, REGIONS, ESTATES, VARIETALS } from "./wineData";

// ═══════════════════════════════════════════════════════
// WINE RECOMMENDATIONS (unchanged — bucket 2 will expand)
// ═══════════════════════════════════════════════════════

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
    { regions: ["champagne"], varietals: ["chardonnay", "pinot_noir"], wine: "Krug, Grande Cuvée", why: "The pinnacle of Champagne — richness, complexity, and power" },
    { regions: ["alsace"], varietals: ["riesling", "gewurztraminer"], wine: "Domaine Weinbach, Grand Cru Schlossberg", why: "Alsatian terroir at its most crystalline" },
    { regions: ["loire"], varietals: ["chenin_blanc", "sauvignon_blanc"], wine: "Domaine Huet, Le Haut-Lieu Sec, Vouvray", why: "Loire Chenin at its most complex — biodynamic pioneer" },
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


// ═══════════════════════════════════════════════════════
// NARRATIVE HELPERS
// ═══════════════════════════════════════════════════════

function joinList(items, max) {
  const s = items.slice(0, max || 3);
  if (s.length === 0) return "";
  if (s.length === 1) return s[0];
  if (s.length === 2) return s[0] + " and " + s[1];
  return s.slice(0, -1).join(", ") + ", and " + s[s.length - 1];
}

function joinWithOverflow(items, max) {
  if (items.length <= max) return joinList(items, max);
  const shown = items.slice(0, max);
  const rest = items.length - max;
  return joinList(shown, max) + ` and ${rest} more`;
}

// Which country has the most regions selected?
function dominantCountry(regions, countries) {
  let best = null;
  let bestCount = 0;
  for (const cId of countries) {
    const count = (regions[cId] || []).length;
    if (count > bestCount) { bestCount = count; best = cId; }
  }
  return best;
}


// ═══════════════════════════════════════════════════════
// ARCHETYPE ENGINE — ~15 types with rich narratives
// ═══════════════════════════════════════════════════════

function determineArchetype(ctx) {
  const {
    breadth, depth, regionCount, varietalCount, redCount, whiteCount,
    oldWorldRatio, newWorldRatio, concentration,
    countryNames, regionNames, varietalNames, estateNames, specificWines,
    topCountry, topCountryRegions,
  } = ctx;

  const totalVarietals = redCount + whiteCount;
  const redRatio = totalVarietals > 0 ? redCount / totalVarietals : 0.5;
  const whiteRatio = totalVarietals > 0 ? whiteCount / totalVarietals : 0.5;

  // ─── 1. THE GRAND PALATE ───
  // Encyclopedic: very deep AND very broad
  if (depth >= 6 && breadth >= 5 && varietalCount >= 5) {
    return {
      archetype: "The Grand Palate",
      archetypeEmoji: "👑",
      narrative: `This is the palate of someone who has been everywhere and remembers everything. ${joinList(countryNames, 4)}${countryNames.length > 4 ? " and beyond" : ""} — you navigate them all with fluency. You know ${joinList(estateNames.slice(0, 3), 3)} by name, you track ${joinList(varietalNames.slice(0, 3), 3)} across hemispheres, and your ${regionCount} regions aren't just pins on a map — they're places where you've built a genuine understanding of what the land produces. The restaurant sommelier isn't telling you what to drink. You're telling them.`,
    };
  }

  // ─── 2. THE COLLECTOR ───
  // Deep and broad, but not quite encyclopedic
  if (depth >= 4 && breadth >= 4) {
    return {
      archetype: "The Collector",
      archetypeEmoji: "🏛️",
      narrative: `You have the palate of someone who's been paying attention. Deep knowledge across ${joinList(countryNames, 3)}${countryNames.length > 3 ? " and beyond" : ""} — you don't just drink wine, you study it. You know your estates${estateNames.length > 0 ? ` like ${joinList(estateNames.slice(0, 2), 2)}` : ""}, you track your favorites, and your affinity for ${joinList(varietalNames.slice(0, 3), 3)} reveals a palate that's both wide-ranging and specific. ${regionCount} regions, ${breadth} countries — you've built a mental map of what you love, and it's impressively detailed.`,
    };
  }

  // ─── 3. THE TERROIR DEVOTEE ───
  // Deep in one country, many regions, knows producers
  if (breadth <= 2 && depth >= 4 && regionCount >= 4) {
    const focus = topCountry || countryNames[0];
    return {
      archetype: "The Terroir Devotee",
      archetypeEmoji: "🌍",
      narrative: `You could write the book on ${focus}. While others scatter their attention across the globe, you've gone deep — ${joinList(topCountryRegions || regionNames, 4)} are territory you know intimately. You understand that ${joinList(estateNames.slice(0, 2), 2)}${estateNames.length > 0 ? " aren't" : "the estates here aren't"} just labels, they're expressions of specific places. ${varietalCount > 0 ? `Your love for ${joinList(varietalNames.slice(0, 2), 2)} through the lens of ${focus} shows a palate shaped by terroir, not trend.` : `This kind of focus is rare, and it means you taste nuances others miss.`}`,
    };
  }

  // ─── 4. THE CONNOISSEUR ───
  // Good depth, moderate breadth, producer-focused
  if (depth >= 3 && breadth >= 2 && breadth <= 4) {
    return {
      archetype: "The Connoisseur",
      archetypeEmoji: "🔬",
      narrative: `You've moved past "I like red wine" a long time ago. Your palate is calibrated — you know the difference between ${regionNames.length >= 2 ? joinList(regionNames.slice(0, 2), 2) : "regions"} not just as names but as flavors.${estateNames.length > 0 ? ` Producers like ${joinList(estateNames.slice(0, 2), 2)} matter to you, and that's the sign of a serious wine drinker.` : ""} Across ${joinList(countryNames, 3)}, you've zeroed in on ${joinList(varietalNames.slice(0, 3), 3)} — and you know exactly what you want from each.`,
    };
  }

  // ─── 5. THE GLOBE-TROTTER ───
  // Very wide, variety-seeking, lower depth
  if (breadth >= 6 && varietalCount >= 5) {
    return {
      archetype: "The Globe-Trotter",
      archetypeEmoji: "✈️",
      narrative: `${breadth} countries. ${varietalCount} grapes. You don't have a comfort zone — you have a flight itinerary. ${joinWithOverflow(countryNames, 4)} are all on your radar, and you're the kind of drinker who orders the most unfamiliar thing on the list just to see what happens. ${joinList(varietalNames.slice(0, 3), 3)} are throughlines, but honestly, you'd try anything if it came from somewhere interesting. That restlessness is a gift.`,
    };
  }

  // ─── 6. THE EXPLORER ───
  // Wide but not as extreme as Globe-Trotter
  if (breadth >= 4 && depth < 3) {
    return {
      archetype: "The Explorer",
      archetypeEmoji: "🧭",
      narrative: `Your palate doesn't sit still. ${joinList(countryNames, 4)} — you're drawn to variety and new discoveries over drilling deep into one appellation.${varietalCount >= 3 ? ` Across all these regions, ${joinList(varietalNames.slice(0, 2), 2)} keep showing up in your glass, which tells us a lot about what your palate gravitates toward even when you're exploring.` : ""} There's a world of wine out there that's going to light you up, and Sommeasy is going to help you find it.`,
    };
  }

  // ─── 7. THE CLASSICIST ───
  // Old World dominant, meaningful breadth
  if (oldWorldRatio >= 0.75 && breadth >= 3 && regionCount >= 3) {
    return {
      archetype: "The Classicist",
      archetypeEmoji: "📜",
      narrative: `You're drawn to wines with centuries behind them. ${joinList(countryNames, 3)} — these are places where winemaking traditions run deep, and that resonance clearly matters to you. Your affinity for ${joinList(regionNames.slice(0, 3), 3)} suggests a palate that values place over novelty, restraint over power.${varietalNames.length > 0 ? ` ${joinList(varietalNames.slice(0, 2), 2)} in their Old World expressions — that's your sweet spot.` : ""} There's a reason the classics endure, and you understand that intuitively.`,
    };
  }

  // ─── 8. THE PIONEER ───
  // New World dominant, meaningful breadth
  if (newWorldRatio >= 0.7 && breadth >= 2 && regionCount >= 2) {
    return {
      archetype: "The Pioneer",
      archetypeEmoji: "🌊",
      narrative: `You gravitate toward the energy of New World wine — ${joinList(countryNames, 3)}. These are places where winemakers are still writing the rules, pushing boundaries with ${joinList(varietalNames.slice(0, 2), 2) || "bold grapes"} in unexpected ways.${regionNames.length > 0 ? ` ${joinList(regionNames.slice(0, 3), 3)} are your proving grounds.` : ""} You taste ambition in a glass before you taste oak, and that's what makes your palate exciting.`,
    };
  }

  // ─── 9. THE BRIDGE BUILDER ───
  // Balanced Old/New World
  if (breadth >= 3 && oldWorldRatio >= 0.3 && oldWorldRatio <= 0.7 && varietalCount >= 3) {
    return {
      archetype: "The Bridge Builder",
      archetypeEmoji: "🌉",
      narrative: `You don't pick sides. Old World, New World — you taste what's good regardless of where it comes from. ${joinList(countryNames, 3)} might seem like an eclectic mix, but there's a throughline: you're drawn to ${joinList(varietalNames.slice(0, 2), 2)} whether they're grown in ancient European soils or planted last generation in ${countryNames.find(c => ["United States", "Australia", "South Africa", "Chile", "Argentina", "New Zealand"].includes(c)) || "the New World"}. That open-mindedness is the mark of a genuinely evolved palate.`,
    };
  }

  // ─── 10. THE RED DEVOTEE ───
  // Heavily red-weighted
  if (redRatio >= 0.8 && varietalCount >= 3) {
    return {
      archetype: "The Red Devotee",
      archetypeEmoji: "🍷",
      narrative: `Red wine isn't just your preference — it's your language. ${joinList(varietalNames.filter(v => { const vObj = VARIETALS.find(x => x.name === v); return vObj && vObj.color === "red"; }).slice(0, 3), 3)} — you know the spectrum from elegant to powerful and you have opinions about each.${regionNames.length > 0 ? ` Across ${joinList(regionNames.slice(0, 3), 3)}, you've mapped out where your reds reach their peak.` : ""}${countryNames.length > 0 ? ` ${joinList(countryNames, 2)} produce the wines that move you most.` : ""} When someone hands you the wine list, you're going straight to the left side of the page.`,
    };
  }

  // ─── 11. THE WHITE WINE AUTHORITY ───
  // Heavily white-weighted
  if (whiteRatio >= 0.7 && varietalCount >= 3) {
    return {
      archetype: "The White Wine Authority",
      archetypeEmoji: "✨",
      narrative: `While the world obsesses over reds, you've been quietly building expertise in the wines most people overlook. ${joinList(varietalNames.filter(v => { const vObj = VARIETALS.find(x => x.name === v); return vObj && vObj.color === "white"; }).slice(0, 3), 3)} — you understand the difference between them in ways that surprise even wine professionals.${regionNames.length > 0 ? ` ${joinList(regionNames.slice(0, 3), 3)} are where you've found your magic.` : ""} There's a depth and complexity to great white wine that you're tuned into, and it sets you apart.`,
    };
  }

  // ─── 12. THE LOYALIST ───
  // Single country, meaningful depth within it
  if (breadth === 1 && regionCount >= 2) {
    const country = countryNames[0] || "your chosen country";
    return {
      archetype: "The Loyalist",
      archetypeEmoji: "🏡",
      narrative: `You know what you love: ${country}. And you've gone deep — ${joinList(regionNames, 3)} are your territory.${estateNames.length > 0 ? ` You know producers like ${joinList(estateNames.slice(0, 2), 2)} by heart.` : ""}${varietalNames.length > 0 ? ` ${joinList(varietalNames.slice(0, 2), 2)} grown in ${country} soil — that's your sweet spot.` : ""} You're the friend everyone asks when they need a ${country} recommendation, and you never disappoint.`,
    };
  }

  // ─── 13. THE PURIST ───
  // Few varietals but knows them well
  if (varietalCount >= 1 && varietalCount <= 2 && (depth >= 2 || regionCount >= 2)) {
    return {
      archetype: "The Purist",
      archetypeEmoji: "🎯",
      narrative: `You know exactly what you want in a glass: ${joinList(varietalNames, 2)}. No chasing trends, no compromises. ${regionNames.length > 0 ? `You've tracked ${varietalCount === 1 ? "it" : "them"} across ${joinList(regionNames.slice(0, 3), 3)} and you know how ${varietalCount === 1 ? "it" : "each"} tastes different in each place.` : ""}${estateNames.length > 0 ? ` Producers like ${joinList(estateNames.slice(0, 2), 2)} are your benchmarks.` : ""} This kind of focus means you taste subtleties that more scattered drinkers miss — the difference between good and great.`,
    };
  }

  // ─── 14. THE CURIOUS PALATE ───
  // Some selections but still building
  if (breadth >= 2 && varietalCount >= 2) {
    return {
      archetype: "The Curious Palate",
      archetypeEmoji: "💡",
      narrative: `You're building something here. ${joinList(countryNames, 3)} caught your attention, ${joinList(varietalNames.slice(0, 2), 2)} are speaking to you, and you're starting to connect the dots between what you taste and what you love.${regionNames.length > 0 ? ` ${joinList(regionNames.slice(0, 2), 2)} are early favorites that will deepen with experience.` : ""} You're at the stage where every bottle teaches you something — and that's genuinely the best place to be.`,
    };
  }

  // ─── 15. THE RISING PALATE ───
  // Catch-all for lighter selections
  return {
    archetype: "The Rising Palate",
    archetypeEmoji: "🌱",
    narrative: `You know what you like${countryNames.length > 0 ? ` — ${joinList(countryNames, 2)} ${countryNames.length === 1 ? "is" : "are"} on your radar` : ""}${varietalNames.length > 0 ? ` and ${joinList(varietalNames.slice(0, 2), 2)} ${varietalNames.length === 1 ? "is" : "are"} already favorites` : ""}. That's the starting point for everything. As you try more wines through Sommeasy, your profile will grow richer and your recommendations will get sharper. Every expert started exactly where you are — with a glass they loved and a desire to find the next one.`,
  };
}


// ═══════════════════════════════════════════════════════
// MAIN PROFILE GENERATOR
// ═══════════════════════════════════════════════════════

export function generateDNAProfile(answers) {
  const { countries, regions, estates, varietals, specificWines } = answers;

  // ─── Resolve names from IDs ───
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

  // ─── Compute scoring dimensions ───
  const breadth = countries.length;
  const depth = allEstateIds.length + (specificWines?.length || 0);
  const regionCount = allRegionIds.length;
  const varietalCount = varietals.length;
  const oldWorldRatio = breadth > 0 ? oldWorld / breadth : 0.5;
  const newWorldRatio = breadth > 0 ? newWorld / breadth : 0.5;

  // Concentration: what % of regions are in the top country?
  let concentration = 0;
  let topCountryId = null;
  let topCountryRegions = [];
  for (const cId of countries) {
    const rCount = (regions[cId] || []).length;
    if (rCount > concentration) {
      concentration = rCount;
      topCountryId = cId;
    }
  }
  if (topCountryId) {
    const cObj = COUNTRIES.find(c => c.id === topCountryId);
    const topCountry = cObj ? cObj.name : null;
    topCountryRegions = (regions[topCountryId] || []).map(rId => {
      for (const rl of Object.values(REGIONS)) {
        const f = rl.find(r => r.id === rId);
        if (f) return f.name;
      }
      return null;
    }).filter(Boolean);
    concentration = regionCount > 0 ? concentration / regionCount : 0;
  }

  const topCountryObj = topCountryId ? COUNTRIES.find(c => c.id === topCountryId) : null;
  const topCountry = topCountryObj ? topCountryObj.name : null;

  // ─── Determine archetype ───
  const { archetype, archetypeEmoji, narrative } = determineArchetype({
    breadth, depth, regionCount, varietalCount,
    redCount: reds.length, whiteCount: whites.length,
    oldWorldRatio, newWorldRatio, concentration,
    countryNames, regionNames, varietalNames, estateNames,
    specificWines: specificWines || [],
    topCountry, topCountryRegions,
  });

  // ─── Build recommendations ───
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
    raw: { countries, regions, estates, varietals, specificWines },
  };
}
