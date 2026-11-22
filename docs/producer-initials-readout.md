# Producer initials and places inside words: readout (Nov 22, 2026)

Branch `producer-initials`, from main at c11615d. Its own PR, separate from launch-prep.

## 1. What was wrong (measured on main before changing anything)

**Initials.** wineUnified writes a producer's initials one way ("G D Vajra", "A.A. Badenhorst Family Wines", "AA Badenhorst", "E. Guigal"). Lists write them every way. Neither engine normalized them, so a spelling matched only if it was the data's spelling.

87 producers carry initials: 80 dotted ("e. guigal", "j.r. dill"), 3 spaced ("g d vajra", "f x pichler", "c r graybehl"), plus "aa badenhorst" written run together. I wrote each one the ways lists do, alone and with its province, and ran it through all three paths. The table shows how many each path found:

| spelling | resolver | engine, pasted | engine, photo |
|---|---|---|---|
| "G.D." (25 two-letter producers) | 18 | 15 | 15 |
| "G. D." | 7 | 6 | 6 |
| "G D" | 12 | 3 | 3 |
| "GD" | 5 | 2 | 2 |
| "E." (62 one-letter producers) | 62 | 62 | 62 |
| "E" (the dot dropped) | 26 | **0** | **0** |

Some misses were worse than a miss: "A P Vin, California" → Cambridge California (50); "C Da Silva, Port" → Casa Silva; "G Metz" → Arthur Metz; "N Kendall" → Kendall-Jackson; "J Moss" → Mossback.

The two reported lines:
- `G.D. Vajra Langhe Rosso`: resolver: no producer, region langhe, 40. Engine: no producer.
- `A.A. Badenhorst Secateurs Chenin Blanc`: resolver: no producer, region **baden**, 60 (partial credit to Baden and Germany). Engine: nothing.

**Places inside words.** The resolver tested region and grape terms with a raw `includes`. Over 19,670 lines (every producer, alone and with its province; every region, grape and autocomplete wine; the fixture lists):
- In 284 lines a region was "stated" only inside a longer word: Baden in Badenhorst, Tejo in Alentejo, Napa in Anapamu, Irpinia in Hirpinia, Cava in Cavalli, Port in Portugal…
- In 88 lines the resolved grape sat inside a word: Rosé in Montrose/Larose/Melrose, Port in Portal/Jamesport/"Wines of Portugal", Barbera in Barberani.
- In 7 lines the resolved region did: Tavel in Tautavel, Jura in Jurançon, Fronton in Frontonnais, Port in "Portuguese".

The resolver's `insideName` had the same flaw in reverse: "asti" inside "Sebastiani" hid the Asti a line stated, so `Sebastiani Moscato, Asti` went to California at 90. The engine's own lookups were already word-bounded (0 in-word matches), but its namesake guard used the same raw test (`ownName.indexOf`) and kept Sonoma's Sebastiani on that line.

## 2. The fix: one place, both engines (`src/lib/producerAliases.js`)

- **`foldInitials(text)`**: one spelling for initials. A run of initials becomes its letters, run together: "g.d.", "g. d.", "g d" and "gd" are all "gd"; "e." is "e". An initial is a letter with a dot, or a lone letter in a run of two or more. A lone undotted letter is a word ("Badia a Coltibuono", "Isole e Olena", "Concha y Toro") and is left alone. A run may end on punctuation ("Dios Baco S.L., Jerez").
  - The resolver's `normalize()` folds, so every name and line it reads is folded.
  - The engine indexes folded producer terms and folds the text in `findProducer`.
  - The core-name alias table is built on folded names. It stays at 668 aliases; 11 change spelling only ("j. scott" → "j scott").
- **`includesWord(text, term)`**: a term as words, with no letter or digit touching either end. Hyphens and apostrophes bound a word, as they do in the engine's `termMatchesInText`. The resolver uses it in `matchRegion`, `matchVarietal` and `insideName`; the engine uses it in `isNamesake`.
  - Two places deliberately keep raw letters.
  - `namedOnlyInRegions` keeps a raw substring: "Santa Cruz Mountain" (Vineyard) is the region's letters inside "Santa Cruz Mountains", and that guard only ever withholds a producer.
  - The resolver's `statedRegions` was made word-bounded, then reverted: across 520 lines built to provoke a difference it changed nothing, so it couldn't be pinned by a test.
