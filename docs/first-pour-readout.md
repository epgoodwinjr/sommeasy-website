# The First Pour — Session Readout

**Status: Phase 0 complete — STOPPED for Ed's review of the card set, copy, and placement.**
Item 0 (both openers) is implemented, tested, and deployed. Nothing for the main event
has been built yet, per the brief.

---

## Item 0(a) — Replaced-pick wishlist row: investigated, confirmed, fixed

**Finding:** it lingered. `handleChoosePick` upserted a `want` row for the new pick and
recorded `replaced` on the pick_chosen event, but never touched the previous wine's row.
A diner who moved the banner off a wine kept that wine in Want to Try forever.

**Provenance:** not distinguishable from existing columns — a choose-created `want` row
and a home "Want to try" row are byte-identical after the fact (both carry no reliable
discriminator; somm_note can ride either). But the choose flow *already queries for an
existing row* before upserting (to preserve `had` rows), which means provenance is
knowable at creation time — and a replacement can only ever happen in the same client
sitting as the choose that created the row (the banner is pure client state).

**The smallest safe rule (implemented):**
- Mark a wine as choose-created ONLY when the pre-upsert query proves absence
  (PGRST116 — zero rows) AND the upsert succeeds. Marks live in an in-session Set.
- On replacement, delete ONLY marked wines, and only while the row is still
  `interaction_type='want'` with `rating IS NULL` — a rating that landed in between
  is a journal fact and is never deleted.
- Scan Again (a new sitting) clears the marks — a new sitting can never delete a
  previous sitting's rows; that sitting's choice stands as its last table moment.
- Every failure path (select error, upsert error, delete error) degrades to
  "row lingers" — never to a wrong delete. State-only cleanup; the ledger's
  `replaced` field keeps the history. No new event types.

**Flagged, not implemented (same class, out of scope):** the bypass path. "We went a
different way" after choosing leaves the choose-created `want` row in place too. Same
provenance machinery would cover it if Ed wants it.

