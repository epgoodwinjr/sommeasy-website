import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Menu fetch service not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "No URL provided" }, { status: 400 });
    }

    // Basic URL validation
    let parsedUrl;
    try {
      parsedUrl = new URL(url.startsWith("http") ? url : "https://" + url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Fetch the page
    let pageText;
    const fetchUrl = parsedUrl.toString();
    
    try {
      const pageResponse = await fetch(fetchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (!pageResponse.ok) {
        return NextResponse.json({
          error: `Could not access that page (${pageResponse.status}). The site may block automated access.`,
        }, { status: 422 });
      }

      const contentType = pageResponse.headers.get("content-type") || "";
      const urlPath = parsedUrl.pathname.toLowerCase();
      const isPdf = contentType.includes("application/pdf") || contentType.includes("application/octet-stream") && urlPath.endsWith(".pdf") || urlPath.endsWith(".pdf");
      
      // Handle PDF — send as document to Claude
      if (isPdf) {
        const pdfBuffer = await pageResponse.arrayBuffer();
        const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");
        
        // Check size — Claude has limits
        if (pdfBuffer.byteLength > 20 * 1024 * 1024) {
          return NextResponse.json({ error: "PDF is too large (max 20MB)" }, { status: 422 });
        }

        if (pdfBuffer.byteLength < 100) {
          return NextResponse.json({ error: "PDF appears to be empty or corrupted." }, { status: 422 });
        }

        const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "pdfs-2024-09-25",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "document",
                    source: {
                      type: "base64",
                      media_type: "application/pdf",
                      data: pdfBase64,
                    },
                  },
                  {
                    type: "text",
                    text: EXTRACT_PROMPT,
                  },
                ],
              },
            ],
          }),
        });

        if (!claudeResponse.ok) {
          const errBody = await claudeResponse.text();
          console.error("Claude PDF error:", claudeResponse.status, errBody);
          return NextResponse.json({ error: `Failed to process PDF (${claudeResponse.status}). The PDF may be image-based — try using Snap Photo instead.` }, { status: 502 });
        }

        const claudeData = await claudeResponse.json();
        const extractedText = claudeData.content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");

        if (!extractedText || extractedText.includes("NOT_A_WINE_LIST")) {
          return NextResponse.json({
            error: "Could not find a wine list in this PDF.",
            text: "",
          });
        }

        return NextResponse.json({ text: extractedText, source: "pdf", usage: claudeData.usage });
      }

      // HTML page — extract text content
      const html = await pageResponse.text();
      
      // Strip HTML tags, scripts, styles to get text content
      pageText = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[\s\S]*?<\/footer>/gi, "")
        .replace(/<header[\s\S]*?<\/header>/gi, "")
        .replace(/<[^>]+>/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#\d+;/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      // Truncate to ~15k chars to stay within Claude's sweet spot
      if (pageText.length > 15000) {
        pageText = pageText.substring(0, 15000);
      }

      if (pageText.length < 50) {
        return NextResponse.json({
          error: "Could not extract text from that page. It may use JavaScript rendering that we can't access.",
        }, { status: 422 });
      }
    } catch (fetchErr) {
      if (fetchErr.name === "TimeoutError") {
        return NextResponse.json({ error: "Page took too long to load (15s timeout)" }, { status: 422 });
      }
      return NextResponse.json({ error: "Could not reach that URL. Check the address and try again." }, { status: 422 });
    }

    // Send page text to Claude to extract wine list
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
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
            content: `Here is text extracted from a restaurant webpage at ${parsedUrl.hostname}:\n\n---\n${pageText}\n---\n\n${EXTRACT_PROMPT}`,
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      console.error("Claude extract error:", await claudeResponse.text());
      return NextResponse.json({ error: "Failed to analyze page content" }, { status: 502 });
    }

    const claudeData = await claudeResponse.json();
    const extractedText = claudeData.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (!extractedText || extractedText.includes("NOT_A_WINE_LIST")) {
      return NextResponse.json({
        error: "Could not find a wine list on that page. Try a direct link to the wine/drinks menu.",
        text: "",
      });
    }

    return NextResponse.json({ text: extractedText, source: "html", usage: claudeData.usage });
  } catch (err) {
    console.error("Fetch-menu route error:", err);
    return NextResponse.json({ error: "Failed to process URL" }, { status: 500 });
  }
}

const EXTRACT_PROMPT = `Extract the wine list from this content. Output ONLY the wine list text, formatted as one wine per line.

For each wine, include whatever information is available: wine name, producer/winery, grape variety, region, vintage year, and price.

Preserve section headers like "RED WINE", "WHITE WINE", "SPARKLING", "PINOT NOIR", "CHARDONNAY" etc. on their own lines — these help identify the wine type.

If you see glass/bottle pricing like "10/40" or "$10/$40", keep that format.
If prices are listed separately (e.g. in a table column), put the price at the end of each line with a $ sign.

Do NOT include beer, cocktails, spirits, or food items.
Do NOT add any commentary, explanations, or markdown formatting.
Just the raw wine list text, cleaned up for readability.

If there is no wine list in this content, respond with exactly: NOT_A_WINE_LIST`;
