# Quiz Component Rewrite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Quiz component (`src/components/Quiz.js`) to read from `wineUnified.json` instead of `wineData.js`, adding progressive disclosure (show more), composite-scored producer ranking, dynamic varietal reranking, and Old World / New World country grouping.

**Architecture:** The Quiz is a single-file React component (475 lines) with inline styles. It has 11 sub-components. The rewrite changes the data source from 4 hardcoded exports (`COUNTRIES`, `REGIONS`, `ESTATES`, `VARIETALS`) to a single JSON import (`wineUnified.json`). The component structure stays the same (5 quiz steps + profile card), but Steps 1–4 get new display logic. Step 5 and DNAProfileCard are untouched.

**Tech Stack:** Next.js 14 (App Router), React with inline styles, `wineUnified.json` (2.8MB static JSON imported at build time)

**Spec:** `docs/superpowers/specs/2026-03-14-unified-data-architecture-spec.md` — sections 2A–2G

---

## Chunk 1: Data layer swap and Country step

### Task 1: Swap data import from wineData.js to wineUnified.json

**Files:**
- Modify: `src/components/Quiz.js:4` (import line)

- [ ] **Step 1: Change the import**

Replace the old import:
```javascript
import { COUNTRIES, REGIONS, ESTATES, VARIETALS } from "@/lib/wineData";
```

With the new import:
```javascript
import wineUnified from "@/lib/wineUnified.json";

const { countries: COUNTRIES_RAW, regions: REGIONS_DATA, producers: PRODUCERS_DATA, varietals: VARIETALS_RAW } = wineUnified;
```

Note: We destructure to local names to minimize downstream changes. `COUNTRIES_RAW` and `VARIETALS_RAW` are arrays of objects. `REGIONS_DATA` and `PRODUCERS_DATA` are objects keyed by country/region ID.

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build 2>&1 | tail -20`

Expected: Build will fail because CountryStep, RegionStep, EstateStep, VarietalStep reference the old variable names. This confirms the import swap is wired in and we need to update each step. That's fine — we'll fix each step in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/components/Quiz.js
git commit -m "refactor: swap Quiz data import from wineData.js to wineUnified.json"
```

---

### Task 2: Rewrite CountryStep with Old World / New World grouping

**Files:**
- Modify: `src/components/Quiz.js` (CountryStep function, ~lines 90–98)

The current CountryStep renders all 12 countries in a flat list. The new version groups countries by Old World / New World (using the `world` field), sorts each group by `reviewCount` descending, and renders with section headers.

- [ ] **Step 1: Write the new CountryStep**

Replace the existing `CountryStep` function with:

```javascript
function CountryStep({ selected, onToggle }) {
  const oldWorld = COUNTRIES_RAW.filter(c => c.world === "old")
    .sort((a, b) => b.reviewCount - a.reviewCount);
  const newWorld = COUNTRIES_RAW.filter(c => c.world === "new")
    .sort((a, b) => b.reviewCount - a.reviewCount);

  const renderGroup = (label, countries) => (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
        textTransform: "uppercase", letterSpacing: "0.15em",
        color: "#1B3D2F", opacity: 0.4, margin: "0 0 10px 4px", fontWeight: 600,
      }}>{label}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {countries.map(c => (
          <Chip key={c.id} label={c.name} emoji={c.emoji}
            selected={selected.includes(c.id)}
            onClick={() => onToggle(c.id)} />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <StepHeader number="01" title="Where in the world?"
        subtitle="Select the countries whose wines you enjoy. Pick as many as you like." />
      {renderGroup("Old World", oldWorld)}
      {renderGroup("New World", newWorld)}
    </div>
  );
}
```

- [ ] **Step 2: Verify this step renders**

Run: `npm run build 2>&1 | tail -20`

The build may still fail due to other steps, but CountryStep itself should be valid. If you want to spot-check, run `npm run dev` and load the quiz — Step 1 should show countries in two groups.

