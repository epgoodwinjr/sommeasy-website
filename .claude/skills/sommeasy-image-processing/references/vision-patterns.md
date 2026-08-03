# Claude Vision Patterns for Sommeasy

Both extraction routes use Claude Vision. This file documents their
**contracts** — request shapes, response shapes, error taxonomies, and the
invariants around them. It deliberately does not duplicate the route code:
the previous version of this file pasted full route listings that drifted
from reality and taught a stale architecture for weeks. Read the actual
implementations alongside this file:

- `src/app/api/scan-label/route.js`
- `src/app/api/parse-wine-list/route.js`
- `src/lib/wineExtraction.js` (label response parser + `WineExtraction` typedef)
- `src/lib/rateLimit.js` (`checkRateLimit`, `logClaudeUsage`)
- `src/lib/anthropicConfig.js` (`CLAUDE_MODEL` — the only place a model ID exists)

---

## Why Vision for Everything

Bottle labels use decorative/calligraphic fonts, curved surfaces, embossing,
foil, and crests overlapping text — classical OCR fails routinely, while
Vision infers from context. Wine lists were once planned for client-side
Tesseract OCR, but that path never shipped in a called code path and was
retired; Vision handles printed lists at least as well and returns
*structured* entries (section, color, variety, BTG) that raw OCR text never
could. One technology, one set of prompts, one debugging surface.

---

## Architecture

```
Browser (client component)
  → compressImage (downscale + JPEG, browser Canvas)
  → POST to the route (key never leaves the server)
    → checkRateLimit FIRST (paid route)
    → Anthropic SDK, model: CLAUDE_MODEL
    → logClaudeUsage (the {"type":"claude_usage",...} cost line)
    → parse/validate model output server-side
    → JSON response in brand voice
```

---

## Route 1: `POST /api/scan-label` (bottle labels)

**Request:** multipart FormData with an `image` file field. The home-page
bottle logger sends a compressed JPEG blob named `label.jpg`.

**Model call:** one user message: `[image block (base64), text block
(LABEL_EXTRACTION_PROMPT)]`, `max_tokens: 512`, `maxDuration = 30`.
`LABEL_EXTRACTION_PROMPT` is defined at the top of the route — it is the
canonical label prompt. It demands a bare JSON object with `name`,
`producer`, `vintage`, `region`, `country`, `confidence`, and instructs
"Do not guess — null is better than an incorrect value." Edit it in place;
never improvise per-call variants.