**Proof (TDD red→green):** new hard-fail e2e (table-verdict.spec.ts test 5) — paste a
two-wine list (Meerlust / Hamilton Russell: DNA-scoring for the fixture, colliding with
no spec's guard dims), choose one, choose the other. Round 1: the created row must be
gone, the new row stands, `replaced` names the loser. Round 2 (fresh sitting): a seeded
pre-existing `want` row must SURVIVE the same replacement. Watched it fail at exactly
the round-1 cleanup poll before implementing; 6/6 after.

## Item 0(b) — Session-join proof: passed against live behavior first try

Test 1 of table-verdict.spec.ts now asserts the §11e backbone in a real flow: the
`menu_analyzed` event from a real paste→analyze and the `pick_chosen` from choosing on
those results carry the SAME client-minted session id. The assertion passed unmodified
on first run — the join was already real; now it's pinned.

**Verification:** all 13 unit suites green (370 tests), table-verdict e2e 6/6,
deployed in `795f34a` → production READY (dpl_DufHutzTYoXpYbgvhTPxDWZ3bPsq).

---

## Phase 0 — What a zero-bottle signup actually sees (the dead end, located)

The canonical new-user journey ends in a room with no next pour:

1. **Quiz → reveal**: auto-save, archetype hero, ratable recs, then ONE CTA —
   "Meet your palate →" → /palate.
2. **/palate**: the mark at 192px, title, epithet, signature rails, narrative — the
   emotional payoff lands. Then: "Recently evolved" says *"Nothing has shifted yet…
   the proof is already building below"* and "Building now" says *"Rate the bottles
   you try…"* — both confident, both **inert prose with no action attached**. The
   only interactive elements on the whole page: Journal → (empty for this user) and
   two quiet quiz links. The journey's designed endpoint offers nothing to DO.
3. **Next visit, home**: hero is situational ("At a restaurant? Get your picks" —
   most opens aren't at a restaurant), Log a Bottle is quiet furniture with no
   stated why, Wines to Try asks for ratings without saying what rating does.
   Nothing anywhere teaches the loop or its payoff.

The 3-of-5 stall reads as: users who never learned they can act TONIGHT without a
restaurant, and that rating is what makes the identity they just met move.

## Home furniture inventory (top → bottom, signed-in)

1. Header (logo, sign out) — sticky
2. Welcome-back moment (transient, pending-palate fold-in only)
3. Hero CTA: "At a restaurant? Get your picks" → /recommend
4. **Verdict ask** (conditional, timely, 14-day) — the one prompt slot
5. Log a Bottle module (camera/gallery inputs)
6. DNA strip (mark 44px, title, epithet, whisper) → /palate
7. Wines to Try (quiz recs via WineRecList, limit 5, collapsible)
8. Journal link (only when interactions exist)

The open slot for cards: between the hero CTA and the Log a Bottle module — the same
band the verdict ask occupies, which is what makes the precedence rule natural.

## Proposed card set — "The First Pour" (for Ed's review)

Cards teach the loop's verbs in ascending real-world commitment; every card says what
the action does to the palate (the why the current furniture lacks). All copy drafts —
Somm voice, present-tense, zero apology for an empty journal:

**1. `rate-one` — "Start with a bottle you've already met."**
Body: "Rate a wine below — one tap tells the Somm something true about you."
CTA scrolls to Wines to Try. **Retires when:** any rating-bearing
`wine_interactions` row exists (interactions-only ON PURPOSE — see fixture plan).

**2. `log-a-bottle` — "Pouring something tonight? Snap the label."**
Body: "Every bottle you rate presses your palate's shape a little truer — watch
your bloom." CTA opens the existing camera/gallery input. **Retires when:** any
`bottle_logged` wine_event exists.

**3. `bring-a-list` — "Next time a wine list lands in front of you, hand it to us."**
Body: "Photo, link, or paste — tell the Somm what tonight calls for and we'll find
your bottle." CTA → /recommend. **Retires when:** any `menu_analyzed` wine_event
exists (pre-ledger fallback: any interaction row with /recommend provenance in
source_url, so light pre-Aug-1 users like Nicola aren't re-taught what they've done).

**The exact stacking rule:**
1. Verdict ask resolves non-null → render the ask, render ZERO cards (timely beats
   evergreen; an outstanding verdict also proves the loop is already turning).
2. Else → at most 2 cards: the first two in fixed order [rate-one, log-a-bottle,
   bring-a-list] that are incomplete AND not device-dismissed. The third surfaces
   as earlier ones retire.
3. Welcome-back moment coexists (a beat, not a prompt).
4. Loading or ANY read failure → no cards, no spinner, zero-height slot
   (blackhole-tolerant, same posture as the verdict ask).

**Dismissal:** device-local capped localStorage list (`sommeasy.firstPourDismissed`),
the tableVerdict pattern exactly. Dismissing hides on this device; doing the thing
retires everywhere, permanently, from durable data. No "seen" flags anywhere.

**Mechanics:** new pure resolver `src/lib/firstPour.js` —
`resolveFirstPourCards({ interactions, events, dismissedIds })` → ordered cards —
unit-tested in plain node (real module, the tableVerdict pattern). Home adds two
head-count reads (menu_analyzed/bottle_logged existence + one rating-bearing-row
check); no new tables, no migration, no new event types (card impressions are
deliberately unmeasured — §11f measures the outcome instead).

**Two placement decisions for Ed:**
- When the `log-a-bottle` card is visible, hide the plain Log a Bottle module
  (recommended — one camera entry at a time, the card's is the richer teach), or
  accept the adjacent double-camera stack.
- Optional half-step: give /palate's two inert empty states their missing action
  links (e.g. "Log tonight's bottle →" to the existing `/?log=1` deep link). One
  line each, fixes the dead end at its exact location. Recommended, but it's
  /palate surface area the brief didn't explicitly book.

## The e2e fixture problem — proposal

The rich account can never show cards, and `wine_events` is append-forever (no DELETE
for anyone, including tests) — so a fixture that does a menu-analyze or bottle-log is
permanently dirtied for any event-based completion condition. Also: **`.env.local` has
no service-role key** — e2e signs in with anon key + password, so ephemeral-user
creation via admin API isn't currently possible.

**Recommended: a second permanent zero-state fixture account** (epgoodwin+e2e-fresh@),
seeded once with quiz-only (profile, zero bottles, zero menu/bottle events ever), creds
in .env.local. It stays testable forever because of one deliberate design choice above:
`rate-one` retires on interactions ONLY, so its full action→retire transition is
e2e-able and reversible (rate a rec → card retires → journal-delete through the real
UI → account back to zero interactions; the rec_rated events that accrue are never read
by that card). Coverage map:
- Fresh state shows the right cards → zero-state account (repeatable forever)
- Action retires its card, live → zero-state account, `rate-one` (repeatable forever)
- Dismissal persists across reload; cleared context shows again → zero-state account
- RICH account shows zero cards → the existing account, whose real menu_analyzed /
  bottle_logged / rating history makes this a live proof that EVENT-based completion
  retires the other two cards
- menu/bottle retirement transitions additionally pinned at the resolver unit level

**Alternative (fuller but needs a secret):** Ed adds SUPABASE_SERVICE_ROLE_KEY to
gitignored .env.local; e2e admin-creates + confirms + deletes an ephemeral user per
run, and every card's retirement is exercised end-to-end. Clean, but a powerful key
on disk and admin plumbing in the suite. The zero-state account covers the bar
without it; the key remains the upgrade path if wanted.

## Measurement — watchtower §11f (no new events)

Per-user funnel over existing wine_events, drafted at implementation into
docs/auth-watchtower.md: first `quiz_completed` → first `bottle_logged` and first
`menu_analyzed` — conversion rate and lag distribution, so the Aug 10 health report
can judge whether the 3-of-5 stall moved.

---

# Build readout (post-approval)

Ed approved Phase 0 as proposed (card set/copy/order verbatim; module yields to its
card; /palate links authorized; zero-state fixture) and added one item: the bypass
path gets the same cleanup machinery.

## Bypass-after-choose cleanup (Ed's addition)

`handleBypass` now fires the same `cleanupChooseCreatedRow` the replacement path
uses — one shared helper, one safe rule: delete only a row this sitting's choose
provably created, only while it's still an unrated `want`; every failure lingers.
Fire-and-forget from the bypass (the UI beat never waits on it). TDD: table-verdict
test 6 failed at exactly the cleanup poll before the implementation; both directions
covered (created row vanishes on bypass, seeded pre-existing want survives).

## The cards, as built

- `src/lib/firstPour.js` — the pure resolver (tableVerdict pattern), 16-test unit
  suite written first and watched fail. Teach order [rate-one, log-a-bottle,
  bring-a-list], MAX_VISIBLE_CARDS 2, completion per the approved rules, and the
  unknown-≠-empty contract: null/non-array input (a failed read) returns silence;
  an empty array (a genuinely fresh user) shows cards.
- Home: cards render in the prompt band only after the verdict read SETTLES
  (`verdictLoaded`) and no ask is due — the exact stacking rule, with no
  flash-then-vanish. Dismiss (×, 40px target) re-resolves against the stored
  inputs so the third card surfaces immediately. CTAs: rate-one scrolls to Wines
  to Try; log-a-bottle opens the real camera/gallery input; bring-a-list links
  /recommend. The plain Log a Bottle module hides while its card shows (Ed's ②).
- /palate: "Recently evolved" empty state carries "Rate a wine you know →" (/),
  "Building now" carries "Log tonight's bottle →" (/?log=1 — the deep link the
  bypass handoff already proved). Both quiet, matching "Full history →".
- Sage left-border on cards (teaching voice) vs the verdict ask's burgundy
  (timely voice) — same card furniture otherwise.

## The zero-state fixture, as built

`epgoodwin+e2e-fresh@gmail.com` (creds in .env.local as TEST_FRESH_*): created via
the project's own signUp API + the established confirm-email-via-SQL step, seeded a
quiz-only profile through the REAL quiz UI by the spec's self-healing
`ensureProfile` (the seed-test-account selections, minus every rating — bottles
stay zero forever). `freshDb()` joined `testDb()` in e2e/fixtures/test-db.ts.
Standing rule, now in CLAUDE.md: never analyze menus or log bottles as this user —
those events are append-forever and would permanently retire its cards. The
rate-one cycle (rate → retire → journal-delete → resurrect) is both the guard and
the restore.

## Verification

- Unit: 14 suites, 386 tests, all green (firstPour 16/16 new).
- e2e: full suite green — see the run record below. New coverage: fresh account
  shows exactly [rate-one, log-a-bottle] with the camera module yielded; dismissal
  is device-local, slot-yielding, reload-persistent; rating through the real UI
  retires rate-one across a reload and the journal delete honestly resurrects it;
  a due verdict ask suppresses all cards (synthesized at the network layer — no
  real pick_chosen row ever dirties the fresh ledger); blackholed wine_events
  degrades to silence; the RICH account shows zero cards.
- 375px screenshots: docs/first-pour-screens/ (home with cards, each card's
  portrait, /palate empty states with links).
- Watchtower §11f added: per-user quiz → first bottle_logged/menu_analyzed lag +
  the one-line conversion summary (baseline 2-of-5 at ship). Exclude both e2e
  accounts before reading percentages.

## Prod verification (sommeasy.wine, deployed 2e439d6)

Deploy confirmed serving the new page chunk 16s after push (chunk-grep on
`first-pour-card`). Four guards re-run against the live site with the throwaway
repo-root prod config (deleted after): **5/5 passed, 24s** —
- fresh account: exactly [rate-one, log-a-bottle] rendered, camera module yielded;
- rich account: zero cards (the self-retiring contract on its real history);
- replacing a chosen pick on prod: created row deleted, seeded pre-existing want
  survived, `replaced` in the ledger;
- bypassing after a choose on prod: created row deleted, `had_chosen` in the
  ledger, pre-existing want survived.

Post-run DB audit (SQL): rich account at its 5 seeded fixture rows, zero stray
guard rows; fresh account at exactly 0 interaction rows. wine_events untouched by
any cleanup — append-forever holds.

## Run record

- Unit: 14 suites / 386 tests green (firstPour 16 new).
- e2e: 73 passed, 5 env-gated skips, 6.5m (local, real Claude calls).
- Prod: the 4-guard pass above.
- Commits: `795f34a` (Item 0), `ec19fbc` (Phase 0 readout), `2e439d6` (the build).
