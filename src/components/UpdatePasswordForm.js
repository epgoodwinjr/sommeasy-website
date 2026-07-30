"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AUTH_MESSAGES, authErrorCopy, mapAuthError } from "@/lib/authCopy";
import AuthShell, {
  authFonts, inputStyle, focusInput, blurInput, primaryButtonStyle,
  errorBoxStyle, errorTextStyle, noticeBoxStyle, noticeTextStyle,
  inlineLinkStyle, mutedTextStyle,
} from "./AuthShell";

export default function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  // "checking" | "ready" | "missing" | "done"
  const [phase, setPhase] = useState("checking");
  const router = useRouter();
  const supabase = createClient();

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
    setLoading(true);
    setErrorKey(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorKey(mapAuthError(error));
        return;
      }
      setPhase("done");
      // A quiet beat to read the confirmation, then home — signed in.
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1400);
    } catch {
      setErrorKey("network");
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
          <div style={noticeBoxStyle}>
            <p style={noticeTextStyle}>{AUTH_MESSAGES.reset_session_missing}</p>
          </div>
          <a href="/forgot-password" style={{ ...primaryButtonStyle(false), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
            Request a reset link
          </a>
          <p style={{ ...mutedTextStyle, marginTop: 14 }}>
            <a href="/login" style={inlineLinkStyle}>Back to sign in</a>
          </p>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell subtitle="Set a new password">
        <div style={noticeBoxStyle} data-testid="password-updated">
          <p style={noticeTextStyle}>{AUTH_MESSAGES.password_updated}</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Set a new password">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ position: "relative" }}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ ...inputStyle, paddingRight: 74 }}
            onFocus={focusInput}
            onBlur={blurInput}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute", right: 6, top: "50%",
              transform: "translateY(-50%)",
              border: "none", background: "none", cursor: "pointer",
              padding: "12px 12px", color: "#8B2332",
              fontFamily: authFonts.sans, fontSize: "13px", fontWeight: 600,
            }}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        {errorKey && (
          <div style={errorBoxStyle} data-testid="auth-error" role="alert">
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
