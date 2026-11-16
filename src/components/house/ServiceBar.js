// ServiceBar — the two standing orders at the foot of inner pages
// (README §7.12): Match a list | Log a bottle, each behind its printed tool
// (the list, the bottle — docs/marks/README.md §8.4).
//
// Fixed and frosted, full-bleed, its grid set in the 560px column. Shown on
// /journal, /wine, /search, /palate and /account only (decision D1) — never
// Home, Match/Picks, Log or auth. Render it LAST on the page: it brings its
// own bottom spacer (84px + the safe area) so nothing hides behind it.
// Toasts on these pages sit above it (<Toast aboveServiceBar />).

import Link from "next/link";
import Mark from "./Mark";
import { BURGUNDY, COLUMN, INK, SERIF, ink } from "./tokens";

const order = (color) => ({
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 48,
  fontFamily: SERIF, fontSize: "16px", fontWeight: 600, color,
  textDecoration: "none", whiteSpace: "nowrap",
});

export default function ServiceBar() {
  return (
    <>
      <div aria-hidden="true" style={{ height: "calc(84px + env(safe-area-inset-bottom))" }} />
      <nav aria-label="Quick actions" data-testid="service-bar" style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 35,
        background: "rgba(245,240,232,0.94)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: `1px solid ${ink(0.1)}`,
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(0,1fr) 1px minmax(0,1fr)", alignItems: "center",
          maxWidth: COLUMN, margin: "0 auto", padding: "6px 16px calc(env(safe-area-inset-bottom) + 8px)",
        }}>
          <Link href="/recommend" style={order(BURGUNDY)}>
            <Mark id="list" size={20} style={{ flexShrink: 0 }} />Match a list
          </Link>
          <div aria-hidden="true" style={{ height: 24, background: ink(0.14) }} />
          <Link href="/log" style={order(INK)}>
            <Mark id="bottle" size={20} style={{ flexShrink: 0 }} />Log a bottle
          </Link>
        </div>
      </nav>
    </>
  );
}
