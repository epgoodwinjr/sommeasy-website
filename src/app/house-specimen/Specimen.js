"use client";

// The House List specimen — each primitive in src/components/house/ with
// sample content from the design screenshots, wired to local state so the
// interactions can be tried: tiles rate, rows strike, toasts queue. Built
// only from the primitives and the pure modules, the way the phases will
// build pages. Nothing here reads or writes user data.

import { useState } from "react";
import Divider from "@/components/house/Divider";
import SectionHead from "@/components/house/SectionHead";
import LeaderEntry from "@/components/house/LeaderEntry";
import WineRow, { ReservedRow } from "@/components/house/WineRow";
import SettingRow, { FactRow } from "@/components/house/SettingRow";
import RuledField, { AmountRange } from "@/components/house/RuledField";
import ChoiceLine, { ChoiceTabs, TermLine } from "@/components/house/ChoiceLine";
import TextAction, { TextActions } from "@/components/house/TextAction";
import RatingTiles, { DoneLine } from "@/components/house/RatingTiles";
import RatingList from "@/components/house/RatingList";
import RunningHead from "@/components/house/RunningHead";
import ServiceBar from "@/components/house/ServiceBar";
import Toast, { useToast } from "@/components/house/Toast";
import EmptyState from "@/components/house/EmptyState";
import Rail from "@/components/house/Rail";
import ProgressLine from "@/components/house/ProgressLine";
import { BURGUNDY, COLUMN, GUTTER, INK, SANS, SERIF, TYPE, ink } from "@/components/house/tokens";
import { ratingFor } from "@/lib/ratings";
import { splitVintage } from "@/lib/vintage";
import { numeralCounter } from "@/lib/numerals";

const RECS = [
  { wine: "Raats Original Chenin Blanc 2022", meta: "Stellenbosch · Chenin Blanc", tag: "📍 Region + grape", why: "Old-vine Chenin from your home region — taut, waxy, mineral." },
  { wine: "Kanonkop Kadette Cape Blend 2020", meta: "Stellenbosch · Cape Blend", tag: "📍 Region match", why: "A Stellenbosch stalwart — structure and dark fruit from familiar soil." },
  { wine: "Ameztoi Getariako Txakolina 2023", meta: "Basque Country · Hondarrabi Zuri", tag: "🧭 Discovery", why: "A salty, spritzy left turn — far from home, close to your acid line." },
];

const somm = { fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.5, color: ink(0.72), marginTop: 8 };
const reply = { fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5, color: BURGUNDY, marginTop: 12 };
const caption = { fontFamily: SANS, fontSize: "12px", lineHeight: 1.5, color: ink(0.5), marginTop: 8 };

function RecRow({ rec, numeral }) {
  const [state, setState] = useState(null); // null | rating | want | skip | a rating id
  const { base, vintage } = splitVintage(rec.wine);
  const rated = ratingFor(state);
  return (
    <WineRow numeral={numeral} name={base} vintage={vintage} meta={rec.meta}
      metaRight={rec.tag} metaTone="accent" struck={state === "skip"}>
      <p style={somm}>“{rec.why}”</p>
      {state === null && (
        <TextActions style={{ marginTop: 4 }}>
          <TextAction onClick={() => setState("rating")}>🍷 Had it</TextAction>
          <TextAction tone="secondary" onClick={() => setState("want")}>📌 Want it</TextAction>
          <TextAction tone="quiet" onClick={() => setState("skip")}>👋 Pass</TextAction>
        </TextActions>
      )}
      {state === "rating" && <RatingTiles style={{ marginTop: 12 }} onRate={setState} />}
      {state === "want" && <DoneLine>📌 On your want list — we’ll flag it when it turns up on a menu.</DoneLine>}
      {state === "skip" && <DoneLine>👋 Struck from your list.</DoneLine>}
      {rated && <DoneLine>{rated.emoji} {rated.label} — noted in your journal.</DoneLine>}
    </WineRow>
  );
}

