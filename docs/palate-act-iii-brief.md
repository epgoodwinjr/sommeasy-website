# The Palate, Act III: One of One — Design Brief

*Prepared July 30, 2026 by the Cowork session that ran the full archetype audit (`claude/palate-archetype-audit.md` in the project; decisions locked in `claude/palate-act-iii-decisions.md`). This brief is the design authority for the identity redesign. It defines the vision, the mechanics, and the non-negotiables — implementation decisions within those bounds belong to the executing sessions.*

## Why now

The audit found the contradiction at the heart of the brand: we call it Wine DNA, and DNA is the marker of an individual — but the system hands out 1 of 15 hardcoded labels chosen by *counts*, never by taste content. Two users with fully disjoint palates get the identical archetype, emoji, and narrative skeleton. The identity is written once at quiz save and never recomputed — production still shows an archetype the engine deleted on July 30. The evolution engine underneath is real and well-built, but it is structurally incapable of touching who you are, and its thresholds are so steep no organic promotion has ever fired. The one generative surface (the LLM narrative) is gated on events that never happen. The March 2026 spec scheduled "the full archetype rethink" as a separate spec that was never written. This is that spec — landing before launch, while there are 6 production rows and the names are barely load-bearing in tests.

**Ed's locked decisions:** identity is generated and unique per user; the name is composed by a deterministic grammar; day zero delivers the full identity from quiz content alone; identity changes at milestone moments (promotions/demotions, evidence accumulation, first-time firsts — quiz refines recompute silently, uncelebrated); deterministic core with the Somm voicing prose on top; the visual DNA signature is in scope; full redesign ships before launch.

## Vision

**Nobody else has your Wine DNA.** The quiz reads it, bottles prove it, and the identity — name, traits, visual, story — is composed from what *you* actually drink and love. It changes when you earn the change, and the Somm tells you what shifted.

## Part 1 — The identity strand

The archetype is replaced by a per-user **identity strand**, composed deterministically by a new `composeIdentity(evidence)` in a new `src/lib/identityEngine.js` (profileEngine's `determineArchetype` retires; `generateDNAProfile`'s orchestration role survives). The strand:

- **Title** — "The {Anchor} {Persona}". *Anchor* is the strongest concrete noun in the user's own DNA, chosen by precedence: anchor **region** when their anchor country holds ≥2 selected regions or a region carries the most evidence points; else anchor **country**; else signature **grape** when varietal evidence dominates or place is absent. *Persona* comes from a curated vocabulary (~16–24 words) selected deterministically from shape traits (loyalty, breadth, depth, color lean, world lean, evidence maturity). Examples of the target register: "The Stellenbosch Loyalist," "The Mosel Purist," "The Cabernet Instinct," "The Piedmont Archivist." Every trait combination maps to exactly one persona — no randomness, no ties.
- **Epithet** — a middle line of up to three composed phrases extending `palateSignature`: "Mosel-centered · white-leaning · estate-loyal". This is where uniqueness compounds: the title may be shareable, the strand is not.
- **Traits** — the structured selection (anchor, signature grape, leans, loyalty, maturity) persisted for prompts, the visual, and recompute diffing.
- **Visual genome** — deterministic parameters derived from the DNA data that drive the visual signature (Part 4).
- **Narrative** — composed template seed at compose time; the Somm evolves it thereafter (existing `/api/palate-narrative`, finally fed).

**Grammar rules (non-negotiable):** deterministic and pure (same evidence → same strand — the anonymous teaser regenerates client-side with no DB or LLM, and must keep doing so); built only from the user's own selections and evidence (never fabricate a place or grape they didn't give us — the France+Cabernet case must not conjure "Bordeaux"); confident present tense at every input depth (the sparse single-country quiz gets a real identity, not a waiting room — the entire archetypeVoice ban list carries forward and grows); **non-hierarchical** — no "Grand"-style tiering; a two-bottle palate is *different*, never *lesser*. Persona vocabulary is the executing session's craft within these bounds: it should read like a wine identity, not a mad-lib — when a composed title would read awkwardly, the grammar prefers the next anchor in precedence rather than shipping clunk.

**Honesty rule:** titles can collide across users (two Mosel purists exist on Earth). One-of-one-ness is the *strand* — title + epithet + traits + visual + narrative. No copy anywhere claims the name itself is globally unique.

