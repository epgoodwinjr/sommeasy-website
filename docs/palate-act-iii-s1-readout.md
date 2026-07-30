# Act III, Session 1 Readout — "The Evidence Ledger"

**Executed by Claude Code, July 30, 2026, against `docs/palate-act-iii-brief.md` Part 2 (entire — nothing from Parts 1, 3, 4).**
For Cowork's independent post-review (code + DB) before Session 2. Base: `main` @ `61adf16` (S5 verified).

## Verification summary

| Check | Result |
|---|---|
| Unit suites (9) | ✅ 269/269 — dnaEvolution 64 (51 + Suite 10 partial credit + Suite 11 surface flows), countryAttribution 14, sommPicks 24, authFlow 56, authRoutes 21, pendingPalate 26, archetypeVoice 8, ssrfGuard 48, captcha 8 |
| `npm run test:e2e` | ✅ 59/59 (seeder skipped) — including the new evidence-ledger hard-fail guard; first run was 57/59 (two races diagnosed and fixed — see Incident below), final run fully green |
| `npm run build` | ✅ clean, all pages compile |
| Post-run account state | ✅ verified by SQL after the green run: zero guard residue (no text_paste rows, no pinotage/stellenbosch_vineyards rows, stellenbosch & south_africa at 0), chenin fixture at 6/promoted, timeline holding exactly its one seeded event |
| Migration 006 live | ✅ `wine_profiles.identity` is `jsonb`; `dna_timeline_event_type_check` now `('promoted','demoted','shifted')` — verified by pg_constraint query after `apply_migration` |
| Test-account fixture | ✅ reseeded via `SEED_TEST_ACCOUNT=1`; chenin_blanc row live at 6 points / 3 interactions, promoted, source=auto (verified by SQL) |
| Account rules | ✅ everything ran against `epgoodwin+e2e@gmail.com`; Ed's account untouched |

## What shipped (scope item → implementation)

### 1. The /recommend gap (the headline fix)
[`handleRatePick`](../src/app/recommend/page.js) now runs the full evidence path, exactly WineRecList's shape: read any existing rating first (any surface may have rated this wine — the differential prevents cross-surface double-counts), upsert, then `resolveAndAccumulate(supabase, user.id, wineName, rating, previousRating)` non-blocking, with promotion/demotion toasts (state + render block added; `evolutionToastMessages` imported from WineRecList — still the one implementation). This also stamps `resolved_*` metadata on these rows, so the somm payload stops seeing null varietal/region for restaurant-rated wines.

### 2. The home double-count
[`handleBottleSave`](../src/app/page.js) reads the existing rating before its upsert and passes `previousRating`. Re-logging a loved bottle is now delta 0, not +2 again. Demotion toasts wired too (a re-log downgrade can now demote, so the surface must say so).

### 3. Journal delete idempotency
[`handleDelete`](../src/app/journal/page.js) reordered: read the row (reversal needs rating/confidence after the row is gone) → `delete().select("wine_name")` → reverse **only if this call actually removed rows**. PostgREST returning the deleted rows is what makes this exactly-once under both a failed-delete retry and a two-tab race (a second delete matches nothing → reverses nothing). `reverseAccumulation` gained an optional pre-read-interaction param. Trade-off is deliberate: the failure window moved from "double-reverse on retry" (compounding corruption) to "points briefly leak if the client dies between delete and reverse" (bounded, self-corrects on re-log).

### 4. Threshold retune (`dnaThresholds.js`, still the single copy)
estate 6→**4**, varietal 10→**6**, region 14→**10**, country 20→**14**. Arithmetic check against `RATING_POINTS.loved = 2`: 2 loved bottles → estate, 3 → varietal, 5 → region, 7 → country. That matches the brief's "2–3 loved bottles to an estate, ~3 to a varietal" intent exactly, so the proposed numbers shipped unmodified. Demotion thresholds (−6 auto / −10 quiz) and rollup rules (3 estates → region, 3 regions → country) untouched per mandate.