export default function Specimen() {
  const { toasts, showToast } = useToast();
  const [verdict, setVerdict] = useState(null);
  const [verdictOpen, setVerdictOpen] = useState(true);
  const [logRating, setLogRating] = useState(null);
  const [color, setColor] = useState("white");
  const [where, setWhere] = useState("home");
  const [tab, setTab] = useState("tried");
  const [spend, setSpend] = useState({ min: "40", max: "90" });
  const [editing, setEditing] = useState(null);
  const [entry, setEntry] = useState("");
  const [query, setQuery] = useState("chenin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [reading, setReading] = useState(0);

  const next = numeralCounter();
  const recNumeral = numeralCounter({ lower: true });
  const verdictRating = ratingFor(verdict);
  const hamilton = splitVintage("Hamilton Russell Chardonnay 2022");

  const readAList = () => {
    setReading(0.9);
    setTimeout(() => setReading(1), 2600);
  };

  return (
    <>
      <RunningHead title="Specimen" />
      <main style={{ maxWidth: COLUMN, margin: "0 auto", padding: `22px ${GUTTER}px 56px` }}>
        <h1 style={TYPE.h1}>House List primitives</h1>
        <p style={{ ...TYPE.sub, marginTop: 8 }}>
          Phase 1 foundations, set in sample content. Compare against docs/house-list/screenshots.
        </p>

        <SectionHead numeral={next()} label="Leader entries" style={{ margin: "30px 0 16px" }} />
        <LeaderEntry tone="filled" mark="📋" label="Match the wine list" subGap={8}
          sub="Photo, paste or link — we’ll find your bottle." onClick={() => showToast("📋 → /recommend")} />
        <LeaderEntry mark="📸" label="Log a bottle" subGap={8} style={{ marginTop: 22 }}
          sub="Snap the label and rate it — every rating sharpens your DNA." onClick={() => showToast("📸 → /log")} />
        <LeaderEntry mark="🔗" label="Paste a link" size={22} style={{ marginTop: 22 }}
          sub="Got a link to the wine list? Drop it here." onClick={() => showToast("🔗 opens the link row")} />
        <LeaderEntry secondary label="See it in your palate" style={{ marginTop: 28 }} onClick={() => showToast("→ /palate")} />
        <LeaderEntry secondary label="Log another bottle" style={{ marginTop: 22 }} onClick={() => showToast("→ find step")} />

        <SectionHead numeral={next()} label="From last night" style={{ margin: "32px 0 2px" }} />
        <WineRow name={hamilton.base} vintage={hamilton.vintage} meta="Hemel-en-Aarde · Ordered at the table" />
        {verdictRating ? (
          <p style={reply}>{verdictRating.emoji} {verdictRating.label} — noted. We’ll weigh it lightly next time.</p>
        ) : verdictOpen ? (
          <>
            <RatingTiles variant="verdict" style={{ marginTop: 14 }} onRate={setVerdict} />
            <TextAction tone="quiet" onClick={() => setVerdictOpen(false)}>Not tonight</TextAction>
          </>
        ) : (
          <p style={caption}>Dismissed — it would stay gone until the next table.</p>
        )}

        <SectionHead numeral={next()} label="Chosen for your palate" style={{ margin: "34px 0 2px" }} />
        {RECS.map((rec) => <RecRow key={rec.wine} rec={rec} numeral={recNumeral()} />)}
        <ReservedRow numeral={recNumeral()} />
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", color: ink(0.55), textAlign: "center", marginTop: 16 }}>
          Two more selections open after your first rating.
        </p>

        <SectionHead numeral={next()} label="Rows elsewhere" style={{ margin: "30px 0 2px" }} />
        <WineRow name="Mullineux Old Vines White 2021" mark={ratingFor("loved").emoji}
          meta="Swartland · Chenin Blend" metaRight="🍷 Somm pick · Sep 12" metaTone="accent" />
        <WineRow name="Cloudy Bay Sauvignon Blanc 2023" mark={ratingFor("fine").emoji}
          meta="Marlborough · Sauvignon Blanc" metaRight="Sep 17" />
        <WineRow name="Ken Forrester Old Vine Reserve Chenin Blanc 2022" mark={ratingFor("loved").emoji}
          meta="Stellenbosch · Chenin Blanc" metaRight="Aug 29" onClick={() => showToast("→ the wine page")} />
        <WineRow name="Newton Johnson Chardonnay" action="Log it ›" meta="📌 Hemel-en-Aarde · Chardonnay"
          onClick={() => showToast("→ the rate step")} />
        <WineRow name="Raats Original Chenin Blanc 2022" mark="📌" chevron meta="Stellenbosch · Chenin Blanc"
          metaRight="Saved Sep 2" onClick={() => showToast("→ the wine page")} />
        <WineRow name="Kanonkop Pinotage 2019" mark="👋" meta="Stellenbosch · Pinotage" struck struckOpacity={0.55} />
        <WineRow name="Verdict pending, no end slot" meta="Hemel-en-Aarde · Verdict pending" metaRight="Today" />

        <SectionHead numeral={next()} label="Ratings" style={{ margin: "30px 0 12px" }} />
        <RatingTiles variant="page" prompt="Change your verdict" onRate={(id) => showToast(`${ratingFor(id).emoji} ${ratingFor(id).label}`)} />
        <TextAction tone="quiet" size={12} opacity={0.5}>Keep ❤️ Loved it</TextAction>
        <RatingList value={logRating} onChange={setLogRating} style={{ marginTop: 18 }} />
        <ChoiceLine label="Where" labelSize={17} value={where} onChange={setWhere} style={{ marginTop: 22 }}
          options={[{ id: "home", label: "At home" }, { id: "out", label: "Out" }]} />
        <RuledField variant="note" placeholder="A line for your journal (optional)" maxLength={500} style={{ marginTop: 14 }} />
        <LeaderEntry tone="filled" mark="→" label="Save to journal" disabled={!logRating} style={{ marginTop: 34 }}
          onClick={() => showToast(`Saved — ${ratingFor(logRating)?.label}`)} />

        <SectionHead numeral={next()} label="Tonight’s terms" style={{ margin: "30px 0 10px" }} />
        <ChoiceLine label="Color" value={color} onChange={setColor}
          options={[{ id: "all", label: "All" }, { id: "red", label: "Red" }, { id: "white", label: "White" }, { id: "sparkling", label: "Sparkling" }]} />
        <TermLine label="Spend" style={{ marginTop: 16 }}>
          <AmountRange min={spend.min} max={spend.max}
            onMinChange={(min) => setSpend((s) => ({ ...s, min }))} onMaxChange={(max) => setSpend((s) => ({ ...s, max }))} />
        </TermLine>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 24 }}>
          <span style={{ fontFamily: SERIF, fontSize: "18px", color: INK }}>Steer the Somm</span>
          <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "13px", color: ink(0.45) }}>optional</span>
        </div>
        <RuledField variant="entry" placeholder="A grape, a place, a mood…" />
        <p style={caption}>Try “something South African”, “no Chardonnay”, or “big reds for a steak night”.</p>

        <SectionHead numeral={next()} label="Fields" style={{ margin: "30px 0 12px" }} />
        <div style={{ fontFamily: SERIF, fontSize: "21px", fontWeight: 600, lineHeight: 1.25, color: INK }}>Name a bottle you already love</div>
        <RuledField variant="entry" value={entry} onChange={(e) => setEntry(e.target.value)} style={{ marginTop: 6 }}
          placeholder="Cloudy Bay Sauvignon Blanc…" submitLabel="Find it"
          onSubmit={() => showToast(`→ /log?q=${entry.trim()}`)} />
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 22 }}>
          <RuledField variant="search" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }}
            placeholder="A wine, grape, region or producer" aria-label="Search" />
          <button type="button" aria-label="Clear" onClick={() => setQuery("")} style={{
            width: 40, height: 44, border: "none", background: "none", fontFamily: SANS, fontSize: "22px",
            color: ink(0.5), opacity: query ? 1 : 0, pointerEvents: query ? "auto" : "none", cursor: "pointer",
          }}>×</button>
        </div>
        <RuledField variant="url" inputMode="url" placeholder="https://…" aria-label="Wine list link" style={{ marginTop: 22 }} />
        <RuledField variant="auth" label="Email" type="email" placeholder="you@example.com" style={{ marginTop: 24 }} />
        <RuledField variant="auth" label="Password" type={showPassword ? "text" : "password"} style={{ marginTop: 22 }}
          value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
          trailing={<TextAction size={12} onClick={() => setShowPassword((s) => !s)}>{showPassword ? "Hide" : "Show"}</TextAction>} />

        <SectionHead numeral={next()} label="Settings & facts" style={{ margin: "30px 0 2px" }} />
        <SettingRow label="Name" value="Edward" />
        <SettingRow label="Email" value="a-very-long-address-for-ellipsis@example.com" />
        <SettingRow label="Password" value="Change" onClick={() => showToast("✓ Check your inbox — a reset link is on its way")} />
        <SettingRow label="Usual spend" value={`$${spend.min || "—"} – $${spend.max || "—"}`}
          onClick={() => setEditing(editing === "spend" ? null : "spend")}>
          {editing === "spend" && (
            <AmountRange style={{ marginTop: 10, justifyContent: "flex-end" }} min={spend.min} max={spend.max}
              onMinChange={(min) => setSpend((s) => ({ ...s, min }))} onMaxChange={(max) => setSpend((s) => ({ ...s, max }))} />
          )}
        </SettingRow>
        <SettingRow label="Adjust quiz answers" onClick={() => showToast("→ /?quiz=refine")} />
        <div style={{ height: 18 }} />
        <FactRow label="Producer" value="Raats Family Wines" />
        <FactRow label="Region" value="Stellenbosch, Coastal Region, Western Cape" />
        <FactRow label="Grape" value="Chenin Blanc" />
        <FactRow label="Vintage" value="2022" />

        <SectionHead numeral={next()} label="Tabs & text actions" style={{ margin: "30px 0 12px" }} />
        <ChoiceTabs value={tab} onChange={setTab} tabs={[
          { id: "tried", label: "Tried", count: 13 }, { id: "want", label: "Want", count: 3 },
          { id: "skipped", label: "Passed", count: 1 }, { id: "timeline", label: "Timeline" },
        ]} />
        <TextActions centered style={{ marginTop: 16 }}>
          <TextAction>📋 Scan another list</TextAction>
          <TextAction tone="secondary">📸 Add another page</TextAction>
        </TextActions>
        <TextActions centered gap={28}>
          <TextAction weight={700}>📸 Log what you drank</TextAction>
          <TextAction tone="quiet">Skip</TextAction>
        </TextActions>
        <div style={{ textAlign: "center" }}>
          <TextAction tone="quiet" underlined>We went a different way tonight</TextAction>
        </div>

        <SectionHead numeral={next()} label="Palate" style={{ margin: "30px 0 12px" }} />
        <Divider />
        <p style={{ ...TYPE.eyebrow, textAlign: "center", marginTop: 14 }}>Palate signature</p>
        <Rail left="Old World" right="New World" value={0.38} style={{ marginTop: 18 }} />
        <Rail left="Focused" right="Wide-ranging" value={0.55} delay={140} style={{ marginTop: 16 }} />
        <Rail left="Red" right="White" value={0.52} delay={280} style={{ marginTop: 16 }} />
        {[["Hemel-en-Aarde", "Region", 0.6, "two"], ["Ken Forrester", "Estate", 0.5, "one"]].map(([name, dim, ratio, away], i) => (
          <div key={name} style={{ padding: "14px 0", borderBottom: `1px solid ${ink(0.07)}`, marginTop: i ? 0 : 18 }}>
            <TermLine label={name} labelSize={17}>
              <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", color: ink(0.7), whiteSpace: "nowrap" }}>{away} loved bottle{away === "one" ? "" : "s"} away</span>
            </TermLine>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <span style={{ ...TYPE.meta, width: 52, flexShrink: 0 }}>{dim}</span>
              <ProgressLine value={ratio} delay={200 + i * 90} label={`${name} progress`} />
            </div>
          </div>
        ))}
        <div style={{ textAlign: "center", marginTop: 26 }}>
          <p style={{ ...TYPE.eyebrow, letterSpacing: "0.24em" }}>🍷 The Somm is reading</p>
          <ProgressLine variant="reading" value={reading} style={{ margin: "14px auto 0" }} />
          <TextAction tone="secondary" onClick={readAList}>Read a list</TextAction>
        </div>

        <SectionHead numeral={next()} label="Empty state & toasts" style={{ margin: "30px 0 0" }} />
        <EmptyState emoji="🍷" title="The first page is always blank"
          sub="Rate a bottle you know and it starts here — every rating sharpens your DNA."
          action="📸 Log a bottle" onAction={() => showToast("→ /log")} />
        <TextActions centered style={{ marginTop: 18 }}>
          <TextAction onClick={() => showToast("Removed from your journal")}>One toast</TextAction>
          <TextAction tone="secondary" onClick={() => {
            showToast("🥂 Noted — enjoy it");
            showToast("🧬 Your Wine DNA evolved: Chenin Blanc added to your DNA", { delay: 1500, duration: 4000 });
            showToast("🧬 Your DNA has shifted: you're now The Stellenbosch Loyalist", { delay: 3000, duration: 5000 });
          }}>Evolution sequence</TextAction>
        </TextActions>

        <Divider style={{ marginTop: 36 }} />
        <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "12px", color: ink(0.4), textAlign: "center", marginTop: 8 }}>
          Never guess at a wine list again.
        </p>
      </main>
      <Toast toasts={toasts} aboveServiceBar />
      <ServiceBar />
    </>
  );
}
