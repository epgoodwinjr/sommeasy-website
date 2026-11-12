"use client";

// ReadingView — the wait while something is read (The House List §7.16; in
// motion since docs/motion/README.md §8.5): Match's "The Somm is reading"
// and Log's "Reading the label". Full screen, no running head.
//
//   (the bloom, breathing)
//   🍷 THE SOMM IS READING
//   Reading forty-two wines…
//   ━━━━━━━━━━──
//   CLOUDY BAY SAUVIGNON BLANC          ← the ticker, only while there are names
//   Cancel
//
// Presentation only: the page owns what is being read and hands over the
// `line`, the bar's `progress`, and — once a list has really been parsed —
// the `names` on it. Then:
//   · the palate mark breathes (§7.5). No genome → `fallback` ({ mark,
//     eyebrow }: Log's 📸 over "Reading the label", as it was), or nothing.
//   · the line cross-fades when it changes (SwapLine). It is the view's one
//     live region, as it always was.
//   · the ticker flicks through `names`, one at a time, for as long as it is
//     handed any — never a name that isn't on the list, and nothing at all
//     under reduced motion. Its slot is always there, so nothing moves when
//     it starts or stops.
//   · `leaving` plays the view out (D_EXIT) before what it read arrives.
// Cancel is live throughout.

import { useEffect, useRef, useState } from "react";
import { markParams } from "@/lib/palateMark";
import PalateMarkLive from "@/components/PalateMarkLive";
import ProgressLine from "@/components/house/ProgressLine";
import SwapLine from "@/components/house/SwapLine";
import TextAction from "@/components/house/TextAction";
import useReducedMotion from "@/components/house/useReducedMotion";
import { useIsoLayoutEffect } from "@/components/house/useEntrance";
import { D_EXIT, EASE, EXIT, TICKER } from "@/components/house/motion";
import { INK, SERIF, TYPE } from "@/components/house/tokens";

const MARK = 96;
const lineStyle = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "22px", lineHeight: 1.35, color: INK,
  marginTop: 12, minHeight: 60, textWrap: "balance",
};
// The ticker's slot and Cancel's margin share the room Cancel always had
const tickerSlot = {
  ...TYPE.meta, lineHeight: "14px", height: 14, marginTop: 12, maxWidth: "100%",
  overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
};

/** The names on the list, one at a time. Decorative: the line above says
 *  what is happening, and says it to screen readers. */
function Ticker({ names }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const [shown, setShown] = useState(null);
  const running = !reduced && Array.isArray(names) && names.length > 0;

  useEffect(() => {
    if (!running) return undefined;
    let i = 0;
    const tick = () => {
      setShown(names[i % names.length]);
      i += 1;
    };
    tick();
    if (names.length < 2) return undefined;
    const timer = setInterval(tick, TICKER.step);
    return () => clearInterval(timer);
  }, [running, names]);

  // Each name flicks in…
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!running || shown == null || !el || typeof el.animate !== "function") return undefined;
    const animation = el.animate([{ opacity: TICKER.from }, { opacity: 1 }], { duration: TICKER.fadeMs, easing: EASE });
    return () => animation.cancel();
  }, [running, shown]);

  // …and when the reading moves on, the last one fades out
  useEffect(() => {
    if (running || shown == null) return undefined;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") {
      setShown(null);
      return undefined;
    }
    let live = true;
    const animation = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: TICKER.outMs, easing: EASE, fill: "backwards",
    });
    animation.finished.then(() => { if (live) setShown(null); }, () => {});
    return () => {
      live = false;
      animation.cancel();
    };
    // Only when it stops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div ref={ref} aria-hidden="true" data-testid="reading-ticker" style={running ? tickerSlot : { ...tickerSlot, opacity: 0 }}>
      {shown}
    </div>
  );
}

export default function ReadingView({
  testId, genome, fallback, eyebrow, line, progress, barMs, barLabel, names = null,
  leaving = false, onCancel, style,
}) {
  const drawn = Boolean(markParams(genome));
  return (
    <div data-testid={testId} style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center", ...style,
      ...(leaving && { ...EXIT.to, transition: `opacity ${D_EXIT}ms ${EASE}, transform ${D_EXIT}ms ${EASE}` }),
    }}>
      {drawn
        ? <PalateMarkLive genome={genome} size={MARK} breathing />
        : fallback && <div aria-hidden="true" style={{ fontSize: "34px", lineHeight: 1 }}>{fallback.mark}</div>}
      <div style={{ ...TYPE.eyebrow, letterSpacing: "0.24em", marginTop: drawn || !fallback ? 28 : 22 }}>
        {drawn || !fallback ? eyebrow : fallback.eyebrow}
      </div>
      <SwapLine as="p" aria-live="polite" text={line} style={lineStyle} />
      <ProgressLine variant="reading" value={progress} duration={barMs} label={barLabel} style={{ marginTop: 14 }} />
      <Ticker names={names} />
      <TextAction tone="quiet" opacity={0.5} onClick={onCancel} style={{ marginTop: 10 }}>Cancel</TextAction>
    </div>
  );
}
