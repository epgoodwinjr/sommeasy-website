"use client";

// Rail — one palate-signature scale (README §7.15):
//
//   OLD WORLD  ────────◆──────────────  NEW WORLD
//
// A hairline track with a burgundy diamond knocked out of the rule by a
// cream ring. The diamond starts centered and eases to `value` (0–1) on
// mount; stagger a stack with `delay`. Rails stack 16px apart — the
// caller's margin.

import useMounted from "./useMounted";
import { BURGUNDY, CREAM, INK, SANS, SOFT_OUT, ink } from "./tokens";

const endLabel = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.12em", color: INK, opacity: 0.55,
};

export default function Rail({ left, right, value, delay = 0, style }) {
  const mounted = useMounted();
  const pct = Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "82px minmax(0,1fr) 82px",
      alignItems: "center", gap: 12, ...style,
    }}>
      <span style={{ ...endLabel, textAlign: "right" }}>{left}</span>
      <div style={{ position: "relative", height: 1, background: ink(0.2) }}>
        <div style={{
          position: "absolute", top: 0, left: mounted ? `${pct}%` : "50%",
          width: 9, height: 9, margin: "-4px 0 0 -4.5px",
          background: BURGUNDY, transform: "rotate(45deg)", boxShadow: `0 0 0 3px ${CREAM}`,
          transition: `left 0.9s ${SOFT_OUT} ${delay}ms`,
        }} />
      </div>
      <span style={endLabel}>{right}</span>
    </div>
  );
}
