"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import Quiz from "@/components/Quiz";

// ─── Saved Profile View (redesigned) ───
function SavedProfileView({ profile, onRefine, onRetake, onSignOut, user }) {
  const [showProfile, setShowProfile] = useState(false);
  const recs = profile.recommendations || [];
  const statCountries = (profile.countries || []).length;
  const statRegions = Object.values(profile.regions || {}).flat().length;
  const statGrapes = (profile.varietals || []).length;
  const statFavs = Object.values(profile.estates || {}).flat().length + (profile.specific_wines || []).length;
  const displayName = user?.email?.split("@")[0] || "";

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{
        padding: "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: "rgba(245,240,232,0.92)", backdropFilter: "blur(12px)",
        zIndex: 10, borderBottom: "1px solid rgba(27,61,47,0.06)",
      }}>
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px",
          color: "#8B2332", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px",
        }}>
          <img src="/protea-icon.png" alt="" style={{ height: 28, width: "auto" }} />
          Sommeasy
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#1B3D2F", opacity: 0.5,
          }}>{displayName}</span>
          <button onClick={onSignOut} style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F",
            background: "none", border: "1px solid rgba(27,61,47,0.15)", borderRadius: "100px",
            padding: "5px 14px", cursor: "pointer", opacity: 0.5,
          }}>Sign Out</button>
        </div>
      </div>

      {/* ─── Hero: Restaurant CTA ─── */}
      <div style={{ marginTop: 24, marginBottom: 20 }}>
        <a href="/recommend" style={{
          display: "block", textDecoration: "none",
          background: "linear-gradient(145deg, #8B2332 0%, #6B1D2A 100%)",
          borderRadius: "20px", padding: "32px 28px",
          color: "#F5F0E8", position: "relative", overflow: "hidden",
          boxShadow: "0 8px 32px rgba(139,35,50,0.3)",
        }}>
          <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
          <div style={{ position: "absolute", bottom: -30, left: -10, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.5, marginBottom: 10 }}>At a restaurant?</div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", fontWeight: 700, lineHeight: 1.2, marginBottom: 10 }}>Get your picks</div>
            <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", opacity: 0.7, lineHeight: 1.5, maxWidth: 280 }}>Share a wine list and we&#39;ll match it to your DNA</div>
            <div style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.15)", borderRadius: "100px", padding: "10px 24px", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600 }}>
              <span>📋</span> Paste, snap, or link a menu
            </div>
          </div>
        </a>
      </div>

      {/* ─── Compact DNA Strip ─── */}
      <div style={{
        background: "linear-gradient(145deg, #1B3D2F 0%, #2A5540 100%)",
        borderRadius: "16px", padding: "18px 20px",
        color: "#F5F0E8", marginBottom: 20,
        boxShadow: "0 4px 16px rgba(27,61,47,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
            <div style={{ fontSize: "28px", flexShrink: 0 }}>{profile.archetype_emoji}</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", fontWeight: 700, lineHeight: 1.2 }}>{profile.archetype}</div>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", opacity: 0.5, marginTop: 3 }}>
                {statCountries} countries · {statRegions} regions · {statGrapes} grapes · {statFavs} favorites
              </div>
            </div>
          </div>
          <button onClick={onRefine} style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
            color: "#F5F0E8", background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.15)", borderRadius: "100px",
            padding: "6px 16px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500,
          }}>Refine</button>
        </div>
      </div>

      {/* ─── Wines to Try ─── */}
      {recs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", color: "#1B3D2F", fontWeight: 600, margin: 0 }}>Wines to Try</h3>
            <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.4 }}>Based on your DNA</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {recs.map((rec, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.6)", borderRadius: "14px", padding: "16px 18px", border: "1px solid rgba(27,61,47,0.06)", display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: i === 0 ? "linear-gradient(135deg, #8B2332, #6B1D2A)" : "rgba(27,61,47,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: i === 0 ? "#F5F0E8" : "#1B3D2F",
                  fontFamily: "'Playfair Display', serif", fontSize: "13px", fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "15px", color: "#1B3D2F", lineHeight: 1.3, marginBottom: 4 }}>{rec.wine}</div>
                  <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5, lineHeight: 1.4 }}>{rec.why}</div>
                  <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "10px", color: "#8B2332", opacity: 0.6, marginTop: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {rec.matchType === "region + grape" ? "📍 Region + grape match" : rec.matchType === "grape" ? "🍇 Grape match" : "🧭 Discovery pick"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Full Profile (expandable) ─── */}
      <button onClick={() => setShowProfile(!showProfile)} style={{
        width: "100%", padding: "14px 18px", borderRadius: "14px",
        border: "1px solid rgba(27,61,47,0.08)", background: "rgba(255,255,255,0.4)",
        color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif",
        fontSize: "14px", fontWeight: 500, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: showProfile ? 12 : 0,
      }}>
        <span>Full Profile</span>
        <span style={{ transform: showProfile ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", fontSize: "12px", opacity: 0.4 }}>▼</span>
      </button>

      {showProfile && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.4)", borderRadius: "14px", padding: "16px 18px", border: "1px solid rgba(27,61,47,0.06)", marginBottom: 10 }}>
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.7, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>{profile.narrative}</p>
          </div>
          {(profile.red_count > 0 || profile.white_count > 0) && (
            <div style={{ background: "rgba(255,255,255,0.4)", borderRadius: "14px", padding: "14px 18px", border: "1px solid rgba(27,61,47,0.06)", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.4, marginBottom: 8, fontWeight: 600 }}>Red vs White</div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
                <div style={{ flex: profile.red_count || 0.01, background: "#8B2332", borderRadius: "3px 0 0 3px" }} />
                <div style={{ flex: profile.white_count || 0.01, background: "#6B8F5E", borderRadius: "0 3px 3px 0" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", color: "#8B2332", fontWeight: 600 }}>{profile.red_count} red</span>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", color: "#6B8F5E", fontWeight: 600 }}>{profile.white_count} white</span>
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
      <div style={{ textAlign: "center", marginTop: 20, paddingBottom: 40 }}>
        <button onClick={onRetake} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", background: "none", border: "none", cursor: "pointer", opacity: 0.35, textDecoration: "underline" }}>Start fresh &amp; retake quiz</button>
      </div>
    </div>
  );
}

function ProfileTagSection({ label, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10, background: "rgba(255,255,255,0.4)", borderRadius: "14px", padding: "14px 18px", border: "1px solid rgba(27,61,47,0.06)" }}>
      <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.4, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {items.map((item, i) => <span key={i} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "rgba(27,61,47,0.06)", padding: "4px 12px", borderRadius: "100px" }}>{item}</span>)}
      </div>
    </div>
  );
}

