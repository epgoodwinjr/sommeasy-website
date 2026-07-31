# Act III, Session 5 Readout — "Hardening the Helix" (the arc closes)

**Executed by Claude Code, July 31, 2026, against the S5 mandate: the anchor evidence floor (Ed-approved), the legacy-drift reconciliation (booked in S1), the guard-coverage audit, the watchtower extension, and the docs-made-true pass. No new product surface.**
For Cowork's independent verification (code + DB + prod) before Ed runs the acceptance canary. Base: `main` @ `ed600d8` (S4 verified; mark aesthetics Ed-approved and untouched here).

## Verification summary

| Check | Result |
|---|---|
| Unit suites (10) | ✅ 316/316 — dnaEvolution **75** (74 + 12J, the floor through the real milestone hook), identityVoice **21** (18 + the floor block), palateMark 15, countryAttribution 22, sommPicks 24, authFlow 56, authRoutes 21, pendingPalate 26, ssrfGuard 48, captcha 8 |
| `npm run test:e2e` | ✅ 60/60 on the final serialized tree (5 env-gated skips: seeder + screenshot captures) — both DB hard-fail guards green, the quiz-completion guard's NEW quiz-save-silence count assert green; post-run SQL confirms the exact seeded baseline (dujac 2/1 unpromoted, chenin 6/3, timeline exactly its 1 seeded event database-wide, zero shifted rows, zero guard rows, red 1/white 1) |
| `npm run build` | ✅ clean, 17/17 static pages |
| Floor title-stability gate | ✅ **all 7 production titles compose UNCHANGED under the floor** — verified read-only with the real engine BEFORE any write, and re-verified after the drift reconciliation (both runs in the session transcript; the mandated STOP condition never triggered) |
| Drift reconciliation | ✅ applied in one guarded transaction (every UPDATE asserted the exact expected current value); **dna_timeline count 1 → 1** (the e2e seeded event — zero events written, zero celebrations, zero firsts armed); before/after per row below |
| Account rules | ✅ Ed's accounts touched ONLY by the sanctioned migration writes below (S2 regeneration discipline); everything interactive ran on `epgoodwin+e2e@gmail.com` |

## 1. The anchor evidence floor (Ed-approved, now live)

`REGION_ANCHOR_EVIDENCE_FLOOR = 4` lives in `dnaThresholds.js` (named, commented — two loved bottles, deliberately the same bar estate loyalty pays), consumed by `regionEvidenceLeads` in identityEngine: a region row leads only at ≥4 points; tie-tolerance above the floor stays (a strict lead essentially cannot occur — every band that writes region writes country alongside).

- **Coverage:** identityVoice +3 (a 2-point tie must NOT flip the anchor; a 4-point tie MUST; an out-pointed region above the floor still never leads — the shape isolates `regionEvidenceLeads` from the other two region-anchor routes). dnaEvolution +12J drives the REAL `maybeRecomposeIdentity` through the interval milestone with seeded ties: 2-point tie → silent refresh, zero events, title intact; 4-point tie → shifted event carrying the country→region retitle. The "mirror" needed no change — the floor lives in exactly one place (the real engine), and Suite 12 exercises the real module chain; nothing in the accumulation mirror duplicates compose logic.
- **Production gate:** all 7 rows recomposed locally with the real engine — zero title changes (the identity-shift guard's scenario is also unaffected: france at 5 out-points burgundy at 4 there, so `regionEvidenceLeads` was false before AND after the floor).
- **Engine nuance observed, deliberately not changed:** `regionEvidenceLeads` is computed over ALL region rows while the anchor region is chosen within the anchor country — a floor-clearing region in country B can, in a corner case, enable a flip to the anchor country A's first region. Pre-existing S2 shape, requires an unusual points distribution, out of the floor's approved scope; noted for the resolver/anchor design backlog.

## 2. The legacy evidence drift, reconciled (the S1 debt, paid)

The full rated-interaction census (12 rows across production) found **three defect classes**, narrower and more interesting than the S1 booking assumed:

| Class | Rows | Defect | Treatment |
|---|---|---|---|
| Double-count (the pre-S1 home re-log bug) | Ed personal + Ed FTI, "La Emperatriz el Jardín de La Emperatriz" | one loved bottle credited **+4/+2ct** per dimension instead of +2/+1 | subtract the phantom +2/+1 |
| Never-resolved (old /recommend path) | +local + +prod, "Torbreck RunRig Shiraz, Barossa 2016" | rated loved, conf NULL, zero accumulation | **backfill through today's engine** (conf 90: torbreck/barossa/syrah/australia +2 each) + stamp full resolution metadata |
| Stale-wrong stamps | e2e, "Kumeu River, Maté's Vineyard, New Zealand" | stamped Tuscany/Italy@82 pre-possessive-fix; ledger already cleaned — a delete would have **reversed points that don't exist** | un-stamp to never-resolved (today's engine resolves it at conf 0 — not evidence; `reverseAccumulation` skips null confidence, Suite 11F) |

