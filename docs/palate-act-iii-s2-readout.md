# Act III, Session 2 Readout — "One of One"

**Executed by Claude Code, July 31, 2026, against `docs/palate-act-iii-brief.md` Part 1 (entire — nothing from Parts 3–4).**
For Cowork's independent post-review (code + DB, including every regenerated row) before Session 3. Base: `main` @ `1486641` (S1 + the Maté's Vineyard fix, both verified).

## Verification summary

| Check | Result |
|---|---|
| Unit suites (9) | ✅ 284/284 — identityVoice 14 (replaces archetypeVoice 8), dnaEvolution 65, countryAttribution 22, sommPicks 24, authFlow 56, authRoutes 21, pendingPalate 26, ssrfGuard 48, captcha 8 |
| `npm run test:e2e` | ✅ 59/59 (seeder skipped) on the final sweep — one earlier run lost its dev server mid-run (ERR_CONNECTION_REFUSED cascade across five wine-lists/somm specs; all passed standalone and in the full re-run — transient infra, not product) |
| `npm run build` | ✅ clean, 17/17 static pages |
| Production regeneration | ✅ all 7 rows regenerated + verified by SQL (before/after below); `archetype_emoji` = 🧬 everywhere; `identity` jsonb populated; **zero dna_timeline writes** (test account still holds exactly its 1 seeded event) |

## What shipped

### 1. `src/lib/identityEngine.js` — `composeIdentity(evidence)`
Deterministic, pure, client-runnable (no DB, no LLM, no randomness — the teaser and pendingPalate restore keep regenerating client-side). Returns `{ title, epithet, traits, genome, narrative }`.

