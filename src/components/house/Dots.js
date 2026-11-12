"use client";

// Dots — the three dots after a line that is still being thought about
// (docs/motion/README.md §8.3, §8.5): "The Somm is reading your palate...".
// Each breathes on `house-dot`, one after another (DOTS in motion.js).
//
// Decorative: the line reads the same to a screen reader without them.
// Under reduced motion they are three plain dots.

import { dotAnimation } from "./motion";
import useReducedMotion from "./useReducedMotion";

const DOT = [0, 1, 2];

export default function Dots() {
  const reduced = useReducedMotion();
  return (
    <span aria-hidden="true">
      {DOT.map((i) => (
        <span key={i} style={reduced ? undefined : { animation: dotAnimation(i) }}>.</span>
      ))}
    </span>
  );
}
