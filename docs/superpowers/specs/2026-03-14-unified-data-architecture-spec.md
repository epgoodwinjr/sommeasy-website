# Feature Spec: Unified Data Architecture

## Overview

Eliminate the two-data-world problem by replacing the hand-curated `wineData.js` with a single dynamically generated data source derived from the WineMag 130k dataset. The quiz, profile engine, match engine, and DNA Evolution engine will all read from one unified data layer. No more mapping tables, no more `mappable: false` edge cases, no more manual curation bottlenecks.

This is a structural rearchitecture. Nearly every file that currently imports from `wineData.js` will be modified or replaced.

---

## Guiding Principles

1. **One data source, one truth.** Every system — quiz, profile, matching, evolution — reads from the same dataset. If a wine, region, or producer exists in the data, it exists everywhere.
2. **Dynamic but curated-feeling.** The quiz is generated from data, but threshold logic and sort order make it feel editorially intentional, not like a database dump.
3. **Progressive disclosure.** Show the most relevant options first. Let power users dig deeper with "show more." Never overwhelm a casual user.
4. **Existing profiles are expendable.** We are pre-launch. Nuke all existing `wine_profiles` and `dna_accumulation` data during migration. Clean slate.

---

## 1. New Data Pipeline

### 1A. Build Script: `scripts/build_quiz_data.py`

A new Python script that processes the WineMag CSV and outputs a single JSON file containing everything the quiz, profile, and matching systems need.

**Input:** `data/external/winemag-data-130k-v2.csv` (the existing 130k CSV)

**Output:** `src/lib/wineUnified.json` — replaces BOTH `wineData.js` AND `wineReference-lookup.json`

**Structure:**

```json
{
  "countries": [
    {
      "id": "france",
      "name": "France",
      "emoji": "🇫🇷",
      "world": "old",
      "reviewCount": 22093,
      "avgRating": 88.4,
      "regionCount": 38,
      "topVarietals": ["pinot_noir", "chardonnay", "cabernet_sauvignon"]
    }
  ],

  "regions": {
    "france": [
      {
        "id": "bordeaux",
        "name": "Bordeaux",
        "province": "Bordeaux",
        "reviewCount": 5765,
        "avgRating": 88.7,
        "producerCount": 312,
        "topVarietals": ["cabernet_sauvignon", "merlot", "cabernet_franc"]
      },
      {
        "id": "burgundy",
        "name": "Burgundy",
        "province": "Burgundy",
        "reviewCount": 3287,
        "avgRating": 89.2,
        "producerCount": 198,
        "topVarietals": ["pinot_noir", "chardonnay"]
      }
    ]
  },

  "producers": {
    "bordeaux": [
      {
        "id": "chateau_margaux",
        "name": "Château Margaux",
        "reviewCount": 24,
        "avgRating": 93.8,
        "topVarietals": ["cabernet_sauvignon"],
        "rank": 1
      }
    ]
  },

  "varietals": [
    {
      "id": "pinot_noir",
      "name": "Pinot Noir",
      "color": "red",
      "reviewCount": 13272,
      "avgRating": 88.9,
      "topRegions": ["burgundy", "willamette_valley", "central_otago"]
    }
  ],

  "regionLookup": {
    "pauillac": { "regionId": "bordeaux", "country": "france" },
    "saint-julien": { "regionId": "bordeaux", "country": "france" },
    "morey-saint-denis": { "regionId": "burgundy", "country": "france" },
    "oakville": { "regionId": "napa_valley", "country": "usa" },
    "russian river valley": { "regionId": "sonoma", "country": "usa" }
  },

  "producerLookup": {
    "chateau margaux": { "producerId": "chateau_margaux", "regionId": "bordeaux", "country": "france", "province": "Bordeaux" },
    "henschke": { "producerId": "henschke", "regionId": "barossa_valley", "country": "australia", "province": "South Australia" }
  },

  "varietalLookup": {
    "shiraz": "syrah",
    "garnacha": "grenache",
    "pinot gris": "pinot_grigio"
  },

  "metadata": {
    "generatedAt": "2026-03-14T00:00:00Z",
    "sourceRows": 129975,
    "countryCount": 28,
    "regionCount": 340,
    "producerCount": 4200,
    "varietalCount": 58,
    "minCountryReviews": 100,
    "minRegionReviews": 20,
    "minProducerReviews": 3,
    "minVarietalReviews": 50
  }
}
```

