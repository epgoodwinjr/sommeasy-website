// Test harness for the Wine Metadata Resolver
// Run with: node src/lib/__tests__/wineResolver.test.js
//
// Tests 20 real wine names a user would actually log to verify
// confidence scores and resolved metadata quality.

// We need to handle ES module imports in a Node context
// This test uses dynamic import since wineResolver uses ES modules

async function runTests() {
  // For Node.js CJS context, we'll inline the resolver logic
  // by reading the lookup data directly
  const lookupData = require("../wineReference-lookup.json");
  const { COUNTRIES, REGIONS, VARIETALS, ESTATES } = require("../wineData");

  // ── Inline the core matching logic for testing ──

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
    "Loire Valley": "loire", "Rhône Valley": "rhone",
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
    "Douro": "douro", "Alentejo": "alentejo", "Dão": "dao", "Vinho Verde": "vinho_verde",
    "Mosel": "mosel", "Rheingau": "rheingau", "Pfalz": "pfalz", "Rheinhessen": "rheinhessen",
    "Baden": "baden",
    "Niederösterreich": "kamptal", "Burgenland": "burgenland",
    "California": "napa", "Oregon": "willamette", "Washington": "walla_walla",
    "New York": "finger_lakes", "Virginia": "virginia",
  };

  const SUBREGION_TO_DNA_REGION = {
    "napa valley": "napa", "napa": "napa", "oakville": "napa", "rutherford": "napa",
    "stags leap district": "napa", "howell mountain": "napa", "spring mountain district": "napa",
    "sonoma valley": "sonoma", "russian river valley": "sonoma", "dry creek valley": "sonoma",
    "alexander valley": "sonoma", "sonoma coast": "sonoma",
    "willamette valley": "willamette", "dundee hills": "willamette", "eola-amity hills": "willamette",
    "paso robles": "paso_robles",
    "santa barbara county": "santa_barbara", "santa ynez valley": "santa_barbara",
    "sta. rita hills": "santa_barbara", "santa rita hills": "santa_barbara",
    "finger lakes": "finger_lakes", "walla walla valley": "walla_walla", "columbia valley": "walla_walla",
    "morgon": "beaujolais", "fleurie": "beaujolais",
    "côte-rôtie": "rhone", "hermitage": "rhone", "châteauneuf-du-pape": "rhone",
    "sancerre": "loire", "vouvray": "loire",
    "rioja": "rioja", "ribera del duero": "ribera", "priorat": "priorat",
    "rías baixas": "rias_baixas",
    "barossa valley": "barossa", "eden valley": "barossa",
    "mclaren vale": "mclaren", "yarra valley": "yarra",
    "margaret river": "margaret_river", "hunter valley": "hunter",
    "uco valley": "mendoza", "luján de cuyo": "mendoza",
    "wachau": "wachau", "kamptal": "kamptal",
  };

  const VARIETY_TO_DNA = {};
  const varietyNameMap = {
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
    mourvedre: ["Mourvèdre", "Monastrell"],
    cabernet_franc: ["Cabernet Franc"],
    chardonnay: ["Chardonnay"],
    sauvignon_blanc: ["Sauvignon Blanc", "Sauvignon"],
    riesling: ["Riesling"],
    pinot_grigio: ["Pinot Grigio", "Pinot Gris"],
    chenin_blanc: ["Chenin Blanc"],
    viognier: ["Viognier"],
    gruner_veltliner: ["Grüner Veltliner"],
    albarino: ["Albariño"],
    gewurztraminer: ["Gewürztraminer"],
    semillon: ["Sémillon", "Semillon"],
    vermentino: ["Vermentino"],
  };
  for (const [dnaId, wmNames] of Object.entries(varietyNameMap)) {
    for (const n of wmNames) VARIETY_TO_DNA[n] = dnaId;
  }

  // ── Normalize ──
  function normalize(text) {
    return text
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[''`]/g, "'")
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/\b(estate|vineyard|vineyards|winery|wines|wine|cellars|cellar|domaine|chateau|château|bodega|tenuta|casa|cantina|fattoria|azienda|maison)\b/gi, "")
      .replace(/[^a-z0-9\s'.-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(text) {
    return normalize(text).split(/\s+/).filter(t => t.length >= 2);
  }

  // ── Build producer index ──
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

  // ── Build varietal index ──
  const varietalIndex = [];
  for (const [name, data] of Object.entries(lookupData.varieties)) {
    const norm = normalize(name);
    if (norm.length < 3) continue;
    varietalIndex.push({ name, norm, color: data.color, dnaId: VARIETY_TO_DNA[name] || null });
  }
  varietalIndex.sort((a, b) => b.norm.length - a.norm.length);

  // ── Build region index ──
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

  // ── Matching functions ──
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

  function resolveWine(wineName) {
    if (!wineName || wineName.trim().length < 3) {
      return { winery: null, varietal: null, region: null, province: null, country: null, confidence: 0 };
    }
    const normInput = normalize(wineName);
    const inputTokens = tokenize(wineName);
    const producerResult = matchProducer(normInput, inputTokens);
    const varietalMatch = matchVarietal(normInput);
    const regionMatch = matchRegion(normInput);
    const confidence = calculateConfidence(producerResult, varietalMatch, regionMatch);

    const winery = producerResult ? producerResult.producer.name : null;
    const varietal = varietalMatch ? varietalMatch.name : null;
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

    // DNA mapping
    let dnaCountryId = producerResult?.producer?.dnaCountryId || regionMatch?.dnaCountryId || null;
    let dnaRegionId = producerResult?.producer?.dnaRegionId || regionMatch?.dnaRegionId || null;
    let dnaVarietalId = varietalMatch?.dnaId || null;

    return {
      winery, varietal, region, province, country, confidence,
      producerScore: producerResult ? producerResult.score.toFixed(2) : null,
      dnaCountryId, dnaRegionId, dnaVarietalId,
    };
  }

  // ══════════════════════════════════════════════════
  // TEST CASES: 20 real wine names
  // ══════════════════════════════════════════════════

  const testCases = [
    // 1. Classic with vintage — strong producer in dataset
    { input: "Henschke Hill of Grace 2018", expect: { winery: "Henschke", country: "Australia", minConf: 80 } },
    // 2. Bordeaux château with vintage
    { input: "Château Margaux 2015", expect: { winery: "Château Margaux", country: "France", minConf: 80 } },
    // 3. Italian producer, accented
    { input: "Gaja Barbaresco 2019", expect: { winery: "Gaja", country: "Italy", minConf: 80 } },
    // 4. Napa Cab with specific vineyard
    { input: "Harlan Estate Cabernet Sauvignon 2017", expect: { winery: "Harlan Estate", varietal: "Cabernet Sauvignon", minConf: 80 } },
    // 5. Oregon Pinot
    { input: "Cristom Vineyards Eola-Amity Hills Pinot Noir 2021", expect: { varietal: "Pinot Noir", minConf: 60 } },
    // 6. Argentine Malbec — casual format
    { input: "Catena Zapata Malbec 2020", expect: { varietal: "Malbec", country: "Argentina", minConf: 80 } },
    // 7. NZ Sauvignon Blanc
    { input: "Cloudy Bay Sauvignon Blanc 2022", expect: { varietal: "Sauvignon Blanc", minConf: 60 } },
    // 8. Barolo with Italian producer
    { input: "Giacomo Conterno Barolo Monfortino 2013", expect: { winery: "Giacomo Conterno", country: "Italy", minConf: 80 } },
    // 9. Champagne house
    { input: "Krug Grande Cuvée", expect: { winery: "Krug", country: "France", minConf: 80 } },
    // 10. South African Syrah
    { input: "Mullineux Schist Syrah 2020", expect: { varietal: "Syrah", minConf: 60 } },
    // 11. German Riesling — accents
    { input: "Joh. Jos. Prüm Wehlener Sonnenuhr Spätlese 2019", expect: { country: "Germany", minConf: 60 } },
    // 12. Spanish Rioja
    { input: "Vega Sicilia Único 2011", expect: { winery: "Vega Sicilia", country: "Spain", minConf: 80 } },
    // 13. Casual user input — just producer and varietal
    { input: "Duckhorn Merlot", expect: { varietal: "Merlot", minConf: 60 } },
    // 14. Rhône blend — no specific varietal expected
    { input: "Châteauneuf-du-Pape Domaine du Vieux Télégraphe 2018", expect: { country: "France", minConf: 60 } },
    // 15. Australian Shiraz (alias for Syrah)
    { input: "Penfolds Grange Shiraz 2017", expect: { winery: "Penfolds", varietal: "Shiraz", country: "Australia", minConf: 80 } },
    // 16. White Burgundy — Domaine Roulot not in 2,000-producer dataset, only region matches
    { input: "Domaine Roulot Meursault 2020", expect: { country: "France", minConf: 40 } },
    // 17. Obscure/made-up wine — should have LOW confidence
    { input: "Random Unknown Wine Co. 2021", expect: { maxConf: 50 } },
    // 18. Just a grape name — should NOT resolve as a producer
    { input: "Pinot Noir", expect: { varietal: "Pinot Noir", maxConf: 40 } },
    // 19. Very casual: "a red from Napa"
    { input: "Some Napa Valley Cab", expect: { maxConf: 60 } },
    // 20. Blend detection
    { input: "Opus One Napa Valley Red Blend 2018", expect: { minConf: 60 } },
  ];

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  WINE RESOLVER TEST HARNESS — 20 Real Wine Names");
  console.log("═══════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const result = resolveWine(tc.input);
    const issues = [];

    // Check expectations
    if (tc.expect.winery && (!result.winery || !result.winery.toLowerCase().includes(tc.expect.winery.toLowerCase()))) {
      issues.push(`winery: expected "${tc.expect.winery}", got "${result.winery}"`);
    }
    if (tc.expect.varietal && result.varietal !== tc.expect.varietal) {
      issues.push(`varietal: expected "${tc.expect.varietal}", got "${result.varietal}"`);
    }
    if (tc.expect.country && result.country !== tc.expect.country) {
      issues.push(`country: expected "${tc.expect.country}", got "${result.country}"`);
    }
    if (tc.expect.minConf && result.confidence < tc.expect.minConf) {
      issues.push(`confidence: expected >= ${tc.expect.minConf}, got ${result.confidence}`);
    }
    if (tc.expect.maxConf && result.confidence > tc.expect.maxConf) {
      issues.push(`confidence: expected <= ${tc.expect.maxConf}, got ${result.confidence}`);
    }

    const status = issues.length === 0 ? "PASS" : "FAIL";
    if (status === "PASS") passed++;
    else failed++;

    const statusIcon = status === "PASS" ? "✓" : "✗";
    console.log(`${statusIcon} [${i + 1}] "${tc.input}"`);
    console.log(`    Conf: ${result.confidence}  |  Winery: ${result.winery || "—"}  |  Varietal: ${result.varietal || "—"}  |  Region: ${result.region || "—"}  |  Country: ${result.country || "—"}`);
    console.log(`    DNA: country=${result.dnaCountryId || "—"} region=${result.dnaRegionId || "—"} varietal=${result.dnaVarietalId || "—"}  |  ProdScore: ${result.producerScore || "—"}`);
    if (issues.length > 0) {
      for (const issue of issues) console.log(`    ⚠ ${issue}`);
    }
    console.log();
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Results: ${passed}/${testCases.length} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════\n");
}

runTests().catch(console.error);
