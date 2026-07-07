
# The Somm Picks — Design Spec

**Date:** 2026-07-07
**Scope:** New `/api/somm-picks` endpoint (LLM curation + sommelier notes), centralized model constant, journal feedback wired into scoring, optional occasion input, results UI integration.
**Files affected:** `src/app/api/somm-picks/route.js` (new), `src/lib/anthropicConfig.js` (new), `src/lib/sommPicks.js` (new, client payload builder + response validator), `src/app/recommend/page.js`, `src/app/api/parse-wine-list/route.js`, `src/app/api/scan-label/route.js`, `src/lib/__tests__/sommPicks.test.js` (new), `e2e/wine-lists.spec.ts`
**Naming Convention:** The Palate = DNA profile system. The Somm = matching/recommendation system. This workstream gives The Somm its voice.

---

## Part 1: `/api/somm-picks` — LLM curation + storytelling

### Problem
`curatePicks` selects well but can't explain. Picks render with score-derived badges and no narrative. The product vision is a knowledgeable friend: "here's why THIS bottle, for YOUR palate, tonight." Also, algorithmic pickType assignment (top/value/adventure/splurge/wildcard) is mechanical — an LLM reading the full candidate slate can make smarter role assignments and catch pairing traps.

### Request payload (built client-side by `src/lib/sommPicks.js` → `buildSommPayload()`)
The recommend page already holds everything needed after `runAnalysis`:

```js
{
  candidates: [ // top-scored candidates, compact — NOT full scored entries
    // slice: scoredEntries.filter(score>0, price!=null, passes color+budget filter)
    //        .sort(score desc).slice(0, 25)
    { i, name, price, vintage, section,
      varietal, region, country,          // display names via existing helpers
      score, reasons: [top 3 matchReasons labels] }
  ],
  algorithmicPicks: [i, ...],             // indices curatePicks chose (the fallback set)
  pickCount,                              // from getPickCount — LLM must return exactly this many
  dna: { archetype, narrative,            // from profile row
         countries, varietals,            // display names, capped at 8 each
         topEstates, specificWines },     // capped at 8 / 5
  feedback: { loved: [{name, varietal, region}], notForMe: [{name, varietal, region}] }, // capped 10/10, from wine_interactions where rating set
  menu: { totalWines, distinctCountries, distinctRegions },
  budget: { min, max }, color, occasion   // occasion: optional free text, ≤200 chars
}
```

### Prompt design
System prompt fixed in the route. Core rules:
- Persona: Sommeasy brand voice — confident but not pretentious, warm, conversational, zero gatekeeping jargon. "Knowledgeable friend," never "stuffy sommelier."
- Task: choose exactly `pickCount` wines FROM THE NUMBERED CANDIDATES ONLY, assign each a role from {top, value, adventure, splurge, wildcard} (each of top/value/adventure at most once; roles beyond the four core = wildcard), and write a 2–3 sentence note per pick.
- Notes must reference the user's actual palate (archetype, loved wines, DNA regions/varietals) and, when `occasion` is present, lead with the pairing rationale. Call out pairing traps honestly (the low-acid-oak-bomb-with-tomatoes rule).
- Budget is a hard constraint: never pick above `budget.max` except the splurge role, capped at 2× max (mirrors the algorithmic splurge cap).
- One short `sommSummary` (≤2 sentences) framing the list as a whole.
- Output: JSON only, no prose outside it: `{ "picks": [{ "i": <candidate index>, "role": "...", "note": "...", }], "sommSummary": "..." }`

Use `max_tokens: 2000`, temperature default. Expected usage ≈ 2–4k input / ≤1k output tokens ≈ $0.02–0.03 per curation — same order as a scan.

### Response contract + server-side validation
The route validates before returning: JSON parses; every `i` exists in `candidates`; no duplicate `i`; pick count == `pickCount`; every non-splurge price ≤ `budget.max`; note non-empty ≤ 500 chars. On ANY validation failure → return `{ fallback: true }` with 200 (client keeps algorithmic picks). Never let a malformed LLM response reach the UI.

### Error handling & fallback (fixed behavior)
- Reuse `checkRateLimit("somm-picks", ip)` — same 10/hour/IP window.
- Reuse the cost-log helper (generalize `logVisionUsage` → `logClaudeUsage(route, usage, ms)` emitting the same `type:"vision_usage"` line with route `"somm-picks"`, or rename type to `"claude_usage"` across all three routes — your call, keep it one consistent format).
- `maxDuration = 300`, SDK timeout 60s (this is a text-only call; it should complete in ~5–15s).
- ANY error (timeout, 429 upstream, 5xx, validation failure) → client silently keeps algorithmic picks. The Somm's voice is progressive enhancement; the app must never be worse than Phase 1 because of it.

