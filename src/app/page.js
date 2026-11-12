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
import { crestInitial, homeDateLine, journalLinkLabel, nearestPromotion, replyParts, verdictMeta, verdictNoted, verdictReply, whisperLine } from "@/lib/houseCopy";
import { welcomeNoticeCopy } from "@/lib/authCopy";
import { growthOf, readPalate } from "@/lib/growthMoment";
import Quiz from "@/components/Quiz";
import WineRecList, { evolutionToastMessages } from "@/components/WineRecList";
import WelcomeDemo from "@/components/WelcomeDemo";
import GrowthMoment from "@/components/GrowthMoment";
import Divider from "@/components/house/Divider";
import SectionHead from "@/components/house/SectionHead";
import LeaderEntry from "@/components/house/LeaderEntry";
import WineRow from "@/components/house/WineRow";
import RuledField from "@/components/house/RuledField";
import RatingTiles, { usePressHold } from "@/components/house/RatingTiles";
import TextAction from "@/components/house/TextAction";
import EmptyState from "@/components/house/EmptyState";
import Enter from "@/components/house/Enter";
import SwapLine from "@/components/house/SwapLine";
import WriteIn from "@/components/house/WriteIn";
import useStagger from "@/components/house/useStagger";
import { HOME, ROW_STEP, prefersReducedMotion } from "@/components/house/motion";
import Toast, { useToast } from "@/components/house/Toast";
import { useNavTrail } from "@/components/house/RunningHead";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, SR_ONLY, ink } from "@/components/house/tokens";

// ─── Home: The House List (README §8.1) ───
// The signed-in home reads like a wine list written for one person: a crest
// (the bloom, "Prepared for", the strand's title and epithet), actions as
// dotted-leader entries in numbered sections, and the recommendations as
// by-the-bottle rows. Two layouts: the established one, and — until the
// first rating anywhere — the new-user one (Your first entry + Reserved
// rows). The choice is made once per load, after the reads settle, and
// never flips mid-visit: the page doesn't rearrange under the user's thumb.
//
// In motion (docs/motion/README.md §8.6, §8.4): once the layout is chosen
// the list arrives in ink — the crest rises as one, the divider draws, the
// whisper is written, and each numbered section's head draws with its entry
// or rows after it (HOME in motion.js). And the crest is alive: a rating
// here that earns a promotion or a shift grows the bloom in place, and the
// strand's title and epithet change with it (the toasts are kept).

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
const dateText = { minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const smallCaps = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
};
const replyLine = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5, color: BURGUNDY, marginTop: 12,
};
const footerLink = {
  fontFamily: SANS, fontSize: "13px", fontWeight: 600, lineHeight: "20px", color: BURGUNDY,
  padding: "12px 0", textDecoration: "none", whiteSpace: "nowrap",
};

// How long home waits on the reads behind its layout. A stalled request is
// neither failure nor success; past this the page stops waiting — the
// established layout and the plain date — so home always has its actions.
const HOME_SETTLE_MS = 6000;

// Case/whitespace-insensitive, the way the verdict resolver keys wines
const sameWine = (a, b) =>
  typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();

const VERDICT_SAVE_FAILED = "Couldn’t save — try again from your journal.";

/** From last night's reply, written in: "❤️ Loved it — noted." at once, and
 *  what the rating did written after it when the engine answers. The line's
 *  text is the reply's, whole, at every moment.
 *
 *  It is SAID once (docs/motion README §15.2). The noted line is read when
 *  the reply takes focus. What arrives after that — `more` — is hidden from
 *  screen readers here and spoken by the section's status region instead,
 *  which holds nothing else: a written line inside a live region is
 *  re-announced as its words are set and again as they settle. */
function WrittenReply({ noted, more }) {
  return (
    <>
      {noted && <WriteIn text={noted} />}
      {more && <span aria-hidden="true">{noted && " "}<WriteIn text={more} /></span>}
    </>
  );
}

