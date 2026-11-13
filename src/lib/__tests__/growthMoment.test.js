// Growth moment — what a rating means for the bloom (docs/motion §8.4)
// Run with: node src/lib/__tests__/growthMoment.test.js
//
// Tests the REAL module (growthMoment.js is dependency-free: the Supabase
// client is an argument). What's locked:
//
//   1. growthOf: a promotion or an identity shift is a moment — the bloom
//      grows; anything less is not. It CELEBRATES only a promotion or a
//      positive shift: a shift that came with a demotion changes quietly.
//   2. readPalate: the genome the recompose just wrote, with the strand's
//      words — and null for anything it could not read. Unknown ≠ changed.

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
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`ASSERT FAILED: ${msg} — expected ${e}, got ${a}`);
}

const PROMOTION = { dimension: "estate", dimensionValue: "kanonkop", displayName: "Kanonkop" };
const DEMOTION = { dimension: "varietal", dimensionValue: "pinotage", displayName: "Pinotage" };
const SHIFT = { shifted: true, titleChanged: true, title: "The Stellenbosch Loyalist", previousTitle: "The Stellenbosch Explorer" };
// The milestone hook fired but the strand held (a silent genome refresh)
const SILENT = { shifted: false, titleChanged: false, title: "The Stellenbosch Explorer" };

const GENOME = { v: 1, seed: 530334102, color: 0.33, depth: 1, focus: 1, range: 0.75, world: 0.44, spread: 1 };

/** A stand-in client: records the query and answers with `answer`. */
function fakeClient(answer) {
  const asked = {};
  const query = {
    select(columns) { asked.columns = columns; return query; },
    eq(column, value) { asked[column] = value; return query; },
    maybeSingle() {
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(answer);
    },
  };
  return { asked, from(table) { asked.table = table; return query; } };
}

async function main() {
  const { growthOf, readPalate } = await import("../growthMoment.js");

  console.log("\n═══ 1. growthOf — is this rating a moment? ═══");

  await test("a promotion grows the bloom, and celebrates", () => {
    assertEq(growthOf({ promotions: [PROMOTION] }), { grow: true, celebrate: true }, "a promotion");
    assertEq(growthOf({ promotions: [PROMOTION, PROMOTION], demotions: [], shift: null }), { grow: true, celebrate: true }, "two");
    assertEq(growthOf({ promotions: [PROMOTION], shift: SHIFT }), { grow: true, celebrate: true }, "a promotion that shifted the strand");
    assertEq(growthOf({ promotions: [PROMOTION], shift: SILENT }), { grow: true, celebrate: true }, "a promotion the title survived");
  });

  await test("a shift with no promotion grows it too — celebrated only when nothing was lost", () => {
    assertEq(growthOf({ shift: SHIFT }), { grow: true, celebrate: true }, "a positive shift (the fifth bottle retitles)");
    assertEq(growthOf({ promotions: [], demotions: [], shift: SHIFT }), { grow: true, celebrate: true }, "…with empty lists");
    assertEq(growthOf({ demotions: [DEMOTION], shift: SHIFT }), { grow: true, celebrate: false }, "a shift that came with a demotion changes quietly");
  });

  await test("anything less is no moment: no growth, no celebration", () => {
    const quiet = { grow: false, celebrate: false };
    assertEq(growthOf({ promotions: [], demotions: [], shift: null }), quiet, "a rating that only moved points");
    assertEq(growthOf({ shift: SILENT }), quiet, "a milestone the strand held through");
    assertEq(growthOf({ demotions: [DEMOTION] }), quiet, "a demotion the title survived");
    assertEq(growthOf({ demotions: [DEMOTION], shift: SILENT }), quiet, "…with its silent refresh");
    assertEq(growthOf({ shift: { shifted: false, title: "X" } }), quiet, "a recompose that lost its compare-and-swap");
  });

  await test("an engine that failed, or junk, is no moment — never a throw", () => {
    const quiet = { grow: false, celebrate: false };
    for (const junk of [undefined, null, {}, { promotions: null, demotions: undefined, shift: undefined }]) {
      assertEq(growthOf(junk ?? undefined), quiet, `junk ${JSON.stringify(junk)}`);
    }
    assertEq(growthOf({ promotions: "kanonkop", demotions: 3, shift: "yes" }), quiet, "wrong types");
    assertEq(growthOf({ promotions: [null, undefined, 0] }), quiet, "a list of nothing");
    assertEq(growthOf({ promotions: [PROMOTION], demotions: "x" }), { grow: true, celebrate: true }, "a real promotion beside junk");
  });

  await test("celebrate is never true without grow", () => {
    const lists = [[], [PROMOTION]], demos = [[], [DEMOTION]], shifts = [null, SHIFT, SILENT];
    for (const promotions of lists) for (const demotions of demos) for (const shift of shifts) {
      const moment = growthOf({ promotions, demotions, shift });
      assert(!moment.celebrate || moment.grow, `celebrating without growing: ${JSON.stringify({ promotions, demotions, shift })}`);
      assert(typeof moment.grow === "boolean" && typeof moment.celebrate === "boolean", "booleans");
    }
  });

  console.log("\n═══ 2. readPalate — the palate as it stands now ═══");

  await test("reads the user's own row: the genome, the title and the epithet", async () => {
    const client = fakeClient({ data: { archetype: "The Stellenbosch Loyalist", identity: { genome: GENOME, epithet: "estate-loyal, red-leaning" } }, error: null });
    assertEq(await readPalate(client, "user-1"), { genome: GENOME, title: "The Stellenbosch Loyalist", epithet: "estate-loyal, red-leaning" }, "the palate");
    assertEq({ table: client.asked.table, user: client.asked.user_id }, { table: "wine_profiles", user: "user-1" }, "the query");
    assert(/identity/.test(client.asked.columns) && /archetype/.test(client.asked.columns), "it reads the strand");
  });

  await test("a row with no epithet still reads; one with no genome does not", async () => {
    const noEpithet = fakeClient({ data: { archetype: "The Instinctive Palate", identity: { genome: GENOME } }, error: null });
    assertEq(await readPalate(noEpithet, "u"), { genome: GENOME, title: "The Instinctive Palate", epithet: null }, "no epithet");
    for (const identity of [null, {}, { genome: null }, { genome: "x" }, { epithet: "only words" }]) {
      const client = fakeClient({ data: { archetype: "T", identity }, error: null });
      assert((await readPalate(client, "u")) === null, `a genome was invented from ${JSON.stringify(identity)}`);
    }
  });

  await test("unknown ≠ changed: an error, no row, a throw or no client is null — never a guess", async () => {
    assert((await readPalate(fakeClient({ data: null, error: { message: "boom" } }), "u")) === null, "an error");
    assert((await readPalate(fakeClient({ data: { archetype: "T", identity: { genome: GENOME } }, error: { message: "partial" } }), "u")) === null, "data beside an error");
    assert((await readPalate(fakeClient({ data: null, error: null }), "u")) === null, "no row");
    assert((await readPalate(fakeClient(new Error("network")), "u")) === null, "a rejected request");
    assert((await readPalate(null, "u")) === null && (await readPalate(fakeClient({}), null)) === null, "no client, no user");
    const throwing = { from() { throw new Error("no table"); } };
    assert((await readPalate(throwing, "u")) === null, "a client that throws");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
