"use client";

// SectionHead — "I. TONIGHT, OUT ———" (README §7.2).
//
// A real heading (h2 unless `as` says otherwise) so screen readers can jump
// section to section. The numeral comes from the caller — numeralCounter()
// in @/lib/numerals, so a section that doesn't render never takes one. The
// margin is the caller's too (typically "30px 0 16px" before an entry,
// "30px 0 2px" before rows, "30px 0 12px" before prose).
//
// Given `enterDelay` (ms), the head arrives in ink: the numeral fades in,
// then the label fades as the rule draws (docs/motion/README.md §6).

import { useRef } from "react";
import RuleDraw from "./RuleDraw";
import useEntrance, { withEntrance } from "./useEntrance";
import { HEAD_ENTER } from "./motion";
import { BURGUNDY, INK, SANS, SERIF, ink } from "./tokens";

const numeralStyle = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", fontWeight: 400, color: BURGUNDY,
};
const labelStyle = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.24em", color: INK, opacity: 0.5, whiteSpace: "nowrap",
};
const ruleStyle = { flex: 1, height: 1, background: ink(0.1) };

export default function SectionHead({ numeral, label, as: Tag = "h2", style, enterDelay }) {
  const numeralRef = useRef(null);
  const labelRef = useRef(null);
  const play = enterDelay != null;
  const after = play ? enterDelay + HEAD_ENTER.rule : undefined;
  const numeralEntering = useEntrance(numeralRef, "fade", { delay: enterDelay, play });
  const labelEntering = useEntrance(labelRef, "fade", { delay: after, play });
  return (
    <Tag style={{
      display: "flex", alignItems: "center", gap: 10, margin: 0,
      fontSize: "inherit", fontWeight: "inherit", ...style,
    }}>
      {numeral && (
        <span ref={numeralRef} aria-hidden="true" style={withEntrance(numeralStyle, numeralEntering)}>{numeral}</span>
      )}
      <span ref={labelRef} style={withEntrance(labelStyle, labelEntering)}>{label}</span>
      <RuleDraw enterDelay={after} style={ruleStyle} />
    </Tag>
  );
}
