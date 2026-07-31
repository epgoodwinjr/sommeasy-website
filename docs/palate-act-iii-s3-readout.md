# Act III, Session 3 Readout — "The Living Strand"

**Executed by Claude Code, July 31, 2026, against `docs/palate-act-iii-brief.md` Part 3 (entire) plus the Ed-approved Part 0 (country title adjectives).**
For Cowork's independent post-review (code + DB) before Session 4. Base: `main` @ `0492276` (S2 verified).

## Verification summary

| Check | Result |
|---|---|
| Unit suites (9) | ✅ 297/297 — dnaEvolution 74 (65 + Suite 12, the milestone hook), identityVoice 18 (14 + the Part 0 adjective block), countryAttribution 22, sommPicks 24, authFlow 56, authRoutes 21, pendingPalate 26, ssrfGuard 48, captcha 8 |
| `npm run test:e2e` | ✅ 60/60 (seeder skipped) on the full serialized run — both DB hard-fail guards (evidence-ledger + identity-shift) green together; post-run SQL shows zero residue: archetype restored, timeline exactly its 1 seeded event, zero shifted rows, zero guard interactions, dujac 2/not-promoted, chenin 6, stellenbosch 0 |
| `npm run build` | ✅ clean, 17/17 pages |
| Part 0 production regeneration | ✅ 4 titles updated by SQL (table below), 3 region-anchored rows untouched; timeline count 1 → 1 (zero events written); `narrative_updated_at` untouched; identity jsonb untouched (adjectives are titles-only) |
| Migrations 007 + 008 | ✅ applied via MCP and verified by `pg_constraint` / policy queries (see below) |
| Identity-shift guard restore | ✅ verified by SQL after the green standalone run: archetype "The South African Curator", identity milestones null, estates without dujac, dujac accumulation 2/1/not-promoted, burgundy 2, france 3, timeline exactly its 1 seeded event, zero guard interactions |
| Account rules | ✅ everything interactive ran against `epgoodwin+e2e@gmail.com`; Ed's account untouched |

## Part 0 — Country titles get their adjectives

`COUNTRY_TITLE_NAMES` in identityEngine.js, applied through the existing `titleName` mechanism (the same one grape shortening uses), so the change is **titles only**: epithets ("Italy-anchored"), narrative prose ("Your palate leads with Italy"), and the traits' anchor name all keep the place noun. The clunk rule now judges the adjective (it's what ships in the title); every entry passes it, and identityVoice's new completeness check fails loudly if a future catalog country lands without an entry.

