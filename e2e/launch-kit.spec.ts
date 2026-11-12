import { readFileSync } from "node:fs";
import { test, expect, type APIResponse, type Page } from "@playwright/test";
import { renderPalateMarkDocument } from "../src/lib/palateMark.js";
import { testDb } from "./fixtures/test-db";

/**
 * The launch kit (docs/motion/README.md §16.2–3).
 *
 * The link preview: app/opengraph-image.js serves a 1200×630 PNG, and every
 * page's head points og:image AND twitter:image at it under a large Twitter
 * card — a shared link in a feed or a message shows the front door.
 *
 * The palate card (rich account, read-only — nothing here writes): "Share
 * your palate" on /palate hands the browser ONE file, a 1080×1350 PNG whose
 * bloom is exactly renderPalateMarkDocument of the account's genome, whose
 * title, epithet and address sit where palateCard.js plans them, and whose
 * every other pixel is bare cream — nothing beyond what is drawn. Where a
 * file can't be shared, or share() refuses, it downloads; a dismissed share
 * does neither; a second tap while the sheet is open does nothing; a card
 * that couldn't be made is made again on the next tap. No request leaves on
 * the tap: no route, no event.
 */

// A PNG's size, read from its IHDR chunk (bytes 16–23, big-endian)
async function pngSize(res: APIResponse) {
  const body = await res.body();
  expect(body.subarray(0, 8).toString("hex"), "a PNG signature").toBe("89504e470d0a1a0a");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20), bytes: body.length };
}

test.describe("The link preview", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the image is a 1200×630 PNG", async ({ request }) => {
    const res = await request.get("/opengraph-image");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const { width, height, bytes } = await pngSize(res);
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
    // Drawn, not blank: a flat cream card compresses to a few KB
    expect(bytes).toBeGreaterThan(20_000);
  });

  for (const path of ["/", "/login", "/recommend"]) {
    test(`${path} carries the large card, pointing at the image`, async ({ page, request }) => {
      await page.goto(path);
      const meta = (selector: string) => page.locator(`head meta[${selector}]`).getAttribute("content");
      const ogImage = await meta(`property="og:image"`);
      expect(ogImage).toMatch(/\/opengraph-image(\?|$)/);
      expect(await meta(`property="og:image:width"`)).toBe("1200");
      expect(await meta(`property="og:image:height"`)).toBe("630");
      expect(await meta(`property="og:image:alt"`)).toBe("Sommeasy — Never guess at a wine list again.");
      expect(await meta(`name="twitter:card"`)).toBe("summary_large_image");
      expect(await meta(`name="twitter:image"`)).toBe(ogImage);
      // The URL the head names is the image (same origin under e2e)
      const res = await request.get(new URL(ogImage!).pathname + new URL(ogImage!).search);
      expect(res.status()).toBe(200);
      expect(await pngSize(res)).toMatchObject({ width: 1200, height: 630 });
    });
  }
});

// ─── The palate card ───

const CREAM = [245, 240, 232];
// SharePalate's faces, by role — the tokens' SERIF and SANS
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Source Sans 3', sans-serif";
const CARD_FONTS = {
  title: `700 76px ${SERIF}`,
  epithet: `italic 400 40px ${SERIF}`,
  site: `600 28px ${SANS}`,
};

/** Before any script: Web Share as the test says it is. "file" shares
 *  files (and keeps what it was handed); "none" has no Web Share;
 *  "refuse" and "dismiss" reject as a browser does; "hold" keeps the sheet
 *  open until `__releaseShare()`, and a share() while it is open rejects
 *  with InvalidStateError, as browsers do. */
async function webShare(page: Page, mode: "file" | "none" | "refuse" | "dismiss" | "hold") {
  await page.addInitScript((m) => {
    const w = window as any;
    w.__shareCalls = [];
    if (m === "none") {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
      return;
    }
    Object.defineProperty(navigator, "canShare", {
      configurable: true, value: (data: any) => Array.isArray(data?.files) && data.files.length > 0,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: any) => {
        w.__shareCalls.push({ keys: Object.keys(data), files: (data.files || []).map((f: File) => ({ name: f.name, type: f.type })) });
        w.__sharedFile = data.files?.[0];
        if (m === "refuse") throw new DOMException("no activation", "NotAllowedError");
        if (m === "dismiss") throw new DOMException("dismissed", "AbortError");
        if (m === "hold") {
          if (w.__sheetOpen) throw new DOMException("a share is already open", "InvalidStateError");
          w.__sheetOpen = true;
          await new Promise<void>((resolve) => { w.__releaseShare = () => { w.__sheetOpen = false; resolve(); }; });
        }
      },
    });
  }, mode);
}

