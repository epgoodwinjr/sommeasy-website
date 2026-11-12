import { test, expect, type Page } from "@playwright/test";
import { composeIdentity } from "../src/lib/identityEngine.js";
import { MARK_MOTION, renderPalateMark } from "../src/lib/palateMark.js";
import { PRESS } from "../src/components/house/motion.js";
import { countEvents, latestEvent, testDb } from "./fixtures/test-db";
import { BottleLogPage, RecommendPage } from "./fixtures/sommeasy-page";

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
 * Session 3 adds the three fixes from Ed's review (README §13) and the
 * real reveal (§8.3):
 *
 *  10. A quiz option never moves when it is tapped, nor does any other; the
 *      quiz's bloom grows quietly; the demo's frame is its tallest state.
 *  11. Signed out: a medallion waits at least the mark's think time, the
 *      title is never in the DOM before the draw, the bloom ends on the
 *      static mark, the title is written and settles to one text node.
 *  12. Signed in: the medallion waits for as long as the save takes — then
 *      the reading arrives (the narrative written in) and leaves nothing
 *      behind. A failed save still reveals, with Try again where the saved
 *      line would be, and the retry saves.
 *  13. Under reduced motion the bloom is settled from its first frame and
 *      nothing is written word by word.
 *
 * Session 4 adds growth across a re-deal (README §14) and the rewards
 * (§8.4, §8.6):
 *
 *  14. A promotion's growth changes the seed, as production does: the ring
 *      rests elsewhere, the fruit lifts and lands again, and the last thing
 *      to play is the new berry's ripple.
 *  15. A rating tile answers its tap — pressed, the others stepped back,
 *      every tile disabled — and stays for the hold; then the done line is
 *      written, settles to one text node and takes focus.
 *  16. Log's saved step (the real SavedStep, over sample content): on a
 *      promotion the bloom arrives in its OLD shape and ends on the new
 *      one, celebrated; on the quiet path it is settled from its first
 *      frame. Either way the lines are written and nothing is left behind.
 *  17. Home and Your palate, signed in: the entrances end, nothing is left
 *      behind, and the crest's bloom is the static mark.
 *  (The real promotion — one earned through /log on the test account — is
 *  identity-shift.spec.ts's second guard.)
 *
 * Session 5 adds the waits (§8.5) on the real /recommend, the Somm scripted
 * by a held route (no Claude call) and the ledger asserted by delta:
 *
 *  18. The reading: the bloom breathes, the ticker shows only names that
 *      are on the list and only while the list is being read, each line is
 *      said, and the view leaves before the picks arrive.
 *  19. The picks arrive in ink and leave nothing behind. When the Somm
 *      lands its summary is written in and each engine note is rewritten,
 *      pick by pick, in order — the boxes easing to their new heights, never
 *      jumping; a pick the Somm changed arrives with the Somm's note.
 *  20. Under reduced motion: no ticker, no exit, nothing written word by
 *      word — the Somm's words take the engine's place in the same commit.
 *  21. Log's label read (the scan scripted too): the same view — the bloom
 *      breathes, and the line changes to what the label said before the
 *      rate step arrives with it.
 *
 *  22. The quiet pages (§8.6) — Journal, Search, Account, a wine's page:
 *      the title rises, everything under it comes in on ONE fade (a list
 *      never staggers), and nothing is left behind.
 *
 * The signed-in reveal tests save the quiz in REFINE mode on the rich
 * account with its own seeded answers — content-identical, the same
 * discipline as quiz-completion.spec.ts — and assert the ledger by delta.
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

    // One berry more — under a new seed, as production promotes (README
    // §14). Count the distinct frames on the way: it grew, it did not jump
    const before = (await markOf(page, "specimen-grow")).html;
    await page.getByTestId("specimen-shape-estate").click();
    const frames = await page.evaluate(async () => {
      const live = document.querySelector('[data-testid="specimen-grow"] [data-testid="palate-mark"]')!;
      const target = document.querySelector('[data-testid="specimen-grow-static"] [data-testid="palate-mark"]')!;
      const seen: string[] = [];
      const deadline = performance.now() + 15_000;
      while (performance.now() < deadline) {
        if (seen[seen.length - 1] !== live.innerHTML) seen.push(live.innerHTML);
        if (seen.length > 1 && live.innerHTML === target.innerHTML) break;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      // A berry's ripple is the thin cream ring (the heart's pulse is wider)
      const berryRipple = /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*stroke-width="0\.9"[^>]*opacity=/i;
      const anyOverlay = /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*opacity=/i;
      const overlays = seen.filter((frame) => anyOverlay.test(frame));
      // Fruit: the burgundy circles other than the heart (r 6.5, at rest in a growth)
      const berries = (frame: string) => (frame.match(/<circle cx="[^"]*" cy="[^"]*" r="(?!6\.5")[^"]*" fill="#8B2332"/gi) || []).length;
      return {
        distinct: new Set(seen).size,
        ended: live.innerHTML === target.innerHTML,
        rippled: seen.some((frame) => berryRipple.test(frame)),
        lastOverlayIsBerry: overlays.length > 0 && berryRipple.test(overlays[overlays.length - 1]),
        fewestBerries: Math.min(...seen.map(berries)),
        berriesAtEnd: berries(seen[seen.length - 1]),
      };
    });
    expect(frames.ended).toBe(true);
    expect(frames.distinct).toBeGreaterThan(5);
    const grown = await markOf(page, "specimen-grow");
    expect(grown.html).not.toBe(before);
    expect(grown.attrs).toEqual((await markOf(page, "specimen-grow-static")).attrs);
    // The seed changed with the shape: the ring rests somewhere else…
    const ringOf = (html: string) => html.match(/<path d="([^"]+)" fill="none" stroke="#8B2332"/i)?.[1];
    expect(ringOf(before)).toBeTruthy();
    expect(ringOf(grown.html)).not.toBe(ringOf(before));
    // …the fruit was re-dealt (it lifted away, then landed again)…
    expect(frames.berriesAtEnd).toBe(4);
    expect(frames.fewestBerries).toBe(0);
    // …and the promotion still ended on its berry landing with its ripples
    expect(frames.rippled).toBe(true);
    expect(frames.lastOverlayIsBerry).toBe(true);

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

/** Where a primary entry's parts sit on its line (README §15.3). */
const entryFit = (page: Page, name: string) =>
  page.getByRole("button", { name }).evaluate((el) => {
    const [label, leader, circle] = Array.from(el.children) as HTMLElement[];
    const box = (node: Element) => node.getBoundingClientRect();
    return {
      // How far the circle's edge sits inside the column's right edge —
      // the entry's line is as wide as the column, gutter to gutter
      inside: Math.round((box(el).right - box(circle).right) * 10) / 10,
      leader: Math.round(box(leader).width * 10) / 10,
      circle: Math.round(box(circle).width),
      lines: Math.round(box(label).height / parseFloat(getComputedStyle(label).lineHeight)),
      font: parseFloat(getComputedStyle(label).fontSize),
      scrolls: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

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

test.describe("The front door, narrow — motion on", () => {
  test.use({ storageState: { cookies: [], origins: [] }, contextOptions: { reducedMotion: "no-preference" } });

  test("the fit survives the entry's own entrance: at 320px the circle lands inside the gutter", async ({ page }) => {
    // The label is fitted while the circle is still waiting to pop (held
    // at 0.6 scale) and the label to rise — a fit read from painted boxes
    // would see a smaller circle and leave it hanging out once it lands
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/");
    const entry = page.getByRole("button", { name: "Build your palate" });
    await expect(entry).toBeVisible({ timeout: 15_000 });
    // The entrance is over: nothing finite still plays on the entry
    await expect
      .poll(() => entry.evaluate((el) => el.getAnimations({ subtree: true }).length), { timeout: 15_000 })
      .toBe(0);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(async () => (await entryFit(page, "Build your palate")).inside, { timeout: 10_000 }).toBeGreaterThanOrEqual(0);
    const at = await entryFit(page, "Build your palate");
    expect(at.circle).toBe(48);
    expect(at.lines).toBe(1);
    expect(at.leader).toBeGreaterThanOrEqual(12);
    expect(at.scrolls).toBe(false);
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

  // README §15.3 (from §14's polish list): under 344px a primary entry with
  // a long label let its circle hang about 20px into the right gutter.
  // ("Build your palate" runs out of room at 338px in this column.)
  for (const width of [280, 320, 336]) {
    test(`a primary entry keeps its circle inside the gutter at ${width}px — on one line, with its leader`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/");
      const entry = page.getByRole("button", { name: "Build your palate" });
      await expect(entry).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready);
      const read = () => entryFit(page, "Build your palate");
      await expect.poll(async () => (await read()).inside, { timeout: 10_000 }).toBeGreaterThanOrEqual(0);
      const at = await read();
      expect(at.scrolls, "the page scrolls sideways").toBe(false);
      expect(at.lines, "the label wrapped").toBe(1);
      expect(at.leader, "the leader lost its minimum").toBeGreaterThanOrEqual(12);
      expect(at.circle, "the circle shrank — it is the tap's target").toBe(48);
      // Set smaller only as far as it must be: never below a readable size
      expect(at.font).toBeGreaterThanOrEqual(14);
      expect(at.font).toBeLessThan(24);
    });
  }

  test("…and where there is room — 344px and up — the label is exactly the size it was", async ({ page }) => {
    for (const width of [344, 375, 430]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/");
      const entry = page.getByRole("button", { name: "Build your palate" });
      await expect(entry).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready);
      const label = entry.locator("> span").first();
      await expect(label).toHaveCSS("font-size", "24px");
      // A viewport that narrows and widens again gets its full size back
      await page.setViewportSize({ width: 300, height: 700 });
      await expect.poll(() => label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(24);
      await page.setViewportSize({ width, height: 700 });
      await expect(label).toHaveCSS("font-size", "24px");
    }
  });
});

// ─── The reveal (Session 3, README §8.3) ───

const REVEAL_SIZE = 176;
const revealMark = (page: Page) => page.locator("main").getByTestId("palate-mark");

/** From before the reveal mounts: when the reading line, the bloom's first
 *  petal-or-ring path and the title each first exist (ms on the page's
 *  clock), and every frame the mark paints. */
const watchReveal = (page: Page) =>
  page.evaluate(() => {
    const seen = { reading: 0, path: 0, title: 0, frames: [] as string[] };
    (window as any).__reveal = seen;
    new MutationObserver(() => {
      const now = performance.now();
      if (!seen.reading && document.querySelector('[data-testid="reveal-reading"]')) seen.reading = now;
      if (!seen.title && document.querySelector('[data-testid="reveal-archetype"]')) seen.title = now;
      const mark = document.querySelector('main [data-testid="palate-mark"]');
      if (!mark) return;
      if (seen.frames[seen.frames.length - 1] !== mark.innerHTML) seen.frames.push(mark.innerHTML);
      if (!seen.path && mark.innerHTML.includes("<path")) seen.path = now;
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  });

const revealSeen = (page: Page) =>
  page.evaluate(() => (window as any).__reveal as { reading: number; path: number; title: number; frames: string[] });

/** The reveal at rest: nothing on the page carries what an entrance wears. */
const leftBehind = (page: Page) =>
  page.evaluate(() => {
    // The page's own elements — not the insides of the mark
    const all = Array.from(document.querySelectorAll("main *"))
      .filter((el): el is HTMLElement => el instanceof HTMLElement);
    return {
      transformed: all.filter((el) => getComputedStyle(el).transform !== "none").length,
      clipped: all.filter((el) => getComputedStyle(el).clipPath !== "none").length,
      invisible: all.filter((el) => getComputedStyle(el).opacity === "0").length,
      inline: all.filter((el) => el.style.transform || el.style.clipPath || el.style.opacity === "0").length,
      wordSpans: document.querySelectorAll("[data-word]").length,
    };
  });

const onlyText = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE);

const QUIZ_ANSWERS = {
  countries: ["south_africa"],
  regions: { south_africa: ["stellenbosch"] },
  estates: {},
  varietals: ["pinot_noir"],
  specificWines: [],
};

/** The anonymous quiz, answered as QUIZ_ANSWERS, up to its last button. */
async function answerQuiz(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Build your palate" }).click();
  await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /South Africa/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await page.getByRole("button", { name: /Stellenbosch/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 3 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 4 of 5")).toBeVisible();
  await page.getByRole("button", { name: /Pinot Noir/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();
}

/** The rich account's refine quiz, untouched, up to its last button. */
async function refineQuiz(page: Page) {
  await page.goto("/?quiz=refine");
  await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });
  for (let step = 2; step <= 5; step++) {
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
  }
}

test.describe("The reveal, signed out — motion on", () => {
  test.use({ storageState: { cookies: [], origins: [] }, contextOptions: { reducedMotion: "no-preference" } });

  test("a medallion waits, the bloom draws itself, and the title is written — never before", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await watchMotion(page);
    await answerQuiz(page);
    const wordsBefore = (await motionSeen(page)).wordSpans;
    await watchReveal(page);
    await page.getByRole("button", { name: "See My Wine DNA" }).click();

    // Waiting: the Somm is reading, over a medallion with no bloom in it —
    // and nothing of the reading is in the DOM yet
    const reading = page.getByTestId("reveal-reading");
    await expect(reading).toBeVisible({ timeout: 10_000 });
    await expect(reading).toContainText("The Somm is reading your palate");
    await expect.poll(async () => (await revealMark(page).innerHTML()).includes("<circle")).toBe(true);
    expect(await revealMark(page).innerHTML()).not.toContain("<path");
    await expect(page.getByTestId("reveal-archetype")).toHaveCount(0);
    await expect(page.getByTestId("teaser-gate")).toHaveCount(0);
    await expect(page.getByTestId("reveal-recs")).toHaveCount(0);

    // The draw: it ends on exactly the static mark for the genome these
    // answers compose — the mark the quiz's header bloom grew into
    const identity = composeIdentity(QUIZ_ANSWERS);
    const still = await asBrowser(page, renderPalateMark(identity.genome, { size: REVEAL_SIZE }));
    await expect.poll(() => revealMark(page).innerHTML(), { timeout: 20_000 }).toBe(still);
    expect(still).toContain("<path");

    // The title: written word by word, settling into one plain text node
    const title = page.getByTestId("reveal-archetype");
    await expect.poll(() => onlyText(page, "reveal-archetype"), { timeout: 20_000 }).toBe(true);
    await expect(title).toHaveText(identity.title);
    expect(await title.evaluate((el) => el.tagName)).toBe("H1");
    expect((await motionSeen(page)).wordSpans - wordsBefore).toBeGreaterThanOrEqual(identity.title.split(/\s+/).length);

    const seen = await revealSeen(page);
    // The medallion held for at least the mark's think time (a floor: a
    // slow machine only lengthens it), and it drew — it did not jump
    expect(seen.path - seen.reading).toBeGreaterThanOrEqual(MARK_MOTION.thinkMs - 50);
    expect(seen.title - seen.reading).toBeGreaterThanOrEqual(MARK_MOTION.thinkMs - 50);
    expect(seen.frames.length).toBeGreaterThan(30);
    expect(seen.frames[seen.frames.length - 1]).toBe(still);
    // No frame of the draw celebrated: the reveal has no overlays
    expect(seen.frames.filter((frame) => /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*opacity=/i.test(frame)).length).toBe(0);

    // The teaser under it: the gate, one read-only bottle — and the reading
    // line has left the DOM
    await expect(page.getByTestId("teaser-gate")).toBeVisible();
    await expect(page.getByTestId("teaser-gate").getByRole("link", { name: /Save My Wine DNA/ })).toHaveAttribute("href", "/signup");
    await expect(page.getByTestId("reveal-recs").getByTestId("rec-card")).toHaveCount(1);
    await expect(reading).toHaveCount(0);
    await expect(page.getByTestId("reveal-epithet")).toHaveCount(0);
    await expect(page.getByTestId("reveal-narrative")).toHaveCount(0);

    // And when every entrance is over, none has left a thing behind
    await expect.poll(() => finiteAnimations(page), { timeout: 20_000 }).toBe(0);
    expect(await leftBehind(page)).toEqual({ transformed: 0, clipped: 0, invisible: 0, inline: 0, wordSpans: 0 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});

test.describe("The reveal, signed out — reduced motion", () => {
  test.use({ storageState: { cookies: [], origins: [] }, contextOptions: { reducedMotion: "reduce" } });

  test("the bloom is settled from its first frame, and nothing is written word by word", async ({ page }) => {
    await watchMotion(page);
    await answerQuiz(page);
    await watchReveal(page);
    await page.getByRole("button", { name: "See My Wine DNA" }).click();

    const identity = composeIdentity(QUIZ_ANSWERS);
    await expect(page.getByTestId("reveal-archetype")).toHaveText(identity.title, { timeout: 10_000 });
    await expect(page.getByTestId("teaser-gate")).toBeVisible();
    await expect(page.getByTestId("reveal-recs").getByTestId("rec-card")).toHaveCount(1);
    await expect(page.getByTestId("reveal-reading")).toHaveCount(0);

    // One frame, ever: the settled mark. No medallion, no draw
    const still = await asBrowser(page, renderPalateMark(identity.genome, { size: REVEAL_SIZE }));
    expect(await revealMark(page).innerHTML()).toBe(still);
    expect((await revealSeen(page)).frames).toEqual([still]);
    // The title arrived whole
    expect(await onlyText(page, "reveal-archetype")).toBe(true);
    expect((await motionSeen(page)).wordSpans).toBe(0);
    // Every entrance was a short fade: all done, nothing running or left
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 10_000 }).toBe(0);
    expect(await leftBehind(page)).toEqual({ transformed: 0, clipped: 0, invisible: 0, inline: 0, wordSpans: 0 });
  });
});

test.describe("The reveal, signed in — motion on", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the medallion waits for as long as the save takes; then the reading arrives and leaves nothing behind", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const eventsBefore = await countEvents(supabase, userId, "quiz_completed");
    await page.setViewportSize({ width: 375, height: 812 });
    await watchMotion(page);
    await refineQuiz(page);

    // Hold the save: the profile write does not land until the test says so
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let holding = 0;
    await page.route("**/rest/v1/wine_profiles**", async (route) => {
      if (route.request().method() === "POST") {
        holding += 1;
        await held;
      }
      await route.continue();
    });

    const wordsBefore = (await motionSeen(page)).wordSpans;
    await watchReveal(page);
    // A double tap, as a thumb does: the button is still there, and live,
    // for the 200ms the last step takes to leave. It must save once
    await page.getByRole("button", { name: "Update My Wine DNA" }).dblclick();
    const reading = page.getByTestId("reveal-reading");
    await expect(reading).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => holding, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

    // Well past the mark's own think time, with the save still out: still
    // a medallion, still reading, and nothing of the reading in the DOM
    await page.waitForFunction(
      (floor) => performance.now() - (window as any).__reveal.reading > floor,
      MARK_MOTION.thinkMs + 800,
    );
    expect(await revealMark(page).innerHTML()).not.toContain("<path");
    await expect(reading).toBeVisible();
    expect(await reading.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await expect(page.getByTestId("reveal-archetype")).toHaveCount(0);
    await expect(page.getByTestId("reveal-saved")).toHaveCount(0);
    expect((await revealSeen(page)).path).toBe(0);

    // The save lands: the bloom draws, and the reading arrives under it
    release();
    await expect(page.getByTestId("reveal-saved")).toBeVisible({ timeout: 30_000 });
    const { data: row } = await supabase
      .from("wine_profiles").select("archetype, narrative, identity").eq("user_id", userId).single();
    const still = await asBrowser(page, renderPalateMark(row!.identity.genome, { size: REVEAL_SIZE }));
    await expect.poll(() => revealMark(page).innerHTML(), { timeout: 20_000 }).toBe(still);

    // What it reveals is the saved row: title, epithet, and the narrative
    // written in and settled into one plain text node
    await expect.poll(() => onlyText(page, "reveal-archetype"), { timeout: 20_000 }).toBe(true);
    await expect(page.getByTestId("reveal-archetype")).toHaveText(row!.archetype);
    await expect(page.getByTestId("reveal-epithet")).toHaveText(row!.identity.epithet);
    await expect.poll(() => onlyText(page, "reveal-narrative"), { timeout: 20_000 }).toBe(true);
    await expect(page.getByTestId("reveal-narrative")).toHaveText(row!.narrative);
    expect((await motionSeen(page)).wordSpans - wordsBefore)
      .toBeGreaterThanOrEqual((row!.archetype + " " + row!.narrative).split(/\s+/).length);

    // The door to the palate, and ratable recs — live
    await expect(page.getByTestId("reveal-palate-cta")).toHaveAttribute("href", "/palate");
    const firstRec = page.getByTestId("reveal-recs").getByTestId("rec-card").first();
    await expect(firstRec.getByRole("button", { name: /Had it/ })).toBeVisible();
    await expect(reading).toHaveCount(0);

    const seen = await revealSeen(page);
    expect(seen.frames.length).toBeGreaterThan(30);
    expect(seen.title - seen.reading).toBeGreaterThanOrEqual(MARK_MOTION.thinkMs + 800);

    await expect.poll(() => finiteAnimations(page), { timeout: 25_000 }).toBe(0);
    expect(await leftBehind(page)).toEqual({ transformed: 0, clipped: 0, invisible: 0, inline: 0, wordSpans: 0 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    // One save, one ledger row (fire-and-forget — poll) — however many
    // times the button was tapped
    await expect.poll(() => countEvents(supabase, userId, "quiz_completed"), { timeout: 15_000 }).toBe(eventsBefore + 1);
    expect(holding, "the double tap saved the profile more than once").toBe(1);
    expect(await countEvents(supabase, userId, "quiz_completed")).toBe(eventsBefore + 1);
  });
});

test.describe("The reveal, signed in — when the save goes wrong", () => {
  // Reduced motion (the suite's default): this is about what the reveal
  // holds, not how it arrives

  test("a failed save still reveals, with Try again where the saved line would be — and the retry saves", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const eventsBefore = await countEvents(supabase, userId, "quiz_completed");
    await refineQuiz(page);

    // The first two profile writes fail; the third is held, then let through
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let writes = 0;
    await page.route("**/rest/v1/wine_profiles**", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes += 1;
      if (writes <= 2) {
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "e2e: the save is down" }) });
      }
      await held;
      return route.continue();
    });

    await page.getByRole("button", { name: "Update My Wine DNA" }).click();

    // The reveal lands anyway, from the local composition…
    await expect(page.getByTestId("reveal-archetype")).toBeVisible({ timeout: 30_000 });
    expect((await page.getByTestId("reveal-archetype").textContent())?.trim().length).toBeGreaterThan(0);
    await expect(page.getByTestId("reveal-narrative")).toBeVisible();
    await expect(revealMark(page).locator("svg path").first()).toBeAttached();
    // …and says so where the saved line would be: no saved line, no door
    const failed = page.locator("main").getByRole("alert");
    await expect(failed).toHaveText("We couldn't save your palate just now — one more try should do it.");
    await expect(page.getByTestId("reveal-saved")).toHaveCount(0);
    await expect(page.getByTestId("reveal-palate-cta")).toHaveCount(0);
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeEnabled();
    // A failed write wrote nothing
    expect(await countEvents(supabase, userId, "quiz_completed")).toBe(eventsBefore);
    // Nothing took focus as the reveal arrived: only a retry moves it
    await expect(failed).not.toBeFocused();

    // Try again, and it fails again: the failure is said again — it takes
    // focus, so a screen reader hears it and a keyboard keeps its place —
    // and the entry is back to be tried once more
    const titleBefore = await page.getByTestId("reveal-archetype").textContent();
    await retry.click();
    await expect.poll(() => writes, { timeout: 15_000 }).toBe(2);
    await expect(retry).toBeEnabled({ timeout: 15_000 });
    await expect(failed).toHaveText("We couldn't save your palate just now — one more try should do it.");
    await expect(failed).toBeFocused();
    await expect(page.getByTestId("reveal-saved")).toHaveCount(0);
    expect(await countEvents(supabase, userId, "quiz_completed")).toBe(eventsBefore);

    // Once more: while it saves the entry says so and can't be tapped
    // twice, and the reveal stays exactly where it is
    await retry.click();
    const saving = page.getByRole("button", { name: "Saving…" });
    await expect(saving).toBeDisabled();
    await expect(failed).toBeVisible();
    await expect(page.getByTestId("reveal-archetype")).toHaveText(titleBefore!);
    await expect(page.getByTestId("reveal-reading")).toHaveCount(0);
    // The retry has got as far as its write, and is held there
    await expect.poll(() => writes, { timeout: 15_000 }).toBe(3);
    await expect(saving).toBeDisabled();
    await expect(page.getByTestId("reveal-saved")).toHaveCount(0);

    // It lands: saved — the line takes focus as it replaces the entry that
    // was tapped — with the door to the palate, and the failure is gone
    release();
    await expect(page.getByTestId("reveal-saved")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("reveal-saved")).toBeFocused();
    await expect(page.getByTestId("reveal-palate-cta")).toHaveAttribute("href", "/palate");
    await expect(failed).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Try again|Saving/ })).toHaveCount(0);
    const { data: row } = await supabase
      .from("wine_profiles").select("archetype, narrative").eq("user_id", userId).single();
    await expect(page.getByTestId("reveal-archetype")).toHaveText(row!.archetype);
    await expect(page.getByTestId("reveal-narrative")).toHaveText(row!.narrative);
    await expect(page.getByTestId("reveal-recs").getByTestId("rec-card").first()).toBeVisible();
    await expect.poll(() => countEvents(supabase, userId, "quiz_completed"), { timeout: 15_000 }).toBe(eventsBefore + 1);
  });

  test("a saved row with no usable genome still reveals — in words, with no mark", async ({ page }) => {
    await refineQuiz(page);

    // The row the save hands back carries an identity whose genome is not
    // one (a malformed or legacy jsonb): every surface degrades to text
    // only for it, and the reveal has to as well — not wait for a draw
    // that no mark will ever report
    await page.route("**/rest/v1/wine_profiles**", async (route) => {
      const request = route.request();
      if (request.method() !== "GET" || !decodeURIComponent(request.url()).includes("select=*")) return route.continue();
      const response = await route.fetch();
      const row = await response.json();
      if (row?.identity) row.identity = { ...row.identity, genome: "not a genome" };
      return route.fulfill({ response, json: row });
    });

    await page.getByRole("button", { name: "Update My Wine DNA" }).click();
    await expect(page.getByTestId("reveal-saved")).toBeVisible({ timeout: 30_000 });
    expect((await page.getByTestId("reveal-archetype").textContent())?.trim().length).toBeGreaterThan(0);
    await expect(page.getByTestId("reveal-narrative")).toBeVisible();
    await expect(page.getByTestId("reveal-palate-cta")).toBeVisible();
    await expect(page.getByTestId("reveal-recs").getByTestId("rec-card").first()).toBeVisible();
    // Text only: no mark, and the reading line has gone
    await expect(revealMark(page)).toHaveCount(0);
    await expect(page.getByTestId("reveal-reading")).toHaveCount(0);
  });
});

