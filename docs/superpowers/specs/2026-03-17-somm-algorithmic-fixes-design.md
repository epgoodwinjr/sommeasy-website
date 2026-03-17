# Workstream 2a: The Somm — Algorithmic Fixes — Design Spec

**Date:** 2026-03-17
**Scope:** Deterministic scoring and curation fixes in the match engine, Vision prompt enrichment, and restaurant context capture.
**Files affected:** `src/lib/matchEngine.js`, `src/app/api/parse-wine-list/route.js`, `src/app/recommend/page.js`

**Naming Convention:**
- The Palate = DNA profile system (quiz, profile engine, DNA Evolution, archetypes)
- The Somm = matching and recommendation system (scoring, curation, storytelling)

---

## Fix 1: Context-Aware Adventure Logic

### Problem
Adventure is currently defined as "has varietal match but no direct region match." This lets SA wines qualify as Adventure for SA-loving users. A $65 Chenin Blanc from Kaapzicht should not be an "Adventure" for someone who selected South Africa and Chenin Blanc.

### Building the Menu Context

After scoring all entries but before curation, compute menu context:

```js
function buildMenuContext(scoredEntries) {
  const countries = new Set();
  const regions = new Set();
  for (const entry of scoredEntries) {
    (entry.detectedCountryIds || []).forEach(c => countries.add(c));
    (entry.detectedRegionIds || []).forEach(r => regions.add(r));
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

Pass `menuContext` into `curatePicks` via `options.menuContext`.

### Tiered Adventure Selection

```js
function selectAdventure(matched, userDNA, menuContext, picks) {
  const { distinctCountries } = menuContext;

  // Tier 1: Diverse international menu (5+ countries)
  // Adventure = wine from a country the user has NOT selected
  if (distinctCountries >= 5) {
    const pool = matched.filter(e => {
      if (e.score < 1) return false;
      const fromUserCountry = (e.detectedCountryIds || []).some(
        cId => userDNA.countries.has(cId)
      );
      return !fromUserCountry && e.matchReasons.length > 0;
    });
    if (pool.length > 0) return pickWithDiversity(pool, picks, "adventure");
  }

  // Tier 2: Limited country diversity (2-4 countries)
  // Adventure = wine from a region the user has NOT selected
  if (distinctCountries >= 2) {
    const pool = matched.filter(e => {
      if (e.score < 1) return false;
      const fromUserRegion = (e.detectedRegionIds || []).some(
        rId => userDNA.regions.has(rId)
      );
      return !fromUserRegion && e.matchReasons.length > 0;
    });
    if (pool.length > 0) return pickWithDiversity(pool, picks, "adventure");
  }

  // Tier 3: Single-country menu (e.g., all Italian)
  // Adventure = wine from a varietal the user has NOT selected
  if (distinctCountries === 1) {
    const pool = matched.filter(e => {
      if (e.score < 1) return false;
      const fromUserVarietal = (e.detectedVarietalIds || []).some(
        vId => userDNA.varietals.has(vId)
      );
      return !fromUserVarietal;
    });
    if (pool.length > 0) return pickWithDiversity(pool, picks, "adventure");
  }

  // Tier 4: Can't find a true adventure — skip the slot
  return null;
}
```

**Implementation note — threading `userDNA` into curation:** `userDNA` is built inside `matchWinesAgainstDNA` (lines 826-832) as `{ countries: Set, regions: Set, varietals: Set, estates: Set, wines: Set }`. It is currently local to that function and NOT passed to `curatePicks`. To make it available for Adventure selection, `matchWinesAgainstDNA` must return `userDNA` alongside scored entries, and the recommend page must pass it through as `options.userDNA` when calling `curatePicks`. Alternatively, `curatePicks` can accept `dnaProfile` in options and reconstruct the Sets internally.

**Implementation note — `detectedVarietalIds`:** The plural array does not currently exist on scored entries — only `detectedVarietalId` (singular). Must expose `Array.from(attrs.varietalIds)` as `detectedVarietalIds` on the `scoreEntry` return object while keeping the singular field for Workstream 1 backward compatibility.

**Implementation note — `pickWithDiversity`:** This is `pickFrom` (from Fix 2) applied to the adventure pool. Once Fix 2's diversity-aware `pickFrom` is in place, `selectAdventure` simply calls `pickFrom(pool.sort((a,b) => b.score - a.score), "adventure")`. The `pickWithDiversity` name in the pseudocode above is conceptual — the actual implementation uses the same `pickFrom` function that all other slots use.

---

## Fix 2: Diversity Constraints

### Problem
On a 267-bottle list, 3 of 5 picks were Pinot Noir. No varietal, region, or producer deduplication exists.

### Constraints
- Max 2 wines of the same varietal across all picks
- Max 2 wines from the same region across all picks
- Max 1 wine from the same producer across all picks

### Diversity Check Function

```js
function wouldViolateDiversity(candidate, existingPicks) {
  const candidateVarietals = candidate.detectedVarietalIds || [];
  const candidateRegions = candidate.detectedRegionIds || [];
  const candidateProducer = (candidate.detectedProducer || "").toLowerCase();

  let varietalOverlap = 0;
  let regionOverlap = 0;
  let producerMatch = false;

  for (const pick of existingPicks) {
    if (candidateVarietals.some(v => (pick.detectedVarietalIds || []).includes(v))) {
      varietalOverlap++;
    }
    if (candidateRegions.some(r => (pick.detectedRegionIds || []).includes(r))) {
      regionOverlap++;
    }
    const pickProducer = (pick.detectedProducer || "").toLowerCase();
    if (candidateProducer && pickProducer && candidateProducer === pickProducer) {
      producerMatch = true;
    }
  }

  return varietalOverlap >= 2 || regionOverlap >= 2 || producerMatch;
}
```

**Implementation note — extracting producer for return object:** `detectedProducer` does not currently exist on scored entries. `detectWineAttributes()` returns `producerTerms` as a Set of lowercase strings (e.g., `"kanonkop"`). To populate `detectedProducer` and `detectedProducerId` on the return object:

```js
// In scoreEntry, after calling detectWineAttributes:
let detectedProducerName = null;
let detectedProducerId = null;
if (attrs.producerTerms.size > 0) {
  const term = Array.from(attrs.producerTerms)[0]; // First matched term
  // Look up canonical name from SEARCH_INDEX
  const searchEntry = SEARCH_INDEX.producerTerms.find(p => p.term === term);
  detectedProducerName = searchEntry ? searchEntry.name : term;
  // Look up producerId from PRODUCER_LOOKUP
  const lookupEntry = PRODUCER_LOOKUP[term];
  detectedProducerId = lookupEntry ? lookupEntry.producerId : null;
}
// Add to return object:
// detectedProducer: detectedProducerName,
// detectedProducerId: detectedProducerId,
```

### Integration into pickFrom

```js
function pickFrom(subset, pickType) {
  // First pass: respect diversity
  for (const entry of subset) {
    const idx = matched.indexOf(entry);
    if (idx >= 0 && !usedIdx.has(idx) && !wouldViolateDiversity(entry, picks)) {
      usedIdx.add(idx);
      picks.push({ ...entry, pickType });
      return true;
    }
  }
  // Fallback: if ALL candidates violate diversity, take the best one
  for (const entry of subset) {
    const idx = matched.indexOf(entry);
    if (idx >= 0 && !usedIdx.has(idx)) {
      usedIdx.add(idx);
      picks.push({ ...entry, pickType });
      return true;
    }
  }
  return false;
}
```

The fallback ensures we never leave a slot empty because of diversity constraints — a duplicate varietal is better than no pick.

---

## Fix 3: Sparkling Detection

### Problem
Sparkling wines aren't reliably tagged, especially Champagne listed under "White" sections or wines like Crémant without obvious sparkling keywords.

### Multi-Signal Detection

**Implementation note — `section` field availability:** The `section` field from Vision output is currently dropped during entry mapping in recommend/page.js. Text-parsed entries also don't carry `section` — they use `sectionColor` instead. The entry mapping (Fix 4) must include `section: w.section` on the entry object so sparkling detection can use section headers. For text-parsed entries, `parseWineList` should also expose the section header string.

Additionally, `detectedColor` on scored entries already incorporates `sectionColor`, so checking `entry.detectedColor === "sparkling"` catches the text-parser path. The `entry.section` check is primarily for Vision-path wines where the section name provides a strong signal.

```js
function isSparklingWine(entry) {
  const name = (entry.name || "").toLowerCase();
  const section = (entry.section || "").toLowerCase();  // From Vision data or text parser
  const variety = (entry.detectedVariety || entry.visionData?.variety || "").toLowerCase();
  const visionColor = (entry.visionData?.color || "").toLowerCase();
  const detectedColor = (entry.detectedColor || "").toLowerCase();

  // Already detected as sparkling by scorer or Vision
  if (detectedColor === "sparkling") return true;
  if (visionColor === "sparkling") return true;

  // Section header indicates sparkling
  if (/sparkling|champagne|bubbles|fizz|pétillant|spumante|mousseux/.test(section)) return true;

  // Name contains sparkling indicators
  const sparklingTerms = [
    "champagne", "cava", "prosecco", "crémant", "cremant",
    "brut", "blanc de blancs", "blanc de noirs",
    "méthode traditionnelle", "methode cap classique", "mcc",
    "sekt", "spumante", "franciacorta", "asti",
    "pétillant naturel", "pet-nat", "ancestrale"
  ];
  if (sparklingTerms.some(t => name.includes(t))) return true;

  // Variety indicates sparkling
  if (/champagne blend|sparkling/.test(variety)) return true;

  return false;
}
```

### Filter Integration

```js
if (colorPreference === "sparkling") {
  pool = pool.filter(e => isSparklingWine(e));
} else if (colorPreference === "white") {
  pool = pool.filter(e => !isSparklingWine(e) && (!e.detectedColor || e.detectedColor === "white"));
} else if (colorPreference === "red") {
  pool = pool.filter(e => !isSparklingWine(e) && (!e.detectedColor || e.detectedColor === "red"));
}
```

This replaces the simpler color filter from Workstream 1 with a more robust version that uses multi-signal detection.

---

## Fix 4: Enrich Vision Extraction Prompt

### Problem
The Vision prompt extracts name, vintage, price, section, is_btg, and color but NOT variety, region, country, or producer. The scorer must re-parse these from the wine name string — redundant and lossy.

### Updated Extraction Fields

Add to the prompt's "For each wine, extract:" section:

```
- variety: Primary grape variety if identifiable (e.g., "Pinot Noir", "Chardonnay").
  For blends, state "blend" or list components if known (e.g., "Cabernet Sauvignon-Merlot blend").
  null if unknown.
