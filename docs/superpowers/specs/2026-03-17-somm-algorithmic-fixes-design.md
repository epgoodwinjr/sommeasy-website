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

**Implementation note:** `userDNA` is built inside `matchWinesAgainstDNA` (lines 826-832). The `countries`, `regions`, and `varietals` fields must be verified as Sets for the `.has()` calls to work. If they're arrays, convert to Sets.

**Implementation note:** `detectedVarietalIds` (plural array) does not currently exist on scored entries — only `detectedVarietalId` (singular). Must expose `Array.from(attrs.varietalIds)` as `detectedVarietalIds` on the scoreEntry return object while keeping the singular field for Workstream 1 backward compatibility.

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

**Implementation note:** `detectedProducer` does not currently exist on scored entries. Producer terms are detected internally by `detectWineAttributes()` but discarded from the return object. Must add `detectedProducer` (matched producer name string) and `detectedProducerId` to `scoreEntry`'s return object.

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

```js
function isSparklingWine(entry) {
  const name = (entry.name || "").toLowerCase();
  const section = (entry.section || "").toLowerCase();
  const variety = (entry.detectedVariety || entry.visionData?.variety || "").toLowerCase();
  const visionColor = (entry.visionData?.color || "").toLowerCase();

  // Vision explicitly tagged it
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
  section: w.section,
  isByTheGlass: w.is_btg,
  sectionColor: w.color || null,
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

`scoreEntryFromVision` uses direct field matching (region string → regionLookup → regionId → check against userDNA) rather than scanning the wine name for keyword matches. More accurate for wines where the name alone doesn't reveal the region or grape.

`scoreEntryFromText` is the existing `scoreEntry` logic, renamed.

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

**Implementation note:** `menuUrl` exists as state on the page (line 77), but no `restaurantName` is tracked. For `source_url`, use the existing `menuUrl` state. For `source_label`, pass `null` for now — restaurant name detection is a future workstream. For photo scans with no URL, store `"photo_scan"` as source_url.

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

1. Expose `detectedVarietalIds` (plural array) and `detectedProducer`/`detectedProducerId` on `scoreEntry` return
2. Build `buildMenuContext` and wire into `curatePicks` via `options.menuContext`
3. Replace Adventure logic with tiered `selectAdventure`
4. Add `wouldViolateDiversity` and integrate into `pickFrom`
5. Add `isSparklingWine` and replace color filter logic in `curatePicks`
6. Update Vision prompt to extract variety, region, country, producer
7. Build `scoreEntryFromVision` (rename existing logic to `scoreEntryFromText`)
8. Add `getQualityBonus` and integrate into both scoring paths
9. Add estate+region combo bonus
10. Add `source_url`/`source_label` to wine interaction saves + Supabase migration
11. Test against real wine lists

---

## What This Does NOT Cover

- LLM-powered curation → Workstream 2b
- Personalized wine notes → Workstream 3 (or merged with 2b)
- Restaurant-context memory → future workstream
- Results page UI → Workstream 1 (done)
