"use client";

// The journal — /journal (The House List §8.4, Phase 4).
//
// Four tabs over the user's own rows: Tried (had bottles grouped by the
// month they were rated), Want, Passed, and the Timeline of what moved
// their DNA. Rows carry no actions any more: each one opens its wine's page
// (/wine), where the verdict, the note and Remove from journal live — so
// this page holds no rating or delete logic of its own. The tab rides the
// URL (?tab=, the deep link the Palate view uses), so a step back from a
// wine page lands on the tab it left. The timeline is read directly: the
// engine module would bring the 2.9MB wine data along for one select.
//
// Unknown ≠ empty: a failed read says so and offers a retry — it never
// shows "the first page is always blank" or a zero count on a guess.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { wineHref } from "@/lib/navTrail";
import {
  FOUNDING_LINE, bottleCount, journalMark, journalRowMeta, journalStats, shortDate, timelineLine,
} from "@/lib/houseCopy";
import { groupByMonth } from "@/lib/journalView";
import RunningHead from "@/components/house/RunningHead";
import ServiceBar from "@/components/house/ServiceBar";
import Toast, { useToast } from "@/components/house/Toast";
import { ChoiceTabs } from "@/components/house/ChoiceLine";
import WineRow from "@/components/house/WineRow";
import TimelineRow from "@/components/house/TimelineRow";
import Divider from "@/components/house/Divider";
import EmptyState from "@/components/house/EmptyState";
import TextAction from "@/components/house/TextAction";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, TYPE, ink } from "@/components/house/tokens";

const TABS = ["tried", "want", "skipped", "timeline"];
const PANEL = "journal-panel";

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `22px ${GUTTER}px 56px` };
const smallCaps = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 600, letterSpacing: "0.14em",
  textTransform: "uppercase", color: INK, opacity: 0.45, whiteSpace: "nowrap",
};

const EMPTY = {
  tried: {
    emoji: "🍷",
    title: "The first page is always blank",
    sub: "Rate a bottle you know and it starts here — every rating sharpens your DNA.",
    action: "📸 Log a bottle",
    href: "/log",
  },
  want: {
    emoji: "📌",
    title: "Nothing waiting yet",
    sub: "Tap 📌 Want it on any pick and it waits here. We’ll flag it when it turns up on a menu.",
  },
  skipped: {
    emoji: "👋",
    title: "Nothing struck off",
    sub: "Pass on a pick and it lands here, so the Somm knows to steer around it.",
  },
};

const retry = () => window.location.reload();

function JournalRow({ row, now }) {
  const { meta, right, accent } = journalRowMeta(row, now);
  return (
    <WineRow
      testId="journal-row"
      data-wine={row.wine_name}
      name={row.wine_name}
      mark={journalMark(row) || undefined}
      meta={meta || undefined}
      metaRight={right || undefined}
      metaTone={accent ? "accent" : "quiet"}
      struck={row.interaction_type === "skip"}
      struckOpacity={0.55}
      href={wineHref(row.wine_name)}
    />
  );
}

