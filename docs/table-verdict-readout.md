# The Table Verdict — Readout (Aug 3, 2026)

Item 2 of the Aug 3 outside-feedback triage, from our most active real
user: *"need to be able to log if you selected one of the recommended wines
and, if so, what you thought of it. As well as something like 'went with a
different option.'"* Before this session, a diner who ignored every pick
was indistinguishable from one who loved a pick and never said so. Every
Somm curation now resolves to a diner verdict: **chosen(+rated),
chosen(unrated), bypassed, or silent** — and silence finally means silence.

## Phase 0 findings (what the investigation established)

**1. Pick-card interactions on /recommend.** Exactly one existed: "Had this
wine? Rate it" → 4-option modal → `handleRatePick`, which upserts
`wine_interactions` (`had` + rating + `source_url`; `somm_note`/
`somm_pick_role` only for a *current* pick; `occasion` = steer), runs
`resolveAndAccumulate` with the `previousRating` differential, writes a
`pick_rated` event, and lets the milestone hook recompose. Want/skip are
WineRecList affordances (home/reveal), not /recommend.

**2. Session persistence: nothing survives.** `picks`, `sommNotes`,
`steer`, `pickRatings`, `extractedFrom` are all `useState` — no storage of
any kind. Any reload, iOS tab eviction (routine across a 2-hour dinner), or
navigation destroys the entire pick context, including the somm note that
would have traveled into the journal. The analyze-at-7 / order-at-7:15 /
rate-at-9 moment **cannot** lean on client state — this finding drove the
whole design: durable at declaration time, resolved from durable state.

**3. Event catalog.** The `wine_events` CHECK held the 11 v1 types.
Decision: **two new types via migration 011** (`pick_chosen`,
`somm_bypassed`) — the smallest honest catalog addition. Not payload
overloading: `menu_analyzed.somm.outcome` is the *curation* outcome,
written minutes after analysis; the diner verdict arrives hours later and
appending it there would need UPDATE, which append-forever bans.
`wine_wanted` is wishlist intent, a different thing than "ordered tonight".

## What shipped

### The declaration — "🥂 This one's on the table"
A per-pick button on every /recommend pick card (thumb-reachable, full
width, ≥40px). One chosen pick per curation session, changeable — choosing
another card moves the burgundy "🥂 On the table tonight" banner
(unmistakable: filled gradient, the only filled element on a card).
Choosing writes:

- **`pick_chosen`** (fire-and-forget): wine, role, price, steer (trimmed/
  capped 200 — the shared cap), `session`, `replaced` (the previously
  chosen wine when the table changed its mind — append-only history).
- **A journal wishlist row** (`wine_interactions` upsert, `want`, no
  rating) carrying `somm_note`/`somm_pick_role`/`occasion` — this is how
  the note survives the 7pm→9pm gap. An existing `had` row keeps its type
  (re-ordering a rated wine never demotes it to the wishlist); the upsert
  never sends nulls, so nothing is erased.
- **Never DNA.** Choosing is intent, not evidence (standing decision);
  rating remains the only gate. The e2e guard pins this against the
  chenin_blanc earned fixture, which sits at exactly its promotion
  threshold — any leak would corrupt it visibly.

### The funnel — chosen → rated
Home (the ONE surface — never /recommend too) shows one quiet ask below the
hero: *"🥂 The table verdict — You ordered ⟨wine⟩ — how was it?"* with
[Rate it] / [Skip]. The new pure module **`src/lib/tableVerdict.js`**
resolves it from the user's own recent `wine_events` (a UI read of usage
history — the DNA/identity engines still never read the ledger):

- **Latest table moment wins**: the most recent valid `pick_chosen` asks; a
  bypass at-or-after it supersedes; append-only history never resurrects.
- **Rating is the only resolver**: any rating-family event
  (pick_rated/rec_rated/journal_rerated/bottle_logged) for the same wine
  (case/whitespace-insensitive) at-or-after the choice.
- **14-day expiry** (`VERDICT_WINDOW_DAYS`) and device-local dismissals
  (capped localStorage) — never a nag.
- **Any failure → silence**: the wine-events blackhole guard drives home
  with the table unreachable, and home must not care.

