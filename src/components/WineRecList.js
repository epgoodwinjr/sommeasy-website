"use client";

// WineRecList — THE ratable recommendations surface (The Reveal session;
// House List rows since Phase 2, README §8.1.6).
//
// The single implementation of "Had it / Want it / Pass" for DNA-generated
// recommendations. Home's recommendations and the post-quiz reveal both
// render this component, so a rating anywhere runs the same path:
// wine_interactions upsert → resolveAndAccumulate (accumulation,
// promotions, demotions) → milestone recompose → ledger → evolution and
// shift toasts. Never fork a second copy of this logic.
//
// Rows are numbered House List WineRows. "🍷 Had it" opens the RatingTiles
// in place — a tile rates at once, no modal — while "📌 Want it" and
// "👋 Pass" save on the tap; a done line replaces the actions either way.
// Rows acted on stay put for the session (the list never rearranges under
// a thumb); the next load filters them out. `holdBack` keeps the last rows
// Reserved until the first rating (decision D6) — the parent drops it to 0
// and they open in place. Signed out, the rows are read-only.

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { resolveAndAccumulate } from "@/lib/dnaEvolution";
import { maybeRecomposeIdentity, shiftToastMessage } from "@/lib/identityRecompose";
import { resolveWine } from "@/lib/wineResolver";
import { recordEvent, ratingEventPayload } from "@/lib/wineEvents";
import { splitVintage } from "@/lib/vintage";
import { romanNumeral } from "@/lib/numerals";
import { wineHref } from "@/lib/navTrail";
import { HOUSE_PAGES } from "@/lib/houseRoutes";
import { REC_DONE, confidentMeta, matchTag, ratedDoneLine, reservedCaption } from "@/lib/houseCopy";
import WineRow, { ReservedRow } from "@/components/house/WineRow";
import RatingTiles, { DoneLine } from "@/components/house/RatingTiles";
import TextAction, { TextActions } from "@/components/house/TextAction";
import Toast, { useToast } from "@/components/house/Toast";
import { SERIF, ink } from "@/components/house/tokens";

/** Somm-voice toast lines for promotion/demotion events — one copy, shared
 *  with the /recommend picks. */
export function evolutionToastMessages(items, isDemotion = false) {
  const dimensionLabels = { varietal: "your DNA", estate: "your estates", region: "your regions", country: "your DNA" };
  return (items || []).map((p) => {
    const target = dimensionLabels[p.dimension] || "your DNA";
    return isDemotion
      ? `🧬 ${p.displayName} removed from ${target}`
      : `🧬 Your Wine DNA evolved: ${p.displayName} added to ${target}`;
  });
}

const sommNote = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.5, color: ink(0.72), marginTop: 8,
};
const caption = {
  textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.5,
  color: ink(0.55), marginTop: 16,
};

// state: undefined (not acted on), "rating" (tiles open), or the done
// action { kind: "want" | "skip" | "rated", rating? }
function RecRow({ rec, numeral, meta, state, readOnly, onAction, onRate }) {
  const { base, vintage } = splitVintage(rec.wine);
  const done = state && state !== "rating" ? state : null;
  return (
    <WineRow
      testId="rec-card"
      data-wine={rec.wine}
      numeral={numeral}
      name={base}
      vintage={vintage}
      meta={meta || undefined}
      metaRight={matchTag(rec.matchType)}
      metaTone="accent"
      struck={done?.kind === "skip"}
      href={HOUSE_PAGES.wine ? wineHref(rec.wine) : undefined}
    >
      {rec.why && <p style={sommNote}>“{rec.why}”</p>}
      {!readOnly && !state && (
        <TextActions style={{ marginTop: 4 }}>
          <TextAction onClick={() => onAction("rating")}>🍷 Had it</TextAction>
          <TextAction tone="secondary" onClick={() => onAction("want")}>📌 Want it</TextAction>
          <TextAction tone="quiet" onClick={() => onAction("skip")}>👋 Pass</TextAction>
        </TextActions>
      )}
      {state === "rating" && <RatingTiles autoFocus onRate={onRate} style={{ marginTop: 10 }} />}
      {done?.kind === "want" && <DoneLine>{REC_DONE.want}</DoneLine>}
      {done?.kind === "skip" && <DoneLine>{REC_DONE.skip}</DoneLine>}
      {done?.kind === "rated" && <DoneLine>{ratedDoneLine(done.rating)}</DoneLine>}
    </WineRow>
  );
}

/**
 * @param recs       profile.recommendations ({ wine, why, matchType })
 * @param user       Supabase user (null → read-only rows, no actions)
 * @param limit      rows shown (4 on home)
 * @param surface    which door this list is ("home" | "reveal") — rides
 *                   the wine_events payloads so the funnel can tell them apart
 * @param holdBack   rows kept Reserved until the first rating (new users)
 * @param onRated    ({ wine, rating }) the moment a tile is tapped
 * @param showToast  the page's toast queue (useToast); the list keeps its
 *                   own when none is given (the reveal)
 * @param emptyState ReactNode when every rec was acted on before this load
 */
