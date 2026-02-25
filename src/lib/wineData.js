// Wine data — MVP subset. Will be replaced by WineMag 130k DB.

export const COUNTRIES = [
  { id: "france", name: "France", emoji: "🇫🇷", world: "old" },
  { id: "italy", name: "Italy", emoji: "🇮🇹", world: "old" },
  { id: "spain", name: "Spain", emoji: "🇪🇸", world: "old" },
  { id: "portugal", name: "Portugal", emoji: "🇵🇹", world: "old" },
  { id: "germany", name: "Germany", emoji: "🇩🇪", world: "old" },
  { id: "austria", name: "Austria", emoji: "🇦🇹", world: "old" },
  { id: "usa", name: "United States", emoji: "🇺🇸", world: "new" },
  { id: "argentina", name: "Argentina", emoji: "🇦🇷", world: "new" },
  { id: "chile", name: "Chile", emoji: "🇨🇱", world: "new" },
  { id: "australia", name: "Australia", emoji: "🇦🇺", world: "new" },
  { id: "new_zealand", name: "New Zealand", emoji: "🇳🇿", world: "new" },
  { id: "south_africa", name: "South Africa", emoji: "🇿🇦", world: "new" },
];

export const REGIONS = {
  france: [
    { id: "burgundy", name: "Burgundy" }, { id: "bordeaux", name: "Bordeaux" },
    { id: "champagne", name: "Champagne" }, { id: "rhone", name: "Rhône Valley" },
    { id: "loire", name: "Loire Valley" }, { id: "alsace", name: "Alsace" },
    { id: "provence", name: "Provence" }, { id: "languedoc", name: "Languedoc-Roussillon" },
  ],
  italy: [
    { id: "tuscany", name: "Tuscany" }, { id: "piedmont", name: "Piedmont" },
    { id: "veneto", name: "Veneto" }, { id: "sicily", name: "Sicily" },
    { id: "puglia", name: "Puglia" }, { id: "trentino", name: "Trentino-Alto Adige" },
    { id: "campania", name: "Campania" },
  ],
  spain: [
    { id: "rioja", name: "Rioja" }, { id: "ribera", name: "Ribera del Duero" },
    { id: "priorat", name: "Priorat" }, { id: "rias_baixas", name: "Rías Baixas" },
    { id: "jerez", name: "Jerez (Sherry)" }, { id: "penedes", name: "Penedès" },
    { id: "rueda", name: "Rueda" },
  ],
  usa: [
    { id: "napa", name: "Napa Valley" }, { id: "sonoma", name: "Sonoma" },
    { id: "willamette", name: "Willamette Valley" }, { id: "paso_robles", name: "Paso Robles" },
    { id: "santa_barbara", name: "Santa Barbara" }, { id: "finger_lakes", name: "Finger Lakes" },
    { id: "walla_walla", name: "Walla Walla" },
  ],
  south_africa: [
    { id: "stellenbosch", name: "Stellenbosch" }, { id: "constantia", name: "Constantia" },
    { id: "franschhoek", name: "Franschhoek" }, { id: "swartland", name: "Swartland" },
    { id: "walker_bay", name: "Walker Bay" }, { id: "paarl", name: "Paarl" },
  ],
  argentina: [
    { id: "mendoza", name: "Mendoza" }, { id: "salta", name: "Salta" },
    { id: "patagonia_ar", name: "Patagonia" },
  ],
  chile: [
    { id: "maipo", name: "Maipo Valley" }, { id: "colchagua", name: "Colchagua Valley" },
    { id: "casablanca", name: "Casablanca Valley" }, { id: "aconcagua", name: "Aconcagua" },
  ],
  australia: [
    { id: "barossa", name: "Barossa Valley" }, { id: "mclaren", name: "McLaren Vale" },
    { id: "yarra", name: "Yarra Valley" }, { id: "margaret_river", name: "Margaret River" },
    { id: "hunter", name: "Hunter Valley" }, { id: "coonawarra", name: "Coonawarra" },
  ],
  new_zealand: [
    { id: "marlborough", name: "Marlborough" }, { id: "central_otago", name: "Central Otago" },
    { id: "hawkes_bay", name: "Hawke's Bay" },
  ],
  portugal: [
    { id: "douro", name: "Douro Valley" }, { id: "alentejo", name: "Alentejo" },
    { id: "dao", name: "Dão" }, { id: "vinho_verde", name: "Vinho Verde" },
  ],
  germany: [
    { id: "mosel", name: "Mosel" }, { id: "rheingau", name: "Rheingau" },
    { id: "pfalz", name: "Pfalz" }, { id: "baden", name: "Baden" },
  ],
  austria: [
    { id: "wachau", name: "Wachau" }, { id: "kamptal", name: "Kamptal" },
    { id: "burgenland", name: "Burgenland" },
  ],
};