### 1B. Threshold Configuration

These thresholds determine what makes it into the quiz. They live as constants at the top of the build script and can be tuned without code changes to the app:

```python
MIN_COUNTRY_REVIEWS = 100      # Country needs 100+ reviews to appear in quiz
MIN_REGION_REVIEWS = 20        # Region needs 20+ reviews to appear under a country
MIN_PRODUCER_REVIEWS = 3       # Producer needs 3+ reviews to appear under a region
MIN_VARIETAL_REVIEWS = 50      # Varietal needs 50+ global reviews to appear in quiz
MAX_PRODUCERS_PER_REGION = 100 # Cap per region (paginated in UI)
```

**Expected output at these thresholds:**
- ~25–30 countries (down from 43 in raw data, filtering out countries with <100 reviews)
- ~200–350 regions (each with 20+ reviews — covers all major and most minor appellations)
- ~3,000–5,000 producers (3+ reviews each — the ones users might actually recognize)
- ~50–60 varietals (50+ reviews — the grapes that matter commercially)

### 1C. ID Generation

Every entity gets a stable, deterministic ID derived from its name:

```python
def make_id(name):
    """'Château Margaux' → 'chateau_margaux', 'Côtes du Rhône' → 'cotes_du_rhone'"""
    # Normalize unicode (é → e, ü → u)
    # Lowercase
    # Replace spaces/hyphens/apostrophes with underscores
    # Strip non-alphanumeric except underscores
    # Collapse multiple underscores
```

IDs are stable across rebuilds because they're derived from the name, not from row position. This means profile data referencing these IDs survives a dataset rebuild.

### 1D. Region Hierarchy

The WineMag dataset has two levels of geography: `province` and `region_1`. Some entries also have `region_2`. The build script must collapse these into a single clean hierarchy:

- **Country** → top level (WineMag `country` field)
- **Region** → the meaningful wine region. Use `province` for most countries. For USA, use `region_1` (because province is just the state — "California" — which isn't useful). For countries where province IS the region (e.g., South Africa's "Stellenbosch"), use it directly.
- **Sub-appellations** → captured in `regionLookup` for matching purposes but NOT shown as separate quiz options. "Pauillac" maps to "Bordeaux" in the lookup, but users select "Bordeaux" in the quiz, not "Pauillac."

**Special handling required:**
- USA: Province = state (California, Oregon, Washington). Region = appellation (Napa Valley, Willamette Valley). Use region_1 as the quiz region, not province.
- Italy: Some regions are provinces (Tuscany, Piedmont) and others are sub-regions. Use province as the primary level.
- Australia: Province = state (South Australia). Region = actual wine region (Barossa Valley, McLaren Vale). Use region_1 as the quiz region where available, falling back to province.
- France: Province = major region (Bordeaux, Burgundy). This maps cleanly to quiz regions.

The build script should have a country-specific configuration block that specifies which WineMag field to use as the primary region for each country.

### 1E. Producer-to-Region Assignment

A single producer may have reviews from multiple regions (e.g., a large company with vineyards across regions). Assignment rule: **a producer belongs to the region where they have the most reviews.** If tied, use highest average rating as tiebreaker.

Each producer appears under exactly ONE region in the quiz — no duplicates. The `producerLookup` stores the canonical assignment.

### 1F. Old World / New World Classification

