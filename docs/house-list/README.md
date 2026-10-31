# Handoff: The House List (Sommeasy app redesign)

## 1. Overview

The House List is a redesign of the signed-in Sommeasy app (`epgoodwinjr/sommeasy-website`, Next.js 14 App Router, inline styles, Supabase). It reworks every signed-in page so the app reads like a wine list written for one person:

- **Home** carries the user's identity as a crest (palate mark, "Prepared for", archetype title, epithet). Actions are dotted-leader entries in numbered sections. Lists of wines use the same leader line as a printed by-the-bottle page.
- **Inner pages** get a slim running head (back · protea home · search) and a bottom service bar (📋 Match a list · 📸 Log a bottle).
- **New pages:** Log a bottle (`/log`, moved out of home), a wine's own page (`/wine?name=`), Search (`/search`) and Account (`/account`).
- **Restyled pages:** Home (`/`), Match & picks (`/recommend`), Journal (`/journal`), Your palate (`/palate`), Sign in (`/login`) and Create account (`/signup`).

No engine changes. The DNA evolution path, identity strand, Somm curation, Table Verdict, event ledger and auth core all stay as they are. This is a presentation and flow change plus a small set of data additions, listed in §3 and §10.

## 2. How to use this package

1. Copy this folder into the repo as `docs/house-list/` (README, `design/`, `screenshots/`). Claude Code reads it from there every session.
2. Create the branch `house-list` from `main`. Vercel builds a preview deploy for every push. Nothing merges to `main` until Phase 6 is done and Ed has walked the preview.
3. Run `docs/house-list/012_house_list.sql` in the Supabase SQL Editor before Phase 1 ends (§10.1). It is additive and nullable, so it is safe on production ahead of the merge.
4. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel (Production + Preview) and `.env.local` before Phase 6 (§10.2).
5. Start each Claude Code session with:

> Read CLAUDE.md, then docs/house-list/README.md. We're building The House List on the `house-list` branch, one phase per session. Do Phase N now. The decisions in §3 are final, so don't re-ask them. Anything marked "for Ed's review" in §12: build it as written and list it in your session summary. End with the summary CLAUDE.md asks for, plus what I should check on the preview deploy.

### 2.1 About the design files

The files in `design/` are **design references built in HTML**: prototypes that show the intended look and behavior. They are not production code to copy. The task is to **recreate these designs inside the existing Next.js codebase**, using its patterns: inline style objects (no Tailwind, no CSS files), client components, the existing Supabase helpers, and the existing shared components where they exist (`PalateMark`, `WineRecList`, `PalateView`, `AuthShell`, `AuthForm`).

The prototype's wines, prices, Somm notes, dates and the name "Edward" are **sample content**. All real content comes from the user's data. The prototype's logic class (a single `renderVals()` state machine) only fakes behavior. The real behavior is specified in this README, and the existing code paths it names win over anything the prototype does.

### 2.2 Fidelity

**High fidelity.** Colors, type, spacing, rules and copy are final. Recreate them exactly, using the values in §6–§9. Where the prototype and this README disagree, the README wins. It corrects a few things the prototype fakes or gets wrong. Two corrections apply everywhere:

- **US English.** The prototype mixes British forms. Use "Color" (not "Colour"). Write dates as "Wednesday, September 30" on the home date line and "Sep 30" in rows.
- **No wrapping on text actions.** Every text button (`🍷 Had it`, `🥂 This one’s on the table`, `📋 Scan another list`…) is a single line: `white-space: nowrap`. A few screenshots show these wrapping. That's an artifact of the screenshot renderer, not the design.

## 3. Decisions already made (Ed, Oct 30 2026)

These are final. Don't escalate them again.

| # | Question | Decision |
|---|---|---|
| D1 | Bottom service bar | **Keep it on inner pages**: Journal, Wine, Search, Palate, Account. Not on Home, Match/Picks, Log or auth pages. |
| D2 | "Start fresh" | **Ask to confirm, then open the quiz.** Uses the existing `/?quiz=fresh`. "Adjust quiz answers" goes straight to the existing `/?quiz=refine` (no confirm). |
| D3 | "Delete account" | **Build it.** Confirm step, then delete everything through a server route using `SUPABASE_SERVICE_ROLE_KEY` (Ed adds it to Vercel). All five user tables already `ON DELETE CASCADE` from `auth.users`. |
| D4 | Journal note + where it was drunk | **Add two columns** to `wine_interactions` (`note`, `place`). |
| D5 | Name at sign-up | **Ask and store it** in auth `user_metadata.name`. No migration. |
| D6 | New users' Reserved rows | **Build as designed.** Two recommendations show until the first rating anywhere; then the rest open. |
| D7 | Notifications section | **Leave it out** until the email provider is decided (CLAUDE.md lists that decision as deferred). Account shows three sections: You, At the table, Your data. |
| D8 | Account › At the table | **Save to the profile**: new `wine_profiles.preferences` jsonb. Pre-fills Tonight's terms on Match. |
| D9 | Scope | **Everything, in phases.** One phase per Claude Code session (§5). |
| D10 | Rollout | **Preview branch** `house-list`, merged once after Phase 6. |
| D11 | Screenshots | Included in `screenshots/` (§15). |

One more small data addition follows from the approved design. It isn't a new question: `dna_timeline.wine_name` (nullable), so a wine's page can show "What it did to your palate" (§10.1).

## 4. Ground rules from the repo's CLAUDE.md that this work touches

CLAUDE.md still governs. These are the ones this redesign is most likely to bump into:

- **One rating path.** Every rating, on every surface, goes through `wine_interactions` upsert → `resolveAndAccumulate` (with `previousRating`) → `maybeRecomposeIdentity` → the `recordEvent` ledger write → toasts. The redesign changes how ratings are *asked for* (inline tiles replace `RatingModal`). It never changes the path. Keep exactly one implementation of the Had it / Want it / Pass logic (`WineRecList`). Keep exactly one rating control (`RatingTiles`, §7.9).
- **Events are fire-and-forget**, never awaited on a critical path. The wine-events blackhole guard must stay green.
- **Choosing a pick never touches DNA.** Rating is the only gate.
- **All auth copy lives in `src/lib/authCopy.js`.** New auth strings go there.
- **Auth pages read `searchParams` as a server prop**, never `useSearchParams`. Submit buttons stay disabled until hydration. `/wine?name=` follows the same server-prop pattern.
- **Inputs ≥16px, tap targets ≥40px** (the design uses 44px).
- **Thresholds come from `dnaThresholds.js`.** Never hardcode "two loved bottles". Compute it.
- **e2e runs only against the test accounts.** Ed's account is off-limits. Never call the real account-delete route against any real or test account (§11).
- **Keep every permanent guard.** When the DOM changes, update selectors and flow steps, never assertions (§11).

## 5. Phase plan

The order is chosen so every phase leaves the preview deploy usable. The bottle-logging code lives inside home today, so Log moves in the same phase as Home.

**Phase 1: Foundations.** No page changes yet.
- `src/components/house/`: the primitives in §7 (Divider, SectionHead, LeaderEntry, WineRow, SettingRow, RuledField, ChoiceLine, RatingTiles, RatingList, TextAction, RunningHead, ServiceBar, Toast + `useToast`, EmptyState, Rail, ProgressLine).
- `src/lib/ratings.js`: the single `RATINGS` list (`loved ❤️ Loved it`, `liked 👍 Liked it`, `fine 😐 It was fine`, `not_for_me 👎 Not for me`). `RatingTiles`, `RatingList` and anything else showing ratings import it.
- `src/lib/vintage.js`: `splitVintage(name)` → `{ base, vintage }`. It splits off a trailing 19xx/20xx (optionally preceded by a comma), and otherwise returns `vintage: null`. Unit-test it in plain node like the other `__tests__`.
- `src/lib/navTrail.js`: the running head's back trail (§9.1).
- Migration file `supabase/migrations/012_house_list.sql` (§10.1), applied by Ed.
- Acceptance: every existing unit test and e2e spec passes unchanged.

**Phase 2: Home + Log a bottle.**
- Rebuild `SavedProfileView` in `src/app/page.js` as the House List home (§8.1). WelcomeScreen, Quiz and the anonymous teaser are unchanged.
- Restyle `WineRecList` into House List rows with inline tiles, Reserved rows and done lines (§8.1.6). The post-quiz reveal inherits the new rows.
- Move bottle logging to the new `/log` route (§8.2) and delete it from `page.js`. `/?log=1` now redirects to `/log`. Update every link that used it.
- Ship a minimal `/account` holding just **Sign out**, because home's header Sign Out button goes away. Phase 6 builds out the rest.
- Retire `RatingModal` once the verdict ask and recs use `RatingTiles`.
- Update the affected e2e specs (§11).

**Phase 3: Match & picks.** Restyle `/recommend`: Match the wine list, Tonight's terms, the reading state, Your picks (§8.3).

**Phase 4: Journal + the wine page.** Restyle `/journal` (§8.4). Add `/wine?name=` (§8.5). Start writing `dna_timeline.wine_name`. Journal row actions (re-rate, delete) move to the wine page.

**Phase 5: Search + Your palate.** Add `/search` (§8.6). Restyle `PalateView` for `/palate` and the anonymous teaser (§8.7).

**Phase 6: Account + sign in / create account.** Build out `/account` (§8.8) with `POST /api/account/delete` (§10.2). Restyle `AuthShell` / `AuthField` / `AuthForm` and add the name field (§8.9). Then: full test run, Ed walks the preview, merge.

## 6. Design tokens

All values come from the prototype and the existing app. There are no new colors.

**Color**
| Token | Value | Use |
|---|---|---|
| Ink | `#1B3D2F` | All text and rules. Hierarchy comes from opacity, never grays |
| Burgundy | `#8B2332` | Numerals, links, primary text actions, selected states, epithets, ✦ |
| Burgundy deep | `#7A1E2C` | Second stop of the filled-circle and pill gradient: `linear-gradient(135deg,#8B2332,#7A1E2C)` |
| Sage | `#6B8F5E` | Progress fills only |
| Sage track | `rgba(107,143,94,0.18)` | Progress tracks (Building now) |
| Cream | `#F5F0E8` | Page, knock-outs, text on burgundy/green |
| Page wash | existing fixed radial gradient in `layout.js` | Unchanged |

**Ink opacity ladder** (text): 1 (names, titles), 0.75–0.8 (Somm notes on the wine page and picks), 0.7 (vintages, setting values, prompt labels), 0.65, 0.6 (sub-copy in empty states), 0.55 (page subtitles, helper lines), 0.5 (section-head labels, field labels), 0.45 (meta lines, dates, quiet links), 0.4 (tagline, struck rows).

