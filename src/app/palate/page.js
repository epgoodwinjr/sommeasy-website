"use client";

// /palate — the home of identity (Palate Act II, Pillar 1). The DNA strip on
// the home page is the door; this is the room.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import PalateView from "@/components/PalateView";

export default function PalatePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [accumulation, setAccumulation] = useState([]);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      if (u) {
        const [profileRes, timelineRes, accRes] = await Promise.all([
          supabase.from("wine_profiles").select("*").eq("user_id", u.id).single(),
          supabase.from("dna_timeline").select("*").eq("user_id", u.id).order("event_at", { ascending: false }).limit(20),
          supabase.from("dna_accumulation").select("*").eq("user_id", u.id),
        ]);
        if (profileRes.data) setProfile(profileRes.data);
        setTimeline(timelineRes.data || []);
        setAccumulation(accRes.data || []);

        // The Somm refreshes the narrative when the palate has genuinely
        // moved (a promotion, or ≥5 new rated bottles). Progressive
        // enhancement: any failure keeps the narrative we already show.
        if (profileRes.data) {
          fetch("/api/palate-narrative", { method: "POST" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.narrative) {
                setProfile((p) => (p ? { ...p, narrative: data.narrative } : p));
              }
            })
            .catch(() => {});
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", opacity: 0.4 }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 64, width: "auto", marginBottom: 20, opacity: 0.7 }} />
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", color: "#1B3D2F", margin: "0 0 12px" }}>Your palate is waiting</h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.55, margin: "0 0 28px", maxWidth: 320, lineHeight: 1.55 }}>Sign in to see what Sommeasy knows about your taste — and watch it grow with every bottle.</p>
        <a href="/login?next=%2Fpalate" style={{ padding: "15px 44px", borderRadius: "100px", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, textDecoration: "none" }}>Sign In</a>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 64, width: "auto", marginBottom: 20, opacity: 0.7 }} />
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", color: "#1B3D2F", margin: "0 0 12px" }}>No palate here yet</h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.55, margin: "0 0 28px", maxWidth: 340, lineHeight: 1.55 }}>Two minutes of telling us what you love, and this page becomes yours.</p>
        <a href="/" style={{ padding: "15px 44px", borderRadius: "100px", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, textDecoration: "none" }}>Build My Profile</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px", minHeight: "100vh" }}>
      <header style={{
        padding: "20px 0 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: "rgba(245,240,232,0.92)", backdropFilter: "blur(16px)", zIndex: 10,
      }}>
        <a href="/" style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px",
          color: "#8B2332", fontWeight: 700, textDecoration: "none",
          display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.01em",
        }}>
          <img src="/protea-icon.png" alt="" style={{ height: 36, width: "auto" }} />
          Sommeasy
        </a>
        <a href="/journal" style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332", fontWeight: 600, textDecoration: "none", padding: "10px 0" }}>
          Journal →
        </a>
      </header>
      <PalateView profile={profile} timeline={timeline} accumulation={accumulation} />
    </div>
  );
}
