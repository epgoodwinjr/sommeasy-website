# Handoff: Motion & the Front Door

## 1. Overview

Sommeasy works and reads cleanly. Before the launch push it gets motion, and its front door gets rebuilt. Two things change:

- **Motion everywhere, in one language.** Quiet on every screen, with real theater at three moments: the reveal, a DNA promotion, and picks arriving.
- **The front door joins the House List.** Welcome, the quiz and the reveal still use the earlier design (rounded white cards, pill chips, the green hero card). They move to the House List look, and Welcome gains a self-playing demo.

No engine changes. The DNA evolution path, the identity strand, Somm curation, the Table Verdict, the event ledger and the auth core stay exactly as they are. `palateMark.js` gains a way to render intermediate frames; its settled output does not change by a byte.

## 2. How to use this package

1. This folder lives in the repo as `docs/motion/` (this README plus `design/`).
2. Create the branch `motion` from `main`. Vercel builds a preview for every push. Nothing merges to `main` until Ed has walked the preview after the last session.
3. Start each Claude Code session with:

> Read CLAUDE.md, then docs/motion/README.md. We're building Motion & the Front Door on the `motion` branch, one session per run. Do Session N now. The decisions in §3 are final, so don't re-ask them. Anything marked "for Ed's review": build it as written and list it in your session summary. End with the summary CLAUDE.md asks for, plus what I should check on the preview deploy.

### 2.1 About the design file

`design/index.html` is the **motion study** Ed approved on Nov 11, 2026: four scenes (front door, reveal, promotion, picks) with replay and half/quarter speed. Open it in a browser. It is a reference for feel and timing, not production code. Its wines, prices, notes and the name "The Stellenbosch Loyalist" are sample content. Its bloom code is a port of `src/lib/palateMark.js` with a state layer added; §7 says how to do the same in the real module.

Where the study and this README disagree, the README wins.

## 3. Decisions (Ed, Nov 11 2026) — final

| # | Question | Decision |
|---|---|---|
| M1 | How much motion | **Quiet, with three big moments**: the reveal, a promotion or shift, picks arriving. |
| M2 | The front door's look | **Redesign all three**: Welcome, quiz and reveal move to the House List look. |
| M3 | The explainer | **Both**: a self-playing demo on Welcome, and a 20–30 second film for promotion (Session 6). |
| M4 | Sharing | **Both**: a shareable palate card and a link preview image (Session 6). |
| M5 | Reveal ground | **Cream.** The bloom draws on the page, as on `/palate`. The green hero card is retired. |
| M6 | Promotion size | **A notch bigger** than first shown: a 164px bloom, a 2.1s growth, a pulse from its heart, two ripples where a berry lands. This is what the study now plays. |
| M7 | Welcome demo | **Plays when scrolled to.** Starts on entering view, loops while visible, rests off-screen. |
| M8 | Somm notes on picks | **Keep the rewrite.** Picks show at once with the engine's note; the Somm's words write in over it when they land. |

## 4. Ground rules from CLAUDE.md that this work touches

CLAUDE.md still governs. The ones this work is most likely to bump into:

- **No new dependencies.** CSS, the Web Animations API and `requestAnimationFrame` only. No animation library.
- **Inline styles, no CSS files** beyond `globals.css`, which may gain keyframes and the reduced-motion rule.
- **One rating path, one rating control.** Motion changes how a rating *answers*; it never changes `saveInteraction` → `resolveAndAccumulate` → `maybeRecomposeIdentity` → `recordEvent`.
- **Events stay fire-and-forget.** No animation waits on a ledger write, and no ledger write waits on an animation.
- **The bloom's aesthetics are Ed-approved constants.** `MARK_GEOMETRY` and `MARK_PALETTE` do not change.
- **Home chooses its layout once per load** and never flips mid-visit. Entrances play after that choice, not before.
- **Unknown ≠ empty.** A failed read still renders its honest state; it never renders an entrance for content that isn't there.
- **Tap targets ≥ 40px, inputs ≥ 16px.** Motion never shrinks a hit area, even mid-animation.
- **Keep every permanent guard.** Selectors and flow steps may change with the DOM; assertions do not (§10).
- **e2e runs only against the test accounts.**

## 5. The motion language

Two families, and nothing else.

**Ink.** The app is a wine list written for one person, and it arrives like one. Text rises a few pixels as it appears; dotted leaders draw left to right; rules draw from their origin; numerals and marks land; prose the Somm wrote appears word by word.

