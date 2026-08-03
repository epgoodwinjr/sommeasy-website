# One Truth for Images — Merge Readout (Aug 3, 2026)

Three side-branch commits from the Aug 3 cleanup — the Tesseract dead-code
removal and two independent rewrites of the `sommeasy-image-processing`
skill — are reconciled and merged onto main.

## Merge order executed

1. **e1daba8** (`claude/infallible-faraday-f87234`) fast-forwarded onto main:
   `parseOCRText` and `preprocessForOCR` deleted, `WineExtraction.source`
   narrowed to `'claude-vision'`, headers rewritten.
2. **28026bb** (`claude/bold-dewdney-6117fe`) merged on top (merge commit
   `4f0ad0f`) — rewrite B adopted as the skill: post-removal typedef,
   contract-style `references/vision-patterns.md`, `tesseract-patterns.md`
   deleted.
3. **a58556c** — the reconciliation commit: rewrite A (791bb5b,
   `claude/hungry-maxwell-dea30f`) diffed against B; A's unique facts folded
   in (each verified against the merged tree first), the shelf-tag
   contradiction resolved from code. A's branch discarded.
4. **1b91078** — one straggler the zero-references grep caught:
   `e2e/fixtures/generate-fixtures.py`'s docstring still said the fixtures
   exercised "the client-side Tesseract OCR path." Fixed.

## The shelf-tag verdict: no feature exists — A had it right

Evidence, from code: `grep -rin "shelf" src/ e2e/ docs/` on pre-merge main
returned exactly **one** hit — a stale header comment in
`src/lib/wineExtraction.js` describing the retired Tesseract plan, which
e1daba8 deletes. No UI entry point, no route copy, no test, nothing. The
old skill's routing table ("Wine shop shelf tags / price cards →
Tesseract.js") described a feature that was never built.

- **A (hungry-maxwell)** said it straight: "There is no shelf-tag feature."
  Correct.
- **B (bold-dewdney)** hedged: it admitted "no dedicated shelf-tag feature
  exists" but still gave shelf tags a routing-table row pointing at
  `/api/scan-label` — a table entry for a feature that doesn't exist.

The surviving skill drops the routing row and states the absence outright,
with the one permitted note: a shelf-tag photo a user asks about is treated
as a label-like image via `/api/scan-label`.

Related fix in the same pass: B's History section claimed early Sommeasy
"ran a hybrid" — the Tesseract path never ran (declared-but-never-called
dependency). The skill now says *planned*, and that none of it ever ran.

## Folded in from A (all verified against merged code before writing)

- fetch-menu's response shape `{ text, source: "html" | "pdf" }` and its
  unpdf Y-coordinate (`transform[5]`) line-break detection
- Multi-page scan accumulation on Path A (`accumulatedEntriesRef` — adds to
  the slate, never replaces)
- The client-side 10MB PDF rejection before upload
- The rate limiter's number: 10 requests/hour/IP
- Coverage truth: no unit test hits either Vision route; e2e is the
  coverage, and every local run makes real Claude calls

Everything else in A was already present in B (usually in more durable,
contract-shaped form) — B's route contracts, error taxonomy, compression
variants, and timeout figures all spot-checked true against the routes.

## Verification on the merged tree

- **Unit suites:** all 12, **347/347 passed** (dnaEvolution 75,
  countryAttribution 22, sommPicks 30, sommRoute 5, authFlow 56,
  authRoutes 21, pendingPalate 26, identityVoice 21, palateMark 15,
  ssrfGuard 48, captcha 8, wineEvents 20).
- **Build:** `npm run build` succeeded (fresh `.next/BUILD_ID`, full route
  table, no errors).
- **Zero-references grep:** no `tesseract` / `parseOCRText` /
  `preprocessForOCR` anywhere in `src/`, e2e code, or package files. The
  only remaining mentions are deliberate history/prohibition text in the
  skill, CLAUDE.md, and past readouts.
- **Skill claim spot-checks:** routing table, both prompts' in-route
  definitions, `parseLabelResponse` fence-stripping + `emptyExtraction`
  fallback, the 422/429/400 contract, `no_wines`-returns-200 quirk, the
  wines-array-only JSON rescue, both compressImage variants, HEIC/HEIF
  Canvas fallback, the 120s/180s/300s timeout ladder, URL-and-paste flows
  never calling Claude, `textContent` having no UI caller, and the
  `producer + name` display-name build — all confirmed against the code.
- e2e deliberately not run (docs + zero-caller deletions; the next feature
  session runs the full suite on this tree).

## Branch hygiene

Local worktree branches, deleted after push:

- `claude/infallible-faraday-f87234` (e1daba8) — merged (fast-forward)
- `claude/bold-dewdney-6117fe` (28026bb) — merged (4f0ad0f)
- `claude/hungry-maxwell-dea30f` (791bb5b) — superseded by B + the
  reconciliation commit; discarded unmerged by design

Stale remote branches from March 2026, all three verified fully merged
(`git merge-base --is-ancestor <tip> main` true for each), deleted:

- `claude/laughing-ishizaka` (d2fe89f — merged via 1b7efb0)
- `claude/prepare-files-sharing-2hoob` (6078fdb — merged via d60727b)
- `claude/trusting-hellman` (1afa02e — merged via 8b9d0d5 / PR #19)

No unmerged work was found on any of them.

## Deploy

Pushed to main → Vercel auto-deploy. Confirmation appended below once the
deployment reports READY.
