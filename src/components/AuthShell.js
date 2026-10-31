"use client";

// The front door's shell + field vocabulary — sign in, create account,
// forgot password, update password — set in The House List (README §8.9):
// a 400px column with 36px gutters, the protea and its line, a ✦ divider,
// fields on ruled lines (never boxes), a LeaderEntry for the submit.
//
// Two heads. "brand" (sign in, and every other auth state): the 64px protea
// and "Sommeasy" in burgundy — a link home — over the page's sub line.
// "title" (create account): a 56px protea (still the link home) over the
// page's own title in ink.
//
// AuthField keeps the auth overhaul's whole password-manager vocabulary —
// visible label, id/name, autoComplete ("new-password" is what makes
// iOS/1Password offer strong-password generation), inputMode, autoFocus, a
// Show/Hide toggle on password fields — one component so no field can
// quietly lose an attribute.

import { forwardRef, useId, useState } from "react";
import Link from "next/link";
import Divider from "./house/Divider";
import RuledField from "./house/RuledField";
import TextAction from "./house/TextAction";
import { BURGUNDY, INK, SANS, SERIF, ink } from "./house/tokens";

export default function AuthShell({ head = "brand", title, subtitle, children }) {
  const brand = head === "brand";
  return (
    <main style={{
      padding: `calc(env(safe-area-inset-top) + ${brand ? 112 : 96}px) 36px 48px`,
    }}>
      <div style={{ maxWidth: 400, margin: "0 auto" }}>
        <div style={{ textAlign: "center" }}>
          {/* The logo is a door home, not a cul-de-sac */}
          <Link href="/" aria-label="Sommeasy home" style={{ display: "inline-block", textDecoration: "none" }}>
            <img src="/protea-icon.png" alt="" style={{
              display: "block", margin: "0 auto", height: brand ? 64 : 56, width: "auto",
              filter: "drop-shadow(0 4px 16px rgba(139,35,50,0.12))",
            }} />
            {brand && (
              <h1 style={{
                fontFamily: SERIF, fontSize: "34px", fontWeight: 700, letterSpacing: "-0.01em",
                lineHeight: 1.15, color: BURGUNDY, marginTop: 12,
              }}>Sommeasy</h1>
            )}
          </Link>
          {!brand && (
            <h1 style={{
              fontFamily: SERIF, fontSize: "30px", fontWeight: 700, letterSpacing: "-0.01em",
              lineHeight: 1.15, color: INK, marginTop: 14, textWrap: "balance",
            }}>{title}</h1>
          )}
          {subtitle && (
            <p style={{
              fontFamily: SANS, fontSize: "15px", lineHeight: 1.5, color: ink(0.55), marginTop: 6,
              textWrap: "balance",
            }}>{subtitle}</p>
          )}
        </div>
        <Divider style={{ marginTop: brand ? 30 : 28 }} />
        {children}
      </div>
    </main>
  );
}

/** A labeled field on a ruled line (RuledField "auth": Source Sans 17px). */
export function AuthField({
  id, label, type = "text", value, onChange,
  autoComplete, inputMode, autoFocus = false,
  required = true, minLength, maxLength, placeholder, helper, style,
}) {
  const [show, setShow] = useState(false);
  const helperId = useId();
  const isPassword = type === "password";
  return (
    <div style={style}>
      <RuledField
        variant="auth"
        label={label}
        id={id}
        name={id}
        type={isPassword && show ? "text" : type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        inputMode={inputMode}
        autoFocus={autoFocus}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={helper ? helperId : undefined}
        trailing={isPassword ? (
          <TextAction
            size={12}
            ariaLabel={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
          >{show ? "Hide" : "Show"}</TextAction>
        ) : undefined}
      />
      {helper && (
        <p id={helperId} style={{ fontFamily: SANS, fontSize: "12px", lineHeight: 1.5, color: ink(0.5), marginTop: 6 }}>
          {helper}
        </p>
      )}
    </div>
  );
}

/** An auth failure: Playfair italic burgundy, role=alert + aria-live. The
 *  ref takes focus on an interactive failure (never on a landing's ?error,
 *  where autoFocus owns the first paint). */
export const AuthAlert = forwardRef(function AuthAlert({ children, style }, ref) {
  return (
    <div
      ref={ref}
      data-testid="auth-error"
      role="alert"
      aria-live="polite"
      tabIndex={-1}
      style={{
        fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.55, color: BURGUNDY,
        outline: "none", textWrap: "pretty", ...style,
      }}
    >{children}</div>
  );
});

/** A quiet state line — "✓ Signed out", "A fresh link is on its way…". */
export function AuthNotice({ children, testId = "auth-notice", style }) {
  return (
    <p data-testid={testId} role="status" aria-live="polite" style={{
      fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.55, color: ink(0.75),
      textWrap: "pretty", ...style,
    }}>{children}</p>
  );
}

/** The links under a form: centered, stacked — "New here? Create an account". */
export function AuthLinks({ children, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", ...style }}>{children}</div>
  );
}

export function AuthLinkLine({ lead, href, children, size = 14 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: `${size}px`, color: INK }}>
      {lead && <span style={{ color: ink(0.55) }}>{lead}</span>}
      <TextAction href={href} size={size}>{children}</TextAction>
    </div>
  );
}
