# "Chosen for your palate" follows the palate — readout

Branch `palate-recs`, Nov 23, 2026. One PR.

## 1. What was wrong

`profileEngine` built `wine_profiles.recommendations` once, at the quiz, from
the curated list (60 wines), in four passes: region + grape, grape, region,
country. Nothing rebuilt it. Ratings moved the DNA, the title and the bloom,
but never the list. In the Nov 23 production canary, a Rhône quiz (France,
Rhône Valley, Syrah) plus five loved Burgundies became "The Burgundy
Archivist", and home still led with the quiz's list. The four passes
reproduce it exactly:

| | Home's first four |
|---|---|
| Before (shipped) | Jean-Louis Chave, Hermitage · Torbreck RunRig · Château Rayas · Domaine Weinbach (the Alsace discovery) |
| Now, same quiz, no ratings | Chave · Rayas · Vieux Télégraphe · Henschke Hill of Grace |
| Now, after the five Burgundies | **Domaine Dujac** · **Domaine Roulot** · Chave · Rayas |

(The "after" row uses the evidence the real engine writes for the five
bottles. Burgundy labels rarely name the grape, so the bottles add points to
Burgundy, France and their estates but not to Pinot Noir. Dujac's tag
therefore reads "Region match".)

## 2. What changed

**Computed when read, not stored.** I chose to compute on read. Nothing on a
rating's path changes, so there's no stale write to guard against and no
compare-and-swap to get wrong. Each reader already loads the palate, and the
ranking costs at most one extra read, sent at load beside the reads the page
already makes.

- `src/lib/wineRecs.js`: the curated list, moved out of profileEngine. It
  has the same 60 wines, the same words and the same order. Each wine now
  also carries facts the palate can match: `regions`, `varietals`,
  `country`, and `estates` (producer ids as a rating of the bottle would
  record them). Before, a wine was only reachable through the quiz pass that
  listed it. Discovery picks carry their country alone, because their words
  promise a place the palate hasn't been.
- `src/lib/palateRecs.js`: the ranking. It is pure, and imports only the
  list, so readers don't pull in the 2.9MB wine data.
  - **Affinity.** For every country, region, estate and grape, affinity =
    4 if it is in the DNA (the quiz's picks plus what ratings promoted;
    promotions write the same columns) + its `dna_accumulation.points`.
    Loved is +2, liked +1, "not for me" −1. A quiz pick is worth two loved
    bottles, the same bar an estate promotion pays.
  - **Score.** A wine's score is a weighted sum of its best affinity in each
    dimension: estate ×6, region ×4, grape ×4, country ×1. When nothing in a
    dimension is liked, the worst affinity counts instead, so a blend with a
    disliked grape still pays for it.
  - **Order.** Wines above zero are listed, best first, 20 at most. Ties
    keep the curated order.
  - **Why the country is faint.** Every rating writes country points beside
    its region points. At full weight, five loved Burgundies lifted every
    French wine, Bordeaux included, over the Syrah the quiz named.
- `src/lib/palateRecsRead.js`: the one read (`dimension, dimension_value,
  points`). A failed read returns null and never rejects.
- **Home** reads it beside its whisper, verdict and journal reads, and the
  layout waits for all of them, so the section never pops in late. The
  established list, the new-user layout's two picks and its two Reserved
  rows are one `WineRecList` over one ranked list. If the points can't be
  read, the section stays out: a list ranked on half the evidence would be a
  guess.
- **Search** already read `dna_accumulation`; it now asks for `points` too
  and ranks from the profile it reads. A failed read was already the page's
  "couldn't open".
- **The wine page** adds the read to its existing four-way `Promise.all`.
  Same-vein rows come from the ranked list. If the points can't be read, the
  same vein comes from the journal alone. A curated wine always opens with
  its own words ("known"), so a rec opened from home never reads "not found".
  The match tag only shows when the palate ranks the wine.
- **The quiz** (`profileEngine`) stores the ranker's output. `saveQuizProfile`
  adds `points` to the accumulation read it already makes, so the reveal's
  list carries what ratings proved. The anonymous teaser ranks the quiz
  alone.

**Unchanged:**
- Rows already acted on are still filtered by WineRecList's interactions
  read, snapshotted once per load, so nothing reorders under the user's
  finger mid-visit.
- A failed interactions read still shows nothing.
- Ratings write exactly what they wrote. There are no timeline rows, toasts
  or celebrations for a reorder.
- The stored `recommendations` column is still written at quiz save and
  still read by the reveal. Home, Search and the wine page no longer read it.

## 3. Tests

`src/lib/__tests__/palateRecs.test.js`: 25 tests, all on the real modules.

- **The canary** is built bottle by bottle through the real `bottleEvidence`
  (resolver, confidence gates, points tables) and the real promotion
  thresholds. The premise is checked first: Burgundy and Dujac promote, as
  they did in production. Then: before the ratings Chave leads. After them
  the top two are Dujac and Roulot, every Burgundy sits ahead of every other
  wine, Chave stays on the list below them, a quiz Syrah outranks a
  country-only Bordeaux, and with Dujac's bottle in the journal Roulot
  leads.
- **The rules:**
  - one loved bottle moves the list before anything promotes;
  - points alone bring wines on;
  - a loved estate rises to the top;
  - one "not for me" Syrah drops it below a Pinot, and six take the Syrahs
    off the list;
  - a disliked Burgundy pulls Roulot down, then off;
  - a blend counts its best grape, or its worst;
  - a quiz pick equals two loved bottles;
  - the matchType labels;
  - over 400 seeded quiz palates, every wine the old four passes listed is
    still listed, and the old pass 1 (region and grape) still leads every
    country-only match. The old passes are kept verbatim in the test as the
    oracle.
