import { test, expect, type Page } from "@playwright/test";
import { GESTURES, GESTURE_FIT, MARK_IDS, RATING_MARKS, SHADE, gestureDrawing, renderMark } from "../src/components/house/marks.js";
import { PENCIL, PRESS, gestureWipes, pencilStrokes } from "../src/components/house/motion.js";
import { RATINGS } from "../src/lib/ratings.js";

/**
 * House & Hand, Session 1 (docs/marks/README.md §6–§7, §10) — the mark
 * primitives on /marks-specimen, an unlinked page of sample content. No real
 * page uses them yet; Session 2 moves the tile and done-line checks onto the
 * real rating surfaces (motion.spec.ts), and Session 3 deletes the specimen
 * and this spec with it. Read-only: nothing here touches an account.
 *
 *   1. Every mark renders exactly as marks.js's renderMark draws it; an
 *      unknown id renders nothing; a settled PencilGlass IS Mark's markup.
 *   2. Under reduced motion (the suite's default) a tapped tile, its done
 *      line and a gesture are settled in the same commit: nothing draws.
 *   3. With motion on, a tapped tile pencils its shading in stroke by
 *      stroke — one <path> each, drawn in turn, inside the press hold — and
 *      ends on its settled markup; "Not for me" turns over instead; the done
 *      line draws at the table's pace; a gesture is wiped in from the left.
 *      Nothing is left behind.
 *   4. A gesture over a name leaves the name alone and sits where the
 *      reference puts it. On a wrapped name (README §14.1) the underline and
 *      the strike go on EVERY line — as many strokes as lines, each spanning
 *      its own line, no two neighbours sharing a drawing — and follow the
 *      name when it re-wraps.
 *   5. The circle is the one stretched drawing, always: one <svg> round the
 *      whole name, GESTURES.circle, on one line or four.
 */

const GESTURE_COUNT = 13; // in the gestures section: three on one line, three wrapped, three lined, four circled
const GESTURES_SECTION = '[data-testid="specimen-gestures"]';

const SPECIMEN = "/marks-specimen";

async function open(page: Page) {
  await page.goto(SPECIMEN);
  await expect(page.locator("main[data-ready]")).toBeAttached(); // hydrated: taps reach React
}

/** A markup string as the browser parses and re-serializes it. */
function parsed(page: Page, html: string) {
  return page.evaluate((h) => {
    const div = document.createElement("div");
    div.innerHTML = h;
    return div.innerHTML;
  }, html);
}

/** The settled markup of a tile's glass: its resting guide taken out. */
function tileGlass(page: Page, id: string) {
  return page.getByTestId(`specimen-tile-${id}`).locator("svg").evaluate((svg) => {
    const copy = svg.cloneNode(true) as Element;
    copy.querySelector("[data-guide]")?.remove();
    return copy.outerHTML;
  });
}

/** Everything still dashed or animating under an element. */
function leftBehind(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => ({
    dashed: el.querySelectorAll("[pathLength], [stroke-dasharray]").length,
    running: el.getAnimations({ subtree: true }).length,
    transform: (el instanceof SVGElement ? el : el.querySelector("svg"))?.style.transform ?? "",
    clipped: [...el.querySelectorAll("svg")].filter((s) => (s as SVGElement).style.clipPath).length,
  }));
}

async function settle(page: Page, selector: string) {
  await expect.poll(() => page.locator(selector).first().evaluate((el) => el.getAnimations({ subtree: true }).length), { timeout: 5000 }).toBe(0);
}

