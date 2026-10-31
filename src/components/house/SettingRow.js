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

import { Children, forwardRef } from "react";
import Link from "next/link";
import { BURGUNDY, INK, SANS, SERIF, ink, leader } from "./tokens";

const leaderStyle = { flex: 1, minWidth: 12, borderBottom: leader(1.5, 0.22), marginBottom: 5 };

const SettingRow = forwardRef(function SettingRow({
  label, value, chevron, href, onClick, expanded, disabled = false, testId, children, style,
}, ref) {
  const interactive = Boolean(href || onClick);
  const showChevron = chevron ?? interactive;

  const line = (
    <span style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      <span style={{
        fontFamily: SERIF, fontSize: "17px", lineHeight: 1.3, color: INK,
        whiteSpace: "nowrap", flexShrink: 0,
      }}>{label}</span>
      {(value || showChevron) && <span aria-hidden="true" style={leaderStyle} />}
      {value && (
        <span style={{
          fontFamily: SANS, fontSize: "14px", lineHeight: 1.3, color: ink(0.7),
          whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
        }}>{value}</span>
      )}
      {showChevron && (
        <span aria-hidden="true" style={{
          fontFamily: SANS, fontSize: "16px", lineHeight: 1.2, color: BURGUNDY, flexShrink: 0,
        }}>›</span>
      )}
    </span>
  );

  const wholeRow = interactive && children === undefined;
  const rowStyle = {
    display: "block", width: "100%", textAlign: "left", textDecoration: "none", color: INK,
    padding: "14px 0", border: "none", borderBottom: `1px solid ${ink(0.07)}`,
    background: "none", cursor: wholeRow && !disabled ? "pointer" : "auto",
    ...style,
  };

  if (wholeRow) {
    return href
      ? <Link ref={ref} href={href} onClick={onClick} data-testid={testId} style={rowStyle}>{line}</Link>
      : (
        <button ref={ref} type="button" onClick={onClick} disabled={disabled} aria-expanded={expanded}
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
    <div data-testid={testId} style={{ ...rowStyle, padding: 0 }}>
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

export function FactRow({ label, value, style }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-end", gap: 8,
      padding: "11px 0", borderBottom: `1px solid ${ink(0.06)}`, ...style,
    }}>
      <span style={{
        fontFamily: SERIF, fontSize: "16px", lineHeight: 1.3, color: INK,
        whiteSpace: "nowrap", flexShrink: 0,
      }}>{label}</span>
      <span aria-hidden="true" style={leaderStyle} />
      <span style={{
        fontFamily: SANS, fontSize: "14px", lineHeight: 1.3, color: ink(0.75),
        textAlign: "right", minWidth: 0,
      }}>{value}</span>
    </div>
  );
}
