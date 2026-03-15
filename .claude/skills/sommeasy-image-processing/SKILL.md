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

This skill governs how Claude Code should approach all image processing and
OCR work in the Sommeasy Next.js web app. It defines the decision logic,
preferred libraries, code patterns, and integration points to follow
consistently across the codebase.

---

## The Core Decision Rule

Sommeasy handles three types of image sources. Always route to the correct
processing path based on the source type:

| Image Source | Correct Tool | Reason |
|---|---|---|
| Wine bottle labels | Claude Vision API | Decorative/calligraphic fonts, curved surfaces, complex backgrounds — classical OCR fails here |
| Restaurant wine lists / menus | Tesseract.js | Printed text, clean contrast, structured layout — no API cost needed |
| Wine shop shelf tags / price cards | Tesseract.js | Simple printed text, high contrast — Tesseract handles this well |

**When in doubt about source type, ask the user before writing code.**

---

## Stack Context

- Framework: Next.js (App Router preferred unless existing code uses Pages Router)
- OCR library: `tesseract.js` (runs client-side in the browser — no server, no cost)
- Vision: Anthropic Claude API with vision capability (already integrated in the app)
- Image upload: check the existing codebase for the current upload component before building new — extend it rather than replacing it

---

## Tesseract.js Path (Wine Lists & Shelf Tags)

Read `references/tesseract-patterns.md` for full implementation details,
including the recommended Next.js component pattern, preprocessing steps,
language settings, and structured data extraction logic.

**When to read it:** Any time you are writing or modifying code that uses
Tesseract.js for wine list or shelf tag processing.

### Key principles to always follow:
- Run Tesseract client-side — never on the server. It is a browser library.
- Always preprocess the image before OCR (see references for how). Raw photos
  perform significantly worse.
- After extracting raw text, always run a parsing pass to pull out structured
  fields: wine name, producer, vintage, region, price.
- Confidence threshold: discard or flag results below 70% confidence rather
  than passing low-quality extractions to the database.

---

## Claude Vision Path (Bottle Labels)

Read `references/vision-patterns.md` for the full prompt template, API call
pattern, response parsing logic, and error handling approach.

**When to read it:** Any time you are writing or modifying code that sends
a wine label image to the Claude API for extraction.

### Key principles to always follow:
- Always send the structured extraction prompt from the reference file — do
  not improvise a new prompt each time. Consistency matters for downstream
  parsing.
- Parse the API response into the same structured schema used by the
  Tesseract path so downstream database matching works identically regardless
  of which path was used.
- Handle the case where the API cannot confidently extract a field — return
  null for that field rather than a guess.

---

## Shared Output Schema

Both paths must produce output in this shape before passing to database search:

```typescript
interface WineExtraction {
  name: string | null;
  producer: string | null;
  vintage: number | null;
  region: string | null;
  country: string | null;
  price: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'tesseract' | 'claude-vision';
}
```

Never pass raw OCR text strings directly to the database. Always parse into
this schema first.

---

## Database Integration

After extraction, the structured result feeds into the existing Sommeasy wine
database search. Before writing any new search/matching logic:
1. Check the existing codebase for the current wine matching/search function
2. Extend it to accept `WineExtraction` input rather than rebuilding from scratch
3. Prioritise matching on `name` + `vintage` + `producer` in that order

---

## Common Pitfalls to Avoid

- **Don't run Tesseract on the server.** It is a browser library. Use it in
  a client component or a `useEffect`.
- **Don't skip image preprocessing.** Raw uploads will give poor OCR results.
  Always resize, convert to greyscale, and increase contrast first.
- **Don't use a single code path for all image types.** Bottle labels need
  Vision; menus and shelf tags need Tesseract. Keep them separate.
- **Don't hardcode the Anthropic API key** in frontend code. Always use an
  environment variable via a Next.js API route.

---

## Reference Files

- `references/tesseract-patterns.md` — Full Tesseract.js implementation for Next.js
- `references/vision-patterns.md` — Claude Vision API call pattern + prompt template
