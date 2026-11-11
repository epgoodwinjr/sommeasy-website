// Motion — the Ink family's tokens and pure helpers (docs/motion §5–§6)
// Run with: node src/lib/__tests__/motion.test.js
//
// Tests the REAL modules: src/components/house/motion.js and useStagger.js
// are dependency-free, loaded via dynamic import. What's locked:
//
//   1. The tokens are the README §5.1 table, value for value.
//   2. The rules every entrance follows: only opacity, transform and
//      clip-path animate; a settled transform is "none"; entrances fill
//      "backwards"; reduced motion is a short fade with no movement and no
//      waiting.
//   3. playEntrance never throws and never hides content it couldn't animate.
//   4. useStagger: a hidden row takes no slot.
//   5. SOURCE SCANS: the soft-out curve is declared in motion.js and nowhere
//      else under src/; globals.css's keyframes agree with the tokens; the
//      primitives are one file each and no page keeps a private Rise.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

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

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const HOUSE = join(SRC, "components", "house");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(js|jsx|ts|tsx|css)$/.test(name) ? [path] : [];
  });
}

/** A stand-in element that records what it was asked to animate. */
function fakeElement() {
  const calls = [];
  return {
    calls,
    animate(keyframes, timing) {
      calls.push({ keyframes, timing });
      return { cancel() {} };
    },
  };
}

function withMotionPreference(reduce, fn) {
  const before = globalThis.window;
  globalThis.window = { matchMedia: (query) => ({ matches: reduce && /reduce/.test(query) }) };
  try { return fn(); } finally {
    if (before === undefined) delete globalThis.window; else globalThis.window = before;
  }
}

