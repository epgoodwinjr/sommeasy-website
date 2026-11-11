"use client";

// Enter — wraps its children and plays an entrance on mount
// (docs/motion/README.md §6):
//
//   rise — fades in while climbing 12px (override with `distance`)
//   fade — opacity only: eyebrows, meta, prices
//   pop  — a mark landing, from 0.6 scale
//
// after `delay` ms. The wrapper is a div unless `as` says otherwise; any
// other prop (data-testid, aria-*) lands on it. A rise or pop moves only
// what CSS can transform: a block, a flex or grid item, an inline-block —
// a plain inline span would fade without moving. When the entrance ends the
// wrapper carries no transform and no opacity of its own. Under reduced
// motion every kind is a short fade with no movement and no delay.

import { useRef } from "react";
import useEntrance, { withEntrance } from "./useEntrance";

export default function Enter({
  kind = "rise", delay = 0, duration, distance, as: Tag = "div", style, children, ...rest
}) {
  const ref = useRef(null);
  const entering = useEntrance(ref, kind, { delay, duration, distance });
  return <Tag ref={ref} style={withEntrance(style, entering)} {...rest}>{children}</Tag>;
}
