"use client";

// LeaderEntry — a primary action set as a wine-list line (README §7.3):
//
//   Match the wine list ················· (📋)
//   Photo, paste or link — we'll find your bottle.
//
// A real link (href → next/link) or <button>, the whole line its hit area.
// tone "filled" is THE primary action — one per page; "outline" marks the
// alternatives. size 22 sets the option lists on Match and Log. `secondary`
// is the quieter Log-saved line: 20px label, a 1.5px leader and a › in
// place of the circle. The sub line under the entry describes it
// (aria-describedby). A disabled entry is a disabled button at 0.35.
// `expanded` marks a button entry that opens something in place (Match's
// Paste a link) — it becomes aria-expanded.
//
// Given `enterDelay` (ms), the entry is written in: the label rises, the
// leader draws to the mark, the mark lands and the sub line fades in
// (docs/motion/README.md §6). The link or button itself never animates —
// it is live, at full size, from the first paint.

import Link from "next/link";
import { useId, useRef } from "react";
import LeaderDraw from "./LeaderDraw";
import useEntrance, { withEntrance } from "./useEntrance";
import { ENTRY_ENTER } from "./motion";
import { BURGUNDY, CIRCLE_SHADOW, CREAM, GRADIENT, INK, SANS, SERIF, ink, leader } from "./tokens";

export default function LeaderEntry({
  label, mark, tone = "outline", size = 24, secondary = false,
  sub, subGap = 6, href, onClick, type = "button", disabled = false,
  expanded, testId, style, enterDelay,
}) {
  const subId = useId();
  const filled = tone === "filled";

  const labelRef = useRef(null);
  const markRef = useRef(null);
  const subRef = useRef(null);
  const play = enterDelay != null;
  const at = (offset) => (play ? enterDelay + offset : undefined);
  const labelEntering = useEntrance(labelRef, "rise", { delay: enterDelay, play });
  // The circle lands; the quieter › just fades in
  const markEntering = useEntrance(markRef, secondary ? "fade" : "pop", { delay: at(ENTRY_ENTER.mark), play });
  const subEntering = useEntrance(subRef, "fade", { delay: at(ENTRY_ENTER.sub), play });

  const line = (
    <>
      <span ref={labelRef} style={withEntrance({
        fontFamily: SERIF, fontSize: secondary ? "20px" : `${size}px`, fontWeight: 600,
        lineHeight: secondary ? 1.2 : 1.1, color: INK, whiteSpace: "nowrap",
      }, labelEntering)}>{label}</span>
      <LeaderDraw
        enterDelay={at(ENTRY_ENTER.leader)}
        duration={ENTRY_ENTER.leaderMs}
        style={{
          flex: 1, minWidth: 12,
          borderBottom: secondary ? leader(1.5) : leader(2),
          marginBottom: secondary ? 6 : 9,
        }}
      />
      {secondary ? (
        <span ref={markRef} aria-hidden="true" style={withEntrance({
          fontFamily: SANS, fontSize: "18px", lineHeight: 1.2, color: BURGUNDY,
        }, markEntering)}>›</span>
      ) : (
        <span ref={markRef} aria-hidden="true" style={withEntrance({
          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "20px", lineHeight: 1,
          ...(filled
            ? { background: GRADIENT, boxShadow: CIRCLE_SHADOW }
            : { border: "1.5px solid rgba(139,35,50,0.3)", background: "rgba(139,35,50,0.04)" }),
          ...(mark === "→" && { fontFamily: SANS, color: filled ? CREAM : BURGUNDY }),
        }, markEntering)}>{mark}</span>
      )}
    </>
  );

  const lineStyle = {
    display: "flex", alignItems: "flex-end", gap: 10, width: "100%",
    padding: 0, border: "none", background: "none", textAlign: "left",
    textDecoration: "none", color: INK,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.35 : 1, transition: "opacity 0.15s ease",
  };
  const shared = {
    "data-testid": testId,
    "aria-describedby": sub ? subId : undefined,
    style: lineStyle,
  };

  return (
    <div style={style}>
      {href && !disabled ? (
        <Link href={href} onClick={onClick} {...shared}>{line}</Link>
      ) : (
        <button type={type} onClick={onClick} disabled={disabled} aria-expanded={expanded} {...shared}>{line}</button>
      )}
      {sub && (
        <div ref={subRef} id={subId} style={withEntrance({
          fontFamily: SANS, fontSize: "13px", lineHeight: 1.5, color: ink(0.55), marginTop: subGap,
        }, subEntering)}>{sub}</div>
      )}
    </div>
  );
}