export const ESTATES = {
  stellenbosch: [
    { id: "meerlust", name: "Meerlust" }, { id: "kanonkop", name: "Kanonkop" },
    { id: "rust_en_vrede", name: "Rust en Vrede" }, { id: "thelema", name: "Thelema" },
  ],
  constantia: [
    { id: "constantia_glen", name: "Constantia Glen" }, { id: "buitenverwachting", name: "Buitenverwachting" },
    { id: "klein_constantia", name: "Klein Constantia" },
  ],
  burgundy: [
    { id: "drc", name: "Domaine de la Romanée-Conti" }, { id: "leroy", name: "Domaine Leroy" },
    { id: "leflaive", name: "Domaine Leflaive" }, { id: "coche_dury", name: "Coche-Dury" },
  ],
  bordeaux: [
    { id: "lafite", name: "Château Lafite Rothschild" }, { id: "margaux", name: "Château Margaux" },
    { id: "haut_brion", name: "Château Haut-Brion" }, { id: "petrus", name: "Pétrus" },
    { id: "lynch_bages", name: "Château Lynch-Bages" },
  ],
  napa: [
    { id: "opus_one", name: "Opus One" }, { id: "screaming_eagle", name: "Screaming Eagle" },
    { id: "caymus", name: "Caymus" }, { id: "stags_leap", name: "Stag's Leap Wine Cellars" },
    { id: "silver_oak", name: "Silver Oak" },
  ],
  tuscany: [
    { id: "sassicaia", name: "Tenuta San Guido (Sassicaia)" }, { id: "tignanello", name: "Antinori (Tignanello)" },
    { id: "ornellaia", name: "Ornellaia" }, { id: "fontodi", name: "Fontodi" },
  ],
  piedmont: [
    { id: "gaja", name: "Gaja" }, { id: "giacomo_conterno", name: "Giacomo Conterno" },
    { id: "bruno_giacosa", name: "Bruno Giacosa" },
  ],
  barossa: [
    { id: "penfolds", name: "Penfolds" }, { id: "henschke", name: "Henschke" },
    { id: "torbreck", name: "Torbreck" },
  ],
  rioja: [
    { id: "lopezdeheredia", name: "López de Heredia" }, { id: "la_rioja_alta", name: "La Rioja Alta" },
    { id: "muga", name: "Muga" }, { id: "cvne", name: "CVNE" },
  ],
  mendoza: [
    { id: "catena_zapata", name: "Catena Zapata" }, { id: "achaval_ferrer", name: "Achaval-Ferrer" },
  ],
  marlborough: [
    { id: "cloudy_bay", name: "Cloudy Bay" }, { id: "dog_point", name: "Dog Point" },
  ],
  willamette: [
    { id: "domaine_drouhin", name: "Domaine Drouhin" }, { id: "eyrie", name: "The Eyrie Vineyards" },
    { id: "ponzi", name: "Ponzi Vineyards" },
  ],
  rhone: [
    { id: "guigal", name: "E. Guigal" }, { id: "chapoutier", name: "M. Chapoutier" },
    { id: "beaucastel", name: "Château de Beaucastel" },
  ],
  douro: [
    { id: "quinta_do_noval", name: "Quinta do Noval" }, { id: "niepoort", name: "Niepoort" },
  ],
  sonoma: [
    { id: "kistler", name: "Kistler" }, { id: "flowers", name: "Flowers" },
    { id: "williams_selyem", name: "Williams Selyem" },
  ],
  priorat: [
    { id: "alvaro_palacios", name: "Álvaro Palacios" }, { id: "clos_mogador", name: "Clos Mogador" },
  ],
  franschhoek: [{ id: "boekenhoutskloof", name: "Boekenhoutskloof" }],
  swartland: [
    { id: "mullineux", name: "Mullineux" }, { id: "sadie", name: "The Sadie Family" },
  ],
};

export const VARIETALS = [
  { id: "cabernet_sauvignon", name: "Cabernet Sauvignon", color: "red" },
  { id: "merlot", name: "Merlot", color: "red" },
  { id: "pinot_noir", name: "Pinot Noir", color: "red" },
  { id: "syrah", name: "Syrah / Shiraz", color: "red" },
  { id: "malbec", name: "Malbec", color: "red" },
  { id: "tempranillo", name: "Tempranillo", color: "red" },
  { id: "sangiovese", name: "Sangiovese", color: "red" },
  { id: "nebbiolo", name: "Nebbiolo", color: "red" },
  { id: "grenache", name: "Grenache / Garnacha", color: "red" },
  { id: "zinfandel", name: "Zinfandel", color: "red" },
  { id: "pinotage", name: "Pinotage", color: "red" },
  { id: "mourvedre", name: "Mourvèdre", color: "red" },
  { id: "cabernet_franc", name: "Cabernet Franc", color: "red" },
  { id: "petit_verdot", name: "Petit Verdot", color: "red" },
  { id: "chardonnay", name: "Chardonnay", color: "white" },
  { id: "sauvignon_blanc", name: "Sauvignon Blanc", color: "white" },
  { id: "riesling", name: "Riesling", color: "white" },
  { id: "pinot_grigio", name: "Pinot Grigio / Pinot Gris", color: "white" },
  { id: "chenin_blanc", name: "Chenin Blanc", color: "white" },
  { id: "viognier", name: "Viognier", color: "white" },
  { id: "gruner_veltliner", name: "Grüner Veltliner", color: "white" },
  { id: "albarino", name: "Albariño", color: "white" },
  { id: "gewurztraminer", name: "Gewürztraminer", color: "white" },
  { id: "semillon", name: "Sémillon", color: "white" },
  { id: "muscadet", name: "Muscadet", color: "white" },
  { id: "vermentino", name: "Vermentino", color: "white" },
];
