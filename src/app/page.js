"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import Quiz from "@/components/Quiz";

// ─── Saved Profile View ───
function SavedProfileView({ profile, onRefine, onRetake, onSignOut, user }) {
  const [showProfile, setShowProfile] = useState(false);
  const recs = profile.recommendations || [];
  const statCountries = (profile.countries || []).length;
  const statRegions = Object.values(profile.regions || {}).flat().length;
  const statGrapes = (profile.varietals || []).length;
  const statFavs = Object.values(profile.estates || {}).flat().length + (profile.specific_wines || []).length;
  const displayName = user?.email?.split("@")[0] || "";

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px", minHeight: "100vh" }}>
      {/* ─── Header ─── */}
      <header style={{
        padding: "20px 0 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: "rgba(245,240,232,0.92)", backdropFilter: "blur(16px)",
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/protea-icon.png" alt="" style={{ height: 36, width: "auto" }} />
          <span style={{
            fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px",
            color: "#8B2332", fontWeight: 700, letterSpacing: "-0.01em",
          }}>Sommeasy</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#1B3D2F", opacity: 0.45,
          }}>{displayName}</span>
          <button onClick={onSignOut} style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F",
            background: "none", border: "1px solid rgba(27,61,47,0.12)", borderRadius: "100px",
            padding: "5px 14px", cursor: "pointer", opacity: 0.45, transition: "opacity 0.2s",
          }}>Sign Out</button>
        </div>
      </header>

      {/* ─── Hero: Restaurant CTA ─── */}
      <a href="/recommend" style={{
        display: "block", textDecoration: "none", marginTop: 8, marginBottom: 24,
        background: "linear-gradient(155deg, #8B2332 0%, #7A1E2C 40%, #5C1620 100%)",
        borderRadius: "24px", padding: "36px 32px 32px",
        color: "#F5F0E8", position: "relative", overflow: "hidden",
        boxShadow: "0 12px 40px rgba(139,35,50,0.3), 0 2px 8px rgba(139,35,50,0.15)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}>
        {/* Decorative elements */}
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ position: "absolute", bottom: -40, left: 20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
        <div style={{ position: "absolute", top: 20, right: 40, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.025)" }} />
        <div style={{ position: "relative" }}>
          <div style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
            letterSpacing: "0.22em", textTransform: "uppercase",
            opacity: 0.45, marginBottom: 12, fontWeight: 500,
          }}>At a restaurant?</div>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px",
            fontWeight: 700, lineHeight: 1.15, marginBottom: 12, letterSpacing: "-0.01em",
          }}>Get your picks</div>
          <div style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px",
            opacity: 0.65, lineHeight: 1.55, maxWidth: 300,
          }}>Share a wine list and we&#39;ll match it to your DNA</div>
          <div style={{
            marginTop: 24, display: "inline-flex", alignItems: "center", gap: "10px",
            background: "rgba(255,255,255,0.13)", borderRadius: "100px",
            padding: "11px 26px", fontFamily: "'Source Sans 3', sans-serif",
            fontSize: "14px", fontWeight: 600, letterSpacing: "0.01em",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <span style={{ fontSize: "16px" }}>📋</span> Paste, snap, or link a menu
          </div>
        </div>
      </a>

      {/* ─── DNA Strip ─── */}
      <div style={{
        background: "linear-gradient(155deg, #1B3D2F 0%, #234A38 40%, #1B3D2F 100%)",
        borderRadius: "18px", padding: "20px 24px",
        color: "#F5F0E8", marginBottom: 28,
        boxShadow: "0 6px 24px rgba(27,61,47,0.2), 0 2px 6px rgba(27,61,47,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1 }}>
            <div style={{ fontSize: "32px", flexShrink: 0 }}>{profile.archetype_emoji}</div>
            <div>
              <div style={{
                fontFamily: "'Playfair Display', Georgia, serif", fontSize: "20px",
                fontWeight: 700, lineHeight: 1.2,
              }}>{profile.archetype}</div>
              <div style={{
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                opacity: 0.45, marginTop: 4, letterSpacing: "0.01em",
              }}>
                {statCountries} countries · {statRegions} regions · {statGrapes} grapes · {statFavs} favorites
              </div>
            </div>
          </div>
          <button onClick={onRefine} style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#F5F0E8", background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: "100px",
            padding: "8px 20px", cursor: "pointer", whiteSpace: "nowrap",
            fontWeight: 500, transition: "background 0.2s",
          }}>Refine</button>
        </div>
      </div>

      {/* ─── Wines to Try ─── */}
      {recs.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginBottom: 16, paddingLeft: 2,
          }}>
            <h3 style={{
              fontFamily: "'Playfair Display', Georgia, serif", fontSize: "20px",
              color: "#1B3D2F", fontWeight: 600, margin: 0,
            }}>Wines to Try</h3>
            <span style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
              color: "#1B3D2F", opacity: 0.35, fontWeight: 500,
            }}>Based on your DNA</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {recs.map((rec, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.55)", borderRadius: "16px",
                padding: "18px 20px", border: "1px solid rgba(27,61,47,0.06)",
                display: "flex", alignItems: "flex-start", gap: "16px",
                transition: "background 0.2s",
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: i === 0
                    ? "linear-gradient(135deg, #8B2332, #6B1D2A)"
                    : "rgba(27,61,47,0.07)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: i === 0 ? "#F5F0E8" : "#1B3D2F",
                  fontFamily: "'Playfair Display', serif", fontSize: "13px",
                  fontWeight: 700, flexShrink: 0, marginTop: 1,
                  boxShadow: i === 0 ? "0 2px 8px rgba(139,35,50,0.25)" : "none",
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px",
                    color: "#1B3D2F", lineHeight: 1.35, marginBottom: 5,
                  }}>{rec.wine}</div>
                  <div style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                    color: "#1B3D2F", opacity: 0.5, lineHeight: 1.5,
                  }}>{rec.why}</div>
                  <div style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "10px",
                    color: "#8B2332", opacity: 0.55, marginTop: 8,
                    textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
                  }}>
                    {rec.matchType === "region + grape" ? "📍 Region + grape match"
                      : rec.matchType === "grape" ? "🍇 Grape match"
                      : "🧭 Discovery pick"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Full Profile (expandable) ─── */}
      <button onClick={() => setShowProfile(!showProfile)} style={{
        width: "100%", padding: "16px 20px", borderRadius: "16px",
        border: "1px solid rgba(27,61,47,0.07)", background: "rgba(255,255,255,0.35)",
        color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif",
        fontSize: "14px", fontWeight: 500, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: showProfile ? 14 : 0, transition: "background 0.2s",
      }}>
        <span>Full Profile</span>
        <span style={{
          transform: showProfile ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.25s ease", fontSize: "11px", opacity: 0.35,
        }}>▼</span>
      </button>

      {showProfile && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            background: "rgba(255,255,255,0.4)", borderRadius: "16px",
            padding: "18px 20px", border: "1px solid rgba(27,61,47,0.06)", marginBottom: 10,
          }}>
            <p style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
              color: "#1B3D2F", opacity: 0.65, lineHeight: 1.65, margin: 0,
              fontStyle: "italic",
            }}>{profile.narrative}</p>
          </div>
          {(profile.red_count > 0 || profile.white_count > 0) && (
            <div style={{
              background: "rgba(255,255,255,0.4)", borderRadius: "16px",
              padding: "16px 20px", border: "1px solid rgba(27,61,47,0.06)", marginBottom: 10,
            }}>
              <div style={{
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                textTransform: "uppercase", letterSpacing: "0.12em",
                color: "#1B3D2F", opacity: 0.35, marginBottom: 10, fontWeight: 600,
              }}>Red vs White</div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", gap: 2 }}>
                <div style={{ flex: profile.red_count || 0.01, background: "#8B2332", borderRadius: "3px 0 0 3px" }} />
                <div style={{ flex: profile.white_count || 0.01, background: "#6B8F5E", borderRadius: "0 3px 3px 0" }} />
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
      <div style={{ textAlign: "center", marginTop: 24, paddingBottom: 48 }}>
        <button onClick={onRetake} style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
          color: "#1B3D2F", background: "none", border: "none",
          cursor: "pointer", opacity: 0.3, textDecoration: "underline",
        }}>Start fresh &amp; retake quiz</button>
      </div>
    </div>
  );
}

