// Palate Mark in motion — the state layer's test suite (docs/motion §7.1)
// Run with: node src/lib/__tests__/palateMarkMotion.test.js
//
// Tests the REAL module (palateMark.js is dependency-free ESM, loaded via
// dynamic import). palateMark.test.js is untouched and still owns
// determinism and distinctness; this suite owns what the state split added:
//
//   0. THE SETTLED MARK DID NOT CHANGE BY A BYTE. Digests of the renders,
//      taken from the module as it stood before the split (git 4c036c5),
//      are pinned here. renderPalateMark now runs through settledState →
//      renderMarkState; these fail the moment that chain drifts.
//   1. Invariant 1 — an animation ENDS on the static mark: revealState and
//      growState, at ∞ and at their own stated length, render byte-identical
//      to renderPalateMark of the target genome. Overlays have faded.
//   2. Invariant 2 — growth is monotonic on the dials that grew: petal
//      tips, stamen tips and the berry count never pass through a smaller
//      value on the way.
//
//   3. Celebration is opt-in (§13): a growth is QUIET unless asked — the
//      shapes interpolate and nothing else plays. The swell, the heart
//      pulse and the berry ripples are overlays a caller turns on, and even
//      then never for a shape that got smaller. Both invariants hold in
//      either mode, so every growth test here runs in both.
//
// plus the contracts PalateMarkLive leans on: the wait doesn't depend on
// when it will end, the orbit hands over without a jump, every frame is
// finite and brand-palette only.

import { createHash } from "node:crypto";

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

const sha = (s) => createHash("sha256").update(s).digest("hex");

// Real palate shapes (the July 31, 2026 production snapshot palateMark.test.js
// also uses), each pinned to the digest of its pre-split renders: inline at
// 96 and 176, and the standalone document.
const PRODUCTION = {
  italianFaithful: { v: 1, seed: 3523612936, color: 0.5, depth: 0, focus: 0, range: 0, world: 0, spread: 0 },
  stellenboschFti: { v: 1, seed: 530334102, color: 0.3333333333333333, depth: 1, focus: 1, range: 0.75, world: 0.4444444444444444, spread: 1 },
  stellenboschEd: { v: 1, seed: 464996349, color: 0.3333333333333333, depth: 1, focus: 1, range: 1, world: 0.4444444444444444, spread: 1 },
  saCurator: { v: 1, seed: 3024288059, color: 0.5, depth: 0.16666666666666666, focus: 0.16666666666666666, range: 0.25, world: 0.5, spread: 0.25 },
  frenchPurist: { v: 1, seed: 1819852250, color: 0, depth: 0, focus: 0.16666666666666666, range: 0.25, world: 0.5, spread: 0 },
  bordeauxRegular: { v: 1, seed: 149395124, color: 0, depth: 0.16666666666666666, focus: 0, range: 0.125, world: 0, spread: 0.125 },
};
const PRE_SPLIT_DIGESTS = {
  italianFaithful: "4c7873249bd9eb0c7c074c438f9ca45aac85bd04c3c5cf99631a62d7bf8c6587",
  stellenboschFti: "fe6f7c0ae5d47503badeb36324dfbbb702548205ee6322b1a0e3425b5f165b80",
  stellenboschEd: "0c42e03858c30ac1c5b9bbd979dd05f14affd5d21cc2c5f797618011d4af21c8",
  saCurator: "6d2040df7f5cedbe67e909badc6fcfd355220b43b19ed5cc9fb2fd18a68833b0",
  frenchPurist: "c0a905c3569a9253001a4755763170ad12eb754657716c12e20270750d0a8b93",
  bordeauxRegular: "d01bcac4861fe7502fd7dcee9092044bd0afbf2d4847b8d43ccb82216f1c5f03",
};
const PRE_SPLIT_SWEEP = "baba5e0061995d332c2e555a0792f638ffc6dd9fd3cdce96833454bb4aaebca0";

// The digest of a fixed sweep of renders: every dial at three stops under
// three seeds (inline at two sizes, and as a document), 1,500 seeded random
// genomes at assorted sizes, and junk. One changed byte anywhere changes it.
function sweepDigest({ renderPalateMark, renderPalateMarkDocument }) {
  const hash = createHash("sha256");
  const stops = [0, 0.5, 1];
  for (const seed of [0, 20260730, 4294967295]) {
    for (const world of stops) for (const color of stops) for (const focus of stops) {
      for (const depth of stops) for (const spread of stops) for (const range of stops) {
        const genome = { seed, world, color, focus, depth, spread, range };
        hash.update(renderPalateMark(genome));
        hash.update(renderPalateMark(genome, { size: 44 }));
        hash.update(renderPalateMarkDocument(genome));
      }
    }
  }
  let s = 12345;
  const random = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 1500; i++) {
    const genome = {
      seed: Math.floor(random() * 4294967296), world: random(), color: random(),
      focus: random(), depth: random(), spread: random(), range: random(),
    };
    hash.update(renderPalateMark(genome, { size: 60 + (i % 200) }));
  }
  for (const junk of [null, undefined, 7, "x", {}, [], { seed: "a", world: NaN, focus: 9, depth: -3 }]) {
    hash.update(String(renderPalateMark(junk)));
    hash.update(String(renderPalateMarkDocument(junk)));
  }
  return hash.digest("hex");
}

