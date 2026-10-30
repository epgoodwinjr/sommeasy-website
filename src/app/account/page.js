"use client";

// /account — Account (The House List §8.8). Phase 2 ships the page with its
// header and Sign out, which moved here from home's header; Phase 6 builds
// out You, At the table, Your data and Delete account.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import PalateMark from "@/components/PalateMark";
import RunningHead from "@/components/house/RunningHead";
import ServiceBar from "@/components/house/ServiceBar";
import Divider from "@/components/house/Divider";
import EmptyState from "@/components/house/EmptyState";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, ink } from "@/components/house/tokens";

const column = { maxWidth: COLUMN, margin: "0 auto", padding: `24px ${GUTTER}px 48px` };

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [genome, setGenome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      if (u) {
        const { data } = await supabase.from("wine_profiles").select("identity").eq("user_id", u.id).maybeSingle();
        setGenome(data?.identity?.genome ?? null);
      }
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    }
    router.replace("/login?notice=signed_out");
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
          emoji="🍷"
          title="Sign in to see your account"
          sub="Your palate, your journal and every bottle you’ve rated live here."
          action="Sign in"
          href="/login?next=%2Faccount"
        />
      </main>
    );
  }

  const name = (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim())
    || (user.email || "").split("@")[0];
  const joined = user.created_at ? new Date(user.created_at) : null;
  const memberSince = joined && !Number.isNaN(joined.getTime())
    ? joined.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <>
      <RunningHead />
      <main style={column}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PalateMark genome={genome} size={60} />
          </div>
          <h1 style={{
            fontFamily: SERIF, fontSize: "28px", fontWeight: 700, lineHeight: 1.15,
            letterSpacing: "-0.01em", color: INK, marginTop: 12, overflowWrap: "anywhere",
          }}>{name}</h1>
          {memberSince && (
            <div style={{
              fontFamily: SANS, fontSize: "10px", fontWeight: 600, letterSpacing: "0.2em",
              textTransform: "uppercase", color: ink(0.45), marginTop: 6,
            }}>Member since {memberSince}</div>
          )}
        </div>

        <Divider style={{ marginTop: 34 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 8 }}>
          <button
            type="button"
            data-testid="account-signout"
            onClick={signOut}
            disabled={signingOut}
            style={{
              padding: "12px 0", border: "none", background: "none",
              fontFamily: SERIF, fontSize: "18px", fontWeight: 600, color: BURGUNDY,
              cursor: signingOut ? "default" : "pointer", opacity: signingOut ? 0.5 : 1,
            }}
          >{signingOut ? "Signing out…" : "Sign out"}</button>
        </div>
      </main>
      <ServiceBar />
    </>
  );
}
