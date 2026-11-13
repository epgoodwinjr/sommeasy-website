"use client";

// PalateMarkLive — the palate mark in motion (docs/motion/README.md §7.2).
// The Bloom family's one surface: the mark draws itself at the reveal,
// grows when the DNA grows, and breathes while the Somm thinks.
//
//   <PalateMarkLive genome={g} reveal ready={saved} />        the reveal draw
//   <PalateMarkLive genome={after} growFrom={before} growDelay={700} celebrate />
//   <PalateMarkLive genome={g} />     at rest; grows whenever `genome` changes
//   <PalateMarkLive genome={g} breathing />                   the Somm's wait
//   <PalateMarkLive genome={g} bare={!answered} openMs={600} />  the quiz
//
// The motion itself is src/lib/palateMark.js — pure functions from a time
// to a state. This wrapper only keeps the clock: a requestAnimationFrame
// loop that paints each state into the span. WHEN AN ANIMATION ENDS THE SPAN
// HOLDS EXACTLY WHAT <PalateMark> RENDERS — the same markup, the same
// data-testid and aria-hidden — so every selector and screenshot of the
// mark at rest holds.
//
//   reveal      play the draw on mount: a medallion waits, then blooms. The
//               wait ends once `ready` is true and `minThink` ms have passed
//               (pass ready={false} while a save is pending).
//   growFrom    a genome to show first; after `growDelay` ms the mark grows
//               from that shape to `genome`.
//   genome      changing it later grows the mark from the shape it shows to
//               the new one over `growMs`. A change that lands mid-growth
//               waits its turn, so the mark never jumps.
//   celebrate   a growth is QUIET unless this is set: the shapes change and
//               nothing else plays (README §13). Set, the mark also swells,
//               a pulse crosses from its heart and each new berry ripples —
//               a real promotion's growth — and even then only when the
//               shape grew: palateMark.js never celebrates a smaller one.
//   bare        the medallion alone, still, while true (the quiz before its
//               first answer). When it turns false the bloom opens from it
//               over `openMs` (the reveal's draw, at its own pace by
//               default); when it turns true again the bloom closes back.
//               Genome changes meanwhile wait their turn, as above.
//   breathing   the wrapper breathes (a CSS loop) while true. Nowhere else:
//               a mark at rest stays at rest.
//   onDrawStart the reveal's draw has begun      onSettled  an animation ended
//
// `reveal` and `growFrom` are read when the mark mounts. Under reduced
// motion there is no loop at all: the settled frame, at once, and a reveal
// reports its draw the moment `ready` is true. A missing genome renders
// nothing, as PalateMark does. Decorative by the same contract.

import { useEffect, useRef } from "react";
import {
  MARK_MOTION, bareState, growLength, growState, markParams, openLength, openState,
  renderMarkState, revealLength, revealState, settledState,
} from "@/lib/palateMark";
import { BREATHE_ANIMATION, prefersReducedMotion } from "@/components/house/motion";
import { useIsoLayoutEffect } from "@/components/house/useEntrance";
import useReducedMotion from "@/components/house/useReducedMotion";

const shapeKey = (params) => JSON.stringify(params.genome);
const sameShape = (a, b) => Boolean(a && b) && shapeKey(a) === shapeKey(b);

/** The first frame — what the server sends and the first paint shows. */
function firstFrame({ params, size, reveal, bare, growFrom }) {
  if (reveal) return renderMarkState(revealState(params, 0, Infinity), { size });
  if (bare) return renderMarkState(bareState(params), { size });
  return renderMarkState(settledState(markParams(growFrom) || params), { size });
}