**Rules**
- Hairline row divider: `1px solid rgba(27,61,47,0.07)`. Home rec rows use `0.08`; fact and DNA rows `0.06`.
- Section-head rule: `1px rgba(27,61,47,0.1)`.
- ✦ divider rules and terms-bar rules: `1px rgba(27,61,47,0.14)` (terms bar `0.1`).
- Leader dots: `border-bottom: 1.5px dotted rgba(27,61,47,0.25)` (setting/fact rows `0.22`, DNA rows `0.22`, rating list `0.2`). Primary entries use `2px dotted rgba(27,61,47,0.25)`.
- Field underline: `1.5px dotted rgba(27,61,47,0.3)`; `0.35` on search and auth fields. Focus: `1.5px solid #8B2332`.

**Type.** Two families, both already loaded in `globals.css`: Playfair Display (`'Playfair Display', Georgia, serif`) and Source Sans 3 (`'Source Sans 3', sans-serif`). Add the Playfair italic axis to the Google Fonts import (`ital,wght@0,400..700;1,400..700`). The design leans on italic everywhere.

| Role | Family / size / weight / other |
|---|---|
| Page title (h1) | Playfair 30px 700, letter-spacing −0.01em, line-height 1.15 |
| Crest title (home) | Playfair 28px 700, lh 1.12, ls −0.01em, `text-wrap: balance` |
| Wine page title | Playfair 28px 700, lh 1.15, ls −0.01em, balance |
| Log rate / saved headline | Playfair 27px 700, lh 1.15, ls −0.01em, balance |
| Primary entry label | Playfair 24px 600, lh 1.1 (22px in option lists on Match and Log) |
| Secondary entry label | Playfair 20px 600, lh 1.2 |
| Pick name | Playfair 21px 600 (first pick) / 19px 600 (the rest), lh 1.25; vintage inline in italic 400 |
| Wine row name | Playfair 17px 400, lh 1.35 |
| Setting / rating-list label | Playfair 17px / 19px 400, lh 1.3 |
| Somm note | Playfair italic, 14px (home rows), 14.5px (picks), 16px (wine page), lh 1.5–1.55, in curly quotes |
| Epithet / prose | Playfair italic 14–16px, burgundy for epithets, ink 0.65–0.8 for prose |
| Section numeral | Playfair italic 16px burgundy (row numerals: 15px) |
| Small caps label | Source Sans 10px 700, uppercase, letter-spacing 0.24em (section heads) / 0.22em (eyebrows) / 0.2em (field labels) / 0.16em (date line) |
| Meta line | Source Sans 10px 600, uppercase, letter-spacing 0.14em, ink 0.45 |
| Body / sub | Source Sans 13px, lh 1.5, ink 0.55; page subtitles 15px |
| Text action | Source Sans 13px 600 |
| Field (sans) | Source Sans 16–17px (never below 16) |
| Toast | Source Sans 13px 600, lh 1.4 |

**Spacing.** Page gutter 28px each side (auth pages 36px). Column `max-width: 560px` centered (auth 400px). Section heads sit 30–34px below the previous block (22px when directly under a page header). Primary entries in a group are 22px apart. Rows carry their own vertical padding (13–18px).

**Radii.** Only rating tiles (12px), pills (100px) and circles. Everything else is square: fields, rows and sections are ruled, not boxed. **No cards** on any House List page.

**Shadows** (tinted, as today): filled circle `0 6px 20px rgba(139,35,50,0.3)`; burgundy pills `0 6px 20px rgba(139,35,50,0.25)`; toast `0 4px 20px rgba(27,61,47,0.3)`.

**Motion.** Interactive elements `transition: all 0.15s ease`. Progress fills and the Palate rails use `cubic-bezier(0.22,1,0.36,1)` (0.9s for Building now bars). The reading bar transitions over 2.3s. Row state changes such as fading a passed row or quieting unchosen picks: `opacity 0.3s ease`. Mount reveals: fade + 10px rise. No bounces, no scale effects.

## 7. Shared components (`src/components/house/`)

Each is a small presentational component with inline styles. Values are exact.

### 7.1 Divider (✦)
`display:flex; align-items:center; gap:14px`. Two `flex:1; height:1px; background:rgba(27,61,47,0.14)` rules around a `✦` (10px, `#8B2332`). Decorative (`aria-hidden`).

### 7.2 SectionHead
Props: `numeral` ("I."…), `label`. `display:flex; align-items:center; gap:10px`. Numeral: Playfair italic 16px `#8B2332`. Label: Source Sans 10px 700, uppercase, ls 0.24em, ink 0.5, nowrap. Rule: `flex:1; height:1px; background:rgba(27,61,47,0.1)`.
**Numbering rule:** numerals are assigned at render time in display order, counting only sections that render. A hidden conditional section never consumes a numeral. Home rec rows use lowercase numerals (i., ii., …).
Margin: set by the parent (typically `30px 0 16px` before an entry, `30px 0 2px` before rows, `30px 0 12px` before prose).

### 7.3 LeaderEntry (primary action)
A real `<a>` or `<button>`, with the whole row as the hit area. `display:flex; align-items:flex-end; gap:10px`.
- Label: Playfair 24px (or 22px) 600, ink, lh 1.1, nowrap.
- Leader: `flex:1; min-width:12px; border-bottom:2px dotted rgba(27,61,47,0.25); margin-bottom:9px`.
- Mark: 48px circle, centered content, emoji 20px (or `→` Source Sans 20px `#F5F0E8`).
  - `filled`: background `linear-gradient(135deg,#8B2332,#7A1E2C)`, shadow `0 6px 20px rgba(139,35,50,0.3)`. One per page: the primary action.
  - `outline`: `border:1.5px solid rgba(139,35,50,0.3); background:rgba(139,35,50,0.04)`. Alternatives.
- Optional sub line under it: Source Sans 13px, ink 0.55, lh 1.5, `margin-top:6px` (8px on home).
- `disabled`: `opacity:0.35`, not clickable (transition opacity 0.15s).
- Secondary variant (Log saved links): Playfair 20px 600, `1.5px dotted` leader (`margin-bottom:6px`), mark is a `›` (Source Sans 18px burgundy) instead of a circle.

### 7.4 WineRow
The one row for a wine in any list (home recs, journal, search, log lists, same-vein).
- Line 1: `display:flex; align-items:flex-end; gap:8px`. Name (Playfair 17px, lh 1.35, wraps freely). Leader (`flex:1; min-width:14px; border-bottom:1.5px dotted rgba(27,61,47,0.25); margin-bottom:6px`). Right slot, one of: vintage (Playfair italic 15px ink 0.7), rating emoji (15px), `Log it ›` (Source Sans 12px 700 burgundy), or `›` (Source Sans 16px burgundy).
  - **A leader only renders when something sits at its end.** No vintage and no right slot means no dots.
- Line 2 (meta), `margin-top:6px; display:flex; justify-content:space-between; gap:10px`. Source Sans 10px 600 uppercase ls 0.14em. Left: ink 0.45 (`REGION · GRAPE`). Right: varies per surface (burgundy 0.8 for match tags, ink 0.45 for dates), nowrap.
- Row: `padding:15px 0; border-bottom:1px solid rgba(27,61,47,0.07)`. The whole row links to the wine page.
- When the name wraps, the leader stays bottom-aligned with the last line (see `screenshots/02`, row i.).
- Variant `numbered` (home recs): a numeral column (Playfair italic 15px burgundy, width 26px, lh 1.5) with `gap:10px`, row padding `18px 0`, divider `0.08`.
- Variant `struck` (passed): name `text-decoration: line-through`, row opacity 0.4 (home) / 0.55 (journal Passed tab).

### 7.5 SettingRow / FactRow
Same skeleton as WineRow line 1. Key: Playfair 17px nowrap (fact rows: 16px). Leader: `1.5px dotted rgba(27,61,47,0.22)`, `margin-bottom:5px`. Value: Source Sans 14px ink 0.7 nowrap (fact rows ink 0.75, right-aligned, may wrap). Optional chevron `›` Source Sans 16px burgundy, **only when the row does something**. Padding `14px 0` (fact rows `11px 0`). Divider `0.07` (facts `0.06`).

### 7.6 RuledField
`border:none; border-bottom:1.5px dotted rgba(27,61,47,0.3); border-radius:0; background:transparent; outline:none; padding:10px 0 8px`. Focus: `border-bottom:1.5px solid #8B2332`. Placeholder color `rgba(27,61,47,0.38)`. Variants:
- `serif`: Playfair italic. 17px (first entry, steer), 16px (journal note, wine note), 20px with padding `12px 0 10px` and underline `0.35` (search fields).
- `sans`: Source Sans 16px (URL) / 17px with underline `0.35` (auth fields).
- `amount`: width 52px, centered, Source Sans 16px, `border-bottom:1.5px solid rgba(27,61,47,0.18)`, padding `6px 0 4px`, `inputMode="numeric"`, digits only.
- Optional label above: Source Sans 10px 700 uppercase ls 0.2em ink 0.5; field `margin-top:2px`. It's a real `<label htmlFor>`.
- Optional trailing round submit (first entry): 44px circle, outline style, `→` Source Sans 18px burgundy.

### 7.7 ChoiceLine (inline single-choice)
A term row (Playfair 18px key + 1.5px dotted leader) ending in options. Options are buttons: Source Sans 14px 700, `padding:10px 0 2px`, `gap:14px`. Selected: `#8B2332` + `border-bottom:1.5px solid #8B2332`. Unselected: `rgba(27,61,47,0.5)`, transparent border. Use `role="radiogroup"` / `aria-checked`.
Journal tabs are a variant: Source Sans 11px 700 uppercase ls 0.16em, with a count in Playfair italic 13px (no transform/tracking). `padding:12px 0 9px`, `border-bottom:2px solid` (selected burgundy / transparent), `margin-bottom:-1px` over a container `border-bottom:1px solid rgba(27,61,47,0.1)`, `gap:20px`.

### 7.8 TextAction
`border:none; background:none; padding:10px 0` (keeps a ≥40px hit area); Source Sans 13px 600; nowrap. Tones: `primary` `#8B2332`; `secondary` ink; `quiet` ink 0.45–0.55. `underlined` quiet links: weight 400, `text-decoration: underline`. Groups lay out with `display:flex; gap:20px` (24–28px in centered groups).

