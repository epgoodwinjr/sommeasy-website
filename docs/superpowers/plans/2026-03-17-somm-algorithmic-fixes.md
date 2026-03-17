# Workstream 2a: The Somm — Algorithmic Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix deterministic scoring and curation bugs that produce bad recommendations — context-aware adventure, diversity constraints, sparkling detection, Vision enrichment, quality bonus, and combo scoring.

**Architecture:** All scoring/curation changes happen in `matchEngine.js`. Vision prompt enrichment in `route.js`. Page integration in `recommend/page.js`. The match engine's `scoreEntry` splits into text-based and vision-based paths. `curatePicks` gains `menuContext` and `userDNA` for smarter adventure selection and diversity enforcement.

**Tech Stack:** Next.js 14, vanilla JS (no TypeScript), wineUnified.json data, Claude Vision API (claude-sonnet-4-20250514)

**Spec:** `docs/superpowers/specs/2026-03-17-somm-algorithmic-fixes-design.md`

---

## Chunk 1: Score Entry & Data Threading

### Task 1: Enrich scoreEntry Return Object

Expose new fields on scored entries so curation logic can use them: `detectedVarietalIds` (plural array), `detectedProducer`, `detectedProducerId`, and `section`.

**Files:**
- Modify: `src/lib/matchEngine.js` — `scoreEntry` function (lines 553-694)

- [ ] **Step 1: Add producer name/ID extraction after detectWineAttributes**

In `scoreEntry`, after `const attrs = detectWineAttributes(entry.name);` (line 557), add producer extraction code. Insert after line 560 (`var detectedColor = attrs.color;`):

```js
  // Extract producer name and ID for diversity checks and quality bonus
  var detectedProducerName = null;
  var detectedProducerId = null;
  if (attrs.producerTerms.size > 0) {
    var firstProdTerm = Array.from(attrs.producerTerms)[0];
    var prodSearchEntry = SEARCH_INDEX.producerTerms.find(function(p) { return p.term === firstProdTerm; });
    detectedProducerName = prodSearchEntry ? prodSearchEntry.name : firstProdTerm;
    var prodLookupEntry = PRODUCER_LOOKUP[firstProdTerm];
    detectedProducerId = prodLookupEntry ? prodLookupEntry.producerId : null;
  }
```

- [ ] **Step 2: Add new fields to the return object**

Replace the return statement (lines 681-694) with:

```js
  return {
    name: entry.name,
    price: entry.price,
    originalLine: entry.originalLine,
    section: entry.section || null,
    score: score,
    matchReasons: matchReasons.sort(function(a, b) { return (b.weight || 0) - (a.weight || 0); }),
    detectedColor: detectedColor || entry.sectionColor || null,
    detectedRegionIds: Array.from(detectedRegionIds),
    detectedCountryIds: Array.from(detectedCountryIds),
    detectedCountry: detectedCountryIds.size > 0 ? Array.from(detectedCountryIds)[0] : null,
    detectedVarietalId: attrs.varietalIds.size > 0 ? Array.from(attrs.varietalIds)[0] : null,
    detectedVarietalIds: Array.from(attrs.varietalIds),
    detectedProducer: detectedProducerName,
    detectedProducerId: detectedProducerId,
    vintage: entry.vintage || null,
    visionData: entry.visionData || null,
  };
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Build succeeds. The new fields are additive — nothing downstream breaks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): enrich scoreEntry with detectedVarietalIds, detectedProducer, section"
```

---

### Task 2: Thread userDNA out of matchWinesAgainstDNA

`curatePicks` needs `userDNA` for adventure selection. Currently `userDNA` is local to `matchWinesAgainstDNA`. Change the return value to include it.

**Files:**
- Modify: `src/lib/matchEngine.js` — `matchWinesAgainstDNA` (lines 803-835)
- Modify: `src/app/recommend/page.js` — `runAnalysis` and `handleRefilter` callers

- [ ] **Step 1: Fix early return to match new shape**

On line 804, replace:

```js
  if (!dnaProfile || !entries.length) return [];
```

With:

```js
  if (!dnaProfile || !entries.length) return { scoredEntries: [], userDNA: null };
```

- [ ] **Step 2: Change matchWinesAgainstDNA main return**

Replace lines 833-834:

```js
  const bottleEntries = entries.filter(function(entry) { return !entry.isByTheGlass; });
  return bottleEntries.map(function(entry) { return scoreEntry(entry, userDNA, feedbackSignals || null); });
```