Maintain the Old World / New World designation for countries. Hardcode this in the build script since it's a fixed geographic/cultural classification:

```python
OLD_WORLD = {"France", "Italy", "Spain", "Portugal", "Germany", "Austria",
             "Greece", "Hungary", "Croatia", "Slovenia", "Georgia",
             "Romania", "Bulgaria", "Lebanon", "Israel", "Turkey",
             "Czech Republic", "Slovakia", "Switzerland", "Luxembourg"}

NEW_WORLD = {"US", "Argentina", "Chile", "Australia", "New Zealand",
             "South Africa", "Brazil", "Uruguay", "Canada", "Mexico",
             "China", "India", "Japan"}
```

### 1G. Country Flag Emojis

Hardcode a country-name-to-emoji map in the build script. This is stable data that doesn't change:

```python
COUNTRY_EMOJI = {
    "France": "🇫🇷", "Italy": "🇮🇹", "Spain": "🇪🇸", "US": "🇺🇸",
    "Argentina": "🇦🇷", "Chile": "🇨🇱", "Australia": "🇦🇺",
    "South Africa": "🇿🇦", "Portugal": "🇵🇹", "Germany": "🇩🇪",
    "Austria": "🇦🇹", "New Zealand": "🇳🇿", "Greece": "🇬🇷",
    # ... etc for all qualifying countries
}
```

---

## 2. Quiz UX Redesign

### 2A. Step Structure

The quiz keeps 5 steps but the data behind each is now dynamic:

| Step | Label | Source | Display Logic |
|---|---|---|---|
| 1 | Countries | `wineUnified.countries` | All qualifying countries (~25–30), grouped visually by Old World / New World. Sorted by reviewCount descending within each group. |
| 2 | Regions | `wineUnified.regions[countryId]` | Only regions for selected countries. Top 10–12 per country shown initially, sorted by reviewCount. "Show more" expands to full list. |
| 3 | Producers | `wineUnified.producers[regionId]` | Only producers for selected regions. Top 10–20 per region shown initially, sorted by composite score (see below). "Show more" loads next 10–20. |
| 4 | Varietals | `wineUnified.varietals` (reranked) | All qualifying varietals, but dynamically reordered based on selected countries/regions (see 2E). |
| 5 | Specific Wines | Free-text with autocomplete | Autocomplete searches against `producerLookup` keys. Unchanged from current implementation. |

### 2B. Country Display

Single screen. Two visual groups with subtle headers:

```
── Old World ──────────────
🇫🇷 France    🇮🇹 Italy     🇪🇸 Spain
🇵🇹 Portugal  🇩🇪 Germany   🇦🇹 Austria
🇬🇷 Greece    🇭🇺 Hungary   🇬🇪 Georgia
🇭🇷 Croatia   🇸🇮 Slovenia  🇱🇧 Lebanon
...

── New World ──────────────
🇺🇸 United States  🇦🇷 Argentina  🇨🇱 Chile
🇦🇺 Australia      🇳🇿 New Zealand 🇿🇦 South Africa
🇨🇦 Canada         🇧🇷 Brazil     🇺🇾 Uruguay
...
```

Within each group, sorted by review count (most prominent countries first). This means France, Italy, and Spain naturally lead Old World; USA, Argentina, and Australia lead New World. Feels curated, but it's just data.

### 2C. Region Display with Progressive Disclosure

For each selected country, show a section with the country name + emoji as header.

**Initial view:** Top 10–12 regions sorted by review count. These are the regions a typical wine drinker would know. A small "Show N more" button at the bottom, where N is the remaining count.

**Expanded view:** All qualifying regions for that country, still sorted by review count. The expanded regions load inline (no modal or page change).

**Visual distinction:** Initial regions display as larger, more prominent chips/cards. Expanded regions display slightly smaller or in a denser grid, subtly signaling "these are more niche." This creates the feeling of editorial tiers without actually hand-curating anything.