**Bloom.** The palate mark is the only thing that moves organically. It draws itself at the reveal, grows when the DNA grows, and breathes while the Somm thinks.

Not in this language: parallax, scroll-driven effects, confetti, bounces or overshoot on text, autoplay sound, skeleton shimmer.

### 5.1 Tokens

Add `src/components/house/motion.js`. It is the one copy of every value below, the way `tokens.js` is for color. `SOFT_OUT` moves here (re-export it from `tokens.js` so existing imports hold).

| Token | Value | Use |
|---|---|---|
| `SOFT_OUT` | `cubic-bezier(0.22,1,0.36,1)` | Every entrance, leader, rule and fill |
| `EASE` | `ease` | Plain opacity fades and exits |
| `D_TAP` | 150ms | Hover, press and selected states (today's `TRANSITION`) |
| `D_FADE` | 500ms | Opacity-only entrances (eyebrows, meta, prices) |
| `D_RISE` | 700ms | Rise: opacity 0→1 with `translateY(12px)` → `none` |
| `D_LEADER` | 650ms | A leader or rule drawing its full width |
| `D_POP` | 420ms | A mark landing: opacity 0→1 with `scale(0.6)` → `none` |
| `D_EXIT` | 300ms | A view leaving: opacity 1→0 with `translateY(-8px)` |
| `WORD_STEP` | 30ms | Gap between words in written prose (headlines: 85–110ms) |
| `D_WORD` | 450ms | One word: opacity 0→1 with `translateY(6px)` → `none` |
| `ROW_STEP` | 130ms | Gap between sibling rows or entries |
| `PICK_STEP` | 450ms | Gap between picks |

Rules for all of it:

- **Settled transforms are `none`**, never `translateY(0)`. A non-none transform re-parents `position: fixed` descendants (toasts). The existing `Rise` in `MatchList.js` ends on `translateY(0)`; fix it when it moves to the shared primitive.
- **Animate only `opacity`, `transform` and `clip-path`.** The one exception is the height ease in §8.5.
- **Nothing blocks input.** A control is live from first paint, even while it is still rising.
- **Entrances play once per mount.** Returning to a page by the back trail plays its entrance again; a state change inside a page animates only what changed.

### 5.2 Reduced motion

`prefers-reduced-motion: reduce` is honored everywhere:

- A `useReducedMotion()` hook (SSR-safe, false on the server).
- Ink entrances collapse to a 150ms opacity fade with no movement. Written prose appears whole.
- The bloom renders its settled frame at once. No draw, no growth, no breathing.
- The Welcome demo shows its final state (the picks) and does not loop.
- A global rule in `globals.css` stops any CSS keyframe loop.

## 6. Ink primitives (Session 1)

Build these in `src/components/house/`, one file each, and replace the ad-hoc versions as pages are touched.

- **`Enter`** — wraps a child and plays `rise`, `fade` or `pop` on mount after `delay`. Replaces `MatchList.js`'s private `Rise` and the `useMounted` fade-ups in `page.js` and `Quiz.js`. Uses `element.animate()` with `fill: "backwards"` so the element rests in its natural state once done.
- **`LeaderDraw`** — a dotted leader that draws with `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)`. Scaling a dotted border stretches the dots; clipping does not. `LeaderEntry`, `WineRow`, `SettingRow` and the fact rows take an optional `enterDelay` and use it.
- **`RuleDraw`** — a 1px rule scaling on X from `transform-origin: left` (the `Divider`'s two rules from the center outward, its ✦ fading in with them). `SectionHead` and `Divider` take `enterDelay`.
- **`WriteIn`** — prose that appears word by word. Each word is an inline-block span that fades and rises. **When the last word lands, the component replaces the spans with one plain text node**, so the settled DOM, its `textContent` and what a screen reader meets are identical to today's. Under reduced motion it never splits. Set `aria-live` on nothing new; existing live regions keep their role.
- **`useStagger(base, step)`** — returns `next()` giving each sibling its delay, like `numeralCounter()` does for numerals: call it inside a row's condition so a hidden row takes no slot.

Page-to-page transitions (for Ed's review): try the native View Transitions API as progressive enhancement, a 200ms cross-fade of the page column with the RunningHead held still. Drop it without ceremony if it fights `navTrail`, the App Router's scroll restoration, or any e2e spec.

## 7. The bloom in motion (Session 1 builds it, Sessions 3–5 use it)

### 7.1 `palateMark.js`

Today `markBody(p)` draws straight from params. Split it in two, keeping the module pure and dependency-free:

- `settledState(params)` → a **state**: disc opacity and scale, frame draw fraction, orbit opacity and rotation, a list of stamens `{angle, tip, opacity}`, petals `{angle, tip, halfWidth, opacity}`, berries `{petalIndex, rf, scale, opacity}`, the ring `{phase, burgundy, burgundyFull, cream}`, core scale, tip bulge, and an optional list of overlay ripples.
- `renderMarkState(state, {size})` → the SVG string.
- `renderPalateMark(genome)` becomes `renderMarkState(settledState(markParams(genome)))` and **must stay byte-identical to today's output**. `palateMark.test.js`'s determinism and distinctness locks prove it; do not edit those fixtures.
- `revealState(params, t, thinkMs)` and `growState(paramsA, paramsB, t, duration)` → states for a time `t` in ms. Pure functions of their inputs.

Two invariants, each with a unit test:

1. `revealState(p, ∞)` and `growState(a, b, ∞)` render byte-identically to `renderPalateMark` of the target genome. Ripples and pulses are overlays that have fully faded by the end.
2. Growth is monotonic on the dials that grew: petal tips, stamen tips and berry count never pass through a smaller value on the way.

### 7.2 `PalateMarkLive`

A client wrapper beside `PalateMark.js`. It runs a `requestAnimationFrame` loop that sets `innerHTML` from the state function, and **when the animation ends it renders exactly what `PalateMark` renders** (same `data-testid="palate-mark"`, same `aria-hidden`), so every existing selector and screenshot holds at rest. It cancels its loop on unmount and renders the settled frame at once under reduced motion.

### 7.3 The reveal draw

`t` counts from the medallion appearing; the draw starts at `think` (1900ms minimum, see §8.3).

| Feature | Start | Duration | Motion |
|---|---|---|---|
| Disc | 0 | 500 | opacity 0→1; whole mark scale 0.94→1 over 700 |
| Frame circles | 120 | 900 | draw clockwise from 12 o'clock |
| Orbit beads | 300 | 800 | fade in; rotate at 0.02°/ms while waiting |
| Core | 0 → think | — | pulses 1→1.2 on a 1500ms cycle while waiting; settles to 1 over ~260ms once the draw starts |
| Ring, burgundy | think | 700 | sweeps to its share |
| Ring, cream | think + 450 | 650 | sweeps the rest |
| Stamen *i* | think + 250 + 45·*i* | 500 | reaches from base to tip |
| Petal *i* | think + 500 + 120·*i* | 750 | opens from the base: tip grows, width from 35% to full, opacity in over the first third |
| Berry *k* | after the last petal starts + 250 + 110·*k* | 420 | lands: scale 1.9→1, opacity 0→1 |

All eased with a quartic ease-out. Length after `think`: `500 + 120·petals + 250 + 110·berries + 420` (about 2.3s for 7 petals and 3 berries).

**The orbit must end where the static mark has it.** The study lets the beads coast to an arbitrary angle. In production, coast to rotation 0 (or any angle that renders identically) so invariant 1 holds.

### 7.4 Growth

From the genome before the rating to the genome after it, over **2100ms**, eased in-out (cubic).

- Petals, stamens, tip bulge and the ring interpolate from A to B.
- The whole mark swells: scale `1 + 0.06·sin(π·t/(1.05·duration))`.
- A pulse crosses from the heart at 42% of the duration: a cream circle from r=22 to r=68 over 1100ms, opacity 0.5→0.
- **A new berry** (same petal count) lands at 50% + 140ms per extra berry: scale 2.4→1 over 460ms, with two ripples from it (120ms and 400ms after landing; r 3→18 over 900ms, opacity 0.85→0).
- **A new petal** opens at its final angle from 30% of the duration while the others slide to make room. A new petal changes `berryPetalOrder` (the seeded shuffle depends on the petal count), so berries lift over the first 28% and land again from 80%, 110ms apart. This hides a discontinuity the static render already has.
- **Nothing moved** (a promotion that changes no dial): play the swell and the heart pulse only.

The animation needs no knowledge of what was promoted. It is always genome A → genome B.

### 7.5 Breathing

While the Somm works, the settled bloom scales 1→1.045→1 on a 3.4s ease-in-out loop (a CSS keyframe on the wrapper). Nowhere else: a mark at rest stays at rest.

## 8. Surfaces

### 8.1 Welcome (Session 2)

Rebuild `WelcomeScreen` in `src/app/page.js` in the House List look. The 400px auth column with 36px gutters is the right frame.

Top to bottom: masthead (24px protea + "SOMMEASY" small caps, centered) · headline, Playfair 36px/1.08 700, left-aligned, `text-wrap: balance`: "Never guess at a wine list again." · sub, 16px ink 0.55: "Tell us what you like. We'll find it on the menu." · primary `LeaderEntry` "Build your palate" with the filled → circle (the existing `onStart`) · "Takes about two minutes." · "Already have an account? Sign in" · `Divider` · small-caps head "Watch it work" · the demo · the status line and a 180×2 `ProgressLine`.

Keep: the signed-in Sign Out affordance, `data-testid="welcome-notice"` and its copy, and every existing test id. "Build your palate" replaces "Build My Profile" (for Ed's review; update the specs that click it by name).

Entrance:

| Element | Delay | Motion |
|---|---|---|
| Masthead | 0 | fade |
| Headline | 150 | written, 70ms per word, 600ms each |
| Sub | 650 | rise |
| Entry label | 850 | rise |
| Entry leader | 1050 | draw, 700ms |
| Entry circle | 1500 | pop |
| "Takes about two minutes." | 1250 | fade |
| Sign in line | 1450 | fade |
| Divider, "Watch it work" | 1500–1650 | draw / fade |

**The demo** (M7) is a fixed-height block (no layout shift) built from real house components over sample data kept in one constant. It starts when 45% of it is in view (`IntersectionObserver`), loops while visible, and when a cycle ends off-screen it rests on the picks until seen again.

One cycle, in ms:

| At | What |
|---|---|
| 0 | A paper sheet fades in: "BY THE BOTTLE · WHITE" and eight list lines (name, leader, price). Status: "Reading the list…". Bar to 55% over 2000. |
| 350–2100 | A reading line travels down the sheet; each row darkens to full ink as it passes, then rests at 0.78. |
| 2150 | Status: "Reading eight wines…" |
| 2900 | Status: "Weighing them against your DNA…". Bar to 90%. |
| 3800 | Three rows turn burgundy 160ms apart, each gaining an italic *i. ii. iii.* in the margin; the other five fall to 0.26. Status: "Three bottles, three kinds of yes." Bar to 100%. |
| 5100 | The sheet leaves (fade, 10px up, 420ms). |
| 5400 | The picks write in: *I.* 🏆 TOP PICK with its rule; name rising; leader drawing to the price; meta; the Somm's note written at 34ms per word; then picks II and III as single rows, 180ms apart. |
| 10600 | Fade out, then the next cycle. |

The status strings come from the real `readingLine()` in `houseCopy.js`; do not retype them.

### 8.2 The quiz (Session 2)

Restyle `Quiz.js` to the House List look. This part was not in the motion study, so build it as written and list it **for Ed's review**.

- Header: RunningHead-style slim bar; "Step N of 5" as a meta line; the five-segment progress as a `ProgressLine` that fills on each step.
- Chips become House List choices: a ruled, wrapping list of options in Playfair 17px, selected state in burgundy with a ✦ where today's refine chips wear one. Tap targets stay ≥ 40px. Every existing chip `data-testid`, the ✦ meaning and the refine/uncheck semantics are unchanged.
- Step change: the leaving step fades and moves 8px left over 200ms; the arriving step's title rises, then its options settle in with a 20ms stagger capped at 300ms total.
- **A bloom in the header that grows as the user answers.** 44px, composed client-side on every change from the answers so far through the existing pure `composeIdentity` → genome → `growState`, 600ms per change. It starts as the bare medallion. It is decorative (`aria-hidden`), and the title is never shown before the reveal.
- Confirm and fix: at 375px the step title appeared clipped under the sticky header on the live site.

### 8.3 The reveal (Session 3, big moment 1)

Replace `RevealReading` and restyle `Reveal` in `Quiz.js`. On cream (M5); no card.

- **Waiting.** A 176px medallion (disc, frame, orbit, pulsing core; §7.3) with "The Somm is reading your palate…" in Playfair italic 19px beneath, its three dots breathing. It shows for **at least 1900ms** and for as long as the save is pending. The draw begins when both are done.
- **The draw** (§7.3), then relative to its start:

| Element | Delay | Motion |
|---|---|---|
| Reading line | −250 | fades out |
| "YOUR WINE DNA" | 1500 | fade |
| Title (`reveal-archetype`) | 1750 | written, 110ms per word, 700ms each |
| Epithet (`reveal-epithet`) | 2350 | rise |
| Divider | 2700 | draws from the center |
| Narrative (`reveal-narrative`) | 2950 | written, 22ms per word |
| "✓ Saved to your palate" (`reveal-saved`) | 4300 | fade |
| "Meet your palate" (`reveal-palate-cta`) | 4450 | entry rises, leader draws, circle pops |

- **Signed out (the Velvet Rope).** Same wait, same draw, same title. The epithet and narrative stay absent from the render tree, as today. The gate (`teaser-gate`) rises at 2700 in the House List look: its two lines of copy unchanged, "Save My Wine DNA" as a primary `LeaderEntry`. The one read-only bottle and "N more wines to explore" follow, unchanged in content.
- `saveFailed` keeps its copy and Try again, restyled; it appears where the saved line would.
- The recs under the reveal (`WineRecList`) enter as rows, `ROW_STEP` apart.

### 8.4 A promotion or shift (Session 4, big moment 2)

One component, `GrowthMoment`, used wherever a rating's engine result carries a promotion or an identity shift:

- **Log a bottle, saved step** (`LogBottle.js`): it already holds the genome from before the save and re-reads it after the recompose. Show the bloom at **164px** in its old shape, then grow it (§7.4) 700ms after the screen arrives.
- **The wine page** and **home's From last night**: the same growth, in place, at the size the bloom already has there (the crest on home), with the existing toast kept.

Saved-step timeline, from the tap:

| At | What |
|---|---|
| 0 | The tapped tile presses: scale 1 → 0.88 → 1.08 → 1 over 380ms, burgundy border and tint. The other three fall to 0.25 over 220ms. |
| 430 | The rate step leaves (`D_EXIT`). |
| 740 | The saved step arrives; the bloom rises in at its **old** shape. |
| 1440 | Growth begins (2100ms). |
| 2590 | Eyebrow fades in: "🧬 Your DNA just grew" / "✨ Your palate shifted". |
| 2790 | Headline written, 85ms per word. |
| 3390 | The reason line written, 30ms per word. |
| 4090 | Rule draws; at 4190 the bottle's row rises, its leader draws, its mark pops. |
| 5040 | The three ways on rise, `ROW_STEP` apart, each leader drawing after its label. |

All copy on this screen already comes from `houseCopy.js`; none of it changes.

**The quiet path.** A rating with no promotion and no shift gets no growth: the bloom appears settled at 132px, the eyebrow at 250ms, "Noted in your journal" written, the row and the ways on following. It should feel finished, not smaller.

**Rating tiles everywhere** get the press (the 380ms keyframes above) and the done line written in. Tiles disable on the first tap exactly as today.

**Building now** and the palate rails already fill on mount. After a rating on the same screen, the affected bar eases to its new value over 900ms instead of jumping.

### 8.5 Reading and the picks (Session 5, big moment 3)

**The reading view** (`processing-spinner` in `MatchList.js`) keeps its layout: bloom 96px, "🍷 The Somm is reading", the line, the bar, Cancel. Add:

- The bloom breathes (§7.5).
- A ticker under the bar, in the meta style: the names of the wines being read, one at a time, swapping every 190ms with a 160ms fade. It runs only while real entries exist to show (after parsing returns them) and stops when the line changes to "Weighing…". Before that it is absent. Never invent names.
- Line changes cross-fade: 140ms out, 320ms in with a 4px rise. `READ_BEAT_MS` and `aria-live` stay as they are.
- The view leaves with `D_EXIT` before the picks enter.

**Your picks:**

| Element | Delay | Motion |
|---|---|---|
| RunningHead | 0 | fade |
| "Your picks" | 80 | rise |
| Sub line | 180 | rise |
| Terms bar | 300 | its two rules draw; the text fades at 450 |
| "The Somm says" block (`somm-thinking`) | 600 | fade; its dots breathe |
| Pick *n* | 800 + 450·*n* | numeral fades; label fades and rule draws at +80; name rises at +160; leader draws at +380; price fades at +720; meta fades at +420; note rises at +520; actions fade at +780 |
| Closing divider | after the last pick | draws |

**The Somm lands** (M8), whenever `sommState` becomes `done`:

1. "The Somm is tasting…" fades out over 200ms. The summary (`somm-summary`) is written in at 30ms per word while the block's height eases to fit over 450ms (`SOFT_OUT`).
2. From 1250ms later, pick by pick, 520ms apart: the engine's note (`pick-note`) fades out over 200ms, and the Somm's note (`somm-note`) is written in at 26ms per word while the note's box eases to its new height.

This height ease is the one layout animation in the system. Measure the old and new heights, animate between them, then clear the inline height. On fallback (`sommState` never `done`) nothing plays and the engine notes stay, as today. If the Somm re-curates to different wines, the picks that change cross-fade in place; do not replay the full entrance.

Choosing a pick, the quieted others, the pill and Change keep their current 0.3s behavior.

### 8.6 Quiet entrances elsewhere (Sessions 4–5, as each page is touched)

- **Home.** After the layout is chosen: the crest (mark, "PREPARED FOR", title, epithet) rises as one; the divider draws; each numbered section's head draws and its entry or rows follow, `ROW_STEP` apart. The whisper is written in. Total under 1.2s.
- **/palate.** The mark rises; the signature rails already animate; each section's head draws as it mounts. No scroll-triggered entrances.
- **Journal, Search, Account, the wine page.** The page title rises; rows appear together with a single 300ms fade. Lists are for scanning; do not stagger long lists.
- **Toasts** keep their current behavior.

## 9. Sessions

One session per Claude Code run. Each leaves the preview usable.

**Session 1 — Foundations.** `motion.js`, the Ink primitives (§6), reduced-motion support (§5.2), the `palateMark.js` state split with its two invariants (§7.1), `PalateMarkLive` (§7.2), and the view-transition trial. Swap `MatchList`'s private `Rise` for `Enter`. No page looks different except that `Rise` ends on `transform: none`. **Acceptance:** every unit test and e2e spec passes with assertions unchanged; `palateMark.test.js` fixtures untouched.

**Session 2 — The front door.** Welcome (§8.1) and the quiz (§8.2).

**Session 3 — The reveal.** §8.3, signed-in and signed-out.

**Session 4 — The rewards.** §8.4, plus home and /palate from §8.6.

**Session 5 — The waits.** §8.5, plus the remaining pages from §8.6. Log's label read gets the breathing bloom and the same line cross-fade.

**Session 6 — Launch kit.** The link preview image through Next's built-in `opengraph-image` route (no new dependency), composed from the brand mark and the headline. The shareable palate card from the existing `renderPalateMarkDocument`: bloom, title, epithet, "sommeasy.wine", offered from `/palate` (for Ed's review: where the Share action sits and its copy). The promotional film is produced outside the repo from the finished motion.

After Session 6: full test run, Ed walks the preview on a phone, one merge.

## 10. Testing

- **Run e2e with reduced motion.** Set `use: { reducedMotion: "reduce" }` in `playwright.config.ts` so the suite runs against settled states and stays fast and deterministic. Every existing assertion should hold unchanged, because §5.2 makes the settled DOM identical to today's.
- **Add one motion spec** (`e2e/motion.spec.ts`) that runs with motion on and asserts outcomes, never timings: the reveal ends with a `palate-mark` whose markup equals the static render for the same genome; a written line's `textContent` equals its source string once settled and contains no word spans; the Welcome demo does not start while off-screen and does start once scrolled to; under `reducedMotion: "reduce"` the demo shows its picks and no animation is running.
- **Guards to watch.** `quiz-completion.spec.ts` and `palate-handoff.spec.ts` wait on reveal test ids; the 1900ms minimum wait is inside their timeouts but check it. `auth-flows.spec.ts` and `first-pour.spec.ts` click the Welcome button; update the name, never the assertion. `design-screenshots.spec.ts` should capture settled frames.
- **Unit tests.** The two `palateMark` invariants (§7.1); `motion.js` tokens exported and used (a source scan that no file under `src/` other than `motion.js` declares the `SOFT_OUT` curve literal, in the manner of `houseList.test.js`).
- **By hand, on a mid-range phone:** no dropped frames in the reveal draw or the growth; no layout shift when the Somm lands; every control tappable during its entrance.

## 11. Known wrinkles

- **Berries re-deal on a new petal.** See §7.4. The lift-and-land hides it; do not change the seeded shuffle to avoid it, since that would re-phase existing users' marks.
- **The orbit's resting angle.** See §7.3.
- **The study compresses the Somm's wait.** Real curation takes 12–20 seconds; the "tasting" line simply persists.
- **Fonts.** The study loads Playfair and Source Sans from Google Fonts, as the app does. Word-by-word text can reflow if a font swaps in mid-animation; `WriteIn` should wait for `document.fonts.ready` (capped at 300ms) before splitting a headline.