- region: Specific wine region if identifiable (e.g., "Bordeaux", "Napa Valley", "Stellenbosch").
  null if unknown.
- country: Country of origin if identifiable. null if unknown.
- producer: Producer/winery/estate name, separated from the wine name where possible.
  null if not distinguishable.
```

Claude Vision can infer these for most wines — "Château Margaux 2015" → producer: "Château Margaux", region: "Bordeaux", country: "France", variety: "Cabernet Sauvignon blend."

### Update JSON example in prompt

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
  ]
}
```

### Passing Vision Data to the Scorer

When the recommend page builds entries from Vision output:

```js
const entries = visionResult.wines.map(w => ({
  name: w.name,
  price: w.price,
  originalLine: w.name || "",
  section: w.section || null,        // NEW: preserved for isSparklingWine detection
  isByTheGlass: w.is_btg,
  sectionColor: w.color || null,
  sectionVarietal: null,
  vintage: w.vintage || null,
  visionData: {
    color: w.color,
    variety: w.variety,
    region: w.region,
    country: w.country,
    producer: w.producer,
    vintage: w.vintage,
  }
}));
```

### Dual Scoring Path

```js
function scoreEntry(entry, userDNA, feedbackSignals) {
  if (entry.visionData && entry.visionData.region) {
    return scoreEntryFromVision(entry, userDNA, feedbackSignals);
  }
  return scoreEntryFromText(entry, userDNA, feedbackSignals);
}
```