Example for France (if user selected France):

```
🇫🇷 France
[Bordeaux] [Burgundy] [Champagne] [Rhône Valley]
[Loire Valley] [Alsace] [Provence] [Languedoc-Roussillon]
[Beaujolais] [Southwest France] [Corsica] [Jura]

  ▾ Show 8 more regions
```

After clicking:

```
  [Savoie] [Cahors] [Madiran] [Bergerac]
  [Côtes de Gascogne] [Bandol] [Irouléguy] [Bellet]
```

### 2D. Producer Display with Pagination

For each selected region, show a section with the region name as header.

**Initial view:** Top 10–20 producers sorted by composite score. "Show more" button at bottom.

**Composite sort score:**

```
score = (reviewCount * 0.6) + (avgRating * 0.4)
```

Normalize both to 0–100 scale before combining. This ranks producers that are both well-known (many reviews) and high-quality (high ratings) above producers that are obscure but highly rated or prolific but mediocre.

**Pagination:** Each "Show more" click reveals the next 10–20 producers. Continue until all producers for that region are shown. Given MAX_PRODUCERS_PER_REGION = 100, the worst case is 5 "show more" clicks for a very dense region like Bordeaux. Most regions will have 20–50 producers total.

**If a region has very few producers** (< 10): Show all of them without any "show more" button. Don't draw attention to the sparsity.

### 2E. Dynamic Varietal Reranking

This is the "this quiz understands me" moment. Instead of a static list of 25 grapes, the varietal step shows all ~50–60 qualifying varietals, dynamically reordered based on what the user has already selected.

**Algorithm:**

```
1. For each varietal in the global list:
   a. Count how many of the user's selected regions list this varietal
      in their topVarietals array
   b. Count how many of the user's selected producers are primarily
      associated with this varietal
   c. Compute a relevance score: regionMatches * 3 + producerMatches * 1
2. Sort varietals by relevance score descending, then by global reviewCount
   as tiebreaker
3. Display in this order: relevant varietals first, then remaining varietals
   below a subtle divider
```

**Visual treatment:**

```
── Based on your selections ──
[Pinot Noir] [Chardonnay] [Nebbiolo] [Cabernet Sauvignon]
[Sangiovese] [Barbera]

── Other varietals ──
[Merlot] [Syrah / Shiraz] [Malbec] [Tempranillo]
[Riesling] [Sauvignon Blanc] [Grenache] ...
```

If the user hasn't selected any countries/regions yet (jumped straight to varietals), show the default global ranking by review count — same as the current behavior. The dynamic reranking only kicks in when there's upstream context to work with.

### 2F. Varietal Display: Color Grouping

Within each section (relevant / other), group by color:

```
── Based on your selections ──
Red: [Pinot Noir] [Nebbiolo] [Sangiovese]
White: [Chardonnay] [Vermentino]

── Other varietals ──
Red: [Cabernet Sauvignon] [Merlot] [Syrah / Shiraz] ...
White: [Sauvignon Blanc] [Riesling] [Gewürztraminer] ...
```

### 2G. Synonym Display

Varietals with common synonyms should display both names: "Syrah / Shiraz", "Grenache / Garnacha", "Pinot Grigio / Pinot Gris". This is already the pattern in the current quiz. The build script should maintain a synonym map and the display name should include the alternate.

---

## 3. Profile Data Model Changes

### 3A. Schema Evolution

The `wine_profiles` table currently stores arrays of string IDs from `wineData.js`. The new schema stores IDs from `wineUnified.json` — same column types, different ID space.

Since we're pre-launch, the migration approach is:

```sql
-- Clear all existing profile data (pre-launch, no user impact)
TRUNCATE wine_profiles;
TRUNCATE dna_accumulation;
TRUNCATE dna_timeline;
TRUNCATE wine_interactions;

-- No schema changes needed to wine_profiles — the columns
-- (countries, regions, estates, varietals, specific_wines)
-- already store arrays/objects of string IDs.
-- The IDs just come from wineUnified.json now instead of wineData.js.
```

