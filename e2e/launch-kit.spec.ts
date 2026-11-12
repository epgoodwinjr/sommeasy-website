import { test, expect, type APIResponse } from "@playwright/test";

/**
 * The launch kit (docs/motion/README.md §16.2–3).
 *
 * The link preview: app/opengraph-image.js serves a 1200×630 PNG, and every
 * page's head points og:image AND twitter:image at it under a large Twitter
 * card — a shared link in a feed or a message shows the front door.
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
