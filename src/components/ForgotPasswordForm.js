"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { AUTH_MESSAGES, authErrorCopy, mapAuthError } from "@/lib/authCopy";
import AuthShell, { AuthAlert, AuthField, AuthLinkLine, AuthLinks, AuthNotice } from "./AuthShell";
import LeaderEntry from "./house/LeaderEntry";

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
        <div data-testid="reset-sent" style={{ marginTop: 24, textAlign: "center" }}>
          <AuthNotice testId="reset-sent-message">{AUTH_MESSAGES.reset_sent}</AuthNotice>
          <AuthLinks style={{ marginTop: 22 }}>
            <AuthLinkLine href="/login">Back to sign in</AuthLinkLine>
          </AuthLinks>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Tell us your email and we’ll send a link to set a new password.">
      <form onSubmit={handleSubmit}>
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          autoFocus
          placeholder="you@example.com"
          style={{ marginTop: 24 }}
        />

        {errorKey && (
          <AuthAlert ref={errorRef} style={{ marginTop: 16 }}>{authErrorCopy(errorKey)}</AuthAlert>
        )}

        <LeaderEntry
          tone="filled"
          mark="→"
          type="submit"
          label={loading ? "Sending your link…" : "Send reset link"}
          disabled={loading || !hydrated}
          style={{ marginTop: 32 }}
        />
      </form>

      <AuthLinks style={{ marginTop: 30 }}>
        <AuthLinkLine lead="Remembered it?" href="/login">Sign in</AuthLinkLine>
      </AuthLinks>
    </AuthShell>
  );
}
