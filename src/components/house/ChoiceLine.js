"use client";

// ChoiceLine — a term row that ends in its options (README §7.7):
//
//   Color ····················· All  Red  White  Sparkling
//
// role="radiogroup" of role="radio" options; arrows move and select. Each
// option's hit area reaches past its word (padding cancelled by negative
// margin) so it meets the 40px tap floor without moving a pixel, and the
// selected underline rides an inner span so it stays word-width.
// ChoiceTabs is the journal's tab variant (role="tablist"); TermLine is the
// bare skeleton for a term that ends in something else (Spend … $ to $).
//
// options / tabs: [{ id, label, testId? }] (tabs also take `count`).

import { useId } from "react";
import { choiceKeyDown, tabStop } from "./radio";
import { BURGUNDY, INK, SANS, SERIF, TRANSITION, ink, leader } from "./tokens";

/** "Spend ············ $ [40] to $ [90]": a term, a leader, then children. */
export function TermLine({ label, labelId, labelSize = 18, testId, children, style }) {
  return (
    <div data-testid={testId} style={{ display: "flex", alignItems: "flex-end", gap: 10, ...style }}>
      <span id={labelId} style={{
        fontFamily: SERIF, fontSize: `${labelSize}px`, lineHeight: 1.3, color: INK, whiteSpace: "nowrap",
      }}>{label}</span>
      <span aria-hidden="true" style={{ flex: 1, minWidth: 12, borderBottom: leader(1.5), marginBottom: 6 }} />
      {children}
    </div>
  );
}

export default function ChoiceLine({ label, options, value, onChange, labelSize = 18, testId, style }) {
  const labelId = useId();
  const ids = options.map((o) => o.id);
  const stop = tabStop(ids, value);
  return (
    <TermLine label={label} labelId={labelId} labelSize={labelSize} testId={testId} style={style}>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={(e) => choiceKeyDown(e, ids, value, onChange)}
        style={{ display: "flex", gap: 14 }}
      >
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={o.id === stop ? 0 : -1}
              data-choice={o.id}
              data-testid={o.testId}
              onClick={() => onChange?.(o.id)}
              style={{
                padding: "19px 7px 0", margin: "-9px -7px 0", border: "none", background: "none",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              <span style={{
                display: "block", paddingBottom: 2,
                borderBottom: `1.5px solid ${on ? BURGUNDY : "transparent"}`,
                fontFamily: SANS, fontSize: "14px", fontWeight: 700,
                color: on ? BURGUNDY : ink(0.5), transition: TRANSITION,
              }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </TermLine>
  );
}

/** The journal's tabs: TRIED 13 · WANT 3 · PASSED 1 · TIMELINE. With
 *  `panelId`, each tab controls that panel and is named `${panelId}-${id}`
 *  (the panel's aria-labelledby). A count is spoken after a comma
 *  ("Tried, 13") rather than run into the label. */
export function ChoiceTabs({ tabs, value, onChange, label = "Journal", panelId, style }) {
  const ids = tabs.map((t) => t.id);
  const stop = tabStop(ids, value);
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => choiceKeyDown(e, ids, value, onChange)}
      style={{ display: "flex", alignItems: "flex-end", gap: 20, borderBottom: `1px solid ${ink(0.1)}`, ...style }}
    >
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={panelId ? `${panelId}-${t.id}` : undefined}
            aria-controls={panelId}
            aria-label={t.count != null ? `${t.label}, ${t.count}` : undefined}
            aria-selected={on}
            tabIndex={t.id === stop ? 0 : -1}
            data-choice={t.id}
            data-testid={t.testId}
            onClick={() => onChange?.(t.id)}
            style={{
              display: "flex", alignItems: "baseline", gap: 5,
              padding: "15px 0 9px", margin: "-3px 0 -1px",
              border: "none", borderBottom: `2px solid ${on ? BURGUNDY : "transparent"}`,
              background: "none", cursor: "pointer", whiteSpace: "nowrap",
              fontFamily: SANS, fontSize: "11px", fontWeight: 700,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color: on ? BURGUNDY : ink(0.5), transition: TRANSITION,
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{
                fontFamily: SERIF, fontStyle: "italic", fontSize: "13px", fontWeight: 400,
                letterSpacing: 0, textTransform: "none",
              }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
