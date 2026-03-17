# Results Page UI/UX Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the `/recommend` results page with clean tags, formatted names, dynamic pick counts, and simplified card layout.

**Architecture:** Three layers of change: (1) match engine enrichment — `scoreEntry` surfaces `detectedVarietalId`, `curatePicks` supports `maxPicks` and sparkling filter fix; (2) Vision prompt refinement — vintage emphasis and sparkling clarity; (3) page component — `formatWineName`, standardized tags, simplified cards, new header, "Scan Again" button.

**Tech Stack:** Next.js 14 (App Router), inline styles (no Tailwind), Anthropic Claude Vision API, wineUnified.json data

**Spec:** `docs/superpowers/specs/2026-03-17-results-page-polish-design.md`

---

## Chunk 1: Match Engine Enrichment

### Task 1: Add `detectedVarietalId` to `scoreEntry` return object

**Files:**
- Modify: `src/lib/matchEngine.js:670-681`

- [ ] **Step 1: Add `detectedVarietalId` to the return object**

In `scoreEntry()`, the return object at line 670 currently includes `detectedRegionIds`, `detectedCountryIds`, `detectedCountry` but no varietal. Add `detectedVarietalId` from `attrs.varietalIds`:

```js
// matchEngine.js line 670 — replace return block
  return {
    name: entry.name,
    price: entry.price,
    originalLine: entry.originalLine,
    score: score,
    matchReasons: matchReasons.sort(function(a, b) { return (b.weight || 0) - (a.weight || 0); }),
    detectedColor: detectedColor || entry.sectionColor || null,
    detectedRegionIds: Array.from(detectedRegionIds),
    detectedCountryIds: Array.from(detectedCountryIds),
    detectedCountry: detectedCountryIds.size > 0 ? Array.from(detectedCountryIds)[0] : null,
    detectedVarietalId: attrs.varietalIds.size > 0 ? Array.from(attrs.varietalIds)[0] : null,
    vintage: entry.vintage || null,
  };
```

The `vintage` field passes through the Vision Path A vintage data (set in entry mapping in Task 7). For text-parsed entries, `entry.vintage` will be `undefined`, so this becomes `null`.

- [ ] **Step 2: Verify no existing code breaks**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully. The new field is additive — nothing reads it yet.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): add detectedVarietalId to scoreEntry return object"
```

---

### Task 2: Add display name resolution helpers

**Files:**
- Modify: `src/lib/matchEngine.js` (add after `getCountryName` at line 846, and add exports)

- [ ] **Step 1: Add `getRegionDisplayName` and `getVarietalDisplayName` functions**

Append after line 846 of matchEngine.js:

```js
export function getRegionDisplayName(regionId, countryId) {
  if (!regionId) return null;
  // Search in the specific country's regions first
  if (countryId && REGIONS[countryId]) {
    const region = REGIONS[countryId].find(function(r) { return r.id === regionId; });
    if (region) return region.name;
  }
  // Fall back to searching all countries
  for (const cId of Object.keys(REGIONS)) {
    const region = REGIONS[cId].find(function(r) { return r.id === regionId; });
    if (region) return region.name;
  }
  return null;
}

export function getVarietalDisplayName(varietalId) {
  if (!varietalId) return null;
  const varietal = VARIETALS.find(function(v) { return v.id === varietalId; });
  return varietal ? varietal.name : null;
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): add getRegionDisplayName and getVarietalDisplayName helpers"
```

---

### Task 3: Export `smartTitleCase` and extend with wine abbreviations

**Files:**
- Modify: `src/lib/matchEngine.js:142-154` (export existing function)
- Modify: `src/lib/matchEngine.js` (add `formatWineName` wrapper after `smartTitleCase`)

- [ ] **Step 1: Export `smartTitleCase` and add `formatWineName`**

Change line 142 from `function smartTitleCase(name)` to `export function smartTitleCase(name)`.

Then add `formatWineName` immediately after `smartTitleCase` (after line 154):

```js
export function formatWineName(name) {
  if (!name) return "";
  // Apply smartTitleCase first (handles French articles, d'/l' contractions, accent preservation)
  let formatted = smartTitleCase(name);
  // Preserve wine abbreviations as uppercase
  const abbreviations = ["AOC", "DOC", "DOCG", "IGT", "AVA", "MCC"];
  for (const abbr of abbreviations) {
    const regex = new RegExp("\\b" + abbr.toLowerCase() + "\\b", "gi");
    formatted = formatted.replace(regex, abbr);
  }
  return formatted;
}
```

Note: `smartTitleCase` already handles the 0.7 uppercase ratio threshold, French articles (de, du, des, le, la, les), and d'/l' contractions. `formatWineName` layers wine-specific abbreviation handling on top. "Cru" is intentionally NOT in the uppercase list — it stays title-cased ("Cru Classé", "Grand Cru").

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully. `smartTitleCase` is already called internally by `parseWineList` (line 371), so changing it to `export` is safe.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): export smartTitleCase and add formatWineName wrapper"
```