export default function WineRecList({
  recs, user, limit = 4, surface = "home", holdBack = 0,
  onRated, showToast: pageToast, emptyState = null,
}) {
  const [interactions, setInteractions] = useState({});
  // The recs not yet acted on when this load's read settled, in rec order —
  // a snapshot, so rows acted on this session keep their place
  const [listed, setListed] = useState(null);
  const [session, setSession] = useState({});
  const own = useToast();
  const toast = pageToast || own.showToast;
  const supabase = createClient();

  useEffect(() => {
    async function loadInteractions() {
      const { data } = await supabase
        .from("wine_interactions")
        .select("wine_name, interaction_type, rating")
        .eq("user_id", user.id);
      const map = {};
      (data || []).forEach((d) => { map[d.wine_name] = { type: d.interaction_type, rating: d.rating }; });
      setInteractions(map);
      setListed((recs || []).filter((r) => !map[r.wine]).map((r) => r.wine));
    }
    if (user?.id) loadInteractions();
    else setListed((recs || []).map((r) => r.wine));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const shown = useMemo(() => {
    const byWine = new Map((recs || []).map((r) => [r.wine, r]));
    return (listed || []).slice(0, limit).map((w) => byWine.get(w)).filter(Boolean);
  }, [recs, listed, limit]);

  // REGION · GRAPE only when the resolver is confident — a guess never
  // prints as a fact
  const metaByWine = useMemo(
    () => Object.fromEntries(shown.map((r) => [r.wine, confidentMeta(resolveWine(r.wine))])),
    [shown],
  );

  const showEvolutionToasts = (items, isDemotion) => {
    evolutionToastMessages(items, isDemotion).forEach((msg, i) => {
      toast(msg, { delay: 1500 + i * 1500, duration: 4000 });
    });
  };

  const saveInteraction = async (wineName, type, rating) => {
    const previousRating = interactions[wineName]?.rating || null;
    setInteractions((prev) => ({ ...prev, [wineName]: { type, rating: rating || null } }));

    const { error } = await supabase.from("wine_interactions").upsert({
      user_id: user.id,
      wine_name: wineName,
      interaction_type: type,
      rating: rating || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id, wine_name" });

    if (error) console.error("Interaction save error:", error);

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
          // this rating earned the change — celebrated only on a real shift,
          // after the promotion toasts have had their moment
          const shift = await maybeRecomposeIdentity(supabase, user.id, { ...result, rating });
          if (shift?.shifted) {
            const evoCount = (result.promotions?.length || 0) + (result.demotions?.length || 0);
            toast(shiftToastMessage(shift), { delay: 1500 + evoCount * 1500, duration: 5000 });
          }
        } catch (evoErr) {
          console.error("DNA evolution error (non-blocking):", evoErr);
        }
      }
    }
  };

  const handleAction = (wineName, kind) => {
    if (kind === "rating") {
      setSession((s) => ({ ...s, [wineName]: "rating" }));
      return;
    }
    setSession((s) => ({ ...s, [wineName]: { kind } }));
    saveInteraction(wineName, kind);
  };

  const handleRate = (wineName, rating) => {
    setSession((s) => ({ ...s, [wineName]: { kind: "rated", rating } }));
    onRated?.({ wine: wineName, rating });
    saveInteraction(wineName, "had", rating);
  };

  if (!recs || recs.length === 0) return null;
  // The section renders when its read settles — never a flash of rows the
  // read is about to filter out
  if (listed === null) return null;

  const readOnly = !user;
  const reserved = holdBack > 0 ? Math.min(holdBack, Math.max(0, shown.length - Math.max(0, limit - holdBack))) : 0;
  const open = shown.slice(0, shown.length - reserved);

  return (
    <div data-testid="wine-rec-list">
      {shown.length === 0 ? emptyState : (
        <>
          {open.map((rec, i) => (
            <RecRow
              key={rec.wine}
              rec={rec}
              numeral={romanNumeral(i + 1, { lower: true })}
              meta={metaByWine[rec.wine]}
              state={session[rec.wine]}
              readOnly={readOnly}
              onAction={(kind) => handleAction(rec.wine, kind)}
              onRate={(rating) => handleRate(rec.wine, rating)}
            />
          ))}
          {Array.from({ length: reserved }, (_, i) => (
            <ReservedRow key={`reserved-${i}`} numeral={romanNumeral(open.length + i + 1, { lower: true })} />
          ))}
          {reserved > 0 && <p style={caption}>{reservedCaption(reserved)}</p>}
          {/* The anonymous teaser's tail sells the list behind the account
              (The Velvet Rope) — signed-in lists don't carry it */}
          {readOnly && listed.length > limit && (
            <p style={caption}>{listed.length - limit} more wines to explore</p>
          )}
        </>
      )}
      {!pageToast && <Toast toasts={own.toasts} />}
    </div>
  );
}
