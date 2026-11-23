# Canary fixes — readout (Nov 23, 2026, branch `canary-fixes`)

Ed's acceptance canary passed in production on Nov 23, 2026: quiz, signup
carry, email confirmation and fold-in; two loved Domaine Dujac bottles and
the estate promotion; three more loved Burgundies, a region promotion and a
shift to "The Burgundy Archivist" with the retitle, the bloom growing and the
narrative rewritten; Delete account removed every row. It surfaced four
problems. This branch fixes all four and records the launch in CLAUDE.md.

## 1. Log a bottle saves in a handful of round trips

**What was slow.** One promoting save on the canary account made ~25
Supabase calls, each waiting on the one before: the previous-rating read,
the upsert, the resolved_* stamp, then per dimension a read and a write,
then per dimension a promotion read, two roll-up reads, per dimension a
demotion read, the promotion's profile read, flag, timeline row and profile
write, the hook's profile read, rated count and accumulation read, the
strand's swap and shifted row, the specific_wines write and a final profile
read. At 100–300ms each that is the 9–26s.

**What changed — the client's own calls, parallelized and batched. No
database function.**

| Step | Before | After |
|---|---|---|
| Accumulation | read + write per dimension, sequential | ONE read of the user's rows (beside the stamp and the profile's DNA), then every dimension's write at once |
| Promotion / roll-up / demotion checks | a read per dimension, two roll-up reads, a read per dimension again | judged from the read, as the writes left it — no requests |
| Applying a promotion | profile read, then flag, timeline, profile write in turn | profile already read; flag, timeline row and profile write together (a call's timeline rows still go one after another, so their order holds) |
| The milestone hook | profile, count, accumulation in turn | the three together |
| Log's tail | specific_wines write + a profile read | neither: the hook hands back the genome it stored (read back only when it stored none) |

Measured on the test mock at 30ms a request, a promoting rating: **27 round
trips / 23 requests → 4 / 10** (dnaEvolution 14B). In the browser, the real
Dujac promotion through /log with every Supabase request held to 150ms:
**2.25 seconds from the tap to the saved step, 17 requests** (this machine's
own round trip to Supabase measured 158ms, so nothing was padded). The
sequence: the rating's read, upsert and stamp; the profile and accumulation
reads; four dimension writes; the promotion's profile write and timeline row;
the hook's count, profile and accumulation reads; the swap; the shifted row;
the bottle_logged event. identity-shift.spec's new speed guard fails it over
3s or over 20 requests.

Every rating surface shares the engine, so /recommend, home's From last
night and the wine page get the same speed; the delete path too.

**What is written is unchanged.** dnaEvolution Suite 14 holds the new engine
to the module as it shipped at a911ffc (checked in verbatim as a fixture):
four seeded 600-step walks of rates, re-rates and deletes reach 559
promotions, region and country roll-ups, 469 demotions and 238 deletes, and
the accumulation, the timeline (in order), the profile and the returned
moments are identical after every step. One deliberate difference, on a
failure path: an accumulation read that FAILS now throws before anything is
written (the old engine took it for "no rows" and inserted duplicates). Every
caller already catches it as non-blocking, as it did any engine error.
Mutation check: 4 of 5 caught; the fifth (a new row left out of the Map) is
equivalent while every promotion threshold exceeds one bottle's points.

## 2. "Wines you named" tells the truth

**The finding.** LogBottle added loved and liked bottles to
`wine_profiles.specific_wines` (and removed a not-for-me one); /recommend,
home and the wine page never did. Your palate shows every specific wine as
"from your quiz".

**The decision: no surface adds to specific_wines.** It is the quiz's
"Wines you named" again. Why not "every surface"? It would put four more
profile writes on four rating paths (the slow part of item 1), and a second
copy of the journal's verdicts that has to be kept in step on re-rate and
delete — which Log never did on delete, so a deleted bottle stayed "named".
The journal is already the record of what was rated.

**What the match engine gained, kept — and made equal across surfaces.** A
named wine earns the weight-10 "favorite" match when a list line contains
its name. That boost now comes from the journal: `buildFeedbackSignals`
collects `favoredWineNames` (loved/liked `had` rows) and
`matchWinesAgainstDNA` adds them to the quiz's named wines. A bottle loved
on /recommend now gets the boost it never did; a name the quiz already lists
isn't counted twice; a not-for-me on the same name still removes it. The
Somm already heard loved bottles through its feedback block, so its payload
loses nothing. The pick-lock fixture (1,496 combinations) is unchanged.

**What the page says.** Your palate reads the journal's verdicts beside its
other reads, and each named wine shows its verdict ("Loved it") when the
journal holds one, "from your quiz" when it doesn't, and nothing when the
journal couldn't be read.

**Existing rows — proposed, not run.** Read-only audit: 29 named wines on 5
accounts; 10 match a loved/liked journal row; 5 of those are also named by a
`bottle_logged` event (2 accounts). `docs/canary-specific-wines-cleanup.sql`
holds a preview and a commented UPDATE that removes exactly those 5. A wine
the quiz also named looks the same, so review the preview first. It moves no
points, no timeline, no title; the next recompose reads the shorter list
silently. Until it runs, a logged copy shows its verdict, and a logged copy
whose journal row was deleted still reads "from your quiz".

Side effect to know: a not-for-me logged on a quiz-named wine no longer
removes it from the list (the engine still suppresses it in matching).

## 3. Hyphenated places on pasted lists

"Domaine Jamet Côte-Rôtie 2018...$140" scored 0: the data keys "côte rôtie"
with a space (and "crozes-hermitage" with a hyphen); the photo reader already
tried both, the pasted reader only the data's. `addSeparatorSpellings` now
indexes every multi-word region and grape term all-spaces and all-hyphens, in
the terms both readers' `find*` helpers scan (same length, so the
longest-first order holds). Mirror updated; its lock now reads ~2,500
spellings including the swapped ones and fails without the rule. The line
now reads Rhône Valley, France.

