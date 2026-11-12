import { test, expect, type Page } from "@playwright/test";
import { composeIdentity } from "../src/lib/identityEngine.js";
import { renderPalateMark } from "../src/lib/palateMark.js";

/**
 * Motion (docs/motion/README.md §10) — the ONE spec that runs with motion on.
 *
 * Every other spec runs under reduced motion (playwright.config.ts —
 * `contextOptions.reducedMotion`; a top-level `use.reducedMotion` is silently
 * ignored by Playwright, which the last describe here would catch) and meets
 * settled states. This one turns motion back on and asserts
 * OUTCOMES, never timings: where an animation ends, what it leaves behind,
 * and that nothing waits on it.
 *
 * Session 1 drives the foundations on /motion-specimen (sample content, not
 * linked from anywhere, deleted with the last session):
 *
 *   1. A written line ends as ONE plain text node whose textContent is its
 *      source string — and it was genuinely written word by word.
 *   2. An entrance leaves nothing behind: no running animation, no
 *      transform, the element's own opacity.
 *   3. A control is live while it is still entering.
 *   4. The reveal ends with a palate-mark whose markup equals the static
 *      render for the same genome; so does a growth, and a growth that was
 *      asked for mid-growth.
 *   5. Breathing is a loop on the wrapper, only while asked for.
 *   6. Under reduced motion: nothing is written word by word, the mark is
 *      settled at once, nothing loops.
 *
 * Session 2 adds the front door, signed out, on the real pages:
 *
 *   7. Welcome's headline is written word by word and ends as one text
 *      node; the demo does not start while it is off-screen, starts once
 *      scrolled to, and writes its picks in.
 *   8. The quiz's header bloom is the bare medallion until the first
 *      answer, then opens — and every change ends on exactly the static
 *      mark for the genome the answers so far compose.
 *   9. Under reduced motion the demo shows its picks and its last line,
 *      and nothing in it is running.
 *
 * Session 3 adds the real reveal.
 *
 * Do NOT make these timing-tolerant by sleeping: poll for the outcome.
 * Read-only: /motion-specimen touches no account data.
 */

const HEADLINE = "Never guess at a wine list again.";
const NOTE =
  "Old-vine Chenin with real grip — the one to pour with the line fish. It has the waxy weight you keep coming back to, and enough salt on the finish to stand up to the lemon.";

/** Counts what motion did, from before the first script runs. */
async function watchMotion(page: Page) {
  await page.addInitScript(() => {
    const seen = { wordSpans: 0 };
    (window as any).__motion = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches("[data-word]")) seen.wordSpans += 1;
          seen.wordSpans += node.querySelectorAll("[data-word]").length;
        });
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

const motionSeen = (page: Page) =>
  page.evaluate(() => (window as any).__motion as { wordSpans: number });

/** The markup inside a palate mark, and the wrapper's own attributes (its
 *  style as the browser reads it — the attribute's spacing differs between
 *  server HTML and a style React has since touched). */
const markOf = (page: Page, holder: string) =>
  page.getByTestId(holder).getByTestId("palate-mark").evaluate((el) => ({
    html: el.innerHTML,
    attrs: Array.from(el.attributes)
      .map((a) => `${a.name}=${a.name === "style" ? (el as HTMLElement).style.cssText : a.value}`)
      .sort(),
  }));

/** What a line of prose is made of right now. */
const lineOf = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => ({
    text: el.textContent,
    wordSpans: el.querySelectorAll("[data-word]").length,
    children: el.childNodes.length,
    onlyText: el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE,
  }));

/** Animations still in play, ignoring loops that were asked for. */
const finiteAnimations = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
  );

