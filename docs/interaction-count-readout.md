# The Bottle Count — `interaction_count` drift: the fix and a backfill dry run

**Executed by Claude Code, October 30, 2026, on `claude/competent-mayer-c2ff22` (base `main` @ `7a8dc27`, synced after #22/#23/#24). The engine fix and tests are committed on the branch. No production writes: every data read was SELECT-only and touched only the two e2e accounts. The backfill below is a dry run that waits on Ed's go-ahead.**

## Verification summary

| Check | Result |
|---|---|
| Unit suites (16) | ✅ 494/494 on the merged tree. dnaEvolution **97** (78 + Suite 13's 19) |
| Mutation pins | ✅ 5/5 wrong count rules applied to the real engine each fail at least one real-engine test (§3), re-run on the merged tree |
| `npm run build` | ✅ clean, 17/17 static pages, before and after the `main` sync |
| `npm run test:e2e` | ⏭ not run. Another worktree's Playwright run held the shared test accounts during this session, and no e2e spec asserts `interaction_count` (evidence-ledger and identity-shift only write it back in their restores). No guard's flow changes |
| Production data | SELECT-only, `epgoodwin+e2e` and `epgoodwin+e2e-fresh` only. Ed's account and every other account were not read |

## 1. The drift, confirmed

### In the code

`upsertAccumulation` derived the count from the sign of the point delta: `interaction_count + (pointDelta > 0 ? 1 : 0)`. `reverseAccumulation` (the journal delete) passes `−points`. Here is every transition under the old rule against the true bottle count, for the full band. The partial band is the same except that liked ↔ loved moves nothing in either.

| Transition | Point Δ | Old count Δ | True count Δ | Drift |
|---|---|---|---|---|
| first rating: loved / liked | +2 / +1 | +1 | +1 | — |
| first rating: not for me | −1 | 0 | 0 | — |
| liked → loved | +1 | **+1** | 0 | +1 (counted twice) |
| loved → liked | −1 | 0 | 0 | — |
| loved / liked → fine or not for me | −1 … −3 | **0** | −1 | +1 (never left) |
| fine / not for me → liked / loved | +1 … +3 | +1 | +1 | — |
| not for me → fine | +1 | **+1** | 0 | +1 (phantom) |
| delete a loved / liked bottle | −2 / −1 | **0** | −1 | +1 (never left) |
| delete a not-for-me bottle | +1 | **+1** | 0 | +1 (phantom) |
| delete a fine bottle; re-log at the same rating | 0 | 0 (early return) | 0 | — |

Every drift is an **overcount of exactly one bottle on every dimension the wine writes**. The count never ran low. The third path, where reversing a not-for-me bottle *adds* one, wasn't in the original report. The failing tests surfaced it (13C, 13D).

### In the data (the rich e2e account, SELECT-only)

- **The ledger looks clean, but only because a guard keeps cleaning it.** Of 11 rows, 7 are right, **0** carry count-only drift, and 4 are fixture rows (§4).
- **The guard path ran 17 times.** `wine_events` holds 17 `journal_deleted` rows with `points_reversed = true` (Aug 1 → Oct 30), all for "Kanonkop Pinotage, Stellenbosch 2019", the evidence-ledger guard's wine. Each run rated it loved, which added a bottle to pinotage, stellenbosch, south_africa and stellenbosch_vineyards. It then deleted the bottle through the journal: the points came back, the count stayed one high. Finally, the guard's `finally` wrote `interaction_count` back to its baseline by hand. That is 68 phantom bottle-counts written and erased. A real account has no `finally`.
- **The upward re-rate path has never run in e2e.** Every `journal_rerated` event on either account is fine → fine.

### Where users see it

- **`main`, since Act II (July 29):** /palate's Recently evolved line, "Burgundy earned its place — five bottles made the case", reads `interaction_count` directly (`PalateView.js`).
- **`house-list`, Phase 5 (unmerged):** "{n} bottles" on /palate's Your DNA rows and on /search's In your DNA results (spec §8.6–8.7).

## 2. The fix

**The definition.** `interaction_count` is the number of distinct rated bottles currently **pushing** the dimension, meaning rated into positive points in their confidence band. Loved and liked push. Fine and not-for-me are rated evidence, but they make no case. That matches the product's own copy ("…pushes a grape, a place, or an estate toward your DNA", `PalateView.js`), and "N bottles made the case" only reads true for bottles that argued *for* the dimension. The existing tests already assumed it: 2A and 7B expect three positive bottles to count 3, and Suite 12 seeds a −5-point Syrah at count 0.

**The mechanism** (`src/lib/dnaEvolution.js`):

- `pushCount(points)` is 1 when `points > 0`, else 0.
- `resolveAndAccumulate` computes `countDelta = pushCount(newPoints) − pushCount(oldPoints)` beside the point delta, from the same band table. Equal points push alike, so the existing zero-point-delta early return still implies a zero count delta.
- `reverseAccumulation` passes `−pushCount(points)`, so a deleted bottle comes off every count it was on.
- `upsertAccumulation(…, pointDelta, countDelta)` writes `Math.max(0, count + countDelta)`. A reversal can land on a row that never counted its bottle (pre-fix history, or a resolver change since the rating). The floor keeps that from going negative, and it can only move a count toward the truth, because a true count is never negative.

**What's unchanged:**

- the `previousRating` differential (the count rides the same old/new pair as the points);
- the delete-first reversal;
- integer columns (the count delta is −1, 0 or +1);
- every call site on all four rating surfaces;
- points behavior, which is byte-identical.

**One pure export.** `bottleEvidence(wineName, rating)` returns `{ resolution, points, pushes, dimensions }`: what one rated bottle is worth to the ledger under today's engine. The recount (§4) sums it, so the recount and the engine can't disagree about a bottle.

## 3. Tests

**Suite 13, The Bottle Count (19 tests).** Every case runs twice: once against the inline mirror, once against the REAL `dnaEvolution.js`. To make the real module loadable, the test alias loader now resolves extensionless relative imports, the same rule `scripts/esm-compat-loader.mjs` already applies for scripts.

| Case | What it pins |
|---|---|
| 13A | Re-rate up within positive (liked → loved): points +1, still one bottle |
| 13B | loved → fine takes the bottle back, fine → loved returns it, loved → not for me takes it back |
| 13C | not for me → fine moves the points, not the count; fine → liked pushes |
| 13D | A delete takes the bottle off every dimension; deleting a not-for-me bottle leaves the count alone |
| 13E | Re-logging the same bottle adds nothing; after a delete it counts once again |
| 13F | Distinct bottles of one estate count separately through re-rates and deletes |
| 13G | The partial band: varietal/region/country only, same differential, liked ↔ loved a no-op |
| 13H | The zero floor |
| 13I | A seeded 240-step walk of rates, re-rates and deletes over seven wines that share dimensions (full band, partial band, below the gate). After **every** step, every row's points and count equal a from-scratch recount |
| 13J | The real `bottleEvidence` equals the definition for every wine × rating |

Before the fix, 17 of the 19 failed, with mirror and real failing identically. 13H passed trivially, since the old engine never decrements. After the fix, all 19 pass. 13A–H pin the definition with exact values, and the walk pins path-independence; the walk alone can't catch a wrong definition, because the incremental and from-scratch sides would share it.

**Mutation pins.** Each wrong rule was applied to the real engine and the file restored byte-identical afterwards:

| Mutation | Caught by (real engine) |
|---|---|
| drop the zero floor | 13H |
| fine pushes (`points >= 0`) | 13A–G, 13I, 13J |
| not-for-me pushes (`points !== 0`) | 13B–D, 13G, 13I, 13J |
| delete never decrements | 13D–G, 13I |
| the old sign rule on re-rates | 13A–C, 13F, 13G, 13I |

## 4. The backfill — dry run

### The tool

`scripts/recount-interaction-count.mjs` follows the `backfill-rec-rating-dna.mjs` pattern.

- It signs in as ONE account with the owner's credentials. RLS applies, so it physically cannot see anyone else.
- It values every rated interaction the engine accumulated with the real `bottleEvidence`. "Accumulated" means the stored `match_confidence` is set: a never-resolved row never accumulated, and the reversal skips it too.
- It diffs the sums against `dna_accumulation` and puts each differing row in a class:
  - **count-only:** the points agree and the count doesn't. That is exactly the drift this fix stops, and the only class `--apply` writes.
  - **needs-review:** the row's points disagree with the recount too, so its history isn't today's engine over today's journal (a seeded fixture, legacy drift, a resolver change since the rating). These are reported and never written; they need an S5-style per-class call.
- It also lists ledger evidence that has no row, stamps that disagree with today's resolver, and rated bottles that never resolved.

`--apply` writes `interaction_count` and nothing else: no points, no promotions, no timeline. Every UPDATE asserts the row still holds the points and count the run read, so a rating that lands mid-run turns that write into a no-op. **`--apply` has not been run anywhere.**

### Per account

Dry run Oct 31, 2026, 00:18 UTC, on the merged tree's resolver. A pre-merge run at 00:15 gave identical results.

| Account | Rated bottles | Ledger rows | count-only | needs-review | Verdict |
|---|---|---|---|---|---|
| `epgoodwin+e2e` (rich fixture) | 3: 1 accumulating (Huet, liked @ 90), 1 below the gate (Roulot @ 40), 1 never resolved (Kumeu River Maté's; today conf 0) | 11 | **0** | 4, all fixture-seeded | **exclude** |
| `epgoodwin+e2e-fresh` (zero-state) | 0 | 4 (quiz rows, 0/0) | **0** | 0 | nothing to do |
| `epgoodwin@gmail.com` (Ed), `edward.goodwin@fti…`, `+local`, `+prod`, every other account | — | — | — | — | **not read** (rule: data checks use the test account). Run the script as the owner |

The rich account's needs-review rows are all synthetic:

| Row | Stored (points / bottles) | Recount | Why |
|---|---|---|---|
| varietal:chenin_blanc [promoted, auto] | 6 / 3 | 0 / 0 | `EARNED_FIXTURE` (`e2e/fixtures/test-db.ts`) seeds the row directly; no Chenin bottle stands behind it |
| estate:domaine_dujac | 2 / 1 | 0 / 0 | `SHIFT_FIXTURE` (`identity-shift.spec.ts`) seeds "one loved bottle away" directly |
| region:burgundy [promoted, quiz] | 2 / 1 | 0 / 0 | that phantom Dujac bottle's region share |
| country:france [promoted, quiz] | 3 / 2 | 1 / 1 | the Huet Vouvray (liked) plus the phantom Dujac |

The spec comment mentions "the seeded Dujac rating", but there is no Dujac row in the account's `wine_interactions`, so the fixture's evidence is orphaned. The self-heals rewrite chenin and dujac on every run, and the e2e baselines depend on those values, so **a backfill must skip both e2e accounts**.

### Triage for the accounts this session did not read

This is read-only SQL for the SQL Editor, validated here on the two e2e accounts. Since Aug 1, 2026 (The Long Memory), `wine_events` has recorded every rating move with old → new and its band. That window opens one day after S5 hand-reconciled the July ledger. Each event counted below left the count one bottle high on every dimension of its wine:

```sql
SELECT u.email,
  count(*) FILTER (WHERE e.event_type = 'journal_deleted'
                     AND e.payload->>'points_reversed' = 'true') AS deletes_reversed,
  count(*) FILTER (WHERE e.event_type IN ('pick_rated','rec_rated','bottle_logged','journal_rerated')
                     AND e.payload->>'confidence_band' = 'full'
                     AND e.payload->>'previous_rating' = 'liked'
                     AND e.payload->>'rating' = 'loved') AS rerated_up,
  count(*) FILTER (WHERE e.event_type IN ('pick_rated','rec_rated','bottle_logged','journal_rerated')
                     AND e.payload->>'confidence_band' IN ('full','partial')
                     AND e.payload->>'previous_rating' IN ('loved','liked')
                     AND e.payload->>'rating' IN ('fine','not_for_me')) AS rerated_out,
  count(*) FILTER (WHERE e.event_type IN ('pick_rated','rec_rated','bottle_logged','journal_rerated')
                     AND e.payload->>'confidence_band' IN ('full','partial')
                     AND e.payload->>'previous_rating' = 'not_for_me'
                     AND e.payload->>'rating' = 'fine') AS nfm_to_fine
FROM wine_events e JOIN auth.users u ON u.id = e.user_id
GROUP BY u.email
ORDER BY 2 DESC;
```

On the e2e accounts this returns rich `17 / 0 / 0 / 0` and fresh `0 / 0 / 0 / 0`. An account showing all zeros has no post-Aug-1 count drift. Event writes are fire-and-forget, so treat zeros as strong evidence, not proof; the recount is the proof, and it also covers the pre-Aug-1 history that has no events. Any non-zero account needs its recount.

**Running the recount for an account** (the owner, from a checkout with `.env.local`; dry run unless `--apply` is added):

```bash
BACKFILL_EMAIL=... BACKFILL_PASSWORD=... node scripts/recount-interaction-count.mjs
```

## 5. Merge notes

- **The `main` sync.** The branch was synced with `main` (#22, #23, #24) before this readout. The merge was clean, and every check here was re-run on the merged tree. #24 moved one Suite 13 fixture: "Sancerre" now resolves at 40, no longer as Château de Sancerre. The walk still covers the partial band through "Barossa Shiraz".
- **Against `house-list`** (a dry `git merge-tree`; nothing written). `dnaEvolution.js` merges clean with Phase 4's timeline `wine_name` plumbing. `dnaEvolution.test.js` has three small textual conflicts, and in each one both sides survive a plain union:
  1. The mirror's `resolveAndAccumulate` tail: keep `const countDelta = …`, house-list's `wineName` on the early return, and this branch's `upsertAccumulation(…, pointDelta, countDelta)`.
  2. `simulateJournalDelete`'s header: house-list's comment and body (the rating read from the deleted row), plus this branch's `engine = MIRROR_ENGINE` option.
  3. Its reversal call: house-list's `const interaction = { rating: deleted[0].rating, … }`, followed by `engine.reverseAccumulation(…)`.

  `CLAUDE.md` already conflicts between `house-list` and `main` at the test counts. After both land, the dnaEvolution count is 78 + house-list's additions + 19.

## Decisions for Ed

1. **The definition.** Bottles that push (loved and liked). The alternative, every rated bottle including fine and not-for-me, would make "N bottles made the case" count bottles that argued against the case. Recommended as built.
2. **The real accounts.** Run the triage SQL, then the dry run per account as the owner (or authorize a one-time read-only run by a session), then decide `--apply` for the count-only rows. Nothing has been written. **Order matters: merge and deploy the fix first.** Until it ships, every re-rate and delete in production keeps adding drift, so a backfill run before the deploy would start going stale at once.
3. **The e2e accounts stay out of any backfill.** Separately, as a test-infra question not yet booked: the fixtures' seeded rows have no interactions behind them, so they will never reconcile with a recount. Seeding the bottles they imply would make the fixture honest.
4. **House List copy.** `dnaCount(0)` renders "from your quiz", assuming a zero count means a quiz-founded row. With honest decrements, an EARNED row whose bottles were all deleted now reaches 0 (rollup-created rows already start there) and would read "from your quiz" beside its ✦. The label should key on `source`, not the count. That belongs on the house-list branch, in Phase 6.
5. **The evidence-ledger guard can now pin the count.** It can assert +1 per dimension after the rate and the exact baseline after the journal delete, instead of writing the count back by hand, so the mask becomes a pin. That needs an e2e run on quiet accounts and was not done here.