**Persistence:** the title continues to live in `wine_profiles.archetype` (every render surface and the `palate-archetype` testid keep working; the column is the title now). `archetype_emoji` retires from display in favor of the visual signature — keep the column populated with a neutral 🧬 for backward compat until surfaces stop reading it. New `identity` jsonb column (migration 006) holds epithet, traits, and genome.

## Part 2 — The evidence ledger (retune + close the leaks)

Identity built from evidence requires evidence that actually flows. All of this ships regardless of the identity layer and is Session 1's core.

- **Close the /recommend gap:** `handleRatePick` runs `resolveAndAccumulate` (with `previousRating`) exactly like WineRecList — restaurant ratings are the strongest intent signal in the product and currently add zero DNA. This also stamps `resolved_*` metadata, fixing the null varietal/region those rows feed the somm payload today.
- **Fix the double-count:** home `handleBottleSave` passes `previousRating` (it currently applies full points on re-log of an already-rated bottle).
- **Fix delete idempotency:** journal delete reverses points only after (or transactionally with) the row delete, so a failed delete + retry can't double-reverse.
- **Retune promotion thresholds** so milestones fire at a realistic drinking pace. Starting proposal (executing session validates against the point values): estate 6→**4**, varietal 10→**6**, region 14→**10**, country 20→**14** — i.e. roughly 2–3 loved bottles to earn an estate, 3 for a varietal. Keep the demotion-resistance ratio (quiz rows harder to demote than earned) and the rollup rules.
- **Partial-credit accumulation (recommended, executing session decides):** today `CONFIDENCE_GATE=80` effectively requires a producer match, so casual logs accumulate nothing. Recommendation: at confidence 60–79, accumulate at half weight for the dimensions actually resolved (varietal/region/country), full weight ≥80, nothing below 60. If adopted, update the mirror + document in CLAUDE.md.
- **Unchanged on purpose:** DNA remains tasted-evidence-only — want/skip and first-time "fine" stay out of accumulation; the Suite 9 merge/uncheck semantics (honor-the-uncheck, provenance, no-timeline-for-user-edits) are load-bearing and survive verbatim.

## Part 3 — Milestone moments (identity that lives)

A post-accumulation hook (`maybeRecomposeIdentity(userId)`) runs after `resolveAndAccumulate` / `reverseAccumulation` when a **milestone** fires:

