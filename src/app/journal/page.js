"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { resolveAndAccumulate, reverseAccumulation, fetchDnaTimeline } from "@/lib/dnaEvolution";

const RATING_DISPLAY = {
  loved: { emoji: "❤️", label: "Loved it" },
  liked: { emoji: "👍", label: "Liked it" },
  fine: { emoji: "😐", label: "It was fine" },
  not_for_me: { emoji: "👎", label: "Not for me" },
};

function RatingModal({ wine, currentRating, onRate, onClose }) {
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
      background: "rgba(27,61,47,0.4)", backdropFilter: "blur(8px)", padding: 24,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#F5F0E8", borderRadius: "24px", padding: "28px 24px",
        maxWidth: 360, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
      }}>
        <div style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
          textTransform: "uppercase", letterSpacing: "0.15em",
          color: "#1B3D2F", opacity: 0.4, marginBottom: 8, fontWeight: 600,
        }}>Rate this wine</div>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px",
          color: "#1B3D2F", lineHeight: 1.3, marginBottom: 24,
        }}>{wine}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {ratings.map((r) => (
            <button key={r.id} onClick={() => onRate(r.id)} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 18px", borderRadius: "14px",
              border: currentRating === r.id ? "2px solid #8B2332" : "1px solid rgba(27,61,47,0.08)",
              background: currentRating === r.id ? "rgba(139,35,50,0.06)" : "rgba(255,255,255,0.5)",
              cursor: "pointer", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
              color: "#1B3D2F", fontWeight: currentRating === r.id ? 600 : 500,
              width: "100%", textAlign: "left",
            }}>
              <span style={{ fontSize: "20px" }}>{r.emoji}</span> {r.label}
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

export default function JournalPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [interactions, setInteractions] = useState([]);
  const [tab, setTab] = useState("tried");
  const [ratingWine, setRatingWine] = useState(null);
  const [ratingCurrent, setRatingCurrent] = useState(null);
  const [toast, setToast] = useState(null);
  const [timelineEntries, setTimelineEntries] = useState([]);
  const [evolutionToasts, setEvolutionToasts] = useState([]);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        await loadInteractions(currentUser.id);
        const timeline = await fetchDnaTimeline(supabase, currentUser.id);
        setTimelineEntries(timeline);
      }
      setLoading(false);
    }
    init();
  }, []);

  async function loadInteractions(userId) {
    const { data } = await supabase
      .from("wine_interactions")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (data) setInteractions(data);
  }

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const showEvolutionToasts = useCallback((items, isDemotion) => {
    if (!items || items.length === 0) return;
    const dimensionLabels = { varietal: "your DNA", estate: "your estates", region: "your regions", country: "your DNA" };
    const toasts = items.map((p) => {
      const target = dimensionLabels[p.dimension] || "your DNA";
      return isDemotion
        ? `🧬 ${p.displayName} removed from ${target}`
        : `🧬 Your Wine DNA evolved: ${p.displayName} added to ${target}`;
    });
    toasts.forEach((msg, i) => {
      setTimeout(() => {
        setEvolutionToasts((prev) => [...prev, msg]);
        setTimeout(() => {
          setEvolutionToasts((prev) => prev.filter((t) => t !== msg));
        }, 4000);
      }, 1500 + (i * 1500));
    });
  }, []);

  const handleUpdateRating = async (wineName, rating) => {
    // Find previous rating for point differential calculation
    const prev = interactions.find((i) => i.wine_name === wineName);
    const previousRating = prev?.rating || null;

    const { error } = await supabase.from("wine_interactions").upsert({
      user_id: user.id,
      wine_name: wineName,
      interaction_type: "had",
      rating: rating,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id, wine_name" });

    if (!error) {
      // Re-run DNA evolution with the rating change
      try {
        const result = await resolveAndAccumulate(supabase, user.id, wineName, rating, previousRating);
        if (result?.promotions?.length > 0) showEvolutionToasts(result.promotions, false);
        if (result?.demotions?.length > 0) showEvolutionToasts(result.demotions, true);
        // Refresh timeline
        const timeline = await fetchDnaTimeline(supabase, user.id);
        setTimelineEntries(timeline);
      } catch (evoErr) {
        console.error("DNA evolution error (non-blocking):", evoErr);
      }
      await loadInteractions(user.id);
      showToast("Rating updated!");
    }
    setRatingWine(null);
  };

  const handleDelete = async (wineName) => {
    // Reverse DNA accumulation before deleting
    try {
      const result = await reverseAccumulation(supabase, user.id, wineName);
      if (result?.demotions?.length > 0) showEvolutionToasts(result.demotions, true);
    } catch (evoErr) {
      console.error("DNA reversal error (non-blocking):", evoErr);
    }

    const { error } = await supabase
      .from("wine_interactions")
      .delete()
      .eq("user_id", user.id)
      .eq("wine_name", wineName);

    if (!error) {
      setInteractions((prev) => prev.filter((i) => i.wine_name !== wineName));
      // Refresh timeline
      const timeline = await fetchDnaTimeline(supabase, user.id);
      setTimelineEntries(timeline);
      showToast("Removed");
    }
  };

  const handleMarkTried = async (wineName) => {
    setRatingWine(wineName);
    setRatingCurrent(null);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", opacity: 0.4 }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 64, width: "auto", marginBottom: 20, opacity: 0.7 }} />
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", color: "#1B3D2F", margin: "0 0 12px" }}>Sign in to view your journal</h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.55, margin: "0 0 28px", maxWidth: 320, lineHeight: 1.55 }}>Every bottle you rate makes your next recommendation sharper. Your journal is where that history lives.</p>
        <a href="/login" style={{ padding: "15px 44px", borderRadius: "100px", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, textDecoration: "none" }}>Sign In</a>
      </div>
    );
  }

  const tried = interactions.filter((i) => i.interaction_type === "had");
  const wanted = interactions.filter((i) => i.interaction_type === "want");
  const skipped = interactions.filter((i) => i.interaction_type === "skip");

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px", minHeight: "100vh" }}>
      {/* Rating modal */}
      {ratingWine && (
        <RatingModal
          wine={ratingWine}
          currentRating={ratingCurrent}
          onRate={(r) => handleUpdateRating(ratingWine, r)}
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
        position: "sticky", top: 0, background: "rgba(245,240,232,0.92)", backdropFilter: "blur(16px)", zIndex: 10,
      }}>
        <a href="/" style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px",
          color: "#8B2332", fontWeight: 700, textDecoration: "none",
          display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.01em",
        }}>
          <img src="/protea-icon.png" alt="" style={{ height: 36, width: "auto" }} />
          Sommeasy
        </a>
        <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.45 }}>{user.email?.split("@")[0]}</span>
      </header>

      {/* Title */}
      <div style={{ padding: "24px 0 20px" }}>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px",
          color: "#1B3D2F", margin: "0 0 8px", fontWeight: 700, letterSpacing: "-0.01em",
        }}>Wine Journal</h1>
        <p style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
          color: "#1B3D2F", opacity: 0.5, margin: 0, lineHeight: 1.5,
        }}>Your tasting history and wishlist</p>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: "4px", marginBottom: 20,
        background: "rgba(27,61,47,0.04)", borderRadius: "14px", padding: "4px",
      }}>
        {[
          { id: "tried", label: `Tried (${tried.length})` },
          { id: "want", label: `Want to Try (${wanted.length})` },
          { id: "skipped", label: `Skipped (${skipped.length})` },
          { id: "timeline", label: "DNA Timeline" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "11px 8px", borderRadius: "11px", border: "none",
            background: tab === t.id ? "rgba(255,255,255,0.85)" : "transparent",
            color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif",
            fontSize: "13px", fontWeight: tab === t.id ? 600 : 400,
            cursor: "pointer", transition: "all 0.2s ease",
            boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ─── TRIED TAB ─── */}
      {tab === "tried" && (
        <div>
          {tried.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "48px 20px",
              background: "rgba(255,255,255,0.4)", borderRadius: "16px",
              border: "1px solid rgba(27,61,47,0.06)",
            }}>
              <div style={{ fontSize: "36px", marginBottom: 12 }}>🍷</div>
              <p style={{
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
                color: "#1B3D2F", opacity: 0.5, margin: 0, lineHeight: 1.5,
              }}>No wines tried yet. Use &quot;Had it&quot; on your Wines to Try, or rate wines from your restaurant picks.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {tried.map((wine) => {
                const rd = RATING_DISPLAY[wine.rating] || { emoji: "🍷", label: "Tried" };
                return (
                  <div key={wine.id} style={{
                    background: "rgba(255,255,255,0.55)", borderRadius: "16px",
                    padding: "18px 20px", border: "1px solid rgba(27,61,47,0.06)",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px",
                          color: "#1B3D2F", lineHeight: 1.35, marginBottom: 6,
                        }}>{wine.wine_name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: "4px",
                            padding: "3px 10px", borderRadius: "100px",
                            background: wine.rating === "loved" ? "rgba(139,35,50,0.08)" :
                              wine.rating === "not_for_me" ? "rgba(27,61,47,0.06)" : "rgba(27,61,47,0.04)",
                            fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                            color: wine.rating === "loved" ? "#8B2332" : "#1B3D2F",
                            fontWeight: 600,
                          }}>{rd.emoji} {rd.label}</span>
                          <span style={{
                            fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                            color: "#1B3D2F", opacity: 0.3,
                          }}>{formatDate(wine.updated_at)}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button onClick={() => { setRatingWine(wine.wine_name); setRatingCurrent(wine.rating); }} style={{
                          fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                          color: "#8B2332", background: "none", border: "1px solid rgba(139,35,50,0.15)",
                          borderRadius: "8px", padding: "10px 14px", cursor: "pointer",
                        }}>Edit</button>
                        <button onClick={() => handleDelete(wine.wine_name)} style={{
                          fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                          color: "#1B3D2F", opacity: 0.35, background: "none", border: "1px solid rgba(27,61,47,0.08)",
                          borderRadius: "8px", padding: "10px 14px", cursor: "pointer",
                        }}>×</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── WANT TO TRY TAB ─── */}
      {tab === "want" && (
        <div>
          {wanted.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "48px 20px",
              background: "rgba(255,255,255,0.4)", borderRadius: "16px",
              border: "1px solid rgba(27,61,47,0.06)",
            }}>
              <div style={{ fontSize: "36px", marginBottom: 12 }}>📌</div>
              <p style={{
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
                color: "#1B3D2F", opacity: 0.5, margin: 0, lineHeight: 1.5,
              }}>No wines on your wishlist yet. Tap &quot;Want to try&quot; on any recommendation to save it here.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {wanted.map((wine) => (
                <div key={wine.id} style={{
                  background: "rgba(255,255,255,0.55)", borderRadius: "16px",
                  padding: "18px 20px", border: "1px solid rgba(27,61,47,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px",
                      color: "#1B3D2F", lineHeight: 1.35, marginBottom: 4,
                    }}>{wine.wine_name}</div>
                    <span style={{
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                      color: "#1B3D2F", opacity: 0.3,
                    }}>Added {formatDate(wine.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    <button onClick={() => handleMarkTried(wine.wine_name)} style={{
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                      color: "#8B2332", background: "rgba(139,35,50,0.06)",
                      border: "1px solid rgba(139,35,50,0.12)",
                      borderRadius: "10px", padding: "7px 14px", cursor: "pointer", fontWeight: 600,
                    }}>🍷 Tried it!</button>
                    <button onClick={() => handleDelete(wine.wine_name)} style={{
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                      color: "#1B3D2F", opacity: 0.35, background: "none", border: "1px solid rgba(27,61,47,0.08)",
                      borderRadius: "8px", padding: "10px 14px", cursor: "pointer",
                    }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── SKIPPED TAB ─── */}
      {tab === "skipped" && (
        <div>
          {skipped.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "48px 20px",
              background: "rgba(255,255,255,0.4)", borderRadius: "16px",
              border: "1px solid rgba(27,61,47,0.06)",
            }}>
              <p style={{
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
                color: "#1B3D2F", opacity: 0.5, margin: 0,
              }}>Nothing skipped — and that&apos;s fine. Wines you pass on land here so The Somm learns what to steer around.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {skipped.map((wine) => (
                <div key={wine.id} style={{
                  background: "rgba(255,255,255,0.4)", borderRadius: "16px",
                  padding: "16px 20px", border: "1px solid rgba(27,61,47,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                  opacity: 0.6,
                }}>
                  <div style={{
                    fontFamily: "'Playfair Display', Georgia, serif", fontSize: "15px",
                    color: "#1B3D2F", lineHeight: 1.3, flex: 1,
                  }}>{wine.wine_name}</div>
                  <button onClick={() => handleDelete(wine.wine_name)} style={{
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                    color: "#1B3D2F", opacity: 0.4, background: "none", border: "1px solid rgba(27,61,47,0.08)",
                    borderRadius: "8px", padding: "5px 10px", cursor: "pointer",
                  }}>Undo</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── DNA TIMELINE TAB ─── */}
      {tab === "timeline" && (
        <div>
          {timelineEntries.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "48px 20px",
              background: "rgba(255,255,255,0.4)", borderRadius: "16px",
              border: "1px solid rgba(27,61,47,0.06)",
            }}>
              <div style={{ fontSize: "36px", marginBottom: 12 }}>🧬</div>
              <p style={{
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
                color: "#1B3D2F", opacity: 0.5, margin: 0, lineHeight: 1.5,
              }}>Your DNA hasn&apos;t evolved yet. Keep logging bottles and your profile will grow to reflect what you love.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {timelineEntries.map((entry) => {
                const dimensionLabels = { varietal: "your DNA", estate: "your estates", region: "your regions", country: "your DNA" };
                const target = dimensionLabels[entry.dimension] || "your DNA";
                const text = entry.event_type === "promoted"
                  ? `${entry.display_name} added to ${target}`
                  : `${entry.display_name} removed from ${target}`;
                return (
                  <div key={entry.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                    background: "rgba(255,255,255,0.55)", borderRadius: "14px",
                    padding: "14px 18px", border: "1px solid rgba(27,61,47,0.06)",
                  }}>
                    <div style={{
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px",
                      color: "#1B3D2F", lineHeight: 1.4,
                    }}>
                      <span style={{ marginRight: 8 }}>🧬</span>
                      {text}
                    </div>
                    <span style={{
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                      color: "#1B3D2F", opacity: 0.3, flexShrink: 0, whiteSpace: "nowrap",
                    }}>{formatDate(entry.event_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
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

      {/* Summary stats */}
      {interactions.length > 0 && (
        <div style={{
          marginTop: 28, padding: "18px 20px", borderRadius: "16px",
          background: "rgba(255,255,255,0.4)", border: "1px solid rgba(27,61,47,0.06)",
        }}>
          <div style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
            textTransform: "uppercase", letterSpacing: "0.12em",
            color: "#1B3D2F", opacity: 0.35, marginBottom: 12, fontWeight: 600,
          }}>Your Stats</div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {[
              { n: tried.length, l: "Wines Tried" },
              { n: tried.filter((w) => w.rating === "loved").length, l: "Loved" },
              { n: wanted.length, l: "Wishlist" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center", flex: 1, minWidth: 70 }}>
                <div style={{
                  fontFamily: "'Playfair Display', serif", fontSize: "24px",
                  fontWeight: 700, color: "#1B3D2F",
                }}>{s.n}</div>
                <div style={{
                  fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                  color: "#1B3D2F", opacity: 0.4, marginTop: 2,
                }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ paddingBottom: 48 }} />
    </div>
  );
}