**Corpus diff.** Against main's engine, the standard corpus changed 1 of
21,959 pasted lines — it is built from the data's own spellings, so it barely
exercised the fix. `corpus-diff.mjs` now adds both joins of every region,
grape and province. With them: pasted 26,182 lines, 1,490 read differently —
1,445 higher, **18 lower, all reviewed**, 27 same score; photographed 11,723,
42 differ, none lower.

- The 18 lower are all corrections: an all-hyphen spelling of a place was
  read as a foreign namesake producer inside it — US "Della" in
  coste-della-sesia / alta-valle-della-greve / san-martino-della-battaglia,
  Israel's "Carmel" in carmel-valley, Spain's "Arroyo" in arroyo-seco and
  arroyo-grande-valley, Israel's "Alexander" in alexander-valley, New
  Zealand's "Escarpment" in niagara-escarpment, Australia's "Petaluma" in
  petaluma-gap (each bare and after "Cuvee Test"). Now the place is read and
  the namesake guard drops the producer.
- The 27 same-score changes read better: "Château du Port, Southwest-France"
  no longer reads Portugal; "Concha y Toro, Casablanca-Valley" no longer reads
  Spain's Toro; "venezia-giulia" reads Friuli-Venezia Giulia, not Veneto.
- Higher: hyphenated and spaced appellations that read nothing before
  ("cote-rotie", "eden-valley", "saint joseph", "clos-de-lambrays", "dolcetto
  di diano d'alba" with its hyphens).

**Not fixed here:** the resolver (what a rating accumulates) reads "Domaine
Jamet Côte-Rôtie 2018" as nothing in any spelling — its accented-key gap
(CLAUDE.md Priorities 3(a)). Jamet isn't a producer in the data, so the line
would sit at the region-only 40 and accumulate nothing anyway.

## 4. Estate particles

`estateName` (houseCopy.js) shows "Domaine De La Vougeraie" as "Domaine de
la Vougeraie" in Your DNA, Building now and Recently evolved (and the
journal's Timeline, which shares the line). Particles are lowercase inside a
name, never first or last ("Scala Dei"); an article only after a Romance
preposition ("Château La Nerthe", "Winery at La Grange" keep theirs); an
elision may close a name ("Château d'Yquem"); "Van" and "Sur" (Spanish for
south — "Cono Sur") are left alone. Display only. Over the 10,060 estate and
winery names the app can show, 1,117 change, every one a mid-name particle.
Known miss: Italian family names that keep a capital ("Marchesi De
Gregorio", "Cantine De Falco") now read "de".

## 5. CLAUDE.md

The canary, the legal pages (PR #41), the restored backup and Google sign-in
are recorded under Current State; the canary is off Priorities; item 1 of
Priorities lists what this PR leaves open.

## Tests

All 37 unit suites pass. New or grown: dnaEvolution 102 (Suite 14),
curatePicks 54, palateView 13, houseCopy 72, scanTruth 37, countryAttribution
91 (wider lock). e2e on the 13 specs this touches (identity-shift with its new speed guard,
log-bottle, palate, wine-page, evidence-ledger, table-verdict, first-pour,
search, match-picks, raw-ids, quiz-completion, wine-events, motion): 89
passed, 0 failed. The full suite was not run. `npm run build` passes.

## For Ed

1. The specific_wines cleanup (`docs/canary-specific-wines-cleanup.sql`) —
   your yes before the UPDATE runs.
2. The "every surface gets the favorite boost" consequence: a bottle loved on
   /recommend now earns +10 when it appears on a list.
3. Italian family-name particles ("Marchesi de Gregorio").
