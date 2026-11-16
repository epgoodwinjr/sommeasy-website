// EmptyState — what a page says when there's nothing to show yet
// (README §7.14). Every empty state tells the user what to do next: the
// optional pill is that next step (href → a link, onAction → a button);
// `children` takes a quieter extra, like "or adjust your quiz answers".
// `mark` is one of the house's printed tools ("list", "loupe", "camera" —
// docs/marks/README.md §8.4) at 30px, in ink; most empty states have none
// and open on their title.

import Link from "next/link";
import Mark from "./Mark";
import { CREAM, GRADIENT, INK, PILL_SHADOW, SANS, SERIF } from "./tokens";

export default function EmptyState({
  mark, title, sub, action, href, onAction, actionTestId, children, style,
}) {
  const pill = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    height: 44, padding: "0 22px", marginTop: 20, borderRadius: 100, border: "none",
    background: GRADIENT, boxShadow: PILL_SHADOW, cursor: "pointer",
    fontFamily: SANS, fontSize: "14px", fontWeight: 700, color: CREAM,
    textDecoration: "none", whiteSpace: "nowrap",
  };
  return (
    <div style={{ textAlign: "center", padding: "56px 12px 8px", ...style }}>
      {mark && <div aria-hidden="true" style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: INK }}><Mark id={mark} size={30} /></div>}
      <p style={{
        fontFamily: SERIF, fontSize: "22px", fontWeight: 600, lineHeight: 1.25, color: INK,
        marginTop: 14, textWrap: "balance",
      }}>{title}</p>
      {sub && (
        <p style={{
          fontFamily: SANS, fontSize: "14px", lineHeight: 1.55, color: INK, opacity: 0.6,
          marginTop: 8, textWrap: "pretty",
        }}>{sub}</p>
      )}
      {action && (
        <div>
          {href
            ? <Link href={href} data-testid={actionTestId} style={pill}>{action}</Link>
            : <button type="button" onClick={onAction} data-testid={actionTestId} style={pill}>{action}</button>}
        </div>
      )}
      {children}
    </div>
  );
}
