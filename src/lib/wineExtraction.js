/**
 * Shared WineExtraction schema and helpers.
 *
 * Both the Tesseract path (menus/shelf tags) and the Claude Vision path
 * (bottle labels) must produce this shape before any database matching.
 *
 * @typedef {Object} WineExtraction
 * @property {string|null} name
 * @property {string|null} producer
 * @property {number|null} vintage
 * @property {string|null} region
 * @property {string|null} country
 * @property {string|null} price
 * @property {'high'|'medium'|'low'} confidence
 * @property {'tesseract'|'claude-vision'} source
 */

/**
 * Create an empty low-confidence extraction (used as fallback on errors).
 * @param {'tesseract'|'claude-vision'} source
 * @returns {WineExtraction}
 */
export function emptyExtraction(source) {
  return {
    name: null,
    producer: null,
    vintage: null,
    region: null,
    country: null,
    price: null,
    confidence: "low",
    source,
  };
}

/**
 * Parse Claude Vision JSON response into WineExtraction.
 * @param {string} responseText - Raw text from Claude API response
 * @returns {WineExtraction}
 */
export function parseLabelResponse(responseText) {
  try {
    const cleaned = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      name: parsed.name ?? null,
      producer: parsed.producer ?? null,
      vintage: typeof parsed.vintage === "number" ? parsed.vintage : null,
      region: parsed.region ?? null,
      country: parsed.country ?? null,
      price: null, // labels don't contain pricing
      confidence: ["high", "medium", "low"].includes(parsed.confidence)
        ? parsed.confidence
        : "low",
      source: "claude-vision",
    };
  } catch {
    return emptyExtraction("claude-vision");
  }
}

/**
 * Parse raw Tesseract OCR text into WineExtraction.
 * @param {string} rawText
 * @param {number} ocrConfidence - Tesseract confidence 0-100
 * @returns {WineExtraction}
 */
export function parseOCRText(rawText, ocrConfidence) {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const fullText = lines.join(" ");

  // Vintage: 4-digit year between 1900–2030
  const vintageMatch = fullText.match(/\b(19[0-9]{2}|20[0-2][0-9]|2030)\b/);
  const vintage = vintageMatch ? parseInt(vintageMatch[1]) : null;

  // Price: currency symbol + digits, or digits + currency code
  const priceMatch = fullText.match(
    /[$£€]\s?\d+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?\s?(?:USD|GBP|EUR)/i
  );
  const price = priceMatch ? priceMatch[0].trim() : null;

  // Region hints
  const regionKeywords = [
    "Bordeaux", "Burgundy", "Champagne", "Rhône", "Alsace", "Loire",
    "Tuscany", "Piedmont", "Veneto", "Rioja", "Priorat", "Ribera",
    "Napa", "Sonoma", "Willamette", "Barossa", "Marlborough",
    "Stellenbosch", "Franschhoek", "Swartland", "Mendoza",
    "Central Otago", "Hawke", "Columbia", "Walla Walla",
  ];
  const region =
    regionKeywords.find((r) =>
      fullText.toLowerCase().includes(r.toLowerCase())
    ) ?? null;

  // Country from region
  const countryMap = {
    Bordeaux: "France", Burgundy: "France", Champagne: "France",
    "Rhône": "France", Alsace: "France", Loire: "France",
    Tuscany: "Italy", Piedmont: "Italy", Veneto: "Italy",
    Rioja: "Spain", Priorat: "Spain", Ribera: "Spain",
    Napa: "USA", Sonoma: "USA", Willamette: "USA",
    Columbia: "USA", "Walla Walla": "USA",
    Barossa: "Australia",
    Marlborough: "New Zealand", "Central Otago": "New Zealand",
    "Hawke": "New Zealand",
    Stellenbosch: "South Africa", Franschhoek: "South Africa",
    Swartland: "South Africa",
    Mendoza: "Argentina",
  };
  const country = region ? (countryMap[region] ?? null) : null;

  // Confidence band
  const confidence =
    ocrConfidence >= 85 ? "high" : ocrConfidence >= 70 ? "medium" : "low";

  // Name: first meaningful non-vintage, non-price line
  const nameLine =
    lines.find(
      (l) =>
        l.length > 3 &&
        !(vintageMatch && l.trim() === vintageMatch[0]) &&
        !(priceMatch && l.includes(priceMatch[0]))
    ) ?? null;

  return {
    name: nameLine,
    producer: null,
    vintage,
    region,
    country,
    price,
    confidence,
    source: "tesseract",
  };
}
