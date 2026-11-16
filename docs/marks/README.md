# Handoff: House & Hand (the emoji leave)

## 1. Overview

Sommeasy's look, motion and voice have moved on; the emoji have not. This work replaces them with one mark language in two hands:

- **The house prints.** Type, plus a small set of hairline objects: the wine glass and six tools.
- **You pencil.** Anything the user did is a burgundy pencil mark: the wine shaded into the glass, a star, a circle, an underline, a strike.

Country flags are the one exception and stay as emoji.

No engine, ledger, schema or API changes. The rating path, `wine_events`, the identity strand and the Somm's route are untouched. What changes is what a mark *is*: today it is a character inside a string; after this it is a named mark rendered beside plain words.

## 2. How to use this package

1. This folder lives in the repo as `docs/marks/` (this README plus `design/`).
2. The branch is `marks`, cut from `loose-ends` on Nov 15, 2026 (so it carries `loose-ends` and `sparkling-words` until they reach `main`). Nothing merges until Ed has walked the preview after the last session.
3. Start each Claude Code session with:

> Read CLAUDE.md, then docs/marks/README.md. We're building House & Hand on the `marks` branch, one session per run. Do Session N now. The decisions in §3 are final, so don't re-ask them. Anything marked "for Ed's review": build it as written and list it in your session summary. End with the summary CLAUDE.md asks for, plus what I should check on the preview deploy.

### 2.1 The design files

- `design/marks.js` is the mark set as a pure module: every path, the shading stroke by stroke, and a `renderMark(id)`. **The paths are exact. Copy the values; do not redraw them.** It loads in plain node.
- `design/index.html` is the reference Ed approved on Nov 15, 2026: the mark set, the marks in place, the labels/tools/flags table, a phone journal and a tappable rating. Open it in a browser. It is a reference for look and motion, not production code. Its wines, prices and notes are sample content.

Where the design files and this README disagree, the README wins.

## 3. Decisions (Ed, Nov 13–15 2026): final

| # | Question | Decision |
|---|---|---|
| H1 | The system | **House & Hand.** Printed objects and type for the house; pencil for the user. |
| H2 | Ratings | **The printed glass, shaded in pencil**: full (loved), half (liked), a sip (fine), turned down (not for me). A verdict pending is the empty glass. |
| H3 | When the shading is drawn | **Only when you rate**: on the tile you tap and on that rating's done line. Everywhere else the glass arrives already shaded. |
| H4 | The user's other marks | **Pencil**: a star for a want, a circle round the pick on the table, an underline under a loved name, a strike through a pass. |
| H5 | Moments | **Pencil, as a proofreader's marks**: + joined, − left, → became, • began. The big moment has no icon; the bloom is the picture. |
| H6 | Pick roles and match tags | **Type only.** No icon. |
| H7 | The Somm | **A hanging quotation mark, only on "The Somm says."** Everywhere else the Somm is type. No tastevin, no icon. |
| H8 | Tools | **Six printed tools**: list, camera, bottle, picture, link, loupe. The bottle takes over "Log a bottle"; the camera only ever means a photograph. |
| H9 | Flags | **Stay as emoji.** The only emoji left in the app. |

## 4. Ground rules from CLAUDE.md that this work touches

- **No new dependencies.** Inline SVG, CSS and the Web Animations API only. No icon library, no icon font.
- **One rating vocabulary.** `src/lib/ratings.js` stays THE list; `houseList.test.js`'s source scan still holds.
- **One rating path.** A mark changes how a rating *looks*, never `saveInteraction` → `resolveAndAccumulate` → `maybeRecomposeIdentity` → `recordEvent`.
- **All data-dependent copy stays in `houseCopy.js`.**
- **Motion values live in `motion.js`** and nowhere else; only opacity, transform and clip-path animate (plus `stroke-dashoffset`, added here: see §7).
- **Reduced motion:** every mark is its settled drawing in the same commit as its cause. e2e runs under reduced motion.
- **Tap targets ≥ 40px.** A mark never shrinks a hit area.
- **Keep every permanent guard.** Selectors, button names and expected strings change with the copy; assertions do not.
- **e2e runs only against the test accounts.**

## 5. The mark language

