# The Palate, Act II — Design Brief

*Prepared July 29, 2026 by the Cowork session that shipped the Ask the Somm reliability fix. This brief is the design authority for the profile overhaul. It defines the vision, the materials, and the non-negotiables — implementation decisions within those bounds belong to the executing session.*

## Why now

Ask the Somm is now polished, reliable, and in brand voice. The DNA profile — the other half of the product's identity — has fallen behind it. The profile is the thing Sommeasy knows about a user that no other wine app does, and today it reads like a debug view: raw internal IDs (`south_africa`, `hemel_en_aarde_walker_bay`, `pinot_noir`) rendered as user-facing chips, bare counts presented as insight, and the most differentiated system in the app (DNA evolution) invisible outside a transient toast.

## Current-state audit (grounded in code)

1. **The DNA strip** (home page, green card): archetype emoji + name, then `4 countries · 10 regions · 8 grapes · 29 favorites` — counts without meaning. Its one button, "Refine," sends the user back to the quiz. Nobody wants to retake a quiz; they want to *see themselves*.
2. **Full Profile** is exiled to a collapsed accordion below the Wines to Try list. Inside: `ProfileTagSection` maps raw ID arrays straight to chips — no display names, no flags, no grouping, no color. The red-vs-white bar uses quiz favorite counts only.
3. **The narrative** ("You have the palate of someone who's been paying attention…") is genuinely good — it's The Somm's voice. But it's frozen at quiz completion and never changes, even as the DNA engine evolves the underlying profile.
4. **The evolution engine is buried.** `dnaEvolution.js` accumulates points across four dimensions, promotes at threshold, demotes on negative signal, writes `dna_timeline` events, and distinguishes quiz-sourced from earned DNA. The UI surface for all of this: a 4-second toast and a secondary journal tab.

## Vision

**Your palate is a living thing The Somm knows intimately. Opening your profile should feel like meeting it.**

## Design pillars

### 1. One home for identity
The green strip becomes the *door*, not a dead end. Tapping it opens the full Palate view. The quiz retake demotes to a quiet link inside that view ("Start fresh"). The strip itself trades the count soup for something with meaning — archetype + a one-line palate signature + a whisper of recent evolution when there is any ("Chenin Blanc just joined your DNA").

### 2. Never show an internal ID
Display-name discipline everywhere, using helpers that already exist in `matchEngine`: `getCountryFlag` + `getCountryName` for countries, `getRegionDisplayName` for regions, `getVarietalDisplayName` + `getVarietalColor` for grapes (reuse the color-aware emoji mapping from the pick cards: 🥂 white, 🍾 sparkling, 🌸 rosé, 🍇 red), `formatWineName` for specific wines. Regions render **grouped under their countries** — `wine_profiles.regions` is already shaped `{countryId: [regionIds]}`, so this is presentation, not plumbing. This rule gets a permanent e2e guard (see Non-negotiables).

### 3. The palate is alive
Surface the evolution engine as a first-class section:
- **Recently evolved** — feed from `dna_timeline` (promoted/demoted events with display names and dates), rendered in Somm voice ("Chenin Blanc earned its place — three loved bottles").
- **Building now** — from `dna_accumulation` where `promoted = false` and `points > 0`: progress toward promotion ("Nebbiolo — 2 of 3 loves toward your DNA"). This is honest gamification: the user sees their next bottle *matters*. Check `dnaEvolution.js` for the actual promotion thresholds rather than hardcoding.
- **Founding vs earned** — `source: 'quiz'` vs `'auto'` distinguishes quiz-declared DNA from DNA earned by rating real bottles. Consider styling earned items with quiet pride (a subtle mark, not a badge wall).

### 4. Numbers become meaning
Replace count-soup with the dimensions `profileEngine` already computes: Old World ↔ New World lean, breadth ↔ depth, concentration ("France-anchored, Burgundy-centered"), red/white balance. Render as an elegant *palate signature* — paired scales or slim bars in brand colors, CSS/inline-SVG only, no chart libraries. It should read in three seconds and feel like a wine label, not a dashboard.

### 5. The Somm narrates (stretch goal)
The narrative should eventually evolve with the palate. Spec for `/api/palate-narrative`: regenerate the narrative from current DNA + journal feedback using `CLAUDE_MODEL`, following every `somm-picks` pattern (rate limiter, `logClaudeUsage`, strict fallback — on any failure, keep the existing narrative). Trigger: a promotion event, or ≥5 new rated interactions since `wine_profiles.narrative_updated_at` (column added in the Session 1 migration). Cache result in `wine_profiles.narrative`. Ship this only if Sessions 1–2 land cleanly; it is enhancement, not foundation.

## Materials inventory (what already exists — build with, don't rebuild)

- `wine_profiles`: archetype, archetype_emoji, narrative, countries/regions/estates/varietals/specific_wines (jsonb), red_count, white_count
- `wine_interactions`: ratings + resolved_varietal/region/country enrichment (+ somm_note, somm_pick_role, occasion after Session 1)
- `dna_accumulation` (dimension, dimension_value, display_name, points, interaction_count, promoted, source) and `dna_timeline` (+ `fetchDnaTimeline` in dnaEvolution.js)
- `profileEngine.js`: dimension computations (breadth, depth, oldWorldRatio, concentration, topCountry) and 15 archetypes
- `matchEngine.js` display helpers listed in Pillar 2
- The Somm's voice guidelines and route patterns in CLAUDE.md and `/api/somm-picks`

## Non-negotiables

- **No raw internal IDs anywhere, ever.** Add a hard-fail Playwright spec: no visible text node matching `/^[a-z0-9]+(_[a-z0-9]+)+$/` on the home page, palate view, or journal. This is a permanent regression guard in the spirit of the fail-if-no-picks spec.
- Brand system per CLAUDE.md: forest green / burgundy / sage / cream, high-contrast serif, warm knowledgeable-friend voice in every string. Mobile-first; ≥16px inputs, ≥40px tap targets.
- No new dependencies. No chart libraries — CSS and inline SVG.
- Quiz retake is never a primary action.
- Anything LLM-powered is progressive enhancement with silent fallback — the profile must be complete without it.
- Don't break the anonymous-teaser roadmap item: keep the palate view componentized so a partial/teaser variant can be derived later.

## Executing session's latitude

Dedicated `/palate` page vs. expanded in-place view; the visual form of the palate signature; section order; copy (within voice); micro-interactions; how much of the journal's DNA Timeline tab merges into the palate view vs. cross-links. Make the calls, ship, explain.

## Scope split

**Session 1 — "Remember the Somm" (wiring, ships fast):** somm-note persistence (migration + save path + journal display), the no-raw-IDs fix using existing helpers (instant visual relief on the current layout), salvage-observability log line, prod log health check, `build_wine_reference.py` disposition. No layout redesign.

**Session 2 — "The Palate, Act II" (design, this brief's main act):** Pillars 1, 3, 4 on the foundation Session 1 cleaned up. Stretch: Pillar 5 if time and quality allow. Deliver screenshots (mobile ~390px and desktop widths) with the session summary for Ed's design review.