### 7.9 RatingTiles (THE quick rating control; replaces `RatingModal`)
`display:flex; align-items:center; gap:6px`. Prompt first with `margin-right:auto`: "How was it?" in Playfair italic. 14px ink 0.7 on rec rows and picks; 16px ink 0.75 on "From last night"; 17px ink 1 on the wine page, where "Change your verdict" is used when re-rating.
Then four tiles from `RATINGS`: `<button aria-label="Loved it">❤️</button>`… Each is 42px square (46px on "From last night" and the wine page), `border-radius:12px; border:1px solid rgba(27,61,47,0.12); background:rgba(255,255,255,0.55)` (0.5 at 46px), emoji 18px (19px at 46px). Hover/focus-visible: `border-color:rgba(139,35,50,0.3); background:rgba(139,35,50,0.05)`. Transition `all 0.15s ease`. Tapping a tile rates immediately; there is no confirm.
**Done line** after any rec/pick action: Source Sans 13px 600 `#8B2332`, lh 1.45, `margin-top:10px`.

### 7.10 RatingList (Log a bottle only)
Four full-width `role="radio"` buttons: `display:flex; align-items:center; gap:12px; padding:13px 0; border-bottom:1px solid rgba(27,61,47,0.07)`. Each has: emoji 19px in a 26px box; label Playfair 19px nowrap (ink 400, selected `#8B2332` 600); leader (`flex:1; align-self:flex-end; margin-bottom:9px; border-bottom:1.5px dotted rgba(27,61,47,0.2)`); a 22px radio circle with a 1.5px border (`rgba(27,61,47,0.25)`). Selected: border and fill `#8B2332`, with `✓` Source Sans 12px 700 `#F5F0E8`.

### 7.11 RunningHead (inner pages)
`position:sticky; top:0; z-index:30; display:grid; grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr); align-items:center; padding:calc(env(safe-area-inset-top) + 4px) 14px 4px; background:rgba(245,240,232,0.92); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border-bottom:1px solid rgba(27,61,47,0.07)`.
- Left: back button. `display:flex; align-items:center; gap:6px; height:44px; padding:0 8px`; `‹` at 22px (lh 1, `margin-top:-3px`) + label Source Sans 14px 600 `#8B2332`, nowrap. The label is the previous page's title (§9.1).
- Center: `/protea-icon.png` 26px tall in a 44px button, `aria-label="Your list"` → `/`.
- Right: 🔍 (16px) in a 44px button, `aria-label="Search"` → `/search`. On `/search` itself it's invisible and inert (`opacity:0; pointer-events:none`) so the grid stays balanced.
- Shown on every signed-in page except Home and the full-screen states (reading the list, reading a label). Never on auth pages.

### 7.12 ServiceBar
`position:fixed; left:0; right:0; bottom:0; z-index:35`. Inner grid is centered at `max-width:560px`: `grid-template-columns:minmax(0,1fr) 1px minmax(0,1fr); align-items:center; padding:6px 16px calc(env(safe-area-inset-bottom) + 8px)`. Background `rgba(245,240,232,0.94)` + `blur(16px)`, `border-top:1px solid rgba(27,61,47,0.1)`.
Two 48px-tall links, flex-centered with `gap:8px`, Playfair 16px 600, emoji 16px: `📋 Match a list` (`#8B2332`, → `/recommend`) and `📸 Log a bottle` (ink, → `/log`). Divider: `1px × 24px rgba(27,61,47,0.14)`.
Pages that show it add a bottom spacer of `84px + env(safe-area-inset-bottom)`. **Shown on:** `/journal`, `/wine`, `/search`, `/palate`, `/account` (D1).

### 7.13 Toast (+ `useToast`)
Replaces the top-anchored `✓ …` toasts on House List pages. `position:fixed; left:24px; right:24px; bottom:calc(env(safe-area-inset-bottom) + 34px)` (96px when the ServiceBar is showing); `z-index:45; display:flex; justify-content:center; pointer-events:none`. The pill: `padding:11px 18px; border-radius:100px; background:#1B3D2F; color:#F5F0E8`, Source Sans 13px 600 lh 1.4, centered text, shadow `0 4px 20px rgba(27,61,47,0.3)`. Lifetime 2.6s (fade + 10px rise in, fade out). `role="status"`.
Evolution and shift toasts keep their existing copy and sequencing (`evolutionToastMessages`, `shiftToastMessage`: 1.5s offsets, 4s / 5s lifetimes). They queue through the same component and stack upward with 8px between pills.

### 7.14 EmptyState
Centered, `padding:56px 12px 8px`. Emoji 30px. Head: Playfair 22px 600 lh 1.25, `margin-top:14px`, balance. Sub: Source Sans 14px lh 1.55 ink 0.6, `margin-top:8px`, pretty. Optional action pill: 44px tall, `padding:0 22px`, radius 100, burgundy gradient, shadow `0 6px 20px rgba(139,35,50,0.25)`, Source Sans 14px 700 cream.

### 7.15 Rail (palate signature)
`display:grid; grid-template-columns:82px minmax(0,1fr) 82px; align-items:center; gap:12px`. End labels: Source Sans 10px 600 uppercase ls 0.12em ink 0.55 (left label right-aligned). Track: `position:relative; height:1px; background:rgba(27,61,47,0.2)`. Marker: 9px square `#8B2332`, `transform:rotate(45deg)`, centered on the value (`left:X%; margin:-4px 0 0 -4.5px`), with `box-shadow:0 0 0 3px #F5F0E8` to knock the rule out around it. Rails are 16px apart.

### 7.16 ProgressLine
Track `height:3px; border-radius:3px; background:rgba(107,143,94,0.18); overflow:hidden`; fill `#6B8F5E`, width transition 0.9s soft-out. The reading variant is `180px × 2px`, track `rgba(27,61,47,0.1)`.

## 8. Screens

Every screen below lists its route, layout from top to bottom, exact copy, states and data. Copy in quotes is verbatim. `{braces}` mark live values. Screenshot numbers refer to `screenshots/` (§15).

### 8.1 Home: `/` (signed in, profile exists). Screens 01–04

Page padding: `calc(env(safe-area-inset-top) + 8px) 28px 56px`. No RunningHead, no ServiceBar.

**8.1.1 Masthead.** `display:grid; grid-template-columns:44px minmax(0,1fr) 44px; align-items:center; margin:0 -10px`.
- Left: 🔍 (16px) in a 44px button, `aria-label="Search"` → `/search`.
- Center: protea icon 22px tall + "SOMMEASY" (Source Sans 10px 700, ls 0.36em, uppercase, `#8B2332`), `gap:8px`, centered. Decorative, not a link.
- Right: 44px button `aria-label="Account"` → `/account`. Inside it, a 30px circle with `border:1px solid rgba(139,35,50,0.3)` holding one initial in Playfair italic 14px `#8B2332`. The initial is `user_metadata.name[0]`, falling back to the first letter of the email, uppercased.

**8.1.2 Crest.** Centered. One `<a href="/palate" data-testid="palate-strip">` wraps the mark, label, title and epithet.
- `PalateMark` 76px (`profile.identity.genome`), `margin-top:18px`. A missing genome degrades to text-only, as today.
- "PREPARED FOR": Source Sans 10px 600, ls 0.3em, uppercase, ink 0.45, `margin-top:16px`.
- Title `{profile.archetype}`: Playfair 28px 700, `margin-top:8px`.
- Epithet: Playfair italic 14px `#8B2332`, `margin-top:8px`. Established users: `profile.identity?.epithet || signatureLine(profile)`, the strip's current logic. New users (§8.1.5): "Your first list — it rewrites itself as you rate".