With:

```js
  const bottleEntries = entries.filter(function(entry) { return !entry.isByTheGlass; });
  const scored = bottleEntries.map(function(entry) { return scoreEntry(entry, userDNA, feedbackSignals || null); });
  return { scoredEntries: scored, userDNA: userDNA };
```

- [ ] **Step 3: Update recommend page — runAnalysis**

In `src/app/recommend/page.js`, find where `matchWinesAgainstDNA` is called in `runAnalysis` (around line 146). The current code is:

```js
const scored = matchWinesAgainstDNA(entries, dna);
```

Change to:

```js
const matchResult = matchWinesAgainstDNA(entries, dna);
const scored = matchResult.scoredEntries;
const matchedUserDNA = matchResult.userDNA;
```

Then where `curatePicks` is called (around line 151), add `userDNA` to options:

```js
const curated = curatePicks(scored, {
  minPrice: minP,
  maxPrice: maxP,
  colorPreference: colorP,
  maxPicks: pickCount,
  userDNA: matchedUserDNA,
});
```

Store `matchedUserDNA` in a ref or state so `handleRefilter` can access it.

- [ ] **Step 4: Update recommend page — handleRefilter**

`handleRefilter` re-calls `curatePicks` with existing `scoredEntries`. It needs `userDNA` too. Add to its `curatePicks` call:

```js
userDNA: userDNARef.current,
```

- [ ] **Step 5: Store userDNA in a ref**

Add a ref near the other refs in the component:

```js
const userDNARef = useRef(null);
```

In `runAnalysis`, after extracting `matchedUserDNA`, store it:

```js
userDNARef.current = matchedUserDNA;
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/matchEngine.js src/app/recommend/page.js
git commit -m "feat: thread userDNA from matchWinesAgainstDNA to curatePicks"
```

---

### Task 3: Add getQualityBonus Function

New function that looks up producer quality from WineMag data via two-hop lookup: PRODUCER_LOOKUP → PRODUCERS[regionId].

**Files:**
- Modify: `src/lib/matchEngine.js` — add new function before `scoreEntry`

- [ ] **Step 1: Add getQualityBonus function**

Insert before the `// SCORING` section header (before line 549):

```js
function getQualityBonus(producerName) {
  var normalized = producerName.toLowerCase().trim();
  var lookupEntry = PRODUCER_LOOKUP[normalized];

  if (!lookupEntry) return { bonus: 0, confidence: "unknown" };

  // Two-hop: lookup → regionId → PRODUCERS array → find by producerId
  var regionProducers = PRODUCERS[lookupEntry.regionId] || [];
  var producerData = regionProducers.find(function(p) { return p.id === lookupEntry.producerId; });

  if (!producerData) return { bonus: 0, confidence: "unknown" };

  var avgRating = producerData.avgRating || 0;
  var reviewCount = producerData.reviewCount || 0;

  // Rating-based bonus (tiebreaker, max 2.0)
  var ratingBonus = 0;
  if (avgRating >= 95) ratingBonus = 2.0;
  else if (avgRating >= 93) ratingBonus = 1.5;
  else if (avgRating >= 90) ratingBonus = 1.0;
  else if (avgRating >= 87) ratingBonus = 0.5;

  // Confidence modifier based on review count
  var confidence = "low";
  var confidenceMultiplier = 0.5;
  if (reviewCount >= 50) { confidence = "high"; confidenceMultiplier = 1.0; }
  else if (reviewCount >= 20) { confidence = "medium"; confidenceMultiplier = 0.8; }
  else if (reviewCount >= 5) { confidence = "low-medium"; confidenceMultiplier = 0.6; }

  var bonus = ratingBonus * confidenceMultiplier;

  return { bonus: Math.round(bonus * 10) / 10, confidence: confidence, avgRating: avgRating, reviewCount: reviewCount };
}
```

- [ ] **Step 2: Integrate quality bonus into scoreEntry**

In `scoreEntry`, after the feedback signals block (after line 679) and before the return statement, add:

