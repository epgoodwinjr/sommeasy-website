"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { AUTH_MESSAGES, authErrorCopy, mapAuthError } from "@/lib/authCopy";
import AuthShell, {
  AuthField, authFonts, primaryButtonStyle,
  errorBoxStyle, errorTextStyle, noticeBoxStyle, noticeTextStyle,
  inlineLinkStyle, mutedTextStyle,
} from "./AuthShell";

export default function ForgotPasswordForm({ params }) {
  const emailParam = Array.isArray(params?.email) ? params.email[0] : params?.email || "";
  const [email, setEmail] = useState(emailParam);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  // Disabled until hydration — a pre-hydration click would fire a native
  // form submission and wipe the typed email (see AuthForm).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const supabase = createClient();

  // Failure focus for screen readers / keyboard users (interactive only)
  const errorRef = useRef(null);
  const shouldFocusError = useRef(false);
  const failWith = (key) => {
    shouldFocusError.current = true;
    setErrorKey(key);
  };
  useEffect(() => {
    if (errorKey && shouldFocusError.current) {
      shouldFocusError.current = false;
      errorRef.current?.focus();
    }
  }, [errorKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Lands on the confirm/callback layer, which establishes the
        // recovery session and forwards to /update-password.
        redirectTo: `${window.location.origin}/api/auth/callback?next=/update-password`,
      });
      if (error) {
        const key = mapAuthError(error);
        // Anti-enumeration: only surface errors the user can act on.
        // Anything else still shows the "if that email has an account"
        // copy so the form never confirms whether an account exists.
        if (key === "rate_limit" || key === "network") {
          failWith(key);
          return;
        }
      }
      setSent(true);
    } catch {
      failWith("network");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell subtitle="Check your inbox">
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-testid="reset-sent">
          <div style={noticeBoxStyle} role="status" aria-live="polite">
            <p style={noticeTextStyle}>{AUTH_MESSAGES.reset_sent}</p>
          </div>
          <p style={{ ...mutedTextStyle, marginTop: 14 }}>
            <Link href="/login" style={inlineLinkStyle}>Back to sign in</Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Reset your password">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <p style={{
          fontFamily: authFonts.sans, fontSize: "14px", color: "#1B3D2F",
          opacity: 0.7, margin: "0 0 4px", lineHeight: 1.5, textAlign: "center",
        }}>
          Tell us your email and we&rsquo;ll send a link to set a new one.
        </p>
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          autoFocus
          placeholder="Email address"
        />

        {errorKey && (
          <div
            style={errorBoxStyle}
            data-testid="auth-error"
            role="alert"
            aria-live="polite"
            tabIndex={-1}
            ref={errorRef}
          >
            <p style={errorTextStyle}>{authErrorCopy(errorKey)}</p>
          </div>
        )}

        <button type="submit" disabled={loading || !hydrated} style={primaryButtonStyle(loading)}>
          {loading ? "Sending your link…" : "Send reset link"}
        </button>
      </form>

      <p style={{ ...mutedTextStyle, marginTop: 28 }}>
        Remembered it?{" "}
        <Link href="/login" style={inlineLinkStyle}>Sign in</Link>
      </p>
    </AuthShell>
  );
}
