// Identity voice guard (Act III, "One of One") — replaces archetypeVoice.test.js
// Run with: node src/lib/__tests__/identityVoice.test.js
//
// The identity strand is composed per user from taste content. This suite
// guards the grammar's non-negotiables:
//
//   1. SOURCE SCAN of identityEngine.js (comments included) for the banned
//      deferral phrases carried over from the Session 5 reveal-payoff guard,
//      PLUS the tier words the persona vocabulary must never contain —
//      non-hierarchical means a two-bottle palate is different, never lesser.
//   2. Determinism: same evidence → same strand, byte for byte.
//   3. Behavioral cases through the REAL modules (the alias-loader supplies
//      JSON import attributes): France+Cab composes a confident title with
//      no fabricated places; minimal input gets a real identity; rich input
//      never lands in the sparse register.

import { register } from "node:module";
import { readFileSync } from "node:fs";
register("./helpers/alias-loader.mjs", import.meta.url);

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }

// The deferral ban table (carried forward from archetypeVoice, Session 5):
// the reveal is the payoff of the quiz — no strand may frame it as "come
// back later".
const BANNED_PHRASES = [
  "come back",
  "not there yet",
  "will grow richer",
  "will get sharper",
  "profile will grow",
  "recommendations will get",
  "the rising palate", // the deferral identity itself must never return
];
const BANNED_PATTERNS = [
  { label: `"you're not … yet"`, re: /you'?re not [^.]{0,40}\byet\b/i },
];

// Tier words: the persona vocabulary describes SHAPES, never ranks. Checked
// as whole words against the engine source, comments included.
const TIER_WORDS = [
  "grand", "master", "expert", "elite", "supreme", "premier", "ultimate",
  "advanced", "beginner", "novice", "amateur", "professional", "connoisseur",
  "authority", "superior", "legendary",
];

function bannedIn(text) {
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) return `"${phrase}"`;
  }
  for (const { label, re } of BANNED_PATTERNS) {
    if (re.test(text)) return label;
  }
  return null;
}

