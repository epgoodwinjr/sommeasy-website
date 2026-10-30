"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { resolveAndAccumulate } from "@/lib/dnaEvolution";
import { maybeRecomposeIdentity, shiftToastMessage } from "@/lib/identityRecompose";
import { saveQuizProfile } from "@/lib/saveQuizProfile";
import { recordEvent, ratingEventPayload } from "@/lib/wineEvents";
import { ratingFor } from "@/lib/ratings";
import { claimStash, restoreStash, unionQuizRaw, parseMetadataStash } from "@/lib/pendingPalate";
import { signatureLine } from "@/lib/palateSignature";
import { resolveOutstandingVerdict, VERDICT_EVENT_TYPES, VERDICT_WINDOW_DAYS, readDismissedVerdicts, dismissVerdict } from "@/lib/tableVerdict";
import { resolveFirstPourCards } from "@/lib/firstPour";
import { splitVintage } from "@/lib/vintage";
import { numeralCounter } from "@/lib/numerals";
import { HOME_TITLE, wineHref } from "@/lib/navTrail";
import { HOUSE_PAGES } from "@/lib/houseRoutes";
import { crestInitial, homeDateLine, journalLinkLabel, nearestPromotion, verdictMeta, verdictReply, whisperLine } from "@/lib/houseCopy";
import Quiz from "@/components/Quiz";
import WineRecList, { evolutionToastMessages } from "@/components/WineRecList";
import PalateMark from "@/components/PalateMark";
import Divider from "@/components/house/Divider";
import SectionHead from "@/components/house/SectionHead";
import LeaderEntry from "@/components/house/LeaderEntry";
import WineRow from "@/components/house/WineRow";
import RuledField from "@/components/house/RuledField";
import RatingTiles from "@/components/house/RatingTiles";
import TextAction from "@/components/house/TextAction";
import EmptyState from "@/components/house/EmptyState";
import Toast, { useToast } from "@/components/house/Toast";
import useMounted from "@/components/house/useMounted";
import { useNavTrail } from "@/components/house/RunningHead";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, SOFT_OUT, ink } from "@/components/house/tokens";

// ─── Home: The House List (README §8.1) ───
// The signed-in home reads like a wine list written for one person: a crest
// (the bloom, "Prepared for", the strand's title and epithet), actions as
// dotted-leader entries in numbered sections, and the recommendations as
// by-the-bottle rows. Two layouts: the established one, and — until the
// first rating anywhere — the new-user one (Your first entry + Reserved
// rows). The choice is made once per load, after the reads settle, and
// never flips mid-visit: the page doesn't rearrange under the user's thumb.

const mastCell = { width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" };
const wordmark = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 700, letterSpacing: "0.36em",
  textTransform: "uppercase", color: BURGUNDY,
};
const initialRing = {
  width: 30, height: 30, borderRadius: "50%", border: "1px solid rgba(139,35,50,0.3)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1, color: BURGUNDY,
};
const preparedFor = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 600, letterSpacing: "0.3em",
  textTransform: "uppercase", color: ink(0.45), marginTop: 16,
};
const crestTitle = {
  fontFamily: SERIF, fontSize: "28px", fontWeight: 700, lineHeight: 1.12,
  letterSpacing: "-0.01em", color: INK, marginTop: 8, textWrap: "balance",
};
const crestEpithet = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.4,
  color: BURGUNDY, marginTop: 8, transition: "opacity 0.3s ease",
};
const smallCaps = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
};
const replyLine = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5, color: BURGUNDY, marginTop: 12,
};
const footerLink = {
  fontFamily: SANS, fontSize: "13px", fontWeight: 600, color: BURGUNDY,
  padding: "12px 0", textDecoration: "none", whiteSpace: "nowrap",
};

// Case/whitespace-insensitive, the way the verdict resolver keys wines
const sameWine = (a, b) =>
  typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