`scoreEntryFromText` is the existing `scoreEntry` logic, renamed.

`scoreEntryFromVision` uses direct field matching instead of scanning the wine name. Skeleton:

```js
function scoreEntryFromVision(entry, userDNA, feedbackSignals) {
  let score = 0;
  const matchReasons = [];
  const vd = entry.visionData;

  // 1. Producer match — use visionData.producer directly against PRODUCER_LOOKUP
  let detectedProducerName = vd.producer || null;
  let detectedProducerId = null;
  if (detectedProducerName) {
    const lookupEntry = PRODUCER_LOOKUP[detectedProducerName.toLowerCase().trim()];
    if (lookupEntry) {
      detectedProducerId = lookupEntry.producerId;
      // Check against userDNA.estates
      if (userDNA.estates.has(lookupEntry.producerId)) {
        score += 5;
        matchReasons.push({ type: "estate", label: detectedProducerName, weight: 5 });
      }
    }
  }

  // 2. Region match — use visionData.region against REGION_LOOKUP
  const detectedRegionIds = [];
  const detectedCountryIds = [];
  if (vd.region) {
    const regionEntry = REGION_LOOKUP[vd.region.toLowerCase().trim()];
    if (regionEntry) {
      detectedRegionIds.push(regionEntry.regionId);
      detectedCountryIds.push(regionEntry.country);
      if (userDNA.regions.has(regionEntry.regionId)) {
        score += 3;
        matchReasons.push({ type: "region", label: regionEntry.regionId, weight: 3 });
      }
    }
  }

  // 3. Country match — use visionData.country or inferred from region
  if (vd.country) {
    const countryId = vd.country.toLowerCase().trim();
    if (!detectedCountryIds.includes(countryId)) detectedCountryIds.push(countryId);
    // Only add country score if no region matched
    if (matchReasons.every(r => r.type !== "region") && userDNA.countries.has(countryId)) {
      score += 1;
      matchReasons.push({ type: "country", label: countryId, weight: 1 });
    }
  }

  // 4. Varietal match — use visionData.variety against VARIETAL_LOOKUP + varietals array
  const detectedVarietalIds = [];
  if (vd.variety) {
    const varietyLower = vd.variety.toLowerCase().trim();
    // Check varietal lookup for synonyms, then varietals array for direct match
    const varLookup = VARIETAL_LOOKUP[varietyLower];
    const varId = varLookup ? varLookup.varietalId
      : VARIETALS.find(v => v.name.toLowerCase() === varietyLower)?.id || null;
    if (varId) {
      detectedVarietalIds.push(varId);
      if (userDNA.varietals.has(varId)) {
        score += 2;
        matchReasons.push({ type: "varietal", label: varId, weight: 2 });
      }
    }
  }

  // 5. Favorite wine match (same as text path — scan name against userDNA.wines)
  // ... same logic as scoreEntryFromText ...

  // 6. Feedback signals (same as text path)
  // ... same logic as scoreEntryFromText ...

  // 7. Quality bonus + Estate+Region combo (Fixes 7 & 8)
  // ... applied after DNA signals, same as text path ...

  // 8. Color detection — prefer visionData.color, fall back to detectedColor logic
  const detectedColor = vd.color || entry.sectionColor || null;

  return {
    name: entry.name,
    price: entry.price,
    originalLine: entry.originalLine,
    section: entry.section || null,
    score,
    matchReasons,
    detectedColor,
    detectedRegionIds,
    detectedCountryIds,
    detectedCountry: detectedCountryIds[0] || null,
    detectedVarietalId: detectedVarietalIds[0] || null,
    detectedVarietalIds,
    detectedProducer: detectedProducerName,
    detectedProducerId,
    vintage: vd.vintage || entry.vintage || null,
    visionData: entry.visionData,
  };
}
```

