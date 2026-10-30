"use client";

// Match & picks — /recommend (The House List §8.3, Phase 3; screens 05–10).
//
// One client page, three views: Input ("Match the wine list" + Tonight's
// terms) → Reading (the Somm is reading: full screen, no running head) →
// Your picks. The old page's logic stays as it was: scan / PDF / URL /
// paste paths, matchWinesAgainstDNA → curatePicks, Ask the Somm with its
// silent fallback, the verdict session ids, choose / replace / bypass and
// the choose-created wishlist cleanup, multi-page scans, handleRefilter, the
// steer and its caps. What's new beyond presentation:
//   - Reading commits nothing until the picks land: analyzeEntries() scores
//     and curates (pure), commitAnalysis() sets state, starts the Somm and
//     records menu_analyzed — so Cancel, at any beat, leaves the page as it
//     was, with no Somm call and no ledger row. A newer list supersedes an
//     older one the same way: a stale response is ignored when it lands.
//   - Tonight's terms start from wine_profiles.preferences (decision D8).
//   - A pick the user already knows wears a flag ("❤️ Loved it in August",
//     "📌 On your want list"), matched to the journal by normalized name;
//     an already-rated pick offers only the choose action.
//   - Rating a pick opens RatingTiles in place, and a done line replaces the
//     "Rating saved!" toast. Evolution and shift toasts stay (house Toast).
//   - Choosing quiets the other picks (faded, no choose button); the pill's
//     Change brings their choose buttons back. Nothing is un-chosen until
//     another pick is chosen — the ledger's `replaced` semantics.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { parseWineList, matchWinesAgainstDNA, curatePicks, buildMenuContext, buildFeedbackSignals, getPickTypeInfo, getCountryName, getRegionDisplayName, getVarietalDisplayName, formatWineName, getPickCount } from "@/lib/matchEngine";
import { buildSommPayload } from "@/lib/sommPicks";
import { resolveAndAccumulate } from "@/lib/dnaEvolution";
import { maybeRecomposeIdentity, shiftToastMessage } from "@/lib/identityRecompose";
import { recordEvent, ratingEventPayload, pickChosenPayload, sommBypassedPayload } from "@/lib/wineEvents";
import { evolutionToastMessages } from "@/components/WineRecList";
import { splitVintage } from "@/lib/vintage";
import { numeralCounter } from "@/lib/numerals";
import { metaLine, pickFlag, pickNote, picksSubline, readingLine, termsLine } from "@/lib/houseCopy";
import { findJournalRow, termsFromPreferences } from "@/lib/matchTerms";
import PalateMark from "@/components/PalateMark";
import RunningHead from "@/components/house/RunningHead";
import SectionHead from "@/components/house/SectionHead";
import LeaderEntry from "@/components/house/LeaderEntry";
import RuledField from "@/components/house/RuledField";
import TextAction, { TextActions } from "@/components/house/TextAction";
import ProgressLine from "@/components/house/ProgressLine";
import Divider from "@/components/house/Divider";
import EmptyState from "@/components/house/EmptyState";
import Toast, { useToast } from "@/components/house/Toast";
import TonightsTerms, { STEER_MAX } from "./TonightsTerms";
import PickEntry from "./PickEntry";
import { BURGUNDY, COLUMN, CREAM, GRADIENT, GUTTER, INK, PILL_SHADOW, SANS, SERIF, SOFT_OUT, TYPE, ink } from "@/components/house/tokens";

// ─── Image compression utility ───
// Returns a compressed JPEG Blob (default: max 1200px, 0.7 quality — wine list text stays readable)
function compressImage(file, maxDim = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Compression failed")); return; }
        resolve(blob);
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ─── Base64 encoding utility ───
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Verdict session id ───
// One id per table sitting (minted on mount, re-minted on Scan another
// list). It rides menu_analyzed / pick_chosen / somm_bypassed / pick_rated
// payloads so the watchtower funnel (§11e) counts dinners, not page-scans
// or re-asks.
function mintVerdictSession() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
  } catch { /* insecure context — fall through */ }
  return Math.random().toString(36).slice(2, 10);
}

// Each reading beat after the list comes back — real progress, held just
// long enough to read
const READ_BEAT_MS = 650;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// What the Somm last read, as a comparable key: the steer as its payload
// carries it (trimmed, capped), the color, the spend as numbers
const termsKeyOf = (steerText, color, min, max) =>
  JSON.stringify([steerText || null, color, min ?? null, max ?? null]);
const priceOf = (digits) => (digits ? parseFloat(digits) : null);

// The grape line when the engine didn't map one: Vision's own variety, or a
// blend named by the wine's color (the old chips' fallback)
function fallbackGrape(pick) {
  const v = pick.visionData?.variety?.trim();
  if (v && v.toLowerCase() !== "null") {
    return v.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  const color = pick.detectedColor || pick.visionData?.color || null;
  if (color === "sparkling") return "Sparkling Blend";
  if (color === "rosé") return "Rosé Blend";
  return null;
}

/** A pick's printable facts: name and vintage apart, REGION · GRAPE, and
 *  the display names its engine note may use (never ids). */
function pickFacts(pick) {
  const { base, vintage: trailing } = splitVintage(formatWineName(pick.name));
  const vintage = trailing || pick.vintage || pick.name.match(/((?:19|20)\d{2})/)?.[1] || null;
  const region = pick.detectedRegionIds?.length > 0
    ? getRegionDisplayName(pick.detectedRegionIds[0], pick.detectedCountry)
    : null;
  const country = pick.detectedCountry ? getCountryName(pick.detectedCountry) : null;
  const grape = pick.detectedVarietalId ? getVarietalDisplayName(pick.detectedVarietalId) : null;
  return {
    name: base,
    // A vintage set inside the name is never printed twice
    vintage: vintage && !base.includes(String(vintage)) ? String(vintage) : null,
    meta: metaLine(region || country, grape || fallbackGrape(pick)),
    names: { producer: pick.detectedProducer, region, grape, country },
  };
}

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `22px ${GUTTER}px 56px` };
const alertLine = { fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.5, color: BURGUNDY };

/** A mount reveal: fade + 10px rise (§6 Motion). */
function Rise({ children, style, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.animate?.(
      [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 300, easing: SOFT_OUT },
    );
  }, []);
  return <div ref={ref} style={style} {...rest}>{children}</div>;
}

