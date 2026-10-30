"use client";

// Toast + useToast — the bottom pill (README §7.13). Replaces the top-
// anchored "✓ …" toasts on House List pages. One queue per page:
//
//   const { toasts, showToast } = useToast();
//   showToast("Removed from your journal");               // 2.6s
//   showToast(msg, { delay: 1500, duration: 4000 });     // an evolution toast
//   <Toast toasts={toasts} aboveServiceBar />
//
// Evolution and shift toasts keep their copy and sequencing
// (evolutionToastMessages / shiftToastMessage: 1.5s offsets, 4s / 5s
// lifetimes) — they queue through here and stack upward, 8px apart. Each
// pill fades in rising 10px and fades out. The stack is a single polite
// live region, mounted before any message lands so every one is announced.

import { useCallback, useEffect, useRef, useState } from "react";
import { CREAM, INK, SANS, SOFT_OUT, TOAST_SHADOW } from "./tokens";

export const TOAST_MS = 2600;
const ENTER_MS = 250;
const EXIT_MS = 300;

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Set());
  const lastId = useRef(0);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  const showToast = useCallback((message, { delay = 0, duration = TOAST_MS } = {}) => {
    const id = ++lastId.current;
    later(() => {
      setToasts((list) => [...list, { id, message, leaving: false }]);
      later(() => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))),
        Math.max(0, duration - EXIT_MS));
      later(() => setToasts((list) => list.filter((t) => t.id !== id)), duration);
    }, delay);
  }, [later]);

  return { toasts, showToast };
}

function Pill({ message, leaving }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.animate?.(
      [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: ENTER_MS, easing: SOFT_OUT },
    );
  }, []);
  return (
    <div ref={ref} style={{
      padding: "11px 18px", borderRadius: 100, background: INK, color: CREAM,
      fontFamily: SANS, fontSize: "13px", fontWeight: 600, lineHeight: 1.4, textAlign: "center",
      boxShadow: TOAST_SHADOW, opacity: leaving ? 0 : 1, transition: `opacity ${EXIT_MS}ms ease`,
    }}>{message}</div>
  );
}

export default function Toast({ toasts, aboveServiceBar = false }) {
  return (
    <div role="status" aria-live="polite" style={{
      position: "fixed", left: 24, right: 24, zIndex: 45,
      bottom: `calc(env(safe-area-inset-bottom) + ${aboveServiceBar ? 96 : 34}px)`,
      display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 8,
      pointerEvents: "none",
    }}>
      {(toasts || []).map((t) => <Pill key={t.id} message={t.message} leaving={t.leaving} />)}
    </div>
  );
}