- **Title grammar:** "The {Anchor} {Persona}". Anchor precedence region → country → signature grape, with two rules layered on: the **clunk rule** (anchor names > 14 chars or > 2 words step down the precedence — "Willamette Valley" yields to "US"; grape names shorten to their first word when long: "Cabernet Sauvignon" → "Cabernet", always a prefix of the real name, never invented) and **varietal dominance** (one grape + no mapped places + ≥ 2 countries → the grape outranks the country, per the brief's "varietal evidence dominates" clause: "The Riesling Seeker").
- **Anchor region/signature grape** prefer evidence points when `accumulation` rows are passed (Session 3's milestone recompute will), falling back to the user's own first selection — deterministic tiebreak either way.
- **Epithet:** up to three phrases — place ({region}-centered / {country}-anchored), color lean (white-leaning / red-leaning / red & white), then shape (estate-loyal / wide-ranging / single-country deep / Old World-rooted / New World-minded). Grape-anchored strands use their first country for the place slot so the epithet adds information beyond the title.
- **Genome:** FNV-1a seed over the sorted evidence ids + normalized dials (world, color, focus, depth, spread, range) — persisted now so Session 4's visual ships without a data migration.
- **Narrative:** anchor opening + evidence middle (only names the user gave us; anchor-region estates and anchor-country regions lead their lists) + one persona-voiced closing line + the Somm's stance. "US" gets its article in prose ("leads with the US") — a display adjustment, not a different name.

### 2. The persona vocabulary (Ed reviews here — proposed, not asked)
**15 shape-words**, selected by ordered first-match-wins rules (total, tie-free): **Loyalist** (estates ≥ 2), **Archivist** (named wines ≥ 2), **Curator** (an estate + a bottle, or one estate with ≥ 2 mapped regions), **Purist** (1–2 grapes with ≥ 2 regions or ≥ 2 countries), **Cartographer** (anchor country regions ≥ 4), **Devotee** (≥ 3), **Voyager** (≥ 5 countries), **Classicist** / **Pioneer** (world lean ≥ 0.75, ≥ 2 countries), **Wayfarer** (≥ 3 countries, mixed worlds), **Regular** (one country, a mapped region), **Faithful** (the sparse place default), **Seeker** (one grape, ≥ 3 countries), **Instinct** (the sparse grape default), plus **"The Instinctive Palate"** for empty evidence (Ed's Session 5 fallback identity, carried forward as the degenerate case). The brief suggested ~16–24 words; this lands at 15 — every word reachable and distinct, and padding to a number would have weakened the register. Composed examples from real data: "The Stellenbosch Loyalist", "The Mosel Purist", "The Bordeaux Regular", "The Riesling Seeker", "The South Africa Curator", "The Tuscany Cartographer".
- **Honesty rule holds:** titles can collide (both Ed's rows compose "The Stellenbosch Loyalist" — even with the same epithet; their traits/genome differ). No copy anywhere claims the name is unique.

### 3. Retirement + persistence
`determineArchetype` and the 15 archetypes are deleted from profileEngine (~180 lines); `generateDNAProfile` orchestrates `composeIdentity` and keeps its rec-building role. The title persists in `wine_profiles.archetype` (every surface and the `palate-archetype` testid untouched); `saveQuizProfile` writes `identity: { epithet, traits, genome }` to the migration-006 jsonb; `archetype_emoji` is written as 🧬 and **no longer rendered anywhere**.

### 4. Surfaces
Reveal hero: emoji gone, epithet (`reveal-epithet`) between title and narrative; `savedRow.identity.epithet` carries the saved truth. Home strip: emoji block gone; the strip line is the strand's epithet (falls back to live `signatureLine` if identity is absent). /palate hero: emoji gone, epithet (`palate-epithet`) under the title, same fallback. Teaser mechanics untouched — the anonymous reveal renders the locally composed strand (epithet included) with the same gate below.

### 5. `identityVoice.test.js` (replaces archetypeVoice.test.js, 8 → 14 tests)
Carries the deferral ban table + self-check forward, pointed at identityEngine.js (comments included). Adds: a **tier-word scan** (grand/master/expert/elite/… — the non-hierarchy is now mechanically enforced), determinism (deep-equal strands; distinct palates get distinct genome seeds), France+Cab composes confidently with no fabricated "Bordeaux", single-country and single-grape minimal inputs get real identities, empty input gets the Instinctive Palate, rich input never lands on sparse personas, the clunk rule steps down, and no raw internal ids in title/epithet/narrative.

### 6. Production regeneration — before → after, all 7 rows
No timeline events written (a migration is not rating evidence). `narrative_updated_at` untouched (the Somm re-evolves narratives under its usual staleness gate).

| Account | Before | After |
|---|---|---|
| blairfg@gmail.com | The Instinctive Palate 🌿 | **The Italy Faithful** 🧬 — "Italy-anchored · Old World-rooted" |
| edward.goodwin@fticonsulting.com | The Grand Palate 👑 | **The Stellenbosch Loyalist** 🧬 — "Stellenbosch-centered · red-leaning · estate-loyal" |
| epgoodwin@gmail.com (Ed) | The Grand Palate 👑 | **The Stellenbosch Loyalist** 🧬 — "Stellenbosch-centered · red-leaning · estate-loyal" |
| epgoodwin+e2e@gmail.com | The Purist 🎯 | **The South Africa Curator** 🧬 — "South Africa-anchored · white-leaning" |
| epgoodwin+local@gmail.com | The Curious Palate 💡 | **The France Purist** 🧬 — "France-anchored · red-leaning" |
| epgoodwin+prod@gmail.com | The Curious Palate 💡 | **The France Purist** 🧬 — "France-anchored · red-leaning" |
| inbuilt.wit_05@icloud.com | **The Rising Palate 🌱 (the fossil)** | **The Bordeaux Regular** 🧬 — "Bordeaux-centered · red-leaning · Old World-rooted" |

The fossil's stored narrative contained the exact banned deferral copy ("your profile will grow richer and your recommendations will get sharper") — this migration erased its last trace from production, by construction. Full before-narratives were captured pre-update (available in the session transcript; the before-titles/emoji above are the load-bearing record). All narratives are now composed seeds; the Somm re-evolves them on the next stale /palate visit.

### 7. e2e
`reveal-epithet` assert added to the quiz-completion guard; `palate-epithet` assert added to the palate guard. No spec pinned an archetype name (all assert non-empty), so the suite survived the title change without expectation edits; the seeder's refine re-save composes the identical strand (content-identical merge), so the fixture cannot drift.

## Decisions Cowork should weigh

1. **Vocabulary size 15 vs the brief's ~16–24** — deliberate; see §2.
2. **Ed's two rows share title AND epithet** — same palate shape at the epithet's resolution. Distinctness lives in traits/genome (different seeds: 464996349 vs 530334102). If Ed wants visible divergence pre-Session-4, the epithet's third slot could hash-pick among tied candidates — not done, would trade legibility for novelty.
3. **Epithet staleness between quiz saves** — epithets recompose only on quiz saves until Session 3's milestone hook; the strip/palate fall back to the LIVE signatureLine only when identity is absent entirely. A palate that evolves via ratings won't move its epithet until S3 lands. Accepted as the brief's sequencing. (Observable on the test account: the refine-uncheck spec's save legitimately composes "red & white" with chenin unchecked, and the fixture self-heal restores the varietal array without recomposing — the next real quiz save reconverges. No spec pins epithet text, so this cannot flake.)
4. **Old narratives were replaced wholesale** — including the two rich "Grand Palate" paragraphs. The composed seeds are shorter; the Somm's narrative route re-evolves them from real palate data on the next stale visit. The old prose referenced retired archetypes, so keeping it would have leaked the dead system.

## Cost note
No new LLM surface: compose is pure computation. The e2e run's Claude cost is unchanged (~$0.15–0.30).
