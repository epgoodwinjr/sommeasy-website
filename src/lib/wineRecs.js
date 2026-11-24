// wineRecs.js — the hand-curated wines behind "Chosen for your palate".
//
// Moved out of profileEngine.js (Nov 23, 2026) so the ranking that reads
// it (palateRecs.js) stays dependency-free: home, Search and the wine page
// rank these on every load without pulling wineUnified.json into their
// bundles. The wines, their words and their order are as they were in
// profileEngine; what is new is the FACTS each one carries, so a palate's
// evidence can be matched against every wine, not only the ones its quiz
// happened to pick:
//
//   regions    DNA region ids (wineUnified `regions`)
//   varietals  DNA varietal ids (wineUnified `varietals`)
//   country    the DNA country id
//   estates    the producer's ids, as a rating of the bottle would record
//              them (wineUnified `producerLookup` producerId, or a DNA
//              `producers` id) — [] where the data has no such producer
//
// `tier` keeps the old pass a wine came from ("combo" = region + grape,
// "grape", "discovery"), and the list is grouped by it: palateRecs breaks a
// tie by this order, so a quiz-only palate ranks much as profileEngine's
// four passes did.
// Discovery picks carry their country alone: they are there to be a place
// the palate hasn't been, and their words say so.
//
// wineRecs.test.js holds every id to wineUnified and every region to its
// country. Don't add wines here without Ed.

const combo = (regions, varietals, country, estates, wine, why) =>
  ({ tier: "combo", wine, why, regions, varietals, country, estates });
const grape = (varietal, regions, country, estates, wine, why) =>
  ({ tier: "grape", wine, why, regions, varietals: [varietal], country, estates });
const discovery = (country, wine, why) =>
  ({ tier: "discovery", wine, why, regions: [], varietals: [], country, estates: [] });