test.describe("Motion on — outcomes, never timings", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test.beforeEach(async ({ page }) => {
    await watchMotion(page);
  });

  test("a written line is its source text throughout, and ends as one plain text node", async ({ page }) => {
    await page.goto("/motion-specimen");

    // It is written word by word (the spans exist at some point)…
    await expect.poll(async () => (await motionSeen(page)).wordSpans, { timeout: 15_000 }).toBeGreaterThan(0);
    // …and its textContent is the source string even mid-write
    expect((await lineOf(page, "specimen-headline")).text).toBe(HEADLINE);
    expect((await lineOf(page, "specimen-note")).text).toBe(NOTE);

    // Settled: no word spans, one text node, the same text — what a plain
    // <h1>{text}</h1> gives a screen reader
    for (const [testId, source] of [["specimen-headline", HEADLINE], ["specimen-note", NOTE]] as const) {
      await expect.poll(async () => (await lineOf(page, testId)).onlyText, { timeout: 20_000 }).toBe(true);
      const line = await lineOf(page, testId);
      expect(line.wordSpans).toBe(0);
      expect(line.children).toBe(1);
      expect(line.text).toBe(source);
    }
    // Both lines were split: at least a span per word of the headline
    expect((await motionSeen(page)).wordSpans).toBeGreaterThanOrEqual(HEADLINE.split(" ").length + NOTE.split(" ").length);
  });

  test("an entrance leaves nothing behind", async ({ page }) => {
    await page.goto("/motion-specimen");
    // The last thing on the page to enter is the note's last word
    await expect.poll(async () => (await lineOf(page, "specimen-note")).onlyText, { timeout: 20_000 }).toBe(true);
    await expect.poll(() => finiteAnimations(page), { timeout: 10_000 }).toBe(0);

    const settled = await page.evaluate(() => {
      const style = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
      const main = document.querySelector("main")!;
      // The page's own elements — not the insides of a palate mark, whose
      // waiting medallion legitimately turns its beads
      const all = Array.from(main.querySelectorAll("*")).filter((el): el is HTMLElement => el instanceof HTMLElement);
      return {
        riseTransform: style("specimen-rise").transform,
        riseOpacity: style("specimen-rise").opacity,
        popTransform: style("specimen-pop").transform,
        fadeOpacity: style("specimen-fade").opacity,
        // Nothing at rest carries a transform, a clip or a zero opacity
        transformed: all.filter((el) => getComputedStyle(el).transform !== "none").length,
        clipped: all.filter((el) => getComputedStyle(el).clipPath !== "none").length,
        invisible: all.filter((el) => getComputedStyle(el).opacity === "0").length,
        // …and no inline style an entrance could have left
        inlineLeft: all.filter((el) => el.style.transform || el.style.clipPath || el.style.opacity === "0").length,
        rows: Array.from(document.querySelectorAll('[data-testid="specimen-rows"] > *'))
          .map((row) => `${getComputedStyle(row).transform}/${getComputedStyle(row).opacity}`),
      };
    });
    expect(settled.riseTransform).toBe("none");
    // The element's own opacity wins — the sub line rests at 0.55, not 1
    expect(settled.riseOpacity).toBe("0.55");
    expect(settled.popTransform).toBe("none");
    expect(settled.fadeOpacity).toBe("1");
    expect(settled.transformed).toBe(0);
    expect(settled.clipped).toBe(0);
    expect(settled.invisible).toBe(0);
    expect(settled.inlineLeft).toBe(0);
    expect(settled.rows).toEqual(["none/1", "none/1", "none/1"]);
  });

  test("a control is live while it is still entering", async ({ page }) => {
    await page.goto("/motion-specimen");
    // Hydrated (the headline has started to write), and the entry — which
    // enters after it — is not all there yet
    await expect.poll(async () => (await motionSeen(page)).wordSpans, { timeout: 15_000 }).toBeGreaterThan(0);
    const entry = page.getByTestId("specimen-entry");
    const labelOpacity = await entry.locator("span").first().evaluate((el) => Number(getComputedStyle(el).opacity));
    await entry.click();
    await expect(page.getByText("Tapped 1×")).toBeVisible();
    // The tap landed mid-entrance, on a button at its full size
    expect(labelOpacity).toBeLessThan(1);
    const box = await entry.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });

  test("the reveal waits as a medallion, then ends on exactly the static mark", async ({ page }) => {
    await page.goto("/motion-specimen");
    const state = page.getByTestId("specimen-reveal-state");
    const still = await markOf(page, "specimen-static");

    // Waiting on the save: a medallion, no bloom — however long it takes
    await expect(state).toHaveText("waiting");
    await expect
      .poll(async () => (await markOf(page, "specimen-reveal")).html.includes("<circle"), { timeout: 10_000 })
      .toBe(true);
    const waiting = await markOf(page, "specimen-reveal");
    expect(waiting.html).not.toContain("<path"); // no petals, no ring
    expect(waiting.html).not.toBe(still.html);
    await expect(state).toHaveText("waiting");

    // The save lands: it draws, and settles
    await page.getByTestId("specimen-save").click();
    await expect(state).toHaveText("settled", { timeout: 20_000 });
    const drawn = await markOf(page, "specimen-reveal");
    expect(drawn.html).toBe(still.html);
    // The same wrapper PalateMark renders: testid, aria-hidden, style
    expect(drawn.attrs).toEqual(still.attrs);
    expect(drawn.html).toContain("<path");
  });

  test("a growth ends on the static mark for the new genome — even one asked for mid-growth", async ({ page }) => {
    await page.goto("/motion-specimen");
    await expect.poll(async () => (await markOf(page, "specimen-grow")).html).toBe((await markOf(page, "specimen-grow-static")).html);

    // One berry more. Count the distinct frames on the way: it grew, it
    // did not jump
    const before = (await markOf(page, "specimen-grow")).html;
    await page.getByTestId("specimen-shape-estate").click();
    const frames = await page.evaluate(async () => {
      const live = document.querySelector('[data-testid="specimen-grow"] [data-testid="palate-mark"]')!;
      const target = document.querySelector('[data-testid="specimen-grow-static"] [data-testid="palate-mark"]')!;
      const seen = new Set<string>();
      const deadline = performance.now() + 15_000;
      while (performance.now() < deadline) {
        seen.add(live.innerHTML);
        if (seen.size > 1 && live.innerHTML === target.innerHTML) break;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return { distinct: seen.size, ended: live.innerHTML === target.innerHTML };
    });
    expect(frames.ended).toBe(true);
    expect(frames.distinct).toBeGreaterThan(5);
    const grown = await markOf(page, "specimen-grow");
    expect(grown.html).not.toBe(before);
    expect(grown.attrs).toEqual((await markOf(page, "specimen-grow-static")).attrs);

    // A new petal, and a change of mind while it is still opening: the
    // second waits its turn, and the mark ends on the LAST shape asked for
    await page.getByTestId("specimen-shape-country").click();
    await page.getByTestId("specimen-shape-region").click();
    await expect
      .poll(async () => (await markOf(page, "specimen-grow")).html === (await markOf(page, "specimen-grow-static")).html, { timeout: 20_000 })
      .toBe(true);

    // A promotion on arrival (growFrom): the old shape first, then grown
    await expect
      .poll(async () => (await markOf(page, "specimen-promotion")).html === (await markOf(page, "specimen-promotion-static")).html, { timeout: 20_000 })
      .toBe(true);
  });

  test("breathing is a loop on the wrapper, and only while asked for", async ({ page }) => {
    await page.goto("/motion-specimen");
    const loops = () =>
      page.getByTestId("specimen-grow").getByTestId("palate-mark").evaluate((el) =>
        el.getAnimations().map((a) => (a as CSSAnimation).animationName),
      );
    await expect(page.getByTestId("specimen-breathe")).toHaveText("Breathe");
    expect(await loops()).toEqual([]);
    await page.getByTestId("specimen-breathe").click();
    await expect.poll(loops).toEqual(["house-breathe"]);
    await page.getByTestId("specimen-breathe").click();
    await expect.poll(loops).toEqual([]);
    // At rest again it is exactly the static mark's wrapper
    expect((await markOf(page, "specimen-grow")).attrs).toEqual((await markOf(page, "specimen-grow-static")).attrs);
  });
});

