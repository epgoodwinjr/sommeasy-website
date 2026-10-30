"use client";

// SettingRow / FactRow — a key, a leader, a value (README §7.5):
//
//   Usual spend ······················ $40 – $90 ›
//
// The › shows only when the row does something (href/onClick; override
// with `chevron`). A setting's value never wraps — a long email ellipsizes
// rather than push the page sideways. `children` renders under the line:
// Account's inline editors open there, and such a row links its line only.
// FactRow is the wine page's quieter cousin: 16px key, a value that may
// wrap (right-aligned), never a chevron.

import Link from "next/link";
import { BURGUNDY, INK, SANS, SERIF, ink, leader } from "./tokens";

const leaderStyle = { flex: 1, minWidth: 12, borderBottom: leader(1.5, 0.22), marginBottom: 5 };

export default function SettingRow({
  label, value, chevron, href, onClick, testId, children, style,
}) {
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

  const rowStyle = {
    display: "block", width: "100%", textAlign: "left", textDecoration: "none", color: INK,
    padding: "14px 0", border: "none", borderBottom: `1px solid ${ink(0.07)}`,
    background: "none", cursor: interactive && !children ? "pointer" : "auto",
    ...style,
  };
  const lineButton = {
    display: "block", width: "100%", padding: 0, border: "none", background: "none",
    textAlign: "left", textDecoration: "none", color: INK, cursor: "pointer",
  };

  if (interactive && !children) {
    return href
      ? <Link href={href} onClick={onClick} data-testid={testId} style={rowStyle}>{line}</Link>
      : <button type="button" onClick={onClick} data-testid={testId} style={rowStyle}>{line}</button>;
  }
  return (
    <div data-testid={testId} style={rowStyle}>
      {!interactive ? line
        : href ? <Link href={href} style={lineButton}>{line}</Link>
        : <button type="button" onClick={onClick} style={lineButton}>{line}</button>}
      {children}
    </div>
  );
}

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
