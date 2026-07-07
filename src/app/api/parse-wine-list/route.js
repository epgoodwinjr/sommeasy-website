import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, getClientIp, logVisionUsage, RATE_LIMIT_MESSAGE } from "@/lib/rateLimit";
import { CLAUDE_MODEL } from "@/lib/anthropicConfig";

export const maxDuration = 300;

const EXTRACTION_PROMPT = `You are analyzing a restaurant wine list. Extract every wine entry into a structured format.

For each wine, extract:
- name: The full wine name as it appears (producer + wine name + any designation + vintage if shown)
- vintage: The year if shown (null if not)
- price: The price as a number (null if not visible)
- section: The section header this wine falls under (e.g., "Red Wine", "White Wine", "Sparkling", "By the Glass", "France", "Pinot Noir")
- is_btg: true if this wine is in a "by the glass" section, false otherwise
- color: "red", "white", "rosé", "sparkling", or null if unclear
- variety: Primary grape variety if identifiable (e.g., "Pinot Noir", "Chardonnay"). For blends, state "blend" or list components if known (e.g., "Cabernet Sauvignon-Merlot blend"). null if unknown.
- region: Specific wine region if identifiable (e.g., "Bordeaux", "Napa Valley", "Stellenbosch"). null if unknown.
- country: Country of origin if identifiable. null if unknown.
- producer: Producer/winery/estate name, separated from the wine name where possible. null if not distinguishable.

Important instructions:
- Preserve the original language and spelling of wine names (French accents, German umlauts, etc.)
- Include ALL wines, even if partially obscured or hard to read
- Section headers are not wines — don't include them as entries
- If a wine has both glass and bottle prices, create one entry with is_btg: false and use the bottle price
- Bin numbers (e.g., "101", "#42") are not prices — ignore them
- If you cannot read a wine name clearly, include your best guess
- Always extract the vintage year when visible, even if it appears in a separate column, in small print, or after the wine name
- For the color field, use "sparkling" for any sparkling wine (Champagne, Cava, Prosecco, Crémant, Brut, Méthode Traditionnelle, Spumante, Sekt, MCC, etc.), even if it would otherwise be classified as white or rosé

Respond ONLY with a JSON object in this exact format, no other text:
{
  "wines": [
    {
      "name": "Château Margaux, Margaux 2015",
      "vintage": "2015",
      "price": 450,
      "section": "Bordeaux",
      "is_btg": false,
      "color": "red",
      "variety": "Cabernet Sauvignon blend",
      "region": "Bordeaux",
      "country": "France",
      "producer": "Château Margaux"
    }
  ],
  "metadata": {
    "total_wines": 45,
    "sections": ["Sparkling", "White Wine", "Red Wine"],
    "has_btg_section": true,
    "image_quality": "good"
  }
}`;

export async function POST(request) {
  console.log(`[parse-wine-list] Function started at ${new Date().toISOString()}`);

  // Rate limit before anything else — this is the expensive route
  const rate = checkRateLimit("parse-wine-list", getClientIp(request));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE, errorType: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Vision service not configured. Try pasting a link instead." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { imageBase64, mimeType, pdfBase64, textContent } = body;

    if (!imageBase64 && !pdfBase64 && !textContent) {
      return NextResponse.json({ error: "No image, PDF, or text provided" }, { status: 400 });
    }

    const inputType = textContent ? "TEXT" : pdfBase64 ? "PDF" : "IMAGE";
    const inputSize = textContent ? textContent.length : pdfBase64 ? pdfBase64.length : imageBase64.length;
    const startTime = Date.now();
    console.log(`[parse-wine-list] Start: ${inputType} input, ${inputSize} chars, ${new Date().toISOString()}`);

    // Build the message content for the API call
    let messageContent;
    if (textContent) {
      // Text-only path: send scraped text for structured extraction (URL path)
      messageContent = [
        { type: "text", text: `Here is the raw text extracted from a restaurant wine list webpage:\n\n---\n${textContent.substring(0, 15000)}\n---\n\n${EXTRACTION_PROMPT}` },
      ];
    } else if (pdfBase64) {
      messageContent = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfBase64,
          },
        },
        { type: "text", text: EXTRACTION_PROMPT },
      ];
    } else {
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType || "image/jpeg",
            data: imageBase64,
          },
        },
        { type: "text", text: EXTRACTION_PROMPT },
      ];
    }

    const client = new Anthropic({ apiKey, timeout: 120000 });

    console.log(`[parse-wine-list] Calling Anthropic API... (${Date.now() - startTime}ms since start)`);
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: messageContent,
        },
      ],
    });

    const apiElapsed = Date.now() - startTime;
    console.log(`[parse-wine-list] Anthropic responded in ${apiElapsed}ms`);

    const rawText = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Structured cost log — Vercel logs are the cost dashboard for now
    logVisionUsage("parse-wine-list", response.usage, apiElapsed);

    // Try to parse structured JSON (Path A)
    const cleanJson = rawText.replace(/```json\n?|```\n?/g, "").trim();
    try {
      const parsed = JSON.parse(cleanJson);

      if (!parsed.wines || !Array.isArray(parsed.wines) || parsed.wines.length === 0) {
        return NextResponse.json({
          error: "Couldn't find any wines in this image. Make sure you're photographing the wine list — not the food menu or the cover.",
          errorType: "no_wines",
          rawText,
        });
      }

      // ── DIAGNOSTIC LOGGING ── Vision raw output per wine ──
      console.log(`[parse-wine-list] ═══ ${inputType} RAW OUTPUT (${parsed.wines.length} wines, ${apiElapsed}ms) ═══`);
      parsed.wines.forEach((w, i) => {
        console.log(`[wine ${String(i + 1).padStart(2, "0")}] name: "${w.name}" | color: ${w.color} | variety: ${w.variety} | region: ${w.region} | country: ${w.country} | producer: ${w.producer} | section: ${w.section} | price: ${w.price} | vintage: ${w.vintage}`);
      });
      if (parsed.metadata) {
        console.log(`[parse-wine-list] metadata: ${JSON.stringify(parsed.metadata)}`);
      }
      console.log(`[parse-wine-list] ═══ END ${inputType} RAW OUTPUT ═══`);
      // ── END DIAGNOSTIC LOGGING ──

      return NextResponse.json({
        wines: parsed.wines,
        metadata: parsed.metadata || {},
        rawText,
        source: "vision",
      });
    } catch {
      // Path B fallback: JSON parsing failed, return raw text for parseWineList
      if (rawText.length < 20) {
        return NextResponse.json({
          error: "Couldn't read any wines from this image. Try a clearer, well-lit photo.",
          errorType: "no_wines",
        });
      }

      return NextResponse.json({
        rawText,
        source: "vision_text",
      });
    }
  } catch (err) {
    console.error("parse-wine-list route error:", err);

    // Handle specific Anthropic API errors
    if (err.name === "APIConnectionTimeoutError" || err.code === "ETIMEDOUT" || err.message?.includes("timed out")) {
      return NextResponse.json(
        { error: "That wine list took too long to read. Try photographing one page at a time, or use a smaller image.", errorType: "timeout" },
        { status: 504 }
      );
    }
    if (err.status === 429) {
      return NextResponse.json(
        { error: "Sommeasy is busy right now. Try again in a moment.", errorType: "rate_limit" },
        { status: 429 }
      );
    }
    if (err.status === 400) {
      return NextResponse.json(
        { error: "That file couldn't be processed. Try a different photo or a smaller file.", errorType: "bad_input" },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: "Something went wrong reading your wine list. Please try again.", errorType: "api_error" },
      { status: 500 }
    );
  }
}
