"use client";

// SommSays — "🍷 The Somm says" over Your picks (The House List §8.3; in
// motion since docs/motion/README.md §8.5, decision M8).
//
// Presentation only: the page says where the Somm is (`state`: "pending"
// while it curates, "done" once it has, anything else when it never will)
// and hands over its `summary`. One block for the whole of it, so the line
// can be rewritten in place:
//
//   pending          "The Somm is tasting…", its dots breathing
//                    (data-testid somm-thinking)
//   done + summary   the tasting line fades out, and the summary is written
//                    in while the block's height eases to fit (somm-summary)
//   anything else    the block leaves quietly: it fades and its room closes,
//                    so the picks under it slide up instead of jumping. On
//                    fallback that is all that happens — the engine's notes
//                    stay, and nothing else plays.
//
// The test id names what is SHOWN: under reduced motion (and so in every
// spec but the motion one) the block is what the state says in the same
// commit the state changes. Every timing is SOMM's (motion.js). `enterDelay`
// is the arrival: the block fades in with the picks.

import Dots from "@/components/house/Dots";
import Enter from "@/components/house/Enter";
import WriteIn from "@/components/house/WriteIn";
import useEntrance, { withEntrance } from "@/components/house/useEntrance";
import useRewrite from "@/components/house/useRewrite";
import { SOMM } from "@/components/house/motion";
import { INK, SERIF, TYPE, ink } from "@/components/house/tokens";

const BOX = { display: "flow-root" };
const block = { textAlign: "center", paddingTop: 28 };
const tasting = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.55, color: ink(0.55), marginTop: 10,
};
const summaryLine = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", lineHeight: 1.55, color: INK,
  marginTop: 10, textWrap: "pretty",
};
const hidden = (style, yes) => (yes ? { ...style, opacity: 0 } : style);

export default function SommSays({ state, summary, enterDelay }) {
  const want = state === "pending" ? "thinking" : state === "done" && summary ? "summary" : null;
  const key = want === "summary" ? `summary:${summary}` : want || "";
  const { shown, leaving, boxRef, outRef } = useRewrite(key, { kind: want, summary });
  const entering = useEntrance(boxRef, "fade", { delay: enterDelay, play: enterDelay != null });
  const { kind, summary: words } = shown.payload;
  // Leaving altogether, the whole block fades; changing its line, only the line
  const closing = !want;
  const lineRef = closing ? undefined : outRef;
  const lineGone = leaving && !closing;
  return (
    <div ref={boxRef} style={withEntrance(BOX, entering)}>
      {kind && (
        <div
          ref={closing ? outRef : undefined}
          data-testid={kind === "thinking" ? "somm-thinking" : "somm-summary"}
          style={hidden(block, leaving && closing)}
        >
          <div style={TYPE.eyebrow}>🍷 The Somm says</div>
          {kind === "summary" && shown.rewritten && (
            <WriteIn
              key={shown.key} ref={lineRef} as="p" text={words} step={SOMM.summaryStep}
              style={hidden(summaryLine, lineGone)}
            />
          )}
          {kind === "summary" && !shown.rewritten && (
            <p ref={lineRef} style={hidden(summaryLine, lineGone)}>{words}</p>
          )}
          {/* Asked again: the tasting line comes back in, rather than popping */}
          {kind === "thinking" && shown.rewritten && (
            <Enter key={shown.key} ref={lineRef} as="p" kind="fade" style={hidden(tasting, lineGone)}>
              The Somm is tasting<Dots />
            </Enter>
          )}
          {kind === "thinking" && !shown.rewritten && (
            <p ref={lineRef} style={hidden(tasting, lineGone)}>The Somm is tasting<Dots /></p>
          )}
        </div>
      )}
    </div>
  );
}
