# CLAUDE.md — Sommeasy

## What This Project Is

Sommeasy is a wine recommendation app that helps users find wines from restaurant menus matching their taste preferences. A user provides a restaurant menu URL (or PDF), sets their taste preferences and budget, and Sommeasy recommends specific bottles from that menu.

This is the full Sommeasy web app — quiz, DNA profile, restaurant recommendation engine, wine journal, and bottle logging.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Auth + Database:** Supabase (Postgres with RLS, auth.users)
- **Styling:** Inline styles / CSS-in-JS (no Tailwind)
- **PDF processing:** unpdf with Y-coordinate detection for line breaks
- **OCR:** Tesseract.js v7 (menus/shelf tags, client-side) + Claude Vision API (bottle labels, server-side)
- **Deployment:** Vercel (auto-deploys from main)
- **Core flow:** URL/photo/paste → PDF extraction or OCR → wine parsing → DNA matching → budget-filtered curated picks

## Current State

- Quiz (5 steps), DNA profile with 15 archetypes across 6 scoring dimensions
- Restaurant recommendation engine: URL fetch, PDF extraction, photo OCR, paste — curated 5-pick output
- Wine Journal (/journal): Tried, Want to Try, Skipped tabs with ratings
- Log a Bottle: Claude Vision API for label OCR (via `/api/scan-label`), saves to journal + influences DNA
- Supabase tables: profiles, wine_interactions

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
- Mobile-first — most users will hit the site from phones

## Voice & Tone

Sommeasy's voice is:
- **Confident but not pretentious** — we know wine, but we don't gatekeep
- **Warm and conversational** — like a friend giving you a recommendation
- **Clear and direct** — no jargon unless it genuinely helps

Bad: "Leveraging AI-powered algorithms to curate optimal wine pairings"
Good: "Tell us what you like. We'll find it on the menu."

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
- Commit messages should be descriptive: what changed and why, not just "update files"

### Session Workflow
- When starting a session, read this file and orient yourself
- You'll typically receive a task framed as a goal, not a list of steps
- Make 3-5 meaningful changes per session when appropriate
- End each session with a summary: what you changed, why, and anything I should review closely

## Key Technical Context

- PDF text extraction uses Y-coordinate detection (transform[5]) to preserve line breaks — naive extraction merges everything into one blob and breaks the parser
- Wine name cleanup handles: dot leaders, bin numbers, broken accent characters, section headers misidentified as wine entries, US state abbreviations
- matchEngine.js uses wineReference-lookup.json (processed from 130k WineMag reviews): 1,097 regions, 2,000 producers, 488 varietals, 43 countries
- profileEngine.js generates up to 20 wine recommendations across 4 matching passes; pre-seeds exclusion list with user's named specific wines
- Supabase client (supabase.js) stubs gracefully when env vars are absent during Vercel build-time pre-rendering
- wineAutocomplete.json (140KB) lazy-loads on quiz Step 5 only — doesn't affect initial load

## Priorities (Current)

1. Filter by-the-glass wines from bottle recommendations
2. DNA feedback loop — wines rated "Loved" in journal becoming positive signals in matching
3. MVP polish and stability

## Image Processing & OCR

Sommeasy handles three types of image inputs. Always route to the correct
processing path — do NOT use a single approach for all image types:

| Source | Tool | Reason |
|---|---|---|
| Wine bottle labels | Claude Vision API (`claude-sonnet-4-6`) | Decorative fonts, curved surfaces, complex backgrounds — Tesseract fails here |
| Restaurant wine lists / menus | Tesseract.js (client-side) | Clean printed text, free, no API cost |
| Wine shop shelf tags / price cards | Tesseract.js (client-side) | Simple high-contrast text, Tesseract handles well |

**Key rules:**

- Never call the Anthropic API directly from the browser. Always proxy through a Next.js API route (`/app/api/scan-label/route.ts`) to keep the API key server-side.
- Never put `NEXT_PUBLIC_` prefix on `ANTHROPIC_API_KEY` — that would expose it to the browser.
- Both paths must output the shared `WineExtraction` schema before any database matching.
- Tesseract must always run client-side in a `'use client'` component — never on the server.
- Always preprocess images before Tesseract (greyscale + contrast boost).
- The full implementation patterns, component code, and prompt template live in: `.claude/skills/sommeasy-image-processing/`

## API Cost Constraint

Claude Vision is allowed **only** for bottle label scanning (via `/api/scan-label`). All other features must use free, client-side alternatives.

- Menu/shelf OCR uses Tesseract.js running in the browser (zero cost)
- Do not introduce new paid API calls beyond the label-scanning route without discussion
- If a feature would require a paid external API, flag it for discussion rather than implementing it

## What NOT to Do

- Don't add new features before existing ones are stable
- Don't introduce new dependencies without a strong reason
- Don't change the brand voice or visual identity without discussion
- Don't optimize prematurely — get it working, then get it fast
- Don't use paid APIs beyond the approved bottle-label route — see API Cost Constraint above