test.describe("Reduced motion — settled at once", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test.beforeEach(async ({ page }) => {
    await watchMotion(page);
  });

  test("prose appears whole, the mark is already drawn, and nothing loops", async ({ page }) => {
    await page.goto("/motion-specimen");
    await expect(page.getByTestId("specimen-preference")).toContainText("Reduced motion is on", { timeout: 15_000 });

    // The bloom is its settled frame without waiting on anything — the
    // save hasn't landed, and it is still the static mark
    const still = await markOf(page, "specimen-static");
    await expect.poll(async () => (await markOf(page, "specimen-reveal")).html).toBe(still.html);
    await expect(page.getByTestId("specimen-reveal-state")).toHaveText("waiting");
    await page.getByTestId("specimen-save").click();
    await expect(page.getByTestId("specimen-reveal-state")).toHaveText("settled");
    expect((await markOf(page, "specimen-reveal")).html).toBe(still.html);

    // Prose: whole, plain, never split
    for (const [testId, source] of [["specimen-headline", HEADLINE], ["specimen-note", NOTE]] as const) {
      const line = await lineOf(page, testId);
      expect(line.onlyText).toBe(true);
      expect(line.text).toBe(source);
    }

    // Growth: straight to the new shape, with no frames in between
    await page.getByTestId("specimen-shape-country").click();
    const frames = await page.evaluate(async () => {
      const live = document.querySelector('[data-testid="specimen-grow"] [data-testid="palate-mark"]')!;
      const target = document.querySelector('[data-testid="specimen-grow-static"] [data-testid="palate-mark"]')!;
      const seen = new Set<string>();
      for (let i = 0; i < 30; i++) {
        seen.add(live.innerHTML);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return { distinct: seen.size, ended: live.innerHTML === target.innerHTML };
    });
    expect(frames.ended).toBe(true);
    expect(frames.distinct).toBe(1);
    await expect
      .poll(async () => (await markOf(page, "specimen-promotion")).html === (await markOf(page, "specimen-promotion-static")).html)
      .toBe(true);

    // Breathing is asked for and still does not run
    await page.getByTestId("specimen-breathe").click();
    await expect(page.getByTestId("specimen-breathe")).toHaveText("Stop breathing");
    const loops = await page.getByTestId("specimen-grow").getByTestId("palate-mark").evaluate((el) => el.getAnimations().length);
    expect(loops).toBe(0);

    // Every entrance was a short fade: all done, nothing left running
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 10_000 }).toBe(0);
    expect((await motionSeen(page)).wordSpans).toBe(0);

    // A control is, of course, live
    await page.getByTestId("specimen-entry").click();
    await expect(page.getByText("Tapped 1×")).toBeVisible();
  });
});