- **`buildProducerTwins(data)`**: one winery the data keys twice.

### The Badenhorst decision: one producer

"AA Badenhorst" (estate `aa_badenhorst`, 1 review) and "A.A. Badenhorst Family Wines" (`a_a_badenhorst_family_wines`, 7 reviews) are one Swartland winery with two estate ids. Left split, a diner's bottles count toward two estates and neither reaches the 4 points that promote. Both now resolve to the full name, in both engines, under either spelling.

The rule is general, not a special case. Two producerLookup keys are one winery when all of these hold:
- they are the same name once initials fold and trailing designators (and "family") go;
- they sit in the same region;
- **each** carries an estate of its own.

The canonical twin is the one with more reviews, then the longer name. Measured over all of wineUnified, the rule pairs exactly six wineries, all checked by hand:

| gives way | canonical |
|---|---|
| aa badenhorst (1) | a.a. badenhorst family wines (7) |
| cedarville (7) | cedarville vineyard (29) |
| chalone (7) | chalone vineyard (13) |
| chatom (3) | chatom vineyards (13) |
| clendenen family (6) | clendenen (8) |
| forrest estate (3) | forrest (8) |

Before this, the two engines even disagreed on these lines: "Cedarville Vineyard" gave estate `cedarville` in the resolver and `cedarville_vineyard` in the engine.

Not merged: the pairs with ONE estate between them (Hamilton Russell / Hamilton Russell Vineyards, Rust en Vrede, Le Riche, De Wetshof, Le Bonheur, Ernie Els…). Nothing is split there, but the long name resolves to a key with **no** estate. "Hamilton Russell Vineyards Pinot Noir" earns no estate point. That is a pre-existing follow-up, not changed here.

### Display names (follow-up, Nov 22, 2026)

`resolved_winery` is what the wine page prints, and the resolver built it by title-casing the producerLookup key's first letter: "A.a. Badenhorst Family Wines", "Bodegas Dios Baco S.l.", "D.r. Stephens". Of the 94 initialed and twinned names, 24 were misspelled: 19 differed from the data's own estate name and 5 (no estate) showed an "X.y" slip.

A name with initials now shows as the data spells it (`lookupDisplayName` in wineResolver.js):
- with an estate, the estate's name, looked up by producerId the way `matchEngine.getProducerDisplayName` does;
- without one, the key with each word and each initial capitalized ("B.R. Cohn").

All 94 now match. A twin shows its canonical's name, and all six canonicals already title-cased as the data spells them, so a twin-specific rule would change nothing and was left out.

Production is unchanged by this: the one initialed production name without an estate, Nicola's "J. de Telmont", still reads "J. De Telmont", so its `j__de_telmont` dimension holds. countryAttribution goes to 91; the dnaEvolution mirror follows; 4 of 4 mutants are caught.

## 3. Corpus diffs, main → this branch

**Engine** (`scripts/scan-truth/corpus-diff.mjs`): 21,959 pasted lines: 24 read differently (15 higher, 2 lower, 7 the same score). 10,750 photographed wines: 6 read differently (2 higher, 1 lower).
- Every lower score is Clendenen Family: its quality bonus now comes from its canonical twin (0.9 → 0.6).
- The rest:
  - the six twins land on one estate;
  - nine initialed names now find their producer: G. Metz, N. Kendall, J. Scott, J. Moss, A. Cailbourdin, A. Machard de Gramont, L. Chatelain, H. Abrantes, Dios Baco S.L.;
  - "Produttori Bolzano S. Maddalena" is no longer the US producer "Maddalena".

**Resolver** (same corpus plus the autocomplete catalog, 21,936 lines): 158 resolve differently (14 higher, 102 lower confidence, 42 same); 130 move accumulation. All 158 reviewed:
- **95: a false grape removed.** Port inside Portal/Portola/Jamesport/Quinta do Portal; Rosé inside Montrose/Gruaud Larose/Melrose/Rosemont; Barbera inside Barberani; Fiano inside Fiànobile; Zinfandel inside Zinfandelic.
  - Confidence falls 90 → 85/82, or 95 → 90, all still in the full band. Each line loses only the varietal dimension it never had.
  - Exception: Corse Porto Vecchio 60 → 40, whose partial credit came from that false Port.