/** The clock. Plain DOM, no React: it reads the latest props through `props()`. */
function createClock(host, props) {
  let frameId = 0;
  let timerId = 0;
  let stopped = false;
  let shown = null; // the shape at rest on screen (null: nothing drawn yet, or bare)
  let isBare = false; // the bare medallion is what's on screen
  let target = null; // the shape the mark should end on
  let playing = null; // { kind: "reveal" | "grow" | "open" | "close", start, from, to, think, ms, mode }
  let awaitingReady = false; // a reduced-motion reveal that hasn't reported yet
  let painted = null;

  const paint = (state) => {
    const html = renderMarkState(state, { size: props().size });
    if (html === painted) return;
    host.innerHTML = html;
    painted = html;
  };

  const rest = (params) => {
    cancelAnimationFrame(frameId);
    frameId = 0;
    playing = null;
    shown = params;
    isBare = false;
    paint(settledState(params));
    props().onSettled?.();
    if (stopped) return;
    // Asked to go bare while that played: close
    if (props().bare) return close();
    // The genome moved on while that played: follow it
    if (!sameShape(shown, target)) grow(shown, target);
  };

  const restBare = () => {
    cancelAnimationFrame(frameId);
    frameId = 0;
    playing = null;
    shown = null;
    isBare = true;
    paint(bareState(target));
    props().onSettled?.();
    // Answered again while it closed: open again
    if (!stopped && !props().bare) open();
  };

  const frame = (now) => {
    frameId = 0;
    if (stopped || !playing) return;
    const p = props();
    const t = Math.max(0, now - playing.start);
    if (playing.kind === "reveal") {
      if (playing.think === Infinity && p.ready && t >= p.minThink) {
        playing.think = t;
        p.onDrawStart?.();
      }
      if (t >= playing.think + revealLength(playing.to)) return rest(playing.to);
      paint(revealState(playing.to, t, playing.think));
    } else if (playing.kind === "open") {
      if (t >= playing.ms) return rest(playing.to);
      paint(openState(playing.to, t, playing.ms));
    } else if (playing.kind === "close") {
      if (t >= playing.ms) return restBare();
      paint(openState(playing.from, playing.ms - t, playing.ms));
    } else {
      if (t >= growLength(playing.from, playing.to, playing.ms, playing.mode)) return rest(playing.to);
      paint(growState(playing.from, playing.to, t, playing.ms, playing.mode));
    }
    frameId = requestAnimationFrame(frame);
  };

  const play = (next) => {
    playing = { ...next, start: performance.now() };
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(frame);
  };

  function grow(from, to) {
    if (prefersReducedMotion()) return rest(to);
    // The mode is read as the growth starts, so it can't change its length
    // half-way through
    play({ kind: "grow", from, to, ms: props().growMs, mode: { celebrate: Boolean(props().celebrate) } });
  }

  // From the bare medallion to the shape asked for, and back
  function open() {
    if (prefersReducedMotion()) return rest(target);
    play({ kind: "open", to: target, ms: props().openMs ?? openLength(target) });
  }

  function close() {
    if (prefersReducedMotion() || !shown) return restBare();
    play({ kind: "close", from: shown, ms: props().openMs ?? openLength(shown) });
  }

  const reportReady = () => {
    if (!awaitingReady || !props().ready) return;
    awaitingReady = false;
    props().onDrawStart?.();
    props().onSettled?.();
  };

  return {
    begin() {
      const p = props();
      target = p.params;
      const from = markParams(p.growFrom);
      if (p.reveal) {
        if (prefersReducedMotion()) {
          shown = target;
          paint(settledState(target));
          awaitingReady = true;
          reportReady();
          return;
        }
        paint(revealState(target, 0, Infinity));
        play({ kind: "reveal", to: target, think: Infinity });
      } else if (p.bare) {
        isBare = true;
        paint(bareState(target));
      } else if (from && !sameShape(from, target)) {
        shown = from;
        paint(settledState(from));
        if (prefersReducedMotion()) return rest(target);
        timerId = setTimeout(() => {
          timerId = 0;
          grow(shown, target);
        }, Math.max(0, p.growDelay));
      } else {
        shown = target;
        paint(settledState(target));
      }
    },
    /** The genome changed. */
    retarget(next) {
      if (sameShape(next, target)) return;
      target = next;
      if (playing) {
        // A reveal still waiting has drawn nothing: it can simply aim anew.
        // Anything else finishes first, then follows (see rest)
        if (playing.kind === "reveal" && playing.think === Infinity) playing.to = next;
        return;
      }
      if (timerId || !shown) return; // growFrom's delay grows to the latest
      grow(shown, next);
    },
    /** `ready` changed. */
    ready: reportReady,
    /** `bare` changed. Mid-animation, rest() and restBare() pick it up. */
    bare() {
      if (playing || timerId) return;
      const want = props().bare;
      if (want && !isBare && shown) close();
      else if (!want && isBare) open();
    },
    /** `size` changed. */
    resize() {
      painted = null;
      if (!playing && shown) paint(settledState(shown));
      else if (!playing && isBare) paint(bareState(target));
    },
    /** Reduced motion was switched on mid-flight: end on the settled frame. */
    finish() {
      if (!playing && !timerId) return;
      clearTimeout(timerId);
      timerId = 0;
      if (playing?.kind === "reveal" && playing.think === Infinity) {
        // Still waiting on `ready`: show the settled mark, but the draw
        // hasn't "begun" until the wait is over — report it then, once
        cancelAnimationFrame(frameId);
        frameId = 0;
        playing = null;
        shown = target;
        paint(settledState(target));
        awaitingReady = true;
        reportReady();
        return;
      }
      rest(target);
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(frameId);
      clearTimeout(timerId);
    },
  };
}