### 3B. Profile Field Semantics

| Field | Old Behavior | New Behavior |
|---|---|---|
| `countries` | Array of wineData IDs like `["france", "italy"]` | Array of wineUnified IDs like `["france", "italy"]` — same format, IDs generated from country names so likely identical |
| `regions` | Object keyed by country: `{ france: ["bordeaux", "burgundy"] }` | Same structure. IDs now derived from WineMag region names via `make_id()`. May differ from old IDs (e.g., "rhone" might become "rhone_valley"). |
| `estates` | Object keyed by region: `{ bordeaux: ["chateau_margaux"] }` | Same structure. IDs derived from producer names. |
| `varietals` | Array of IDs: `["pinot_noir", "chardonnay"]` | Same format. IDs derived from varietal names. |
| `specific_wines` | Array of free-text strings | Unchanged. |

### 3C. ID Stability

Because IDs are derived deterministically from names (`make_id("Château Margaux")` always produces `chateau_margaux`), they are stable across dataset rebuilds. If Wine Magazine adds new reviews but doesn't rename existing entities, all IDs remain the same. This is critical for profile persistence.

---

## 4. Downstream System Updates

### 4A. Files to Delete

| File | Reason |
|---|---|
| `src/lib/wineData.js` | Replaced entirely by `wineUnified.json` |
| `src/lib/wineReference-lookup.json` | Merged into `wineUnified.json` |
| `scripts/build_wine_reference.py` | Replaced by `scripts/build_quiz_data.py` |

### 4B. `src/lib/profileEngine.js` — Major Rewrite

Currently imports COUNTRIES, REGIONS, ESTATES, VARIETALS from wineData.js and uses them to resolve names from IDs, compute archetype dimensions, and generate narratives.

**Changes:**
- Import from `wineUnified.json` instead
- Replace all name-resolution logic to use the new data shape (array of objects with id/name fields instead of separate constants)
- **Archetype engine: disable for now.** Replace `determineArchetype()` with a simple placeholder that returns a generic archetype based on selection breadth/depth. The full archetype rethink happens later as a separate feature. For now:

```javascript
function determineArchetype(ctx) {
  // Simplified placeholder — returns a basic characterization
  // Full archetype engine redesign is a future feature
  const { breadth, depth, varietalCount } = ctx;
  if (breadth >= 5 && depth >= 5) return { archetype: "The Grand Palate", archetypeEmoji: "👑", narrative: generateSimpleNarrative(ctx) };
  if (breadth >= 3 && depth >= 3) return { archetype: "The Connoisseur", archetypeEmoji: "🔬", narrative: generateSimpleNarrative(ctx) };
  if (breadth >= 3) return { archetype: "The Explorer", archetypeEmoji: "🧭", narrative: generateSimpleNarrative(ctx) };
  if (depth >= 3) return { archetype: "The Deep Diver", archetypeEmoji: "🌊", narrative: generateSimpleNarrative(ctx) };
  return { archetype: "The Rising Palate", archetypeEmoji: "🌱", narrative: generateSimpleNarrative(ctx) };
}
```

This is intentionally minimal. It works, it doesn't crash, it gives users something to see. Rebuilding the archetype system for dynamic data is a separate spec.

### 4C. `src/lib/matchEngine.js` — Remove Mapping Layer

Currently has three large hardcoded mapping dictionaries: `COUNTRY_TO_DNA`, `PROVINCE_TO_DNA_REGION`, `SUBREGION_TO_DNA_REGION`. These exist solely to translate WineMag terminology into `wineData.js` IDs.

