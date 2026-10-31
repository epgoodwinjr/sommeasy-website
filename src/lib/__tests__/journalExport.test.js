// Journal export suite — The House List, Phase 6 (README §8.8 › Your data)
// Run with: node src/lib/__tests__/journalExport.test.js
//
// Tests the REAL module via dynamic import (journalExport.js is
// dependency-free). Account's "Export your journal … CSV" builds the file
// client-side from the user's wine_interactions; the rules pinned here:
//   1. The columns, in README order — a spreadsheet's header row.
//   2. RFC 4180 quoting: commas, quotes and line breaks survive a round
//      trip; CRLF between records; a UTF-8 BOM so Excel reads "Château".
//   3. A cell that a spreadsheet would run as a formula (= + - @, tab, CR)
//      is prefixed with ' — a journal note is never code.
//   4. The file is named for the user's own day: sommeasy-journal-YYYY-MM-DD.
//   5. Junk rows are skipped, junk values print empty — never a throw.

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`ASSERT FAILED: ${msg} — expected ${e}, got ${a}`);
}

const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

// A minimal RFC 4180 reader, to prove the writer round-trips
function parseCsv(text) {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r" && body[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

async function main() {
  const exp = await import("../journalExport.js");

  console.log("\n═══ Journal export ═══");

  await test("the header is README §8.8's columns, in order", () => {
    assertEq(exp.JOURNAL_CSV_COLUMNS, [
      "wine_name", "interaction_type", "rating", "note", "place", "occasion", "somm_pick_role", "somm_note",
      "resolved_winery", "resolved_region", "resolved_country", "resolved_varietal", "created_at", "updated_at",
    ], "columns");
    const csv = exp.journalCsv([]);
    assertEq(csv.startsWith(BOM), true, "a BOM first, so Excel reads UTF-8");
    assertEq(parseCsv(csv), [exp.JOURNAL_CSV_COLUMNS], "an empty journal is the header alone");
  });

  await test("rows round-trip: commas, quotes, line breaks and accents survive", () => {
    const row = {
      wine_name: "Château Musar, Bekaa Valley 2016",
      interaction_type: "had",
      rating: "loved",
      note: `Smoke and "cedar" —\nopened slowly`,
      place: "out",
      occasion: null,
      somm_pick_role: "top_pick",
      somm_note: "The one to order.",
      resolved_winery: "Château Musar",
      resolved_region: "bekaa valley",
      resolved_country: "Lebanon",
      resolved_varietal: "Bordeaux-style Red Blend",
      created_at: "2026-08-01T19:02:11.000Z",
      updated_at: "2026-08-02T08:15:00.000Z",
      match_confidence: 90,
      user_id: "never-exported",
    };
    const csv = exp.journalCsv([row]);
    const [header, line] = parseCsv(csv);
    assertEq(header, exp.JOURNAL_CSV_COLUMNS, "header");
    assertEq(line, exp.JOURNAL_CSV_COLUMNS.map((c) => (row[c] == null ? "" : String(row[c]))), "every value, in column order");
    assertEq(csv.includes("never-exported"), false, "columns outside the list never ride along");
    assertEq(csv.split(CRLF).length, 3,
      "header CRLF record CRLF — the note's own line break stays inside its quotes");
    assertEq(csv.endsWith(CRLF), true, "a final CRLF");
  });

  await test("a cell a spreadsheet would run as a formula is prefixed with '", () => {
    const rows = ["=HYPERLINK(\"x\")", "+1 Vinho", "-fizzy", "@cellar", "\tTabbed"].map((note) => ({ wine_name: "W", note }));
    const notes = parseCsv(exp.journalCsv(rows)).slice(1).map((r) => r[exp.JOURNAL_CSV_COLUMNS.indexOf("note")]);
    assertEq(notes, ["'=HYPERLINK(\"x\")", "'+1 Vinho", "'-fizzy", "'@cellar", "'\tTabbed"], "neutralized");
    const plain = parseCsv(exp.journalCsv([{ wine_name: "2019 Raats", note: "Bright — 10/10" }]))[1];
    assertEq([plain[0], plain[3]], ["2019 Raats", "Bright — 10/10"], "ordinary text untouched");
  });

  await test("the file is named for the user's own day", () => {
    assertEq(exp.journalCsvFilename(new Date(2026, 9, 3, 23, 59)), "sommeasy-journal-2026-10-03.csv", "local date, padded");
    assertEq(exp.journalCsvFilename(new Date(2026, 0, 31, 0, 1)), "sommeasy-journal-2026-01-31.csv", "January");
  });

  await test("junk rows are skipped and junk values print empty — never a throw", () => {
    const csv = exp.journalCsv([null, 7, "row", { wine_name: "Kept", rating: { nested: true }, note: undefined }]);
    const rows = parseCsv(csv);
    assertEq(rows.length, 2, "one real row");
    assertEq(rows[1][0], "Kept", "its name");
    assertEq(rows[1].slice(1).every((v) => v === ""), true, "objects and undefined print empty");
    assertEq(parseCsv(exp.journalCsv("junk")), [exp.JOURNAL_CSV_COLUMNS], "not an array → the header alone");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
