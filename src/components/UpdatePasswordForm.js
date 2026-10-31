"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AUTH_MESSAGES, authErrorCopy, mapAuthError } from "@/lib/authCopy";
import AuthShell, { AuthAlert, AuthField, AuthLinkLine, AuthLinks, AuthNotice } from "./AuthShell";
import LeaderEntry from "./house/LeaderEntry";

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
        <AuthNotice testId="update-password-checking" style={{ marginTop: 24, textAlign: "center" }}>One moment…</AuthNotice>
      </AuthShell>
    );
  }

  if (phase === "missing") {
    return (
      <AuthShell subtitle="Set a new password">
        <div data-testid="reset-session-missing" style={{ marginTop: 24 }}>
          <AuthNotice>{AUTH_MESSAGES.reset_session_missing}</AuthNotice>
          <LeaderEntry tone="filled" mark="→" label="Request a reset link" href="/forgot-password" style={{ marginTop: 28 }} />
          <AuthLinks style={{ marginTop: 24 }}>
            <AuthLinkLine href="/login">Back to sign in</AuthLinkLine>
          </AuthLinks>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell subtitle="Set a new password">
        <AuthNotice testId="password-updated" style={{ marginTop: 24, textAlign: "center" }}>
          {AUTH_MESSAGES.password_updated}
        </AuthNotice>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Set a new password">
      <form onSubmit={handleSubmit}>
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
          style={{ marginTop: 24 }}
        />

        {errorKey && (
          <AuthAlert ref={errorRef} style={{ marginTop: 16 }}>{authErrorCopy(errorKey)}</AuthAlert>
        )}

        <LeaderEntry
          tone="filled"
          mark="→"
          type="submit"
          label={loading ? "Updating…" : "Set new password"}
          disabled={loading}
          style={{ marginTop: 32 }}
        />
      </form>
    </AuthShell>
  );
}
