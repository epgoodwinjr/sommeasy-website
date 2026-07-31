# Sommeasy — Your Wine DNA

Sommeasy builds your **Wine DNA** — a per-user identity composed from the wines, places, and grapes you actually love — and then picks bottles for you from any restaurant's wine list. Snap a list, paste it, or drop a URL; The Somm matches it against your palate and tells you why each pick fits.

The identity is one of one: a composed title ("The Stellenbosch Loyalist"), a signature line, a narrative in The Somm's voice, and a generative visual mark grown from your data. Rating bottles is evidence — enough of it promotes new estates, grapes, and regions into your DNA, retitles you at milestone moments, and grows the mark.

## Quick start (local development)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need a `.env.local` (not committed) with the Supabase project keys and an `ANTHROPIC_API_KEY` — see **Environment** below.

## How it works

- **The quiz (5 steps)** seeds the palate: countries → regions → estates → grapes → specific bottles. Completion auto-saves and stages the reveal: title, epithet, mark, narrative. Anonymous quizzes stash locally (and ride signup metadata) so the palate survives account creation on any device.
- **The identity strand** (`src/lib/identityEngine.js`) composes the title/epithet/traits/genome deterministically from evidence — pure and client-runnable, so the anonymous teaser works with no DB or LLM.
- **The visual mark** (`src/lib/palateMark.js`) renders the genome as a deterministic SVG bloom — same palate, same mark, byte for byte; the mark grows rather than changes when the palate evolves.
- **The evidence ledger** (`src/lib/dnaEvolution.js` + `dnaThresholds.js`) turns rated bottles into points per estate/varietal/region/country, with promotions, demotions, and exact reversibility on re-rates and deletes.
- **Milestones** (`src/lib/identityRecompose.js`) recompose the identity when you earn it — promotions, every 5th bottle, first-time firsts — celebrating real shifts with a toast, a timeline entry, and the regrown mark.
- **The Somm** (`/api/somm-picks`) curates scored candidates into picks with pairing-first notes, in brand voice; any failure silently keeps the algorithmic picks. Menu scanning (`/api/parse-wine-list`), label OCR (`/api/scan-label`), and the palate narrative (`/api/palate-narrative`) run on the same Claude model constant (`src/lib/anthropicConfig.js`).
- **Unified wine data**: one `wineUnified.json` (built by `scripts/build_quiz_data.py` from 130k WineMag reviews) powers the quiz, the resolver, and the match engine — word-boundary matching, producer/varietal alias indexes, and misattribution guards.

## Project structure (the load-bearing parts)

```
src/
├── app/
│   ├── page.js                  # Home: quiz, DNA strip, wines to try, bottle logging
│   ├── palate/page.js           # The Palate view (identity + evolution)
│   ├── recommend/page.js        # Restaurant flow: scan/paste/URL → picks
│   ├── journal/page.js          # Wine journal + DNA timeline
│   └── api/                     # parse-wine-list, scan-label, somm-picks,
│                                #   palate-narrative, fetch-menu (SSRF-guarded),
│                                #   auth/confirm + auth/callback, keepalive
├── components/                  # Quiz, PalateView, PalateMark, WineRecList (THE
│                                #   one rating surface), auth forms
└── lib/                         # identityEngine, palateMark, dnaEvolution,
                                 #   dnaThresholds, identityRecompose, wineResolver,
                                 #   matchEngine, sommPicks, ssrfGuard, authFlow…
supabase/migrations/             # 001–008 (profiles, interactions, accumulation,
                                 #   timeline, identity, policies)
e2e/                             # Playwright suite (serialized, dedicated test
                                 #   account, twelve permanent hard-fail guards)
docs/                            # Design briefs, session readouts, the watchtower
```

## Testing

```bash
# Unit suites (plain node, no framework)
node src/lib/__tests__/dnaEvolution.test.js
node src/lib/__tests__/identityVoice.test.js
node src/lib/__tests__/palateMark.test.js
# …see CLAUDE.md for the full list

# End-to-end (regenerate gitignored fixtures first if needed:
# python3 e2e/fixtures/generate-fixtures.py)
npm run test:e2e
```

The e2e suite runs serialized against a dedicated test account and makes real Claude calls (~$0.15–0.30/run). Never point it at a personal account.

## Environment

`.env.local` (never committed) carries:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the browser client **fails the build loudly** if these are missing; a green deploy with dead auth is impossible
- `ANTHROPIC_API_KEY` — all four Claude routes degrade gracefully without it
- `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` — the dedicated e2e account
- Feature flags (default off): `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, `NEXT_PUBLIC_MAGIC_LINK_ENABLED`, `NEXT_PUBLIC_CAPTCHA_ENABLED`

## Deployment

Vercel auto-deploys from `main`. Supabase (Postgres + Auth with RLS) hosts the data; a daily cron hits `/api/keepalive` so the free-tier project never auto-pauses. Domain: sommeasy.wine. Weekly log health-check ritual: `docs/auth-watchtower.md`.

## Tech stack

- **Next.js 14** (App Router) · **Supabase** (Postgres, RLS, auth) · **Vercel**
- **Anthropic Claude** for menu scanning, label OCR, somm curation, and narrative
- Inline styles / CSS-in-JS, mobile-first, brand palette (forest green, burgundy, sage, cream)

For working conventions, invariants, and the full current-state map, read `CLAUDE.md`.