test.describe("House & Hand — the marks (specimen, Session 1)", () => {
  test("every mark renders as renderMark draws it, junk renders nothing, and a settled PencilGlass is Mark", async ({ page }) => {
    await open(page);
    for (const id of MARK_IDS) {
      const svg = page.getByTestId(`specimen-mark-${id}`).locator("svg");
      await expect(svg).toHaveCount(1);
      expect(await svg.evaluate((el) => el.outerHTML), id).toBe(await parsed(page, renderMark(id, { size: 26 })));
    }
    await expect(page.getByTestId("specimen-unknown-mark").locator("*")).toHaveCount(0);
    for (const r of RATINGS) {
      const glass = await page.getByTestId(`specimen-glass-${r.id}`).locator("svg").evaluate((el) => el.outerHTML);
      const mark = await page.getByTestId(`specimen-mark-${RATING_MARKS[r.id as keyof typeof RATING_MARKS]}`).locator("svg").evaluate((el) => el.outerHTML);
      expect(glass, `${r.id}: PencilGlass settled = Mark`).toBe(mark);
    }
    // A tile at rest shows its level only as the faint guide — the firm
    // shading goes in when it is tapped
    for (const r of RATINGS) {
      const rest = await page.getByTestId(`specimen-tile-${r.id}`).locator("svg").evaluate((svg) => ({
        guides: [...svg.querySelectorAll("[data-guide]")].map((p) => p.getAttribute("opacity")),
        firm: svg.querySelectorAll("g:not([stroke='currentColor']) > path").length,
      }));
      const shaded = r.id in SHADE;
      expect(rest, r.id).toEqual({ guides: shaded ? [String(PENCIL.guide)] : [], firm: 0 });
    }
  });

  test("under reduced motion a tile, its done line and a gesture are settled at once — nothing draws", async ({ page }) => {
    await page.addInitScript(() => {
      const record: string[] = [];
      (window as unknown as { __pencil: string[] }).__pencil = record;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        const keys = JSON.stringify(keyframes);
        if (/strokeDashoffset|clipPath|rotate/.test(keys)) record.push(keys);
        return animate.call(this, keyframes, options);
      };
    });
    await open(page);
    const pencilled = () => page.evaluate(() => (window as unknown as { __pencil: string[] }).__pencil.length);

    // A tile tapped: the done line takes its place on the tap, its glass settled
    await page.getByTestId("specimen-tile-loved").click();
    const done = page.getByTestId("specimen-done");
    await expect(done).toBeVisible();
    expect(await done.locator("svg").evaluate((el) => el.outerHTML)).toBe(await parsed(page, renderMark("glass-loved", { size: 22 })));

    // A tile that stays: pencilled in at once — the guide under the settled glass
    await page.getByTestId("specimen-keep").click();
    await page.getByTestId("specimen-tile-not_for_me").click();
    expect(await tileGlass(page, "not_for_me")).toBe(await parsed(page, renderMark("glass-down", { size: 30 })));
    await page.getByTestId("specimen-rate-again").click();
    await page.getByTestId("specimen-tile-fine").click();
    expect(await tileGlass(page, "fine")).toBe(await parsed(page, renderMark("glass-fine", { size: 30 })));

    // Gestures, pencilled again: simply there
    await page.getByTestId("specimen-pencil-again").click();
    await expect(page.locator(`${GESTURES_SECTION} [data-gesture]`)).toHaveCount(GESTURE_COUNT);

    expect(await pencilled(), "no stroke, flip or wipe ever started").toBe(0);
    // The tiles' and text actions' own 150ms tap states are CSS transitions, not marks
    await settle(page, "main");
    expect(await leftBehind(page, "main")).toEqual({ dashed: 0, running: 0, transform: "", clipped: 0 });
  });

  test.describe("with motion on", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("a tapped tile pencils its shading in stroke by stroke, inside the hold, and ends on its settled markup", async ({ page }) => {
      await open(page);
      await page.getByTestId("specimen-keep").click(); // the tile stays, so its end state can be read

      // Tap and watch every frame, from the same task as the tap
      const watch = await page.evaluate(async () => {
        const tile = document.querySelector('[data-testid="specimen-tile-loved"]') as HTMLButtonElement;
        tile.click();
        await new Promise((r) => requestAnimationFrame(r)); // React commits the tap in a microtask
        const strokes = [...tile.querySelectorAll("svg > g:not([stroke='currentColor']) > path")];
        const timings = strokes.map((p) => {
          const animations = p.getAnimations();
          const t = animations[0]?.effect?.getTiming();
          return { animations: animations.length, delay: t?.delay, duration: t?.duration, fill: t?.fill, dashed: p.getAttribute("pathLength") === "1" && p.getAttribute("stroke-dasharray") === "1" };
        });
        const frames: (number | null)[][] = [];
        const t0 = performance.now();
        while (performance.now() - t0 < 900) {
          frames.push(strokes.map((p) => {
            const a = p.getAnimations()[0];
            return a ? (a.effect?.getComputedTiming().progress ?? null) : null;
          }));
          await new Promise((r) => requestAnimationFrame(r));
        }
        return { count: strokes.length, timings, frames };
      });

      // One <path> per stroke, each with its own draw, dashed for it
      expect(watch.count).toBe(SHADE.loved.length);
      expect(watch.timings.every((t) => t.animations === 1 && t.fill === "backwards" && t.dashed), JSON.stringify(watch.timings)).toBe(true);
      expect(watch.timings.map(({ delay, duration }) => ({ delay, duration }))).toEqual(pencilStrokes(SHADE.loved.length, "tile"));
      expect(Math.max(...watch.timings.map((t) => (t.delay ?? 0) + (t.duration ?? 0)))).toBeLessThanOrEqual(PRESS.holdMs - PENCIL.tile.beforeHold);

      // Drawn in turn: a stroke mid-flight while a later one still waits, and
      // one landed while a later one is still drawing — never all at once
      const mid = (p: number | null) => p !== null && p > 0 && p < 1;
      expect(watch.frames.some((f) => f.some(mid) && f.some((p, i) => p === 0 && i > f.findIndex(mid))), "a stroke drawing while a later one waits").toBe(true);
      expect(watch.frames.some((f) => f[0] === null && f.some((p) => p !== null)), "the surface landed while the hatching draws").toBe(true);
      expect(new Set(watch.frames.flatMap((f) => f.map((p, i) => (mid(p) ? i : -1)).filter((i) => i >= 0))).size).toBeGreaterThan(1);

      // Ends on the settled markup, nothing left behind
      await settle(page, '[data-testid="specimen-tile-loved"]');
      expect(await tileGlass(page, "loved")).toBe(await parsed(page, renderMark("glass-loved", { size: 30 })));
      expect(await leftBehind(page, '[data-testid="specimen-tile-loved"]')).toEqual({ dashed: 0, running: 0, transform: "", clipped: 0 });
    });

    test("Not for me draws nothing: on its tile the glass turns over, and rests turned down", async ({ page }) => {
      await open(page);
      await page.getByTestId("specimen-keep").click();
      const flip = await page.evaluate(async () => {
        const tile = document.querySelector('[data-testid="specimen-tile-not_for_me"]') as HTMLButtonElement;
        tile.click();
        await new Promise((r) => requestAnimationFrame(r));
        const svg = tile.querySelector("svg") as SVGSVGElement;
        return {
          own: svg.getAnimations().map((a) => ({
            keyframes: (a.effect as KeyframeEffect).getKeyframes().map((k) => k.transform),
            duration: a.effect?.getTiming().duration,
          })),
          strokes: svg.querySelectorAll("path[pathLength]").length,
        };
      });
      expect(flip.strokes).toBe(0);
      expect(flip.own).toHaveLength(1);
      expect(flip.own[0].duration).toBe(PENCIL.flipMs);
      expect(flip.own[0].keyframes[0]).toMatch(/^rotate\(-180deg\)$/);
      expect(flip.own[0].keyframes[1]).toBe("none");
      await settle(page, '[data-testid="specimen-tile-not_for_me"]');
      expect(await tileGlass(page, "not_for_me")).toBe(await parsed(page, renderMark("glass-down", { size: 30 })));
      expect(await leftBehind(page, '[data-testid="specimen-tile-not_for_me"]')).toEqual({ dashed: 0, running: 0, transform: "", clipped: 0 });
    });

    test("the done line pencils its glass in at the table's pace, after the hold, and ends on Mark's markup", async ({ page }) => {
      await open(page);
      // Tap, then read the line's strokes on the frame it arrives — its surface lands 360ms later
      const timings = await page.evaluate(async () => {
        (document.querySelector('[data-testid="specimen-tile-liked"]') as HTMLButtonElement).click();
        const t0 = performance.now();
        let line: Element | null = null;
        while (!(line = document.querySelector('[data-testid="specimen-done"]')) && performance.now() - t0 < 3000) {
          await new Promise((r) => requestAnimationFrame(r));
        }
        if (!line) return null;
        // Mounted, so React ran its effects twice: the first draw's late
        // cancellation must not have taken the second draw's dash
        return [...line.querySelectorAll("svg > g:not([stroke='currentColor']) > path")].map((p) => {
          const t = p.getAnimations()[0]?.effect?.getTiming();
          const dashed = p.getAttribute("pathLength") === "1" && p.getAttribute("stroke-dasharray") === "1";
          return t ? { delay: t.delay, duration: t.duration, dashed } : null;
        });
      });
      expect(timings).toEqual(pencilStrokes(SHADE.liked.length, "line").map((t) => ({ ...t, dashed: true })));
      const done = page.getByTestId("specimen-done");
      await settle(page, '[data-testid="specimen-done"]');
      expect(await done.locator("svg").evaluate((el) => el.outerHTML)).toBe(await parsed(page, renderMark("glass-liked", { size: 22 })));
      expect(await leftBehind(page, '[data-testid="specimen-done"]')).toEqual({ dashed: 0, running: 0, transform: "", clipped: 0 });
    });

    test("a gesture is wiped in from the left, once, while its name stays whole — and leaves nothing behind", async ({ page }) => {
      await open(page);
      await expect(page.locator(`${GESTURES_SECTION} [data-gesture]`)).toHaveCount(GESTURE_COUNT);
      expect(await page.locator(GESTURES_SECTION).evaluate((el) => el.getAnimations({ subtree: true }).length), "settled until pencilled").toBe(0);
      const wipes = await page.evaluate(async () => {
        (document.querySelector('[data-testid="specimen-pencil-again"]') as HTMLButtonElement).click();
        await new Promise((r) => requestAnimationFrame(r)); // the gestures remount, pencilled
        return [...document.querySelectorAll('[data-testid="specimen-gestures"] [data-gesture]')].map((wrap) => ({
          text: wrap.textContent,
          kind: wrap.getAttribute("data-gesture"),
          // one stroke per <svg>, top line first
          strokes: [...wrap.querySelectorAll("svg")].map((svg) => svg.getAnimations().map((a) => ({
            clip: (a.effect as KeyframeEffect).getKeyframes().map((k) => k.clipPath),
            delay: a.effect?.getTiming().delay,
            duration: a.effect?.getTiming().duration,
            fill: a.effect?.getTiming().fill,
          }))),
        }));
      });
      expect(wipes).toHaveLength(GESTURE_COUNT);
      const strokeCounts = new Set<number>();
      for (const w of wipes) {
        if (w.kind === "circle") expect(w.strokes, `${w.text}: a circle is one stroke`).toHaveLength(1);
        strokeCounts.add(w.strokes.length);
        // One wipe per stroke. A single stroke takes gestureMs; a wrapped
        // name's are drawn top line first, 520ms each, 260ms apart (§14.1)
        const plan = gestureWipes(w.strokes.length);
        w.strokes.forEach((own, i) => {
          expect(own, `${w.text}, stroke ${i}`).toHaveLength(1);
          expect({ delay: own[0].delay, duration: own[0].duration }, `${w.text}, stroke ${i}`).toEqual(plan[i]);
          expect(own[0].fill).toBe("backwards"); // hidden until its turn, nothing left after
          expect(own[0].clip[0]).toMatch(/^inset\(-200% 100% -200% 0(px)?\)$/); // from the left
          expect(own[0].clip[1]).toMatch(/^inset\(-200% -5%( -200% -5%)?\)$/); // Chromium serializes it short
        });
        expect([
          "Kanonkop Pinotage 2020", "Meerlust Rubicon 2019", "Constantia Glen Five", "Domaine Huet Le Haut-Lieu Vouvray Sec 2021",
          "Kanonkop Paul Sauer", "Château de Beaucastel Châteauneuf-du-Pape Rouge 2019",
          "Hamilton Russell Vineyards Chardonnay, Hemel-en-Aarde Valley 2022",
        ]).toContain(w.text);
      }
      expect(strokeCounts.has(1) && Math.max(...strokeCounts) >= 3, `one-line and three-line names were both pencilled: ${[...strokeCounts]}`).toBe(true);
      await settle(page, "main");
      expect(await leftBehind(page, "main")).toEqual({ dashed: 0, running: 0, transform: "", clipped: 0 });
    });
  });

  /** A gestured name under a test id: its lines (its text only) and every
   *  pencil stroke over it, top to bottom. */
  const measure = (page: Page, testId: string) => page.getByTestId(testId).evaluate((p) => {
    const wrap = p.querySelector("[data-gesture]") as HTMLElement;
    const text = wrap.firstChild as Text;
    const range = document.createRange();
    range.selectNodeContents(text);
    const lines: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const r of [...range.getClientRects()].filter((x) => x.width >= 1)) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - r.top) < r.height / 2) {
        last.left = Math.min(last.left, r.left); last.right = Math.max(last.right, r.right);
      } else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    const strokes = [...wrap.querySelectorAll("svg")].map((svg) => {
      const box = svg.getBoundingClientRect();
      return {
        left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        d: svg.querySelector("path")?.getAttribute("d") ?? null,
        paths: svg.querySelectorAll("path").length,
        viewBox: svg.getAttribute("viewBox"),
        line: svg.getAttribute("data-line"),
        decorative: svg.getAttribute("aria-hidden") === "true" && getComputedStyle(svg).pointerEvents === "none",
        nonScaling: svg.querySelector("path")?.getAttribute("vector-effect") === "non-scaling-stroke",
        stretched: svg.getAttribute("preserveAspectRatio") === "none",
      };
    });
    return { lines, strokes, firstChildIsText: text.nodeType === Node.TEXT_NODE, text: wrap.textContent, kind: wrap.getAttribute("data-gesture") };
  });
  type Measured = Awaited<ReturnType<typeof measure>>;
  const near = (actual: number, expected: number, what: string) => expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(1);
  /** The reference's placement — the circle round the whole name; an
   *  underline or strike on each line, spanning that line, in its own drawing. */
  const check = (what: string, m: Measured) => {
    const kind = m.kind as "circle" | "underline" | "strike";
    for (const s of m.strokes) expect(s, what).toMatchObject({ decorative: true, nonScaling: true, stretched: true, paths: 1, viewBox: GESTURES[kind].viewBox });
    if (kind === "circle") {
      const fit = GESTURE_FIT.circle;
      expect(m.strokes, `${what}: ONE circle, however many lines`).toHaveLength(1);
      expect(m.strokes[0].d, `${what}: the one approved drawing`).toBe(GESTURES.circle.d);
      near(m.strokes[0].left, Math.min(...m.lines.map((l) => l.left)) - fit.reach, `${what} left`);
      near(m.strokes[0].right, Math.max(...m.lines.map((l) => l.right)) + fit.reach, `${what} right`);
      near(m.strokes[0].top, m.lines[0].top - fit.rise, `${what} top`);
      near(m.strokes[0].bottom, m.lines[m.lines.length - 1].bottom + fit.rise, `${what} bottom`);
      return;
    }
    const fit = GESTURE_FIT[kind];
    expect(m.strokes, `${what}: as many strokes as lines`).toHaveLength(m.lines.length);
    m.strokes.forEach((s, i) => {
      const line = m.lines[i];
      expect(s.line, `${what}: stroke ${i} is line ${i}'s`).toBe(String(i));
      near(s.left, line.left - fit.reach, `${what} stroke ${i} left`);
      near(s.right, line.right + fit.reach, `${what} stroke ${i} right`);
      near(s.bottom - s.top, fit.height, `${what} stroke ${i} height`);
      if (kind === "underline") near(s.bottom, line.bottom + GESTURE_FIT.underline.drop, `${what} stroke ${i}: 5px under its line`);
      else near(s.top, (line.top + line.bottom) / 2, `${what} stroke ${i}: from its line's middle`);
      expect(s.d, `${what}: line ${i} takes drawing ${i % 3}`).toBe(gestureDrawing(kind, i));
      if (i) expect(s.d, `${what}: lines ${i - 1} and ${i} don't share a drawing`).not.toBe(m.strokes[i - 1].d);
    });
  };

  test("a gesture leaves its name alone and sits on it — an underline or a strike on EVERY line of a wrapped name, each spanning its own line", async ({ page }) => {
    await open(page);
    for (const kind of ["circle", "underline", "strike"]) {
      const one = await measure(page, `specimen-gesture-${kind}`);
      expect(one.lines, `${kind}: the name is on one line`).toHaveLength(1);
      expect(one.firstChildIsText).toBe(true);
      expect(one.strokes, `${kind}: one line, one stroke`).toHaveLength(1);
      expect(one.strokes[0].d, `${kind}: a one-line name draws what it always drew`).toBe(GESTURES[kind as keyof typeof GESTURES].d);
      check(kind, one);

      const wrapped = await measure(page, `specimen-wrapped-${kind}`);
      expect(wrapped.lines.length, `${kind}: the long name wraps (the premise)`).toBeGreaterThan(1);
      expect(wrapped.text).toBe("Domaine Huet Le Haut-Lieu Vouvray Sec 2021");
      expect(wrapped.firstChildIsText).toBe(true);
      check(`wrapped ${kind}`, wrapped);
    }
    // Three lines and more: every line marked, the drawings coming round again
    const lineCounts: number[] = [];
    for (const id of ["specimen-lined-0", "specimen-lined-1", "specimen-lined-2"]) {
      const m = await measure(page, id);
      lineCounts.push(m.lines.length);
      check(id, m);
    }
    expect(Math.min(...lineCounts), `each runs to three lines or more: ${lineCounts}`).toBeGreaterThanOrEqual(3);
    expect(Math.max(...lineCounts), `one runs to four, so drawing 0 comes round again: ${lineCounts}`).toBeGreaterThanOrEqual(4);

    // The name re-wraps when its block changes width: the pencil follows it,
    // one stroke per line at every width
    const block = page.getByTestId("specimen-wrapped-underline");
    await block.evaluate((p) => { (p as HTMLElement).style.width = "520px"; });
    await expect.poll(async () => (await measure(page, "specimen-wrapped-underline")).lines.length).toBe(1);
    await expect.poll(async () => (await measure(page, "specimen-wrapped-underline")).strokes.length).toBe(1);
    check("widened", await measure(page, "specimen-wrapped-underline"));
    await block.evaluate((p) => { (p as HTMLElement).style.width = "110px"; });
    await expect.poll(async () => (await measure(page, "specimen-wrapped-underline")).lines.length).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => { const m = await measure(page, "specimen-wrapped-underline"); return m.strokes.length === m.lines.length; }).toBe(true);
    check("narrowed", await measure(page, "specimen-wrapped-underline"));
  });

  test("the circle is the one stretched drawing, always: round a name on one line, two, three or four", async ({ page }) => {
    await open(page);
    const lineCounts = new Set<number>();
    for (const id of ["specimen-gesture-circle", "specimen-wrapped-circle", "specimen-loop-0", "specimen-loop-1", "specimen-loop-2", "specimen-loop-3"]) {
      const m = await measure(page, id);
      lineCounts.add(m.lines.length);
      check(id, m); // one <svg>, GESTURES.circle, stretched over the whole name plus its reach and rise
    }
    expect(lineCounts.has(1) && Math.max(...lineCounts) >= 4, `one line through four were circled: ${[...lineCounts]}`).toBe(true);
    // Nothing builds a loop for a wrapped name any more
    await expect(page.locator("[data-loop]")).toHaveCount(0);

    // Re-measured: still the one drawing, stretched over the new box
    const block = page.getByTestId("specimen-loop-0");
    const before = await measure(page, "specimen-loop-0");
    await block.evaluate((p) => { (p as HTMLElement).style.width = "70px"; });
    await expect.poll(async () => (await measure(page, "specimen-loop-0")).lines.length).toBeGreaterThan(before.lines.length);
    await expect.poll(async () => { const m = await measure(page, "specimen-loop-0"); return Math.abs(m.strokes[0].bottom - (m.lines[m.lines.length - 1].bottom + GESTURE_FIT.circle.rise)) <= 1; }).toBe(true);
    const after = await measure(page, "specimen-loop-0");
    check("narrowed", after);
    expect(after.strokes[0].bottom - after.strokes[0].top, "a taller circle for a taller name").toBeGreaterThan(before.strokes[0].bottom - before.strokes[0].top);
    expect(after.text).toBe("Kanonkop Paul Sauer");
  });

  // Log's saved step when something joins the DNA and the title holds — the
  // one saved-step path no test account reaches on demand (a real promotion
  // shifts the strand: identity-shift.spec.ts). Sample content, the real
  // SavedStep and houseCopy's savedCopy.
  test("the saved step's news: a plain eyebrow, the headline whole, its news underlined in pencil, the lines a proofreader's plus and minus", async ({ page }) => {
    await open(page);
    const moment = page.getByTestId("specimen-moment");
    const saved = moment.getByTestId("log-saved");
    // Reduced motion (the suite's default): settled in the commit it arrives
    await expect(saved.getByTestId("saved-eyebrow")).toHaveText("Your DNA just grew");
    await expect(saved.getByTestId("saved-eyebrow").locator("svg")).toHaveCount(0); // a moment's eyebrow is type
    const h1 = saved.locator("h1");
    await expect(h1).toHaveText("Meerlust just joined your DNA");
    const news = h1.locator('[data-gesture="underline"]');
    await expect(news).toHaveText("Meerlust");
    expect(await news.locator("svg path").getAttribute("d")).toBe(GESTURES.underline.d);
    expect(await h1.evaluate((el) => el.getAnimations({ subtree: true }).length), "nothing wipes under reduced motion").toBe(0);
    // The recap's bottle wears its glass; what else moved is pencilled
    await expect(saved.locator('svg[data-mark="glass-loved"]')).toHaveCount(1);
    const lines = await saved.locator("p").filter({ has: page.locator('svg[data-mark="plus"], svg[data-mark="minus"]') })
      .evaluateAll((ps) => ps.map((p) => [p.querySelector("svg")?.getAttribute("data-mark"), p.textContent]));
    expect(lines).toEqual([["plus", "Stellenbosch joined your DNA"], ["minus", "Merlot left your DNA"]]);
  });

  test.describe("the saved step's news, with motion on", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("the headline is written whole, THEN the pencil underlines the news — once, and nothing is left behind", async ({ page }) => {
      await page.addInitScript(() => {
        const seen = { texts: [] as string[], wordSpans: 0, underlinedWhileWriting: false, wipes: 0 };
        (window as unknown as { __news: typeof seen }).__news = seen;
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          if (/inset\(-200%/.test(JSON.stringify(keyframes)) && this.closest?.('[data-testid="specimen-moment"] h1')) seen.wipes += 1;
          return animate.call(this, keyframes, options);
        };
        const read = () => {
          const h1 = document.querySelector('[data-testid="specimen-moment"] h1');
          if (!h1) return;
          const text = h1.textContent || "";
          if (!seen.texts.includes(text)) seen.texts.push(text);
          const spans = h1.querySelectorAll("[data-word]").length;
          seen.wordSpans = Math.max(seen.wordSpans, spans);
          if (spans && h1.querySelector("[data-gesture]")) seen.underlinedWhileWriting = true;
        };
        new MutationObserver(read).observe(document, { childList: true, subtree: true, characterData: true, attributes: true });
      });
      await open(page);
      const h1 = page.getByTestId("specimen-moment").locator("h1");
      const news = h1.locator('[data-gesture="underline"]');
      await expect(news).toHaveText("Meerlust", { timeout: 15_000 });
      await settle(page, '[data-testid="specimen-moment"]');
      const seen = await page.evaluate(() => (window as unknown as { __news: { texts: string[]; wordSpans: number; underlinedWhileWriting: boolean; wipes: number } }).__news);
      expect(seen.texts, "the headline's text is whole at every moment").toEqual(["Meerlust just joined your DNA"]);
      expect(seen.wordSpans, "it was written word by word").toBeGreaterThanOrEqual(5);
      expect(seen.underlinedWhileWriting, "the pencil waits for the last word").toBe(false);
      // React's dev double-effect starts the wipe, cancels it and starts it again: one underline, drawn
      expect(seen.wipes).toBeGreaterThanOrEqual(1);
      expect(await h1.locator("svg").count()).toBe(1);
      await expect(h1).toHaveText("Meerlust just joined your DNA");
      expect(await leftBehind(page, '[data-testid="specimen-moment"] h1')).toEqual({ dashed: 0, running: 0, transform: "", clipped: 0 });
    });
  });
});