```js
  // QUALITY BONUS — tiebreaker based on producer reputation (max +2.0)
  var qualityProducerName = detectedProducerName;
  if (qualityProducerName) {
    var quality = getQualityBonus(qualityProducerName);
    if (quality.bonus > 0) {
      score += quality.bonus;
      matchReasons.push({ type: "quality", label: quality.avgRating + " pts (" + quality.reviewCount + " reviews)", weight: quality.bonus });
    }
  }

  // ESTATE + REGION COMBO BONUS (+1 when both match)
  var hasEstateMatch = matchReasons.some(function(r) { return r.type === "estate"; });
  var hasRegionMatch = matchReasons.some(function(r) { return r.type === "region"; });
  if (hasEstateMatch && hasRegionMatch) {
    score += 1;
  }
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): add quality bonus from WineMag data and estate+region combo"
```

---

## Chunk 2: Curation Improvements

### Task 4: Add buildMenuContext and Wire into curatePicks

**Files:**
- Modify: `src/lib/matchEngine.js` — add `buildMenuContext`, update `curatePicks` signature

- [ ] **Step 1: Add buildMenuContext function**

Insert before `curatePicks` (before line 707):

```js
export function buildMenuContext(scoredEntries) {
  var countries = new Set();
  var regions = new Set();
  for (var i = 0; i < scoredEntries.length; i++) {
    var entry = scoredEntries[i];
    (entry.detectedCountryIds || []).forEach(function(c) { countries.add(c); });
    (entry.detectedRegionIds || []).forEach(function(r) { regions.add(r); });
  }
  return {
    totalWines: scoredEntries.length,
    distinctCountries: countries.size,
    distinctRegions: regions.size,
    countrySet: countries,
    regionSet: regions,
  };
}
```

- [ ] **Step 2: Update curatePicks to accept menuContext and userDNA**

At the top of `curatePicks` (line 708-711), add:

```js
  const menuContext = options.menuContext || null;
  const userDNA = options.userDNA || null;
```

- [ ] **Step 3: Update recommend page to compute and pass menuContext**

In `runAnalysis`, after scoring, add:

```js
const menuCtx = buildMenuContext(scored.filter(e => e.score > 0));
```

Pass to `curatePicks`:

```js
menuContext: menuCtx,
```

Do the same in `handleRefilter` — compute from existing `scoredEntries`:

```js
const menuCtx = buildMenuContext(scoredEntries.filter(e => e.score > 0));
```

Update the imports line in recommend/page.js. The current import (line 5) is:

```js
import { matchWinesAgainstDNA, curatePicks, getPickCount, parseWineList, formatWineName, getPickTypeInfo, getCountryFlag, getCountryName, getRegionDisplayName, getVarietalDisplayName } from "@/lib/matchEngine";
```

Add `buildMenuContext` and `isSparklingWine` to this import list.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchEngine.js src/app/recommend/page.js
git commit -m "feat(matchEngine): add buildMenuContext, wire menuContext and userDNA into curatePicks"
```

---

### Task 5: Add Diversity Constraints

**Files:**
- Modify: `src/lib/matchEngine.js` — add `wouldViolateDiversity`, rewrite `pickFrom`

- [ ] **Step 1: Add wouldViolateDiversity function**

Insert inside `curatePicks`, before `pickFrom` (before line 739):

```js
  function wouldViolateDiversity(candidate, existingPicks) {
    var candidateVarietals = candidate.detectedVarietalIds || [];
    var candidateRegions = candidate.detectedRegionIds || [];
    var candidateProducer = (candidate.detectedProducer || "").toLowerCase();

    var varietalOverlap = 0;
    var regionOverlap = 0;
    var producerMatch = false;

    for (var i = 0; i < existingPicks.length; i++) {
      var pick = existingPicks[i];
      if (candidateVarietals.some(function(v) { return (pick.detectedVarietalIds || []).indexOf(v) >= 0; })) {
        varietalOverlap++;
      }
      if (candidateRegions.some(function(r) { return (pick.detectedRegionIds || []).indexOf(r) >= 0; })) {
        regionOverlap++;
      }
      var pickProducer = (pick.detectedProducer || "").toLowerCase();
      if (candidateProducer && pickProducer && candidateProducer === pickProducer) {
        producerMatch = true;
      }
    }

    return varietalOverlap >= 2 || regionOverlap >= 2 || producerMatch;
  }
