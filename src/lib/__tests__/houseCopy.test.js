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

  await test("numberWord writes one through nine as words, digits past that", () => {
    assertEq([1, 2, 3, 9].map((n) => copy.numberWord(n)), ["one", "two", "three", "nine"], "words");
    assertEq(copy.numberWord(12), "12", "digits past nine");
    assertEq(copy.numberWord(2, { capitalize: true }), "Two", "sentence start");
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
    assertEq(copy.readingLine("done", 12), "12 bottles, 12 kinds of yes.", "past nine");
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

  await test("the picks sub line counts the list, its pages and the picks", () => {
    assertEq(copy.picksSubline({ wines: 42, pages: 1, picks: 3 }), "42 wines — here’s where to start", "the usual");
    assertEq(copy.picksSubline({ wines: 42, pages: 2, picks: 3 }), "42 wines across 2 pages — here’s where to start", "pages");
    assertEq(copy.picksSubline({ wines: 60, pages: 1, picks: 7 }), "60 wines — here are your top 7", "a long slate");
    assertEq(copy.picksSubline({ wines: 1, pages: 1, picks: 1 }), "1 wine — here’s where to start", "one wine");
    assertEq(copy.picksSubline({ wines: 12, pages: 1, picks: 0 }),
      "We read 12 wines but couldn’t find matches for your DNA. Try adjusting tonight’s terms or updating your profile.",
      "no matches");
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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
