"use client";

// useEntrance — plays one Ink entrance on an element when it mounts
// (docs/motion/README.md §6). The shared engine under Enter, LeaderDraw,
// RuleDraw and every primitive that takes `enterDelay`.
//
// It starts in a layout effect, before the first paint, and fills
// "backwards", so the element is held on its first keyframe through the
// delay and released when the entrance ends: nothing is left on it. Once per
// mount — a later change to `delay` or `play` never replays it.
//
// The style it returns is for server HTML only. Markup that arrives from
// the server is painted before any script runs, so an element about to
// enter has to arrive hidden; that style is dropped the moment hydration
// hands over to the animation. A client-side mount gets no style at all.
// Opacity keeps the element in the layout and able to take a tap.

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { HIDDEN, playEntrance } from "./motion";

export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const subscribe = () => () => {};

/** True on the server and through hydration; false on any client render. */
export function useHydrating() {
  return useSyncExternalStore(subscribe, () => false, () => true);
}

/** Merge the entrance's server-only style into an element's own. */
export function withEntrance(style, entranceStyle) {
  return entranceStyle ? { ...style, ...entranceStyle } : style;
}

export default function useEntrance(ref, kind, { delay = 0, duration, distance, easing, play = true } = {}) {
  const hydrating = useHydrating();
  useIsoLayoutEffect(() => {
    if (!play) return undefined;
    const animation = playEntrance(ref.current, kind, { delay, duration, distance, easing });
    return () => animation?.cancel();
    // Once per mount, with the values it mounted with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return play && hydrating ? HIDDEN : null;
}
