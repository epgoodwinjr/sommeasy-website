import { NextResponse } from "next/server";
import { extractText } from "unpdf";

export const maxDuration = 45;

const EXTRACT_PROMPT = `Extract the wine list from this content. Output ONLY the wine list text, formatted as one wine per line.

For each wine, include whatever information is available: wine name, producer/winery, grape variety, region, vintage year, and price.

Preserve section headers like "RED WINE", "WHITE WINE", "SPARKLING", "PINOT NOIR", "CHARDONNAY" etc. on their own lines — these help identify the wine type.

If you see glass/bottle pricing like "10/40" or "$10/$40", keep that format.
If prices are listed separately (e.g. in a table column), put the price at the end of each line with a $ sign.

Do NOT include beer, cocktails, spirits, or food items.
Do NOT add any commentary, explanations, or markdown formatting.
Just the raw wine list text, cleaned up for readability.

If there is no wine list in this content, respond with exactly: NOT_A_WINE_LIST`;

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

    let parsedUrl;
    try {
      parsedUrl = new URL(url.startsWith("http") ? url : "https://" + url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const fetchUrl = parsedUrl.toString();
    const urlPath = parsedUrl.pathname.toLowerCase();

    // ─── FETCH THE PAGE ───
    let pageResponse;
    try {
      pageResponse = await fetch(fetchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (!pageResponse.ok) {
        return NextResponse.json(
          { error: `Could not access that page (${pageResponse.status}). The site may block automated access.` },
          { status: 422 }
        );
      }
    } catch (fetchErr) {
      if (fetchErr.name === "TimeoutError") {
        return NextResponse.json({ error: "Page took too long to load (15s timeout)" }, { status: 422 });
      }
      console.error("Fetch error:", fetchErr.message);
      return NextResponse.json({ error: "Could not reach that URL. Check the address and try again." }, { status: 422 });
    }

    const contentType = pageResponse.headers.get("content-type") || "";
    const isPdf =
      contentType.includes("application/pdf") ||
      (contentType.includes("application/octet-stream") && urlPath.endsWith(".pdf")) ||
      urlPath.endsWith(".pdf");

    // ─── PDF HANDLING: extract text with unpdf, then send to Claude ───
    if (isPdf) {
      const pdfBuffer = await pageResponse.arrayBuffer();

      if (pdfBuffer.byteLength > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "PDF is too large (max 20MB)" }, { status: 422 });
      }
      if (pdfBuffer.byteLength < 100) {
        return NextResponse.json({ error: "PDF appears to be empty or corrupted." }, { status: 422 });
      }

      let pdfText = "";
      try {
        const uint8 = new Uint8Array(pdfBuffer);
        const result = await extractText(uint8, { mergePages: true });
        pdfText = result.text || "";
      } catch (pdfErr) {
        console.error("PDF parse error:", pdfErr.message);
        return NextResponse.json(
          { error: "Could not read this PDF. It may be password-protected or image-based. Try the Snap Photo tab instead." },
          { status: 422 }
        );
      }

      // Image-based PDFs yield little/no text
      if (pdfText.trim().length < 30) {
        return NextResponse.json(
          { error: "This PDF appears to be image-based (scanned). Use the Snap Photo tab — take a screenshot or photo of the wine list." },
          { status: 422 }
        );
      }

      if (pdfText.length > 20000) {
        pdfText = pdfText.substring(0, 20000);
      }

      return await callClaude(
        apiKey,
        `Here is text extracted from a restaurant wine list PDF:\n\n---\n${pdfText}\n---\n\n${EXTRACT_PROMPT}`,
        "pdf"
      );
    }

    // ─── HTML HANDLING ───
    const html = await pageResponse.text();

    let pageText = html
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

    if (pageText.length > 15000) {
      pageText = pageText.substring(0, 15000);
    }

    if (pageText.length < 50) {
      return NextResponse.json(
        { error: "Could not extract text from that page. It may use JavaScript rendering that we can't access." },
        { status: 422 }
      );
    }

    return await callClaude(
      apiKey,
      `Here is text extracted from a restaurant webpage at ${parsedUrl.hostname}:\n\n---\n${pageText}\n---\n\n${EXTRACT_PROMPT}`,
      "html"
    );
  } catch (err) {
    console.error("Fetch-menu route error:", err);
    return NextResponse.json({ error: "Failed to process URL" }, { status: 500 });
  }
}

// ─── Shared: Call Claude to extract/structure wine list from text ───
async function callClaude(apiKey, prompt, source) {
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
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!claudeResponse.ok) {
    const errBody = await claudeResponse.text();
    console.error(`Claude API error (${source}):`, claudeResponse.status, errBody);
    return NextResponse.json({ error: "Failed to analyze page content" }, { status: 502 });
  }

  const claudeData = await claudeResponse.json();
  const extractedText = claudeData.content
    ?.filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  if (!extractedText || extractedText.includes("NOT_A_WINE_LIST")) {
    const hint =
      source === "pdf"
        ? "Could not find a wine list in this PDF. It may be a food menu without wines."
        : "Could not find a wine list on that page. Try a direct link to the wine/drinks menu.";
    return NextResponse.json({ error: hint, text: "" });
  }

  return NextResponse.json({ text: extractedText, source, usage: claudeData.usage });
}
