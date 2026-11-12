"use client";

// WelcomeDemo — "Watch it work" on the Welcome screen (docs/motion/README.md
// §8.1, decision M7): a wine list is read, three lines on it step forward,
// and the picks write themselves in. No instructions, no data — sample
// content in one constant (DEMO), set in the house components the real
// picks use.
//
// It plays when 45% of it is in view, loops while it stays in view, and a
// cycle that ends off-screen rests on the picks until it is seen again. The
// block is a fixed height — its tallest state's, measured for the column it
// is in (README §13) — so the status line sits just under it and nothing
// below ever moves. Under reduced motion it shows its last frame — the
// picks, the last status line, a full bar — and never plays.
//
// Decorative: one role="img" with a plain description; screen readers
// don't sit through the loop. data-state is how e2e/motion.spec.ts sees
// what it is doing: "waiting" (the page is still arriving), "idle" (ready,
// but not in view yet), "playing", "resting" (a cycle ended off-screen) or
// "still" (reduced motion). The status
// lines are houseCopy's readingLine() — the same words the real reading
// view says, never retyped here.

import { useCallback, useEffect, useRef, useState } from "react";
import { readingLine } from "@/lib/houseCopy";
import Enter from "@/components/house/Enter";
import LeaderDraw from "@/components/house/LeaderDraw";
import ProgressLine from "@/components/house/ProgressLine";
import SectionHead from "@/components/house/SectionHead";
import SwapLine from "@/components/house/SwapLine";
import WriteIn from "@/components/house/WriteIn";
import useReducedMotion from "@/components/house/useReducedMotion";
import { useIsoLayoutEffect } from "@/components/house/useEntrance";
import { EASE } from "@/components/house/motion";
import { BURGUNDY, INK, SANS, SERIF, TYPE, ink, leader } from "@/components/house/tokens";

/** The sample list and its picks — the motion study's, nobody's data. */
export const DEMO = {
  head: "By the bottle · White",
  list: [
    ["Sancerre, Domaine Vacheron 2023", "92"],
    ["Chablis 1er Cru, William Fèvre 2022", "110"],
    ["Chardonnay, Newton Johnson 2023", "78"],
    ["Chenin Blanc, Ken Forrester 2022", "48"],
    ["Riesling Kabinett, J.J. Prüm 2022", "84"],
    ["Viña Gravonia, López de Heredia 2015", "74"],
    ["Albariño, Do Ferreiro 2023", "62"],
    ["Grüner Veltliner, Nikolaihof 2022", "68"],
  ],
  // The three lines that match, in pick order
  matches: [2, 3, 5],
  top: {
    numeral: "I.", role: "🏆 Top pick", name: "Newton Johnson Chardonnay", vintage: "2023", price: "$78",
    meta: "Hemel-en-Aarde · Chardonnay",
    note: "“Sea-cooled Chardonnay with your kind of nerve. White Burgundy that moved somewhere sunnier.”",
  },
  more: [
    { numeral: "II.", name: "Ken Forrester Chenin Blanc", price: "$48" },
    { numeral: "III.", name: "López de Heredia Gravonia", price: "$74" },
  ],
};

/** One cycle (§8.1's table), in ms from its start. */
export const DEMO_CYCLE = {
  armAt: 1500, // the Welcome entrance has reached the demo by now
  threshold: 0.45, // of the block in view before it plays
  fadeMs: 400, // the block fading in at a cycle's start, out at its end
  readBar: { value: 0.55, ms: 2000 },
  scanAt: 350, scanMs: 1750,
  rowsAt: 480, rowsSpan: 1470, rowMs: 650,
  countAt: 2150,
  weighAt: 2900, weighBar: { value: 0.9, ms: 900 },
  matchAt: 3800, matchStep: 160, matchMs: 450, matchBar: { value: 1, ms: 500 },
  sheetOutAt: 5100, sheetOutMs: 420, sheetOutPx: 10,
  picksAt: 5400,
  endAt: 10600,
};

