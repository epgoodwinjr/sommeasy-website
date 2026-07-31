# Act III, Session 4 Readout — "The Signature"

**Executed by Claude Code, July 31, 2026, against `docs/palate-act-iii-brief.md` Part 4 (entire).**
For Cowork's independent post-review before Session 5, and for **Ed's design review — the screenshots in `docs/palate-act-iii-s4-screens/` are the deliverable as much as the code.** Base: `main` @ `5d4a150` (S3 verified).

## Verification summary

| Check | Result |
|---|---|
| Unit suites (10) | ✅ 312/312 — **palateMark 15 (new)**, dnaEvolution 74, identityVoice 18, countryAttribution 22, sommPicks 24, authFlow 56, authRoutes 21, pendingPalate 26, ssrfGuard 48, captcha 8 |
| `npm run test:e2e` | ✅ 60/60 on the full serialized run (5 env-gated skips: the seeder + the 4 screenshot captures) — all four extended hard-fail guards green with the new mark asserts (palate 2/2 incl. the ≤44px strip bound, quiz-completion 2/2, palate-handoff 4/4, raw-ids 3/3), both Act III DB guards (evidence-ledger, identity-shift) green |
| `npm run build` | ✅ clean, 17/17 static pages |
| Account rules | ✅ everything interactive ran against `epgoodwin+e2e@gmail.com`; production genomes were read by SQL only (zero writes); Ed's account untouched |

## What shipped

### 1. `src/lib/palateMark.js` — the render function

`renderPalateMark(genome, {size})` → inline SVG string; `renderPalateMarkDocument(genome, {size})` → the same mark as a standalone SVG document (xmlns, explicit dimensions) so a future share card / OG image consumes it unchanged — **shareable-ready, not shared**. Pure, deterministic, zero-dependency, no chart library; the anonymous teaser renders it client-side from the locally composed genome, no DB, no account.

**The form: a bloom on a medallion — the user's own protea.** The brand mark is a protea; every user now grows their own. A deep-forest medallion disc with an engraved cream/sage frame, and a bloom whose every feature is owned by exactly one genome dial:

| Dial | Feature |
|---|---|
| `focus` (country breadth) | petal count (5–9 — a new country adds a petal) |
| `spread` (regions) | petal length — the bloom fills the medallion toward its rim; the empty band is literally room to grow |
| `world` (old↔new) | petal tip geometry — pointed classic ↔ rounded modern |
| `range` (varietals) | stamen reach between petals (the protea echo) |
| `depth` (estates + named bottles) | berries carried on the petals |
| `color` (red↔white) | the inner ring's burgundy↔cream sweep — two open crescents, round-capped, never a gauge; neither color ever fully vanishes |
| `seed` | **phase only** — the ring's rotation and which petals bear fruit |

