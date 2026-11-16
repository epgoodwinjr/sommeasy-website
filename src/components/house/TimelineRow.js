// TimelineRow — one moment the palate moved (README §8.4):
//
//   +  Swartland joined your regions ············ SEP 12
//
// The journal's Timeline and Your palate's Recently evolved share it. `line`
// is houseCopy's timelineLine ({ mark, text, strong }) — a shift reads
// bold. The mark is a proofreader's pencil (House & Hand, H5): plus joined,
// minus left, an arrow became, a dot began — decorative; the words say it.
// The whole row is a link: the wine whose rating moved it, or the caller's
// fallback (the palate, the full history).

import Link from "next/link";
import Mark from "./Mark";
import { INK, SANS, SERIF, ink, leader } from "./tokens";

/** The moment's pencil mark, in the slot the row's text hangs from — the
 *  wine page's "What it did to your palate" lines share it. */
export function TimelineMark({ id }) {
  return (
    <span aria-hidden="true" style={{ width: 22, height: 22, flexShrink: 0, display: "flex", alignItems: "center" }}>
      <Mark id={id} size={18} />
    </span>
  );
}

export default function TimelineRow({ line, date, href, style }) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "flex-end", gap: 8, padding: "15px 0",
      borderBottom: `1px solid ${ink(0.07)}`, textDecoration: "none", color: INK, ...style,
    }}>
      <TimelineMark id={line.mark} />
      <span style={{
        fontFamily: SERIF, fontSize: "16px", lineHeight: 1.4, color: INK, fontWeight: line.strong ? 700 : 400,
        minWidth: 0, overflowWrap: "anywhere",
      }}>{line.text}</span>
      <span aria-hidden="true" style={{ flex: 1, minWidth: 14, borderBottom: leader(1.5), marginBottom: 6 }} />
      <span style={{
        fontFamily: SANS, fontSize: "10px", fontWeight: 600, letterSpacing: "0.14em", lineHeight: 2,
        textTransform: "uppercase", color: INK, opacity: 0.45, whiteSpace: "nowrap",
      }}>{date}</span>
    </Link>
  );
}
