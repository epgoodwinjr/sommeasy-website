"use client";

// useReducedMotion — true when the viewer asked for less motion
// (docs/motion/README.md §5.2). False on the server and through hydration,
// then the real answer, and it follows the setting if it changes mid-visit.
//
// For components that RENDER differently (the bloom's settled frame, the
// Welcome demo's final state). An entrance doesn't need it: playEntrance
// reads the setting itself at the moment it plays.

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(QUERY);
  // Safari < 14 only has the deprecated addListener
  if (media.addEventListener) media.addEventListener("change", onChange);
  else media.addListener?.(onChange);
  return () => {
    if (media.removeEventListener) media.removeEventListener("change", onChange);
    else media.removeListener?.(onChange);
  };
}

function getSnapshot() {
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

const getServerSnapshot = () => false;

export default function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
