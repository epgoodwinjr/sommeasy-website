import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Photo recognition isn't configured yet — try typing the wine name instead." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { image, mediaType } = body;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
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
                text: `Look at this wine bottle label. Extract the wine information and respond with ONLY a JSON object — no other text:

{
  "wineName": "Producer and wine name (e.g. 'Kanonkop Pinotage' or 'Château Lynch-Bages' or 'Opus One')",
  "vintage": "4-digit year if visible, otherwise null",
  "region": "Region or appellation if visible (e.g. 'Pauillac', 'Stellenbosch', 'Napa Valley'), otherwise null"
}

If this is not a wine bottle label, respond with exactly: {"error": "not_a_wine_label"}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      let detail = "";
      try {
        const errJson = JSON.parse(errBody);
        detail = errJson.error?.message || errBody.substring(0, 150);
      } catch {
        detail = errBody.substring(0, 150);
      }
      console.error("Claude API error (ocr-bottle):", detail);
      return NextResponse.json(
        { error: `Couldn't read the label (${response.status}${detail ? ": " + detail : ""}). Try a clearer photo.` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const rawText = data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("") || "";

    // Parse the JSON response from Claude
    let parsed;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] || rawText);
    } catch {
      console.error("Failed to parse Claude JSON response:", rawText);
      return NextResponse.json(
        { error: "Couldn't read the label. Try a clearer, closer photo of the front label." },
        { status: 422 }
      );
    }

    if (parsed.error === "not_a_wine_label") {
      return NextResponse.json(
        { error: "This doesn't look like a wine label. Try a photo of just the front of the bottle." },
        { status: 422 }
      );
    }

    if (!parsed.wineName || parsed.wineName.length < 2) {
      return NextResponse.json(
        { error: "Couldn't make out the wine name. Try a clearer photo with better lighting." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      wineName: parsed.wineName,
      vintage: parsed.vintage || null,
      region: parsed.region || null,
    });
  } catch (err) {
    console.error("OCR bottle route error:", err);
    return NextResponse.json({ error: "Failed to process image. Please try again." }, { status: 500 });
  }
}
