"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import Quiz from "@/components/Quiz";

// ─── Saved Profile View ───
function SavedProfileView({ profile, onRefine, onRetake, onSignOut, user }) {
  const [tab, setTab] = useState("recs");
  const recs = profile.recommendations || [];

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px" }}>
      {/* Header */}
      <div style={{
        padding: "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: "rgba(245,240,232,0.9)", backdropFilter: "blur(12px)", zIndex: 10,
      }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", color: "#8B2332", fontWeight: 600 }}>Sommeasy</span>
        <button onClick={onSignOut} style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F",
          background: "none", border: "1px solid rgba(27,61,47,0.2)", borderRadius: "100px",
          padding: "6px 16px", cursor: "pointer", opacity: 0.6,
        }}>Sign Out</button>
      </div>

      {/* Hero Card */}
      <div style={{ background: "linear-gradient(145deg, #1B3D2F 0%, #2A5540 50%, #1B3D2F 100%)", borderRadius: "24px", padding: "32px 24px 28px", color: "#F5F0E8", marginBottom: 20, boxShadow: "0 16px 48px rgba(27,61,47,0.4)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "rgba(139,35,50,0.1)" }} />
        <div style={{ position: "absolute", bottom: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(107,143,94,0.08)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: "48px", marginBottom: 12 }}>{profile.archetype_emoji}</div>
          <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.5, marginBottom: 8 }}>Your Wine DNA</div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "32px", margin: "0 0 16px 0", fontWeight: 700, lineHeight: 1.1 }}>{profile.archetype}</h2>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", lineHeight: 1.65, opacity: 0.8, maxWidth: 360, margin: "0 auto" }}>{profile.narrative}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {[
              { n: (profile.countries || []).length, l: "Countries" },
              { n: Object.values(profile.regions || {}).flat().length, l: "Regions" },
              { n: (profile.varietals || []).length, l: "Grapes" },
              { n: Object.values(profile.estates || {}).flat().length + (profile.specific_wines || []).length, l: "Favorites" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "22px", fontWeight: 700 }}>{s.n}</div>
                <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "10px", marginBottom: 20 }}>
        <a href="/recommend" style={{
          flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          padding: "16px 20px", borderRadius: "14px", border: "none",
          background: "#8B2332", color: "#F5F0E8",
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600,
          textDecoration: "none", boxShadow: "0 4px 16px rgba(139,35,50,0.25)",
        }}>📋 I&#39;m at a Restaurant</a>
        <button onClick={onRefine} style={{
          flex: 1, padding: "16px 12px", borderRadius: "14px",
          border: "2px solid rgba(27,61,47,0.15)", background: "rgba(255,255,255,0.7)",
          color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600,
          cursor: "pointer",
        }}>Refine</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: 16, background: "rgba(27,61,47,0.06)", borderRadius: "12px", padding: "4px" }}>
        {[{ id: "recs", label: `Wines to Try (${recs.length})` }, { id: "profile", label: "Full Profile" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 12px", borderRadius: "10px", border: "none", background: tab === t.id ? "#fff" : "transparent", color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", transition: "all 0.2s ease", boxShadow: tab === t.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none" }}>{t.label}</button>
        ))}
      </div>

      {/* Recs Tab */}
      {tab === "recs" && recs.length > 0 && (
        <div>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.6, textAlign: "center", margin: "0 0 16px 0", lineHeight: 1.5 }}>Based on your DNA, here are wines we think you would love.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {recs.map((rec, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.6)", borderRadius: "16px", padding: "18px 20px", border: "1px solid rgba(27,61,47,0.08)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #8B2332, #6B1D2A)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5F0E8", fontFamily: "'Playfair Display', serif", fontSize: "14px", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "15px", color: "#1B3D2F", lineHeight: 1.3, marginBottom: 4 }}>{rec.wine}</div>
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.55, lineHeight: 1.4 }}>{rec.why}</div>
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", color: "#8B2332", opacity: 0.7, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {rec.matchType === "region + grape" ? "📍 Region + grape match" : rec.matchType === "grape" ? "🍇 Grape match" : "🧭 Discovery pick"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {tab === "profile" && (
        <div>
          {(profile.red_count > 0 || profile.white_count > 0) && (
            <div style={{ marginBottom: 12, background: "rgba(255,255,255,0.5)", borderRadius: "14px", padding: "16px 18px", border: "1px solid rgba(27,61,47,0.08)" }}>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.5, marginBottom: 10, fontWeight: 600 }}>Red vs White</div>
              <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
                <div style={{ flex: profile.red_count || 0.01, background: "#8B2332", borderRadius: "4px 0 0 4px" }} />
                <div style={{ flex: profile.white_count || 0.01, background: "#6B8F5E", borderRadius: "0 4px 4px 0" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#8B2332", fontWeight: 600 }}>{profile.red_count} red</span>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#6B8F5E", fontWeight: 600 }}>{profile.white_count} white</span>
              </div>
            </div>
          )}
          <ProfileTagSection label="Countries" items={profile.countries || []} />
          <ProfileTagSection label="Regions" items={Object.values(profile.regions || {}).flat()} />
          <ProfileTagSection label="Varietals" items={profile.varietals || []} />
          <ProfileTagSection label="Specific Wines" items={profile.specific_wines || []} />
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 28, paddingBottom: 40 }}>
        <button onClick={onRetake} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "none", border: "none", cursor: "pointer", opacity: 0.4, textDecoration: "underline" }}>Start fresh &amp; retake quiz</button>
      </div>
    </div>
  );
}

