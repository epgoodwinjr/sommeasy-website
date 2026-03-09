"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import Quiz from "@/components/Quiz";

// ─── Rating Modal ───
function RatingModal({ wine, onRate, onClose }) {
  const ratings = [
    { id: "loved", emoji: "❤️", label: "Loved it" },
    { id: "liked", emoji: "👍", label: "Liked it" },
    { id: "fine", emoji: "😐", label: "It was fine" },
    { id: "not_for_me", emoji: "👎", label: "Not for me" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(27,61,47,0.4)", backdropFilter: "blur(8px)",
      padding: 24,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#F5F0E8", borderRadius: "24px", padding: "28px 24px",
        maxWidth: 360, width: "100%",
        boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
      }}>
        <div style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
          textTransform: "uppercase", letterSpacing: "0.15em",
          color: "#1B3D2F", opacity: 0.4, marginBottom: 8, fontWeight: 600,
        }}>You&apos;ve had this wine</div>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px",
          color: "#1B3D2F", lineHeight: 1.3, marginBottom: 24,
        }}>{wine}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {ratings.map((r) => (
            <button key={r.id} onClick={() => onRate(r.id)} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 18px", borderRadius: "14px",
              border: "1px solid rgba(27,61,47,0.08)",
              background: "rgba(255,255,255,0.5)",
              cursor: "pointer", transition: "all 0.15s ease",
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
              color: "#1B3D2F", fontWeight: 500, width: "100%", textAlign: "left",
            }}>
              <span style={{ fontSize: "20px" }}>{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{
          marginTop: 16, width: "100%", padding: "10px",
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
          color: "#1B3D2F", opacity: 0.4, background: "none",
          border: "none", cursor: "pointer",
        }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Wine Rec Card with Actions ───
function WineRecCard({ rec, index, onAction, isActioned }) {
  const matchLabel = rec.matchType === "region + grape" ? "📍 Region + grape match"
    : rec.matchType === "grape" ? "🍇 Grape match"
    : rec.matchType === "region" ? "📍 Region match"
    : "🧭 Discovery pick";

  if (isActioned) return null;

  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", borderRadius: "16px",
      padding: "18px 20px", border: "1px solid rgba(27,61,47,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: index === 0
            ? "linear-gradient(135deg, #8B2332, #6B1D2A)"
            : "rgba(27,61,47,0.07)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: index === 0 ? "#F5F0E8" : "#1B3D2F",
          fontFamily: "'Playfair Display', serif", fontSize: "13px",
          fontWeight: 700, flexShrink: 0, marginTop: 1,
          boxShadow: index === 0 ? "0 2px 8px rgba(139,35,50,0.25)" : "none",
        }}>{index + 1}</div>
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
          }}>{matchLabel}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: "flex", gap: "8px", marginTop: 14, paddingTop: 14,
        borderTop: "1px solid rgba(27,61,47,0.06)",
      }}>
        <button onClick={() => onAction(rec.wine, "had")} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          padding: "9px 8px", borderRadius: "10px",
          border: "1px solid rgba(139,35,50,0.12)", background: "rgba(139,35,50,0.04)",
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
          color: "#8B2332", fontWeight: 600, cursor: "pointer",
          transition: "all 0.15s ease",
        }}>🍷 Had it</button>
        <button onClick={() => onAction(rec.wine, "want")} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          padding: "9px 8px", borderRadius: "10px",
          border: "1px solid rgba(27,61,47,0.1)", background: "rgba(27,61,47,0.03)",
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
          color: "#1B3D2F", fontWeight: 500, cursor: "pointer",
          transition: "all 0.15s ease",
        }}>📌 Want to try</button>
        <button onClick={() => onAction(rec.wine, "skip")} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          padding: "9px 8px", borderRadius: "10px",
          border: "1px solid rgba(27,61,47,0.06)", background: "transparent",
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
          color: "#1B3D2F", opacity: 0.4, fontWeight: 500, cursor: "pointer",
          transition: "all 0.15s ease",
        }}>👋 Not for me</button>
      </div>
    </div>
  );
}