---

### Task 4: Add `getPickCount` utility and update `curatePicks` for dynamic maxPicks

**Files:**
- Modify: `src/lib/matchEngine.js:688-771` (curatePicks function)
- Modify: `src/lib/matchEngine.js` (add getPickCount export)

- [ ] **Step 1: Add `getPickCount` function**

Add before `curatePicks` (before line 688):

```js
export function getPickCount(totalWines, colorFilter) {
  if (colorFilter && colorFilter !== "all") return 5;
  var count = Math.max(5, Math.floor(totalWines / 30));
  return Math.min(count, 10);
}
```

- [ ] **Step 2: Update `curatePicks` to accept `maxPicks`**

In `curatePicks` at line 688, read `maxPicks` from options:

```js
export function curatePicks(scoredEntries, options) {
  const minPrice = options.minPrice;
  const maxPrice = options.maxPrice;
  const colorPreference = options.colorPreference;
  const maxPicks = options.maxPicks || 5;
```

Update the wildcard fill loop (line 766) — change `picks.length < 5` to `picks.length < maxPicks`:

```js
  // 5. WILDCARD — fill remaining slots from budget pool
  for (var i = 0; i < mainPool.length && picks.length < maxPicks; i++) {
    var idx = matched.indexOf(mainPool[i]);
    if (idx >= 0 && !used.has(idx)) { used.add(idx); picks.push(Object.assign({}, mainPool[i], { pickType: "wildcard" })); }
  }

  return picks.slice(0, maxPicks);
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully. Existing callers pass no `maxPicks`, so they default to 5 (no behavior change).

- [ ] **Step 4: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "feat(matchEngine): add getPickCount utility, support maxPicks in curatePicks"
```

---

### Task 5: Fix sparkling filter in `curatePicks`

**Files:**
- Modify: `src/lib/matchEngine.js:694-696`

- [ ] **Step 1: Replace the color filter logic**

Replace lines 694-696:

```js
  // OLD:
  if (colorPreference && colorPreference !== "all") {
    const filtered = pool.filter(function(e) { return !e.detectedColor || e.detectedColor === colorPreference; });
    if (filtered.length >= 3) pool = filtered;
  }
```

With:

```js
  if (colorPreference && colorPreference !== "all") {
    const filtered = pool.filter(function(e) {
      if (!e.detectedColor) return true; // No color detected — include in any filter
      if (colorPreference === "white") return e.detectedColor === "white"; // Exclude sparkling from white
      return e.detectedColor === colorPreference;
    });
    if (filtered.length >= 3) pool = filtered;
  }
```