/** "Get my picks" — the pill beside the link and under the pasted list. */
function PillButton({ children, disabled, onClick, testId }) {
  return (
    <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} style={{
      height: 40, padding: "0 16px", flexShrink: 0, borderRadius: 100, border: "none",
      fontFamily: SANS, fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap",
      cursor: disabled ? "default" : "pointer", transition: "all 0.15s ease",
      ...(disabled
        ? { background: "rgba(139,35,50,0.15)", color: "rgba(139,35,50,0.45)" }
        : { background: GRADIENT, color: CREAM, boxShadow: PILL_SHADOW }),
    }}>{children}</button>
  );
}

/** The pasted list: a borderless textarea on a dotted rule, solid on focus. */
function PasteField({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      data-testid="wine-list-textarea"
      className="house-field"
      aria-label="The wine list"
      rows={6}
      value={value}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={"Paste the wine list here…\n\ne.g.\nCloudy Bay Sauvignon Blanc, Marlborough 2022...$52\nKanonkop Pinotage, Stellenbosch 2019...$68"}
      style={{
        display: "block", width: "100%", boxSizing: "border-box", resize: "vertical",
        border: "none", borderRadius: 0, outline: "none", background: "transparent",
        borderBottom: focused ? `1.5px solid ${BURGUNDY}` : `1.5px dotted ${ink(0.3)}`,
        padding: "10px 0 8px", fontFamily: SANS, fontSize: "16px", lineHeight: 1.6, color: INK,
        transition: "border-color 0.15s ease",
      }}
    />
  );
}