**Changes:**
- Delete all three mapping dictionaries
- Import from `wineUnified.json` instead of both wineData and wineReference-lookup
- Use `regionLookup` and `producerLookup` from the unified JSON for all resolution
- The `scoreEntry` function simplifies dramatically — instead of mapping a wine's WineMag province to a DNA region ID via a dictionary, it directly looks up the region in the unified data. One data world means no translation needed.

### 4D. `src/lib/dnaEvolution.js` — Simplify

Currently needs to map resolved WineMag metadata back to wineData.js IDs to determine if a value is "mappable." With unified data, this concern disappears entirely.

**Changes:**
- Remove all `mappable` / `unmappable` logic
- The resolver returns IDs that are directly usable in `wine_profiles` because they come from the same data source
- Promotion writes become simpler: just append the ID to the profile array/object, no mapping validation needed
- Remove the mapping utility that was speced in the DNA Evolution feature

### 4E. `src/lib/wineResolver.js` — Simplify

Currently uses a separate lookup dataset. Now uses `producerLookup` and `regionLookup` from `wineUnified.json`.

**Changes:**
- Import from `wineUnified.json`
- Producer matching uses `producerLookup` (normalized producer names → canonical ID, region, country)
- Varietal matching uses `varietalLookup` for synonym resolution
- Region matching uses `regionLookup` for sub-appellation → region mapping
- Confidence scoring logic stays the same — this is about how we resolve, not what data we resolve against

### 4F. Quiz Component — Rebuild

The current quiz component in `page.js` (or a separate Quiz component) renders hardcoded arrays from wineData.js.

**Changes:**
- Load data from `wineUnified.json` (imported at build time — static JSON, no API call needed)
- Step 1 (Countries): Render from `wineUnified.countries`, grouped by `world` field, sorted by `reviewCount`
- Step 2 (Regions): Filter `wineUnified.regions` to selected countries. Implement "show more" with local state tracking expanded countries. Initial display: first 12 per country by `reviewCount`.
- Step 3 (Producers): Filter `wineUnified.producers` to selected regions. Implement pagination with "show more." Initial display: first 15 per region by composite score. Each "show more" reveals next 15.
- Step 4 (Varietals): Load `wineUnified.varietals`. Compute relevance scores based on selected regions' `topVarietals`. Split into "Based on your selections" and "Other varietals" groups. Within each group, sub-group by color.
- Step 5 (Specific Wines): Unchanged — free text with autocomplete against producer names.

### 4G. `profileEngine.js` — Recommendation Engine

The `WINE_RECS` object with hardcoded combo/varietal/country recommendations is currently tied to wineData IDs.

**Two options:**

Option A: Regenerate WINE_RECS from WineMag data. For each region+varietal combination that has a 95+ rated wine, generate a recommendation entry. This makes recommendations dynamic and comprehensive but loses the editorial voice ("Classic Left Bank Bordeaux — structured Cab-Merlot blend from one of the Super Seconds").

Option B: Keep WINE_RECS as a hand-curated overlay. Update the IDs to match the new wineUnified IDs, but keep the editorial descriptions. This preserves the quality of the current recommendations but requires manual updates when IDs change.

**Recommendation: Option B for now.** The editorial voice in the recommendations is a product differentiator. Update the IDs to match the new unified format. The hand-curated recommendations list is small (~50 entries) and doesn't change often. Long-term, this could be replaced by an AI-generated recommendation layer, but that's a future feature.

---

## 5. Bundle Size Considerations

### Current State
- `wineData.js`: ~15KB
- `wineReference-lookup.json`: ~247KB

### Projected State
- `wineUnified.json`: estimated ~400–600KB depending on producer count and threshold tuning

### Mitigation

The JSON is imported at build time by Next.js, which means:
- It's included in the JavaScript bundle for pages that use it
- It benefits from Next.js's automatic code splitting (only loaded on pages that import it)
- It's gzip-compressed by Vercel in transit (~60–70% compression on JSON), so ~400KB becomes ~120–180KB over the wire

