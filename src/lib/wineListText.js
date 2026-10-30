// wineListText.js — does a non-JSON Vision reply read as a wine list?
//
// /api/parse-wine-list asks Claude for JSON. When the reply won't parse,
// the route falls back to Path B: the raw text goes to the client's
// parseWineList and is shown in the paste box as "Extracted from your
// photo — review and edit". That is only honest when the text IS a wine
// list. When Claude can't see one (a blank, tiny, or unreadable image) it
// sometimes ignores the JSON instruction and answers in conversation —
// "I don't see any image attached to your message…" — and that prose must
// reach the user as the branded scan error, never as editable "extracted"
// text.
//
// Shape over vocabulary: a refusal can be phrased a thousand ways, but a
// list always has entries. So the test is positive evidence — lines that
// carry a price or a vintage — and the model's conversational lines never
// count toward it (they can quote numbers: "a price of $45"), and sink it
// when they outnumber the entries.
//
// Dependency-free on purpose so the unit suite runs the real module in
// plain node (the tableVerdict pattern).

// Two entry lines make a list; one line is too little list-like text.
const MIN_ENTRY_LINES = 2;

// Prices: a currency mark beside a number, or a number closing the line —
// OCR'd and pasted lists often drop the "$", and "14/56" glass/bottle pairs
// end on a number too. Vintages: a plausible year, or NV.
const CURRENCY_PRICE = /[$£€]\s?\d|\d\s?[€£]/;
const TRAILING_NUMBER = /\d[^\p{L}\p{N}]{0,3}$/u;
const VINTAGE = /\b(?:19|20)\d{2}\b|\bNV\b/;

// The model talking to the diner: second person, politeness, apology, or
// first person ("I don't see…", "I'll extract…"). "I" counts only before a
// lowercase word or as a contraction, so Italian producers ("I Sodi", "I
// Clivi") and roman-numeral cuvées never read as conversation.
const SECOND_PERSON_OR_POLITE = /\b(?:you|your|yours|please|sorry|unfortunately|apologi[sz]e)\b/i;
const FIRST_PERSON = /\bI(?:['’](?:m|ve|d|ll)\b|\s+[a-z])/;

/**
 * True when at least MIN_ENTRY_LINES lines carry a price or vintage outside
 * conversation, and those entries at least match the conversational lines.
 * Neutral lines (section headers, tasting notes, producer-only lines) count
 * for neither side. Pinned by wineListText.test.js.
 *
 * @param {unknown} text the model's raw (non-JSON) reply
 * @returns {boolean}
 */
export function looksLikeWineList(text) {
  if (typeof text !== "string") return false;
  let entryLines = 0;
  let talkLines = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (SECOND_PERSON_OR_POLITE.test(line) || FIRST_PERSON.test(line)) talkLines++;
    else if (CURRENCY_PRICE.test(line) || TRAILING_NUMBER.test(line) || VINTAGE.test(line)) entryLines++;
  }
  return entryLines >= MIN_ENTRY_LINES && entryLines >= talkLines;
}