// The card's layout, computed in the page by the REAL palateCard.js (it is
// dependency-free) with the page's own faces — the plan SharePalate drew by
const PLAN_SOURCE = readFileSync("src/lib/palateCard.js", "utf-8")
  .replace(/^export (const|function) /gm, "$1 ");

async function planInPage(page: Page, words: { title: string; epithet: string }) {
  await page.addScriptTag({ content: `window.__palateCard = (() => { ${PLAN_SOURCE}; return { PALATE_CARD, palateCardPlan }; })();` });
  return page.evaluate(async ({ words, fonts }) => {
    await Promise.all(Object.values(fonts).map((f) => document.fonts.load(f)));
    const { PALATE_CARD: C, palateCardPlan } = (window as any).__palateCard;
    const ctx = document.createElement("canvas").getContext("2d")!;
    const tracking = C.site.size * C.site.tracking;
    const measure = (text: string, role: keyof typeof fonts) => {
      ctx.font = fonts[role];
      if (role !== "site") return ctx.measureText(text).width;
      return [...text].reduce((w, ch) => w + ctx.measureText(ch).width, 0) + tracking * (text.length - 1);
    };
    return { plan: palateCardPlan(words, measure), lineHeights: { title: C.title.lineHeight, epithet: C.epithet.lineHeight, site: C.site.lineHeight } };
  }, { words, fonts: CARD_FONTS });
}

/** Read the shared/downloaded card in the page and check it against the
 *  plan: the bloom pixel for pixel, each line's ink, cream everywhere else. */