- **Printed marks** are hairline (1.3 on a 24 grid), `stroke="currentColor"`: ink on cream, cream inside a filled burgundy circle, burgundy inside an outline circle.
- **Pencil marks** are burgundy, one weight (1.6), round caps. The shading in the glass is finer (0.62).
- **The pencil is only ever the user's.** The house never picks it up: no pencil on a pick role, a tool, a Somm line or an empty state.
- **A mark never stands alone.** Every mark is `aria-hidden` and sits beside words that say the same thing. The words are the accessible name. The one place a mark is the whole control is the rating tile, which already carries `aria-label` and `title`.
- **✦ ‹ › → ✓ × · stay.** They are type.

## 6. The module and the primitives (Session 1)

**`src/components/house/marks.js`**: port `design/marks.js`. Pure and dependency-free, as `palateMark.js` is. It is the one copy of every path; `marks.test.js` source-scans that no other file under `src/` declares a mark's path data.

Build beside it, one file each:

- **`Mark`**: `<Mark id="star" size={20} />`. Renders the settled mark, `aria-hidden`, `data-mark={id}`. An unknown id renders nothing.
- **`PencilGlass`**: the glass for a rating id. Props: `rating`, `size`, `draw` (false: settled; `"tile"` or `"line"`: pencilled in, §7), `guide` (the faint shading a tile shows at rest). Renders each shading stroke as its own `<path>` so strokes can be drawn in turn. At rest its markup equals `Mark`'s for the same rating.
- **`NameGesture`**: wraps a name and draws `circle`, `underline` or `strike` over it. An absolutely positioned `<svg>` with `preserveAspectRatio="none"` and `vector-effect="non-scaling-stroke"`, `aria-hidden`, pointer-events none. The wrapped text and its DOM are unchanged. For a name that wraps, the underline and the strike are drawn on **every line**, one stroke per line box (`getClientRects()`), each sized to its own line (§13.1). The circle goes round the whole block, stretched, on one line or several.

Also in Session 1: `/marks-specimen`, an unlinked page showing every mark and primitive for the preview. It is deleted in Session 3.

## 7. Penciling (motion)

Add to `motion.js`:

| Token | Value | Use |
|---|---|---|
| `PENCIL.surfaceMs` | 360 | The wine's surface line (stroke 0) |
| `PENCIL.strokeMs` | 200 | One hatching stroke |
| `PENCIL.stepMs` | 85 | Gap between hatching strokes |
| `PENCIL.guide` | 0.22 | Opacity of a tile's resting guide |
| `PENCIL.gestureMs` | 800 | A circle, underline or strike, `SOFT_OUT` |
| `PENCIL.flipMs` | 600 | The glass turning over, `SOFT_OUT` |

- **A stroke is drawn** with `pathLength="1"`, `stroke-dasharray: 1` and `stroke-dashoffset` from 1 to 0, filling backwards. **One `<path>` per stroke.** A single path holding every stroke does not work: each subpath is dashed on its own, so they all appear together at the end. That was the bug in the first study.
- **Order:** surface line, then the hatching in array order. The strokes already alternate direction, so it reads as a hand shading back and forth.
- **`draw="line"`** uses the table as written: the hatching starts as the surface line ends, so a full glass is finished at about 1.5s.
- **`draw="tile"`** must finish inside the press hold. Keep `surfaceMs` at 140 and `strokeMs` at 90, and derive the step so the last stroke ends 20ms before `PRESS.holdMs`. Do not lengthen the hold.
- **"Not for me" draws nothing.** On its tile the glass turns over: the SVG rotates from −180° to none over `flipMs`.
- **Gestures** are revealed with a `clip-path` wipe from the left. Do not dash them: dash lengths and a non-scaling stroke do not agree across browsers.
- **Where it plays (H3):** the tapped tile; that rating's done line or Log's saved-step eyebrow, once; a `NameGesture` at the moment the user makes it (choosing a pick, a want, a pass). **Nowhere else.** Journal rows, pick flags, search results and a wine's page arrive settled.
- **Reduced motion:** no drawing, no flip, no wipe. Settled at once.

## 8. Every emoji in the code, and what replaces it

Audited Nov 15, 2026 on `loose-ends`: 22 emoji plus flags, about 150 uses in 25 files. Most flow from `ratings.js`, `houseCopy.js` and three component slots (`LeaderEntry mark`, `WineRow mark`, `EmptyState emoji`).

### 8.1 Your marks

