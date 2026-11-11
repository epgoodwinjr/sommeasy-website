import { test, expect, type Page } from "@playwright/test";

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
 *   6. The view-transition trial: a link cross-fades, and the back trail
 *      still reads right.
 *   7. Under reduced motion: nothing is written word by word, the mark is
 *      settled at once, nothing loops, no view transition starts.
 *
 * Sessions 2–3 add the README's remaining outcomes here as their surfaces
 * land: the Welcome demo (does not start off-screen, starts once scrolled
 * to, shows its picks under reduced motion) and the real reveal.
 *
 * Do NOT make these timing-tolerant by sleeping: poll for the outcome.
 * Read-only: /motion-specimen touches no account data, and the navigation
 * test only reads the rich account's journal.
 */

const HEADLINE = "Never guess at a wine list again.";
const NOTE =
  "Old-vine Chenin with real grip — the one to pour with the line fish. It has the waxy weight you keep coming back to, and enough salt on the finish to stand up to the lemon.";

/** Counts what motion did, from before the first script runs. */
async function watchMotion(page: Page) {
  await page.addInitScript(() => {
    const seen = { wordSpans: 0, viewTransitions: 0 };
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
    const start = (document as any).startViewTransition;
    if (typeof start === "function") {
      (document as any).startViewTransition = function (...args: unknown[]) {
        seen.viewTransitions += 1;
        return start.apply(document, args);
      };
    }
  });
}

const motionSeen = (page: Page) =>
  page.evaluate(() => (window as any).__motion as { wordSpans: number; viewTransitions: number });

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

  test("the view-transition trial: a link cross-fades, and the back trail still reads right", async ({ page }) => {
    await page.goto("/journal");
    await expect(page.getByTestId("running-head")).toBeVisible({ timeout: 15_000 });
    const supported = await page.evaluate(() => typeof (document as any).startViewTransition === "function");
    expect(supported).toBe(true); // Chromium has it; elsewhere this is a plain navigation

    // Forward, through a link: one view transition, the new page's trail
    await page.getByRole("link", { name: "Search" }).click();
    await page.waitForURL("**/search");
    await expect(page.getByTestId("search-input")).toBeVisible({ timeout: 15_000 });
    expect((await motionSeen(page)).viewTransitions).toBe(1);
    await expect(page.getByTestId("running-head-back")).toContainText("Journal");
    // The transition is over: nothing is left covering the page
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.pseudoElement || "";
      return target.startsWith("::view-transition");
    }).length)).toBe(0);
    await page.getByTestId("search-input").fill("kanon");
    await expect(page.getByTestId("search-input")).toHaveValue("kanon");

    // Back, through the trail: real history, no transition, the right page
    await page.getByTestId("running-head-back").click();
    await page.waitForURL("**/journal");
    await expect(page.getByTestId("running-head-back")).toContainText("Your list");
    expect((await motionSeen(page)).viewTransitions).toBe(1);

    // And on from there: the trail keeps counting from the right place
    await page.getByRole("link", { name: "Your list" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    expect((await motionSeen(page)).viewTransitions).toBe(2);
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

  test("no view transition starts: a link is a plain navigation", async ({ page }) => {
    await page.goto("/journal");
    await expect(page.getByTestId("running-head")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: "Search" }).click();
    await page.waitForURL("**/search");
    await expect(page.getByTestId("running-head-back")).toContainText("Journal");
    expect((await motionSeen(page)).viewTransitions).toBe(0);
  });
});
