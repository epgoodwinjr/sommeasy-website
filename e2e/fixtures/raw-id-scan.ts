import { type Page } from "@playwright/test";

/**
 * Shared scanner behind the permanent no-raw-IDs guard (raw-ids.spec.ts) and
 * the quiz-completion reveal spec: collect every visible text node that looks
 * like a raw internal ID ("south_africa", "pinot_noir", …).
 */
export async function findRawIdTextNodes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const RAW_ID = /^[a-z0-9]+(_[a-z0-9]+)+$/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const offenders: string[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || "").trim();
      if (!text || !RAW_ID.test(text)) continue;
      const el = node.parentElement;
      if (!el) continue;
      if (el.closest("script, style, noscript, [hidden]")) continue;
      if (typeof el.checkVisibility === "function" && !el.checkVisibility()) continue;
      offenders.push(text);
    }
    return offenders;
  });
}
