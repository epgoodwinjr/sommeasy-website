"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AUTH_ERRORS, AUTH_MESSAGES, authErrorCopy, authNoticeCopy, mapAuthError } from "@/lib/authCopy";
import {
  NAME_MAX, cleanName, interpretSignUpResult, isOtpNoAccountError, sanitizeNext, validateSignup,
} from "@/lib/authFlow";
import { peekStash, buildMetadataPayload } from "@/lib/pendingPalate";
import AuthShell, { AuthAlert, AuthField, AuthLinkLine, AuthLinks, AuthNotice } from "./AuthShell";
import LeaderEntry from "./house/LeaderEntry";
import TextAction, { TextActions } from "./house/TextAction";
import { SERIF, ink } from "./house/tokens";

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";
const MAGIC_ENABLED = process.env.NEXT_PUBLIC_MAGIC_LINK_ENABLED === "1";
const RESEND_COOLDOWN_SECS = 60;

// params: the page's searchParams server prop (?error, ?email, ?next, ?notice).
// Values can be string | string[] — take the first.
const param = (params, key) => {
  const v = params?.[key];
  return Array.isArray(v) ? v[0] : v || "";
};

export default function AuthForm({ mode, params }) {
  // Confirm/callback failures land on /login?error=<reason>&email=<email> —
  // rendered as brand copy from the very first paint, never a silent bounce.
  const [name, setName] = useState("");
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
  // ?notice=signed_out (Account's Sign out) lands as a quiet notice
  const [notice, setNotice] = useState(() => authNoticeCopy(param(params, "notice")));
  // "form" | "check_inbox" | "already_registered"
  const [view, setView] = useState("form");
  // What the inbox is waiting for: a signup confirmation or a magic link —
  // decides the copy and what "Resend" actually calls
  const [inboxMode, setInboxMode] = useState("signup");
  const [resendSecs, setResendSecs] = useState(0);
  const [resending, setResending] = useState(false);
  // An anonymous quiz waiting to ride the signup — read after mount
  // (localStorage), so the server render and first paint agree
  const [quizWaiting, setQuizWaiting] = useState(false);
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

  useEffect(() => {
    if (!isLogin) {
      try {
        setQuizWaiting(Boolean(peekStash(window.localStorage)));
      } catch {
        setQuizWaiting(false);
      }
    }
  }, [isLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (anyPending) return;
    setErrorKey(null);
    setNotice(null);

    // Create account says what's missing in brand voice (the form is
    // noValidate — no browser bubble), before Supabase is ever asked
    if (!isLogin) {
      const invalid = validateSignup({ name, email, password });
      if (invalid) {
        failWith(invalid);
        return;
      }
    }

    setLoading(true);
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
        // The name (D5) and the pending palate ride together as
        // user_metadata; the palate keeps its own 8KB guard
        const pendingPalate = pendingPalateMetadata();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: emailRedirectTo(),
            data: { name: cleanName(name), ...(pendingPalate ? { pending_palate: pendingPalate } : {}) },
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

  const errorLine = errorKey && (
    <AuthAlert ref={errorRef} style={{ marginTop: 16 }}>
      {authErrorCopy(errorKey)}
      {errorKey === "unconfirmed_email" && (
        <div>
          <TextAction
            onClick={resendAndShowInbox}
            disabled={anyPending || !email}
            underlined
            style={{ fontStyle: "normal" }}
          >
            {resending ? "Sending your link…" : "Resend the confirmation email"}
          </TextAction>
        </div>
      )}
    </AuthAlert>
  );

  const noticeLine = notice && <AuthNotice style={{ marginTop: 16 }}>{notice}</AuthNotice>;

  // ——— Check your inbox ———
  if (view === "check_inbox") {
    return (
      <AuthShell subtitle={AUTH_MESSAGES.check_inbox_title}>
        <div data-testid="auth-check-inbox" style={{ marginTop: 24, textAlign: "center" }}>
          <AuthNotice testId="auth-inbox-message">
            {inboxMode === "magic" ? AUTH_MESSAGES.magic_sent(email) : AUTH_MESSAGES.check_inbox(email)}
          </AuthNotice>
          {noticeLine}
          {errorLine}
          <div style={{ marginTop: 22 }}>
            <TextAction
              weight={700}
              onClick={resendLink}
              disabled={resendSecs > 0 || anyPending}
              testId="auth-resend"
            >
              {resending
                ? "Sending your link…"
                : resendSecs > 0
                  ? `Resend the link in ${resendSecs}s`
                  : "Resend the link"}
            </TextAction>
          </div>
          <AuthLinks style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: ink(0.55) }}>
                Used the wrong address?
              </span>
              <TextAction size={14} onClick={() => { setView("form"); setNotice(null); setErrorKey(null); }}>
                Go back
              </TextAction>
            </div>
          </AuthLinks>
        </div>
      </AuthShell>
    );
  }

  // ——— Already have an account ———
  if (view === "already_registered") {
    const emailQS = email ? `?email=${encodeURIComponent(email)}` : "";
    return (
      <AuthShell subtitle="You're already one of ours">
        <div data-testid="auth-already-registered" style={{ marginTop: 24 }}>
          <AuthNotice>{authErrorCopy("already_registered")}</AuthNotice>
          <LeaderEntry tone="filled" mark="→" label="Sign in" href={`/login${emailQS}`} style={{ marginTop: 28 }} />
          <AuthLinks style={{ marginTop: 24 }}>
            <TextAction href={`/forgot-password${emailQS}`} size={13}>Reset your password</TextAction>
          </AuthLinks>
        </div>
      </AuthShell>
    );
  }

  // ——— The form ———
  return (
    <AuthShell
      head={isLogin ? "brand" : "title"}
      title="Create your account"
      subtitle={isLogin ? "Welcome back — your palate’s been waiting." : "Save your palate and every bottle you rate."}
    >
      {/* Create account checks its own fields (validateSignup) so what's
          missing is said in brand voice, never a browser bubble */}
      <form onSubmit={handleSubmit} noValidate={!isLogin}>
        {!isLogin && (
          <AuthField
            id="name"
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            autoFocus
            maxLength={NAME_MAX}
            placeholder="What the Somm should call you"
            style={{ marginTop: 22 }}
          />
        )}
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          autoFocus={isLogin}
          placeholder="you@example.com"
          style={{ marginTop: isLogin ? 24 : 20 }}
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
          placeholder={isLogin ? "••••••••" : "At least 8 characters"}
          helper={isLogin ? undefined : AUTH_MESSAGES.password_helper}
          style={{ marginTop: isLogin ? 22 : 20 }}
        />

        {errorLine}
        {noticeLine}

        <LeaderEntry
          tone="filled"
          mark="→"
          type="submit"
          label={loading
            ? (isLogin ? "Signing you in…" : "Creating account…")
            : (isLogin ? "Sign in" : "Create account")}
          disabled={anyPending || !hydrated}
          style={{ marginTop: isLogin ? 32 : 30 }}
        />

        {(GOOGLE_ENABLED || (MAGIC_ENABLED && isLogin)) && (
          <TextActions centered style={{ marginTop: 10 }}>
            {MAGIC_ENABLED && isLogin && (
              <TextAction tone="quiet" opacity={0.55} onClick={handleMagicLink}
                disabled={anyPending || !hydrated} testId="magic-link">
                {magicLoading ? "Sending your link…" : "Email me a sign-in link"}
              </TextAction>
            )}
            {GOOGLE_ENABLED && (
              <TextAction tone="quiet" opacity={0.55} onClick={handleGoogleSignIn} disabled={anyPending || !hydrated}>
                {googleLoading ? "Opening Google…" : "Continue with Google"}
              </TextAction>
            )}
          </TextActions>
        )}
      </form>

      {!isLogin && quizWaiting && (
        <p style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "13px", lineHeight: 1.5, color: ink(0.55),
          textAlign: "center", marginTop: 14,
        }}>{AUTH_MESSAGES.quiz_comes_with_you}</p>
      )}

      {isLogin ? (
        <AuthLinks style={{ marginTop: 30 }}>
          <AuthLinkLine lead="New here?" href={withNext("/signup")}>Create an account</AuthLinkLine>
          <TextAction href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} size={13}>
            Forgot your password?
          </TextAction>
        </AuthLinks>
      ) : (
        <AuthLinks style={{ marginTop: 20 }}>
          <AuthLinkLine lead="Already have an account?" href={withNext("/login")}>Sign in</AuthLinkLine>
        </AuthLinks>
      )}
    </AuthShell>
  );
}
