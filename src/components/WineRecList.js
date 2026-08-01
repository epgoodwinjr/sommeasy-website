"use client";

// WineRecList — THE ratable recommendations surface (The Reveal session).
//
// The single implementation of "Had it / Want to try / Not for me" for
// DNA-generated recommendations. Both the home page's Wines to Try and the
// post-quiz reveal render this component, so a rating anywhere runs the same
// path: wine_interactions upsert → resolveAndAccumulate (accumulation,
// promotions, demotions) → toasts. Never fork a second copy of this logic.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { resolveAndAccumulate } from "@/lib/dnaEvolution";
import { maybeRecomposeIdentity, shiftToastMessage } from "@/lib/identityRecompose";
import { recordEvent, ratingEventPayload } from "@/lib/wineEvents";

const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Source Sans 3', sans-serif";

/** Somm-voice toast lines for promotion/demotion events — one copy, shared
 *  with the bottle-logging flow on the home page. */
export function evolutionToastMessages(items, isDemotion = false) {
  const dimensionLabels = { varietal: "your DNA", estate: "your estates", region: "your regions", country: "your DNA" };
  return (items || []).map((p) => {
    const target = dimensionLabels[p.dimension] || "your DNA";
    return isDemotion
      ? `🧬 ${p.displayName} removed from ${target}`
      : `🧬 Your Wine DNA evolved: ${p.displayName} added to ${target}`;
  });
}

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
          fontFamily: SANS, fontSize: "11px",
          textTransform: "uppercase", letterSpacing: "0.15em",
          color: "#1B3D2F", opacity: 0.4, marginBottom: 8, fontWeight: 600,
        }}>You&apos;ve had this wine</div>
        <div style={{
          fontFamily: SERIF, fontSize: "18px",
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
              fontFamily: SANS, fontSize: "15px",
              color: "#1B3D2F", fontWeight: 500, width: "100%", textAlign: "left",
            }}>
              <span style={{ fontSize: "20px" }}>{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{
          marginTop: 16, width: "100%", padding: "10px",
          fontFamily: SANS, fontSize: "13px",
          color: "#1B3D2F", opacity: 0.4, background: "none",
          border: "none", cursor: "pointer",
        }}>Cancel</button>
      </div>
    </div>
  );
}

function WineRecCard({ rec, index, onAction, readOnly }) {
  const matchLabel = rec.matchType === "region + grape" ? "📍 Region + grape match"
    : rec.matchType === "grape" ? "🍇 Grape match"
    : rec.matchType === "region" ? "📍 Region match"
    : "🧭 Discovery pick";

  return (
    <div data-testid="rec-card" style={{
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
          fontFamily: SERIF, fontSize: "13px",
          fontWeight: 700, flexShrink: 0, marginTop: 1,
          boxShadow: index === 0 ? "0 2px 8px rgba(139,35,50,0.25)" : "none",
        }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: SERIF, fontSize: "16px",
            color: "#1B3D2F", lineHeight: 1.35, marginBottom: 5,
          }}>{rec.wine}</div>
          <div style={{
            fontFamily: SANS, fontSize: "13px",
            color: "#1B3D2F", opacity: 0.5, lineHeight: 1.5,
          }}>{rec.why}</div>
          <div style={{
            fontFamily: SANS, fontSize: "10px",
            color: "#8B2332", opacity: 0.55, marginTop: 8,
            textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600,
          }}>{matchLabel}</div>
        </div>
      </div>

      {!readOnly && (
        <div style={{
          display: "flex", gap: "8px", marginTop: 14, paddingTop: 14,
          borderTop: "1px solid rgba(27,61,47,0.06)",
        }}>
          <button onClick={() => onAction(rec.wine, "had")} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            padding: "9px 8px", borderRadius: "10px", minHeight: 40,
            border: "1px solid rgba(139,35,50,0.12)", background: "rgba(139,35,50,0.04)",
            fontFamily: SANS, fontSize: "12px",
            color: "#8B2332", fontWeight: 600, cursor: "pointer",
            transition: "all 0.15s ease",
          }}>🍷 Had it</button>
          <button onClick={() => onAction(rec.wine, "want")} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            padding: "9px 8px", borderRadius: "10px", minHeight: 40,
            border: "1px solid rgba(27,61,47,0.1)", background: "rgba(27,61,47,0.03)",
            fontFamily: SANS, fontSize: "12px",
            color: "#1B3D2F", fontWeight: 500, cursor: "pointer",
            transition: "all 0.15s ease",
          }}>📌 Want to try</button>
          <button onClick={() => onAction(rec.wine, "skip")} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            padding: "9px 8px", borderRadius: "10px", minHeight: 40,
            border: "1px solid rgba(27,61,47,0.06)", background: "transparent",
            fontFamily: SANS, fontSize: "12px",
            color: "#1B3D2F", opacity: 0.4, fontWeight: 500, cursor: "pointer",
            transition: "all 0.15s ease",
          }}>👋 Not for me</button>
        </div>
      )}
    </div>
  );
}

/**
 * @param recs           profile.recommendations
 * @param user           Supabase user (null → read-only list, no actions)
 * @param limit          max cards shown at once
 * @param surface        which door this list is ("home" | "reveal") — rides
 *                       the wine_events payloads so the funnel can tell them apart
 * @param onCountsChange ({ interactedRecs, visibleRecs, hasAnyInteractions })
 * @param emptyState     ReactNode when every rec has been actioned
 */
