// TimelineRow — one moment the palate moved (README §8.4):
//
//   🧬  Swartland joined your regions ············ SEP 12
//
// The journal's Timeline and Your palate's Recently evolved share it. `line`
// is houseCopy's timelineLine ({ emoji, text, strong }) — a shift reads
// bold. The whole row is a link: the wine whose rating moved it, or the
// caller's fallback (the palate, the full history).

import Link from "next/link";
import { INK, SANS, SERIF, ink, leader } from "./tokens";

export default function TimelineRow({ line, date, href, style }) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "flex-end", gap: 8, padding: "15px 0",
      borderBottom: `1px solid ${ink(0.07)}`, textDecoration: "none", color: INK, ...style,
    }}>
      <span aria-hidden="true" style={{ fontSize: "15px", width: 22, flexShrink: 0, lineHeight: 1.4 }}>{line.emoji}</span>
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