Rating through the ask reuses the ONE `RatingModal` (now exported from
WineRecList) and runs the standard path end to end: upsert → 
`resolveAndAccumulate` → milestone recompose → toasts. The event is
`pick_rated` with surface `verdict_prompt`, carrying the choice's `session`.
The somm note/role/steer are already on the row from choose time and no
rate surface touches those columns — so they land in the journal no matter
where the rating eventually happens (home ask, journal "Tried it!", or the
table).

### The walk-away — "We went a different way tonight"
A quiet underlined text button after the picks list (session-level, not
competing with the cards). Writes **`somm_bypassed`** (session, steer,
picks_shown, had_chosen — a bypass supersedes a choice), then a Somm-voice
confirmation: *"Fair enough — the table calls it. Log what you drank and
your palate still gets the night."* with **[📸 Log what you drank]**
(→ `/?log=1`, which opens home's bottle-camera step ready to tap — the
picker itself needs a user gesture) and one-tap **[Skip]**. A rogue night
feeds DNA through the normal tasted-evidence path, and the ledger records
what beat the picks.

### The session thread
A client-minted `session` id (per table sitting; re-minted on Scan Again)
now rides `menu_analyzed`, `pick_chosen`, `somm_bypassed`, and `pick_rated`
payloads — additive fields only, so no existing consumer changes. It exists
for exactly one reader: **watchtower §11e**, the new somm conversion funnel
query (curations → chosen → rated, bypass rate) — the weekly health report
can now state the Somm's hit rate.

## Event-catalog decision (as landed)

Migration **011** (`011_table_verdict_events.sql`, applied to prod) amends
ONLY the type CHECK: 11 → 13 types. The append-forever contract is
untouched and re-verified in prod: RLS enabled, exactly two policies
(INSERT own rows, SELECT own rows), **no UPDATE, no DELETE, for anyone
including tests**.

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/011_table_verdict_events.sql` | new — CHECK 11→13 types |
| `src/lib/wineEvents.js` | catalog + `pickChosenPayload`/`sommBypassedPayload` |
| `src/lib/tableVerdict.js` | new — the pure verdict resolver + dismissal store |
| `src/app/recommend/page.js` | choose + bypass UI/handlers, session id, session on menu_analyzed/pick_rated |
| `src/app/page.js` | verdict ask card + rate/dismiss handlers, `/?log=1`, camera-copy fix |
| `src/components/WineRecList.js` | `RatingModal` exported (still the ONE modal) |
| `docs/auth-watchtower.md` | §11e somm conversion funnel |
| `e2e/table-verdict.spec.ts` | new — 4 serial hard-fail guards |
| `src/lib/__tests__/wineEvents.test.js` | 20→26 tests (catalog + builders) |
| `src/lib/__tests__/tableVerdict.test.js` | new — 17 tests |

## Verification

TDD throughout — every module change started from a watched-failing test
(the UI cycle's RED was the new e2e spec failing on the missing
`choose-pick` testid; the first GREEN attempt caught the un-migrated prod
CHECK rejecting `pick_chosen`, which is exactly the class of silent failure
the fire-and-forget contract hides — the delta assertion surfaced it).

- **Unit: 13 suites, 370 tests, all green** — dnaEvolution 75,
  countryAttribution 22, sommPicks 30, sommRoute 5, authFlow 56,
  authRoutes 21, pendingPalate 26, identityVoice 21, palateMark 15,
  ssrfGuard 48, captcha 8, wineEvents 26, tableVerdict 17.
- **e2e: full suite green** — 65 specs (61 + the 4 new table-verdict
  guards), serialized against the dedicated test account only.
- **Prod (e2e account, real UI):** analyze → choose → `pick_chosen` visible
  in wine_events with session + role; home ask → "It was fine" →
  `pick_rated` (surface `verdict_prompt`, session carried) + the wishlist
  row became `had:fine` with the ask staying resolved across a reload;
  bypass → `somm_bypassed` visible (fresh session id) + `/?log=1` opened
  the camera step; journal delete → `journal_deleted` (points_reversed
  false) and the account restored to baseline (chenin fixture unmoved at
  6 points, identity fields restored).
- **Migration:** applied to prod project `zugunlctgpytgyxftllv`; RLS
  re-verified by query (two policies exactly, no UPDATE/DELETE).

## Non-goals honored
No onboarding cards (item 3). No new dependencies. No matchEngine /
DNA-semantics changes (Suite 9 untouched — dnaEvolution 75/75). No somm
prompt or validation changes (sommRoute 5/5, sommPicks 30/30). No CRM.