export const WINE_RECS = Object.freeze([
  // ─── Region + grape (profileEngine's pass 1 / pass 3) ───
  combo(["bordeaux"], ["cabernet_sauvignon", "merlot"], "france", ["chateau_leoville_las_cases"], "Château Léoville-Las Cases, Saint-Julien", "Classic Left Bank Bordeaux — structured Cab-Merlot blend from one of the Super Seconds"),
  combo(["bordeaux"], ["merlot"], "france", [], "Château Le Pin, Pomerol", "Right Bank Pomerol — Merlot-dominant and velvety"),
  combo(["burgundy"], ["pinot_noir"], "france", ["domaine_dujac"], "Domaine Dujac, Morey-Saint-Denis", "Elegant Burgundian Pinot with terroir-driven complexity"),
  combo(["burgundy"], ["chardonnay"], "france", [], "Domaine Roulot, Meursault", "Precise, mineral-driven white Burgundy"),
  combo(["napa_valley"], ["cabernet_sauvignon"], "us", [], "Dunn Vineyards, Howell Mountain", "Mountain-grown Napa Cab with serious aging potential"),
  combo(["napa_valley", "sonoma"], ["pinot_noir"], "us", [], "Littorai, Sonoma Coast Pinot Noir", "Cool-climate California Pinot with Burgundian restraint"),
  combo(["willamette_valley"], ["pinot_noir"], "us", ["cristom"], "Cristom Vineyards, Eola-Amity Hills", "Oregon Pinot at its finest — pure, site-driven, age-worthy"),
  combo(["barossa"], ["syrah"], "australia", ["henschke"], "Henschke Hill of Grace", "Australia's most iconic single-vineyard Shiraz"),
  combo(["rhone_valley"], ["syrah"], "france", [], "Jean-Louis Chave, Hermitage", "Northern Rhône benchmark — Syrah doesn't get more profound"),
  combo(["rhone_valley"], ["grenache"], "france", [], "Château Rayas, Châteauneuf-du-Pape", "Southern Rhône legend — pure Grenache, hauntingly good"),
  combo(["rioja"], ["tempranillo"], "spain", ["artadi"], "Artadi, Viña El Pisón", "Modern Rioja from old vines — Tempranillo at its most expressive"),
  combo(["tuscany"], ["sangiovese"], "italy", [], "Montevertine, Le Pergole Torte", "Pure Sangiovese outside the rules — a cult favorite"),
  combo(["piedmont"], ["nebbiolo"], "italy", ["roagna"], "Roagna, Barolo Pira", "Traditional Barolo from one of the great old-guard families"),
  combo(["stellenbosch"], ["cabernet_sauvignon", "cabernet_franc", "merlot"], "south_africa", ["kanonkop"], "Kanonkop, Paul Sauer", "South Africa's answer to a Bordeaux blend"),
  combo(["constantia"], [], "south_africa", ["constantia_glen"], "Constantia Glen Five", "One of Constantia's finest Bordeaux-style blends"),
  combo(["mendoza"], ["malbec"], "argentina", ["zuccardi"], "Zuccardi, Finca Piedra Infinita", "High-altitude Mendoza Malbec with incredible depth"),
  combo(["marlborough"], ["sauvignon_blanc"], "new_zealand", ["greywacke"], "Greywacke, Wild Sauvignon", "From Cloudy Bay's founding winemaker — Marlborough Sauv Blanc with texture"),
  combo(["mosel"], ["riesling"], "germany", ["joh_jos_prum"], "Joh. Jos. Prüm, Wehlener Sonnenuhr Spätlese", "Benchmark Mosel Riesling — precision, sweetness, electricity"),
  combo(["swartland"], ["syrah", "mourvedre"], "south_africa", ["sadie_family", "the_sadie_family_wines"], "The Sadie Family, Columella", "South Africa's most acclaimed red — Swartland Syrah-Mourvèdre"),
  combo(["priorat"], ["grenache"], "spain", [], "Álvaro Palacios, L'Ermita", "Old-vine Garnacha from steep Priorat slopes"),
  combo(["douro"], [], "portugal", ["niepoort"], "Niepoort, Charme", "Modern Douro red — Portuguese elegance with serious structure"),
  combo(["champagne"], ["chardonnay", "pinot_noir"], "france", ["krug"], "Krug, Grande Cuvée", "The pinnacle of Champagne — richness, complexity, and power"),
  combo(["alsace"], ["riesling", "gewurztraminer"], "france", ["domaine_weinbach"], "Domaine Weinbach, Grand Cru Schlossberg", "Alsatian terroir at its most crystalline"),
  combo(["loire_valley"], ["chenin_blanc", "sauvignon_blanc"], "france", ["domaine_huet"], "Domaine Huet, Le Haut-Lieu Sec, Vouvray", "Loire Chenin at its most complex — biodynamic pioneer"),
  combo(["beaujolais"], ["gamay"], "france", ["marcel_lapierre"], "Marcel Lapierre, Morgon", "The natural wine movement started here — pure Gamay perfection"),

  // ─── Grape (pass 2) ───
  grape("cabernet_sauvignon", ["santa_cruz_mountains"], "us", [], "Ridge, Monte Bello", "One of California's greatest Cab blends — structure and longevity"),
  grape("pinot_noir", ["central_otago"], "new_zealand", ["felton_road"], "Felton Road, Block 5, Central Otago", "New Zealand Pinot Noir with silky purity"),
  grape("syrah", ["barossa"], "australia", ["torbreck"], "Torbreck, RunRig, Barossa Valley", "Massive but balanced Barossa Shiraz-Viognier"),
  grape("merlot", ["napa_valley"], "us", ["duckhorn"], "Duckhorn, Three Palms Vineyard, Napa", "The wine that proved Merlot belongs in Napa"),
  grape("malbec", ["mendoza"], "argentina", ["bodega_catena_zapata"], "Catena Zapata, Adrianna Vineyard Malbec", "High-altitude Argentine Malbec at its peak"),
  grape("tempranillo", ["ribera_del_duero"], "spain", ["vega_sicilia"], "Vega Sicilia, Único, Ribera del Duero", "Spain's most legendary red — Tempranillo royalty"),
  grape("sangiovese", ["tuscany"], "italy", ["biondi_santi"], "Biondi-Santi, Brunello di Montalcino Riserva", "The estate that invented Brunello"),
  grape("nebbiolo", ["piedmont"], "italy", [], "Giacomo Conterno, Barolo Monfortino", "Arguably Italy's greatest wine — Nebbiolo at its most majestic"),
  grape("grenache", ["rhone_valley"], "france", [], "Domaine du Vieux Télégraphe, Châteauneuf-du-Pape", "Southern Rhône benchmark — generous Grenache-based blend"),
  grape("chardonnay", [], "new_zealand", [], "Kumeu River, Maté's Vineyard, New Zealand", "World-class Chardonnay from an unexpected origin"),
  grape("sauvignon_blanc", ["loire_valley"], "france", [], "Didier Dagueneau, Silex, Pouilly-Fumé", "The most serious Sauvignon Blanc on earth"),
  grape("riesling", ["alsace"], "france", ["trimbach"], "Trimbach, Clos Sainte Hune, Alsace", "The gold standard for dry Riesling"),
  grape("chenin_blanc", ["loire_valley"], "france", ["domaine_huet"], "Domaine Huet, Le Haut-Lieu Sec, Vouvray", "Loire Chenin at its most complex"),
  grape("pinotage", ["stellenbosch"], "south_africa", ["kanonkop"], "Kanonkop, Pinotage, Stellenbosch", "South Africa's signature grape from its signature estate"),
  grape("zinfandel", ["sonoma"], "us", [], "Bedrock, Old Vine Zinfandel, Sonoma", "Heritage Zin from some of California's oldest vines"),
  grape("viognier", ["barossa"], "australia", ["yalumba"], "Yalumba, The Virgilius, Eden Valley", "Australia's best Viognier — floral, rich, structured"),
  grape("albarino", ["rias_baixas"], "spain", ["zarate"], "Zárate, Albariño, Rías Baixas", "Salty, mineral Albariño from a historic Galician estate"),
  grape("gruner_veltliner", ["wachau"], "austria", ["nikolaihof"], "Nikolaihof, Grüner Veltliner Smaragd, Wachau", "Biodynamic Austrian icon — textured and age-worthy"),
  grape("pinot_grigio", ["trentino_alto_adige"], "italy", ["alois_lageder"], "Alois Lageder, Porer, Alto Adige", "Northern Italian Pinot Grigio with actual depth"),
  grape("gewurztraminer", ["alsace"], "france", ["domaine_zind_humbrecht"], "Zind-Humbrecht, Grand Cru Hengst", "Alsatian Gewürz at its most exotic"),
  grape("semillon", [], "australia", [], "Brokenwood, ILR Reserve Semillon, Hunter Valley", "Aged Hunter Valley Semillon — Australia's great white secret"),
  grape("cabernet_franc", ["loire_valley"], "france", [], "Olga Raffault, Chinon Les Picasses", "Loire Cab Franc with pure varietal expression"),
  grape("mourvedre", ["provence"], "france", [], "Domaine Tempier, Bandol Cuvée Classique", "Provençal Mourvèdre that defined Bandol"),

  // ─── Discovery (pass 4): a country's road less taken ───
  discovery("france", "Domaine Weinbach, Riesling Grand Cru Schlossberg", "A French region you might not have explored — crystalline Alsatian Riesling"),
  discovery("italy", "COS, Cerasuolo di Vittoria, Sicily", "Sicily's only DOCG — a gorgeous, underexplored Italian red"),
  discovery("spain", "Raúl Pérez, Sketch, Rías Baixas", "Spain beyond Rioja — barrel-fermented Albariño"),
  discovery("us", "Matthiasson, Napa Valley White", "The other side of Napa — a sophisticated, layered white blend"),
  discovery("south_africa", "Mullineux, Schist Syrah, Swartland", "If you love SA wines, the Swartland is where the action is"),
  discovery("argentina", "Bodega Chacra, Pinot Noir Barda, Patagonia", "Argentina beyond Malbec — Patagonian Pinot with real purity"),
  discovery("chile", "Clos des Fous, Cauquenina, Itata", "Chile's exciting new wave — old-vine País from the south"),
  discovery("australia", "Gentle Folk, Vin de Sofa, Adelaide Hills", "Australia's natural wine scene — fresh, vibrant, unexpected"),
  discovery("new_zealand", "Pyramid Valley, Angel Flower Pinot Noir", "Beyond Marlborough — biodynamic NZ Pinot from a cult producer"),
  discovery("portugal", "Barca Velha, Douro", "Portugal's most legendary red — only made in exceptional years"),
  discovery("germany", "Keller, G-Max Riesling, Rheinhessen", "Germany's most sought-after dry Riesling"),
  discovery("austria", "F.X. Pichler, Grüner Veltliner Smaragd Kellerberg", "Austrian precision at its peak"),
].map((rec) => Object.freeze(rec)));
