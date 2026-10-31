"use client";

// ProgressLine — a thin sage fill (README §7.16), grown from zero on mount.
//   default   — Building now: 3px on a sage track, 0.9s soft-out
//   "reading" — the reading states' 180×2 bar on an ink track. Callers
//               ease it toward 0.9 while waiting, then 1 on the response;
//               pass `duration` (Match reads over 2.3s, the label 1.6s).
// `value` is 0–1. With a `label` it's an announced progressbar; without
// one it's decoration.

import useMounted from "./useMounted";
import { SAGE, SAGE_TRACK, SOFT_OUT, ink } from "./tokens";

export default function ProgressLine({ value, variant, duration, delay = 0, label, style }) {
  const mounted = useMounted();
  const reading = variant === "reading";
  const pct = Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
  const a11y = label
    ? { role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct }
    : { "aria-hidden": true };
  return (
    <div {...a11y} style={{
      width: reading ? 180 : "100%", height: reading ? 2 : 3, borderRadius: reading ? 2 : 3,
      background: reading ? ink(0.1) : SAGE_TRACK, overflow: "hidden", ...style,
    }}>
      <div style={{
        height: "100%", background: SAGE, width: mounted ? `${pct}%` : "0%",
        transition: `width ${duration ?? (reading ? 2300 : 900)}ms ${SOFT_OUT} ${delay}ms`,
      }} />
    </div>
  );
}
