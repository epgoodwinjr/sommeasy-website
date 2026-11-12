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
 * Session 1's foundations were first proved on /motion-specimen (sample
 * content); Session 6 deleted it and moved every check onto real pages
 * (README §16.4), none dropped:
 *
 *   1. A written line ends as ONE plain text node whose textContent is its
 *      source string — and it was genuinely written word by word (Welcome's
 *      headline and its demo's Somm note).
 *   2. An entrance leaves nothing behind: no running animation, no
 *      transform, the element's own opacity (Welcome; the reveal's rows).
 *   3. A control is live while it is still entering (Welcome's entry).
 *   4. The reveal ends with a palate-mark whose markup AND wrapper equal the
 *      static PalateMark for the same genome (/palate's); so does a growth
 *      (identity-shift.spec.ts's real promotions), and a growth asked for
 *      mid-growth (the quiz's header bloom).
 *   5. Breathing is one loop, on the wrapper, only while asked for (the
 *      reading view; /palate and home's marks carry none at rest).
 *   6. Under reduced motion: nothing is written word by word, the mark is
 *      settled at once, nothing loops (the front door, the reveal, the waits).
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
 *      written, settles to one text node and takes focus (a real home rec
 *      row, rated "It was fine" — 0 points — its footprint erased after).
 *  16. Log's saved step on the quiet path (a real "It was fine" save): the
 *      bloom is settled from its first frame, the lines are written and
 *      nothing is left behind. On a promotion the bloom arrives in its OLD
 *      shape and ends on the new one, celebrated — identity-shift.spec.ts's
 *      growth guards, earned through the real /log on the test account.
 *  17. Home and Your palate, signed in: the entrances end, nothing is left
 *      behind, and the crest's bloom is the static mark.
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
 * What writes restores: the reveal saves content-identical refines; a
 * rating is "It was fine" (0 points) and afterEach erases its footprint.
 */

const HEADLINE = "Never guess at a wine list again.";
// The Welcome demo's Somm note (WelcomeDemo.js — sample content)
const DEMO_NOTE = "“Sea-cooled Chardonnay with your kind of nerve. White Burgundy that moved somewhere sunnier.”";

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
const wrapperOf = (mark: ReturnType<Page["locator"]>) =>
  mark.evaluate((el) => ({
    html: el.innerHTML,
    attrs: Array.from(el.attributes)
      .map((a) => `${a.name}=${a.name === "style" ? (el as HTMLElement).style.cssText : a.value}`)
      .sort(),
  }));

/** Each row the reveal's recs entered as: its transform and opacity at rest. */
const recRowsAtRest = (page: Page) =>
  page.getByTestId("reveal-recs").getByTestId("rec-card").evaluateAll((rows) =>
    rows.map((row) => `${getComputedStyle(row).transform}/${getComputedStyle(row).opacity}`));


/** Animations still in play, ignoring loops that were asked for. */
const finiteAnimations = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
  );

/** A line of prose, by locator: what it is made of right now. */
const proseOf = (line: ReturnType<Page["locator"]>) =>
  line.evaluate((el) => ({
    text: el.textContent,
    wordSpans: el.querySelectorAll("[data-word]").length,
    children: el.childNodes.length,
    onlyText: el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE,
  }));

test.describe("Motion on — outcomes, never timings (on Welcome)", () => {
  // Session 1 proved these on /motion-specimen; since Session 6 they are
  // proved on the real front door, signed out (README §16.4)
  test.use({ storageState: { cookies: [], origins: [] }, contextOptions: { reducedMotion: "no-preference" } });

  test.beforeEach(async ({ page }) => {
    await watchMotion(page);
  });

  test("a written line is its source text throughout, and ends as one plain text node", async ({ page }) => {
    // Tall enough that the demo plays at once: the headline and the Somm's
    // note in the demo are both written in
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/");

    // It is written word by word (the spans exist)… and its textContent is
    // the source string even mid-write — read in the frame the spans are there
    const midWrite = await page.evaluate(async () => {
      const lines: [string, string][] = [["headline", "h1"], ["note", '[data-testid="welcome-demo-note"]']];
      const seen: Record<string, string | null> = {};
      const deadline = performance.now() + 20_000;
      while (performance.now() < deadline && Object.keys(seen).length < lines.length) {
        for (const [key, selector] of lines) {
          const el = document.querySelector(selector);
          if (!(key in seen) && el?.querySelector("[data-word]")) seen[key] = el.textContent;
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return seen;
    });
    expect(midWrite).toEqual({ headline: HEADLINE, note: DEMO_NOTE });

    // Settled: no word spans, one text node, the same text — what a plain
    // <h1>{text}</h1> gives a screen reader
    for (const [line, source] of [[page.locator("h1"), HEADLINE], [page.getByTestId("welcome-demo-note"), DEMO_NOTE]] as const) {
      await expect.poll(async () => (await proseOf(line)).onlyText, { timeout: 20_000 }).toBe(true);
      const settled = await proseOf(line);
      expect(settled.wordSpans).toBe(0);
      expect(settled.children).toBe(1);
      expect(settled.text).toBe(source);
    }
    // Both lines were split: at least a span per word of each
    expect((await motionSeen(page)).wordSpans).toBeGreaterThanOrEqual(HEADLINE.split(" ").length + DEMO_NOTE.split(" ").length);
  });

  test("an entrance leaves nothing behind", async ({ page }) => {
    // Short enough that the demo waits below the fold (idle: it shows
    // nothing) — so every animation on the page is an entrance, and ends
    await page.setViewportSize({ width: 375, height: 560 });
    await page.goto("/");
    await expect.poll(async () => (await proseOf(page.locator("h1"))).onlyText, { timeout: 20_000 }).toBe(true);
    await expect(page.getByTestId("welcome-demo")).toHaveAttribute("data-state", "idle", { timeout: 10_000 });
    await expect.poll(() => finiteAnimations(page), { timeout: 10_000 }).toBe(0);

    const settled = await page.evaluate(() => {
      const css = (el: Element) => getComputedStyle(el);
      const entry = Array.from(document.querySelectorAll("button")).find((b) => /Build your palate/.test(b.textContent || ""))!;
      const [label, leader, circle] = Array.from(entry.children);
      const sub = Array.from(document.querySelectorAll("p")).find((p) => /Tell us what you like/.test(p.textContent || ""))!;
      const masthead = document.querySelector('img[src="/protea-icon.png"]')!.parentElement!;
      const all = Array.from(document.body.querySelectorAll("*")).filter((el): el is HTMLElement => el instanceof HTMLElement);
      return {
        // A rise (the sub line), a pop (the entry's circle), a fade (the
        // masthead), a draw (the entry's leader)
        riseTransform: css(sub).transform,
        riseOpacity: css(sub).opacity,
        labelTransform: css(label).transform,
        popTransform: css(circle).transform,
        popOpacity: css(circle).opacity,
        fadeOpacity: css(masthead).opacity,
        leaderClip: css(leader).clipPath,
        // Nothing at rest carries a transform, a clip or a zero opacity
        transformed: all.filter((el) => css(el).transform !== "none").length,
        clipped: all.filter((el) => css(el).clipPath !== "none").length,
        invisible: all.filter((el) => css(el).opacity === "0").map((el) => el.tagName),
        // …and no inline style an entrance could have left
        inlineLeft: all.filter((el) => el.style.transform || el.style.clipPath || el.style.opacity === "0").length,
      };
    });
    expect(settled.riseTransform).toBe("none");
    // The element's own opacity wins — the sub line rests at 0.55, not 1
    expect(settled.riseOpacity).toBe("0.55");
    expect(settled.labelTransform).toBe("none");
    expect(settled.popTransform).toBe("none");
    expect(settled.popOpacity).toBe("1");
    expect(settled.fadeOpacity).toBe("1");
    expect(settled.leaderClip).toBe("none");
    expect(settled.transformed).toBe(0);
    expect(settled.clipped).toBe(0);
    expect(settled.invisible).toEqual([]);
    expect(settled.inlineLeft).toBe(0);
    // (Rows entering ROW_STEP apart rest at none/1: the reveal's recs, below)
  });

  test("a control is live while it is still entering", async ({ page }) => {
    await page.goto("/");
    // Hydrated (the headline has started to write), and the entry — which
    // enters after it — is not all there yet
    await expect.poll(async () => (await motionSeen(page)).wordSpans, { timeout: 15_000 }).toBeGreaterThan(0);
    const entry = page.getByRole("button", { name: "Build your palate" });
    const box = await entry.boundingBox();
    const labelOpacity = await entry.locator("> span").first().evaluate((el) => Number(getComputedStyle(el).opacity));
    // force: no waiting for the entry to stop moving — the tap lands mid-entrance
    await entry.click({ force: true });
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 10_000 });
    expect(labelOpacity).toBeLessThan(1);
    // …on a control at its full size
    expect(box!.height).toBeGreaterThanOrEqual(40);
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

    // A change of mind mid-growth: two answers in one go, the second landing
    // while the first is still growing. It waits its turn, and the mark
    // ends on the LAST shape asked for
    const staticFor = (countries: string[]) =>
      asBrowser(page, renderPalateMark(composeIdentity({ ...ANSWERS, countries }).genome, { size: 44 }));
    const three = await staticFor(["france", "south_africa", "italy"]);
    const four = await staticFor(["france", "south_africa", "italy", "spain"]);
    expect(new Set([two, three, four]).size).toBe(3);
    const between = await page.evaluate(() => {
      const option = (name: string) => Array.from(document.querySelectorAll("main button[aria-pressed]"))
        .find((el) => (el as HTMLElement).innerText.includes(name)) as HTMLElement;
      const live = document.querySelector('header [data-testid="palate-mark"]')!;
      option("Italy").click();
      option("Spain").click();
      return live.innerHTML;
    });
    // Neither shape had been reached when the second answer came
    expect(between).not.toBe(three);
    expect(between).not.toBe(four);
    await expect.poll(() => mark.innerHTML(), { timeout: 15_000 }).toBe(four);
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
    // Prose, whole and plain, never split: the headline and the Somm's note
    for (const [line, source] of [[page.locator("h1"), WELCOME_HEADLINE], [page.getByTestId("welcome-demo-note"), DEMO_NOTE]] as const) {
      expect(await proseOf(line)).toEqual({ text: source, wordSpans: 0, children: 1, onlyText: true });
    }
    expect((await motionSeen(page)).wordSpans).toBe(0);

    // The quiz's bloom: bare, then the settled mark at once — straight to the
    // new shape, with no frame in between
    await page.getByRole("button", { name: "Build your palate" }).click();
    await expect(page.getByText("Step 1 of 5")).toBeVisible({ timeout: 15_000 });
    const mark = headerMark(page);
    expect(await mark.innerHTML()).not.toContain("<path");
    await mark.evaluate((el) => {
      const frames = new Set<string>();
      (window as any).__bloomFrames = frames;
      new MutationObserver(() => frames.add(el.innerHTML)).observe(el, { childList: true, subtree: true });
    });
    await page.getByRole("button", { name: /France/ }).first().click();
    const one = await asBrowser(page, renderPalateMark(composeIdentity({ ...ANSWERS, countries: ["france"] }).genome, { size: 44 }));
    await expect.poll(() => mark.innerHTML()).toBe(one);
    // Thirty frames later it has painted the new shape and nothing else
    await page.evaluate(async () => { for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r)); });
    expect(await page.evaluate(() => Array.from((window as any).__bloomFrames))).toEqual([one]);

    // Every entrance was a short fade: all done, nothing left running, and
    // no word was ever split
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 10_000 }).toBe(0);
    expect((await motionSeen(page)).wordSpans).toBe(0);
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
    expect(await recRowsAtRest(page)).toEqual(["none/1"]);
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
    // The recs entered as rows, ROW_STEP apart, and every one rests at none/1
    const rows = await recRowsAtRest(page);
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows)).toEqual(new Set(["none/1"]));
    const drawn = await wrapperOf(revealMark(page));
    expect(drawn.html).toContain("<path");

    // One save, one ledger row (fire-and-forget — poll) — however many
    // times the button was tapped
    await expect.poll(() => countEvents(supabase, userId, "quiz_completed"), { timeout: 15_000 }).toBe(eventsBefore + 1);
    expect(holding, "the double tap saved the profile more than once").toBe(1);
    expect(await countEvents(supabase, userId, "quiz_completed")).toBe(eventsBefore + 1);

    // At rest the drawn bloom IS what PalateMark renders — the same markup
    // and the same wrapper (testid, aria-hidden, style) as /palate's static
    // mark of the same genome at the same size
    await page.goto("/palate");
    const still176 = await wrapperOf(page.locator("main header").getByTestId("palate-mark"));
    expect(still176.html).toBe(still);
    expect(drawn.html).toBe(still176.html);
    expect(drawn.attrs).toEqual(still176.attrs);
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

// A rating's footprint, put back. "It was fine" moves no DNA (0 points:
// the engine returns before any accumulation write, and a fine bottle
// pushes no count), so what a fine rating leaves is its journal row, any
// dna_timeline row it added, and the identity fields the milestone hook may
// silently refresh (every 5th rated bottle). Its wine_events rows are
// append-forever: the guards assert deltas. Erased in afterEach, which runs
// after a failed or timed-out test (wine-page.spec.ts's discipline).
type Footprint = { wines: string[]; profile: Record<string, unknown> | null; eventIds: Set<string> };
let footprint: Footprint | null = null;

async function markFootprint(wines: string[]) {
  const { supabase, userId } = await testDb();
  for (const wine of wines) await supabase.from("wine_interactions").delete().eq("user_id", userId).eq("wine_name", wine);
  const { data: profile } = await supabase
    .from("wine_profiles").select("archetype, identity, red_count, white_count").eq("user_id", userId).single();
  const { data: events } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
  footprint = { wines, profile, eventIds: new Set((events ?? []).map((e) => e.id)) };
  return { supabase, userId };
}

async function eraseFootprint(page: Page) {
  if (!footprint) return;
  const { wines, profile, eventIds } = footprint;
  footprint = null;
  const { supabase, userId } = await testDb();
  // Kill in-flight page JS before touching the DB (the teardown-race rule)
  await page.goto("about:blank").catch(() => {});
  for (const wine of wines) await supabase.from("wine_interactions").delete().eq("user_id", userId).eq("wine_name", wine);
  const { data: eventsNow } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
  for (const e of eventsNow ?? []) {
    if (!eventIds.has(e.id)) await supabase.from("dna_timeline").delete().eq("id", e.id);
  }
  if (profile) await supabase.from("wine_profiles").update(profile).eq("user_id", userId);
}

const FINE_DONE = "😐 It was fine — noted in your journal.";

/** Home's first recommendation, ready to rate: its row, and its wine marked
 *  as this test's footprint. */
async function homeRec(page: Page) {
  await page.goto("/");
  const first = page.getByTestId("rec-card").first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  const wine = (await first.getAttribute("data-wine"))!;
  const db = await markFootprint([wine]);
  // Address the row by its wine: an acted-on row stays put, by name
  const row = page.locator(`[data-testid="rec-card"][data-wine="${wine.replace(/"/g, '\\"')}"]`);
  return { ...db, wine, row };
}

test.describe("The rewards — motion on", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });
  test.afterEach(async ({ page }) => { await eraseFootprint(page); });

  test("a rating tile answers its tap and holds; then the done line is written — whole throughout — and takes focus", async ({ page }) => {
    // A real row: home's first recommendation, rated "It was fine" (0
    // points — the DNA never moves), its footprint erased in afterEach
    await watchMotion(page);
    const { supabase, userId, row } = await homeRec(page);
    const ratedBefore = await countEvents(supabase, userId, "rec_rated");
    // Home has arrived before the tap
    await expect.poll(() => finiteAnimations(page), { timeout: 20_000 }).toBe(0);
    await row.getByRole("button", { name: "🍷 Had it" }).click();
    await expect(row.getByTestId("rating-tile-fine")).toBeEnabled();

    const seen = await row.evaluate(async (host) => {
      const tile = host.querySelector('[data-testid="rating-tile-fine"]') as HTMLButtonElement;
      const other = host.querySelector('[data-testid="rating-tile-liked"]') as HTMLButtonElement;
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      // The done line is the row's focusable line (the Somm's why is a <p> too)
      const doneLine = () => host.querySelector('p[tabindex="-1"]');
      // Watched through the whole write, from before the tap
      const write = { doneAt: 0, wordSpans: 0, texts: [] as string[] };
      (window as any).__doneWrite = write;
      new MutationObserver(() => {
        const line = doneLine();
        if (!line) return;
        if (!write.doneAt) write.doneAt = performance.now();
        const spans = line.querySelectorAll("[data-word]").length;
        write.wordSpans = Math.max(write.wordSpans, spans);
        if (spans && !write.texts.includes(line.textContent || "")) write.texts.push(line.textContent || "");
      }).observe(host, { childList: true, subtree: true, characterData: true, attributes: true });
      const tappedAt = performance.now();
      tile.click();
      const pressing = tile.getAnimations().length; // the press starts on the tap itself
      await frame();
      await frame();
      const held = {
        tilesStill: host.contains(tile),
        doneYet: Boolean(doneLine()),
        pressed: tile.hasAttribute("data-pressed"),
        allDisabled: Array.from(host.querySelectorAll("button")).every((b) => (b as HTMLButtonElement).disabled),
      };
      // While they are held the others step back
      let otherLowest = 1;
      const deadline = performance.now() + 5000;
      while (!write.doneAt && performance.now() < deadline) {
        if (host.contains(other)) otherLowest = Math.min(otherLowest, Number(getComputedStyle(other).opacity));
        await frame();
      }
      return { pressing, held, otherLowest, heldFor: write.doneAt - tappedAt };
    });

    expect(seen.pressing).toBeGreaterThan(0);
    expect(seen.held).toEqual({ tilesStill: true, doneYet: false, pressed: true, allDisabled: true });
    expect(seen.otherLowest).toBeLessThanOrEqual(PRESS.rest + 0.02);
    // A floor, never a ceiling: the done line does not cut the press short
    expect(seen.heldFor).toBeGreaterThanOrEqual(PRESS.holdMs - 40);

    // The done line: written word by word, its text whole at every moment
    // of the write, then one plain text node — and it has the focus
    const line = row.locator('p[tabindex="-1"]');
    await expect(line).toHaveText(FINE_DONE);
    await expect.poll(() => line.evaluate((el) => el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE), { timeout: 10_000 }).toBe(true);
    const write = await page.evaluate(() => (window as any).__doneWrite as { wordSpans: number; texts: string[] });
    expect(write.wordSpans).toBeGreaterThanOrEqual(7);
    expect(write.texts).toEqual([FINE_DONE]);
    expect(await line.textContent()).toBe(FINE_DONE);
    expect(await line.evaluate((el) => el === document.activeElement)).toBe(true);
    await expect(row.getByTestId("rating-tile-fine")).toHaveCount(0);

    // The one rating path: a journal row and its ledger event
    await expect.poll(() => countEvents(supabase, userId, "rec_rated"), { timeout: 15_000 }).toBe(ratedBefore + 1);
    // (Rate again: the wine page's Change brings the tiles back live — below)
  });

  test("the saved step, on the quiet path: the bloom stands settled from its first frame, and the page still arrives in ink", async ({ page }) => {
    // A real save through /log, rated "It was fine": no promotion, no shift
    const QUIET = "[e2e] Zzyzx Quiet Pour 2021";
    const { supabase, userId } = await markFootprint([QUIET]);
    const loggedBefore = await countEvents(supabase, userId, "bottle_logged");
    await page.goto(`/log?q=${encodeURIComponent(QUIET)}`);
    await expect(page.getByTestId("log-search-input")).toHaveValue(QUIET, { timeout: 15_000 });
    await page.getByRole("button", { name: /as written/ }).click();
    const rate = page.getByTestId("bottle-confirm");
    await expect(rate).toBeVisible();
    await rate.getByRole("radio", { name: "It was fine" }).click();

    // Every frame the saved step's bloom paints, and how its headline is
    // set, from before the save
    await page.evaluate(() => {
      const seen = { frames: [] as string[], headlineSpans: 0, stop: false };
      (window as any).__quiet = seen;
      const read = () => {
        const host = document.querySelector('[data-testid="log-saved"]');
        const mark = host?.querySelector('[data-testid="palate-mark"]');
        if (mark && !seen.frames.includes(mark.innerHTML)) seen.frames.push(mark.innerHTML);
        if (host) seen.headlineSpans = Math.max(seen.headlineSpans, host.querySelectorAll("h1 [data-word]").length);
      };
      const loop = () => { read(); if (!seen.stop) requestAnimationFrame(loop); };
      loop();
      new MutationObserver(read).observe(document.body, { childList: true, subtree: true, attributes: true });
    });
    await page.getByTestId("log-save").click();

    const saved = page.getByTestId("log-saved");
    await expect(saved).toBeVisible({ timeout: 30_000 });
    await expect(saved).toHaveAttribute("data-moment", "quiet");
    await expect(saved).toContainText("😐 It was fine");
    await expect(saved.locator("h1")).toHaveText("Noted in your journal");
    await expect.poll(async () => (await restOf(page, '[data-testid="log-saved"]')).running, { timeout: 15_000 }).toBe(0);
    expect(await restOf(page, '[data-testid="log-saved"]')).toEqual({ running: 0, invisible: [], clipped: 0, inline: 0, wordSpans: 0 });

    const seen = await page.evaluate(() => {
      const quiet = (window as any).__quiet;
      quiet.stop = true;
      return quiet as { frames: string[]; headlineSpans: number };
    });
    // One frame, ever: the account's bloom as the save left it (a fifth
    // rating may refresh it silently — never a moment), at 132px, no growth
    const { data: profile } = await supabase.from("wine_profiles").select("identity").eq("user_id", userId).single();
    const settled = await asBrowser(page, renderPalateMark(profile!.identity.genome, { size: 132 }));
    expect(seen.frames).toEqual([settled]);
    expect(seen.headlineSpans).toBeGreaterThan(0); // "Noted in your journal", written

    // The save is the one path: one row, one ledger event
    const { data: rows } = await supabase
      .from("wine_interactions").select("interaction_type, rating").eq("user_id", userId).eq("wine_name", QUIET);
    expect(rows).toEqual([{ interaction_type: "had", rating: "fine" }]);
    await expect.poll(() => countEvents(supabase, userId, "bottle_logged"), { timeout: 15_000 }).toBe(loggedBefore + 1);
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
    expect(await crest.getByTestId("palate-mark").evaluate((el) => el.getAnimations().length)).toBe(0);
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
    // Breathing is only ever asked for while the Somm works: at rest, no loop
    expect(await page.locator("main header").getByTestId("palate-mark").evaluate((el) => el.getAnimations().length)).toBe(0);
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
  test.afterEach(async ({ page }) => { await eraseFootprint(page); });

  test("a tap is answered at once: no hold, no press, no word spans — the done line takes the tiles' place", async ({ page }) => {
    await watchMotion(page);
    const { row } = await homeRec(page);
    await row.getByRole("button", { name: "🍷 Had it" }).click();
    await expect(row.getByTestId("rating-tile-fine")).toBeEnabled();
    const swapped = await row.evaluate(async (host) => {
      const tile = host.querySelector('[data-testid="rating-tile-fine"]') as HTMLButtonElement;
      tile.click();
      const pressing = tile.getAnimations().length;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        pressing,
        tilesGone: !host.querySelector('[data-testid^="rating-tile"]'),
        line: host.querySelector('p[tabindex="-1"]')?.textContent,
      };
    });
    expect(swapped).toEqual({ pressing: 0, tilesGone: true, line: FINE_DONE });
    expect(await row.locator('p[tabindex="-1"]').evaluate((el) => el === document.activeElement)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 10_000 }).toBe(0);
    expect((await motionSeen(page)).wordSpans).toBe(0);
    // (The saved step's bloom, already in its new shape on a promotion:
    // identity-shift.spec.ts, earned through the real /log)
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
    // The bloom while it waits: every set of animations it carried, every
    // markup it showed, and its wrapper less the loop's own declaration
    loops: [] as string[], markups: [] as string[], wrapper: [] as string[],
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
    if (mark) {
      const loops = mark.getAnimations().map((a) => (a as CSSAnimation).animationName).join(",");
      if (!seen.loops.includes(loops)) seen.loops.push(loops);
      if (!seen.markups.includes(mark.innerHTML)) seen.markups.push(mark.innerHTML);
      seen.wrapper = Array.from(mark.attributes)
        .map((a) => `${a.name}=${a.name === "style" ? mark.style.cssText.replace(/\s*animation[^;]*;?/g, "").trim() : a.value}`)
        .sort();
    }
    if (view.style.opacity === "0") seen.left = true;
    if (document.querySelector('[data-testid="running-head"]')) seen.headDuring = true;
  };
  read();
  new MutationObserver(read).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
});
const readingSeen = (page: Page) => page.evaluate(() => (window as any).__reading as {
  lines: string[]; ticker: { name: string; line: string }[]; breathing: boolean; left: boolean; headDuring: boolean;
  tickerOwn: string[]; loops: string[]; markups: string[]; wrapper: string[];
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
    const { data: profile } = await supabase.from("wine_profiles").select("identity").eq("user_id", userId).single();
    // A mark at rest carries no loop: /palate's static mark, the wrapper a
    // breathing bloom must otherwise be
    await page.goto("/palate");
    const restingMark = page.locator("main header").getByTestId("palate-mark");
    await expect(restingMark).toBeVisible({ timeout: 20_000 });
    expect(await restingMark.evaluate((el) => el.getAnimations().length)).toBe(0);
    const staticWrapper = (await wrapperOf(restingMark)).attrs;

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
    // Breathing is ONE loop, on the wrapper: the bloom inside it is the
    // account's static mark throughout, and the wrapper is the static
    // wrapper plus that loop (Session 1's specimen checks, on the real wait)
    expect(reading.loops).toEqual(["house-breathe"]);
    expect(reading.markups).toEqual([await asBrowser(page, renderPalateMark(profile!.identity.genome, { size: 96 }))]);
    expect(reading.wrapper).toEqual(staticWrapper);
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
    // The bloom is asked to breathe, and no loop runs on it
    expect(reading.loops).toEqual([""]);
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
