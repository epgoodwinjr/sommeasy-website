"use client";

// WineRow — the one row for a wine in any list (README §7.4): home recs,
// the journal, search, Log's lists, the same vein.
//
//   Raats Original Chenin Blanc ··············· 2022
//   STELLENBOSCH · CHENIN BLANC      📍 REGION + GRAPE
//
// The end slot holds any of, in this order: `vintage` (italic), `mark` (a
// rating or 📌/👋), `action` ("Log it ›"), `chevron`. A leader only renders
// when something sits at its end. With href/onClick and no children the
// whole row is the link or button; a row that carries its own actions
// (children: a rec row's note and Had it / Want it / Pass) links its name
// block only — a link can't hold buttons. `numeral` is home's numbered
// variant; `struck` the passed variant (struckOpacity 0.4 on home, 0.55 on
// the journal's Passed tab). Link hrefs come from wineHref() in
// @/lib/navTrail. Any other prop (data-wine, aria-*) lands on the row.

import Link from "next/link";
import { BURGUNDY, INK, SANS, SERIF, ink, leader } from "./tokens";

const numeralStyle = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5,
  color: BURGUNDY, width: 26, flexShrink: 0,
};

const endText = { flexShrink: 0, whiteSpace: "nowrap", lineHeight: 1.35 };

export default function WineRow({
  name, vintage, mark, action, chevron = false,
  meta, metaRight, metaTone = "quiet",
  numeral, struck = false, struckOpacity = 0.4,
  href, onClick, testId, children, style, ...rest
}) {
  const hasEnd = Boolean(vintage || mark || action || chevron);
  const interactive = Boolean(href || onClick);

  const head = (
    <>
      <span style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <span style={{
          fontFamily: SERIF, fontSize: "17px", lineHeight: 1.35, color: INK,
          minWidth: 0, overflowWrap: "anywhere",
          textDecoration: struck ? "line-through" : "none",
        }}>{name}</span>
        {hasEnd && (
          <span aria-hidden="true" style={{ flex: 1, minWidth: 14, borderBottom: leader(1.5), marginBottom: 6 }} />
        )}
        {vintage && (
          <span style={{ ...endText, fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", color: ink(0.7) }}>{vintage}</span>
        )}
        {mark && <span style={{ ...endText, fontSize: "15px" }}>{mark}</span>}
        {action && (
          <span style={{ ...endText, fontFamily: SANS, fontSize: "12px", fontWeight: 700, color: BURGUNDY }}>{action}</span>
        )}
        {chevron && (
          <span aria-hidden="true" style={{ ...endText, fontFamily: SANS, fontSize: "16px", color: BURGUNDY }}>›</span>
        )}
      </span>
      {(meta || metaRight) && (
        <span style={{
          display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6,
          fontFamily: SANS, fontSize: "10px", fontWeight: 600, lineHeight: 1.4,
          textTransform: "uppercase", letterSpacing: "0.14em",
        }}>
          <span style={{ color: ink(0.45) }}>{meta}</span>
          {metaRight && (
            <span style={{
              whiteSpace: "nowrap",
              color: metaTone === "accent" ? "rgba(139,35,50,0.8)" : ink(0.45),
            }}>{metaRight}</span>
          )}
        </span>
      )}
    </>
  );

  const rowStyle = {
    display: "block", width: "100%", textAlign: "left", textDecoration: "none", color: INK,
    padding: numeral ? "18px 0" : "15px 0",
    border: "none", borderBottom: `1px solid ${ink(numeral ? 0.08 : 0.07)}`,
    background: "none", cursor: interactive && !children ? "pointer" : "auto",
    opacity: struck ? struckOpacity : 1, transition: "opacity 0.3s ease",
    ...style,
  };
  const headLinkStyle = {
    display: "block", width: "100%", padding: 0, border: "none", background: "none",
    textAlign: "left", textDecoration: "none", color: INK, cursor: "pointer",
  };

  // A row with its own actions links only its name block
  const linkedHead = !children || !interactive ? head
    : href ? <Link href={href} style={headLinkStyle}>{head}</Link>
    : <button type="button" onClick={onClick} style={headLinkStyle}>{head}</button>;

  const content = (
    <>
      {linkedHead}
      {children}
    </>
  );
  const body = numeral ? (
    <span style={{ display: "flex", gap: 10 }}>
      <span aria-hidden="true" style={numeralStyle}>{numeral}</span>
      <span style={{ display: "block", flex: 1, minWidth: 0 }}>{content}</span>
    </span>
  ) : content;

  if (interactive && !children) {
    return href
      ? <Link href={href} onClick={onClick} data-testid={testId} style={rowStyle} {...rest}>{body}</Link>
      : <button type="button" onClick={onClick} data-testid={testId} style={rowStyle} {...rest}>{body}</button>;
  }
  return <div data-testid={testId} style={rowStyle} {...rest}>{body}</div>;
}

/** A selection held back until the first rating (README §8.1.5): a
 *  numbered row with no name, the leader running to "Reserved". */
export function ReservedRow({ numeral, style }) {
  return (
    <div data-testid="reserved-row" style={{
      display: "flex", alignItems: "flex-end", gap: 10,
      padding: "18px 0", borderBottom: `1px solid ${ink(0.08)}`, ...style,
    }}>
      <span aria-hidden="true" style={{ ...numeralStyle, opacity: 0.5 }}>{numeral}</span>
      <span aria-hidden="true" style={{ flex: 1, borderBottom: leader(1.5, 0.2), marginBottom: 6 }} />
      <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", color: INK, opacity: 0.4 }}>Reserved</span>
    </div>
  );
}