// The sample palate the motion study plays, and ways it can move
const BASE = { seed: 20260730, world: 0.62, color: 0.6, focus: 0.5, depth: 0.5, spread: 0.55, range: 0.6 };
const withDials = (dials) => ({ ...BASE, ...dials });

// A → B pairs. `grew` names what the monotonic invariant must hold for.
const GROWTHS = [
  { name: "a region: longer petals", a: BASE, b: withDials({ spread: 0.8 }), grew: ["petalTips"] },
  { name: "a grape: longer stamens", a: BASE, b: withDials({ range: 0.9 }), grew: ["stamenTips"] },
  { name: "an estate: one more berry", a: BASE, b: withDials({ depth: 0.5 + 1 / 6 }), grew: ["berries"] },
  { name: "two more berries", a: BASE, b: withDials({ depth: 0.5 + 2 / 6 }), grew: ["berries"] },
  { name: "everything at once (same petals)", a: withDials({ spread: 0.2, range: 0.2, depth: 1 / 6 }), b: withDials({ spread: 0.9, range: 0.95, depth: 4 / 6, world: 0.9, color: 0.2 }), grew: ["petalTips", "stamenTips", "berries"] },
  { name: "a country: a new petal", a: BASE, b: withDials({ focus: 0.75 }), grew: ["petalTips", "stamenTips", "petals"] },
  // No fruit to land afterwards: the new petal itself is the last thing to arrive
  { name: "a new petal on a bare bloom", a: withDials({ depth: 0 }), b: withDials({ depth: 0, focus: 0.75 }), grew: ["petalTips", "stamenTips", "petals"] },
  { name: "two new petals and more", a: withDials({ focus: 0, spread: 0.1 }), b: withDials({ focus: 0.5, spread: 0.7, depth: 1 }), grew: ["petalTips", "stamenTips", "petals"] },
  { name: "the smallest palate to the fullest", a: PRODUCTION.italianFaithful, b: { ...PRODUCTION.stellenboschEd, seed: PRODUCTION.italianFaithful.seed }, grew: ["petalTips", "stamenTips", "petals"] },
  { name: "nothing moved", a: BASE, b: { ...BASE }, grew: ["petalTips", "stamenTips", "berries"] },
];
// Shapes that got smaller (a re-rate down, a deleted bottle) or changed hands
const OTHER_MOVES = [
  { name: "a shorter reach", a: withDials({ spread: 0.9, range: 0.9 }), b: withDials({ spread: 0.3, range: 0.2 }) },
  { name: "a berry gone", a: withDials({ depth: 4 / 6 }), b: withDials({ depth: 2 / 6 }) },
  { name: "a petal gone", a: withDials({ focus: 0.75, depth: 1 }), b: withDials({ focus: 0.5, depth: 0.5 }) },
  { name: "a different seed entirely", a: PRODUCTION.saCurator, b: PRODUCTION.stellenboschFti },
];
// Smaller on at least one dial that reads as size — even when another grew
const SHRINKS = [
  ...OTHER_MOVES.slice(0, 3),
  // One dial each, so no size dial can drop out of the rule unnoticed
  { name: "only shorter petals", a: withDials({ spread: 0.9 }), b: withDials({ spread: 0.3 }) },
  { name: "only shorter stamens", a: withDials({ range: 0.9 }), b: withDials({ range: 0.2 }) },
  { name: "only a berry gone", a: withDials({ depth: 4 / 6 }), b: withDials({ depth: 3 / 6 }) },
  { name: "only a petal gone", a: withDials({ focus: 0.75 }), b: BASE },
  { name: "a berry gained, reach lost", a: withDials({ spread: 0.9 }), b: withDials({ spread: 0.4, depth: 0.5 + 1 / 6 }) },
  { name: "a petal gained, a berry lost", a: withDials({ depth: 4 / 6 }), b: withDials({ focus: 0.75, depth: 2 / 6 }) },
  { name: "the fullest palate to the smallest", a: { ...PRODUCTION.stellenboschEd, seed: PRODUCTION.italianFaithful.seed }, b: PRODUCTION.italianFaithful },
];

// A growth plays quietly unless asked to celebrate (README §13)
const QUIET = undefined;
const CELEBRATE = { celebrate: true };
const MODES = [["quiet", QUIET], ["celebrating", CELEBRATE]];

