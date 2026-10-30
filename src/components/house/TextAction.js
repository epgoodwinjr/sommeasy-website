"use client";

// TextAction — a text button or link (README §7.8): Source Sans 13px 600,
// one line always (white-space: nowrap — screenshots that show these
// wrapping are a renderer artifact), on a 40px hit area. Tones: primary
// (burgundy), secondary (ink), quiet (ink at 0.45; `opacity` for the
// 0.5–0.55 cases). `underlined` is the quiet underlined link (weight 400).
// `ariaExpanded` is for a button that opens something in place ("Adjust ›",
// "or paste the text manually"). Links keep the global hover underline;
// TextActions lays out a group. The ref reaches the element, so a confirm
// that closes can hand focus back to the TextAction that opened it.

import { forwardRef } from "react";
import Link from "next/link";
import { BURGUNDY, INK, SANS } from "./tokens";

const TONES = {
  primary: { color: BURGUNDY, opacity: 1 },
  secondary: { color: INK, opacity: 1 },
  quiet: { color: INK, opacity: 0.45 },
};

const TextAction = forwardRef(function TextAction({
  children, tone = "primary", size = 13, weight, opacity, underlined = false,
  href, onClick, type = "button", disabled = false, testId, ariaLabel, ariaExpanded, style,
}, ref) {
  const t = TONES[tone] || TONES.primary;
  const css = {
    display: "inline-block", padding: "10px 0", border: "none", background: "none",
    fontFamily: SANS, fontSize: `${size}px`, lineHeight: "20px",
    fontWeight: weight ?? (underlined ? 400 : 600),
    color: t.color, opacity: disabled ? 0.35 : opacity ?? t.opacity,
    textDecoration: underlined ? "underline" : undefined,
    whiteSpace: "nowrap", cursor: disabled ? "default" : "pointer",
    transition: "opacity 0.15s ease", ...style,
  };
  if (href && !disabled) {
    return <Link ref={ref} href={href} onClick={onClick} data-testid={testId} aria-label={ariaLabel} style={css}>{children}</Link>;
  }
  return (
    <button ref={ref} type={type} onClick={onClick} disabled={disabled} data-testid={testId} aria-label={ariaLabel} aria-expanded={ariaExpanded} style={css}>
      {children}
    </button>
  );
});

export default TextAction;

/** A row of TextActions: 20px apart, or centered 24px apart (26–28 via `gap`). */
export function TextActions({ children, centered = false, gap, style }) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: gap ?? (centered ? 24 : 20),
      justifyContent: centered ? "center" : "flex-start", ...style,
    }}>{children}</div>
  );
}