function SavedProfileView({ profile, onRefine, user, welcomeBack }) {
  // Home has no running head, but it's the root of the back trail
  useNavTrail(HOME_TITLE);
  const router = useRouter();
  const { toasts, showToast } = useToast();
  // undefined until the read settles — the date line waits, so a whisper
  // never swaps in over the date
  const [whisper, setWhisper] = useState(undefined);
  // The Table Verdict: the one quiet "how was it?" — a chosen-but-unrated
  // Somm pick, resolved from the wine_events ledger. { ask, rating?, reply?,
  // failed? }: after a rating the reply takes the tiles' place and the
  // section stays until the next load
  const [verdict, setVerdict] = useState(null);
  const [verdictLoaded, setVerdictLoaded] = useState(false);
  // The journal read: { rows, newUser } once settled (rows null = failed)
  const [journal, setJournal] = useState(null);
  // "new" | "established" — decided once both reads settle, then frozen
  const [layout, setLayout] = useState(null);
  // Wines rated on this visit: the journal count and the Reserved rows
  // follow them without another read
  const [ratedNow, setRatedNow] = useState(() => new Set());
  const [firstEntry, setFirstEntry] = useState("");
  const supabase = createClient();

  const recs = profile.recommendations || [];

  useEffect(() => {
    // The whisper: the latest promotion ("Chenin Blanc just joined your
    // DNA") or identity shift ("You became The Mosel Purist"), when it
    // happened in the last 30 days — it takes the date's place
    async function loadWhisper() {
      try {
        const { data } = await supabase
          .from("dna_timeline")
          .select("display_name, event_type, event_at")
          .eq("user_id", user.id)
          .in("event_type", ["promoted", "shifted"])
          .order("event_at", { ascending: false })
          .limit(1);
        setWhisper(whisperLine(data?.[0]) || null);
      } catch {
        setWhisper(null);
      }
    }
    if (user?.id) loadWhisper();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    // The Table Verdict ask: read the user's own recent verdict-and-rating
    // events and let the pure resolver (tableVerdict.js) decide whether ONE
    // quiet prompt is due. This is a UI read of usage history — the DNA and
    // identity engines still never read wine_events. Any failure degrades
    // to silence (same posture as the fire-and-forget write path; the
    // wine-events blackhole guard drives this page with the table
    // unreachable, and home must not care).
    async function loadVerdictAsk() {
      try {
        const since = new Date(Date.now() - VERDICT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("wine_events")
          .select("id, event_type, payload, occurred_at")
          .eq("user_id", user.id)
          .in("event_type", VERDICT_EVENT_TYPES)
          .gte("occurred_at", since);
        if (!error && data) {
          const ask = resolveOutstandingVerdict(data, { dismissedIds: readDismissedVerdicts() });
          setVerdict(ask ? { ask } : null);
        }
      } catch { /* the prompt is a courtesy — never break home over it */ }
      // Settled either way (a failed read = no ask)
      setVerdictLoaded(true);
    }
    if (user?.id) loadVerdictAsk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    // The journal read behind the layout choice (First Pour's durable
    // truth, through the pure firstPour.js): never rated anything → the
    // new-user layout. ANY failure → the established layout — onboarding is
    // a courtesy, never a guess (the blackhole guard drives this page with
    // wine_events unreachable). The same rows give the journal count and
    // the verdict row's region.
    async function loadJournal() {
      let rows = null;
      let newUser = false;
      try {
        const [ints, evts] = await Promise.all([
          supabase.from("wine_interactions")
            .select("wine_name, interaction_type, rating, source_url, resolved_region")
            .eq("user_id", user.id),
          supabase.from("wine_events").select("event_type").eq("user_id", user.id)
            .in("event_type", ["bottle_logged", "menu_analyzed"]),
        ]);
        if (!ints.error && ints.data) {
          rows = ints.data;
          if (!evts.error && evts.data) {
            newUser = resolveFirstPourCards({ interactions: ints.data, events: evts.data }).includes("rate-one");
          }
        }
      } catch { /* settles as unknown → the established layout */ }
      setJournal({ rows, newUser });
    }
    if (user?.id) loadJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // The layout is chosen once. A due verdict ask outranks onboarding — the
  // established layout carries From last night (First Pour's stacking rule)
  useEffect(() => {
    if (layout || !verdictLoaded || !journal) return;
    setLayout(journal.newUser && !verdict?.ask ? "new" : "established");
  }, [layout, verdictLoaded, journal, verdict]);

  const hadCount = new Set([
    ...(journal?.rows || []).filter((r) => r.interaction_type === "had").map((r) => r.wine_name),
    ...ratedNow,
  ]).size;

  const markRated = (wine) => setRatedNow((prev) => new Set(prev).add(wine));

  // The dimension this rating moved that's nearest to joining the DNA —
  // for the "{name} is now two loved bottles from joining your DNA" reply
  const readNearest = async (dimensions) => {
    try {
      const touched = (dimensions || []).filter((d) => d?.mappable && d.dimensionValue);
      if (touched.length === 0) return null;
      const { data, error } = await supabase
        .from("dna_accumulation")
        .select("dimension, dimension_value, display_name, points, promoted, mappable")
        .eq("user_id", user.id)
        .in("dimension_value", touched.map((d) => d.dimensionValue));
      if (error || !data) return null;
      const keys = new Set(touched.map((d) => `${d.dimension}:${d.dimensionValue}`));
      return nearestPromotion(data.filter((r) => keys.has(`${r.dimension}:${r.dimension_value}`)));
    } catch {
      return null;
    }
  };

  // ─── The Table Verdict: rating through the ask ───
  // Runs the SAME rate flow as every other surface: wine_interactions
  // upsert → resolveAndAccumulate → milestone recompose → toasts. The somm
  // note/role/steer already ride the row (written at choose time) and this
  // upsert doesn't touch those columns, so they survive into the journal.
  // pick_rated (surface verdict_prompt) carries the choice's session so the
  // §11e funnel ties the rating back to its curation.
  const handleVerdictDismiss = () => {
    if (verdict?.ask) dismissVerdict(verdict.ask.id);
    setVerdict(null);
  };

  const handleVerdictRate = async (rating) => {
    const ask = verdict?.ask;
    if (!ask || verdict.rating) return;
    setVerdict({ ask, rating, reply: null });
    // Belt and braces: even if the event write below is lost, the ask
    // stays gone on this device
    dismissVerdict(ask.id);
    try {
      const { data: existing } = await supabase
        .from("wine_interactions")
        .select("rating")
        .eq("user_id", user.id)
        .eq("wine_name", ask.wine)
        .single();
      const previousRating = existing?.rating || null;

      const { error } = await supabase.from("wine_interactions").upsert({
        user_id: user.id,
        wine_name: ask.wine,
        interaction_type: "had",
        rating,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id, wine_name" });
      if (error) throw error;
      markRated(ask.wine);

      let evolutionResult = null;
      let shift = null;
      try {
        evolutionResult = await resolveAndAccumulate(supabase, user.id, ask.wine, rating, previousRating);
        shift = await maybeRecomposeIdentity(supabase, user.id, { ...evolutionResult, rating });
      } catch (evoErr) {
        console.error("DNA evolution error (non-blocking):", evoErr);
      }

      recordEvent(supabase, user.id, "pick_rated", {
        ...ratingEventPayload({
          wine: ask.wine, rating, previousRating, surface: "verdict_prompt",
          confidence: evolutionResult?.resolution?.confidence,
        }),
        session: ask.session,
      });

      const promotions = evolutionResult?.promotions || [];
      const nearest = rating === "loved" && promotions.length === 0
        ? await readNearest(evolutionResult?.dimensions)
        : null;
      setVerdict((v) => (v ? { ...v, reply: verdictReply({ rating, promotions, nearest }) } : v));

      const demotions = evolutionResult?.demotions || [];
      [...evolutionToastMessages(promotions, false), ...evolutionToastMessages(demotions, true)]
        .forEach((msg, i) => showToast(msg, { delay: 1500 + i * 1500, duration: 4000 }));
      if (shift?.shifted) {
        showToast(shiftToastMessage(shift), {
          delay: 1500 + (promotions.length + demotions.length) * 1500, duration: 5000,
        });
      }
    } catch (err) {
      console.error("Verdict rating failed:", err);
      setVerdict((v) => (v ? { ...v, failed: true } : v));
    }
  };

  const submitFirstEntry = () => {
    const q = firstEntry.trim();
    router.push(q ? `/log?q=${encodeURIComponent(q)}` : "/log");
  };

  const next = numeralCounter();
  const isNew = layout === "new";
  const epithet = isNew
    ? "Your first list — it rewrites itself as you rate"
    : profile.identity?.epithet || signatureLine(profile);

  const renderVerdict = () => {
    const { ask, rating, reply, failed } = verdict;
    const { base, vintage } = splitVintage(ask.wine);
    const region = (journal?.rows || []).find((r) => sameWine(r.wine_name, ask.wine))?.resolved_region;
    const rated = ratingFor(rating);
    return (
      <section data-testid="verdict-ask">
        <SectionHead numeral={next()} label="From last night" style={{ margin: "32px 0 16px" }} />
        <WineRow
          name={base} vintage={vintage} meta={verdictMeta(region)}
          href={HOUSE_PAGES.wine ? wineHref(ask.wine) : undefined}
          style={{ padding: 0, borderBottom: "none" }}
        />
        {rated ? (
          <p role="status" style={replyLine}>
            {failed ? "Couldn’t save — try again from your journal." : reply || `${rated.emoji} ${rated.label} — noted.`}
          </p>
        ) : (
          <>
            <RatingTiles variant="verdict" onRate={handleVerdictRate} style={{ marginTop: 14 }} />
            <TextAction tone="quiet" onClick={handleVerdictDismiss} testId="verdict-dismiss">Not tonight</TextAction>
          </>
        )}
      </section>
    );
  };

  return (
    <div style={{
      maxWidth: COLUMN, margin: "0 auto", minHeight: "100vh",
      padding: `calc(env(safe-area-inset-top) + 8px) ${GUTTER}px 56px`,
    }}>
      {/* Masthead: search · the wordmark · account */}
      <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) 44px", alignItems: "center", margin: "0 -10px" }}>
        {HOUSE_PAGES.search ? (
          <Link href="/search" aria-label="Search" style={{ ...mastCell, fontSize: "16px", textDecoration: "none" }}>🔍</Link>
        ) : (
          <span aria-hidden="true" style={mastCell} />
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <img src="/protea-icon.png" alt="" style={{ height: 22, width: "auto" }} />
          <span style={wordmark}>Sommeasy</span>
        </div>
        <Link href="/account" aria-label="Account" style={{ ...mastCell, textDecoration: "none" }}>
          <span style={initialRing}>{crestInitial(user)}</span>
        </Link>
      </div>

      {/* The crest — the door to the palate */}
      <Link href="/palate" data-testid="palate-strip" style={{ display: "block", textAlign: "center", textDecoration: "none", color: INK }}>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <PalateMark genome={profile.identity?.genome} size={76} />
        </div>
        <div style={preparedFor}>Prepared for</div>
        <div style={crestTitle}>{profile.archetype}</div>
        {/* Held back until the layout is known — a new user's line never
            swaps in over the established one */}
        {epithet && <div style={{ ...crestEpithet, opacity: layout ? 1 : 0 }}>{epithet}</div>}
      </Link>

      <Divider style={{ marginTop: 22 }} />
      <div style={{ ...smallCaps, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{
          minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          color: whisper ? ink(0.65) : ink(0.45),
          opacity: whisper === undefined ? 0 : 1, transition: "opacity 0.3s ease",
        }}>{whisper || homeDateLine()}</span>
        <Link href="/palate" style={{ color: BURGUNDY, padding: "12px 0", whiteSpace: "nowrap", textDecoration: "none" }}>
          Your palate ›
        </Link>
      </div>

      {/* Welcome-back moment — the pending palate just landed (Session 2:
          Never Lose a Palate). A quiet beat, not a toast. */}
      {welcomeBack && <WelcomeBackMoment />}

      {/* Sections render once the reads behind the layout settle */}
      {layout && (
        <>
          <SectionHead numeral={next()} label="Tonight, out" style={{ margin: "22px 0 16px" }} />
          <LeaderEntry
            tone="filled" mark="📋" label="Match the wine list" href="/recommend" subGap={8}
            sub={isNew
              ? "Photo, paste or link — we’ll pick a top bottle, a value and an adventure."
              : "Photo, paste or link — we’ll find your bottle."}
          />

          {isNew ? (
            <section data-testid="first-entry">
              <SectionHead numeral={next()} label="Your first entry" style={{ margin: "32px 0 16px" }} />
              <p style={{ fontFamily: SERIF, fontSize: "21px", fontWeight: 600, lineHeight: 1.25, color: INK }}>
                Name a bottle you already love
              </p>
              <RuledField
                variant="entry"
                value={firstEntry}
                onChange={(e) => setFirstEntry(e.target.value)}
                onSubmit={submitFirstEntry}
                submitLabel="Find it"
                submitTestId="first-entry-submit"
                placeholder="Cloudy Bay Sauvignon Blanc…"
                aria-label="Name a bottle you already love"
                autoComplete="off"
                enterKeyHint="go"
                data-testid="first-entry-input"
                style={{ marginTop: 6 }}
              />
              <p style={{ fontFamily: SANS, fontSize: "13px", lineHeight: 1.5, marginTop: 10 }}>
                <span style={{ color: ink(0.55) }}>Or </span>
                {/* Inline in the sentence, its hit area padded past the line */}
                <Link href="/log" data-testid="first-entry-snap" style={{
                  color: BURGUNDY, fontWeight: 600, textDecoration: "none", padding: "10px 0",
                }}>📸 snap tonight’s label</Link>
                <span style={{ color: ink(0.55) }}>. One rating and the Somm rewrites this list around you.</span>
              </p>
            </section>
          ) : (
            <>
              <SectionHead numeral={next()} label="Tonight, in" style={{ margin: "32px 0 16px" }} />
              <LeaderEntry
                mark="📸" label="Log a bottle" href="/log" subGap={8}
                sub="Snap the label and rate it — every rating sharpens your DNA."
              />
            </>
          )}

          {!isNew && verdict && renderVerdict()}

          {recs.length > 0 && (
            <>
              <SectionHead
                numeral={next()}
                label={isNew ? "Chosen from your quiz" : "Chosen for your palate"}
                style={{ margin: "34px 0 2px" }}
              />
              <WineRecList
                recs={recs}
                user={user}
                limit={4}
                surface="home"
                holdBack={isNew && ratedNow.size === 0 ? 2 : 0}
                onRated={({ wine }) => markRated(wine)}
                showToast={showToast}
                emptyState={
                  <EmptyState
                    emoji="🎉"
                    title="You’ve reviewed all your wines"
                    sub="Your best picks now come from real menus — share a wine list and we’ll match it to your palate."
                    action="📋 Match a wine list"
                    href="/recommend"
                  >
                    <div style={{ marginTop: 6 }}>
                      <TextAction tone="quiet" underlined onClick={onRefine}>or adjust your quiz answers</TextAction>
                    </div>
                  </EmptyState>
                }
              />
            </>
          )}

          <Divider style={{ marginTop: 36 }} />
          <nav aria-label="Your Sommeasy" style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 4 }}>
            <Link href="/palate" style={footerLink}>Your palate</Link>
            <Link href="/journal" style={footerLink}>{journalLinkLabel(hadCount)}</Link>
            <Link href="/account" style={footerLink}>Account</Link>
          </nav>
          <p style={{
            fontFamily: SERIF, fontStyle: "italic", fontSize: "12px", color: ink(0.4),
            textAlign: "center", marginTop: 8,
          }}>Never guess at a wine list again.</p>
        </>
      )}

      <Toast toasts={toasts} />
    </div>
  );
}

// ─── Welcome-back moment ───
function WelcomeBackMoment() {
  const mounted = useMounted(80);
  return (
    <p data-testid="welcome-back" style={{
      fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5,
      color: ink(0.75), textAlign: "center", marginTop: 18,
      opacity: mounted ? 1 : 0,
      transform: mounted ? "none" : "translateY(10px)",
      transition: `opacity 0.7s ${SOFT_OUT}, transform 0.7s ${SOFT_OUT}`,
    }}>Welcome back. Your palate was waiting.</p>
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
          Already have an account? <Link href="/login" style={{ color: "#8B2332", fontWeight: 600 }}>Sign in</Link>
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
  const router = useRouter();
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
  // A pending palate (anonymous quiz stash) was just folded in on this load
  const [welcomeBack, setWelcomeBack] = useState(false);
  const supabase = createClient();

  const rowToRaw = (row) => ({
    countries: row.countries || [], regions: row.regions || {},
    estates: row.estates || {}, varietals: row.varietals || [],
    specificWines: row.specific_wines || [],
  });

  // Never Lose a Palate (Sessions 2 + 5): a pending anonymous quiz gets
  // folded in on the first authenticated load of "/". TWO carriers, same
  // quiz: user_metadata.pending_palate (attached at signup — travels with
  // the account onto ANY device; the July 30 canary fix) and the
  // localStorage stash (same-browser fallback, and the only carrier for
  // plain sign-ins). claimStash removes the local stash synchronously
  // BEFORE the async save — the two-tab race (email-confirmation landing vs
  // the original tab) has exactly one winner; the metadata carrier is safe
  // to race because the union save is content-idempotent. Both carriers
  // present → union, never lose either. If the save fails, the local stash
  // goes back untouched and the metadata stays put: nothing lost, next load
  // retries. Over an existing profile it's stash ∪ existing ∪ earned
  // (refine merge, initialRaw null — the anonymous quiz never displayed the
  // existing chips, so nothing counts as a deselection). After a successful
  // save BOTH carriers are cleared.
  const restorePendingPalate = async (currentUser, existingRow) => {
    const local = claimStash(window.localStorage);
    const meta = parseMetadataStash(currentUser.user_metadata?.pending_palate);
    if (!local && !meta) return null;
    const stashAnswers =
      local && meta ? unionQuizRaw(meta.answers, local.answers) : (meta || local).answers;
    try {
      const rawAnswers = existingRow
        ? unionQuizRaw(stashAnswers, rowToRaw(existingRow))
        : stashAnswers;
      const row = await saveQuizProfile(supabase, currentUser.id, rawAnswers, {
        mode: existingRow ? "refine" : "fresh",
        initialRaw: null,
        // The Long Memory: this save is the anonymous quiz finally landing —
        // record it as mode "restore", back-logged to when the quiz actually
        // happened (the stash's createdAt; the local carrier's is authoritative
        // when both exist — same moment, but the local one always carries it)
        eventMode: "restore",
        occurredAt: local?.createdAt ?? meta?.createdAt ?? null,
      });
      if (row) {
        if (meta) {
          // Clear the account-side carrier. A failed clear only means the
          // next load re-runs a content-identical union — nothing is ever
          // double-applied, so this must not block the restore.
          try {
            const { error: clearErr } = await supabase.auth.updateUser({
              data: { pending_palate: null },
            });
            if (clearErr) console.error("Pending palate metadata clear failed:", clearErr);
          } catch (clearErr) {
            console.error("Pending palate metadata clear failed:", clearErr);
          }
        }
        return row;
      }
    } catch (err) {
      console.error("Pending palate restore failed:", err);
    }
    if (local) restoreStash(window.localStorage, local);
    return null;
  };

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
    // /?log=1 is the old bottle-log deep link (the bypass handoff, old
    // bookmarks) — logging lives at /log now
    if (new URLSearchParams(window.location.search).get("log") === "1") {
      router.replace("/log");
      return undefined;
    }
    // Quiet quiz entry points from the Palate view (?quiz=refine|fresh).
    // Read from location directly — useSearchParams would force a Suspense
    // boundary on this statically prerendered page.
    const quizParam = new URLSearchParams(window.location.search).get("quiz");
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        let { data } = await supabase.from("wine_profiles").select("*").eq("user_id", currentUser.id).single();
        const restoredRow = await restorePendingPalate(currentUser, data);
        if (restoredRow) {
          data = restoredRow;
          setWelcomeBack(true);
        }
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
    // initialRaw (the answers the refine was seeded with) lets the merge
    // honor explicit deselections of earned items — Ed's August 2026 call
    const data = await saveQuizProfile(supabase, user.id, profile.raw, {
      mode: quizMode,
      initialRaw: quizInitial,
    });
    if (data) { setSavedProfile(data); return data; }
    return null;
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
    return <SavedProfileView profile={savedProfile} user={user} onRefine={handleRefine} welcomeBack={welcomeBack} />;
  }

  return <WelcomeScreen onStart={handleStartQuiz} user={user} onSignOut={handleSignOut} />;
}