This ensures: "white" excludes sparkling, "sparkling" matches only sparkling, wines with null color pass through all filters. The fallback (< 3 results → use full pool) is unchanged.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matchEngine.js
git commit -m "fix(matchEngine): exclude sparkling wines from white filter, add sparkling filter support"
```

---

## Chunk 2: Vision Prompt Refinement

### Task 6: Update Vision extraction prompt

**Files:**
- Modify: `src/app/api/parse-wine-list/route.js:6-42`

- [ ] **Step 1: Add vintage emphasis and sparkling clarity to prompt**

In the `EXTRACTION_PROMPT` string, add two new lines. After the existing line `- If you cannot read a wine name clearly, include your best guess` (line 22), add:

```
- Always extract the vintage year when visible, even if it appears in a separate column, in small print, or after the wine name
- For the color field, use "sparkling" for any sparkling wine (Champagne, Cava, Prosecco, Crémant, Brut, Méthode Traditionnelle, Spumante, Sekt, MCC, etc.), even if it would otherwise be classified as white or rosé
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/parse-wine-list/route.js
git commit -m "feat(vision): improve vintage extraction and sparkling detection in prompt"
```

---

## Chunk 3: Page Component — Data Flow Updates

### Task 7: Update page imports and add vintage extraction

**Files:**
- Modify: `src/app/recommend/page.js:5` (imports)
- Modify: `src/app/recommend/page.js` (Vision Path A entry mapping, ~line 218)

- [ ] **Step 1: Update imports**

Replace line 5:

```js
import { parseWineList, matchWinesAgainstDNA, curatePicks, getPickTypeInfo, getCountryFlag, getCountryName } from "@/lib/matchEngine";
```

With:

```js
import { parseWineList, matchWinesAgainstDNA, curatePicks, getPickTypeInfo, getCountryFlag, getCountryName, getRegionDisplayName, getVarietalDisplayName, formatWineName, getPickCount } from "@/lib/matchEngine";
```

- [ ] **Step 2: Update Vision Path A entry mapping to include vintage**

In `handleVisionScan`, the Vision Path A mapping (around line 218-226) currently maps `w.name`, `w.price`, `w.is_btg`, `w.color`. Add `vintage` passthrough:

```js
      if (data.wines && Array.isArray(data.wines) && data.wines.length > 0) {
        const entries = data.wines.map(w => ({
          name: w.name || "",
          price: typeof w.price === "number" ? w.price : null,
          originalLine: w.name || "",
          isByTheGlass: w.is_btg || false,
          sectionColor: w.color || null,
          sectionVarietal: null,
          vintage: w.vintage || null,
        }));
```

- [ ] **Step 3: Update `runAnalysis` to pass `maxPicks` and store `totalParsed` before calling curatePicks**

In `runAnalysis` (around line 131-145), update to use `getPickCount` and pass `maxPicks`:

```js
  const runAnalysis = (entries, minP, maxP, colorP) => {
    if (!profile) return;
    setTotalParsed(entries.length);
    const dna = {
      countries: profile.countries || [],
      regions: profile.regions || {},
      estates: profile.estates || {},
      varietals: profile.varietals || [],
      specificWines: profile.specific_wines || [],
    };
    const scored = matchWinesAgainstDNA(entries, dna);
    setScoredEntries(scored);
    const matched = scored.filter(e => e.score > 0);
    setTotalMatched(matched.length);
    const pickCount = getPickCount(entries.length, colorP);
    const curated = curatePicks(scored, { minPrice: minP, maxPrice: maxP, colorPreference: colorP, maxPicks: pickCount });
    setPicks(curated);
  };
```

- [ ] **Step 4: Update `handleRefilter` to also pass `maxPicks`**

In `handleRefilter` (around line 149-155):

```js
  const handleRefilter = (newColorPref, newMinPrice, newMaxPrice) => {
    if (!scoredEntries) return;
    const pickCount = getPickCount(totalParsed, newColorPref);
    const curated = curatePicks(scoredEntries, {
      minPrice: newMinPrice ? parseFloat(newMinPrice) : null,
      maxPrice: newMaxPrice ? parseFloat(newMaxPrice) : null,
      colorPreference: newColorPref,
      maxPicks: pickCount,
    });
    setPicks(curated);
  };
```

- [ ] **Step 5: Verify build**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully. New imports are used in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add src/app/recommend/page.js
git commit -m "feat(recommend): wire up new matchEngine exports, dynamic pick count, vintage passthrough"
```

---

## Chunk 4: Page Component — Results View Rendering

### Task 8: Update header copy

**Files:**
- Modify: `src/app/recommend/page.js:469-478`

- [ ] **Step 1: Replace header copy**

Replace the header section (lines 469-478):

```jsx
        <div style={{ textAlign: "center", padding: "28px 0 20px" }}>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px", color: "#1B3D2F", margin: "0 0 10px", fontWeight: 700, letterSpacing: "-0.01em" }}>
            {picks.length === 0 ? "No matches found" : "Your picks"}
          </h2>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.45, margin: 0, lineHeight: 1.5 }}>
            {picks.length > 0
              ? `${totalParsed} wines on this list — ${picks.length > 5 ? `here are your top ${picks.length}` : "here's where to start"}`
              : `We scanned ${totalParsed} wines but couldn't find matches for your DNA. Try adjusting your filters or updating your profile.`}
          </p>
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/recommend/page.js
git commit -m "feat(recommend): update results header to conversational copy with wine count"
```

---

### Task 9: Add category legend

**Files:**
- Modify: `src/app/recommend/page.js` (after filters section, before picks list — around line 507)

- [ ] **Step 1: Add legend line between filters and pick cards**

Insert after the filter `</div>` (line 506) and before the picks list `{picks.length > 0 && (` (line 508):

```jsx
        {/* Category legend */}
        {picks.length > 0 && (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.45, margin: 0, lineHeight: 1.8 }}>
              🏆 Top Pick  ·  ✨ Splurge  ·  💰 Great Value  ·  🧭 Adventure  ·  🍷 Worth Trying
            </p>
          </div>
        )}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/recommend/page.js
git commit -m "feat(recommend): add category legend above pick cards"
```

---

### Task 10: Rewrite pick card rendering

This is the largest single change. Replace the entire pick card loop (lines 509-623) with the new simplified structure.

**Files:**
- Modify: `src/app/recommend/page.js:509-623`

- [ ] **Step 1: Replace pick card rendering**

Replace the pick card section (from `{picks.length > 0 && (` through the closing `)}`) with:

```jsx
        {picks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: 32 }}>
            {picks.map((pick, i) => {
              const typeInfo = getPickTypeInfo(pick.pickType);
              const displayName = formatWineName(pick.name);
              // Vintage: prefer from entry, fall back to regex extraction from name
              const vintageFromName = pick.name.match(/((?:19|20)\d{2})/);
              const vintage = pick.vintage || (vintageFromName ? vintageFromName[1] : null);
              // Check if vintage is already in the display name
              const nameHasVintage = vintage && displayName.includes(vintage);
              // Display name resolution
              const regionName = pick.detectedRegionIds && pick.detectedRegionIds.length > 0
                ? getRegionDisplayName(pick.detectedRegionIds[0], pick.detectedCountry)
                : null;
              const varietalName = pick.detectedVarietalId
                ? getVarietalDisplayName(pick.detectedVarietalId)
                : null;

              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.7)", borderRadius: "18px", padding: "20px",
                  border: "1px solid rgba(27,61,47,0.08)", position: "relative", overflow: "hidden",
                  boxShadow: i === 0 ? "0 4px 20px rgba(139,35,50,0.12)" : "0 2px 8px rgba(0,0,0,0.04)",
                }}>
                  {/* Badge + Price row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "4px 12px", borderRadius: "100px",
                      background: typeInfo.bg, color: typeInfo.color,
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                    }}>
                      <span>{typeInfo.emoji}</span>
                      <span>{typeInfo.label}</span>
                    </div>
                    {pick.price && (
                      <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "18px", fontWeight: 700, color: "#1B3D2F" }}>${pick.price}</span>
                    )}
                  </div>

                  {/* Wine name + vintage */}
                  <h3 style={{
                    fontFamily: "'Playfair Display', Georgia, serif", fontSize: i === 0 ? "20px" : "17px",
                    color: "#1B3D2F", margin: "0 0 10px", lineHeight: 1.3, fontWeight: 600,
                  }}>
                    {displayName}{vintage && !nameHasVintage ? ` ${vintage}` : ""}
                  </h3>

                  {/* Tags: Country—Region + Varietal */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                    {pick.detectedCountry && (
                      <span style={{
                        fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                        color: "#1B3D2F", opacity: 0.6, background: "rgba(27,61,47,0.04)",
                        padding: "3px 10px", borderRadius: "100px",
                      }}>
                        {getCountryFlag(pick.detectedCountry)} {getCountryName(pick.detectedCountry)}{regionName ? ` — ${regionName}` : ""}
                      </span>
                    )}
                    {varietalName && (
                      <span style={{
                        fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                        color: "#1B3D2F", opacity: 0.6, background: "rgba(27,61,47,0.04)",
                        padding: "3px 10px", borderRadius: "100px",
                      }}>
                        🍇 {varietalName}
                      </span>
                    )}
                  </div>

                  {/* Rating section */}
                  <div style={{
                    marginTop: 14, paddingTop: 14,
                    borderTop: "1px solid rgba(27,61,47,0.06)",
                  }}>
                    {pickRatings[pick.name] ? (
                      <div style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                        color: "#1B3D2F", opacity: 0.6,
                      }}>
                        <span>{{ loved: "❤️", liked: "👍", fine: "😐", not_for_me: "👎" }[pickRatings[pick.name]]}</span>
                        <span>{{ loved: "Loved it", liked: "Liked it", fine: "It was fine", not_for_me: "Not for me" }[pickRatings[pick.name]]}</span>
                        <button onClick={() => setRatingPick(pick.name)} style={{
                          fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                          color: "#8B2332", background: "none", border: "none",
                          cursor: "pointer", marginLeft: "auto", textDecoration: "underline", opacity: 0.6,
                        }}>Change</button>
                      </div>
                    ) : (
                      <button onClick={() => setRatingPick(pick.name)} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "8px 14px", borderRadius: "10px",
                        border: "1px solid rgba(139,35,50,0.12)", background: "rgba(139,35,50,0.03)",
                        fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                        color: "#8B2332", fontWeight: 600, cursor: "pointer",
                        width: "100%", justifyContent: "center",
                      }}>Had this wine? Rate it</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