```

- [ ] **Step 2: Rewrite pickFrom with diversity-first logic**

Replace the current `pickFrom` (lines 739-745) with:

```js
  function pickFrom(subset, type) {
    // First pass: respect diversity constraints
    for (var i = 0; i < subset.length; i++) {
      var idx = matched.indexOf(subset[i]);
      if (idx >= 0 && !used.has(idx) && !wouldViolateDiversity(subset[i], picks)) {
        used.add(idx);
        picks.push(Object.assign({}, subset[i], { pickType: type }));
        return true;
      }
    }
    // Fallback: if ALL candidates violate diversity, take the best one
    for (var i = 0; i < subset.length; i++) {
      var idx = matched.indexOf(subset[i]);
      if (idx >= 0 && !used.has(idx)) {
        used.add(idx);
        picks.push(Object.assign({}, subset[i], { pickType: type }));
        return true;
      }
    }
    return false;
  }
```

- [ ] **Step 3: Add diversity check to wildcard fill loop**

Replace the wildcard loop (lines 789-793):

```js
  // 5. WILDCARD — fill remaining slots from budget pool, respecting diversity
  for (var i = 0; i < mainPool.length && picks.length < maxPicks; i++) {
    var idx = matched.indexOf(mainPool[i]);
    if (idx >= 0 && !used.has(idx) && !wouldViolateDiversity(mainPool[i], picks)) {
      used.add(idx);
      picks.push(Object.assign({}, mainPool[i], { pickType: "wildcard" }));
    }
  }
  // Second pass fallback: if diversity prevented filling, allow duplicates
  for (var i = 0; i < mainPool.length && picks.length < maxPicks; i++) {
    var idx = matched.indexOf(mainPool[i]);
    if (idx >= 0 && !used.has(idx)) {
      used.add(idx);
      picks.push(Object.assign({}, mainPool[i], { pickType: "wildcard" }));
    }
  }
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): add diversity constraints — max 2 varietal, 2 region, 1 producer"
```

---

### Task 6: Add isSparklingWine and Replace Color Filter

**Files:**
- Modify: `src/lib/matchEngine.js` — add `isSparklingWine`, replace color filter in `curatePicks`

- [ ] **Step 1: Add isSparklingWine function**

Insert before `curatePicks` (after `buildMenuContext`, before `curatePicks`):

```js
export function isSparklingWine(entry) {
  var name = (entry.name || "").toLowerCase();
  var section = (entry.section || "").toLowerCase();
  var variety = (entry.visionData && entry.visionData.variety ? entry.visionData.variety : "").toLowerCase();
  var visionColor = (entry.visionData && entry.visionData.color ? entry.visionData.color : "").toLowerCase();
  var detectedColor = (entry.detectedColor || "").toLowerCase();

  // Already detected as sparkling by scorer or Vision
  if (detectedColor === "sparkling") return true;
  if (visionColor === "sparkling") return true;

  // Section header indicates sparkling
  if (/sparkling|champagne|bubbles|fizz|pétillant|spumante|mousseux/.test(section)) return true;

  // Name contains sparkling indicators
  var sparklingTerms = [
    "champagne", "cava", "prosecco", "crémant", "cremant",
    "brut", "blanc de blancs", "blanc de noirs",
    "méthode traditionnelle", "methode cap classique", "mcc",
    "sekt", "spumante", "franciacorta", "asti",
    "pétillant naturel", "pet-nat", "ancestrale"
  ];
  for (var i = 0; i < sparklingTerms.length; i++) {
    if (name.indexOf(sparklingTerms[i]) >= 0) return true;
  }

  // Variety indicates sparkling
  if (/champagne blend|sparkling/.test(variety)) return true;

  return false;
}
```

- [ ] **Step 2: Replace the color filter block in curatePicks**

Replace lines 714-721 (the current color filter) with:

```js
  if (colorPreference && colorPreference !== "all") {
    var filtered;
    if (colorPreference === "sparkling") {
      filtered = pool.filter(function(e) { return isSparklingWine(e); });
    } else if (colorPreference === "white") {
      filtered = pool.filter(function(e) { return !isSparklingWine(e) && (!e.detectedColor || e.detectedColor === "white"); });
    } else if (colorPreference === "red") {
      filtered = pool.filter(function(e) { return !isSparklingWine(e) && (!e.detectedColor || e.detectedColor === "red"); });
    } else {
      filtered = pool.filter(function(e) {
        if (!e.detectedColor) return true;
        return e.detectedColor === colorPreference;
      });
    }
    if (filtered.length >= 3) pool = filtered;
  }
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): add multi-signal isSparklingWine and improved color filters"
```

---

### Task 7: Replace Adventure Logic with Tiered Selection

**Files:**
- Modify: `src/lib/matchEngine.js` — replace adventure block in `curatePicks`

**Important context:** `userDNA.estateNames` is a Set of lowercase name strings (e.g., `"kanonkop"`), NOT producer IDs. The fields `userDNA.countries`, `userDNA.regions`, and `userDNA.varietals` are already Sets.

- [ ] **Step 1: Replace the adventure selection block**

Replace lines 781-787 (the current adventure block):

```js
  // 4. ADVENTURE — matches varietal but not direct region, within budget
  const adv = mainPool.filter(function(e) {
    const hasVarietal = e.matchReasons.some(function(r) { return r.type === "varietal"; });
    const hasDirectRegion = e.matchReasons.some(function(r) { return r.type === "region"; });
    return e.score >= 1 && hasVarietal && !hasDirectRegion;
  }).sort(function(a, b) { return b.score - a.score; });
  pickFrom(adv, "adventure");
