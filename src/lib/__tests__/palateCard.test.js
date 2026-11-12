// Palate card suite — Motion & the Front Door, Session 6 (README §16.3)
// Run with: node src/lib/__tests__/palateCard.test.js
//
// Tests the REAL module via dynamic import (palateCard.js is dependency-
// free). The shareable card's layout, the rules pinned here:
//   1. A 1080×1350 card: the bloom, the title, the epithet, sommeasy.wine —
//      nothing else (no name, no email), and no card without a title.
//   2. Lines never run past the measure, and break as evenly as CSS's
//      text-wrap: balance does; too many lines end in "…".
//   3. Nothing overlaps: the bloom, the words, the rule and the address
//      stack in order and stay on the card, whatever the words' length.
//   4. Junk in → null or [], never a throw.

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
function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); }
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`ASSERT FAILED: ${msg} — expected ${e}, got ${a}`);
}

async function main() {
  const card = await import("../palateCard.js");
  const { PALATE_CARD: C, balancedLines, palateCardPlan, SHARE_COPY } = card;

  // A stand-in for canvas measureText: half an em a character, at each
  // role's own size
  const SIZES = { title: C.title.size, epithet: C.epithet.size, site: C.site.size };
  const measure = (text, role) => text.length * SIZES[role] * 0.5;
  const textWidth = C.width - 2 * C.margin;
  const TITLE = "The Stellenbosch Loyalist";
  const EPITHET = "A palate rooted in Stellenbosch, loyal to the estates that made it";

  console.log("\n═══ Palate card — the layout ═══");

  await test("the card is 1080×1350 and draws the bloom, the title, the epithet and sommeasy.wine", () => {
    const plan = palateCardPlan({ title: TITLE, epithet: EPITHET }, measure);
    assertEq([plan.width, plan.height], [1080, 1350], "size");
    assertEq([...new Set(plan.lines.map((l) => l.role))], ["title", "epithet", "site"], "roles, in order");
    assertEq(plan.lines.filter((l) => l.role === "title").map((l) => l.text).join(" "), TITLE, "the whole title");
    assertEq(plan.lines.filter((l) => l.role === "epithet").map((l) => l.text).join(" "), EPITHET, "the whole epithet");
    assertEq(plan.lines.filter((l) => l.role === "site").map((l) => l.text), ["sommeasy.wine"], "the address, once");
    assertEq(plan.mark.size, 600, "a full-size bloom when the words leave room");
    assertEq(C.fileName, "sommeasy-palate.png", "the file names nobody");
  });

  await test("no title, no card; the epithet is optional", () => {
    for (const title of [undefined, null, "", "   ", 42, {}]) {
      assertEq(palateCardPlan({ title, epithet: EPITHET }, measure), null, `title ${JSON.stringify(title)}`);
    }
    assertEq(palateCardPlan({ title: TITLE }), null, "no measure");
    assertEq(palateCardPlan(undefined, measure), null, "nothing at all");
    const plan = palateCardPlan({ title: TITLE, epithet: null }, measure);
    assert(plan && !plan.lines.some((l) => l.role === "epithet"), "no epithet line");
  });

  await test("lines never run past the measure, and break evenly", () => {
    const lines = balancedLines(TITLE, textWidth, (t) => measure(t, "title"));
    assertEq(lines, ["The Stellenbosch", "Loyalist"], "two lines, broken where the title reads");
    for (const line of lines) assert(measure(line, "title") <= textWidth, `"${line}" fits`);
    // Balanced: as many lines as greedy filling needs, at the narrowest measure
    const greedyFirst = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor";
    const even = balancedLines(greedyFirst, textWidth, (t) => measure(t, "epithet"));
    const widths = even.map((l) => measure(l, "epithet"));
    assert(even.length === 2, `two lines: ${JSON.stringify(even)}`);
    assert(Math.max(...widths) - Math.min(...widths) <= 6 * C.epithet.size * 0.5,
      `even lines, not a full one and a stub: ${JSON.stringify(even)}`);
    assertEq(balancedLines("Short", textWidth, (t) => measure(t, "title")), ["Short"], "one line stays one");
  });

  await test("too many lines end in an ellipsis, inside the measure", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const lines = balancedLines(long, textWidth, (t) => measure(t, "epithet"), C.epithet.maxLines);
    assertEq(lines.length, C.epithet.maxLines, "capped");
    assert(lines[lines.length - 1].endsWith("…"), `ends in …: ${lines[lines.length - 1]}`);
    for (const line of lines) assert(measure(line, "epithet") <= textWidth, `"${line}" fits`);
    // A single word wider than the measure keeps a line of its own
    assertEq(balancedLines("Supercalifragilistic", 100, (t) => t.length * 20), ["Supercalifragilistic"], "one long word");
  });

  await test("nothing overlaps, and everything stays on the card — short words or long", () => {
    const cases = [
      { title: "The Rhône Curator" },
      { title: TITLE, epithet: EPITHET },
      { title: "The Hemel-en-Aarde Instinctive Wide-Ranging Loyalist Of Every Coast", epithet: `${EPITHET}, ${EPITHET}, ${EPITHET}` },
    ];
    for (const words of cases) {
      const plan = palateCardPlan(words, measure);
      const boxes = [{ top: plan.mark.y, bottom: plan.mark.y + plan.mark.size, what: "bloom" }];
      for (const l of plan.lines) {
        const lh = C[l.role].lineHeight;
        boxes.push({ top: l.y - lh / 2, bottom: l.y + lh / 2, what: `${l.role} "${l.text}"` });
      }
      boxes.push({ top: plan.rule.y, bottom: plan.rule.y, what: "rule" });
      boxes.sort((a, b) => a.top - b.top);
      for (let i = 1; i < boxes.length; i++) {
        assert(boxes[i].top >= boxes[i - 1].bottom, `${boxes[i].what} overlaps ${boxes[i - 1].what}`);
      }
      assert(boxes[0].top >= 0 && boxes[boxes.length - 1].bottom <= plan.height, "on the card");
      assert(plan.mark.size >= C.mark.min && plan.mark.size <= C.mark.size, `bloom ${plan.mark.size}`);
      assertEq(plan.mark.x * 2 + plan.mark.size, plan.width, "the bloom is centered");
      // The words sit inside the measure (the rule and address are short)
      for (const l of plan.lines) assert(measure(l.text, l.role) <= textWidth, `"${l.text}" fits`);
      // The order the eye reads: bloom, title, epithet, rule, address
      const order = ["bloom", "title", "epithet", "rule", "site"];
      const seen = boxes.map((b) => order.find((o) => b.what.startsWith(o)));
      assertEq(seen, [...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b)), "reading order");
    }
  });

  await test("a measure that misbehaves never throws", () => {
    // An unmeasurable word is as wide as can be: a line each, still a card
    assertEq(palateCardPlan({ title: TITLE }, () => NaN).lines.filter((l) => l.role === "title").map((l) => l.text),
      ["The", "Stellenbosch", "Loyalist"], "NaN widths");
    assertEq(palateCardPlan({ title: TITLE }, () => { throw new Error("measure"); }), null, "a measure that throws");
    assertEq(balancedLines(TITLE, 0, () => 1), [], "no measure width");
    assertEq(balancedLines(null, 500, () => 1), [], "no text");
  });

  await test("the copy, for Ed's review", () => {
    assertEq(SHARE_COPY.action, "Share your palate", "the action, as README §16.3 names it");
    for (const [key, line] of Object.entries(SHARE_COPY)) {
      assert(typeof line === "string" && line.trim() && !/error|null|undefined/i.test(line), `${key}: ${line}`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
