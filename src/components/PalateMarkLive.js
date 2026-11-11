"use client";

// PalateMarkLive — the palate mark in motion (docs/motion/README.md §7.2).
// The Bloom family's one surface: the mark draws itself at the reveal,
// grows when the DNA grows, and breathes while the Somm thinks.
//
//   <PalateMarkLive genome={g} reveal ready={saved} />        the reveal draw
//   <PalateMarkLive genome={after} growFrom={before} growDelay={700} />
//   <PalateMarkLive genome={g} />     at rest; grows whenever `genome` changes
//   <PalateMarkLive genome={g} breathing />                   the Somm's wait
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
  MARK_MOTION, growLength, growState, markParams, renderMarkState,
  revealLength, revealState, settledState,
} from "@/lib/palateMark";
import { BREATHE_ANIMATION, prefersReducedMotion } from "@/components/house/motion";
import { useIsoLayoutEffect } from "@/components/house/useEntrance";
import useReducedMotion from "@/components/house/useReducedMotion";

const shapeKey = (params) => JSON.stringify(params.genome);
const sameShape = (a, b) => Boolean(a && b) && shapeKey(a) === shapeKey(b);

/** The first frame — what the server sends and the first paint shows. */
function firstFrame({ params, size, reveal, growFrom }) {
  if (reveal) return renderMarkState(revealState(params, 0, Infinity), { size });
  return renderMarkState(settledState(markParams(growFrom) || params), { size });
}

/** The clock. Plain DOM, no React: it reads the latest props through `props()`. */
function createClock(host, props) {
  let frameId = 0;
  let timerId = 0;
  let stopped = false;
  let shown = null; // the shape at rest on screen (null: nothing drawn yet)
  let target = null; // the shape the mark should end on
  let playing = null; // { kind: "reveal" | "grow", start, from, to, think, ms }
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
    paint(settledState(params));
    props().onSettled?.();
    // The genome moved on while that played: follow it
    if (!stopped && !sameShape(shown, target)) grow(shown, target);
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
    } else {
      if (t >= growLength(playing.from, playing.to, playing.ms)) return rest(playing.to);
      paint(growState(playing.from, playing.to, t, playing.ms));
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
    play({ kind: "grow", from, to, ms: props().growMs });
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
    /** `size` changed. */
    resize() {
      painted = null;
      if (!playing && shown) paint(settledState(shown));
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
  params, size, style, reveal, ready, minThink, growFrom, growDelay, growMs,
  breathing, onSettled, onDrawStart,
}) {
  const hostRef = useRef(null);
  const clockRef = useRef(null);
  const reduced = useReducedMotion();

  const props = useRef(null);
  props.current = { params, size, reveal, ready, minThink, growFrom, growDelay, growMs, onSettled, onDrawStart };

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
  growFrom = null, growDelay = 0, growMs = MARK_MOTION.growMs,
  breathing = false, onSettled, onDrawStart,
}) {
  const params = markParams(genome);
  if (!params) return null;
  return (
    <LiveMark
      params={params} size={size} style={style}
      reveal={reveal} ready={ready} minThink={minThink}
      growFrom={growFrom} growDelay={growDelay} growMs={growMs}
      breathing={breathing} onSettled={onSettled} onDrawStart={onDrawStart}
    />
  );
}