// ─── The rewards (Session 4): tiles, the saved step, home and the palate ───

/** What an entrance could have left on the page's own elements (not the
 *  insides of a palate mark). */
const restOf = (page: Page, root: string) =>
  page.evaluate((selector) => {
    const host = document.querySelector(selector)!;
    const all = Array.from(host.querySelectorAll("*")).filter((el): el is HTMLElement => el instanceof HTMLElement);
    return {
      running: host.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
      invisible: all.filter((el) => getComputedStyle(el).opacity === "0").map((el) => el.tagName + (el.dataset.testid ? `[${el.dataset.testid}]` : "")),
      clipped: all.filter((el) => getComputedStyle(el).clipPath !== "none").length,
      inline: all.filter((el) => el.style.clipPath || el.style.opacity === "0").length,
      wordSpans: host.querySelectorAll("[data-word]").length,
    };
  }, root);

test.describe("The rewards — motion on", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("a rating tile answers its tap and holds; then the done line is written and takes focus", async ({ page }) => {
    await page.goto("/motion-specimen");
    const holder = page.getByTestId("specimen-tiles");
    await holder.scrollIntoViewIfNeeded();
    await expect(holder.getByTestId("rating-tile-loved")).toBeEnabled({ timeout: 15_000 });

    const seen = await page.evaluate(async () => {
      const host = document.querySelector('[data-testid="specimen-tiles"]')!;
      const tile = host.querySelector('[data-testid="rating-tile-loved"]') as HTMLButtonElement;
      const other = host.querySelector('[data-testid="rating-tile-liked"]') as HTMLButtonElement;
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      let doneAt = 0;
      let wordSpans = 0;
      new MutationObserver(() => {
        if (!doneAt && host.querySelector("p")) doneAt = performance.now();
        wordSpans = Math.max(wordSpans, host.querySelectorAll("[data-word]").length);
      }).observe(host, { childList: true, subtree: true });
      const tappedAt = performance.now();
      tile.click();
      const pressing = tile.getAnimations().length; // the press starts on the tap itself
      await frame();
      await frame();
      const held = {
        tilesStill: host.contains(tile),
        doneYet: Boolean(host.querySelector("p")),
        pressed: tile.hasAttribute("data-pressed"),
        allDisabled: Array.from(host.querySelectorAll("button")).every((b) => (b as HTMLButtonElement).disabled),
      };
      // While they are held the others step back
      let otherLowest = 1;
      const deadline = performance.now() + 5000;
      while (!doneAt && performance.now() < deadline) {
        if (host.contains(other)) otherLowest = Math.min(otherLowest, Number(getComputedStyle(other).opacity));
        await frame();
      }
      return { pressing, held, otherLowest, heldFor: doneAt - tappedAt, wordSpansAtArrival: wordSpans };
    });

    expect(seen.pressing).toBeGreaterThan(0);
    expect(seen.held).toEqual({ tilesStill: true, doneYet: false, pressed: true, allDisabled: true });
    expect(seen.otherLowest).toBeLessThanOrEqual(PRESS.rest + 0.02);
    // A floor, never a ceiling: the done line does not cut the press short
    expect(seen.heldFor).toBeGreaterThanOrEqual(PRESS.holdMs - 40);

    // The done line: written word by word, then one plain text node — and
    // it has the focus, as it always did
    const line = holder.locator("p");
    await expect(line).toHaveText("❤️ Loved it — noted in your journal.");
    await expect.poll(() => line.evaluate((el) => el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE), { timeout: 10_000 }).toBe(true);
    expect(await line.evaluate((el) => el === document.activeElement)).toBe(true);
    await expect(holder.getByTestId("rating-tile-loved")).toHaveCount(0);

    // Rate again: the tiles come back live
    await page.getByTestId("specimen-tiles-reset").click();
    await expect(holder.getByTestId("rating-tile-fine")).toBeEnabled();
  });

  test("the done line is written: its words arrive one by one, and its text is whole throughout", async ({ page }) => {
    await watchMotion(page);
    await page.goto("/motion-specimen");
    const holder = page.getByTestId("specimen-tiles");
    await holder.scrollIntoViewIfNeeded();
    await expect(holder.getByTestId("rating-tile-fine")).toBeEnabled({ timeout: 15_000 });
    // The page's own lines have been written by now, or will be: count from here
    await expect.poll(async () => (await lineOf(page, "specimen-note")).onlyText, { timeout: 20_000 }).toBe(true);
    const before = (await motionSeen(page)).wordSpans;
    await holder.getByTestId("rating-tile-fine").click();
    const line = holder.locator("p");
    await expect(line).toHaveText("😐 It was fine — noted in your journal.", { timeout: 10_000 });
    await expect.poll(async () => (await motionSeen(page)).wordSpans - before, { timeout: 10_000 }).toBeGreaterThanOrEqual(7);
    await expect.poll(() => line.evaluate((el) => el.querySelectorAll("[data-word]").length), { timeout: 10_000 }).toBe(0);
    expect(await line.textContent()).toBe("😐 It was fine — noted in your journal.");
  });

  test("the saved step, on a promotion: the bloom arrives in its old shape, grows celebrating into the new one, and the lines are written", async ({ page }) => {
    await page.goto("/motion-specimen");
    await page.getByTestId("specimen-saved-play-grown").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("specimen-saved-after").getByTestId("palate-mark")).toBeVisible({ timeout: 15_000 });
    const before = (await markOf(page, "specimen-saved-before")).html;
    const after = (await markOf(page, "specimen-saved-after")).html;
    expect(after).not.toBe(before);

    const seen = await page.evaluate(async () => {
      const host = document.querySelector('[data-testid="specimen-saved"]')!;
      const target = document.querySelector('[data-testid="specimen-saved-after"] [data-testid="palate-mark"]')!.innerHTML;
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const frames: string[] = [];
      let headlineSpans = 0;
      let headlineEarly = false; // the headline before the bloom began to grow
      (document.querySelector('[data-testid="specimen-saved-play-grown"]') as HTMLElement).click();
      const deadline = performance.now() + 25_000;
      while (performance.now() < deadline) {
        const mark = host.querySelector('[data-testid="palate-mark"]');
        if (mark) {
          if (frames[frames.length - 1] !== mark.innerHTML) frames.push(mark.innerHTML);
          if (frames.length > 5 && mark.innerHTML === target) break;
        }
        const spans = host.querySelectorAll("h1 [data-word]");
        headlineSpans = Math.max(headlineSpans, spans.length);
        if (frames.length <= 1 && Array.from(spans).some((el) => Number(getComputedStyle(el).opacity) > 0.5)) headlineEarly = true;
        await frame();
      }
      const berryRipple = /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*stroke-width="0\.9"[^>]*opacity=/i;
      const anyOverlay = /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*opacity=/i;
      const overlays = frames.filter((f) => anyOverlay.test(f));
      return {
        moment: host.firstElementChild?.getAttribute("data-moment"),
        first: frames[0], last: frames[frames.length - 1], distinct: new Set(frames).size,
        swelled: frames.some((f) => f.includes("scale(")),
        lastOverlayIsBerry: overlays.length > 0 && berryRipple.test(overlays[overlays.length - 1]),
        headlineSpans, headlineEarly,
      };
    });
    expect(seen.moment).toBe("grown");
    // It arrives as it WAS — the bloom the user already has — and ends as it is
    expect(seen.first).toBe(before);
    expect(seen.last).toBe(after);
    expect(seen.distinct).toBeGreaterThan(20);
    // Celebrated: the swell, and the promotion's berry landing last
    expect(seen.swelled).toBe(true);
    expect(seen.lastOverlayIsBerry).toBe(true);
    // The page says why only once the bloom is growing
    expect(seen.headlineEarly).toBe(false);
    expect(seen.headlineSpans).toBeGreaterThan(0);

    const saved = page.getByTestId("log-saved");
    await expect(saved).toContainText("🧬 Your DNA just grew");
    await expect(saved.locator("h1")).toHaveText("Ken Forrester just joined your DNA");
    await expect(saved).toContainText("Two loved bottles made the case");
    await expect(saved).toContainText("Ken Forrester The FMC Chenin Blanc 2021");
    for (const way of ["See it in your palate", "Log another bottle", "Back to your list"]) {
      await expect(saved.getByText(way)).toBeVisible();
    }
    // Everything settles into the plain page: written lines are one text
    // node, and nothing an entrance used is left on any element
    await expect.poll(async () => (await restOf(page, '[data-testid="specimen-saved"]')).running, { timeout: 20_000 }).toBe(0);
    const rest = await restOf(page, '[data-testid="specimen-saved"]');
    expect(rest).toEqual({ running: 0, invisible: [], clipped: 0, inline: 0, wordSpans: 0 });
    expect(await saved.locator("h1").evaluate((el) => el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE)).toBe(true);
    expect((await markOf(page, "specimen-saved")).html).toBe(after);
    // A way on is live: Log another bottle closes the step
    await saved.getByRole("button", { name: "Log another bottle" }).click();
    await expect(page.getByTestId("log-saved")).toHaveCount(0);
  });

  test("the saved step, on the quiet path: the bloom stands settled from its first frame, and the page still arrives in ink", async ({ page }) => {
    await page.goto("/motion-specimen");
    await page.getByTestId("specimen-saved-play-quiet").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("specimen-saved-quiet-mark").getByTestId("palate-mark")).toBeVisible({ timeout: 15_000 });
    const settled = (await markOf(page, "specimen-saved-quiet-mark")).html;

    const seen = await page.evaluate(async () => {
      const host = document.querySelector('[data-testid="specimen-saved"]')!;
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const frames = new Set<string>();
      let headlineSpans = 0;
      (document.querySelector('[data-testid="specimen-saved-play-quiet"]') as HTMLElement).click();
      const until = performance.now() + 2500;
      while (performance.now() < until) {
        const mark = host.querySelector('[data-testid="palate-mark"]');
        if (mark) frames.add(mark.innerHTML);
        headlineSpans = Math.max(headlineSpans, host.querySelectorAll("h1 [data-word]").length);
        await frame();
      }
      return { moment: host.firstElementChild?.getAttribute("data-moment"), frames: Array.from(frames), headlineSpans };
    });
    expect(seen.moment).toBe("quiet");
    expect(seen.frames).toEqual([settled]); // one frame, ever: no growth
    expect(seen.headlineSpans).toBeGreaterThan(0); // "Noted in your journal", written

    const saved = page.getByTestId("log-saved");
    await expect(saved).toContainText("👍 Liked it");
    await expect(saved.locator("h1")).toHaveText("Noted in your journal");
    await expect.poll(async () => (await restOf(page, '[data-testid="specimen-saved"]')).running, { timeout: 15_000 }).toBe(0);
    expect(await restOf(page, '[data-testid="specimen-saved"]')).toEqual({ running: 0, invisible: [], clipped: 0, inline: 0, wordSpans: 0 });
  });

  test("home arrives in ink and leaves nothing behind; the crest's bloom is the static mark", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const { data: profile } = await supabase.from("wine_profiles").select("archetype, identity").eq("user_id", userId).single();
    await page.goto("/");
    const crest = page.getByTestId("palate-strip");
    await expect(crest).toBeVisible({ timeout: 20_000 });
    await expect(crest).toContainText(profile!.archetype);
    // The list has arrived: its sections, its recommendations, its footer
    await expect(page.getByRole("heading", { name: "Tonight, out" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Match the wine list" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Your Sommeasy" })).toBeVisible();
    await expect(page.getByTestId("rec-card").first()).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => (await restOf(page, "body")).running, { timeout: 20_000 }).toBe(0);
    const rest = await restOf(page, "body");
    expect(rest.invisible).toEqual([]);
    expect(rest.clipped).toBe(0);
    expect(rest.inline).toBe(0);
    expect(rest.wordSpans).toBe(0);
    // No entrance left a transform: only a struck or quiet element may carry
    // an opacity of its own, and nothing on home is transformed at rest
    const transformed = await page.evaluate(() =>
      Array.from(document.body.querySelectorAll("*"))
        .filter((el): el is HTMLElement => el instanceof HTMLElement && getComputedStyle(el).transform !== "none")
        .map((el) => el.tagName + (el.dataset.testid ? `[${el.dataset.testid}]` : "")));
    expect(transformed).toEqual([]);

    // At rest the crest's bloom is exactly what PalateMark renders
    const still = await asBrowser(page, renderPalateMark(profile!.identity.genome, { size: 76 }));
    expect(await crest.getByTestId("palate-mark").innerHTML()).toBe(still);
  });

  test("your palate: the strand rises, each head draws, and nothing is left behind", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const { data: profile } = await supabase.from("wine_profiles").select("archetype, identity").eq("user_id", userId).single();
    await page.goto("/palate");
    await expect(page.getByTestId("palate-archetype")).toHaveText(profile!.archetype, { timeout: 20_000 });
    await expect(page.getByTestId("palate-dna")).toBeVisible();

    await expect.poll(async () => (await restOf(page, "main")).running, { timeout: 20_000 }).toBe(0);
    const rest = await restOf(page, "main");
    expect(rest).toEqual({ running: 0, invisible: [], clipped: 0, inline: 0, wordSpans: 0 });
    // The strand's header rests with no transform of its own
    expect(await page.locator("main header").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
    const still = await asBrowser(page, renderPalateMark(profile!.identity.genome, { size: 176 }));
    expect(await page.locator("main header").getByTestId("palate-mark").innerHTML()).toBe(still);
  });
});