Exact before → after (accumulation `points/interaction_count`):

| Account | Row | Before | After |
|---|---|---|---|
| epgoodwin@gmail.com (Ed) | estate:jardin | 4/2 | **2/1** |
| epgoodwin@gmail.com | region:stellenbosch | 8/4 | **6/3** |
| epgoodwin@gmail.com | country:south_africa | 10/5 | **8/4** |
| edward.goodwin@fti… | estate:jardin | 4/2 | **2/1** |
| edward.goodwin@fti… | region:stellenbosch | 4/2 | **2/1** |
| edward.goodwin@fti… | country:south_africa | 4/2 | **2/1** |
| epgoodwin+local | varietal:syrah (quiz) | 0/0 | **2/1** |
| epgoodwin+local | country:australia (quiz) | 0/0 | **2/1** |
| epgoodwin+local | estate:torbreck / region:barossa | — | **created, auto, 2/1, unpromoted** |
| epgoodwin+prod | estate:torbreck / region:barossa / varietal:syrah / country:australia | — | **created, auto, 2/1, unpromoted** (this profile predated accumulation seeding entirely — engine-shaped auto rows, exactly what a today-rating would create) |

Interaction stamps: both Torbreck rows now carry `Torbreck / Shiraz / barossa / South Australia / Australia @ 90` (today's real resolution, verified by running the resolver); the Maté row is fully un-stamped (all resolved_* NULL, match_confidence NULL).

**Hard rules honored:** zero timeline events (count 1 → 1, verified); no promotions produced (nothing reached a threshold — the Ed corrections also dissolve the odd "jardin at-threshold-but-unpromoted" artifact, which was itself the double-count); no identity writes needed (no profile array moved, and the title-stability check passed identically on post-migration data — the would-be-shift reporting clause never engaged); no `identity.milestones` writes (rated counts unchanged — a migration is not rating evidence).

**Deliberately inert, documented:** Ed's "Jean-Louis Chave, Hermitage" at conf 40 stays unaccumulated — sub-60 is not evidence by design, and both differential and reversal already treat it as such.

**Flagged, not fixed (resolver backlog, now in CLAUDE.md Priorities):** the Jardín misattribution itself — a Spanish Rioja wine crediting Stellenbosch's "Jardin" at 82. Today's conflict cap can't catch it (nothing in the name states a contradicting geography). Maté-class, needs a design (foreign-language common-word producer aliases), not a patch. The reconciled ledger reflects today's engine truth, consistent with S1's handling of Maté.

## 3. Guard-coverage audit

| Act III behavior | Coverage verdict |
|---|---|
| The anchor floor | Unit-locked at the exact production layer (12J drives the real hook; identityVoice drives the real engine); e2e rides the identity-shift guard's engine-consistency assert (stored strand must equal the real `composeIdentity` over live evidence — which now includes the floor). A dedicated e2e interval-dance would add fragility on the shared account, not teeth. |
| Mark render bounds | Covered since S4: all four surfaces + the ≤44px strip bound (palate.spec, quiz-completion, palate-handoff). |
| Shifted celebration path | Covered: identity-shift.spec (toast, retitle, event shape, bookkeeping, exact restore). |
| Quiz-save recompose silence | **Gap found and closed:** Suite 12G covered the module; nothing pinned it end-to-end. The quiz-completion guard now counts the user's `dna_timeline` rows before the refine and asserts the count is IDENTICAL after `reveal-saved` renders. Hard-fail, zero-cost, no new spec file. |
| Evidence-ledger reversals | Covered: evidence-ledger.spec (+2 per dimension, exact reverse via the journal UI). The null-confidence reversal skip is unit-pinned (11F) — nothing user-visible exists to assert at e2e level. |

## 4. The watchtower, extended

`docs/auth-watchtower.md` is now the **Auth & Palate Watchtower**: §8 identity-shift rates (SQL over `dna_timeline` — healthy = shifts track rating activity; escalate on shift-without-rating, which the celebration rules forbid by construction), §9 the somm corrective retry, §10 palate-narrative regen rate vs the staleness gate + cost lines. Plus a measured retention caveat up top.

**The somm retry-rate mandate, answered honestly:** prod was **unmeasurable today** — Vercel Hobby retains runtime logs ~1 hour, and the retention window held two requests, zero somm calls (pre-launch traffic). What the evidence does say: the "fires on every attempt" impression does NOT hold — this session's live call succeeded on the first attempt (16.1s, 689 output tokens, $0.0147, no retry line), and the interlude's documented 44.9s case was the retry *recovering by design*. No prompt change is justified on a sample of one clean success; the watchtower grep (§9) is how the real rate accumulates once traffic exists. Booked, not fixed — per the mandate's own bar.

## 5. Docs made true

- **CLAUDE.md:** the four running Act III session bullets collapsed into one coherent "Act III is COMPLETE" block (the evidence economy → the strand → milestones → the mark → migration discipline), 40% shorter with every load-bearing invariant kept; test counts updated (dnaEvolution 75, identityVoice 21); Priorities rewritten (canary first, Jardín-class resolver follow-up named).
- **README:** fully rewritten. Gone: the dead pre-pause Supabase project URL and its committed anon key, the `wineData.js` ghost, the 2026-complete "What's Next" list, the first-deploy walkthrough. Now: what the shipped system is, the load-bearing structure, testing + environment + deployment as they actually work.
- This readout closes the series; the S4 screenshots remain the mark's visual record.

## Decisions Cowork should weigh

1. **Reconciliation shape** — class-specific (backfill where today's engine resolves, un-stamp where it refuses, subtract where history double-counted) instead of a blanket (a) or (b). The unifying rule: *the ledger equals what today's engine would have written, exactly once per rated bottle.*
2. **+prod's backfilled rows are `auto`-sourced** even for quiz-selected dimensions (syrah/australia) — exactly what the engine's upsert would create; the next real quiz save flips them to `quiz`/promoted via `syncQuizSelections`, converging without us pre-empting it.
3. **The e2e Maté row was un-stamped rather than re-stamped** — today's engine refuses the name (conf 0), and a conf-0 resolution never stamps; "never resolved" is the truthful terminal state and makes delete/re-rate provably inert.
4. **The floor's cross-country tie nuance** (§1) — observed, documented, unchanged.

## Ed's acceptance canary (the arc's exit — run when ready)

1. **Fresh quiz, throwaway account:** open sommeasy.wine in a private window, take the quiz (pick a country + a region + a grape you love). The reveal should land with a composed title, the epithet line, and your bloom — no save button anywhere.
2. **Sign up from the reveal** (any email — Hide My Email is the proven-hard path) and confirm from the email. Landing signed-in should fold the palate in: same title, same mark, "Welcome back" if you detour.
3. **Rate two loved bottles of one estate through /recommend:** paste any list containing the same producer twice (two vintages work), rate both "Had it → Loved it."
4. **Watch the second one:** promotion toast (the estate joins your DNA) → the shift toast ("🧬 Your DNA has shifted…") → the home strip retitled → /palate: the bloom has grown (a berry, fuller petals), "Recently evolved" shows the becoming, the journal timeline carries it.
5. **Revisit /palate after a minute:** the narrative should re-evolve to mention what changed (the staleness gate re-armed by the shift).

If any beat fails, the readouts + watchtower greps are the forensics kit. Cowork verifies this session first; launch follows the canary.

## Cost note

No new LLM surface. This session's live verification spent one somm call (~$0.015) plus the final e2e battery's usual ~$0.15–0.30.
