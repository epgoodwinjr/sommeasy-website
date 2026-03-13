import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseLabelResponse } from "@/lib/wineExtraction";

export const maxDuration = 30;

const LABEL_EXTRACTION_PROMPT = `You are analysing a wine bottle label photo for the Sommeasy app.

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
}`;

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Label scanning isn't configured yet — try typing the wine name instead." },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image");

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mediaType = file.type || "image/jpeg";

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: LABEL_EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((b) => b.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    const extraction = parseLabelResponse(textContent.text);
    return NextResponse.json(extraction);
  } catch (err) {
    console.error("Label scan error:", err);
    return NextResponse.json(
      { error: "Failed to scan label. Please try again." },
      { status: 500 }
    );
  }
}
