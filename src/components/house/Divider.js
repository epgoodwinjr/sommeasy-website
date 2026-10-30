// Divider — the ✦ between two hairlines (README §7.1). Decorative only;
// the caller sets its margin.

import { BURGUNDY, ink } from "./tokens";

const rule = { flex: 1, height: 1, background: ink(0.14) };

export default function Divider({ style }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 14, ...style }}>
      <div style={rule} />
      <span style={{ fontSize: "10px", lineHeight: 1, color: BURGUNDY }}>✦</span>
      <div style={rule} />
    </div>
  );
}
