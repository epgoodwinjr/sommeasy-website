"use client";

// SwapLine — a line whose words change in place (docs/motion/README.md
// §8.1, §8.5): Welcome's demo status, the reading line.
//
//   <SwapLine as="p" text={readingLine(phase, count)} style={…} />
//
// The first text simply shows (an entrance, if it wants one, is the
// caller's). After that each change cross-fades: the old words fade out
// (SWAP.outMs), then the new ones rise in (SWAP.inMs, a 4px climb). A
// change that lands mid-swap isn't lost — the line goes on to the latest
// text. Under reduced motion the new words simply fade in. Nothing is held
// on the element once a swap ends. It adds no aria-live: a live region is
// the caller's to own. Any other prop (data-testid, id) lands on the
// element.

import { useRef, useState } from "react";
import { D_REDUCED, EASE, SWAP_IN, SWAP_OUT, prefersReducedMotion } from "./motion";
import { useIsoLayoutEffect } from "./useEntrance";

const frames = ({ from, to }) => [{ offset: 0, ...from }, { offset: 1, ...to }];

export default function SwapLine({ text, as: Tag = "span", style, ...rest }) {
  const ref = useRef(null);
  const latest = useRef(text);
  latest.current = text;
  const [shown, setShown] = useState(text);
  // rest → out (old words leave) → in (new words arrive) → rest
  const [phase, setPhase] = useState("rest");

  // A new text: start the swap (mid-out, the end of the out picks it up)
  useIsoLayoutEffect(() => {
    if (phase === "out" || text === shown) return;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") {
      setShown(text);
      return;
    }
    if (prefersReducedMotion()) {
      setShown(text);
      setPhase("in");
      return;
    }
    setPhase("out");
    // Once per new text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return undefined;
    if (phase === "rest") {
      // The text moved on while the last swap played
      if (latest.current !== shown) setPhase("out");
      return undefined;
    }
    let animation;
    if (phase === "out") {
      // From the line's own opacity down to the 0 it wears until the swap
      const own = style?.opacity ?? SWAP_OUT.from.opacity;
      animation = el.animate([{ offset: 0, opacity: own }, { offset: 1, ...SWAP_OUT.to }], {
        duration: SWAP_OUT.duration, easing: SWAP_OUT.easing, fill: "backwards",
      });
      animation.finished.then(() => {
        setShown(latest.current);
        setPhase("in");
      }, () => {});
    } else {
      const reduced = prefersReducedMotion();
      animation = el.animate(
        reduced ? [{ opacity: 0 }, {}] : frames(SWAP_IN),
        reduced
          ? { duration: D_REDUCED, easing: EASE, fill: "backwards" }
          : { duration: SWAP_IN.duration, easing: SWAP_IN.easing, fill: "backwards" },
      );
      animation.finished.then(() => setPhase("rest"), () => {});
    }
    return () => animation.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <Tag ref={ref} style={phase === "out" ? { ...style, opacity: 0 } : style} {...rest}>{shown}</Tag>
  );
}
