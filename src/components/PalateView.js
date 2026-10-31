"use client";

// PalateView — the palate, in full (Palate Act II; The House List §8.7
// since Phase 5): the bloom and the strand's title, the palate signature,
// then numbered sections — the Somm's words, what recently evolved, what's
// building now, the DNA itself — ruled rows, no cards.
//
// Presentation only: profile, timeline and accumulation come in as props
// (/palate reads them). A read that failed comes in as null and its
// section says so — unknown ≠ empty, never "nothing yet" on a guess. The
// decisions (the DNA rows, Building now, Recently evolved) live in
// palateView.js, pure and tested; this file lays them out.

import { useRef, useState } from "react";
import { formatWineName } from "@/lib/matchEngine";
import { computeSignature, concentrationPhrase, signatureLine } from "@/lib/palateSignature";
import { DNA_NAMES } from "@/lib/dnaNames";
import { TIMELINE_HREF, buildingNow, dnaEntries, dnaGroups, evolutionRows } from "@/lib/palateView";
import { bottlesAwayLine, dnaCount, dnaKindLabel } from "@/lib/houseCopy";
import { numeralCounter } from "@/lib/numerals";
import PalateMark from "./PalateMark";
import Divider from "./house/Divider";
import SectionHead from "./house/SectionHead";
import Rail from "./house/Rail";
import ProgressLine from "./house/ProgressLine";
import TimelineRow from "./house/TimelineRow";
import TextAction, { TextActions } from "./house/TextAction";
import { StartFreshConfirm } from "./house/ConfirmBlock";
import { BURGUNDY, INK, SANS, SERIF, TYPE, ink, leader } from "./house/tokens";

const prose = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.6, color: ink(0.7),
  marginTop: 12, textWrap: "pretty",
};
const smallCaps = {
  fontFamily: SANS, fontSize: "10px", fontWeight: 600, letterSpacing: "0.14em",
  textTransform: "uppercase", color: INK, opacity: 0.45,
};
const quietLine = { fontFamily: SANS, fontSize: "12px", lineHeight: 1.5, color: ink(0.5) };

function Signature({ profile, accumulation }) {
  const signature = computeSignature(profile, accumulation);
  const phrase = concentrationPhrase(signature);
  const hasWorlds = signature.oldWorldCount + signature.newWorldCount > 0;
  const hasColor = signature.redCount + signature.whiteCount > 0;
  return (
    <section data-testid="palate-signature">
      <Divider style={{ marginTop: 22 }} />
      <h2 style={{ ...TYPE.eyebrow, textAlign: "center", marginTop: 14 }}>Palate Signature</h2>
      {hasWorlds && (
        <Rail left="Old World" right="New World" value={signature.newWorldShare} style={{ marginTop: 18 }} />
      )}
      <Rail left="Focused" right="Wide-ranging" value={signature.focusShare} delay={140}
        style={{ marginTop: hasWorlds ? 16 : 18 }} />
      {hasColor && (
        <Rail left="Red" right="White" value={signature.whiteShare} delay={280} style={{ marginTop: 16 }} />
      )}
      {phrase && (
        <p style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5, color: INK,
          textAlign: "center", marginTop: 18, textWrap: "balance",
        }}>{phrase}</p>
      )}
    </section>
  );
}

function RecentlyEvolved({ numeral, timeline }) {
  const rows = evolutionRows(timeline);
  return (
    <section data-testid="palate-evolution">
      <SectionHead numeral={numeral} label="Recently evolved" style={{ margin: "32px 0 2px" }} />
      {rows === null ? (
        <p style={prose}>We couldn’t read your recent changes just now.</p>
      ) : rows.length === 0 ? (
        <>
          <p style={prose}>
            Nothing has shifted yet — and that’s exactly how it should start. Your DNA only changes when
            real bottles prove a pattern. The proof is already building below.
          </p>
          {/* The empty state carries its own next pour — never a dead end */}
          <TextAction href="/" testId="palate-empty-rate-link" style={{ marginTop: 4 }}>Rate a wine you know →</TextAction>
        </>
      ) : (
        rows.map((r) => <TimelineRow key={r.key} line={r.line} date={r.date} href={r.href} style={{ padding: "13px 0" }} />)
      )}
      {rows?.length !== 0 && (
        <TextAction href={TIMELINE_HREF} size={12} weight={700} style={{ marginTop: 2 }}>Full history →</TextAction>
      )}
    </section>
  );
}

