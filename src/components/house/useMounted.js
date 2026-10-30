"use client";

// useMounted — false on the first paint, true a beat later: the switch that
// lets a fill or a rail marker animate in from its resting position (the
// PalateView idiom, shared by Rail and ProgressLine).

import { useEffect, useState } from "react";

export default function useMounted(delayMs = 60) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return mounted;
}