- [ ] **Step 3: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: CountryStep with Old World / New World grouping from unified data"
```

---

## Chunk 2: RegionStep with progressive disclosure

### Task 3: Rewrite RegionStep with "Show more" progressive disclosure

**Files:**
- Modify: `src/components/Quiz.js` (RegionStep function, ~lines 101–114)

The current RegionStep uses the `Accordion` component to show regions grouped by country. It shows ALL regions at once. The new version shows the top 12 regions per country (sorted by `reviewCount`), with a "Show N more" button to reveal the rest.

This requires adding local state to track which countries have been expanded.

- [ ] **Step 1: Write the new RegionStep**

Replace the existing `RegionStep` function with:

```javascript
function RegionStep({ selectedCountries, regions, onToggle }) {
  const [expandedCountries, setExpandedCountries] = useState({});
  const INITIAL_SHOW = 12;

  const items = selectedCountries
    .map(cId => {
      const country = COUNTRIES_RAW.find(c => c.id === cId);
      const countryRegions = (REGIONS_DATA[cId] || [])
        .slice() // don't mutate the source
        .sort((a, b) => b.reviewCount - a.reviewCount);
      return { id: cId, country, regions: countryRegions };
    })
    .filter(i => i.regions.length > 0);

  return (
    <div>
      <StepHeader number="02" title="Let's get more specific"
        subtitle="For each country, do you have favorite regions? Select any you know and love — or skip to like the country broadly." />
      <Accordion items={items} defaultOpen={items[0]?.id}
        getLabel={i => `${i.country.emoji} ${i.country.name}`}
        getCount={i => (regions[i.id] || []).length}
        renderContent={i => {
          const isExpanded = expandedCountries[i.id];
          const visible = isExpanded ? i.regions : i.regions.slice(0, INITIAL_SHOW);
          const remaining = i.regions.length - INITIAL_SHOW;
          return (
            <>
              {visible.map(r => (
                <Chip key={r.id} label={r.name}
                  selected={(regions[i.id] || []).includes(r.id)}
                  onClick={() => onToggle(i.id, r.id)} small />
              ))}
              {!isExpanded && remaining > 0 && (
                <button onClick={() => setExpandedCountries(p => ({ ...p, [i.id]: true }))}
                  style={{
                    width: "100%", padding: "8px", marginTop: 4,
                    background: "none", border: "1px dashed rgba(27,61,47,0.2)",
                    borderRadius: "8px", cursor: "pointer",
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                    color: "#8B2332", fontWeight: 500,
                  }}>
                  Show {remaining} more regions
                </button>
              )}
            </>
          );
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify this step renders**

Run `npm run dev` and navigate to Step 2 after selecting a country. Verify:
- Regions appear sorted by review count (most prominent first)
- Only first 12 show initially
- "Show N more" button appears for countries with >12 regions (e.g., Spain with 23)
- Clicking "Show more" reveals all regions
- Selecting/deselecting chips works

- [ ] **Step 3: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: RegionStep with progressive disclosure (show top 12, expand for more)"
```

---

## Chunk 3: ProducerStep with composite scoring and pagination

### Task 4: Rewrite EstateStep → ProducerStep with composite scoring and pagination

**Files:**
- Modify: `src/components/Quiz.js` (EstateStep function, ~lines 116–135, and its usage at ~line 453)

The current EstateStep groups estates by region using the Accordion. The new version:
1. Shows producers from `PRODUCERS_DATA[regionId]` (already sorted by `rank` in the build script)
2. Shows first 15 per region, with "Show more" loading next 15
3. Adds a prominent "Skip this step" visual cue in the subtitle
4. Renames the function from `EstateStep` to `ProducerStep` (and updates the reference at the render site)

- [ ] **Step 1: Write the new ProducerStep**

Replace the existing `EstateStep` function with:

```javascript
function ProducerStep({ selectedRegions, estates, onToggle }) {
  const [expandedRegions, setExpandedRegions] = useState({});
  const PAGE_SIZE = 15;

  // Build items: one per selected region that has producers
  const items = Object.entries(selectedRegions).flatMap(([countryId, regionIds]) =>
    regionIds
      .filter(rId => PRODUCERS_DATA[rId] && PRODUCERS_DATA[rId].length > 0)
      .map(rId => {
        const region = (REGIONS_DATA[countryId] || []).find(r => r.id === rId);
        const country = COUNTRIES_RAW.find(c => c.id === countryId);
        return {
          id: rId,
          region,
          country,
          producers: PRODUCERS_DATA[rId] || [], // already sorted by rank
        };
      })
  );

  if (items.length === 0) {
    return (
      <div>
        <StepHeader number="03" title="Any favorite producers?"
          subtitle="No producers found for your selected regions — no worries! You can add specific wines in the next step." />
      </div>
    );
  }

  return (
    <div>
      <StepHeader number="03" title="Any favorite producers?"
        subtitle="Know specific estates or wineries you love? Select them — totally fine to skip this step." />
      <Accordion items={items} defaultOpen={items[0]?.id}
        getLabel={i => `${i.country?.emoji || ""} ${i.region?.name || i.id}`}
        getCount={i => (estates[i.id] || []).length}
        renderContent={i => {
          const showCount = expandedRegions[i.id] || PAGE_SIZE;
          const visible = i.producers.slice(0, showCount);
          const remaining = i.producers.length - showCount;
          return (
            <>
              {visible.map(p => (
                <Chip key={p.id} label={p.name}
                  selected={(estates[i.id] || []).includes(p.id)}
                  onClick={() => onToggle(i.id, p.id)} small />
              ))}
              {remaining > 0 && (
                <button onClick={() => setExpandedRegions(p => ({
                  ...p, [i.id]: showCount + PAGE_SIZE,
                }))}
                  style={{
                    width: "100%", padding: "8px", marginTop: 4,
                    background: "none", border: "1px dashed rgba(27,61,47,0.2)",
                    borderRadius: "8px", cursor: "pointer",
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                    color: "#8B2332", fontWeight: 500,
                  }}>
                  Show {Math.min(remaining, PAGE_SIZE)} more producers
                </button>
              )}
            </>
          );
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update the render site**

In the main Quiz component's render section (~line 453), update:

```javascript
// Old:
{step === 2 && <EstateStep regions={answers.regions} estates={answers.estates} onToggle={(rId, eId) => setAnswers(p => ({ ...p, estates: { ...p.estates, [rId]: toggle(p.estates[rId] || [], eId) } }))} />}

// New:
{step === 2 && <ProducerStep selectedRegions={answers.regions} estates={answers.estates} onToggle={(rId, eId) => setAnswers(p => ({ ...p, estates: { ...p.estates, [rId]: toggle(p.estates[rId] || [], eId) } }))} />}
```

Note: The `answers.estates` key name stays the same for backward compatibility with profileEngine.js. The prop name `selectedRegions` replaces `regions` for clarity (it's the regions selected in Step 2, keyed by country).

- [ ] **Step 3: Verify**

Run `npm run dev`. Navigate to Step 3 after selecting countries and regions. Verify:
- Producers appear grouped by region in Accordion
- First 15 show per region, sorted by rank (composite score)
- "Show more" loads next 15
- Selecting/deselecting works
- Empty state message shows if no regions had producers

- [ ] **Step 4: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: ProducerStep with composite-scored ranking and show-more pagination"
```

---

## Chunk 4: VarietalStep with dynamic reranking

### Task 5: Rewrite VarietalStep with dynamic reranking based on selections

**Files:**
- Modify: `src/components/Quiz.js` (VarietalStep function, ~lines 137–153, and its render call ~line 454)

The current VarietalStep shows a static list of 26 varietals split by red/white. The new version:
1. Uses all 71 varietals from `VARIETALS_RAW`
2. Computes a relevance score based on selected regions' `topVarietals`
3. Splits into "Based on your selections" (score > 0) and "Other varietals" (score === 0)
4. Within each section, groups by red/white
5. Falls back to global reviewCount ranking if no upstream selections

- [ ] **Step 1: Write the new VarietalStep**

Replace the existing `VarietalStep` function with:

```javascript
function VarietalStep({ selected, onToggle, selectedRegions, selectedEstates }) {
  // Compute relevance scores: regionMatches * 3 + producerMatches * 1 (per spec 2E)
  const scores = {};

  // Region signal: each selected region's topVarietals get +3
  Object.entries(selectedRegions || {}).forEach(([countryId, regionIds]) => {
    regionIds.forEach(rId => {
      const region = (REGIONS_DATA[countryId] || []).find(r => r.id === rId);
      if (region && region.topVarietals) {
        region.topVarietals.forEach(vId => {
          scores[vId] = (scores[vId] || 0) + 3;
        });
      }
    });
  });

  // Producer signal: each selected producer's topVarietals get +1
  Object.entries(selectedEstates || {}).forEach(([rId, pIds]) => {
    const producers = PRODUCERS_DATA[rId] || [];
    pIds.forEach(pId => {
      const producer = producers.find(p => p.id === pId);
      if (producer && producer.topVarietals) {
        producer.topVarietals.forEach(vId => {
          scores[vId] = (scores[vId] || 0) + 1;
        });
      }
    });
  });

  const hasSelections = Object.keys(scores).length > 0;

  // Sort varietals: by relevance score desc, then reviewCount desc
  const sorted = VARIETALS_RAW.slice().sort((a, b) => {
    const sa = scores[a.id] || 0;
    const sb = scores[b.id] || 0;
    if (sa !== sb) return sb - sa;
    return b.reviewCount - a.reviewCount;
  });

  const relevant = hasSelections ? sorted.filter(v => scores[v.id]) : [];
  const other = hasSelections ? sorted.filter(v => !scores[v.id]) : sorted;

  const renderGroup = (varietals, colorLabel, colorHex) => {
    const filtered = varietals.filter(v => v.color === colorLabel);
    if (filtered.length === 0) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        <p style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
          textTransform: "uppercase", letterSpacing: "0.12em",
          color: colorHex, margin: "0 0 8px 4px", fontWeight: 600,
        }}>{colorLabel === "red" ? "Red" : "White"}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {filtered.map(v => (
            <Chip key={v.id} label={v.name} color={colorHex}
              selected={selected.includes(v.id)}
              onClick={() => onToggle(v.id)} small />
          ))}
        </div>
      </div>
    );
  };

  const renderSection = (label, varietals) => {
    if (varietals.length === 0) return null;
    return (
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
          textTransform: "uppercase", letterSpacing: "0.15em",
          color: "#1B3D2F", opacity: 0.4, margin: "0 0 12px 4px", fontWeight: 600,
        }}>{label}</p>
        {renderGroup(varietals, "red", "#8B2332")}
        {renderGroup(varietals, "white", "#6B8F5E")}
      </div>
    );
  };

  return (
    <div>
      <StepHeader number="04" title="Which grapes do you love?"
        subtitle="These are your preferences regardless of origin. A Pinot Noir lover is a Pinot Noir lover, whether Burgundy or Oregon." />
      {hasSelections ? (
        <>
          {renderSection("Based on your selections", relevant)}
          {renderSection("Other varietals", other)}
        </>
      ) : (
        <>
          {renderGroup(sorted, "red", "#8B2332")}
          {renderGroup(sorted, "white", "#6B8F5E")}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the render site to pass selectedRegions**

In the main Quiz render section (~line 454), update:

```javascript
// Old:
{step === 3 && <VarietalStep selected={answers.varietals} onToggle={id => setAnswers(p => ({ ...p, varietals: toggle(p.varietals, id) }))} />}

// New:
{step === 3 && <VarietalStep selected={answers.varietals} onToggle={id => setAnswers(p => ({ ...p, varietals: toggle(p.varietals, id) }))} selectedRegions={answers.regions} selectedEstates={answers.estates} />}
```

- [ ] **Step 3: Verify**

Run `npm run dev`. Navigate to Step 4 after selecting countries and regions. Verify:
- If regions were selected: varietals split into "Based on your selections" and "Other varietals"
- Within each section, grouped by Red/White
- If no regions selected: flat list by reviewCount, grouped by color
- Selecting/deselecting works

- [ ] **Step 4: Commit**

```bash
git add src/components/Quiz.js
git commit -m "feat: VarietalStep with dynamic reranking based on selected regions"
```

---

## Chunk 5: SpecificWineStep update and final integration

### Task 6: Update SpecificWineStep to use producers from unified data

**Files:**
- Modify: `src/components/Quiz.js` (SpecificWineStep function, ~lines 155–277)

The current SpecificWineStep derives estate suggestions from `ESTATES[rId]`. Since `ESTATES` no longer exists, we need to use `PRODUCERS_DATA[rId]` instead. The autocomplete from `wineAutocomplete.json` is unchanged.

- [ ] **Step 1: Update the estate suggestions derivation**

In the `SpecificWineStep` function, replace the `estateSuggestions` computation:

```javascript
// Old:
const estateSuggestions = Object.entries(selectedEstates || {})
  .flatMap(([rId, eIds]) =>
    (ESTATES[rId] || []).filter(e => eIds.includes(e.id)).map(e => e.name)
  )
  .filter(name => !wines.includes(name))
  .slice(0, 8);

// New:
const estateSuggestions = Object.entries(selectedEstates || {})
  .flatMap(([rId, eIds]) =>
    (PRODUCERS_DATA[rId] || []).filter(p => eIds.includes(p.id)).map(p => p.name)
  )
  .filter(name => !wines.includes(name))
  .slice(0, 8);
```

This is a one-line change: `ESTATES[rId]` → `PRODUCERS_DATA[rId]`, and variable names `e` → `p` for clarity (optional).

- [ ] **Step 2: Verify**

Run `npm run dev`. Complete Steps 1–3, selecting some producers. Navigate to Step 5. Verify:
- Selected producer names appear as tappable suggestions ("From your producers")
- Autocomplete search still works (typing wine names)
- Adding and removing wines works

- [ ] **Step 3: Commit**

```bash
git add src/components/Quiz.js
git commit -m "fix: SpecificWineStep uses PRODUCERS_DATA instead of deleted ESTATES"
```

---

### Task 7: Full build verification and cleanup

**Files:**
- Modify: `src/components/Quiz.js` (remove any remaining references to old data)

- [ ] **Step 1: Search for any remaining references to old wineData exports**

Search `src/components/Quiz.js` for the old import line `from "@/lib/wineData"`. It should NOT appear. Also search for bare `ESTATES[` (without `PRODUCERS_DATA` prefix) — should not appear.

Verify the only data import is `from "@/lib/wineUnified.json"`.

If any old references remain, fix them.

- [ ] **Step 2: Run a full build**

Run: `npm run build 2>&1 | tail -30`

Expected: Build passes with no errors. The Quiz component should compile cleanly.

Note: Other files (profileEngine.js, matchEngine.js) still import from wineData.js — that's expected and will be fixed in later tasks (not part of this plan). The build should still pass because wineData.js hasn't been deleted yet.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev` and do a full quiz walkthrough:
1. Step 1: Select 2-3 countries → see Old World / New World groups
2. Step 2: See regions sorted by popularity, "Show more" works
3. Step 3: See producers sorted by rank, "Show more" pagination works
4. Step 4: See varietals dynamically reranked, grouped by color
5. Step 5: Autocomplete works, producer suggestions work
6. Finish: Profile generates, recommendations display

- [ ] **Step 4: Commit**

```bash
git add src/components/Quiz.js
git commit -m "chore: quiz component fully migrated to wineUnified.json data source"
```

---

## Notes

### Synonym display names (spec 2G)
The build script already outputs synonym display names in `wineUnified.json` (e.g., `"Syrah / Shiraz"`, `"Grenache / Garnacha"`, `"Pinot Grigio / Pinot Gris"`). The VarietalStep uses `v.name` directly, so spec 2G is satisfied with no extra work.

### What this plan does NOT cover
- **profileEngine.js rewrite** — separate plan, depends on quiz working first
- **matchEngine.js rewrite** — separate plan
- **Deleting wineData.js** — only after ALL importers are migrated
- **Database migration** (truncating wine_profiles etc.) — separate task
- **wineAutocomplete.json** — unchanged, still lazy-loaded on Step 5

### Data shape reference

**`wineUnified.json` top-level keys:**
- `countries` — array of `{ id, name, emoji, world, reviewCount, avgRating, regionCount, topVarietals }`
- `regions` — object keyed by countryId: `{ [countryId]: [{ id, name, province, reviewCount, avgRating, producerCount, topVarietals }] }`
- `producers` — object keyed by regionId: `{ [regionId]: [{ id, name, reviewCount, avgRating, topVarietals, rank }] }`
- `varietals` — array of `{ id, name, color, reviewCount, avgRating, topRegions }`
- `regionLookup`, `producerLookup`, `varietalLookup`, `metadata` — used by other engines, not by Quiz

### Current counts
- 19 countries, 145 regions, 5,230 producers, 71 varietals