**Why seed-is-phase-only is the load-bearing decision:** FNV-1a avalanches completely on any evidence change, so anything *structural* derived from the seed would make one new bottle produce an unrecognizable mark. Dials move continuously as evidence accrues; the seed just turns the bloom. A milestone shift therefore reads as **growth of the same mark** — longer petals, another berry, a turned ring — never a replacement (see the growth strip in `gallery.png`). The PRNG draw order is fixed, so a dial moving with the seed unchanged (e.g. S3's live red/white recount) never re-phases unrelated features — locked by test.

Palette is brand-only, including two tints the app already uses (the strip gradient's lighter forest `#2A5540` for petal fill, the whisper's light sage `#C9DAC4` for line work). All geometry lives in `MARK_GEOMETRY` and all color in `MARK_PALETTE` — **Ed's aesthetic iteration is a constants edit, not surgery**; re-capture the review set any time with `SCREENSHOTS=1 npx playwright test e2e/design-screenshots.spec.ts`.

Determinism details: numbers render at 2 decimals with `-0` normalized (cross-engine trig differences are ~1e-16, so server prerender and client hydration can never disagree on a byte); the PRNG is mulberry32 (integer ops — engine-independent); no `<defs>`/ids (multiple marks on one page can never collide); malformed or missing genome dials clamp to the engine's own neutral defaults, and a missing genome renders `""` so surfaces degrade to text-only exactly as they did before the mark existed.

### 2. Surfaces — one component, four rooms

`src/components/PalateMark.js` is the single React wrapper (the WineRecList discipline): `aria-hidden` decorative span, `data-testid="palate-mark"` — the adjacent title is the accessible name on every surface.

- **/palate hero:** 192px medallion above title + epithet (`profile.identity?.genome`).
- **Home strip:** 44px, left of the title. Deliberately 44 — the title+epithet text block is ≥45px tall, so the text always owns the strip height and **the strip cannot grow taller** (asserted in e2e via bounding box).
- **Reveal:** 124px in the hero card, first element of the staged entrance. The savedRow reveal path now carries `genome: savedRow.identity?.genome || profile?.genome` — without that, the signed-in reveal (which renders the saved truth) would have silently dropped the mark.
- **Anonymous teaser:** the same hero renders the locally composed `profile.genome` — mechanics untouched, client-runnable, gate below unchanged.

### 3. Tests

- **`palateMark.test.js` (15, real module via dynamic import):** determinism (byte-identical across calls and against deep clones, inline + document); **distinctness on the 7 production genomes — exactly 6 unique marks, because `+local`/`+prod` are genuinely the same palate (same quiz answers → same genome, seed 1819852250) and MUST render identically** (the brief's "Ed's two identical-palate accounts"); Ed's *similar* pair (personal vs FTI, range 1 vs 0.75, different seeds) renders related-not-identical — same petal count/length/berries, longer stamens, turned phases; growth monotonicity on `markParams` numbers; the no-re-phase guarantee; brand-palette-only enforced by regex over every fill/stroke; decorative-role attributes; standalone-document equivalence; NaN/balance/junk-genome tolerance.
- **e2e:** mark presence asserts added inside four existing hard-fail guards — /palate hero + home strip (palate.spec.ts, incl. the ≤44px strip-height bound), signed-in reveal (quiz-completion.spec.ts), anonymous teaser (palate-handoff.spec.ts guard A). No new outcome-tolerant specs; raw-ids guards run unchanged (the SVG contains no text nodes at all).
- **`e2e/design-screenshots.spec.ts` (new, env-gated like the seeder):** skipped in normal runs; `SCREENSHOTS=1` captures the full review set below. It performs ONE refine save (content-identical merge — same discipline as quiz-completion) and resizes the viewport for the desktop shot instead of saving twice; the teaser runs in an explicitly-anonymous context (empty `storageState` — `browser.newContext()` inherits the signed-in project state, found the hard way).

### 4. The screenshot set (`docs/palate-act-iii-s4-screens/`)

| File | Surface |
|---|---|
| `gallery.png` | **All 7 production marks side by side** (rendered locally from the live genomes, read-only) + the growth-continuity strip |
| `home-strip-mobile.png` / `-desktop.png` | Authenticated home, 390px / 1280px |
| `palate-hero-mobile.png` / `-desktop.png` | /palate hero |
| `reveal-mobile.png` / `-desktop.png` | Signed-in reveal |
| `teaser-mobile.png` / `-desktop.png` | Anonymous teaser |

What to look at in `gallery.png`: the two Stellenbosch Loyalists read as siblings, not twins; the French Purist pair is pixel-identical (correct — same palate); the sparse marks (Italian Faithful, Bordeaux Regular) are *different*, never *lesser* — the tight bloom inside the beaded orbit is a composed identity, and the orbit ring shows the room it has to grow. The growth strip is the continuity claim made visible: today → first estate promotion → a year of bottles, one bloom maturing.

**A data note on the e2e account's screenshots:** the capture run's refine save recomposed the stored epithet/genome from the same merged palate (the S3-documented reconvergence — "red & white" → "white-leaning" as chenin's earned promotion tilts the recount). Content-identical DNA, sanctioned self-heal, zero timeline events; the unit suite pins the July 31 SQL snapshot as *fixtures*, so it can never drift with the live row.

## The S3 radar item: `regionEvidenceLeads` (review only — any change ships in S5)

**The behavior:** `regionEvidenceLeads` (identityEngine) treats a region row *tied* at the top of the points table as leading. Every full-credit rating writes region and country +2 *together*, so region is tied with country from the very first rated bottle — meaning the first milestone on a country-anchored palate almost always flips the anchor region-ward ("The South African Curator" → "The Stellenbosch …").

**Assessment with the visual in hand:** the *mark* is not the problem — the anchor is not a genome dial, so an anchor flip turns the title while the bloom itself only grows (the continuity design absorbs the moment gracefully). The problem is evidentiary: a tie produced by the same bottles that fed the country carries **zero information** about region-vs-country preference, so today the title — the most identity-laden word in the product — moves on one bottle of noise. That undercuts Act III's own register: identity changes *when you earn the change*.

**Recommendation for Session 5:** keep the tie-tolerance (a strict `>` can essentially never occur, since every band that writes region also writes country — it would disable evidence-led region anchors entirely), but add an evidence floor: a region row only "leads" at **≥ 4 points** (two loved bottles — the same bar estate loyalty pays). Concretely, in `regionEvidenceLeads`, `row.points > 0` → `row.points >= 4`, with the 4 named in `dnaThresholds.js` rather than inlined. Consequences: the "first loved bottle outside the DNA" milestone no longer retitles anyone (it still celebrates and grows the mark); the first *estate promotion* still flips the anchor — an estate at threshold 4 implies its region is at 4 — so the address sharpens exactly at the first real loyalty moment, one toast, one coherent becoming. Pure, deterministic, one-line diff plus mirror/test updates. The e2e identity-shift guard (Dujac promotion) stays valid: its region points hit 4 at the promotion, so the recompose still shifts.

## Decisions Cowork should weigh

1. **Marks self-ground on a green medallion** rather than adapting to each surface's background — one render works on cream pages, dark cards, and future share cards, at the cost of a dark disc on dark cards (the cream rim carries the edge; the reveal screenshot shows it reads as a seal). The alternative (per-surface variants) breaks share-card byte-equivalence with what users see.
2. **Strip mark at 44px** (brief said ~48–96) — the 4px concession is what guarantees the strip never grows; at 44 the mark is fully legible (see `home-strip-mobile.png`).
3. **`design-screenshots.spec.ts` is permanent but env-gated** — kept for Ed's iteration rounds (S4→S5) rather than deleted as a throwaway; it costs nothing in normal runs (skipped) and one refine save + somm call when invoked.
4. **The 7-genome fixtures in palateMark.test.js are a frozen SQL snapshot** — deliberately not live data; they remain valid palate shapes even after production regenerates (the live e2e row already moved during this session's capture run).

## Cost note

The mark is pure computation — no new LLM surface, no new dependency. A `SCREENSHOTS=1` capture run adds one refine save (narrative recompose ~$0.006 if stale) + the run's usual somm call; normal e2e cost unchanged.
