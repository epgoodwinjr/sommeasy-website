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

async function main() {
  const mark = await import("../palateMark.js");
  const {
    renderPalateMark, renderPalateMarkDocument, renderMarkState, markParams, settledState,
    revealState, revealLength, growState, growLength, MARK_MOTION, MARK_GEOMETRY, MARK_PALETTE,
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

  test("growState at ∞ renders byte-identical to renderPalateMark of the target", () => {
    for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES]) {
      const pa = markParams(a), pb = markParams(b);
      assert(render(growState(pa, pb, Infinity)) === renderPalateMark(b), name);
      assert(render(growState(pa, pb, Infinity, 600)) === renderPalateMark(b), `${name} (600ms)`);
    }
  });

  test("…and already at growLength, for the full growth and the quiz's 600ms", () => {
    for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES]) {
      const pa = markParams(a), pb = markParams(b);
      for (const duration of [MARK_MOTION.growMs, 600]) {
        const end = growLength(pa, pb, duration);
        assert(end >= duration, `${name}: a growth shorter than its duration`);
        assert(render(growState(pa, pb, end, duration), 164) === renderPalateMark(b, { size: 164 }), `${name} @${duration}: not settled at its length`);
        assert(growState(pa, pb, end, duration).ripples.length === 0, `${name}: an overlay outlived the growth`);
      }
    }
  });

  test("growth starts from genome A's shape: nothing jumps at t = 0", () => {
    for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES.slice(0, 3)]) {
      const pa = markParams(a), pb = markParams(b);
      const from = settledState(pa), start = growState(pa, pb, 0);
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
    for (let t = 0; t <= growLength(p, pb); t += 16) seen = Math.max(seen, growState(p, pb, t).ripples.length);
    assert(seen >= 2, "a new berry never rippled");
  });

  console.log("\n═══ 2. Invariant 2 — growth is monotonic on the dials that grew ═══");

  const visibleCount = (list) => list.filter((item) => item.opacity > 0).length;

  test("petal tips, stamen tips and the berry count never pass through a smaller value", () => {
    for (const { name, a, b, grew } of GROWTHS) {
      const pa = markParams(a), pb = markParams(b);
      const end = growLength(pa, pb) + 32;
      let prev = growState(pa, pb, 0);
      for (let t = 4; t <= end; t += 4) {
        const now = growState(pa, pb, t);
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
    for (const { name, a, b } of [...GROWTHS, ...OTHER_MOVES]) {
      const pa = markParams(a), pb = markParams(b);
      for (let t = 0; t <= growLength(pa, pb) + 100; t += 23) check(render(growState(pa, pb, t)), `${name}@${t}`);
    }
  });

  test("growth is the README's: a 6% swell, a pulse from the heart, a berry that lands with two ripples", () => {
    const pa = markParams(BASE), pb = markParams(withDials({ depth: 0.5 + 1 / 6 }));
    const D = MARK_MOTION.growMs;
    assert(D === 2100, "the growth is 2100ms (decision M6)");
    const scales = [];
    for (let t = 0; t <= growLength(pa, pb); t += 5) scales.push(growState(pa, pb, t).scale);
    assert(Math.abs(Math.max(...scales) - 1.06) < 1e-3 && Math.min(...scales) >= 1, "the swell peaks at 1.06 and never dips under 1");
    const pulse = growState(pa, pb, D * 0.42 + 550).ripples.find((r) => r.x === 80 && r.y === 80);
    assert(pulse && pulse.r > 22 && pulse.r < 68 && pulse.opacity > 0 && pulse.opacity < 0.5, "the heart pulse, mid-flight");
    assert(growState(pa, pb, D * 0.42 - 1).ripples.length === 0, "nothing before the pulse");
    const lands = D * 0.5;
    const berry = (t) => growState(pa, pb, t).berries[pb.berries - 1];
    assert(berry(lands - 1).opacity === 0, "the new berry is not there before it lands");
    assert(Math.abs(berry(lands).scale - 2.4) < 1e-9, "it lands from 2.4×");
    assert(berry(lands + 460).scale === 1 && berry(lands + 460).opacity === 1, "and is home 460ms later");
    const offCentre = (t) => growState(pa, pb, t).ripples.filter((r) => r.x !== 80 || r.y !== 80);
    assert(offCentre(lands + 110).length === 0, "no ripple before 120ms");
    assert(offCentre(lands + 300).length === 1, "one ripple from 120ms");
    assert(offCentre(lands + 600).length === 2, "two from 400ms");
    assert(offCentre(lands + 400 + 900).length === 0, "both gone 900ms after the second");
  });

  test("nothing moved: the swell and the heart pulse play, and nothing else does", () => {
    const p = markParams(BASE);
    const rest = settledState(p);
    let pulsed = false, swelled = false;
    for (let t = 0; t <= growLength(p, p); t += 10) {
      const s = growState(p, p, t);
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
    assert(visibleCount(growState(pa, pb, 0).berries) === pa.berries, "A's fruit at the start");
    assert(visibleCount(growState(pa, pb, D * 0.5).berries) === 0, "no fruit mid-way");
    assert(visibleCount(growState(pa, pb, D * 0.8 + 1).berries) === 1, "the first berry lands from 80%");
    const opening = growState(pa, pb, D * 0.5).petals[pb.petals - 1];
    const final = settledState(pb).petals[pb.petals - 1];
    assert(opening.angle === final.angle, "the new petal opens at its final angle");
    assert(opening.tip > MARK_GEOMETRY.petalBaseR && opening.tip < final.tip, "and is part-way open at 50%");
    assert(growState(pa, pb, D * 0.3).petals[pb.petals - 1].opacity === 0, "it starts at 30%");
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