**Register calls:** "Argentine" over "Argentinian" (the trade's traditional form — Argentine Malbec); "American" for the US; **New Zealand deliberately keeps its noun** — the wine trade says "New Zealand Pinot", and "New Zealander" names a person. That is the only noun fallback in the map; the other 18 countries take a natural adjective.

### Production before → after (titles only; same regeneration discipline as S2)

| Account | Before | After |
|---|---|---|
| blairfg@gmail.com | The Italy Faithful | **The Italian Faithful** |
| edward.goodwin@fticonsulting.com | The Stellenbosch Loyalist | (unchanged — region anchor) |
| epgoodwin@gmail.com (Ed) | The Stellenbosch Loyalist | (unchanged — region anchor) |
| epgoodwin+e2e@gmail.com | The South Africa Curator | **The South African Curator** |
| epgoodwin+local@gmail.com | The France Purist | **The French Purist** |
| epgoodwin+prod@gmail.com | The France Purist | **The French Purist** |
| inbuilt.wit_05@icloud.com | The Bordeaux Regular | (unchanged — region anchor) |

Every row was recomposed locally with the real engine before the update; the only strand field that moved was the title, so only `archetype` was written. (The e2e row's stored epithet still carries the S2-documented drift — "red & white" from the refine-uncheck spec's last save — deliberately not touched here; it reconverges on the next quiz save or milestone recompose.) Done BEFORE the milestone wiring, so the regeneration could never masquerade as a celebrated shift.

## Part 1 — The Living Strand

### 1. The milestone hook — `src/lib/identityRecompose.js`

`maybeRecomposeIdentity(supabase, userId, engineResult)` runs non-blocking after `resolveAndAccumulate` / `reverseAccumulation` on **all four rating surfaces** (WineRecList — reveal + home Wines to Try, home Log-a-Bottle, journal edit/delete, /recommend rate-a-pick). identityEngine stays pure; the hook owns every read and write. `resolveAndAccumulate` now also returns `dimensions` (what the wine's confidence band accumulates toward, built before the delta check) so the hook judges the wine, not the delta — mirror updated to match.

**Milestones, per Ed's locked decisions:**
- **Promotions & demotions** — straight off the engine result.
- **Every 5th rated bottle** — the baseline is the LIVE rated-bottle count at the last recompose, stored in `identity.milestones.ratedCountAtLastRecompose`. Design calls, documented: the baseline resets on **every** recompose including quiz saves (a quiz save IS a recompose — without the reset, the first bottle after a refine would fire a guaranteed no-op milestone), and deletes lower the live count, so a delete **subtracts milestone progress** rather than being a free bottle. Legacy rows with no baseline read as 0 — a long-rated account self-arms on its first post-deploy rating (a silent refresh unless the strand actually moved).
- **First-time firsts** — first earned promotion ever, first loved bottle fully outside the DNA, first demotion. Durable once-per-account flags in `identity.milestones.firsts`, armed only by **live engine results** — a stored promoted row (migration, seed, history) never fires one (Suite 12C pins this). Migrations/regenerations run no hook by construction. `saveQuizProfile` preserves the flags verbatim while resetting the interval baseline.
- **"Outside the DNA", precisely:** the engine resolved ≥1 dimension its band accumulates toward, and NONE of those dimension values appear in the profile arrays (countries / flattened regions / flattened estates / varietals) **as read after the engine run** — so a bottle whose own rating just promoted its dimension counts as inside (it gets celebrated as a promotion instead).

### 2. Recompose semantics

Evidence = the profile arrays (already quiz ∪ earned — promotions edit them) + all accumulation rows, so evidence points pick the anchor region and signature grape (S2 built the parameter; S3 is the first caller to pass it). Live red/white recount — the same varietal-color formula quiz saves use — is written to `red_count`/`white_count`, closing the audit's frozen-rail finding: earned varietal promotions/demotions now move the Red↔White rail.

**Changed strand** (title OR epithet) → compare-and-swap on `archetype` + `identity->>epithet`: the winner writes the strand + a `dna_timeline` `'shifted'` event; the loser writes nothing. Residual window, stated: a crash between the CAS and the event insert loses that celebration (never doubles it); two tabs composing *genuinely different* shifts in sequence each earn their own event, which is correct. **Unchanged strand** → silent refresh of traits/genome/recount/milestones — no event, no noise.

**The shifted row shape** (fits the existing columns): `event_type='shifted'`, `dimension='identity'`, `dimension_value` = JSON `{from:{title,epithet}, to:{title,epithet}}`, `display_name` = the new title (what every surface renders — never a raw id; surfaces parse the JSON defensively and fall back to the title line).

**The narrative is deliberately untouched** by the hook: the shifted event lands after `narrative_updated_at`, re-arming the existing staleness gate, and The Somm rewrites the prose on the next /palate visit.

### 3. Two migrations the prompt didn't anticipate (verify-don't-assume, applied twice)

- **007 — the dimension CHECK.** "Migration 006 already allows it" was true for `event_type` only: the original 003 schema ALSO checks `dna_timeline.dimension IN (varietal|estate|region|country)`, verified live via `pg_constraint`, which would have rejected every shifted row. 007 widens it to include `'identity'`.
- **008 — owner-scoped timeline DELETE (⚠️ the session's one judgment call against a stated invariant — Cowork should weigh).** Ed's mandate says the e2e guard must "restore the exact baseline including … the shifted event", but the e2e suite deliberately runs as the test user under RLS (no service key), and dna_timeline had no DELETE policy — the restore was *impossible*, and every run would have leaked immutable celebration rows onto the fixture account forever. 008 adds `FOR DELETE USING (auth.uid() = user_id)`. The insert-only invariant survives as the **app's contract**: no product code path deletes or rewrites history, and UPDATE remains impossible (no policy). If Ed prefers the invariant at the RLS layer too, the revert is one dropped policy — and the guard then needs a leaked-events fixture model instead of exact restore.

### 4. Celebrated surfaces (copy mine, within voice)

- **Toast** (all four rating surfaces, staggered after any promotion/demotion toasts): "🧬 Your DNA has shifted: you're now The Mosel Purist"; an epithet-only shift shows the new signature line instead ("🧬 Your DNA has shifted: Mosel-centered · white-leaning · estate-loyal"). One copy — `shiftToastMessage` in identityRecompose.js.
- **Home-strip whisper** now surfaces the latest of `promoted` OR `shifted` (30-day window kept): "You became The Mosel Purist".
- **/palate Recently evolved**: shifted rows get a distinct ✨ entry, bolded — "You became The Mosel Purist" (or "Your signature shifted — …" when only the epithet moved).
- **Journal DNA Timeline**: same two variants, ✨-prefixed, bolded.

### 5. Narrative integration (verified, not assumed — and one real bug found)

The staleness gate queries dna_timeline with no event_type filter, so shifted events re-arm it — confirmed by reading the query. But the payload mapper labeled every non-`promoted` event "rotated out", so a shifted event would have been described to the LLM **as a demotion**. Fixed: shifted events map to "their identity shifted — they became {title}". The payload now carries `epithet` alongside `archetype` (route selects `identity`), and the system prompt tells The Somm to write from the full strand.

### 6. Tests kept truthful

- **Suite 12 (9 tests) exercises the REAL `maybeRecomposeIdentity`** — not a mirror — imported through the alias loader from the CJS suite, driven by the mirror engine against the mock DB exactly as the surfaces drive production. The mock grew what the hook needs: JSON-path filters (`identity->>epithet`), `is`/`not`/`in`, head-count selects, and `update().select()` for the CAS. Coverage: every-5th at exactly 5 with baseline reset (12A), shifted-only-on-actual-change with the full before→after event shape (12B — exact title "The South African Loyalist"), firsts arm once and never from stored promoted rows (12C), outside-DNA definition incl. the inside-bottle counterexample (12D), first demotion on the reversal path (12E), deletes lower the live count (12F), quiz-save silence via **source scan** — saveQuizProfile must never mention dna_timeline, must carry milestones/firsts — plus the flow (12G), the two-tab CAS race writes no second event (12H), live red/white recount (12I).
- **identityVoice 14 → 18**: the Part 0 block — adjective in the title only, noun preserved in epithet/narrative, register picks pinned (Argentine/American/the deliberate NZ noun), and the completeness check over every wineUnified country.
- **e2e: `identity-shift.spec.ts`, the twelfth permanent hard-fail guard.** Seeds Domaine Dujac at 2 accumulation points (one loved bottle from the estate threshold), rates "Domaine Dujac Clos de la Roche 2019" loved through the real /recommend paste UI → estate promotes → milestone → recompose: asserts the promotion toast, the shift toast, the shifted row (dimension `identity`, before→after JSON matching the stored strand), the title change to `/Loyalist$/` + "estate-loyal" epithet, milestone bookkeeping (baseline = rated+1, first-promotion armed), **and engine consistency: the stored strand must equal what `composeIdentity` composes from the live evidence** (the spec imports the real engine — Playwright's transform handles it). Guard dims (dujac/burgundy/france) deliberately never overlap evidence-ledger's (kanonkop/stellenbosch/south_africa), so the two guards can't corrupt each other. Heal-at-start + exact restore including the identity jsonb and both new timeline rows; teardown navigates to about:blank first (the S1 teardown-race rule).
- **Suite hardening:** `workers: 1` in playwright.config — every spec shares the one test account and the Act III guards assert exact DB state; parallel spec files were racing distance-away from each other's baselines. evidence-ledger's restore now also puts back archetype/identity/red_count/white_count, since the hook may silently refresh them mid-run.

## Milestone economics (how many bottles to a first shift)

- **Fastest path — 2 loved bottles** of one estate (threshold 4): the promotion is a milestone, and a second estate flips the persona to Loyalist, so the title moves. 3 loved bottles of one grape (threshold 6) similarly.
- **First loved bottle fully outside the quiz DNA can fire on bottle one** — celebrated only if the strand actually moves, which it often will: passing accumulation to the engine activates the S2 `regionEvidenceLeads` rule, and a region tied at the top of the points table flips a country anchor to the region ("The South African Curator" → "The Stellenbosch Curator"-class shifts).
- **The floor is 5 rated bottles** (the interval), which recomposes even when nothing else fired.
- Realistically, a new user who rates what they drink sees their first shift inside 2–5 bottles — early evolution is eventful, as the brief intended.
- **Note for S4/S5 (pre-existing S2 behavior, surfaced by S3):** `regionEvidenceLeads` treats a tie at the top as leading, so the first milestone on a country-anchored palate with any region points tends to flip the anchor region-ward. Deterministic and defensible ("the evidence picked the anchor"), but worth a look when the visual lands — the e2e account's first real milestone will retitle it "The Stellenbosch …".

## Decisions Cowork should weigh

1. **Migration 008** (owner-scoped timeline DELETE) — §3 above. The one deliberate deviation; revert path documented.
2. **Quiz saves reset the interval baseline** — a refine defers the next every-5th milestone by design (the quiz save already recomposed with that evidence). The alternative (not resetting) buys a guaranteed-silent recompose right after every refine.
3. **Deletes subtract milestone progress** (live-count semantics). The alternative (high-water-mark clamping) was rejected as more state for no user-visible gain.
4. **Epithet-only shifts celebrate with the signature line** rather than a title sentence — "you're now" would read false when the name didn't change.
5. **`workers: 1`** trades suite wall-clock for determinism on a single shared account. If runtime hurts, the escape is a second test account per worker, not parallelism over one account.

## Cost note

Recompose is pure computation — no new LLM surface. The identity-shift guard adds one somm background call per e2e run (~$0.02); shifted events re-arm the narrative regeneration (~$0.006) under its existing gate and rate limiter.