// ─── Welcome Screen ───
function WelcomeScreen({ onStart, user, onSignOut }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "40px 24px", textAlign: "center" }}>
      {user && (
        <div style={{ position: "absolute", top: 16, right: 20 }}>
          <button onClick={onSignOut} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "none", border: "1px solid rgba(27,61,47,0.2)", borderRadius: "100px", padding: "6px 16px", cursor: "pointer", opacity: 0.6 }}>Sign Out</button>
        </div>
      )}
      <img src="/protea-icon.png" alt="Sommeasy" style={{
        height: 100, width: "auto", marginBottom: 24,
        filter: "drop-shadow(0 8px 24px rgba(139,35,50,0.2))",
      }} />
      <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(32px, 7vw, 48px)", color: "#8B2332", margin: "0 0 8px 0", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Sommeasy</h1>
      <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 32px 0", opacity: 0.6 }}>Your Wine DNA Profile</p>
      <div style={{ maxWidth: 380, margin: "0 auto 40px" }}>
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "20px", color: "#1B3D2F", lineHeight: 1.5, margin: "0 0 16px 0" }}>You know what you like.</p>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", color: "#1B3D2F", lineHeight: 1.6, margin: 0, opacity: 0.7 }}>
          Tell us about the wines, regions, and grapes you love — as broad or specific as you want — and we&#39;ll build your Wine DNA profile so you never have to guess at a restaurant wine list again.
        </p>
      </div>
      <button onClick={onStart} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", fontWeight: 600, color: "#F5F0E8", background: "#8B2332", border: "none", borderRadius: "100px", padding: "16px 48px", cursor: "pointer", letterSpacing: "0.04em", boxShadow: "0 4px 20px rgba(139,35,50,0.3)" }}>Build My Profile</button>
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
        const { data } = await supabase.from("wine_profiles").select("*").eq("user_id", currentUser.id).single();
        if (data) { setSavedProfile(data); setView("profile"); }
        else { setView("welcome"); }
      } else { setView("welcome"); }
      setLoading(false);
    }
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session?.user) { setSavedProfile(null); setView("welcome"); }
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
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 60, width: "auto", opacity: 0.6 }} />
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