### 5. Partial credit — ADOPTED, with integer-capped weights (not literal halves)
- **Rule:** confidence ≥ 80 → full `RATING_POINTS`, all dimensions. 60–79 → `PARTIAL_RATING_POINTS` = {loved +1, liked +1, fine 0, not_for_me −1}, applied to varietal/region/country only — **never estate**. Below 60 → nothing (`PARTIAL_CONFIDENCE_GATE = 60`).
- **Why capped integers instead of ÷2:** `dna_accumulation.points` is an INTEGER column, and literal halving makes liked/not_for_me fractional. Rounding fractional *deltas* breaks path-independence — `liked→loved` would no longer equal rating `loved` directly, and deletes would stop summing to zero. A fixed integer points-per-rating function per confidence band keeps every re-rate and delete exactly reversible. The band is stable per wine because `resolveWine` is deterministic.
- **Why estate is excluded:** the 60–79 band includes fuzzy producer matches (real example: bare "Sancerre" fuzzy-matches "Château de Sancerre" at 60). Estate promotion means producer loyalty; a guess must not accrue toward it.
- **What it unlocks:** "Barossa Shiraz"-style casual logs (varietal+region, no producer — confidence 60) now accumulate instead of nothing. Six such loved bottles promote a varietal.
- Documented in CLAUDE.md (Current State bullet).

### 6. Migration 006 (`supabase/migrations/006_identity_and_shifted_events.sql`)
`wine_profiles.identity jsonb` (empty — Session 2 populates) + the `dna_timeline` event_type CHECK widened to include `'shifted'`. Nothing else. Applied to the live project via MCP `apply_migration` and verified by querying `pg_constraint` / `information_schema` after.

### 7. Tests kept truthful
- **Mirror (`dnaEvolution.test.js`, 51→64 tests):** constants + `pointsTableFor` + partial `buildDimensionUpdates` + reworked `reverseAccumulation` mirrored; threshold-dependent suites re-derived (3A estate at 2 loved, 3B varietal at 3, 3C region at 5, 3E country at 7; 3G rebuilt to genuinely fire varietal+region on one save under the new math; 4C uses the constant instead of a hardcoded 10; 6C keeps its premise below the new threshold — 4 loved Malbecs now promote, which is the engine being right, not the test). New **Suite 10 (Partial Credit, 7 tests)**: band behavior, estate exclusion incl. the fuzzy-Sancerre case, sub-60 nothing, capped re-rate differential, delete-to-zero, promotion from partial evidence. New **Suite 11 (Surface Flows, 6 tests)**: the /recommend accumulation + metadata path, the re-log double-count regression, cross-surface re-rate, failed-delete+retry reverses exactly once, two-tab second delete is a no-op, never-resolved rows (historical /recommend) reverse nothing.
- **e2e fixture:** Chenin moves 10→6 points (3 interactions) in `test-db.ts` — still "exactly at the varietal threshold" by construction; the uncheck spec reads `EARNED_FIXTURE.points` symbolically so it followed automatically. Reseeded.
- **New hard-fail guard (`e2e/evidence-ledger.spec.ts`):** rates "Kanonkop Pinotage, Stellenbosch 2019" through the real /recommend paste UI on the test account, asserts every resolved dimension moved +2 and `resolved_*`/`match_confidence` stamped, asserts zero new timeline events (nothing may cross a threshold — the guard wine was chosen so all its dimensions are quiz-promoted or far below threshold), then deletes the row through the real journal UI and asserts points return exactly to baseline — the cleanup IS the delete-idempotency test. Guard rows are identified by `source_url='text_paste'` (only /recommend paste ratings set it), stale rows from crashed runs are healed at start, and a `finally` restores the exact baseline including rows created at 0 points.
- **Seeder repair (pre-existing fragility, surfaced this run):** step 2/3 accordions open in saved-profile order, and the seeder assumed Stellenbosch-first; it now opens the needed accordion when the chip isn't visible (`ensureAccordionChip`).
- **Somm spec deadline fix (pre-existing flake, surfaced under the extra load):** the "notes OR fallback" spec slept a fixed 20s against a call measured at 12–20s; it now polls the shimmer to zero with a 45s deadline. Still hard-fail: a stuck shimmer fails at the deadline; notes > picks still fails.