| Today | Where | Becomes |
|---|---|---|
| ❤️ 👍 😐 👎 | `ratings.js`, `RatingTiles`, `RatingList` | `mark: "glass-loved"` etc. replaces `emoji`. Tiles render `PencilGlass` with its `guide`; the tapped tile draws (`draw="tile"`). |
| "❤️ Loved it — noted…" | `DoneLine`, home's reply, Log's saved eyebrow | `PencilGlass draw="line"` then the words. The mark sits outside `WriteIn`; the written text has no emoji. |
| rating emoji / 🥂 / 📌 / 👋 | `journalMark` → `WineRow mark`, Log's search, same vein | `journalMark` returns a mark id: the rating's glass, `glass-empty` for a verdict pending, `star` for a want, nothing for a pass. A passed row's name is struck (`NameGesture`). |
| "❤️ Loved it in August", "📌 On your want list" | `pickFlag` | `{ mark, text }`. |
| "Keep ❤️ Loved it" | `keepLabel`, the wine page | The text "Keep Loved it" with the glass before the label. |
| 🍷 Had it · 📌 Want it · 👋 Pass | `WineRecList`, the wine page | "Had it", "Want it", "Pass". Type; they are the house's controls, not yet your mark. |
| "📌 On your want list — we'll flag it…", "👋 Struck from your list." | `REC_DONE` | `{ mark: "star", text }` and `{ mark: null, text }`. |
| "🥂 This one's on the table", "🥂 On the table tonight", "🥂 Noted — enjoy it" | `PickEntry`, `MatchList` | Plain words. Choosing draws a `circle` round the pick's name (h3). The chosen pill keeps its place and its controls. |
| a loved bottle | journal Tried rows, Log's saved headline | Its name is underlined in pencil. |

### 8.2 Moments

| Today | Where | Becomes |
|---|---|---|
| "✨ Your palate shifted", "🧬 Your DNA just grew" | `savedCopy` eyebrow | Plain small caps. |
| "🧬 X joined your DNA", "🍂 X left your DNA" | `savedCopy` lines | `{ mark: "plus" \| "minus", text }`. |
| the headline "X just joined your DNA" | Log's saved step | `savedCopy` also returns `emphasis` (the display name); the component underlines it in pencil once the headline is written. |
| 🧬 🍂 ✨ 🎉 | `timelineLine`, `FOUNDING_LINE`, `TimelineRow` | `{ mark: "plus" \| "minus" \| "arrow" \| "dot", text, strong }`. |
| "✨ You became…", "🧬 … just joined your DNA" | `whisperLine` | Plain text. |
| "🧬 Your DNA has shifted…", "🧬 Your Wine DNA evolved…" | `shiftToastMessage`, `WineRecList` toasts | Plain text. |

### 8.3 Labels

| Today | Where | Becomes |
|---|---|---|
| 🏆 ✨ 💰 🧭 🍷 | `SOMM_ROLE_TAGS`, `PickEntry`, `WelcomeDemo` | "Top Pick", "Splurge", "Great Value", "Adventure", "Worth Trying". |
| 📍 🍇 🧭 | `matchTag` | "Region + grape", "Grape match", "Region match", "Discovery". |
| "🍷 The Somm says" | `SommSays` | A hanging “ (Playfair, burgundy, `aria-hidden`, a glyph, not an SVG) before "The Somm says". |
| "🍷 The Somm is reading", "🍷 Ask the Somm again", "🍷 Somm pick" | `ReadingView`, `MatchList`, `journalRowMeta` | Plain words. |
| 📸 🖼 🔍 📌 | Log's provenance labels, "Extracted from…", "Reading the label" | Plain words; "From your want list" keeps a `star`. |

### 8.4 Tools

| Today | Where | Becomes |
|---|---|---|
| 📋 📸 🖼 🔗 🔍 in the circle | `LeaderEntry mark` | A tool id rendered with `Mark`: cream on a filled circle, burgundy on an outline. "→" stays. Match the wine list: `list`. Photograph the list, Snap the label: `camera`. Upload a picture: `picture`. Paste a link: `link`. Search by name: `loupe`. Log a bottle: `bottle`. |
| 📋 Match a list · 📸 Log a bottle | `ServiceBar` | `list` and `bottle`. |
| 🔍 | `RunningHead`, home's masthead | `loupe`. The link, its `aria-label` and its 40px cell are unchanged. |
| 📸 📋 on text actions | "Add another page", "Scan another list", "Log what you drank", "Snap the label instead" | Plain words. |
| `emoji=` | `EmptyState` (17 uses) | Rename to `mark`. 📋 → `list`, 🔍 → `loupe`, 📸 → `camera`, at 30px. 🍷, 🧬 and 🎉 → nothing. |