function SavedProfileView({ profile, onRefine, user, welcomeBack }) {
  // Home has no running head, but it's the root of the back trail
  useNavTrail(HOME_TITLE);
  const router = useRouter();
  // Receives too: "Removed from your journal" lands here when a wine page
  // steps back home
  const { toasts, showToast } = useToast({ receivesCarried: true });
  // undefined until the read settles — the date line waits, so a whisper
  // never swaps in over the date
  const [whisper, setWhisper] = useState(undefined);
  // The Table Verdict: the one quiet "how was it?" — a chosen-but-unrated
  // Somm pick, resolved from the wine_events ledger. { ask, rating?, reply?,
  // failed? }: after a rating the reply takes the tiles' place and the
  // section stays until the next load
  const [verdict, setVerdict] = useState(null);
  const [verdictLoaded, setVerdictLoaded] = useState(false);
  // What the reply's status region says (see the effect that sets it)
  const [verdictSaid, setVerdictSaid] = useState("");
  // The journal read: { rows, newUser } once settled (rows null = failed)
  const [journal, setJournal] = useState(null);
  // "new" | "established" — decided once both reads settle, then frozen
  const [layout, setLayout] = useState(null);
  // Wines rated on this visit: the journal count and the Reserved rows
  // follow them without another read
  const [ratedNow, setRatedNow] = useState(() => new Set());
  const [firstEntry, setFirstEntry] = useState("");
  // Set when the settle timer stopped waiting: a whisper or verdict that
  // lands later stays out of this visit instead of rearranging the page
  const settleForced = useRef(false);
  const replyRef = useRef(null);
  // The crest: the bloom, the strand's title and its epithet as they stand.
  // A rating on this page that earns a promotion or a shift moves all three
  // (`moment` says whether the growth celebrates)
  const [crest, setCrest] = useState(() => ({
    genome: profile.identity?.genome ?? null,
    title: profile.archetype,
    epithet: profile.identity?.epithet || null,
    moment: null,
  }));
  // The crest rises once the layout is chosen — or after HOME.crestWait, so
  // a slow read never leaves the page without it
  const [crestIn, setCrestIn] = useState(false);
  // When the layout was chosen: what enters later counts its delay from here
  const layoutAt = useRef(null);
  // The tapped tile answers before the reply takes the tiles' place
  const [verdictHeld, pressVerdict] = usePressHold();
  const supabase = createClient();

  const recs = profile.recommendations || [];

  // Each read below writes only from its live effect run. StrictMode runs
  // mount effects twice in dev, so a discarded run's read can land after
  // the user has acted — a late verdict read once resolved the ask against
  // the dismissal the rating had just written and pulled "From last night"
  // out from under the reply.
  useEffect(() => {
    let live = true;
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
        if (live && !settleForced.current) setWhisper(whisperLine(data?.[0]) || null);
      } catch {
        if (live && !settleForced.current) setWhisper(null);
      }
    }
    if (user?.id) loadWhisper();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    let live = true;
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
        if (!live) return;
        if (!error && data && !settleForced.current) {
          const ask = resolveOutstandingVerdict(data, { dismissedIds: readDismissedVerdicts() });
          setVerdict(ask ? { ask } : null);
        }
      } catch { /* the prompt is a courtesy — never break home over it */ }
      // Settled either way (a failed read = no ask)
      if (live) setVerdictLoaded(true);
    }
    if (user?.id) loadVerdictAsk();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    let live = true;
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
      if (live) setJournal({ rows, newUser });
    }
    if (user?.id) loadJournal();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // The layout is chosen once. A due verdict ask outranks onboarding — the
  // established layout carries From last night (First Pour's stacking rule)
  useEffect(() => {
    if (layout || !verdictLoaded || !journal) return;
    setLayout(journal.newUser && !verdict?.ask ? "new" : "established");
  }, [layout, verdictLoaded, journal, verdict]);

  // …unless a read stalls: then, after HOME_SETTLE_MS, the established layout
  // (never a guessed "new") and the plain date
  useEffect(() => {
    if (layout) return undefined;
    const timer = setTimeout(() => {
      settleForced.current = true;
      setLayout("established");
      setWhisper((w) => (w === undefined ? null : w));
    }, HOME_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [layout]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCrestIn(true);
      return undefined;
    }
    const timer = setTimeout(() => setCrestIn(true), HOME.crestWait);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!layout) return;
    if (layoutAt.current === null) layoutAt.current = performance.now();
    setCrestIn(true);
  }, [layout]);

  // The reply takes focus as it replaces the tiles: that is how its noted
  // line is announced, and keyboard users keep their place
  useEffect(() => {
    if (verdict?.rating && !verdictHeld) replyRef.current?.focus({ preventScroll: true });
  }, [verdict?.rating, verdictHeld]);

  // What comes after the tap — the engine's answer, or that the save failed
  // — is handed to the status region a commit AFTER the line has the focus,
  // so the two are never said over each other, and each is said once
  useEffect(() => {
    if (!verdict?.rating || verdictHeld) return;
    const later = verdict.failed
      ? VERDICT_SAVE_FAILED
      : replyParts(verdictNoted(verdict.rating), verdict.reply).more;
    if (later) setVerdictSaid(later);
  }, [verdict?.rating, verdict?.reply, verdict?.failed, verdictHeld]);

  const hadCount = new Set([
    ...(journal?.rows || []).filter((r) => r.interaction_type === "had").map((r) => r.wine_name),
    ...ratedNow,
  ]).size;

  const markRated = (wine) => setRatedNow((prev) => new Set(prev).add(wine));

  // ─── The crest grows in place (docs/motion §8.4) ───
  // Only for a moment — a promotion or an identity shift — and only from a
  // read that worked: the bloom, the title and the epithet move together, to
  // what the recompose just wrote. Unknown ≠ changed.
  const growCrest = async (result, shift) => {
    const moment = growthOf({ promotions: result?.promotions, demotions: result?.demotions, shift });
    if (!moment.grow) return;
    const now = await readPalate(supabase, user.id);
    if (!now) return;
    setCrest((c) => ({
      genome: now.genome, title: now.title || c.title, epithet: now.epithet || c.epithet, moment,
    }));
  };

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
    pressVerdict(rating);
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
      growCrest(evolutionResult, shift);
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
  // Each numbered section's entrance: its head, then what follows it. An
  // entrance reads its delay when it mounts, and the sections mount together
  // as the layout is chosen
  const section = useStagger(HOME.sections, HOME.sectionStep);
  const isNew = layout === "new";
  const epithet = isNew
    ? "Your first list — it rewrites itself as you rate"
    : crest.epithet || signatureLine(profile);
  // What is left of a delay counted from the layout's choice, for a line
  // whose read lands after it (the whisper)
  const sinceLayout = (delay) => (layoutAt.current === null
    ? delay
    : Math.max(0, delay - (performance.now() - layoutAt.current)));

  const renderVerdict = () => {
    const { ask, rating, reply, failed } = verdict;
    const { base, vintage } = splitVintage(ask.wine);
    const region = (journal?.rows || []).find((r) => sameWine(r.wine_name, ask.wine))?.resolved_region;
    const rated = ratingFor(rating);
    const at = section();
    return (
      <section data-testid="verdict-ask">
        <SectionHead numeral={next()} label="From last night" enterDelay={at} style={{ margin: "32px 0 16px" }} />
        <WineRow
          name={base} vintage={vintage} meta={verdictMeta(region)}
          href={wineHref(ask.wine)}
          enterDelay={at + HOME.follow}
          style={{ padding: 0, borderBottom: "none" }}
        />
        {rated && !verdictHeld ? (
          <p ref={replyRef} tabIndex={-1} data-testid="verdict-reply" style={{ ...replyLine, outline: "none" }}>
            {failed
              ? <span aria-hidden="true">{VERDICT_SAVE_FAILED}</span>
              : <WrittenReply {...replyParts(verdictNoted(rating), reply)} />}
          </p>
        ) : (
          <Enter kind="fade" delay={at + HOME.follow + ROW_STEP}>
            <RatingTiles variant="verdict" onRate={handleVerdictRate} rated={verdictHeld} style={{ marginTop: 14 }} />
            <TextAction tone="quiet" onClick={handleVerdictDismiss} disabled={Boolean(verdictHeld)} testId="verdict-dismiss">Not tonight</TextAction>
          </Enter>
        )}
        {/* The section's one live region: in the page before it has anything
            to say, and only ever handed plain words */}
        <p role="status" data-testid="verdict-said" style={SR_ONLY}>{verdictSaid}</p>
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
        <Link href="/search" aria-label="Search" style={{ ...mastCell, fontSize: "16px", textDecoration: "none" }}>🔍</Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <img src="/protea-icon.png" alt="" style={{ height: 22, width: "auto" }} />
          <span style={wordmark}>Sommeasy</span>
        </div>
        <Link href="/account" aria-label="Account" style={{ ...mastCell, textDecoration: "none" }}>
          <span style={initialRing}>{crestInitial(user)}</span>
        </Link>
      </div>

      {/* The crest — the door to the palate. It rises as one, and the bloom
          in it grows in place when a rating here earns it */}
      {crestIn && (
        <Enter>
          <Link href="/palate" data-testid="palate-strip" style={{ display: "block", textAlign: "center", textDecoration: "none", color: INK }}>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
              <GrowthMoment genome={crest.genome} moment={crest.moment} size={76} />
            </div>
            <div style={preparedFor}>Prepared for</div>
            <SwapLine as="div" text={crest.title} style={crestTitle} />
            {/* Held back until the layout is known — a new user's line never
                swaps in over the established one */}
            {epithet && <SwapLine as="div" text={epithet} style={{ ...crestEpithet, opacity: layout ? 1 : 0 }} />}
          </Link>
        </Enter>
      )}

      {/* The divider and the date line arrive with the layout: the whisper
          is written in (it takes the date's place), the plain date fades */}
      {layout && (
        <>
          <Divider enterDelay={HOME.divider} style={{ marginTop: 22 }} />
          <div style={{ ...smallCaps, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            {whisper === undefined ? <span />
              : whisper ? <WriteIn text={whisper} delay={sinceLayout(HOME.date)} style={{ ...dateText, color: ink(0.65) }} />
              : <Enter as="span" kind="fade" delay={sinceLayout(HOME.date)} style={{ ...dateText, color: ink(0.45) }}>{homeDateLine()}</Enter>}
            {/* 44px of hit area at 10px type; the margin keeps the row's spacing */}
            <Enter as={Link} kind="fade" delay={HOME.date} href="/palate" style={{
              color: BURGUNDY, padding: "15px 0", margin: "-3px 0", whiteSpace: "nowrap", textDecoration: "none",
            }}>
              Your palate ›
            </Enter>
          </div>
        </>
      )}

      {/* Welcome-back moment — the pending palate just landed (Session 2:
          Never Lose a Palate). A quiet beat, not a toast. */}
      {welcomeBack && <WelcomeBackMoment />}

      {/* Sections render once the reads behind the layout settle, and arrive
          in order: each head draws, and its entry or rows follow */}
      {layout && (() => {
        const out = section();
        const second = section();
        return (
        <>
          <SectionHead numeral={next()} label="Tonight, out" enterDelay={out} style={{ margin: "22px 0 16px" }} />
          <LeaderEntry
            tone="filled" mark="📋" label="Match the wine list" href="/recommend" subGap={8}
            enterDelay={out + HOME.follow}
            sub={isNew
              ? "Photo, paste or link — we’ll pick a top bottle, a value and an adventure."
              : "Photo, paste or link — we’ll find your bottle."}
          />

          {isNew ? (
            <section data-testid="first-entry">
              <SectionHead numeral={next()} label="Your first entry" enterDelay={second} style={{ margin: "32px 0 16px" }} />
              <Enter delay={second + HOME.follow}>
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
                  color: BURGUNDY, fontWeight: 600, textDecoration: "none", padding: "12px 0",
                }}>📸 snap tonight’s label</Link>
                <span style={{ color: ink(0.55) }}>. One rating and the Somm rewrites this list around you.</span>
              </p>
              </Enter>
            </section>
          ) : (
            <>
              <SectionHead numeral={next()} label="Tonight, in" enterDelay={second} style={{ margin: "32px 0 16px" }} />
              <LeaderEntry
                mark="📸" label="Log a bottle" href="/log" subGap={8}
                enterDelay={second + HOME.follow}
                sub="Snap the label and rate it — every rating sharpens your DNA."
              />
            </>
          )}

          {!isNew && verdict && renderVerdict()}

          {recs.length > 0 && (() => {
            const chosen = section();
            return (
            <>
              <SectionHead
                numeral={next()}
                label={isNew ? "Chosen from your quiz" : "Chosen for your palate"}
                enterDelay={chosen}
                style={{ margin: "34px 0 2px" }}
              />
              <WineRecList
                recs={recs}
                user={user}
                limit={4}
                surface="home"
                holdBack={isNew && ratedNow.size === 0 ? 2 : 0}
                onRated={({ wine }) => markRated(wine)}
                onSaved={({ result, shift }) => growCrest(result, shift)}
                enterDelay={chosen + HOME.follow}
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
            );
          })()}

          {(() => {
            const foot = section() + HOME.footer;
            return (
              <>
                <Divider enterDelay={foot} style={{ marginTop: 36 }} />
                <Enter kind="fade" delay={foot}>
                  <nav aria-label="Your Sommeasy" style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 4 }}>
                    <Link href="/palate" style={footerLink}>Your palate</Link>
                    <Link href="/journal" style={footerLink}>{journalLinkLabel(hadCount)}</Link>
                    <Link href="/account" style={footerLink}>Account</Link>
                  </nav>
                  <p style={{
                    fontFamily: SERIF, fontStyle: "italic", fontSize: "12px", color: ink(0.4),
                    textAlign: "center", marginTop: 8,
                  }}>Never guess at a wine list again.</p>
                </Enter>
              </>
            );
          })()}
        </>
        );
      })()}

      <Toast toasts={toasts} />
    </div>
  );
}

