"use client";

// PalateView — the full Palate experience (Palate Act II, Pillars 2/3/4).
//
// Pure presentation: profile, timeline, and accumulation rows come in as
// props, so a partial/teaser variant can later render a subset of the same
// sections without touching data fetching (anonymous-teaser roadmap item).

import { useState, useEffect } from "react";
import wineUnified from "@/lib/wineUnified.json";
import { getCountryFlag, getCountryName, getRegionDisplayName, getVarietalDisplayName, getVarietalColor, formatWineName } from "@/lib/matchEngine";
import { computeSignature, concentrationPhrase, signatureLine } from "@/lib/palateSignature";
import { PROMOTION_THRESHOLDS, RATING_POINTS } from "@/lib/dnaThresholds";

const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Source Sans 3', sans-serif";
const GREEN = "#1B3D2F";
const BURGUNDY = "#8B2332";
const SAGE = "#6B8F5E";
const CREAM = "#F5F0E8";

const PRODUCERS = wineUnified.producers;

// ─── Display helpers (never show an internal ID) ───

function prettifyId(id) {
  if (!id || typeof id !== "string") return "";
  return id.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function displayCountry(countryId) {
  const name = getCountryName(countryId) || prettifyId(countryId);
  const flag = getCountryFlag(countryId);
  return flag ? `${flag} ${name}` : name;
}

function displayVarietal(varietalId) {
  const name = getVarietalDisplayName(varietalId) || prettifyId(varietalId);
  const color = getVarietalColor(varietalId);
  const emoji =
    color === "white" ? "🥂"
    : color === "sparkling" ? "🍾"
    : color === "rosé" || color === "rose" ? "🌸"
    : "🍇";
  return `${emoji} ${name}`;
}

function displayEstate(estateId, regionId) {
  const list = PRODUCERS[regionId] || [];
  const found = list.find((p) => p.id === estateId);
  if (found) return found.name;
  for (const producers of Object.values(PRODUCERS)) {
    const p = producers.find((x) => x.id === estateId);
    if (p) return p.name;
  }
  return prettifyId(estateId);
}

const DIMENSION_LABELS = { varietal: "grape", region: "region", country: "country", estate: "estate" };
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

function bottlesAwayPhrase(pointsNeeded) {
  const n = Math.max(1, Math.ceil(pointsNeeded / RATING_POINTS.loved));
  if (n === 1) return "one loved bottle away";
  return `${NUMBER_WORDS[n - 1] || n} loved bottles away`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Shared shells ───

const cardStyle = {
  background: "rgba(255,255,255,0.4)", borderRadius: "16px",
  padding: "18px 20px", border: "1px solid rgba(27,61,47,0.06)",
  marginBottom: 12,
};

const labelStyle = {
  fontFamily: SANS, fontSize: "11px", textTransform: "uppercase",
  letterSpacing: "0.12em", color: GREEN, opacity: 0.35,
  marginBottom: 12, fontWeight: 600,
};

// ═══════════════════════════════════════════════════════
// PALATE SIGNATURE (Pillar 4) — reads like a wine label
// ═══════════════════════════════════════════════════════

function SignatureRail({ leftLabel, rightLabel, position, mounted, delay }) {
  const pct = Math.round(Math.min(1, Math.max(0, position)) * 100);
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: SANS, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.14em", color: GREEN, opacity: 0.5, fontWeight: 600 }}>{leftLabel}</span>
        <span style={{ fontFamily: SANS, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.14em", color: GREEN, opacity: 0.5, fontWeight: 600 }}>{rightLabel}</span>
      </div>
      <div style={{ position: "relative", height: 12 }}>
        <div style={{ position: "absolute", top: 5, left: 0, right: 0, height: 2, background: "rgba(27,61,47,0.14)", borderRadius: 1 }} />
        {/* Quarter ticks, like the shoulder markings on a label scale */}
        {[0, 25, 50, 75, 100].map((t) => (
          <div key={t} style={{ position: "absolute", top: 3, left: `${t}%`, width: 1, height: 6, background: "rgba(27,61,47,0.18)", transform: "translateX(-0.5px)" }} />
        ))}
        <div style={{
          position: "absolute", top: 1, width: 10, height: 10,
          left: mounted ? `${pct}%` : "50%",
          transform: "translateX(-5px) rotate(45deg)",
          background: BURGUNDY, boxShadow: "0 1px 4px rgba(139,35,50,0.35)",
          transition: `left 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        }} />
      </div>
    </div>
  );
}

function PalateSignature({ signature, mounted }) {
  const phrase = concentrationPhrase(signature);
  const hasWorlds = signature.oldWorldCount + signature.newWorldCount > 0;
  const hasColor = signature.redCount + signature.whiteCount > 0;
  return (
    <div data-testid="palate-signature" style={{
      background: CREAM, borderRadius: "16px", marginBottom: 12,
      border: "1px solid rgba(139,35,50,0.14)", padding: "22px 24px 16px",
      boxShadow: "0 2px 12px rgba(139,35,50,0.05)",
    }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: SANS, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.22em", color: BURGUNDY, fontWeight: 700 }}>Palate Signature</div>
        <div style={{ width: 44, height: 1, background: "rgba(139,35,50,0.25)", margin: "10px auto 0" }} />
      </div>
      {hasWorlds && (
        <SignatureRail leftLabel="Old World" rightLabel="New World" position={signature.newWorldShare} mounted={mounted} delay={0} />
      )}
      <SignatureRail leftLabel="Focused" rightLabel="Wide-ranging" position={signature.focusShare} mounted={mounted} delay={140} />
      {hasColor && (
        <SignatureRail leftLabel="Red" rightLabel="White" position={signature.whiteShare} mounted={mounted} delay={280} />
      )}
      {phrase && (
        <p style={{ fontFamily: SERIF, fontSize: "15px", fontStyle: "italic", color: GREEN, textAlign: "center", margin: "4px 0 6px", lineHeight: 1.5 }}>
          {phrase}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// THE LIVING PALATE (Pillar 3)
// ═══════════════════════════════════════════════════════

function RecentlyEvolved({ timeline, accumulation }) {
  const events = (timeline || []).slice(0, 6);
  const accByKey = new Map((accumulation || []).map((r) => [`${r.dimension}:${r.dimension_value}`, r]));

  return (
    <div data-testid="palate-evolution" style={cardStyle}>
      <div style={labelStyle}>Recently evolved</div>
      {events.length === 0 ? (
        <p style={{ fontFamily: SERIF, fontSize: "14px", fontStyle: "italic", color: GREEN, opacity: 0.75, margin: 0, lineHeight: 1.6 }}>
          Nothing has shifted yet — and that&apos;s exactly how it should start.
          Your DNA only changes when real bottles prove a pattern. The proof is
          already building below.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {events.map((e) => {
            const acc = accByKey.get(`${e.dimension}:${e.dimension_value}`);
            const bottles = acc?.interaction_count || 0;
            const line = e.event_type === "promoted"
              ? `${e.display_name} earned its place${bottles > 0 ? ` — ${bottles === 1 ? "one bottle" : `${NUMBER_WORDS[bottles - 1] || bottles} bottles`} made the case` : ""}`
              : `${e.display_name} rotated out — your ratings stopped backing it`;
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ fontFamily: SERIF, fontSize: "14px", color: GREEN, lineHeight: 1.45 }}>
                  <span style={{ marginRight: 8 }}>{e.event_type === "promoted" ? "🧬" : "🍂"}</span>
                  {line}
                </div>
                <span style={{ fontFamily: SANS, fontSize: "11px", color: GREEN, opacity: 0.3, flexShrink: 0, whiteSpace: "nowrap" }}>{formatDate(e.event_at)}</span>
              </div>
            );
          })}
          <a href="/journal?tab=timeline" style={{ fontFamily: SANS, fontSize: "12px", color: BURGUNDY, fontWeight: 600, textDecoration: "none", marginTop: 4, padding: "8px 0", display: "inline-block" }}>
            Full history →
          </a>
        </div>
      )}
    </div>
  );
}

function BuildingNow({ accumulation, mounted }) {
  // Only what can genuinely promote: positive points, not yet promoted, and
  // mappable (unmappable rows accumulate but can never join the DNA — showing
  // them as "progress" would be a lie)
  const building = (accumulation || [])
    .filter((r) => !r.promoted && r.points > 0 && r.mappable !== false)
    .map((r) => {
      const threshold = PROMOTION_THRESHOLDS[r.dimension] || 10;
      return { ...r, threshold, ratio: Math.min(1, r.points / threshold) };
    })
    .sort((a, b) => b.ratio - a.ratio);

  const shown = building.slice(0, 6);
  const more = building.length - shown.length;

  return (
    <div data-testid="palate-building" style={cardStyle}>
      <div style={labelStyle}>Building now</div>
      {shown.length === 0 ? (
        <p style={{ fontFamily: SERIF, fontSize: "14px", fontStyle: "italic", color: GREEN, opacity: 0.75, margin: 0, lineHeight: 1.6 }}>
          Nothing in motion yet. Rate the bottles you try — every loved one
          pushes a grape, a place, or an estate toward your DNA.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {shown.map((r, i) => (
            <div key={`${r.dimension}:${r.dimension_value}`}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: 6 }}>
                <div style={{ fontFamily: SANS, fontSize: "14px", fontWeight: 600, color: GREEN }}>
                  {r.display_name}
                  <span style={{ fontFamily: SANS, fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: GREEN, opacity: 0.35, marginLeft: 8 }}>
                    {DIMENSION_LABELS[r.dimension] || r.dimension}
                  </span>
                </div>
                <span style={{ fontFamily: SANS, fontSize: "12px", color: BURGUNDY, opacity: 0.75, flexShrink: 0 }}>
                  {bottlesAwayPhrase(r.threshold - r.points)}
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "rgba(27,61,47,0.08)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 3, background: SAGE,
                  width: mounted ? `${Math.max(5, Math.round(r.ratio * 100))}%` : "0%",
                  transition: `width 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${200 + i * 90}ms`,
                }} />
              </div>
            </div>
          ))}
          {more > 0 && (
            <span style={{ fontFamily: SANS, fontSize: "12px", color: GREEN, opacity: 0.4 }}>
              + {more} more building quietly
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// DNA SECTIONS (Pillar 2 discipline + founding vs earned)
// ═══════════════════════════════════════════════════════

function Chip({ label, earned }) {
  return (
    <span style={{ fontFamily: SANS, fontSize: "13px", color: GREEN, background: "rgba(27,61,47,0.05)", padding: "5px 14px", borderRadius: "100px" }}>
      {label}
      {earned && <span style={{ color: BURGUNDY, marginLeft: 5, fontSize: "11px" }}>✦</span>}
    </span>
  );
}

function ProfileTagSection({ label, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {items.map((item) => <Chip key={item.key} label={item.label} earned={item.earned} />)}
      </div>
    </div>
  );
}

function GroupedSection({ label, groups }) {
  const entries = groups.filter((g) => g.items.length > 0);
  if (entries.length === 0) return null;
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {entries.map((g) => (
          <div key={g.key}>
            <div style={{ fontFamily: SANS, fontSize: "12px", fontWeight: 600, color: GREEN, opacity: 0.55, marginBottom: 6 }}>{g.heading}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {g.items.map((item) => <Chip key={item.key} label={item.label} earned={item.earned} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN VIEW
// ═══════════════════════════════════════════════════════

export default function PalateView({ profile, timeline, accumulation }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const signature = computeSignature(profile, accumulation);
  const sigLine = signatureLine(profile, accumulation);

  // Founding vs earned: promoted DNA whose points came from real bottles, not
  // the quiz. Rendered as a quiet mark, not a badge wall.
  const earnedSet = new Set(
    (accumulation || [])
      .filter((r) => r.promoted && r.source === "auto")
      .map((r) => `${r.dimension}:${r.dimension_value}`)
  );

  const countryItems = (profile.countries || []).map((id) => ({
    key: id, label: displayCountry(id), earned: earnedSet.has(`country:${id}`),
  }));
  const regionGroups = Object.entries(profile.regions || {}).map(([countryId, regionIds]) => ({
    key: countryId,
    heading: displayCountry(countryId),
    items: (regionIds || []).map((rid) => ({
      key: rid,
      label: getRegionDisplayName(rid, countryId) || prettifyId(rid),
      earned: earnedSet.has(`region:${rid}`),
    })),
  }));
  const estateGroups = Object.entries(profile.estates || {}).map(([regionId, estateIds]) => ({
    key: regionId,
    heading: getRegionDisplayName(regionId) || prettifyId(regionId),
    items: (estateIds || []).map((eid) => ({
      key: eid,
      label: displayEstate(eid, regionId),
      earned: earnedSet.has(`estate:${eid}`),
    })),
  }));
  const varietalItems = (profile.varietals || []).map((id) => ({
    key: id, label: displayVarietal(id), earned: earnedSet.has(`varietal:${id}`),
  }));
  const wineItems = (profile.specific_wines || []).map((name) => ({
    key: name, label: formatWineName(name), earned: false,
  }));
  const hasEarned = earnedSet.size > 0;

  return (
    <div>
      {/* ─── Identity ─── */}
      <div style={{ textAlign: "center", padding: "26px 0 24px" }}>
        <div style={{ fontSize: "44px", marginBottom: 10, lineHeight: 1 }}>{profile.archetype_emoji}</div>
        <h1 data-testid="palate-archetype" style={{ fontFamily: SERIF, fontSize: "32px", color: GREEN, margin: "0 0 8px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          {profile.archetype}
        </h1>
        {sigLine && (
          <p style={{ fontFamily: SERIF, fontSize: "15px", fontStyle: "italic", color: BURGUNDY, margin: 0, opacity: 0.85 }}>
            {sigLine}
          </p>
        )}
      </div>

      {/* ─── Signature (Pillar 4) ─── */}
      <PalateSignature signature={signature} mounted={mounted} />

      {/* ─── The Somm's read ─── */}
      {profile.narrative && (
        <div style={cardStyle}>
          <div style={labelStyle}>In the Somm&apos;s words</div>
          <p style={{ fontFamily: SANS, fontSize: "15px", color: GREEN, opacity: 0.65, lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
            {profile.narrative}
          </p>
        </div>
      )}

      {/* ─── The living palate (Pillar 3) ─── */}
      <RecentlyEvolved timeline={timeline} accumulation={accumulation} />
      <BuildingNow accumulation={accumulation} mounted={mounted} />

      {/* ─── The DNA itself ─── */}
      <div data-testid="palate-dna">
        <ProfileTagSection label="Countries" items={countryItems} />
        <GroupedSection label="Regions" groups={regionGroups} />
        <ProfileTagSection label="Grapes" items={varietalItems} />
        <GroupedSection label="Estates" groups={estateGroups} />
        <ProfileTagSection label="Wines you named" items={wineItems} />
        {hasEarned && (
          <p style={{ fontFamily: SANS, fontSize: "12px", color: GREEN, opacity: 0.45, margin: "2px 4px 0" }}>
            <span style={{ color: BURGUNDY }}>✦</span> earned by your ratings, not the quiz
          </p>
        )}
      </div>

      {/* ─── Quiet quiz links — never a primary action ─── */}
      <div style={{ textAlign: "center", marginTop: 28, paddingBottom: 48, display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <a href="/?quiz=refine" style={{ fontFamily: SANS, fontSize: "13px", color: GREEN, opacity: 0.35, textDecoration: "underline", padding: "12px 10px" }}>Adjust quiz answers</a>
        <a href="/?quiz=fresh" style={{ fontFamily: SANS, fontSize: "13px", color: GREEN, opacity: 0.35, textDecoration: "underline", padding: "12px 10px" }}>Start fresh</a>
      </div>
    </div>
  );
}
