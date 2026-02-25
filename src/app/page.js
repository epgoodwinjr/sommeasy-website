"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import Quiz from "@/components/Quiz";

function WelcomeScreen({ onStart, user, onSignOut }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: "40px 24px", textAlign: "center",
    }}>
      {/* Auth bar */}
      {user && (
        <div style={{ position: "absolute", top: 16, right: 20 }}>
          <button onClick={onSignOut} style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F",
            background: "none", border: "1px solid rgba(27,61,47,0.2)", borderRadius: "100px",
            padding: "6px 16px", cursor: "pointer", opacity: 0.6,
          }}>Sign Out</button>
        </div>
      )}

      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#1B3D2F", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, fontSize: "36px", boxShadow: "0 8px 32px rgba(27,61,47,0.3)" }}>🍷</div>

      <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(32px, 7vw, 48px)", color: "#8B2332", margin: "0 0 8px 0", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Sommeasy</h1>

      <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 32px 0", opacity: 0.6 }}>Your Wine DNA Profile</p>

      <div style={{ maxWidth: 380, margin: "0 auto 40px" }}>
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "20px", color: "#1B3D2F", lineHeight: 1.5, margin: "0 0 16px 0" }}>You know what you like.</p>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", color: "#1B3D2F", lineHeight: 1.6, margin: 0, opacity: 0.7 }}>
          Tell us about the wines, regions, and grapes you love — as broad or specific as you want — and we&#39;ll build your Wine DNA profile so you never have to guess at a restaurant wine list again.
        </p>
      </div>

      <button onClick={onStart} style={{
        fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", fontWeight: 600, color: "#F5F0E8",
        background: "#8B2332", border: "none", borderRadius: "100px", padding: "16px 48px",
        cursor: "pointer", letterSpacing: "0.04em", transition: "all 0.3s ease", boxShadow: "0 4px 20px rgba(139,35,50,0.3)",
      }}
        onMouseEnter={e => { e.target.style.transform = "translateY(-2px)"; e.target.style.boxShadow = "0 6px 28px rgba(139,35,50,0.4)"; }}
        onMouseLeave={e => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 4px 20px rgba(139,35,50,0.3)"; }}
      >Build My Profile</button>

      {!user && (
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.5, marginTop: 20 }}>
          Already have an account? <a href="/login" style={{ color: "#8B2332", fontWeight: 600 }}>Sign in</a>
        </p>
      )}

      <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.4, marginTop: 12 }}>Takes about 2 minutes</p>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("welcome"); // welcome | quiz
  const [savedMessage, setSavedMessage] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setView("welcome");
  };

  const handleSaveProfile = async (profile) => {
    if (!user) return;

    const { error } = await supabase.from("wine_profiles").upsert({
      user_id: user.id,
      archetype: profile.archetype,
      archetype_emoji: profile.archetypeEmoji,
      narrative: profile.narrative,
      countries: profile.raw.countries,
      regions: profile.raw.regions,
      estates: profile.raw.estates,
      varietals: profile.raw.varietals,
      specific_wines: profile.raw.specificWines,
      recommendations: profile.recommendations,
      red_count: profile.redCount,
      white_count: profile.whiteCount,
    }, { onConflict: "user_id" });

    if (error) {
      console.error("Save error:", error);
      alert("Error saving profile. Please try again.");
    } else {
      setSavedMessage("Profile saved!");
      setTimeout(() => setSavedMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", color: "#8B2332", opacity: 0.5 }}>Sommeasy</div>
      </div>
    );
  }

  if (view === "quiz") {
    return (
      <div style={{ position: "relative" }}>
        {savedMessage && (
          <div style={{
            position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
            background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px", borderRadius: "100px",
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600,
            boxShadow: "0 4px 20px rgba(27,61,47,0.3)", zIndex: 100,
          }}>✓ {savedMessage}</div>
        )}
        <Quiz user={user} onProfileGenerated={handleSaveProfile} />
      </div>
    );
  }

  return <WelcomeScreen onStart={() => setView("quiz")} user={user} onSignOut={handleSignOut} />;
}
