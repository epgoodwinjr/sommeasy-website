"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AUTH_ERRORS, AUTH_MESSAGES, authErrorCopy, mapAuthError } from "@/lib/authCopy";
import { interpretSignUpResult } from "@/lib/authFlow";
import AuthShell, {
  authFonts, inputStyle, focusInput, blurInput, primaryButtonStyle,
  errorBoxStyle, errorTextStyle, noticeBoxStyle, noticeTextStyle,
  inlineLinkStyle, mutedTextStyle,
} from "./AuthShell";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";
const RESEND_COOLDOWN_SECS = 60;

export default function AuthForm({ mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [notice, setNotice] = useState(null);
  // "form" | "check_inbox" | "already_registered"
  const [view, setView] = useState("form");
  const [resendSecs, setResendSecs] = useState(0);
  const [resending, setResending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const isLogin = mode === "login";

  // Confirm/callback failures land on /login?error=<reason>&email=<email> —
  // render them as brand copy, never a silent bounce.
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) setEmail(emailParam);
    const errorParam = searchParams.get("error");
    if (errorParam) setErrorKey(AUTH_ERRORS[errorParam] ? errorParam : "unknown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendSecs <= 0) return;
    const t = setTimeout(() => setResendSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendSecs]);

  const emailRedirectTo = () => `${window.location.origin}/api/auth/callback`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorKey(null);
    setNotice(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setErrorKey(mapAuthError(error));
          return;
        }
        router.push("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: emailRedirectTo() },
        });
        const outcome = interpretSignUpResult(data, error);
        if (outcome.kind === "error") {
          setErrorKey(mapAuthError(outcome.error));
        } else if (outcome.kind === "signed_in") {
          // Confirmations off (or already verified) — no email theater
          router.push("/");
          router.refresh();
        } else if (outcome.kind === "already_registered") {
          setView("already_registered");
        } else {
          setView("check_inbox");
          setResendSecs(RESEND_COOLDOWN_SECS);
        }
      }
    } catch {
      setErrorKey("network");
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    setResending(true);
    setNotice(null);
    setErrorKey(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup", email,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      if (error) {
        setErrorKey(mapAuthError(error));
        return false;
      }
      setNotice(AUTH_MESSAGES.resent);
      setResendSecs(RESEND_COOLDOWN_SECS);
      return true;
    } catch {
      setErrorKey("network");
      return false;
    } finally {
      setResending(false);
    }
  };

  // From the login form's unconfirmed-email affordance: only move to the
  // check-inbox state if the resend actually went out.
  const resendAndShowInbox = async () => {
    const ok = await resendConfirmation();
    if (ok) setView("check_inbox");
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setErrorKey(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: emailRedirectTo() },
      });
      if (error) {
        setErrorKey(mapAuthError(error));
        setGoogleLoading(false);
      }
      // On success the browser navigates to Google — keep the pending state.
    } catch {
      setErrorKey("network");
      setGoogleLoading(false);
    }
  };

  const errorBox = errorKey && (
    <div style={errorBoxStyle} data-testid="auth-error" role="alert">
      <p style={errorTextStyle}>{authErrorCopy(errorKey)}</p>
      {errorKey === "unconfirmed_email" && (
        <button
          type="button"
          onClick={resendAndShowInbox}
          disabled={resending || !email}
          style={{
            marginTop: 8, padding: "8px 0", border: "none", background: "none",
            color: "#8B2332", fontFamily: authFonts.sans, fontSize: "13px",
            fontWeight: 600, cursor: resending ? "wait" : "pointer",
            textDecoration: "underline",
          }}
        >
          {resending ? "Sending…" : "Resend the confirmation email"}
        </button>
      )}
    </div>
  );

  const noticeBox = notice && (
    <div style={noticeBoxStyle} data-testid="auth-notice">
      <p style={noticeTextStyle}>{notice}</p>
    </div>
  );

  // ——— Check your inbox ———
  if (view === "check_inbox") {
    return (
      <AuthShell subtitle={AUTH_MESSAGES.check_inbox_title}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-testid="auth-check-inbox">
          <div style={noticeBoxStyle}>
            <p style={noticeTextStyle}>{AUTH_MESSAGES.check_inbox(email)}</p>
          </div>
          {noticeBox}
          {errorBox}
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={resendSecs > 0 || resending}
            data-testid="auth-resend"
            style={primaryButtonStyle(resendSecs > 0 || resending)}
          >
            {resending
              ? "Sending…"
              : resendSecs > 0
                ? `Resend the link in ${resendSecs}s`
                : "Resend the link"}
          </button>
          <p style={{ ...mutedTextStyle, marginTop: 14 }}>
            Used the wrong address?{" "}
            <button
              type="button"
              onClick={() => { setView("form"); setNotice(null); setErrorKey(null); }}
              style={{
                ...inlineLinkStyle, border: "none", background: "none",
                fontFamily: authFonts.sans, fontSize: "14px", cursor: "pointer",
              }}
            >
              Go back
            </button>
          </p>
        </div>
      </AuthShell>
    );
  }

  // ——— Already have an account ———
  if (view === "already_registered") {
    const emailQS = email ? `?email=${encodeURIComponent(email)}` : "";
    return (
      <AuthShell subtitle="You're already one of ours">
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-testid="auth-already-registered">
          <div style={noticeBoxStyle}>
            <p style={noticeTextStyle}>{authErrorCopy("already_registered")}</p>
          </div>
          <a href={`/login${emailQS}`} style={{ ...primaryButtonStyle(false), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
            Sign in
          </a>
          <p style={{ ...mutedTextStyle, marginTop: 14 }}>
            <a href={`/forgot-password${emailQS}`} style={inlineLinkStyle}>
              Reset your password
            </a>
          </p>
        </div>
      </AuthShell>
    );
  }

  // ——— The form ———
  return (
    <AuthShell subtitle={isLogin ? "Welcome back" : "Create your account"}>
      {GOOGLE_ENABLED && (
        <>
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            style={{
              width: "100%", padding: "15px", borderRadius: "14px",
              border: "1px solid rgba(27,61,47,0.12)",
              background: "rgba(255,255,255,0.65)", color: "#1B3D2F",
              fontFamily: authFonts.sans, fontSize: "15px",
              fontWeight: 600, cursor: googleLoading ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "10px", transition: "all 0.15s ease", marginBottom: 24,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              opacity: googleLoading ? 0.6 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {googleLoading ? "Opening Google…" : "Continue with Google"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(27,61,47,0.08)" }} />
            <span style={{
              fontFamily: authFonts.sans, fontSize: "12px",
              color: "#1B3D2F", opacity: 0.3, textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(27,61,47,0.08)" }} />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
          onFocus={focusInput}
          onBlur={blurInput}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={inputStyle}
          onFocus={focusInput}
          onBlur={blurInput}
        />

        {isLogin && (
          <p style={{ margin: "-4px 0 0", textAlign: "right" }}>
            <a
              href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              style={{ ...inlineLinkStyle, fontFamily: authFonts.sans, fontSize: "13px" }}
            >
              Forgot your password?
            </a>
          </p>
        )}

        {errorBox}
        {noticeBox}

        <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
          {loading
            ? (isLogin ? "Signing you in…" : "Creating your account…")
            : (isLogin ? "Sign In" : "Create Account")}
        </button>
      </form>

      <p style={{ ...mutedTextStyle, marginTop: 28 }}>
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <a href={isLogin ? "/signup" : "/login"} style={inlineLinkStyle}>
          {isLogin ? "Sign up" : "Sign in"}
        </a>
      </p>
    </AuthShell>
  );
}
