# CLAUDE.md — Sommeasy

## What This Project Is

Sommeasy is a wine recommendation app that helps users find wines from restaurant menus matching their taste preferences. A user provides a restaurant menu (photo, PDF, URL, or pasted text), sets their taste preferences and budget, and Sommeasy recommends specific bottles from that menu — with personalized sommelier notes from The Somm.

This is the full Sommeasy web app — quiz, DNA profile, restaurant recommendation engine with LLM storytelling, wine journal, and bottle logging.

**Naming:** The Palate = the DNA profile system. The Somm = the matching/recommendation system (and its voice).

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Auth + Database:** Supabase (Postgres with RLS, auth.users) — project `zugunlctgpytgyxftllv`; a daily Vercel cron hits `/api/keepalive` (09:00 UTC) so the free-tier project never auto-pauses again (the March 2026 pause killed the original database)
- **Styling:** Inline styles / CSS-in-JS (no Tailwind)
- **PDF processing:** unpdf with Y-coordinate detection for line breaks
- **Claude model:** one constant — `CLAUDE_MODEL` in `src/lib/anthropicConfig.js` (default `claude-sonnet-4-6`, override with the `ANTHROPIC_MODEL` env var). Never hardcode a model ID in a route; a retired hardcoded ID silently killed prod scanning for three weeks in June 2026
- **Menu scanning:** Claude Vision via `/api/parse-wine-list` (photo/PDF/scraped text)
- **Bottle label OCR:** Claude Vision via `/api/scan-label` (tesseract.js was removed — it was a declared-but-never-called dependency)
- **Somm curation:** `/api/somm-picks` — one Claude call turning scored candidates into curated picks + notes
- **Deployment:** Vercel (auto-deploys from main)
- **Core flow:** Scan/URL/paste → structured wine data → DNA matching (with journal feedback signals) → algorithmic curated picks render instantly → The Somm re-curates with storytelling in the background

## Current State (July 2026)

