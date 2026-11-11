"use client";

// Divider — the ✦ between two hairlines (README §7.1). Decorative only;
// the caller sets its margin. Given `enterDelay` (ms), the two rules draw
// outward from the ✦ as it fades in (docs/motion/README.md §6).

import { useRef } from "react";
import RuleDraw from "./RuleDraw";
import useEntrance, { withEntrance } from "./useEntrance";
import { BURGUNDY, ink } from "./tokens";

const rule = { flex: 1, height: 1, background: ink(0.14) };
const star = { fontSize: "10px", lineHeight: 1, color: BURGUNDY };

export default function Divider({ style, enterDelay }) {
  const starRef = useRef(null);
  const entering = useEntrance(starRef, "fade", { delay: enterDelay, play: enterDelay != null });
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 14, ...style }}>
      <RuleDraw as="div" origin="right" enterDelay={enterDelay} style={rule} />
      <span ref={starRef} style={withEntrance(star, entering)}>✦</span>
      <RuleDraw as="div" origin="left" enterDelay={enterDelay} style={rule} />
    </div>
  );
}
