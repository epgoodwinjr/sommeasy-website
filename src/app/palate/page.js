"use client";

// /palate — Your palate (Palate Act II; The House List §8.7 since Phase 5).
// The crest on home is the door; this is the room. An inner page: the
// running head and the service bar (decision D1), and a toast queue that
// takes a hand-off — a Recently evolved row opens its wine's page, and that
// page's "Remove from journal" steps back here saying so (carryToasts).
//
// Unknown ≠ empty: a profile that couldn't be read says so and offers a
// retry (never "no palate here yet" on a guess); a timeline or accumulation
// that couldn't be read reaches PalateView as null, and only the sections
// that depend on it say so.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import PalateView from "@/components/PalateView";
import RunningHead from "@/components/house/RunningHead";
import ServiceBar from "@/components/house/ServiceBar";
import Toast, { useToast } from "@/components/house/Toast";
import EmptyState from "@/components/house/EmptyState";
import { COLUMN, GUTTER } from "@/components/house/tokens";

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `24px ${GUTTER}px 56px` };

const rows = (res) => (res.error || !Array.isArray(res.data) ? null : res.data);

export default function PalatePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [profile, setProfile] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [accumulation, setAccumulation] = useState(null);
  // "Removed from your journal" can arrive here from a wine page's back step
  const { toasts } = useToast({ receivesCarried: true });
  const supabase = createClient();

  useEffect(() => {
    let live = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      if (!live) return;
      setUser(u);
      if (u) {
        const [profileRes, timelineRes, accRes] = await Promise.all([
          supabase.from("wine_profiles").select("*").eq("user_id", u.id).maybeSingle(),
          supabase.from("dna_timeline").select("*").eq("user_id", u.id).order("event_at", { ascending: false }).limit(20),
          supabase.from("dna_accumulation").select("*").eq("user_id", u.id),
        ]);
        if (!live) return;
        if (profileRes.error) setReadFailed(true);
        else setProfile(profileRes.data);
        setTimeline(rows(timelineRes));
        setAccumulation(rows(accRes));

        // The Somm refreshes the narrative when the palate has genuinely
        // moved (a promotion, or ≥5 new rated bottles). Progressive
        // enhancement: any failure keeps the narrative we already show.
        if (profileRes.data) {
          fetch("/api/palate-narrative", { method: "POST" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (live && data?.narrative) {
                setProfile((p) => (p ? { ...p, narrative: data.narrative } : p));
              }
            })
            .catch(() => {});
        }
      }
      setLoading(false);
    }
    init();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
        </div>
        {/* A toast carried in from a wine page plays while the palate loads */}
        <Toast toasts={toasts} aboveServiceBar />
      </>
    );
  }

  if (!user) {
    return (
      <main style={column}>
        <EmptyState
          emoji="🧬"
          title="Your palate is waiting"
          sub="Sign in to see what Sommeasy knows about your taste — and watch it grow with every bottle."
          action="Sign in"
          href="/login?next=%2Fpalate"
        />
      </main>
    );
  }

  const page = (body) => (
    <>
      <RunningHead />
      <main style={column}>{body}</main>
      <Toast toasts={toasts} aboveServiceBar />
      <ServiceBar />
    </>
  );

  if (readFailed) {
    return page(
      <EmptyState
        emoji="🧬"
        title="We couldn’t open your palate just now"
        sub="Your palate is safe — give it a moment and try again."
        action="Try again"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (!profile) {
    return page(
      <EmptyState
        emoji="🧬"
        title="No palate here yet"
        sub="Two minutes of telling us what you love, and this page becomes yours."
        action="Build my palate"
        href="/"
      />
    );
  }

  return page(<PalateView profile={profile} timeline={timeline} accumulation={accumulation} />);
}
