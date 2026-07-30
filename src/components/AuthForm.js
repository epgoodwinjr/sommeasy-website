"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { AUTH_ERRORS, AUTH_MESSAGES, authErrorCopy, mapAuthError } from "@/lib/authCopy";
import { interpretSignUpResult, sanitizeNext, isOtpNoAccountError } from "@/lib/authFlow";
import { peekStash, buildMetadataPayload } from "@/lib/pendingPalate";
import AuthShell, {
  AuthField, authFonts, primaryButtonStyle,
  errorBoxStyle, errorTextStyle, noticeBoxStyle, noticeTextStyle,
  inlineLinkStyle, mutedTextStyle,
} from "./AuthShell";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";
const MAGIC_ENABLED = process.env.NEXT_PUBLIC_MAGIC_LINK_ENABLED === "1";
const RESEND_COOLDOWN_SECS = 60;

// params: the page's searchParams server prop (?error, ?email, ?next).
// Values can be string | string[] — take the first.
const param = (params, key) => {
  const v = params?.[key];
  return Array.isArray(v) ? v[0] : v || "";
};

export default function AuthForm({ mode, params }) {
  // Confirm/callback failures land on /login?error=<reason>&email=<email> —
  // rendered as brand copy from the very first paint, never a silent bounce.
  const [email, setEmail] = useState(() => param(params, "email"));
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [errorKey, setErrorKey] = useState(() => {
    const errorParam = param(params, "error");
    if (!errorParam) return null;
    return AUTH_ERRORS[errorParam] ? errorParam : "unknown";
  });
  const [notice, setNotice] = useState(null);
  // "form" | "check_inbox" | "already_registered"
  const [view, setView] = useState("form");
  // What the inbox is waiting for: a signup confirmation or a magic link —
  // decides the copy and what "Resend" actually calls
  const [inboxMode, setInboxMode] = useState("signup");
  const [resendSecs, setResendSecs] = useState(0);
  const [resending, setResending] = useState(false);
  // The submit button ships disabled in the SSR HTML and enables on mount:
  // a click before React hydrates would fire a NATIVE form submission — a
  // full reload that wipes the typed input and leaks named fields into the
  // URL. ~100ms window. e2e uses the enabled button as its hydration signal.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const router = useRouter();
  const supabase = createClient();

  const isLogin = mode === "login";
  // One switch for "something is in flight" — every actionable control
  // disables together so double-submits and crossed flows can't happen
  const anyPending = loading || googleLoading || magicLoading || resending;

  // Destination preservation (Session 2): signed-out gates pass ?next= and
  // it rides the whole flow — the post-auth push, the email confirmation
  // round trip, OAuth, and the login↔signup toggle. Always sanitized: the
  // open-redirect rules from Session 1 apply here too.
  const nextPath = sanitizeNext(param(params, "next") || "/");
  const nextQS = nextPath !== "/" ? `next=${encodeURIComponent(nextPath)}` : "";
  const withNext = (href) => (nextQS ? `${href}${href.includes("?") ? "&" : "?"}${nextQS}` : href);

  // Failure focus: screen readers (and sighted keyboard users) land on the
  // error the moment it appears — but only for INTERACTIVE failures, never
  // the ?error param on first paint (autoFocus owns that moment).
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

  // Resend cooldown ticker
  useEffect(() => {
    if (resendSecs <= 0) return;
    const t = setTimeout(() => setResendSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendSecs]);

  const emailRedirectTo = () =>
    `${window.location.origin}/api/auth/callback${nextQS ? `?${nextQS}` : ""}`;

  // Never Lose a Palate (Session 5): an anonymous quiz rides the signup as
  // user_metadata, so it travels with the ACCOUNT — localStorage can't
  // survive a cross-device or in-app-browser email confirmation (the July 30
  // canary lost a full quiz exactly that way). Peek, never claim: abandoning
  // signup must leave the same-browser stash intact. Any failure here
  // returns null and the signup proceeds untouched.
  const pendingPalateMetadata = () => {
    try {
      const stash = peekStash(window.localStorage);
      return stash ? buildMetadataPayload(stash.answers, stash.createdAt) : null;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (anyPending) return;
    setLoading(true);
    setErrorKey(null);
    setNotice(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          failWith(mapAuthError(error));
          return;
        }
        router.push(nextPath);
        router.refresh();
      } else {
        const pendingPalate = pendingPalateMetadata();
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: emailRedirectTo(),
            ...(pendingPalate ? { data: { pending_palate: pendingPalate } } : {}),
          },
        });
        const outcome = interpretSignUpResult(data, error);
        if (outcome.kind === "error") {
          failWith(mapAuthError(outcome.error));
        } else if (outcome.kind === "signed_in") {
          // Confirmations off (or already verified) — no email theater
          router.push(nextPath);
          router.refresh();
        } else if (outcome.kind === "already_registered") {
          setView("already_registered");
        } else {
          setInboxMode("signup");
          setView("check_inbox");
          setResendSecs(RESEND_COOLDOWN_SECS);
        }
      }
    } catch {
      failWith("network");
    } finally {
      setLoading(false);
    }
  };

  // Shared magic-link sender (first send AND resends). Returns true when the
  // inbox state should show. Anti-enumeration by construction: an unknown
  // email (shouldCreateUser: false rejection) lands on the same
  // check-your-inbox copy as a real send.
  const sendMagicLink = async () => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: emailRedirectTo() },
      });
      if (error && !isOtpNoAccountError(error)) {
        failWith(mapAuthError(error));
        return false;
      }
      return true;
    } catch {
      failWith("network");
      return false;
    }
  };

  const handleMagicLink = async () => {
    if (anyPending) return;
    if (!email.trim()) {
      failWith("magic_needs_email");
      return;
    }
    setMagicLoading(true);
    setErrorKey(null);
    setNotice(null);
    const ok = await sendMagicLink();
    setMagicLoading(false);
    if (ok) {
      setInboxMode("magic");
      setView("check_inbox");
      setResendSecs(RESEND_COOLDOWN_SECS);
    }
  };

  // Resend from the check-inbox state — signup confirmations go through
  // auth.resend, magic links are simply sent again.
  const resendLink = async () => {
    setResending(true);
    setNotice(null);
    setErrorKey(null);
    try {
      if (inboxMode === "magic") {
        const ok = await sendMagicLink();
        if (ok) {
          setNotice(AUTH_MESSAGES.resent);
          setResendSecs(RESEND_COOLDOWN_SECS);
        }
        return ok;
      }
      const { error } = await supabase.auth.resend({
        type: "signup", email,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      if (error) {
        failWith(mapAuthError(error));
        return false;
      }
      setNotice(AUTH_MESSAGES.resent);
      setResendSecs(RESEND_COOLDOWN_SECS);
      return true;
    } catch {
      failWith("network");
      return false;
    } finally {
      setResending(false);
    }
  };

  // From the login form's unconfirmed-email affordance: only move to the
  // check-inbox state if the resend actually went out.
  const resendAndShowInbox = async () => {
    setInboxMode("signup");
    const ok = await resendLink();
    if (ok) setView("check_inbox");
  };

  const handleGoogleSignIn = async () => {
    if (anyPending) return;
    setGoogleLoading(true);
    setErrorKey(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: emailRedirectTo() },
      });
      if (error) {
        failWith(mapAuthError(error));
        setGoogleLoading(false);
      }
      // On success the browser navigates to Google — keep the pending state.
    } catch {
      failWith("network");
      setGoogleLoading(false);
    }
  };

  const errorBox = errorKey && (
    <div
      style={errorBoxStyle}
      data-testid="auth-error"
      role="alert"
      aria-live="polite"
      tabIndex={-1}
      ref={errorRef}
    >
      <p style={errorTextStyle}>{authErrorCopy(errorKey)}</p>
      {errorKey === "unconfirmed_email" && (
        <button
          type="button"
          onClick={resendAndShowInbox}
          disabled={anyPending || !email}
          style={{
            marginTop: 8, padding: "8px 0", border: "none", background: "none",
            color: "#8B2332", fontFamily: authFonts.sans, fontSize: "13px",
            fontWeight: 600, cursor: resending ? "wait" : "pointer",
            textDecoration: "underline",
          }}
        >
          {resending ? "Sending your link…" : "Resend the confirmation email"}
        </button>
      )}
    </div>
  );

  const noticeBox = notice && (
    <div style={noticeBoxStyle} data-testid="auth-notice" role="status" aria-live="polite">
      <p style={noticeTextStyle}>{notice}</p>
    </div>
  );

  // ——— Check your inbox ———
  if (view === "check_inbox") {
    return (
      <AuthShell subtitle={AUTH_MESSAGES.check_inbox_title}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-testid="auth-check-inbox">
          <div style={noticeBoxStyle} role="status" aria-live="polite">
            <p style={noticeTextStyle}>
              {inboxMode === "magic"
                ? AUTH_MESSAGES.magic_sent(email)
                : AUTH_MESSAGES.check_inbox(email)}
            </p>
          </div>
          {noticeBox}
          {errorBox}
          <button
            type="button"
            onClick={resendLink}
            disabled={resendSecs > 0 || anyPending}
            data-testid="auth-resend"
            style={primaryButtonStyle(resendSecs > 0 || anyPending)}
          >
            {resending
              ? "Sending your link…"
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
          <div style={noticeBoxStyle} role="status" aria-live="polite">
            <p style={noticeTextStyle}>{authErrorCopy("already_registered")}</p>
          </div>
          <Link href={`/login${emailQS}`} style={{ ...primaryButtonStyle(false), display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
            Sign in
          </Link>
          <p style={{ ...mutedTextStyle, marginTop: 14 }}>
            <Link href={`/forgot-password${emailQS}`} style={inlineLinkStyle}>
              Reset your password
            </Link>
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
            disabled={anyPending || !hydrated}
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
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          // "new-password" at signup is what triggers iOS/1Password
          // strong-password generation — the single biggest
          // forgot-password preventer
          autoComplete={isLogin ? "current-password" : "new-password"}
          // New passwords follow the 8-char policy; sign-in stays
          // length-agnostic so legacy shorter passwords still get in
          minLength={isLogin ? undefined : 8}
          placeholder="Password"
          helper={isLogin ? undefined : AUTH_MESSAGES.password_helper}
        />

        {isLogin && (
          <p style={{ margin: "-4px 0 0", textAlign: "right" }}>
            <Link
              href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              style={{ ...inlineLinkStyle, fontFamily: authFonts.sans, fontSize: "13px" }}
            >
              Forgot your password?
            </Link>
          </p>
        )}

        {errorBox}
        {noticeBox}

        <button type="submit" disabled={anyPending || !hydrated} style={primaryButtonStyle(loading)}>
          {loading
            ? (isLogin ? "Signing you in…" : "Creating your account…")
            : (isLogin ? "Sign In" : "Create Account")}
        </button>

        {MAGIC_ENABLED && isLogin && (
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={anyPending || !hydrated}
            data-testid="magic-link"
            style={{
              border: "none", background: "none",
              fontFamily: authFonts.sans, fontSize: "14px", fontWeight: 600,
              color: "#8B2332", cursor: magicLoading ? "wait" : "pointer",
              padding: "12px 8px", opacity: anyPending && !magicLoading ? 0.4 : 1,
            }}
          >
            {magicLoading ? "Sending your link…" : "Email me a sign-in link instead"}
          </button>
        )}
      </form>

      <p style={{ ...mutedTextStyle, marginTop: 28 }}>
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <Link href={withNext(isLogin ? "/signup" : "/login")} style={inlineLinkStyle}>
          {isLogin ? "Sign up" : "Sign in"}
        </Link>
      </p>
    </AuthShell>
  );
}
