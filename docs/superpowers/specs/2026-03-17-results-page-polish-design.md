# Results Page UI/UX Polish — Design Spec

**Date:** 2026-03-17
**Scope:** Frontend polish pass on `/recommend` results page, plus match engine enrichment and Vision prompt refinement.
**Files affected:** `src/app/recommend/page.js`, `src/lib/matchEngine.js`, `src/app/api/parse-wine-list/route.js`

---

## 1. Match Engine Enrichment (matchEngine.js)

### 1a. Enriched Pick Objects

`scoreEntry` already runs `detectWineAttributes()` which resolves regionIds via `regionLookup` and detects varietals. We extend the scored entry to carry display-ready fields through to `curatePicks` output:

```js
{
  ...existingPickFields,
  regionDisplayName: "Bordeaux" | null,     // Quiz-level region name, title-cased
  varietalDisplayName: "Grenache" | null,    // Canonical name from varietals array
  vintageYear: "2019" | null,               // Regex from name or Vision vintage field
}
```

**Region display name resolution:**
- `detectWineAttributes()` resolves sub-appellations via `regionLookup` → `regionId` + `country`
- Look up `regionId` against the `regions` data structure to find `region.name` (the display name)
- Example: `regionLookup["castillon côtes de bordeaux"]` → `{ regionId: "bordeaux", country: "france" }` → `regions.france.find(r => r.id === "bordeaux").name` → `"Bordeaux"`
- If a sub-appellation doesn't resolve, `regionDisplayName` is null (don't show raw sub-appellation)

**Varietal display name:**
- `detectWineAttributes()` already resolves varietal IDs
- Look up the canonical varietal object from `varietals` array → use `.name` field
- Example: `varietalId: "grenache"` → `varietals.find(v => v.id === "grenache").name` → `"Grenache"`

**Vintage extraction:**
- Regex: `/((?:19|20)\d{2})/` on the wine name string
- If Vision Path A provides `vintage` field, prefer that over regex
- Stored as string (e.g., `"2019"`) or null

### 1b. Dynamic Pick Count

New exported utility:

```js
function getPickCount(totalWines, colorFilter) {
  if (colorFilter !== 'all') return 5;
  const count = Math.max(5, Math.floor(totalWines / 30));
  return Math.min(count, 10);
}
```

| Total wines | Filter | Picks |
|-------------|--------|-------|
| 20          | All    | 5     |
| 50          | All    | 5     |
| 150         | All    | 5     |
| 180         | All    | 6     |
| 267         | All    | 8     |
| 300+        | All    | 10    |
| Any         | Red/White/Sparkling | 5 |

`curatePicks` gains an optional `maxPicks` parameter (default 5):
- Slots 1–5: Top, Splurge, Value, Adventure, Wildcard (unchanged logic)
- Slots 6–maxPicks: Next-highest-scoring unused wines, each labeled `pickType: "worth_trying"`

### 1c. Sparkling Filter Fix in curatePicks

When `colorPreference === "white"`, exclude wines with `detectedColor === "sparkling"`:

```js
// Current: filter to detectedColor === colorPref
// New: if colorPref === "white", also exclude "sparkling"
// if colorPref === "sparkling", match only "sparkling"
```

Fallback behavior unchanged: if filtered pool < 3 wines, fall back to full pool.

---

## 2. Vision Extraction Prompt (parse-wine-list/route.js)

Two additions to the extraction prompt. No structural changes to the response format.

### 2a. Vintage Emphasis

Add to prompt:
> "Always extract the vintage year when visible, even if it appears in a separate column, in small print, or after the wine name."

### 2b. Sparkling Clarity

Add to prompt:
> "For the color field, use 'sparkling' for any sparkling wine (Champagne, Cava, Prosecco, Crémant, Brut, Méthode Traditionnelle, Spumante, Sekt, MCC, etc.), even if it would otherwise be classified as white or rosé."

---

## 3. Client-Side Display (recommend/page.js)

### 3a. Wine Name Formatting

New utility function `formatWineName(name)`:
- Title-cases all words
- Preserves wine abbreviations uppercase: AOC, DOC, DOCG, IGT, AVA, CRU, MCC
- Keeps French articles lowercase when mid-name: de, du, des, le, la, les, l'
- Handles `d'` contractions: "d'Aqueria" not "D'aqueria"
- Preserves accented characters (é, è, ê, ë, ô, ü, etc.)
- Applied at render time on `pick.name` — does not mutate data

Edge cases:
- `"CÔTES DU PROVENCE CRU CLASSÉ"` → `"Côtes du Provence Cru Classé"`
- `"POMEROL Château Le Bon Pasteur"` → `"Pomerol Château Le Bon Pasteur"`
- `"BORDEAUX Les Hauts de Lagarde"` → `"Bordeaux Les Hauts de Lagarde"`