// ─── Welcome-back moment ───
function WelcomeBackMoment() {
  return (
    <Enter as="p" delay={80} data-testid="welcome-back" style={{
      fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5,
      color: ink(0.75), textAlign: "center", marginTop: 18,
    }}>Welcome back. Your palate was waiting.</Enter>
  );
}

// ─── Welcome (docs/motion/README.md §8.1) ───
// The front door in the House List look: the 400px column of the auth
// pages, the headline written in, one primary entry, and below the fold the
// demo that shows what Sommeasy does without a word of instruction. The
// entrance follows §8.1's table; the entry's own offsets (leader, circle,
// "Takes about two minutes.") are ENTRY_ENTER's.
const WELCOME_HEADLINE = "Never guess at a wine list again.";

function WelcomeScreen({ onStart, user, onSignOut, notice }) {
  return (
    <div style={{
      maxWidth: 400, margin: "0 auto", minHeight: "100vh",
      padding: "calc(env(safe-area-inset-top) + 22px) 36px 56px",
    }}>
      {/* Masthead. A signed-in visitor with no palate yet can sign out here */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "center", minHeight: 40 }}>
        <span />
        <Enter kind="fade" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/protea-icon.png" alt="" style={{ height: 24, width: "auto" }} />
          <span style={wordmark}>Sommeasy</span>
        </Enter>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {user && <TextAction tone="quiet" onClick={onSignOut}>Sign out</TextAction>}
        </div>
      </div>

      {/* Where Delete account lands (/?notice=account_deleted) */}
      {notice && (
        <Enter kind="fade" as="p" role="status" data-testid="welcome-notice" style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", lineHeight: 1.5, color: ink(0.8), marginTop: 26,
        }}>{notice}</Enter>
      )}

      <WriteIn
        as="h1" text={WELCOME_HEADLINE} delay={150} step={70} duration={600} awaitFonts
        style={{
          fontFamily: SERIF, fontSize: "36px", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.015em",
          color: INK, textWrap: "balance", marginTop: notice ? 22 : 34,
        }}
      />
      <Enter as="p" delay={650} style={{
        fontFamily: SANS, fontSize: "16px", lineHeight: 1.5, color: INK, opacity: 0.55, marginTop: 12,
      }}>
        Tell us what you like. We’ll find it on the menu.
      </Enter>

      <LeaderEntry
        tone="filled" mark="→" label="Build your palate" onClick={onStart}
        sub="Takes about two minutes." enterDelay={850} style={{ marginTop: 30 }}
      />
      {!user && (
        <Enter kind="fade" as="p" delay={1450} style={{
          fontFamily: SANS, fontSize: "14px", lineHeight: 1.5, color: ink(0.5), marginTop: 18,
        }}>
          Already have an account?{" "}
          {/* Inline in the sentence, its hit area padded past the line */}
          <Link href="/login" style={{ color: BURGUNDY, fontWeight: 600, padding: "10px 0", textDecoration: "none" }}>
            Sign in
          </Link>
        </Enter>
      )}

      <Divider enterDelay={1500} style={{ marginTop: 30 }} />
      {/* The head's label and rule land 80ms after its delay: 1650 */}
      <SectionHead label="Watch it work" enterDelay={1570} style={{ marginTop: 22 }} />
      <WelcomeDemo style={{ marginTop: 18 }} />
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
  // The Welcome screen's landing line — only its own ?notice= (account_deleted)
  const [welcomeNotice, setWelcomeNotice] = useState(null);
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
  // clobber navigation the user made in between (click "Build your palate" →
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
    // Delete account lands on /?notice=account_deleted — said once, then
    // the address goes back to plain "/"
    const notice = welcomeNoticeCopy(new URLSearchParams(window.location.search).get("notice"));
    if (notice) {
      setWelcomeNotice(notice);
      window.history.replaceState({}, "", "/");
    }
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

  return <WelcomeScreen onStart={handleStartQuiz} user={user} onSignOut={handleSignOut} notice={welcomeNotice} />;
}