1. **Promotions & demotions** — the existing timeline events.
2. **Evidence accumulation** — every 5th rated bottle since the last recompose (mirrors the narrative route's existing gate).
3. **First-time firsts** — first earned promotion ever; first loved bottle outside quiz DNA; first demotion. One-time beats that make early evolution eventful while thresholds are still distant.

On milestone: recompute the strand from current evidence (quiz DNA ∪ earned, live red/white recount — **the Red↔White rail finally evolves**, closing the audit's frozen-rail finding). If the *title or epithet changed*, write a new `dna_timeline` event type **`shifted`** (migration 006 widens the CHECK constraint) with before→after, and celebrate: toast ("🧬 Your DNA has shifted: you're now The Mosel Purist"), home-strip whisper, a distinct "Recently evolved" entry on /palate, and a journal timeline row. If the strand is unchanged, recompute silently refreshes traits/genome — no event, no noise. Quiz saves keep recomputing as today, silently (Ed's explicit call: refines are not celebrated moments). Narrative: a `shifted` event marks the narrative stale via the existing baseline, so the Somm rewrites it on the next /palate visit — the route's gate now fires from real life. Cost posture: recompose is pure computation; only the narrative regen costs (~$0.006), bounded by the existing staleness gate and rate limiter.

## Part 4 — The visual DNA signature

A deterministic per-user visual, generated from the genome — CSS/inline-SVG only, no new dependencies, brand palette (forest green, burgundy, sage, cream). Form is the executing session's craft; constraints: derived purely from the genome (same palate → same mark, evolves when DNA evolves); visibly distinct across different palates at a glance; beautiful at strip size (~48–96px) and hero size (~320px); wine-label elegance, not dashboard. It anchors the /palate hero (with the title) and replaces the emoji on the home strip. Build the render as a self-contained function (genome → SVG string) so a future share card / OG image can reuse it unchanged — shareable-*ready* is in scope; the share feature itself is not.

## Part 5 — Surfaces

Reveal: title + epithet + visual + narrative (same auto-save flow, same "See/Update My Wine DNA" buttons). Anonymous teaser: unchanged mechanics — compose runs client-side; full identity shown, gate below (gate depth, not delight). Home strip: visual mark + title + epithet line + whisper. /palate: hero as above; "Recently evolved" gains `shifted` entries in Somm voice. Journal DNA Timeline: renders `shifted` ("You became The Mosel Purist"). Somm prompts: `buildSommPayload` and the narrative payload send title + traits (richer than the bare label they get today). Auth/emails: no changes — they reference "palate"/"Wine DNA" only.

## Materials inventory (build with, don't rebuild)

`dna_accumulation` with points/provenance/mappable + `dna_timeline` (immutable, insert-only); `dnaThresholds.js` (the single copy of every number — stays that way); `palateSignature.js` (computeSignature/signatureLine — extend for the epithet); `saveQuizProfile.js` (the ONE save path; merge semantics untouched); `/api/palate-narrative` (model, gate, salvage, retry, cost logging — reuse, don't fork); the toast/whisper/timeline UI machinery; `PalateView` (presentation-only, props in); the seeded test account + self-healing fixtures.

## Non-negotiables

- Deterministic, pure, client-runnable identity composition — the teaser and `pendingPalate` restore ("the engine is deterministic; the restore regenerates") must keep working unchanged.
- No fabricated places or grapes; no deferral copy (ban list carries forward into the new voice guard, comments included); non-hierarchical personas.
- No raw internal IDs anywhere (the permanent guard stays); brand system + voice per CLAUDE.md; mobile-first; no new dependencies; no chart libraries.
- LLM remains progressive enhancement — the strand is complete without the Somm; any narrative failure keeps the existing text.
- Suite 9 merge/uncheck semantics preserved; `dna_timeline` stays insert-only; user edits still write no rating-evidence events (`shifted` is system-observed, not user-edit).
- All thresholds live only in `dnaThresholds.js`; mirrors updated in the same session as any change (dnaEvolution.test.js, the at-threshold Chenin fixture).
- Ed's personal account off-limits to automation; production verification via `epgoodwin+e2e@gmail.com` only, with full derived-state revert per CLAUDE.md.
- Migration regenerates all existing `wine_profiles` rows under the new engine (kills the Rising Palate fossil by construction). Six rows today — verify each before/after.

## Test-impact map (update, don't orphan)

`archetypeVoice.test.js` → becomes `identityVoice.test.js`: keep the source-scan ban list (point it at identityEngine.js), add grammar guards — France+Cab yields a confident composed title with no fabricated places; sparse single-country input gets a real identity; determinism (same input → same strand); non-hierarchy (no banned tier words); rich input never falls to the sparse register. `dnaEvolution.test.js` mirror: new thresholds, partial-credit rule if adopted, milestone/recompose logic, `shifted` event. e2e: `palate-archetype` testid asserts non-empty (survives); quiz-completion button labels unchanged; Chenin fixture moves to the new at-threshold value (6); new hard-fail guard — rate to a milestone on the test account, assert title/timeline/toast respond; reseed via the existing seeder. CLAUDE.md: rewrite the "15 archetypes across 6 scoring dimensions" line and the Palate sections. Update README's stale palate references while in there.

## Executing session's latitude

The persona vocabulary and its selection table; epithet phrasing; the visual form of the signature; exact partial-credit weights (or rejecting partial credit with reasoning); the first-time-firsts list's final membership; whether `identity` jsonb vs. discrete columns; section order and micro-interactions; copy, within voice. Make the calls, ship, explain.

## Scope split (five sessions, Act II cadence: Cowork verifies each)

1. **"The Evidence Ledger"** — Part 2 entire: /recommend gap, double-count, delete idempotency, threshold retune, partial-credit decision, migration 006 (identity column + `shifted` CHECK + any threshold-dependent fixture updates), mirrors + fixtures updated. Ships standalone value; no identity change yet.
2. **"One of One"** — Part 1: identityEngine + grammar + epithet + traits + genome; retire determineArchetype; identityVoice suite; regenerate the 6 rows; reveal/strip/palate render the strand (emoji retired, no visual yet).
3. **"The Living Strand"** — Part 3: milestone hook, `shifted` events, celebrated moments, live red/white, narrative staleness integration, first-time firsts.
4. **"The Signature"** — Part 4: genome → SVG, strip + hero integration, shareable-ready render; screenshots (~390px and desktop) with the session summary for Ed's design review.
5. **"Hardening the Helix"** — new e2e guards, full-suite run, prod migration + verification on the test account, readout docs, CLAUDE.md/README updates. Then Ed's manual acceptance canary: fresh quiz on a throwaway account, rate to a milestone at a restaurant, watch the DNA shift.
