"use client";

// ConfirmBlock — a question that opens in place under the action that
// asked it (README §8.8.4): a line in Playfair italic with a TextAction
// pair beneath, fading up 10px. The confirm is a link (`href`) or a button
// (`onConfirm`); Cancel calls `onCancel`, and the caller hands focus back to
// its trigger. Focus lands on the block as it opens, so a screen reader
// hears the question before the choices — and it scrolls into view clear
// of the service bar: a trigger near the foot of the page would otherwise
// open its choices underneath the bar.
//
// StartFreshConfirm is decision D2's: Start fresh asks here, then opens the
// quiz (/?quiz=fresh). Your palate uses it now; Account will in Phase 6.

import { useEffect, useId, useRef } from "react";
import TextAction, { TextActions } from "./TextAction";
import { SERIF, SOFT_OUT, ink } from "./tokens";

export default function ConfirmBlock({
  copy, confirmLabel, href, onConfirm, cancelLabel = "Cancel", onCancel,
  centered = false, testId, style,
}) {
  const ref = useRef(null);
  const copyId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    // Chromium's "nearest" judges by the element's own box and ignores the
    // scroll margin, so test the margin here and align with "end", which
    // honors it
    const margin = parseFloat(getComputedStyle(el).scrollMarginBottom) || 0;
    if (el.getBoundingClientRect().bottom + margin > window.innerHeight) {
      el.scrollIntoView?.({ block: "end", behavior: "smooth" });
    }
    el.animate?.(
      [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
      { duration: 300, easing: SOFT_OUT },
    );
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby={copyId}
      data-testid={testId}
      style={{
        outline: "none", textAlign: centered ? "center" : "left",
        // The service bar's height (84px + the safe area) and a little air
        scrollMarginBottom: "calc(108px + env(safe-area-inset-bottom))",
        ...style,
      }}
    >
      <p id={copyId} style={{
        fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.55, color: ink(0.75),
        textWrap: "pretty",
      }}>{copy}</p>
      <TextActions centered={centered} gap={centered ? 24 : 20} style={{ marginTop: 4 }}>
        <TextAction weight={700} href={href} onClick={onConfirm}>{confirmLabel}</TextAction>
        <TextAction tone="quiet" onClick={onCancel}>{cancelLabel}</TextAction>
      </TextActions>
    </div>
  );
}

export const START_FRESH_COPY =
  "Start over with a blank quiz? What your ratings earned (✦) comes off your palate until you rate those wines again. Your journal stays.";

/** Start fresh's confirm: the copy matches saveQuizProfile's fresh mode —
 *  the quiz arrays only, earned promotions un-flagged (their points
 *  survive), the journal untouched. */
export function StartFreshConfirm({ onCancel, centered, style }) {
  return (
    <ConfirmBlock
      testId="start-fresh-confirm"
      copy={START_FRESH_COPY}
      confirmLabel="Start fresh"
      href="/?quiz=fresh"
      onCancel={onCancel}
      centered={centered}
      style={style}
    />
  );
}