test.describe("The rewards — a verdict changed on the wine page (motion on)", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  // A rated row that resolves to nothing, rated and re-rated "It was fine":
  // 0 points either way, so the DNA never moves. afterEach deletes it and
  // puts back the identity fields the milestone hook may silently refresh
  // (wine-page.spec.ts's discipline); journal_rerated is append-forever.
  const WINE = "[e2e] Zzyzx Press Check 2020";
  let restore: { identity: Record<string, unknown> | null; eventIds: Set<string> } | null = null;

  test.afterEach(async ({ page }) => {
    if (!restore) return;
    const { identity, eventIds } = restore;
    restore = null;
    const { supabase, userId } = await testDb();
    await page.goto("about:blank").catch(() => {});
    await supabase.from("wine_interactions").delete().eq("user_id", userId).eq("wine_name", WINE);
    const { data: eventsNow } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
    for (const e of eventsNow ?? []) {
      if (!eventIds.has(e.id)) await supabase.from("dna_timeline").delete().eq("id", e.id);
    }
    if (identity) await supabase.from("wine_profiles").update(identity).eq("user_id", userId);
  });

  test("Change → a tile: the tile that was tapped is the one that presses, and Keep stays with the tiles through the hold", async ({ page }) => {
    const { supabase, userId } = await testDb();
    await supabase.from("wine_interactions").delete().eq("user_id", userId).eq("wine_name", WINE);
    const { data: identity } = await supabase
      .from("wine_profiles").select("archetype, identity, red_count, white_count").eq("user_id", userId).single();
    const { data: events } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
    restore = { identity, eventIds: new Set((events ?? []).map((e) => e.id)) };
    await supabase.from("wine_interactions").insert({
      user_id: userId, wine_name: WINE, interaction_type: "had", rating: "fine", source_url: "e2e_press",
    });

    await page.goto(`/wine?name=${encodeURIComponent(WINE)}`);
    const wine = page.getByTestId("wine-page");
    await expect(page.getByTestId("wine-verdict")).toContainText("It was fine", { timeout: 20_000 });
    await page.getByTestId("wine-change").click();
    await expect(wine.getByRole("group", { name: "Change your verdict" })).toBeVisible();
    await expect(wine.getByRole("button", { name: /^Keep/ })).toBeVisible();

    const seen = await page.evaluate(async () => {
      const host = document.querySelector('[data-testid="wine-page"]')!;
      const tile = host.querySelector('[data-testid="rating-tile-fine"]') as HTMLButtonElement;
      const keep = Array.from(host.querySelectorAll("button")).find((b) => /^Keep/.test(b.textContent || "")) as HTMLButtonElement;
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      tile.click();
      await frame();
      await frame();
      return {
        // The SAME button: a rebuilt one would be pressed already, with nothing to play
        sameTile: host.querySelector('[data-testid="rating-tile-fine"]') === tile,
        pressed: tile.hasAttribute("data-pressed"),
        pressing: tile.isConnected && tile.getAnimations().length > 0,
        prompt: host.querySelector('[role="group"]')?.getAttribute("aria-label"),
        keepStays: keep.isConnected,
        keepDisabled: keep.disabled,
        keepSays: keep.textContent,
      };
    });
    expect(seen).toEqual({
      sameTile: true, pressed: true, pressing: true, prompt: "Change your verdict",
      keepStays: true, keepDisabled: true, keepSays: "Keep 😐 It was fine",
    });

    // Then the verdict takes the tiles' place, as it always did
    await expect(page.getByTestId("wine-verdict")).toContainText("It was fine", { timeout: 10_000 });
    await expect(wine.getByTestId("rating-tile-fine")).toHaveCount(0);
    await expect(page.getByTestId("wine-growth")).toHaveCount(0); // no moment, no bloom
  });
});

