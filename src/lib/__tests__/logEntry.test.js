// Log entry suite — The House List, Phase 2 (Log a bottle's rate step)
// Run with: node src/lib/__tests__/logEntry.test.js
//
// Tests the REAL module via dynamic import (logEntry.js depends only on the
// dependency-free vintage.js). The rules pinned here:
//   1. A picked or typed name (search, want list, as written) saves under
//      its STORED name, byte for byte, unless the user edits it — the
//      stored name is the journal row's key, so logging a want row must hit
//      that exact row, irregular whitespace and all. A whitespace-only
//      touch is not an edit.
//   2. An edited name keeps the vintage the display split off; a read label
//      never gains one (producer + name, home's semantics since day one).
//   3. "First rated bottle ever" is only claimed from a journal read that
//      SUCCEEDED — unknown ≠ empty.

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

async function main() {
  const { entryFromName, entryFromScan, nameToSave, isFirstRating } = await import("../logEntry.js");
  const edit = (entry, base) => ({ ...entry, base });

  console.log("\n═══ Suite 1: picked and typed names ═══");

  await test("the display splits the vintage off; the stored name is kept whole", () => {
    const e = entryFromName("want", "Sadie Family Palladius 2020");
    assertEq([e.base, e.vintage], ["Sadie Family Palladius", "2020"], "display split");
    assertEq(nameToSave(e), "Sadie Family Palladius 2020", "unedited → the stored name");
  });

  await test("irregular whitespace in a stored name survives the round trip byte for byte", () => {
    const stored = "Domaine  Huet Le Mont, Vouvray 2021 ";
    const e = entryFromName("want", stored);
    assertEq(nameToSave(e), stored, "unedited → exact stored key");
    assertEq(nameToSave(edit(e, "Domaine Huet Le Mont, Vouvray")), stored, "a whitespace-only touch is not an edit");
  });

  await test("an edited name keeps the vintage the display split off", () => {
    const e = entryFromName("search", "Raats Original Chenin Blanc 2022");
    assertEq(nameToSave(edit(e, "Raats Old Vine Chenin Blanc")), "Raats Old Vine Chenin Blanc 2022", "vintage re-attached");
    assertEq(nameToSave(edit(e, "  Raats   Old Vine  ")), "Raats Old Vine 2022", "edits are tidied");
  });

  await test("an emptied name saves nothing; junk names make no entry", () => {
    assertEq(nameToSave(edit(entryFromName("written", "Something 2019"), "   ")), "", "empty");
    assertEq(entryFromName("search", "   "), null, "blank");
    assertEq(entryFromName("search", 42), null, "not a string");
  });

  console.log("\n═══ Suite 2: a read label ═══");

  await test("a scan saves producer + name; its vintage only shows", () => {
    const e = entryFromScan("scan", "Ken Forrester The FMC Chenin Blanc", 2021);
    assertEq([e.base, e.vintage], ["Ken Forrester The FMC Chenin Blanc", "2021"], "display");
    assertEq(nameToSave(e), "Ken Forrester The FMC Chenin Blanc", "unedited");
    assertEq(nameToSave(edit(e, "Ken Forrester FMC Chenin Blanc")), "Ken Forrester FMC Chenin Blanc", "edited — still no vintage");
  });

  await test("a scan with no name makes no entry; no vintage reads as null", () => {
    assertEq(entryFromScan("photo", "", 2020), null, "no name");
    assertEq(entryFromScan("photo", "Raats Chenin", null).vintage, null, "no vintage");
  });

  console.log("\n═══ Suite 3: the first rated bottle ═══");

  await test("first only when the journal read succeeded and holds no rating", () => {
    assertEq(isFirstRating([], true), true, "empty journal");
    assertEq(isFirstRating([{ rating: null, interaction_type: "want" }], true), true, "wants don't count");
    assertEq(isFirstRating([{ rating: "fine" }], true), false, "a rating exists");
  });

  await test("a failed or missing read never claims first", () => {
    assertEq(isFirstRating([], false), false, "read failed");
    assertEq(isFirstRating(null, true), false, "no rows");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
