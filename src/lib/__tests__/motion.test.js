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
//      primitives are one file each and no page keeps a private Rise; the
//      reveal's timings (§8.3) live in motion.js and Quiz.js types none.
//   6. The rewards (§8.4): a tile's press, the saved step's timeline (the
//      README's table, counted from the step's arrival), home's and the
//      palate's entrances — and the pages that play them type none of it.

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
    ENTRANCES, EXIT, HIDDEN, HEAD_ENTER, ENTRY_ENTER, ROW_ENTER, REVEAL, DOTS, dotAnimation,
    PRESS, PRESS_KEYFRAMES, GROWTH, SAVED, HOME, PALATE,
    PICKS, SOMM, TICKER, PAGE_REST, QUICK_RISE, pickDelay, picksCloseDelay, sommNoteDelay, easeHeight,
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

  await test("the reveal is §8.3's table, value for value — counted from the draw's first frame", () => {
    const { eyebrow, title, epithet, divider, narrative, saved, cta, gate } = REVEAL;
    assertEq(
      { eyebrow, title, epithet, divider, narrative, saved, cta, gate },
      { eyebrow: 1500, title: 1750, epithet: 2350, divider: 2700, narrative: 2950, saved: 4300, cta: 4450, gate: 2700 },
      "when each part arrives",
    );
    // The title is written at 110ms per word, 700ms each; the narrative at 22ms per word
    assertEq({ titleStep: REVEAL.titleStep, titleMs: REVEAL.titleMs, narrativeStep: REVEAL.narrativeStep }, { titleStep: 110, titleMs: 700, narrativeStep: 22 }, "the written lines");
    // The reading line fades out 250ms before the draw
    assertEq(REVEAL.lineLead, 250, "the reading line's lead");
    assert(REVEAL.lineOutMs > 0 && REVEAL.lineIn >= 0, "the line fades in and out");
  });

  await test("the reveal's recs come last: after the CTA's circle, or after the gate has risen", () => {
    assert(REVEAL.recs >= REVEAL.cta + ENTRY_ENTER.mark, "signed in: the recs start before the CTA has landed");
    assert(REVEAL.teaserRecs >= REVEAL.gate + D_RISE - 200 && REVEAL.teaserRecs < REVEAL.recs, "signed out: after the gate, sooner than signed in");
    assert(REVEAL.recsSub > 0 && REVEAL.recsRows > REVEAL.recsSub, "head, then its line, then the rows");
    // What a retried save brings lands at once — the draw is long over
    assert(REVEAL.late.saved === 0 && REVEAL.late.cta > 0 && REVEAL.late.cta < 500, "the late saved line and CTA");
  });

  await test("the waiting dots breathe one after another on house-dot", () => {
    assertEq(DOTS, { ms: 1400, step: 180, rest: 0.25 }, "the dots");
    // Backwards: a dot waiting its turn already rests at the keyframes' start
    // — without it the second and third show at full ink, then snap down
    assertEq(dotAnimation(0), "house-dot 1400ms ease-in-out 0ms infinite backwards", "the first dot");
    assertEq(dotAnimation(2), "house-dot 1400ms ease-in-out 360ms infinite backwards", "the third");
  });

  await test("a rating tile's press is §8.4's: 1 → 0.88 → 1.08 → 1 over 380ms, the others to 0.25 over 220ms", () => {
    assertEq(
      { ms: PRESS.ms, down: PRESS.down, up: PRESS.up, restMs: PRESS.restMs, rest: PRESS.rest },
      { ms: 380, down: 0.88, up: 1.08, restMs: 220, rest: 0.25 },
      "the press",
    );
    assertEq(PRESS_KEYFRAMES.map((k) => k.transform), ["none", "scale(0.88)", "scale(1.08)", "none"], "the keyframes");
    assertEq(PRESS_KEYFRAMES.map((k) => k.offset), [0, 0.3, 0.65, 1], "…at the study's offsets");
    for (const frame of PRESS_KEYFRAMES) {
      assertEq(Object.keys(frame).sort(), ["offset", "transform"], "the press only transforms");
    }
    // The tiles stay until the press has settled — §8.4's 430ms, when the step leaves
    assertEq(PRESS.holdMs, 430, "the hold");
    assert(PRESS.holdMs >= PRESS.ms && PRESS.holdMs >= PRESS.restMs, "the hold must outlast the press and the others stepping back");
  });

  await test("the saved step is §8.4's table, value for value — counted from the step's arrival (the table's 740)", () => {
    const ARRIVES = 740; // the README counts from the tap
    assertEq(GROWTH.delay, 1440 - ARRIVES, "growth begins 700ms after the screen arrives");
    assertEq(
      SAVED.grown,
      {
        size: 164, eyebrow: 2590 - ARRIVES, headline: 2790 - ARRIVES, sub: 3390 - ARRIVES,
        rule: 4090 - ARRIVES, row: 4190 - ARRIVES, ways: 5040 - ARRIVES,
      },
      "the big moment",
    );
    assertEq({ step: SAVED.headlineStep, subStep: SAVED.subStep }, { step: 85, subStep: 30 }, "the written lines");
    // The quiet path: settled at 132px, the eyebrow at 250ms, and the same
    // parts in the same order, sooner
    assertEq({ size: SAVED.quiet.size, eyebrow: SAVED.quiet.eyebrow }, { size: 132, eyebrow: 250 }, "the quiet path");
    const order = ["eyebrow", "headline", "sub", "rule", "row", "ways"];
    for (const path of [SAVED.grown, SAVED.quiet]) {
      for (let i = 1; i < order.length; i++) assert(path[order[i]] > path[order[i - 1]], `${order[i]} arrives before ${order[i - 1]}`);
    }
    for (const part of order) assert(SAVED.quiet[part] < SAVED.grown[part], `the quiet ${part} is no sooner than the big moment's`);
    assert(SAVED.grown.size > SAVED.quiet.size, "the big moment's bloom is the bigger one (M6)");
    // The bloom has grown before the page says why: the eyebrow follows the growth's start
    assert(SAVED.grown.eyebrow > GROWTH.delay, "the eyebrow arrives before the growth begins");
  });

  await test("home arrives in under 1.2s from the layout's choice; the palate's heads draw as it mounts", () => {
    // Four sections (out, in, from last night, chosen), four rows in the last
    const lastSection = HOME.sections + 3 * HOME.sectionStep;
    const lastRow = lastSection + HOME.follow + 3 * ROW_STEP;
    assert(lastRow < 1200, `the last row starts at ${lastRow}ms`);
    assert(HOME.divider < HOME.date && HOME.date <= HOME.sections, "crest, divider, date line, then the sections");
    assert(HOME.crestWait > 0 && HOME.crestWait <= 1000, "the crest never waits long for the layout");
    assert(HOME.follow > 0 && HOME.sectionStep > HOME.follow, "an entry follows its own head, before the next head");
    assert(PALATE.divider < PALATE.heads && PALATE.step > 0, "the divider, then the heads one after another");
    assert(PALATE.heads + 3 * PALATE.step < 1200, "the palate's heads are all drawing within 1.2s");
  });

  await test("Your picks is §8.5's table, value for value — counted from the view's arrival", () => {
    const { title, sub, terms, termsText, somm, first, step } = PICKS;
    assertEq(
      { title, sub, terms, termsText, somm, first, step },
      { title: 80, sub: 180, terms: 300, termsText: 450, somm: 600, first: 800, step: 450 },
      "the view",
    );
    assertEq(step, PICK_STEP, "picks are PICK_STEP apart");
    assertEq(PICKS.pick, { name: 160, leader: 380, meta: 420, note: 520, price: 720, actions: 780 }, "inside a pick, from its own start");
    assertEq([0, 1, 2, 3].map(pickDelay), [800, 1250, 1700, 2150], "pick n starts at 800 + 450·n");
    // A pick's name, leader and price keep the rhythm every other row has
    assertEq(
      { leader: PICKS.pick.leader - PICKS.pick.name, end: PICKS.pick.price - PICKS.pick.name },
      ROW_ENTER, "a pick's row is a row",
    );
    // The closing divider draws after the last pick — the study's 2500 for three
    assertEq(picksCloseDelay(3), 2500, "three picks");
    assert(picksCloseDelay(1) > pickDelay(0) + PICKS.pick.actions, "after the last pick's actions have begun to arrive");
    assertEq(picksCloseDelay(0), PICKS.first, "no picks: where the first would have started");
    assertEq(picksCloseDelay(-2), PICKS.first, "junk count");
  });

  await test("the Somm lands as §8.5 says: tasting out over 200ms, the summary at 30ms a word, notes from 1250ms, 520ms apart, 26ms a word", () => {
    assertEq(SOMM, { outMs: 200, summaryStep: 30, heightMs: 450, notes: 1250, noteStep: 520, noteWordStep: 26, swapMs: 320 }, "SOMM");
    assertEq([0, 1, 2].map(sommNoteDelay), [1250, 1770, 2290], "pick by pick");
    // The summary has begun before the first note is rewritten
    assert(SOMM.outMs < SOMM.notes, "the summary leads the notes");
  });

  await test("the reading's ticker is §8.5's: a name every 190ms, each on a 160ms fade", () => {
    assertEq(TICKER, { step: 190, fadeMs: 160, from: 0.2, outMs: 250 }, "TICKER");
    assert(TICKER.fadeMs < TICKER.step, "a name has landed before the next one starts");
    assert(TICKER.from > 0 && TICKER.from < 1, "a flick, not a blink");
  });

  await test("the quiet pages (§8.6): the title rises, the rest fades in together over 300ms; what opens in place rises quickly", () => {
    assertEq(PAGE_REST, { kind: "fade", duration: 300, delay: 100 }, "PAGE_REST");
    assert(ENTRANCES[PAGE_REST.kind] === ENTRANCES.fade, "a single fade — lists are for scanning, nothing staggers");
    assertEq(QUICK_RISE, { duration: 300, distance: 10 }, "QUICK_RISE");
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

  console.log("\n═══ 3b. easeHeight — the one layout animation (§8.5) ═══");

  /** A box whose natural height is `natural`, recording what it was asked to animate. */
  function fakeBox(natural, { overflow = "" } = {}) {
    const calls = [];
    let settle;
    let refuse;
    const box = {
      calls,
      style: { overflow },
      getBoundingClientRect: () => ({ height: natural }),
      animate(keyframes, timing) {
        const finished = new Promise((resolve, reject) => { settle = resolve; refuse = reject; });
        calls.push({ keyframes, timing, overflowDuring: box.style.overflow });
        return { finished, cancel: () => refuse(new Error("AbortError")) };
      },
      finish: () => settle(),
    };
    return box;
  }

  await test("eases the box from the height it had to the height it has: height only, SOFT_OUT, 450ms, no fill", () => {
    withMotionPreference(false, () => {
      const box = fakeBox(96);
      const animation = easeHeight(box, 40);
      assert(animation, "an animation is returned, so a caller can cancel it");
      assertEq(box.calls.length, 1, "one animation");
      assertEq(box.calls[0].keyframes, [{ height: "40px" }, { height: "96px" }], "from the old height to the new");
      assertEq(box.calls[0].timing, { duration: 450, easing: SOFT_OUT }, "no fill: the box ends on its own height");
      assertEq(box.calls[0].overflowDuring, "hidden", "what doesn't fit yet is clipped while the box grows");
    });
  });

  await test("leaves nothing behind: the box's own overflow comes back when the ease ends — or is cancelled", async () => {
    await withMotionPreference(false, async () => {
      const ended = fakeBox(96, { overflow: "" });
      easeHeight(ended, 40);
      assertEq(ended.style.overflow, "hidden", "clipped during");
      ended.finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assertEq(ended.style.overflow, "", "restored after");

      const cancelled = fakeBox(20, { overflow: "visible" });
      const animation = easeHeight(cancelled, 80);
      animation.cancel();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assertEq(cancelled.style.overflow, "visible", "restored after a cancel");
    });
  });

  await test("a second ease on the same box, begun as the first is cancelled, still leaves the box's own overflow", async () => {
    await withMotionPreference(false, async () => {
      // useRewrite's cleanup cancels one ease and the next starts in the
      // same breath — before the first's cancel has been heard. The second
      // must not mistake the first's clipping for the box's own style
      const box = fakeBox(96, { overflow: "" });
      const first = easeHeight(box, 40);
      first.cancel();
      easeHeight(box, 60);
      assertEq(box.style.overflow, "hidden", "clipped through the second ease");
      await new Promise((resolve) => setTimeout(resolve, 0));
      assertEq(box.style.overflow, "hidden", "the first's late restore doesn't unclip the second");
      box.finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assertEq(box.style.overflow, "", "and the box ends as it began");
    });
  });

  await test("closes a box to nothing, and opens one from nothing", () => {
    withMotionPreference(false, () => {
      const closing = fakeBox(0);
      easeHeight(closing, 72);
      assertEq(closing.calls[0].keyframes, [{ height: "72px" }, { height: "0px" }], "closing");
      const opening = fakeBox(72);
      easeHeight(opening, 0);
      assertEq(opening.calls[0].keyframes, [{ height: "0px" }, { height: "72px" }], "opening");
    });
  });

  await test("does nothing when there is nothing to ease — and nothing at all under reduced motion", () => {
    withMotionPreference(false, () => {
      const same = fakeBox(64);
      assertEq(easeHeight(same, 64.2), null, "the same height, to the pixel");
      assertEq(same.calls.length, 0, "no animation");
      assertEq(same.style.overflow, "", "and the box untouched");
      assertEq(easeHeight(null, 40), null, "no box");
      assertEq(easeHeight({ style: {}, getBoundingClientRect: () => ({ height: 9 }) }, 40), null, "a box that can't animate");
      assertEq(easeHeight(fakeBox(96), NaN), null, "an unknown old height");
      const refuses = { style: { overflow: "" }, getBoundingClientRect: () => ({ height: 96 }), animate() { throw new Error("NotSupportedError"); } };
      assertEq(easeHeight(refuses, 40), null, "a browser that refuses the keyframes");
      assertEq(refuses.style.overflow, "", "…leaves the box as it was");
    });
    withMotionPreference(true, () => {
      const box = fakeBox(96);
      assertEq(easeHeight(box, 40), null, "reduced motion");
      assertEq(box.calls.length, 0, "the new height is simply there");
    });
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

  await test("SOURCE SCAN: globals.css's house-dot keyframes dip to the tokens' rest and peak at full", () => {
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf-8");
    const block = css.match(/@keyframes\s+house-dot\s*\{([\s\S]*?\})\s*\}/);
    assert(block, "globals.css has no @keyframes house-dot");
    assert(new RegExp(`0%\\s*,\\s*100%\\s*\\{\\s*opacity:\\s*${DOTS.rest};?\\s*\\}`).test(block[1]), `the dots must rest at ${DOTS.rest}`);
    assert(/\d+%\s*\{\s*opacity:\s*1;?\s*\}/.test(block[1]), "and reach full ink");
    // Opacity only (§5.1): a dot never moves
    assert(!/transform|scale|translate/.test(block[1]), "the dots only fade");
  });

  await test("SOURCE SCAN: the reveal's timings live in motion.js — Quiz.js types none of them", () => {
    const quiz = readFileSync(join(SRC, "components", "Quiz.js"), "utf-8");
    // Code only: prose in comments may quote the table
    const code = quiz.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    assert(/\bREVEAL\b/.test(code), "Quiz.js must take the reveal's timings from REVEAL");
    for (const ms of [REVEAL.eyebrow, REVEAL.title, REVEAL.epithet, REVEAL.divider, REVEAL.narrative, REVEAL.saved, REVEAL.cta, 1900]) {
      assert(!new RegExp(`(^|[^\\w.])${ms}\\b`).test(code), `Quiz.js types ${ms} — it belongs in motion.js (or MARK_MOTION)`);
    }
    // The wait's floor is the mark's own (MARK_MOTION.thinkMs), not a second
    // number held beside the save
    assert(!/MIN_READING_MS/.test(code), "the reveal's minimum wait is the mark's think time");
    assert(!/@keyframes/.test(code), "keyframes live in globals.css");
  });

  // Code only: prose in comments may quote the tables
  const codeOf = (path) => readFileSync(path, "utf-8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
  const types = (code, ms) => new RegExp(`(^|[^\\w.])${ms}\\b`).test(code);

  await test("SOURCE SCAN: the saved step's timings live in motion.js — SavedStep and LogBottle type none of them", () => {
    // A font weight is not a timing
    const unweighted = (code) => code.replace(/fontWeight:\s*\d+/g, "");
    const step = unweighted(codeOf(join(SRC, "app", "log", "SavedStep.js")));
    const log = unweighted(codeOf(join(SRC, "app", "log", "LogBottle.js")));
    assert(/\bSAVED\b/.test(step) && /\bGROWTH\b/.test(step), "SavedStep must take its timings from SAVED and GROWTH");
    const table = [...Object.values(SAVED.grown), ...Object.values(SAVED.quiet), GROWTH.delay, SAVED.headlineStep, PRESS.holdMs];
    for (const ms of new Set(table)) {
      assert(!types(step, ms), `SavedStep.js types ${ms} — it belongs in motion.js`);
    }
    // The saved step is SavedStep's: LogBottle sets no bloom of its own
    for (const px of [SAVED.grown.size, SAVED.quiet.size]) {
      assert(!types(log, px), `LogBottle.js types ${px} — the saved step's bloom is SavedStep's`);
    }
    assert(!/PalateMark/.test(log), "LogBottle must not render the bloom itself");
    assert(/setTimeout\(arrive, D_EXIT\)/.test(log), "the rate step leaves over D_EXIT");
    assert(/<GrowthMoment\b/.test(step) && !/PalateMarkLive/.test(step), "the saved step's bloom is GrowthMoment's");
  });

  await test("SOURCE SCAN: one GrowthMoment — every surface that answers a rating with the bloom goes through it", () => {
    const surfaces = [
      join(SRC, "app", "log", "SavedStep.js"), join(SRC, "app", "wine", "WinePage.js"), join(SRC, "app", "page.js"),
    ];
    for (const path of surfaces) {
      const code = codeOf(path);
      assert(/<GrowthMoment\b/.test(code), `${relative(SRC, path)} doesn't use GrowthMoment`);
      assert(!/celebrate/.test(code), `${relative(SRC, path)} decides the celebration itself — growthOf() does`);
    }
    for (const path of [join(SRC, "app", "log", "LogBottle.js"), join(SRC, "app", "wine", "WinePage.js"), join(SRC, "app", "page.js")]) {
      assert(/\bgrowthOf\(/.test(codeOf(path)), `${relative(SRC, path)} must read the moment with growthOf()`);
    }
    // The decision lives in one place, and only GrowthMoment hands it to the mark
    const moment = codeOf(join(SRC, "components", "GrowthMoment.js"));
    assert(/celebrate=\{grows && Boolean\(moment\.celebrate\)\}/.test(moment), "GrowthMoment celebrates only a moment that says so");
    const asking = sourceFiles(SRC)
      .filter((path) => /\.js$/.test(path) && /\bcelebrate(=|:\s*true)/.test(codeOf(path)))
      .map((path) => relative(SRC, path))
      .filter((path) => !/motion-specimen/.test(path));
    assertEq(asking.sort(), ["components/GrowthMoment.js", "components/PalateMarkLive.js"].sort(), "who asks the mark to celebrate");
  });

  await test("SOURCE SCAN: the tiles' press is PRESS's — RatingTiles types none of it, and the hold is its own hook", () => {
    const tiles = codeOf(join(HOUSE, "RatingTiles.js"));
    assert(/PRESS_KEYFRAMES/.test(tiles) && /PRESS\.holdMs/.test(tiles) && /PRESS\.rest\b/.test(tiles), "RatingTiles must take the press from PRESS");
    for (const n of [PRESS.ms, PRESS.holdMs, PRESS.restMs, "0\\.88", "1\\.08"]) {
      assert(!types(tiles, n), `RatingTiles.js types ${String(n).replace(/\\/g, "")} — it belongs in motion.js`);
    }
    assert(/export function usePressHold\b/.test(tiles), "the hold is usePressHold");
    // Nothing waits on the press: the tap rates in the same handler
    assert(/playPress\(e\.currentTarget\);\s*onRate\?\.\(rating\.id\);/.test(tiles), "a tile must rate on the tap itself");
    assert(!/setTimeout\([^)]*onRate/.test(tiles), "a rating must never be delayed by the press");
    // Every surface that shows tiles holds them through the press
    for (const path of [
      join(SRC, "components", "WineRecList.js"), join(SRC, "app", "recommend", "PickEntry.js"),
      join(SRC, "app", "wine", "WinePage.js"), join(SRC, "app", "page.js"),
    ]) {
      const code = codeOf(path);
      assert(/usePressHold\(\)/.test(code) && /rated=\{/.test(code), `${relative(SRC, path)} shows tiles without holding them through the press`);
    }
  });

  await test("SOURCE SCAN: home's and the palate's entrances are HOME's and PALATE's", () => {
    const home = codeOf(join(SRC, "app", "page.js"));
    assert(/HOME\.sections/.test(home) && /HOME\.follow/.test(home) && /HOME\.crestWait/.test(home), "home must take its entrance from HOME");
    const palate = codeOf(join(SRC, "components", "PalateView.js"));
    assert(/PALATE\.heads/.test(palate) && /PALATE\.divider/.test(palate), "the palate must take its entrance from PALATE");
    // The layout is chosen first: nothing below the crest enters before it
    assert(/\{layout && \(\s*<>\s*<Divider enterDelay=\{HOME\.divider\}/.test(home), "the divider must wait for the layout");
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

  await test("SOURCE SCAN: Your picks' and the Somm's timings live in motion.js — the page and its parts type none of them", () => {
    const unweighted = (code) => code.replace(/fontWeight:\s*\d+/g, "");
    const files = ["MatchList.js", "PickEntry.js", "SommSays.js"].map((name) => join(SRC, "app", "recommend", name));
    const table = [
      PICKS.first, PICKS.pick.leader, PICKS.pick.meta, PICKS.pick.note, PICKS.pick.price, PICKS.pick.actions,
      SOMM.notes, SOMM.noteStep, SOMM.heightMs, TICKER.step,
    ];
    for (const path of files) {
      const code = unweighted(codeOf(path));
      for (const ms of new Set(table)) {
        assert(!types(code, ms), `${relative(SRC, path)} types ${ms} — it belongs in motion.js`);
      }
    }
    const page = codeOf(files[0]);
    assert(/\bpickDelay\(/.test(page) && /\bsommNoteDelay\(/.test(page) && /PICKS\.title/.test(page), "MatchList must take the arrival from PICKS");
    assert(!/const QUICK_RISE\s*=/.test(page), "QUICK_RISE lives in motion.js");
    assert(/PICKS\.pick\./.test(codeOf(files[1])), "PickEntry must take its parts' offsets from PICKS.pick");
    assert(/SOMM\.summaryStep/.test(codeOf(files[2])), "SommSays must write the summary at SOMM's pace");
  });

  await test("SOURCE SCAN: one reading view — Match and Log both wait in ReadingView, and it types none of the ticker", () => {
    const view = codeOf(join(SRC, "components", "ReadingView.js"));
    assert(/<PalateMarkLive\b[^>]*\bbreathing\b/.test(view), "the bloom breathes while something is read");
    assert(/<SwapLine\b[^>]*aria-live="polite"/.test(view), "the line cross-fades, and is the view's live region");
    assert(/TICKER\.step/.test(view) && /TICKER\.fadeMs/.test(view) && /TICKER\.outMs/.test(view), "the ticker is TICKER's");
    for (const ms of [TICKER.step, TICKER.fadeMs, TICKER.outMs]) {
      assert(!types(view, ms), `ReadingView.js types ${ms} — it belongs in motion.js`);
    }
    // Decorative, and never under reduced motion
    assert(/aria-hidden="true"[^>]*data-testid="reading-ticker"|data-testid="reading-ticker"[^>]*aria-hidden="true"/.test(view), "the ticker is hidden from screen readers");
    for (const path of [join(SRC, "app", "recommend", "MatchList.js"), join(SRC, "app", "log", "LogBottle.js")]) {
      assert(/<ReadingView\b/.test(codeOf(path)), `${relative(SRC, path)} must wait in ReadingView`);
    }
  });

  await test("SOURCE SCAN: height is animated in ONE place — easeHeight, reached only through useRewrite", () => {
    const animatesHeight = sourceFiles(SRC)
      .filter((path) => /\.js$/.test(path) && /\.animate\(\s*\[\s*\{[^}]*\bheight\b/.test(codeOf(path)))
      .map((path) => relative(SRC, path));
    assertEq(animatesHeight, ["components/house/motion.js"], "who animates a height");
    const callers = sourceFiles(SRC)
      .filter((path) => /\.js$/.test(path) && /\beaseHeight\(/.test(codeOf(path)))
      .map((path) => relative(SRC, path))
      .filter((path) => path !== "components/house/motion.js");
    assertEq(callers, ["components/house/useRewrite.js"], "who eases a height");
    // No CSS transition on a height either: §8.5's is the one exception
    const transitions = sourceFiles(SRC)
      .filter((path) => /\.js$/.test(path) && /transition:\s*[`"'][^`"']*\bheight\b/.test(codeOf(path)))
      .map((path) => relative(SRC, path));
    assertEq(transitions, [], "no CSS height transitions");
  });

  await test("SOURCE SCAN: a rule that draws keeps its origin for as long as it is mounted", () => {
    // A caller may hand `enterDelay` on its arrival render only (Your picks
    // does). If the origin followed the live prop, the next re-render would
    // drop it under a draw still pending — and the rule would grow from its
    // centre. The origin is decided once, when the rule mounts
    const rule = codeOf(join(HOUSE, "RuleDraw.js"));
    assert(/const drawn = useRef\(play\)\.current;/.test(rule), "RuleDraw must latch whether it draws at mount");
    assert(/drawn \? \{ \.\.\.style, transformOrigin: origin \} : style/.test(rule), "…and key its origin on that, not on the live prop");
  });

  await test("SOURCE SCAN: Your picks' arrival plays for picks that LANDED — never for a view that merely came back", () => {
    const page = codeOf(join(SRC, "app", "recommend", "MatchList.js"));
    // commitAnalysis is the only thing that earns an arrival
    assert(/picksLanded\.current \+= 1/.test(page), "an analysis that commits must count as a landing");
    // The error a failed page leaves over the picks is never inside an entrance
    const alert = page.indexOf('data-testid="add-page-error"');
    assert(alert > 0, "add-page-error is missing");
    const before = page.slice(0, alert);
    const opened = (before.match(/<Enter\b/g) || []).length;
    const closed = (before.match(/<\/Enter>/g) || []).length + (before.match(/<Enter\b[^>]*\/>/g) || []).length;
    assertEq(opened - closed, 0, "add-page-error sits inside an <Enter> — a failed page must never wait to be seen");
  });

  await test("SOURCE SCAN: the quiet pages enter with PAGE_REST — none types its own fade", () => {
    for (const path of [
      join(SRC, "app", "journal", "page.js"), join(SRC, "app", "search", "page.js"),
      join(SRC, "app", "account", "page.js"), join(SRC, "app", "wine", "WinePage.js"),
    ]) {
      const code = codeOf(path);
      assert(/<Enter \{\.\.\.PAGE_REST\}/.test(code), `${relative(SRC, path)} must fade its rows in with PAGE_REST`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