**Fallback behavior:** When Vision returns `null` for the new fields (variety, region, country, producer), the `scoreEntry` router checks `entry.visionData && entry.visionData.region`. If region is null, the entry falls back to `scoreEntryFromText` which scans the wine name string. This is intentional — partial Vision data gracefully degrades to text parsing.

---

## Fix 5: Dynamic Pick Count

Already implemented in Workstream 1. The `getPickCount` function and `maxPicks` option on `curatePicks` are in place. After filling the 5 standard categories (Top, Splurge, Value, Adventure, Worth Trying), remaining slots fill with additional Worth Trying picks subject to diversity constraints.

---

## Fix 6: Capture Restaurant Context for Future Use

### Data Model Changes

Add columns to `wine_interactions`:

```sql
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS source_label TEXT;
```

### Interaction Save Update

When saving from the recommend page:

```js
await supabase.from("wine_interactions").upsert({
  user_id: user.id,
  wine_name: wineName,
  interaction_type: "had",
  rating: rating,
  source_url: currentMenuUrl || null,
  source_label: restaurantName || null,
  updated_at: new Date().toISOString(),
});
```

**Implementation note:** `menuUrl` exists as state on the page (line 77), and `extractedFrom` state tracks `"scan"` vs `"url"` vs `"paste"`. For `source_url`: if `extractedFrom === "url"`, use `menuUrl`; if `extractedFrom === "scan"`, store `"photo_scan"`; if `extractedFrom === "paste"`, store `"text_paste"`. For `source_label`, pass `null` for now — restaurant name detection is a future workstream.