- **18: a false region removed.**
  - Tautavel, Jurançon and Frontonnais 40 → 0: the real appellation keys are accented and never match (resolver follow-up (a)).
  - "Portuguese Red/White" 60 → 30: Port read out of "Portuguese" was earning partial credit.
  - "Cuvee Test, Portugal" 60 → 50, now a token match to J. Portugal Ramos below the gate.
- **8: a stated region now found or its spelling changed.** "Moselland, Mosel" 85 → 90: "mosel" inside "Moselland" no longer hides the line's own Mosel.
- **Twins: 22 lines** land on the canonical estate.
- **Initials: 10 lines** find their producer. G. Metz, J. Moss and N. Kendall had been wrong producers; H. Abrantes went 60 → 85.
- **Below the gate, no accumulation either way:**
  - "jr wine" → J.R. Dill at 50;
  - "v&n; cellars", an HTML-entity key in the data, now matches itself;
  - "côtes de castillon" (Asti read inside "Castillon") 55 → 50, a junk token producer before and after;
  - "j. wilkes": its display spelling changes to "J Wilkes" (two keys, one producer id).

## 4. Tests

countryAttribution.test.js: 77 → 90, all passing.
- Mirror lock: foldInitials, includesWord and the twin table, CJS mirror against the real module, over every producer and region key.
- One behavioral case per rule:
  - every initials spelling folds to one, and a lone letter stays a word;
  - Nicola's line in all four spellings, through the resolver;
  - the same through the engine, pasted and photographed;
  - one initial with or without its dot (E Guigal);
  - initials before a comma;
  - the six-twin lock;
  - both names of a twin are one estate in both engines, including a photo's exact-key field;
  - a region as words (Badenhorst is not Baden; "Badenhorst Chenin Blanc" 60 → 30);
  - a grape as words (Montrose, Barberani);
  - insideName as words (`Sebastiani Moscato, Asti` 90 → 55, conflict-capped);
  - the engine's namesake guard as words.
- A mirror-section case for initials and twins.

The mirrors updated: `helpers/producerAliasesMirror.js`, and the resolver/engine mirrors in both countryAttribution.test.js and dnaEvolution.test.js (98/98).

Mutation check: 22 of 22 caught. Each rule was broken in turn in the real source, then the suite was run and the source restored:
- each foldInitials rule;
- aliases unfolded;
- each twin condition and the canonical choice;
- includesWord as a substring, and hyphen-joining;
- engine text, terms, twin name, photo exact field, and namesake;
- resolver normalize, the twin redirect, the twin estate taken from the merged entry instead of the data (the Chalone bug caught while building), the canonical entry left unset, and region / grape / insideName as substrings.

All 36 unit suites pass, scanTruth's photo/paste parity over 8,778 producers included.

## 5. Production (read-only)

All 49 `wine_interactions` rows (26 rated, 7 accounts) were re-resolved under main's resolver and this branch's. **Exactly one row moves**: Nicola's `G.D. Vajra Langhe Rosso` (liked, id 1aec65f2-…).

| | before | after |
|---|---|---|
| resolved_winery | null | G D Vajra |
| resolved_region | langhe | langhe |
| resolved_province | null | Piedmont |
| resolved_country | Italy | Italy |
| match_confidence | 40 (no accumulation) | 90 (full band) |
| dna_accumulation country/italy | 0 pts, 0 bottles (quiz, promoted) | 1, 1 |
| dna_accumulation region/piedmont | none | 1, 1 (auto) |
| dna_accumulation estate/g_d_vajra | none | 1, 1 (auto) |
| dna_timeline | 0 rows | 0 rows |

- No threshold is crossed, so the live path would have written no event either.
- `composeIdentity` over her evidence gives the same title, epithet and genome before and after.

One pre-existing observation, unrelated to this fix: her stored title is "The Stellenbosch Loyalist", while today's evidence composes "The Constantia Loyalist". Her strand last recomposed at 5 rated bottles and recomposes itself at 10. Nothing here touches it.

The re-credit is prepared in `docs/producer-initials-recredit.sql`, guarded on the measured state, and **not applied**. It waits for Ed's OK, after this PR is deployed.

Unaffected and worth naming: "J. de Telmont Grande Réserve" (Nicola, loved) resolves identically. Its unmappable estate dimension `j__de_telmont` is unchanged, because the winery display name still comes from the unfolded key.