function BuildingRow({ row, delay }) {
  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${ink(0.07)}` }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <span style={{
          fontFamily: SERIF, fontSize: "17px", lineHeight: 1.35, color: INK, minWidth: 0, overflowWrap: "anywhere",
        }}>{row.name}</span>
        <span aria-hidden="true" style={{ flex: 1, minWidth: 14, borderBottom: leader(1.5), marginBottom: 6 }} />
        <span style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.35, color: ink(0.7), whiteSpace: "nowrap",
        }}>{bottlesAwayLine(row.away)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <span style={{ ...smallCaps, width: 52, flexShrink: 0 }}>{dnaKindLabel(row.kind)}</span>
        <ProgressLine value={row.ratio} delay={delay} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

function BuildingNow({ numeral, accumulation }) {
  const building = buildingNow(accumulation);
  return (
    <section data-testid="palate-building">
      <SectionHead numeral={numeral} label="Building now" style={{ margin: "28px 0 2px" }} />
      {building === null ? (
        <p style={prose}>We couldn’t read what’s building just now.</p>
      ) : building.rows.length === 0 ? (
        <>
          <p style={prose}>
            Nothing in motion yet. Rate the bottles you try — every loved one pushes a grape, a place, or
            an estate toward your DNA.
          </p>
          {/* /log is Log a bottle — the empty state hands over the camera, not a shrug */}
          <TextAction href="/log" testId="palate-empty-log-link" style={{ marginTop: 4 }}>Log tonight’s bottle →</TextAction>
        </>
      ) : (
        <>
          {building.rows.map((r, i) => <BuildingRow key={r.key} row={r} delay={200 + i * 90} />)}
          {building.more > 0 && (
            <p style={{ ...quietLine, marginTop: 12 }}>+ {building.more} more building quietly</p>
          )}
        </>
      )}
    </section>
  );
}

function DnaRow({ name, flag, earned, count }) {
  return (
    <div data-testid="palate-dna-row" style={{
      display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 0", borderBottom: `1px solid ${ink(0.06)}`,
    }}>
      <span style={{ fontFamily: SERIF, fontSize: "16px", lineHeight: 1.35, color: INK, minWidth: 0, overflowWrap: "anywhere" }}>
        {flag && <span aria-hidden="true">{flag} </span>}
        {name}
        {earned && <span role="img" aria-label="earned by your ratings" style={{ color: BURGUNDY }}> ✦</span>}
      </span>
      {/* A leader only when something sits at its end — an unknown count leaves none */}
      {count && <span aria-hidden="true" style={{ flex: 1, minWidth: 14, borderBottom: leader(1.5, 0.22), marginBottom: 6 }} />}
      {count && (
        <span style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.35, color: ink(0.6), whiteSpace: "nowrap",
        }}>{count}</span>
      )}
    </div>
  );
}

const groupLabel = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", fontWeight: 400, color: BURGUNDY, marginTop: 20,
};

function YourDna({ numeral, profile, accumulation }) {
  const entries = dnaEntries({ profile, accumulation, names: DNA_NAMES });
  const groups = dnaGroups(entries);
  // The quiz's named wines aren't dimensions the engine evolves, but they're
  // the user's own answers — they stay on the page they've always had
  const named = (Array.isArray(profile.specific_wines) ? profile.specific_wines : [])
    .filter((w) => typeof w === "string" && w.trim());
  return (
    <section data-testid="palate-dna">
      <SectionHead numeral={numeral} label="Your DNA" style={{ margin: "28px 0 0" }} />
      {groups.map((g) => (
        <div key={g.kind}>
          <h3 style={groupLabel}>{g.label}</h3>
          {g.entries.map((e) => (
            <DnaRow key={e.id} name={e.name} flag={e.flag} earned={e.earned} count={dnaCount(e.bottles, e.source)} />
          ))}
        </div>
      ))}
      {named.length > 0 && (
        <div>
          <h3 style={groupLabel}>Wines you named</h3>
          {named.map((w, i) => <DnaRow key={`${i}:${w}`} name={formatWineName(w)} count={dnaCount(0, "quiz")} />)}
        </div>
      )}
      {entries.some((e) => e.earned) && (
        <p style={{ ...quietLine, marginTop: 14 }}>
          <span aria-hidden="true" style={{ color: BURGUNDY }}>✦</span> earned by your ratings, not the quiz
        </p>
      )}
    </section>
  );
}

// Quiet quiz links — never a primary action. Start fresh asks first (D2).
function QuizLinks() {
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef(null);
  const cancel = () => {
    setConfirming(false);
    trigger.current?.focus();
  };
  return (
    <div style={{ marginTop: 24 }}>
      <TextActions centered gap={24}>
        <TextAction tone="quiet" underlined href="/?quiz=refine">Adjust quiz answers</TextAction>
        <TextAction
          ref={trigger}
          tone="quiet"
          underlined
          testId="start-fresh"
          ariaExpanded={confirming}
          onClick={() => setConfirming((open) => !open)}
        >Start fresh</TextAction>
      </TextActions>
      {confirming && <StartFreshConfirm centered onCancel={cancel} style={{ marginTop: 8 }} />}
    </div>
  );
}

export default function PalateView({ profile, timeline, accumulation }) {
  // The strand's epithet leads (Act III); the live signature line is the
  // fallback for a row the engine hasn't composed yet
  const epithet = profile.identity?.epithet || signatureLine(profile, accumulation);
  const next = numeralCounter();

  return (
    <div>
      {/* The strand: the bloom (generated from the genome) is the hero */}
      <header style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PalateMark genome={profile.identity?.genome} size={176} />
        </div>
        <h1 data-testid="palate-archetype" style={{
          ...TYPE.h1, marginTop: 16, textWrap: "balance", overflowWrap: "anywhere",
        }}>{profile.archetype}</h1>
        {epithet && (
          <p data-testid="palate-epithet" style={{
            fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.45, color: BURGUNDY, marginTop: 8,
          }}>{epithet}</p>
        )}
      </header>

      <Signature profile={profile} accumulation={accumulation} />

      {profile.narrative && (
        <section>
          <SectionHead numeral={next()} label="In the Somm’s words" style={{ margin: "32px 0 12px" }} />
          <p style={{
            fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.65, color: ink(0.78), textWrap: "pretty",
          }}>{profile.narrative}</p>
        </section>
      )}

      <RecentlyEvolved numeral={next()} timeline={timeline} />
      <BuildingNow numeral={next()} accumulation={accumulation} />
      <YourDna numeral={next()} profile={profile} accumulation={accumulation} />
      <QuizLinks />
    </div>
  );
}
