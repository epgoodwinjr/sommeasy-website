# Claude Vision Patterns for Sommeasy (Bottle Labels)

Use this file when implementing or modifying wine bottle label scanning in
the Sommeasy web app. This path uses the Anthropic Claude API with vision
capability to extract structured wine data from label photos.

---

## Why Vision for Labels

Bottle labels use decorative/calligraphic fonts, curved surfaces, embossing,
gold foil, crests overlapping text, and multilingual layouts. Classical OCR
(Tesseract) fails frequently on these. Claude's vision understands context —
it can infer "Château Margaux" from a stylised crest even when individual
characters are hard to isolate.

---

## Architecture: Always Use a Next.js API Route

Never call the Anthropic API directly from the browser. Always proxy through
a Next.js API route to keep the API key server-side.

```
Browser (Client Component)
  → uploads image file
  → POST /api/scan-label  (Next.js API Route)
    → converts to base64
    → calls Anthropic Claude API with vision
    → parses response into WineExtraction
    → returns JSON to browser
```

---

## API Route (`/app/api/scan-label/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // never expose this to the browser
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';

    // Call Claude with the structured extraction prompt
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: LABEL_EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    // Parse the structured response
    const textContent = response.content.find(b => b.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const extraction = parseLabelResponse(textContent.text);
    return NextResponse.json(extraction);

  } catch (err) {
    console.error('Label scan error:', err);
    return NextResponse.json(
      { error: 'Failed to scan label' },
      { status: 500 }
    );
  }
}
```

---

## The Extraction Prompt

This is the canonical prompt to use for label scanning. Do not improvise a
new prompt each time — consistent prompts produce consistent parseable output.

```typescript
const LABEL_EXTRACTION_PROMPT = `
You are analysing a wine bottle label photo for the Sommeasy app.

Extract the following fields and return them as a JSON object. If you cannot
confidently determine a field from the label, return null for that field.
Do not guess — null is better than an incorrect value.

Fields to extract:
- name: The wine's specific name or cuvée (e.g. "Grand Cru", "Reserve", "Old Vine")
- producer: The winery or château name (e.g. "Château Margaux", "Ridge Vineyards")
- vintage: The year as a 4-digit integer (e.g. 2018). Null if not visible.
- region: The wine region (e.g. "Pauillac", "Napa Valley", "Côte de Nuits")
- country: The country of origin (e.g. "France", "USA", "Italy")
- confidence: Your overall confidence in the extraction — "high", "medium", or "low"

Return ONLY the JSON object, no explanation or markdown:
{
  "name": "...",
  "producer": "...",
  "vintage": 2018,
  "region": "...",
  "country": "...",
  "confidence": "high"
}
`;
```

---

## Response Parser (`/lib/label-parser.ts`)

```typescript
import type { WineExtraction } from '@/types/wine';

export function parseLabelResponse(responseText: string): WineExtraction {
  try {
    // Claude should return clean JSON but strip any accidental markdown fences
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      name: parsed.name ?? null,
      producer: parsed.producer ?? null,
      vintage: typeof parsed.vintage === 'number' ? parsed.vintage : null,
      region: parsed.region ?? null,
      country: parsed.country ?? null,
      price: null, // Labels don't contain pricing
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence)
        ? parsed.confidence
        : 'low',
      source: 'claude-vision',
    };
  } catch {
    // If parsing fails entirely, return a low-confidence empty extraction
    return {
      name: null, producer: null, vintage: null,
      region: null, country: null, price: null,
      confidence: 'low',
      source: 'claude-vision',
    };
  }
}
```

---

## Client Component (`/components/LabelScanner.tsx`)

```tsx
'use client';

import { useState } from 'react';
import type { WineExtraction } from '@/types/wine';

interface LabelScannerProps {
  onResult: (extraction: WineExtraction) => void;
}

export function LabelScanner({ onResult }: LabelScannerProps) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');

  const handleFile = async (file: File) => {
    setStatus('scanning');

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/scan-label', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Scan failed');

      const extraction: WineExtraction = await res.json();
      onResult(extraction);
      setStatus('done');

    } catch (err) {
      console.error('Label scan failed:', err);
      setStatus('error');
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        capture="environment" // opens rear camera on mobile
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {status === 'scanning' && <p>Reading label...</p>}
      {status === 'error' && <p>Couldn't read this label. Try a clearer photo in better light.</p>}
    </div>
  );
}
```

---

## Environment Variable

Ensure this is set in `.env.local` (never committed to git):

```
ANTHROPIC_API_KEY=your_key_here
```

And in `next.config.js` / `next.config.ts`, confirm it is NOT prefixed with
`NEXT_PUBLIC_` — that prefix would would expose it to the browser.

---

## Cost Considerations

Each label scan is one Claude API call with an image attachment. Typical
cost per call is under $0.01 at current Sonnet pricing. For Sommeasy's
current scale this is negligible, but monitor usage as the user base grows.