function ProfileTagSection({ label, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{
      marginBottom: 10, background: "rgba(255,255,255,0.4)", borderRadius: "16px",
      padding: "16px 20px", border: "1px solid rgba(27,61,47,0.06)",
    }}>
      <div style={{
        fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
        textTransform: "uppercase", letterSpacing: "0.12em",
        color: "#1B3D2F", opacity: 0.35, marginBottom: 10, fontWeight: 600,
      }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {items.map((item, i) => (
          <span key={i} style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#1B3D2F", background: "rgba(27,61,47,0.05)",
            padding: "5px 14px", borderRadius: "100px",
          }}>{item}</span>
        ))}
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
            background: "none", border: "1px solid rgba(27,61,47,0.15)", borderRadius: "100px",
            padding: "6px 16px", cursor: "pointer", opacity: 0.5,
          }}>Sign Out</button>
        </div>
      )}
      <img src="/logo.png" alt="Sommeasy" style={{
        height: 200, width: "auto", marginBottom: 32,
        filter: "drop-shadow(0 8px 24px rgba(139,35,50,0.12))",
      }} />
      <div style={{ maxWidth: 400, margin: "0 auto 44px" }}>
        <p style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px",
          color: "#1B3D2F", lineHeight: 1.5, margin: "0 0 16px 0",
        }}>You know what you like.</p>
        <p style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px",
          color: "#1B3D2F", lineHeight: 1.65, margin: 0, opacity: 0.65,
        }}>
          Tell us about the wines, regions, and grapes you love — and we&#39;ll build your
          Wine DNA profile so you never have to guess at a restaurant wine list again.
        </p>
      </div>
      <button onClick={onStart} style={{
        fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", fontWeight: 600,
        color: "#F5F0E8", background: "linear-gradient(135deg, #8B2332, #7A1E2C)",
        border: "none", borderRadius: "100px", padding: "17px 52px",
        cursor: "pointer", letterSpacing: "0.03em",
        boxShadow: "0 6px 24px rgba(139,35,50,0.3), 0 2px 6px rgba(139,35,50,0.15)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}>Build My Profile</button>
      {!user && (
        <p style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px",
          color: "#1B3D2F", opacity: 0.45, marginTop: 24,
        }}>
          Already have an account? <a href="/login" style={{ color: "#8B2332", fontWeight: 600 }}>Sign in</a>
        </p>
      )}
      <p style={{
        fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
        color: "#1B3D2F", opacity: 0.3, marginTop: 12,
      }}>Takes about 2 minutes</p>
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
      user_id: user.id, archetype: profile.archetype, archetype_emoji: profile.archetypeEmoji,
      narrative: profile.narrative, countries: profile.raw.countries, regions: profile.raw.regions,
      estates: profile.raw.estates, varietals: profile.raw.varietals,
      specific_wines: profile.raw.specificWines, recommendations: profile.recommendations,
      red_count: profile.redCount, white_count: profile.whiteCount,
    }, { onConflict: "user_id" });
    if (error) { console.error("Save error:", error); alert("Error saving profile. Please try again."); }
    else {
      const { data } = await supabase.from("wine_profiles").select("*").eq("user_id", user.id).single();
      if (data) { setSavedProfile(data); setSavedMessage("Profile saved!"); setTimeout(() => setSavedMessage(null), 3000); setView("profile"); }
    }
  };

  if (loading || view === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", opacity: 0.4 }}>Sommeasy</div>
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
