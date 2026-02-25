"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function AuthForm({ mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const router = useRouter();
  const supabase = createClient();

  const isLogin = mode === "login";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email for a confirmation link!");
      }
    }

    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) setError(error.message);
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "2px solid rgba(27,61,47,0.15)",
    background: "rgba(255,255,255,0.7)",
    fontFamily: "'Source Sans 3', sans-serif",
    fontSize: "15px",
    color: "#1B3D2F",
    transition: "border-color 0.2s ease",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#1B3D2F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: "28px",
              boxShadow: "0 8px 32px rgba(27,61,47,0.3)",
            }}
          >
            🍷
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "32px",
              color: "#8B2332",
              margin: "0 0 4px 0",
              fontWeight: 700,
            }}
          >
            Sommeasy
          </h1>
          <p
            style={{
              fontFamily: "'Source Sans 3', sans-serif",
              fontSize: "15px",
              color: "#1B3D2F",
              opacity: 0.6,
            }}
          >
            {isLogin ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleSignIn}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "12px",
            border: "2px solid rgba(27,61,47,0.15)",
            background: "rgba(255,255,255,0.8)",
            color: "#1B3D2F",
            fontFamily: "'Source Sans 3', sans-serif",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            transition: "all 0.2s ease",
            marginBottom: 20,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: 20,
          }}
        >
          <div style={{ flex: 1, height: 1, background: "rgba(27,61,47,0.12)" }} />
          <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.4 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "rgba(27,61,47,0.12)" }} />
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "#8B2332")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(27,61,47,0.15)")}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "#8B2332")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(27,61,47,0.15)")}
          />

          {error && (
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#8B2332", textAlign: "center" }}>
              {error}
            </p>
          )}
          {message && (
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", textAlign: "center" }}>
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: loading ? "rgba(139,35,50,0.5)" : "#8B2332",
              color: "#F5F0E8",
              fontFamily: "'Source Sans 3', sans-serif",
              fontSize: "15px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 16px rgba(139,35,50,0.25)",
              marginTop: 4,
            }}
          >
            {loading ? "..." : isLogin ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Toggle link */}
        <p
          style={{
            fontFamily: "'Source Sans 3', sans-serif",
            fontSize: "14px",
            color: "#1B3D2F",
            textAlign: "center",
            marginTop: 20,
            opacity: 0.6,
          }}
        >
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <a
            href={isLogin ? "/signup" : "/login"}
            style={{ color: "#8B2332", fontWeight: 600 }}
          >
            {isLogin ? "Sign up" : "Sign in"}
          </a>
        </p>
      </div>
    </div>
  );
}
