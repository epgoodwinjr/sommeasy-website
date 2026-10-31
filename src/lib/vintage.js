// vintage.js — split a wine's vintage off its name (The House List).
//
// House List rows set the vintage apart from the name — italic at the end of
// a rec row, inline after the name on a pick or the log rate step — so every
// surface needs the same split. Only a trailing 19xx/20xx counts, set off by
// a space or a comma ("Meerlust Rubicon, 2019"). A year anywhere else, a
// number glued to a word ("Cuvée2019") or a bare year with no name left
// stays whole. Pure and dependency-free; vintage.test.js runs the real
// module in plain node.

const TRAILING_VINTAGE = /[\s,]((?:19|20)\d{2})$/;

/**
 * splitVintage("Raats Original Chenin Blanc 2022")
 *   → { base: "Raats Original Chenin Blanc", vintage: "2022" }
 * No trailing vintage → { base: <the trimmed name>, vintage: null }.
 * Junk (non-string) → { base: "", vintage: null }, never a throw.
 */
export function splitVintage(name) {
  const text = typeof name === "string" ? name.trim() : "";
  const match = text.match(TRAILING_VINTAGE);
  if (!match) return { base: text, vintage: null };
  const base = text.slice(0, match.index).replace(/[\s,]+$/, "");
  if (!base) return { base: text, vintage: null };
  return { base, vintage: match[1] };
}