```

With the tiered adventure logic:

```js
  // 4. ADVENTURE — context-aware tiered selection
  if (userDNA && menuContext) {
    var adventureFound = false;

    // Tier 1: Diverse international menu (5+ countries) → different country
    if (!adventureFound && menuContext.distinctCountries >= 5) {
      var advTier1 = mainPool.filter(function(e) {
        if (e.score < 1) return false;
        var fromUserCountry = (e.detectedCountryIds || []).some(function(cId) { return userDNA.countries.has(cId); });
        return !fromUserCountry && e.matchReasons.length > 0;
      }).sort(function(a, b) { return b.score - a.score; });
      if (advTier1.length > 0) adventureFound = pickFrom(advTier1, "adventure");
    }

    // Tier 2: Limited country diversity (2-4) → different region
    if (!adventureFound && menuContext.distinctCountries >= 2) {
      var advTier2 = mainPool.filter(function(e) {
        if (e.score < 1) return false;
        var fromUserRegion = (e.detectedRegionIds || []).some(function(rId) { return userDNA.regions.has(rId); });
        return !fromUserRegion && e.matchReasons.length > 0;
      }).sort(function(a, b) { return b.score - a.score; });
      if (advTier2.length > 0) adventureFound = pickFrom(advTier2, "adventure");
    }

    // Tier 3: Single-country menu → different varietal
    if (!adventureFound && menuContext.distinctCountries === 1) {
      var advTier3 = mainPool.filter(function(e) {
        if (e.score < 1) return false;
        var fromUserVarietal = (e.detectedVarietalIds || []).some(function(vId) { return userDNA.varietals.has(vId); });
        return !fromUserVarietal;
      }).sort(function(a, b) { return b.score - a.score; });
      if (advTier3.length > 0) adventureFound = pickFrom(advTier3, "adventure");
    }

    // Tier 4: Skip adventure if nothing qualifies
  } else {
    // Fallback: original logic if no userDNA/menuContext (shouldn't happen but safe)
    var adv = mainPool.filter(function(e) {
      var hasVarietal = e.matchReasons.some(function(r) { return r.type === "varietal"; });
      var hasDirectRegion = e.matchReasons.some(function(r) { return r.type === "region"; });
      return e.score >= 1 && hasVarietal && !hasDirectRegion;
    }).sort(function(a, b) { return b.score - a.score; });
    pickFrom(adv, "adventure");
  }
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): context-aware tiered adventure selection based on menu diversity"
```

---

## Chunk 3: Vision Enrichment & Page Integration

### Task 8: Enrich Vision Extraction Prompt

**Files:**
- Modify: `src/app/api/parse-wine-list/route.js` — update `EXTRACTION_PROMPT` and JSON example

- [ ] **Step 1: Add new extraction fields to prompt**

In the `EXTRACTION_PROMPT` string, after the `- color:` line (line 14), add:

```
- variety: Primary grape variety if identifiable (e.g., "Pinot Noir", "Chardonnay"). For blends, state "blend" or list components if known. null if unknown.
- region: Specific wine region if identifiable (e.g., "Bordeaux", "Napa Valley", "Stellenbosch"). null if unknown.
- country: Country of origin if identifiable. null if unknown.
- producer: Producer/winery/estate name, separated from the wine name where possible. null if not distinguishable.
```

- [ ] **Step 2: Update the JSON example in the prompt**

Replace the example JSON object to include the new fields:

```json
{
  "wines": [
    {
      "name": "Château Margaux, Margaux 2015",
      "vintage": "2015",
      "price": 450,
      "section": "Bordeaux",
      "is_btg": false,
      "color": "red",
      "variety": "Cabernet Sauvignon blend",
      "region": "Bordeaux",
      "country": "France",
      "producer": "Château Margaux"
    }
  ],
  "metadata": {
    "total_wines": 45,
    "sections": ["Sparkling", "White Wine", "Red Wine"],
    "has_btg_section": true,
    "image_quality": "good"
  }
}
```

- [ ] **Step 3: Increase max_tokens**

The response now includes more fields per wine. Change `max_tokens: 4096` (line 89) to `max_tokens: 8192` to accommodate larger lists with enriched data.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/parse-wine-list/route.js
git commit -m "feat(vision): enrich extraction prompt with variety, region, country, producer"
```