/** Inside the picks, from their start (the study's numbers). */
const PICKS_AT = { head: 0, name: 180, leader: 420, price: 800, meta: 480, note: 700, noteStep: 34, rows: 1500, rowStep: 180 };

// The block's height until it has been measured, and wherever it can't be:
// its tallest state on a phone (the picks, their note on three lines)
const FALLBACK_HEIGHT = 284;
const STATUS_GAP = 16;
const ROW_INK = { before: 0.55, passing: 1, after: 0.78, others: 0.26 };
const TICKS = ["i.", "ii.", "iii."];

const sheetStyle = {
  position: "absolute", inset: "0 0 auto 0", overflow: "hidden",
  background: "rgba(255,255,255,0.6)", border: `1px solid ${ink(0.12)}`, borderRadius: 3,
  padding: "14px 18px 12px", boxShadow: "0 10px 30px rgba(27,61,47,0.08)",
};
const sheetHead = {
  textAlign: "center", fontFamily: SANS, fontSize: "9px", fontWeight: 700, lineHeight: 1,
  letterSpacing: "0.3em", textTransform: "uppercase", color: ink(0.5),
  paddingBottom: 10, borderBottom: `1px solid ${ink(0.12)}`, marginBottom: 6,
};
const listLine = {
  display: "flex", alignItems: "flex-end", gap: 6, padding: "5px 0",
  fontFamily: SERIF, fontSize: "12.5px", lineHeight: 1.35,
};
const listName = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 };
const listLeader = { flex: 1, minWidth: 8, borderBottom: leader(1), marginBottom: 4 };
const scanStyle = {
  position: "absolute", left: 0, right: 0, top: 0, height: 26, pointerEvents: "none", opacity: 0,
  background: "linear-gradient(180deg, rgba(139,35,50,0) 0%, rgba(139,35,50,0.07) 80%, rgba(139,35,50,0.5) 100%)",
  borderBottom: "1px solid rgba(139,35,50,0.5)",
};
const priceStyle = { flexShrink: 0, whiteSpace: "nowrap", fontFamily: SERIF, fontVariantNumeric: "tabular-nums", color: INK };

/** One line of the list: the name, a leader, the price. */
function ListLine({ name, price, color = INK }) {
  return (
    <>
      <span style={{ ...listName, color }}>{name}</span>
      <span aria-hidden="true" style={listLeader} />
      <span style={{ fontVariantNumeric: "tabular-nums", color }}>{price}</span>
    </>
  );
}

