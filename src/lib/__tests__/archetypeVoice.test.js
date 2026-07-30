// Archetype voice guard (Session 5 — "Make the Reveal Land")
// Run with: node src/lib/__tests__/archetypeVoice.test.js
//
// The reveal is the emotional PAYOFF of the quiz — no archetype narrative
// may frame it as a deferral. The July 30 acceptance canary hit the old
// fallback ("The Rising Palate"), which told a brand-new user "your profile
// will grow richer and your recommendations will get sharper" at the exact
// moment the product should have named who they already are. Two layers:
//
//   1. a SOURCE SCAN of profileEngine.js for the banned deferral phrases —
//      hard-fails if any returns, in ANY of the 15 narratives, and
//   2. behavioral sparse-input cases through the REAL module (the
//      alias-loader supplies JSON import attributes, so no mirror needed)
//      asserting the fallback returns a confident, present-tense identity.

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

// The ban table (brief, Session 5 item 2): deferral copy that turns the
// reveal into "come back later". Checked as substrings against lowercased
// text, plus one regex for the "you're not X yet" family. "Grows over time"
// is allowed ONLY as a gentle closing footer elsewhere in the product —
// never inside a reveal narrative, so here it's banned outright.
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
  const { generateDNAProfile } = await import("../profileEngine.js");
  const source = readFileSync(new URL("../profileEngine.js", import.meta.url), "utf-8");

  console.log("\n═══ source scan — every narrative, no deferral copy ═══");

  test("profileEngine.js contains none of the banned deferral phrases", () => {
    const hit = bannedIn(source);
    assert(hit === null, `banned deferral copy ${hit} found in profileEngine.js`);
  });

  test("the ban table catches the exact copy the canary saw (self-check)", () => {
    // Guards the guard: if the ban table rots, this fails first.
    const canary =
      "As you try more wines through Sommeasy, your profile will grow richer " +
      "and your recommendations will get sharper.";
    assert(bannedIn(canary) !== null, "ban table no longer catches the original deferral copy");
    assert(bannedIn("You're not an expert yet, but soon.") !== null, "yet-pattern dead");
  });

  console.log("\n═══ sparse input — the fallback is a confident identity ═══");

  const sparse = (answers) =>
    generateDNAProfile({
      countries: [], regions: {}, estates: {}, varietals: [], specificWines: [],
      ...answers,
    });

  test("France + Cabernet Sauvignon (the canary retake) gets a present-tense identity", () => {
    const p = sparse({ countries: ["france"], varietals: ["cabernet_sauvignon"] });
    assert(p.archetype === "The Instinctive Palate", `got "${p.archetype}"`);
    assert(p.archetypeEmoji && p.archetypeEmoji.length > 0, "emoji missing");
    assert(p.narrative.includes("France"), "narrative must name their country");
    assert(p.narrative.includes("Cabernet Sauvignon"), "narrative must name their grape");
    assert(bannedIn(p.narrative) === null, `deferral copy in fallback: ${bannedIn(p.narrative)}`);
    assert(p.narrative.length > 150, "narrative too thin to be a reveal payoff");
  });

  test("France + Cabernet reads as classic (Old World lean, real data — no fabricated depth)", () => {
    const p = sparse({ countries: ["france"], varietals: ["cabernet_sauvignon"] });
    assert(/classic/i.test(p.narrative), "the Old World lean should be named as classic");
    // No invented specifics: the narrative may only name what was selected
    assert(!p.narrative.includes("Bordeaux"), "must not fabricate regions the user never picked");
  });

  test("a single country and nothing else is still celebrated, not deferred", () => {
    const p = sparse({ countries: ["france"] });
    assert(p.archetype === "The Instinctive Palate", `got "${p.archetype}"`);
    assert(p.narrative.includes("France"), "narrative must name the one thing they told us");
    assert(bannedIn(p.narrative) === null, `deferral copy: ${bannedIn(p.narrative)}`);
  });

  test("New World sparse input gets the modern lean, same confidence", () => {
    const p = sparse({ countries: ["australia"], varietals: ["syrah"] });
    assert(p.archetype === "The Instinctive Palate", `got "${p.archetype}"`);
    assert(/modern/i.test(p.narrative), "the New World lean should be named as modern");
    assert(bannedIn(p.narrative) === null, `deferral copy: ${bannedIn(p.narrative)}`);
  });

  test("degenerate empty answers still produce a confident, non-empty narrative", () => {
    const p = sparse({});
    assert(p.archetype === "The Instinctive Palate", `got "${p.archetype}"`);
    assert(p.narrative.length > 100, "narrative missing");
    assert(bannedIn(p.narrative) === null, `deferral copy: ${bannedIn(p.narrative)}`);
  });

  console.log("\n═══ richer inputs still route past the fallback ═══");

  test("a rich profile does not land on the fallback (gates unchanged)", () => {
    const p = generateDNAProfile({
      countries: ["france", "italy", "spain", "germany", "austria", "portugal"],
      regions: { france: ["burgundy", "rhone_valley"], italy: ["tuscany", "piedmont"] },
      estates: { burgundy: [] },
      varietals: ["pinot_noir", "chardonnay", "sangiovese", "nebbiolo", "riesling"],
      specificWines: [],
    });
    assert(p.archetype !== "The Instinctive Palate", "rich input fell through to the fallback");
    assert(bannedIn(p.narrative) === null, `deferral copy in "${p.archetype}"`);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
