"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import wineUnified from "@/lib/wineUnified.json";
import { generateDNAProfile } from "@/lib/profileEngine";
import { composeIdentity } from "@/lib/identityEngine";
import { saveStash } from "@/lib/pendingPalate";
import { MARK_MOTION, markParams } from "@/lib/palateMark";
import WineRecList from "@/components/WineRecList";
import PalateMarkLive from "@/components/PalateMarkLive";
import Divider from "@/components/house/Divider";
import Dots from "@/components/house/Dots";
import Enter from "@/components/house/Enter";
import LeaderEntry from "@/components/house/LeaderEntry";
import ProgressLine from "@/components/house/ProgressLine";
import RuledField from "@/components/house/RuledField";
import SectionHead from "@/components/house/SectionHead";
import TextAction from "@/components/house/TextAction";
import WriteIn from "@/components/house/WriteIn";
import useEntrance, { useIsoLayoutEffect, withEntrance } from "@/components/house/useEntrance";
import { D_REDUCED, D_TAP, D_WORD, EASE, QUIZ_STEP, REVEAL, prefersReducedMotion } from "@/components/house/motion";
import { BURGUNDY, COLUMN, GUTTER, INK, SAGE, SANS, SERIF, TYPE, ink, leader } from "@/components/house/tokens";

const { countries: COUNTRIES_RAW, regions: REGIONS_DATA, producers: PRODUCERS_DATA, varietals: VARIETALS_RAW } = wineUnified;

// ─── The quiz in the House List look (docs/motion/README.md §8.2) ───
//
// Five steps, each a page of a wine list you tick: a title, a line of help,
// then the options set as words in Playfair under ruled small-caps heads.
// A tapped option turns burgundy and wears a ✓; earned DNA (refine mode)
// wears the ✦, explained by the legend in the header. Every option is a
// toggle button (aria-pressed) with at least 40px of height to tap, and it
// holds the room its selected look needs from the start: a tap changes
// color and weight and never moves an option (README §13).
//
// The header is a slim running head: back (to the previous step, or out of
// a refine), the user's own bloom growing as they answer, "Step N of 5",
// and a sage line filling step by step. The one primary action sits in a
// frosted bar at the foot.
//
// Motion: the leaving step fades and moves left; the arriving step's title
// rises, then its options settle in a few ms apart (QUIZ_STEP). The page
// jumps to the top while the old step is invisible, so a new title never
// arrives under the sticky header.

const ANSWERS_EMPTY = { countries: [], regions: {}, estates: {}, varietals: [], specificWines: [] };
const LEGEND_ID = "quiz-earned-legend";
// Inside an arriving step, from its mount
const STEP_AT = { title: 0, sub: 60, options: 150 };

/** Did the quiz hear anything yet? Before the first answer the bloom is bare. */
const hasAnswers = (a) =>
  a.countries.length > 0 || a.varietals.length > 0 || a.specificWines.length > 0 ||
  Object.values(a.regions).some((ids) => ids.length > 0) ||
  Object.values(a.estates).some((ids) => ids.length > 0);

/** Each option's entrance delay: QUIZ_STEP.optionStep apart from `base`, the
 *  whole stagger capped. Call next() inside an option's own render. */
function optionDelays(base = STEP_AT.options) {
  let i = 0;
  return () => base + Math.min(QUIZ_STEP.optionStep * i++, QUIZ_STEP.optionCap);
}

// ─── Small UI components ───

// The ✓'s place at the end of an option: held whether or not it shows. The
// mark sits inside it out of flow, so neither its width nor the metrics of
// whatever font draws it can reach the row.
const CHECK_SLOT = 12;
const checkSlot = { position: "relative", alignSelf: "center", width: CHECK_SLOT, height: CHECK_SLOT, flexShrink: 0 };
const checkMark = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: SANS, fontSize: "13px", fontWeight: 700, lineHeight: 1, color: BURGUNDY,
};
const stacked = { gridArea: "1 / 1" };

/**
 * One option: a word on the list to tick. A toggle button unless `selected`
 * is left out (the step 5 suggestions only fill the field). Selected is
 * burgundy and bold with a ✓; `earned` wears the ✦ and is described by the
 * legend.
 *
 * A toggle never changes size: its label sits in a cell a hidden bold copy
 * holds open, and the ✓ has its slot from the start. The ✓ itself is in the
 * DOM only while selected — the refine guard and the account seeder read it
 * from the option's text.
 */
function Choice({ label, emoji, prefix, selected, earned, onClick, enterDelay }) {
  const ref = useRef(null);
  const entering = useEntrance(ref, "rise", {
    delay: enterDelay, distance: QUIZ_STEP.optionPx, duration: D_WORD, play: enterDelay != null,
  });
  const toggles = selected != null;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={toggles ? selected : undefined}
      aria-describedby={earned ? LEGEND_ID : undefined}
      style={withEntrance({
        display: "inline-flex", alignItems: "baseline", gap: 6, minHeight: 40, padding: "9px 0",
        border: "none", background: "none", cursor: "pointer", textAlign: "left",
        fontFamily: SERIF, fontSize: "17px", lineHeight: "22px",
        fontWeight: 400, color: selected || prefix ? BURGUNDY : INK,
        transition: `color ${D_TAP}ms ease`,
      }, entering)}
    >
      {prefix && <span aria-hidden="true" style={{ fontFamily: SANS, fontSize: "14px", opacity: 0.7 }}>{prefix}</span>}
      {emoji && <span aria-hidden="true" style={{ fontSize: "15px" }}>{emoji}</span>}
      {toggles ? (
        <span style={{ display: "inline-grid" }}>
          <span aria-hidden="true" style={{ ...stacked, fontWeight: 600, visibility: "hidden" }}>{label}</span>
          <span style={{ ...stacked, fontWeight: selected ? 600 : 400 }}>{label}</span>
        </span>
      ) : <span>{label}</span>}
      {earned && <span aria-hidden="true" style={{ fontSize: "11px", color: BURGUNDY }}>✦</span>}
      {toggles && (
        <span aria-hidden="true" style={checkSlot}>
          {selected && <span style={checkMark}>✓</span>}
        </span>
      )}
    </button>
  );
}