/** The list being read. Mounted fresh every cycle; plays its read on mount. */
function Sheet({ stage }) {
  const sheetRef = useRef(null);
  const scanRef = useRef(null);
  const rowRefs = useRef([]);
  const matched = stage !== "read";
  const leaving = stage === "leaving" || stage === "picks";

  // The read: a line travels down the sheet, and each row darkens to full
  // ink as it passes, then rests a shade lighter
  useIsoLayoutEffect(() => {
    const C = DEMO_CYCLE;
    const rows = rowRefs.current.filter(Boolean);
    const scan = scanRef.current;
    if (!scan || rows.length === 0 || typeof scan.animate !== "function") return undefined;
    const first = rows[0], last = rows[rows.length - 1];
    const y0 = first.offsetTop + first.offsetHeight - 26;
    const y1 = last.offsetTop + last.offsetHeight - 26;
    const animations = [
      scan.animate([
        { offset: 0, opacity: 0, transform: `translateY(${y0}px)` },
        { offset: 0.08, opacity: 1, transform: `translateY(${y0}px)` },
        { offset: 0.92, opacity: 1, transform: `translateY(${y1}px)` },
        { offset: 1, opacity: 0, transform: `translateY(${y1}px)` },
      ], { delay: C.scanAt, duration: C.scanMs, easing: "cubic-bezier(0.4,0,0.6,1)", fill: "backwards" }),
      ...rows.map((row, i) => row.animate([
        { offset: 0, opacity: ROW_INK.before },
        { offset: 0.35, opacity: ROW_INK.passing },
        { offset: 1, opacity: ROW_INK.after },
      ], { delay: C.rowsAt + i * (C.rowsSpan / rows.length), duration: C.rowMs, easing: EASE, fill: "backwards" })),
    ];
    return () => animations.forEach((a) => a.cancel());
  }, []);

  // The match: three lines come forward, 160ms apart, and the rest step back
  useIsoLayoutEffect(() => {
    if (!matched) return undefined;
    const C = DEMO_CYCLE;
    const animations = rowRefs.current.flatMap((row, i) => {
      if (!row || typeof row.animate !== "function") return [];
      const k = DEMO.matches.indexOf(i);
      return [k >= 0
        ? row.animate([{ opacity: ROW_INK.after }, {}], {
          delay: k * C.matchStep, duration: C.matchMs, easing: EASE, fill: "backwards",
        })
        : row.animate([{ opacity: ROW_INK.after }, {}], { duration: 500, easing: EASE, fill: "backwards" })];
    });
    return () => animations.forEach((a) => a.cancel());
  }, [matched]);

  // The list gives way to the picks
  useIsoLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!leaving || !sheet || typeof sheet.animate !== "function") return undefined;
    const C = DEMO_CYCLE;
    const animation = sheet.animate(
      [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(-${C.sheetOutPx}px)` }],
      { duration: C.sheetOutMs, easing: EASE, fill: "backwards" },
    );
    return () => animation.cancel();
    // Once: the sheet leaves and stays gone until the next cycle remounts it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  return (
    <div ref={sheetRef} style={{ ...sheetStyle, opacity: leaving ? 0 : 1 }}>
      <div style={sheetHead}>{DEMO.head}</div>
      {DEMO.list.map(([name, price], i) => {
        const k = DEMO.matches.indexOf(i);
        return (
          <div
            key={name}
            ref={(el) => { rowRefs.current[i] = el; }}
            style={{
              ...listLine, position: "relative", color: INK,
              opacity: matched ? (k >= 0 ? 1 : ROW_INK.others) : ROW_INK.after,
            }}
          >
            <ListLine name={name} price={price} />
            {matched && k >= 0 && (
              <>
                {/* The line turns burgundy: the same line over it, fading in */}
                <Enter kind="fade" delay={k * DEMO_CYCLE.matchStep} duration={DEMO_CYCLE.matchMs} style={{
                  ...listLine, position: "absolute", inset: 0, background: "rgba(252,250,246,1)",
                }}>
                  <ListLine name={name} price={price} color={BURGUNDY} />
                </Enter>
                <Enter kind="fade" as="span" delay={k * DEMO_CYCLE.matchStep} duration={400} style={{
                  // In the margin, ending just before the line: "iii." is wider than "i."
                  position: "absolute", right: "calc(100% + 4px)", top: 5, fontFamily: SERIF, fontStyle: "italic",
                  fontSize: "11px", lineHeight: 1.5, color: BURGUNDY,
                }}>{TICKS[k]}</Enter>
              </>
            )}
          </div>
        );
      })}
      <div ref={scanRef} style={scanStyle} />
    </div>
  );
}

/** The picks, written in. Under reduced motion every entrance is a short fade. */
function Picks() {
  const { top, more } = DEMO;
  const A = PICKS_AT;
  return (
    <div style={{ position: "absolute", inset: "0 0 auto 0" }}>
      <SectionHead as="div" numeral={top.numeral} label={top.role} enterDelay={A.head} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 14 }}>
        <Enter delay={A.name} style={{
          minWidth: 0, fontFamily: SERIF, fontSize: "19px", fontWeight: 600, lineHeight: 1.25, color: INK,
        }}>
          {top.name} <span style={{ fontStyle: "italic", fontWeight: 400 }}>{top.vintage}</span>
        </Enter>
        <LeaderDraw enterDelay={A.leader} style={{ flex: 1, minWidth: 14, borderBottom: leader(1.5), marginBottom: 6 }} />
        <Enter kind="fade" as="span" delay={A.price} style={{ ...priceStyle, fontSize: "17px", lineHeight: 1.3 }}>
          {top.price}
        </Enter>
      </div>
      <Enter kind="fade" delay={A.meta} style={{ ...TYPE.meta, lineHeight: 1.4, marginTop: 6 }}>{top.meta}</Enter>
      <WriteIn as="p" text={top.note} delay={A.note} step={A.noteStep} data-testid="welcome-demo-note" style={{
        fontFamily: SERIF, fontStyle: "italic", fontSize: "14.5px", lineHeight: 1.55, color: ink(0.78), marginTop: 10,
      }} />
      <div style={{ marginTop: 16 }}>
        {more.map((pick, i) => (
          <Enter key={pick.name} delay={A.rows + i * A.rowStep} style={{
            display: "flex", alignItems: "flex-end", gap: 8, padding: "11px 0",
            borderTop: `1px solid ${ink(0.08)}`,
            borderBottom: i === more.length - 1 ? `1px solid ${ink(0.08)}` : undefined,
          }}>
            <span style={{ ...numeralCell }}>{pick.numeral}</span>
            <span style={{ ...listName, fontFamily: SERIF, fontSize: "15px", lineHeight: 1.35, color: INK }}>{pick.name}</span>
            <span aria-hidden="true" style={{ flex: 1, minWidth: 12, borderBottom: leader(1.5), marginBottom: 6 }} />
            <span style={{ ...priceStyle, fontSize: "15px", lineHeight: 1.3 }}>{pick.price}</span>
          </Enter>
        ))}
      </div>
    </div>
  );
}

const numeralCell = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.4, color: BURGUNDY, width: 20, flexShrink: 0,
};

const FINAL_LINE = readingLine("done", DEMO.matches.length);

export default function WelcomeDemo({ style }) {
  const reduced = useReducedMotion();
  const blockRef = useRef(null);
  const timers = useRef([]);
  const live = useRef({ armed: false, inView: false, playing: false });

  // "waiting" → "idle" → "playing" ⇄ "resting"
  const [state, setState] = useState("waiting");
  const [cycle, setCycle] = useState(0);
  // "read" → "match" → "leaving" → "picks"
  const [stage, setStage] = useState(null);
  const [status, setStatus] = useState("");
  const [bar, setBar] = useState({ value: 0, ms: 0 });
  const [fading, setFading] = useState(false);

  // The block is exactly as tall as its tallest state in this column: the
  // list, or — where the Somm's note runs to a third line — the picks.
  // Which one depends on the width, so it is measured: both are laid out
  // once, unseen, read before the paint and taken away again, leaving
  // nothing in the DOM. A new column width measures again, and so does a
  // web font arriving — a face loads the first time something is set in it,
  // which for the Somm's italic is this very measurement.
  const [height, setHeight] = useState(FALLBACK_HEIGHT);
  const [measuring, setMeasuring] = useState(false);
  const sizerRef = useRef(null);

  useIsoLayoutEffect(() => { setMeasuring(true); }, []);

  useIsoLayoutEffect(() => {
    if (!measuring) return;
    const states = Array.from(sizerRef.current?.children ?? []);
    const tallest = Math.max(0, ...states.map((el) => el.getBoundingClientRect().height));
    if (tallest > 0) setHeight(Math.ceil(tallest));
    setMeasuring(false);
  }, [measuring]);

  useEffect(() => {
    const block = blockRef.current;
    if (!block) return undefined;
    let live = true;
    let width = block.offsetWidth;
    const remeasure = () => { if (live) setMeasuring(true); };
    let observer = null;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => {
        if (block.offsetWidth === width) return;
        width = block.offsetWidth;
        remeasure();
      });
      observer.observe(block);
    }
    // Text wraps differently once a face is in: measure after every load
    const fonts = typeof document === "undefined" ? null : document.fonts;
    fonts?.addEventListener?.("loadingdone", remeasure);
    return () => {
      live = false;
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", remeasure);
    };
  }, []);

  const at = useCallback((ms, fn) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const runCycle = useCallback(() => {
    const C = DEMO_CYCLE;
    const n = DEMO.list.length;
    clearTimers();
    live.current.playing = true;
    setState("playing");
    setFading(false);
    setCycle((c) => c + 1);
    setStage("read");
    setStatus(readingLine());
    setBar(C.readBar);
    at(C.countAt, () => setStatus(readingLine("count", n)));
    at(C.weighAt, () => {
      setStatus(readingLine("weigh", n));
      setBar(C.weighBar);
    });
    at(C.matchAt, () => {
      setStatus(FINAL_LINE);
      setBar(C.matchBar);
      setStage("match");
    });
    at(C.sheetOutAt, () => setStage("leaving"));
    at(C.picksAt, () => setStage("picks"));
    at(C.endAt, () => {
      if (live.current.inView) {
        // Fade out, then round again
        setFading(true);
        at(C.fadeMs + 50, runCycle);
      } else {
        // Ended off-screen: rest on the picks until it is seen again
        live.current.playing = false;
        setState("resting");
      }
    });
  }, [at]);

  const start = useCallback(() => {
    const L = live.current;
    if (L.playing || !L.armed || !L.inView) return;
    L.playing = true;
    if (stage === "picks") {
      // Back from resting: let the picks go before the next list comes in
      setFading(true);
      at(DEMO_CYCLE.fadeMs + 50, runCycle);
    } else {
      runCycle();
    }
  }, [at, runCycle, stage]);
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (reduced) return undefined;
    const L = live.current;
    const arm = setTimeout(() => {
      L.armed = true;
      setState((s) => (s === "waiting" ? "idle" : s));
      startRef.current();
    }, DEMO_CYCLE.armAt);
    let observer = null;
    if (typeof IntersectionObserver === "function" && blockRef.current) {
      observer = new IntersectionObserver((entries) => {
        L.inView = entries[entries.length - 1].isIntersecting;
        startRef.current();
      }, { threshold: DEMO_CYCLE.threshold });
      observer.observe(blockRef.current);
    } else {
      L.inView = true;
    }
    return () => {
      clearTimeout(arm);
      observer?.disconnect();
      clearTimers();
      L.playing = false;
      L.armed = false;
    };
  }, [reduced]);

  // The block fades in as a cycle starts, and out as it ends
  useIsoLayoutEffect(() => {
    const el = blockRef.current;
    if (reduced || !el || typeof el.animate !== "function" || cycle === 0) return undefined;
    const animation = el.animate(
      fading ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, {}],
      { duration: DEMO_CYCLE.fadeMs, easing: EASE, fill: "backwards" },
    );
    return () => animation.cancel();
  }, [cycle, fading, reduced]);

  const showing = reduced ? "picks" : stage;
  const line = reduced ? FINAL_LINE : status;
  const fill = reduced ? { value: 1, ms: 0 } : bar;

  return (
    <div
      data-testid="welcome-demo"
      data-state={reduced ? "still" : state}
      role="img"
      aria-label="A wine list is read, three bottles on it step forward, and the Somm’s picks write themselves in."
      style={style}
    >
      <div ref={blockRef} style={{ position: "relative", height, opacity: fading ? 0 : 1 }}>
        {/* Both states, unseen, for the one commit that measures them */}
        {measuring && (
          <div ref={sizerRef} aria-hidden="true" style={{
            position: "absolute", inset: "0 0 auto 0", visibility: "hidden", pointerEvents: "none",
          }}>
            <Sheet stage="read" />
            <Picks />
          </div>
        )}
        {/* The sheet stays through the picks' first beats, leaving under them */}
        {!reduced && stage && <Sheet key={cycle} stage={stage} />}
        {showing === "picks" && <Picks key={reduced ? "still" : cycle} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: STATUS_GAP }}>
        <SwapLine as="p" text={line} style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.3,
          color: ink(0.75), minHeight: 20, textAlign: "center",
        }} />
        <ProgressLine key={reduced ? "still" : cycle} variant="reading" value={fill.value} duration={fill.ms} />
      </div>
    </div>
  );
}