function LiveMark({
  params, size, style, reveal, ready, minThink, growFrom, growDelay, growMs, celebrate,
  bare, openMs, breathing, onSettled, onDrawStart,
}) {
  const hostRef = useRef(null);
  const clockRef = useRef(null);
  const reduced = useReducedMotion();

  const props = useRef(null);
  props.current = {
    params, size, reveal, ready, minThink, growFrom, growDelay, growMs, celebrate, bare, openMs,
    onSettled, onDrawStart,
  };

  // The SAME OBJECT on every render — not just the same string. The React
  // that Next bundles re-applies dangerouslySetInnerHTML whenever the prop
  // is a new object, which would wipe the painted mark back to its first
  // frame on any re-render. Held in a ref, React writes it once and the
  // clock owns the span's contents from the first effect on
  const first = useRef(null);
  if (first.current === null) first.current = { __html: firstFrame(props.current) };

  useIsoLayoutEffect(() => {
    const clock = createClock(hostRef.current, () => props.current);
    clockRef.current = clock;
    clock.begin();
    return () => {
      clock.stop();
      clockRef.current = null;
    };
  }, []);

  const shape = shapeKey(params);
  useIsoLayoutEffect(() => { clockRef.current?.retarget(props.current.params); }, [shape]);
  // After retarget: a first answer opens straight to the shape it gave
  useIsoLayoutEffect(() => { clockRef.current?.bare(); }, [bare]);
  useIsoLayoutEffect(() => { clockRef.current?.resize(); }, [size]);
  useEffect(() => { clockRef.current?.ready(); }, [ready]);
  useEffect(() => { if (reduced) clockRef.current?.finish(); }, [reduced]);

  return (
    <span
      ref={hostRef}
      data-testid="palate-mark"
      aria-hidden="true"
      style={{
        display: "inline-flex", lineHeight: 0, flexShrink: 0,
        ...(breathing && !reduced && { animation: BREATHE_ANIMATION }),
        ...style,
      }}
      dangerouslySetInnerHTML={first.current}
    />
  );
}

export default function PalateMarkLive({
  genome, size = 96, style,
  reveal = false, ready = true, minThink = MARK_MOTION.thinkMs,
  growFrom = null, growDelay = 0, growMs = MARK_MOTION.growMs, celebrate = false,
  bare = false, openMs,
  breathing = false, onSettled, onDrawStart,
}) {
  const params = markParams(genome);
  if (!params) return null;
  return (
    <LiveMark
      params={params} size={size} style={style}
      reveal={reveal} ready={ready} minThink={minThink}
      growFrom={growFrom} growDelay={growDelay} growMs={growMs} celebrate={celebrate}
      bare={bare} openMs={openMs}
      breathing={breathing} onSettled={onSettled} onDrawStart={onDrawStart}
    />
  );
}
