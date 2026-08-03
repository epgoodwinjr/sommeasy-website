---
name: sommeasy-image-processing
description: >
  Sommeasy-specific skill for building, improving, and debugging image
  processing and OCR features in the Sommeasy Next.js web app. Use this skill
  whenever working on anything related to image uploads, label scanning, wine
  list parsing, shelf tag reading, text extraction from photos, OCR, or
  connecting image output to wine database search. Always trigger this skill
  when the user mentions images, photos, scanning, OCR, labels, wine lists,
  menus, or shelf tags — even if they don't use the word "OCR" or "image
  processing" explicitly.
---

# Sommeasy Image Processing Skill

All image extraction in Sommeasy runs through **Claude Vision** (Anthropic
API) via server-side Next.js routes. There is no client-side OCR library
and there is exactly one image-extraction technology. (Plain text — pasted
or URL-scraped wine lists — is parsed client-side for free; only images and
uploaded PDFs cost a Claude call.) This skill defines the routing, the
contracts, and the invariants to follow.

**Source of truth is the code, not this file.** When contracts here and the
route implementations disagree, trust the routes and fix this file.

---

## The Routing Table

Every *image* input routes to Claude Vision — the only decision is *which
route*. Text inputs never leave the browser's parser:

| Input | Path | Payload / mechanism |
|---|---|---|
| Wine bottle label photo | `POST /api/scan-label` (Claude Vision) | multipart FormData, `image` field |
| Restaurant wine list / menu photo | `POST /api/parse-wine-list` (Claude Vision) | JSON `{ imageBase64, mimeType }` |
| Uploaded wine-list PDF | `POST /api/parse-wine-list` (Claude Vision) | JSON `{ pdfBase64 }` (document block) |
| Wine list URL (HTML or PDF) | `/api/fetch-menu` (safeFetch, SSRF-guarded; unpdf for PDF URLs) → client-side `parseWineList` | No Claude call — scraped text parsed in the browser |
| Pasted wine list text | client-side `parseWineList` (matchEngine) | No Claude call |
| Shelf tag / price card | `POST /api/scan-label` | No dedicated shelf-tag feature exists; a single-wine photo is a label scan |

Two nuances worth keeping straight:

- **Transport asymmetry is real:** scan-label takes FormData,
  parse-wine-list takes a JSON body with base64. Don't "unify" them casually.
- **`{ textContent }` is a route capability, not a live flow:**
  parse-wine-list also accepts scraped text (capped 15,000 chars) for
  Vision-grade structured extraction, but no current UI sends it — URL and
  paste flows deliberately use the free, instant client-side parser. Don't
  document or build against the textContent path as if it were the URL flow.

---

## Stack Context

- **Framework:** Next.js 14 App Router; routes at `src/app/api/*/route.js`
- **Vision:** `@anthropic-ai/sdk` server-side only. Model comes from
  `CLAUDE_MODEL` in `src/lib/anthropicConfig.js` — **never hardcode a model
  ID** (a retired hardcoded ID silently killed prod scanning for three weeks
  in June 2026)
- **No OCR library:** tesseract.js is retired (see History below)
- **Client-side prep:** images are downscaled + JPEG-compressed in the
  browser before upload. `compressImage` in `src/lib/image-utils.js`
  (1600px, 0.82) serves the home-page bottle logger; the recommend page has
  its own local variant (1200px/0.7, re-compress at 1024/0.6 if still >2MB)
- **Every Claude route:** `checkRateLimit` before any work, `logClaudeUsage`
  after the call (both from `src/lib/rateLimit.js`), graceful brand-voice
  degradation when `ANTHROPIC_API_KEY` is absent

---

## The Two Routes

Read `references/vision-patterns.md` for full request/response contracts,
error taxonomies, and parsing behavior **before modifying either route**.

### `/api/scan-label` — one bottle, one wine

Image → `LABEL_EXTRACTION_PROMPT` (defined in the route — the canonical
prompt; never improvise a per-call variant) → JSON → `parseLabelResponse`
(`src/lib/wineExtraction.js`) → `WineExtraction`. Returns 422 when neither
name nor producer was extracted. Consumer: the home-page bottle logger,
which then feeds `resolveAndAccumulate` (dnaEvolution.js) → DNA evolution.

### `/api/parse-wine-list` — a whole menu

Image/PDF/text → `EXTRACTION_PROMPT` (in the route) → `{ wines: [...],
metadata }`. Two response paths, both consumed by `runAnalysis()` on the
recommend page:

- **Path A** (structured): `{ wines, metadata, rawText, source: "vision" }`
  → match engine directly
- **Path B** (fallback): `{ rawText, source: "vision_text" }` → client-side
  text parser

Malformed JSON gets one rescue attempt (`extractFirstJsonObject`, trusted
only if it carries a `wines` array) before falling back to Path B.

---

## Output Schemas

Two schemas, not one — they serve different features:

**Label scans** produce `WineExtraction` (JSDoc typedef in
`src/lib/wineExtraction.js` — mirror it exactly, including
`source: 'claude-vision'`, the only value):

```typescript
interface WineExtraction {
  name: string | null;
  producer: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  price: string | null;        // always null — labels don't carry pricing
  confidence: 'high' | 'medium' | 'low';
  source: 'claude-vision';
}
```

**Wine-list parses** produce entries shaped by `EXTRACTION_PROMPT`: `name`,
`vintage`, `price`, `section`, `is_btg`, `color`, `variety`, `region`,
`country`, `producer`. This shape feeds `matchWinesAgainstDNA` — if you
change it, check the match engine and the somm payload builder.

Never pass raw model text to matching. Fields the model can't read are
`null` — the prompts enforce "null is better than an incorrect value."

---

## Invariants

- **One extraction technology.** Do not add tesseract.js, a WASM OCR
  library, or any second extraction path. If Vision output is poor, fix the
  prompt or the image compression — don't reach for a second engine.
- **Canonical prompts live in the routes.** Edit them in place; consistency
  is what keeps the parsers reliable.
- **API key stays server-side.** Never call Anthropic from the browser.
- **User-supplied URLs go through `safeFetch`** (`src/lib/ssrfGuard.js`) —
  never a raw `fetch` with `redirect: "follow"`.
- **New Claude-calling routes** get `checkRateLimit` + `logClaudeUsage` and
  a friendly no-key fallback, same as the existing ones.
- **Error copy is brand voice:** warm, no raw error strings, always tells
  the user what to do next ("Try a clearer, closer photo.").
- **Cost awareness:** ~$0.009/scan (text path), labels comparable. e2e runs
  make real Claude calls (~$0.15–0.30/run). The API is approved and
  encouraged — be mindful, not avoidant.

---

## History (why this file looks the way it does)

Early Sommeasy ran a hybrid: Tesseract.js in the browser for wine lists and
shelf tags, Claude Vision for labels. The Tesseract path was retired — it
was a declared-but-never-called dependency, and its last dead remnants
(`parseOCRText`, `preprocessForOCR`) were deleted in the Aug 3, 2026
dead-code removal. `references/tesseract-patterns.md` was deleted with it.
Don't resurrect any of it; the git history has it if you're curious.

---

## Reference Files

- `references/vision-patterns.md` — request/response contracts, error
  taxonomies, and client integration patterns for both Vision routes