This is acceptable for a quiz/profile page that loads once. If it becomes a problem, the JSON can be split into tiers:
- `wineUnified-core.json`: countries, regions, varietals, lookups (~100KB)
- `wineUnified-producers.json`: producers keyed by region (~300–500KB, lazy-loaded when user reaches Step 3)

**Recommendation: Ship as a single file first.** Only split if real-world performance data shows a problem. Premature optimization here adds complexity for a problem that likely doesn't exist.

---

## 6. Build Script Specification

### Input
```
python scripts/build_quiz_data.py data/external/winemag-data-130k-v2.csv src/lib/wineUnified.json
```

### Processing Steps

1. **Load CSV**, parse all 130k rows
2. **Aggregate countries**: Group by country, count reviews, compute average rating. Filter by MIN_COUNTRY_REVIEWS. Assign Old World / New World. Assign flag emoji.
3. **Aggregate regions**: For each qualifying country, determine the region field to use (province vs region_1, per country-specific config). Group, count, filter by MIN_REGION_REVIEWS. Compute top varietals per region (top 5 by review count).
4. **Build sub-appellation lookup**: Map every unique `region_1` and `region_2` value to its parent region ID. This powers the `regionLookup` for matching.
5. **Aggregate producers**: Group by winery name. Assign each to its primary region (most reviews). Count, filter by MIN_PRODUCER_REVIEWS. Determine top varietal per producer. Cap at MAX_PRODUCERS_PER_REGION per region.
6. **Build producer lookup**: Normalized winery names → canonical data. Used by resolver and autocomplete.
7. **Aggregate varietals**: Group by variety. Normalize synonyms (Shiraz→Syrah, etc.). Count, filter by MIN_VARIETAL_REVIEWS. Assign color (red/white/rosé). Compute top regions per varietal.
8. **Build varietal lookup**: Synonym map for matching.
9. **Generate IDs**: Apply `make_id()` to all entity names.
10. **Compute composite scores** for producers: `(normalized_review_count * 0.6) + (normalized_avg_rating * 0.4)`. Store as `rank` field (1 = top).
11. **Write JSON** with metadata block including generation timestamp, thresholds used, and entity counts.

### Country-Specific Region Config

```python
# Which WineMag field to use as the primary region for each country
REGION_FIELD_OVERRIDE = {
    "US": "region_1",           # Province is just "California"/"Oregon" — too broad
    "Australia": "region_1",    # Province is just "South Australia" — too broad
    # All other countries default to "province"
}

# For countries using region_1, fall back to province if region_1 is empty
```

### Synonym Normalization

```python
VARIETAL_SYNONYMS = {
    "Shiraz": "Syrah",
    "Garnacha": "Grenache",
    "Pinot Gris": "Pinot Grigio",
    "Pinot Bianco": "Pinot Blanc",
    "Grauburgunder": "Pinot Grigio",
    "Weissburgunder": "Pinot Blanc",
    "Spätburgunder": "Pinot Noir",
    "Blaufränkisch": "Lemberger",
}

VARIETAL_DISPLAY_NAMES = {
    "Syrah": "Syrah / Shiraz",
    "Grenache": "Grenache / Garnacha",
    "Pinot Grigio": "Pinot Grigio / Pinot Gris",
}
```

### Blend Handling

If the variety field contains a hyphen or "Blend" (e.g., "Cabernet Sauvignon-Merlot", "Red Blend", "Bordeaux-style Red Blend"):
- Do NOT include in varietal aggregation
- DO include in country/region/producer aggregation
- Tag the review as `is_blend: true` for downstream handling

---

## 7. Migration Checklist

### Database
```sql
TRUNCATE wine_profiles;
TRUNCATE dna_accumulation;
TRUNCATE dna_timeline;
TRUNCATE wine_interactions;
```

### File Operations