export default function WineRecList({ recs, user, limit = 5, surface = "home", onCountsChange, emptyState = null }) {
  const [interactions, setInteractions] = useState({});
  const [hasAnyInteractions, setHasAnyInteractions] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ratingWine, setRatingWine] = useState(null);
  const [toast, setToast] = useState(null);
  const [evolutionToasts, setEvolutionToasts] = useState([]);
  const supabase = createClient();

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
        setHasAnyInteractions(data.length > 0);
      }
      setLoaded(true);
    }
    if (user?.id) loadInteractions();
    else setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const visibleRecs = (recs || []).filter((r) => !interactions[r.wine]);
  const interactedRecs = (recs || []).length - visibleRecs.length;

  useEffect(() => {
    if (loaded && onCountsChange) {
      onCountsChange({ interactedRecs, visibleRecs: visibleRecs.length, hasAnyInteractions });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, interactedRecs, hasAnyInteractions]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const showEvolutionToasts = useCallback((items, isDemotion) => {
    const msgs = evolutionToastMessages(items, isDemotion);
    msgs.forEach((msg, i) => {
      setTimeout(() => {
        setEvolutionToasts((prev) => [...prev, msg]);
        setTimeout(() => {
          setEvolutionToasts((prev) => prev.filter((t) => t !== msg));
        }, 4000);
      }, 1500 + (i * 1500));
    });
  }, []);

  // The celebrated shift lands after any promotion/demotion toasts have
  // had their moment — it's the headline, not the opening act
  const showShiftToast = useCallback((msg, delayMs) => {
    setTimeout(() => {
      setEvolutionToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setEvolutionToasts((prev) => prev.filter((t) => t !== msg));
      }, 5000);
    }, delayMs);
  }, []);

  const saveInteraction = async (wineName, type, rating) => {
    const previousRating = interactions[wineName]?.rating || null;
    setInteractions((prev) => ({ ...prev, [wineName]: { type, rating: rating || null } }));
    setHasAnyInteractions(true);

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

    // Intent signals (The Long Memory): today these leave only a state row —
    // the event is the durable trace. Fire-and-forget.
    if (!error && type === "want") {
      recordEvent(supabase, user.id, "wine_wanted", { wine: wineName, surface });
    }
    if (!error && type === "skip") {
      recordEvent(supabase, user.id, "wine_skipped", { wine: wineName, surface });
    }

    // A rated bottle is evidence — run the evolution engine (non-blocking)
    if (!error && type === "had" && rating) {
      let result = null;
      try {
        result = await resolveAndAccumulate(supabase, user.id, wineName, rating, previousRating);
      } catch (evoErr) {
        console.error("DNA evolution error (non-blocking):", evoErr);
      }
      // The ledger record — exactly once per rating, old→new plus the band
      // the engine resolved at (engine hiccup → band "none"); fire-and-forget
      recordEvent(supabase, user.id, "rec_rated", ratingEventPayload({
        wine: wineName, rating, previousRating, surface,
        confidence: result?.resolution?.confidence,
      }));
      if (result) {
        try {
          if (result.promotions?.length > 0) showEvolutionToasts(result.promotions, false);
          if (result.demotions?.length > 0) showEvolutionToasts(result.demotions, true);
          // Milestone hook (Act III S3): recompose the identity strand when
          // this rating earned the change — celebrated only on a real shift
          const shift = await maybeRecomposeIdentity(supabase, user.id, { ...result, rating });
          if (shift?.shifted) {
            const evoCount = (result.promotions?.length || 0) + (result.demotions?.length || 0);
            showShiftToast(shiftToastMessage(shift), 1500 + evoCount * 1500);
          }
        } catch (evoErr) {
          console.error("DNA evolution error (non-blocking):", evoErr);
        }
      }
    }
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

  if (!recs || recs.length === 0) return null;

  return (
    <div data-testid="wine-rec-list">
      {ratingWine && (
        <RatingModal
          wine={ratingWine}
          onRate={handleRate}
          onClose={() => setRatingWine(null)}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px",
          borderRadius: "100px", fontFamily: SANS,
          fontSize: "14px", fontWeight: 600, zIndex: 90,
          boxShadow: "0 4px 20px rgba(27,61,47,0.3)",
        }}>✓ {toast}</div>
      )}

      {evolutionToasts.map((msg, i) => (
        <div key={msg} style={{
          position: "fixed", top: toast ? 56 + (i * 44) : 16 + (i * 44),
          left: "50%", transform: "translateX(-50%)",
          background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px",
          borderRadius: "100px", fontFamily: SANS,
          fontSize: "14px", fontWeight: 600, zIndex: 91,
          boxShadow: "0 4px 20px rgba(27,61,47,0.3)",
          whiteSpace: "nowrap",
        }}>{msg}</div>
      ))}

      {visibleRecs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {visibleRecs.slice(0, limit).map((rec, i) => (
            <WineRecCard
              key={rec.wine}
              rec={rec}
              index={i}
              onAction={handleAction}
              readOnly={!user}
            />
          ))}
        </div>
      ) : loaded ? emptyState : null}

      {visibleRecs.length > limit && (
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <span style={{
            fontFamily: SANS, fontSize: "12px",
            color: "#1B3D2F", opacity: 0.35,
          }}>{visibleRecs.length - limit} more wines to explore</span>
        </div>
      )}
    </div>
  );
}
