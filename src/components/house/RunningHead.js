"use client";

// RunningHead — the slim head on every inner page (README §7.11):
//
//   ‹ Journal              (protea)              🔍
//
// Sticky and frosted, full-bleed, its grid set in the 560px column. Back
// wears the previous page's title from the nav trail (@/lib/navTrail) and
// steps back through real history — or goes home when there's nowhere to
// step. Mounting the head records this page in the trail; `title`
// overrides the route's own (/recommend's results are "Your picks").
// `backLabel` + `onBack` take over for an in-page step (Your picks →
// "‹ Match a list" back to the input). On /search, `hideSearch` keeps the
// 🔍 cell (the grid stays balanced) but invisible and inert.
//
// Same-route hops don't remount the page (/wine?name=A → B), so the wine
// page keys its head by the wine (<RunningHead key={name} />) to record the
// step. Home has no head but records its visit with useNavTrail("Your
// list"). Never on Home, the full-screen reading states, or auth pages.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { HOME_TITLE, backTarget, recordVisit, stepBack, titleForPath } from "@/lib/navTrail";
import { HOUSE_PAGES } from "@/lib/houseRoutes";
import { BURGUNDY, COLUMN, SANS, ink } from "./tokens";

// Read the trail before paint on client navigations (no label flash);
// plain useEffect on the server, where there's no trail to read.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Record this page in the back trail; returns the back label (null until
 *  the trail is read) and the back action. */
export function useNavTrail(title) {
  const router = useRouter();
  const pathname = usePathname();
  const [backLabel, setBackLabel] = useState(null);

  useBeforePaint(() => {
    const { pathname: path, search } = window.location;
    const trail = recordVisit({ path: path + search, title: title || titleForPath(path) || "Back" });
    setBackLabel(backTarget(trail).label);
  }, [title, pathname]);

  const goBack = useCallback(() => {
    if (stepBack() === "back") router.back();
    else router.push("/");
  }, [router]);

  return { backLabel, goBack };
}

const cell = {
  width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
};

export default function RunningHead({ title, backLabel, onBack, hideSearch: hideOnSearch = false }) {
  const trail = useNavTrail(title);
  const label = backLabel ?? trail.backLabel;
  // Dark until /search ships (houseRoutes) — never a link to a 404
  const hideSearch = hideOnSearch || !HOUSE_PAGES.search;

  return (
    <header data-testid="running-head" style={{
      position: "sticky", top: 0, zIndex: 30,
      padding: "calc(env(safe-area-inset-top) + 4px) 14px 4px",
      background: "rgba(245,240,232,0.92)",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderBottom: `1px solid ${ink(0.07)}`,
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(0,1fr) 44px minmax(0,1fr)",
        alignItems: "center", maxWidth: COLUMN, margin: "0 auto",
      }}>
        <div style={{ minWidth: 0 }}>
          <button type="button" onClick={onBack ?? trail.goBack} data-testid="running-head-back" style={{
            display: "flex", alignItems: "center", gap: 6, height: 44, padding: "0 8px", maxWidth: "100%",
            border: "none", background: "none", cursor: "pointer",
            fontFamily: SANS, fontSize: "14px", fontWeight: 600, color: BURGUNDY, whiteSpace: "nowrap",
          }}>
            <span aria-hidden="true" style={{ fontSize: "22px", lineHeight: 1, marginTop: -3 }}>‹</span>
            {/* Invisible until the trail is read — never flash a wrong label */}
            <span style={{
              opacity: label ? 1 : 0, transition: "opacity 0.15s ease",
              overflow: "hidden", textOverflow: "ellipsis",
            }}>{label || HOME_TITLE}</span>
          </button>
        </div>
        <Link href="/" aria-label="Your list" style={cell}>
          <img src="/protea-icon.png" alt="" style={{ height: 26, width: "auto" }} />
        </Link>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link
            href="/search"
            aria-label="Search"
            aria-hidden={hideSearch || undefined}
            tabIndex={hideSearch ? -1 : undefined}
            style={{
              ...cell, fontSize: "16px", textDecoration: "none",
              opacity: hideSearch ? 0 : 1, pointerEvents: hideSearch ? "none" : "auto",
            }}
          >🔍</Link>
        </div>
      </div>
    </header>
  );
}
