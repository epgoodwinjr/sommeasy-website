"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { compressImage } from "@/lib/image-utils";
import { resolveAndAccumulate, syncQuizSelections, mergeQuizWithEarnedDna, reconcileQuizPromotions } from "@/lib/dnaEvolution";
import { generateDNAProfile } from "@/lib/profileEngine";
import { formatWineName } from "@/lib/matchEngine";
import { signatureLine } from "@/lib/palateSignature";
import Quiz from "@/components/Quiz";
import WineRecList, { evolutionToastMessages } from "@/components/WineRecList";

// ─── Saved Profile View ───
function SavedProfileView({ profile, onRefine, onSignOut, user }) {
  const [showWines, setShowWines] = useState(true);
  // Rec interactions live inside WineRecList (the shared ratable surface);
  // this view only needs the counts it reports back
  const [recCounts, setRecCounts] = useState(null);
  const [hasJournal, setHasJournal] = useState(false);
  const [toast, setToast] = useState(null);
  const [evolutionToasts, setEvolutionToasts] = useState([]);
  // Bottle logging
  const [bottleStep, setBottleStep] = useState(null); // null | "camera" | "processing" | "confirm"
  const [bottleData, setBottleData] = useState(null);
  const [bottleName, setBottleName] = useState("");
  const [bottleError, setBottleError] = useState("");
  const bottleInputRef = useRef(null);
  const bottleGalleryRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const supabase = createClient();

  const recs = profile.recommendations || [];
  const displayName = user?.email?.split("@")[0] || "";
  const [whisper, setWhisper] = useState(null);
  const palateLine = signatureLine(profile);

  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    // A whisper of recent evolution on the strip ("Chenin Blanc just joined
    // your DNA") — only when something actually promoted in the last 30 days
    async function loadWhisper() {
      const { data } = await supabase
        .from("dna_timeline")
        .select("display_name, event_at")
        .eq("user_id", user.id)
        .eq("event_type", "promoted")
        .order("event_at", { ascending: false })
        .limit(1);
      const latest = data?.[0];
      if (latest && Date.now() - new Date(latest.event_at).getTime() < 30 * 24 * 60 * 60 * 1000) {
        setWhisper(`${latest.display_name} just joined your DNA`);
      }
    }
    if (user?.id) { loadWhisper(); }
  }, [user?.id]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleRecCounts = useCallback(({ interactedRecs, visibleRecs, hasAnyInteractions }) => {
    setRecCounts({ interactedRecs, visibleRecs });
    if (hasAnyInteractions) setHasJournal(true);
  }, []);

  // ─── Bottle logging (Claude Vision via /api/scan-label) ───
  const handleBottlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file
    setBottleStep("processing");
    setBottleError("");

    try {
      const blob = await compressImage(file);

      const formData = new FormData();
      formData.append("image", blob, "label.jpg");

      const res = await fetch("/api/scan-label", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setBottleError(data.error || "Couldn't read the label. Try a clearer photo.");
        setBottleStep("camera");
        return;
      }

      // Build display name: producer + name, or whichever is available
      const displayName = [data.producer, data.name].filter(Boolean).join(" ") || null;

      if (!displayName || displayName.length < 2) {
        setBottleError("Couldn't make out the wine name. Try a clearer photo.");
        setBottleStep("camera");
        return;
      }

      setBottleData({
        wineName: displayName,
        vintage: data.vintage ? String(data.vintage) : null,
        region: data.region || null,
        country: data.country || null,
        confidence: data.confidence || "low",
      });
      setBottleName(displayName);
      setBottleStep("confirm");
    } catch (err) {
      setBottleError("Failed to process image. Please try again.");
      setBottleStep("camera");
    }
  };

  const showEvolutionToasts = useCallback((promotions) => {
    if (!promotions || promotions.length === 0) return;
    const toasts = evolutionToastMessages(promotions);
    // Show sequentially with 1s gaps, starting after the standard toast
    toasts.forEach((msg, i) => {
      setTimeout(() => {
        setEvolutionToasts((prev) => [...prev, msg]);
        setTimeout(() => {
          setEvolutionToasts((prev) => prev.filter((t) => t !== msg));
        }, 4000);
      }, 1500 + (i * 1500));
    });
  }, []);

  const handleBottleSave = async (rating) => {
    if (!bottleName.trim()) return;
    const name = bottleName.trim();

    try {
      // 1. Save to wine_interactions
      const { error: upsertErr } = await supabase.from("wine_interactions").upsert({
        user_id: user.id,
        wine_name: name,
        interaction_type: "had",
        rating: rating,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id, wine_name" });

      if (upsertErr) throw upsertErr;

      // 2. DNA Evolution: resolve metadata, accumulate points, check promotions
      let evolutionResult = null;
      try {
        evolutionResult = await resolveAndAccumulate(supabase, user.id, name, rating);
      } catch (evoErr) {
        console.error("DNA evolution error (non-blocking):", evoErr);
      }

      // 3. Update specific_wines based on rating (existing logic)
      const currentSpecific = profile.specific_wines || [];
      const nameLower = name.toLowerCase();

      if (rating === "loved" || rating === "liked") {
        if (!currentSpecific.some((w) => w.toLowerCase() === nameLower)) {
          const { error: updateErr } = await supabase.from("wine_profiles").update({
            specific_wines: [...currentSpecific, name],
          }).eq("user_id", user.id);
          if (updateErr) console.error("Profile update failed:", updateErr);
        }
      } else if (rating === "not_for_me") {
        const filtered = currentSpecific.filter((w) => w.toLowerCase() !== nameLower);
        if (filtered.length !== currentSpecific.length) {
          const { error: updateErr } = await supabase.from("wine_profiles").update({
            specific_wines: filtered,
          }).eq("user_id", user.id);
          if (updateErr) console.error("Profile update failed:", updateErr);
        }
      }

      setHasJournal(true);
      setBottleStep(null);
      setBottleData(null);
      setBottleName("");

      // 4. Show standard toast
      showToast("Added to your collection!");

      // 5. Show evolution toasts if any promotions fired
      if (evolutionResult?.promotions?.length > 0) {
        showEvolutionToasts(evolutionResult.promotions);
      }
    } catch (err) {
      console.error("Bottle save failed:", err);
      setBottleError("Couldn't save — please try again.");
    }
  };

  const interactedCount = recCounts?.interactedRecs || 0;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px", minHeight: "100vh" }}>
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

      {/* Evolution toasts */}
      {evolutionToasts.map((msg, i) => (
        <div key={msg} style={{
          position: "fixed", top: toast ? 56 + (i * 44) : 16 + (i * 44),
          left: "50%", transform: "translateX(-50%)",
          background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px",
          borderRadius: "100px", fontFamily: "'Source Sans 3', sans-serif",
          fontSize: "14px", fontWeight: 600, zIndex: 91,
          boxShadow: "0 4px 20px rgba(27,61,47,0.3)",
          whiteSpace: "nowrap",
        }}>{msg}</div>
      ))}

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
      {/* Camera input — opens rear camera directly on mobile */}
      <input ref={bottleInputRef} type="file" accept="image/*" capture="environment" onChange={handleBottlePhoto} style={{ display: "none" }} data-testid="bottle-camera-input" />
      {/* Gallery/upload input — opens photo picker or file dialog */}
      <input ref={bottleGalleryRef} type="file" accept="image/*" onChange={handleBottlePhoto} style={{ display: "none" }} data-testid="bottle-gallery-input" />

      {bottleStep === null && (
        <div style={{ marginBottom: 24 }}>
          {/* Collapsed header row */}
          <div style={{
            display: "flex", alignItems: "center", gap: "16px",
            padding: "18px 24px", borderRadius: isMobile ? "18px 18px 0 0" : "18px",
            border: "1px solid rgba(27,61,47,0.08)",
            borderBottom: isMobile ? "none" : "1px solid rgba(27,61,47,0.08)",
            background: "rgba(255,255,255,0.5)",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(139,35,50,0.08), rgba(139,35,50,0.04))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "22px", flexShrink: 0,
            }}>📸</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px", color: "#1B3D2F", fontWeight: 600, lineHeight: 1.3 }}>Log a Bottle</div>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.45, lineHeight: 1.4, marginTop: 2 }}>Photo a label to add it to your collection</div>
            </div>
          </div>
          {/* Action buttons */}
          <div style={{ display: "flex", gap: "1px" }}>
            {isMobile && (
              <button onClick={() => { setBottleStep("camera"); bottleInputRef.current?.click(); }} style={{
                flex: 1, padding: "13px 8px", borderRadius: "0 0 0 18px",
                border: "1px solid rgba(27,61,47,0.08)", borderTop: "none",
                background: "rgba(139,35,50,0.04)", cursor: "pointer",
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                color: "#8B2332", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}>📷 Take Photo</button>
            )}
            <button onClick={() => { setBottleStep("camera"); bottleGalleryRef.current?.click(); }} style={{
              flex: 1, padding: "13px 8px",
              borderRadius: isMobile ? "0 0 18px 0" : "0 0 18px 18px",
              border: "1px solid rgba(27,61,47,0.08)", borderTop: "none",
              background: "rgba(255,255,255,0.4)", cursor: "pointer",
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
              color: "#1B3D2F", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}>{isMobile ? "🖼 Choose Photo" : "⬆️ Upload Photo"}</button>
          </div>
        </div>
      )}

      {bottleStep === "processing" && (
        <div data-testid="bottle-processing" style={{
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
          }}>May take up to 30 seconds on first use</p>
        </div>
      )}

      {bottleStep === "camera" && (
        <div style={{
          padding: "24px", borderRadius: "18px", marginBottom: 24,
          border: "1px solid rgba(27,61,47,0.08)", background: "rgba(255,255,255,0.5)",
        }}>
          {bottleError && (
            <div data-testid="bottle-error" style={{
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
        <div data-testid="bottle-confirm" style={{
          padding: "24px", borderRadius: "18px", marginBottom: 24,
          border: "1px solid rgba(27,61,47,0.08)", background: "rgba(255,255,255,0.6)",
        }}>
          <div style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
            textTransform: "uppercase", letterSpacing: "0.15em",
            color: "#1B3D2F", opacity: 0.4, marginBottom: 12, fontWeight: 600,
          }}>We detected this wine</div>
          <textarea
            data-testid="bottle-wine-name"
            value={bottleName}
            onChange={(e) => {
              setBottleName(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            rows={1}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: "12px",
              border: "1px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.7)",
              fontFamily: "'Playfair Display', Georgia, serif", fontSize: "17px",
              color: "#1B3D2F", outline: "none", boxSizing: "border-box",
              marginBottom: 6, resize: "none", overflow: "hidden",
              lineHeight: 1.4, minHeight: "50px",
            }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }
            }}
          />
          {(bottleData?.region || bottleData?.country || bottleData?.vintage) && (
            <p style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
              color: "#1B3D2F", opacity: 0.5, margin: "0 0 16px 4px",
            }}>📍 {[bottleData.region, bottleData.country].filter(Boolean).join(", ")}{bottleData.vintage ? ` · ${bottleData.vintage}` : ""}</p>
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

      {/* DNA Strip — the door to the Palate view, not a dead end */}
      <a href="/palate" data-testid="palate-strip" style={{
        display: "block", textDecoration: "none",
        background: "linear-gradient(155deg, #1B3D2F 0%, #234A38 40%, #1B3D2F 100%)",
        borderRadius: "18px", padding: "20px 24px",
        color: "#F5F0E8", marginBottom: 28,
        boxShadow: "0 6px 24px rgba(27,61,47,0.2), 0 2px 6px rgba(27,61,47,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "32px", flexShrink: 0 }}>{profile.archetype_emoji}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "20px", fontWeight: 700, lineHeight: 1.2 }}>{profile.archetype}</div>
              {palateLine && (
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "13px", fontStyle: "italic", opacity: 0.6, marginTop: 4 }}>
                  {palateLine}
                </div>
              )}
              {whisper && (
                <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#C9DAC4", marginTop: 6, fontWeight: 600 }}>
                  🧬 {whisper}
                </div>
              )}
            </div>
          </div>
          <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "22px", opacity: 0.5, flexShrink: 0 }}>›</span>
        </div>
      </a>

      {/* ─── Wines to Try (Interactive) ─── */}
      {recs.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <button onClick={() => setShowWines(!showWines)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: showWines ? 14 : 0, padding: "12px 2px",
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
            <WineRecList
              recs={recs}
              user={user}
              limit={5}
              onCountsChange={handleRecCounts}
              emptyState={
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
                  }}>Your best picks now come from real menus — share a wine list and we&apos;ll match it to your palate.</p>
                  <a href="/recommend" style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px",
                    fontWeight: 600, color: "#F5F0E8", textDecoration: "none",
                    display: "inline-block",
                    background: "linear-gradient(135deg, #8B2332, #7A1E2C)",
                    border: "none", borderRadius: "100px", padding: "12px 32px",
                    cursor: "pointer", boxShadow: "0 4px 16px rgba(139,35,50,0.2)",
                  }}>Scan a Wine List</a>
                  <div style={{ marginTop: 10 }}>
                    <button onClick={onRefine} style={{
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                      color: "#1B3D2F", opacity: 0.35, background: "none", border: "none",
                      cursor: "pointer", textDecoration: "underline", padding: "10px 12px",
                    }}>or adjust your quiz answers</button>
                  </div>
                </div>
              }
            />
          )}
        </div>
      )}

      {/* Journal link */}
      {hasJournal && (
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

      {/* The full palate lives at /palate now — the strip above is the door */}
      <div style={{ paddingBottom: 48 }} />
    </div>
  );
}

