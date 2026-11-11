"use client";

// SettingRow / FactRow — a key, a leader, a value (README §7.5):
//
//   Usual spend ······················ $40 – $90 ›
//
// The › shows only when the row does something (href/onClick; override
// with `chevron`). A setting's value never wraps — a long email ellipsizes
// rather than push the page sideways. A row given `children` — even ones
// that render nothing yet, like {open && <Editor/>} — renders them under
// the line and links its line only (`expanded` marks that line button as
// opening them); the line keeps the row's padding, so its hit area stays
// ≥40px, and the element never changes as an editor or error comes and
// goes (focus would drop). The ref reaches the row's own control — the
// whole-row button, or the line — so an editor that closes can hand focus
// back. `disabled` holds a button row still while its action runs.
// FactRow is the wine page's quieter cousin: 16px key, a value that may
// wrap (right-aligned), never a chevron.
//
// Given `enterDelay` (ms), either row arrives in ink: it rises as one, its
// leader draws, then the value and › fade in (docs/motion/README.md §6).

import { Children, forwardRef, useCallback, useRef } from "react";
import Link from "next/link";
import LeaderDraw from "./LeaderDraw";
import useEntrance, { withEntrance } from "./useEntrance";
import { ROW_ENTER } from "./motion";
import { BURGUNDY, INK, SANS, SERIF, ink, leader } from "./tokens";

const leaderStyle = { flex: 1, minWidth: 12, borderBottom: leader(1.5, 0.22), marginBottom: 5 };

const SettingRow = forwardRef(function SettingRow({
  label, value, chevron, href, onClick, expanded, disabled = false, testId, children, style, enterDelay,
}, ref) {
  const interactive = Boolean(href || onClick);
  const showChevron = chevron ?? interactive;

  const rowRef = useRef(null);
  const valueRef = useRef(null);
  const chevronRef = useRef(null);
  const play = enterDelay != null;
  const endAt = play ? enterDelay + ROW_ENTER.end : undefined;
  const rowEntering = useEntrance(rowRef, "rise", { delay: enterDelay, play });
  const valueEntering = useEntrance(valueRef, "fade", { delay: endAt, play });
  const chevronEntering = useEntrance(chevronRef, "fade", { delay: endAt, play });
  // The whole-row control is both the caller's ref and the row that enters
  const controlRowRef = useCallback((node) => {
    rowRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const line = (
    <span style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      <span style={{
        fontFamily: SERIF, fontSize: "17px", lineHeight: 1.3, color: INK,
        whiteSpace: "nowrap", flexShrink: 0,
      }}>{label}</span>
      {(value || showChevron) && (
        <LeaderDraw enterDelay={play ? enterDelay + ROW_ENTER.leader : undefined} style={leaderStyle} />
      )}
      {value && (
        <span ref={valueRef} style={withEntrance({
          fontFamily: SANS, fontSize: "14px", lineHeight: 1.3, color: ink(0.7),
          whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
        }, valueEntering)}>{value}</span>
      )}
      {showChevron && (
        <span ref={chevronRef} aria-hidden="true" style={withEntrance({
          fontFamily: SANS, fontSize: "16px", lineHeight: 1.2, color: BURGUNDY, flexShrink: 0,
        }, chevronEntering)}>›</span>
      )}
    </span>
  );

  const wholeRow = interactive && children === undefined;
  const rowStyle = {
    display: "block", width: "100%", textAlign: "left", textDecoration: "none", color: INK,
    padding: "14px 0", border: "none", borderBottom: `1px solid ${ink(0.07)}`,
    background: "none", cursor: wholeRow && !disabled ? "pointer" : "auto",
    ...style,
    ...rowEntering,
  };

  if (wholeRow) {
    return href
      ? <Link ref={controlRowRef} href={href} onClick={onClick} data-testid={testId} style={rowStyle}>{line}</Link>
      : (
        <button ref={controlRowRef} type="button" onClick={onClick} disabled={disabled} aria-expanded={expanded}
          data-testid={testId} style={rowStyle}>{line}</button>
      );
  }
  // The line carries the row's padding (the hit area); what's under it
  // takes the bottom padding only once there's something there
  const lineStyle = {
    display: "block", width: "100%", padding: "14px 0", border: "none", background: "none",
    textAlign: "left", textDecoration: "none", color: INK, cursor: disabled ? "default" : "pointer",
  };
  // {error && <p/>} with an empty error leaves "" — that's nothing too
  const under = Children.toArray(children).filter((child) => child !== "");
  return (
    <div ref={rowRef} data-testid={testId} style={{ ...rowStyle, padding: 0 }}>
      {!interactive ? <div style={{ padding: "14px 0" }}>{line}</div>
        : href ? <Link ref={ref} href={href} onClick={onClick} style={lineStyle}>{line}</Link>
        : (
          <button ref={ref} type="button" onClick={onClick} disabled={disabled} aria-expanded={expanded}
            style={lineStyle}>{line}</button>
        )}
      {under.length > 0 && <div style={{ paddingBottom: 14 }}>{under}</div>}
    </div>
  );
});

export default SettingRow;

export function FactRow({ label, value, style, enterDelay }) {
  const rowRef = useRef(null);
  const valueRef = useRef(null);
  const play = enterDelay != null;
  const rowEntering = useEntrance(rowRef, "rise", { delay: enterDelay, play });
  const valueEntering = useEntrance(valueRef, "fade", { delay: play ? enterDelay + ROW_ENTER.end : undefined, play });
  return (
    <div ref={rowRef} style={{
      display: "flex", alignItems: "flex-end", gap: 8,
      padding: "11px 0", borderBottom: `1px solid ${ink(0.06)}`, ...style, ...rowEntering,
    }}>
      <span style={{
        fontFamily: SERIF, fontSize: "16px", lineHeight: 1.3, color: INK,
        whiteSpace: "nowrap", flexShrink: 0,
      }}>{label}</span>
      <LeaderDraw enterDelay={play ? enterDelay + ROW_ENTER.leader : undefined} style={leaderStyle} />
      <span ref={valueRef} style={withEntrance({
        fontFamily: SANS, fontSize: "14px", lineHeight: 1.3, color: ink(0.75),
        textAlign: "right", minWidth: 0,
      }, valueEntering)}>{value}</span>
    </div>
  );
}