- Quiz (5 steps), DNA profile with 15 archetypes across 6 scoring dimensions
- **The Reveal is live (July 29):** quiz completion AUTO-SAVES (no Save button — a signed-in user never has an unsaved completed quiz), then stages the archetype reveal and hands off to /palate ("Meet your palate →"). Post-quiz recs are ratable via the shared `WineRecList` component — the ONE implementation of Had it / Want to try / Not for me, used by both the reveal and home's Wines to Try, wired to the full rating → dnaEvolution path. **Merge semantics (updated Aug 2026 — the uncheck is honored):** a refine save writes quiz selections ∪ earned-promoted DNA (`mergeQuizWithEarnedDna`) — retaking the quiz never SILENTLY erases what rated bottles proved — but an EXPLICIT deselection is respected: an earned item that was pre-checked at refine start (in `initialRaw`) and unchecked at save leaves the profile and its promotion un-flags, points surviving so continued love re-promotes. Earned items the quiz UI couldn't display (or that promoted mid-quiz) are still preserved — the quiz never removes values it didn't render, so initial-minus-final is exactly the set of chips the user saw and turned off. Refine chips wear a ✦ ("earned by your ratings — unchecking one removes it from your palate"). `reconcileQuizPromotions` un-flags promoted accumulation rows removed from the DNA (no timeline events — user edits aren't rating evidence), and `syncQuizSelections` preserves `source='auto'` on earned rows so the ✦ survives a refine. Specific-wine names are normalized with `formatWineName` at save. The narrative regenerates from the merged palate on every quiz save; `narrative_updated_at` is left untouched so `/api/palate-narrative` re-evolves it under its usual staleness gate
- **The Front Door, Session 1 is live (July 30):** auth core rebuilt on `@supabase/ssr`. New token_hash `GET /api/auth/confirm` (cross-browser email links, `verifyOtp`) + rebuilt PKCE `GET /api/auth/callback`, both writing session cookies onto the redirect via `supabaseRoute.js` and validating `next` with `sanitizeNext` (open-redirect killed); every failure lands on `/login?error=<link_expired|exchange_failed>` — never silent. `src/middleware.js` runs the standard session refresh; palate-narrative's `setAll` no-op is fixed (refresh-token rotation loss). AuthForm is truthful: already-registered detection (`identities.length === 0`), straight-in when a session arrives, dedicated check-your-inbox state with 60s-gated resend, `?error`/`?email` landings rendered. ALL auth copy lives in `src/lib/authCopy.js` — never render a raw Supabase string. Full forgot/update-password flow (`/forgot-password`, `/update-password`, anti-enumeration copy). Google button renders only when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` (default off until the provider is enabled in Supabase). Branded token_hash email templates in `docs/email-templates/` — paste into the dashboard together with this deploy; old `ConfirmationURL` links keep working same-browser via the callback until then
- **Never Lose a Palate, Session 2 is live (July 30):** an anonymous quiz stashes `{version, createdAt, answers, profile}` in localStorage (`sommeasy.pendingPalate`, 7-day expiry + version gate — `src/lib/pendingPalate.js`) at reveal time; the first authenticated load of `/` claims the stash SYNCHRONOUSLY (two-tab idempotency — a failed save re-stashes, nothing lost) and folds it in via `saveQuizProfile` (the ONE quiz-save path, extracted from page.js — refine merge semantics unchanged). Over an existing profile it saves stash ∪ existing ∪ earned (`unionQuizRaw` + refine merge with `initialRaw=null` — the anonymous quiz never displayed existing chips, so nothing counts as a deselection; NEVER clobber). Success lands the profile view with the welcome-back moment ("Welcome back. Your palate was waiting."). Anonymous reveal is a teaser: archetype hero + narrative stay (gate depth, not delight), signature-line partial read, 3 read-only recs with anonymous copy (never "rate the ones you know"), gate copy "Create your account to meet your full palate." + "Sign in — we'll fold this into your palate." Signed-out gates on /palate, /journal, /recommend pass `?next=` and AuthForm honors it end-to-end (push, emailRedirectTo, OAuth, login↔signup toggle), always through `sanitizeNext`
- Restaurant recommendation engine: scan (Claude Vision), URL fetch, PDF extraction, paste — two-card input UX with optional occasion field (also editable in results)
- **The Somm is live:** LLM curation + 2–3 sentence pairing-first notes per pick + a list-level summary, in brand voice. Strict server-side validation; ANY failure returns `{fallback:true}` and the UI silently keeps algorithmic picks — The Somm is progressive enhancement, never load-bearing
- **DNA feedback loop is wired:** rated journal entries (loved/not_for_me) boost and suppress scores in `matchWinesAgainstDNA` and feed the somm payload
- **The Palate view (/palate) is live** (Act II, July 29): the home DNA strip is the door (archetype + signature line + evolution whisper); the view holds the palate signature (Old↔New World, Focused↔Wide-ranging, Red↔White rails + concentration phrase via `palateSignature.js`), the narrative, Recently evolved (dna_timeline) and Building now (dna_accumulation progress against the real `dnaThresholds.js` promotion thresholds — never hardcode them), founding-vs-earned ✦ marks, and the full DNA sections. `PalateView.js` is presentation-only (props in) so a teaser variant can reuse it. Quiz entry is only quiet links (`/?quiz=refine|fresh`)
- Wine Journal (/journal): Tried, Want to Try, Skipped tabs with ratings + DNA Timeline (deep-linkable via `?tab=timeline`)
- Log a Bottle: Claude Vision label extraction, saves to journal + evolves DNA (accumulation/promotion/demotion engine in `dnaEvolution.js`)
- Rate limiting: in-memory sliding window, 10 requests/hour/IP per paid route (`src/lib/rateLimit.js`); cost logging: one `{"type":"claude_usage",...}` JSON line per Claude call — Vercel logs are the cost dashboard
- Supabase tables: wine_profiles, wine_interactions, dna_accumulation, dna_timeline

### Tests (run all before shipping)