```

Key changes from old cards:
- `formatWineName(pick.name)` applied to wine name
- Vintage appended if present and not already in name
- Country—Region tag uses `getRegionDisplayName` instead of raw match reasons
- Varietal tag uses `getVarietalDisplayName` instead of match reason labels
- All `matchReasons` tags removed
- `producerMatch` block removed
- Static description text (adventure/value/splurge) removed
- Rating section unchanged

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src/app/recommend/page.js
git commit -m "feat(recommend): rewrite pick cards with formatted names, vintage, standardized tags"
```

---

### Task 11: Replace bottom navigation with "Scan Again" button

**Files:**
- Modify: `src/app/recommend/page.js:626-644` (bottom nav section)

- [ ] **Step 1: Replace bottom navigation**

Replace lines 626-644 (the "Try Another List" + "Update My DNA" + "View Wine Journal" section) with:

```jsx
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <button onClick={handleReset} style={{
            padding: "14px 40px", borderRadius: "14px",
            border: "2px solid rgba(27,61,47,0.15)", background: "rgba(255,255,255,0.7)",
            color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, cursor: "pointer",
          }}>Scan Again</button>
        </div>
```

- [ ] **Step 2: Update `handleReset` to preserve filter state**

Find `handleReset` (around line 326-340). Currently resets everything including `colorPref`, `minPrice`, `maxPrice`. Change it to preserve filters:

