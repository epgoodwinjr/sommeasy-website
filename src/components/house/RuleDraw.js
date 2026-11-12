"use client";

// RuleDraw — a hairline that can draw itself from one end
// (docs/motion/README.md §6).
//
// The rule's look is the caller's `style`. With no `enterDelay` it is that
// plain element. Given one, it grows along X from `origin` ("left" unless
// told otherwise — the Divider draws its two rules outward from the ✦) and
// rests with no transform.
//
// Whether it draws is decided once, when it mounts — like the entrance
// itself. A caller may pass `enterDelay` on its arrival render only (Your
// picks does); if the origin followed the live prop, the next re-render
// would drop it under a draw still pending and the rule would grow from its
// centre.

import { useRef } from "react";
import useEntrance, { withEntrance } from "./useEntrance";

export default function RuleDraw({ enterDelay, duration, origin = "left", as: Tag = "span", style }) {
  const ref = useRef(null);
  const play = enterDelay != null;
  const drawn = useRef(play).current;
  const entering = useEntrance(ref, "rule", { delay: enterDelay, duration, play });
  return (
    <Tag
      ref={ref}
      aria-hidden="true"
      style={withEntrance(drawn ? { ...style, transformOrigin: origin } : style, entering)}
    />
  );
}