---

### Task 9: Build scoreEntryFromVision and Dual Scoring Path

Split `scoreEntry` into a router that delegates to `scoreEntryFromText` (existing logic) or `scoreEntryFromVision` (new, uses Vision metadata directly).

**Files:**
- Modify: `src/lib/matchEngine.js` — rename `scoreEntry` → `scoreEntryFromText`, add `scoreEntryFromVision`, add routing `scoreEntry`

**Important context:** `userDNA.estateNames` is a Set of lowercase producer name strings. When checking estate match in the Vision path, normalize `visionData.producer` to lowercase and check against `userDNA.estateNames`, NOT against producer IDs.

- [ ] **Step 1: Rename current scoreEntry to scoreEntryFromText**

Change the function name on line 553 from `function scoreEntry(` to `function scoreEntryFromText(`.

- [ ] **Step 2: Add scoreEntryFromVision function**

Insert after `scoreEntryFromText` (after its closing `}`), before the `// CURATE 5 PICKS` section:

```js
function scoreEntryFromVision(entry, userDNA, feedbackSignals) {
  var score = 0;
  var matchReasons = [];
  var vd = entry.visionData;

  // PRODUCER (weight: 5) — use visionData.producer against estateNames
  var detectedProducerName = vd.producer || null;
  var detectedProducerId = null;
  if (detectedProducerName) {
    var prodNorm = detectedProducerName.toLowerCase().trim();
    var prodLookup = PRODUCER_LOOKUP[prodNorm];
    if (prodLookup) {
      detectedProducerId = prodLookup.producerId;
    }
    // Check against userDNA.estateNames (Set of lowercase name strings)
    if (userDNA.estateNames.has(prodNorm)) {
      score += 5;
      matchReasons.push({ type: "estate", label: detectedProducerName, weight: 5 });
    }
  }

  // REGION (weight: 3 direct, 1 adjacent)
  var detectedRegionIds = [];
  var detectedCountryIds = [];
  if (vd.region) {
    var regionNorm = vd.region.toLowerCase().trim();
    var regionEntry = REGION_LOOKUP[regionNorm];
    if (regionEntry) {
      detectedRegionIds.push(regionEntry.regionId);
      detectedCountryIds.push(regionEntry.country);
      if (userDNA.regions.has(regionEntry.regionId)) {
        score += 3;
        matchReasons.push({ type: "region", label: regionEntry.regionId, weight: 3 });
      } else if (userDNA.countries.has(regionEntry.country)) {
        score += 1;
        var cName = COUNTRIES.find(function(c) { return c.id === regionEntry.country; });
        matchReasons.push({ type: "country_region", label: regionNorm + " (you like " + (cName ? cName.name : regionEntry.country) + ")", weight: 1 });
      }
    }
  }

  // COUNTRY (weight: 1, only if no region already scored)
  if (vd.country) {
    var countryNorm = vd.country.toLowerCase().trim();
    // Map full country name to ID
    var countryObj = COUNTRIES.find(function(c) { return c.name.toLowerCase() === countryNorm || c.id === countryNorm; });
    var countryId = countryObj ? countryObj.id : countryNorm;
    if (detectedCountryIds.indexOf(countryId) < 0) detectedCountryIds.push(countryId);
    if (!matchReasons.some(function(r) { return r.type === "region" || r.type === "country_region"; })) {
      if (userDNA.countries.has(countryId)) {
        score += 1;
        matchReasons.push({ type: "country", label: countryObj ? countryObj.name : countryId, weight: 1 });
      }
    }
  }

  // VARIETAL (weight: 2)
  var detectedVarietalIds = [];
  if (vd.variety) {
    var varietyLower = vd.variety.toLowerCase().trim();
    // Handle blend format: "Cabernet Sauvignon-Merlot blend" → try first grape
    var varietyTerms = [varietyLower];
    if (varietyLower.indexOf("blend") >= 0) {
      var parts = varietyLower.replace(/\s*blend\s*/g, "").split(/[-,\/]/);
      for (var vi = 0; vi < parts.length; vi++) {
        var pt = parts[vi].trim();
        if (pt.length >= 3) varietyTerms.push(pt);
      }
    }
    for (var vi = 0; vi < varietyTerms.length; vi++) {
      var vTerm = varietyTerms[vi];
      var varLookup = VARIETAL_LOOKUP[vTerm];  // Values are varietal ID strings
      var varId = varLookup || null;
      if (!varId) {
        var foundVar = VARIETALS.find(function(v) { return v.name.toLowerCase() === vTerm; });
        if (foundVar) varId = foundVar.id;
      }
      if (varId && detectedVarietalIds.indexOf(varId) < 0) {
        detectedVarietalIds.push(varId);
        if (userDNA.varietals.has(varId)) {
          score += 2;
          var varEntry = VARIETALS.find(function(v) { return v.id === varId; });
          matchReasons.push({ type: "varietal", label: varEntry ? varEntry.name : varId, weight: 2 });
        }
      }
    }
  }

  // FAVORITE WINE (weight: 10) — same as text path
  var text = " " + entry.name.toLowerCase() + " ";
  for (var fi = 0; fi < userDNA.specificWines.length; fi++) {
    var fav = userDNA.specificWines[fi];
    if (fav.length >= 4 && text.indexOf(fav.toLowerCase()) >= 0) {
      score += 10;
      matchReasons.push({ type: "favorite", label: fav, weight: 10 });
    }
  }

  // FEEDBACK SIGNALS — reuse same logic as text path
  if (feedbackSignals) {
    // Suppress specific wines
    for (var si = 0; si < feedbackSignals.suppressedWineNames.length; si++) {
      var suppressed = feedbackSignals.suppressedWineNames[si];
      if (suppressed.length >= 4 && text.indexOf(suppressed.toLowerCase()) >= 0) {
        var favIdx = matchReasons.findIndex(function(r) { return r.type === "favorite"; });
        if (favIdx >= 0) { score -= matchReasons[favIdx].weight; matchReasons.splice(favIdx, 1); }
        score -= 5;
        matchReasons.push({ type: "feedback_suppress", label: "You didn't enjoy this wine", weight: -5 });
      }
    }
    // Boosted/suppressed regions
    for (var ri = 0; ri < detectedRegionIds.length; ri++) {
      var regId = detectedRegionIds[ri];
      var rBoost = feedbackSignals.boostedRegions.get(regId);
      if (rBoost) { score += rBoost.weight; matchReasons.push({ type: "feedback_boost", label: "You " + (rBoost.weight >= 2 ? "loved" : "liked") + " wines from this region", weight: rBoost.weight }); }
      if (feedbackSignals.suppressedRegions.has(regId)) { score -= 2; matchReasons.push({ type: "feedback_suppress", label: "Similar region to a wine you didn't enjoy", weight: -2 }); }
    }
    // Boosted/suppressed varietals
    for (var vsi = 0; vsi < detectedVarietalIds.length; vsi++) {
      var varIdFb = detectedVarietalIds[vsi];
      var vBoost = feedbackSignals.boostedVarietals.get(varIdFb);
      if (vBoost) { score += vBoost.weight; matchReasons.push({ type: "feedback_boost", label: "You " + (vBoost.weight >= 2 ? "loved" : "liked") + " wines with this grape", weight: vBoost.weight }); }
      if (feedbackSignals.suppressedVarietals.has(varIdFb)) { score -= 2; matchReasons.push({ type: "feedback_suppress", label: "Similar grape to a wine you didn't enjoy", weight: -2 }); }
    }
    // Boosted/suppressed producers
    if (detectedProducerName) {
      var pTerm = detectedProducerName.toLowerCase().trim();
      var pBoost = feedbackSignals.boostedProducers.get(pTerm);
      if (pBoost) { score += pBoost.weight; matchReasons.push({ type: "feedback_boost", label: "You've enjoyed this producer before", weight: pBoost.weight }); }
      if (feedbackSignals.suppressedProducers.has(pTerm)) { score -= 3; matchReasons.push({ type: "feedback_suppress", label: "You didn't enjoy this producer", weight: -3 }); }
    }
  }

  // QUALITY BONUS
  var qualityProdName = detectedProducerName;
  if (qualityProdName) {
    var quality = getQualityBonus(qualityProdName);
    if (quality.bonus > 0) {
      score += quality.bonus;
      matchReasons.push({ type: "quality", label: quality.avgRating + " pts (" + quality.reviewCount + " reviews)", weight: quality.bonus });
    }
  }

  // ESTATE + REGION COMBO
  var hasEstate = matchReasons.some(function(r) { return r.type === "estate"; });
  var hasRegion = matchReasons.some(function(r) { return r.type === "region"; });
  if (hasEstate && hasRegion) score += 1;

  var detectedColor = vd.color || entry.sectionColor || null;

  return {
    name: entry.name,
    price: entry.price,
    originalLine: entry.originalLine,
    section: entry.section || null,
    score: score,
    matchReasons: matchReasons.sort(function(a, b) { return (b.weight || 0) - (a.weight || 0); }),
    detectedColor: detectedColor,
    detectedRegionIds: detectedRegionIds,
    detectedCountryIds: detectedCountryIds,
    detectedCountry: detectedCountryIds.length > 0 ? detectedCountryIds[0] : null,
    detectedVarietalId: detectedVarietalIds.length > 0 ? detectedVarietalIds[0] : null,
    detectedVarietalIds: detectedVarietalIds,
    detectedProducer: detectedProducerName,
    detectedProducerId: detectedProducerId,
    vintage: (vd.vintage || entry.vintage || null),
    visionData: entry.visionData,
  };
}
```