## Part 2: Centralized model constant

### Problem
July 7 postmortem: `claude-sonnet-4-20250514` was retired June 15 and prod scanning died silently for three weeks, partly because the model ID was duplicated across routes.

### Fix
`src/lib/anthropicConfig.js`: `export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";` — consumed by all three API routes. One env var flips the model everywhere; no redeploy-per-route.

## Part 3: Wire journal feedback into scoring

### Problem
`buildFeedbackSignals` exists in matchEngine (loved/liked boosts, not_for_me suppressions) but the recommend page calls `matchWinesAgainstDNA(entries, dna)` with no third argument — the DNA feedback loop is built but unplugged on the surface that matters most.

### Fix
In the recommend page, alongside the profile load, fetch the user's rated interactions (`wine_interactions` where `rating is not null`), and pass them through: `matchWinesAgainstDNA(entries, dna, buildFeedbackSignals(interactions))`. Same rows feed `feedback` in the somm payload (Part 1). Cache in a ref; one fetch per page load.

## Part 4: Occasion input (optional)

### Problem
Pairing-first storytelling needs to know what the user is eating. No such input exists.

### Fix
One optional text input on the recommend input view (both cards), placeholder: `What's the occasion? Steak night, first date, Tuesday… (optional)`. ≤200 chars, stored in component state, passed only into the somm payload. Skippable, no layout upheaval, mobile-first sizing. No persistence.

## Part 5: Results UI integration

- On `runAnalysis` completion: render algorithmic picks immediately (exactly as today), then fire the somm-picks call. While pending, show a subtle "The Somm is thinking…" shimmer where notes will appear. On success, reorder/replace picks per LLM selection and render each note under its wine, plus `sommSummary` above the list. On fallback, today's UI, no error surfaced.
- `handleRefilter` (color/budget change): keep current behavior — instant algorithmic re-curation from stored `scoredEntries`. Picks that survive the refilter keep their notes; new picks show no note. Add one button — "Ask the Somm again" — that re-fires somm-picks against the refiltered pool (rate limit makes this self-policing).
- Note styling: serif, cream card, burgundy accent per brand; `getPickTypeInfo` badges still used, driven by the LLM's `role`.

## Cost & rate limiting
Worst-case engaged session: 1 scan ($0.01–0.03) + 1–3 curations ($0.02–0.03 each) ≈ **≤$0.12/session**. Both routes share the 10/hour/IP window. Cost lines land in Vercel logs alongside vision usage.

## Implementation Order
1. Commit this spec into `docs/superpowers/specs/`.
2. Part 2 (model constant) — trivial, unblocks everything, verify build.
3. Part 3 (feedback wiring) — verify: a `loved` interaction visibly boosts a matching wine's score in a quick node probe; 42/42 DNA suite still green.
4. `src/lib/sommPicks.js` (payload builder + validator) + unit test file `sommPicks.test.js` (node-style like the existing suites): payload caps respected, validator rejects out-of-range/duplicate/over-budget/over-count responses, accepts a good one. Target ≥10 cases.
5. Part 1 (route) — verify locally with a real API call: real notes back, cost line logged, 429 after limit, fallback `{fallback:true}` on a forced-invalid response (temporarily set an absurd pickCount).
6. Parts 4+5 (UI) — verify the full flow in dev: paste list → algorithmic picks appear → notes arrive and render; kill ANTHROPIC_API_KEY and confirm graceful fallback; refilter keeps surviving notes.
7. e2e: extend `wine-lists.spec.ts` with one spec asserting that after a paste-path analysis, either somm notes render OR the fallback (no-notes) state renders with picks present — and (Phase 1 lesson) at least one spec that FAILS if picks are absent entirely.
8. Push, watch deploy, run one real prod curation, capture the response + cost log line for the report.

## What This Does NOT Cover
- Anonymous-user picks (recommend still requires a profile — unchanged).
- Persisting somm notes or occasion to the journal (future: attach note to saved interaction).
- Multi-page scan accumulation changes, quiz-persistence flow (separate session), mobile polish beyond the one input (Phase 3).
- Durable rate limiting, streaming responses, model upgrades (Sonnet 5 revisit deferred — adaptive thinking unneeded for structured extraction; reconsider for storytelling quality only if notes read flat).