### 3b. Tag Standardization

Every card shows exactly these tags, in order:

1. **Country + Region:** `🇫🇷 France — Provence`
   - Source: `pick.detectedCountry` (existing) + `pick.regionDisplayName` (new from §1a)
   - If no region resolved: show country only (`🇫🇷 France`)
   - If no country resolved: omit tag entirely
2. **Varietal:** `🍇 Grenache`
   - Source: `pick.varietalDisplayName` (new from §1a)
   - If null: omit tag

All existing match-reason tags removed (region match, grape match, estate match, etc.). These are internal scoring signals, not user-facing info.

### 3c. Vintage Display

If `pick.vintageYear` is present and not already included in `pick.name`, append after the formatted wine name:
```
Château Margaux, Margaux 2019
```
If vintage is already embedded in the name string (detected via regex), don't duplicate.

### 3d. Category Legend

Single muted line above pick cards, below filters:

```
🏆 Top Pick  ·  ✨ Splurge  ·  💰 Great Value  ·  🧭 Adventure  ·  🍷 Worth Trying
```

Style: Source Sans 3, 13px, opacity 0.5. No interactivity, no expand/collapse.

### 3e. Remove Static Card Descriptions

Remove all per-card descriptions:
- ~~"Worth the stretch — strong DNA match at a higher price point"~~ (Splurge)
- ~~"Best match in the lower price range"~~ (Value)
- ~~"Something new — matches your grape preferences from a different region"~~ (Adventure)

Every card has identical structure: badge, name+vintage, price, tags, rate button.

### 3f. Header Copy

**Before:**
```
Your 5 picks
Curated from 142 matches across 267 wines on the list
```

**After:**
```
Your picks
267 wines on this list — here are your top 8
```
(or "here's where to start" when showing exactly 5 picks)

- Heading: "Your picks" — Playfair Display, 30px, same style
- Subtitle uses `totalParsed` for the wine count N

### 3g. Bottom Navigation

**Remove:**
- "Update My DNA" button
- "View Wine Journal" link

**Keep (renamed):**
- Single centered button: **"Scan Again"** (was "Try Another List")
- `handleReset` preserves filter state (colorPref, minPrice, maxPrice) so the input view remembers preferences

### 3h. Dynamic Result Count Integration

Page calls `getPickCount(totalParsed, colorPref)` and passes result as `maxPicks` to `curatePicks`. Updates on refilter too — switching from "All" to "Red" drops back to 5 picks.

Header subtitle reflects actual count dynamically.

### 3i. Sparkling Filter Chain

Full verification path:
1. **Vision extraction:** Prompt now explicitly lists sparkling wine types → returns `"color": "sparkling"`
2. **Entry mapping (Path A):** `sectionColor: w.color` already passes "sparkling" through
3. **Text parser (Path B):** `parseWineList` detects "Sparkling" section headers → sets `sectionColor: "sparkling"` on entries
4. **Scoring:** `detectedColor` populated from `sectionColor` or attribute detection
5. **curatePicks filter:** "sparkling" → only sparkling; "white" → excludes sparkling (new logic from §1c)
6. **UI:** Four filter buttons: All / Red / White / Sparkling (already implemented)

---

## 4. Card Structure Summary

Final card layout, top to bottom:

```
┌─────────────────────────────────────────┐
│ 🏆 TOP PICK                       $185  │
│                                         │
│ Château Lynch-Bages, Pauillac 2018      │
│                                         │
│ 🇫🇷 France — Bordeaux    🍇 Cabernet    │
│                                         │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│        Had this wine? Rate it           │
└─────────────────────────────────────────┘
```

---

## 5. What's NOT in This Workstream

Explicitly deferred:
- Match algorithm improvements (Adventure logic, varietal diversity, scoring calibration)
- Personalized wine storytelling (AI sommelier notes per pick)
- Multi-page accumulation
- Input page filter changes (already working)
- Rate limiting and cost tracking
- Producer match display line (currently under pick cards — removing with other match-reason data)

---

## 6. Implementation Order

1. `formatWineName` utility function
2. Match engine enrichment: `regionDisplayName`, `varietalDisplayName`, `vintageYear` on pick objects
3. `getPickCount` + `curatePicks` `maxPicks` parameter
4. Sparkling exclusion from "white" filter in `curatePicks`
5. Vision prompt updates (vintage emphasis, sparkling clarity)
6. Tag standardization (country—region + varietal)
7. Remove static descriptions, add category legend
8. Header copy update
9. Remove bottom navigation, rename to "Scan Again"
10. Dynamic result count integration in page
11. Vintage display in card rendering
12. Sparkling filter chain end-to-end verification
