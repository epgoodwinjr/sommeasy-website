import { NextResponse } from "next/server";
import { getDocumentProxy } from "unpdf";

export const maxDuration = 45;

// ─── Clean up extracted text for the wine parser ───
function cleanExtractedText(text) {
  let lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // PASS 1: Per-line cleanup
  lines = lines.map((line) => {
    let l = line;

    // Strip bin/item numbers at start: "1011}" or "1056}"
    l = l.replace(/^\d{2,5}\}\s*/, "");
    // Strip leading ref codes like "R15 " or "B11 "
    l = l.replace(/^[A-Z]\d{1,3}\s+/, "");
    // Clean stray curly braces
    l = l.replace(/[{}]/g, "");

    // Replace dot leaders (". . . . ." or ".......") with single space
    l = l.replace(/(?:\.\s*){3,}/g, " ");

    // Fix broken accents from PDF text extraction
    // PDF extractors sometimes insert a space before accented chars
    l = l.replace(/Ros\s+é/gi, "Rosé");
    l = l.replace(/Cr\s+émant/g, "Crémant");
    l = l.replace(/Ch\s+âteau/gi, "Château");
    l = l.replace(/C\s+ôte/g, "Côte");
    l = l.replace(/Rh\s+ône/gi, "Rhône");
    l = l.replace(/M\s+édoc/g, "Médoc");
    l = l.replace(/B\s+eaune/g, "Beaune");
    l = l.replace(/St[\s.-]+Émilion/gi, "St-Émilion");
    l = l.replace(/Ép\s+ernay/g, "Épernay");
    l = l.replace(/Cru\s+s/g, "Crus");
    l = l.replace(/Cuv\s+ée/g, "Cuvée");
    l = l.replace(/Premi\s+ère/g, "Première");
    l = l.replace(/Réserv\s+e/g, "Réserve");

    // Collapse multiple spaces
    l = l.replace(/\s{2,}/g, " ");

    return l.trim();
  });

  // PASS 2: Merge orphan lines (prices split across lines by dot leaders)
  const merged = [];
  for (const line of lines) {
    if (!line || line.length < 2) continue;

    // Line is just a number (orphan price from dot-leader line wrap): merge with previous
    if (/^\d{1,4}\.?\s*$/.test(line) && merged.length > 0) {
      const price = line.replace(/\.$/, "").trim();
      merged[merged.length - 1] += " " + price;
      continue;
    }

    // Line is only dots/spaces — discard
    if (/^[.\s]+$/.test(line)) continue;

    merged.push(line);
  }

  return merged.join("\n");
}

// ─── Extract text from PDF with line-break awareness ───
// Uses Y-coordinate changes to detect new lines in the PDF layout
async function extractPdfText(buffer) {
  const uint8 = new Uint8Array(buffer);
  const doc = await getDocumentProxy(uint8);
  const allLines = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    if (!content.items.length) continue;

    // Group text items into lines by Y-coordinate
    let currentLine = "";
    let lastY = null;

    for (const item of content.items) {
      if (!item.str && item.str !== "") continue;

      // transform[5] is the Y position on the page
      const y = item.transform ? item.transform[5] : null;

      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        // Y changed significantly — this is a new line
        if (currentLine.trim()) {
          allLines.push(currentLine.trim());
        }
        currentLine = item.str;
      } else {
        // Same line — append with space if needed
        if (currentLine && item.str && !currentLine.endsWith(" ") && !item.str.startsWith(" ")) {
          currentLine += " " + item.str;
        } else {
          currentLine += item.str;
        }
      }

      if (y !== null) lastY = y;
    }

    // Don't forget the last line on the page
    if (currentLine.trim()) {
      allLines.push(currentLine.trim());
    }

    page.cleanup();
  }

  await doc.destroy();
  return allLines.join("\n");
}

export async function POST(request) {
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

    // ─── PDF HANDLING: extract text with unpdf, clean up, pass to paste box ───
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
        pdfText = await extractPdfText(pdfBuffer);
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

      if (pdfText.length > 12000) {
        pdfText = pdfText.substring(0, 12000);
      }

      // Clean up PDF artifacts
      pdfText = cleanExtractedText(pdfText);

      return NextResponse.json({ text: pdfText, source: "pdf" });
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

    // Clean up HTML artifacts
    pageText = cleanExtractedText(pageText);

    return NextResponse.json({ text: pageText, source: "html" });
  } catch (err) {
    console.error("Fetch-menu route error:", err);
    return NextResponse.json({ error: "Failed to process URL" }, { status: 500 });
  }
}
