import { NextResponse } from "next/server";
import Tesseract from "tesseract.js";

export const maxDuration = 30;

// Parse wine info from raw OCR text
function parseWineLabel(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
  if (lines.length === 0) return null;

  let wineName = "";
  let vintage = null;
  let region = "";
  const allText = lines.join(" ");

  // Extract vintage year (4-digit number between 1970-2030)
  const yearMatch = allText.match(/\b(19[7-9]\d|20[0-3]\d)\b/);
  if (yearMatch) vintage = yearMatch[1];

  // Common wine regions to detect
  const knownRegions = [
    "Bordeaux", "Burgundy", "Bourgogne", "Champagne", "Rhône", "Rhone",
    "Loire", "Alsace", "Provence", "Languedoc", "Côtes du Rhône",
    "Tuscany", "Toscana", "Piedmont", "Piemonte", "Veneto", "Sicily", "Sicilia",
    "Barolo", "Barbaresco", "Chianti", "Brunello", "Bolgheri",
    "Rioja", "Ribera del Duero", "Priorat", "Rías Baixas",
    "Napa Valley", "Sonoma", "Willamette", "Paso Robles", "Santa Barbara",
    "Stellenbosch", "Constantia", "Swartland", "Walker Bay", "Franschhoek",
    "Mendoza", "Colchagua", "Maipo", "Casablanca",
    "Barossa", "McLaren Vale", "Margaret River", "Hunter Valley",
    "Marlborough", "Central Otago", "Hawke's Bay",
    "Mosel", "Rheingau", "Pfalz", "Wachau",
    "Douro", "Alentejo", "Dão",
    "Pomerol", "Saint-Émilion", "St-Émilion", "Pauillac", "Margaux",
    "Médoc", "Haut-Médoc", "Graves", "Sauternes", "Pessac-Léognan",
    "Meursault", "Chablis", "Gevrey-Chambertin", "Nuits-Saint-Georges",
    "Côte de Beaune", "Côte de Nuits", "Beaujolais",
    "Châteauneuf-du-Pape", "Hermitage", "Côte-Rôtie", "Gigondas",
  ];

  for (const r of knownRegions) {
    if (allText.toLowerCase().includes(r.toLowerCase())) {
      region = r;
      break;
    }
  }

  // Build wine name from the most prominent text lines
  // Wine labels typically have the producer/name in the largest/first lines
  // Filter out very short words and noise
  const nameLines = lines
    .filter((l) => {
      const lower = l.toLowerCase();
      // Skip lines that are just a year, alcohol %, volume, or common label noise
      if (/^\d{4}$/.test(l)) return false;
      if (/^\d+(\.\d+)?%/.test(l)) return false;
      if (/\d+\s*(ml|cl|l)\b/i.test(l)) return false;
      if (/^(product of|produced|bottled|imported|contains|alcohol|estate|winery|vineyard|appellation|mis en bouteille)/i.test(lower)) return false;
      if (/^(vin de|vino de|denominazione|denominación|appellation)/i.test(lower)) return false;
      return true;
    })
    .slice(0, 4); // Take top 4 meaningful lines

  wineName = nameLines.join(", ").replace(/\s+/g, " ").trim();

  // If we found a vintage, append it
  if (vintage && !wineName.includes(vintage)) {
    wineName = wineName + " " + vintage;
  }

  if (wineName.length < 3) return null;

  return {
    wineName,
    vintage,
    region,
    rawText: lines.join("\n"),
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // image is base64 data URL
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Run OCR with Tesseract.js
    const { data } = await Tesseract.recognize(buffer, "eng", {
      logger: () => {}, // suppress logs
    });

    const ocrText = data.text || "";

    if (ocrText.trim().length < 5) {
      return NextResponse.json({
        error: "Could not read text from this image. Try a clearer photo with good lighting, focused on the label.",
      }, { status: 422 });
    }

    // Parse wine info from OCR text
    const parsed = parseWineLabel(ocrText);

    if (!parsed) {
      return NextResponse.json({
        error: "Found some text but couldn't identify a wine. Try a closer photo of just the label.",
        rawText: ocrText,
      }, { status: 422 });
    }

    return NextResponse.json({
      ...parsed,
      confidence: data.confidence,
    });
  } catch (err) {
    console.error("OCR bottle error:", err);
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  }
}