// ─── The front door (Session 2): Welcome and the quiz, signed out ───

const WELCOME_HEADLINE = "Never guess at a wine list again.";
const ANSWERS = { regions: {}, estates: {}, varietals: [], specificWines: [] };

/** A mark string as the browser serializes it (self-closing tags and all). */
const asBrowser = (page: Page, html: string) =>
  page.evaluate((markup) => {
    const holder = document.createElement("div");
    holder.innerHTML = markup;
    return holder.innerHTML;
  }, html);

const headerMark = (page: Page) => page.locator("header").getByTestId("palate-mark");

/** The Welcome demo's block (the fixed frame the list and the picks play
 *  in), whatever is showing in it, and how far under it the status line
 *  sits. */
const demoFrame = (page: Page) =>
  page.getByTestId("welcome-demo").evaluate((demo) => {
    const block = demo.firstElementChild as HTMLElement;
    const status = demo.lastElementChild as HTMLElement;
    const line = status.firstElementChild as HTMLElement;
    const shown = Array.from(block.children)
      .filter((el) => getComputedStyle(el).visibility !== "hidden")
      .map((el) => el.getBoundingClientRect().height);
    return {
      height: block.getBoundingClientRect().height,
      top: block.getBoundingClientRect().top + window.scrollY,
      tallestShown: shown.length ? Math.max(...shown) : 0,
      lineUnderBlock: line.getBoundingClientRect().top - block.getBoundingClientRect().bottom,
    };
  });

