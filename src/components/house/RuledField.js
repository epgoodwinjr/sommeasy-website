"use client";

// RuledField — an input set on a ruled line, never in a box (README §7.6).
//
// Variants, by where they're used:
//   entry  — Playfair italic 17px: the first entry, the steer
//   note   — Playfair italic 16px: journal, wine and log notes
//   search — Playfair italic 20px, roomier, a 0.35 rule: search fields
//   url    — Source Sans 16px: the wine-list link
//   auth   — Source Sans 17px, a 0.35 rule: sign in / create account
//   amount — 52px of centered digits on a solid rule (see AmountRange)
// The rule is dotted at rest and solid burgundy on focus. Optional extras:
// `label` (a real <label>), `trailing` (on the rule's right end — the
// password Show/Hide), `onSubmit` (the round → beside the rule; Enter
// submits too). Every other prop lands on the <input>. The placeholder
// color lives in globals.css (.house-field): inline styles can't reach
// ::placeholder.

import { useId, useState } from "react";
import { BURGUNDY, INK, SANS, SERIF, TYPE, ink } from "./tokens";

const VARIANTS = {
  entry: { family: SERIF, italic: true, size: "17px", padding: "10px 0 8px", rule: 0.3 },
  note: { family: SERIF, italic: true, size: "16px", padding: "10px 0 8px", rule: 0.3 },
  search: { family: SERIF, italic: true, size: "20px", padding: "12px 0 10px", rule: 0.35 },
  url: { family: SANS, italic: false, size: "16px", padding: "10px 0 8px", rule: 0.3 },
  auth: { family: SANS, italic: false, size: "17px", padding: "10px 0 8px", rule: 0.35 },
};

export default function RuledField({
  variant = "note", label, trailing, onSubmit, submitLabel = "Submit", submitTestId,
  id, style, onFocus, onBlur, onChange, onKeyDown, ...inputProps
}) {
  const fallbackId = useId();
  const inputId = id || fallbackId;
  const [focused, setFocused] = useState(false);

  const focusHandlers = {
    onFocus: (e) => { setFocused(true); onFocus?.(e); },
    onBlur: (e) => { setFocused(false); onBlur?.(e); },
  };

  if (variant === "amount") {
    return (
      <input
        id={inputId}
        className="house-field"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={5}
        {...inputProps}
        {...focusHandlers}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          // Digits only — a price is never anything else
          const digits = e.target.value.replace(/\D/g, "");
          if (digits !== e.target.value) e.target.value = digits;
          onChange?.(e);
        }}
        style={{
          width: 52, border: "none", borderRadius: 0, outline: "none", background: "transparent",
          borderBottom: `1.5px solid ${focused ? BURGUNDY : ink(0.18)}`,
          padding: "6px 0 4px", textAlign: "center",
          fontFamily: SANS, fontSize: "16px", color: INK,
          transition: "border-color 0.15s ease", ...style,
        }}
      />
    );
  }

  const v = VARIANTS[variant] || VARIANTS.note;
  return (
    <div style={style}>
      {label && <label htmlFor={inputId} style={{ ...TYPE.fieldLabel, display: "block" }}>{label}</label>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: label ? 2 : 0 }}>
        <div style={{
          flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
          borderBottom: focused ? `1.5px solid ${BURGUNDY}` : `1.5px dotted ${ink(v.rule)}`,
        }}>
          <input
            id={inputId}
            className="house-field"
            {...inputProps}
            {...focusHandlers}
            onChange={onChange}
            onKeyDown={(e) => {
              onKeyDown?.(e);
              if (onSubmit && e.key === "Enter" && !e.nativeEvent.isComposing && !e.defaultPrevented) {
                e.preventDefault();
                onSubmit();
              }
            }}
            style={{
              flex: 1, minWidth: 0, width: "100%", border: "none", borderRadius: 0,
              outline: "none", background: "transparent", padding: v.padding,
              fontFamily: v.family, fontStyle: v.italic ? "italic" : "normal",
              fontSize: v.size, color: INK,
            }}
          />
          {trailing}
        </div>
        {onSubmit && (
          <button type="button" onClick={onSubmit} aria-label={submitLabel} data-testid={submitTestId} style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1.5px solid rgba(139,35,50,0.3)", background: "rgba(139,35,50,0.04)",
            fontFamily: SANS, fontSize: "18px", color: BURGUNDY, transition: "all 0.15s ease",
          }}>→</button>
        )}
      </div>
    </div>
  );
}

/** "$ [min] to $ [max]" — Spend on Match, Usual spend on Account. The
 *  callbacks receive the digits string. */
export function AmountRange({
  min, max, onMinChange, onMaxChange,
  minLabel = "Lowest price", maxLabel = "Highest price", style,
}) {
  const unit = { opacity: 0.45, paddingBottom: 6 };
  return (
    <div style={{
      display: "flex", alignItems: "flex-end", gap: 6,
      fontFamily: SANS, fontSize: "14px", color: INK, ...style,
    }}>
      <span aria-hidden="true" style={unit}>$</span>
      <RuledField variant="amount" value={min} placeholder="min" aria-label={minLabel}
        onChange={(e) => onMinChange?.(e.target.value)} />
      <span aria-hidden="true" style={unit}>to $</span>
      <RuledField variant="amount" value={max} placeholder="max" aria-label={maxLabel}
        onChange={(e) => onMaxChange?.(e.target.value)} />
    </div>
  );
}