## Incident during verification (fixed, account repaired)

The guard spec's first two runs failed on a race I then diagnosed and closed twice over:

1. **Assertion race:** the spec polled only for the interaction row's `rating`, but `match_confidence`/`resolved_*` stamp a beat later inside `resolveAndAccumulate` — under full-suite load the metadata assert fired early. Fix: the poll now waits for `match_confidence` to be stamped ("ready" sentinel).
2. **Teardown race (the interesting one):** on those failures, the spec's `finally` cleaned the DB **while the page's `resolveAndAccumulate` was still in flight** — cleanup deleted the pinotage row, then the in-flight engine re-inserted it (+2 per failed run). Two leaks + the passing run's +2 crossed the new varietal threshold (6) and legitimately promoted pinotage mid-suite, timeline event and all. Fix: `finally` now navigates the page to `about:blank` before touching the DB. Repair: pinotage accumulation row, its timeline event, and its `wine_profiles.varietals` entry removed; stellenbosch/south_africa restored to 0/0 — verified by SQL against the true pre-run baseline (captured earlier in the session).

Product-level note for Cowork: the same async window exists in principle in production (a user deleting a journal row within ~1–2s of rating it could race the engine), but the human-timescale window is tiny and the failure is bounded (+one bottle's points); the delete-first ordering already prevents the compounding double-reverse case.

## Found in passing (flagged as a separate task, not touched)

The seeder's re-run rated the rec "Kumeu River, Maté's Vineyard, New Zealand" (loved), and the resolver misattributed it to the Tuscan producer "Máté": `containsTerm`'s boundary class treats an apostrophe as a boundary, so the 4-char norm `mate` matches inside "Maté's", and the producer's country (Italy) overrides the explicit New Zealand signal — the account now carries mate/tuscany/italy accumulation rows at 2 points from one NZ bottle. This is the Cassis→US / Gimonnet→Italy class the countryAttribution suite exists for, pre-existing and untouched by this session; left in place (it is the engine's real output through the real path) and flagged as a follow-up task with a proposed fix (possessive handling in `containsTerm`/`termMatchesInText` + regression cases + confidence cap on conflicting geography).

## Decisions Cowork should weigh

1. **Partial-credit weights**: liked at partial band = +1, same as loved. The literal-half alternative (liked +0.5) was rejected for path-independence on an integer column, and dropping liked to 0 would keep the "casual logs accumulate nothing" problem for the most common positive rating. If Ed wants true proportional halves, the clean path is doubling the whole point scale (loved=4 etc., thresholds ×2) plus a data migration ×2 on existing points — deliberately not done in this session.
2. **Accepted legacy drift** (documented in CLAUDE.md): rows rated *before* this session at 60–79 confidence, or through the old /recommend path, never accumulated. A future re-rate applies a differential against points that were never added (bounded at ±2 per legacy row), and — for the 60–79 class — a delete now reverses points that were never added. Production is ~6 profiles with a handful of interactions (verified by SQL: the test account's 3 rows are the bulk of it), so no backfill was built. The Act III Session 5 prod migration is the right place to reconcile history if desired.
3. **`reverseAccumulation` band guard**: reversal for never-resolved rows (match_confidence null) is explicitly skipped — this was implicit (`null < 80`) before; Suite 11F pins it.

## Cost note
The full e2e run makes real Claude calls (Vision + somm), ~$0.15–0.30 per run, per CLAUDE.md. The new guard spec adds one somm background call per run.