### 8.5 Flags

Unchanged: the quiz's country choices and Your DNA's country rows keep their emoji flags.

### 8.6 One leftover

`profileEngine.js` still writes `archetype_emoji: "🧬"`, which no surface reads. Write an empty string if the column and its tests allow it; otherwise leave that one line and allow it in the scan. Report which.

## 9. Sessions

**Session 1: Foundations.** `marks.js` and its test, `Mark`, `PencilGlass`, `NameGesture`, the `PENCIL` tokens, `/marks-specimen`. No page changes. **Acceptance:** every unit test and e2e spec passes unchanged.

**Session 2: Your marks and moments.** §8.1 and §8.2. The rating vocabulary, tiles, done lines, journal, wine page, Log, search, picks, the saved step, the timeline, toasts.

**Session 3: The house's furniture.** §8.3 to §8.6. Tools, labels, the Somm's quote, empty states, the Welcome demo. The source scan turns strict. Delete `/marks-specimen`. Update CLAUDE.md, and add phone screenshots of each changed surface to `docs/marks/screens/`.

After Session 3: full test run, Ed walks the preview on a phone, one merge.

## 10. Testing

- **`marks.test.js`** (real module): every id in `MARK_IDS` renders; every rating in `RATINGS` names a mark that exists; `renderMark` is deterministic and returns "" for junk; the shading arrays are non-empty and stroke 0 is the surface; no other file under `src/` declares mark path data.
- **The emoji scan** (Session 3, in `houseList.test.js`'s manner): no file under `src/`, comments included, contains an emoji other than a flag (regional-indicator pairs). The audit's pattern is the starting point; ✦ ‹ › → ✓ × are not emoji.
- **`houseCopy.test.js`, `wineSearch.test.js`, `logEntry.test.js`, `palateView.test.js`, `dnaEvolution.test.js`** assert today's emoji strings. Update the expected values to the new shapes; keep every case.
- **e2e:** about 45 lines assert emoji text or click a control by an emoji name (`motion`, `wine-page`, `match-picks`, `log-bottle`, `table-verdict`, `quiz-completion`, `identity-shift`, `search`, `evidence-ledger`, `wine-events`, `first-pour`). Update the string or the name, never the assertion. Where a spec read the emoji as state (a 📌 on a search hit), assert `data-mark` instead.
- **`motion.spec.ts`:** add, with motion on, that a tapped tile's shading is drawn stroke by stroke (more than one stroke is mid-flight at different moments, recorded by an observer installed before the tap) and ends on the settled markup; and under reduced motion that it is settled from its first frame.
- **By hand, on a phone:** the four glasses are told apart at tile size and at journal-row size.

## 11. For Ed's review

1. **The tiles have no visible labels.** They are 42 to 46px squares holding only the mark, as today. The glasses must carry the meaning alone until the done line says it.
2. **The resting guide.** Each tile shows its level as a faint shading, which the tap pencils in firmly.
3. **The chosen pick** gets a pencil circle round its name; the burgundy pill stays, without the emoji.
4. **"Keep Loved it"** as the wording once the emoji is gone.
5. **Underlines** only on journal Tried rows and the saved-step headline.
6. **Passed rows** show a struck name and no mark.
7. **The bottle** for Log a bottle, on home's entry and in the service bar.
8. **Empty states** lose 🍷, 🧬 and 🎉 with nothing in their place.

## 12. Known wrinkles

- **Flags render as two letters on Windows.** Accepted with H9.
- **Wrapped names.** See `NameGesture` in §6.
- **The glass sits in a 20-unit frame.** Its hairline is 1.08, not 1.3, so that it prints at the tools' weight. Do not "fix" it to match.
- **`WriteIn` and marks.** A mark inside a written line would be split into word spans. Keep the mark a sibling of the written text.
- **The design system's README** on claude.ai still says emoji are the icon system. It is updated outside the repo, after the merge.

## 13. Settled in Session 1 (Nov 15, 2026)

Session 1 shipped the foundations on `marks` (66eff27, 83b55b3, 4dab15a). These choices are now part of the spec; later sessions build on them and do not reopen them.

- **Stroke easing is `ease-out`** (`PENCIL.easing`).
- **`PENCIL_MARKS`** is the production name for the pencil paths, because `motion.js` owns `PENCIL` for the timings. The design module keeps `PENCIL`.
- **Junk ids draw nothing**, including inherited names like `"toString"`. The design module had that bug; it is fixed there too.
- **`guide`**: a tile at rest shows only the faint shading; the firm shading goes in when it is tapped.
- **`NameGesture`'s wrapper stays inline**, so a long name wraps exactly where it did before.
- **`e2e/marks.spec.ts`** drives the specimen and is deleted with it in Session 3. Anything it proves that still matters moves onto a real page first.

### 13.1 The circle on a wrapped name: superseded by §14.1

An earlier draft of this section replaced the circle on a wrapped name with a generated loop (`loopPath`). Ed ruled against it the same afternoon, but the corrected text never reached the repo, so Session 2 built the loop in good faith (d78f290). §14.1 undoes it.

## 14. Settled in Session 2 (Nov 15, 2026)

Session 2 shipped your marks and moments on `marks` (64cb712, d78f290, 6c4cce5). These readings are now part of the spec:

- **The saved-step underline** goes under the thing that joined the DNA (`emphasis`), not the bottle's recap row.
- **A wine's page:** the verdict's glass is pencilled in when it replaces the tiles after a rating made on that page, and is settled on arrival. "Passed" there is plain words; the title is not struck.
- **Log's rating list:** settled glasses, no guide, nothing drawn. Choosing a line isn't rating yet.
- **A want's star** arrives settled.
- **Row marks** sit at the end of the name's line at 22px, in `WineRow`'s existing end slot. The reference's left column was the reference's layout, not the app's.
- **A pick's flag** keeps its 10px small caps, with a 20px glass.
- **Search and Log's search:** a passed row is struck; loved rows are not underlined there.
- **Same-vein rows** carry their mark at the end of the row.

### 14.1 Open for Session 3, do this first: the gestures on a wrapped name

Ed's ruling on the specimen (Nov 15), in full:

- **The circle is the one stretched drawing, always.** One line or four, it is `GESTURES.circle` stretched round the whole name, crossing the corners of the first and last lines. Ed likes exactly that; it reads as a quick hand-drawn loop. **Remove `loopPath`** from production `marks.js`, from `NameGesture`, and from the tests (it is already gone from `design/marks.js`). The loop's corner check goes with it; in its place assert that a wrapped name's circle is one stretched `GESTURES.circle`.
- **Underline and strike go on every line.** On the last line alone they read as marking only those words ("Sec 2021" struck, the rest standing).
  - **One stroke per line.** `gestureBox` gives way to one box per line for `underline` and `strike`. `NameGesture` renders one `<svg>` per line, each sized to its own line's width with the reach and drop a single line has today.
  - **No two neighbouring lines share a drawing.** `design/marks.js` gives `GESTURES.underline` and `GESTURES.strike` a `more` array of two further drawings. Line *i* uses drawing *i* mod 3, counting the approved `d` as drawing 0. A one-line name therefore draws exactly what it draws today.
  - **Drawn in, top line first.** Add `PENCIL.gestureLineMs: 520` and `PENCIL.gestureStepMs: 260`: on a wrapped name each line's stroke is wiped in over 520ms, 260ms after the one above. A one-line name keeps `gestureMs`. Settled, and under reduced motion, every line is simply there.
- **Unit tests:** one box per line, in order, each inside its own line's vertical band; a one-line name's box and drawing are unchanged; junk gives nothing. Extend the parity test to `more`, and drop `loopPath` from it.
- **Browser tests:** each wrapped name has as many underline or strike strokes as it has lines, each spanning its own line. Prove it on the specimen now and on a real page (a struck pass or an underlined loved row with a long name) before the specimen is deleted.

### 14.2 What Session 3 moves off the specimen before deleting it

"Not for me" turning over, the underlined news on the saved step, and the per-line strokes of §14.1. The loop's corner check is not moved; it is deleted.

### 14.3 One more for §8.3

The journal Timeline's "🧬 See what's building in your palate →" becomes plain words. The strict scan would catch it; it is named here so it isn't a surprise.