- [ ] **Step 3: Add routing scoreEntry function**

Insert after `scoreEntryFromVision`, before the `// CURATE 5 PICKS` section:

```js
function scoreEntry(entry, userDNA, feedbackSignals) {
  if (entry.visionData && entry.visionData.region) {
    return scoreEntryFromVision(entry, userDNA, feedbackSignals);
  }
  return scoreEntryFromText(entry, userDNA, feedbackSignals);
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): add scoreEntryFromVision with dual scoring path"
```

---

### Task 10: Update Recommend Page — Vision Entry Mapping & Restaurant Context

**Files:**
- Modify: `src/app/recommend/page.js` — Vision entry mapping, interaction saves
- Create: `supabase/migrations/004_add_source_columns.sql`

- [ ] **Step 1: Update Vision Path A entry mapping**

Find the Vision entry mapping in `runAnalysis` (around line 221-230). Replace with:

```js
const entries = data.wines.map(w => ({
  name: w.name || "",
  price: typeof w.price === "number" ? w.price : null,
  originalLine: w.name || "",
  section: w.section || null,
  isByTheGlass: w.is_btg || false,
  sectionColor: w.color || null,
  sectionVarietal: null,
  vintage: w.vintage || null,
  visionData: {
    color: w.color || null,
    variety: w.variety || null,
    region: w.region || null,
    country: w.country || null,
    producer: w.producer || null,
    vintage: w.vintage || null,
  },
}));
```

- [ ] **Step 2: Update handleRatePick to include source context**

Find `handleRatePick` (around line 327-336). Add `source_url` and `source_label` to the upsert:

```js
source_url: extractedFrom === "url" ? menuUrl : (extractedFrom === "scan" ? "photo_scan" : "text_paste"),
source_label: null,
```

Add these fields after `rating: rating,` and before `updated_at:`.

- [ ] **Step 3: Create Supabase migration file**

```sql
-- Add restaurant context columns to wine_interactions
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS source_label TEXT;
```

Save to `supabase/migrations/004_add_source_columns.sql`.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/recommend/page.js supabase/migrations/004_add_source_columns.sql
git commit -m "feat(recommend): pass Vision metadata to scorer, add restaurant context to interactions"
```

---

### Task 11: Final Build Verification

- [ ] **Step 1: Full build**

```bash
npm run build
```

Verify all 14 pages generate successfully with no errors.

- [ ] **Step 2: Check exports**

Verify that `buildMenuContext` and `isSparklingWine` are exported from matchEngine.js (used by the imports in recommend/page.js).

- [ ] **Step 3: Commit any final fixes if needed**