- `node src/lib/__tests__/dnaEvolution.test.js` — 51 tests, DNA evolution pipeline (inlined mirror of resolver + engine, incl. Suite 9 quiz-merge + uncheck invariants)
- `node src/lib/__tests__/countryAttribution.test.js` — 14 tests, country-misattribution regression suite (the Cassis→US / Gimonnet→Italy / Crozes→Portugal class)
- `node src/lib/__tests__/sommPicks.test.js` — 24 tests, somm payload builder + response validator (tests the real module via dynamic import)
- `node src/lib/__tests__/authFlow.test.js` — 53 tests, open-redirect kill table (`sanitizeNext`), signUp outcome branches, brand-voice error map (real modules via dynamic import)
- `node src/lib/__tests__/authRoutes.test.js` — 21 tests, the REAL `/api/auth/confirm` + `/api/auth/callback` route handlers (a `module.register` hook in `helpers/alias-loader.mjs` resolves `@/` and `next/server` for plain node; GoTrue is a scripted `globalThis.fetch`) — asserts session cookies are SET on redirects and every failure lands on `/login?error=<reason>`
- `node src/lib/__tests__/pendingPalate.test.js` — 17 tests, the anonymous-quiz stash (expiry/version/claim-idempotency/restore) + `unionQuizRaw` never-clobber table (real module via dynamic import)
- `npm run test:e2e` — 45 Playwright specs (plus an env-gated seeder, skipped in normal runs), running exclusively against the dedicated test account. Fixture images are gitignored; regenerate with `python3 e2e/fixtures/generate-fixtures.py` or the suite silently collects 0 tests. Includes six permanent hard-fail guards — fail-if-no-picks, no-raw-internal-IDs (raw-ids.spec.ts, covers home/palate/journal), the Palate-view render guard (palate.spec.ts), the quiz-completion Reveal guard, and the refine-uncheck guard (both in quiz-completion.spec.ts; mutations are 0-point ratings cleaned via the journal UI, and the earned-✦ fixture self-heals via e2e/fixtures/test-db.ts), the signup happy-path guard (auth-flows.spec.ts — all `/auth/v1/*` mutations are Playwright-intercepted, NO real users created), and the two never-lose-a-palate guards (palate-handoff.spec.ts — anonymous quiz must stash at reveal time; a signed-in landing must fold the stash in with the welcome-back moment; spec B's stash is a SUBSET of the seeded answers so the merge is content-identical and the fixture never drifts) — keep all; outcome-tolerant specs masked a dead integration for weeks once

## Brand & Design

### Colors
- **Deep forest green** — primary
- **Burgundy** — accent
- **Sage** — secondary/supporting
- **Cream** — backgrounds and light surfaces

### Typography
- High-contrast serif typography
- The brand feels sophisticated but approachable — think "knowledgeable friend who knows wine," not "stuffy sommelier"

### Design Principles
- Clean, uncluttered layouts with generous whitespace
- Visual hierarchy should guide the eye naturally — don't rely on users reading everything
- Photography and imagery should feel warm, real, inviting (not stock-photo sterile)
- Mobile-first — most users will hit the site from phones. Form inputs stay ≥16px font (iOS auto-zoom) and tap targets ≥40px

## Voice & Tone

Sommeasy's voice is:
- **Confident but not pretentious** — we know wine, but we don't gatekeep
- **Warm and conversational** — like a friend giving you a recommendation
- **Clear and direct** — no jargon unless it genuinely helps

Bad: "Leveraging AI-powered algorithms to curate optimal wine pairings"
Good: "Tell us what you like. We'll find it on the menu."

Every error and empty state follows this voice: warm, no raw error strings, always tells the user what to do next.

## How I Work With You (Claude Code)

### Decision Authority
You have autonomy to make implementation decisions. When given a task, you should:
1. Understand the goal and the *why* behind it
2. Make the changes you think best achieve that goal
3. Explain what you did and why after the fact

You don't need to ask permission for individual code changes. Make the call, ship it, explain it.

### What to Escalate
- Architectural decisions that would be hard to reverse (new dependencies, data model changes, major refactors)
- Anything that changes the user-facing product direction (not just polish — actual feature/flow changes)
- If you're unsure whether something aligns with the brand or priorities, flag it

### Quality Bar
- Code should be clean and readable, but don't over-engineer for hypothetical future needs
- Every change should have a clear reason — no changes for the sake of changes
- Test your work. If something could break, verify it doesn't
- **Production verification must never leave derived state behind.** Anything seeded into real user data during verification must be fully reverted INCLUDING downstream artifacts — regenerated narratives, dna_accumulation points/flags, dna_timeline rows — not just the seeded rows themselves. If a full revert isn't practical, verify with the TEST_USER account instead of real data. **Ed's personal account (epgoodwin@gmail.com) is off-limits to automation** — e2e and any verification that writes data run exclusively against the dedicated test account (`epgoodwin+e2e@gmail.com`, credentials in `.env.local` as TEST_USER_EMAIL/PASSWORD; reseed its fixture with `SEED_TEST_ACCOUNT=1 npx playwright test e2e/seed-test-account.spec.ts`)
- Commit messages should be descriptive: what changed and why, not just "update files"

### Session Workflow
- When starting a session, read this file and orient yourself
- You'll typically receive a task framed as a goal, not a list of steps
- Make 3-5 meaningful changes per session when appropriate
- End each session with a summary: what you changed, why, and anything I should review closely

## Key Technical Context

- PDF text extraction uses Y-coordinate detection (transform[5]) to preserve line breaks — naive extraction merges everything into one blob and breaks the parser
- Wine name cleanup handles: dot leaders, bin numbers, broken accent characters, section headers misidentified as wine entries, US state abbreviations
- **Unified data architecture:** Single `wineUnified.json` (built by `scripts/build_quiz_data.py` from 130k WineMag reviews) powers all engines — quiz, profile, match. Contains countries, regions, producers, varietals, plus regionLookup, producerLookup (9,135), and varietalLookup (31 synonym mappings)
- **Matching is word-boundary based, never raw substring.** Producers named "Cass"/"Pier"/"Rozès" used to match inside "Cassis"/"Pierre"/"Crozes-Hermitage" and misattribute countries. `termMatchesInText` (matchEngine) and `containsTerm` (wineResolver) enforce boundaries; the countryAttribution suite guards this permanently
- Varietal names in wineUnified are combined ("Syrah / Shiraz") — the indexes split them into separately matchable aliases and include varietalLookup synonyms; producer terms index "&"/"et"/"and" conjunction variants
- dnaEvolution.test.js and countryAttribution.test.js inline mirrors of production logic (ESM/JSON-import constraints) — if you change matching logic in matchEngine/wineResolver, update the mirrors; sommPicks.js is dependency-free specifically so its tests hit the real module
- Supabase client (supabase.js) stubs gracefully when env vars are absent during Vercel build-time pre-rendering; it uses cookie-based sessions via `@supabase/ssr`
- wineAutocomplete.json (140KB) lazy-loads on quiz Step 5 only — doesn't affect initial load
- `/api/parse-wine-list` accepts base64 image, PDF, or scraped text; returns `{ wines: [...] }` (Path A: structured JSON → match engine) or `{ rawText }` (Path B: text parser). Both converge at `runAnalysis()` in the recommend page
- API GET routes that must run per-request (like `/api/keepalive`) need `export const dynamic = "force-dynamic"` or Next statically prerenders them into no-ops
- **Auth pages read searchParams as a SERVER prop, never `useSearchParams`** — on a statically-served page, useSearchParams suspends during hydration and REMOUNTS the form, wiping typed input. And their submit buttons ship disabled until hydration (`hydrated` state): a pre-hydration click fires a NATIVE form GET submission — full reload, query params dropped, input wiped (and a password-in-URL leak once inputs get `name` attrs). e2e specs wait for the enabled button as their hydration signal before filling
- `ANTHROPIC_API_KEY` is required in Vercel env vars; without it all four Claude routes degrade gracefully (scan errors are friendly, somm and palate-narrative fall back silently). Local `.env.local` carries a key too (added July 29, 2026 — verified live), so Claude paths fully exercise in dev. Cost caveat: every local `npm run test:e2e` run now makes real Claude calls (Vision scans + somm), roughly $0.15–0.30/run

## Priorities (Current)

1. Multi-page scan UX polish
2. Durable rate limiting (Redis/KV) when traffic justifies it
3. Auth overhaul Sessions 3–4 (`docs/auth-overhaul-brief.md` — polish/magic link, hardening/watchtower)

(The Palate, Act II shipped July 29, 2026. The anonymous teaser flow — quiz → partial reveal → signup without losing results — shipped July 30, 2026 as auth overhaul Session 2.)

## API Usage

The Anthropic API is a core part of this product. Three routes, all using `CLAUDE_MODEL` and sharing the rate limiter + cost logging:

- **Wine list scanning** via `/api/parse-wine-list` — measured ~$0.009/scan (text path; images somewhat higher)
- **Bottle label extraction** via `/api/scan-label`
- **Somm curation** via `/api/somm-picks` — measured $0.021–0.025/curation with feedback-rich payloads (3.4–3.6k in / 0.7–0.9k out tokens, 12–20s)
- **Palate narrative refresh** via `/api/palate-narrative` — regenerates the profile narrative only when the palate genuinely moved (a dna_timeline event, or ≥5 newly rated bottles since `narrative_updated_at`); cookie-session auth via `@supabase/ssr` `createServerClient`; ANY failure silently keeps the existing narrative — measured ~$0.006/regeneration (0.8k in / 0.2k out tokens, ~6s)
- Worst-case engaged session ≈ ≤$0.12
- When adding new API-consuming features, be mindful of cost but don't avoid the Anthropic API — it's approved and encouraged

## What NOT to Do

- Don't add new features before existing ones are stable
- Don't introduce new dependencies without a strong reason
- Don't change the brand voice or visual identity without discussion
- Don't optimize prematurely — get it working, then get it fast
- Don't add new paid API integrations without discussion — Anthropic API is the approved exception
- Don't hardcode Claude model IDs anywhere — use `CLAUDE_MODEL` from anthropicConfig.js
- Don't write outcome-tolerant tests for critical paths — at least one spec must hard-fail when the happy path breaks
