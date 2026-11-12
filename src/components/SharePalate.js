"use client";

// SharePalate — "Share your palate" under the signature on /palate
// (docs/motion/README.md §16.3; where it sits and what it says are for Ed's
// review). It draws a 1080×1350 card on a canvas — the bloom from
// renderPalateMarkDocument, the title, the epithet, sommeasy.wine, laid out
// by palateCard.js — and hands the PNG to the Web Share API where the
// browser can share a file, or downloads it where it can't.
//
// The card is made AHEAD of the tap, once the page has settled: a browser
// lets share() open only inside the tap's user activation (Safari's window
// is short), and drawing, decoding the bloom and encoding the PNG could
// outlast it. A tap that beats the card waits for it (the action stays
// focused, saying so); if share() then refuses, the card downloads instead.
// One share at a time: a second tap while the sheet is open does nothing.
// A card that couldn't be made isn't kept — the next tap makes it again.
// What a download did is said through a status region that is in the page
// before it has anything to say (a region mounted with its words in it
// often goes unannounced).
//
// Only the file is shared — no title, text or link rides with it — and
// nothing is recorded: no route, no event (the wine_events catalog is
// unchanged). A missing or unusable genome offers nothing: the card is the
// bloom's.

import { useEffect, useRef, useState } from "react";
import { renderPalateMarkDocument } from "@/lib/palateMark";
import { PALATE_CARD, SHARE_COPY, palateCardPlan } from "@/lib/palateCard";
import TextAction from "./house/TextAction";
import { BURGUNDY, CREAM, INK, SANS, SERIF, ink } from "./house/tokens";

const C = PALATE_CARD;
// The page's own faces (globals.css loads them), by the card's roles
const FONTS = {
  title: `700 ${C.title.size}px ${SERIF}`,
  epithet: `italic 400 ${C.epithet.size}px ${SERIF}`,
  site: `600 ${C.site.size}px ${SANS}`,
};
const COLORS = { title: INK, epithet: BURGUNDY, site: ink(0.55) };
const RULE = ink(0.15);
// After the page's entrances (PALATE in motion.js ends well inside this)
const MAKE_AFTER_MS = 1200;
// A face that hasn't loaded by then is drawn in its fallback (Georgia, the
// system sans) rather than holding the card on a slow network
const FONT_WAIT_MS = 3000;

// Tracked text (the address) set letter by letter — canvas letterSpacing
// isn't everywhere yet
function trackedWidth(ctx, text, tracking) {
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width, 0) + tracking * Math.max(0, text.length - 1);
}
function fillTracked(ctx, text, cx, y, tracking) {
  let x = cx - trackedWidth(ctx, text, tracking) / 2;
  ctx.textAlign = "left";
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
}

function loadImage(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("bloom"));
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

/** The card as a PNG File, or null when it can't be made. */
async function makeCard({ genome, title, epithet }) {
  if (typeof document === "undefined") return null;
  // Every face drawn, loaded first (a failed load falls back, as the page does)
  if (document.fonts?.load) {
    const loaded = Promise.all(Object.values(FONTS).map((font) => document.fonts.load(font).catch(() => null)));
    await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))]);
  }
  const canvas = document.createElement("canvas");
  canvas.width = C.width;
  canvas.height = C.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const tracking = C.site.size * C.site.tracking;
  const measure = (text, role) => {
    ctx.font = FONTS[role];
    return role === "site" ? trackedWidth(ctx, text, tracking) : ctx.measureText(text).width;
  };
  const plan = palateCardPlan({ title, epithet }, measure);
  const svg = plan && renderPalateMarkDocument(genome, { size: plan.mark.size });
  if (!svg) return null;
  const bloom = await loadImage(svg);

  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, C.width, C.height);
  ctx.drawImage(bloom, plan.mark.x, plan.mark.y, plan.mark.size, plan.mark.size);
  ctx.textBaseline = "middle";
  for (const line of plan.lines) {
    ctx.font = FONTS[line.role];
    ctx.fillStyle = COLORS[line.role];
    if (line.role === "site") {
      fillTracked(ctx, line.text, line.x, line.y, tracking);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(line.text, line.x, line.y);
    }
  }
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plan.rule.x1, plan.rule.y);
  ctx.lineTo(plan.rule.x2, plan.rule.y);
  ctx.stroke();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new File([blob], C.fileName, { type: "image/png" }) : null;
}