async function main() {
  const mark = await import("../palateMark.js");
  const {
    renderPalateMark, renderPalateMarkDocument, renderMarkState, markParams, settledState,
    revealState, revealLength, growState, growLength, MARK_MOTION, MARK_GEOMETRY, MARK_PALETTE,
    bareState, openState, openLength,
  } = mark;

  const ALL_GENOMES = [...Object.values(PRODUCTION), BASE, ...GROWTHS.flatMap((g) => [g.a, g.b])];
  const render = (state, size) => renderMarkState(state, size ? { size } : undefined);

  console.log("\n═══ 0. The settled mark did not change by a byte ═══");

  test("each production genome renders its pre-split bytes (inline 96, inline 176, document)", () => {
    for (const [name, genome] of Object.entries(PRODUCTION)) {
      const digest = sha(renderPalateMark(genome) + renderPalateMark(genome, { size: 176 }) + renderPalateMarkDocument(genome));
      assert(digest === PRE_SPLIT_DIGESTS[name], `${name} drifted from its pre-split render`);
    }
  });

  test("a sweep of 2,187 dial combinations, 1,500 random genomes and junk renders its pre-split bytes", () => {
    assert(sweepDigest(mark) === PRE_SPLIT_SWEEP, "the sweep drifted from the pre-split module");
  });

  test("renderPalateMark IS renderMarkState(settledState(markParams(genome)))", () => {
    for (const genome of ALL_GENOMES) {
      for (const size of [undefined, 44, 176]) {
        const opts = size ? { size } : undefined;
        assert(
          renderPalateMark(genome, opts) === renderMarkState(settledState(markParams(genome)), opts),
          "the chain and the shortcut differ"
        );
      }
    }
  });

  test("a missing genome is still nothing, all the way down", () => {
    assert(markParams(null) === null, "params");
    assert(settledState(null) === null, "state");
    assert(renderMarkState(null) === "", "render");
    assert(revealState(null, 500) === null && growState(null, null, 500) === null, "motion states");
    assert(revealLength(null) === 0 && growLength(null, null) === 0, "lengths");
    assert(renderPalateMark(undefined) === "" && renderPalateMarkDocument({}.nope) === "", "public renders");
  });

  test("the settled state carries no motion: nothing for a renderer to add", () => {
    const s = settledState(markParams(BASE));
    assert(s.disc === 1 && s.scale === 1 && s.frame === 1 && s.orbit === 1, "whole-mark values at rest");
    assert(s.orbitRot === 0 && s.orbitEven === 0 && s.core === 1, "orbit and core at rest");
    assert(s.ripples.length === 0, "no overlays");
    assert(s.petals.every((p) => p.opacity === 1) && s.stamens.every((p) => p.opacity === 1), "petals and stamens whole");
    assert(s.berries.every((b) => b.opacity === 1 && b.scale === 1), "berries whole");
    assert(!/<g[ >]/.test(render(s)) && !/opacity=/.test(render(s)), "no group, no opacity attribute at rest");
  });

  console.log("\n═══ 1. Invariant 1 — an animation ends on the static mark ═══");

  test("revealState at ∞ renders byte-identical to renderPalateMark", () => {
    for (const genome of ALL_GENOMES) {
      const p = markParams(genome);
      for (const think of [0, MARK_MOTION.thinkMs, 2345.6, 60000]) {
        assert(render(revealState(p, Infinity, think)) === renderPalateMark(genome), `think ${think}`);
      }
      assert(render(revealState(p, Infinity)) === renderPalateMark(genome), "default think");
    }
  });

  test("…and already at think + revealLength — the draw has a real end", () => {
    for (const genome of ALL_GENOMES) {
      const p = markParams(genome);
      for (const think of [0, MARK_MOTION.thinkMs, 1900.4, 2345.6, 4217, 31999.9]) {
        const end = think + revealLength(p);
        assert(render(revealState(p, end, think), 176) === renderPalateMark(genome, { size: 176 }), `think ${think}: not settled at its length`);
        assert(render(revealState(p, end + 1, think)) === renderPalateMark(genome), `think ${think}: unsettled after its length`);
      }
    }
  });

  test("revealLength is the README's sum: 500 + 120·petals + 250 + 110·berries + 420", () => {
    for (const genome of ALL_GENOMES) {
      const p = markParams(genome);
      assert(revealLength(p) === 500 + 120 * p.petals + 250 + 110 * p.berries + 420, "length formula");
    }
    const seven = markParams(BASE);
    assert(seven.petals === 7 && seven.berries === 3 && revealLength(seven) === 2340, "≈2.3s for 7 petals and 3 berries");
  });

  test("growState at ∞ renders byte-identical to renderPalateMark of the target — quiet or celebrating", () => {
    for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES, ...SHRINKS]) {
      const pa = markParams(a), pb = markParams(b);
      for (const [mode, options] of MODES) {
        assert(render(growState(pa, pb, Infinity, MARK_MOTION.growMs, options)) === renderPalateMark(b), `${name} (${mode})`);
        assert(render(growState(pa, pb, Infinity, 600, options)) === renderPalateMark(b), `${name} (${mode}, 600ms)`);
      }
      assert(render(growState(pa, pb, Infinity)) === renderPalateMark(b), `${name} (no duration given)`);
    }
  });

  test("…and already at growLength, for the full growth and the quiz's 600ms, in both modes", () => {
    for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES, ...SHRINKS]) {
      const pa = markParams(a), pb = markParams(b);
      for (const [mode, options] of MODES) {
        for (const duration of [MARK_MOTION.growMs, 600]) {
          const end = growLength(pa, pb, duration, options);
          const label = `${name} (${mode}) @${duration}`;
          assert(end >= duration, `${label}: a growth shorter than its duration`);
          assert(render(growState(pa, pb, end, duration, options), 164) === renderPalateMark(b, { size: 164 }), `${label}: not settled at its length`);
          assert(growState(pa, pb, end, duration, options).ripples.length === 0, `${label}: an overlay outlived the growth`);
          assert(growState(pa, pb, end, duration, options).scale === 1, `${label}: still swollen at its length`);
          // Not only the same bytes at two decimals: the state itself has
          // arrived (a petal 99.99% open would round to the same markup)
          assert(
            JSON.stringify(growState(pa, pb, end, duration, options)) === JSON.stringify(settledState(pb)),
            `${label}: the state is not the settled one at its length`
          );
        }
      }
    }
  });

  test("growth starts from genome A's shape: nothing jumps at t = 0", () => {
    for (const [mode, options] of MODES) for (const { name: move, a, b } of [...GROWTHS, ...OTHER_MOVES.slice(0, 3)]) {
      const name = `${move} (${mode})`;
      const pa = markParams(a), pb = markParams(b);
      const from = settledState(pa), start = growState(pa, pb, 0, MARK_MOTION.growMs, options);
      assert(start.scale === 1 && start.ripples.length === 0, `${name}: an overlay at t=0`);
      for (let i = 0; i < pa.petals; i++) {
        assert(start.petals[i].tip === from.petals[i].tip && start.petals[i].angle === from.petals[i].angle, `${name}: petal ${i} moved at t=0`);
        assert(start.stamens[i].tip === from.stamens[i].tip, `${name}: stamen ${i} moved at t=0`);
        assert(start.petals[i].opacity === 1, `${name}: petal ${i} not whole at t=0`);
      }
      assert(start.ring.burgundy === from.ring.burgundy && start.tipBulge === from.tipBulge, `${name}: ring or tips moved at t=0`);
      const visible = start.berries.filter((berry) => berry.opacity > 0).length;
      assert(visible === pa.berries, `${name}: ${visible} berries showing at t=0, expected A's ${pa.berries}`);
    }
  });

  test("the reveal has no overlays, ever; a growth's are gone by its end", () => {
    const p = markParams(BASE);
    for (let t = 0; t <= 6000; t += 50) assert(revealState(p, t).ripples.length === 0, `reveal ripple at ${t}`);
    const pb = markParams(withDials({ depth: 0.5 + 1 / 6 }));
    let seen = 0;
    const D = MARK_MOTION.growMs;
    for (let t = 0; t <= growLength(p, pb, D, CELEBRATE); t += 16) seen = Math.max(seen, growState(p, pb, t, D, CELEBRATE).ripples.length);
    assert(seen >= 2, "a new berry never rippled");
  });

  console.log("\n═══ 2. Invariant 2 — growth is monotonic on the dials that grew ═══");

  const visibleCount = (list) => list.filter((item) => item.opacity > 0).length;

  test("petal tips, stamen tips and the berry count never pass through a smaller value", () => {
    for (const [mode, options] of MODES) for (const duration of [MARK_MOTION.growMs, 600]) for (const { name: move, a, b, grew } of GROWTHS) {
      const name = `${move} (${mode}, ${duration}ms)`;
      const pa = markParams(a), pb = markParams(b);
      const end = growLength(pa, pb, duration, options) + 32;
      let prev = growState(pa, pb, 0, duration, options);
      for (let t = 4; t <= end; t += 4) {
        const now = growState(pa, pb, t, duration, options);
        // A new petal re-deals the fruit (README §7.4): the berries lift and
        // land again — the one sanctioned dip, so only same-petal growth
        // holds the berry count
        if (grew.includes("petalTips")) {
          for (let i = 0; i < pb.petals; i++) {
            assert(now.petals[i].tip >= prev.petals[i].tip, `${name}: petal ${i} tip shrank at ${t}ms`);
            assert(now.petals[i].opacity >= prev.petals[i].opacity, `${name}: petal ${i} faded at ${t}ms`);
          }
        }
        if (grew.includes("stamenTips")) {
          for (let i = 0; i < pb.petals; i++) {
            assert(now.stamens[i].tip >= prev.stamens[i].tip, `${name}: stamen ${i} tip shrank at ${t}ms`);
          }
        }
        if (grew.includes("berries")) {
          assert(visibleCount(now.berries) >= visibleCount(prev.berries), `${name}: a berry vanished at ${t}ms`);
          assert(now.berries.length === pb.berries, `${name}: berry list isn't B's`);
        }
        if (grew.includes("petals")) {
          assert(visibleCount(now.petals) >= visibleCount(prev.petals), `${name}: a petal vanished at ${t}ms`);
        }
        prev = now;
      }
    }
  });

  test("the reveal only ever opens: tips, reach and the ring never retreat", () => {
    for (const genome of [BASE, PRODUCTION.stellenboschEd, PRODUCTION.italianFaithful]) {
      const p = markParams(genome);
      const think = MARK_MOTION.thinkMs;
      let prev = revealState(p, 0, think);
      for (let t = 4; t <= think + revealLength(p) + 32; t += 4) {
        const now = revealState(p, t, think);
        for (let i = 0; i < p.petals; i++) {
          assert(now.petals[i].tip >= prev.petals[i].tip, `petal ${i} retreated at ${t}`);
          assert(now.stamens[i].tip >= prev.stamens[i].tip, `stamen ${i} retreated at ${t}`);
        }
        assert(now.ring.burgundy >= prev.ring.burgundy && now.ring.cream >= prev.ring.cream, `ring retreated at ${t}`);
        assert(visibleCount(now.berries) >= visibleCount(prev.berries), `berry vanished at ${t}`);
        assert(now.disc >= prev.disc && now.frame >= prev.frame && now.orbit >= prev.orbit, `medallion retreated at ${t}`);
        prev = now;
      }
    }
  });

  test("a smaller shape closes gracefully: what it loses fades, and never more than A had", () => {
    for (const { name, a, b } of OTHER_MOVES.slice(0, 3)) {
      const pa = markParams(a), pb = markParams(b);
      for (let t = 0; t <= growLength(pa, pb) + 32; t += 8) {
        const s = growState(pa, pb, t);
        assert(s.petals.length <= Math.max(pa.petals, pb.petals), `${name}: extra petals at ${t}`);
        assert(visibleCount(s.berries) <= Math.max(pa.berries, pb.berries) + pb.berries, `${name}: extra berries at ${t}`);
      }
    }
    const pa = markParams(OTHER_MOVES[2].a), pb = markParams(OTHER_MOVES[2].b);
    assert(growState(pa, pb, 0).petals.length === pa.petals, "the lost petal is still there at t=0");
    assert(growState(pa, pb, Infinity).petals.length === pb.petals, "and gone by the end");
  });

  console.log("\n═══ 3. What the live wrapper leans on ═══");

  test("the wait does not depend on when it will end (think may be Infinity until it's known)", () => {
    const p = markParams(BASE);
    for (let t = 0; t < 1900; t += 37) {
      const open = render(revealState(p, t, Infinity));
      assert(open === render(revealState(p, t, 1900)), `differs from think=1900 at ${t}`);
      assert(open === render(revealState(p, t, 7000)), `differs from think=7000 at ${t}`);
    }
  });

  test("while it waits: a medallion — disc, frame, turning beads, a pulsing heart — and no bloom", () => {
    const p = markParams(BASE);
    const waiting = revealState(p, 1500, Infinity);
    assert(waiting.disc === 1 && waiting.frame === 1 && waiting.orbit === 1, "medallion fully in by 1.5s");
    assert(waiting.petals.every((petal) => petal.opacity === 0), "a petal showed before the draw");
    assert(waiting.stamens.every((stamen) => stamen.opacity === 0), "a stamen showed before the draw");
    assert(waiting.berries.every((berry) => berry.opacity === 0), "a berry showed before the draw");
    assert(waiting.ring.burgundy === 0 && waiting.ring.cream === 0, "the ring showed before the draw");
    const svg = render(waiting);
    assert(!svg.includes("<path"), "the waiting medallion drew a petal or ring path");
    const cores = [];
    for (let t = 0; t <= 1500; t += 25) cores.push(revealState(p, t, Infinity).core);
    assert(Math.min(...cores) === 1 && Math.abs(Math.max(...cores) - (1 + MARK_MOTION.corePulse)) < 1e-9, "the heart pulses 1 → 1.2");
    assert(revealState(p, 0, Infinity).disc === 0, "nothing on the very first frame");
  });

  test("the orbit hands from turning to coasting without a jump, and lands on exactly 0", () => {
    const G = MARK_GEOMETRY;
    const period = G.orbitDash.split(" ").reduce((sum, n) => sum + Number(n), 0);
    const beads = Math.ceil((2 * Math.PI * G.orbitR) / period);
    const step = 360 / beads; // one bead of turn: identical while the orbit is drawn even
    const p = markParams(BASE);
    for (const think of [0, 1900, 1900.4, 2345.6, 4217, 31999.9]) {
      const before = revealState(p, think - 1e-6, Infinity);
      const after = revealState(p, think, think);
      assert(before.orbitEven === 1 && after.orbitEven === 1, `think ${think}: not drawn even at the handover`);
      const gap = (((before.orbitRot - after.orbitRot) % step) + step) % step;
      assert(Math.min(gap, step - gap) < 1e-4, `think ${think}: the beads jump ${gap}° at the handover`);
      // It keeps turning the same way, at the pace it had, then slows
      const pace = (revealState(p, think + 1, think).orbitRot - after.orbitRot) / 1;
      assert(Math.abs(pace - MARK_MOTION.orbitDegPerMs) < 1e-3, `think ${think}: pace ${pace}°/ms at the handover`);
      let prev = after.orbitRot;
      for (let d = 10; d <= revealLength(p); d += 10) {
        const rot = revealState(p, think + d, think).orbitRot;
        assert(rot >= prev - 1e-9 && rot <= 0, `think ${think}: the beads turned back at +${d}`);
        prev = rot;
      }
      const landed = revealState(p, think + revealLength(markParams(PRODUCTION.italianFaithful)), think);
      assert(landed.orbitRot === 0 && landed.orbitEven === 0, `think ${think}: not at rest within the shortest draw`);
    }
  });

  test("every frame is finite and wears the brand palette only", () => {
    const allowed = new Set(Object.values(MARK_PALETTE).map((c) => c.toLowerCase()).concat("none"));
    const check = (svg, label) => {
      assert(!/NaN|Infinity|undefined|null/.test(svg), `${label}: a non-number reached the markup`);
      for (const [, color] of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
        assert(allowed.has(color.toLowerCase()), `${label}: off-palette ${color}`);
      }
      assert(svg.startsWith("<svg ") && svg.endsWith("</svg>"), `${label}: not one svg`);
      assert((svg.match(/<g[ >]/g) || []).length === (svg.match(/<\/g>/g) || []).length, `${label}: unbalanced groups`);
    };
    for (const genome of [BASE, PRODUCTION.stellenboschEd, PRODUCTION.italianFaithful]) {
      const p = markParams(genome);
      for (let t = 0; t <= 1900 + revealLength(p) + 100; t += 23) check(render(revealState(p, t)), `reveal@${t}`);
      for (let t = 0; t <= 2500; t += 23) check(render(revealState(p, t, Infinity)), `waiting@${t}`);
    }
    for (const [mode, options] of MODES) for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES, ...SHRINKS]) {
      const pa = markParams(a), pb = markParams(b);
      const D = MARK_MOTION.growMs;
      for (let t = 0; t <= growLength(pa, pb, D, options) + 100; t += 23) check(render(growState(pa, pb, t, D, options)), `${name} (${mode})@${t}`);
    }
  });

  test("a celebrated growth is the README's: a 6% swell, a pulse from the heart, a berry that lands with two ripples", () => {
    const pa = markParams(BASE), pb = markParams(withDials({ depth: 0.5 + 1 / 6 }));
    const D = MARK_MOTION.growMs;
    const grow = (t) => growState(pa, pb, t, D, CELEBRATE);
    assert(D === 2100, "the growth is 2100ms (decision M6)");
    const scales = [];
    for (let t = 0; t <= growLength(pa, pb, D, CELEBRATE); t += 5) scales.push(grow(t).scale);
    assert(Math.abs(Math.max(...scales) - 1.06) < 1e-3 && Math.min(...scales) >= 1, "the swell peaks at 1.06 and never dips under 1");
    const pulse = grow(D * 0.42 + 550).ripples.find((r) => r.x === 80 && r.y === 80);
    assert(pulse && pulse.r > 22 && pulse.r < 68 && pulse.opacity > 0 && pulse.opacity < 0.5, "the heart pulse, mid-flight");
    assert(grow(D * 0.42 - 1).ripples.length === 0, "nothing before the pulse");
    const lands = D * 0.5;
    const berry = (t) => grow(t).berries[pb.berries - 1];
    assert(berry(lands - 1).opacity === 0, "the new berry is not there before it lands");
    assert(Math.abs(berry(lands).scale - 2.4) < 1e-9, "it lands from 2.4×");
    assert(berry(lands + 460).scale === 1 && berry(lands + 460).opacity === 1, "and is home 460ms later");
    const offCentre = (t) => grow(t).ripples.filter((r) => r.x !== 80 || r.y !== 80);
    assert(offCentre(lands + 110).length === 0, "no ripple before 120ms");
    assert(offCentre(lands + 300).length === 1, "one ripple from 120ms");
    assert(offCentre(lands + 600).length === 2, "two from 400ms");
    assert(offCentre(lands + 400 + 900).length === 0, "both gone 900ms after the second");
  });

  test("nothing moved, celebrated (a promotion that changes no dial): the swell and the heart pulse play, and nothing else does", () => {
    const p = markParams(BASE);
    const rest = settledState(p);
    const D = MARK_MOTION.growMs;
    let pulsed = false, swelled = false;
    for (let t = 0; t <= growLength(p, p, D, CELEBRATE); t += 10) {
      const s = growState(p, p, t, D, CELEBRATE);
      pulsed ||= s.ripples.length === 1;
      swelled ||= s.scale > 1.05;
      assert(s.ripples.length <= 1, "more than the one pulse");
      assert(JSON.stringify(s.petals) === JSON.stringify(rest.petals), "a petal moved");
      assert(JSON.stringify(s.stamens) === JSON.stringify(rest.stamens), "a stamen moved");
      assert(JSON.stringify(s.berries) === JSON.stringify(rest.berries), "a berry moved");
      assert(JSON.stringify(s.ring) === JSON.stringify(rest.ring), "the ring moved");
    }
    assert(pulsed && swelled, "the swell or the pulse never played");
  });

  test("a new petal: the fruit lifts in the first 28% and lands again from 80%", () => {
    const pa = markParams(BASE), pb = markParams(withDials({ focus: 0.75 }));
    assert(pb.petals === pa.petals + 1, "fixture: one more petal");
    const D = MARK_MOTION.growMs;
    for (const [mode, options] of MODES) {
      const grow = (t) => growState(pa, pb, t, D, options);
      assert(visibleCount(grow(0).berries) === pa.berries, `A's fruit at the start (${mode})`);
      assert(visibleCount(grow(D * 0.5).berries) === 0, `no fruit mid-way (${mode})`);
      assert(visibleCount(grow(D * 0.8 + 1).berries) === 1, `the first berry lands from 80% (${mode})`);
      const opening = grow(D * 0.5).petals[pb.petals - 1];
      const final = settledState(pb).petals[pb.petals - 1];
      assert(opening.angle === final.angle, `the new petal opens at its final angle (${mode})`);
      assert(opening.tip > MARK_GEOMETRY.petalBaseR && opening.tip < final.tip, `and is part-way open at 50% (${mode})`);
      assert(grow(D * 0.3).petals[pb.petals - 1].opacity === 0, `it starts at 30% (${mode})`);
    }
  });

  console.log("\n═══ 4. Celebration is opt-in (§13) ═══");

  const shapesOf = (s) => JSON.stringify([s.petals, s.stamens, s.berries, s.ring, s.tipBulge, s.core, s.disc, s.frame, s.orbit, s.orbitRot, s.orbitEven]);

  test("quiet growth — the default — emits no ripples and a scale of exactly 1 throughout", () => {
    for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES, ...SHRINKS]) {
      const pa = markParams(a), pb = markParams(b);
      for (const duration of [MARK_MOTION.growMs, 600]) {
        for (let t = 0; t <= growLength(pa, pb, duration) + 64; t += 4) {
          const s = growState(pa, pb, t, duration);
          assert(s.scale === 1, `${name} @${duration}: scale ${s.scale} at ${t}ms`);
          assert(s.ripples.length === 0, `${name} @${duration}: a ripple at ${t}ms`);
          assert(!render(s).includes("scale("), `${name} @${duration}: a swell reached the markup at ${t}ms`);
        }
      }
    }
  });

  test("quiet is what you get without asking: no options, {}, and celebrate: false are the same growth", () => {
    const pa = markParams(BASE), pb = markParams(withDials({ depth: 0.5 + 1 / 6, spread: 0.8 }));
    const D = MARK_MOTION.growMs;
    for (const options of [{}, { celebrate: false }, { celebrate: 0 }, null]) {
      assert(growLength(pa, pb, D, options) === growLength(pa, pb, D), `length differs for ${JSON.stringify(options)}`);
      for (let t = 0; t <= growLength(pa, pb, D) + 32; t += 40) {
        assert(render(growState(pa, pb, t, D, options)) === render(growState(pa, pb, t)), `frame differs for ${JSON.stringify(options)} at ${t}`);
      }
    }
    assert(growLength(pa, pb) === growLength(pa, pb, D), "the default duration is the growth's");
  });

  test("a celebratory shrink emits none either: no swell, no pulse, no ripple — it plays exactly as the quiet one does", () => {
    for (const { name, a, b } of SHRINKS) {
      const pa = markParams(a), pb = markParams(b);
      for (const duration of [MARK_MOTION.growMs, 600]) {
        assert(growLength(pa, pb, duration, CELEBRATE) === growLength(pa, pb, duration), `${name} @${duration}: a celebrated shrink runs longer`);
        for (let t = 0; t <= growLength(pa, pb, duration) + 64; t += 4) {
          const s = growState(pa, pb, t, duration, CELEBRATE);
          assert(s.scale === 1, `${name} @${duration}: a shrink swelled (${s.scale}) at ${t}ms`);
          assert(s.ripples.length === 0, `${name} @${duration}: a shrink pulsed or rippled at ${t}ms`);
          assert(render(s) === render(growState(pa, pb, t, duration)), `${name} @${duration}: differs from the quiet shrink at ${t}ms`);
        }
      }
    }
  });

  test("celebration only ADDS overlays: the shapes are the same, frame for frame, in both modes", () => {
    for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES]) {
      const pa = markParams(a), pb = markParams(b);
      for (const duration of [MARK_MOTION.growMs, 600]) {
        let celebrated = false;
        for (let t = 0; t <= growLength(pa, pb, duration, CELEBRATE) + 32; t += 8) {
          const quiet = growState(pa, pb, t, duration), loud = growState(pa, pb, t, duration, CELEBRATE);
          assert(shapesOf(quiet) === shapesOf(loud), `${name} @${duration}: a shape differs between modes at ${t}ms`);
          celebrated ||= loud.scale > 1 || loud.ripples.length > 0;
        }
        const grows = !SHRINKS.some((move) => move.a === a && move.b === b);
        assert(celebrated === grows, `${name} @${duration}: ${grows ? "asked to celebrate, and nothing played" : "a shrink celebrated"}`);
      }
    }
  });

  test("a quiet growth takes its duration and no longer — unless fruit or a petal is still landing", () => {
    const base = markParams(BASE);
    for (const duration of [MARK_MOTION.growMs, 600]) {
      // Reach, tips and the ring simply interpolate: done at the duration
      for (const dials of [{ spread: 0.85 }, { range: 0.9 }, { world: 0.1, color: 0.9 }, {}]) {
        assert(growLength(base, markParams(withDials(dials)), duration) === duration, `${JSON.stringify(dials)} @${duration}`);
      }
      // A new berry lands at half-way and takes newBerryMs to come home
      const berry = markParams(withDials({ depth: 0.5 + 1 / 6 }));
      assert(growLength(base, berry, duration) === Math.max(duration, duration * MARK_MOTION.newBerryAt + MARK_MOTION.newBerryMs), `a berry @${duration}`);
      // …and never waits out a ripple that isn't there
      assert(growLength(base, berry, duration) < growLength(base, berry, duration, CELEBRATE), `a quiet berry is as long as a celebrated one @${duration}`);
      // A smaller shape has closed well before the duration
      for (const { name, a, b } of OTHER_MOVES.slice(0, 2)) {
        assert(growLength(markParams(a), markParams(b), duration) === duration, `${name} @${duration}`);
      }
    }
    // The quiz's header bloom (600ms per change): a reach change is 600ms,
    // not the 1.35s the heart pulse used to hold it for
    assert(growLength(base, markParams(withDials({ spread: 0.85 })), 600) === 600, "the quiz's quiet growth");
    assert(growLength(base, markParams(withDials({ spread: 0.85 })), 600, CELEBRATE) > 1300, "a celebrated one still waits for its pulse");
  });

  test("nothing moved, quietly: every frame is the settled mark, byte for byte", () => {
    const p = markParams(BASE);
    const still = renderPalateMark(BASE);
    for (const duration of [MARK_MOTION.growMs, 600]) {
      for (let t = 0; t <= growLength(p, p, duration) + 32; t += 10) {
        assert(render(growState(p, p, t, duration)) === still, `something moved at ${t}ms (${duration}ms)`);
      }
    }
  });

  console.log("\n═══ The bare medallion, and the bloom opening from it (§8.2) ═══");

  test("the bare medallion is circles only — no ring, petals, stamens or fruit — and the same for every genome", () => {
    const first = render(bareState(markParams(ALL_GENOMES[0])), 44);
    for (const genome of ALL_GENOMES) {
      const bare = render(bareState(markParams(genome)), 44);
      assert(!bare.includes("<path"), "no ring and no petals");
      assert(!bare.includes("<line"), "no stamens and no midribs");
      assert((bare.match(/<circle/g) || []).length === 5, "disc, two frame circles, the beads, the heart");
      assert(bare === first, "a bare medallion says nothing about the palate");
      assert(!/opacity="/.test(bare), "fully there — nothing part-faded");
    }
  });

  test("it is still: the heart at rest, the frame whole", () => {
    const s = bareState(markParams(BASE));
    assert(s.core === 1 && s.disc === 1 && s.scale === 1 && s.frame === 1 && s.orbit === 1, "every feature at rest");
  });

  test("the open starts ON the bare frame and ends ON the static mark — at its own pace and sped up", () => {
    for (const genome of ALL_GENOMES) {
      const p = markParams(genome);
      const bare = render(bareState(p));
      const still = renderPalateMark(genome);
      for (const duration of [openLength(p), 600, 1234.5]) {
        assert(render(openState(p, 0, duration)) === bare, `t=0 is the bare frame (${duration}ms)`);
        assert(render(openState(p, -50, duration)) === bare, "before it starts, still bare");
        assert(render(openState(p, duration, duration)) === still, `ends on the static mark (${duration}ms)`);
        assert(render(openState(p, duration * 3, duration)) === still, "and stays there");
      }
    }
    assert(openLength(markParams(BASE)) === revealLength(markParams(BASE)), "its natural pace is the reveal's draw");
  });

  test("the open only grows: petal and stamen tips and the fruit never fall back on the way", () => {
    for (const genome of ALL_GENOMES) {
      const p = markParams(genome);
      let prev = null;
      for (let t = 0; t <= 600; t += 10) {
        const s = openState(p, t, 600);
        const now = {
          petals: s.petals.map((x) => x.tip), stamens: s.stamens.map((x) => x.tip),
          fruit: s.berries.filter((b) => b.opacity > 0).length,
        };
        if (prev) {
          now.petals.forEach((tip, i) => assert(tip >= prev.petals[i] - 1e-9, `petal ${i} fell back at ${t}`));
          now.stamens.forEach((tip, i) => assert(tip >= prev.stamens[i] - 1e-9, `stamen ${i} fell back at ${t}`));
          assert(now.fruit >= prev.fruit, `fruit fell at ${t}`);
        }
        prev = now;
      }
    }
  });

  test("the state functions are pure: the same inputs give the same bytes, and params are untouched", () => {
    const pa = markParams(BASE), pb = markParams(withDials({ focus: 0.75, depth: 1 }));
    const frozen = JSON.stringify([pa, pb]);
    for (const t of [0, 333, 1900, 2222, 4000]) {
      assert(render(revealState(pa, t)) === render(revealState(pa, t)), `reveal@${t}`);
      assert(render(growState(pa, pb, t)) === render(growState(pa, pb, t)), `grow@${t}`);
    }
    assert(JSON.stringify([pa, pb]) === frozen, "a state function mutated its params");
    assert(JSON.stringify(settledState(pa)) === JSON.stringify(settledState(pa)), "settledState");
  });

  console.log(`\n${"═".repeat(40)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