```js
  const handleReset = () => {
    setPicks(null);
    setScoredEntries(null);
    setWineListText("");
    setTotalParsed(0);
    setTotalMatched(0);
    setErrorMsg("");
    setMenuUrl("");
    setExtractedFrom(null);
    setShowPasteMode(false);
    // Preserve colorPref, minPrice, maxPrice so input view remembers preferences
  };
```

Remove these three lines from `handleReset`:
```js
    setColorPref("all");
    setMinPrice("");
    setMaxPrice("");
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | head -40`
Expected: Builds successfully.

- [ ] **Step 4: Commit**

```bash
git add src/app/recommend/page.js
git commit -m "feat(recommend): replace bottom nav with Scan Again button, preserve filter state on reset"
```

---

## Summary

**11 tasks across 4 chunks:**
- Chunk 1 (Tasks 1-5): Match engine — varietal ID, display name helpers, formatWineName, dynamic picks, sparkling filter
- Chunk 2 (Task 6): Vision prompt — vintage emphasis, sparkling clarity
- Chunk 3 (Task 7): Page data flow — imports, vintage passthrough, dynamic pick count wiring
- Chunk 4 (Tasks 8-11): Page rendering — header, legend, cards, bottom nav

**Total commits:** 11 (one per task)

**Testing approach:** Each task verifies with `npx next build`. After all tasks, manually test:
1. Load `/recommend` — page renders without spinner stuck
2. Scan a wine list photo — picks show formatted names, country—region tags, varietal tags
3. Filter to "Red" — only red wines shown, pick count drops to 5
4. Filter to "Sparkling" — only sparkling shown
5. Filter to "White" — sparkling excluded
6. Adjust budget — picks re-curate instantly
7. "Scan Again" — returns to input view with filters preserved
8. Large list (200+ wines) — shows 6-10 picks instead of 5