export default function JournalPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [timelineFailed, setTimelineFailed] = useState(false);
  const [interactions, setInteractions] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [foundedAt, setFoundedAt] = useState(null);
  const [tab, setTab] = useState("tried");
  // "Removed from your journal" arrives here from a wine page's back step
  const { toasts } = useToast({ receivesCarried: true });
  const supabase = createClient();

  useEffect(() => {
    // Deep-link support (/journal?tab=timeline from the Palate view)
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (TABS.includes(tabParam)) setTab(tabParam);

    let live = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      if (!live) return;
      setUser(u);
      if (u) {
        const [ints, events, profile] = await Promise.all([
          supabase.from("wine_interactions").select("*").eq("user_id", u.id)
            .order("updated_at", { ascending: false }),
          supabase.from("dna_timeline").select("*").eq("user_id", u.id)
            .order("event_at", { ascending: false }),
          supabase.from("wine_profiles").select("created_at").eq("user_id", u.id).maybeSingle(),
        ]);
        if (!live) return;
        if (ints.error || !Array.isArray(ints.data)) setReadFailed(true);
        else setInteractions(ints.data);
        if (events.error || !Array.isArray(events.data)) setTimelineFailed(true);
        else setTimeline(events.data);
        setFoundedAt(profile.data?.created_at || null);
      }
      setLoading(false);
    }
    init();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tab rides the URL, so a step back from a wine page lands on it again
  const chooseTab = (id) => {
    setTab(id);
    const url = new URL(window.location.href);
    if (id === "tried") url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", url);
  };

  if (loading) {
    return (
      <>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
        </div>
        {/* A toast carried in from a wine page plays while the rows load */}
        <Toast toasts={toasts} aboveServiceBar />
      </>
    );
  }

  if (!user) {
    return (
      <main style={column}>
        <EmptyState
          emoji="🍷"
          title="Sign in to view your journal"
          sub="Every bottle you rate makes your next recommendation sharper. Your journal is where that history lives."
          action="Sign in"
          href="/login?next=%2Fjournal"
        />
      </main>
    );
  }

  const now = new Date();
  const tried = interactions.filter((i) => i.interaction_type === "had");
  const wanted = interactions.filter((i) => i.interaction_type === "want");
  const skipped = interactions.filter((i) => i.interaction_type === "skip");
  const count = (rows) => (readFailed ? null : rows.length);

  const renderRows = () => {
    if (readFailed) {
      return (
        <EmptyState
          emoji="🍷"
          title="We couldn’t open your journal just now"
          sub="Your bottles are safe — give it a moment and try again."
          action="Try again"
          onAction={retry}
        />
      );
    }
    const rows = tab === "tried" ? tried : tab === "want" ? wanted : skipped;
    if (rows.length === 0) return <EmptyState {...EMPTY[tab]} />;
    if (tab !== "tried") {
      return (
        <>
          <div style={{ height: 10 }} />
          {rows.map((row) => <JournalRow key={row.id ?? row.wine_name} row={row} now={now} />)}
        </>
      );
    }
    return groupByMonth(tried, now).map((group) => (
      <section key={group.key}>
        <h2 style={{
          display: "flex", alignItems: "baseline", gap: 10, margin: "26px 0 2px",
          fontSize: "inherit", fontWeight: "inherit",
        }}>
          <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "18px", fontWeight: 400, color: BURGUNDY }}>
            {group.label}
          </span>
          <span aria-hidden="true" style={{ flex: 1, height: 1, background: ink(0.1) }} />
          <span style={smallCaps}>{bottleCount(group.rows.length)}</span>
        </h2>
        {group.rows.map((row) => <JournalRow key={row.id ?? row.wine_name} row={row} now={now} />)}
      </section>
    ));
  };

  const renderTimeline = () => {
    if (timelineFailed) {
      return (
        <EmptyState
          emoji="🧬"
          title="We couldn’t read your timeline just now"
          sub="Give it a moment and try again."
          action="Try again"
          onAction={retry}
        />
      );
    }
    const entries = timeline
      .map((e) => ({ key: e.id, line: timelineLine(e), date: shortDate(e.event_at, now), wine: e.wine_name }))
      .filter((e) => e.line);
    if (foundedAt) {
      entries.push({ key: "founding", line: FOUNDING_LINE, date: shortDate(foundedAt, now), wine: null });
    }
    if (entries.length === 0) {
      return (
        <EmptyState
          emoji="🎉"
          title="Your palate hasn’t begun yet"
          sub="Two minutes of telling us what you love, and your timeline starts here."
          action="Build my palate"
          href="/"
        />
      );
    }
    return (
      <>
        <div style={{ height: 10 }} />
        {entries.map((e) => (
          <TimelineRow key={e.key} line={e.line} date={e.date} href={e.wine ? wineHref(e.wine) : "/palate"} />
        ))}
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <TextAction href="/palate">🧬 See what’s building in your palate →</TextAction>
        </div>
      </>
    );
  };

  return (
    <>
      <RunningHead />
      <main style={column}>
        <h1 style={TYPE.h1}>Journal</h1>
        <p style={{ ...TYPE.sub, marginTop: 8 }}>Your tasting history and wishlist</p>
        <ChoiceTabs
          panelId={PANEL}
          value={tab}
          onChange={chooseTab}
          style={{ marginTop: 20 }}
          tabs={[
            { id: "tried", label: "Tried", count: count(tried) },
            { id: "want", label: "Want", count: count(wanted) },
            { id: "skipped", label: "Passed", count: count(skipped) },
            { id: "timeline", label: "Timeline" },
          ]}
        />
        <div role="tabpanel" id={PANEL} aria-labelledby={`${PANEL}-${tab}`}>
          {tab === "timeline" ? renderTimeline() : renderRows()}
        </div>

        {tab !== "timeline" && !readFailed && tried.length > 0 && (
          <>
            <Divider style={{ marginTop: 34 }} />
            <p style={{
              fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", color: ink(0.65),
              textAlign: "center", marginTop: 12,
            }}>
              {journalStats({
                tried: tried.length,
                loved: tried.filter((w) => w.rating === "loved").length,
                want: wanted.length,
              })}
            </p>
          </>
        )}
      </main>
      <Toast toasts={toasts} aboveServiceBar />
      <ServiceBar />
    </>
  );
}
