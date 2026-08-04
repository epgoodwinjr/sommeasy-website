# The Velvet Rope — Session Readout

**SHIPPED: 2026-08-04 01:37:36 UTC** (push of `effe5bc`; Vercel deploy
`dpl_8ZA2Vt8BREM5SnaGre9je9mb54x3` READY on production within the minute).
This is the health report's before/after boundary for the front-door-funnel
section: anonymous traffic before this timestamp saw the over-giving teaser,
traffic after it sees the velvet rope.

---

## What shipped

Item 4 of the Aug 3 outside-feedback triage — the decided middle path between
Nicola's rejected signup-wall and the over-giving teaser. The anonymous quiz
stays end to end; what changed is ONLY what the anonymous reveal displays:

**Shown (the hook):** the protea bloom (124px), the "Your Wine DNA" kicker,
and the composed title.

**Gated (the reading):** the epithet, the full narrative, and the signature
line — all absent from the render tree (conditional JSX on `user`, never
CSS-hidden; the honest-presentation bar is absence-from-render, and the
teaser signature's render-time computation was deleted outright). The
signed-in reveal is untouched (its narrative `<p>` gained
`data-testid="reveal-narrative"`).

**The gate sells, never apologizes** (approved copy, verbatim in prod):
headline "Your full reading is ready."; body naming the three gated goods +
"it evolves with every bottle you rate"; CTA "Save My Wine DNA →" → /signup;
small print "Held on this device for 7 days." + the existing sign-in fold-in
line.

**Recs: ONE read-only taste** (Ed's decision ①): a single card with its match
reason proves the Somm read you; the existing "N more wines to explore" tail
("2 more" in the canonical 3-rec quiz path) sells the rest for free. Section
copy: "The first bottle we'd pour you. Your full list is waiting behind your
account."

## The invariant that mattered

Gating what's SHOWN never gated what's COMPUTED or CARRIED. `finish()` stashes
the COMPLETE profile (narrative, epithet, genome, all recommendations) before
the reveal renders — the display change cannot reach it. The post-save reveal,
both stash carriers (localStorage + `user_metadata.pending_palate`), and the
fold-in deliver the full payoff exactly as before. palate-handoff specs B/C
(the fold-in guards) passed unmodified.

## Contract updates (TDD — RED verified before implementation)

- **palate-handoff spec A** (hard-fail): runs at 375×812 end to end; absences
  pinned with `toHaveCount(0)` (count, not visibility — an `opacity:0` or
  `display:none` leak still fails); new gate copy pinned; `rec-card` count
  = 1 + the "more wines" tail; read-only assertions kept; **stash
  completeness** (profile non-null, narrative non-empty, epithet string,
  genome object, recs ≥ 1); an **innerText backstop** — the stashed
  narrative's first sentence must not appear anywhere in the body (testids
  can move, prose can't hide); and page + gate `scrollWidth` overflow guards
  (the steer-placeholder lesson, programmatic).
- **quiz-completion**: the symmetric presence half — `reveal-narrative`
  visible + non-empty on the signed-in reveal.

## Side-fix: the First Pour rich-account guard was lying (and the fixture was incomplete)

The full-suite run failed "The First Pour — rich account: zero cards" — a spec
this session's diff cannot reach. Root cause, two layers:

1. **The rich fixture never had a `bottle_logged` event.** DB truth: every
   other event type present (31 menu_analyzed, 18 pick_rated, 43 pick_chosen…),
   bottle_logged = 0 — so the log-a-bottle card legitimately rendered on a
   "full journal" account. The bottle-label e2e specs exercise extraction,
   not saves.
2. **The guard was race-vacuous.** `toHaveCount(0)` matches "cards not loaded
   YET" as happily as "resolved to none" — the spec passed whenever it beat
   the two async Supabase reads (isolated run: 1.2s, green), and lost the
   race under full-suite load. Verdict-ask masking (a due ask suppresses all
   cards) covered the gap on other runs.

**Fixes:** (a) the spec now pins the PREMISE in the DB — all three completion
truths must exist on the rich account, with a healing instruction in the
failure message — and waits for the cards read response before asserting zero
(deterministic RED confirmed on the missing truth, then GREEN); (b) the
fixture was healed ONCE through the real UI: a bottle log as the rich account
(name overwritten to junk → resolver confidence 0; rated "It was fine" → 0
points — double-zero DNA movement; the fixture label itself reads as Kanonkop
Paul Sauer, which the overwrite deliberately dodged), then the journal row
removed through the real journal UI. The append-forever `bottle_logged` event
is the durable truth; `dna_accumulation` count-verified unmoved; identity
fields snapshot/restored verbatim. Throwaway heal spec deleted after its one
run.

## Verification

- **Unit:** all 14 suites, 386 tests green (no unit surface pins the teaser
  display; gate copy lives inline in Quiz.js — authCopy is auth-pages-only).
- **e2e:** full suite **73/73 green** (5 env-gated skips), including the new
  velvet-rope contract and the hardened First Pour guard.
- **375px proof:** full-page capture of the new teaser (throwaway spec,
  deleted) — composition clean, nothing truncated, overflow 0.
- **Prod (sommeasy.wine, live anonymous flow at 375×812):** SA → Stellenbosch
  → Pinot Noir → reveal. DOM: `reveal-archetype` 1, `palate-mark` 1,
  `teaser-gate` 1, `reveal-epithet` 0, `reveal-narrative` 0,
  `teaser-signature` 0. Gate copy verbatim. One rec card (Felton Road,
  🍇 grape match) + "2 more wines to explore". Stash complete on prod:
  version 1, narrative 305 chars, epithet "Stellenbosch-centered ·
  red-leaning · New World-minded", genome present, 3 recommendations —
  narrative-leak check false (stashed first sentence nowhere in the body).
  Horizontal overflow 0. Stash cleared after verification; the anonymous
  flow writes nothing server-side.

## Measurement (already wired — nothing new added)

No new telemetry, per the brief. Web Analytics (baseline since ~Aug 1) carries
anonymous pageviews; quiz saves with `mode=restore` in wine_events (with
`occurred_at` back-logged to stash creation) are the conversion signal. The
Monday health report's front-door-funnel section splits on **2026-08-04
01:37:36 UTC**.

## Files

- `src/components/Quiz.js` — the Reveal's velvet rope (display only)
- `e2e/palate-handoff.spec.ts` — spec A: the new anonymous-teaser contract
- `e2e/quiz-completion.spec.ts` — signed-in narrative presence half
- `e2e/first-pour.spec.ts` — rich-account guard: premise pin + settle gate
