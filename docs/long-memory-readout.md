# The Long Memory — Session Readout (Aug 1, 2026)

**Executed by Claude Code against the standalone mandate: Sommeasy stored state (what a palate is) but not history (how it got there). After this session every meaningful moment is an immutable timestamped event, the launch funnel is measurable, and the data model is ready for the longitudinal features Act III deferred — without building any of them.**
For Cowork's independent verification before this goes into the launch runway. Base: `main` @ `ac3cf45` (Act III complete).

## Verification summary

| Check | Result |
|---|---|
| Unit suites (11) | ✅ 336/336 — the 10 existing suites untouched-and-green (dnaEvolution 75, countryAttribution 22, sommPicks 24, authFlow 56, authRoutes 21, pendingPalate 26, identityVoice 21, palateMark 15, ssrfGuard 48, captcha 8) + the NEW wineEvents 20 |
| `npm run test:e2e` | ✅ 61/61 on the full serialized tree (5 env-gated skips), first run — the extended evidence-ledger + quiz-completion guards AND the new fire-and-forget guard all green. Post-run SQL: seeded baseline exactly restored (dna_timeline back to its 1 seeded event, zero shifted rows, zero stale guard rows, chenin 6/3, dujac 2/1 unpromoted) while wine_events kept its append-forever history |
| First real ledger data | ✅ the battery organically wrote 15 events across 6 types — and BOTH `mode=restore` quiz_completed rows landed back-logged 2–3s (`occurred_at` = the anonymous quiz's stash moment, `created_at` = fold-in): the two-column design proved itself in a real flow on day one. The blackhole guard's run contributed exactly zero rows, confirming suppression end-to-end |
| `npm run build` | ✅ clean, 17/17 pages (verified before and after wiring) |
| Migrations | ✅ 009 (`wine_events`) + 010 (`user_roster`) applied to `zugunlctgpytgyxftllv` via MCP; post-apply SQL verified: exactly two policies on wine_events (INSERT `a`, SELECT `r` — no UPDATE, no DELETE), `user_roster` returns 9 rows as service role and `has_table_privilege` is FALSE for both anon and authenticated |
| Fire-and-forget | ✅ unit-pinned (rejecting insert → resolves false, un-awaited call leaks no unhandledRejection) AND e2e-pinned (wine-events.spec.ts blackholes the endpoint through a full flow) |
| Account rules | ✅ everything interactive ran on `epgoodwin+e2e@gmail.com`; Ed's accounts untouched; wine_events rows written to the test account are append-forever BY DESIGN (see discipline below) |

## Part 1 — The event ledger as shipped

`wine_events` (migration 009): `id uuid · user_id → auth.users · event_type
(CHECK-constrained to the catalog) · payload jsonb · occurred_at timestamptz
default now() · created_at timestamptz default now()`. Index on
`(user_id, occurred_at)`. RLS: users INSERT and SELECT their own rows;
**no UPDATE and no DELETE policies exist — for anyone, including tests.**

`occurred_at` ≠ `created_at` on purpose: exactly one path back-logs today —
the anonymous quiz stash folding in after signup writes `quiz_completed`
with `occurred_at` = the stash's `createdAt` (the moment the quiz actually
happened), `created_at` = now.

**The one write path** is `src/lib/wineEvents.js` → `recordEvent`. Its
contract: never throws, never rejects, resolves `false` on any failure —
surfaces fire it WITHOUT await; the two server routes that write events
await it (a serverless function can freeze un-awaited work) with the same
swallow guarantee. Confidence bands come from the REAL
`dnaThresholds.js` gates (`none` <60 · `partial` 60–79 · `full` 80+), never
a local copy.

### The catalog (v1) and where each event fires