/** Where every quiz option sits on the page (not the viewport — a tap may
 *  scroll), to a hundredth of a pixel, with what it says. */
const optionBoxes = (page: Page) =>
  page.locator("main button[aria-pressed]").evaluateAll((options) =>
    options.map((el) => {
      const box = el.getBoundingClientRect();
      const at = [box.left + window.scrollX, box.top + window.scrollY, box.width, box.height];
      // Named by what it says, less the marks a tap adds or removes
      const name = (el as HTMLElement).innerText.replace(/[✓✦]/g, "").replace(/\s+/g, " ").trim();
      return `${name} @ ${at.map((n) => n.toFixed(2)).join(" ")}`;
    }),
  );

/** The step's entrances are over: nothing in the page is mid-animation. */
const entrancesDone = (page: Page) =>
  expect.poll(() => page.evaluate(() =>
    document.querySelector("main")!.getAnimations({ subtree: true })
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
  ), { timeout: 10_000 }).toBe(0);

test.describe("The front door — motion on", () => {
  test.use({ storageState: { cookies: [], origins: [] }, contextOptions: { reducedMotion: "no-preference" } });

  test.beforeEach(async ({ page }) => {
    await watchMotion(page);
  });

  test("the headline is written; the demo waits off-screen, plays once scrolled to, and writes its picks in", async ({ page }) => {
    // Short enough that the demo starts below the fold
    await page.setViewportSize({ width: 375, height: 560 });
    await page.goto("/");
    const demo = page.getByTestId("welcome-demo");
    await expect(page.getByRole("button", { name: "Build your palate" })).toBeVisible({ timeout: 15_000 });

    // The headline: written word by word, settling into one plain text node
    await expect.poll(async () => (await motionSeen(page)).wordSpans, { timeout: 15_000 }).toBeGreaterThan(0);
    const headline = page.getByRole("heading", { level: 1 });
    await expect.poll(() => headline.evaluate((el) => el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE))
      .toBe(true);
    await expect(headline).toHaveText(WELCOME_HEADLINE);

    // Ready, and off-screen: it has not started, and shows nothing
    await expect(demo).toHaveAttribute("data-state", "idle", { timeout: 10_000 });
    await expect(demo).not.toContainText("By the bottle");
    await expect(demo).not.toContainText("Newton Johnson Chardonnay");
    await page.evaluate(() => document.fonts.ready);
    const idle = await demoFrame(page);

    // Scrolled to: it plays — the list is read, then the picks write in
    await demo.scrollIntoViewIfNeeded();
    await expect(demo).toHaveAttribute("data-state", "playing", { timeout: 10_000 });
    await expect(demo).toContainText("By the bottle");
    const reading = await demoFrame(page);
    await expect(demo).toContainText("Newton Johnson Chardonnay", { timeout: 15_000 });
    await expect(demo).toContainText("Three bottles, three kinds of yes.");
    // The Somm's note settles as its own words
    const note = page.getByTestId("welcome-demo-note");
    await expect.poll(() => note.evaluate((el) => el.querySelectorAll("[data-word]").length), { timeout: 15_000 })
      .toBe(0);
    await expect(note).toHaveText("“Sea-cooled Chardonnay with your kind of nerve. White Burgundy that moved somewhere sunnier.”");
    const picked = await demoFrame(page);

    // The frame is fixed — the same height, in the same place, before the
    // list, under it and under the picks: nothing below it ever moves…
    expect(reading.height).toBe(idle.height);
    expect(picked.height).toBe(idle.height);
    expect(reading.top).toBe(idle.top);
    expect(picked.top).toBe(idle.top);
    // …and it is as tall as its tallest state and no taller (§13): at 375px
    // that is the picks, and the status line sits 16px under them
    const tallest = Math.max(reading.tallestShown, picked.tallestShown);
    expect(tallest).toBeGreaterThan(200);
    expect(idle.height).toBe(Math.ceil(tallest));
    expect(picked.tallestShown).toBeGreaterThan(reading.tallestShown);
    expect(picked.lineUnderBlock).toBe(16);
    expect(reading.lineUnderBlock).toBe(16);
  });

  test("the demo's frame fits its tallest state at every phone width", async ({ page }) => {
    // Which state is tallest depends on the width: the picks where the
    // Somm's note takes a third line, the list where it takes two. Neither
    // may ever reach the status line, and the frame holds no spare room
    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const demo = page.getByTestId("welcome-demo");
      await expect(demo).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
      await expect(demo).toContainText("By the bottle");
      await page.evaluate(() => document.fonts.ready);
      const reading = await demoFrame(page);
      await expect(page.getByTestId("welcome-demo-note")).toBeVisible({ timeout: 15_000 });
      const picked = await demoFrame(page);
      const tallest = Math.max(reading.tallestShown, picked.tallestShown);
      expect(reading.height, `${width}px: the frame changed height mid-cycle`).toBe(picked.height);
      expect(picked.height, `${width}px: the frame is not its tallest state`).toBe(Math.ceil(tallest));
      expect(picked.lineUnderBlock, `${width}px: the status line`).toBe(16);
    }
  });

  test("the quiz's bloom is bare until the first answer, then every change ends on the static mark", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Build your palate" }).click();
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });

    // Bare: the medallion alone — no ring, no petals
    const mark = headerMark(page);
    await expect.poll(async () => (await mark.innerHTML()).includes("<circle")).toBe(true);
    expect(await mark.innerHTML()).not.toContain("<path");

    // Count the frames it paints from here
    await mark.evaluate((el) => {
      const frames = new Set<string>();
      (window as any).__bloomFrames = frames;
      new MutationObserver(() => frames.add(el.innerHTML)).observe(el, { childList: true, subtree: true });
    });

    // The first answer opens the bloom…
    await page.getByRole("button", { name: /France/ }).first().click();
    const one = await asBrowser(page, renderPalateMark(composeIdentity({ ...ANSWERS, countries: ["france"] }).genome, { size: 44 }));
    await expect.poll(() => mark.innerHTML(), { timeout: 10_000 }).toBe(one);
    expect(await page.evaluate(() => (window as any).__bloomFrames.size)).toBeGreaterThan(5);

    // …and the next grows it, ending on exactly the mark those answers compose
    await page.getByRole("button", { name: /South Africa/ }).first().click();
    const two = await asBrowser(page, renderPalateMark(
      composeIdentity({ ...ANSWERS, countries: ["france", "south_africa"] }).genome, { size: 44 },
    ));
    expect(two).not.toBe(one);
    await expect.poll(() => mark.innerHTML(), { timeout: 10_000 }).toBe(two);

    // It grows quietly (§13): shapes change, and nothing swells, pulses or
    // ripples — those belong to a real promotion. No frame it painted
    // carried a scale, and none a ring spreading from the heart or a berry
    const frames: string[] = await page.evaluate(() => Array.from((window as any).__bloomFrames));
    expect(frames.length).toBeGreaterThan(10);
    expect(frames.filter((frame) => frame.includes("scale(")).length).toBe(0);
    const overlay = /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*opacity=/i;
    expect(frames.filter((frame) => overlay.test(frame)).length).toBe(0);
  });

  test("a quiz option never moves when it is tapped — nor does any other", async ({ page }) => {
    // 375px is where it showed: selecting South Africa pushed Uruguay to a
    // new line, and every row under it jumped
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "Build your palate" }).click();
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });
    await entrancesDone(page);

    const before = await optionBoxes(page);
    expect(before.length).toBeGreaterThan(10);
    const option = (name: RegExp) => page.locator("main").getByRole("button", { name }).first();

    // Select: the option turns burgundy and bold and gains its ✓ — and
    // every option on the step is exactly where it was
    for (const name of [/South Africa/, /France/, /Uruguay/, /Italy/]) {
      await option(name).click();
      await expect(option(name)).toHaveAttribute("aria-pressed", "true");
      await expect(option(name)).toContainText("✓");
      expect(await optionBoxes(page), `selecting ${name} moved an option`).toEqual(before);
    }
    // …and unselect: back to plain, and still nothing has moved
    for (const name of [/France/, /South Africa/]) {
      await option(name).click();
      await expect(option(name)).toHaveAttribute("aria-pressed", "false");
      await expect(option(name)).not.toContainText("✓");
      expect(await optionBoxes(page), `unselecting ${name} moved an option`).toEqual(before);
    }
    // The selected weight really is heavier — the width was reserved, not
    // the weight dropped
    const weights = await page.evaluate(() => {
      const weightOf = (pressed: string) => {
        const el = document.querySelector(`main button[aria-pressed="${pressed}"]`)!;
        const label = Array.from(el.querySelectorAll("span")).find((span) =>
          !span.children.length && getComputedStyle(span).visibility === "visible" && /[a-z]{3}/i.test(span.textContent || ""))!;
        return Number(getComputedStyle(label).fontWeight);
      };
      return { selected: weightOf("true"), plain: weightOf("false") };
    });
    expect(weights.selected).toBeGreaterThan(weights.plain);

    // The grouped steps too: regions under their country
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
    await entrancesDone(page);
    const regions = await optionBoxes(page);
    expect(regions.length).toBeGreaterThan(3);
    const first = page.locator("main button[aria-pressed]").first();
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    expect(await optionBoxes(page), "selecting a region moved an option").toEqual(regions);
  });
});

