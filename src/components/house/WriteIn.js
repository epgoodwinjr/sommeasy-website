"use client";

// WriteIn — prose that appears word by word (docs/motion/README.md §6): the
// Somm's notes, a headline, the whisper.
//
//   <WriteIn as="p" text={note} delay={520} step={26} style={…} />
//
// While it writes, each word is an inline-block span that fades and rises
// (the spaces stay plain text between them, so the line breaks where the
// settled line will). When the last word lands the spans are replaced by
// ONE plain text node: the settled DOM, its textContent and what a screen
// reader meets are exactly what a plain <p>{note}</p> gives. textContent
// equals `text` at every moment in between, too.
//
// `delay` counts from the mount. `awaitFonts` is for headlines: a web font
// arriving mid-write would reflow the words, so the split waits for
// document.fonts (FONT_WAIT_MS at most) and takes that wait out of the
// delay. Under reduced motion the text never splits — it fades in whole.
// A `text` that changes after the mount is simply shown; remount (a new
// key) to write again. Any other prop (data-testid, id) lands on the
// element, and the ref reaches it — the SAME element while it writes and
// once it has settled, for a line that takes focus when it arrives. It adds
// no aria-live: a live region is the caller's to own.

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  D_WORD, FONT_WAIT_MS, HIDDEN, SOFT_OUT, WORD_STEP,
  entranceKeyframes, playEntrance, prefersReducedMotion,
} from "./motion";
import { useHydrating, useIsoLayoutEffect, withEntrance } from "./useEntrance";

const WORD = { display: "inline-block" };

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

const WriteIn = forwardRef(function WriteIn({
  text, as: Tag = "span", delay = 0, step = WORD_STEP, duration = D_WORD,
  awaitFonts = false, onDone, style, ...rest
}, forwarded) {
  const ref = useRef(null);
  const setRef = useCallback((el) => {
    ref.current = el;
    if (typeof forwarded === "function") forwarded(el);
    else if (forwarded) forwarded.current = el;
  }, [forwarded]);
  const startedAt = useRef(null);
  const firstText = useRef(text);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const hydrating = useHydrating();
  // start → (waiting, for fonts) → writing → done
  const [stage, setStage] = useState("start");
  const shown = text === firstText.current ? stage : "done";

  // Decide, before the first paint, how this line arrives
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (startedAt.current == null) startedAt.current = now();
    if (prefersReducedMotion() || !el || typeof el.animate !== "function") {
      const fade = playEntrance(el, "fade");
      setStage("done");
      return () => fade?.cancel();
    }
    const fonts = awaitFonts ? document.fonts : null;
    if (!fonts || fonts.status === "loaded") {
      setStage("writing");
      return undefined;
    }
    setStage("waiting");
    let waiting = true;
    const write = () => {
      if (!waiting) return;
      waiting = false;
      setStage("writing");
    };
    const timer = setTimeout(write, FONT_WAIT_MS);
    fonts.ready.then(write, write);
    return () => {
      waiting = false;
      clearTimeout(timer);
    };
    // Once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write the words, then settle into plain text
  useIsoLayoutEffect(() => {
    if (shown !== "writing") return undefined;
    const words = Array.from(ref.current?.querySelectorAll("[data-word]") ?? []);
    if (words.length === 0) {
      setStage("done");
      return undefined;
    }
    const base = Math.max(0, delay - (now() - startedAt.current));
    const keyframes = entranceKeyframes("word");
    const animations = words.map((word, i) => word.animate(keyframes, {
      delay: base + i * step, duration, easing: SOFT_OUT, fill: "backwards",
    }));
    let live = true;
    animations[animations.length - 1].finished.then(
      () => { if (live) setStage("done"); },
      () => {}, // cancelled: the cleanup below, or the line left the page
    );
    return () => {
      live = false;
      animations.forEach((animation) => animation.cancel());
    };
    // The words are written once, with the timing the line mounted with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useEffect(() => {
    if (shown === "done") onDoneRef.current?.();
  }, [shown]);

  if (shown === "writing") {
    // Words and the whitespace between them, in order: [word, space, word, …]
    const parts = String(text ?? "").split(/(\s+)/);
    return (
      <Tag ref={setRef} style={style} {...rest}>
        {parts.map((part, i) => (
          i % 2 === 1 || part === "" ? part : <span key={i} data-word="" style={WORD}>{part}</span>
        ))}
      </Tag>
    );
  }
  // Hidden only while it can't have started: in server HTML, or waiting on fonts
  const hidden = shown === "waiting" || (shown === "start" && hydrating);
  return <Tag ref={setRef} style={withEntrance(style, hidden ? HIDDEN : null)} {...rest}>{text}</Tag>;
});

export default WriteIn;
