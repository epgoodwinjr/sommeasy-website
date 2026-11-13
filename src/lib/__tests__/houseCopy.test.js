// House copy suite — The House List, Phase 2
// Run with: node src/lib/__tests__/houseCopy.test.js
//
// Tests the REAL module via dynamic import (houseCopy.js depends only on the
// dependency-free ratings.js and dnaThresholds.js). houseCopy is every line
// whose words depend on data: the verdict reply, the Log saved screen, the
// home crest's whisper/date/initial, rec meta and match tags. The rules
// pinned here:
//   1. Bottle counts come from the REAL thresholds — never a hardcoded
//      "two loved bottles" (CLAUDE.md). Expectations below are computed
//      from PROMOTION_THRESHOLDS / RATING_POINTS, then written as words.
//   2. The verdict reply takes the FIRST consequence that applies: a
//      promotion, then (loved only) the nearest un-promoted dimension, then
//      the rating's own line.
//   3. The saved screen: a shift takes the headline (and the eyebrow), each
//      promotion it pushed aside becomes a line under the recap, demotions
//      are reported too; a first-ever bottle gets its own headline.
//   4. Junk in → silence (null / "" / a quiet fallback), never a throw.
//   5. The reading lines are said here only: the real reading view and
//      Welcome's demo both call readingLine(); no other file retypes them
//      (a source scan, comments aside).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(js|jsx|ts|tsx)$/.test(name) ? [path] : [];
  });
}
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

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
  const copy = await import("../houseCopy.js");
  const { PROMOTION_THRESHOLDS, RATING_POINTS, CONFIDENCE_GATE } = await import("../dnaThresholds.js");
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const toPromote = (dim) => Math.ceil(PROMOTION_THRESHOLDS[dim] / RATING_POINTS.loved);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  console.log("\n═══ Suite 1: numbers and the bottles math ═══");

  await test("numberWord writes zero through ten as words, digits past that (the house rule)", () => {
    assertEq([0, 1, 2, 3, 9, 10].map((n) => copy.numberWord(n)), ["zero", "one", "two", "three", "nine", "ten"], "words");
    assertEq([11, 12, 40, 250].map((n) => copy.numberWord(n)), ["11", "12", "40", "250"], "digits past ten");
    assertEq(copy.numberWord(2, { capitalize: true }), "Two", "sentence start");
    assertEq(copy.numberWord(10, { capitalize: true }), "Ten", "ten opens a sentence");
    assertEq(copy.numberWord(0, { capitalize: true }), "Zero", "zero opens a sentence");
    assertEq(copy.numberWord(14, { capitalize: true }), "14", "digits have no capital");
    // Not a count → printed as it came, never a wrong word
    assertEq([2.5, -1].map((n) => copy.numberWord(n)), ["2.5", "-1"], "not a count");
  });

  await test("countOf writes a count with its noun: words to ten, the noun agreeing", () => {
    assertEq(copy.countOf(1, "wine"), "one wine", "one");
    assertEq(copy.countOf(8, "wine"), "eight wines", "eight");
    assertEq(copy.countOf(10, "wine"), "ten wines", "ten");
    assertEq(copy.countOf(11, "wine"), "11 wines", "eleven is digits");
    assertEq(copy.countOf(0, "wine"), "zero wines", "zero");
    assertEq(copy.countOf(3, "wine", { capitalize: true }), "Three wines", "opening a sentence");
    assertEq(copy.countOf(2, "page"), "two pages", "another noun");
  });

  await test("bottles to promote come from the real thresholds, per dimension", () => {
    for (const dim of ["estate", "varietal", "region", "country"]) {
      assertEq(copy.lovedBottlesToPromote(dim), toPromote(dim), dim);
    }
    assertEq(copy.lovedBottlesToPromote("vintage"), null, "unknown dimension");
  });

  await test("bottles away round up and never drop below one", () => {
    const t = PROMOTION_THRESHOLDS.region;
    assertEq(copy.lovedBottlesAway("region", t - 4), Math.ceil(4 / RATING_POINTS.loved), "4 points short");
    assertEq(copy.lovedBottlesAway("region", t - 1), 1, "1 point short rounds up to a bottle");
    assertEq(copy.lovedBottlesAway("region", t + 3), 1, "never zero");
    assertEq(copy.lovedBottlesAway("nope", 2), null, "unknown dimension");
  });

  await test("bottlesPhrase agrees in number", () => {
    assertEq(copy.bottlesPhrase(1), "one loved bottle", "singular");
    assertEq(copy.bottlesPhrase(3), "three loved bottles", "plural");
  });

  console.log("\n═══ Suite 2: the nearest un-promoted dimension ═══");

  await test("picks the mappable, un-promoted row the fewest loved bottles away", () => {
    const tR = PROMOTION_THRESHOLDS.region, tC = PROMOTION_THRESHOLDS.country;
    const rows = [
      { dimension: "country", display_name: "South Africa", points: tC - 8, promoted: false, mappable: true },
      { dimension: "region", display_name: "Hemel-en-Aarde", points: tR - 4, promoted: false, mappable: true },
    ];
    assertEq(copy.nearestPromotion(rows), { name: "Hemel-en-Aarde", dimension: "region", n: 2 }, "region is closer");
  });

  await test("promoted, unmappable and pointless rows never count", () => {
    const rows = [
      { dimension: "varietal", display_name: "Chardonnay", points: 5, promoted: true, mappable: true },
      { dimension: "estate", display_name: "Somewhere", points: 3, promoted: false, mappable: false },
      { dimension: "region", display_name: "Nowhere", points: 0, promoted: false, mappable: true },
      { dimension: "country", display_name: "Down", points: -2, promoted: false, mappable: true },
    ];
    assertEq(copy.nearestPromotion(rows), null, "nothing qualifies");
  });

  await test("a tie goes to the more specific dimension", () => {
    const rows = [
      { dimension: "varietal", display_name: "Chenin Blanc", points: PROMOTION_THRESHOLDS.varietal - 1, promoted: false, mappable: true },
      { dimension: "estate", display_name: "Raats", points: PROMOTION_THRESHOLDS.estate - 1, promoted: false, mappable: true },
    ];
    assertEq(copy.nearestPromotion(rows).name, "Raats", "estate before varietal");
  });

  await test("junk rows are skipped, junk input is null", () => {
    assertEq(copy.nearestPromotion(null), null, "null");
    assertEq(copy.nearestPromotion([null, 7, { dimension: "region" }]), null, "junk rows");
  });

  console.log("\n═══ Suite 3: the verdict reply (From last night) ═══");

  await test("a promotion is the first consequence", () => {
    assertEq(
      copy.verdictReply({ rating: "loved", promotions: [{ displayName: "Hemel-en-Aarde" }] }),
      "❤️ Loved it — noted. Hemel-en-Aarde just joined your DNA.",
      "promotion line",
    );
    assertEq(
      copy.verdictReply({ rating: "liked", promotions: [{ displayName: "Chenin Blanc" }] }),
      "👍 Liked it — noted. Chenin Blanc just joined your DNA.",
      "any rating that promotes",
    );
  });

  await test("a loved bottle names its nearest dimension, in words", () => {
    assertEq(
      copy.verdictReply({ rating: "loved", promotions: [], nearest: { name: "Hemel-en-Aarde", n: 2 } }),
      "❤️ Loved it — noted. Hemel-en-Aarde is now two loved bottles from joining your DNA.",
      "plural",
    );
    assertEq(
      copy.verdictReply({ rating: "loved", nearest: { name: "Raats", n: 1 } }),
      "❤️ Loved it — noted. Raats is now one loved bottle from joining your DNA.",
      "singular",
    );
  });

  await test("otherwise, the rating's own line", () => {
    assertEq(copy.verdictReply({ rating: "loved" }),
      "❤️ Loved it — noted. Loved bottles pull hardest — your next picks will lean its way.", "loved");
    assertEq(copy.verdictReply({ rating: "liked", nearest: { name: "X", n: 1 } }),
      "👍 Liked it — noted. A gentle nudge — your DNA leans a little its way.", "nearest is for loved only");
    assertEq(copy.verdictReply({ rating: "fine" }),
      "😐 It was fine — noted. We’ll weigh it lightly next time.", "fine");
    assertEq(copy.verdictReply({ rating: "not_for_me" }),
      "👎 Not for me — noted. We’ll steer you around it next time.", "not for me");
  });

  await test("an unknown rating is silence", () => {
    assertEq(copy.verdictReply({ rating: "meh" }), null, "junk rating");
    assertEq(copy.verdictReply(), null, "no args");
  });

  // docs/motion README §15.2: the reply is said once. What is known at the
  // tap is read when the line takes focus; what the engine adds is spoken by
  // a status region that holds nothing else.
  await test("the noted line is what is known at the tap — and every reply opens with it", () => {
    assertEq(copy.verdictNoted("loved"), "❤️ Loved it — noted.", "loved");
    assertEq(copy.verdictNoted("not_for_me"), "👎 Not for me — noted.", "not for me");
    assertEq(copy.verdictNoted("meh"), null, "junk rating");
    for (const rating of ["loved", "liked", "fine", "not_for_me"]) {
      const reply = copy.verdictReply({ rating, promotions: [{ displayName: "Raats" }] });
      assertEq(reply.startsWith(`${copy.verdictNoted(rating)} `), true, `${rating}: the reply must open with its noted line`);
    }
  });

  await test("a reply splits into what was noted and what came after — nothing said twice, nothing lost", () => {
    const noted = copy.verdictNoted("loved");
    assertEq(copy.replyParts(noted, null), { noted, more: "" }, "before the engine answers");
    assertEq(copy.replyParts(noted, undefined), { noted, more: "" }, "undefined reply");
    const reply = copy.verdictReply({ rating: "loved", nearest: { name: "Raats", n: 1 } });
    const parts = copy.replyParts(noted, reply);
    assertEq(parts, { noted, more: "Raats is now one loved bottle from joining your DNA." }, "the engine's answer");
    assertEq(`${parts.noted} ${parts.more}`, reply, "the two parts are the reply, whole");
    assertEq(parts.more.includes("noted"), false, "what came after never repeats the noted line");
    for (const rating of ["loved", "liked", "fine", "not_for_me"]) {
      const whole = copy.verdictReply({ rating });
      const split = copy.replyParts(copy.verdictNoted(rating), whole);
      assertEq(`${split.noted} ${split.more}`, whole, `${rating}: whole`);
    }
    // A reply that doesn't open with the noted line is all news
    assertEq(copy.replyParts(noted, "Something else entirely."), { noted: "", more: "Something else entirely." }, "a foreign reply");
    assertEq(copy.replyParts(null, null), { noted: "", more: "" }, "nothing at all");
    assertEq(copy.replyParts(noted, noted), { noted, more: "" }, "a reply that is only the noted line");
  });

  console.log("\n═══ Suite 4: the Log saved screen ═══");

  const shift = { shifted: true, title: "The Mosel Purist", epithet: "Slate, sugar and patience" };

  await test("a shift takes the eyebrow, the headline and the sub", () => {
    assertEq(copy.savedCopy({ rating: "loved", promotions: [], shift, isFirst: false }), {
      eyebrow: "✨ Your palate shifted",
      headline: "You became The Mosel Purist",
      sub: "Slate, sugar and patience",
      lines: [],
    }, "shift");
  });

  await test("promotions a shift pushed aside become lines under the recap", () => {
    const out = copy.savedCopy({ rating: "loved", promotions: [{ displayName: "Ken Forrester", dimension: "estate" }], shift });
    assertEq(out.headline, "You became The Mosel Purist", "shift keeps the headline");
    assertEq(out.lines, ["🧬 Ken Forrester joined your DNA"], "promotion line");
  });

  await test("a promotion says how many loved bottles made the case", () => {
    assertEq(copy.savedCopy({ rating: "loved", promotions: [{ displayName: "Ken Forrester", dimension: "estate" }] }), {
      eyebrow: "🧬 Your DNA just grew",
      headline: "Ken Forrester just joined your DNA",
      sub: `${cap(WORDS[toPromote("estate")])} loved bottles made the case — we’ll look for it on every list you scan.`,
      lines: [],
    }, "estate");
    const grape = copy.savedCopy({ rating: "loved", promotions: [{ displayName: "Chenin Blanc", dimension: "varietal" }] });
    assertEq(grape.sub.startsWith(`${cap(WORDS[toPromote("varietal")])} loved bottles`), true, "varietal threshold");
  });

  await test("a second promotion (a roll-up) is listed, not lost", () => {
    const out = copy.savedCopy({
      rating: "loved",
      promotions: [{ displayName: "Ken Forrester", dimension: "estate" }, { displayName: "Stellenbosch", dimension: "region" }],
    });
    assertEq(out.headline, "Ken Forrester just joined your DNA", "first promotion headlines");
    assertEq(out.lines, ["🧬 Stellenbosch joined your DNA"], "the roll-up is a line");
  });

  await test("demotions are reported under the recap", () => {
    const out = copy.savedCopy({ rating: "not_for_me", demotions: [{ displayName: "Pinotage" }] });
    assertEq(out.lines, ["🍂 Pinotage left your DNA"], "demotion line");
  });

  await test("the first rated bottle ever gets its own headline", () => {
    assertEq(copy.savedCopy({ rating: "fine", promotions: [], isFirst: true }), {
      eyebrow: "😐 It was fine",
      headline: "Your first entry is in",
      sub: "The Somm just rewrote your list around it — two more selections are open.",
      lines: [],
    }, "first");
  });

  await test("otherwise: the rating, noted, and its line", () => {
    assertEq(copy.savedCopy({ rating: "liked", promotions: [] }), {
      eyebrow: "👍 Liked it",
      headline: "Noted in your journal",
      sub: "A gentle nudge — your DNA leans a little its way.",
      lines: [],
    }, "liked");
  });

  console.log("\n═══ Suite 5: the home crest ═══");

  await test("the initial: the name's first letter, else the email's, uppercased", () => {
    assertEq(copy.crestInitial({ user_metadata: { name: "edward" }, email: "x@y.com" }), "E", "name");
    assertEq(copy.crestInitial({ user_metadata: { name: "  " }, email: "paula@y.com" }), "P", "blank name → email");
    assertEq(copy.crestInitial({ email: "zed@y.com" }), "Z", "no metadata");
    assertEq(copy.crestInitial(null), "", "no user");
  });

  await test("the date line is US English: weekday, month day", () => {
    assertEq(copy.homeDateLine(new Date(2026, 8, 30)), "Wednesday, September 30", "Sep 30 2026");
  });

  await test("the whisper: a promotion or a shift from the last 30 days", () => {
    const now = new Date("2026-10-30T12:00:00Z").getTime();
    const day = 24 * 60 * 60 * 1000;
    assertEq(copy.whisperLine({ event_type: "promoted", display_name: "Chenin Blanc", event_at: new Date(now - 3 * day).toISOString() }, now),
      "🧬 Chenin Blanc just joined your DNA", "promotion");
    assertEq(copy.whisperLine({ event_type: "shifted", display_name: "The Mosel Purist", event_at: new Date(now - day).toISOString() }, now),
      "✨ You became The Mosel Purist", "shift");
    assertEq(copy.whisperLine({ event_type: "promoted", display_name: "Old News", event_at: new Date(now - 31 * day).toISOString() }, now),
      null, "too old");
    assertEq(copy.whisperLine({ event_type: "demoted", display_name: "X", event_at: new Date(now).toISOString() }, now),
      null, "demotions don't whisper");
    assertEq(copy.whisperLine(null, now), null, "nothing");
  });

  await test("the journal link carries its count, bare at zero", () => {
    assertEq(copy.journalLinkLabel(13), "Journal · 13", "count");
    assertEq(copy.journalLinkLabel(0), "Journal", "zero");
  });

  console.log("\n═══ Suite 6: rec rows, the verdict row, Reserved ═══");

  await test("match tags by matchType", () => {
    assertEq(copy.matchTag("region + grape"), "📍 Region + grape", "both");
    assertEq(copy.matchTag("grape"), "🍇 Grape match", "grape");
    assertEq(copy.matchTag("region"), "📍 Region match", "region");
    assertEq(copy.matchTag("discovery"), "🧭 Discovery", "discovery");
    assertEq(copy.matchTag(undefined), "🧭 Discovery", "missing");
  });

  await test("meta lines join what's known with a middle dot", () => {
    assertEq(copy.metaLine("Stellenbosch", null, "Chenin Blanc"), "Stellenbosch · Chenin Blanc", "skips blanks");
    assertEq(copy.metaLine(null, ""), "", "nothing known");
  });

  await test("resolver meta only at or above the real confidence gate", () => {
    const r = { region: "Vouvray", varietal: "Chenin Blanc" };
    assertEq(copy.confidentMeta({ ...r, confidence: CONFIDENCE_GATE }), "Vouvray · Chenin Blanc", "at the gate");
    assertEq(copy.confidentMeta({ ...r, confidence: CONFIDENCE_GATE - 1 }), "", "below the gate");
    assertEq(copy.confidentMeta(null), "", "no resolution");
  });

  await test("the verdict row's meta leads with the region when it's known", () => {
    assertEq(copy.verdictMeta("Hemel-en-Aarde"), "Hemel-en-Aarde · Ordered at the table", "region");
    assertEq(copy.verdictMeta(null), "Ordered at the table", "unknown");
  });

  await test("done lines after a rec action", () => {
    assertEq(copy.REC_DONE.want, "📌 On your want list — we’ll flag it when it turns up on a menu.", "want");
    assertEq(copy.REC_DONE.skip, "👋 Struck from your list.", "skip");
    assertEq(copy.ratedDoneLine("fine"), "😐 It was fine — noted in your journal.", "rated");
    assertEq(copy.ratedDoneLine("junk"), null, "junk");
  });

  await test("the Reserved caption counts what's held back", () => {
    assertEq(copy.reservedCaption(2), "Two more selections open after your first rating.", "two");
    assertEq(copy.reservedCaption(1), "One more selection opens after your first rating.", "one");
    assertEq(copy.reservedCaption(0), null, "none");
  });

  console.log("\n═══ Suite 7: Match & picks (Phase 3) ═══");

  await test("the terms bar names the color, the spend and the steer", () => {
    assertEq(copy.termsLine({ color: "all", min: "", max: "", steer: "" }),
      "All wines · Any price · No steer", "nothing set");
    assertEq(copy.termsLine({ color: "red" }).split(" · ")[0], "Reds", "red");
    assertEq(copy.termsLine({ color: "white" }).split(" · ")[0], "Whites", "white");
    assertEq(copy.termsLine({ color: "sparkling" }).split(" · ")[0], "Sparkling", "sparkling");
    assertEq(copy.termsLine({ color: "orange" }).split(" · ")[0], "All wines", "unknown color");
    assertEq(copy.termsLine({ steer: "  something South African " }).split(" · ")[2],
      "“something South African”", "the steer, trimmed and quoted");
    assertEq(copy.termsLine(), "All wines · Any price · No steer", "no terms at all");
  });

  await test("the spend reads as a range, a ceiling, a floor or any price", () => {
    const spend = (min, max) => copy.termsLine({ min, max }).split(" · ")[1];
    assertEq(spend("40", "90"), "$40–$90", "both");
    assertEq(spend("", "90"), "Up to $90", "a ceiling");
    assertEq(spend("40", ""), "From $40", "a floor");
    assertEq(spend(40, 90), "$40–$90", "numbers");
    assertEq(spend("abc", null), "Any price", "junk");
  });

  await test("the reading line follows real progress", () => {
    assertEq(copy.readingLine("list"), "Reading the list…", "before the parse returns");
    assertEq(copy.readingLine("count", 42), "Reading 42 wines…", "a long list");
    assertEq(copy.readingLine("count", 7), "Reading seven wines…", "a short one, as a word");
    assertEq(copy.readingLine("count", 1), "Reading one wine…", "one");
    assertEq(copy.readingLine("count", 0), "Reading the list…", "nothing parsed");
    assertEq(copy.readingLine("weigh", 42), "Weighing them against your DNA…", "weighing");
    assertEq(copy.readingLine("weigh", 1), "Weighing it against your DNA…", "weighing one");
    assertEq(copy.readingLine("junk"), "Reading the list…", "unknown phase");
  });

  await test("as the picks appear: N bottles, N kinds of yes — written as words", () => {
    assertEq(copy.readingLine("done", 3), "Three bottles, three kinds of yes.", "three");
    assertEq(copy.readingLine("done", 1), "One bottle, one kind of yes.", "one");
    assertEq(copy.readingLine("done", 10), "Ten bottles, ten kinds of yes.", "ten is still a word");
    assertEq(copy.readingLine("done", 12), "12 bottles, 12 kinds of yes.", "past ten");
    assertEq(copy.readingLine("count", 10), "Reading ten wines…", "ten wines");
    assertEq(copy.readingLine("count", 11), "Reading 11 wines…", "eleven");
    assertEq(copy.readingLine("done", 0), null, "no picks — no line");
  });

  await test("a pick the user rated wears the rating and the month", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    assertEq(copy.pickFlag({ interaction_type: "had", rating: "loved", updated_at: "2026-08-15T12:00:00Z" }, now),
      "❤️ Loved it in August", "this year");
    assertEq(copy.pickFlag({ interaction_type: "had", rating: "not_for_me", updated_at: "2025-03-15T12:00:00Z" }, now),
      "👎 Not for me in March 2025", "another year names it");
    assertEq(copy.pickFlag({ interaction_type: "had", rating: "liked", updated_at: "junk" }, now),
      "👍 Liked it", "an unreadable date drops the month");
  });

  await test("a want flags the pick; a pass or an unrated had doesn't", () => {
    assertEq(copy.pickFlag({ interaction_type: "want", rating: null }), "📌 On your want list", "want");
    assertEq(copy.pickFlag({ interaction_type: "skip", rating: null }), null, "a pass");
    assertEq(copy.pickFlag({ interaction_type: "had", rating: null }), null, "legacy had, no rating");
    assertEq(copy.pickFlag(null), null, "no row");
    assertEq(copy.pickFlag("junk"), null, "junk");
  });

  await test("the engine's note says the strongest reason plainly", () => {
    const names = { producer: "Kanonkop", region: "Stellenbosch", grape: "Pinotage", country: "South Africa" };
    assertEq(copy.pickNote({ ...names, reasons: ["favorite", "estate"] }),
      "One of your favorites — and it’s on tonight’s list.", "a favorite first");
    assertEq(copy.pickNote({ ...names, reasons: ["varietal", "region", "estate"] }),
      "Kanonkop — an estate already in your DNA.", "then an estate");
    assertEq(copy.pickNote({ ...names, reasons: ["region", "varietal", "quality"] }),
      "Pinotage from Stellenbosch — both already in your DNA.", "region and grape together");
    assertEq(copy.pickNote({ ...names, reasons: ["varietal"] }),
      "Pinotage — a grape already in your DNA.", "a grape");
    assertEq(copy.pickNote({ ...names, reasons: ["region"] }),
      "Stellenbosch — a region already in your DNA.", "a region");
    assertEq(copy.pickNote({ ...names, reasons: ["country_region"] }),
      "South Africa — a country already in your DNA.", "a country by its region");
    assertEq(copy.pickNote({ ...names, reasons: ["country"] }),
      "South Africa — a country already in your DNA.", "a country");
  });

  await test("the engine's note never claims what it can't name, and is silent off the DNA", () => {
    assertEq(copy.pickNote({ reasons: ["estate", "varietal"], producer: null, grape: "Pinotage" }),
      "Pinotage — a grape already in your DNA.", "no producer name → the next reason");
    assertEq(copy.pickNote({ reasons: ["region", "varietal"], region: "", grape: "Pinotage" }),
      "Pinotage — a grape already in your DNA.", "no region name → the grape alone");
    assertEq(copy.pickNote({ reasons: ["quality", "feedback_boost"], grape: "Pinotage" }), null, "nothing from the DNA");
    assertEq(copy.pickNote({ reasons: "junk" }), null, "junk reasons");
    assertEq(copy.pickNote(), null, "nothing at all");
  });

  await test("the picks sub line counts the list, its pages and the picks — to ten in words", () => {
    assertEq(copy.picksSubline({ wines: 42, pages: 1, picks: 3 }), "42 wines — here’s where to start", "the usual");
    assertEq(copy.picksSubline({ wines: 42, pages: 2, picks: 3 }), "42 wines across two pages — here’s where to start", "pages");
    assertEq(copy.picksSubline({ wines: 60, pages: 1, picks: 7 }), "60 wines — here are your top seven", "a long slate");
    assertEq(copy.picksSubline({ wines: 300, pages: 12, picks: 10 }), "300 wines across 12 pages — here are your top ten", "ten picks, twelve pages");
    assertEq(copy.picksSubline({ wines: 8, pages: 1, picks: 5 }), "Eight wines — here’s where to start", "a short list opens with its word, capitalized");
    assertEq(copy.picksSubline({ wines: 1, pages: 1, picks: 1 }), "One wine — here’s where to start", "one wine");
    assertEq(copy.picksSubline({ wines: 12, pages: 1, picks: 0 }),
      "We read 12 wines and none of them matches your palate yet.", "no matches");
  });

  await test("zero picks says WHY: the terms excluded every match, or there was no match at all", () => {
    // The terms did it — matches exist (wines the palate scored, with a price)
    assertEq(copy.picksHeading({ picks: 0, pickable: 7 }), "Nothing fits tonight’s terms", "heading, terms");
    assertEq(copy.picksSubline({ wines: 40, pages: 1, picks: 0, pickable: 7 }),
      "We read 40 wines and found matches for your palate, but none that fit tonight’s terms. Adjust them to see your matches.", "sub, terms");
    assertEq(copy.picksSubline({ wines: 8, pages: 1, picks: 0, pickable: 1 }),
      "We read eight wines and found matches for your palate, but none that fit tonight’s terms. Adjust them to see your matches.", "eight, as a word");
    // A true no-match with nothing to offer: the line stops there, and the
    // page points to the quiz under it (PALATE_NUDGE)
    assertEq(copy.picksHeading({ picks: 0, pickable: 0 }), "No matches found", "heading, no match");
    assertEq(copy.picksSubline({ wines: 12, pages: 1, picks: 0, pickable: 0 }),
      "We read 12 wines and none of them matches your palate yet.", "sub, no match");
    assertEq(copy.picksSubline({ wines: 3, pages: 1, picks: 0, pickable: 0 }),
      "We read three wines and none of them matches your palate yet.", "three, as a word");
    assertEq(copy.picksHeading({ picks: 0 }), "No matches found", "unknown → never claims matches exist");
    assertEq(copy.picksHeading({ picks: 0, pickable: "many" }), "No matches found", "junk");
    // And with picks, the heading it always had
    assertEq(copy.picksHeading({ picks: 3, pickable: 9 }), "Your picks", "picks");
    assertEq(copy.picksSubline({ wines: 40, pages: 1, picks: 2, pickable: 9 }), "40 wines — here’s where to start", "a short slate is still a slate");
  });

  await test("zero picks, the full table: nothing read, the terms, by-the-glass only, no prices, no room for an adventure, no match", () => {
    // What the page knows: wines read; wines scored (the rest were left out
    // as by-the-glass); wines the palate matched; matches with a price; and,
    // on a list that matched nothing, the wines that could be the lone
    // Adventure under no terms at all (`open`)
    const cause = (x) => copy.emptyCause(x);
    assertEq(cause({ read: 0, pickable: 0, matched: 0, scored: 0, leftOut: 0, open: 0 }), "unread", "nothing was read");
    assertEq(cause({ read: 9, pickable: 3, matched: 3, scored: 9, leftOut: 0, open: 0 }), "terms", "matches with prices exist → the terms excluded them");
    assertEq(cause({ read: 6, pickable: 0, matched: 0, scored: 0, leftOut: 6, open: 0 }), "glass", "every wine read was by the glass");
    assertEq(cause({ read: 9, pickable: 0, matched: 4, scored: 9, leftOut: 0, open: 0 }), "prices", "matches exist, none has a price");
    assertEq(cause({ read: 9, pickable: 0, matched: 0, scored: 9, leftOut: 0, open: 5 }), "no_room", "nothing matched, and the terms shut out every wine an adventure could be");
    assertEq(cause({ read: 9, pickable: 0, matched: 0, scored: 9, leftOut: 0, open: 0 }), "none", "nothing matched and nothing can be offered");
    // Precedence: what would bring picks back comes first
    assertEq(cause({ read: 12, pickable: 2, matched: 5, scored: 9, leftOut: 3, open: 0 }), "terms", "terms before everything");
    assertEq(cause({ read: 12, pickable: 0, matched: 0, scored: 9, leftOut: 3, open: 0 }), "none", "some bottles were scored and none matched: not a glass-only list");
    assertEq(cause({ read: 12, pickable: 0, matched: 2, scored: 9, leftOut: 3, open: 0 }), "prices", "unpriced matches beside glass pours");
    assertEq(cause({ read: 12, pickable: 0, matched: 0, scored: 9, leftOut: 3, open: 2 }), "no_room", "no room, beside glass pours");
    // Unknown never claims a cause — and "no room" needs to KNOW nothing matched
    assertEq(cause(), "none", "unknown");
    assertEq(cause({ open: 4 }), "none", "open wines, but whether anything matched is unknown");
    assertEq(cause({ matched: "many", scored: null, leftOut: NaN, open: "some" }), "none", "junk");
    assertEq(cause({ pickable: 0, matched: 0, scored: 9, leftOut: 0, open: 5 }), "no_room", "the count read is not needed for it");

    // Nothing read
    const unread = { picks: 0, read: 0, pickable: 0, matched: 0, scored: 0, leftOut: 0, open: 0 };
    assertEq(copy.picksHeading(unread), "No wines found", "heading, unread");
    assertEq(copy.picksSubline({ wines: 0, pages: 0, ...unread }),
      "We couldn’t find a wine in what you shared. Try a clearer photo, or paste the list as text.", "sub, unread");

    // By the glass only
    const glass = { picks: 0, read: 6, pickable: 0, matched: 0, scored: 0, leftOut: 6, open: 0 };
    assertEq(copy.picksHeading(glass), "Only by-the-glass pours here", "heading, glass");
    assertEq(copy.picksSubline({ wines: 6, pages: 1, ...glass }),
      "We read six wines, and each is poured by the glass only. Our picks are bottles — add the bottle list and we’ll take it from there.", "sub, glass");
    assertEq(copy.picksSubline({ wines: 1, pages: 1, ...glass, read: 1, leftOut: 1 }),
      "We read one wine, and it is poured by the glass only. Our picks are bottles — add the bottle list and we’ll take it from there.", "sub, one glass");

    // No prices
    const prices = { picks: 0, read: 9, pickable: 0, matched: 4, scored: 9, leftOut: 0, open: 0 };
    assertEq(copy.picksHeading(prices), "No prices to pick by", "heading, prices");
    assertEq(copy.picksSubline({ wines: 9, pages: 1, ...prices }),
      "We read nine wines and found matches for your palate, but none of them shows a price — and a pick needs one. Try a photo or a page that shows the prices.", "sub, prices");

    // No room for an adventure: nothing matched, so the page must not say
    // matches exist — only that the terms leave nothing to offer
    const noRoom = { picks: 0, read: 9, pickable: 0, matched: 0, scored: 9, leftOut: 0, open: 5 };
    assertEq(copy.picksHeading(noRoom), "Nothing fits tonight’s terms", "heading, no room");
    assertEq(copy.picksSubline({ wines: 9, pages: 1, ...noRoom }),
      "We read nine wines. None is a clear match for your palate, and tonight’s terms leave no room for an adventure. Adjust them and we’ll find one worth taking.", "sub, no room");

    // The terms and the true no-match are untouched by the new counts
    assertEq(copy.picksHeading({ picks: 0, pickable: 3, matched: 3, scored: 9, leftOut: 2 }), "Nothing fits tonight’s terms", "heading, terms");
    assertEq(copy.picksHeading({ picks: 0, pickable: 0, matched: 0, scored: 9, leftOut: 2 }), "No matches found", "heading, none");
    // And with picks, none of it shows
    assertEq(copy.picksHeading({ ...prices, picks: 2 }), "Your picks", "picks");
  });

  await test("the page never says it found matches on a list where it found none (every consistent set of counts)", () => {
    let seen = 0;
    for (let read = 0; read <= 4; read++) for (let leftOut = 0; leftOut <= read; leftOut++) {
      const scored = read - leftOut;
      for (let matched = 0; matched <= scored; matched++) for (let pickable = 0; pickable <= matched; pickable++) {
        for (let open = 0; open <= (matched === 0 ? scored : 0); open++) {
          const counts = { picks: 0, read, pickable, matched, scored, leftOut, open };
          const heading = copy.picksHeading(counts);
          const sub = copy.picksSubline({ wines: read, pages: 1, ...counts });
          const where = JSON.stringify(counts);
          seen++;
          if (matched === 0) {
            if (/found matches/.test(sub)) throw new Error(`claims matches with none: ${where} → ${sub}`);
            if (/your matches/.test(sub)) throw new Error(`promises matches with none: ${where} → ${sub}`);
            if (heading === "No prices to pick by") throw new Error(`blames prices with no match: ${where}`);
          } else if (!/found matches/.test(sub)) {
            throw new Error(`matches exist and the line doesn't say so: ${where} → ${sub}`);
          }
          // "No matches found" stays only where nothing can be offered
          const nothingToOffer = read > 0 && matched === 0 && open === 0 && !(scored === 0 && leftOut > 0);
          if ((heading === "No matches found") !== nothingToOffer) throw new Error(`"No matches found" misplaced: ${where} → ${heading}`);
        }
      }
    }
    if (seen < 60) throw new Error(`only ${seen} sets of counts were checked`);
  });

  await test("wines left out for being by the glass are said so — only when some were", () => {
    assertEq(copy.glassNote({ leftOut: 6 }), "Six wines here are poured by the glass only. We pick bottles, so we left them out.", "several");
    assertEq(copy.glassNote({ leftOut: 3 }), "Three wines here are poured by the glass only. We pick bottles, so we left them out.", "Ed's example");
    assertEq(copy.glassNote({ leftOut: 12 }), "12 wines here are poured by the glass only. We pick bottles, so we left them out.", "past ten");
    assertEq(copy.glassNote({ leftOut: 1 }), "One wine here is poured by the glass only. We pick bottles, so we left it out.", "one");
    assertEq(copy.glassNote({ leftOut: 0 }), null, "none left out → silence");
    assertEq(copy.glassNote({ leftOut: 6, cause: "glass" }), null, "the sub line already said it");
    assertEq(copy.glassNote(), null, "unknown");
    assertEq(copy.glassNote({ leftOut: "some" }), null, "junk");
  });

  await test("a lone Splurge says none of the matches fit the terms — only when that is what happened", () => {
    const LINE = "None of your matches fit tonight’s terms. This one is worth the stretch.";
    assertEq(copy.loneSplurgeLine({ picks: [{ price: 68 }], max: 39 }), LINE, "one pick, over the max");
    assertEq(copy.loneSplurgeLine({ picks: [{ price: 68 }], max: "39" }), LINE, "the max as the amount field holds it");
    assertEq(copy.loneSplurgeLine({ picks: [{ price: 30 }], max: 39 }), null, "one pick that fits is just a pick");
    assertEq(copy.loneSplurgeLine({ picks: [{ price: 30 }, { price: 68 }], max: 39 }), null, "a Splurge beside a pick that fits");
    assertEq(copy.loneSplurgeLine({ picks: [{ price: 68 }, { price: 30 }], max: 39 }), null, "…whichever comes first");
    assertEq(copy.loneSplurgeLine({ picks: [{ price: 68 }], max: "" }), null, "no max, no line");
    assertEq(copy.loneSplurgeLine({ picks: [], max: 39 }), null, "no picks");
    assertEq(copy.loneSplurgeLine(), null, "junk → silence");
  });

  await test("a lone Adventure says nothing was a clear match — only on a list that matched nothing", () => {
    const LINE = "Nothing on this list is a clear match for your palate, so here’s the adventure we’d take.";
    const adventure = { pickType: "adventure", price: 48 };
    assertEq(copy.loneAdventureLine({ picks: [adventure], matched: 0 }), LINE, "one Adventure, nothing matched");
    assertEq(copy.loneAdventureLine({ picks: [adventure], matched: 4 }), null, "an Adventure among real matches is just a role");
    assertEq(copy.loneAdventureLine({ picks: [{ pickType: "top", price: 48 }], matched: 0 }), null, "not an Adventure");
    assertEq(copy.loneAdventureLine({ picks: [adventure, adventure], matched: 0 }), null, "two picks are not a lone one");
    assertEq(copy.loneAdventureLine({ picks: [], matched: 0 }), null, "no picks");
    assertEq(copy.loneAdventureLine({ picks: [adventure] }), null, "whether anything matched is unknown → never claims it");
    assertEq(copy.loneAdventureLine(), null, "junk → silence");
    // A lone Adventure is never also a lone Splurge: it always fits the budget
    assertEq(copy.loneSplurgeLine({ picks: [adventure], max: 60 }), null, "inside the max");
  });

  await test("the palate nudge: Ed's line, in the parts the page links — to the quiz's refine", () => {
    assertEq(copy.PALATE_NUDGE, {
      lead: "Know there’s more you love?", link: "Add it to your palate", tail: "and we’ll spot it next time.",
      href: "/?quiz=refine",
    }, "the parts");
    assertEq(`${copy.PALATE_NUDGE.lead} ${copy.PALATE_NUDGE.link} ${copy.PALATE_NUDGE.tail}`,
      "Know there’s more you love? Add it to your palate and we’ll spot it next time.", "read whole, it is Ed's sentence");
    // Where it shows: under a lone Adventure, and under a no-match with nothing to offer
    assertEq(copy.showsPalateNudge({ loneAdventure: true }), true, "under the lone Adventure");
    assertEq(copy.showsPalateNudge({ picks: 0, cause: "none" }), true, "under No matches found");
    for (const cause of ["unread", "terms", "glass", "prices", "no_room"]) {
      assertEq(copy.showsPalateNudge({ picks: 0, cause }), false, `not under ${cause}`);
    }
    assertEq(copy.showsPalateNudge({ picks: 5, cause: "none" }), false, "not beside ordinary picks");
    assertEq(copy.showsPalateNudge(), false, "junk");
  });

  await test("THE NUMBERS RULE: no sentence houseCopy writes prints zero through ten as a digit", () => {
    // Every number in a line, prices aside: "$40" is a price, "12" a count
    const smallDigits = (line) => (String(line).match(/\$?\d[\d,.]*/g) || [])
      .filter((token) => !token.startsWith("$") && Number(token.replace(/[,.]$/, "").replace(/,/g, "")) <= 10);
    const EMPTY = [
      { pickable: 2, matched: 2, scored: 9, leftOut: 0, open: 0 },   // terms
      { pickable: 0, matched: 0, scored: 0, leftOut: 3, open: 0 },   // glass
      { pickable: 0, matched: 2, scored: 9, leftOut: 0, open: 0 },   // prices
      { pickable: 0, matched: 0, scored: 9, leftOut: 0, open: 3 },   // no room
      { pickable: 0, matched: 0, scored: 9, leftOut: 0, open: 0 },   // none
    ];
    const said = [];
    for (let n = 0; n <= 10; n++) {
      said.push(
        copy.numberWord(n), copy.countOf(n, "wine"), copy.bottlesPhrase(n), copy.bottlesAwayLine(n),
        copy.reservedCaption(n), copy.readingLine("count", n), copy.readingLine("done", n),
        copy.glassNote({ leftOut: n }),
        copy.verdictReply({ rating: "loved", nearest: { name: "Chenin Blanc", n } }),
      );
      for (const pages of [1, 2, 10]) for (const picks of [1, 5, 6, 10]) {
        said.push(copy.picksSubline({ wines: n, pages, picks }));
      }
      for (const counts of EMPTY) said.push(copy.picksSubline({ wines: n, pages: 1, picks: 0, read: n, ...counts }));
    }
    for (const dimension of ["estate", "varietal", "region", "country"]) {
      const saved = copy.savedCopy({ rating: "loved", promotions: [{ displayName: "Kanonkop", dimension }] });
      said.push(saved.eyebrow, saved.headline, saved.sub, ...saved.lines);
    }
    said.push(copy.savedCopy({ rating: "loved", isFirst: true }).sub);
    const lines = said.filter((line) => typeof line === "string" && line);
    if (lines.length < 200) throw new Error(`only ${lines.length} lines were checked`);
    assertEq(lines.filter((line) => smallDigits(line).length > 0), [], "zero through ten are written as words");
    // …and anything above ten stays digits
    assertEq(copy.picksSubline({ wines: 11, pages: 11, picks: 5 }), "11 wines across 11 pages — here’s where to start", "eleven");
    assertEq(copy.glassNote({ leftOut: 11 }), "11 wines here are poured by the glass only. We pick bottles, so we left them out.", "eleven glasses");
    // A sentence that opens with its number capitalizes it
    for (const line of [copy.glassNote({ leftOut: 3 }), copy.picksSubline({ wines: 8, pages: 1, picks: 5 }), copy.reservedCaption(2), copy.readingLine("done", 4)]) {
      if (!/^[A-Z]/.test(line)) throw new Error(`opens with a lowercase number: ${line}`);
    }
  });

  await test("moreOf: \"three more regions\" — the count as a word, the noun agreeing with it", () => {
    assertEq(copy.moreOf(3, "region"), "three more regions", "three");
    assertEq(copy.moreOf(1, "region"), "one more region", "one — and the noun is singular");
    assertEq(copy.moreOf(10, "producer"), "ten more producers", "ten");
    assertEq(copy.moreOf(15, "producer"), "15 more producers", "past ten");
    assertEq(copy.moreOf(4, "wine", { capitalize: true }), "Four more wines", "opening a line");
  });

  await test("SOURCE SCAN — the numbers rule outside houseCopy: the app's other sentences write their small numbers as words", () => {
    // Each of these printed a digit of ten or under until Nov 13, 2026. A
    // retyped digit, or a count interpolated raw into the sentence, fails.
    const banned = [
      [/at least 8 characters/i, "the password helper: “at least eight characters”"],
      [/for 7 days/, "the teaser gate: “for seven days”"],
      [/\}\s*more wines to explore/, "the teaser's tail: moreOf(n, \"wine\")"],
      [/Show \{[^}]*\} more/, "the quiz's Show more: moreOf(n, …)"],
      [/\$\{[^}()]*\} countries wide/, "the signature line: numberWord(breadth)"],
      [/\+ \{building\.more\}/, "Building now's tail: numberWord(more)"],
      [/\$\{[^}]*\} wine\$\{/, "a count of wines: countOf(n, \"wine\")"],
    ];
    const broke = [];
    for (const path of sourceFiles(SRC)) {
      const source = withoutComments(readFileSync(path, "utf-8"));
      for (const [pattern, fix] of banned) if (pattern.test(source)) broke.push(`${path.slice(SRC.length + 1)} — ${fix}`);
    }
    assertEq(broke, [], "write zero through ten as words (CLAUDE.md, Voice & Tone)");
    // …and the files that say them reach for the one helper
    for (const [path, helper] of [
      ["components/Quiz.js", "moreOf"], ["components/WineRecList.js", "moreOf"],
      ["components/PalateView.js", "numberWord"], ["lib/palateSignature.js", "numberWord"],
    ]) {
      if (!new RegExp(`\\b${helper}\\(`).test(withoutComments(readFileSync(join(SRC, path), "utf-8")))) throw new Error(`${path} doesn't call ${helper}()`);
    }
  });

  await test("figures are not sentences: tallies, labels and prices keep their digits", () => {
    assertEq(copy.bottleCount(3), "3 bottles", "a DNA row's count");
    assertEq(copy.journalStats({ tried: 9, loved: 5, want: 3 }), "9 tried · 5 loved · 3 to try", "the journal's tally");
    assertEq(copy.journalLinkLabel(9), "Journal · 9", "a link's count");
    assertEq(copy.journalGroupLabel(4), "In your journal · 4", "a group head");
    assertEq(copy.termsLine({ color: "all", min: "5", max: "10", steer: "" }), "All wines · $5–$10 · No steer", "prices");
  });

  // ─── Journal + the wine page (Phase 4) ───

  await test("place names wear display case — particles stay low, capitals pass through", () => {
    assertEq(copy.placeName("vouvray"), "Vouvray", "one word");
    assertEq(copy.placeName("côte de beaune"), "Côte de Beaune", "a particle mid-name");
    assertEq(copy.placeName("hemel-en-aarde"), "Hemel-en-Aarde", "hyphenated");
    assertEq(copy.placeName("châteauneuf-du-pape"), "Châteauneuf-du-Pape", "a hyphenated particle");
    assertEq(copy.placeName("saint-émilion"), "Saint-Émilion", "an accented capital");
    assertEq(copy.placeName("montepulciano d'abruzzo"), "Montepulciano d'Abruzzo", "an elided particle");
    assertEq(copy.placeName("la clape"), "La Clape", "a particle that opens the name");
    assertEq(copy.placeName("mclaren vale"), "McLaren Vale", "Mc");
    assertEq(copy.placeName("  napa   valley "), "Napa Valley", "spacing");
    assertEq(copy.placeName("Loire Valley"), "Loire Valley", "already display case passes through");
    assertEq(copy.placeName(null), "", "junk");
  });

  await test("short dates: Today, Aug 1, and the year only when it isn't this one", () => {
    const now = new Date(2026, 9, 30, 15, 0);
    assertEq(copy.shortDate(new Date(2026, 9, 30, 8, 0).toISOString(), now), "Today", "earlier today");
    assertEq(copy.shortDate(new Date(2026, 7, 1, 20, 0).toISOString(), now), "Aug 1", "this year");
    assertEq(copy.shortDate(new Date(2025, 8, 12).toISOString(), now), "Sep 12, 2025", "last year");
    assertEq(copy.shortDate(new Date(2025, 8, 12).toISOString(), now, { year: false }), "Sep 12", "the year left to a month head");
    assertEq(copy.shortDate("junk", now), "", "junk");
    assertEq(copy.shortDate(null, now), "", "missing");
  });

  await test("month heads, bottle counts and the journal's stats line", () => {
    const now = new Date(2026, 9, 30);
    assertEq(copy.monthLabel(new Date(2026, 8, 3).toISOString(), now), "September", "this year");
    assertEq(copy.monthLabel(new Date(2025, 8, 3).toISOString(), now), "September 2025", "another year");
    assertEq(copy.monthLabel("junk", now), "", "junk");
    assertEq(copy.bottleCount(1), "1 bottle", "one");
    assertEq(copy.bottleCount(4), "4 bottles", "many");
    assertEq(copy.journalStats({ tried: 13, loved: 5, want: 3 }), "13 tried · 5 loved · 3 to try", "the line");
    assertEq(copy.journalStats({}), "0 tried · 0 loved · 0 to try", "junk counts as zero");
  });

  await test("timeline lines: joined, left, became — one copy for the journal and the wine page", () => {
    assertEq(copy.timelineLine({ event_type: "promoted", dimension: "varietal", display_name: "Chenin Blanc" }),
      { emoji: "🧬", text: "Chenin Blanc joined your DNA", strong: false }, "a grape");
    assertEq(copy.timelineLine({ event_type: "promoted", dimension: "estate", display_name: "Domaine Dujac" }).text,
      "Domaine Dujac joined your estates", "an estate");
    assertEq(copy.timelineLine({ event_type: "promoted", dimension: "region", display_name: "Swartland" }).text,
      "Swartland joined your regions", "a region");
    assertEq(copy.timelineLine({ event_type: "promoted", dimension: "country", display_name: "France" }).text,
      "France joined your DNA", "a country");
    assertEq(copy.timelineLine({ event_type: "demoted", dimension: "estate", display_name: "Domaine Dujac" }),
      { emoji: "🍂", text: "Domaine Dujac left your estates", strong: false }, "a demotion");
    const shift = (from, to) => ({
      event_type: "shifted", dimension: "identity", display_name: to.title,
      dimension_value: JSON.stringify({ from, to }),
    });
    assertEq(copy.timelineLine(shift({ title: "The South African Curator" }, { title: "The Stellenbosch Loyalist", epithet: "e" })),
      { emoji: "✨", text: "You became The Stellenbosch Loyalist", strong: true }, "a retitle");
    assertEq(copy.timelineLine(shift({ title: "The Mosel Purist", epithet: "a" }, { title: "The Mosel Purist", epithet: "estate-loyal, Old World" })).text,
      "Your signature shifted — estate-loyal, Old World", "only the epithet moved");
    assertEq(copy.timelineLine({ event_type: "shifted", display_name: "The Mosel Purist", dimension_value: "{junk" }).text,
      "You became The Mosel Purist", "junk before→after falls back to the title");
    assertEq(copy.FOUNDING_LINE.text, "Your palate began — quiz complete", "the founding row");
    assertEq(copy.timelineLine({ event_type: "promoted", dimension: "varietal" }), null, "no name");
    assertEq(copy.timelineLine({ event_type: "exploded", display_name: "X" }), null, "unknown type");
    assertEq(copy.timelineLine(null), null, "junk");
  });

  await test("the Somm's role tag, where it was drunk, and the cancel label", () => {
    assertEq(copy.sommRoleTag("value"), "💰 Great Value", "value");
    assertEq(copy.sommRoleTag("top"), "🏆 Top Pick", "top");
    assertEq(copy.sommRoleTag("mystery"), null, "unknown role");
    assertEq(copy.verdictWhere({ place: "home" }), "At home", "home");
    assertEq(copy.verdictWhere({ place: "out", somm_pick_role: "top" }), "Out", "a place beats provenance");
    assertEq(copy.verdictWhere({ somm_pick_role: "top" }), "From the list at dinner", "a Somm pick");
    assertEq(copy.verdictWhere({}), "", "nothing known");
    assertEq(copy.keepLabel("loved"), "Keep ❤️ Loved it", "keep");
    assertEq(copy.keepLabel("junk"), null, "junk");
  });

  await test("journal row meta: region · grape, the Somm's mark, saved dates, verdicts pending", () => {
    const now = new Date(2026, 9, 30, 12);
    const at = (m, d) => new Date(2026, m, d, 19).toISOString();
    assertEq(copy.journalRowMeta({
      interaction_type: "had", rating: "loved", resolved_region: "stellenbosch",
      resolved_varietal: "Chenin Blanc", updated_at: at(7, 29),
    }, now), { meta: "Stellenbosch · Chenin Blanc", right: "Aug 29", accent: false }, "a tried row");
    assertEq(copy.journalRowMeta({
      interaction_type: "had", rating: "loved", resolved_region: "swartland", somm_pick_role: "value", updated_at: at(8, 12),
    }, now), { meta: "Swartland", right: "🍷 Somm pick · Sep 12", accent: true }, "a Somm pick");
    assertEq(copy.journalRowMeta({
      interaction_type: "had", rating: null, resolved_region: "hemel-en-aarde", updated_at: at(9, 30),
    }, now).meta, "Hemel-en-Aarde · Verdict pending", "a verdict pending");
    assertEq(copy.journalRowMeta({ interaction_type: "had", updated_at: at(9, 30) }, now),
      { meta: "Verdict pending", right: "Today", accent: false }, "pending with nothing resolved");
    assertEq(copy.journalRowMeta({ interaction_type: "want", updated_at: new Date(2025, 4, 2).toISOString() }, now).right,
      "Saved May 2, 2025", "a want row, last year");
    assertEq(copy.journalRowMeta({ interaction_type: "skip", updated_at: at(7, 1) }, now).right, "Aug 1", "a pass");
    assertEq(copy.journalRowMeta(null, now), { meta: "", right: "", accent: false }, "junk");
  });

  await test("a row's mark: the rating, a verdict pending, a want, a pass", () => {
    assertEq(copy.journalMark({ interaction_type: "had", rating: "liked" }), "👍", "rated");
    assertEq(copy.journalMark({ interaction_type: "had", rating: null }), "🥂", "had, verdict pending");
    assertEq(copy.journalMark({ interaction_type: "want" }), "📌", "want");
    assertEq(copy.journalMark({ interaction_type: "skip" }), "👋", "pass");
    assertEq(copy.journalMark(null), null, "no row");
  });

  await test("the wine page's meta line and particulars: only what's known, region with its province", () => {
    const facts = {
      producer: "Domaine Huët", region: "vouvray", province: "Loire Valley", country: "France", grape: "Chenin Blanc",
    };
    assertEq(copy.wineMeta(facts), "Vouvray · France", "region · country");
    assertEq(copy.wineMeta({ country: "France" }), "France", "a country alone");
    assertEq(copy.wineMeta(null), "", "junk");
    assertEq(copy.particulars(facts, "2021"), [
      ["Producer", "Domaine Huët"], ["Region", "Vouvray, Loire Valley"], ["Country", "France"],
      ["Grape", "Chenin Blanc"], ["Vintage", "2021"],
    ], "everything known");
    assertEq(copy.particulars({ region: "stellenbosch", province: "Stellenbosch" }, null), [["Region", "Stellenbosch"]],
      "a province that repeats the region joins nothing");
    assertEq(copy.particulars({}, null), [], "nothing known → nothing printed");
  });

  // ─── Your palate + Search (Phase 5) ───

  await test("a DNA row's count: bottles as the engine counted them, the quiz only when the quiz put it there", () => {
    assertEq(copy.dnaCount(1, "auto"), "1 bottle", "one");
    assertEq(copy.dnaCount(10, "quiz"), "10 bottles", "a quiz row the bottles backed up counts them");
    assertEq(copy.dnaCount(0, "quiz"), "from your quiz", "nothing rated yet — the quiz put it there");
    assertEq(copy.dnaCount(0, "auto"), "",
      "an earned row at zero (its bottles deleted, or a rollup) is never the quiz's");
    assertEq(copy.dnaCount(0), "", "a zero with no source claims nothing");
    assertEq(copy.dnaCount(null, "quiz"), "", "unknown → nothing, never a guess");
    assertEq(copy.dnaCount("3", "quiz"), "", "junk → nothing");
  });

  await test("a DNA search result says its kind, then its count", () => {
    assertEq(["country", "region", "grape", "estate"].map(copy.dnaKindLabel),
      ["Country", "Region", "Grape", "Estate"], "the kinds");
    assertEq(copy.dnaKindLabel("varietal"), "", "an engine dimension isn't a kind");
    assertEq(copy.dnaResultLine({ kind: "grape", bottles: 5, source: "auto" }), "Grape · 5 bottles", "counted");
    assertEq(copy.dnaResultLine({ kind: "estate", bottles: 0, source: "quiz" }), "Estate · from your quiz", "from the quiz");
    assertEq(copy.dnaResultLine({ kind: "grape", bottles: 0, source: "auto" }), "Grape",
      "earned with no bottles left → the kind alone, never the quiz");
    assertEq(copy.dnaResultLine({ kind: "region", bottles: null }), "Region", "count unknown → the kind alone");
    assertEq(copy.dnaResultLine(null), "", "junk");
  });

  await test("building now's distance, written as words", () => {
    assertEq(copy.bottlesAwayLine(1), "one loved bottle away", "singular");
    assertEq(copy.bottlesAwayLine(toPromote("region")), `${WORDS[toPromote("region")]} loved bottles away`,
      "a region from nothing, from the REAL thresholds");
    assertEq(copy.bottlesAwayLine(0), null, "zero is no distance");
    assertEq(copy.bottlesAwayLine(null), null, "junk");
  });

  await test("search's lines: the journal group's head and the nothing-found line", () => {
    assertEq(copy.journalGroupLabel(9), "In your journal · 9", "with its count");
    assertEq(copy.nothingFoundLine("  zinfandel "), "Nothing for “zinfandel” on our list yet.", "the query, trimmed");
    assertEq(copy.nothingFoundLine(null), null, "junk");
  });

  // ─── Phase 6: the wine page's remove, Account ───

  await test("Remove from journal asks first, naming what leaves with the row", () => {
    assertEq(copy.removeConfirmCopy({ rated: true, note: true }),
      "Remove this bottle from your journal? Your verdict and note go with it, and so does its pull on your palate.",
      "a verdict and a note");
    assertEq(copy.removeConfirmCopy({ rated: true, note: false }),
      "Remove this bottle from your journal? Your verdict goes with it, and so does its pull on your palate.",
      "a verdict alone");
    assertEq(copy.removeConfirmCopy({ rated: false, note: true }),
      "Remove this bottle from your journal? Your note goes with it.",
      "a had with no verdict pulls on nothing — only the note leaves");
    assertEq(copy.removeConfirmCopy({ rated: false, note: false }), "Remove this bottle from your journal?",
      "nothing else to lose");
    assertEq(copy.removeConfirmCopy(null), "Remove this bottle from your journal?", "junk → the plain question");
  });

  await test("Account › At the table reads its settings back", () => {
    assertEq(copy.usualSpendLine({ min: 40, max: 90 }), "$40 – $90", "a range");
    assertEq(copy.usualSpendLine({ min: null, max: 90 }), "Up to $90", "a ceiling");
    assertEq(copy.usualSpendLine({ min: 40, max: null }), "From $40", "a floor");
    assertEq(copy.usualSpendLine({ min: null, max: null }), "Not set", "cleared");
    assertEq(copy.usualSpendLine(undefined), "Not set", "never set");
    assertEq(copy.usualSpendLine({ min: "40", max: -3 }), "From $40", "junk ignored");
    assertEq(["all", "red", "white", "sparkling"].map(copy.colorTerm), ["All wines", "Reds", "Whites", "Sparkling"],
      "the terms bar's words");
    assertEq(copy.colorTerm("rosé"), "All wines", "anything else reads as all");
  });

  await test("SOURCE SCAN: the reading lines are said in houseCopy.js and nowhere else under src/", () => {
    // The words readingLine() returns, as only a retyped copy would hold them
    const said = [/Reading the list…/, /against your DNA…/, /kinds of yes/];
    const elsewhere = sourceFiles(SRC)
      .filter((path) => !path.endsWith("houseCopy.js"))
      .filter((path) => said.some((words) => words.test(withoutComments(readFileSync(path, "utf-8")))))
      .map((path) => path.slice(SRC.length + 1));
    assertEq(elsewhere, [], "call readingLine() from @/lib/houseCopy");
    for (const [phase, count, line] of [
      [undefined, 0, "Reading the list…"], ["count", 8, "Reading eight wines…"],
      ["weigh", 8, "Weighing them against your DNA…"], ["done", 3, "Three bottles, three kinds of yes."],
    ]) assertEq(copy.readingLine(phase, count), line, `the demo's ${phase ?? "first"} line`);
  });

  await test("SOURCE SCAN: the tagline lives in houseCopy.js — Welcome, home and the link preview say it from there", () => {
    assertEq(copy.TAGLINE, "Never guess at a wine list again.", "the line");
    const elsewhere = sourceFiles(SRC)
      .filter((path) => !path.endsWith("houseCopy.js"))
      .filter((path) => /Never guess at a wine list again/.test(withoutComments(readFileSync(path, "utf-8"))))
      .map((path) => path.slice(SRC.length + 1));
    assertEq(elsewhere, [], "import TAGLINE from @/lib/houseCopy");
    // …and the files that say it (Welcome and home's sign-off are page.js) use it
    for (const path of ["app/page.js", "app/opengraph-image.js"]) {
      const source = readFileSync(join(SRC, path), "utf-8");
      if (!/\bTAGLINE\b/.test(withoutComments(source))) throw new Error(`${path} doesn't say TAGLINE`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