test.describe("The rewards — reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("a tap is answered at once: no hold, no word spans, and the saved step's bloom is already in its new shape", async ({ page }) => {
    await watchMotion(page);
    await page.goto("/motion-specimen");
    await expect(page.getByTestId("specimen-preference")).toContainText("Reduced motion is on", { timeout: 15_000 });

    // The done line takes the tiles' place on the tap, as it always did
    const holder = page.getByTestId("specimen-tiles");
    const swapped = await page.evaluate(async () => {
      const host = document.querySelector('[data-testid="specimen-tiles"]')!;
      const tile = host.querySelector('[data-testid="rating-tile-loved"]') as HTMLButtonElement;
      tile.click();
      const pressing = tile.getAnimations().length;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { pressing, tilesGone: !host.querySelector("button"), line: host.querySelector("p")?.textContent };
    });
    expect(swapped).toEqual({ pressing: 0, tilesGone: true, line: "❤️ Loved it — noted in your journal." });
    expect(await holder.locator("p").evaluate((el) => el === document.activeElement)).toBe(true);

    // The saved step: the new shape from the first frame, at the big size
    const after = (await markOf(page, "specimen-saved-after")).html;
    const frames = await page.evaluate(async () => {
      const host = document.querySelector('[data-testid="specimen-saved"]')!;
      const seen = new Set<string>();
      (document.querySelector('[data-testid="specimen-saved-play-grown"]') as HTMLElement).click();
      for (let i = 0; i < 40; i++) {
        const mark = host.querySelector('[data-testid="palate-mark"]');
        if (mark) seen.add(mark.innerHTML);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return Array.from(seen);
    });
    expect(frames).toEqual([after]);
    await expect(page.getByTestId("log-saved").locator("h1")).toHaveText("Ken Forrester just joined your DNA");
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 10_000 }).toBe(0);
    expect((await motionSeen(page)).wordSpans).toBe(0);
  });
});

