# Tesseract.js Patterns for Sommeasy (Next.js)

Use this file when implementing or modifying wine list / shelf tag OCR in the
Sommeasy web app. Tesseract.js runs entirely in the browser — no server
calls, no API cost.

---

## Installation

```bash
npm install tesseract.js
```

---

## Next.js Component Pattern

Tesseract.js is a browser library. Always use it inside a Client Component.

```tsx
'use client';

import { useState } from 'react';
import Tesseract from 'tesseract.js';
import { preprocessImage } from '@/lib/image-utils';
import { parseWineText } from '@/lib/wine-parser';

type ImageSource = 'wine-list' | 'shelf-tag';

interface OCRUploaderProps {
  source: ImageSource;
  onResult: (extraction: WineExtraction) => void;
}

export function TesseractOCRUploader({ source, onResult }: OCRUploaderProps) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  const handleFile = async (file: File) => {
    setStatus('processing');
    setProgress(0);

    try {
      // Step 1: Preprocess the image before OCR
      const processedDataUrl = await preprocessImage(file);

      // Step 2: Run Tesseract
      const result = await Tesseract.recognize(processedDataUrl, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      // Step 3: Check confidence before using the result
      const confidence = result.data.confidence;
      if (confidence < 70) {
        // Low confidence — flag rather than silently pass bad data
        onResult({
          name: null, producer: null, vintage: null,
          region: null, country: null, price: null,
          confidence: 'low',
          source: 'tesseract',
        });
        setStatus('done');
        return;
      }

      // Step 4: Parse raw text into structured wine data
      const extraction = parseWineText(result.data.text, confidence);
      onResult(extraction);
      setStatus('done');

    } catch (err) {
      console.error('OCR error:', err);
      setStatus('error');
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {status === 'processing' && <p>Scanning... {progress}%</p>}
      {status === 'error' && <p>Could not read the image. Please try a clearer photo.</p>}
    </div>
  );
}
```

---

## Image Preprocessing (`/lib/image-utils.ts`)

Always preprocess before passing to Tesseract. Raw photos perform
significantly worse. This runs in the browser using Canvas.

```typescript
export async function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');

      // Cap width at 2000px for performance, maintain aspect ratio
      const maxWidth = 2000;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d')!;

      // Draw the image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Convert to greyscale
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = data[i + 1] = data[i + 2] = avg;
      }

      // Increase contrast (simple linear stretch)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.4 - 30);
        data[i + 1] = data[i];
        data[i + 2] = data[i];
      }

      ctx.putImageData(imageData, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };

    img.onerror = reject;
    img.src = url;
  });
}
```

---

## Wine Text Parser (`/lib/wine-parser.ts`)

Parse raw Tesseract output into the shared `WineExtraction` schema.
Adapt the regex patterns as you learn more about the actual text formats
appearing in Sommeasy user uploads.

```typescript
import type { WineExtraction } from '@/types/wine';

export function parseWineText(rawText: string, ocrConfidence: number): WineExtraction {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const fullText = lines.join(' ');

  // Vintage: 4-digit year between 1900–2030
  const vintageMatch = fullText.match(/\b(19[0-9]{2}|20[0-2][0-9]|2030)\b/);
  const vintage = vintageMatch ? parseInt(vintageMatch[1]) : null;

  // Price: currency symbol + digits, or digits + currency code
  const priceMatch = fullText.match(/[$£€]\s?\d+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?\s?(?:USD|GBP|EUR)/i);
  const price = priceMatch ? priceMatch[0].trim() : null;

  // Region hints — extend this list as you encounter more Sommeasy user data
  const regionKeywords = [
    'Bordeaux', 'Burgundy', 'Champagne', 'Rhône', 'Alsace', 'Loire',
    'Tuscany', 'Piedmont', 'Veneto', 'Rioja', 'Priorat', 'Ribera',
    'Napa', 'Sonoma', 'Willamette', 'Barossa', 'Marlborough',
  ];
  const region = regionKeywords.find(r =>
    fullText.toLowerCase().includes(r.toLowerCase())
  ) ?? null;

  // Country — derive from region or look for explicit mention
  const countryMap: Record<string, string> = {
    Bordeaux: 'France', Burgundy: 'France', Champagne: 'France',
    Rhône: 'France', Alsace: 'France', Loire: 'France',
    Tuscany: 'Italy', Piedmont: 'Italy', Veneto: 'Italy',
    Rioja: 'Spain', Priorat: 'Spain', Ribera: 'Spain',
    Napa: 'USA', Sonoma: 'USA', Willamette: 'USA',
    Barossa: 'Australia', Marlborough: 'New Zealand',
  };
  const country = region ? (countryMap[region] ?? null) : null;

  // Confidence band
  const confidenceBand: WineExtraction['confidence'] =
    ocrConfidence >= 85 ? 'high' :
    ocrConfidence >= 70 ? 'medium' : 'low';

  // Name and producer: heuristic — first non-vintage, non-price line is
  // usually the wine name. Refine this as real data patterns emerge.
  const nameLine = lines.find(l =>
    !vintageMatch?.includes(l) &&
    !priceMatch?.includes(l) &&
    l.length > 3
  ) ?? null;

  return {
    name: nameLine,
    producer: null, // Extend parser when producer patterns become clear
    vintage,
    region,
    country,
    price,
    confidence: confidenceBand,
    source: 'tesseract',
  };
}
```

---

## Performance Notes

- Tesseract.js loads a ~10MB WASM binary on first use. Consider lazy-loading
  the component so it only loads when the user opens the image upload flow.
- For wine lists with many entries, consider splitting the image into rows
  before OCR rather than processing the whole page at once.
- Language model: `'eng'` covers most wine list text. If French wine names
  are frequently mangled, add `'fra'` as a second language: `'eng+fra'`.
