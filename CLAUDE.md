# CLAUDE.md — Sommeasy

## What This Project Is

Sommeasy is a wine recommendation app that helps users find wines from restaurant menus matching their taste preferences. A user provides a restaurant menu URL (or PDF), sets their taste preferences and budget, and Sommeasy recommends specific bottles from that menu.

This repo contains the **website/landing page** for Sommeasy — not the app itself. The website's job is to explain what Sommeasy does, build trust, and convert visitors into early users (email signups).

## Tech Stack

- **Frontend:** React Native (Expo, Expo Router)
- **Backend:** FastAPI (Python)
- **Build tooling:** Babel, TypeScript with tsconfig path aliases
- **PDF processing:** Custom extraction using Y-coordinate detection for line breaks
- **Core flow:** URL fetch → PDF extraction → wine parsing → taste matching → budget-filtered recommendations

## Current State

- Core wine parsing and recommendation engine works reliably across different restaurant menu formats
- A 12-PR execution plan exists to address frontend build issues, backend structure, API contracts, and MVP polish
- PR-01 (frontend build system — deprecated babel plugin, module-resolver aliases, tsconfig path aliases) has been merged
- Remaining known issues: some frontend runtime crashes post-PR-01, backend import path issues
- Next priorities: continuing the PR plan (PR-02+), filtering out by-the-glass wines from bottle recommendations

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

- PDF text extraction requires Y-coordinate detection to preserve line breaks — naive extraction merges everything into one line and breaks the parser
- Wine name cleanup must handle: dot leaders, bin numbers, broken accent characters, section headers misidentified as wine entries
- The frontend build crash was caused by a triple-compounding misconfiguration (deprecated babel plugin + module-resolver aliases + tsconfig path aliases resolving to stale template files)
- By-the-glass wines need to be filtered from bottle recommendations — BTG wines flood results with misleadingly low prices

## Priorities (Current)

1. Resolve remaining frontend runtime crashes and backend import issues
2. Continue the 12-PR execution plan (PR-02 onward)
3. Filter BTG wines from bottle recommendations
4. MVP polish and stability

## What NOT to Do

- Don't add new features before existing ones are stable
- Don't introduce new dependencies without a strong reason
- Don't change the brand voice or visual identity without discussion
- Don't optimize prematurely — get it working, then get it fast