// ─── Saved Profile View ───
function SavedProfileView({ profile, onRefine, onRetake, onSignOut, user }) {
  const [showProfile, setShowProfile] = useState(false);
  const [showWines, setShowWines] = useState(true);
  const [interactions, setInteractions] = useState({});
  const [ratingWine, setRatingWine] = useState(null);
  const [toast, setToast] = useState(null);
  // Bottle logging
  const [bottleStep, setBottleStep] = useState(null); // null | "camera" | "processing" | "confirm"
  const [bottleData, setBottleData] = useState(null);
  const [bottleName, setBottleName] = useState("");
  const [bottleError, setBottleError] = useState("");
  const bottleInputRef = useRef(null);
  const supabase = createClient();

  const recs = profile.recommendations || [];
  const statCountries = (profile.countries || []).length;
  const statRegions = Object.values(profile.regions || {}).flat().length;
  const statGrapes = (profile.varietals || []).length;
  const statFavs = Object.values(profile.estates || {}).flat().length + (profile.specific_wines || []).length;
  const displayName = user?.email?.split("@")[0] || "";

  // Load interactions on mount
  useEffect(() => {
    async function loadInteractions() {
      const { data } = await supabase
        .from("wine_interactions")
        .select("wine_name, interaction_type, rating")
        .eq("user_id", user.id);
      if (data) {
        const map = {};
        data.forEach((d) => { map[d.wine_name] = { type: d.interaction_type, rating: d.rating }; });
        setInteractions(map);
      }
    }
    if (user?.id) loadInteractions();
  }, [user?.id]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Save interaction
  const saveInteraction = async (wineName, type, rating) => {
    setInteractions((prev) => ({ ...prev, [wineName]: { type, rating: rating || null } }));

    const { error } = await supabase.from("wine_interactions").upsert({
      user_id: user.id,
      wine_name: wineName,
      interaction_type: type,
      rating: rating || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id, wine_name" });

    if (error) console.error("Interaction save error:", error);

    const labels = { had: "Noted!", want: "Added to your list!", skip: "Removed" };
    showToast(labels[type] || "Saved!");
  };

  const handleAction = (wineName, type) => {
    if (type === "had") {
      setRatingWine(wineName);
    } else {
      saveInteraction(wineName, type);
    }
  };

  const handleRate = (rating) => {
    if (ratingWine) {
      saveInteraction(ratingWine, "had", rating);
      setRatingWine(null);
    }
  };

  // ─── Bottle logging ───
  const handleBottlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBottleStep("processing");
    setBottleError("");

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/ocr-bottle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: reader.result }),
        });
        const data = await res.json();

        if (data.error && !data.wineName) {
          setBottleError(data.error);
          setBottleStep("camera");
          return;
        }

        setBottleData(data);
        setBottleName(data.wineName || "");
        setBottleStep("confirm");
      } catch (err) {
        setBottleError("Failed to process image. Please try again.");
        setBottleStep("camera");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBottleSave = async (rating) => {
    if (!bottleName.trim()) return;
    const name = bottleName.trim();

    // Save to wine_interactions
    await supabase.from("wine_interactions").upsert({
      user_id: user.id,
      wine_name: name,
      interaction_type: "had",
      rating: rating,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id, wine_name" });

    // Also append to specific_wines in profile
    const currentSpecific = profile.specific_wines || [];
    if (!currentSpecific.some((w) => w.toLowerCase() === name.toLowerCase())) {
      await supabase.from("wine_profiles").update({
        specific_wines: [...currentSpecific, name],
      }).eq("user_id", user.id);
    }

    setInteractions((prev) => ({ ...prev, [name]: { type: "had", rating } }));
    setBottleStep(null);
    setBottleData(null);
    setBottleName("");
    showToast("Added to your collection!");
  };

  // Filter recs: exclude wines already interacted with
  const visibleRecs = recs.filter((r) => !interactions[r.wine]);
  const interactedCount = recs.length - visibleRecs.length;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px", minHeight: "100vh" }}>
      {/* Rating modal */}
      {ratingWine && (
        <RatingModal
          wine={ratingWine}
          onRate={handleRate}
          onClose={() => setRatingWine(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px",
          borderRadius: "100px", fontFamily: "'Source Sans 3', sans-serif",
          fontSize: "14px", fontWeight: 600, zIndex: 90,
          boxShadow: "0 4px 20px rgba(27,61,47,0.3)",
        }}>✓ {toast}</div>
      )}

      {/* Header */}
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
            padding: "5px 14px", cursor: "pointer", opacity: 0.45,
          }}>Sign Out</button>
        </div>
      </header>

      {/* Hero: Restaurant CTA */}
      <a href="/recommend" style={{
        display: "block", textDecoration: "none", marginTop: 8, marginBottom: 24,
        background: "linear-gradient(155deg, #8B2332 0%, #7A1E2C 40%, #5C1620 100%)",
        borderRadius: "24px", padding: "36px 32px 32px",
        color: "#F5F0E8", position: "relative", overflow: "hidden",
        boxShadow: "0 12px 40px rgba(139,35,50,0.3), 0 2px 8px rgba(139,35,50,0.15)",
      }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ position: "absolute", bottom: -40, left: 20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.45, marginBottom: 12, fontWeight: 500 }}>At a restaurant?</div>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px", fontWeight: 700, lineHeight: 1.15, marginBottom: 12, letterSpacing: "-0.01em" }}>Get your picks</div>
          <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", opacity: 0.65, lineHeight: 1.55, maxWidth: 300 }}>Share a wine list and we&#39;ll match it to your DNA</div>
          <div style={{ marginTop: 24, display: "inline-flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.13)", borderRadius: "100px", padding: "11px 26px", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: "16px" }}>📋</span> Paste, snap, or link a menu
          </div>
        </div>
      </a>

      {/* ─── Log a Bottle ─── */}
      <input
        ref={bottleInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleBottlePhoto}
        style={{ display: "none" }}
      />

      {bottleStep === null && (
        <button onClick={() => { setBottleStep("camera"); bottleInputRef.current?.click(); }} style={{
          width: "100%", display: "flex", alignItems: "center", gap: "16px",
          padding: "18px 24px", borderRadius: "18px", marginBottom: 24,
          border: "1px solid rgba(27,61,47,0.08)", background: "rgba(255,255,255,0.5)",
          cursor: "pointer", textAlign: "left", transition: "all 0.15s ease",
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: "12px",
            background: "linear-gradient(135deg, rgba(139,35,50,0.08), rgba(139,35,50,0.04))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", flexShrink: 0,
          }}>📸</div>
          <div>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px",
              color: "#1B3D2F", fontWeight: 600, lineHeight: 1.3,
            }}>Log a Bottle</div>
            <div style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
              color: "#1B3D2F", opacity: 0.45, lineHeight: 1.4, marginTop: 2,
            }}>Snap a label to add it to your collection</div>
          </div>
        </button>
      )}

      {bottleStep === "processing" && (
        <div style={{
          padding: "32px 24px", borderRadius: "18px", marginBottom: 24,
          border: "1px solid rgba(27,61,47,0.08)", background: "rgba(255,255,255,0.5)",
          textAlign: "center",
        }}>
          <div style={{
            width: 32, height: 32, border: "3px solid rgba(139,35,50,0.15)",
            borderTopColor: "#8B2332", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
            color: "#8B2332", fontWeight: 600, margin: "0 0 4px",
          }}>Reading the label...</p>
          <p style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
            color: "#1B3D2F", opacity: 0.4, margin: 0,
          }}>This may take a few seconds</p>
        </div>
      )}

      {bottleStep === "camera" && (
        <div style={{
          padding: "24px", borderRadius: "18px", marginBottom: 24,
          border: "1px solid rgba(27,61,47,0.08)", background: "rgba(255,255,255,0.5)",
        }}>
          {bottleError && (
            <div style={{
              padding: "12px 16px", borderRadius: "12px", marginBottom: 16,
              background: "rgba(139,35,50,0.06)", border: "1px solid rgba(139,35,50,0.12)",
            }}>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332", margin: 0, lineHeight: 1.4 }}>{bottleError}</p>
            </div>
          )}
          <button onClick={() => bottleInputRef.current?.click()} style={{
            width: "100%", padding: "16px", borderRadius: "14px",
            border: "1px solid rgba(139,35,50,0.12)", background: "rgba(139,35,50,0.03)",
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px",
            color: "#8B2332", fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>📸 Take another photo</button>
          <button onClick={() => { setBottleStep(null); setBottleError(""); }} style={{
            width: "100%", padding: "10px", marginTop: 8,
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#1B3D2F", opacity: 0.4, background: "none",
            border: "none", cursor: "pointer",
          }}>Cancel</button>
        </div>
      )}

      {bottleStep === "confirm" && (
        <div style={{
          padding: "24px", borderRadius: "18px", marginBottom: 24,
          border: "1px solid rgba(27,61,47,0.08)", background: "rgba(255,255,255,0.6)",
        }}>
          <div style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
            textTransform: "uppercase", letterSpacing: "0.15em",
            color: "#1B3D2F", opacity: 0.4, marginBottom: 12, fontWeight: 600,
          }}>We detected this wine</div>
          <input
            type="text"
            value={bottleName}
            onChange={(e) => setBottleName(e.target.value)}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: "12px",
              border: "1px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.7)",
              fontFamily: "'Playfair Display', Georgia, serif", fontSize: "17px",
              color: "#1B3D2F", outline: "none", boxSizing: "border-box",
              marginBottom: 6,
            }}
          />
          {bottleData?.region && (
            <p style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
              color: "#1B3D2F", opacity: 0.5, margin: "0 0 16px 4px",
            }}>📍 {bottleData.region}{bottleData.vintage ? ` · ${bottleData.vintage}` : ""}</p>
          )}
          <div style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#1B3D2F", opacity: 0.5, marginBottom: 12,
          }}>How was it?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { id: "loved", emoji: "❤️", label: "Loved it" },
              { id: "liked", emoji: "👍", label: "Liked it" },
              { id: "fine", emoji: "😐", label: "It was fine" },
              { id: "not_for_me", emoji: "👎", label: "Not for me" },
            ].map((r) => (
              <button key={r.id} onClick={() => handleBottleSave(r.id)} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "12px 16px", borderRadius: "12px",
                border: "1px solid rgba(27,61,47,0.08)",
                background: "rgba(255,255,255,0.5)", cursor: "pointer",
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px",
                color: "#1B3D2F", fontWeight: 500, width: "100%", textAlign: "left",
              }}>
                <span style={{ fontSize: "18px" }}>{r.emoji}</span> {r.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: 12 }}>
            <button onClick={() => { setBottleStep("camera"); bottleInputRef.current?.click(); }} style={{
              flex: 1, padding: "10px", fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
              color: "#8B2332", background: "none", border: "1px solid rgba(139,35,50,0.12)",
              borderRadius: "10px", cursor: "pointer",
            }}>Retake photo</button>
            <button onClick={() => { setBottleStep(null); setBottleData(null); setBottleName(""); }} style={{
              flex: 1, padding: "10px", fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
              color: "#1B3D2F", opacity: 0.4, background: "none", border: "1px solid rgba(27,61,47,0.06)",
              borderRadius: "10px", cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* DNA Strip */}
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
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "20px", fontWeight: 700, lineHeight: 1.2 }}>{profile.archetype}</div>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", opacity: 0.45, marginTop: 4 }}>
                {statCountries} countries · {statRegions} regions · {statGrapes} grapes · {statFavs} favorites
              </div>
            </div>
          </div>
          <button onClick={onRefine} style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#F5F0E8", background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: "100px",
            padding: "8px 20px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500,
          }}>Refine</button>
        </div>
      </div>

      {/* ─── Wines to Try (Interactive) ─── */}
      {recs.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <button onClick={() => setShowWines(!showWines)} style={{
            width: "100%", display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginBottom: showWines ? 14 : 0, padding: "0 2px",
            background: "none", border: "none", cursor: "pointer", textAlign: "left",
          }}>
            <h3 style={{
              fontFamily: "'Playfair Display', Georgia, serif", fontSize: "20px",
              color: "#1B3D2F", fontWeight: 600, margin: 0,
            }}>Wines to Try</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {interactedCount > 0 && (
                <span style={{
                  fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                  color: "#8B2332", opacity: 0.6, fontWeight: 600,
                }}>{interactedCount} reviewed</span>
              )}
              <span style={{
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                color: "#1B3D2F", opacity: 0.35, fontWeight: 500,
                transform: showWines ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.25s ease", display: "inline-block",
              }}>▼</span>
            </div>
          </button>

          {showWines && (
            <>
              {visibleRecs.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {visibleRecs.slice(0, 5).map((rec, i) => (
                    <WineRecCard
                      key={rec.wine}
                      rec={rec}
                      index={i}
                      onAction={handleAction}
                      isActioned={false}
                    />
                  ))}
                </div>
              ) : (
                <div style={{
                  textAlign: "center", padding: "32px 20px",
                  background: "rgba(255,255,255,0.4)", borderRadius: "16px",
                  border: "1px solid rgba(27,61,47,0.06)",
                }}>
                  <div style={{ fontSize: "32px", marginBottom: 12 }}>🎉</div>
                  <div style={{
                    fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px",
                    color: "#1B3D2F", marginBottom: 8,
                  }}>You&apos;ve reviewed all your wines!</div>
                  <p style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px",
                    color: "#1B3D2F", opacity: 0.5, lineHeight: 1.5, maxWidth: 300,
                    margin: "0 auto 16px",
                  }}>Refine your profile to discover more personalized recommendations.</p>
                  <button onClick={onRefine} style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px",
                    fontWeight: 600, color: "#F5F0E8",
                    background: "linear-gradient(135deg, #8B2332, #7A1E2C)",
                    border: "none", borderRadius: "100px", padding: "12px 32px",
                    cursor: "pointer", boxShadow: "0 4px 16px rgba(139,35,50,0.2)",
                  }}>Refine My Profile</button>
                </div>
              )}

              {visibleRecs.length > 5 && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <span style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                    color: "#1B3D2F", opacity: 0.35,
                  }}>{visibleRecs.length - 5} more wines to explore</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Journal link */}
      {recs.length > 0 && Object.keys(interactions).length > 0 && (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <a href="/journal" style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#8B2332", fontWeight: 600, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "10px 20px", borderRadius: "100px",
            border: "1px solid rgba(139,35,50,0.12)",
            background: "rgba(139,35,50,0.03)",
            transition: "all 0.15s ease",
          }}>🍷 Wine Journal →</a>
        </div>
      )}

      {/* Full Profile (expandable) */}
      <button onClick={() => setShowProfile(!showProfile)} style={{
        width: "100%", padding: "16px 20px", borderRadius: "16px",
        border: "1px solid rgba(27,61,47,0.07)", background: "rgba(255,255,255,0.35)",
        color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif",
        fontSize: "14px", fontWeight: 500, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: showProfile ? 14 : 0,
      }}>
        <span>Full Profile</span>
        <span style={{ transform: showProfile ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease", fontSize: "11px", opacity: 0.35 }}>▼</span>
      </button>

      {showProfile && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: "rgba(255,255,255,0.4)", borderRadius: "16px", padding: "18px 20px", border: "1px solid rgba(27,61,47,0.06)", marginBottom: 10 }}>
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.65, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>{profile.narrative}</p>
          </div>
          {(profile.red_count > 0 || profile.white_count > 0) && (
            <div style={{ background: "rgba(255,255,255,0.4)", borderRadius: "16px", padding: "16px 20px", border: "1px solid rgba(27,61,47,0.06)", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.35, marginBottom: 10, fontWeight: 600 }}>Red vs White</div>
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
        <button onClick={onRetake} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", background: "none", border: "none", cursor: "pointer", opacity: 0.3, textDecoration: "underline" }}>Start fresh &amp; retake quiz</button>
      </div>
    </div>
  );
}

function ProfileTagSection({ label, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10, background: "rgba(255,255,255,0.4)", borderRadius: "16px", padding: "16px 20px", border: "1px solid rgba(27,61,47,0.06)" }}>
      <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.35, marginBottom: 10, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {items.map((item, i) => <span key={i} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "rgba(27,61,47,0.05)", padding: "5px 14px", borderRadius: "100px" }}>{item}</span>)}
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
          <button onClick={onSignOut} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "none", border: "1px solid rgba(27,61,47,0.15)", borderRadius: "100px", padding: "6px 16px", cursor: "pointer", opacity: 0.5 }}>Sign Out</button>
        </div>
      )}
      <img src="/logo.png" alt="Sommeasy" style={{ height: 200, width: "auto", marginBottom: 32, filter: "drop-shadow(0 8px 24px rgba(139,35,50,0.12))" }} />
      <div style={{ maxWidth: 400, margin: "0 auto 44px" }}>
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#1B3D2F", lineHeight: 1.5, margin: "0 0 16px 0" }}>You know what you like.</p>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", color: "#1B3D2F", lineHeight: 1.65, margin: 0, opacity: 0.65 }}>
          Tell us about the wines, regions, and grapes you love — and we&#39;ll build your Wine DNA profile so you never have to guess at a restaurant wine list again.
        </p>
      </div>
      <button onClick={onStart} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", fontWeight: 600, color: "#F5F0E8", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", border: "none", borderRadius: "100px", padding: "17px 52px", cursor: "pointer", letterSpacing: "0.03em", boxShadow: "0 6px 24px rgba(139,35,50,0.3), 0 2px 6px rgba(139,35,50,0.15)" }}>Build My Profile</button>
      {!user && (
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.45, marginTop: 24 }}>
          Already have an account? <a href="/login" style={{ color: "#8B2332", fontWeight: 600 }}>Sign in</a>
        </p>
      )}
      <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.3, marginTop: 12 }}>Takes about 2 minutes</p>
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
        countries: savedProfile.countries || [], regions: savedProfile.regions || {},
        estates: savedProfile.estates || {}, varietals: savedProfile.varietals || [],
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
