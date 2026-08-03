/**
 * Shared WineExtraction schema and helpers.
 *
 * All label extraction runs through Claude Vision (/api/scan-label);
 * responses must be parsed into this shape before any database matching.
 *
 * @typedef {Object} WineExtraction
 * @property {string|null} name
 * @property {string|null} producer
 * @property {number|null} vintage
 * @property {string|null} region
 * @property {string|null} country
 * @property {string|null} price
 * @property {'high'|'medium'|'low'} confidence
 * @property {'claude-vision'} source
 */

/**
 * Create an empty low-confidence extraction (used as fallback on errors).
 * @param {'claude-vision'} source
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
