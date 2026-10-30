"use client";

// Log a bottle — /log (The House List §8.2), moved out of home in Phase 2.
//
// One client page, five steps: find → search | scanning → rate → saved.
// The logging semantics are home's, moved verbatim: compressImage → POST
// /api/scan-label reads the label; the save runs previousRating read →
// upsert had + rating (+ note/place) → resolveAndAccumulate →
// maybeRecomposeIdentity → bottle_logged (fire-and-forget) →
// specific_wines. The saved step is the celebration — no toasts here — and
// it re-reads the genome after the recompose so the bloom shows the change.
//
// Which name gets saved (logEntry.js, unit-tested): a label scan saves
// producer + name exactly as home always did (its vintage shows, but stays
// out of the name). Search, want-list and as-written picks save their stored
// name byte for byte unless it's edited, so logging a want row turns that
// SAME journal row into a "had".

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { compressImage } from "@/lib/image-utils";
import { resolveAndAccumulate } from "@/lib/dnaEvolution";
import { maybeRecomposeIdentity } from "@/lib/identityRecompose";
import { resolveWine } from "@/lib/wineResolver";
import { recordEvent, ratingEventPayload } from "@/lib/wineEvents";
import { ratingFor } from "@/lib/ratings";
import { numeralCounter } from "@/lib/numerals";
import { entryFromName, entryFromScan, isFirstRating, nameToSave } from "@/lib/logEntry";
import { confidentMeta, metaLine, savedCopy } from "@/lib/houseCopy";
import { searchWines } from "@/lib/wineSearch";
import PalateMark from "@/components/PalateMark";
import RunningHead from "@/components/house/RunningHead";
import SectionHead from "@/components/house/SectionHead";
import LeaderEntry from "@/components/house/LeaderEntry";
import WineRow from "@/components/house/WineRow";
import RuledField from "@/components/house/RuledField";
import ChoiceLine from "@/components/house/ChoiceLine";
import RatingList from "@/components/house/RatingList";
import TextAction, { TextActions } from "@/components/house/TextAction";
import ProgressLine from "@/components/house/ProgressLine";
import EmptyState from "@/components/house/EmptyState";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, TYPE, ink } from "@/components/house/tokens";

const EYEBROWS = {
  scan: "📸 Label read",
  photo: "🖼 Read from your photo",
  search: "🔍 Found it",
  want: "📌 From your want list",
  written: "🔍 As written",
};

const PLACES = [{ id: "home", label: "At home" }, { id: "out", label: "Out" }];
const NOTE_MAX = 500;

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `22px ${GUTTER}px 56px` };
const alertLine = { fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.5, color: BURGUNDY };
const headline = {
  fontFamily: SERIF, fontSize: "27px", fontWeight: 700, lineHeight: 1.15,
  letterSpacing: "-0.01em", color: INK,
};

const squash = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** The detected name, editable in place (for Ed's review, §12.4): a
 *  borderless textarea laid over a mirror of the same text, so the vintage
 *  can sit inline after the name in italic burgundy — a textarea can't style
 *  part of its value. The mirror sizes the field; the textarea carries the
 *  value and the caret. Dotted underline on focus only. */
function NameField({ value, vintage, onChange }) {
  const [focused, setFocused] = useState(false);
  const wrap = { whiteSpace: "pre-wrap", overflowWrap: "break-word" };
  return (
    <div style={{
      position: "relative", marginTop: 10, paddingBottom: 2,
      borderBottom: focused ? `1.5px dotted ${ink(0.3)}` : "1.5px solid transparent",
    }}>
      <div aria-hidden="true" style={{ ...headline, ...wrap }}>
        {value || " "}
        {vintage && <> <span style={{ fontStyle: "italic", fontWeight: 400, color: BURGUNDY }}>{vintage}</span></>}
      </div>
      <textarea
        data-testid="bottle-wine-name"
        aria-label={vintage ? `Wine name, vintage ${vintage}` : "Wine name"}
        value={value}
        rows={1}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...headline, ...wrap,
          position: "absolute", top: 0, left: 0, right: 0, bottom: 2, width: "100%", height: "auto",
          padding: 0, margin: 0, border: "none", borderRadius: 0, outline: "none",
          resize: "none", overflow: "hidden", background: "transparent",
          color: "transparent", WebkitTextFillColor: "transparent", caretColor: INK,
        }}
      />
    </div>
  );
}

