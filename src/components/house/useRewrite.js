"use client";

// useRewrite — content that is rewritten in place (docs/motion/README.md
// §8.5, decision M8): the Somm's summary over "The Somm is tasting…", the
// Somm's note over the engine's.
//
//   const { shown, leaving, boxRef, outRef } = useRewrite(key, payload, { delay });
//
// `key` names what should be showing ("" for nothing) and `payload` is
// whatever the caller needs to render it. The first key simply shows. After
// that each change plays in three beats:
//
//   1. it waits `delay` (the landing's stagger: pick by pick),
//   2. the old content — the element on `outRef` — fades out (SOMM.outMs);
//      while it does, `leaving` is true and the caller holds that element at
//      opacity 0, so nothing flashes back when the fade ends,
//   3. the new content takes its place: the caller renders `shown.payload`,
//      written in when `shown.rewritten`, while the box on `boxRef` eases
//      from its old height to its new one (easeHeight — the one layout
//      animation in the system), so nothing under it jumps.
//
// A change that lands mid-rewrite isn't lost: the rewrite goes on to the
// latest. Under reduced motion the new content simply takes the old one's
// place, in the same commit. The box should be `display: flow-root`, so a
// child's margin is inside the height that eases.

import { useCallback, useEffect, useRef, useState } from "react";
import { EASE, SOMM, easeHeight, prefersReducedMotion } from "./motion";
import { useIsoLayoutEffect } from "./useEntrance";

export default function useRewrite(key, payload, { delay = 0 } = {}) {
  const latest = useRef(null);
  latest.current = { key, payload, delay };
  const [shown, setShown] = useState(() => ({ key, payload, rewritten: false }));
  // rest → wait → out → rest
  const [phase, setPhase] = useState("rest");
  const boxRef = useRef(null);
  const outRef = useRef(null);
  const fromHeight = useRef(null);

  const swap = useCallback(() => {
    const box = boxRef.current;
    fromHeight.current = box ? box.getBoundingClientRect().height : null;
    setShown({ key: latest.current.key, payload: latest.current.payload, rewritten: true });
    setPhase("rest");
  }, []);

  // A new key — or the key moved on while the last rewrite played
  useIsoLayoutEffect(() => {
    if (phase !== "rest" || key === shown.key) return;
    if (prefersReducedMotion()) {
      setShown({ key, payload, rewritten: true });
      return;
    }
    setPhase("wait");
    // `payload` rides with its key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, phase, shown.key]);

  useEffect(() => {
    if (phase === "wait") {
      const timer = setTimeout(() => setPhase("out"), Math.max(0, Number(latest.current.delay) || 0));
      return () => clearTimeout(timer);
    }
    if (phase !== "out") return undefined;
    const el = outRef.current;
    if (!el || typeof el.animate !== "function") {
      swap();
      return undefined;
    }
    let live = true;
    const animation = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: SOMM.outMs, easing: EASE, fill: "backwards",
    });
    animation.finished.then(() => { if (live) swap(); }, () => {});
    return () => {
      live = false;
      animation.cancel();
    };
  }, [phase, swap]);

  // The new content is in: ease the box from the height it had
  useIsoLayoutEffect(() => {
    const from = fromHeight.current;
    if (from == null) return undefined;
    fromHeight.current = null;
    const animation = easeHeight(boxRef.current, from);
    return () => animation?.cancel();
  }, [shown.key]);

  return {
    // The same key with a fresher payload renders the fresher one
    shown: shown.key === key ? { ...shown, payload } : shown,
    leaving: phase === "out",
    boxRef,
    outRef,
  };
}
