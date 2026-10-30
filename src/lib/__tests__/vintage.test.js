// vintage test suite — The House List, Phase 1
// Run with: node src/lib/__tests__/vintage.test.js
//
// Tests the REAL module via dynamic import (vintage.js is dependency-free).
// splitVintage(name) → { base, vintage } is how every House List row sets
// the vintage apart from the name. The rules pinned here:
//   1. Only a TRAILING 19xx/20xx splits off, set off by a space or a comma
//      ("Meerlust Rubicon, 2019"); the base loses the separator.
//   2. A year anywhere else, a number glued to a word, a year outside
//      19xx/20xx, or a year with no name in front of it stays whole —
//      vintage null, base untouched (but trimmed).
//   3. Junk input is silence ({ base: "", vintage: null }), never a throw.

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
  const { splitVintage } = await import("../vintage.js");
  const split = (base, vintage) => ({ base, vintage });

  console.log("\n═══ Suite 1: a trailing vintage splits off ═══");

  await test("space-separated vintage", () => {
    assertEq(splitVintage("Raats Original Chenin Blanc 2022"), split("Raats Original Chenin Blanc", "2022"), "space");
  });

  await test("comma-separated, with or without the space", () => {
    assertEq(splitVintage("Meerlust Rubicon, 2019"), split("Meerlust Rubicon", "2019"), "comma + space");
    assertEq(splitVintage("Meerlust Rubicon,2019"), split("Meerlust Rubicon", "2019"), "bare comma");
  });

  await test("19xx vintages and accented names", () => {
    assertEq(splitVintage("Château Musar 1999"), split("Château Musar", "1999"), "1999");
  });

  await test("surrounding and doubled whitespace is trimmed off both parts", () => {
    assertEq(splitVintage("  Kanonkop Pinotage 2019  "), split("Kanonkop Pinotage", "2019"), "outer whitespace");
    assertEq(splitVintage("Ken Forrester Chenin Blanc   2022"), split("Ken Forrester Chenin Blanc", "2022"), "inner run");
    assertEq(splitVintage("Hamilton Russell Chardonnay 2022"), split("Hamilton Russell Chardonnay", "2022"), "non-breaking space");
  });

  await test("only the LAST year splits — numbers inside the name stay", () => {
    assertEq(splitVintage("Penfolds Bin 389 2018"), split("Penfolds Bin 389", "2018"), "bin number");
    assertEq(splitVintage("Cuvée 1999 2005"), split("Cuvée 1999", "2005"), "two years");
  });

  console.log("\n═══ Suite 2: anything else stays whole ═══");

  await test("no year at all", () => {
    assertEq(splitVintage("Kanonkop Pinotage"), split("Kanonkop Pinotage", null), "no year");
    assertEq(splitVintage("Krug Grande Cuvée 170ème Édition"), split("Krug Grande Cuvée 170ème Édition", null), "edition number");
    assertEq(splitVintage("Billecart-Salmon Brut NV"), split("Billecart-Salmon Brut NV", null), "NV");
  });

  await test("a year that isn't at the end", () => {
    assertEq(splitVintage("Barolo 2016 Riserva"), split("Barolo 2016 Riserva", null), "mid-name year");
  });

  await test("a year glued to a word is part of the word", () => {
    assertEq(splitVintage("Cuvée2019"), split("Cuvée2019", null), "glued");
  });

  await test("only 19xx/20xx, and only four digits", () => {
    assertEq(splitVintage("Madeira 1875"), split("Madeira 1875", null), "18xx");
    assertEq(splitVintage("Wine 2105"), split("Wine 2105", null), "21xx");
    assertEq(splitVintage("Wine 20222"), split("Wine 20222", null), "five digits");
    assertEq(splitVintage("Wine 202"), split("Wine 202", null), "three digits");
  });

  await test("a bare year has no name to split from", () => {
    assertEq(splitVintage("2019"), split("2019", null), "bare year");
    assertEq(splitVintage(" , 2019"), split(", 2019", null), "separator only");
  });

  console.log("\n═══ Suite 3: junk is silence ═══");

  await test("non-strings and empties → empty base, null vintage", () => {
    for (const junk of [null, undefined, 2019, {}, [], "", "   "]) {
      assertEq(splitVintage(junk), split("", null), `junk ${JSON.stringify(junk)}`);
    }
  });

  await test("base + vintage rebuilds a space-separated name", () => {
    for (const name of ["Raats Original Chenin Blanc 2022", "Château Musar 1999", "Penfolds Bin 389 2018"]) {
      const { base, vintage } = splitVintage(name);
      assertEq(`${base} ${vintage}`, name, name);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