async function main() {
  const motion = await import("../../components/house/motion.js");
  const { default: useStagger } = await import("../../components/house/useStagger.js");
  const {
    SOFT_OUT, EASE, D_TAP, D_FADE, D_RISE, D_LEADER, D_POP, D_EXIT, WORD_STEP, D_WORD, ROW_STEP, PICK_STEP,
    RISE_PX, WORD_PX, EXIT_PX, POP_FROM, D_REDUCED, FONT_WAIT_MS, BREATHE_MS, BREATHE_SCALE, BREATHE_ANIMATION,
    ENTRANCES, EXIT, HIDDEN, HEAD_ENTER, ENTRY_ENTER, ROW_ENTER,
    prefersReducedMotion, entranceKeyframes, entranceTiming, playEntrance,
  } = motion;

  console.log("\n═══ 1. The tokens are the README's table ═══");

  await test("§5.1, value for value", () => {
    assertEq(SOFT_OUT, "cubic-bezier(0.22,1,0.36,1)", "SOFT_OUT");
    assertEq(EASE, "ease", "EASE");
    assertEq(
      { D_TAP, D_FADE, D_RISE, D_LEADER, D_POP, D_EXIT, WORD_STEP, D_WORD, ROW_STEP, PICK_STEP },
      { D_TAP: 150, D_FADE: 500, D_RISE: 700, D_LEADER: 650, D_POP: 420, D_EXIT: 300, WORD_STEP: 30, D_WORD: 450, ROW_STEP: 130, PICK_STEP: 450 },
      "durations and gaps",
    );
  });

  await test("each motion is the one the table describes", () => {
    assertEq(ENTRANCES.rise, { from: { opacity: 0, transform: "translateY(12px)" }, to: { transform: "none" }, duration: 700, easing: SOFT_OUT }, "rise");
    assertEq(ENTRANCES.fade, { from: { opacity: 0 }, to: {}, duration: 500, easing: "ease" }, "fade");
    assertEq(ENTRANCES.pop, { from: { opacity: 0, transform: "scale(0.6)" }, to: { transform: "none" }, duration: 420, easing: SOFT_OUT }, "pop");
    assertEq(ENTRANCES.leader, { from: { clipPath: "inset(0 100% 0 0)" }, to: { clipPath: "inset(0 0 0 0)" }, duration: 650, easing: SOFT_OUT }, "leader");
    assertEq(ENTRANCES.rule.duration, 650, "a rule draws like a leader");
    assertEq(ENTRANCES.word, { from: { opacity: 0, transform: "translateY(6px)" }, to: { transform: "none" }, duration: 450, easing: SOFT_OUT }, "word");
    assertEq(EXIT, { from: { opacity: 1, transform: "none" }, to: { opacity: 0, transform: "translateY(-8px)" }, duration: 300, easing: "ease" }, "exit");
    assertEq({ RISE_PX, WORD_PX, EXIT_PX, POP_FROM }, { RISE_PX: 12, WORD_PX: 6, EXIT_PX: 8, POP_FROM: 0.6 }, "distances");
    assertEq({ D_REDUCED, FONT_WAIT_MS }, { D_REDUCED: 150, FONT_WAIT_MS: 300 }, "§5.2's fade and §11's font wait");
  });

  await test("the breathing loop is §7.5's: 1 → 1.045 → 1 over 3.4s, ease-in-out, on house-breathe", () => {
    assertEq({ BREATHE_MS, BREATHE_SCALE }, { BREATHE_MS: 3400, BREATHE_SCALE: 1.045 }, "breathing");
    assertEq(BREATHE_ANIMATION, "house-breathe 3400ms ease-in-out infinite", "the animation shorthand");
  });

  await test("the offsets inside an entry, a head and a row are §8.1's and §8.5's", () => {
    // Welcome: label 850, leader 1050 (700ms), "two minutes" 1250, circle 1500
    assertEq(ENTRY_ENTER, { leader: 200, leaderMs: 700, sub: 400, mark: 650 }, "entry");
    // A pick: label fades and rule draws 80 after the numeral
    assertEq(HEAD_ENTER, { rule: 80 }, "head");
    // A pick: name +160, leader +380, price +720
    assertEq(ROW_ENTER, { leader: 380 - 160, end: 720 - 160 }, "row");
  });

  console.log("\n═══ 2. The rules every entrance follows ═══");

  await test("only opacity, transform and clip-path animate", () => {
    const allowed = new Set(["opacity", "transform", "clipPath"]);
    for (const [kind, recipe] of Object.entries({ ...ENTRANCES, exit: EXIT })) {
      for (const key of [...Object.keys(recipe.from), ...Object.keys(recipe.to)]) {
        assert(allowed.has(key), `${kind} animates ${key}`);
      }
    }
  });

  await test("a settled transform is none — never a zero translate, never a scale of 1", () => {
    for (const [kind, recipe] of Object.entries(ENTRANCES)) {
      if ("transform" in recipe.from) assertEq(recipe.to.transform, "none", `${kind} must end on transform none`);
      assert(!("opacity" in recipe.to), `${kind} names an end opacity — the element's own must win`);
      const [first, last] = entranceKeyframes(kind);
      assert(!/translate[XY]?\(0(px)?\)|scale[XY]?\(1\)/.test(String(last.transform ?? "")), `${kind} ends on a non-none transform`);
      assertEq([first.offset, last.offset], [0, 1], `${kind} keyframe offsets`);
    }
    assertEq(EXIT.from.transform, "none", "a view leaves from rest");
  });

  await test("every entrance fills backwards, with its own duration and curve", () => {
    for (const kind of Object.keys(ENTRANCES)) {
      const timing = entranceTiming(kind, { delay: 240 });
      assertEq(timing, { duration: ENTRANCES[kind].duration, delay: 240, easing: ENTRANCES[kind].easing, fill: "backwards" }, kind);
    }
    assertEq(entranceTiming("rise", { duration: 300 }).duration, 300, "a duration override");
    assertEq(entranceTiming("fade", { easing: SOFT_OUT }).easing, SOFT_OUT, "an easing override");
    assertEq(entranceTiming("rise").delay, 0, "no delay by default");
    for (const junk of [-50, NaN, undefined, null, "soon"]) {
      assertEq(entranceTiming("rise", { delay: junk }).delay, 0, `a junk delay (${String(junk)}) is no delay`);
    }
  });

  await test("a rise's climb can be overridden; nothing else can be moved", () => {
    assertEq(entranceKeyframes("rise", { distance: 10 })[0].transform, "translateY(10px)", "rise distance");
    assertEq(entranceKeyframes("word", { distance: 4 })[0].transform, "translateY(4px)", "word distance");
    assertEq(entranceKeyframes("rise", { distance: 10 })[1].transform, "none", "still ends on none");
    assertEq(entranceKeyframes("pop", { distance: 10 })[0].transform, "scale(0.6)", "a pop has no distance");
    assertEq(entranceKeyframes("fade", { distance: 10 }), [{ offset: 0, opacity: 0 }, { offset: 1 }], "nor does a fade");
    assertEq(entranceKeyframes("rise", { distance: 10 }) && ENTRANCES.rise.from.transform, "translateY(12px)", "the recipe itself is untouched");
    assertEq(entranceKeyframes("nonsense"), entranceKeyframes("fade"), "an unknown kind fades");
  });

  await test("reduced motion: a 150ms fade, no movement, no waiting — whatever was asked", () => {
    for (const kind of Object.keys(ENTRANCES)) {
      assertEq(
        entranceTiming(kind, { delay: 4450, duration: 900 }, true),
        { duration: 150, delay: 0, easing: "ease", fill: "backwards" },
        `${kind} under reduced motion`,
      );
    }
  });

  await test("what an entrance wears before it can start keeps it in the layout and tappable", () => {
    assertEq(HIDDEN, { opacity: 0 }, "opacity only — never display or visibility");
  });

  console.log("\n═══ 3. playEntrance ═══");

  await test("prefersReducedMotion: false with no window, false with no matchMedia, true only on a match", () => {
    assert(typeof window === "undefined", "premise: plain node has no window");
    assertEq(prefersReducedMotion(), false, "no window");
    const before = globalThis.window;
    globalThis.window = {};
    assertEq(prefersReducedMotion(), false, "no matchMedia");
    globalThis.window = before;
    if (before === undefined) delete globalThis.window;
    assertEq(withMotionPreference(true, prefersReducedMotion), true, "reduce");
    assertEq(withMotionPreference(false, prefersReducedMotion), false, "no preference");
  });

  await test("plays the kind it was asked for, with its delay", () => {
    withMotionPreference(false, () => {
      const el = fakeElement();
      const animation = playEntrance(el, "rise", { delay: 300 });
      assert(animation && typeof animation.cancel === "function", "returns the animation");
      assertEq(el.calls, [{
        keyframes: [{ offset: 0, opacity: 0, transform: "translateY(12px)" }, { offset: 1, transform: "none" }],
        timing: { duration: 700, delay: 300, easing: SOFT_OUT, fill: "backwards" },
      }], "rise");
      const leader = fakeElement();
      playEntrance(leader, "leader", { delay: 1050, duration: 700 });
      assertEq(leader.calls[0].keyframes[0].clipPath, "inset(0 100% 0 0)", "a leader is clipped, not scaled");
      assertEq(leader.calls[0].timing.duration, 700, "leader duration override");
    });
  });

  await test("under reduced motion every kind is the same short fade", () => {
    withMotionPreference(true, () => {
      for (const kind of Object.keys(ENTRANCES)) {
        const el = fakeElement();
        playEntrance(el, kind, { delay: 2700, distance: 10 });
        assertEq(el.calls, [{
          keyframes: [{ offset: 0, opacity: 0 }, { offset: 1 }],
          timing: { duration: 150, delay: 0, easing: "ease", fill: "backwards" },
        }], kind);
      }
    });
  });

  await test("never throws, and never leaves content hidden: no element, no animate(), or a throwing one → null", () => {
    assertEq(playEntrance(null, "rise"), null, "no element");
    assertEq(playEntrance(undefined, "rise"), null, "undefined element");
    assertEq(playEntrance({}, "rise"), null, "an element that can't animate");
    assertEq(playEntrance({ animate() { throw new Error("NotSupportedError"); } }, "rise"), null, "a browser that refuses the keyframes");
  });

  console.log("\n═══ 4. useStagger ═══");

  await test("ROW_STEP apart from the base, by default", () => {
    const next = useStagger(300);
    assertEq([next(), next(), next()], [300, 430, 560], "three siblings");
    const plain = useStagger();
    assertEq([plain(), plain()], [0, 130], "no base");
    const picks = useStagger(800, PICK_STEP);
    assertEq([picks(), picks(), picks()], [800, 1250, 1700], "§8.5's picks: 800 + 450·n");
  });

  await test("a row that doesn't render takes no slot", () => {
    const rows = [{ show: true }, { show: false }, { show: true }, { show: false }, { show: true }];
    const next = useStagger(0, 100);
    const delays = rows.map((row) => (row.show ? next() : null));
    assertEq(delays, [0, null, 100, null, 200], "no gap where the hidden rows would be");
  });

  await test("every call starts a fresh count — a re-render hands the same row the same delay", () => {
    const first = useStagger(50);
    first(); first();
    const second = useStagger(50);
    assertEq(second(), 50, "the second render starts over");
  });

  console.log("\n═══ 5. Source scans ═══");

  await test("SOURCE SCAN: the soft-out curve is declared in motion.js and nowhere else under src/", () => {
    const curve = /cubic-bezier\(\s*0?\.22\s*,\s*1(?:\.0+)?\s*,\s*0?\.36\s*,\s*1(?:\.0+)?\s*\)/;
    const declaring = sourceFiles(SRC)
      .filter((path) => curve.test(readFileSync(path, "utf-8")))
      .map((path) => relative(SRC, path));
    assertEq(declaring, [join("components", "house", "motion.js")], "import SOFT_OUT from @/components/house/motion instead");
  });

  await test("SOURCE SCAN: tokens.js still exports SOFT_OUT — from motion.js, so existing imports hold", () => {
    const tokens = readFileSync(join(HOUSE, "tokens.js"), "utf-8");
    assert(/export\s*\{\s*SOFT_OUT\s*\}\s*from\s*["']\.\/motion["']/.test(tokens), "tokens.js must re-export SOFT_OUT from ./motion");
    assert(!/const\s+SOFT_OUT\b/.test(tokens), "tokens.js must not declare its own SOFT_OUT");
  });

  await test("SOURCE SCAN: globals.css's house-breathe keyframes are the tokens' scale, at rest on none", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf-8");
    const block = css.match(/@keyframes\s+house-breathe\s*\{([\s\S]*?\})\s*\}/);
    assert(block, "globals.css has no @keyframes house-breathe");
    assert(block[1].includes(`scale(${BREATHE_SCALE})`), `the keyframes must peak at scale(${BREATHE_SCALE})`);
    assert(/0%\s*,\s*100%\s*\{\s*transform:\s*none;?\s*\}/.test(block[1]), "the loop must rest on transform: none");
    assert(BREATHE_ANIMATION.startsWith("house-breathe "), "BREATHE_ANIMATION must name the keyframes");
  });

  await test("SOURCE SCAN: globals.css stops every CSS keyframe loop under reduced motion", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf-8");
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/);
    assert(block, "globals.css has no prefers-reduced-motion block");
    assert(/animation-iteration-count:\s*1\s*!important/.test(block[1]), "loops must run once");
    assert(/animation-duration:\s*0?\.01ms\s*!important/.test(block[1]), "and in an instant");
    // `animation: none` would strand anything whose keyframes end it visible
    assert(!/animation:\s*none/.test(block[1]), "never animation: none — an element must still reach its end state");
  });

  await test("SOURCE SCAN: the Ink primitives are one file each, and no page keeps a private Rise", () => {
    for (const file of ["motion.js", "Enter.js", "LeaderDraw.js", "RuleDraw.js", "WriteIn.js", "useStagger.js", "useReducedMotion.js", "useEntrance.js"]) {
      assert(existsSync(join(HOUSE, file)), `src/components/house/${file} is missing`);
    }
    const privateRise = sourceFiles(SRC)
      .filter((path) => /function\s+Rise\s*\(/.test(readFileSync(path, "utf-8")))
      .map((path) => relative(SRC, path));
    assertEq(privateRise, [], "use <Enter> from @/components/house/Enter");
  });

  await test("SOURCE SCAN: nothing in the Ink family fills forwards or both — an entrance leaves nothing behind", () => {
    for (const file of ["motion.js", "useEntrance.js", "Enter.js", "LeaderDraw.js", "RuleDraw.js", "WriteIn.js"]) {
      const source = readFileSync(join(HOUSE, file), "utf-8");
      assert(!/fill:\s*["'](both|forwards)["']/.test(source), `${file} holds an animation's end state`);
    }
  });

  await test("SOURCE SCAN: the house components that enter take `enterDelay` and stay still without it", () => {
    for (const file of ["LeaderEntry.js", "WineRow.js", "SettingRow.js", "SectionHead.js", "Divider.js"]) {
      const source = readFileSync(join(HOUSE, file), "utf-8");
      assert(/\benterDelay\b/.test(source), `${file} doesn't take enterDelay`);
      // Every entrance in them is switched by `play` (enterDelay != null),
      // or handed straight to a primitive that makes the same check
      const calls = source.split("\n").filter((line) => /=\s*useEntrance\(/.test(line));
      assert(calls.length > 0, `${file} never calls useEntrance`);
      for (const call of calls) assert(/\bplay\b/.test(call), `${file}: ${call.trim()} would play with no enterDelay`);
    }
    for (const file of ["LeaderDraw.js", "RuleDraw.js"]) {
      const source = readFileSync(join(HOUSE, file), "utf-8");
      assert(/play:\s*enterDelay\s*!=\s*null|const play = enterDelay != null/.test(source), `${file} must rest when enterDelay is absent`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