test.describe("The front door — reduced motion", () => {
  test.use({ storageState: { cookies: [], origins: [] }, contextOptions: { reducedMotion: "reduce" } });

  test.beforeEach(async ({ page }) => {
    await watchMotion(page);
  });

  test("the demo shows its picks and its last line, still, and the headline is never split", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 560 });
    await page.goto("/");
    const demo = page.getByTestId("welcome-demo");
    await expect(demo).toHaveAttribute("data-state", "still", { timeout: 15_000 });
    await expect(demo).toContainText("Newton Johnson Chardonnay");
    await expect(demo).toContainText("Three bottles, three kinds of yes.");
    await expect(demo).not.toContainText("By the bottle");
    // The same tight frame as with motion on: the picks are its tallest
    // state at this width, with the status line 16px under them
    await page.evaluate(() => document.fonts.ready);
    const frame = await demoFrame(page);
    expect(frame.height).toBe(Math.ceil(frame.tallestShown));
    expect(frame.lineUnderBlock).toBe(16);
    // Nothing in it runs — not now, and not once it is scrolled to
    await expect.poll(() => demo.evaluate((el) => el.getAnimations({ subtree: true }).length), { timeout: 10_000 }).toBe(0);
    await demo.scrollIntoViewIfNeeded();
    await expect(demo).toHaveAttribute("data-state", "still");
    expect(await demo.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(WELCOME_HEADLINE);
    expect((await motionSeen(page)).wordSpans).toBe(0);

    // The quiz's bloom: bare, then the settled mark at once
    await page.getByRole("button", { name: "Build your palate" }).click();
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });
    const mark = headerMark(page);
    expect(await mark.innerHTML()).not.toContain("<path");
    await page.getByRole("button", { name: /France/ }).first().click();
    const one = await asBrowser(page, renderPalateMark(composeIdentity({ ...ANSWERS, countries: ["france"] }).genome, { size: 44 }));
    await expect.poll(() => mark.innerHTML()).toBe(one);
  });
});