**8.1.3 Date line.** Divider (`margin-top:22px`), then `display:flex; justify-content:space-between; align-items:center`, Source Sans 10px 700 uppercase ls 0.16em.
- Left (ink 0.45): today's date, e.g. "Wednesday, September 30" (`en-US`, weekday long, month long, day numeric).
  - **Whisper (for Ed's review):** when the existing `loadWhisper` finds a promotion or shift in the last 30 days, it takes the date's place: "🧬 Chenin Blanc just joined your DNA" / "✨ You became The Mosel Purist" (ink 0.65, single line, ellipsis).
- Right: "Your palate ›" (burgundy, `padding:12px 0`) → `/palate`.

**8.1.4 Welcome back.** Only when the existing pending-palate fold-in just landed (`welcomeBack`). Centered Playfair italic 15px ink 0.75, `margin-top:18px`, fade + 10px rise (0.7s soft-out): "Welcome back. Your palate was waiting." Keep `data-testid="welcome-back"`.

**8.1.5 Sections.** Which layout renders depends on whether the user has rated anything. Use `resolveFirstPourCards` (keep `firstPour.js` and its tests): if the result includes `'rate-one'`, show the **new-user layout**. If the read fails (`null`), show the **established layout**: onboarding is a courtesy, never a guess. Render neither section II variant until the read settles. Retire the First Pour cards and `FIRST_POUR_COPY`.

*Established layout* (screens 01, 02):
- **I. TONIGHT, OUT** (head margin `22px 0 16px`). Filled LeaderEntry 📋 "Match the wine list" → `/recommend`. Sub: "Photo, paste or link — we’ll find your bottle."
- **II. TONIGHT, IN** (`32px 0 16px`). Outline LeaderEntry 📸 "Log a bottle" → `/log`. Sub: "Snap the label and rate it — every rating sharpens your DNA."
- **III. FROM LAST NIGHT.** Only when the Table Verdict ask is due: the existing `loadVerdictAsk` / `resolveOutstandingVerdict`. It still renders only after `verdictLoaded`. Keep `data-testid="verdict-ask"` on the section.
  - WineRow for `verdictAsk.wine`: base name … vintage (`splitVintage`). Meta: "ORDERED AT THE TABLE", prefixed with the journal row's `resolved_region` when known ("HEMEL-EN-AARDE · ORDERED AT THE TABLE"). The row links to `/wine?name=`.
  - RatingTiles (46px), prompt "How was it?" (Playfair italic 16px ink 0.75), `margin-top:14px`. A tile calls the existing `handleVerdictRate(rating)`.
  - **For Ed's review:** a quiet TextAction "Not tonight" under the tiles calls `handleVerdictDismiss`. The existing Skip, kept as `data-testid="verdict-dismiss"`.
  - After rating, the tiles become a reply in Playfair italic 15px `#8B2332`, lh 1.5, `margin-top:12px`: "{emoji} {label} — noted. {consequence}". The consequence is the first that applies:
    1. A promotion → "{displayName} just joined your DNA."
    2. A loved rating whose closest un-promoted dimension is known → "{name} is now {n} loved bottles from joining your DNA." (`n` = ceil((threshold − points) ÷ loved points), from `dnaThresholds.js`; written "two", "three"…)
    3. Otherwise by rating: loved "Loved bottles pull hardest — your next picks will lean its way." · liked "A gentle nudge — your DNA leans a little its way." · fine "We’ll weigh it lightly next time." · not for me "We’ll steer you around it next time."
  - The section stays until the next load.
- **IV. CHOSEN FOR YOUR PALATE** (`34px 0 2px`, numeral III. when there's no verdict ask). Rec rows (§8.1.6).

*New-user layout* (screens 03, 04):
- **I. TONIGHT, OUT.** Same entry. Sub: "Photo, paste or link — we’ll pick a top bottle, a value and an adventure."
- **II. YOUR FIRST ENTRY.**
  - Line: "Name a bottle you already love" (Playfair 21px 600, lh 1.25).
  - RuledField serif 17px, placeholder "Cloudy Bay Sauvignon Blanc…", `margin-top:6px`, with a trailing 44px outline `→` (`aria-label="Find it"`). Enter or `→` goes to `/log?q={text}` (empty → `/log`).
  - Then Source Sans 13px lh 1.5, `margin-top:10px`: "Or " (ink 0.55) + "📸 snap tonight’s label" (burgundy 600, → `/log`) + ". One rating and the Somm rewrites this list around you." (ink 0.55).
  - Test ids: `first-entry`, `first-entry-input`, `first-entry-submit`, `first-entry-snap`.
- **III. CHOSEN FROM YOUR QUIZ.** Recs i.–ii., then two **Reserved** rows (iii., iv.), then the caption.
  - Reserved row: numbered row with the numeral at opacity 0.5. No name. The leader fills the row (`1.5px dotted rgba(27,61,47,0.2)`) and ends in "Reserved" (Playfair italic 14px ink 0.4).
  - Caption: centered Playfair italic 14px ink 0.55, `margin-top:16px`: "Two more selections open after your first rating."
  - **The first rating anywhere this session** (a rec here, or a Log a bottle save) swaps the Reserved rows for recs iii.–iv. in place and removes the caption. Section II stays put until the next load, so the page doesn't rearrange under the user's thumb. The next load uses the established layout.

**8.1.6 Recommendation rows** (`WineRecList`, restyled; also used by the post-quiz reveal). Screens 01, 02, 04.
- Data: `profile.recommendations` (`{ wine, why, matchType }`). Show recs that were un-actioned at load, **limit 4** (was 5). Drop the "N more wines to explore" line.
- Numbered WineRow (`data-testid="rec-card"` per row, `wine-rec-list` on the list):
  - Name: `splitVintage(rec.wine).base`. Right slot: the vintage, if there is one.
  - Meta left: "REGION · GRAPE" from `resolveWine(rec.wine)` when it resolves at or above `CONFIDENCE_GATE` (check the resolver's actual API). Omit it when unresolved.
  - Meta right (burgundy 0.8) from `matchType`: `region + grape` → "📍 Region + grape" · `grape` → "🍇 Grape match" · `region` → "📍 Region match" · otherwise "🧭 Discovery".
  - Note: “{rec.why}”, Playfair italic 14px ink 0.72 lh 1.5, `margin-top:8px`.
  - The name links to `/wine?name={rec.wine}`.
- Actions (`gap:20px; margin-top:4px`): "🍷 Had it" (primary) opens RatingTiles (42px) in place of the actions. "📌 Want it" (secondary) saves a want. "👋 Pass" (quiet 0.45) saves a skip. Same `saveInteraction` path, same events (`rec_rated` / `wine_wanted` / `wine_skipped`, surface `home` or `reveal`).
- Done lines replace the actions after each action (§7.9):
  - want: "📌 On your want list — we’ll flag it when it turns up on a menu."
  - skip: "👋 Struck from your list." The row is also struck (opacity 0.4, name line-through).
  - rated: "{emoji} {label} — noted in your journal."
- These lines replace the "Noted!" / "Added to your list!" / "Removed" toasts. Evolution and shift toasts stay.
- Rows actioned this session stay visible. On the next load they're filtered out (existing behavior).
- Anonymous teaser rows are read-only, with no action line (existing `readOnly`).
- **Empty** (every rec actioned at load): EmptyState with 🎉 · "You've reviewed all your wines" · "Your best picks now come from real menus — share a wine list and we'll match it to your palate." · pill "📋 Match a wine list" → `/recommend` · quiet underlined "or adjust your quiz answers" → `/?quiz=refine`.

**8.1.7 Footer.**
- Divider (`margin-top:36px`).
- Centered links, `gap:22px`, Source Sans 13px 600 burgundy, `padding:12px 0`: "Your palate" → `/palate` · "Journal · {n}" → `/journal` (`n` = count of `had` rows; just "Journal" at 0) · "Account" → `/account`.
- Tagline: Playfair italic 12px ink 0.4, centered, `margin-top:8px`: "Never guess at a wine list again."

**Remove from home:** the header Sign Out button (it moves to Account), the burgundy "Get your picks" hero, the green DNA strip card, the Log a Bottle card module and the "🍷 Wine Journal →" pill. Each is replaced by the elements above.

### 8.2 Log a bottle: `/log` (new). Screens 11–15

RunningHead. No ServiceBar. Padding `22px 28px 56px`. One client page with steps `find → search | scanning → rate → saved`. Scroll to top on every step change. `?q=` (read as a server prop) opens the search step pre-filled. Move the bottle-logging code out of `page.js`: `handleBottlePhoto`, `compressImage` → `POST /api/scan-label`, and `handleBottleSave`. Keep its semantics exactly.

Hidden inputs (keep the ids): `bottle-camera-input` (`accept="image/*" capture="environment"`) and `bottle-gallery-input` (`accept="image/*"`).

**Find** (screen 11).
- h1 "Log a bottle". Sub (15px ink 0.55, `margin-top:8px`): "Snap the label and rate it — every rating sharpens your DNA."
- **I. FIND THE BOTTLE** (`30px 0 16px`):
  - Filled 22px LeaderEntry 📸 "Snap the label" → camera input. Sub: "Front label, straight on — we’ll read the rest."
  - Outline 🔍 "Search by name" → search step. Sub: "Producer, grape or a few words from the label."
  - Outline 🖼 "Choose from photos" → gallery input. Sub: "For the bottle you photographed and never logged."
  - Entries are 22px apart. On desktop (the existing `isMobile` check is false), hide "Snap the label" and make the gallery entry the filled one, labelled "Upload a label photo".
- A failed scan returns here with the existing error copy above section I, as a Playfair italic 14px burgundy line, `role="alert"`, `data-testid="bottle-error"`.
- **II. FROM YOUR WANT LIST** (`34px 0 2px`). Only when the user has `want` rows, newest first. WineRow: name … "Log it ›"; meta "📌 {REGION · GRAPE}" from `resolved_*`. Tap → rate step (source `want`).

**Search** (screen 12).
- h1 "Search by name".
- RuledField serif 20px (search style), autofocused, placeholder "Producer, grape, a word from the label".
- While empty: hint (Source Sans 13px ink 0.5, `margin-top:12px`) "Try “Ken Forrester”, “Chenin” or “Swartland”."
- Results (max 6): WineRow, name + vintage … the user's mark for that wine if they have a row (❤️ 👍 😐 👎 📌 👋), then "›". Meta "REGION · GRAPE".
  - Sources: the user's journal first, then `src/lib/wineAutocomplete.json`, dynamically imported when this step opens (it's 140KB, like quiz Step 5). Match word-prefix and case-insensitively on name, producer, region and grape.
- No results: Playfair italic 15px ink 0.7, `margin-top:16px`: "Nothing on our list by that name yet — try the producer, or snap the label." **For Ed's review:** under it, a WineRow "Log “{q}” as written ›" → rate step with the typed name.
- Actions (`gap:24px; margin-top:18px`): "📸 Snap the label instead" (primary, 700) and "Back" (quiet) → find.

**Scanning** (screen 13; `data-testid="bottle-processing"`). Shown while `/api/scan-label` runs. Centered column, `min-height:640px`:
- 📸 at 34px.
- "READING THE LABEL" (Source Sans 10px 700 ls 0.24em burgundy, `margin-top:22px`).
- "Producer, vintage, grape…" (Playfair italic 21px, `margin-top:12px`).
- ProgressLine (reading variant, `margin-top:20px`): eases toward 90% over 1.6s and completes on response.
- "Cancel" (quiet, `margin-top:32px`): ignore the response and go back to find.

**Rate** (screen 14; `data-testid="bottle-confirm"`).
- Eyebrow (Source Sans 10px 700 ls 0.22em burgundy) by source: "📸 Label read" · "🖼 Read from your photo" · "🔍 Found it" · "📌 From your want list".
- Name: Playfair 27px 700, `margin-top:10px`. Base name + vintage inline in Playfair italic 400 `#8B2332`.
  - **For Ed's review:** the name is editable. It's a borderless auto-growing textarea in the same type, dotted underline on focus only. It keeps `data-testid="bottle-wine-name"`. OCR misreads need a fast fix, which the old confirm step had.
- Meta row (`margin-top:4px`, space-between): "REGION · GRAPE" (or the scan's region/country) in ink 0.45, and "Not it? Search" (12px primary) → search step.
- **I. HOW WAS IT?** (`22px 0 2px`): RatingList.
- **II. THE PARTICULARS** (`28px 0 8px`):
  - ChoiceLine "Where" … "At home" · "Out". Default At home. Saves to `place` (`home` | `out`).
  - RuledField serif 16px, `margin-top:14px`, placeholder "A line for your journal (optional)". Trimmed, ≤500 chars. Saves to `note`.
- Filled 24px LeaderEntry `→` "Save to journal", `margin-top:34px`. Disabled (opacity 0.35) until a rating is picked.
- Saving runs the existing `handleBottleSave` path unchanged: previousRating read → upsert `had`+rating → `resolveAndAccumulate` → `maybeRecomposeIdentity` → `bottle_logged` → `specific_wines` update. `note` and `place` go in the same upsert.
- Don't show "Added to your collection!" or the evolution toasts here. The saved step is the celebration. Record everything as today.
- On failure: an alert line above the Save entry, "Couldn't save — please try again.", and stay on this step.

**Saved** (screen 15). Centered block, `padding-top:18px`.
- `PalateMark` 132px. Re-read `identity.genome` after the recompose so the bloom visibly grows.
- Eyebrow (`margin-top:22px`): promotion → "🧬 Your DNA just grew" · shift → "✨ Your palate shifted" · otherwise "{emoji} {label}".
- Headline (27px 700, `margin-top:10px`): shift → "You became {title}" · promotion → "{displayName} just joined your DNA" · the user's first rated bottle ever → "Your first entry is in" · otherwise "Noted in your journal".
- Sub (Playfair italic 15px ink 0.7, lh 1.55, `margin-top:10px`):
  - promotion → "{N} loved bottles made the case — we’ll look for it on every list you scan." (`N` from the dimension's threshold; 2 for estates).
  - shift → the new epithet.
  - first → "The Somm just rewrote your list around it — two more selections are open."
  - otherwise: loved "Loved bottles pull hardest — your next picks will lean its way." · liked "A gentle nudge — your DNA leans a little its way." · fine "We’ll weigh it lightly next time." · not for me "We’ll steer you around it next time."
  - With both a shift and promotions, the shift takes the headline and each promotion appears as a "🧬 {name} joined your DNA" line under the recap.
- Recap (`margin-top:26px; padding:16px 0`, top and bottom rules `rgba(27,61,47,0.1)`): WineRow "{name} {vintage}" … rating emoji; meta "REGION · GRAPE · TODAY".
- Secondary entries (first at `margin-top:28px`, then 22px apart):
  - "See it in your palate ›" → `/palate`
  - "Log another bottle ›" → reset to find
  - "Back to your list ›" → `/`

**Redirects and links:** `page.js` turns `/?log=1` into `router.replace('/log')`, so old links keep working. `bypass-log-link` (recommend) and `palate-empty-log-link` (PalateView) now point at `/log`.

### 8.3 Match & picks: `/recommend` (restyle). Screens 05–10

Keep all existing logic: scan / PDF / URL (`safeFetch`) / paste paths, `runAnalysis`, `curatePicks`, Ask the Somm with silent fallback, session ids, choose / replace / bypass and the wishlist cleanup, multi-page scans, `handleRefilter`, and the steer with its caps. Only presentation changes, plus the items marked here.

**Input** (screens 05, 06). RunningHead. Padding `22px 28px 56px`.
- h1 "Match the wine list". Sub: "Share a wine list and we’ll find your best matches."
- **I. BRING THE LIST** (`30px 0 16px`):
  - Filled 22px 📸 "Photograph the list" (`scan-button`). Sub: "Take a photo of the wine list." On mobile it opens a camera input (`capture="environment"`). On desktop it opens the existing picker.
  - Outline 🖼 "Upload a picture" opens the existing `file-input-scan` (`image/*,application/pdf`). Sub: "A screenshot of an online list works too."
  - Outline 🔗 "Paste a link" toggles the URL row.
    - Closed sub: "Got a link to the wine list? Drop it here."
    - Open: RuledField sans 16px, `inputMode="url"`, placeholder "https://…" (`url-input`). Beside it, the pill "Get my picks" (`url-fetch-button`): 40px tall, `padding:0 16px`, Source Sans 13px 700. Disabled until non-empty: bg `rgba(139,35,50,0.15)`, text `rgba(139,35,50,0.45)`. Enabled: gradient + cream.
  - Quiet underlined "or paste the text manually" (`paste-mode-toggle`, `margin-top:14px`). It reveals a borderless textarea (`wine-list-textarea`, Source Sans 16px, min 6 rows, dotted bottom rule) and a "Get my picks" pill (`analyze-button`).
- **II. TONIGHT’S TERMS** (`24px 0 10px`):
  - ChoiceLine "Color" … All · Red · White · Sparkling (the existing `all/red/white/sparkling` options; **for Ed's review:** Sparkling is a fourth option the prototype didn't draw).
  - "Spend" … "$" [min] "to $" [max], `margin-top:16px`. Amount fields. The "$" / "to $" are Source Sans 14px ink 0.45, `padding-bottom:6px`.
  - "Steer the Somm" (Playfair 18px) + "optional" (Playfair italic 13px ink 0.45), `margin-top:24px`.
    - RuledField serif 17px, full width (`steer-input`), placeholder "A grape, a place, a mood…".
    - Helper (Source Sans 12px ink 0.5, `margin-top:8px`): "Try “something South African”, “no Chardonnay”, or “big reds for a steak night”."
  - Color and Spend start from `wine_profiles.preferences` (D8) when set. Otherwise All / empty.
- Errors (`error-message`): Playfair italic 14px burgundy above section I, `role="alert"`, existing copy.

**Reading** (screen 07; `processing-spinner` moves here). Full-height centered column, `padding:0 44px`, no RunningHead.
- `PalateMark` 96px.
- "🍷 THE SOMM IS READING" (burgundy small caps 0.24em, `margin-top:28px`).
- Line (Playfair italic 22px lh 1.35, `margin-top:12px; min-height:60px`), following real progress: "Reading the list…" → "Reading {n} wines…" (once the parse returns) → "Weighing them against your DNA…" → "{N} bottles, {N} kinds of yes." (written as a word; shown as results appear).
- ProgressLine 180×2 (`margin-top:14px`): eases to 90% and completes on results.
- "Cancel" (quiet, `margin-top:36px`) → back to Input with everything kept.

**Your picks** (screens 08–10). RunningHead (back label "Match a list" → Input).
- h1 "Your picks" (`results-heading`). Sub: "{n} wines — here’s where to start".
- **Terms bar** (`margin-top:16px; padding:6px 0`, top and bottom rules `rgba(27,61,47,0.1)`, space-between):
  - Left (Source Sans 10px 600 ls 0.14em uppercase ink 0.55): "{All wines|Reds|Whites|Sparkling} · {$40–$90|Up to $90|From $40|Any price} · {“steer”|No steer}".
  - Right: "Adjust ›" (12px 700 burgundy).
  - **For Ed's review:** Adjust opens Tonight's terms *in place* under the bar instead of going back. Changes refilter instantly through `handleRefilter`. The steer field there is `steer-input-results`, and "🍷 Ask the Somm again" (`ask-somm-again`) appears once the steer changes.
- **The Somm says** (`somm-summary`, centered, `margin-top:28px`): "🍷 THE SOMM SAYS" (burgundy small caps 0.22em), then the summary in Playfair italic 16px lh 1.55, `margin-top:10px`.
  - While curating (`somm-thinking`): the same eyebrow over "The Somm is tasting…" (Playfair italic 15px ink 0.55).
  - On fallback: omit the block.
- **Each pick** (`picks-container` → `pick-card`):
  - SectionHead with numeral (I., II., …) and the existing role label with its emoji ("🏆 TOP PICK", "💰 GREAT VALUE", "🧭 ADVENTURE", …), margin `32px 0 14px`.
  - Name line: Playfair 600, 21px for the first pick and 19px after, + " " + vintage in italic 400 … leader … price (Playfair 18px, "$78").
  - Meta "REGION · GRAPE" (`margin-top:6px`).
  - **Flag line** (burgundy small caps 700, `margin-top:6px`) when the user already knows the wine, matched by normalized name: rated → "{emoji} {Label} in {Month}" (journal `updated_at`); want → "📌 On your want list". This is what makes "we’ll flag it when it turns up on a menu" true.
  - Note (`somm-note`): Playfair italic 14.5px ink 0.75 lh 1.55, quoted, `margin-top:10px`. Show the algorithmic note until the Somm's lands, then swap in place.
  - Actions: "🥂 This one’s on the table" (`choose-pick`, primary) and "Had it? Rate it" (secondary 0.55). Rate opens RatingTiles (42px) under the pick and uses the existing pick-rating path (`pick_rated`). A pick the user already rated shows only the choose action.
  - **Chosen** (`chosen-banner`): the actions become a pill (`margin-top:14px; padding:12px 18px`, radius 100, gradient, shadow 0.25) reading "🥂 On the table tonight" (13px 700 cream) with a right-aligned text button (12px 600 cream 0.8).
    - **For Ed's review:** the prototype labels that button "Undo". Ship it as **"Change"**: it brings back the choose buttons so another pick can replace this one (the existing `replaced` semantics). Nothing is un-chosen until another pick is chosen.
    - The other picks fade to opacity 0.45 (0.3s).
    - Below the list: "We’ll ask how it drank tomorrow morning." (centered Playfair italic 14px ink 0.6, `margin-top:24px`).
    - Choose toast: "🥂 Noted — enjoy it" (replaces "On the table — tell me how it was later.").
- **Footer:**
  - Divider (`margin-top:36px`).
  - Quiet underlined "We went a different way tonight" (`bypass-somm`). It opens `bypass-noted`:
    - Centered Playfair italic 15px lh 1.55, `margin-top:20px`: "Fair enough — the table calls it. Log what you drank and your palate still gets the night."
    - Row (`gap:28px`): "📸 Log what you drank" (primary 700, `bypass-log-link` → `/log`) · "Skip" (quiet, `bypass-skip`).
  - Then, centered and stacked:
    - "📸 Add another page" (secondary; the existing "Scan another page" via `file-input-add-page`; **for Ed's review**)
    - "📋 Scan another list" (primary, `scan-again-button`: existing reset + session re-mint)

### 8.4 Journal: `/journal` (restyle). Screens 16–18

RunningHead and ServiceBar. Padding `22px 28px 56px`. Existing queries.
- h1 "Journal". Sub: "Your tasting history and wishlist".
- **Tabs** (ChoiceLine tab variant, `margin-top:20px`): "TRIED {n}" · "WANT {n}" · "PASSED {n}" · "TIMELINE". Keep the tab ids and the `?tab=` deep link values (`tried`, `want`, `skipped`, `timeline`). Only the labels change ("Want to Try" → "Want", "Skipped" → "Passed").
- **Tried** — rated `had` rows, newest `updated_at` first, grouped by month:
  - Month head (`display:flex; align-items:baseline; gap:10px; margin:26px 0 2px`): month in Playfair italic 18px burgundy ("September"; "September 2025" outside the current year) · rule (1px 0.1) · count small caps ink 0.45 ("4 bottles").
  - Rows (WineRow): name + vintage … rating emoji.
  - Meta left: "REGION · GRAPE" from `resolved_*`, or "REGION · VERDICT PENDING" for a legacy `had` row with no rating.
  - Meta right: "🍷 SOMM PICK · AUG 1" in burgundy when `somm_pick_role` is set; otherwise the date ("AUG 1", "TODAY") in ink 0.45.
  - The row links to the wine page.
- **Want** and **Passed**: a flat list (10px top spacer).
  - Want rows: meta right "SAVED {date}".
  - Passed rows are struck (opacity 0.55, line-through).
- **Timeline**: the existing `dna_timeline` rows, newest first, plus the founding row "🎉 Your palate began — quiz complete".
  - Row (`padding:15px 0`): emoji 15px in a 22px column · text (Playfair 16px lh 1.4, **700 for identity shifts**) · leader · date (small caps ink 0.45).
  - Lines: promoted "🧬 {name} joined your DNA / estates / regions" · demoted "🍂 {name} left your …" · shifted "✨ You became {title}". Reuse the existing line builder if there is one.
  - A row with a `wine_name` (§10.1) links to that wine's page; others link to `/palate`.
  - Under the list: "🧬 See what’s building in your palate →" (primary, centered, `margin-top:16px`) → `/palate`.
- **Empty tabs** (EmptyState):
  - Tried: 🍷 · "The first page is always blank" · "Rate a bottle you know and it starts here — every rating sharpens your DNA." · pill "📸 Log a bottle" → `/log`.
  - Want: 📌 · "Nothing waiting yet" · "Tap 📌 Want it on any pick and it waits here. We’ll flag it when it turns up on a menu."
  - Passed: 👋 · "Nothing struck off" · "Pass on a pick and it lands here, so the Somm knows to steer around it."
- **Stats** (every tab except Timeline, when tried > 0): Divider (`margin-top:34px`), then centered Playfair italic 15px ink 0.65, `margin-top:12px`: "{t} tried · {l} loved · {w} to try".
- The rows no longer carry inline actions. Re-rate, delete and the Somm note move to the wine page (§8.5). `journal-somm-note` moves with them.

### 8.5 A wine's page: `/wine?name={wine_name}` (new). Screens 19–21

The server page reads `searchParams.name` as a prop, the auth pages' pattern. RunningHead and ServiceBar. Padding `26px 28px 56px`.
- Data:
  - The user's `wine_interactions` row for `(user_id, wine_name)` (the table's unique key), possibly none.
  - `profile.recommendations` entry with `wine === name`, for wines not yet in the journal.
  - `dna_timeline` rows with `wine_name = name`.
  - For meta and facts: `resolved_*`, falling back to `resolveWine(name)` at or above the gate.
- Unknown name with no row and no rec: EmptyState 🍷 · "We couldn’t find that bottle" · "It may have left your journal." · link "Back to your list" (**for Ed's review**).

**Header** (centered):
- Meta "{REGION} · {COUNTRY}" (Source Sans 10px 700 ls 0.22em ink 0.5).
- Name (Playfair 28px 700, `margin-top:10px`, balance).
- Vintage (Playfair italic 18px burgundy, `margin-top:6px`).
- Divider (`margin-top:20px`).

**Your standing with this wine**, one of these states:
- *Rated* (screen 19), `margin-top:20px`:
  - "YOUR VERDICT" (Source Sans 10px 700 ls 0.22em ink 0.45).
  - Line (`margin-top:8px`): "{emoji} {Label}" (Playfair 22px 600) … date (Playfair italic 15px ink 0.7; "Today" when it is).
  - Below: where it was drunk (small caps ink 0.45) and "Change" (12px 700 primary) at the right. Where: `place` → "At home" / "Out"; no place but `somm_pick_role` set → "From the list at dinner"; otherwise nothing.
  - "Change" (screen 20) swaps the verdict for RatingTiles (46px) with the prompt "Change your verdict", plus "Keep {emoji} {Label}" (quiet 12px) to cancel. A new tile re-rates through the existing journal re-rate path (differential, `journal_rerated`).
- *Had, no rating* (legacy): RatingTiles with the prompt "How was it?".
- *Want*:
  - "📌 On your want list" (Playfair 20px 600) … "Saved {date}" (Playfair italic 14px ink 0.7).
  - Actions: "🍷 Had it" (opens tiles) · "Remove" (quiet; deletes the want row).
- *Passed*: "👋 Passed" … date, then "Undo" (primary; deletes the skip row).
- *Not in the journal* (screen 21): centered actions (`gap:24px; margin-top:10px`): "🍷 Had it" · "📌 Want it" · "👋 Pass". These use the same `saveInteraction` path as `WineRecList`, with surface `wine_page`. Check that surface value against `wineEvents.js` and its tests.

**Sections** (numbered I., II., … in render order, only when they have content):
- **The Somm** (`30px 0 12px`):
  - Label "THE SOMM SAID" (rated) or "WHY THE SOMM CHOSE IT" (not tried).
  - Note (`journal-somm-note`): Playfair italic 16px ink 0.8 lh 1.55, quoted. It's `somm_note`, or `rec.why`.
  - Role tag (small caps 700 burgundy, `margin-top:8px`): `somm_pick_role` with its emoji, or the rec's match tag.
  - **For Ed's review:** when `occasion` is set, "That night: “{occasion}”" (Source Sans 12px ink 0.55, `margin-top:6px`), as the old journal showed.
- **Your note** (rated or had only; `30px 0 2px`):
  - RuledField serif 16px, placeholder "A line for future you…".
  - Saves `note` on blur and 800ms after typing stops. No confirmation chrome.
- **What it did to your palate** (when linked timeline rows exist): rows with emoji 15px in a 22px column + Playfair 16px lh 1.4, `padding:12px 0`, divider 0.07. Same lines as the journal timeline.
- **The particulars**: FactRows, each only when it has a value:
  - Producer (`resolved_winery`)
  - Region (`resolved_region`, plus ", {resolved_province}" when it differs)
  - Country
  - Grape (`resolved_varietal`)
  - Vintage
  - Style (only from a real data source, e.g. a parsed list's color; otherwise omit)
- **In the same vein**:
  - Up to 2 WineRows (name … vintage; meta "REGION · GRAPE", right: the user's mark).
  - Drawn from `profile.recommendations` ∪ the user's journal: wines sharing this wine's resolved region or grape, excluding itself, not-yet-tried first.
  - Omit the section when there are none.

**Footer:** "Remove from journal" (rated or had only; quiet underlined, centered, `margin-top:26px`). It runs the existing journal delete (delete first, then reverse only what this call removed, then `journal_deleted`), goes back, and toasts "Removed from your journal".

### 8.6 Search: `/search` (new). Screens 22–24

RunningHead (its search button hidden) and ServiceBar. Padding `16px 28px 56px`. Everything is client-side after one load of: `wine_interactions` (all types), `wine_profiles` (DNA arrays + recommendations) and `dna_accumulation` (✦ = promoted and `source = 'auto'`; bottle counts).

- **Field row** (`display:flex; align-items:flex-end; gap:6px`):
  - RuledField serif 20px (search style), autofocused, placeholder "A wine, grape, region or producer" (`search-input`).
  - Clear button: "×" Source Sans 22px in a 40×44 button, `aria-label="Clear"`. Ink 0.5 when there's text; invisible and inert otherwise.
- **No query** (screen 22):
  - **I. RECENT** (only when there are any): the last 5 searches, kept in `localStorage` key `sommeasy.recentSearches`. A search is saved when the user opens a result or presses Enter. Rows: Playfair italic 17px … "›" (burgundy), `padding:13px 0`. Tap → fill the query.
  - **II. BROWSE YOUR DNA**: the user's regions, grapes and estates (not countries). Each is name (+ " ✦" in burgundy when earned) … kind ("REGION" / "GRAPE" / "ESTATE", small caps ink 0.45). Tap → fill the query.
  - Legend (Source Sans 12px ink 0.5, `margin-top:14px`): "✦ earned by your ratings, not the quiz".
- **With a query** (screen 23). Filters as you type, case-insensitive. Groups are numbered only if they render:
  - **IN YOUR JOURNAL · {n}**: every journal row whose name or `resolved_*` matches. WineRow name + vintage … mark; meta left "REGION · GRAPE", right the date. → the wine page.
  - **IN YOUR DNA**: matching DNA entries. Name + ✦ … "{Kind} · {n} bottles" or "{Kind} · from your quiz" (Playfair italic 14px ink 0.65). → `/palate`.
  - **CHOSEN BY THE SOMM**: matching `profile.recommendations` not yet in the journal. WineRow … "›"; meta right is the match tag in burgundy. → the wine page.
- **Nothing found** (screen 24), centered, `padding-top:48px`:
  - "Nothing for “{q}” on our list yet." (Playfair italic 18px lh 1.45, balance)
  - "Try a grape, a region or a producer." (Source Sans 14px ink 0.55, `margin-top:8px`)
  - "📸 Snap the label instead" (primary 700) → `/log`

### 8.7 Your palate: `/palate` (restyle `PalateView`). Screen 25

`PalateView` stays presentation-only, and the anonymous teaser keeps reusing it. RunningHead and ServiceBar for the signed-in view. Padding `24px 28px 56px`. Drop the card styles. Every block becomes a section.

- **Hero** (centered):
  - `PalateMark` 176px (was 192).
  - Title (`palate-archetype`): Playfair 30px 700, `margin-top:16px`, balance.
  - Epithet (`palate-epithet`): Playfair italic 15px burgundy, `margin-top:8px`.
- **Signature** (`palate-signature`):
  - Divider (`margin-top:22px`), then "PALATE SIGNATURE" (burgundy small caps 0.22em, centered, `margin-top:14px`).
  - Three Rails (first `margin-top:18px`): Old World ↔ New World, Focused ↔ Wide-ranging, Red ↔ White. Values come from `palateSignature.js` as today.
  - The concentration phrase: Playfair italic 15px lh 1.5, centered, `margin-top:18px`, balance.
- **I. IN THE SOMM’S WORDS** (`32px 0 12px`): the narrative in Playfair italic 15px lh 1.65 ink 0.78.
- **II. RECENTLY EVOLVED** (`palate-evolution`):
  - The latest 3 timeline rows (the journal's row style).
  - "Full history →" (Source Sans 12px 700 burgundy, `padding-top:12px`) → `/journal?tab=timeline`.
  - The empty state keeps its copy and `palate-empty-rate-link` (→ `/`), styled as a primary TextAction.
- **III. BUILDING NOW** (`palate-building`). Each row:
  - Line 1: name (Playfair 17px) … "{n} loved bottles away" (Playfair italic 14px ink 0.7).
  - Line 2 (`margin-top:8px; gap:12px`): the dimension as a 52px-wide small-caps label (REGION / ESTATE / GRAPE / COUNTRY), then a ProgressLine at `points ÷ threshold`, both from `dnaThresholds.js`.
  - The empty state keeps its copy and `palate-empty-log-link` → `/log`.
- **IV. YOUR DNA** (`palate-dna`):
  - Groups Countries (with flag emoji), Regions, Grapes, Estates. Group label: Playfair italic 15px burgundy, `margin-top:20px`.
  - DNA rows: name + " ✦" when earned … "{n} bottles" or "from your quiz".
  - Then the legend "✦ earned by your ratings, not the quiz".
- **Footer** (centered, `gap:24px; margin-top:24px`), quiet underlined:
  - "Adjust quiz answers" → `/?quiz=refine`
  - "Start fresh" → the confirm in §8.8.4, then `/?quiz=fresh`

### 8.8 Account: `/account` (new). Screen 29

RunningHead and ServiceBar. Padding `24px 28px 48px`. Phase 2 ships just the Sign out action. Phase 6 builds the rest.

**Header** (centered):
- `PalateMark` 60px.
- Name (Playfair 28px 700, `margin-top:12px`): `user_metadata.name`, else the email's local part.
- "MEMBER SINCE {MONTH YEAR}" (Source Sans 10px 600 ls 0.2em ink 0.45, `margin-top:6px`), from the auth user's `created_at`.

**I. YOU** (SettingRows):
- Name … {name}. **For Ed's review:** tapping it opens an inline RuledField (sans 16px). Enter or blur saves through `supabase.auth.updateUser({ data: { name } })`. With no name: "Add your name ›".
- Email … {email}. Read-only, no chevron.
- Password … "Change ›". Calls the existing reset-email call (the one `ForgotPasswordForm` uses, redirecting to `/update-password`), then toasts "✓ Check your inbox — a reset link is on its way". Failures use `authCopy`.

**II. AT THE TABLE** (saved to `wine_profiles.preferences`, D8):
- Currency … "USD $". Static, no chevron.
- Usual spend … "$40 – $90 ›" or "Not set ›". Opens the amount pair inline ("$" [min] "to $" [max]). Saves on blur as `preferences.spend = { min, max }` (numbers or null).
- Color … "All wines ›" / "Reds" / "Whites" / "Sparkling". Opens a ChoiceLine inline. Saves as `preferences.color`.
- There is no Notifications section (D7).

**III. YOUR DATA:**
- Export your journal … "CSV ›". Builds a CSV client-side from the user's `wine_interactions`, then toasts "✓ Journal exported — check your downloads".
  - Columns: `wine_name, interaction_type, rating, note, place, occasion, somm_pick_role, somm_note, resolved_winery, resolved_region, resolved_country, resolved_varietal, created_at, updated_at`.
  - File: `sommeasy-journal-YYYY-MM-DD.csv`.
- Adjust quiz answers … "›" → `/?quiz=refine`.
- Start fresh … "›" → the confirm (§8.8.4).

**Footer:**
- Divider (`margin-top:34px`).
- Centered column (`margin-top:8px`):
  - "Sign out" (Playfair 18px 600 burgundy, `padding:12px 0`). Calls `supabase.auth.signOut()`, then goes to `/login?notice=signed_out`, where AuthForm shows "✓ Signed out" (copy in `authCopy`).
  - "Delete account" (Source Sans 12px ink 0.45, `padding:8px 0`).

**8.8.4 Confirm blocks** (**for Ed's review**; not drawn in the prototype). Each opens in place under its trigger (fade + 10px rise), in Playfair italic 15px ink 0.75 lh 1.55 with a TextAction pair beneath.
- **Start fresh** (`start-fresh`, `start-fresh-confirm`):
  - Copy: "Start over with a blank quiz? What your ratings earned (✦) comes off your palate until you rate those wines again. Your journal stays."
  - Actions: "Start fresh" (primary 700) → `/?quiz=fresh` · "Cancel" (quiet).
  - This copy matches `saveQuizProfile`'s fresh mode: quiz arrays only, `reconcileQuizPromotions` un-flags earned rows, points survive, the journal is untouched.
- **Delete account** (`account-delete`, `account-delete-confirm`):
  - Copy: "Delete your account? This removes your palate, your journal and every bottle you’ve rated — for good."
  - Actions: "Delete everything" (primary 700) · "Keep my account" (quiet).
  - While pending: "Deleting…" with every control disabled.
  - Success: sign out locally, clear the `sommeasy.*` localStorage keys, go to `/?notice=account_deleted`. The Welcome screen shows a Playfair italic line: "Your account is closed. Everything in it is gone."
  - Failure: Playfair italic 14px burgundy, `role="alert"`: "We couldn’t close your account just now. Give it a minute and try again."

### 8.9 Sign in and create account: `/login`, `/signup` (restyle). Screens 26–28

Restyle `AuthShell` (the 400px column, 36px gutters, logo block) and `AuthField` (a RuledField sans 17px with its label). The submit becomes a LeaderEntry: a real `type="submit"` button whose whole row is the target. `/forgot-password` and `/update-password` inherit the new look through the same components, which is fine.

**Keep everything the auth overhaul built:**
- Fields: visible labels, `name`/`id`, `autoComplete` (`current-password` on login, `new-password` on signup and update), `inputMode`, `autoFocus`.
- The password visibility toggle, shown as a "Show"/"Hide" TextAction (12px) at the right end of the password rule.
- The helper "At least 8 characters." (Source Sans 12px ink 0.5, `margin-top:6px`) on password-creating fields.
- Hydration-gated submit, the single `anyPending` switch and the pending copy.
- `role="alert"` errors that take focus.
- The `?error` / `?email` landings.
- The check-inbox state with the 60s resend, and the already-registered state.
- Magic link and Google behind their flags, as quiet TextActions under the entry: "Email me a sign-in link", "Continue with Google".
- `sanitizeNext` everywhere, and the pending-palate metadata carry.

**Sign in** (screens 26, 27):
- Top padding about 112px. Protea 64px with `filter:drop-shadow(0 4px 16px rgba(139,35,50,0.12))`.
- "Sommeasy" (Playfair 34px 700 burgundy, `margin-top:12px`).
- Sub: "Welcome back — your palate’s been waiting." (Source Sans 15px ink 0.55, `margin-top:6px`).
- Divider (`margin-top:30px`).
- EMAIL (placeholder "you@example.com", `margin-top:24px`) and PASSWORD (placeholder "••••••••", `margin-top:22px`).
- Error (`auth-error`): Playfair italic 14px burgundy lh 1.55, `margin-top:16px`. The existing `authCopy` strings.
- Entry "Sign in" with a filled `→` (`margin-top:32px`).
- Links column (`margin-top:30px`): "New here? " (ink 0.55) + "Create an account" (14px 600 primary, keeps `next`), then "Forgot your password?" (13px primary).

**Create account** (screen 28):
- Top padding about 96px. Protea 56px.
- "Create your account" (Playfair 30px 700 ink, `margin-top:14px`).
- Sub: "Save your palate and every bottle you rate."
- Divider (`margin-top:28px`).
- Fields, 20px apart:
  - YOUR NAME (placeholder "What the Somm should call you", `autoComplete="name"`, required, ≤60 chars)
  - EMAIL
  - PASSWORD (placeholder "At least 8 characters", plus the helper)
- The missing-fields error goes in `authCopy`: "We need all three to save your palate — a name, an email and a password."
- Entry "Create account" (`margin-top:30px`).
- "Your quiz answers come with you." (Playfair italic 13px ink 0.55, centered, `margin-top:14px`). Shown **only** when a pending palate exists (`peekStash`).
- "Already have an account? Sign in" (`margin-top:20px`).
- `signUp` sends `options.data = { name, …existing pending_palate payload }`. Keep the 8KB guard.

## 9. Navigation and behavior

**9.1 Back trail** (`src/lib/navTrail.js`).
- Each House List page pushes `{ path, title }` onto a `sessionStorage` trail on mount. It replaces the entry when the path repeats, and the trail is capped at 20.
- Back label: the previous entry's title, or "Your list" when there is none.
- Back action: `router.back()` when the trail has a previous entry (pop it); otherwise `router.push('/')`.
- Titles: `/` "Your list" · `/recommend` "Match a list" (results: "Your picks") · `/log` "Log a bottle" · `/journal` "Journal" · `/wine` "Wine" · `/search` "Search" · `/palate` "Your palate" · `/account` "Account".

**9.2 Scrolling.** Scroll to top on every page and step change (Log steps, Match → Reading → Picks).

**9.3 Real links.** Use `next/link` anchors for navigation, so rows open in new tabs and long-press works. Use buttons for in-page actions.

**9.4 Focus.** Add one rule to `globals.css`: `a:focus-visible, button:focus-visible { outline: 2px solid rgba(139,35,50,0.45); outline-offset: 2px; }`. Fields keep their underline focus (`input:focus { outline: none }` stays).

**9.5 Hover.** Links underline (already global). Tiles as in §7.9. Otherwise only `cursor:pointer`: no lifts, no scale.

**9.6 Loading.** No spinners outside the two reading states. A section renders when its read settles. "Unknown" never renders as "empty", which is the existing verdict/First Pour posture.

**9.7 Wide screens.** Same single column (`max-width:560px`, centered). The RunningHead and ServiceBar backgrounds span the full width, with their inner grids at 560px.

## 10. Data

### 10.1 Migration `012_house_list.sql`

The file is in this package; copy it into `supabase/migrations/`. Ed runs it in the Supabase SQL Editor. Everything is additive and nullable (or has a default), so it can go to production before the branch merges: old code ignores the new columns.

```sql
-- 012_house_list.sql — The House List redesign
-- Run this in your Supabase SQL Editor. Additive only: safe to apply before the branch merges.

-- Journal note + where the bottle was drunk (Log a bottle, the wine page)
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS note TEXT
  CHECK (note IS NULL OR char_length(note) <= 500);
ALTER TABLE wine_interactions ADD COLUMN IF NOT EXISTS place TEXT
  CHECK (place IS NULL OR place IN ('home', 'out'));

-- Account › At the table: pre-fills Tonight's terms on Match
-- Shape: { "spend": { "min": 40, "max": 90 }, "color": "all" | "red" | "white" | "sparkling" }
ALTER TABLE wine_profiles ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Which bottle's rating produced a palate event (the wine page's "What it did to your palate").
-- Nullable: events written before this column stay unlinked and simply don't appear there.
ALTER TABLE dna_timeline ADD COLUMN IF NOT EXISTS wine_name TEXT;
```

- **RLS:** the existing own-row UPDATE policies on `wine_interactions` and `wine_profiles`, and the own-row INSERT policy on `dna_timeline`, already cover these columns. No new policies. `dna_timeline` stays insert-only for the app.
- **Who writes what:**
  - `note` and `place`: the Log save and the wine page's note field.
  - `preferences`: Account.
  - `dna_timeline.wine_name`: the evolution path. Phase 4 passes the rated wine's name into the timeline inserts in `dnaEvolution.js` (promoted/demoted) and `identityRecompose.js` (shifted: the wine whose rating triggered the recompose).
- **Tests to update with it:** the inline mirrors in `dnaEvolution.test.js` and Suite 12's expected event shape. Quiz saves still write **zero** timeline rows.

### 10.2 `POST /api/account/delete` (Phase 6)

```text
export const dynamic = "force-dynamic"
1. checkRateLimit("account-delete")      → 429 with brand copy
2. cookie-session client (@supabase/ssr) → auth.getUser(); no user → 401
3. no SUPABASE_SERVICE_ROLE_KEY          → 503, log "[account] delete failed: no_service_key"
4. admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
           { auth: { persistSession: false, autoRefreshToken: false } })
5. admin.auth.admin.deleteUser(user.id)  → error: 500, log "[account] delete failed: <reason>"
6. log "[account] delete ok"; sign the cookie session out; 200 { ok: true }
```

- The user id comes **only from the session**. Ignore any id in the body.
- The service key is server-only and never `NEXT_PUBLIC_`. Add it to Vercel (Production + Preview) and `.env.local`.
- Deleting the auth user cascades all five tables: `wine_profiles`, `wine_interactions`, `dna_accumulation`, `dna_timeline`, `wine_events`. Removing the owner's `wine_events` rows this way is the one sanctioned exception to append-forever: the database does it, and no DELETE policy is added. `user_roster` follows automatically.
- Client: after a 200, call `supabase.auth.signOut()`, clear `sommeasy.*` localStorage keys, then `router.replace('/?notice=account_deleted')`.
- Unit test it the `authRoutes.test.js` way, with a scripted `fetch` and the alias loader:
  - no session → 401 and the admin API is never called
  - session → `deleteUser` is called with the session's id even when the body carries another
  - missing key → 503

### 10.3 New client keys and params

- `localStorage` `sommeasy.recentSearches`: an array of up to 5 strings.
- `sessionStorage` `sommeasy.navTrail`: the back trail (§9.1).
- New params:
  - `/log?q=` (search pre-fill)
  - `/wine?name=` (the wine page)
  - `/login?notice=signed_out`
  - `/?notice=account_deleted`
- Read all of them as server props, or from `window.location` in an effect (the pattern `page.js` already uses for `?quiz=`). Never `useSearchParams`.

## 11. Tests and test ids

- **Keep every guard listed in CLAUDE.md.** Update selectors and flow steps (most live in `e2e/fixtures/sommeasy-page.ts`). Never loosen an assertion.
- **Keep every existing `data-testid` on its semantic equivalent:**
  - Recommend: `palate-strip` (the crest link), `verdict-ask`, `verdict-dismiss`, `rec-card`, `wine-rec-list`, `welcome-back`, `palate-mark`, all `bottle-*` ids (now on `/log`), and every recommend id (`scan-button`, `file-input-scan`, `file-input-add-page`, `url-input`, `url-fetch-button`, `paste-mode-toggle`, `wine-list-textarea`, `analyze-button`, `processing-spinner`, `results-heading`, `steer-input`, `steer-input-results`, `ask-somm-again`, `somm-summary`, `somm-thinking`, `picks-container`, `pick-card`, `somm-note`, `chosen-banner`, `choose-pick`, `bypass-somm`, `bypass-noted`, `bypass-log-link`, `bypass-skip`, `scan-again-button`, `error-message`).
  - Journal, palate and auth: `journal-somm-note` (now on the wine page), all `palate-*` ids, and all `auth-*` / `reset-*` / `password-updated` ids.
- **Retired:** `verdict-rate` (the tiles replace the button) and the `first-pour-*` ids.
- **New ids:**
  - Navigation: `running-head`, `running-head-back`, `service-bar`.
  - Ratings: `rating-tile-{loved|liked|fine|not_for_me}`.
  - Home: `first-entry`, `first-entry-input`, `first-entry-submit`, `first-entry-snap`, `reserved-row`.
  - Log: `log-find`, `log-search-input`, `log-save`.
  - Wine page: `wine-page`, `wine-verdict`, `wine-change`, `wine-note`, `wine-remove`.
  - Search: `search-input`.
  - Account: `account-export`, `start-fresh`, `start-fresh-confirm`, `account-delete`, `account-delete-confirm`, `account-signout`.
- **Specs that will need updates, by phase:**
  - 2: `first-pour` (the new-user layout replaces the cards; keep the fresh/rich account contract and the rate → retire → journal-delete → resurrect cycle), `table-verdict` (inline tiles; `/?log=1` now lands on `/log`'s find step), `quiz-completion` (reveal ratings use tiles), `palate-handoff`, `wine-events`, `bottle-labels`.
  - 3: `evidence-ledger`, `identity-shift`, `table-verdict`, `wine-lists`, `edge-cases`.
  - 4: every spec that deletes through the journal UI (the delete moves to the wine page).
  - 5: `palate`, `raw-ids` (add `/log`, `/wine`, `/search`, `/account`).
  - 6: `auth-flows` (signup requires a name; the password-manager guard is unchanged).
  - Re-capture `design-screenshots` at the end.
- **New unit tests:** `vintage.test.js`, and the account-delete route (§10.2).
- **Never call the real delete route from e2e.** Intercept it with Playwright, the same way auth mutations are intercepted.
- Each local e2e run makes real Claude calls (about $0.15–0.30, per CLAUDE.md).

## 12. Additions beyond the prototype (for Ed's review)

Each of these is specified above. Build them as written and list them in the session summary so Ed can check them on the preview.

1. Home: the 🧬 whisper takes the date's place on the date line (§8.1.3).
2. Home: "Not tonight" under the From last night tiles (the existing Skip).
3. Home: rec rows show 4, not 5.
4. Log: the detected name is editable; "Log “…” as written" when search finds nothing; "Upload a label photo" on desktop.
5. Match: Sparkling as a fourth Color option (it exists today).
6. Picks:
   - Adjust opens Tonight's terms in place, with Ask the Somm again.
   - "Change" instead of "Undo" on the chosen pill.
   - "📸 Add another page".
   - "The Somm is tasting…" while curating.
7. Wine page: the "That night: …" line; the unknown-wine empty state.
8. Account: Name is editable; Usual spend and Color open inline editors (the prototype just cycled presets).
9. The Start fresh and Delete account confirm copy; the post-delete line; the "✓ Signed out" notice.
10. Saved-screen copy generalized to every dimension ("{N} loved bottles made the case"), plus the shift headline.
11. `dna_timeline.wine_name` (§10.1).
12. US spelling and date formats throughout.

## 13. Out of scope and retired

- **Out of scope:**
  - The signed-out Welcome screen.
  - The quiz steps and the reveal's own layout (only its rec rows change).
  - `/forgot-password` and `/update-password` (they inherit the new auth components).
  - Notifications (D7), email change, currency choice, sharing the palate mark.
  - Every engine, threshold and identity rule.
  - The open "Jardín" resolver case.
- **Retired by this work:**
  - `RatingModal`
  - The top-anchored toasts on House List pages
  - The First Pour cards and their dismiss UI
  - The burgundy hero card, the green DNA strip card, the Log a Bottle card module, the "🍷 Wine Journal →" pill and home's header Sign Out
  - The journal's inline row actions
  - "N more wines to explore"

## 14. Assets

No new images.
- `public/protea-icon.png`: the masthead (22px), running head (26px) and auth pages (64px / 56px).
- `PalateMark` (`src/components/PalateMark.js`, genome → SVG via `src/lib/palateMark.js`) at 76px (home), 96px (reading), 132px (log saved), 176px (palate) and 60px (account). Its geometry and palette are Ed-approved constants; don't change them.
- Emoji are the icon set, as in the design system: 📋 📸 🖼 🔗 🔍 🍷 📌 👋 ❤️ 👍 😐 👎 🥂 🧬 ✨ 🍂 🎉 🏆 💰 🧭 📍 🍇. ✦ and › are type.
- Fonts: Playfair Display and Source Sans 3 from Google Fonts. Add Playfair's italic axis (§6).

## 15. Files in this package

```text
README.md                       this document
012_house_list.sql              the migration in §10.1
design/House List Flows.dc.html the board: all six flows side by side, with notes
design/HouseListApp.dc.html     the full prototype; its `start` prop picks the opening page
design/support.js, design/assets/, design/_ds/…   what the two HTML files need to run
screenshots/01–29               full-length captures of each page at 390px wide (2×)
```

**To open the prototype:** serve the folder (`npx serve design`) and open `House List Flows.dc.html`. Every phone on it is the whole prototype, opened to a different page; tap through, and use Reset to start over. `HouseListApp.dc.html`'s `start` values: `home`, `home-new`, `match`, `picks`, `log`, `log-rate`, `log-saved`, `journal`, `journal-new`, `wine-raats`, `search`, `search-chenin`, `palate`, `signin`, `signup`, `account`.

**Screenshots** (prototype sample content; see the nowrap note in §2.2):

| # | Screen |
|---|---|
| 01 | Home, established user |
| 02 | Home after: verdict rated (reply line), rec i. tiles open, rec ii. wanted, rec iii. passed |
| 03 | Home, new user: Your first entry + Reserved rows |
| 04 | Home, new user after the first rating: all four recs open |
| 05 | Match the wine list |
| 06 | Match, filled in: link open, White, $40–$90, a steer |
| 07 | Reading the list |
| 08 | Your picks |
| 09 | Picks with one chosen: others quieted, rating tiles open on III. |
| 10 | Picks, "We went a different way tonight" open |
| 11 | Log: find the bottle, with the want list |
| 12 | Log: search by name ("chenin") |
| 13 | Log: reading the label |
| 14 | Log: rate it (Loved it, note filled) |
| 15 | Log: saved (estate promotion) |
| 16 | Journal: Tried, by month |
| 17 | Journal: Timeline |
| 18 | Journal: day one (empty Tried) |
| 19 | A wine's page (rated) |
| 20 | A wine's page: changing the verdict (top of page only) |
| 21 | A wine's page: not yet tried |
| 22 | Search: Recent + Browse your DNA |
| 23 | Search results ("chenin") |
| 24 | Search: nothing found |
| 25 | Your palate |
| 26 | Sign in |
| 27 | Sign in, error |
| 28 | Create account |
| 29 | Account (Notifications removed per D7) |
