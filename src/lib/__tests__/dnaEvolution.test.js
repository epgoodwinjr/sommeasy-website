// DNA Evolution Engine — Comprehensive Test Suite
// Run with: node src/lib/__tests__/dnaEvolution.test.js
//
// Tests the full DNA evolution pipeline: resolver -> accumulation -> promotion/demotion
// All logic inlined for CJS compatibility (source files use ES modules).

async function runTests() {
  const lookupData = require("../wineReference-lookup.json");
  const { COUNTRIES, REGIONS, VARIETALS, ESTATES } = require("../wineData");

  // ══════════════════════════════════════════════════════════
  // INLINED RESOLVER (from wineResolver.js, adapted for CJS)
  // ══════════════════════════════════════════════════════════

  const COUNTRY_TO_DNA = {
    "France": "france", "Italy": "italy", "Spain": "spain", "Portugal": "portugal",
    "Germany": "germany", "Austria": "austria", "US": "usa",
    "Argentina": "argentina", "Chile": "chile", "Australia": "australia",
    "New Zealand": "new_zealand", "South Africa": "south_africa",
  };

  const PROVINCE_TO_DNA_REGION = {
    "Bordeaux": "bordeaux", "Burgundy": "burgundy", "Champagne": "champagne",
    "Alsace": "alsace", "Provence": "provence",
    "Languedoc-Roussillon": "languedoc", "South of France": "languedoc",
    "Loire Valley": "loire", "Rh\u00f4ne Valley": "rhone",
    "Beaujolais": "beaujolais", "Southwest France": "southwest_france",
    "Tuscany": "tuscany", "Piedmont": "piedmont", "Veneto": "veneto",
    "Sicily & Sardinia": "sicily", "Southern Italy": "puglia", "Puglia": "puglia",
    "Northeastern Italy": "trentino", "Campania": "campania",
    "Northern Spain": "rioja", "Catalonia": "penedes",
    "Stellenbosch": "stellenbosch", "Coastal Region": "stellenbosch",
    "Constantia": "constantia", "Franschhoek": "franschhoek",
    "Swartland": "swartland", "Walker Bay": "walker_bay", "Paarl": "paarl",
    "Mendoza Province": "mendoza",
    "Maipo Valley": "maipo", "Colchagua Valley": "colchagua",
    "Casablanca Valley": "casablanca", "Aconcagua": "aconcagua",
    "South Australia": "barossa", "Western Australia": "margaret_river", "New South Wales": "hunter",
    "Marlborough": "marlborough", "Central Otago": "central_otago", "Hawke's Bay": "hawkes_bay",
    "Douro": "douro", "Alentejo": "alentejo", "D\u00e3o": "dao", "Vinho Verde": "vinho_verde",
    "Mosel": "mosel", "Rheingau": "rheingau", "Pfalz": "pfalz", "Rheinhessen": "rheinhessen",
    "Baden": "baden",
    "Nieder\u00f6sterreich": "kamptal", "Burgenland": "burgenland",
    "California": "napa", "Oregon": "willamette", "Washington": "walla_walla",
    "New York": "finger_lakes", "Virginia": "virginia",
  };

  const SUBREGION_TO_DNA_REGION = {
    "napa valley": "napa", "napa": "napa", "oakville": "napa", "rutherford": "napa",
    "stags leap district": "napa", "howell mountain": "napa", "spring mountain district": "napa",
    "calistoga": "napa", "atlas peak": "napa", "mount veeder": "napa", "st. helena": "napa",
    "sonoma valley": "sonoma", "russian river valley": "sonoma", "dry creek valley": "sonoma",
    "alexander valley": "sonoma", "sonoma coast": "sonoma", "sonoma mountain": "sonoma",
    "willamette valley": "willamette", "dundee hills": "willamette", "eola-amity hills": "willamette",
    "ribbon ridge": "willamette", "chehalem mountains": "willamette",
    "paso robles": "paso_robles", "paso robles estrella district": "paso_robles",
    "santa barbara county": "santa_barbara", "santa ynez valley": "santa_barbara",
    "sta. rita hills": "santa_barbara", "santa rita hills": "santa_barbara",
    "santa maria valley": "santa_barbara", "happy canyon of santa barbara": "santa_barbara",
    "finger lakes": "finger_lakes", "walla walla valley": "walla_walla",
    "columbia valley": "walla_walla",
    "morgon": "beaujolais", "fleurie": "beaujolais", "moulin-\u00e0-vent": "beaujolais",
    "brouilly": "beaujolais", "juli\u00e9nas": "beaujolais", "chiroubles": "beaujolais",
    "beaujolais-villages": "beaujolais", "saint-amour": "beaujolais",
    "c\u00f4te de brouilly": "beaujolais", "r\u00e9gni\u00e9": "beaujolais", "ch\u00e9nas": "beaujolais",
    "cahors": "southwest_france", "madiran": "southwest_france", "gaillac": "southwest_france",
    "juran\u00e7on": "southwest_france", "bergerac": "southwest_france", "irou\u00e9guy": "southwest_france",
    "c\u00f4te-r\u00f4tie": "rhone", "hermitage": "rhone", "ch\u00e2teauneuf-du-pape": "rhone",
    "chateauneuf-du-pape": "rhone", "gigondas": "rhone", "cornas": "rhone",
    "saint-joseph": "rhone", "crozes-hermitage": "rhone", "condrieu": "rhone",
    "vacqueyras": "rhone", "c\u00f4tes du rh\u00f4ne": "rhone",
    "sancerre": "loire", "pouilly-fum\u00e9": "loire", "vouvray": "loire",
    "muscadet s\u00e8vre et maine": "loire", "chinon": "loire", "bourgueil": "loire",
    "savennieres": "loire", "anjou": "loire", "saumur": "loire",
    "bandol": "provence", "c\u00f4tes de provence": "provence",
    "rioja": "rioja", "ribera del duero": "ribera", "priorat": "priorat",
    "r\u00edas baixas": "rias_baixas", "jerez": "jerez", "rueda": "rueda", "pened\u00e8s": "penedes",
    "barossa valley": "barossa", "eden valley": "barossa",
    "mclaren vale": "mclaren", "yarra valley": "yarra",
    "margaret river": "margaret_river", "hunter valley": "hunter", "coonawarra": "coonawarra",
    "uco valley": "mendoza", "luj\u00e1n de cuyo": "mendoza",
    "cafayate": "salta", "salta": "salta",
    "wachau": "wachau", "kamptal": "kamptal", "kremstal": "kamptal",
  };

  const VARIETY_TO_DNA = {};
  const VARIETY_NAME_MAP = {
    cabernet_sauvignon: ["Cabernet Sauvignon"],
    merlot: ["Merlot"],
    pinot_noir: ["Pinot Noir", "Pinot Nero"],
    syrah: ["Syrah", "Shiraz"],
    malbec: ["Malbec"],
    tempranillo: ["Tempranillo", "Tinta de Toro", "Tinto Fino"],
    sangiovese: ["Sangiovese", "Sangiovese Grosso", "Prugnolo Gentile", "Brunello"],
    nebbiolo: ["Nebbiolo"],
    grenache: ["Grenache", "Garnacha"],
    zinfandel: ["Zinfandel"],
    pinotage: ["Pinotage"],
    mourvedre: ["Mourv\u00e8dre", "Monastrell"],
    cabernet_franc: ["Cabernet Franc"],
    petit_verdot: ["Petit Verdot"],
    chardonnay: ["Chardonnay"],
    sauvignon_blanc: ["Sauvignon Blanc", "Sauvignon"],
    riesling: ["Riesling"],
    pinot_grigio: ["Pinot Grigio", "Pinot Gris"],
    chenin_blanc: ["Chenin Blanc"],
    viognier: ["Viognier"],
    gruner_veltliner: ["Gr\u00fcner Veltliner"],
    albarino: ["Albari\u00f1o"],
    gewurztraminer: ["Gew\u00fcrztraminer"],
    semillon: ["S\u00e9millon", "Semillon"],
    muscadet: ["Muscadet", "Melon"],
    vermentino: ["Vermentino"],
  };
  for (const [dnaId, wmNames] of Object.entries(VARIETY_NAME_MAP)) {
    for (const n of wmNames) VARIETY_TO_DNA[n] = dnaId;
  }

  const DNA_TO_VARIETY_NAME = {};
  for (const [dnaId, wmNames] of Object.entries(VARIETY_NAME_MAP)) {
    DNA_TO_VARIETY_NAME[dnaId] = wmNames[0];
  }

  // Blend detection
  const BLEND_PATTERNS = [
    /\bred\s+blend\b/i,
    /\bwhite\s+blend\b/i,
    /\bbordeaux.style\b/i,
    /\brhone.style\b/i,
    /\bgms\b/i,
    /\bmeritage\b/i,
  ];

  function detectBlend(varietalName) {
    if (!varietalName) return false;
    if (/-/.test(varietalName) && /[A-Z].*-.*[A-Z]/.test(varietalName)) return true;
    for (const pat of BLEND_PATTERNS) {
      if (pat.test(varietalName)) return true;
    }
    return false;
  }

  // Normalization
  function normalize(text) {
    return text
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/['\u2018\u2019`]/g, "'")
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/\b(estate|vineyard|vineyards|winery|wines|wine|cellars|cellar|domaine|chateau|ch\u00e2teau|bodega|tenuta|casa|cantina|fattoria|azienda|maison)\b/gi, "")
      .replace(/[^a-z0-9\s'.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return normalize(text).split(/\s+/).filter(t => t.length >= 2);
  }

  // Build producer index
  const producerIndex = [];
  for (const [name, data] of Object.entries(lookupData.producers)) {
    const norm = normalize(name);
    if (norm.length < 3) continue;
    producerIndex.push({
      name, norm,
      tokens: new Set(tokenize(name)),
      country: data.country,
      province: data.province || "",
      dnaCountryId: COUNTRY_TO_DNA[data.country] || null,
      dnaRegionId: PROVINCE_TO_DNA_REGION[data.province] || SUBREGION_TO_DNA_REGION[(data.province || "").toLowerCase()] || null,
    });
  }
  for (const [regionId, estates] of Object.entries(ESTATES)) {
    for (const estate of estates) {
      const norm = normalize(estate.name);
      if (producerIndex.some(p => p.norm === norm)) continue;
      let countryId = null;
      for (const [cId, regions] of Object.entries(REGIONS)) {
        if (regions.some(r => r.id === regionId)) { countryId = cId; break; }
      }
      const countryObj = countryId ? COUNTRIES.find(c => c.id === countryId) : null;
      producerIndex.push({
        name: estate.name, norm,
        tokens: new Set(tokenize(estate.name)),
        country: countryObj ? countryObj.name : "",
        province: "",
        dnaCountryId: countryId,
        dnaRegionId: regionId,
        dnaEstateId: estate.id,
      });
    }
  }
  producerIndex.sort((a, b) => b.norm.length - a.norm.length);

  // Build varietal index
  const varietalIndex = [];
  for (const [name, data] of Object.entries(lookupData.varieties)) {
    const norm = normalize(name);
    if (norm.length < 3) continue;
    varietalIndex.push({ name, norm, color: data.color, dnaId: VARIETY_TO_DNA[name] || null });
  }
  varietalIndex.sort((a, b) => b.norm.length - a.norm.length);

  // Build region index
  const regionIndex = [];
  for (const [key, data] of Object.entries(lookupData.regionLookup)) {
    if (key.length < 4 || ["other", "america", "europe"].includes(key)) continue;
    regionIndex.push({
      term: key,
      country: data.country,
      province: data.province || "",
      subregion: data.subregion || "",
      dnaCountryId: COUNTRY_TO_DNA[data.country] || null,
      dnaRegionId: SUBREGION_TO_DNA_REGION[key] || PROVINCE_TO_DNA_REGION[data.province] || null,
    });
  }
  regionIndex.sort((a, b) => b.term.length - a.term.length);

  // Matching functions
  function tokenOverlap(inputTokens, candidateTokens) {
    if (inputTokens.length === 0 || candidateTokens.size === 0) return 0;
    let matches = 0;
    for (const t of inputTokens) {
      if (candidateTokens.has(t)) matches++;
      else {
        for (const ct of candidateTokens) {
          if ((t.length >= 4 && ct.startsWith(t)) || (ct.length >= 4 && t.startsWith(ct))) {
            matches += 0.7; break;
          }
        }
      }
    }
    return matches / Math.max(inputTokens.length, candidateTokens.size);
  }

  function matchProducer(normInput, inputTokens) {
    let bestMatch = null;
    let bestScore = 0;
    for (const prod of producerIndex) {
      let score = 0;
      if (normInput.includes(prod.norm) && prod.norm.length >= 4) {
        const coverage = prod.norm.length / normInput.length;
        score = 0.5 + (coverage * 0.5);
      } else {
        const overlap = tokenOverlap(inputTokens, prod.tokens);
        if (overlap >= 0.4) score = overlap * 0.7;
      }
      if (score > bestScore) { bestScore = score; bestMatch = prod; }
      if (bestScore >= 0.95) break;
    }
    if (bestScore < 0.3) return null;
    return { producer: bestMatch, score: bestScore };
  }

  function matchVarietal(normInput) {
    for (const v of varietalIndex) {
      if (v.norm.length >= 4 && normInput.includes(v.norm)) return v;
    }
    return null;
  }

  function matchRegion(normInput) {
    for (const r of regionIndex) {
      if (r.term.length >= 4 && normInput.includes(r.term)) return r;
    }
    return null;
  }

  function calculateConfidence(producerResult, varietalMatch, regionMatch) {
    let confidence = 0;
    const corroborations = (varietalMatch ? 1 : 0) + (regionMatch ? 1 : 0);
    if (producerResult) {
      const { score } = producerResult;
      if (score >= 0.8) {
        confidence = 85;
        if (varietalMatch) confidence += 5;
        if (regionMatch) confidence += 5;
      } else if (score >= 0.5) {
        const effectiveCorroborations = corroborations + (producerResult.producer.province ? 1 : 0);
        if (effectiveCorroborations >= 2) confidence = 90;
        else if (effectiveCorroborations >= 1) confidence = 82;
        else confidence = 68;
      } else if (score >= 0.3) {
        confidence = 50;
        if (varietalMatch) confidence += 10;
        if (regionMatch) confidence += 10;
      }
    } else {
      if (regionMatch && varietalMatch) confidence = 60;
      else if (regionMatch) confidence = 40;
      else if (varietalMatch) confidence = 30;
    }
    return Math.min(confidence, 100);
  }

  function mapToDnaIds(producerResult, varietalMatch, regionMatch) {
    const mapping = {
      dnaCountryId: null, dnaRegionId: null, dnaVarietalId: null, dnaEstateId: null,
      countryMappable: true, regionMappable: true, varietalMappable: true, estateMappable: true,
    };
    if (producerResult) mapping.dnaCountryId = producerResult.producer.dnaCountryId;
    if (!mapping.dnaCountryId && regionMatch) mapping.dnaCountryId = regionMatch.dnaCountryId;
    if (!mapping.dnaCountryId) mapping.countryMappable = false;

    if (producerResult && producerResult.producer.dnaRegionId) mapping.dnaRegionId = producerResult.producer.dnaRegionId;
    if (!mapping.dnaRegionId && regionMatch && regionMatch.dnaRegionId) mapping.dnaRegionId = regionMatch.dnaRegionId;
    if (!mapping.dnaRegionId) mapping.regionMappable = false;

    if (varietalMatch && varietalMatch.dnaId) mapping.dnaVarietalId = varietalMatch.dnaId;
    else if (varietalMatch) mapping.varietalMappable = false;

    if (producerResult && producerResult.producer.dnaEstateId) mapping.dnaEstateId = producerResult.producer.dnaEstateId;
    else if (producerResult) mapping.estateMappable = false;

    return mapping;
  }

  function resolveWine(wineName) {
    if (!wineName || wineName.trim().length < 3) {
      return { winery: null, varietal: null, region: null, province: null, country: null, confidence: 0, isBlend: false, dnaMapping: null };
    }
    const normInput = normalize(wineName);
    const inputTokens = tokenize(wineName);
    const producerResult = matchProducer(normInput, inputTokens);
    const varietalMatch = matchVarietal(normInput);
    const regionMatch = matchRegion(normInput);
    const confidence = calculateConfidence(producerResult, varietalMatch, regionMatch);

    const winery = producerResult ? producerResult.producer.name : null;
    const varietal = varietalMatch ? varietalMatch.name : null;
    const blendDetected = detectBlend(varietal);

    let region = null, province = null, country = null;
    if (producerResult) {
      province = producerResult.producer.province || null;
      country = producerResult.producer.country || null;
    }
    if (regionMatch) {
      region = regionMatch.subregion || regionMatch.province || regionMatch.term;
      if (!province) province = regionMatch.province || null;
      if (!country) country = regionMatch.country || null;
    }
    if (!region && province) region = province;

    const dnaMapping = mapToDnaIds(producerResult, varietalMatch, regionMatch);

    return {
      winery, varietal, region, province, country, confidence, isBlend: blendDetected, dnaMapping,
      producerScore: producerResult ? producerResult.score : null,
    };
  }

  // Helper functions from wineResolver.js
  function findCountryForRegion(dnaRegionId) {
    for (const [countryId, regions] of Object.entries(REGIONS)) {
      if (regions.some(r => r.id === dnaRegionId)) return countryId;
    }
    return null;
  }

  function isValidDnaVarietal(dnaVarietalId) {
    return VARIETALS.some(v => v.id === dnaVarietalId);
  }

  function isValidDnaRegion(dnaRegionId) {
    for (const regions of Object.values(REGIONS)) {
      if (regions.some(r => r.id === dnaRegionId)) return true;
    }
    return false;
  }

  function isValidDnaCountry(dnaCountryId) {
    return COUNTRIES.some(c => c.id === dnaCountryId);
  }

  function getRegionDisplayName(dnaRegionId) {
    for (const regions of Object.values(REGIONS)) {
      const found = regions.find(r => r.id === dnaRegionId);
      if (found) return found.name;
    }
    return dnaRegionId;
  }

  function getCountryDisplayName(dnaCountryId) {
    const found = COUNTRIES.find(c => c.id === dnaCountryId);
    return found ? found.name : dnaCountryId;
  }

  // ══════════════════════════════════════════════════════════
  // MOCK SUPABASE
  // ══════════════════════════════════════════════════════════

  function createMockSupabase() {
    const tables = {
      wine_interactions: [],
      dna_accumulation: [],
      dna_timeline: [],
      wine_profiles: [],
    };
    let idCounter = 1;

    function findRows(table, filters) {
      return (tables[table] || []).filter(row => {
        for (const [col, val] of Object.entries(filters)) {
          if (row[col] !== val) return false;
        }
        return true;
      });
    }

    function buildChain(tableName) {
      let filters = {};
      let selectCols = "*";
      let orderCol = null;
      let orderAsc = true;
      let isSingle = false;
      let isDelete = false;
      let isUpdate = false;
      let isInsert = false;
      let isUpsert = false;
      let upsertOpts = {};
      let insertData = null;
      let updateData = null;

      const chain = {
        select(cols) { selectCols = cols || "*"; return chain; },
        eq(col, val) { filters[col] = val; return chain; },
        order(col, opts) { orderCol = col; orderAsc = opts ? opts.ascending !== false : true; return chain; },
        single() { isSingle = true; return chain.execute(); },
        then(resolve, reject) { return chain.execute().then(resolve, reject); },
        execute() {
          return Promise.resolve(executeSync());
        },
      };

      function executeSync() {
        if (isDelete) {
          const before = tables[tableName].length;
          tables[tableName] = tables[tableName].filter(row => {
            for (const [col, val] of Object.entries(filters)) {
              if (row[col] !== val) return true;
            }
            return false;
          });
          return { data: null, error: null, count: before - tables[tableName].length };
        }

        if (isUpdate) {
          const rows = findRows(tableName, filters);
          for (const row of rows) {
            Object.assign(row, updateData);
          }
          return { data: rows, error: null };
        }

        if (isInsert) {
          const newRow = { ...insertData, id: idCounter++ };
          if (!newRow.created_at) newRow.created_at = new Date().toISOString();
          tables[tableName].push(newRow);
          if (isSingle) return { data: newRow, error: null };
          if (selectCols !== "*") return { data: newRow, error: null };
          return { data: [newRow], error: null };
        }

        if (isUpsert) {
          const conflictCols = upsertOpts.onConflict ? upsertOpts.onConflict.split(",").map(c => c.trim()) : [];
          const conflictFilters = {};
          for (const col of conflictCols) {
            if (insertData[col] !== undefined) conflictFilters[col] = insertData[col];
          }
          const existing = conflictCols.length > 0 ? findRows(tableName, conflictFilters) : [];
          if (existing.length > 0) {
            Object.assign(existing[0], insertData);
            return { data: existing[0], error: null };
          } else {
            const newRow = { ...insertData, id: idCounter++ };
            tables[tableName].push(newRow);
            return { data: newRow, error: null };
          }
        }

        // Select
        let rows = findRows(tableName, filters);
        if (orderCol) {
          rows.sort((a, b) => {
            if (orderAsc) return a[orderCol] > b[orderCol] ? 1 : -1;
            return a[orderCol] < b[orderCol] ? 1 : -1;
          });
        }
        if (isSingle) {
          return { data: rows.length > 0 ? rows[0] : null, error: rows.length > 0 ? null : { code: "PGRST116" } };
        }
        return { data: rows, error: null };
      }

      // Override then to auto-execute for chained awaits without .single()
      chain[Symbol.for("nodejs.util.inspect.custom")] = () => "[MockChain]";

      return {
        chain,
        setInsert(data) { isInsert = true; insertData = data; },
        setUpdate(data) { isUpdate = true; updateData = data; },
        setDelete() { isDelete = true; },
        setUpsert(data, opts) { isUpsert = true; insertData = data; upsertOpts = opts || {}; },
      };
    }

    const supabase = {
      from(tableName) {
        const { chain, setInsert, setUpdate, setDelete, setUpsert } = buildChain(tableName);
        return {
          select(cols) { return chain.select(cols); },
          eq(col, val) { return chain.eq(col, val); },
          insert(data) { setInsert(data); return chain; },
          update(data) { setUpdate(data); return chain; },
          delete() { setDelete(); return chain; },
          upsert(data, opts) { setUpsert(data, opts); return chain; },
        };
      },
      _tables: tables,
      _reset() {
        tables.wine_interactions = [];
        tables.dna_accumulation = [];
        tables.dna_timeline = [];
        tables.wine_profiles = [];
        idCounter = 1;
      },
    };

    return supabase;
  }
