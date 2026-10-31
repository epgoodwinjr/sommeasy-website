// SectionHead — "I. TONIGHT, OUT ———" (README §7.2).
//
// A real heading (h2 unless `as` says otherwise) so screen readers can jump
// section to section. The numeral comes from the caller — numeralCounter()
// in @/lib/numerals, so a section that doesn't render never takes one. The
// margin is the caller's too (typically "30px 0 16px" before an entry,
// "30px 0 2px" before rows, "30px 0 12px" before prose).

import { BURGUNDY, INK, SANS, SERIF, ink } from "./tokens";

export default function SectionHead({ numeral, label, as: Tag = "h2", style }) {
  return (
    <Tag style={{
      display: "flex", alignItems: "center", gap: 10, margin: 0,
      fontSize: "inherit", fontWeight: "inherit", ...style,
    }}>
      {numeral && (
        <span aria-hidden="true" style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", fontWeight: 400, color: BURGUNDY,
        }}>{numeral}</span>
      )}
      <span style={{
        fontFamily: SANS, fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.24em", color: INK, opacity: 0.5, whiteSpace: "nowrap",
      }}>{label}</span>
      <span aria-hidden="true" style={{ flex: 1, height: 1, background: ink(0.1) }} />
    </Tag>
  );
}
