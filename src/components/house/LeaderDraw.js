"use client";

// LeaderDraw — a dotted leader that can draw itself left to right
// (docs/motion/README.md §6).
//
// The leader's look (width, alpha, the margin that sits it on the baseline)
// is the caller's `style`, exactly as before. With no `enterDelay` it is
// that plain span and nothing more. Given one, it draws after that many ms
// by clipping — scaling a dotted border would stretch its dots.

import { useRef } from "react";
import useEntrance, { withEntrance } from "./useEntrance";

export default function LeaderDraw({ enterDelay, duration, style }) {
  const ref = useRef(null);
  const entering = useEntrance(ref, "leader", { delay: enterDelay, duration, play: enterDelay != null });
  return <span ref={ref} aria-hidden="true" style={withEntrance(style, entering)} />;
}