async function readCard(page: Page, source: { shared: true } | { dataUrl: string }, plan: any, lineHeights: any, bloomSvg: string) {
  return page.evaluate(async ({ source, plan, lineHeights, bloomSvg, cream }) => {
    const blob = "shared" in source ? (window as any).__sharedFile : await (await fetch(source.dataUrl)).blob();
    const bmp = await createImageBitmap(blob);
    const card = document.createElement("canvas");
    card.width = bmp.width;
    card.height = bmp.height;
    const cx = card.getContext("2d")!;
    cx.drawImage(bmp, 0, 0);
    const pixels = cx.getImageData(0, 0, card.width, card.height).data;
    const at = (x: number, y: number) => { const i = (y * card.width + x) * 4; return [pixels[i], pixels[i + 1], pixels[i + 2]]; };
    const near = (a: number[], b: number[], d: number) => a.every((v, i) => Math.abs(v - b[i]) <= d);

    // The bloom: the same SVG drawn the same way, on cream
    const url = URL.createObjectURL(new Blob([bloomSvg], { type: "image/svg+xml" }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const exp = document.createElement("canvas");
    exp.width = card.width;
    exp.height = card.height;
    const ex = exp.getContext("2d")!;
    ex.fillStyle = `rgb(${cream})`;
    ex.fillRect(0, 0, exp.width, exp.height);
    ex.drawImage(img, plan.mark.x, plan.mark.y, plan.mark.size, plan.mark.size);
    URL.revokeObjectURL(url);
    const want = ex.getImageData(plan.mark.x, plan.mark.y, plan.mark.size, plan.mark.size).data;
    const got = cx.getImageData(plan.mark.x, plan.mark.y, plan.mark.size, plan.mark.size).data;
    let bloomOff = 0, bloomInk = 0;
    for (let i = 0; i < want.length; i += 4) {
      if (Math.max(Math.abs(want[i] - got[i]), Math.abs(want[i + 1] - got[i + 1]), Math.abs(want[i + 2] - got[i + 2])) > 2) bloomOff++;
      if (!near([got[i], got[i + 1], got[i + 2]], cream, 6)) bloomInk++;
    }

    // Each line: its own color, inside its band
    const COLOR: Record<string, number[]> = { title: [27, 61, 47], epithet: [139, 35, 50], site: [125, 142, 130] };
    const lines = plan.lines.map((l: any) => {
      const half = lineHeights[l.role] / 2;
      let ink = 0;
      for (let y = Math.round(l.y - half); y < Math.round(l.y + half); y++) {
        for (let x = 100; x < card.width - 100; x++) if (near(at(x, y), COLOR[l.role], 24)) ink++;
      }
      return { role: l.role, text: l.text, ink };
    });

    // Everything else: bare cream. Drawn = the bloom's box, each line's
    // band (padded for ascenders, descenders and italic), the rule's
    const drawn = (x: number, y: number) =>
      (x >= plan.mark.x - 1 && x <= plan.mark.x + plan.mark.size && y >= plan.mark.y - 1 && y <= plan.mark.y + plan.mark.size)
      || plan.lines.some((l: any) => Math.abs(y - l.y) <= lineHeights[l.role] / 2 + 8)
      || (Math.abs(y - plan.rule.y) <= 3 && x >= plan.rule.x1 - 2 && x <= plan.rule.x2 + 2);
    let stray = 0;
    for (let y = 0; y < card.height; y++) {
      for (let x = 0; x < card.width; x++) if (!drawn(x, y) && !near(at(x, y), cream, 2)) stray++;
    }
    return { width: bmp.width, height: bmp.height, corner: at(3, 3), bloomOff, bloomInk, lines, stray, rule: at(Math.round((plan.rule.x1 + plan.rule.x2) / 2), Math.round(plan.rule.y)) };
  }, { source, plan, lineHeights, bloomSvg, cream: CREAM });
}

test.describe("The palate card", () => {
  let words: { title: string; epithet: string };
  let genome: unknown;

  test.beforeAll(async () => {
    const { supabase, userId } = await testDb();
    const { data } = await supabase.from("wine_profiles").select("archetype, identity").eq("user_id", userId).single();
    // Premise: the rich account wears a composed strand with a genome
    expect(data?.archetype).toBeTruthy();
    expect(data?.identity?.epithet).toBeTruthy();
    expect(renderPalateMarkDocument(data!.identity.genome)).not.toBe("");
    words = { title: data!.archetype, epithet: data!.identity.epithet };
    genome = data!.identity.genome;
  });

  async function openPalate(page: Page) {
    await page.goto("/palate");
    const action = page.getByTestId("share-palate");
    await expect(action).toHaveText("Share your palate", { timeout: 20_000 });
    return action;
  }

  test("Share your palate hands over one file: the card, drawn as planned, and nothing else", async ({ page }) => {
    await webShare(page, "file");
    const action = await openPalate(page);
    // Under the signature, before the first numbered section
    const order = await page.evaluate(() => {
      const at = (el: Element | null) => (el ? Array.from(document.querySelectorAll("*")).indexOf(el) : -1);
      return {
        signature: at(document.querySelector('[data-testid="palate-signature"]')),
        share: at(document.querySelector('[data-testid="share-palate"]')),
        evolution: at(document.querySelector('[data-testid="palate-evolution"]')),
      };
    });
    expect(order.share).toBeGreaterThan(order.signature);
    expect(order.share).toBeLessThan(order.evolution);
    // What a download did is said through a status region that is already
    // in the page, empty — one mounted with its words often goes unheard
    const said = page.getByTestId("share-palate-said");
    await expect(said).toHaveAttribute("role", "status");
    await expect(said).toHaveText("");

    const sent: string[] = [];
    page.on("request", (r) => sent.push(r.url()));
    await action.click();
    await expect.poll(() => page.evaluate(() => (window as any).__shareCalls.length)).toBe(1);
    const call = await page.evaluate(() => (window as any).__shareCalls[0]);
    // The file alone: no title, text or link rides with it
    expect(call).toEqual({ keys: ["files"], files: [{ name: "sommeasy-palate.png", type: "image/png" }] });
    // Nothing recorded, nowhere called
    expect(sent.filter((u) => /\/api\/|supabase\.co/.test(u))).toEqual([]);
    // A share needs no line of its own: the sheet was the answer
    await expect(said).toHaveText("");

    const { plan, lineHeights } = await planInPage(page, words);
    const card = await readCard(page, { shared: true }, plan, lineHeights,
      renderPalateMarkDocument(genome, { size: plan.mark.size }));
    expect({ width: card.width, height: card.height }).toEqual({ width: 1080, height: 1350 });
    expect(card.corner).toEqual(CREAM);
    // The account's own bloom, where the plan puts it, pixel for pixel
    expect(card.bloomInk).toBeGreaterThan(plan.mark.size * plan.mark.size * 0.2);
    expect(card.bloomOff).toBe(0);
    // The title, the epithet and the address, each in its color and place
    expect(card.lines.map((l: any) => l.role)).toContain("title");
    expect(card.lines.filter((l: any) => l.role === "title").map((l: any) => l.text).join(" ")).toBe(words.title);
    expect(card.lines.filter((l: any) => l.role === "epithet").map((l: any) => l.text).join(" ")).toBe(words.epithet);
    expect(card.lines.find((l: any) => l.role === "site")?.text).toBe("sommeasy.wine");
    for (const line of card.lines) expect(line.ink, `${line.role} "${line.text}" is drawn`).toBeGreaterThan(150);
    // …and nothing else on the card
    expect(card.stray).toBe(0);
  });

  test("where a file can't be shared, the card downloads, and says so", async ({ page }) => {
    await webShare(page, "none");
    const action = await openPalate(page);
    const download = page.waitForEvent("download");
    await action.click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("sommeasy-palate.png");
    const path = await file.path();
    const bytes = readFileSync(path!);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }).toEqual({ width: 1080, height: 1350 });
    await expect(page.getByTestId("share-palate-said")).toHaveText("Your card is in your downloads.");
    // The downloaded card is the same card
    const { plan, lineHeights } = await planInPage(page, words);
    const card = await readCard(page, { dataUrl: `data:image/png;base64,${bytes.toString("base64")}` }, plan, lineHeights,
      renderPalateMarkDocument(genome, { size: plan.mark.size }));
    expect(card.bloomOff).toBe(0);
    expect(card.stray).toBe(0);
  });

  test("a share the browser refuses still gives the card; a dismissed one does nothing", async ({ page }) => {
    await webShare(page, "refuse");
    let action = await openPalate(page);
    const download = page.waitForEvent("download");
    await action.click();
    expect((await download).suggestedFilename()).toBe("sommeasy-palate.png");
    await expect(page.getByTestId("share-palate-said")).toHaveText("Your card is in your downloads.");

    const fresh = await page.context().newPage();
    await webShare(fresh, "dismiss");
    action = await openPalate(fresh);
    let downloads = 0;
    fresh.on("download", () => downloads++);
    await action.click();
    await expect.poll(() => fresh.evaluate(() => (window as any).__shareCalls.length)).toBe(1);
    // The rejection has landed by the time the page answers again
    await fresh.evaluate(() => new Promise((r) => setTimeout(r, 0)));
    expect(downloads).toBe(0);
    await expect(fresh.getByTestId("share-palate-said")).toHaveText("");
    await expect(fresh.getByTestId("share-palate-failed")).toHaveCount(0);
    await expect(action).toHaveText("Share your palate");
    await fresh.close();
  });

  test("a card that couldn't be made is made again on the next tap — and the action keeps its focus", async ({ page }) => {
    // The first card fails (a canvas that can't encode — iOS under memory
    // pressure); every later one is made as usual
    await page.addInitScript(() => {
      const w = window as any;
      w.__toBlobCalls = 0;
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, ...rest: any[]) {
        w.__toBlobCalls += 1;
        if (w.__toBlobCalls === 1) return callback(null);
        return toBlob.call(this, callback, ...rest);
      };
    });
    await webShare(page, "file");
    const action = await openPalate(page);
    // The card made ahead of the tap has failed
    await expect.poll(() => page.evaluate(() => (window as any).__toBlobCalls), { timeout: 15_000 }).toBe(1);
    await action.focus();
    await action.click();
    // The tap makes it again, and shares it — no failure said
    await expect.poll(() => page.evaluate(() => (window as any).__shareCalls.length), { timeout: 15_000 }).toBe(1);
    expect(await page.evaluate(() => (window as any).__toBlobCalls)).toBe(2);
    await expect(page.getByTestId("share-palate-failed")).toHaveCount(0);
    await expect(action).toHaveText("Share your palate");
    // Making the card never took the focus from the action
    await expect(action).toBeFocused();
  });

  test("a second tap while the sheet is open does nothing — no second share, no download", async ({ page }) => {
    await webShare(page, "hold");
    const action = await openPalate(page);
    let downloads = 0;
    page.on("download", () => downloads++);
    await action.click();
    await expect.poll(() => page.evaluate(() => (window as any).__shareCalls.length), { timeout: 15_000 }).toBe(1);
    await action.click();
    await action.click();
    // The page has answered both taps by now
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
    expect(await page.evaluate(() => (window as any).__shareCalls.length)).toBe(1);
    expect(downloads).toBe(0);
    await expect(page.getByTestId("share-palate-said")).toHaveText("");
    await expect(page.getByTestId("share-palate-failed")).toHaveCount(0);
    // The sheet closes: the action is live again
    await page.evaluate(() => (window as any).__releaseShare());
    await action.click();
    await expect.poll(() => page.evaluate(() => (window as any).__shareCalls.length), { timeout: 15_000 }).toBe(2);
    expect(downloads).toBe(0);
  });

  test("a palate whose genome isn't one offers no card", async ({ page }) => {
    // The profile as read, with a genome that draws nothing (markParams
    // normalizes any object into a bloom; a string is no genome at all)
    await page.route("**/rest/v1/wine_profiles*", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const res = await route.fetch();
      const body = await res.json();
      const rows = Array.isArray(body) ? body : [body];
      for (const row of rows) if (row?.identity) row.identity = { ...row.identity, genome: "not a genome" };
      await route.fulfill({ response: res, json: Array.isArray(body) ? rows : rows[0] });
    });
    await page.goto("/palate");
    await expect(page.getByTestId("palate-archetype")).toHaveText(words.title, { timeout: 20_000 });
    await expect(page.getByTestId("palate-mark")).toHaveCount(0);
    await expect(page.getByTestId("share-palate")).toHaveCount(0);
  });
});