export default function LogBottle({ initialQuery = "", isMobile = false }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [journal, setJournal] = useState([]);
  // Unknown ≠ empty: "your first entry" is only claimed from a read that worked
  const [journalOk, setJournalOk] = useState(false);
  const [step, setStep] = useState(initialQuery ? "search" : "find");
  const [query, setQuery] = useState(initialQuery);
  const [catalog, setCatalog] = useState(null);
  const [scanError, setScanError] = useState("");
  const [scanProgress, setScanProgress] = useState(0);
  const [entry, setEntry] = useState(null);
  const [rating, setRating] = useState(null);
  const [place, setPlace] = useState("home");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  // Bumped by every scan and every cancel: a response for a stale token is
  // ignored, so Cancel really cancels
  const scanToken = useRef(0);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      if (u) {
        const [profileRes, journalRes] = await Promise.all([
          supabase.from("wine_profiles").select("specific_wines, identity").eq("user_id", u.id).maybeSingle(),
          supabase.from("wine_interactions")
            .select("wine_name, interaction_type, rating, resolved_winery, resolved_region, resolved_varietal, updated_at")
            .eq("user_id", u.id)
            .order("updated_at", { ascending: false }),
        ]);
        setProfile(profileRes.data || null);
        setJournal(journalRes.data || []);
        setJournalOk(!journalRes.error && Array.isArray(journalRes.data));
      }
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to top on every step change (§9.2)
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  // The catalog is 140KB — loaded when the search step first opens, like
  // the quiz's Step 5. A failed load leaves search on the journal alone.
  useEffect(() => {
    if (step !== "search" || catalog !== null) return;
    import("@/lib/wineAutocomplete.json")
      .then((mod) => setCatalog(mod.default || mod))
      .catch(() => setCatalog([]));
  }, [step, catalog]);

  const wants = useMemo(() => journal
    .filter((r) => r.interaction_type === "want")
    .map((r) => {
      const meta = metaLine(r.resolved_region, r.resolved_varietal) || confidentMeta(resolveWine(r.wine_name));
      return { name: r.wine_name, meta: meta ? `📌 ${meta}` : undefined };
    }), [journal]);

  const results = useMemo(
    () => (catalog === null ? [] : searchWines(query, { journal, catalog })),
    [query, journal, catalog],
  );

  const beginRate = (next) => {
    setEntry(next);
    setRating(null);
    setPlace("home");
    setNote("");
    setSaveError("");
    setStep("rate");
  };

  /** A picked or typed name → a rate entry, keyed by the exact stored name.
   *  Region/grape from the journal row's resolution when there is one, else
   *  the resolver at the gate. */
  const rateByName = (source, name) => {
    const entry = entryFromName(source, name);
    if (!entry) return;
    const row = journal.find((r) => r.wine_name === name);
    beginRate({
      ...entry,
      meta: metaLine(row?.resolved_region, row?.resolved_varietal) || confidentMeta(resolveWine(name)),
    });
  };

  const openSearch = (prefill = "") => {
    setQuery(prefill);
    setStep("search");
  };

  const pickPhoto = (camera) => (camera ? cameraRef : galleryRef).current?.click();

  // ─── The label (Claude Vision via /api/scan-label) ───
  const handlePhoto = async (e, source) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting the same file
    const token = ++scanToken.current;
    const fail = (message) => {
      if (token !== scanToken.current) return;
      setScanError(message);
      setStep("find");
    };
    setScanError("");
    setScanProgress(0.9);
    setStep("scanning");

    try {
      const blob = await compressImage(file);
      const formData = new FormData();
      formData.append("image", blob, "label.jpg");
      const res = await fetch("/api/scan-label", { method: "POST", body: formData });
      const data = await res.json();
      if (token !== scanToken.current) return; // cancelled — the response is ignored

      if (!res.ok || data.error) {
        fail(data.error || "Couldn't read the label. Try a clearer photo.");
        return;
      }
      // Display name: producer + name, or whichever is available
      const displayName = [data.producer, data.name].filter(Boolean).join(" ") || null;
      if (!displayName || displayName.length < 2) {
        fail("Couldn't make out the wine name. Try a clearer photo.");
        return;
      }

      const scanned = {
        ...entryFromScan(source, displayName, data.vintage),
        meta: confidentMeta(resolveWine(displayName)) || metaLine(data.region, data.country),
      };
      // Let the reading bar complete before the rate step lands
      setScanProgress(1);
      setTimeout(() => { if (token === scanToken.current) beginRate(scanned); }, 300);
    } catch {
      fail("Failed to process image. Please try again.");
    }
  };

  const cancelScan = () => {
    scanToken.current += 1;
    setScanError("");
    setStep("find");
  };

  // ─── Save (home's handleBottleSave, moved) ───
  const save = async () => {
    if (!entry || !rating || saving) return;
    const name = nameToSave(entry);
    if (!name) return;
    const isFirst = isFirstRating(journal, journalOk);
    const cleanNote = note.trim().slice(0, NOTE_MAX);
    setSaving(true);
    setSaveError("");

    try {
      // 1. Read any existing rating first: re-logging an already-rated
      // bottle must apply the differential, not full points again
      const { data: existing } = await supabase
        .from("wine_interactions")
        .select("rating")
        .eq("user_id", user.id)
        .eq("wine_name", name)
        .single();
      const previousRating = existing?.rating || null;

      const row = {
        user_id: user.id,
        wine_name: name,
        interaction_type: "had",
        rating,
        place,
        updated_at: new Date().toISOString(),
      };
      // A blank note never erases one written on an earlier night
      if (cleanNote) row.note = cleanNote;
      const { error: upsertErr } = await supabase
        .from("wine_interactions")
        .upsert(row, { onConflict: "user_id, wine_name" });
      if (upsertErr) throw upsertErr;

      // 2. DNA evolution: resolve, accumulate, promote — then the milestone
      // hook may recompose the identity
      let evolutionResult = null;
      let shift = null;
      try {
        evolutionResult = await resolveAndAccumulate(supabase, user.id, name, rating, previousRating);
        shift = await maybeRecomposeIdentity(supabase, user.id, { ...evolutionResult, rating });
      } catch (evoErr) {
        console.error("DNA evolution error (non-blocking):", evoErr);
      }

      // The ledger record (The Long Memory) — old→new plus the band the
      // engine actually resolved at; fire-and-forget
      recordEvent(supabase, user.id, "bottle_logged", ratingEventPayload({
        wine: name, rating, previousRating,
        surface: "log_bottle",
        confidence: evolutionResult?.resolution?.confidence,
      }));

      // 3. specific_wines follows the rating (existing logic)
      const currentSpecific = profile?.specific_wines || [];
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

      // 4. The bloom as it stands after the recompose
      let genome = profile?.identity?.genome ?? null;
      try {
        const { data } = await supabase
          .from("wine_profiles")
          .select("specific_wines, identity")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) {
          genome = data.identity?.genome ?? null;
          setProfile(data);
        }
      } catch { /* the saved step keeps the mark we had */ }

      const resolution = evolutionResult?.resolution;
      setJournal((rows) => {
        const prev = rows.find((r) => r.wine_name === name);
        const updated = {
          ...prev, wine_name: name, interaction_type: "had", rating, updated_at: row.updated_at,
          ...(resolution?.confidence > 0 && {
            resolved_winery: resolution.winery,
            resolved_region: resolution.region,
            resolved_varietal: resolution.varietal,
          }),
        };
        return [updated, ...rows.filter((r) => r.wine_name !== name)];
      });
      setSaved({
        name: [squash(entry.base) || name, entry.vintage].filter(Boolean).join(" "),
        rating,
        meta: entry.meta || confidentMeta(resolution),
        genome,
        copy: savedCopy({
          rating,
          promotions: evolutionResult?.promotions,
          demotions: evolutionResult?.demotions,
          shift,
          isFirst,
        }),
      });
      setStep("saved");
    } catch (err) {
      console.error("Bottle save failed:", err);
      setSaveError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const logAnother = () => {
    setEntry(null);
    setSaved(null);
    setRating(null);
    setNote("");
    setPlace("home");
    setQuery("");
    setScanError("");
    setStep("find");
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
      </div>
    );
  }

  if (!user) {
    return (
      <main style={column}>
        <EmptyState
          emoji="📸"
          title="Sign in to log a bottle"
          sub="Every bottle you rate sharpens your Wine DNA — sign in and we’ll keep the record."
          action="Sign in"
          href="/login?next=%2Flog"
        />
      </main>
    );
  }

  const renderFind = () => {
    const next = numeralCounter();
    return (
      <div data-testid="log-find">
        <h1 style={TYPE.h1}>Log a bottle</h1>
        <p style={{ ...TYPE.sub, marginTop: 8 }}>Snap the label and rate it — every rating sharpens your DNA.</p>
        {scanError && (
          <p role="alert" data-testid="bottle-error" style={{ ...alertLine, marginTop: 18 }}>{scanError}</p>
        )}
        <SectionHead numeral={next()} label="Find the bottle" style={{ margin: "30px 0 16px" }} />
        {isMobile && (
          <LeaderEntry
            tone="filled" size={22} mark="📸" label="Snap the label"
            sub="Front label, straight on — we’ll read the rest."
            onClick={() => pickPhoto(true)}
          />
        )}
        <LeaderEntry
          size={22} mark="🔍" label="Search by name"
          sub="Producer, grape or a few words from the label."
          onClick={() => openSearch()}
          style={{ marginTop: isMobile ? 22 : 0 }}
        />
        <LeaderEntry
          tone={isMobile ? "outline" : "filled"} size={22} mark="🖼"
          label={isMobile ? "Choose from photos" : "Upload a label photo"}
          sub="For the bottle you photographed and never logged."
          onClick={() => pickPhoto(false)}
          style={{ marginTop: 22 }}
        />
        {wants.length > 0 && (
          <>
            <SectionHead numeral={next()} label="From your want list" style={{ margin: "34px 0 2px" }} />
            {wants.map((w) => (
              <WineRow key={w.name} name={w.name} action="Log it ›" meta={w.meta}
                onClick={() => rateByName("want", w.name)} />
            ))}
          </>
        )}
      </div>
    );
  };

  const renderSearch = () => {
    const typed = squash(query);
    return (
      <div>
        <h1 style={TYPE.h1}>Search by name</h1>
        <RuledField
          variant="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Producer, grape, a word from the label"
          aria-label="Search by name"
          autoComplete="off"
          enterKeyHint="search"
          data-testid="log-search-input"
          style={{ marginTop: 14 }}
        />
        {!typed && (
          <p style={{ fontFamily: SANS, fontSize: "13px", lineHeight: 1.5, color: ink(0.5), marginTop: 12 }}>
            Try “Ken Forrester”, “Chenin” or “Swartland”.
          </p>
        )}
        {typed && catalog !== null && (results.length > 0 ? (
          results.map((r) => (
            <WineRow key={r.key} name={r.name} mark={r.mark} chevron meta={r.meta}
              onClick={() => rateByName("search", r.logName)} />
          ))
        ) : (
          <>
            <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5, color: ink(0.7), marginTop: 16 }}>
              Nothing on our list by that name yet — try the producer, or snap the label.
            </p>
            <WineRow name={`Log “${typed}” as written`} chevron onClick={() => rateByName("written", typed)} />
          </>
        ))}
        <TextActions gap={24} style={{ marginTop: 18 }}>
          <TextAction weight={700} onClick={() => pickPhoto(isMobile)}>📸 Snap the label instead</TextAction>
          <TextAction tone="quiet" opacity={0.5} onClick={() => setStep("find")}>Back</TextAction>
        </TextActions>
      </div>
    );
  };

  const renderScanning = () => (
    <div data-testid="bottle-processing" style={{
      minHeight: 640, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
    }}>
      <div aria-hidden="true" style={{ fontSize: "34px", lineHeight: 1 }}>📸</div>
      <div style={{ ...TYPE.eyebrow, letterSpacing: "0.24em", marginTop: 22 }}>Reading the label</div>
      <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "21px", lineHeight: 1.35, color: INK, marginTop: 12 }}>
        Producer, vintage, grape…
      </p>
      <ProgressLine variant="reading" value={scanProgress} duration={1600} label="Reading the label" style={{ marginTop: 20 }} />
      <TextAction tone="quiet" opacity={0.5} onClick={cancelScan} style={{ marginTop: 32 }}>Cancel</TextAction>
    </div>
  );

  const renderRate = () => {
    const next = numeralCounter();
    const canSave = Boolean(rating) && Boolean(squash(entry.base)) && !saving;
    return (
      <div data-testid="bottle-confirm">
        <div style={TYPE.eyebrow}>{EYEBROWS[entry.source] || EYEBROWS.search}</div>
        <NameField
          value={entry.base}
          vintage={entry.vintage}
          onChange={(base) => setEntry((e) => ({ ...e, base }))}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 4 }}>
          <span style={TYPE.meta}>{entry.meta}</span>
          <TextAction size={12} onClick={() => openSearch(squash(entry.base))}>Not it? Search</TextAction>
        </div>

        <SectionHead numeral={next()} label="How was it?" style={{ margin: "22px 0 2px" }} />
        <RatingList value={rating} onChange={setRating} />

        <SectionHead numeral={next()} label="The particulars" style={{ margin: "28px 0 8px" }} />
        <ChoiceLine label="Where" options={PLACES} value={place} onChange={setPlace} />
        <RuledField
          variant="note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          maxLength={NOTE_MAX}
          placeholder="A line for your journal (optional)"
          aria-label="A line for your journal"
          style={{ marginTop: 14 }}
        />

        {saveError && <p role="alert" style={{ ...alertLine, marginTop: 24 }}>{saveError}</p>}
        <LeaderEntry
          tone="filled" mark="→" label={saving ? "Saving…" : "Save to journal"}
          disabled={!canSave} onClick={save} testId="log-save"
          style={{ marginTop: saveError ? 14 : 34 }}
        />
      </div>
    );
  };

  const renderSaved = () => {
    const r = ratingFor(saved.rating);
    return (
      <div>
        <div style={{ textAlign: "center", paddingTop: 18 }}>
          <PalateMark genome={saved.genome} size={132} />
          <div style={{ ...TYPE.eyebrow, marginTop: 22 }}>{saved.copy.eyebrow}</div>
          <h1 style={{ ...headline, marginTop: 10, textWrap: "balance" }}>{saved.copy.headline}</h1>
          {saved.copy.sub && (
            <p style={{
              fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.55,
              color: ink(0.7), marginTop: 10, textWrap: "pretty",
            }}>{saved.copy.sub}</p>
          )}
        </div>
        <div style={{ marginTop: 26, padding: "16px 0", borderTop: `1px solid ${ink(0.1)}`, borderBottom: `1px solid ${ink(0.1)}` }}>
          <WineRow name={saved.name} mark={r?.emoji} meta={metaLine(saved.meta, "Today")}
            style={{ padding: 0, borderBottom: "none" }} />
        </div>
        {saved.copy.lines.map((line) => (
          <p key={line} style={{
            fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5,
            color: BURGUNDY, marginTop: 12,
          }}>{line}</p>
        ))}
        <LeaderEntry secondary label="See it in your palate" href="/palate" style={{ marginTop: 28 }} />
        <LeaderEntry secondary label="Log another bottle" onClick={logAnother} style={{ marginTop: 22 }} />
        <LeaderEntry secondary label="Back to your list" href="/" style={{ marginTop: 22 }} />
      </div>
    );
  };

  return (
    <>
      {/* Full-screen while the label is read: no running head (§7.11) */}
      {step !== "scanning" && <RunningHead />}
      <main style={column}>
        {/* Camera input opens the rear camera directly on mobile; the
            gallery input opens the photo picker or file dialog */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
          onChange={(e) => handlePhoto(e, "scan")} style={{ display: "none" }} data-testid="bottle-camera-input" />
        <input ref={galleryRef} type="file" accept="image/*"
          onChange={(e) => handlePhoto(e, "photo")} style={{ display: "none" }} data-testid="bottle-gallery-input" />

        {step === "find" && renderFind()}
        {step === "search" && renderSearch()}
        {step === "scanning" && renderScanning()}
        {step === "rate" && entry && renderRate()}
        {step === "saved" && saved && renderSaved()}
      </main>
    </>
  );
}
