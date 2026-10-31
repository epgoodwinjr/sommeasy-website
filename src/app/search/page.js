"use client";

// Search — /search (The House List §8.6, Phase 5).
//
// One field over everything the user has: their journal (tried, wanted,
// passed), their DNA, and the Somm's recommendations not yet in the
// journal. It all loads once on arrival and filters as they type
// (searchView.js — the same word-prefix matcher as Log a bottle's search).
// With no query: the last five searches, and their DNA to browse.
//
// The query rides the URL (?q=, by replaceState — the journal tab's
// pattern), so a step back from a wine page lands on the same results. A
// search is remembered (sommeasy.recentSearches) when a result opens or on
// Enter. A wine page's "Remove from journal" can step back here; its toast
// plays (carryToasts).
//
// Unknown ≠ empty: a failed read says so and offers a retry — it never
// says "Nothing for “…” on our list yet." on a guess.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { resolveWine } from "@/lib/wineResolver";
import { CONFIDENCE_GATE } from "@/lib/dnaThresholds";
import { DNA_NAMES } from "@/lib/dnaNames";
import { browseDna, dnaEntries } from "@/lib/palateView";
import { readRecentSearches, rememberSearch, searchDna, searchJournal, searchRecs } from "@/lib/searchView";
import { numeralCounter } from "@/lib/numerals";
import { wineHref } from "@/lib/navTrail";
import {
  dnaKindLabel, dnaResultLine, journalGroupLabel, journalMark, matchTag, metaLine, nothingFoundLine,
  placeName, shortDate,
} from "@/lib/houseCopy";
import RunningHead from "@/components/house/RunningHead";
import ServiceBar from "@/components/house/ServiceBar";
import Toast, { useToast } from "@/components/house/Toast";
import SectionHead from "@/components/house/SectionHead";
import WineRow from "@/components/house/WineRow";
import RuledField from "@/components/house/RuledField";
import TextAction from "@/components/house/TextAction";
import EmptyState from "@/components/house/EmptyState";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, ink, leader } from "@/components/house/tokens";

const URL_SYNC_MS = 300;

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `16px ${GUTTER}px 56px` };
const smallCaps = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 600, letterSpacing: "0.14em", lineHeight: 2.2,
  textTransform: "uppercase", color: INK, opacity: 0.45, whiteSpace: "nowrap",
};
const rowLine = {
  display: "flex", alignItems: "flex-end", gap: 8, width: "100%", textAlign: "left",
  border: "none", borderBottom: `1px solid ${ink(0.07)}`, background: "none",
  color: INK, textDecoration: "none", cursor: "pointer",
};
const rowName = { fontFamily: SERIF, fontSize: "17px", lineHeight: 1.35, color: INK, minWidth: 0, overflowWrap: "anywhere" };
const rowLeader = (alpha) => ({ flex: 1, minWidth: 14, borderBottom: leader(1.5, alpha), marginBottom: 6 });

// A recommendation's facts — only when the resolver is confident; a guess
// never decides a match or prints as a fact. Warmed once after the first
// paint (the resolver's first call builds its indexes) and cached for the
// tab's life; the results only ever peek, so typing never waits on it.
const factCache = new Map();
function warmFacts(name) {
  if (!factCache.has(name)) {
    const r = resolveWine(name);
    factCache.set(name, r.confidence >= CONFIDENCE_GATE
      ? { winery: r.winery, region: r.region, province: r.province, country: r.country, grape: r.varietal }
      : null);
  }
}
const peekFacts = (name) => factCache.get(name) ?? null;

// The query into the URL, so a step back lands on these results
function syncUrl(query) {
  try {
    const url = new URL(window.location.href);
    const q = query.trim();
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  } catch { /* Safari throttles replaceState — the URL is a convenience, never a blocker */ }
}

function Earned() {
  return <span role="img" aria-label="earned by your ratings" style={{ color: BURGUNDY }}> ✦</span>;
}

