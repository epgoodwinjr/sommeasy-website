// palateCard.js — the shareable palate card's layout (docs/motion/README.md
// §16.3). A 1080×1350 portrait image composed in the browser: the bloom
// (renderPalateMarkDocument), the strand's title, its epithet, and
// "sommeasy.wine" under a short rule. No name, no email, nothing beyond
// what is drawn.
//
// This module decides WHERE things go; SharePalate.js draws them. Pure and
// dependency-free (palateCard.test.js runs it in plain node): text is
// measured through a function the caller passes — `measure(text, role)` →
// its width in px, a canvas's measureText in the browser — and the lines
// come back by ROLE ("title" | "epithet" | "site"), so the fonts and colors
// stay in tokens.js and the component maps them. Junk in → null, never a
// throw.

export const PALATE_CARD = Object.freeze({
  width: 1080,
  height: 1350,
  // The text measure: the card less 100px a side
  margin: 100,
  // The bloom: 600px when the words leave room, never under 440
  mark: { size: 600, min: 440, top: 96 },
  // Bloom → title, title → epithet
  titleGap: 56,
  epithetGap: 22,
  title: { size: 76, lineHeight: 84, maxLines: 3 },
  epithet: { size: 40, lineHeight: 56, maxLines: 3 },
  // The foot: a short rule, then the address, centered on `fromBottom`
  rule: { width: 120, above: 44 },
  site: { size: 28, lineHeight: 36, fromBottom: 104, tracking: 0.12, text: "sommeasy.wine" },
  // The breathing room between the words and the rule, at least
  footGap: 56,
  fileName: "sommeasy-palate.png",
});

/** What the share action says (for Ed's review). */
export const SHARE_COPY = Object.freeze({
  action: "Share your palate",
  making: "Making your card…",
  saved: "Your card is in your downloads.",
  failed: "We couldn’t make your card just now. Try again in a moment.",
});

const words = (text) => (typeof text === "string" ? text.trim().split(/\s+/).filter(Boolean) : []);

// Greedy fill at `width`. A single word wider than the measure keeps a line
// of its own — a canvas can't break inside one.
function greedy(list, width, fits) {
  const lines = [];
  let line = "";
  for (const word of list) {
    const next = line ? `${line} ${word}` : word;
    if (line && !fits(next, width)) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** `text` in lines no wider than `maxWidth`, as even as CSS's
 *  `text-wrap: balance` sets them — the fewest lines greedy filling needs,
 *  at the narrowest measure that still needs no more. Past `maxLines` the
 *  last line ends in "…". [] for nothing to set. */
export function balancedLines(text, maxWidth, measure, maxLines = Infinity) {
  const list = words(text);
  if (list.length === 0 || !(maxWidth > 0) || typeof measure !== "function") return [];
  const fits = (line, width) => measure(line) <= width;
  const lines = greedy(list, maxWidth, fits);
  if (lines.length > 1 && lines.length <= maxLines) {
    // Narrow the measure while the line count holds
    let lo = 0, hi = maxWidth;
    for (let i = 0; i < 24 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2;
      if (greedy(list, mid, fits).length === lines.length) hi = mid; else lo = mid;
    }
    return greedy(list, hi, fits);
  }
  if (lines.length <= maxLines) return lines;
  // Too long for its lines: keep what fits, and say there was more
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.includes(" ") && !fits(`${last}…`, maxWidth)) last = last.slice(0, last.lastIndexOf(" "));
  kept[maxLines - 1] = `${last.replace(/[\s,;:.—–-]+$/, "")}…`;
  return kept;
}

/**
 * Where everything goes. `title` is required (no title → null: there's no
 * card to offer); the epithet is optional. `measure(text, role)` → px.
 * Returns { width, height, mark: { x, y, size }, lines: [{ role, text, x,
 * y }], rule: { x1, x2, y } } — `x` and `y` are each line's CENTER (draw
 * with textAlign "center", textBaseline "middle").
 */
export function palateCardPlan(words, measure) {
  if (typeof measure !== "function") return null;
  try {
    return plan(words || {}, measure);
  } catch {
    // A canvas that can't measure can't draw the card either
    return null;
  }
}

function plan({ title, epithet }, measure) {
  const C = PALATE_CARD;
  const measureAs = (role) => (text) => {
    const width = Number(measure(text, role));
    return Number.isFinite(width) ? width : Infinity;
  };
  const textWidth = C.width - 2 * C.margin;
  const titleLines = balancedLines(title, textWidth, measureAs("title"), C.title.maxLines);
  if (titleLines.length === 0) return null;
  const epithetLines = balancedLines(epithet, textWidth, measureAs("epithet"), C.epithet.maxLines);

  // The foot is fixed; the bloom and the words share what's above it
  const siteY = C.height - C.site.fromBottom;
  const ruleY = siteY - C.site.lineHeight / 2 - C.rule.above;
  const wordsHeight = titleLines.length * C.title.lineHeight
    + (epithetLines.length ? C.epithetGap + epithetLines.length * C.epithet.lineHeight : 0);
  const room = ruleY - C.footGap - C.mark.top;
  const markSize = Math.round(Math.max(C.mark.min, Math.min(C.mark.size, room - C.titleGap - wordsHeight)));
  // Centered in the room above the foot
  const blockHeight = markSize + C.titleGap + wordsHeight;
  const top = Math.round(C.mark.top + Math.max(0, (room - blockHeight) / 2));
  const cx = C.width / 2;

  const lines = [];
  let y = top + markSize + C.titleGap;
  for (const text of titleLines) {
    lines.push({ role: "title", text, x: cx, y: y + C.title.lineHeight / 2 });
    y += C.title.lineHeight;
  }
  if (epithetLines.length) y += C.epithetGap;
  for (const text of epithetLines) {
    lines.push({ role: "epithet", text, x: cx, y: y + C.epithet.lineHeight / 2 });
    y += C.epithet.lineHeight;
  }
  lines.push({ role: "site", text: C.site.text, x: cx, y: siteY });

  return {
    width: C.width,
    height: C.height,
    mark: { x: Math.round(cx - markSize / 2), y: top, size: markSize },
    lines,
    rule: { x1: cx - C.rule.width / 2, x2: cx + C.rule.width / 2, y: ruleY },
  };
}