function ProfileTagSection({ label, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 12, background: "rgba(255,255,255,0.5)", borderRadius: "14px", padding: "14px 18px", border: "1px solid rgba(27,61,47,0.08)" }}>
      <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.5, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {items.map((item, i) => <span key={i} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "rgba(27,61,47,0.06)", padding: "4px 12px", borderRadius: "100px" }}>{item}</span>)}
      </div>
    </div>
  );
}

// ─── Welcome Screen ───
function WelcomeScreen({ onStart, user, onSignOut }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", padding: "40px 24px", textAlign: "center",
    }}>
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
        cursor: "pointer", letterSpacing: "0.04em", boxShadow: "0 4px 20px rgba(139,35,50,0.3)",
      }}>Build My Profile</button>
      {!user && (
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.5, marginTop: 20 }}>
          Already have an account? <a href="/login" style={{ color: "#8B2332", fontWeight: 600 }}>Sign in</a>
        </p>
      )}
      <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.4, marginTop: 12 }}>Takes about 2 minutes</p>
    </div>
  );
}

// ─── Main Controller ───
export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savedProfile, setSavedProfile] = useState(null);
  const [view, setView] = useState("loading");
  const [quizInitial, setQuizInitial] = useState(null);
  const [savedMessage, setSavedMessage] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user || null;
      setUser(currentUser);

      if (currentUser) {
        const { data } = await supabase
          .from("wine_profiles")
          .select("*")
          .eq("user_id", currentUser.id)
          .single();

        if (data) {
          setSavedProfile(data);
          setView("profile");
        } else {
          setView("welcome");
        }
      } else {
        setView("welcome");
      }
      setLoading(false);
    }
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session?.user) {
        setSavedProfile(null);
        setView("welcome");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => { await supabase.auth.signOut(); setSavedProfile(null); setView("welcome"); };
  const handleStartQuiz = () => { setQuizInitial(null); setView("quiz"); };
  const handleRefine = () => {
    if (savedProfile) {
      setQuizInitial({
        countries: savedProfile.countries || [],
        regions: savedProfile.regions || {},
        estates: savedProfile.estates || {},
        varietals: savedProfile.varietals || [],
        specificWines: savedProfile.specific_wines || [],
      });
    }
    setView("quiz");
  };
  const handleRetake = () => { setQuizInitial(null); setView("quiz"); };

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
      const { data } = await supabase.from("wine_profiles").select("*").eq("user_id", user.id).single();
      if (data) {
        setSavedProfile(data);
        setSavedMessage("Profile saved!");
        setTimeout(() => setSavedMessage(null), 3000);
        setView("profile");
      }
    }
  };

  if (loading || view === "loading") {
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
          <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px", borderRadius: "100px", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, boxShadow: "0 4px 20px rgba(27,61,47,0.3)", zIndex: 100 }}>✓ {savedMessage}</div>
        )}
        <Quiz user={user} onProfileGenerated={handleSaveProfile} initialAnswers={quizInitial} onCancel={savedProfile ? () => setView("profile") : null} />
      </div>
    );
  }

  if (view === "profile" && savedProfile) {
    return (
      <div style={{ position: "relative" }}>
        {savedMessage && (
          <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px", borderRadius: "100px", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, boxShadow: "0 4px 20px rgba(27,61,47,0.3)", zIndex: 100 }}>✓ {savedMessage}</div>
        )}
        <SavedProfileView profile={savedProfile} user={user} onRefine={handleRefine} onRetake={handleRetake} onSignOut={handleSignOut} />
      </div>
    );
  }

  return <WelcomeScreen onStart={handleStartQuiz} user={user} onSignOut={handleSignOut} />;
}