export default function MatchList({ isMobile = false }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // The journal as it stood at load — the picks' flags. A failed read
  // flags nothing (unknown ≠ empty)
  const [journalRows, setJournalRows] = useState([]);
  // Tonight's terms
  const [colorPref, setColorPref] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [steer, setSteer] = useState("");
  // Bringing the list
  const [linkOpen, setLinkOpen] = useState(false);
  const [menuUrl, setMenuUrl] = useState("");
  const [showPasteMode, setShowPasteMode] = useState(false);
  const [wineListText, setWineListText] = useState("");
  const [extractedFrom, setExtractedFrom] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  // The reading state — { line, progress } while the Somm reads
  const [reading, setReading] = useState(null);
  // The analysis
  const [picks, setPicks] = useState(null);
  const [scoredEntries, setScoredEntries] = useState(null);
  const [totalParsed, setTotalParsed] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  // The Somm
  const [sommState, setSommState] = useState("idle"); // idle | pending | done | fallback
  const [sommNotes, setSommNotes] = useState({});     // wineKey → note
  const [sommSummary, setSommSummary] = useState("");
  const [sommTermsKey, setSommTermsKey] = useState(null);
  // Your picks
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [pickRatings, setPickRatings] = useState({});
  const [tilesOpen, setTilesOpen] = useState({});
  // The Table Verdict: the declared ordered wine (one per session,
  // changeable), Change's reopened choice, and the "went a different way"
  // affordance state
  const [chosenWine, setChosenWine] = useState(null);
  const [changing, setChanging] = useState(false);
  const [bypassState, setBypassState] = useState(null); // null | "noted" | "dismissed"
  const sommSeqRef = useRef(0);
  const readTokenRef = useRef(0);
  const verdictSessionRef = useRef(null);
  if (!verdictSessionRef.current) verdictSessionRef.current = mintVerdictSession();
  // Wishlist rows THIS sitting's choose created (proven absent before the
  // upsert). Provenance can't be read back off the columns, but a replacement
  // can only happen in the sitting that chose — so in-memory is complete.
  const chooseCreatedRef = useRef(new Set());
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const addPageInputRef = useRef(null);
  const userDNARef = useRef(null);
  const ratedInteractionsRef = useRef([]);
  const accumulatedEntriesRef = useRef([]);
  const { toasts, showToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user || null;
        setUser(u);
        if (u) {
          const { data } = await supabase.from("wine_profiles").select("*").eq("user_id", u.id).single();
          if (data) {
            setProfile(data);
            // Tonight's terms start from Account › At the table (D8)
            const terms = termsFromPreferences(data.preferences);
            setColorPref(terms.color);
            setMinPrice(terms.min);
            setMaxPrice(terms.max);
          }
          // The journal flags the picks the user already knows; its rated
          // rows feed both feedback-aware scoring and the somm payload
          const { data: journal, error: journalErr } = await supabase
            .from("wine_interactions")
            .select("wine_name, rating, interaction_type, resolved_varietal, resolved_region, updated_at")
            .eq("user_id", u.id);
          const rows = !journalErr && Array.isArray(journal) ? journal : [];
          ratedInteractionsRef.current = rows.filter((r) => r.rating != null);
          setJournalRows(rows);
        }
      } catch (err) {
        console.error("Init error:", err);
      }
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = reading ? "reading" : picks ? "picks" : "input";
  // Scroll to top on every step change: Match → Reading → Picks (§9.2)
  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  // ─── The reading state ───
  const beginReading = () => {
    setErrorMsg("");
    setReading({ line: readingLine("list"), progress: 0.9 });
    return ++readTokenRef.current;
  };
  const isStale = (token) => token !== readTokenRef.current;
  // Whatever is in flight is ignored when it lands; the page is as it was
  const cancelReading = () => {
    readTokenRef.current += 1;
    setReading(null);
  };

  // ─── Core analysis, split so the reading can be cancelled for free ───
  // Pure: score against the DNA (with journal feedback) and curate
  const analyzeEntries = (entries, minP, maxP, colorP) => {
    const dna = {
      countries: profile.countries || [],
      regions: profile.regions || {},
      estates: profile.estates || {},
      varietals: profile.varietals || [],
      specificWines: profile.specific_wines || [],
    };
    const feedbackSignals = ratedInteractionsRef.current.length > 0
      ? buildFeedbackSignals(ratedInteractionsRef.current)
      : null;
    const { scoredEntries: scored, userDNA } = matchWinesAgainstDNA(entries, dna, feedbackSignals);
    const matched = scored.filter((e) => e.score > 0);
    const pickCount = getPickCount(entries.length, colorP);
    const curated = curatePicks(scored, {
      minPrice: minP, maxPrice: maxP, colorPreference: colorP, maxPicks: pickCount,
      menuContext: buildMenuContext(matched), userDNA,
    });
    return { entries, scored, matched, curated, pickCount, userDNA, minP, maxP, colorP };
  };

  // The picks land: state, then The Somm (progressive enhancement — the
  // algorithmic picks are already on screen), then the ledger. `source`
  // ("scan" | "pdf" | "url" | "paste") rides the menu_analyzed event.
  const commitAnalysis = (a, source) => {
    setTotalParsed(a.entries.length);
    userDNARef.current = a.userDNA;
    setScoredEntries(a.scored);
    setPicks(a.curated);
    setSommNotes({});
    setSommSummary("");
    setSommState("idle");
    // menu_analyzed (The Long Memory) fires ONCE per analysis — from
    // askTheSomm when The Somm runs (so the outcome + duration ride along),
    // or right here when it never will (somm: null)
    const analysisMeta = { source: source || null, winesParsed: a.entries.length, matchCount: a.matched.length };
    if (a.curated.length > 0) {
      askTheSomm({
        scored: a.scored, curated: a.curated, pickCount: a.pickCount, totalWines: a.entries.length,
        minP: a.minP, maxP: a.maxP, colorP: a.colorP, analysisMeta,
      });
    } else {
      recordEvent(supabase, user.id, "menu_analyzed", {
        source: analysisMeta.source,
        wines_parsed: analysisMeta.winesParsed,
        match_count: analysisMeta.matchCount,
        steer: steer.trim() || null,
        session: verdictSessionRef.current,
        somm: null,
      });
    }
  };

  // The reading's last beats, then the picks: "Reading N wines…" →
  // "Weighing them against your DNA…" → "N bottles, N kinds of yes." Every
  // beat is real — the parse's count, the engine's weighing, the curated
  // picks — held just long enough to read. `beforeCommit` settles the
  // list's own state (pages, the extracted text) only once nothing can
  // cancel it.
  const finishReading = async (token, entries, source, beforeCommit) => {
    setReading((r) => r && { ...r, line: readingLine("count", entries.length) });
    await pause(READ_BEAT_MS);
    if (isStale(token)) return;
    setReading((r) => r && { ...r, line: readingLine("weigh", entries.length) });
    const analysis = analyzeEntries(entries, priceOf(minPrice), priceOf(maxPrice), colorPref);
    await pause(READ_BEAT_MS);
    if (isStale(token)) return;
    const done = readingLine("done", analysis.curated.length);
    if (done) {
      setReading((r) => r && { ...r, line: done, progress: 1 });
      await pause(READ_BEAT_MS);
      if (isStale(token)) return;
    }
    beforeCommit?.();
    commitAnalysis(analysis, source);
    setReading(null);
  };

  // ─── Re-filter picks without re-scoring (Tonight's terms over the picks) ───
  const handleRefilter = (newColorPref, newMinPrice, newMaxPrice) => {
    if (!scoredEntries) return;
    // Instant algorithmic re-curation; surviving picks keep their notes.
    // Invalidate any in-flight somm request so it can't overwrite this state.
    sommSeqRef.current++;
    if (sommState === "pending") setSommState("idle");
    const menuCtx = buildMenuContext(scoredEntries.filter(e => e.score > 0));
    const pickCount = getPickCount(totalParsed, newColorPref);
    const curated = curatePicks(scoredEntries, {
      minPrice: newMinPrice ? parseFloat(newMinPrice) : null,
      maxPrice: newMaxPrice ? parseFloat(newMaxPrice) : null,
      colorPreference: newColorPref,
      maxPicks: pickCount,
      menuContext: menuCtx,
      userDNA: userDNARef.current,
    });
    setPicks(curated);
  };

  const changeColor = (c) => { setColorPref(c); if (picks) handleRefilter(c, minPrice, maxPrice); };
  const changeMin = (v) => { setMinPrice(v); if (picks) handleRefilter(colorPref, v, maxPrice); };
  const changeMax = (v) => { setMaxPrice(v); if (picks) handleRefilter(colorPref, minPrice, v); };

  const wineKey = (w) => `${w.name}::${w.price}`;

  // ─── Ask The Somm: LLM curation + notes. Any failure = silent fallback ───
  // analysisMeta is present only on the first ask after an analysis — it
  // makes this call the one that records menu_analyzed (with the somm
  // outcome). "Ask the Somm again" passes none and records only the
  // somm_curation cost event.
  const askTheSomm = async ({ scored, curated, pickCount, totalWines, minP, maxP, colorP, analysisMeta = null }) => {
    const seq = ++sommSeqRef.current;
    const payload = buildSommPayload({
      scoredEntries: scored,
      algorithmicPicks: curated,
      pickCount,
      profile,
      ratedInteractions: ratedInteractionsRef.current,
      totalParsed: totalWines,
      budget: { min: minP ?? null, max: maxP ?? null },
      color: colorP === "all" ? null : colorP,
      steer: steer.trim() || null,
      display: { varietal: getVarietalDisplayName, region: getRegionDisplayName, country: getCountryName },
    });
    // The terms this ask read — "Ask the Somm again" appears once they change
    setSommTermsKey(termsKeyOf(payload.steer, colorP, minP, maxP));
    // The analysis event, fired exactly once whatever The Somm's fate.
    // somm.outcome: first_attempt | salvaged | retried | fallback, plus
    // "superseded" when a refilter abandoned the in-flight request.
    let menuAnalyzedFired = false;
    const recordMenuAnalyzed = (somm) => {
      if (!analysisMeta || menuAnalyzedFired) return;
      menuAnalyzedFired = true;
      recordEvent(supabase, user.id, "menu_analyzed", {
        source: analysisMeta.source,
        wines_parsed: analysisMeta.winesParsed,
        match_count: analysisMeta.matchCount,
        // What was actually SENT (trimmed/capped), not live input state —
        // the steer box may have been edited while the request was in flight
        steer: payload.steer,
        session: verdictSessionRef.current,
        somm,
      });
    };
    if (payload.candidates.length === 0 || !pickCount) { recordMenuAnalyzed(null); return; }

    setSommState("pending");
    const clientStart = Date.now();
    try {
      const res = await fetch("/api/somm-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const clientMs = Date.now() - clientStart;
      let data = null;
      if (res.ok) {
        try { data = await res.json(); } catch { /* malformed body → fallback below */ }
      }

      // The durable cost record — whenever the server says Claude was
      // actually called, success or fallback, superseded or not: the tokens
      // were spent either way
      if (data?.meta?.usage) {
        recordEvent(supabase, user.id, "somm_curation", {
          outcome: data.meta.outcome,
          attempts: data.meta.attempts,
          salvaged_count: data.meta.salvagedCount ?? 0,
          duration_ms: data.meta.durationMs,
          input_tokens: data.meta.usage.inputTokens,
          output_tokens: data.meta.usage.outputTokens,
          est_cost_usd: data.meta.usage.estCostUSD,
        });
      }
      const sommMs = data?.meta?.durationMs ?? clientMs;

      if (sommSeqRef.current !== seq) { // a refilter superseded this request
        recordMenuAnalyzed({ outcome: "superseded", duration_ms: sommMs });
        return;
      }
      if (!res.ok || !data) {
        setSommState("fallback");
        recordMenuAnalyzed({ outcome: "fallback", duration_ms: sommMs });
        return;
      }
      if (data.fallback || !Array.isArray(data.picks) || data.picks.length === 0) {
        setSommState("fallback");
        recordMenuAnalyzed({ outcome: "fallback", duration_ms: sommMs });
        return;
      }

      // Map candidate indices back to full scored entries; role drives the badge
      const notes = {};
      const sommPicks = [];
      for (const p of data.picks) {
        const cand = payload.candidates[p.i];
        const entry = cand && scored.find((e) => e.name === cand.name && e.price === cand.price);
        if (!entry) continue;
        sommPicks.push({ ...entry, pickType: p.role });
        notes[wineKey(entry)] = p.note;
      }
      if (sommPicks.length === 0) {
        setSommState("fallback");
        recordMenuAnalyzed({ outcome: "fallback", duration_ms: sommMs });
        return;
      }
      setPicks(sommPicks);
      setSommNotes(notes);
      setSommSummary(data.sommSummary || "");
      setSommState("done");
      recordMenuAnalyzed({ outcome: data.meta?.outcome || "first_attempt", duration_ms: sommMs });
    } catch {
      if (sommSeqRef.current === seq) setSommState("fallback");
      recordMenuAnalyzed({ outcome: "fallback", duration_ms: Date.now() - clientStart });
    }
  };

  const askAgain = () => {
    if (!scoredEntries || !picks) return;
    askTheSomm({
      scored: scoredEntries,
      curated: picks,
      pickCount: getPickCount(totalParsed, colorPref),
      totalWines: totalParsed,
      minP: priceOf(minPrice),
      maxP: priceOf(maxPrice),
      colorP: colorPref,
    });
  };

  // ─── Text analysis (paste mode, and a scan's text for review) ───
  const handleAnalyze = async () => {
    if (!wineListText.trim() || !profile) return;
    const entries = parseWineList(wineListText);
    const token = beginReading();
    // A scan that fell back to editable text still originated as a scan —
    // and it's the first page, so "Add another page" builds on it
    const fromScan = extractedFrom === "scan";
    await finishReading(token, entries, extractedFrom || "paste", () => {
      if (fromScan) {
        accumulatedEntriesRef.current = entries;
        setPageCount(1);
      }
    });
  };

  // ─── Vision scan (photo or PDF; the first page or another one) ───
  const handleVisionScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const addingPage = Boolean(picks);

    // Client-side size check
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("That file is too large (max 10MB). Try a photo at lower resolution, or photograph one page at a time.");
      return;
    }

    const token = beginReading();
    const fail = (message) => {
      if (isStale(token)) return;
      setReading(null);
      setErrorMsg(message);
    };

    try {
      let payload;
      if (file.type === "application/pdf") {
        const base64 = await blobToBase64(file);
        payload = { pdfBase64: base64 };
      } else {
        const blob = await compressImage(file);
        // Safety check: if compressed image is still > 2MB, reduce further
        let finalBlob = blob;
        if (blob.size > 2 * 1024 * 1024) {
          const reBlob = await compressImage(file, 1024, 0.6);
          finalBlob = reBlob;
        }
        const base64 = await blobToBase64(finalBlob);
        payload = { imageBase64: base64, mimeType: "image/jpeg" };
      }
      if (isStale(token)) return;

      const controller = new AbortController();
      const clientTimeout = setTimeout(() => controller.abort(), 180000);

      let res;
      try {
        res = await fetch("/api/parse-wine-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(clientTimeout);
        if (fetchErr.name === "AbortError") {
          fail("That wine list took too long to read. Try photographing one page at a time.");
          return;
        }
        throw fetchErr;
      }
      clearTimeout(clientTimeout);
      const data = await res.json();
      if (isStale(token)) return; // cancelled, or a newer list took over

      if (data.error) {
        fail(data.error);
        return;
      }

      // Path A: structured wines from Vision → direct to match engine
      if (data.wines && Array.isArray(data.wines) && data.wines.length > 0) {
        const newEntries = data.wines.map(w => ({
          name: w.name || "",
          price: typeof w.price === "number" ? w.price : null,
          originalLine: w.name || "",
          section: w.section || null,
          isByTheGlass: w.is_btg || false,
          sectionColor: w.color || null,
          sectionVarietal: null,
          vintage: w.vintage || null,
          visionData: {
            color: w.color || null,
            variety: w.variety || null,
            region: w.region || null,
            country: w.country || null,
            producer: w.producer || null,
            vintage: w.vintage || null,
          },
        }));

        // Entries accumulate across pages — once the picks land
        const entries = [...accumulatedEntriesRef.current, ...newEntries];
        await finishReading(token, entries, file.type === "application/pdf" ? "pdf" : "scan", () => {
          accumulatedEntriesRef.current = entries;
          setPageCount((n) => n + 1);
          setWineListText(data.rawText || "");
          setExtractedFrom("scan");
        });
        return;
      }

      // Path B: raw text fallback → open the pasted list for review. Another
      // page has no review step over the picks — it reads or it says so.
      if (data.rawText) {
        if (addingPage) {
          fail("Couldn't read any wines from this image. Try a clearer photo.");
          return;
        }
        setReading(null);
        setWineListText(data.rawText);
        setExtractedFrom("scan");
        setShowPasteMode(true);
        return;
      }

      fail("Couldn't read any wines from this image. Try a clearer photo.");
    } catch (err) {
      fail("Failed to process your wine list. Please try again.");
    }
  };

  // ─── URL handling ───
  const handleUrlFetch = async () => {
    const trimmed = menuUrl.trim();
    if (!trimmed) return;

    // Basic URL validation
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setErrorMsg("Please enter a valid URL starting with https://");
      return;
    }

    const token = beginReading();
    try {
      const res = await fetch("/api/fetch-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (isStale(token)) return;

      if (data.error && !data.text) {
        setReading(null);
        setErrorMsg(data.error);
        return;
      }

      const text = data.text || "";
      // The text parser — instant, no API call
      const entries = parseWineList(text);
      if (entries.length === 0) {
        setReading(null);
        setWineListText(text);
        setExtractedFrom("url");
        setShowPasteMode(true);
        setErrorMsg("Found the page but couldn't spot a wine list. Try editing the text below, or scan a photo instead.");
        return;
      }

      await finishReading(token, entries, "url", () => {
        setWineListText(text);
        setExtractedFrom("url");
      });
    } catch (err) {
      if (isStale(token)) return;
      setReading(null);
      setErrorMsg("Failed to fetch that URL. Check the address and try again.");
    }
  };

  // ─── Pick rating ───
  const showEvolutionToasts = (items, isDemotion) => {
    evolutionToastMessages(items, isDemotion).forEach((msg, i) => {
      showToast(msg, { delay: 1500 + i * 1500, duration: 4000 });
    });
  };

  const handleRatePick = async (wineName, rating) => {
    setPickRatings((prev) => ({ ...prev, [wineName]: rating }));
    setTilesOpen((prev) => ({ ...prev, [wineName]: false }));

    try {
      // Previous rating from any surface — the differential keeps a re-rate
      // from double-counting
      const { data: existing } = await supabase
        .from("wine_interactions")
        .select("rating")
        .eq("user_id", user.id)
        .eq("wine_name", wineName)
        .single();
      const previousRating = existing?.rating || null;

      const row = {
        user_id: user.id,
        wine_name: wineName,
        interaction_type: "had",
        rating: rating,
        source_url: extractedFrom === "url" ? menuUrl : (extractedFrom === "scan" ? "photo_scan" : "text_paste"),
        source_label: null,
        updated_at: new Date().toISOString(),
      };
      // When the rated wine is a current Somm pick, its note and role travel
      // with the rating into the journal. Fields are only included when we
      // have values — the upsert replaces included columns on conflict, so
      // sending nulls here would erase a note saved at the restaurant if the
      // user later re-rates without somm context.
      const pick = (picks || []).find((p) => p.name === wineName);
      const note = pick ? sommNotes[wineKey(pick)] : null;
      if (note) {
        row.somm_note = note;
        if (pick.pickType) row.somm_pick_role = pick.pickType;
      }
      // The steer travels with the rating into the journal — the memory of
      // what that night was about. The column keeps its pre-steer name
      // (occasion) — same data, no schema churn.
      const steerNote = steer.trim();
      if (steerNote) row.occasion = steerNote;
      const { error } = await supabase.from("wine_interactions").upsert(row, { onConflict: "user_id, wine_name" });

      // A rated bottle is evidence — run the evolution engine exactly like
      // WineRecList does (non-blocking): accumulate points, stamp resolved_*
      // metadata, surface promotions/demotions, then let the milestone hook
      // recompose the identity strand and celebrate a real shift
      if (!error) {
        let result = null;
        try {
          result = await resolveAndAccumulate(supabase, user.id, wineName, rating, previousRating);
        } catch (evoErr) {
          console.error("DNA evolution error (non-blocking):", evoErr);
        }
        // The ledger record (The Long Memory) — exactly once per rating,
        // old→new plus the resolved band; fire-and-forget. The session ties
        // a table-side rating back to its curation for the §11e funnel.
        recordEvent(supabase, user.id, "pick_rated", {
          ...ratingEventPayload({
            wine: wineName, rating, previousRating, surface: "recommend",
            confidence: result?.resolution?.confidence,
          }),
          session: verdictSessionRef.current,
        });
        if (result) {
          try {
            if (result.promotions?.length > 0) showEvolutionToasts(result.promotions, false);
            if (result.demotions?.length > 0) showEvolutionToasts(result.demotions, true);
            const shift = await maybeRecomposeIdentity(supabase, user.id, { ...result, rating });
            if (shift?.shifted) {
              const evoCount = (result.promotions?.length || 0) + (result.demotions?.length || 0);
              showToast(shiftToastMessage(shift), { delay: 1500 + evoCount * 1500, duration: 5000 });
            }
          } catch (evoErr) {
            console.error("DNA evolution error (non-blocking):", evoErr);
          }
        }
      }
    } catch (err) {
      console.error("Rating save error:", err);
    }
  };

  // ─── The Table Verdict: "this one's on the table" ───
  // Declaring the ordered wine. One chosen pick per session, changeable —
  // choosing another pick simply moves the declaration. Choosing is INTENT,
  // never DNA evidence (standing decision: DNA is tasted-evidence-only;
  // rating remains the only gate). Two durable writes: the pick_chosen
  // ledger event, and a journal wishlist row carrying the somm note/role/
  // steer — the 9pm rating must land them even though this screen is pure
  // client state and won't survive until then.
  const handleChoosePick = async (pick) => {
    const previous = chosenWine && chosenWine !== pick.name ? chosenWine : null;
    setChosenWine(pick.name);
    setChanging(false);
    setBypassState(null);
    showToast("🥂 Noted — enjoy it");

    recordEvent(supabase, user.id, "pick_chosen", pickChosenPayload({
      wine: pick.name,
      role: pick.pickType || null,
      price: typeof pick.price === "number" ? pick.price : null,
      steer,
      session: verdictSessionRef.current,
      replaced: previous,
    }));

    try {
      // Preserve an existing "had" row — re-ordering an already-rated wine
      // must not demote it to the wishlist
      const { data: existing, error: existingErr } = await supabase
        .from("wine_interactions")
        .select("interaction_type")
        .eq("user_id", user.id)
        .eq("wine_name", pick.name)
        .single();
      // PGRST116 (zero rows) is the only outcome that PROVES no row existed;
      // any other failure means we can't claim this choose created the row
      const provenAbsent = !existing && existingErr?.code === "PGRST116";
      const row = {
        user_id: user.id,
        wine_name: pick.name,
        interaction_type: existing?.interaction_type === "had" ? "had" : "want",
        source_url: extractedFrom === "url" ? menuUrl : (extractedFrom === "scan" ? "photo_scan" : "text_paste"),
        updated_at: new Date().toISOString(),
      };
      const note = sommNotes[wineKey(pick)];
      if (note) {
        row.somm_note = note;
        if (pick.pickType) row.somm_pick_role = pick.pickType;
      }
      const steerNote = steer.trim();
      if (steerNote) row.occasion = steerNote.slice(0, 200);
      const { error: upsertErr } = await supabase.from("wine_interactions").upsert(row, { onConflict: "user_id, wine_name" });
      if (!upsertErr && provenAbsent) chooseCreatedRef.current.add(pick.name);

      // The banner moved: the previous wine's wishlist row is stale STATE
      // (the ledger's `replaced` keeps the history).
      await cleanupChooseCreatedRow(previous);
    } catch (err) {
      console.error("Choose save error (non-blocking):", err);
    }
  };

  // The walk-away cleanup, shared by replacement and bypass: delete a
  // wishlist row ONLY if this sitting's choose created it (the in-session
  // mark), and only while it's still an unrated want — a rating that landed
  // in between is a journal fact, kept. Every failure degrades to the row
  // lingering, never to a wrong delete.
  const cleanupChooseCreatedRow = async (wineName) => {
    if (!wineName || !chooseCreatedRef.current.has(wineName)) return;
    try {
      const { error } = await supabase
        .from("wine_interactions")
        .delete()
        .eq("user_id", user.id)
        .eq("wine_name", wineName)
        .eq("interaction_type", "want")
        .is("rating", null);
      if (!error) chooseCreatedRef.current.delete(wineName);
    } catch { /* linger, never wrong-delete */ }
  };

  // ─── The Table Verdict: "went a different way" ───
  // Session-level walk-away. Supersedes any chosen pick; the confirmation
  // offers the bottle-log handoff so a rogue night still feeds DNA through
  // the normal tasted-evidence path.
  const handleBypass = () => {
    setBypassState("noted");
    recordEvent(supabase, user.id, "somm_bypassed", sommBypassedPayload({
      session: verdictSessionRef.current,
      steer,
      picksShown: picks ? picks.length : null,
      hadChosen: chosenWine,
    }));
    // The table walked away from the chosen wine too — same cleanup as a
    // replacement (fire-and-forget; the UI beat never waits on it)
    cleanupChooseCreatedRow(chosenWine);
    setChosenWine(null);
    setChanging(false);
  };

  // Scan another list — and the running head's ‹ Match a list
  const handleReset = () => {
    setPicks(null);
    setScoredEntries(null);
    setWineListText("");
    setTotalParsed(0);
    setErrorMsg("");
    setMenuUrl("");
    setExtractedFrom(null);
    setShowPasteMode(false);
    setPageCount(0);
    accumulatedEntriesRef.current = [];
    sommSeqRef.current++;
    setSommNotes({});
    setSommSummary("");
    setSommState("idle");
    setSommTermsKey(null);
    setAdjustOpen(false);
    setTilesOpen({});
    // A new table sitting: fresh verdict session, cleared declarations —
    // and cleared provenance: a NEW sitting must never delete rows a
    // previous sitting's choose created (that choice stands as its last
    // table moment)
    setChosenWine(null);
    setChanging(false);
    setBypassState(null);
    verdictSessionRef.current = mintVerdictSession();
    chooseCreatedRef.current = new Set();
  };

  const loadExample = () => {
    setExtractedFrom(null);
    setShowPasteMode(true);
    setWineListText(`WHITES
Cloudy Bay Sauvignon Blanc, Marlborough 2022............$52
Domaine William Fèvre Chablis Premier Cru 2021.........$78
Trimbach Riesling, Alsace 2021..........................$44
Cakebread Chardonnay, Napa Valley 2021.................$72
Jordan Chardonnay, Russian River Valley 2021...........$64
Ken Forrester Old Vine Chenin Blanc, Stellenbosch......$38
Sancerre, Domaine Vacheron 2022........................$62

REDS
Hamilton Russell Pinot Noir, Walker Bay 2020...........$85
Kanonkop Pinotage, Stellenbosch 2019...................$68
Meerlust Rubicon, Stellenbosch 2018....................$92
Catena Zapata Malbec, Mendoza 2020.....................$58
Penfolds Bin 389 Cabernet Shiraz, South Australia......$74
Ridge Monte Bello, Santa Cruz Mountains 2019..........$250
Domaine de la Côte-Rôtie, E. Guigal 2019.............$115
Boekenhoutskloof Syrah, Swartland 2020.................$72
Château Lynch-Bages, Pauillac 2018....................$185
Viña Almaviva, Puente Alto 2019.......................$165
Marchesi Antinori Tignanello 2019.....................$145
Vega Sicilia Unico, Ribera del Duero 2012.............$350
Pommard Premier Cru, Domaine de Courcel 2019..........$132
Central Otago Pinot Noir, Felton Road 2021.............$95
Barolo, Giacomo Conterno 2018.........................$210`);
  };

  // ─── Loading state ───
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
      </div>
    );
  }

  // ─── Auth gate ───
  if (!user) {
    return (
      <main style={column}>
        <EmptyState
          emoji="📋"
          title="Sign in to continue"
          sub="You need an account and a Wine DNA profile to get restaurant recommendations."
          action="Sign in"
          href="/login?next=%2Frecommend"
        />
      </main>
    );
  }

  // ─── Profile gate ───
  if (!profile) {
    return (
      <main style={column}>
        <EmptyState
          emoji="🧬"
          title="Build your Wine DNA first"
          sub="Take the quick quiz to tell us what wines you love, then come back here to get personalized picks from any restaurant wine list."
          action="Take the quiz"
          href="/"
        />
      </main>
    );
  }

  const termsProps = {
    color: colorPref, onColor: changeColor,
    min: minPrice, max: maxPrice, onMin: changeMin, onMax: changeMax,
    steer, onSteer: setSteer,
  };

  // ═══════════════════════════════════════════════════
  // INPUT — Match the wine list (screens 05, 06)
  // ═══════════════════════════════════════════════════
  const renderInput = () => {
    const next = numeralCounter();
    return (
      <div>
        <h1 style={TYPE.h1}>Match the wine list</h1>
        <p style={{ ...TYPE.sub, marginTop: 8 }}>Share a wine list and we’ll find your best matches.</p>
        {errorMsg && (
          <p role="alert" data-testid="error-message" style={{ ...alertLine, marginTop: 18 }}>{errorMsg}</p>
        )}

        <SectionHead numeral={next()} label="Bring the list" style={{ margin: "30px 0 16px" }} />
        {/* On a phone the camera opens straight away; elsewhere the picker */}
        <LeaderEntry
          tone="filled" size={22} mark="📸" label="Photograph the list"
          sub="Take a photo of the wine list."
          onClick={() => (isMobile ? cameraInputRef : fileInputRef).current?.click()}
          testId="scan-button"
        />
        <LeaderEntry
          size={22} mark="🖼" label="Upload a picture"
          sub="A screenshot of an online list works too."
          onClick={() => fileInputRef.current?.click()}
          style={{ marginTop: 22 }}
        />
        <LeaderEntry
          size={22} mark="🔗" label="Paste a link"
          sub={linkOpen ? undefined : "Got a link to the wine list? Drop it here."}
          expanded={linkOpen}
          onClick={() => setLinkOpen((open) => !open)}
          style={{ marginTop: 22 }}
        />
        {linkOpen && (
          <Rise style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: 8 }}>
            <RuledField
              variant="url"
              type="url"
              inputMode="url"
              autoFocus
              value={menuUrl}
              onChange={(e) => setMenuUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleUrlFetch();
                }
              }}
              placeholder="https://…"
              aria-label="Link to the wine list"
              autoComplete="off"
              data-testid="url-input"
              style={{ flex: 1, minWidth: 0 }}
            />
            <PillButton testId="url-fetch-button" disabled={!menuUrl.trim()} onClick={handleUrlFetch}>
              Get my picks
            </PillButton>
          </Rise>
        )}
        <div style={{ marginTop: 14 }}>
          <TextAction
            tone="quiet" underlined opacity={0.5} testId="paste-mode-toggle"
            ariaExpanded={showPasteMode} onClick={() => setShowPasteMode((open) => !open)}
          >or paste the text manually</TextAction>
        </div>
        {showPasteMode && (
          <Rise style={{ marginTop: 4 }}>
            {extractedFrom && wineListText && (
              <p style={{ fontFamily: SANS, fontSize: "12px", lineHeight: 1.5, color: ink(0.6), marginBottom: 4 }}>
                {extractedFrom === "scan" ? "📸 Extracted from your photo" : "🔗 Extracted from the link"} — review and edit if needed.
              </p>
            )}
            <PasteField value={wineListText} onChange={(e) => setWineListText(e.target.value)} />
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 14 }}>
              <PillButton testId="analyze-button" disabled={!wineListText.trim()} onClick={handleAnalyze}>
                Get my picks
              </PillButton>
              <TextAction tone="quiet" opacity={0.55} onClick={loadExample}>Try an example list</TextAction>
            </div>
          </Rise>
        )}

        <SectionHead numeral={next()} label="Tonight’s terms" style={{ margin: "24px 0 10px" }} />
        <TonightsTerms {...termsProps} steerId="steer-input" />
      </div>
    );
  };

  // ═══════════════════════════════════════════════════
  // READING — the Somm is reading (screen 07)
  // ═══════════════════════════════════════════════════
  const renderReading = () => (
    <div data-testid="processing-spinner" style={{
      minHeight: "100vh", maxWidth: COLUMN, margin: "0 auto", padding: "0 44px",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center",
    }}>
      <PalateMark genome={profile.identity?.genome} size={96} />
      <div style={{ ...TYPE.eyebrow, letterSpacing: "0.24em", marginTop: 28 }}>🍷 The Somm is reading</div>
      <p aria-live="polite" style={{
        fontFamily: SERIF, fontStyle: "italic", fontSize: "22px", lineHeight: 1.35, color: INK,
        marginTop: 12, minHeight: 60, textWrap: "balance",
      }}>{reading.line}</p>
      <ProgressLine
        variant="reading" value={reading.progress} duration={reading.progress >= 1 ? 500 : 2300}
        label="Reading the list" style={{ marginTop: 14 }}
      />
      <TextAction tone="quiet" opacity={0.5} onClick={cancelReading} style={{ marginTop: 36 }}>Cancel</TextAction>
    </div>
  );

  // ═══════════════════════════════════════════════════
  // YOUR PICKS (screens 08–10)
  // ═══════════════════════════════════════════════════
  const renderPicks = () => {
    const hasPicks = picks.length > 0;
    // Quiet the others only while the chosen pick is on screen — a refilter
    // or the Somm's re-curation may have taken it off the list
    const chosenShown = Boolean(chosenWine) && picks.some((p) => p.name === chosenWine);
    const askAgainVisible = hasPicks && sommState !== "pending"
      && termsKeyOf(steer.trim().slice(0, STEER_MAX), colorPref, priceOf(minPrice), priceOf(maxPrice)) !== sommTermsKey;
    const seenKeys = new Set();
    return (
      <div>
        <h1 data-testid="results-heading" style={TYPE.h1}>{hasPicks ? "Your picks" : "No matches found"}</h1>
        <p style={{ ...TYPE.sub, marginTop: 8 }}>
          {picksSubline({ wines: totalParsed, pages: pageCount, picks: picks.length })}
        </p>

        {/* The terms bar — Adjust opens Tonight's terms in place */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          marginTop: 16, padding: "6px 0", borderTop: `1px solid ${ink(0.1)}`, borderBottom: `1px solid ${ink(0.1)}`,
        }}>
          <span style={{
            fontFamily: SANS, fontSize: "10px", fontWeight: 600, lineHeight: 1.5, textTransform: "uppercase",
            letterSpacing: "0.14em", color: ink(0.55), minWidth: 0, overflowWrap: "anywhere",
          }}>{termsLine({ color: colorPref, min: minPrice, max: maxPrice, steer })}</span>
          <TextAction size={12} weight={700} ariaExpanded={adjustOpen} onClick={() => setAdjustOpen((open) => !open)}>
            Adjust ›
          </TextAction>
        </div>
        {adjustOpen && (
          <Rise style={{ marginTop: 18 }}>
            <TonightsTerms {...termsProps} steerId="steer-input-results" />
            {askAgainVisible && (
              <TextAction weight={700} testId="ask-somm-again" onClick={askAgain} style={{ marginTop: 8 }}>
                🍷 Ask the Somm again
              </TextAction>
            )}
          </Rise>
        )}

        {/* The Somm says — "tasting" while it curates; omitted on fallback */}
        {hasPicks && sommState === "pending" && (
          <div data-testid="somm-thinking" style={{ textAlign: "center", marginTop: 28 }}>
            <div style={TYPE.eyebrow}>🍷 The Somm says</div>
            <p style={{
              fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.55, color: ink(0.55), marginTop: 10,
            }}>The Somm is tasting…</p>
          </div>
        )}
        {hasPicks && sommState === "done" && sommSummary && (
          <div data-testid="somm-summary" style={{ textAlign: "center", marginTop: 28 }}>
            <div style={TYPE.eyebrow}>🍷 The Somm says</div>
            <p style={{
              fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", lineHeight: 1.55, color: INK,
              marginTop: 10, textWrap: "pretty",
            }}>{sommSummary}</p>
          </div>
        )}

        {hasPicks && (
          <div data-testid="picks-container">
            {picks.map((pick, i) => {
              const facts = pickFacts(pick);
              const typeInfo = getPickTypeInfo(pick.pickType);
              const journalRow = findJournalRow(pick.name, journalRows);
              const rating = pickRatings[pick.name] || null;
              const chosen = chosenWine === pick.name;
              const quiet = chosenShown && !chosen && !changing;
              const sommNote = sommNotes[wineKey(pick)] || null;
              // Stable keys keep a pick's own state (open tiles, focus) when
              // the Somm reorders the list
              let key = wineKey(pick);
              if (seenKeys.has(key)) key = `${key}::${i}`;
              seenKeys.add(key);
              return (
                <PickEntry
                  key={key}
                  index={i}
                  wine={pick.name}
                  role={`${typeInfo.emoji} ${typeInfo.label}`}
                  name={facts.name}
                  vintage={facts.vintage}
                  price={pick.price != null ? `$${pick.price}` : null}
                  meta={facts.meta}
                  flag={rating ? null : pickFlag(journalRow)}
                  note={sommNote || pickNote({ reasons: (pick.matchReasons || []).map((r) => r.type), ...facts.names })}
                  sommNote={Boolean(sommNote)}
                  chosen={chosen}
                  quiet={quiet}
                  changing={changing}
                  canChoose={!chosen && !quiet}
                  canRate={!chosen && !journalRow?.rating && !rating && !tilesOpen[pick.name]}
                  tilesOpen={Boolean(tilesOpen[pick.name]) && !rating}
                  rating={rating}
                  onChoose={() => handleChoosePick(pick)}
                  onOpenRate={() => setTilesOpen((prev) => ({ ...prev, [pick.name]: true }))}
                  onRate={(r) => handleRatePick(pick.name, r)}
                  onChange={() => setChanging((c) => !c)}
                />
              );
            })}
          </div>
        )}
        {chosenWine && (
          <p style={{
            textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.5,
            color: ink(0.6), marginTop: 24,
          }}>We’ll ask how it drank tomorrow morning.</p>
        )}

        <Divider style={{ marginTop: 36 }} />
        {hasPicks && bypassState === null && (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <TextAction tone="quiet" underlined opacity={0.5} testId="bypass-somm" onClick={handleBypass}>
              We went a different way tonight
            </TextAction>
          </div>
        )}
        {hasPicks && bypassState === "noted" && (
          <Rise data-testid="bypass-noted" style={{ textAlign: "center" }}>
            <p style={{
              fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.55, color: INK,
              marginTop: 20, textWrap: "pretty",
            }}>Fair enough — the table calls it. Log what you drank and your palate still gets the night.</p>
            <TextActions centered gap={28} style={{ marginTop: 4 }}>
              <TextAction weight={700} href="/log" testId="bypass-log-link">📸 Log what you drank</TextAction>
              <TextAction tone="quiet" testId="bypass-skip" onClick={() => setBypassState("dismissed")}>Skip</TextAction>
            </TextActions>
          </Rise>
        )}
        {errorMsg && (
          <p role="alert" data-testid="error-message" style={{ ...alertLine, textAlign: "center", marginTop: 18 }}>
            {errorMsg}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 8 }}>
          {extractedFrom === "scan" && (
            <TextAction tone="secondary" onClick={() => addPageInputRef.current?.click()}>📸 Add another page</TextAction>
          )}
          <TextAction testId="scan-again-button" onClick={handleReset}>📋 Scan another list</TextAction>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Full-screen while the Somm reads: no running head (§7.11). Over the
          picks, back steps to the input — the picks are this page's own
          state, so the trail keeps calling it "Match a list" (a "Your
          picks" label elsewhere would land on an empty Match page) */}
      {view !== "reading" && (
        <RunningHead {...(view === "picks" && { backLabel: "Match a list", onBack: handleReset })} />
      )}
      {/* Mounted in every view: a new list can arrive mid-read (it
          supersedes the old one) and "Add another page" lives over the picks */}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleVisionScan}
        style={{ display: "none" }} data-testid="file-input-scan" />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleVisionScan}
        style={{ display: "none" }} data-testid="file-input-camera" />
      <input ref={addPageInputRef} type="file" accept="image/*,application/pdf" onChange={handleVisionScan}
        style={{ display: "none" }} data-testid="file-input-add-page" />
      {view === "reading" ? renderReading() : (
        <main style={column}>{view === "picks" ? renderPicks() : renderInput()}</main>
      )}
      <Toast toasts={toasts} />
    </>
  );
}
