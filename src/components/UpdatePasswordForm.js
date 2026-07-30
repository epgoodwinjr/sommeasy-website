"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { AUTH_MESSAGES, authErrorCopy, mapAuthError } from "@/lib/authCopy";
import AuthShell, {
  AuthField, primaryButtonStyle,
  errorBoxStyle, errorTextStyle, noticeBoxStyle, noticeTextStyle,
  inlineLinkStyle, mutedTextStyle,
} from "./AuthShell";

export default function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  // "checking" | "ready" | "missing" | "done"
  const [phase, setPhase] = useState("checking");
  const router = useRouter();
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

  // The reset link lands here through the confirm/callback layer, which
  // sets the recovery session in cookies. No session → the link never ran
  // (or expired): say so, don't render a form that can only fail.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setPhase(data?.user ? "ready" : "missing");
    }).catch(() => {
      if (!cancelled) setPhase("missing");
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        failWith(mapAuthError(error));
        return;
      }
      setPhase("done");
      // A quiet beat to read the confirmation, then home — signed in.
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1400);
    } catch {
      failWith("network");
    } finally {
      setLoading(false);
    }
  };

  if (phase === "checking") {
    return (
      <AuthShell subtitle="Set a new password">
        <p style={{ ...mutedTextStyle }}>One moment…</p>
      </AuthShell>
    );
  }

  if (phase === "missing") {
    return (
      <AuthShell subtitle="Set a new password">
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-testid="reset-session-missing">
          <div style={noticeBoxStyle} role="status" aria-live="polite">
            <p style={noticeTextStyle}>{AUTH_MESSAGES.reset_session_missing}</p>
          </div>
          <Link href="/forgot-password" style={{ ...primaryButtonStyle(false), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
            Request a reset link
          </Link>
          <p style={{ ...mutedTextStyle, marginTop: 14 }}>
            <Link href="/login" style={inlineLinkStyle}>Back to sign in</Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell subtitle="Set a new password">
        <div style={noticeBoxStyle} data-testid="password-updated" role="status" aria-live="polite">
          <p style={noticeTextStyle}>{AUTH_MESSAGES.password_updated}</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Set a new password">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <AuthField
          id="new-password"
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          // new-password is what triggers iOS/1Password strong-password
          // generation on the reset path
          autoComplete="new-password"
          autoFocus
          minLength={8}
          placeholder="New password"
          helper={AUTH_MESSAGES.password_helper}
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

        <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
          {loading ? "Updating…" : "Set new password"}
        </button>
      </form>
    </AuthShell>
  );
}