- **Shape and junk:** named wines stay off; a bottle listed under two passes
  appears once; the limit and the stored shape `{ wine, why, matchType }`;
  junk never throws.
- **The read:** one query with its columns; error, no data, rejection, a
  throwing client, no user and no profile each give null.
- **Source scans:**
  - home, Search and the wine page rank on read and never read the stored
    list;
  - `dnaEvolution`, `identityRecompose`, `growthMoment`, `WineRecList` and
    `LogBottle` contain no ranking or recommendations write (code only,
    comments ignored);
  - the ranking imports only the list.
- **The data:** every region, grape, country and estate id exists in
  wineUnified; every region sits in its wine's country; wherever the
  resolver is sure (80 or above), the estate it records for the rec's own
  name is the one the rec carries, so loving that bottle lifts it.
- **Mutation-checked: 11 mutants, 10 caught.** Caught: points ignored,
  negatives ignored, a quiz pick worth one bottle, country at full weight,
  zero scores listed, named wines kept, duplicates kept, a wrong matchType
  order, a failed read that guesses, and home reading the stored list. The
  survivor, a separate tier tie-break, was redundant with list order and is
  removed.

Unit suites: all 38 pass (palateRecs 25 included). `next build` passes. The
e2e results are in the PR description.

## 4. Copy: yours to approve

Both lines were untrue before. No rating rewrote the list. They are still
only partly true as written: the list now re-ranks on the next load, not
mid-visit (rows never move under a tap), and an "It was fine" rating adds no
DNA points, so it moves nothing.

| Where | Old | New |
|---|---|---|
| Crest line, new-user layout | Your first list — it rewrites itself as you rate | Your first list — it follows your palate |
| Under "Your first entry" | …snap tonight’s label. One rating and the Somm rewrites this list around you. | …snap tonight’s label. Every bottle you rate shapes your palate, and this list follows it. |

The second line echoes the house's existing "every rating sharpens your DNA"
(home's Log a bottle). Strictly, a "fine" rating shapes nothing. If you want
it airtight: "Every bottle you love — or don't — moves this list." The
Reserved caption ("Two more selections open after your first rating.") was
already true and is unchanged. first-pour.spec asserts the new crest line.

## 5. Where the curated list is too thin (not changed: no wines added)

- **Regions:** 29 of wineUnified's 145 regions have a curated wine. Among
  the most-reviewed regions with none: Columbia Valley (8,334 reviews),
  Santa Barbara (3,750), Veneto (2,874), Paso Robles (2,516), Monterey,
  Finger Lakes, Mendocino, Sicily (only the COS discovery, which carries no
  region), Southwest France, Sierra Foothills, Alentejo, Lodi,
  Friuli-Venezia Giulia, Colchagua Valley, Virginia, Campania, Long Island,
  Maipo Valley, Uco Valley and Languedoc-Roussillon. Fourteen more regions
  have exactly one wine, including Willamette Valley, Rioja, Champagne,
  Mosel, Douro and Ribera del Duero.
- **Grapes:** 23 of 71 have a curated wine. Missing, by review count: Rosé
  (3,563), Portuguese Red (2,466), Portuguese White, Gamay (0, see below),
  Petite Sirah, Barbera, Glera/Prosecco, Port, Pinot Blanc, the Valpolicella
  blend (Corvina, Rondinella, Molinara), Carmenère, Nero d'Avola, Aglianico,
  Moscato, Verdejo, Muscadet and Garganega. One wine each: Zinfandel, Pinot
  Grigio, Cabernet Franc, Grüner Veltliner, Viognier, Albariño, Mourvèdre.
- **Countries:** none at all for Chile beyond its discovery, Israel, Greece,
  Canada, Hungary or Uruguay. Portugal has one non-discovery wine; Italy has
  five against 19,540 reviews.

What this means for users: a palate built on Washington, Santa Barbara,
Veneto, Rosé or Barbera gets nothing specific. It sees wines that share only
a country or a grape, and a list running dry quickly (the "You've reviewed
all your wines" empty state).

**Tags I left as they were, for your review** (curation, not code):
- Marcel Lapierre's Morgon is tagged Grenache, though its own words say
  Gamay. Grenache lovers get it, Gamay lovers don't.
- The Sadie Family's Columella is tagged Syrah + Chenin Blanc, though its
  words say Syrah-Mourvèdre.
- Kanonkop Paul Sauer is tagged Cabernet + Pinotage, though it's a
  Bordeaux blend with no Pinotage.
- Yalumba Virgilius sits under Barossa (Eden Valley has no region of its
  own in the data).
- Le Pin, Chave, Rayas, Montevertine, Roulot, Dunn, Littorai, Álvaro
  Palacios, Conterno, Vieux Télégraphe, Kumeu River, Dagueneau, Bedrock,
  Brokenwood, Raffault and Tempier have no estate in the data, so loving
  their producer can't lift them, only their place and grape.

## 6. Not done / to know

- The list re-ranks on the next load of home, Search or a wine page, never
  mid-visit. That is deliberate: rows stay where the tap left them.
- Home's layout now also waits on the points read: one more parallel read,
  under the same six-second stall guard.
- Existing `wine_profiles.recommendations` rows were not rewritten. Nothing
  reads them on home, Search or the wine page, and each account's next quiz
  save rewrites its own.
- An estate-only match (a quiz-picked estate whose region and grape aren't
  in the DNA) is labeled "Discovery". I added no "Estate match" label: that
  would be new copy.
