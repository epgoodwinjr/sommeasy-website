"use client";

// A wine's own page — /wine?name= (The House List §8.5, Phase 4).
//
// Everything the user knows about one bottle: their standing with it (the
// verdict, changeable in place; a want; a pass; or Had it / Want it / Pass
// when it isn't in the journal yet), the Somm's words, their own note, what
// it did to their palate, the particulars, and a couple more in the same
// vein. The journal's row actions moved here:
//   - Every rating runs WineRecList's saveInteraction — the ONE Had it /
//     Want it / Pass path. A bottle already in the journal re-rates through
//     it as journal_rerated (the differential from its stored rating); one
//     that isn't writes rec_rated. Surface wine_page either way.
//   - Remove runs the journal delete verbatim: read the row, delete FIRST,
//     reverse only what this call removed, then journal_deleted. "Remove
//     from journal" then steps back, and the page it lands on says so
//     (carryToasts) — with any demotion or shift the removal caused.
// The note saves itself: 800ms after typing stops, and on blur.
//
// Unknown ≠ empty: a failed read never shows the not-in-your-journal
// actions — rating over a row we couldn't read would count it twice.

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { reverseAccumulation } from "@/lib/dnaEvolution";
import { maybeRecomposeIdentity, shiftToastMessage } from "@/lib/identityRecompose";
import { resolveWine } from "@/lib/wineResolver";
import { recordEvent, confidenceBand } from "@/lib/wineEvents";
import { CONFIDENCE_GATE } from "@/lib/dnaThresholds";
import { ratingFor } from "@/lib/ratings";
import { splitVintage } from "@/lib/vintage";
import { numeralCounter } from "@/lib/numerals";
import { wineHref } from "@/lib/navTrail";
import {
  journalMark, keepLabel, matchTag, metaLine, particulars, placeName, shortDate,
  sommRoleTag, timelineLine, verdictWhere, wineMeta,
} from "@/lib/houseCopy";
import { hasStoredResolution, sameVein, wineFacts, wineStanding } from "@/lib/journalView";
import { evolutionToastMessages, saveInteraction } from "@/components/WineRecList";
import RunningHead, { useGoBack } from "@/components/house/RunningHead";
import ServiceBar from "@/components/house/ServiceBar";
import Toast, { carryToasts, useToast } from "@/components/house/Toast";
import Divider from "@/components/house/Divider";
import SectionHead from "@/components/house/SectionHead";
import WineRow from "@/components/house/WineRow";
import { FactRow } from "@/components/house/SettingRow";
import RuledField from "@/components/house/RuledField";
import RatingTiles from "@/components/house/RatingTiles";
import TextAction, { TextActions } from "@/components/house/TextAction";
import EmptyState from "@/components/house/EmptyState";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, ink, leader } from "@/components/house/tokens";

const NOTE_MAX = 500;
const NOTE_SAVE_MS = 800;
const SAVE_FAILED = "Couldn’t save — please try again.";

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `26px ${GUTTER}px 56px` };
const eyebrow = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em",
  textTransform: "uppercase", color: INK, opacity: 0.5,
};
const smallCaps = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 600, letterSpacing: "0.14em",
  textTransform: "uppercase", color: INK, opacity: 0.45,
};
const standingLine = { display: "flex", alignItems: "flex-end", gap: 10, marginTop: 20 };
const standingDate = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.2,
  color: INK, opacity: 0.7, whiteSpace: "nowrap",
};
const leaderLine = { flex: 1, minWidth: 12, borderBottom: leader(1.5), marginBottom: 6 };
const alertLine = { fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.5, color: BURGUNDY };

// What resolveAndAccumulate just stamped on the row (it writes whenever the
// resolver found anything) — mirrored, so the facts read as a reload would
function resolvedFields(resolution) {
  if (!(resolution?.confidence > 0)) return {};
  return {
    resolved_winery: resolution.winery,
    resolved_region: resolution.region,
    resolved_province: resolution.province,
    resolved_country: resolution.country,
    resolved_varietal: resolution.varietal,
    match_confidence: resolution.confidence,
  };
}