| Action | File |
|---|---|
| CREATE | `scripts/build_quiz_data.py` |
| CREATE | `src/lib/wineUnified.json` (generated by build script) |
| DELETE | `src/lib/wineData.js` |
| DELETE | `src/lib/wineReference-lookup.json` |
| DELETE | `src/lib/wineReference.json` (the full reference, if still present) |
| DELETE | `scripts/build_wine_reference.py` |
| REWRITE | `src/lib/profileEngine.js` |
| REWRITE | `src/lib/matchEngine.js` |
| REWRITE | `src/lib/dnaEvolution.js` |
| REWRITE | `src/lib/wineResolver.js` |
| REWRITE | Quiz component in `src/app/page.js` |
| UPDATE | `CLAUDE.md` — update tech stack section to reference new data architecture |

### Verification

After migration, verify:
- [ ] `npm run build` passes with no errors
- [ ] Quiz loads and displays countries from unified data
- [ ] Selecting a country shows its regions
- [ ] Selecting a region shows its producers with "show more"
- [ ] Varietal step reranks based on selections
- [ ] Completing the quiz saves a profile to Supabase with new IDs
- [ ] Restaurant wine list matching still works (matchEngine reads from unified data)
- [ ] Bottle logging resolves metadata correctly (wineResolver reads from unified data)
- [ ] DNA Evolution accumulates and promotes using new IDs
- [ ] No references to wineData.js remain anywhere in the codebase

---

## 8. Implementation Priority

Recommended build order:

1. **Build script** (`scripts/build_quiz_data.py`) — generate `wineUnified.json` from the CSV. This is the foundation everything else depends on. Verify the output shape and entity counts before proceeding.
2. **Database migration** — truncate all profile-related tables.
3. **Quiz component rewrite** — the most user-visible change. Implement all 5 steps with progressive disclosure and dynamic varietal reranking.
4. **profileEngine.js rewrite** — simplified archetype placeholder + updated name resolution from unified data. Update WINE_RECS IDs.
5. **matchEngine.js rewrite** — remove mapping dictionaries, read from unified data.
6. **wineResolver.js update** — point at unified data.
7. **dnaEvolution.js update** — remove mappable/unmappable logic.
8. **Cleanup** — delete old files, update CLAUDE.md, verify no stale imports.
9. **End-to-end testing** — full flow from quiz → profile → restaurant matching → bottle logging → DNA evolution.

---

## 9. Future Considerations (Not In This Spec)

These are explicitly out of scope but worth noting:

- **Archetype engine redesign**: The simplified placeholder works for now. A proper redesign should use the richer data (review counts, rating distributions, regional diversity metrics) to generate more nuanced archetypes.
- **Dataset updates**: If WineMag publishes updated data (or you switch to a different/larger dataset), you re-run the build script and regenerate `wineUnified.json`. All IDs are stable as long as entity names don't change. Consider a CI step that regenerates the JSON on dataset changes.
- **User-contributed data**: Long-term, if users log wines that aren't in the WineMag dataset, you could build a supplementary data layer that extends the unified JSON with crowd-sourced entries.
- **Lazy loading producers**: If bundle size becomes an issue, split producers into a separate JSON loaded on-demand when the user reaches Step 3.
- **Search/filter in quiz**: For power users, add a search bar within the region or producer steps so they can type to filter instead of scrolling through "show more" pages.

---

## 10. Files Summary

### New Files
- `scripts/build_quiz_data.py` — data pipeline script
- `src/lib/wineUnified.json` — generated unified data (DO NOT hand-edit)

### Deleted Files
- `src/lib/wineData.js`
- `src/lib/wineReference-lookup.json`
- `src/lib/wineReference.json`
- `scripts/build_wine_reference.py`

### Rewritten Files
- `src/lib/profileEngine.js`
- `src/lib/matchEngine.js`
- `src/lib/dnaEvolution.js`
- `src/lib/wineResolver.js`
- `src/app/page.js` (quiz component)

### Updated Files
- `CLAUDE.md`