// ─── The waits (Session 5, README §8.5) ───

const WAIT_LIST = `Ken Forrester Old Vine Chenin Blanc, Stellenbosch 2022...$38
Raats Original Chenin Blanc, Stellenbosch 2022...$48
Kanonkop Pinotage, Stellenbosch 2019...$68
Meerlust Rubicon, Stellenbosch 2018...$92
Hamilton Russell Pinot Noir, Walker Bay 2020...$85
Domaine William Fèvre Chablis Premier Cru 2021...$78
Sancerre, Domaine Vacheron 2022...$62
Pommard Premier Cru, Domaine de Courcel 2019...$132
Mullineux Syrah, Swartland 2020...$72
Catena Zapata Malbec, Mendoza 2020...$58`;
const SOMM_SUMMARY = "A list that leans Cape, with two French detours worth the fare. Your lane tonight is white with backbone — three bottles below, each a different kind of yes.";
const SOMM_NOTES = [
  "With the roast chicken, this is the bottle — sea-cooled and nervy, with your kind of backbone. It drinks like something twice the price, and it will only get better as the evening goes on.",
  "Your home grape at a kind price. Honeyed pear up front, that waxy old-vine grip underneath — the one to open while you decide on the rest.",
  "Trust us on this one — off your usual map, but it rhymes with everything you love.",
];