---

## Fix 7: Quality Bonus from WineMag Data

### Problem
The scorer treats all wines as equal in quality. A $60 generic Bordeaux AOC negociant and a $255 Pomerol Cru Classé get the same score if they match the same DNA signals.

### Data Path

**Implementation note:** `PRODUCER_LOOKUP` maps names → `{ producerId, regionId, country, province }` but does NOT contain `avgRating`/`reviewCount`. Those live on producer objects under `PRODUCERS[regionId]`. The quality bonus function requires a two-hop lookup:

1. `producerName.toLowerCase()` → `PRODUCER_LOOKUP[name]` → `{ producerId, regionId }`
2. `PRODUCERS[regionId]` → find producer by `producerId` → `{ avgRating, reviewCount }`

If the producer is in the lookup but not in PRODUCERS (edge case), return bonus 0.

### Quality Bonus Function

```js
function getQualityBonus(producerName) {
  const normalized = producerName.toLowerCase().trim();
  const lookupEntry = PRODUCER_LOOKUP[normalized];

  if (!lookupEntry) return { bonus: 0, confidence: "unknown" };

  // Two-hop: lookup → regionId → PRODUCERS array → find by producerId
  const regionProducers = PRODUCERS[lookupEntry.regionId] || [];
  const producerData = regionProducers.find(p => p.id === lookupEntry.producerId);

  if (!producerData) return { bonus: 0, confidence: "unknown" };

  const avgRating = producerData.avgRating || 0;
  const reviewCount = producerData.reviewCount || 0;

  // Rating-based bonus
  let ratingBonus = 0;
  if (avgRating >= 95) ratingBonus = 2.0;
  else if (avgRating >= 93) ratingBonus = 1.5;
  else if (avgRating >= 90) ratingBonus = 1.0;
  else if (avgRating >= 87) ratingBonus = 0.5;

  // Confidence modifier based on review count
  let confidence = "low";
  let confidenceMultiplier = 0.5;
  if (reviewCount >= 50) { confidence = "high"; confidenceMultiplier = 1.0; }
  else if (reviewCount >= 20) { confidence = "medium"; confidenceMultiplier = 0.8; }
  else if (reviewCount >= 5) { confidence = "low-medium"; confidenceMultiplier = 0.6; }

  const bonus = ratingBonus * confidenceMultiplier;

  return { bonus: Math.round(bonus * 10) / 10, confidence, avgRating, reviewCount };
}
```