export default function SearchPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [journal, setJournal] = useState([]);
  const [profile, setProfile] = useState(null);
  const [accumulation, setAccumulation] = useState([]);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState([]);
  const [factsReady, setFactsReady] = useState(false);
  const { toasts } = useToast({ receivesCarried: true });
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const focusResults = useRef(false);
  // Arriving with a query (a step back) keeps the keyboard down
  const restored = useRef(false);
  const supabase = createClient();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") || "";
    restored.current = q.trim() !== "";
    setQuery(q);
    setRecents(readRecentSearches());

    let live = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      if (!live) return;
      setUser(u);
      if (u) {
        const [ints, prof, acc] = await Promise.all([
          supabase.from("wine_interactions").select("*").eq("user_id", u.id)
            .order("updated_at", { ascending: false }),
          supabase.from("wine_profiles").select("countries, regions, estates, varietals, recommendations")
            .eq("user_id", u.id).maybeSingle(),
          supabase.from("dna_accumulation")
            .select("dimension, dimension_value, display_name, promoted, source, interaction_count")
            .eq("user_id", u.id),
        ]);
        if (!live) return;
        if (ints.error || prof.error || acc.error || !Array.isArray(ints.data) || !Array.isArray(acc.data)) {
          setReadFailed(true);
        } else {
          setJournal(ints.data);
          setProfile(prof.data);
          setAccumulation(acc.data);
        }
      }
      setLoading(false);
    }
    init();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recs = useMemo(
    () => (Array.isArray(profile?.recommendations) ? profile.recommendations : []),
    [profile],
  );

  // Warm the recommendations' facts after the first paint
  useEffect(() => {
    if (loading || readFailed) return undefined;
    const t = setTimeout(() => {
      recs.forEach((rec) => { if (typeof rec?.wine === "string") warmFacts(rec.wine); });
      setFactsReady(true);
    }, 0);
    return () => clearTimeout(t);
  }, [loading, readFailed, recs]);

  useEffect(() => {
    if (loading) return undefined;
    const t = setTimeout(() => syncUrl(query), URL_SYNC_MS);
    return () => clearTimeout(t);
  }, [query, loading]);

  // A Recent or Browse tap fills the query; focus follows to the results
  // (not the field — that would raise a phone's keyboard over them)
  useEffect(() => {
    if (!focusResults.current) return;
    focusResults.current = false;
    resultsRef.current?.focus({ preventScroll: true });
  });

  const entries = useMemo(
    () => dnaEntries({ profile, accumulation, names: DNA_NAMES }),
    [profile, accumulation],
  );
  const q = query.trim();
  const results = useMemo(() => (q ? {
    journal: searchJournal(q, journal),
    dna: searchDna(q, entries),
    recs: searchRecs(q, { recs, journal, facts: peekFacts }),
  } : null),
  // factsReady: once the facts are warm, a rec can match on its grape or place
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [q, journal, entries, recs, factsReady]);

  const remember = () => setRecents(rememberSearch(query));
  // Opening a result: the URL catches up first, so the step back lands here
  const openResult = () => {
    syncUrl(query);
    remember();
  };
  const fill = (text) => {
    focusResults.current = true;
    setQuery(text);
  };
  const clear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  if (loading) {
    return (
      <>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
        </div>
        {/* A toast carried in from a wine page plays while the search loads */}
        <Toast toasts={toasts} aboveServiceBar />
      </>
    );
  }

  if (!user) {
    return (
      <main style={{ ...column, paddingTop: 22 }}>
        <EmptyState
          emoji="🔍"
          title="Sign in to search your wines"
          sub="Your journal, your DNA and the Somm’s picks — one search away once you’re signed in."
          action="Sign in"
          href="/login?next=%2Fsearch"
        />
      </main>
    );
  }

  const page = (body) => (
    <>
      <RunningHead hideSearch />
      <main style={column}>{body}</main>
      <Toast toasts={toasts} aboveServiceBar />
      <ServiceBar />
    </>
  );

  if (readFailed) {
    return page(
      <EmptyState
        emoji="🔍"
        title="We couldn’t search just now"
        sub="Your wines are safe — give it a moment and try again."
        action="Try again"
        onAction={() => window.location.reload()}
      />
    );
  }

  const next = numeralCounter();
  const browse = browseDna(entries);
  // Before the facts are warm, a rec may still match on its grape or place
  // — don't call it "nothing" until they are
  const nothing = results && factsReady
    && results.journal.length === 0 && results.dna.length === 0 && results.recs.length === 0;

  return page(
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <RuledField
          ref={inputRef}
          variant="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (query.trim()) {
              syncUrl(query);
              remember();
            }
            e.currentTarget.blur();
          }}
          placeholder="A wine, grape, region or producer"
          aria-label="Search your wines"
          data-testid="search-input"
          autoFocus={!restored.current}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          aria-label="Clear"
          onClick={clear}
          tabIndex={query ? 0 : -1}
          aria-hidden={query ? undefined : true}
          style={{
            width: 40, height: 44, flexShrink: 0, padding: 0, border: "none", background: "none",
            fontFamily: SANS, fontSize: "22px", color: INK, cursor: "pointer",
            opacity: query ? 0.5 : 0, pointerEvents: query ? "auto" : "none", transition: "opacity 0.15s ease",
          }}
        >×</button>
      </div>

      {!results ? (
        <>
          {recents.length > 0 && (
            <section data-testid="search-recent">
              <SectionHead numeral={next()} label="Recent" style={{ margin: "28px 0 2px" }} />
              {recents.map((r) => (
                <button key={r} type="button" onClick={() => fill(r)} style={{ ...rowLine, padding: "13px 0" }}>
                  <span style={{ ...rowName, fontStyle: "italic" }}>{r}</span>
                  <span aria-hidden="true" style={rowLeader(0.2)} />
                  <span aria-hidden="true" style={{ fontFamily: SANS, fontSize: "16px", lineHeight: 1.35, color: BURGUNDY }}>›</span>
                </button>
              ))}
            </section>
          )}
          {browse.length > 0 && (
            <section data-testid="search-browse">
              <SectionHead numeral={next()} label="Browse your DNA" style={{ margin: "30px 0 2px" }} />
              {browse.map((e) => (
                <button key={`${e.kind}:${e.id}`} type="button" onClick={() => fill(e.name)} style={{ ...rowLine, padding: "13px 0" }}>
                  <span style={rowName}>{e.name}{e.earned && <Earned />}</span>
                  <span aria-hidden="true" style={rowLeader(0.2)} />
                  <span style={smallCaps}>{dnaKindLabel(e.kind)}</span>
                </button>
              ))}
              {browse.some((e) => e.earned) && (
                <p style={{ fontFamily: SANS, fontSize: "12px", lineHeight: 1.5, color: ink(0.5), marginTop: 14 }}>
                  <span aria-hidden="true" style={{ color: BURGUNDY }}>✦</span> earned by your ratings, not the quiz
                </p>
              )}
            </section>
          )}
        </>
      ) : (
        <div ref={resultsRef} tabIndex={-1} data-testid="search-results" style={{ outline: "none" }}>
          {results.journal.length > 0 && (
            <section>
              <SectionHead numeral={next()} label={journalGroupLabel(results.journal.length)} style={{ margin: "28px 0 2px" }} />
              {results.journal.map((row) => (
                <WineRow
                  key={row.id ?? row.wine_name}
                  testId="search-journal-row"
                  data-wine={row.wine_name}
                  name={row.wine_name}
                  mark={journalMark(row) || undefined}
                  meta={metaLine(placeName(row.resolved_region), row.resolved_varietal) || undefined}
                  metaRight={shortDate(row.updated_at ?? row.created_at) || undefined}
                  href={wineHref(row.wine_name)}
                  onClick={openResult}
                />
              ))}
            </section>
          )}
          {results.dna.length > 0 && (
            <section>
              <SectionHead numeral={next()} label="In your DNA" style={{ margin: "28px 0 2px" }} />
              {results.dna.map((e) => (
                <Link
                  key={`${e.kind}:${e.id}`}
                  href="/palate"
                  onClick={openResult}
                  data-testid="search-dna-row"
                  style={{ ...rowLine, padding: "14px 0" }}
                >
                  <span style={rowName}>
                    {e.flag && <span aria-hidden="true">{e.flag} </span>}
                    {e.name}{e.earned && <Earned />}
                  </span>
                  <span aria-hidden="true" style={rowLeader(0.25)} />
                  <span style={{
                    fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.35,
                    color: ink(0.65), whiteSpace: "nowrap",
                  }}>{dnaResultLine(e)}</span>
                </Link>
              ))}
            </section>
          )}
          {results.recs.length > 0 && (
            <section>
              <SectionHead numeral={next()} label="Chosen by the Somm" style={{ margin: "28px 0 2px" }} />
              {results.recs.map((rec) => {
                const facts = peekFacts(rec.wine);
                return (
                  <WineRow
                    key={rec.wine}
                    testId="search-rec-row"
                    data-wine={rec.wine}
                    name={rec.wine}
                    chevron
                    meta={(facts && metaLine(placeName(facts.region), facts.grape)) || undefined}
                    metaRight={matchTag(rec.matchType)}
                    metaTone="accent"
                    href={wineHref(rec.wine)}
                    onClick={openResult}
                  />
                );
              })}
            </section>
          )}
          {nothing && (
            <div style={{ textAlign: "center", padding: "48px 8px 0" }}>
              <p style={{
                fontFamily: SERIF, fontStyle: "italic", fontSize: "18px", lineHeight: 1.45, color: INK, textWrap: "balance",
              }}>{nothingFoundLine(q)}</p>
              <p style={{ fontFamily: SANS, fontSize: "14px", lineHeight: 1.5, color: ink(0.55), marginTop: 8 }}>
                Try a grape, a region or a producer.
              </p>
              <TextAction href="/log" weight={700} style={{ marginTop: 12 }}>📸 Snap the label instead</TextAction>
            </div>
          )}
        </div>
      )}
    </>
  );
}