/**
 * A scripted Somm: the route is held until the test releases it, then
 * answers with the first two picks on screen (so their notes are REWRITTEN)
 * and one candidate that isn't (so a pick CHANGES). No Claude call.
 */
async function scriptSomm(page: Page) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const script = { kept: [] as string[], added: "", dropped: [] as string[] };
  await page.route("**/api/somm-picks", async (route) => {
    const body = route.request().postDataJSON();
    await held;
    const shown: string[] = await page.getByTestId("pick-card")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-wine")!));
    const index = (name: string) => body.candidates.findIndex((c: { name: string }) => c.name === name);
    const other = body.candidates.findIndex((c: { name: string }) => !shown.includes(c.name));
    script.kept = shown.slice(0, 2);
    script.added = body.candidates[other].name;
    script.dropped = shown.slice(2);
    await route.fulfill({
      json: {
        picks: [
          { i: index(shown[0]), role: "top", note: SOMM_NOTES[0] },
          { i: index(shown[1]), role: "value", note: SOMM_NOTES[1] },
          { i: other, role: "adventure", note: SOMM_NOTES[2] },
        ],
        sommSummary: SOMM_SUMMARY,
      },
    });
  });
  return { release: () => release(), script };
}

/** Everything the reading view shows, from before the list is handed over. */
const watchReading = (page: Page) => page.evaluate(() => {
  const seen = {
    lines: [] as string[], ticker: [] as { name: string; line: string }[],
    breathing: false, left: false, headDuring: false, tickerOwn: [] as string[],
  };
  (window as any).__reading = seen;
  const read = () => {
    const view = document.querySelector('[data-testid="processing-spinner"]') as HTMLElement | null;
    if (!view) return;
    const line = view.querySelector('[aria-live="polite"]')?.textContent || "";
    if (line && seen.lines[seen.lines.length - 1] !== line) seen.lines.push(line);
    const ticker = view.querySelector('[data-testid="reading-ticker"]') as HTMLElement | null;
    const name = ticker?.textContent || "";
    if (name && !seen.ticker.some((t) => t.name === name)) seen.ticker.push({ name, line });
    // What the slot rests at while it shows a name — the opacity each flick
    // fades up TO, and the last name fades out FROM
    if (name && ticker && !seen.tickerOwn.includes(ticker.style.opacity)) seen.tickerOwn.push(ticker.style.opacity);
    const mark = view.querySelector('[data-testid="palate-mark"]') as HTMLElement | null;
    if (mark && getComputedStyle(mark).animationName === "house-breathe") seen.breathing = true;
    if (view.style.opacity === "0") seen.left = true;
    if (document.querySelector('[data-testid="running-head"]')) seen.headDuring = true;
  };
  read();
  new MutationObserver(read).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
});
const readingSeen = (page: Page) => page.evaluate(() => (window as any).__reading as {
  lines: string[]; ticker: { name: string; line: string }[]; breathing: boolean; left: boolean; headDuring: boolean;
  tickerOwn: string[];
});

/**
 * Everything the Somm's landing does to Your picks, from before it lands:
 * which note each pick has worn (and in what order the Somm's arrived), and
 * every height the Somm's block and the first pick's note box pass through.
 */
const watchLanding = (page: Page) => page.evaluate(() => {
  const seen = {
    notes: {} as Record<string, string[]>, sommOrder: [] as string[],
    blockHeights: [] as number[], noteHeights: [] as number[], clipped: 0, done: false,
  };
  (window as any).__landing = seen;
  const firstWine = document.querySelector('[data-testid="pick-card"]')!.getAttribute("data-wine");
  const push = (list: number[], el: Element | null | undefined) => {
    if (!el) return;
    const h = Math.round(el.getBoundingClientRect().height * 10) / 10;
    if (list[list.length - 1] !== h) list.push(h);
  };
  const read = () => {
    document.querySelectorAll('[data-testid="pick-card"]').forEach((card) => {
      const wine = card.getAttribute("data-wine")!;
      const worn = (seen.notes[wine] ||= []);
      for (const id of ["pick-note", "somm-note"]) {
        if (card.querySelector(`[data-testid="${id}"]`) && !worn.includes(id)) {
          worn.push(id);
          if (id === "somm-note") seen.sommOrder.push(wine);
        }
      }
    });
    const block = document.querySelector('[data-testid="somm-thinking"], [data-testid="somm-summary"]');
    push(seen.blockHeights, block?.parentElement);
    const first = Array.from(document.querySelectorAll('[data-testid="pick-card"]'))
      .find((card) => card.getAttribute("data-wine") === firstWine);
    push(seen.noteHeights, first?.querySelector('[data-testid="pick-note"], [data-testid="somm-note"]')?.parentElement);
    seen.clipped = Math.max(seen.clipped, Array.from(document.querySelectorAll("main div"))
      .filter((el) => (el as HTMLElement).style.overflow === "hidden").length);
  };
  const frame = () => {
    read();
    if (!seen.done) requestAnimationFrame(frame);
  };
  frame();
  new MutationObserver(read).observe(document.body, { childList: true, subtree: true, attributes: true });
});
const landingSeen = (page: Page, stop = false) => page.evaluate((done) => {
  const seen = (window as any).__landing;
  if (done) seen.done = true;
  return seen as {
    notes: Record<string, string[]>; sommOrder: string[];
    blockHeights: number[]; noteHeights: number[]; clipped: number;
  };
}, stop);

/** Eased, not jumped: the heights between the first and the last all lie
 *  between them, move one way only, and there are several of them. */
function expectEased(heights: number[], what: string) {
  const from = heights[0];
  const to = heights[heights.length - 1];
  expect(Math.abs(to - from), `${what} never changed height: ${JSON.stringify(heights)}`).toBeGreaterThan(8);
  const between = heights.slice(1, -1);
  expect(between.length, `${what} jumped from ${from} to ${to}`).toBeGreaterThanOrEqual(5);
  const sign = Math.sign(to - from);
  for (let i = 1; i < heights.length; i++) {
    expect(Math.sign(heights[i] - heights[i - 1]) === sign, `${what} went back on itself: ${JSON.stringify(heights)}`).toBe(true);
  }
}

