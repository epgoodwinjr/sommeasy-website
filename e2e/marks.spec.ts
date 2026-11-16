import { test, expect, type Page } from "@playwright/test";
import { GESTURES, MARK_IDS, RATING_MARKS, SHADE, loopPath, renderMark } from "../src/components/house/marks.js";
import { PENCIL, PRESS, pencilStrokes } from "../src/components/house/motion.js";
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
 *   4. A gesture over a name leaves the name alone, sits where the reference
 *      puts it, goes on the LAST line of a wrapped name (the circle round
 *      all of it), and follows the name when it re-wraps.
 *   5. The circle round a WRAPPED name is the loop (README §13.1): made for
 *      its own box, every corner of the first and last lines inside it; a
 *      one-line name still draws the approved circle, stretched; and the
 *      loop is re-made when the name is re-measured.
 */

const GESTURE_COUNT = 10; // three on one line, three wrapped, four looped

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
    await expect(page.locator("[data-gesture]")).toHaveCount(GESTURE_COUNT);

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
      await expect(page.locator("[data-gesture] svg")).toHaveCount(GESTURE_COUNT);
      expect(await page.locator("main").evaluate((el) => el.getAnimations({ subtree: true }).length), "settled until pencilled").toBe(0);
      const wipes = await page.evaluate(async () => {
        (document.querySelector('[data-testid="specimen-pencil-again"]') as HTMLButtonElement).click();
        await new Promise((r) => requestAnimationFrame(r)); // the gestures remount, pencilled
        return [...document.querySelectorAll("[data-gesture]")].map((wrap) => {
          const svg = wrap.querySelector("svg") as SVGSVGElement;
          return {
            text: wrap.textContent,
            wipes: svg.getAnimations().map((a) => ({
              clip: (a.effect as KeyframeEffect).getKeyframes().map((k) => k.clipPath),
              duration: a.effect?.getTiming().duration,
            })),
          };
        });
      });
      expect(wipes).toHaveLength(GESTURE_COUNT);
      for (const w of wipes) {
        expect(w.wipes).toHaveLength(1);
        expect(w.wipes[0].duration).toBe(PENCIL.gestureMs);
        expect(w.wipes[0].clip[0]).toMatch(/^inset\(-200% 100% -200% 0(px)?\)$/); // from the left
        expect(w.wipes[0].clip[1]).toMatch(/^inset\(-200% -5%( -200% -5%)?\)$/); // Chromium serializes it short
        expect([
          "Kanonkop Pinotage 2020", "Meerlust Rubicon 2019", "Constantia Glen Five", "Domaine Huet Le Haut-Lieu Vouvray Sec 2021",
          "Kanonkop Paul Sauer", "Château de Beaucastel Châteauneuf-du-Pape Rouge 2019",
          "Hamilton Russell Vineyards Chardonnay, Hemel-en-Aarde Valley 2022",
        ]).toContain(w.text);
      }
      await settle(page, "main");
      expect(await leftBehind(page, "main")).toEqual({ dashed: 0, running: 0, transform: "", clipped: 0 });
    });
  });

  test("a gesture leaves its name alone and sits on it: the reference's placement, the LAST line of a wrapped name", async ({ page }) => {
    await open(page);

    /** The name's lines (its text only), the pencil's box, and how it is wrapped. */
    const measure = (testId: string) => page.getByTestId(testId).evaluate((p) => {
      const wrap = p.querySelector("[data-gesture]") as HTMLElement;
      const text = wrap.firstChild as Text;
      const range = document.createRange();
      range.selectNodeContents(text);
      const rects = [...range.getClientRects()].filter((r) => r.width >= 1);
      const lines: { left: number; right: number; top: number; bottom: number }[] = [];
      for (const r of rects) {
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.top - r.top) < r.height / 2) {
          last.left = Math.min(last.left, r.left); last.right = Math.max(last.right, r.right);
        } else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      const svg = wrap.querySelector("svg") as SVGSVGElement;
      const box = svg.getBoundingClientRect();
      return {
        lines,
        box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
        firstChildIsText: text.nodeType === Node.TEXT_NODE,
        text: wrap.textContent,
        decorative: svg.getAttribute("aria-hidden") === "true" && getComputedStyle(svg).pointerEvents === "none",
        nonScaling: svg.querySelector("path")?.getAttribute("vector-effect") === "non-scaling-stroke",
        stretched: svg.getAttribute("preserveAspectRatio") === "none",
      };
    });
    const near = (actual: number, expected: number, what: string) => expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(1);
    const check = (kind: string, m: Awaited<ReturnType<typeof measure>>) => {
      const last = m.lines[m.lines.length - 1];
      if (kind === "circle") {
        near(m.box.left, Math.min(...m.lines.map((l) => l.left)) - 12, "circle left");
        near(m.box.right, Math.max(...m.lines.map((l) => l.right)) + 12, "circle right");
        near(m.box.top, m.lines[0].top - 7, "circle top");
        near(m.box.bottom, last.bottom + 7, "circle bottom");
      } else {
        near(m.box.left, last.left - (kind === "underline" ? 2 : 3), `${kind} left`);
        near(m.box.right, last.right + (kind === "underline" ? 2 : 3), `${kind} right`);
        near(m.box.bottom - m.box.top, 7, `${kind} height`);
        if (kind === "underline") near(m.box.bottom, last.bottom + 5, "underline: 5px under the last line");
        else near(m.box.top, (last.top + last.bottom) / 2, "strike: from the last line's middle");
      }
    };

    for (const kind of ["circle", "underline", "strike"]) {
      const one = await measure(`specimen-gesture-${kind}`);
      expect(one.lines, `${kind}: the name is on one line`).toHaveLength(1);
      expect(one).toMatchObject({ firstChildIsText: true, decorative: true, nonScaling: true, stretched: true });
      check(kind, one);

      const wrapped = await measure(`specimen-wrapped-${kind}`);
      expect(wrapped.lines.length, `${kind}: the long name wraps (the premise)`).toBeGreaterThan(1);
      expect(wrapped.text).toBe("Domaine Huet Le Haut-Lieu Vouvray Sec 2021");
      expect(wrapped).toMatchObject({ firstChildIsText: true, decorative: true });
      check(kind, wrapped);
    }

    // The name re-wraps when its block widens: the pencil follows it
    await page.getByTestId("specimen-wrapped-underline").evaluate((p) => { (p as HTMLElement).style.width = "520px"; });
    await expect.poll(async () => (await measure("specimen-wrapped-underline")).lines.length).toBe(1);
    await expect.poll(async () => {
      const m = await measure("specimen-wrapped-underline");
      return Math.abs(m.box.right - (m.lines[0].right + 2)) <= 1 && Math.abs(m.box.bottom - (m.lines[0].bottom + 5)) <= 1;
    }).toBe(true);
  });
  test("the circle round a wrapped name is the loop: every corner of its first and last lines inside it; one line keeps the approved circle", async ({ page }) => {
    await open(page);

    /** The circled name under a test id: its lines, its pencil, and whether
     *  the corners of its first and last lines lie inside the drawn path. */
    const read = (testId: string) => page.getByTestId(testId).evaluate((p) => {
      const wrap = p.querySelector("[data-gesture]") as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(wrap.firstChild as Text);
      const lines: { left: number; right: number; top: number; bottom: number }[] = [];
      for (const r of [...range.getClientRects()].filter((x) => x.width >= 1)) {
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.top - r.top) < r.height / 2) {
          last.left = Math.min(last.left, r.left); last.right = Math.max(last.right, r.right);
        } else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      const svg = wrap.querySelector("svg") as SVGSVGElement;
      const path = svg.querySelector("path") as SVGPathElement;
      const box = svg.getBoundingClientRect();
      // A filled copy of the path, in the same <svg>: is each corner inside it?
      const filled = path.cloneNode() as SVGPathElement;
      filled.setAttribute("fill", "#000");
      filled.removeAttribute("vector-effect");
      svg.appendChild(filled);
      const view = svg.viewBox.baseVal;
      const inside = (x: number, y: number) => filled.isPointInFill(new DOMPoint(
        view.x + ((x - box.left) / box.width) * view.width, view.y + ((y - box.top) / box.height) * view.height,
      ));
      const corners = (l: { left: number; right: number; top: number; bottom: number }) =>
        [inside(l.left, l.top), inside(l.right, l.top), inside(l.left, l.bottom), inside(l.right, l.bottom)];
      const result = {
        lines: lines.length,
        first: corners(lines[0]),
        last: corners(lines[lines.length - 1]),
        d: path.getAttribute("d"),
        viewBox: svg.getAttribute("viewBox"),
        aspect: svg.getAttribute("preserveAspectRatio"),
        loop: svg.hasAttribute("data-loop"),
        width: box.width, height: box.height,
        text: wrap.textContent,
        svgs: wrap.querySelectorAll("svg").length,
      };
      filled.remove();
      return result;
    });
    const all = [true, true, true, true];

    // Every wrapped, circled name on the page: two, three and four lines
    const wrapped = ["specimen-wrapped-circle", "specimen-loop-0", "specimen-loop-1", "specimen-loop-2", "specimen-loop-3"];
    const lineCounts = new Set<number>();
    for (const id of wrapped) {
      const m = await read(id);
      expect(m.lines, `${id} wraps (the premise)`).toBeGreaterThan(1);
      lineCounts.add(m.lines);
      expect(m.svgs, `${id}: one pencil`).toBe(1);
      expect(m.loop, `${id} draws the loop`).toBe(true);
      expect(m.aspect, `${id}: the loop is not stretched`).toBeNull();
      // Made for its own box, in px: the viewBox IS the box, the path is loopPath's
      const [, , w, h] = (m.viewBox || "").split(" ").map(Number);
      expect(Math.abs(w - m.width), `${id}: viewBox width ${w} vs box ${m.width}`).toBeLessThan(0.01);
      expect(Math.abs(h - m.height), `${id}: viewBox height ${h} vs box ${m.height}`).toBeLessThan(0.01);
      expect(m.viewBox?.startsWith("0 0 "), id).toBe(true);
      expect(m.d, `${id}: the path is loopPath(${w}, ${h})`).toBe(loopPath(w, h));
      expect(m.first, `${id}: the first line's corners are inside the loop`).toEqual(all);
      expect(m.last, `${id}: the last line's corners are inside the loop`).toEqual(all);
    }
    expect(lineCounts.size, "names of different heights were checked").toBeGreaterThan(1);
    expect(Math.max(...lineCounts), "one of them runs to three lines or more").toBeGreaterThanOrEqual(3);

    // A name on one line: the approved circle, stretched, exactly as built
    const one = await read("specimen-gesture-circle");
    expect(one.lines).toBe(1);
    expect(one).toMatchObject({ loop: false, aspect: "none", viewBox: GESTURES.circle.viewBox, d: GESTURES.circle.d, svgs: 1 });

    // Re-measured, re-made: widen the block until the name sits on one line
    // and it is the approved circle again; narrow it and the loop is made
    // anew for the new box
    const block = page.getByTestId("specimen-loop-0");
    const before = await read("specimen-loop-0");
    await block.evaluate((p) => { (p as HTMLElement).style.width = "420px"; });
    await expect.poll(async () => (await read("specimen-loop-0")).lines).toBe(1);
    await expect.poll(async () => (await read("specimen-loop-0")).d).toBe(GESTURES.circle.d);
    expect(await read("specimen-loop-0")).toMatchObject({ loop: false, aspect: "none", viewBox: GESTURES.circle.viewBox });
    await block.evaluate((p) => { (p as HTMLElement).style.width = "70px"; });
    await expect.poll(async () => (await read("specimen-loop-0")).loop).toBe(true);
    await expect.poll(async () => {
      const m = await read("specimen-loop-0");
      const [, , w, h] = (m.viewBox || "").split(" ").map(Number);
      return m.d === loopPath(w, h) && Math.abs(h - m.height) < 0.01 && m.first.every(Boolean) && m.last.every(Boolean);
    }).toBe(true);
    const after = await read("specimen-loop-0");
    expect(after.lines, "narrower: more lines").toBeGreaterThan(before.lines);
    expect(after.d, "a new loop for the new box").not.toBe(before.d);
    expect(after.text).toBe("Kanonkop Paul Sauer");
  });
});