/** Options flow like words, wrapping; each keeps its own 40px of height. */
function Choices({ children, style }) {
  return <div style={{ display: "flex", flexWrap: "wrap", columnGap: 18, ...style }}>{children}</div>;
}

/** A small italic label inside a group — Red, White. */
function SubLabel({ children, color }) {
  return (
    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", lineHeight: 1.4, color, margin: "10px 0 0" }}>
      {children}
    </p>
  );
}

function StepHeader({ title, subtitle }) {
  return (
    <div>
      <Enter as="h1" delay={STEP_AT.title} style={{ ...TYPE.h1, textWrap: "balance" }}>{title}</Enter>
      <Enter as="p" delay={STEP_AT.sub} style={{ ...TYPE.sub, marginTop: 8 }}>{subtitle}</Enter>
    </div>
  );
}

const groupHead = { margin: "26px 0 4px" };

/**
 * Countries or regions you open one at a time: each a ruled line
 *   🇿🇦 South Africa ··················· 2 selected ›
 * that opens its options beneath it.
 */
function Accordion({ items, renderContent, getLabel, getCount, defaultOpen }) {
  const [expanded, setExpanded] = useState(defaultOpen || null);
  return (
    <div style={{ borderTop: `1px solid ${ink(0.1)}`, marginTop: 22 }}>
      {items.map((item) => {
        const isOpen = expanded === item.id;
        const count = getCount(item);
        const panelId = `quiz-group-${item.id}`;
        return (
          <div key={item.id} style={{ borderBottom: `1px solid ${ink(0.1)}` }}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setExpanded(isOpen ? null : item.id)}
              style={{
                width: "100%", display: "flex", alignItems: "flex-end", gap: 10, minHeight: 52,
                padding: "14px 0 10px", border: "none", background: "none", cursor: "pointer",
                textAlign: "left", color: INK,
              }}
            >
              <span style={{
                fontFamily: SERIF, fontSize: "19px", fontWeight: 600, lineHeight: 1.25,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
              }}>{getLabel(item)}</span>
              <span aria-hidden="true" style={{ flex: 1, minWidth: 12, borderBottom: leader(1.5), marginBottom: 6 }} />
              {count > 0 && (
                <span style={{ ...TYPE.meta, color: BURGUNDY, opacity: 1, whiteSpace: "nowrap", paddingBottom: 3 }}>
                  {count} selected
                </span>
              )}
              <span aria-hidden="true" style={{
                fontFamily: SANS, fontSize: "18px", lineHeight: 1.2, color: BURGUNDY,
                transform: isOpen ? "rotate(90deg)" : "none", transition: `transform ${D_TAP}ms ease`,
              }}>›</span>
            </button>
            {isOpen && <div id={panelId} style={{ paddingBottom: 14 }}>{renderContent(item)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Quiz Steps ───

function CountryStep({ selected, onToggle, earned }) {
  const oldWorld = COUNTRIES_RAW.filter(c => c.world === "old")
    .sort((a, b) => b.reviewCount - a.reviewCount);
  const newWorld = COUNTRIES_RAW.filter(c => c.world === "new")
    .sort((a, b) => b.reviewCount - a.reviewCount);
  const next = optionDelays();

  const renderGroup = (label, countries) => (
    <div>
      <SectionHead label={label} style={groupHead} />
      <Choices>
        {countries.map(c => (
          <Choice key={c.id} label={c.name} emoji={c.emoji}
            selected={selected.includes(c.id)}
            earned={earned?.has(`country:${c.id}`)}
            onClick={() => onToggle(c.id)} enterDelay={next()} />
        ))}
      </Choices>
    </div>
  );

  return (
    <div>
      <StepHeader title="Where in the world?"
        subtitle="Select the countries whose wines you enjoy. Pick as many as you like." />
      {renderGroup("Old World", oldWorld)}
      {renderGroup("New World", newWorld)}
    </div>
  );
}

/** A quiet "Show 12 more regions" under an open group. */
function ShowMore({ onClick, children }) {
  return <TextAction onClick={onClick} style={{ display: "block", marginTop: 2 }}>{children}</TextAction>;
}

function RegionStep({ selectedCountries, regions, onToggle, earned }) {
  const [expandedCountries, setExpandedCountries] = useState({});
  const INITIAL_SHOW = 12;

  const items = selectedCountries
    .map(cId => {
      const country = COUNTRIES_RAW.find(c => c.id === cId);
      const countryRegions = (REGIONS_DATA[cId] || [])
        .slice()
        .sort((a, b) => b.reviewCount - a.reviewCount);
      return { id: cId, country, regions: countryRegions };
    })
    .filter(i => i.regions.length > 0);

  return (
    <div>
      <StepHeader title="Let's get more specific"
        subtitle="For each country, do you have favorite regions? Select any you know and love — or skip to like the country broadly." />
      <Accordion items={items} defaultOpen={items[0]?.id}
        getLabel={i => `${i.country.emoji} ${i.country.name}`}
        getCount={i => (regions[i.id] || []).length}
        renderContent={i => {
          const isExpanded = expandedCountries[i.id];
          const visible = isExpanded ? i.regions : i.regions.slice(0, INITIAL_SHOW);
          const remaining = i.regions.length - INITIAL_SHOW;
          const next = optionDelays(0);
          return (
            <>
              <Choices>
                {visible.map(r => (
                  <Choice key={r.id} label={r.name}
                    selected={(regions[i.id] || []).includes(r.id)}
                    earned={earned?.has(`region:${r.id}`)}
                    onClick={() => onToggle(i.id, r.id)} enterDelay={next()} />
                ))}
              </Choices>
              {!isExpanded && remaining > 0 && (
                <ShowMore onClick={() => setExpandedCountries(p => ({ ...p, [i.id]: true }))}>
                  Show {remaining} more regions
                </ShowMore>
              )}
            </>
          );
        }}
      />
    </div>
  );
}

function ProducerStep({ selectedRegions, estates, onToggle, earned }) {
  const [expandedRegions, setExpandedRegions] = useState({});
  const PAGE_SIZE = 15;

  const items = Object.entries(selectedRegions).flatMap(([countryId, regionIds]) =>
    regionIds
      .filter(rId => PRODUCERS_DATA[rId] && PRODUCERS_DATA[rId].length > 0)
      .map(rId => {
        const region = (REGIONS_DATA[countryId] || []).find(r => r.id === rId);
        const country = COUNTRIES_RAW.find(c => c.id === countryId);
        return {
          id: rId,
          region,
          country,
          producers: PRODUCERS_DATA[rId] || [],
        };
      })
  );

  if (items.length === 0) {
    return (
      <div>
        <StepHeader title="Any favorite producers?"
          subtitle="No producers found for your selected regions — no worries! You can add specific wines in the next step." />
      </div>
    );
  }

  return (
    <div>
      <StepHeader title="Any favorite producers?"
        subtitle="Know specific estates or wineries you love? Select them — totally fine to skip this step." />
      <Accordion items={items} defaultOpen={items[0]?.id}
        getLabel={i => `${i.country?.emoji || ""} ${i.region?.name || i.id}`}
        getCount={i => (estates[i.id] || []).length}
        renderContent={i => {
          const showCount = expandedRegions[i.id] || PAGE_SIZE;
          const visible = i.producers.slice(0, showCount);
          const remaining = i.producers.length - showCount;
          const next = optionDelays(0);
          return (
            <>
              <Choices>
                {visible.map(p => (
                  <Choice key={p.id} label={p.name}
                    selected={(estates[i.id] || []).includes(p.id)}
                    earned={earned?.has(`estate:${p.id}`)}
                    onClick={() => onToggle(i.id, p.id)} enterDelay={next()} />
                ))}
              </Choices>
              {remaining > 0 && (
                <ShowMore onClick={() => setExpandedRegions(p => ({
                  ...p, [i.id]: showCount + PAGE_SIZE,
                }))}>
                  Show {Math.min(remaining, PAGE_SIZE)} more producers
                </ShowMore>
              )}
            </>
          );
        }}
      />
    </div>
  );
}

function VarietalStep({ selected, onToggle, selectedRegions, selectedEstates, earned }) {
  // Compute relevance scores: regionMatches * 3 + producerMatches * 1 (per spec 2E)
  const scores = {};

  // Region signal: each selected region's topVarietals get +3
  Object.entries(selectedRegions || {}).forEach(([countryId, regionIds]) => {
    regionIds.forEach(rId => {
      const region = (REGIONS_DATA[countryId] || []).find(r => r.id === rId);
      if (region && region.topVarietals) {
        region.topVarietals.forEach(vId => {
          scores[vId] = (scores[vId] || 0) + 3;
        });
      }
    });
  });

  // Producer signal: each selected producer's topVarietals get +1
  Object.entries(selectedEstates || {}).forEach(([rId, pIds]) => {
    const producers = PRODUCERS_DATA[rId] || [];
    pIds.forEach(pId => {
      const producer = producers.find(p => p.id === pId);
      if (producer && producer.topVarietals) {
        producer.topVarietals.forEach(vId => {
          scores[vId] = (scores[vId] || 0) + 1;
        });
      }
    });
  });

  const hasSelections = Object.keys(scores).length > 0;

  const sorted = VARIETALS_RAW.slice().sort((a, b) => {
    const sa = scores[a.id] || 0;
    const sb = scores[b.id] || 0;
    if (sa !== sb) return sb - sa;
    return b.reviewCount - a.reviewCount;
  });

  const relevant = hasSelections ? sorted.filter(v => scores[v.id]) : [];
  const other = hasSelections ? sorted.filter(v => !scores[v.id]) : sorted;
  const next = optionDelays();

  // Red and White keep their colors: burgundy and sage
  const renderGroup = (varietals, colorLabel, colorHex) => {
    const filtered = varietals.filter(v => v.color === colorLabel);
    if (filtered.length === 0) return null;
    return (
      <div>
        <SubLabel color={colorHex}>{colorLabel === "red" ? "Red" : "White"}</SubLabel>
        <Choices>
          {filtered.map(v => (
            <Choice key={v.id} label={v.name}
              selected={selected.includes(v.id)}
              earned={earned?.has(`varietal:${v.id}`)}
              onClick={() => onToggle(v.id)} enterDelay={next()} />
          ))}
        </Choices>
      </div>
    );
  };

  const renderSection = (label, varietals) => {
    if (varietals.length === 0) return null;
    return (
      <div>
        <SectionHead label={label} style={groupHead} />
        {renderGroup(varietals, "red", BURGUNDY)}
        {renderGroup(varietals, "white", SAGE)}
      </div>
    );
  };

  return (
    <div>
      <StepHeader title="Which grapes do you love?"
        subtitle="These are your preferences regardless of origin. A Pinot Noir lover is a Pinot Noir lover, whether Burgundy or Oregon." />
      {hasSelections ? (
        <>
          {renderSection("Based on your selections", relevant)}
          {renderSection("Other varietals", other)}
        </>
      ) : (
        <div style={{ marginTop: 14 }}>
          {renderGroup(sorted, "red", BURGUNDY)}
          {renderGroup(sorted, "white", SAGE)}
        </div>
      )}
    </div>
  );
}

function SpecificWineStep({ wines, onAdd, onRemove, selectedEstates }) {
  // Derive tappable suggestions from Step 4 estate selections
  const estateSuggestions = Object.entries(selectedEstates || {})
    .flatMap(([rId, eIds]) =>
      (PRODUCERS_DATA[rId] || []).filter(p => eIds.includes(p.id)).map(p => p.name)
    )
    .filter(name => !wines.includes(name))
    .slice(0, 8);
  const [val, setVal] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const ref = useRef(null);
  const [acData, setAcData] = useState(null);

  // Lazy-load autocomplete data
  useEffect(() => {
    import("@/lib/wineAutocomplete.json").then(mod => setAcData(mod.default || mod));
  }, []);

  const handleChange = (text) => {
    setVal(text);
    if (!acData || text.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = text.toLowerCase().trim();
    const matches = acData.filter(item => {
      return item.w.toLowerCase().includes(q) || (item.v && item.v.toLowerCase().includes(q));
    }).slice(0, 6);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  };

  const selectSuggestion = (item) => {
    // Fill input with producer name + trailing space so user can continue typing wine/vintage
    setVal(item.w + " ");
    setSuggestions([]);
    setShowSuggestions(false);
    ref.current?.focus();
  };

  const add = () => { const t = val.trim(); if (t && !wines.includes(t)) { onAdd(t); setVal(""); setSuggestions([]); setShowSuggestions(false); ref.current?.focus(); } };
  const next = optionDelays();

  return (
    <div>
      <StepHeader title="Any specific favorites?" subtitle="Name a wine you'd order again in a heartbeat — producer, wine name, vintage, whatever you remember." />
      <Enter delay={STEP_AT.options} style={{ marginTop: 22 }}>
        <RuledField
          ref={ref}
          variant="entry"
          value={val}
          onChange={e => handleChange(e.target.value)}
          onSubmit={add}
          submitLabel="Add"
          onKeyDown={e => { if (e.key === "Escape") { setSuggestions([]); setShowSuggestions(false); } }}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Kanonkop Paul Sauer 2019…"
          aria-label="A wine you'd order again"
          autoComplete="off"
          enterKeyHint="done"
        />
      </Enter>

      {/* Autocomplete: producers and wines from the catalog */}
      {showSuggestions && (
        <div style={{ marginTop: 4 }}>
          {suggestions.map((item, i) => (
            <button key={i} type="button" onClick={() => selectSuggestion(item)} style={{
              width: "100%", display: "flex", flexDirection: "column", gap: 2, minHeight: 44,
              padding: "9px 0", border: "none", borderBottom: `1px solid ${ink(0.08)}`,
              background: "none", cursor: "pointer", textAlign: "left",
            }}>
              <span style={{ fontFamily: SERIF, fontSize: "16px", lineHeight: 1.3, color: INK }}>{item.w}</span>
              <span style={{ ...TYPE.meta, lineHeight: 1.4 }}>{[item.v, item.r, item.c].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}

      {wines.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {wines.map((w, i) => (
            <div key={w} style={{
              display: "flex", alignItems: "flex-end", gap: 10, borderBottom: `1px solid ${ink(0.08)}`,
            }}>
              <span style={{ fontFamily: SERIF, fontSize: "17px", lineHeight: 1.3, color: INK, padding: "10px 0", minWidth: 0 }}>{w}</span>
              <span aria-hidden="true" style={{ flex: 1, minWidth: 12, borderBottom: leader(1.5), marginBottom: 16 }} />
              <TextAction tone="quiet" onClick={() => onRemove(i)} ariaLabel={`Remove ${w}`}>Remove</TextAction>
            </div>
          ))}
        </div>
      )}
      {estateSuggestions.length > 0 && wines.length === 0 && (
        <div>
          <SectionHead label="From your producers" style={groupHead} />
          <Choices>
            {estateSuggestions.map((name) => (
              <Choice key={name} label={name} prefix="+" enterDelay={next()}
                onClick={() => { setVal(name + " "); ref.current?.focus(); }} />
            ))}
          </Choices>
        </div>
      )}
      {wines.length === 0 && estateSuggestions.length === 0 && (
        <Enter kind="fade" as="p" delay={STEP_AT.options} style={{
          fontFamily: SERIF, fontStyle: "italic", fontSize: "15px", lineHeight: 1.5, color: ink(0.45), marginTop: 22,
        }}>No specific wines added yet — perfectly fine!</Enter>
      )}
    </div>
  );
}

// ─── The Reveal (docs/motion/README.md §8.3 — the first big moment) ───
//
// Quiz completion is a moment, not a page. On cream, with no card: a
// medallion waits while the palate saves ("The Somm is reading your
// palate..."), and once the save has landed — never sooner than the mark's
// own think time — the bloom draws itself and the reading arrives under it:
// the title written in, the epithet, the narrative written in, "✓ Saved to
// your palate" and the door to /palate. The palate is already saved when it
// lands (auto-save: a signed-in user never has an unsaved completed quiz).
// Identity detail lives ONLY in PalateView — no Full Profile tab, no stat
// counts here.
//
// One component, mounted once for the whole of it: the mark that waits is
// the mark that draws. The parts mount as the draw starts, each on its delay
// from REVEAL (motion.js) — so nothing is shown before the reveal, and from
// its first frame everything is in the DOM and live. Under reduced motion
// the bloom is settled from the start and the parts simply appear.
//
// Signed out it is the Velvet Rope's teaser: the same wait, the same draw,
// the same title — then the gate.

const REVEAL_MARK = 176;

const revealTitle = {
  fontFamily: SERIF, fontSize: "32px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em",
  color: INK, textWrap: "balance", marginTop: 10,
};
const revealEpithet = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "16px", lineHeight: 1.4, color: BURGUNDY, marginTop: 10,
};
const revealProse = {
  fontFamily: SERIF, fontStyle: "italic", fontSize: "15.5px", lineHeight: 1.6, color: ink(0.78), marginTop: 22,
};
// The saved line and the failure can take focus (after a retry): no ring —
// they aren't controls
const revealSaved = {
  fontFamily: SANS, fontSize: "13px", fontWeight: 600, lineHeight: 1.4, color: SAGE, textAlign: "center",
  outline: "none",
};
const revealFailed = { fontFamily: SANS, fontSize: "14px", lineHeight: 1.55, color: ink(0.75), outline: "none" };
const gateHead = { fontFamily: SERIF, fontSize: "21px", fontWeight: 600, lineHeight: 1.25, color: INK };
const gateFoot = { fontFamily: SANS, fontSize: "13px", lineHeight: 1.5, color: ink(0.55), marginTop: 14 };

/**
 * The line under the waiting medallion. It sits over the place the title
 * will take (out of flow), fades in, and once `leaving` fades out and says
 * it has gone — the reveal then takes it out of the DOM.
 */
function ReadingLine({ leaving, onGone }) {
  const ref = useRef(null);
  const entering = useEntrance(ref, "fade", { delay: REVEAL.lineIn });
  const gone = useRef(onGone);
  gone.current = onGone;

  useIsoLayoutEffect(() => {
    if (!leaving) return undefined;
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || prefersReducedMotion()) {
      gone.current();
      return undefined;
    }
    let live = true;
    const animation = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: REVEAL.lineOutMs, easing: EASE, fill: "backwards",
    });
    animation.finished.then(() => { if (live) gone.current(); }, () => {});
    return () => {
      live = false;
      animation.cancel();
    };
  }, [leaving]);

  return (
    <p ref={ref} role="status" data-testid="reveal-reading" style={withEntrance({
      position: "absolute", left: 0, right: 0, top: REVEAL_MARK + 28,
      fontFamily: SERIF, fontStyle: "italic", fontSize: "19px", lineHeight: 1.5, color: ink(0.7),
      // Gone from sight the moment it starts to leave; the fade plays over that
      ...(leaving && { opacity: 0 }),
    }, entering)}>
      The Somm is reading your palate<Dots />
    </p>
  );
}

/**
 * @param profile     what to reveal: the saved row's truth once there is one
 *                    (a merge can add earned DNA the quiz never showed), the
 *                    local composition until then
 * @param saved       `profile` is the saved row
 * @param pending     the save is in flight: the medallion waits
 * @param saveFailed  the save failed; the reveal still lands, from the local
 *                    composition, with Try again where the saved line would be
 */
function Reveal({ profile, saved, user, pending, saveFailed, onRetry, onGoHome }) {
  // waiting → leaving (the line goes; the draw is REVEAL.lineLead off) →
  // ready (the mark may draw) → drawing (it has begun: the reading mounts).
  // It only ever moves forward.
  const [stage, setStage] = useState("waiting");
  const [lineGone, setLineGone] = useState(false);
  const mountedAt = useRef(null);
  if (mountedAt.current === null && typeof performance !== "undefined") mountedAt.current = performance.now();

  // The wait ends when the save has landed (signed out there is none) and
  // the mark has had its think time, whichever comes later. The line starts
  // to leave just ahead of the draw.
  useEffect(() => {
    if (pending) return undefined;
    const advance = (to, ...from) => setStage((now) => (from.includes(now) ? to : now));
    if (prefersReducedMotion()) {
      advance("ready", "waiting", "leaving");
      return undefined;
    }
    const waited = performance.now() - mountedAt.current;
    const lineOut = Math.max(0, MARK_MOTION.thinkMs - REVEAL.lineLead - waited);
    const timers = [
      setTimeout(() => advance("leaving", "waiting"), lineOut),
      setTimeout(() => advance("ready", "waiting", "leaving"), lineOut + REVEAL.lineLead),
    ];
    return () => timers.forEach(clearTimeout);
  }, [pending]);

  // With no genome the mark draws nothing and will never say its draw began:
  // the reading simply arrives (text-only, as every surface degrades). Asked
  // of the mark's own intake — a genome that is there but isn't one (a
  // malformed identity jsonb) is no mark either
  const hasMark = Boolean(markParams(profile.genome));
  useEffect(() => {
    if (stage === "ready" && !hasMark) setStage("drawing");
  }, [stage, hasMark]);

  const drawing = stage === "drawing";
  // A save that failed, then was tried again: by the time the retry lands
  // the draw is long over, so what it brings arrives at once
  const everFailed = useRef(false);
  if (saveFailed) everFailed.current = true;
  const late = everFailed.current;
  const retrying = pending && late;
  const recsAt = late ? 0 : user ? REVEAL.recs : REVEAL.teaserRecs;

  // A retry is something the user did, so what it brings takes focus as it
  // replaces the entry they tapped: the saved line, or the failure said
  // again (a screen reader hears it; a keyboard keeps its place). Never on
  // the reveal's own arrival.
  const savedRef = useRef(null);
  const failedRef = useRef(null);
  const wasRetrying = useRef(false);
  useEffect(() => {
    if (wasRetrying.current && !retrying) {
      (saveFailed ? failedRef : savedRef).current?.focus({ preventScroll: true });
    }
    wasRetrying.current = retrying;
  }, [retrying, saveFailed]);

  return (
    <div>
      <div style={{ position: "relative", textAlign: "center" }}>
        {/* The visual signature — composed client-side from the local
            genome, so the anonymous teaser draws the identical mark */}
        <div style={{ display: "flex", justifyContent: "center", minHeight: REVEAL_MARK }}>
          <PalateMarkLive
            genome={profile.genome} size={REVEAL_MARK} reveal
            ready={stage === "ready" || drawing}
            onDrawStart={() => setStage("drawing")}
          />
        </div>
        {!lineGone && <ReadingLine leaving={stage !== "waiting"} onGone={() => setLineGone(true)} />}

        {drawing && (
          <>
            <Enter kind="fade" delay={REVEAL.eyebrow} style={{ ...TYPE.eyebrow, color: ink(0.5), marginTop: 26 }}>
              Your Wine DNA
            </Enter>
            <WriteIn
              as="h1" data-testid="reveal-archetype" text={profile.archetype}
              delay={REVEAL.title} step={REVEAL.titleStep} duration={REVEAL.titleMs} style={revealTitle}
            />
            {/* The Velvet Rope (Aug 3): the epithet and narrative are the
                reading — signed-in payoff only. Conditional JSX, never CSS:
                the gated prose must be absent from the render tree. The stash
                still carries the complete profile (capture is finish()'s job,
                untouched by what renders here). */}
            {user && profile.epithet && (
              <Enter as="p" data-testid="reveal-epithet" delay={REVEAL.epithet} style={revealEpithet}>
                {profile.epithet}
              </Enter>
            )}
          </>
        )}
      </div>

      {drawing && user && (
        <>
          <Divider enterDelay={REVEAL.divider} style={{ marginTop: 24 }} />
          <WriteIn
            as="p" data-testid="reveal-narrative" text={profile.narrative}
            delay={REVEAL.narrative} step={REVEAL.narrativeStep} duration={REVEAL.narrativeMs} style={revealProse}
          />
          {saveFailed || retrying ? (
            <div style={{ marginTop: 26 }}>
              <Enter ref={failedRef} as="p" kind="fade" role="alert" tabIndex={-1} delay={REVEAL.saved} style={revealFailed}>
                We couldn&apos;t save your palate just now — one more try should do it.
              </Enter>
              <LeaderEntry
                tone="filled" mark="→" label={retrying ? "Saving…" : "Try again"}
                onClick={onRetry} disabled={retrying} enterDelay={REVEAL.cta} style={{ marginTop: 16 }}
              />
            </div>
          ) : (
            <div style={{ marginTop: 26 }}>
              <Enter
                ref={savedRef} kind="fade" data-testid="reveal-saved" tabIndex={late ? -1 : undefined}
                delay={late ? REVEAL.late.saved : REVEAL.saved} style={revealSaved}
              >
                ✓ Saved to your palate
              </Enter>
              <LeaderEntry
                tone="filled" mark="→" label="Meet your palate" href="/palate" testId="reveal-palate-cta"
                enterDelay={late ? REVEAL.late.cta : REVEAL.cta} style={{ marginTop: 18 }}
              />
            </div>
          )}
        </>
      )}

      {/* The Velvet Rope (Aug 3, replacing S2's over-giving teaser): the
          anonymous reveal shows the HOOK — title + bloom — and the gate
          SELLS the reading behind it (epithet, narrative, signature line).
          It never apologizes for withholding. Saving is promised because
          the stash makes it true. */}
      {drawing && !user && (
        <>
          <Divider enterDelay={REVEAL.divider} style={{ marginTop: 26 }} />
          <Enter data-testid="teaser-gate" delay={REVEAL.gate} style={{ marginTop: 24 }}>
            <p style={gateHead}>Your full reading is ready.</p>
            <p style={{ ...TYPE.sub, marginTop: 8 }}>
              The story behind your title, the signature your taste leaves in a glass, and the bottles we&apos;d pour you tonight — the Somm has already read them all. Save your Wine DNA and it&apos;s yours for good — and it evolves with every bottle you rate.
            </p>
            <LeaderEntry tone="filled" mark="→" label="Save My Wine DNA" href="/signup" style={{ marginTop: 22 }} />
            <p style={gateFoot}>
              Held on this device for 7 days. Already have an account?{" "}
              {/* Inline in the sentence, its hit area padded past the line */}
              <Link href="/login" data-testid="teaser-signin" style={{ color: BURGUNDY, fontWeight: 600, padding: "10px 0", textDecoration: "none" }}>
                Sign in — we&apos;ll fold this into your palate.
              </Link>
            </p>
          </Enter>
        </>
      )}

      {/* Ratable recs — the highest-signal moment: recognition becomes rated
          evidence, and "Building now" is alive from minute one. Anonymous
          users get ONE read-only row (The Velvet Rope): a single match
          proves the Somm read them; the "more wines" tail sells the rest. */}
      {drawing && profile.recommendations?.length > 0 && (
        <section data-testid="reveal-recs" style={{ marginTop: 36 }}>
          <SectionHead label={user ? "Start it off" : "A taste of your matches"} enterDelay={recsAt} />
          <Enter as="p" kind="fade" delay={recsAt + REVEAL.recsSub} style={{ ...TYPE.sub, fontSize: "14px", marginTop: 12 }}>
            {user
              ? "Rate the ones you know — every answer sharpens your palate."
              : "The first bottle we'd pour you. Your full list is waiting behind your account."}
          </Enter>
          {/* A retried save swaps the local recs for the saved row's: a new list */}
          <WineRecList
            key={saved ? "saved" : "local"}
            recs={profile.recommendations} user={user} limit={user ? 5 : 1} surface="reveal"
            enterDelay={recsAt + REVEAL.recsRows}
          />
        </section>
      )}

      {drawing && user && onGoHome && (
        <Enter kind="fade" delay={recsAt + REVEAL.home} style={{ textAlign: "center", marginTop: 20 }}>
          <TextAction tone="quiet" underlined onClick={onGoHome}>I&apos;ll explore later — take me home</TextAction>
        </Enter>
      )}
    </div>
  );
}


// ─── Main Quiz Component ───

const headCell = { width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" };
const backButton = {
  display: "flex", alignItems: "center", gap: 6, height: 44, padding: "0 8px", maxWidth: "100%",
  border: "none", background: "none", cursor: "pointer",
  fontFamily: SANS, fontSize: "14px", fontWeight: 600, color: BURGUNDY, whiteSpace: "nowrap",
};

export default function Quiz({ user, onProfileGenerated, initialAnswers, earnedDna, onCancel, onDone }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers || ANSWERS_EMPTY);
  const [profile, setProfile] = useState(null);
  // Reveal phase: "reading" (save in flight) | "revealed" | "error"
  const [phase, setPhase] = useState(null);
  const [savedRow, setSavedRow] = useState(null);
  // The current step is on its way out (QUIZ_STEP.exitMs)
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const leaveTimer = useRef(0);
  const totalSteps = 5;
  const isRefineMode = !!initialAnswers;

  // "dimension:value" keys of earned-promoted DNA (refine mode only) — these
  // chips wear the ✦ so an uncheck is an informed choice
  const earnedSet = new Set(earnedDna || []);

  // The header bloom: the identity the answers so far compose, through the
  // same pure engine the reveal uses — so it grows into the mark the reveal
  // shows. Bare until the first answer.
  const genome = useMemo(() => composeIdentity(answers).genome, [answers]);
  const answered = hasAnswers(answers);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // The leaving step fades and moves left; once it's gone the page jumps
  // to the top (unseen) and the next step arrives — its title never lands
  // under the sticky header
  const go = (n) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    const ms = prefersReducedMotion() ? D_REDUCED : QUIZ_STEP.exitMs;
    leaveTimer.current = setTimeout(() => {
      window.scrollTo(0, 0);
      setStep(n);
      setLeaving(false);
      leavingRef.current = false;
    }, ms);
  };
  const toggle = (arr, item) => arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  // Auto-save: completing the quiz IS saving it. A signed-in user never sees
  // an unsaved profile — the reveal renders what the save returned (the
  // merged palate), so what they meet is exactly what persisted. The
  // "reading" moment is anticipation, not fake loading: the save genuinely
  // runs behind the waiting medallion, which holds for as long as it takes
  // (and never less than the mark's own think time). A save that throws is
  // a save that failed: it lands on Try again instead of stranding the
  // medallion. (A request that never settles at all would still hold it —
  // as it held the old reading screen.)
  const runSave = async (dna) => {
    setPhase("reading");
    let row = null;
    try {
      row = await onProfileGenerated(dna);
    } catch (err) {
      console.error("Quiz save failed:", err);
    }
    if (row) {
      setSavedRow(row);
      setPhase("revealed");
    } else {
      setPhase("error");
    }
  };

  const finish = () => {
    // Once. The button stays up, and live, for the moment the last step
    // takes to leave — a second tap in it used to save the palate twice
    // and write two quiz_completed events
    if (leavingRef.current) return;
    const dna = generateDNAProfile(answers);
    setProfile(dna);
    go(99);
    if (user && onProfileGenerated) {
      runSave(dna);
    } else {
      // Never Lose a Palate: stash the results at reveal time, BEFORE any
      // navigation can destroy them. localStorage (7-day expiry, version
      // gate) survives the signup/email-confirmation round trip; the first
      // authenticated load of "/" folds it in. Storage failure (private
      // mode) must never break the reveal itself.
      try {
        saveStash(window.localStorage, answers, dna);
      } catch { /* the reveal goes on */ }
      setPhase("revealed");
    }
  };

  const canProceed = step === 0 ? answers.countries.length > 0 : true;

  // The reveal shows the saved truth when there is one (merge can add earned
  // DNA the local computation doesn't know about), the local computation
  // otherwise (anonymous users, or a failed save awaiting retry)
  const revealProfile = savedRow ? {
    archetype: savedRow.archetype,
    epithet: savedRow.identity?.epithet || "",
    genome: savedRow.identity?.genome || profile?.genome,
    narrative: savedRow.narrative,
    recommendations: savedRow.recommendations || [],
  } : profile;

  // The reveal: on cream, in the house column, with no head and no foot bar.
  // Mounted once and kept through the save, a failure and a retry — the
  // medallion that waits is the bloom that draws
  if (step === 99) {
    return (
      <main style={{
        maxWidth: COLUMN, margin: "0 auto", minHeight: "100vh",
        padding: `calc(env(safe-area-inset-top) + 56px) ${GUTTER}px 72px`,
      }}>
        {revealProfile && (
          <Reveal
            profile={revealProfile}
            saved={Boolean(savedRow)}
            user={user}
            pending={phase === "reading"}
            saveFailed={phase === "error"}
            onRetry={() => runSave(profile)}
            onGoHome={onDone}
          />
        )}
      </main>
    );
  }

  const reducedLeave = leaving && prefersReducedMotion();
  const last = step === totalSteps - 1;

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* The running head: back · the bloom · Step N of 5, then the line */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        padding: "calc(env(safe-area-inset-top) + 4px) 14px 0",
        background: "rgba(245,240,232,0.92)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(0,1fr) 44px minmax(0,1fr)",
          alignItems: "center", maxWidth: COLUMN, margin: "0 auto",
        }}>
          <div style={{ minWidth: 0 }}>
            {(step > 0 || onCancel) && (
              <button type="button" onClick={step > 0 ? () => go(step - 1) : onCancel} style={backButton}>
                <span aria-hidden="true" style={{ fontSize: "22px", lineHeight: 1, marginTop: -3 }}>‹</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{step > 0 ? "Back" : "Your list"}</span>
              </button>
            )}
          </div>
          <div style={headCell}>
            {/* It grows quietly — no `celebrate`: the swell, the pulse and the
                ripples belong to a real promotion (README §13) */}
            <PalateMarkLive
              genome={genome} size={44} bare={!answered}
              openMs={QUIZ_STEP.bloomMs} growMs={QUIZ_STEP.bloomMs}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 8 }}>
            <span style={{ ...TYPE.meta, whiteSpace: "nowrap" }}>{`Step ${step + 1} of ${totalSteps}`}</span>
          </div>
        </div>
        <div style={{ maxWidth: COLUMN - 2 * 14, margin: "4px auto 0" }}>
          <ProgressLine value={(step + 1) / totalSteps} />
        </div>
        {isRefineMode && earnedSet.size > 0 && (
          <p id={LEGEND_ID} data-testid="earned-legend" style={{
            maxWidth: COLUMN - 2 * 14, margin: "8px auto 0", paddingBottom: 2,
            fontFamily: SANS, fontSize: "12px", lineHeight: 1.4, color: ink(0.55),
          }}>
            <span style={{ color: BURGUNDY }}>✦</span> earned by your ratings — unchecking one removes it from your palate
          </p>
        )}
        <div style={{ height: 8 }} />
      </header>

      {/* The step. A new key for each one: its entrances play on arrival,
          and the leaving style never carries over */}
      <main style={{ maxWidth: COLUMN, margin: "0 auto", padding: `24px ${GUTTER}px 140px` }}>
        <div key={step} style={leaving ? {
          opacity: 0,
          transform: reducedLeave ? "none" : `translateX(-${QUIZ_STEP.exitPx}px)`,
          transition: `opacity ${reducedLeave ? D_REDUCED : QUIZ_STEP.exitMs}ms ${EASE}, transform ${QUIZ_STEP.exitMs}ms ${EASE}`,
        } : undefined}>
          {step === 0 && <CountryStep selected={answers.countries} earned={earnedSet} onToggle={id => setAnswers(p => ({ ...p, countries: toggle(p.countries, id) }))} />}
          {step === 1 && <RegionStep selectedCountries={answers.countries} regions={answers.regions} earned={earnedSet} onToggle={(cId, rId) => setAnswers(p => ({ ...p, regions: { ...p.regions, [cId]: toggle(p.regions[cId] || [], rId) } }))} />}
          {step === 2 && <ProducerStep selectedRegions={answers.regions} estates={answers.estates} earned={earnedSet} onToggle={(rId, eId) => setAnswers(p => ({ ...p, estates: { ...p.estates, [rId]: toggle(p.estates[rId] || [], eId) } }))} />}
          {step === 3 && <VarietalStep selected={answers.varietals} onToggle={id => setAnswers(p => ({ ...p, varietals: toggle(p.varietals, id) }))} selectedRegions={answers.regions} selectedEstates={answers.estates} earned={earnedSet} />}
          {step === 4 && <SpecificWineStep wines={answers.specificWines} onAdd={w => setAnswers(p => ({ ...p, specificWines: [...p.specificWines, w] }))} onRemove={i => setAnswers(p => ({ ...p, specificWines: p.specificWines.filter((_, j) => j !== i) }))} selectedEstates={answers.estates} />}
        </div>
      </main>

      {/* The one primary action, at the foot */}
      <nav aria-label="Quiz" style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30,
        background: "rgba(245,240,232,0.94)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: `1px solid ${ink(0.1)}`,
      }}>
        <div style={{
          maxWidth: COLUMN, margin: "0 auto",
          padding: `12px ${GUTTER}px calc(env(safe-area-inset-bottom) + 14px)`,
        }}>
          <LeaderEntry
            tone="filled" mark="→" size={22}
            label={last ? (isRefineMode ? "Update My Wine DNA" : "See My Wine DNA") : "Continue"}
            onClick={() => (last ? finish() : go(step + 1))}
            disabled={!canProceed}
          />
        </div>
      </nav>
    </div>
  );
}