test.describe("The waits — motion on", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the reading breathes and shows only what it read; the picks arrive in ink; the Somm's words are written in over the engine's", async ({ page }) => {
    test.setTimeout(120_000);
    const { supabase, userId } = await testDb();
    const analyzedBefore = await countEvents(supabase, userId, "menu_analyzed");
    await watchMotion(page);
    const somm = await scriptSomm(page);
    const rec = new RecommendPage(page);
    await rec.goto();
    await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });
    await rec.pasteToggle.click();
    await rec.wineListTextarea.fill(WAIT_LIST);
    await watchReading(page);
    await rec.analyzeButton.click();

    // ── The reading ──
    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 20_000 });
    const reading = await readingSeen(page);
    expect(reading.lines).toEqual([
      "Reading 10 wines…", "Weighing them against your DNA…", "Five bottles, five kinds of yes.",
    ]);
    expect(reading.breathing, "the bloom never breathed").toBe(true);
    expect(reading.headDuring, "the reading is full screen: no running head").toBe(false);
    expect(reading.left, "the view never played out before the picks arrived").toBe(true);
    // The ticker: more than one name went past, every one of them is on the
    // list, and none was first shown after the weighing began
    expect(reading.ticker.length).toBeGreaterThan(1);
    const onTheList = WAIT_LIST.toLowerCase();
    for (const { name, line } of reading.ticker) {
      for (const word of name.toLowerCase().match(/[a-zà-ÿ]{3,}/g) ?? []) {
        expect(onTheList, `the ticker showed "${name}", which is not on the list`).toContain(word);
      }
      expect(line, `"${name}" was shown while the line read "${line}"`).toMatch(/^Reading /);
    }
    // A name flicks up to the slot's own opacity and the last fades out
    // from it: that has to be 1 (the meta style's alpha rides its color),
    // or every name would peak at full ink and snap back
    expect(reading.tickerOwn.filter((own) => own !== "0")).toEqual(["1"]);

    // A re-render in the middle of the arrival — Adjust opened and closed —
    // must not move a rule's origin out from under a draw still pending:
    // every pick's rule draws from its left end
    await page.getByRole("button", { name: "Adjust ›" }).click();
    await page.getByRole("button", { name: "Adjust ›" }).click();
    const origins = await page.locator('[data-testid="pick-card"] h2 > span[aria-hidden="true"]:last-child')
      .evaluateAll((rules) => rules.map((rule) => getComputedStyle(rule).transformOrigin.split(" ")[0]));
    expect(origins).toEqual(["0px", "0px", "0px", "0px", "0px"]);

    // ── The picks have arrived, and the Somm is still tasting ──
    await expect(page.getByTestId("somm-thinking")).toContainText("The Somm is tasting");
    await expect(rec.pickCards).toHaveCount(5);
    await expect(page.getByTestId("pick-note")).toHaveCount(5);
    await expect(page.getByTestId("somm-note")).toHaveCount(0);
    await expect.poll(() => finiteAnimations(page), { timeout: 20_000 }).toBe(0);
    expect(await leftBehind(page)).toEqual({ transformed: 0, clipped: 0, invisible: 0, inline: 0, wordSpans: 0 });
    // Every control was live the whole time it was arriving
    await expect(page.getByTestId("choose-pick")).toHaveCount(5);
    const engineNote = await rec.pickCards.first().getByTestId("pick-note").textContent();

    // ── The Somm lands ──
    await watchLanding(page);
    somm.release();
    const summary = page.getByTestId("somm-summary");
    await expect(summary.locator("p")).toHaveText(SOMM_SUMMARY, { timeout: 15_000 });
    await expect(page.getByTestId("somm-thinking")).toHaveCount(0);
    await expect(page.getByTestId("somm-note")).toHaveCount(3, { timeout: 20_000 });
    await expect(rec.pickCards).toHaveCount(3);
    const { kept, added, dropped } = somm.script;
    const card = (wine: string) => page.locator(`[data-testid="pick-card"][data-wine="${wine}"]`);
    await expect(card(kept[0]).getByTestId("somm-note")).toHaveText(`“${SOMM_NOTES[0]}”`);
    await expect(card(kept[1]).getByTestId("somm-note")).toHaveText(`“${SOMM_NOTES[1]}”`);
    await expect(card(added).getByTestId("somm-note")).toHaveText(`“${SOMM_NOTES[2]}”`);
    for (const wine of dropped) await expect(card(wine)).toHaveCount(0);
    await expect(page.getByTestId("pick-note")).toHaveCount(0);

    // Everything written settles into plain text, and nothing is left behind
    await expect.poll(() => finiteAnimations(page), { timeout: 20_000 }).toBe(0);
    const landing = await landingSeen(page, true);
    for (const el of [summary.locator("p"), card(kept[0]).getByTestId("somm-note"), card(kept[1]).getByTestId("somm-note")]) {
      expect(await el.evaluate((node) => node.childNodes.length === 1 && node.firstChild?.nodeType === Node.TEXT_NODE)).toBe(true);
    }
    expect((await motionSeen(page)).wordSpans, "the Somm's words were never written word by word").toBeGreaterThan(20);
    expect(await leftBehind(page)).toEqual({ transformed: 0, clipped: 0, invisible: 0, inline: 0, wordSpans: 0 });
    expect(await page.evaluate(() => Array.from(document.querySelectorAll("main *"))
      .filter((el) => (el as HTMLElement).style.overflow === "hidden").length),
    "a box kept its ease's clipping").toBe(0);

    // The picks the Somm kept wore the engine's note, then the Somm's — in
    // rank order; the one it added never wore an engine note at all
    expect(landing.notes[kept[0]]).toEqual(["pick-note", "somm-note"]);
    expect(landing.notes[kept[1]]).toEqual(["pick-note", "somm-note"]);
    expect(landing.notes[added]).toEqual(["somm-note"]);
    expect(landing.sommOrder.indexOf(kept[0])).toBeLessThan(landing.sommOrder.indexOf(kept[1]));
    expect(engineNote).not.toBe(`“${SOMM_NOTES[0]}”`);
    // The one layout animation: both boxes eased to their new height
    expect(landing.clipped, "nothing was ever clipped: no height eased").toBeGreaterThan(0);
    expectEased(landing.blockHeights, "the Somm's block");
    expectEased(landing.noteHeights, "the first pick's note");

    // One analysis, one ledger row — the Somm's outcome riding it
    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(analyzedBefore + 1);
    const event = await latestEvent(supabase, userId, "menu_analyzed");
    expect(event!.payload.wines_parsed).toBe(10);
    expect(event!.payload.somm.outcome).toBe("first_attempt");
  });
});

// ─── The quiet pages (Session 5, README §8.6) ───

/** Every entrance the page plays inside <main>, from before its first script. */
async function watchEntrances(page: Page) {
  await page.addInitScript(() => {
    const calls: { tag: string; rises: boolean; fades: boolean; duration: unknown }[] = [];
    (window as any).__entrances = calls;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes: any, timing: any) {
      const first = Array.isArray(keyframes) ? keyframes[0] : null;
      if (this.closest("main") && first) {
        calls.push({
          tag: this.tagName.toLowerCase(),
          rises: typeof first.transform === "string" && first.transform.startsWith("translateY"),
          fades: first.opacity === 0 && first.transform === undefined,
          duration: timing?.duration,
        });
      }
      return animate.call(this, keyframes, timing);
    };
  });
}
/** The distinct entrances, in the order they first played. (`next dev` runs
 *  under StrictMode, which mounts every effect twice: each entrance is
 *  started, cancelled and started again — one entrance, two calls.) */
const entrances = (page: Page) => page.evaluate(() => {
  const calls = (window as any).__entrances as { tag: string; rises: boolean; fades: boolean; duration: unknown }[];
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = JSON.stringify(call);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

/** At rest: nothing in <main> carries a transform or a clip (a control may
 *  rest at its own opacity — Search's Clear is invisible until there is a
 *  query). */
const restsClean = (page: Page) => page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("main *")).filter((el): el is HTMLElement => el instanceof HTMLElement);
  return {
    transformed: all.filter((el) => getComputedStyle(el).transform !== "none").length,
    clipped: all.filter((el) => getComputedStyle(el).clipPath !== "none").length,
    inline: all.filter((el) => el.style.transform || el.style.clipPath).length,
  };
});

test.describe("The quiet pages — motion on", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  const PAGES = [
    { path: "/journal", ready: (page: Page) => page.getByRole("heading", { name: "Journal", level: 1 }), title: "h1" },
    { path: "/account", ready: (page: Page) => page.getByTestId("account-name-heading"), title: "div" },
    { path: "/search", ready: (page: Page) => page.getByTestId("search-input"), title: "div" },
  ];

  for (const { path, ready, title } of PAGES) {
    test(`${path}: the title rises, the rest comes in on one fade, and nothing is left behind`, async ({ page }) => {
      await watchEntrances(page);
      await page.goto(path);
      await expect(ready(page)).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => finiteAnimations(page), { timeout: 15_000 }).toBe(0);
      // Two entrances, and only two: lists are for scanning — no row has its own
      expect(await entrances(page)).toEqual([
        { tag: title, rises: true, fades: false, duration: 700 },
        { tag: "div", rises: false, fades: true, duration: 300 },
      ]);
      expect(await restsClean(page)).toEqual({ transformed: 0, clipped: 0, inline: 0 });
    });
  }

  test("a wine's page: its name rises, the rest fades in together — and stepping back plays the journal's entrance again", async ({ page }) => {
    await watchEntrances(page);
    await page.goto("/journal");
    const row = page.getByTestId("journal-row").first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => finiteAnimations(page), { timeout: 15_000 }).toBe(0);
    await page.evaluate(() => { (window as any).__entrances.length = 0; });
    await row.click();
    await expect(page.getByTestId("wine-page").locator("h1")).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => finiteAnimations(page), { timeout: 15_000 }).toBe(0);
    expect(await entrances(page)).toEqual([
      { tag: "header", rises: true, fades: false, duration: 700 },
      { tag: "div", rises: false, fades: true, duration: 300 },
    ]);
    expect(await restsClean(page)).toEqual({ transformed: 0, clipped: 0, inline: 0 });

    // Entrances play once per mount: back by the trail, the journal arrives again
    await page.evaluate(() => { (window as any).__entrances.length = 0; });
    await page.getByTestId("running-head-back").click();
    await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await entrances(page)).length, { timeout: 15_000 }).toBe(2);
    await expect.poll(() => finiteAnimations(page), { timeout: 15_000 }).toBe(0);
  });
});

test.describe("The quiet pages — reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the journal simply fades in: nothing rises, nothing waits", async ({ page }) => {
    await watchEntrances(page);
    await page.goto("/journal");
    await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => finiteAnimations(page), { timeout: 15_000 }).toBe(0);
    expect(await entrances(page)).toEqual([
      { tag: "h1", rises: false, fades: true, duration: 150 },
      { tag: "div", rises: false, fades: true, duration: 150 },
    ]);
  });
});

/** A scripted label read: held until released, then one known bottle. */
async function scriptLabel(page: Page) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/scan-label", async (route) => {
    await held;
    await route.fulfill({
      json: { name: "Pinotage", producer: "Kanonkop", vintage: 2019, region: "Stellenbosch", country: "South Africa", confidence: "high" },
    });
  });
  return () => release();
}

