// journalExport.js — Account › Your data › Export your journal (The House
// List §8.8): the user's wine_interactions as a CSV, built client-side.
//
// RFC 4180: a field holding a comma, a quote or a line break is quoted
// (quotes doubled), records end in CRLF, and a UTF-8 BOM leads so Excel
// reads "Château" as written. A cell a spreadsheet would run as a formula
// (one opening with = + - @, a tab or a CR) gets a leading ' — the journal
// holds free text (names, notes, occasions), and a note is never code.
// Dependency-free (journalExport.test.js runs the real module); junk rows
// are skipped and junk values print empty — never a throw.

export const JOURNAL_CSV_COLUMNS = Object.freeze([
  "wine_name", "interaction_type", "rating", "note", "place", "occasion", "somm_pick_role", "somm_note",
  "resolved_winery", "resolved_region", "resolved_country", "resolved_varietal", "created_at", "updated_at",
]);

const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function cell(value) {
  let text = typeof value === "string" ? value
    : typeof value === "number" && Number.isFinite(value) ? String(value)
    : typeof value === "boolean" ? String(value)
    : "";
  if (FORMULA_START.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The CSV text: the header, then one record per journal row. */
export function journalCsv(rows) {
  const records = [JOURNAL_CSV_COLUMNS.join(",")];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    records.push(JOURNAL_CSV_COLUMNS.map((column) => cell(row[column])).join(","));
  }
  return BOM + records.join(CRLF) + CRLF;
}

/** "sommeasy-journal-2026-10-03.csv" — the user's own day. */
export function journalCsvFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `sommeasy-journal-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}