| Event | Fired from | Payload |
|---|---|---|
| `quiz_completed` | `saveQuizProfile` (the ONE quiz-save path) — after the upsert succeeds | mode `fresh`/`refine`/`restore`, counts (countries/regions/estates/varietals/wines) from the MERGED palate, composed title. `restore` = the pending-palate fold-in, back-logged via occurred_at |
| `menu_analyzed` | /recommend — exactly once per analysis: from `askTheSomm` when The Somm runs (outcome + duration ride along), from `runAnalysis` directly when it never will (`somm: null`) | source `scan`/`pdf`/`url`/`paste`, wines_parsed, match_count, somm `{outcome, duration_ms}` — outcome `first_attempt`/`salvaged`/`retried`/`fallback` plus `superseded` (a refilter abandoned the in-flight request; the analysis still happened) |
| `pick_rated` | /recommend `handleRatePick`, after the engine resolves | wine, rating, previous_rating (old→new — the history the upsert discards), surface `recommend`, confidence_band |
| `rec_rated` | `WineRecList.saveInteraction` (the shared surface) | same shape; surface `home` or `reveal` (new prop, threaded from both render sites) |
| `bottle_logged` | home `handleBottleSave` | same shape; surface `log_bottle` |
| `journal_rerated` | journal `handleUpdateRating` | same shape; surface `journal`; previous_rating may be null — a Want-to-Try bottle rated for the first time from the journal |
| `wine_wanted` / `wine_skipped` | `WineRecList` want/skip actions | wine, surface — the intent signals that previously left only a state row |
| `journal_deleted` | journal `handleDelete` — only when THIS call actually removed the row (the same delete-first idempotency the reversal rides) | wine, rating, interaction_type, confidence_band, points_reversed (band ≠ none ∧ rating ∉ {null, fine} — mirrors the engine's own reversal rules) |
| `somm_curation` | /recommend client, from the route's new `meta` block | outcome, attempts, salvaged_count, duration_ms, input_tokens, output_tokens, est_cost_usd — totals ACROSS attempts (a retry is two real calls and the record says so) |
| `narrative_regenerated` | `/api/palate-narrative` server-side (it has the session), on successful save | attempts, duration_ms, tokens, est_cost_usd, narrative_chars |

**Not duplicated:** promotions/demotions/shifts stay in `dna_timeline` —
the two tables together are the full history (documented in CLAUDE.md).

### Rating-surface restructure (a correctness fix that came with the wiring)

On all four rating surfaces the engine call was split from the
toast/recompose block so the event fires **exactly once per rating** —
previously a recompose error inside the shared try would have either
skipped or double-fired the event depending on where it was placed. Engine
hiccup → the rating event still lands, band `none`.

### Who writes, and why two shapes

- `/api/somm-picks` stays deliberately session-less. It now returns `meta`
  ({outcome, attempts, salvagedCount, durationMs, usage}) on success AND on
  any fallback where Claude was actually called — the authenticated client
  writes `somm_curation` + `menu_analyzed` under its own RLS. Tokens spent
  on a fallback or a superseded request still get their cost record.
- `/api/palate-narrative` already holds a cookie session and writes
  `narrative_regenerated` itself. A total validation failure (fallback, no
  regeneration) stays log-only — the event name says regenerated, and §4/§10
  of the watchtower own that failure mode. One shared price table:
  `estimateClaudeCostUSD` in rateLimit.js, extracted from `logClaudeUsage`
  so the log line and the ledger can never disagree.

## Part 2 — The funnel layer

- `@vercel/analytics` 2.0.1 installed (the ONE authorized exception to the
  no-new-deps rule, noted in CLAUDE.md); `<Analytics />` renders in the root
  layout — cookieless pageviews for the anonymous half (landing → quiz
  start → teaser). **Ed's one dashboard flip: enable Web Analytics on the
  Vercel project with this deploy** (the component no-ops silently until
  then, and always no-ops in dev/e2e).
- The identified half comes free from Part 1. NO anonymous identity
  stitching, by mandate — the stash back-log covers the one moment that
  matters in between.
- The three launch-week funnel queries live in `docs/auth-watchtower.md`
  (§11a quiz completions vs signups + anonymous fold-ins, §11b signups vs
  first rating, §11c first rating vs first shift), each with its escalation
  signature. §6 (cost) and §9 (somm retry) gained durable SQL versions —
  the weekly ritual no longer depends on the 1-hour log window.

## Part 3 — CRM-ready, not CRM

`user_roster` (migration 010): one row per auth user — email, signup date,
title + epithet, bottles rated, shift count, event count, last event at,
narrative age. **A SQL view, not a documented query** — the call: the RLS
complexity it adds is one REVOKE, and a view keeps the founder ritual to
`SELECT * FROM user_roster` instead of a paste-from-docs. It's
definer-rights (reads through RLS and across auth.users) so the REVOKE from
`anon`/`authenticated` is load-bearing — verified post-apply with
`has_table_privilege` = false for both. Actual CRM/email tooling is now a
NAMED post-launch decision in CLAUDE.md Priorities, with the note that the
event schema is deliberately keyed for any future tool to consume.

## Part 4 — Tests and discipline

- **Unit (new):** `wineEvents.test.js`, 20 tests against the real module —
  catalog mirror of the CHECK constraint, band gates from the real
  thresholds, payload shaping, the back-log rule (junk degrades to
  omission, never a bad row), and the fire-and-forget contract including
  the un-awaited-call-leaks-no-unhandledRejection case.
- **e2e guard extensions (delta assertions only, never absolute counts):**
  - evidence-ledger: the rating must write `pick_rated` (wine, loved,
    previous_rating null, surface recommend, band full); the delete must
    write `journal_deleted` (wine, points_reversed true). Its exact-restore
    `finally` deliberately does NOT touch wine_events.
  - quiz-completion: the refine save must write exactly ONE
    `quiz_completed` (mode refine, non-empty title) — right next to the
    existing zero-dna_timeline-rows assert: silent on the identity
    timeline, loud in the usage ledger.
  - **NEW hard-fail guard #13** — `wine-events.spec.ts`: every
    `**/rest/v1/wine_events**` request blackholed at the network layer,
    then the full quiz → reveal → rate → journal-delete flow must behave
    IDENTICALLY (same beats, same toasts, same data) and the ledger must
    gain zero rows. This is the "throttling the events endpoint must not
    change any user-visible behavior" verification, made permanent.
- **The append-forever exclusion, documented everywhere it's needed:**
  migration 009 header, `e2e/fixtures/test-db.ts` (above the new
  `countEvents`/`latestEvent` helpers), CLAUDE.md, and this readout. The
  test account's byte-exact-restore discipline EXCLUDES wine_events; no
  spec may assume a known starting count; do not "fix" a guard with a
  DELETE policy (migration 008's timeline policy is a different table with
  a different contract).

## Boundaries honored

No engine changes — the DNA/identity engines do not read wine_events
(grep-verifiable: no wineEvents import outside the surfaces, the two
routes, and saveQuizProfile). No CRM vendor. No anonymous stitching. No
dna_timeline changes. Suite 9 semantics and all Act III behavior untouched
(all 10 pre-existing unit suites pass unmodified except the two e2e guard
files named above). Ed's account untouched.

## Decisions Cowork should weigh

1. **`superseded` as a somm outcome** — not in the mandate's four; it's the
   honest record of a refilter abandoning the in-flight request (the
   analysis DID happen, the somm answer was thrown away). Payload-only, not
   in the CHECK constraint; the funnel queries group by it cleanly.
2. **somm meta on fallbacks** — a fallback where Claude was called still
   returns usage numbers so the tokens get a cost record; a pre-Claude
   failure (no key, bad payload) sends no meta and writes no event.
3. **The roster is a view, not a query** (reasoning in Part 3).
4. **`journal_rerated` with null previous_rating** — first-ever rating from
   the journal surface is recorded as this type (the surface, not the
   transition, names the event); the payload carries the null honestly.
5. **quiz_completed counts the MERGED palate** (what was saved), not the
   raw submission — the ledger records what the save actually did.

## Cost note (event inserts vs the free tier)

Postgres rows on Supabase free tier (500 MB database cap). A wine_events
row is ~0.3–0.6 KB including index overhead. An ENGAGED user: ~2 restaurant
visits/month (menu_analyzed + somm_curation + a few ratings ≈ 5 events
each), a few logged bottles, occasional journal edits, 1–2 narrative
regens ≈ **~20–30 rows/user/month, roughly 10–20 KB/user/month**. The
ledger reaches 1% of the free tier at roughly 250–500 user-years of
engaged usage — Hobby limits matter LONG after launch traffic justifies the
paid tier for other reasons (durable rate limiting is already queued ahead
of it in Priorities). No cron, no cleanup, no rotation needed or wanted:
append-forever is the product feature.

## What Ed flips with this deploy

1. Enable **Web Analytics** on the Vercel project (Settings → Analytics) —
   the component is already deployed and no-ops until then.

That's the only manual step; the migrations are applied, and events flow
the moment the deploy lands.
