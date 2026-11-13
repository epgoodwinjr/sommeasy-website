// Match terms suite — The House List, Phase 3
// Run with: node src/lib/__tests__/matchTerms.test.js
//
// Tests the REAL module via dynamic import (matchTerms.js is dependency-
// free). Match & picks' pure helpers, the rules pinned here:
//   1. Tonight's terms start from Account › At the table
//      (wine_profiles.preferences, decision D8) when set — and from All /
//      empty otherwise. A malformed preference never reaches the page.
//   2. A pick meets the user's journal by NORMALIZED name (accents, case,
//      punctuation and spacing folded) — so a wine rated at last month's
//      table is recognized on tonight's list, and a rated row wins a tie.
//   3. Junk in → a safe default, never a throw.

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
  const terms = await import("../matchTerms.js");

  console.log("\n═══ Suite 1: tonight's terms from the profile's preferences ═══");

  await test("the four colors, in the order the terms line reads", () => {
    assertEq(terms.COLORS, ["all", "red", "white", "sparkling"], "colors");
  });

  await test("a saved color and spend pre-fill the terms", () => {
    assertEq(terms.termsFromPreferences({ color: "white", spend: { min: 40, max: 90 } }),
      { color: "white", min: "40", max: "90" }, "both set");
    assertEq(terms.termsFromPreferences({ spend: { min: null, max: 60 } }),
      { color: "all", min: "", max: "60" }, "a ceiling only");
  });

  await test("nothing saved → All and an open spend", () => {
    assertEq(terms.termsFromPreferences({}), { color: "all", min: "", max: "" }, "empty object");
    assertEq(terms.termsFromPreferences(null), { color: "all", min: "", max: "" }, "null");
    assertEq(terms.termsFromPreferences(undefined), { color: "all", min: "", max: "" }, "undefined");
  });

  await test("a malformed preference falls back instead of reaching the page", () => {
    assertEq(terms.termsFromPreferences({ color: "orange", spend: { min: -5, max: "lots" } }),
      { color: "all", min: "", max: "" }, "junk values");
    assertEq(terms.termsFromPreferences({ spend: "40-90" }), { color: "all", min: "", max: "" }, "spend not an object");
    assertEq(terms.termsFromPreferences({ spend: { min: 39.6, max: "90" } }),
      { color: "all", min: "40", max: "90" }, "a decimal rounds; a digit string passes");
    assertEq(terms.termsFromPreferences("junk"), { color: "all", min: "", max: "" }, "not an object");
  });

  console.log("\n═══ Suite 2: a pick meets the journal by name ═══");

  await test("names fold accents, case, punctuation and spacing", () => {
    assertEq(terms.normalizeWineName("Kanonkop Pinotage, Stellenbosch 2019"), "kanonkop pinotage stellenbosch 2019", "punctuation");
    assertEq(terms.normalizeWineName("  Château  Lynch-Bages, Pauillac "), "chateau lynch bages pauillac", "accents + spacing");
    assertEq(terms.normalizeWineName(null), "", "junk");
  });

  await test("the journal row for a pick — same wine, written differently", () => {
    const rows = [
      { wine_name: "Meerlust Rubicon, Stellenbosch 2018", interaction_type: "want", rating: null },
      { wine_name: "Kanonkop Pinotage, Stellenbosch 2019", interaction_type: "had", rating: "loved" },
    ];
    assertEq(terms.findJournalRow("KANONKOP Pinotage  Stellenbosch 2019", rows)?.rating, "loved", "matched");
    assertEq(terms.findJournalRow("Meerlust Rubicon, Stellenbosch 2018", rows)?.interaction_type, "want", "a want");
    assertEq(terms.findJournalRow("Kanonkop Pinotage, Stellenbosch 2020", rows), null, "another vintage is another wine");
  });

  await test("a rated row wins when two rows fold to the same name", () => {
    const rows = [
      { wine_name: "Raats Chenin Blanc 2022", interaction_type: "want", rating: null },
      { wine_name: "raats chenin blanc, 2022", interaction_type: "had", rating: "liked" },
    ];
    assertEq(terms.findJournalRow("Raats Chenin Blanc 2022", rows)?.rating, "liked", "rated first");
  });

  await test("junk never matches and never throws", () => {
    assertEq(terms.findJournalRow("", [{ wine_name: "" }]), null, "an empty name");
    assertEq(terms.findJournalRow("Kanonkop", null), null, "no rows");
    assertEq(terms.findJournalRow("Kanonkop", [null, 7, { wine_name: 5 }]), null, "junk rows");
  });

  console.log("\n═══ Suite 3: Account › At the table writes the preferences (Phase 6) ═══");

  await test("the amount pair saves as numbers or null — and a reversed pair reads the way it was meant", () => {
    assertEq(terms.spendFromAmounts("40", "90"), { min: 40, max: 90 }, "both");
    assertEq(terms.spendFromAmounts("", "90"), { min: null, max: 90 }, "a ceiling");
    assertEq(terms.spendFromAmounts("40", ""), { min: 40, max: null }, "a floor");
    assertEq(terms.spendFromAmounts("", ""), { min: null, max: null }, "cleared");
    assertEq(terms.spendFromAmounts("90", "40"), { min: 40, max: 90 }, "$90 to $40 means 40–90");
    assertEq(terms.spendFromAmounts("4a", null), { min: null, max: null }, "junk → open");
  });

  await test("a preference change keeps the rest of the preferences, and only real values land", () => {
    const saved = { spend: { min: 40, max: 90 }, color: "white", future: "kept" };
    assertEq(terms.preferencesWith(saved, { color: "red" }),
      { spend: { min: 40, max: 90 }, color: "red", future: "kept" }, "color changes, the rest stays");
    assertEq(terms.preferencesWith(saved, { spend: { min: null, max: 60 } }),
      { spend: { min: null, max: 60 }, color: "white", future: "kept" }, "spend changes, the rest stays");
    assertEq(terms.preferencesWith(saved, { color: "rosé" }), saved, "a color that isn't one changes nothing");
    assertEq(terms.preferencesWith(null, { color: "sparkling" }), { color: "sparkling" }, "nothing saved yet");
    assertEq(terms.preferencesWith("junk", { spend: "junk" }), {}, "junk in → a clean object");
    // Round trip: what Account writes, Match reads
    assertEq(terms.termsFromPreferences(terms.preferencesWith({}, { spend: terms.spendFromAmounts("90", "40") })),
      { color: "all", min: "40", max: "90" }, "Match pre-fills what Account saved");
  });

  // ─── The terms rule (Nov 2026): one copy of what "fits" means, read by
  // the engine's picks AND the Somm's slate ───

  const wine = (extra = {}) => ({ name: "A wine", price: 50, score: 2, detectedColor: null, ...extra });
  const vision = (color, extra = {}) => wine({ detectedColor: color, visionData: { color }, ...extra });

  await test("fitsColor: no color chosen fits everything", () => {
    for (const color of [null, undefined, "", "all"]) {
      assertEq(terms.fitsColor(wine({ detectedColor: "red" }), color), true, `${color}`);
      assertEq(terms.fitsColor(wine({ name: "Veuve Clicquot Brut, Champagne" }), color), true, `${color} / sparkling`);
    }
  });

  await test("fitsColor: red and white take their own color and a wine whose color is unknown — never the other, never a sparkling", () => {
    assertEq(terms.fitsColor(wine({ detectedColor: "red" }), "red"), true, "red is red");
    assertEq(terms.fitsColor(wine({ detectedColor: "white" }), "red"), false, "white is not red");
    assertEq(terms.fitsColor(wine({ detectedColor: "red" }), "white"), false, "red is not white");
    assertEq(terms.fitsColor(wine({ detectedColor: "rosé" }), "white"), false, "rosé is not white");
    assertEq(terms.fitsColor(wine(), "red"), true, "unknown stays under red (a text line with no clue)");
    assertEq(terms.fitsColor(wine(), "white"), true, "and under white");
    assertEq(terms.fitsColor(wine({ detectedColor: "white", name: "Graham Beck Brut" }), "white"), false, "a sparkling white is sparkling");
    assertEq(terms.fitsColor(wine({ section: "Champagne & Sparkling" }), "red"), false, "a wine under a sparkling header is sparkling");
  });

  await test("fitsColor: a wine Vision gave a color to must match it; one it gave none is of unknown color", () => {
    assertEq(terms.fitsColor(vision("white"), "white"), true, "Vision said white");
    assertEq(terms.fitsColor(vision("red"), "white"), false, "Vision said red");
    // Vision named a color the engine did not carry over: it is NOT "unknown"
    assertEq(terms.fitsColor(wine({ detectedColor: null, visionData: { color: "white" } }), "red"), false, "a colored wine with no detected color fits no other color");
    // Vision gave a color, the engine's detectedColor says otherwise (a rosé-only appellation)
    assertEq(terms.fitsColor(wine({ detectedColor: "rosé", visionData: { color: "red" } }), "red"), false, "the detected color decides");
    // Vision read the wine but gave no color: handled as any wine of unknown color
    assertEq(terms.fitsColor(wine({ visionData: { color: null } }), "red"), true, "no Vision color → unknown");
  });

  await test("fitsColor: sparkling takes only what reads as sparkling — by color, section, name or variety", () => {
    assertEq(terms.fitsColor(wine({ detectedColor: "sparkling" }), "sparkling"), true, "detected");
    assertEq(terms.fitsColor(vision("sparkling"), "sparkling"), true, "Vision");
    assertEq(terms.fitsColor(wine({ visionData: { color: "Sparkling" } }), "sparkling"), true, "Vision's color alone, however cased");
    assertEq(terms.fitsColor(wine({ section: "Bubbles" }), "sparkling"), true, "section");
    assertEq(terms.fitsColor(wine({ name: "Pierre Gimonnet Blanc de Blancs 1er Cru, Champagne NV" }), "sparkling"), true, "name");
    assertEq(terms.fitsColor(wine({ visionData: { variety: "Champagne Blend" } }), "sparkling"), true, "variety");
    assertEq(terms.fitsColor(wine(), "sparkling"), false, "unknown is not sparkling");
    assertEq(terms.fitsColor(wine({ detectedColor: "white" }), "sparkling"), false, "a still white");
    assertEq(terms.isSparkling(wine({ name: "Cava Brut Nature" })), true, "isSparkling is the same reading");
    assertEq(terms.isSparkling(null), false, "junk → not sparkling, never a throw");
  });

  // ── isSparkling reads WORDS (Nov 2026) ──
  // Until then the name was tested with indexOf: "asti" inside Castillo,
  // "cava" inside Cavallotto, "mcc" inside McCrea, "brut" inside Brutocao.
  // Those reds were left out under Reds and offered under Sparkling.
  const sparkling = (name, extra = {}) => terms.isSparkling(wine({ name, ...extra }));

  await test("isSparkling: a sparkling word inside a longer word is not sparkling", () => {
    const still = [
      "Castillo Ygay Rioja Gran Reserva 2011",        // asti
      "Marqués de Murrieta Castillo Ygay",
      "Sebastiani Cabernet Sauvignon, Sonoma",
      "Bastianich Vespa Bianco",
      "Castiglion del Bosco Brunello di Montalcino",
      "Château de Pitray, Côtes de Castillon",
      "Domaine La Bastide Blanche, Bandol",
      "Cavallotto Barolo Bricco Boschis 2018",         // cava
      "Valdicava Brunello di Montalcino",
      "Quinta do Cavalinho, Tejo",
      "Cavas de Weinert Malbec, Mendoza",
      "McCrea Syrah, Washington",                      // mcc
      "McCay Cellars Zinfandel, Lodi",
      "McCall Pinot Noir, Long Island",
      "Brutocao Zinfandel, Mendocino",                 // brut
    ];
    for (const name of still) {
      assertEq(sparkling(name), false, name);
      const red = wine({ name, detectedColor: "red" });
      assertEq(terms.fitsColor(red, "red"), true, `${name} — a red under Reds`);
      assertEq(terms.fitsColor(red, "sparkling"), false, `${name} — not offered under Sparkling`);
    }
  });

  await test("isSparkling: every sparkling term still reads, as a word or a run of words", () => {
    const fizz = [
      "Veuve Clicquot Yellow Label, Champagne NV",
      "Cava Brut Nature",
      "Segura Viudas, Cava",
      "Nino Franco Rustico Prosecco",
      "Graham Beck Brut",
      "Graham Beck Brut Rosé, Western Cape NV",
      "Blanc de Blancs",
      "Pierre Gimonnet Blanc de Blancs 1er Cru",
      "Schramsberg Blanc de Noirs",
      "Méthode Traditionnelle",
      "Methode Cap Classique",
      "MCC",
      "Paul René MCC, Robertson",
      "Asti Spumante",
      "Ferrari Trento Spumante",
      "Ca' del Bosco Cuvée Prestige, Franciacorta",
      "Pétillant Naturel",
      "Pet-Nat",
      "Méthode Ancestrale",
      "Crémant de Loire",
      "Cremant de Bourgogne",
    ];
    for (const name of fizz) {
      assertEq(sparkling(name), true, name);
      assertEq(terms.fitsColor(wine({ name, detectedColor: "white" }), "white"), false, `${name} — never a still white`);
    }
  });

  await test("isSparkling: accents, case and separators are folded — one spelling, however the list writes it", () => {
    const spellings = [
      "Méthode Cap Classique", "METHODE CAP CLASSIQUE", "Graham Beck Méthode Cap Classique Brut",
      "Methode Traditionnelle", "MÉTHODE TRADITIONNELLE",
      "Crémant d'Alsace", "CRÉMANT D’ALSACE", "cremant de limoux",
      "Pét-Nat", "Pet Nat", "PET-NAT", "Petillant Naturel", "Pétillant-Naturel",
      "Blanc-de-Blancs", "Blanc  de  Blancs", "BLANC DE NOIRS",
      "Brut,", "(Brut)", "Brut-Nature", "Cava/Brut", "“Brut”",
    ];
    for (const name of spellings) assertEq(sparkling(name), true, name);
    // …and a folded word is still only a word
    assertEq(sparkling("Crémantine Hills Chardonnay"), false, "no word 'cremant'");
    assertEq(sparkling("Blanc de Blanchots, Chablis Grand Cru"), false, "not the phrase");
  });

  await test("isSparkling: Asti is the sparkling wine only as the wine's own name — never after another grape", () => {
    // The wine: Asti, Asti Spumante, Moscato d'Asti
    for (const name of ["Asti", "Martini & Rossi Asti NV", "Fontanafredda Asti DOCG", "Asti Spumante", "Asti Secco",
      "Moscato d'Asti", "Moscato d’Asti", "MOSCATO D'ASTI", "Saracco Moscato d'Asti 2023", "Moscato di Asti",
      "Vietti Cascinetta Moscato d'Asti, Piedmont"]) {
      assertEq(sparkling(name), true, name);
    }
    // The place: a still wine of another grape, from the same hills
    for (const name of ["Barbera d'Asti", "Barbera d’Asti", "BARBERA D'ASTI SUPERIORE", "Vietti Barbera d'Asti Tre Vigne 2021",
      "Braida Montebruna, Barbera d'Asti", "Barbera d'Asti Superiore Nizza", "Dolcetto d'Asti", "Grignolino d'Asti",
      "Freisa d'Asti", "Freisa di Asti", "Braida Bricco dell'Uccellone, Barbera d Asti"]) {
      assertEq(sparkling(name), false, name);
      assertEq(terms.fitsColor(wine({ name, detectedColor: "red" }), "red"), true, `${name} — a red under Reds`);
      assertEq(terms.fitsColor(wine({ name }), "sparkling"), false, `${name} — not under Sparkling`);
    }
    // A sparkling Barbera says so in its own words
    assertEq(sparkling("Barbera d'Asti Spumante Brut"), true, "another term decides");
  });

  await test("isSparkling: Asti written as a place on a wine known to be red or rosé is the place", () => {
    // "Grape, Producer, Region" lists: Asti stands alone, but the wine is a red
    assertEq(sparkling("Barbera, Vietti Tre Vigne, Asti, Piedmont 2021", { detectedColor: "red" }), false, "the engine read a red grape");
    assertEq(sparkling("Vietti Tre Vigne, Asti", { detectedColor: "red", visionData: { color: "red" } }), false, "the photo said red");
    assertEq(sparkling("Vietti Tre Vigne, Asti", { visionData: { color: "Red" } }), false, "the photo's color alone");
    assertEq(sparkling("Rosato, Asti", { detectedColor: "rosé" }), false, "a rosé");
    // …and only Asti yields to the color: sparkling reds and rosés are real
    assertEq(sparkling("Graham Beck Brut Rosé", { detectedColor: "rosé" }), true, "a brut rosé");
    assertEq(sparkling("Sparkling Shiraz Brut", { detectedColor: "red" }), true, "a sparkling red");
    assertEq(sparkling("Segura Viudas Tempranillo, Cava", { detectedColor: "red" }), true, "a Cava");
    // A white or a wine of unknown color keeps the reading it had
    assertEq(sparkling("Martini & Rossi Asti", { detectedColor: "white" }), true, "a white Asti");
    assertEq(sparkling("Moscato, Saracco, Asti", { detectedColor: "white" }), true, "a Moscato from Asti");
    assertEq(sparkling("Gancia, Asti"), true, "unknown color");
  });

  await test("isSparkling: Sekt reads inside its German compounds", () => {
    for (const name of ["Riesling Sekt Brut", "Von Buhl Riesling Sekt", "Winzersekt", "Raumland Jahrgangssekt",
      "Schlumberger Wein- und Sektkellerei", "Sekthaus Raumland Cuvée Katharina"]) {
      assertEq(sparkling(name), true, name);
    }
  });

  await test("isSparkling: section and variety are folded too, and read from the start of a word", () => {
    const under = (section) => terms.isSparkling(wine({ section }));
    for (const s of ["Sparkling", "Sparkling Wines", "Champagne", "Champagnes", "Champagne & Sparkling", "Bubbles",
      "Fizz", "Pétillant", "Petillant", "PÉTILLANTS NATURELS", "Spumante", "Vins Mousseux"]) {
      assertEq(under(s), true, s);
    }
    for (const s of ["Red Wine", "Italy", "Piedmont", "Whites", "", null]) assertEq(under(s), false, String(s));
    // No real heading hides a term inside a word; these made-up ones pin the rule
    assertEq(under("Macchampagne Reds"), false, "letters inside a word are not the heading");
    assertEq(under("Non-Sparkling"), true, "a hyphen starts a word");
    const of = (variety) => terms.isSparkling(wine({ visionData: { variety } }));
    assertEq(of("Champagne Blend"), true, "champagne blend");
    assertEq(of("CHAMPAGNE BLEND"), true, "any case");
    assertEq(of("Sparkling Blend"), true, "sparkling blend");
    assertEq(of("Chardonnay"), false, "a still grape");
    assertEq(of("Unsparkling Blend"), false, "letters inside a word are not the variety");
    assertEq(of(null), false, "no variety");
  });

  await test("isSparkling: junk in → not sparkling, never a throw", () => {
    for (const junk of [null, undefined, "", 42, [], {}, { name: 42 }, { name: null }, { name: {} }, { name: "A", section: 7 },
      { name: "A", visionData: "x" }, { name: "A", visionData: { variety: 3, color: 9 } }, { name: "A", detectedColor: 5 }]) {
      assertEq(terms.isSparkling(junk), false, JSON.stringify(junk));
    }
  });

  await test("budgetFit: inside min–max is in; over max up to twice it is the one stretch; anything else is out", () => {
    assertEq([40, 60, 80].map((p) => terms.budgetFit(p, 40, 80)), ["in", "in", "in"], "both ends are inside");
    assertEq([39, 30].map((p) => terms.budgetFit(p, 40, 80)), ["out", "out"], "under the minimum");
    assertEq([81, 120, 160].map((p) => terms.budgetFit(p, 40, 80)), ["splurge", "splurge", "splurge"], "over max, up to 2×");
    assertEq([161, 500].map((p) => terms.budgetFit(p, 40, 80)), ["out", "out"], "past twice the max");
    assertEq([10, 80, 81, 160, 161].map((p) => terms.budgetFit(p, null, 80)), ["in", "in", "splurge", "splurge", "out"], "a maximum alone");
    assertEq([10, 249, 250, 900].map((p) => terms.budgetFit(p, 250, null)), ["out", "out", "in", "in"], "a minimum alone has no stretch");
    assertEq([1, 50, 5000].map((p) => terms.budgetFit(p, null, null)), ["in", "in", "in"], "no budget");
  });

  await test("budgetFit: a limit that isn't a positive number is no limit", () => {
    for (const none of [null, undefined, 0, "", NaN, -5, "abc"]) {
      assertEq(terms.budgetFit(500, none, none), "in", `${String(none)}`);
    }
    assertEq(terms.budgetFit(90, "40", "80"), "splurge", "digit strings count (the amount fields hold them)");
  });

  await test("isPickable: a wine the palate scored, with a price", () => {
    assertEq(terms.isPickable(wine()), true, "scored and priced");
    assertEq(terms.isPickable(wine({ score: 0 })), false, "no score");
    assertEq(terms.isPickable(wine({ price: null })), false, "no price");
    assertEq(terms.isPickable(wine({ price: undefined })), false, "price missing");
    assertEq(terms.isPickable(null), false, "junk");
  });

  console.log("\n═══ Suite: the lone Adventure (Nov 2026) — one wine from a list that matched nothing ═══");

  // A scored entry as the engine leaves one the palate found nothing in
  const blank = (name, price, extra = {}) => ({ name, price, score: 0, matchReasons: [], detectedColor: null, ...extra });
  const red = (name, price, extra = {}) => blank(name, price, { detectedColor: "red", ...extra });
  const white = (name, price, extra = {}) => blank(name, price, { detectedColor: "white", ...extra });
  const pickOf = (entries, t = {}) => terms.loneAdventure(entries, t)?.name ?? null;

  await test("palateLean: the color the palate has more of — and none when it is even or unknown", () => {
    assertEq(terms.palateLean({ red_count: 3, white_count: 1 }), "red", "more reds");
    assertEq(terms.palateLean({ red_count: 1, white_count: 2 }), "white", "more whites");
    assertEq(terms.palateLean({ red_count: 2, white_count: 2 }), null, "even");
    assertEq(terms.palateLean({ red_count: 0, white_count: 0 }), null, "nothing counted");
    assertEq(terms.palateLean({}), null, "no counts");
    assertEq(terms.palateLean(null), null, "no profile");
    assertEq(terms.palateLean({ red_count: "many", white_count: NaN }), null, "junk");
    assertEq(terms.palateLean({ red_count: 2 }), "red", "one count alone");
  });

  await test("canAdventure: a wine with a price that the palate has nothing against", () => {
    assertEq(terms.canAdventure(blank("A", 40)), true, "priced, unscored");
    assertEq(terms.canAdventure(blank("A", null)), false, "no price — a pick needs one");
    assertEq(terms.canAdventure(blank("A", undefined)), false, "price missing");
    assertEq(terms.canAdventure(blank("A", 40, { score: -5 })), false, "rated against (a negative score) is never the adventure");
    assertEq(terms.canAdventure(null), false, "junk");
  });

  await test("fitsAdventure: tonight's color, and INSIDE the budget — an adventure is never also a stretch", () => {
    assertEq(terms.fitsAdventure(red("A", 60), { color: "red", min: 40, max: 80 }), true, "fits both");
    assertEq(terms.fitsAdventure(red("A", 81), { max: 80 }), false, "one dollar over the max: the Splurge band is not for it");
    assertEq(terms.fitsAdventure(red("A", 39), { min: 40 }), false, "under the minimum");
    assertEq(terms.fitsAdventure(red("A", 80), { max: 80 }), true, "exactly the max");
    assertEq(terms.fitsAdventure(white("A", 60), { color: "red" }), false, "the wrong color");
    assertEq(terms.fitsAdventure(blank("A", 60), { color: "red" }), true, "an unknown color fits red, as it does for every pick");
    assertEq(terms.fitsAdventure(blank("A", 60), {}), true, "no terms");
    assertEq(terms.fitsAdventure(blank("A", 60)), true, "terms missing altogether");
    assertEq(terms.fitsAdventure(blank("A", 60, { score: -2 }), {}), false, "rated against");
  });

  await test("THE TRIGGER: only a list where nothing scored — one match anywhere and there is no lone Adventure", () => {
    const list = [red("A", 40), red("B", 50), red("C", 60)];
    assertEq(pickOf(list), "B", "nothing scored → a pick");
    assertEq(pickOf([...list, red("D", 70, { score: 0.4 })]), null, "a wine that scores on its producer's rating alone is a match: no Adventure");
    assertEq(pickOf([...list, blank("E", null, { score: 3 })]), null, "even an unpriced match");
    assertEq(pickOf([]), null, "an empty list");
    assertEq(pickOf(null), null, "junk");
    assertEq(pickOf([blank("A", null), blank("B", null)]), null, "no wine shows a price");
    assertEq(pickOf([red("A", 40, { score: -5 })]), null, "the only wine is one the diner rated against");
  });

  await test("THE RULE, with no lean and no terms: the middle of the price range (the lower middle of an even count)", () => {
    assertEq(pickOf([blank("A", 30), blank("B", 40), blank("C", 50), blank("D", 60), blank("E", 70)]), "C", "five → the third");
    assertEq(pickOf([blank("A", 30), blank("B", 40), blank("C", 50), blank("D", 60)]), "B", "four → the second, never the dearer half");
    assertEq(pickOf([blank("A", 30), blank("B", 300)]), "A", "two → the cheaper");
    assertEq(pickOf([blank("A", 30)]), "A", "one");
    assertEq(pickOf([blank("E", 70), blank("A", 30), blank("D", 60), blank("B", 40), blank("C", 50)]), "C", "the list's order doesn't matter, the prices do");
    assertEq(pickOf([blank("A", 30), blank("B", 50), blank("C", 50), blank("D", 50), blank("E", 90)]), "C", "equal prices keep the list's order");
    assertEq(pickOf([blank("A", 30), blank("B", 40), blank("C", 2000)]), "B", "one trophy bottle doesn't drag the middle up");
  });

  await test("THE RULE, leaning: the palate's color first, then a wine of unknown color, then anything", () => {
    const list = [white("W1", 30), white("W2", 40), white("W3", 50), red("R1", 90), red("R2", 120), blank("U", 45)];
    assertEq(pickOf(list, { lean: "red" }), "R1", "a red lean takes the middle RED, though the list's middle is a white");
    assertEq(pickOf(list, { lean: "white" }), "W2", "a white lean takes the middle white");
    assertEq(pickOf(list, {}), "U", "no lean: the middle of them all");
    assertEq(pickOf([white("W1", 30), white("W2", 40), blank("U", 45)], { lean: "red" }), "U", "no reds: the wine that might be one");
    assertEq(pickOf([white("W1", 30), white("W2", 40), white("W3", 50)], { lean: "red" }), "W2", "nothing but whites: the middle white");
    assertEq(pickOf([red("R", 60), blank("Fizz", 50, { detectedColor: "sparkling" })], { lean: "red" }), "R", "a sparkling wine is no red");
    assertEq(pickOf([blank("Cava Brut Nature", 50), red("R", 60)], { lean: "red" }), "R", "sparkling by its name");
  });

  await test("THE RULE, under tonight's terms: a chosen color outranks the lean, and the budget is the budget", () => {
    const list = [white("W1", 30), white("W2", 40), white("W3", 50), red("R1", 60), red("R2", 90), red("R3", 120)];
    assertEq(pickOf(list, { color: "white", lean: "red" }), "W2", "white tonight, whatever the lean");
    assertEq(pickOf(list, { color: "red", lean: "white" }), "R2", "red tonight");
    assertEq(pickOf(list, { color: "sparkling" }), null, "no sparkling on the list: no Adventure");
    assertEq(pickOf(list, { lean: "red", max: 80 }), "R1", "the one red inside the max");
    assertEq(pickOf(list, { lean: "red", max: 55 }), "W2", "no red inside the max: the middle of what fits");
    assertEq(pickOf(list, { lean: "red", min: 100 }), "R3", "a minimum");
    assertEq(pickOf(list, { min: 35, max: 55 }), "W2", "both ends");
    assertEq(pickOf(list, { max: 20 }), null, "nothing inside the budget: no Adventure — never a stretch");
    assertEq(pickOf(list, { max: "80", min: "", lean: "red" }), "R1", "limits as the amount fields hold them");
    assertEq(pickOf([blank("U", 50), red("R", 60)], { color: "red" }), "R", "a known red before an unknown, when red is asked for");
    assertEq(pickOf([blank("U", 50), red("R", 60)], { color: "red", lean: "white" }), "R", "…and the lean has no say in it once a color is chosen");
    assertEq(pickOf([red("R", 60, { visionData: { color: "red" } }), white("W", 50, { visionData: { color: "white" } })], { color: "white" }), "W", "a photographed wine's color");
  });

  await test("the pick is a COPY wearing the Adventure role, and the list is left as it was", () => {
    const list = [red("A", 40), red("B", 50), red("C", 60)];
    const before = JSON.stringify(list);
    const pick = terms.loneAdventure(list, { lean: "red" });
    assertEq(pick.pickType, "adventure", "the role");
    assertEq(pick.name, "B", "the wine");
    assertEq(JSON.stringify(list), before, "the list");
    assertEq(list[1].pickType, undefined, "the entry itself wears no role");
    assertEq(terms.loneAdventure(list, { lean: "red" }), pick, "asked again, the same answer");
  });

  await test("rankAdventures: every wine that fits, once, the pick first — the Somm's slate in the engine's order", () => {
    const list = [
      white("W1", 30), white("W2", 40), red("R1", 60), red("R2", 90), red("R3", 120), red("R4", 150),
      blank("U", 45), blank("NoPrice", null), red("Disliked", 70, { score: -5 }), red("Dear", 400),
    ];
    const ranked = terms.rankAdventures(list, { lean: "red", max: 200 }).map((e) => e.name);
    // Reds from the middle out (the cheaper of two equally near first), then the unknown, then the whites
    assertEq(ranked, ["R2", "R1", "R3", "R4", "U", "W1", "W2"], "the order");
    assertEq(ranked[0], pickOf(list, { lean: "red", max: 200 }), "its first is the pick");
    assertEq(terms.rankAdventures([...list, red("Match", 50, { score: 2 })], { lean: "red" }), [], "a list that matched anything has no ranking");
    assertEq(terms.rankAdventures("junk", {}), [], "junk");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