**Parsing:** `parseLabelResponse` (`src/lib/wineExtraction.js`) strips
accidental markdown fences, JSON-parses, and normalizes into
`WineExtraction` (`source: 'claude-vision'`, `price` always null — labels
don't carry pricing). Any parse failure degrades to `emptyExtraction`
(all-null, `confidence: 'low'`) rather than throwing.

**Response contract:**

| Case | Status | Body |
|---|---|---|
| Usable extraction (name or producer present) | 200 | `WineExtraction` JSON |
| Nothing useful extracted | 422 | `{ error: "Couldn't identify the wine from this label…" }` |
| No file in FormData | 400 | `{ error: "No image provided" }` |
| Rate limited | 429 | `{ error: RATE_LIMIT_MESSAGE }` + `Retry-After` header |
| No `ANTHROPIC_API_KEY` | 500 | friendly "isn't configured yet" copy |
| Anything else | 500 | `{ error: "Failed to scan label. Please try again." }` |

**Consumer:** `handleBottlePhoto` in `src/app/page.js`. It builds the
display name as `producer + name` (either alone is acceptable), rejects
results under 2 characters, then hands off to the bottle-confirm step and
eventually `resolveAndAccumulate` (dnaEvolution.js) → DNA evolution.

---

## Route 2: `POST /api/parse-wine-list` (wine lists / menus)

**Request:** JSON body carrying exactly one of:

| Field | Input type | Model content block |
|---|---|---|
| `imageBase64` (+ optional `mimeType`, default `image/jpeg`) | menu photo | `image` block |
| `pdfBase64` | uploaded wine-list PDF | `document` block (`application/pdf`) |
| `textContent` | raw wine-list text | inlined into the prompt, capped at 15,000 chars |

**`textContent` has no current UI caller.** The URL flow goes
`/api/fetch-menu` (SSRF-guarded `safeFetch`; unpdf text extraction for PDF
URLs) → client-side `parseWineList` — instant, no Claude call — and the
paste flow parses client-side too. The textContent path is kept as a
server capability for when text needs Vision-grade structured extraction.

**Model call:** `EXTRACTION_PROMPT` (defined in the route — canonical, edit
in place) asks for every wine as `{ name, vintage, price, section, is_btg,
color, variety, region, country, producer }` plus a `metadata` object.
`max_tokens: 8192`, `maxDuration = 300`, Anthropic client timeout 120s; the
recommend page aborts its fetch at 180s client-side.

**Response contract (two paths — both are success shapes):**

- **Path A (structured):** model returned parseable JSON with a `wines`
  array → `{ wines, metadata, rawText, source: "vision" }`. The recommend
  page's `runAnalysis()` feeds this straight to the match engine.
- **Path B (raw text fallback):** JSON parsing failed but the model
  returned ≥20 chars of text → `{ rawText, source: "vision_text" }`. The
  client runs its text parser (`parseWineList`) instead. Path B is why any
  new client consumer must handle BOTH shapes.

**JSON rescue:** before falling back to Path B, the route tries
`extractFirstJsonObject` — a string-aware balanced-brace scan that pulls
the first JSON object out of output with prose around it. The rescued
candidate is trusted **only if it carries a `wines` array**, so genuine
raw-text responses still take Path B untouched.

**Error taxonomy** (every error body carries `errorType` for the client):

| `errorType` | Status | When |
|---|---|---|
| `rate_limited` | 429 | our own limiter (`checkRateLimit`), `Retry-After` header set |
| `no_wines` | 200/— | model found nothing (empty `wines` array, or <20 chars raw text) |
| `timeout` | 504 | Anthropic call timed out — copy suggests one page at a time |
| `rate_limit` | 429 | Anthropic's own 429 bubbled up |
| `bad_input` | 422 | Anthropic 400 — unprocessable file |
| `api_error` | 500 | anything else |

Note `no_wines` returns 200 with an `error` field — the client treats the
presence of `error` as the failure signal on this route, not the status.

---

## Client-Side Compression (before every upload)

Images are always downscaled and JPEG-compressed in the browser first —
uploads are faster, Vercel body limits are respected, and Vision doesn't
need full resolution.

- `compressImage` in `src/lib/image-utils.js` (max 1600px, quality 0.82,
  Canvas-based, handles HEIC/HEIF via the Canvas fallback) — used by the
  home-page bottle logger.
- The recommend page carries its own local `compressImage(file, maxDim=1200,
  quality=0.7)` with a safety re-compress at 1024/0.6 when the result is
  still over 2MB (menu photos are bigger and the route takes base64 JSON,
  which inflates size ~33%).

PDFs are not compressed — they go up as base64 as-is.

---

## Shared Conventions (apply to any new Vision route)

1. `checkRateLimit(routeName, getClientIp(req))` before ANY other work —
   these are paid routes. Return 429 + `Retry-After` on denial.
2. Missing `ANTHROPIC_API_KEY` → friendly degradation copy, never a crash.
   Scanning errors are visible-but-friendly; Somm/narrative routes fall
   back silently. Match the existing register.
3. `model: CLAUDE_MODEL` — never a literal model ID.
4. `logClaudeUsage(routeName, response.usage, elapsedMs)` after every call —
   the JSON cost lines in Vercel logs are the live-debugging cost view.
5. All error copy in brand voice: warm, concrete next step, no raw error
   strings or status jargon.
6. Server-side validation of model output; the client never receives
   unvalidated model text as structured data.

---

## Environment & Cost

`ANTHROPIC_API_KEY` is required in Vercel env vars (and lives in local
`.env.local`, so dev exercises the real paths). Never prefix it
`NEXT_PUBLIC_`.

Measured costs: ~$0.009 per wine-list scan on the text path (images
somewhat higher); label scans are a single small Vision call in the same
range. Worst-case engaged session ≈ ≤$0.12. Local `npm run test:e2e` makes
real Claude calls (~$0.15–0.30/run).