/** The label read's lines and whether its bloom breathed, from now on. */
const watchLabelRead = (page: Page) => page.evaluate(() => {
  const seen = { lines: [] as string[], breathing: false, ticker: "", headDuring: false };
  (window as any).__label = seen;
  const read = () => {
    const view = document.querySelector('[data-testid="bottle-processing"]');
    if (!view) return;
    const line = view.querySelector('[aria-live="polite"]')?.textContent || "";
    if (line && seen.lines[seen.lines.length - 1] !== line) seen.lines.push(line);
    const mark = view.querySelector('[data-testid="palate-mark"]') as HTMLElement | null;
    if (mark && getComputedStyle(mark).animationName === "house-breathe") seen.breathing = true;
    seen.ticker += view.querySelector('[data-testid="reading-ticker"]')?.textContent || "";
    if (document.querySelector('[data-testid="running-head"]')) seen.headDuring = true;
  };
  read();
  new MutationObserver(read).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
});
const labelSeen = (page: Page) => page.evaluate(() => (window as any).__label as {
  lines: string[]; breathing: boolean; ticker: string; headDuring: boolean;
});

test.describe("The waits, Log's label — motion on", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the bloom breathes while the label is read; the line says what it found; then the rate step has it", async ({ page }) => {
    const release = await scriptLabel(page);
    const log = new BottleLogPage(page);
    await log.goto();
    await watchLabelRead(page);
    await log.uploadLabel("label-test-01.jpg");
    const view = page.getByTestId("bottle-processing");
    await expect(view).toBeVisible({ timeout: 15_000 });
    await expect(view).toContainText("Producer, vintage, grape…");
    await expect(view.getByTestId("palate-mark")).toHaveCSS("animation-name", "house-breathe");
    release();
    // The rate step arrives with what was read — nothing saved here
    await expect(log.confirmState).toBeVisible({ timeout: 15_000 });
    await expect(log.wineNameInput).toHaveValue("Kanonkop Pinotage");
    const seen = await labelSeen(page);
    expect(seen.lines).toEqual(["Producer, vintage, grape…", "Kanonkop Pinotage 2019"]);
    expect(seen.breathing).toBe(true);
    expect(seen.ticker, "a label has no list: its ticker never shows a thing").toBe("");
    expect(seen.headDuring, "the label read is full screen: no running head").toBe(false);
    await expect.poll(() => finiteAnimations(page), { timeout: 10_000 }).toBe(0);
  });
});

const PAGE_ONE = WAIT_LIST.split("\n").map((line) => {
  const [name, price] = line.split("...$");
  return { name, price: Number(price), color: null, variety: null, region: null, country: null, producer: null, vintage: null };
});
const PAGE_TWO_ERROR = "We couldn’t read that page — try a clearer photo.";

test.describe("The waits, another page — motion on", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("a page that fails (or is cancelled) brings the picks back as they were — its error seen at once, nothing replayed; a page that reads arrives", async ({ page }) => {
    test.setTimeout(120_000);
    const { supabase, userId } = await testDb();
    const analyzedBefore = await countEvents(supabase, userId, "menu_analyzed");
    await watchEntrances(page);
    // The scan is scripted (no Claude call): page one reads, page two fails
    // when released, page three is cancelled, page four reads
    let scans = 0;
    const gates: (() => void)[] = [];
    await page.route("**/api/parse-wine-list", async (route) => {
      scans += 1;
      if (scans === 1) return route.fulfill({ json: { wines: PAGE_ONE, rawText: "" } });
      await new Promise<void>((resolve) => gates.push(resolve));
      if (scans === 2) return route.fulfill({ json: { error: PAGE_TWO_ERROR } });
      return route.fulfill({ json: { wines: [{ ...PAGE_ONE[0], name: "Raats Family Cabernet Franc, Stellenbosch 2020", price: 55 }], rawText: "" } });
    });
    await page.route("**/api/somm-picks", (route) => route.abort());

    const rec = new RecommendPage(page);
    await rec.goto();
    await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });
    await rec.uploadFile("label-test-01.jpg");
    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 30_000 });
    await expect(page.getByTestId("somm-thinking")).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => finiteAnimations(page), { timeout: 20_000 }).toBe(0);
    const picksBefore = await rec.pickCards.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-wine")));
    expect(picksBefore.length).toBe(5);
    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(analyzedBefore + 1);

    // ── Another page, and it fails ──
    await page.evaluate(() => {
      (window as any).__entrances.length = 0;
      // How visible the error is at the moment it first exists: its own
      // opacity times every ancestor's (an entrance waiting on its delay
      // holds its element at 0)
      const seen = { errorOpacity: null as number | null };
      (window as any).__page2 = seen;
      new MutationObserver(() => {
        const error = document.querySelector('[data-testid="add-page-error"]');
        if (!error || seen.errorOpacity !== null) return;
        let opacity = 1;
        for (let el: Element | null = error; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
        seen.errorOpacity = opacity;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.getByTestId("file-input-add-page").setInputFiles("e2e/fixtures/images/label-test-02.jpg");
    await expect(rec.processingSpinner).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => gates.length, { timeout: 15_000 }).toBe(1);
    gates[0]();
    const error = page.getByTestId("add-page-error");
    await expect(error).toHaveText(PAGE_TWO_ERROR, { timeout: 15_000 });
    expect(await page.evaluate(() => (window as any).__page2.errorOpacity), "the error waited behind an entrance").toBe(1);
    // The picks are back exactly as they were, and nothing played to bring them
    await expect(rec.resultsHeading).toHaveText("Your picks");
    expect(await rec.pickCards.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-wine")))).toEqual(picksBefore);
    await expect(page.getByTestId("pick-note")).toHaveCount(5);
    expect(await entrances(page), "the arrival replayed for picks that never left").toEqual([]);
    expect(await finiteAnimations(page)).toBe(0);

    // ── Another page, cancelled mid-read: the same, with nothing to say ──
    await page.getByTestId("file-input-add-page").setInputFiles("e2e/fixtures/images/label-test-02.jpg");
    await expect(rec.processingSpinner).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 15_000 });
    await expect(page.getByTestId("add-page-error")).toHaveCount(0);
    expect(await entrances(page)).toEqual([]);
    expect(await rec.pickCards.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-wine")))).toEqual(picksBefore);
    gates[1]?.(); // the cancelled read lands on nothing

    // ── Another page that READS: picks have landed, and they arrive ──
    await page.getByTestId("file-input-add-page").setInputFiles("e2e/fixtures/images/label-test-02.jpg");
    await expect(rec.processingSpinner).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => gates.length, { timeout: 15_000 }).toBe(3);
    gates[2]();
    await expect(page.getByText(/11 wines across 2 pages/)).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await entrances(page)).length, { timeout: 15_000 }).toBeGreaterThan(5);
    await expect.poll(() => finiteAnimations(page), { timeout: 20_000 }).toBe(0);
    // Only pages that read reach the ledger: the first, and this one
    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(analyzedBefore + 2);
  });
});

test.describe("The waits — reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("no ticker, no exit, nothing written: the Somm's words take the engine's place in one commit", async ({ page }) => {
    test.setTimeout(120_000);
    await watchMotion(page);
    const somm = await scriptSomm(page);
    const rec = new RecommendPage(page);
    await rec.goto();
    await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });
    await rec.pasteToggle.click();
    await rec.wineListTextarea.fill(WAIT_LIST);
    await watchReading(page);
    await rec.analyzeButton.click();

    await expect(rec.resultsHeading).toHaveText("Your picks", { timeout: 20_000 });
    const reading = await readingSeen(page);
    // The same three lines are said — only the motion is gone
    expect(reading.lines).toEqual([
      "Reading 10 wines…", "Weighing them against your DNA…", "Five bottles, five kinds of yes.",
    ]);
    expect(reading.ticker).toEqual([]);
    expect(reading.breathing).toBe(false);
    expect(reading.left).toBe(false);

    await expect(page.getByTestId("somm-thinking")).toBeVisible();
    await expect(page.getByTestId("pick-note")).toHaveCount(5);
    await watchLanding(page);
    somm.release();
    // The specs that poll somm-thinking → 0 read the notes on the very next
    // line: by then everything the Somm said must already be in place
    await expect.poll(() => page.getByTestId("somm-thinking").count(), { timeout: 15_000 }).toBe(0);
    const atOnce = await page.evaluate(() => ({
      summary: document.querySelector('[data-testid="somm-summary"] p')?.textContent,
      somm: document.querySelectorAll('[data-testid="somm-note"]').length,
      engine: document.querySelectorAll('[data-testid="pick-note"]').length,
      cards: document.querySelectorAll('[data-testid="pick-card"]').length,
    }));
    expect(atOnce).toEqual({ summary: SOMM_SUMMARY, somm: 3, engine: 0, cards: 3 });
    const landing = await landingSeen(page, true);
    expect(landing.clipped, "a height was eased under reduced motion").toBe(0);
    expect((await motionSeen(page)).wordSpans).toBe(0);
    await expect.poll(() => finiteAnimations(page), { timeout: 10_000 }).toBe(0);
  });

  test("Log's label read says the same two lines, with nothing breathing", async ({ page }) => {
    const release = await scriptLabel(page);
    const log = new BottleLogPage(page);
    await log.goto();
    await watchLabelRead(page);
    await log.uploadLabel("label-test-01.jpg");
    await expect(page.getByTestId("bottle-processing")).toBeVisible({ timeout: 15_000 });
    release();
    await expect(log.confirmState).toBeVisible({ timeout: 15_000 });
    await expect(log.wineNameInput).toHaveValue("Kanonkop Pinotage");
    const seen = await labelSeen(page);
    expect(seen.lines).toEqual(["Producer, vintage, grape…", "Kanonkop Pinotage 2019"]);
    expect(seen.breathing).toBe(false);
  });
});