### Weight Calibration

| Signal | Weight |
|--------|--------|
| Favorite Wine | 10 |
| Estate/Producer match | 5 |
| Region match | 3 |
| Varietal match | 2 |
| **Quality bonus (new)** | **0–2** |
| Country via region | 1 |
| Country standalone | 1 |
| **Estate+Region combo (Fix 8)** | **+1** |

Quality never overrides DNA match signals — it's a tiebreaker.

### Applying the Bonus

In both `scoreEntryFromText` and `scoreEntryFromVision`, after all DNA match signals:

```js
const producerName = entry.visionData?.producer || detectedProducerName;
if (producerName) {
  const quality = getQualityBonus(producerName);
  if (quality.bonus > 0) {
    score += quality.bonus;
    matchReasons.push({
      type: "quality",
      label: `${quality.avgRating} pts (${quality.reviewCount} reviews)`,
      weight: quality.bonus,
    });
  }
  entry.producerQuality = quality;
}
```

### Edge Cases

- **Producer not in WineMag:** Bonus = 0, confidence = "unknown". No penalty.
- **Curated SA producers with synthetic data:** reviewCount: 1, avgRating: 88.0 → bonus 0.5 × 0.5 = 0.25. Fine — slight nod without inflation.
- **High-rated low-review:** avgRating 96, 3 reviews → 1.5 × 0.5 = 0.75. Confidence multiplier prevents single-review inflation.

---

## Fix 8: Estate+Region Combo Bonus

### Problem
A wine matching both estate AND region is the strongest possible alignment. Currently these stack additively (5 + 3 = 8) with no recognition the combination is more meaningful than the sum.

### Fix

```js
const hasEstateMatch = matchReasons.some(r => r.type === "estate");
const hasRegionMatch = matchReasons.some(r => r.type === "region");

if (hasEstateMatch && hasRegionMatch) {
  score += 1;
  // No separate matchReason — the combo is implicit
}
```

Example: Kanonkop (estate +5) in Stellenbosch (region +3) with Cabernet (varietal +2) → 11 instead of 10.

---

## Implementation Order

1. Expose `detectedVarietalIds` (plural array), `detectedProducer`, `detectedProducerId`, and `section` on `scoreEntry` return
2. Thread `userDNA` out of `matchWinesAgainstDNA` (return alongside scored entries) and pass through `options.userDNA` to `curatePicks`; build `buildMenuContext` and wire into `curatePicks` via `options.menuContext`
3. Replace Adventure logic with tiered selection using diversity-aware `pickFrom`
4. Add `wouldViolateDiversity` and integrate into `pickFrom`
5. Add `isSparklingWine` and replace color filter logic in `curatePicks`
6. Update Vision prompt to extract variety, region, country, producer; update JSON example
7. Update recommend page Vision entry mapping to include `section` and `visionData` fields
8. Build `scoreEntryFromVision` (rename existing logic to `scoreEntryFromText`)
9. Add `getQualityBonus` and integrate into both scoring paths
10. Add estate+region combo bonus
11. Add `source_url`/`source_label` to wine interaction saves + Supabase migration
12. Test against real wine lists

---

## What This Does NOT Cover

- LLM-powered curation → Workstream 2b
- Personalized wine notes → Workstream 3 (or merged with 2b)
- Restaurant-context memory → future workstream
- Results page UI → Workstream 1 (done)
