import { NextResponse } from "next/server";

export const maxDuration = 30; // Allow up to 30s for Claude Vision

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OCR service not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { image, mediaType } = body;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Call Claude Vision API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: image,
                },
              },
              {
                type: "text",
                text: `Extract the wine list from this image. Output ONLY the wine list text, formatted as one wine per line.

For each wine, include whatever you can read: wine name, producer/winery, grape variety, region, vintage year, and price.

Preserve section headers like "RED WINE", "WHITE WINE", "SPARKLING", "PINOT NOIR", "CHARDONNAY" etc. on their own lines — these help identify the wine type.

If you see glass/bottle pricing like "10/40" or "$10/$40", keep that format.

Do NOT add any commentary, explanations, or markdown formatting. Just the raw wine list text as it appears, cleaned up for readability.

If this is not a wine list or menu, respond with: NOT_A_WINE_LIST`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return NextResponse.json({ error: "OCR processing failed" }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!text || text.includes("NOT_A_WINE_LIST")) {
      return NextResponse.json({
        error: "Could not detect a wine list in this image. Try a clearer photo of the wine section.",
        text: "",
      });
    }

    return NextResponse.json({ text, usage: data.usage });
  } catch (err) {
    console.error("OCR route error:", err);
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  }
}