function canShareFile(file) {
  try {
    return typeof navigator !== "undefined" && typeof navigator.share === "function"
      && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Long enough for the download to take the blob
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function SharePalate({ genome, title, epithet, style }) {
  // Offered only when there's a bloom to draw and a title to set
  const usable = Boolean(title) && renderPalateMarkDocument(genome, { size: 1 }) !== "";
  const key = usable ? JSON.stringify([genome, title, epithet ?? null]) : null;
  const making = useRef(null); // { key, promise }
  const sharing = useRef(false); // a tap is being answered
  const [card, setCard] = useState(null); // { key, file }
  const [state, setState] = useState("idle"); // idle | making | saved | failed

  const cardFor = (k) => {
    if (making.current?.key !== k) {
      const promise = makeCard({ genome, title, epithet }).catch(() => null);
      const entry = { key: k, promise };
      making.current = entry;
      // A card that couldn't be made isn't kept: the next tap tries again
      promise.then((file) => { if (!file && making.current === entry) making.current = null; });
    }
    return making.current.promise;
  };

  // Made once the page has settled, so the tap finds it ready
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    const t = setTimeout(() => {
      cardFor(key).then((file) => { if (live && file) setCard({ key, file }); });
    }, MAKE_AFTER_MS);
    return () => { live = false; clearTimeout(t); };
    // cardFor reads this render's words; the key is what they are
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!usable) return null;

  const share = async () => {
    // One at a time: a tap while the card is being made or the sheet is
    // open does nothing (a second share() would reject, and must not read
    // as a refusal to download through)
    if (sharing.current) return;
    sharing.current = true;
    try {
      let file = card?.key === key ? card.file : null;
      if (!file) {
        setState("making");
        file = await cardFor(key);
        if (!file) { setState("failed"); return; }
      }
      if (canShareFile(file)) {
        try {
          await navigator.share({ files: [file] });
          setState("idle");
          return;
        } catch (err) {
          // Dismissed, or a sheet already open: nothing to say. Refused (the
          // tap's activation ran out, or the platform said no): the download
          // below still gives the card
          if (err?.name === "AbortError" || err?.name === "InvalidStateError") { setState("idle"); return; }
        }
      }
      try {
        download(file);
        setState("saved");
      } catch {
        setState("failed");
      }
    } finally {
      sharing.current = false;
    }
  };

  return (
    <div style={{ textAlign: "center", ...style }}>
      {/* Never disabled: a disabled button drops the focus it holds. While
          the card is made it says so, and a tap does nothing */}
      <TextAction tone="quiet" underlined testId="share-palate" onClick={share}>
        {state === "making" ? SHARE_COPY.making : SHARE_COPY.action}
      </TextAction>
      {/* In the page before it has anything to say, so the line is heard */}
      <p data-testid="share-palate-said" role="status" style={state === "saved" ? said : quiet}>
        {state === "saved" ? SHARE_COPY.saved : ""}
      </p>
      {state === "failed" && (
        <p data-testid="share-palate-failed" role="alert" style={{ ...said, color: BURGUNDY, fontStyle: "italic", fontFamily: SERIF }}>
          {SHARE_COPY.failed}
        </p>
      )}
    </div>
  );
}

const said = { fontFamily: SANS, fontSize: "12px", lineHeight: 1.5, color: ink(0.5), margin: "-4px 0 0" };
// Empty, it takes no room (an empty block's negative margin would pull the page up)
const quiet = { margin: 0 };