// ─── Welcome Screen ───
function WelcomeScreen({ onStart, user, onSignOut }) {
  const steps = [
    {
      n: "1",
      title: "Build your Wine DNA",
      body: "A 2-minute quiz about the wines, regions, and grapes you love.",
    },
    {
      n: "2",
      title: "Share the wine list",
      body: "Paste it, snap a photo, or drop in a URL from the restaurant's site.",
    },
    {
      n: "3",
      title: "Get your picks",
      body: "We match what's on the menu to your taste and surface your best options.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", padding: "48px 24px 56px", textAlign: "center" }}>
      {user && (
        <div style={{ position: "absolute", top: 16, right: 20 }}>
          <button onClick={onSignOut} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "none", border: "1px solid rgba(27,61,47,0.15)", borderRadius: "100px", padding: "6px 16px", cursor: "pointer", opacity: 0.5 }}>Sign Out</button>
        </div>
      )}

      {/* Logo */}
      <img src="/logo.png" alt="Sommeasy" style={{ height: 200, width: "auto", marginBottom: 32, filter: "drop-shadow(0 8px 24px rgba(139,35,50,0.12))" }} />

      {/* Hero copy */}
      <div style={{ maxWidth: 380, margin: "0 auto 40px" }}>
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", color: "#1B3D2F", lineHeight: 1.35, margin: "0 0 14px 0", letterSpacing: "-0.01em" }}>
          Never guess at a wine list again.
        </p>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", color: "#1B3D2F", lineHeight: 1.65, margin: 0, opacity: 0.65 }}>
          Tell us what you like. We&apos;ll find it on the menu.
        </p>
      </div>

      {/* CTA */}
      <button onClick={onStart} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", fontWeight: 600, color: "#F5F0E8", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", border: "none", borderRadius: "100px", padding: "17px 52px", cursor: "pointer", letterSpacing: "0.03em", boxShadow: "0 6px 24px rgba(139,35,50,0.3), 0 2px 6px rgba(139,35,50,0.15)" }}>Build My Profile</button>

      {!user && (
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.45, marginTop: 20 }}>
          Already have an account? <a href="/login" style={{ color: "#8B2332", fontWeight: 600 }}>Sign in</a>
        </p>
      )}
      <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.3, marginTop: 10, marginBottom: 48 }}>Takes about 2 minutes</p>

      {/* How it works */}
      <div style={{ width: "100%", maxWidth: 420, textAlign: "left" }}>
        <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.18em", color: "#1B3D2F", opacity: 0.35, fontWeight: 600, textAlign: "center", marginBottom: 20 }}>How it works</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {steps.map((s) => (
            <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: "16px", background: "rgba(255,255,255,0.5)", borderRadius: "16px", padding: "18px 20px", border: "1px solid rgba(27,61,47,0.06)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5F0E8", fontFamily: "'Playfair Display', serif", fontSize: "13px", fontWeight: 700, flexShrink: 0, marginTop: 1, boxShadow: "0 2px 8px rgba(139,35,50,0.25)" }}>{s.n}</div>
              <div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px", color: "#1B3D2F", fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.55, lineHeight: 1.5 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
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
  // "refine" merges quiz answers with earned DNA on save; "fresh" is the one
  // deliberate wipe (and the mode for a first-ever quiz)
  const [quizMode, setQuizMode] = useState("fresh");
  // "dimension:value" keys of earned-promoted DNA, so refine chips can wear
  // the ✦ and the user knows what an uncheck removes
  const [quizEarned, setQuizEarned] = useState([]);
  const supabase = createClient();

  const fetchEarnedDna = async (userId) => {
    const { data } = await supabase
      .from("dna_accumulation")
      .select("dimension, dimension_value")
      .eq("user_id", userId)
      .eq("promoted", true)
      .eq("source", "auto");
    return (data || []).map((r) => `${r.dimension}:${r.dimension_value}`);
  };

  // StrictMode (dev) runs the mount effect twice. init() must run exactly
  // once: its async continuation calls setView, and a late second run would
  // clobber navigation the user made in between (click "Build My Profile" →
  // quiz view → stale init lands → welcome view). The auth subscription
  // below stays per-mount — its cleanup handles the double-mount correctly.
  const initRan = useRef(false);

  useEffect(() => {
    // Quiet quiz entry points from the Palate view (?quiz=refine|fresh).
    // Read from location directly — useSearchParams would force a Suspense
    // boundary on this statically prerendered page.
    const quizParam = new URLSearchParams(window.location.search).get("quiz");
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        const { data } = await supabase.from("wine_profiles").select("*").eq("user_id", currentUser.id).single();
        if (data) { setSavedProfile(data); setView("profile"); }
        else { setView("welcome"); }
        if (quizParam === "fresh") {
          setQuizInitial(null);
          setQuizMode("fresh");
          setView("quiz");
        } else if (quizParam === "refine" && data) {
          setQuizInitial({
            countries: data.countries || [], regions: data.regions || {},
            estates: data.estates || {}, varietals: data.varietals || [],
            specificWines: data.specific_wines || [],
          });
          setQuizMode("refine");
          setView("quiz");
          fetchEarnedDna(currentUser.id).then(setQuizEarned).catch(() => {});
        }
        if (quizParam) window.history.replaceState({}, "", "/");
      } else { setView("welcome"); }
      setLoading(false);
    }
    if (!initRan.current) {
      initRan.current = true;
      init();
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session?.user) { setSavedProfile(null); setView("welcome"); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => { await supabase.auth.signOut(); setSavedProfile(null); setView("welcome"); };
  const handleStartQuiz = () => { setQuizInitial(null); setQuizMode("fresh"); setView("quiz"); };
  const handleRefine = () => {
    if (savedProfile) {
      setQuizInitial({
        countries: savedProfile.countries || [], regions: savedProfile.regions || {},
        estates: savedProfile.estates || {}, varietals: savedProfile.varietals || [],
        specificWines: savedProfile.specific_wines || [],
      });
      if (user) fetchEarnedDna(user.id).then(setQuizEarned).catch(() => {});
    }
    setQuizMode(savedProfile ? "refine" : "fresh");
    setView("quiz");
  };

  // Auto-save on quiz completion. Returns the saved wine_profiles row (the
  // reveal renders it) or null on failure (the reveal offers a retry).
  //
  // MERGE, DON'T CLOBBER: on refine, the arrays written are quiz selections
  // ∪ earned-promoted DNA — a retaken quiz never erases what real bottles
  // proved. "Start fresh" is the one deliberate wipe. Journal data
  // (wine_interactions, accumulation points, timeline) is never touched by
  // quiz edits. The narrative regenerates from the merged palate so it always
  // reflects the new founding DNA; narrative_updated_at is left alone so The
  // Somm re-evolves it on the next /palate visit under the usual staleness
  // gate.
  const handleSaveProfile = async (profile) => {
    if (!user) return null;
    try {
      const quizRaw = {
        ...profile.raw,
        // Fix casing at the source ("Meerlust rubicon" → "Meerlust Rubicon")
        specificWines: (profile.raw.specificWines || []).map(formatWineName),
      };
      // initialRaw (the answers the refine was seeded with) lets the merge
      // honor explicit deselections of earned items — Ed's August 2026 call
      const merged = quizMode === "refine"
        ? await mergeQuizWithEarnedDna(supabase, user.id, quizRaw, quizInitial)
        : quizRaw;
      const finalProfile = generateDNAProfile(merged);

      const { error } = await supabase.from("wine_profiles").upsert({
        user_id: user.id,
        archetype: finalProfile.archetype,
        archetype_emoji: finalProfile.archetypeEmoji,
        narrative: finalProfile.narrative,
        countries: merged.countries,
        regions: merged.regions,
        estates: merged.estates,
        varietals: merged.varietals,
        specific_wines: merged.specificWines,
        recommendations: finalProfile.recommendations,
        red_count: finalProfile.redCount,
        white_count: finalProfile.whiteCount,
      }, { onConflict: "user_id" });
      if (error) { console.error("Save error:", error); return null; }

      try {
        // Un-flag promoted accumulation rows no longer in the DNA, then mark
        // the declared selections as founding (earned rows keep provenance)
        await reconcileQuizPromotions(supabase, user.id, merged);
        await syncQuizSelections(supabase, user.id, quizRaw);
      } catch (syncErr) {
        console.error("Quiz sync error (non-blocking):", syncErr);
      }

      const { data } = await supabase.from("wine_profiles").select("*").eq("user_id", user.id).single();
      if (data) { setSavedProfile(data); return data; }
      return null;
    } catch (err) {
      console.error("Save error:", err);
      return null;
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
      <Quiz
        user={user}
        onProfileGenerated={handleSaveProfile}
        initialAnswers={quizInitial}
        earnedDna={quizEarned}
        onCancel={savedProfile ? () => setView("profile") : null}
        onDone={() => setView("profile")}
      />
    );
  }

  if (view === "profile" && savedProfile) {
    return <SavedProfileView profile={savedProfile} user={user} onRefine={handleRefine} onSignOut={handleSignOut} />;
  }

  return <WelcomeScreen onStart={handleStartQuiz} user={user} onSignOut={handleSignOut} />;
}