// A recommendation's REGION · GRAPE for the same vein — only when the
// resolver is confident; a guess never decides what's "in the same vein".
// Cached for the tab's life: the resolver costs tens of ms a call, and the
// same recommendations come up wine page after wine page.
const placeCache = new Map();
function trustedPlace(name) {
  if (!placeCache.has(name)) {
    const r = resolveWine(name);
    placeCache.set(name, r.confidence >= CONFIDENCE_GATE ? { region: r.region, grape: r.varietal } : null);
  }
  return placeCache.get(name);
}

export default function WinePage({ name }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [journal, setJournal] = useState([]);
  const [recs, setRecs] = useState([]);
  // This wine's journal row (null: not in the journal)
  const [row, setRow] = useState(null);
  // A row or a recommendation at load — after that, a removed want or pass
  // leaves the not-yet-tried actions, never "we couldn't find that bottle"
  const [known, setKnown] = useState(false);
  const [events, setEvents] = useState([]);
  const [vein, setVein] = useState([]);
  const [tilesOpen, setTilesOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [note, setNote] = useState("");
  const [noteFailed, setNoteFailed] = useState(false);
  const { toasts, showToast } = useToast({ receivesCarried: true });
  const goBack = useGoBack();
  const standingRef = useRef(null);
  const focusStanding = useRef(false);
  const userId = useRef(null);
  const noteTimer = useRef(null);
  const noteDraft = useRef("");
  // What the row is KNOWN to hold — moved only by a confirmed write
  const noteSaved = useRef("");
  // One note write at a time: overlapping writes could land out of order
  const noteChain = useRef(Promise.resolve());
  const supabase = createClient();

  useEffect(() => {
    let live = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      if (!live) return;
      setUser(u);
      userId.current = u?.id ?? null;
      if (u && name) {
        const [ints, profile, timeline] = await Promise.all([
          supabase.from("wine_interactions").select("*").eq("user_id", u.id)
            .order("updated_at", { ascending: false }),
          supabase.from("wine_profiles").select("recommendations").eq("user_id", u.id).maybeSingle(),
          supabase.from("dna_timeline").select("*").eq("user_id", u.id).eq("wine_name", name)
            .order("event_at", { ascending: false }),
        ]);
        if (!live) return;
        if (ints.error || !Array.isArray(ints.data) || profile.error) {
          setReadFailed(true);
        } else {
          const mine = ints.data.find((r) => r.wine_name === name) || null;
          const recList = Array.isArray(profile.data?.recommendations) ? profile.data.recommendations : [];
          setJournal(ints.data);
          setRecs(recList);
          setRow(mine);
          setKnown(Boolean(mine || recList.some((r) => r?.wine === name)));
          setNote(mine?.note || "");
          noteDraft.current = mine?.note || "";
          noteSaved.current = mine?.note || "";
          setEvents(timeline.data || []);
        }
      }
      setLoading(false);
    }
    init();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After the standing changes, focus lands on it — the button that was
  // tapped is gone, and keyboard and screen-reader users keep their place
  useEffect(() => {
    if (!focusStanding.current) return;
    focusStanding.current = false;
    standingRef.current?.focus({ preventScroll: true });
  });

  // ─── The note: saved 800ms after typing stops, and on blur ───
  // Writes queue behind one another, each checking against what the row is
  // known to hold, so a slow or failed write never muddles a later one.
  const writeNote = (text) => {
    noteChain.current = noteChain.current.then(async () => {
      const value = text.trim().slice(0, NOTE_MAX);
      if (!userId.current || value === noteSaved.current) return;
      const { data, error } = await supabase.from("wine_interactions")
        .update({ note: value || null })
        .eq("user_id", userId.current)
        .eq("wine_name", name)
        .select("wine_name");
      // No row matched: a first verdict is still saving (rate() writes the
      // draft once it lands), or the bottle just left the journal
      if (error || !data?.length) {
        if (error) setNoteFailed(true);
        return;
      }
      noteSaved.current = value;
      setNoteFailed(false);
    }).catch(() => {
      // A thrown write must not stall the queue behind it
      setNoteFailed(true);
    });
    return noteChain.current;
  };

  const onNoteChange = (e) => {
    const text = e.target.value.slice(0, NOTE_MAX);
    setNote(text);
    noteDraft.current = text;
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      noteTimer.current = null;
      writeNote(text);
    }, NOTE_SAVE_MS);
  };

  const flushNote = () => {
    clearTimeout(noteTimer.current);
    noteTimer.current = null;
    writeNote(noteDraft.current);
  };

  // A line typed and left before the pause still lands
  useEffect(() => () => {
    if (noteTimer.current) flushNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The resolver runs only for a wine with no stored resolution — its first
  // call builds its indexes, and a rated bottle already carries the answer
  const stored = hasStoredResolution(row);
  const resolution = useMemo(
    () => (loading || !name || stored ? null : resolveWine(name)),
    [loading, name, stored],
  );
  const facts = useMemo(() => wineFacts(row, resolution), [row, resolution]);

  // The same vein waits for the first paint: resolving the recommendations
  // is the page's one slow step, and nothing above it should wait on it
  useEffect(() => {
    if (loading) return undefined;
    const t = setTimeout(() => setVein(sameVein({
      name, region: facts.region, grape: facts.grape, journal, recs, resolve: trustedPlace,
    })), 0);
    return () => clearTimeout(t);
  }, [loading, name, facts.region, facts.grape, journal, recs]);

  const readEvents = async () => {
    const { data } = await supabase.from("dna_timeline").select("*")
      .eq("user_id", userId.current).eq("wine_name", name)
      .order("event_at", { ascending: false });
    if (data) setEvents(data);
  };

  /** The row as a save leaves it — the shape a read gives, so the
   *  standing, the facts and the same vein follow without another read. */
  const placeRow = (next) => {
    focusStanding.current = true;
    setRow(next);
    setJournal((rows) => (next
      ? [next, ...rows.filter((r) => r.wine_name !== name)]
      : rows.filter((r) => r.wine_name !== name)));
  };

  const edited = (changes) => {
    const now = new Date().toISOString();
    return {
      ...(row || { user_id: userId.current, wine_name: name, created_at: now }),
      ...changes,
      updated_at: now,
    };
  };

  // ─── A verdict: the new one shows at once; the engine runs behind it ───
  const rate = async (rating) => {
    if (pending) return;
    const before = row;
    placeRow(edited({ interaction_type: "had", rating }));
    setTilesOpen(false);
    setActionError("");
    setPending(true);
    const { error, result } = await saveInteraction({
      supabase, userId: userId.current, wineName: name, type: "had", rating,
      previousRating: before?.rating || null,
      surface: "wine_page",
      ratingEvent: before ? "journal_rerated" : "rec_rated",
      toast: showToast,
    });
    setPending(false);
    if (error) {
      placeRow(before);
      setTilesOpen(true);
      setActionError(SAVE_FAILED);
      return;
    }
    const stamped = resolvedFields(result?.resolution);
    if (Object.keys(stamped).length > 0) {
      setRow((r) => (r ? { ...r, ...stamped } : r));
      setJournal((rows) => rows.map((r) => (r.wine_name === name ? { ...r, ...stamped } : r)));
    }
    // A note typed while a first verdict was saving had no row to land on
    if (noteDraft.current.trim().slice(0, NOTE_MAX) !== noteSaved.current) writeNote(noteDraft.current);
    readEvents();
  };

  // ─── Want it / Pass, for a wine not yet in the journal ───
  const mark = async (type) => {
    if (pending) return;
    const before = row;
    placeRow(edited({ interaction_type: type, rating: null }));
    setActionError("");
    setPending(true);
    const { error } = await saveInteraction({
      supabase, userId: userId.current, wineName: name, type, surface: "wine_page", toast: showToast,
    });
    setPending(false);
    if (error) {
      placeRow(before);
      setActionError(SAVE_FAILED);
    }
  };

  // ─── The journal delete (moved here from the journal) ───
  const remove = async ({ leave = false } = {}) => {
    if (pending) return;
    setPending(true);
    setRemoving(leave);
    setActionError("");
    // Delete FIRST, returning what was deleted. Points reverse only when
    // THIS call actually removed the row — a failed delete + retry (or a
    // second tab) can never double-reverse — and they reverse exactly the
    // rating the removed row held: the delete hands it back, so neither a
    // failed read beforehand nor a re-rate in another tab can skew it.
    const { data: deleted, error } = await supabase
      .from("wine_interactions")
      .delete()
      .eq("user_id", userId.current)
      .eq("wine_name", name)
      .select("rating, match_confidence, interaction_type");

    const interaction = deleted?.[0] ?? null;
    const said = [];
    if (!error && interaction) {
      // The ledger record (The Long Memory): what was removed and whether
      // evidence was reversed — a sub-partial-band resolution and a
      // "fine"/unrated row carried no points, so neither reverses anything
      const band = confidenceBand(interaction?.match_confidence);
      recordEvent(supabase, userId.current, "journal_deleted", {
        wine: name,
        rating: interaction?.rating ?? null,
        interaction_type: interaction?.interaction_type ?? null,
        confidence_band: band,
        points_reversed:
          band !== "none" && !!interaction?.rating && interaction.rating !== "fine",
      });
      try {
        const result = await reverseAccumulation(supabase, userId.current, name, interaction);
        evolutionToastMessages(result?.demotions, true).forEach((message, i) => {
          said.push({ message, delay: 1500 + i * 1500, duration: 4000 });
        });
        // A delete-triggered demotion can shift the strand back, and that's
        // worth saying too
        const shift = await maybeRecomposeIdentity(supabase, userId.current, { ...result, isReversal: true });
        if (shift?.shifted) {
          said.push({
            message: shiftToastMessage(shift),
            delay: 1500 + (result?.demotions?.length || 0) * 1500,
            duration: 5000,
          });
        }
      } catch (evoErr) {
        console.error("DNA reversal error (non-blocking):", evoErr);
      }
    }

    if (error) {
      setPending(false);
      setRemoving(false);
      setActionError("Couldn’t remove it — please try again.");
      return;
    }
    if (leave) {
      // The page we land on says it — this one is leaving
      carryToasts([{ message: "Removed from your journal" }, ...said]);
      goBack();
      return;
    }
    said.forEach(({ message, ...opts }) => showToast(message, opts));
    setPending(false);
    setTilesOpen(false);
    placeRow(null);
  };

  const openTiles = () => {
    setActionError("");
    setTilesOpen(true);
  };

  const keepVerdict = () => {
    focusStanding.current = true;
    setTilesOpen(false);
  };

  if (loading) {
    return (
      <>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
        </div>
        {/* A toast carried in from another wine page plays while this loads */}
        <Toast toasts={toasts} aboveServiceBar />
      </>
    );
  }

  if (!user) {
    return (
      <main style={column}>
        <EmptyState
          emoji="🍷"
          title="Sign in to see this bottle"
          sub="Your verdicts, your notes and every bottle you’ve rated live with your account."
          action="Sign in"
          href={`/login?next=${encodeURIComponent(wineHref(name))}`}
        />
      </main>
    );
  }

  const page = (body) => (
    <>
      <RunningHead />
      <main data-testid="wine-page" style={column}>{body}</main>
      <Toast toasts={toasts} aboveServiceBar />
      <ServiceBar />
    </>
  );

  if (readFailed) {
    return page(
      <EmptyState
        emoji="🍷"
        title="We couldn’t open this bottle just now"
        sub="Your journal didn’t answer — give it a moment and try again."
        action="Try again"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (!name || (!known && !row)) {
    return page(
      <EmptyState emoji="🍷" title="We couldn’t find that bottle" sub="It may have left your journal.">
        <div style={{ marginTop: 10 }}>
          <TextAction href="/">Back to your list</TextAction>
        </div>
      </EmptyState>
    );
  }

  const standing = wineStanding(row);
  const tried = standing === "rated" || standing === "unrated";
  const rated = ratingFor(row?.rating);
  const rec = recs.find((r) => r?.wine === name) || null;
  const { base, vintage } = splitVintage(name);
  const meta = wineMeta(facts);
  // The Somm's words: what it said the night it was picked, else why it
  // chose it for this palate
  const sommNote = row?.somm_note || rec?.why || null;
  const sommTag = row?.somm_note ? sommRoleTag(row.somm_pick_role) : rec?.why ? matchTag(rec.matchType) : null;
  const lines = events.map((e) => ({ id: e.id, line: timelineLine(e) })).filter((e) => e.line);
  const factRows = particulars(facts, vintage);
  const next = numeralCounter();

  const tiles = (prompt) => (
    <RatingTiles
      variant="page" prompt={prompt} onRate={rate} disabled={pending}
      autoFocus={tilesOpen} style={{ marginTop: 20 }}
    />
  );

  const renderStanding = () => {
    if (standing === "rated" && tilesOpen) {
      return (
        <>
          {tiles("Change your verdict")}
          <TextAction tone="quiet" size={12} opacity={0.5} onClick={keepVerdict} style={{ marginTop: 4 }}>
            {keepLabel(row.rating)}
          </TextAction>
        </>
      );
    }
    if (standing === "rated") {
      const where = verdictWhere(row);
      return (
        <div data-testid="wine-verdict" style={{ marginTop: 20 }}>
          <div style={{ ...eyebrow, opacity: 0.45 }}>Your verdict</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 8 }}>
            <span style={{
              fontFamily: SERIF, fontSize: "22px", fontWeight: 600, lineHeight: 1.2, color: INK, whiteSpace: "nowrap",
            }}>{rated.emoji} {rated.label}</span>
            <span aria-hidden="true" style={leaderLine} />
            <span style={{ ...standingDate, fontSize: "15px" }}>{shortDate(row.updated_at)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={smallCaps}>{where}</span>
            <TextAction size={12} weight={700} disabled={pending} onClick={openTiles} testId="wine-change">Change</TextAction>
          </div>
        </div>
      );
    }
    if (standing === "unrated" || tilesOpen) return tiles("How was it?");
    if (standing === "want") {
      return (
        <>
          <div style={standingLine}>
            <span style={{ fontFamily: SERIF, fontSize: "20px", fontWeight: 600, lineHeight: 1.2, color: INK, whiteSpace: "nowrap" }}>
              📌 On your want list
            </span>
            <span aria-hidden="true" style={leaderLine} />
            <span style={standingDate}>Saved {shortDate(row.updated_at)}</span>
          </div>
          <TextActions gap={22} style={{ marginTop: 4 }}>
            <TextAction disabled={pending} onClick={openTiles}>🍷 Had it</TextAction>
            <TextAction tone="quiet" opacity={0.5} disabled={pending} onClick={() => remove()}>Remove</TextAction>
          </TextActions>
        </>
      );
    }
    if (standing === "passed") {
      return (
        <>
          <div style={standingLine}>
            <span style={{ fontFamily: SERIF, fontSize: "20px", fontWeight: 600, lineHeight: 1.2, color: INK, whiteSpace: "nowrap" }}>
              👋 Passed
            </span>
            <span aria-hidden="true" style={leaderLine} />
            <span style={standingDate}>{shortDate(row.updated_at)}</span>
          </div>
          <TextAction disabled={pending} onClick={() => remove()} style={{ marginTop: 4 }}>Undo</TextAction>
        </>
      );
    }
    return (
      <TextActions centered gap={24} style={{ marginTop: 10 }}>
        <TextAction disabled={pending} onClick={openTiles}>🍷 Had it</TextAction>
        <TextAction tone="secondary" disabled={pending} onClick={() => mark("want")}>📌 Want it</TextAction>
        <TextAction tone="quiet" disabled={pending} onClick={() => mark("skip")}>👋 Pass</TextAction>
      </TextActions>
    );
  };

  return page(
    <>
      <header style={{ textAlign: "center" }}>
        {meta && <div style={eyebrow}>{meta}</div>}
        <h1 style={{
          fontFamily: SERIF, fontSize: "28px", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.01em",
          color: INK, marginTop: meta ? 10 : 0, textWrap: "balance", overflowWrap: "anywhere",
        }}>{base || name}</h1>
        {vintage && (
          <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "18px", color: BURGUNDY, marginTop: 6 }}>{vintage}</div>
        )}
      </header>
      <Divider style={{ marginTop: 20 }} />

      <div ref={standingRef} tabIndex={-1} style={{ outline: "none" }}>
        {renderStanding()}
        {actionError && <p role="alert" style={{ ...alertLine, marginTop: 10 }}>{actionError}</p>}
      </div>

      {sommNote && (
        <section>
          <SectionHead numeral={next()} label={tried ? "The Somm said" : "Why the Somm chose it"} style={{ margin: "30px 0 12px" }} />
          <p data-testid="journal-somm-note" style={{
            fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", lineHeight: 1.55, color: ink(0.8),
          }}>“{sommNote}”</p>
          {sommTag && (
            <div style={{
              fontFamily: SANS, fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: BURGUNDY, marginTop: 8,
            }}>{sommTag}</div>
          )}
          {row?.occasion && (
            <p style={{ fontFamily: SANS, fontSize: "12px", lineHeight: 1.5, color: ink(0.55), marginTop: 6 }}>
              That night: “{row.occasion}”
            </p>
          )}
        </section>
      )}

      {tried && (
        <section>
          <SectionHead numeral={next()} label="Your note" style={{ margin: "30px 0 2px" }} />
          <RuledField
            variant="note"
            value={note}
            onChange={onNoteChange}
            onBlur={flushNote}
            maxLength={NOTE_MAX}
            placeholder="A line for future you…"
            aria-label="Your note"
            data-testid="wine-note"
          />
          {noteFailed && (
            <p role="alert" style={{ ...alertLine, fontSize: "13px", marginTop: 8 }}>
              Couldn’t save that note — it’ll try again when you next edit it.
            </p>
          )}
        </section>
      )}

      {lines.length > 0 && (
        <section>
          <SectionHead numeral={next()} label="What it did to your palate" style={{ margin: "30px 0 2px" }} />
          {lines.map(({ id, line }) => (
            <div key={id} style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: `1px solid ${ink(0.07)}` }}>
              <span aria-hidden="true" style={{ fontSize: "15px", width: 22, flexShrink: 0, lineHeight: 1.4 }}>{line.emoji}</span>
              <span style={{ fontFamily: SERIF, fontSize: "16px", lineHeight: 1.4, color: INK }}>{line.text}</span>
            </div>
          ))}
        </section>
      )}

      {factRows.length > 0 && (
        <section>
          <SectionHead numeral={next()} label="The particulars" style={{ margin: "30px 0 2px" }} />
          {factRows.map(([label, value]) => <FactRow key={label} label={label} value={value} />)}
        </section>
      )}

      {vein.length > 0 && (
        <section>
          <SectionHead numeral={next()} label="In the same vein" style={{ margin: "30px 0 2px" }} />
          {vein.map((v) => {
            const split = splitVintage(v.name);
            const mark = journalMark(v.row);
            return (
              <WineRow
                key={v.name}
                name={split.base}
                vintage={split.vintage}
                meta={metaLine(placeName(v.region), v.grape) || undefined}
                metaRight={mark ? <span style={{ fontSize: "13px", letterSpacing: 0 }}>{mark}</span> : undefined}
                href={wineHref(v.name)}
              />
            );
          })}
        </section>
      )}

      {tried && (
        <div style={{ textAlign: "center", marginTop: 26 }}>
          <TextAction tone="quiet" underlined disabled={pending} onClick={() => remove({ leave: true })} testId="wine-remove">
            {removing ? "Removing…" : "Remove from journal"}
          </TextAction>
        </div>
      )}
    </>
  );
}