async function main() {
  const { composeIdentity, COUNTRY_TITLE_NAMES } = await import("../identityEngine.js");
  const { generateDNAProfile } = await import("../profileEngine.js");
  const source = readFileSync(new URL("../identityEngine.js", import.meta.url), "utf-8");

  console.log("\n═══ source scan — no deferral copy, no tier words ═══");

  test("identityEngine.js contains none of the banned deferral phrases", () => {
    const hit = bannedIn(source);
    assert(hit === null, `banned deferral copy ${hit} found in identityEngine.js`);
  });

  test("identityEngine.js contains no tier words (non-hierarchical personas)", () => {
    const lower = source.toLowerCase();
    for (const word of TIER_WORDS) {
      const re = new RegExp(`\\b${word}\\b`, "i");
      assert(!re.test(lower), `tier word "${word}" found in identityEngine.js`);
    }
  });

  test("the ban table catches the exact copy the canary saw (self-check)", () => {
    const canary =
      "As you try more wines through Sommeasy, your profile will grow richer " +
      "and your recommendations will get sharper.";
    assert(bannedIn(canary) !== null, "ban table no longer catches the original deferral copy");
    assert(bannedIn("You're not an expert yet, but soon.") !== null, "yet-pattern dead");
  });

  console.log("\n═══ determinism — same evidence, same strand ═══");

  const RICH = {
    countries: ["france", "italy", "south_africa"],
    regions: { south_africa: ["stellenbosch", "franschhoek"], france: ["burgundy"] },
    estates: { stellenbosch: ["kanonkop", "meerlust"] },
    varietals: ["cabernet_sauvignon", "chenin_blanc", "pinot_noir"],
    specificWines: ["Meerlust Rubicon"],
  };

  test("composeIdentity is deterministic (deep-equal across calls)", () => {
    const a = composeIdentity(RICH);
    const b = composeIdentity(RICH);
    assert(JSON.stringify(a) === JSON.stringify(b), "same evidence produced different strands");
  });

  test("generateDNAProfile carries the strand deterministically", () => {
    const a = generateDNAProfile(RICH);
    const b = generateDNAProfile(RICH);
    assert(a.archetype === b.archetype, "title drifted between calls");
    assert(a.epithet === b.epithet, "epithet drifted between calls");
    assert(JSON.stringify(a.genome) === JSON.stringify(b.genome), "genome drifted between calls");
  });

  test("different palates get different genome seeds", () => {
    const a = composeIdentity(RICH);
    const b = composeIdentity({ countries: ["germany"], regions: { germany: ["mosel"] }, estates: {}, varietals: ["riesling"], specificWines: [] });
    assert(a.genome.seed !== b.genome.seed, "disjoint palates share a genome seed");
  });

  console.log("\n═══ grammar — composed, confident, never fabricated ═══");

  const sparse = (answers) =>
    composeIdentity({ countries: [], regions: {}, estates: {}, varietals: [], specificWines: [], ...answers });

  test("France + Cabernet composes a confident title with no fabricated places", () => {
    const s = sparse({ countries: ["france"], varietals: ["cabernet_sauvignon"] });
    assert(/^The .+/.test(s.title), `title not composed: "${s.title}"`);
    assert(s.title.includes("French") || s.title.includes("Cabernet"), `title must be built from their own evidence: "${s.title}"`);
    assert(!s.narrative.includes("Bordeaux"), "must not fabricate regions the user never picked");
    assert(!s.title.includes("Bordeaux"), "title must not fabricate places");
    assert(s.narrative.includes("France") && s.narrative.includes("Cabernet Sauvignon"), "narrative names their own evidence");
    assert(bannedIn(s.narrative) === null, `deferral copy: ${bannedIn(s.narrative)}`);
    assert(s.narrative.length > 150, "narrative too thin to be a reveal payoff");
    assert(s.epithet.length > 0, "sparse input still gets an epithet");
  });

  test("a single country and nothing else gets a real identity", () => {
    const s = sparse({ countries: ["italy"] });
    assert(/^The .+/.test(s.title) && s.title !== "The Instinctive Palate", `single-country input fell to the degenerate register: "${s.title}"`);
    assert(s.title.includes("Italian"), `country anchor wears its adjective in the title: "${s.title}"`);
    assert(bannedIn(s.narrative) === null, `deferral copy: ${bannedIn(s.narrative)}`);
  });

  test("a single grape and nothing else anchors on the grape", () => {
    const s = sparse({ varietals: ["riesling"] });
    assert(s.title.includes("Riesling"), `grape-only input must anchor on the grape: "${s.title}"`);
    assert(bannedIn(s.narrative) === null, `deferral copy: ${bannedIn(s.narrative)}`);
  });

  test("empty evidence still produces a present-tense identity", () => {
    const s = sparse({});
    assert(s.title === "The Instinctive Palate", `got "${s.title}"`);
    assert(s.narrative.length > 100, "narrative missing");
    assert(bannedIn(s.narrative) === null, `deferral copy: ${bannedIn(s.narrative)}`);
  });

  test("rich input never lands in the sparse register", () => {
    const s = composeIdentity(RICH);
    assert(s.title !== "The Instinctive Palate", "rich input fell through to the degenerate title");
    assert(s.traits.persona !== "Faithful" && s.traits.persona !== "Instinct",
      `rich input landed on a sparse persona: ${s.traits.persona}`);
    assert(s.epithet.split(" · ").length >= 2, `rich input deserves a fuller epithet: "${s.epithet}"`);
  });

  // ─── The anchor evidence floor (S5, Ed-approved): region evidence flips
  // the anchor region-ward only at REGION_ANCHOR_EVIDENCE_FLOOR (4) points.
  // The shape isolates regionEvidenceLeads from the other region routes:
  // two countries (breadth 2 kills the breadth===1 route), one selected
  // region each (kills the anchorCountryRegions>=2 route), so only the
  // evidence can flip the title region-ward.
  const FLOOR_EVIDENCE = {
    countries: ["south_africa", "france"],
    regions: { south_africa: ["stellenbosch"], france: ["burgundy"] },
    estates: {}, varietals: ["pinot_noir"], specificWines: [],
  };

  test("a 2-point region tie must NOT flip the anchor (below the floor)", () => {
    const s = composeIdentity({
      ...FLOOR_EVIDENCE,
      accumulation: [
        { dimension: "region", dimension_value: "stellenbosch", points: 2 },
        { dimension: "country", dimension_value: "south_africa", points: 2 },
      ],
    });
    assert(s.title.startsWith("The South African"), `first-bottle tie retitled: "${s.title}"`);
    assert(s.traits.anchor.type === "country", `anchor flipped below the floor: ${s.traits.anchor.type}`);
  });

  test("a 4-point region tie MUST flip the anchor (at the floor)", () => {
    const s = composeIdentity({
      ...FLOOR_EVIDENCE,
      accumulation: [
        { dimension: "region", dimension_value: "stellenbosch", points: 4 },
        { dimension: "country", dimension_value: "south_africa", points: 4 },
      ],
    });
    assert(s.title.startsWith("The Stellenbosch"), `at-floor tie must lead: "${s.title}"`);
    assert(s.traits.anchor.type === "region", `anchor did not flip at the floor: ${s.traits.anchor.type}`);
  });

  test("above the floor, a strictly out-pointed region still does not lead", () => {
    const s = composeIdentity({
      ...FLOOR_EVIDENCE,
      accumulation: [
        { dimension: "region", dimension_value: "stellenbosch", points: 4 },
        { dimension: "country", dimension_value: "south_africa", points: 6 },
      ],
    });
    assert(s.traits.anchor.type === "country", `out-pointed region led anyway: ${s.traits.anchor.type}`);
  });

  test("long anchor names step down instead of shipping clunk", () => {
    const s = composeIdentity({
      countries: ["us"], regions: { us: ["willamette_valley"] }, estates: {},
      varietals: ["pinot_noir"], specificWines: [],
    });
    assert(!s.title.includes("Willamette Valley"), `clunk shipped: "${s.title}"`);
    assert(/^The .+/.test(s.title), `title still composed: "${s.title}"`);
  });

  test("titles never leak raw internal ids", () => {
    const cases = [
      RICH,
      { countries: ["south_africa"], regions: { south_africa: ["hemel_en_aarde_walker_bay"] }, estates: {}, varietals: ["chenin_blanc"], specificWines: [] },
      { countries: ["us"], regions: {}, estates: {}, varietals: ["cabernet_sauvignon"], specificWines: [] },
    ];
    for (const c of cases) {
      const s = composeIdentity(c);
      assert(!/[a-z]_[a-z]/.test(s.title), `raw id in title: "${s.title}"`);
      assert(!/[a-z]_[a-z]/.test(s.epithet), `raw id in epithet: "${s.epithet}"`);
      assert(!/[a-z]_[a-z]/.test(s.narrative), `raw id in narrative: "${s.narrative}"`);
    }
  });

  console.log("\n═══ country titles wear their adjectives (S3 Part 0) ═══");

  test("country-anchored titles use the adjective; epithet and narrative keep the noun", () => {
    const s = sparse({ countries: ["south_africa"] });
    assert(s.title.includes("South African"), `expected the adjective in the title: "${s.title}"`);
    assert(s.epithet.includes("South Africa-anchored"), `epithet must keep the place noun: "${s.epithet}"`);
    assert(!s.epithet.includes("South African-"), `epithet must not take the adjective: "${s.epithet}"`);
    assert(s.narrative.includes("South Africa"), `narrative prose keeps the noun: "${s.narrative}"`);
  });

  test("wine-register picks hold: Argentine, American", () => {
    const arg = sparse({ countries: ["argentina"] });
    assert(arg.title.includes("Argentine") && !arg.title.includes("Argentinian"),
      `Argentina composes "Argentine" (trade register): "${arg.title}"`);
    const us = sparse({ countries: ["us"] });
    assert(us.title.includes("American"), `US composes "American": "${us.title}"`);
  });

  test("New Zealand keeps its noun deliberately (trade register)", () => {
    assert(COUNTRY_TITLE_NAMES.new_zealand === "New Zealand",
      `the deliberate noun fallback drifted: "${COUNTRY_TITLE_NAMES.new_zealand}"`);
    const s = sparse({ countries: ["new_zealand"] });
    assert(s.title.includes("New Zealand"), `NZ title: "${s.title}"`);
  });

  test("every wineUnified country has a title name, and none of them clunk", () => {
    const wineUnified = JSON.parse(
      readFileSync(new URL("../wineUnified.json", import.meta.url), "utf-8")
    );
    for (const c of wineUnified.countries) {
      const titleName = COUNTRY_TITLE_NAMES[c.id];
      assert(typeof titleName === "string" && titleName.length > 0,
        `country "${c.id}" has no title name — add it to COUNTRY_TITLE_NAMES`);
      // The clunk rule's own bar: nothing in the map may step itself down
      assert(titleName.length <= 14 && titleName.trim().split(/\s+/).length <= 2,
        `title name "${titleName}" (${c.id}) would clunk in a title`);
    }
  });

  console.log("\n═══ the epithet extends the signature ═══");

  test("epithet is at most three phrases, joined with the middle dot", () => {
    const s = composeIdentity(RICH);
    const parts = s.epithet.split(" · ");
    assert(parts.length >= 1 && parts.length <= 3, `epithet has ${parts.length} phrases: "${s.epithet}"`);
    for (const p of parts) assert(p.trim().length > 0, "empty epithet phrase");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
