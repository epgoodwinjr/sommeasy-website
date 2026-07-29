"use client";

import { useState, useRef, useEffect } from "react";
import wineUnified from "@/lib/wineUnified.json";
import { generateDNAProfile } from "@/lib/profileEngine";
import WineRecList from "@/components/WineRecList";

const { countries: COUNTRIES_RAW, regions: REGIONS_DATA, producers: PRODUCERS_DATA, varietals: VARIETALS_RAW } = wineUnified;

// ─── Small UI components ───

function Chip({ label, selected, onClick, emoji, color, small, earned }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: small ? "4px" : "6px",
      padding: small ? "6px 12px" : "10px 18px", borderRadius: "100px",
      border: selected ? "2px solid #8B2332" : "2px solid rgba(27,61,47,0.2)",
      background: selected ? "rgba(139,35,50,0.08)" : "rgba(255,255,255,0.6)",
      color: selected ? "#8B2332" : "#1B3D2F",
      fontFamily: "'Source Sans 3', sans-serif", fontSize: small ? "13px" : "15px",
      fontWeight: selected ? 600 : 400, cursor: "pointer", transition: "all 0.2s ease",
      letterSpacing: "0.01em", backdropFilter: "blur(4px)", whiteSpace: "nowrap",
    }}>
      {emoji && <span style={{ fontSize: small ? "14px" : "18px" }}>{emoji}</span>}
      {color && <span style={{ width: small ? 8 : 10, height: small ? 8 : 10, borderRadius: "50%", background: color, flexShrink: 0 }} />}
      {label}
      {earned && <span style={{ color: "#8B2332", fontSize: small ? "10px" : "12px", opacity: 0.85 }}>✦</span>}
      {selected && <span style={{ fontSize: small ? "11px" : "13px", opacity: 0.7 }}>✓</span>}
    </button>
  );
}

function StepHeader({ number, title, subtitle }) {
  return (
    <div style={{ marginBottom: 24, textAlign: "center" }}>
      <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#8B2332", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>Step {number}</div>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", color: "#1B3D2F", margin: "0 0 8px 0", fontWeight: 700 }}>{title}</h2>
      <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.6, margin: 0, lineHeight: 1.5, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>{subtitle}</p>
    </div>
  );
}

function ProgressBar({ current, total }) {
  return (
    <div style={{ display: "flex", gap: "4px", padding: "0 4px" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= current ? "#8B2332" : "rgba(27,61,47,0.12)", transition: "background 0.4s ease" }} />
      ))}
    </div>
  );
}

function Accordion({ items, renderContent, getLabel, getCount, defaultOpen }) {
  const [expanded, setExpanded] = useState(defaultOpen || null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {items.map(item => {
        const isOpen = expanded === item.id;
        const count = getCount(item);
        return (
          <div key={item.id} style={{ background: "rgba(255,255,255,0.5)", borderRadius: "16px", border: "1px solid rgba(27,61,47,0.1)", overflow: "hidden" }}>
            <button onClick={() => setExpanded(isOpen ? null : item.id)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
              fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px", color: "#1B3D2F",
            }}>
              <span>
                {getLabel(item)}
                {count > 0 && <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332", marginLeft: 8, fontWeight: 600 }}>{count} selected</span>}
              </span>
              <span style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.3s ease", fontSize: "14px", opacity: 0.5 }}>▼</span>
            </button>
            {isOpen && <div style={{ padding: "4px 16px 16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>{renderContent(item)}</div>}
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

  const renderGroup = (label, countries) => (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
        textTransform: "uppercase", letterSpacing: "0.15em",
        color: "#1B3D2F", opacity: 0.4, margin: "0 0 10px 4px", fontWeight: 600,
      }}>{label}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {countries.map(c => (
          <Chip key={c.id} label={c.name} emoji={c.emoji}
            selected={selected.includes(c.id)}
            earned={earned?.has(`country:${c.id}`)}
            onClick={() => onToggle(c.id)} />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <StepHeader number="01" title="Where in the world?"
        subtitle="Select the countries whose wines you enjoy. Pick as many as you like." />
      {renderGroup("Old World", oldWorld)}
      {renderGroup("New World", newWorld)}
    </div>
  );
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
      <StepHeader number="02" title="Let's get more specific"
        subtitle="For each country, do you have favorite regions? Select any you know and love — or skip to like the country broadly." />
      <Accordion items={items} defaultOpen={items[0]?.id}
        getLabel={i => `${i.country.emoji} ${i.country.name}`}
        getCount={i => (regions[i.id] || []).length}
        renderContent={i => {
          const isExpanded = expandedCountries[i.id];
          const visible = isExpanded ? i.regions : i.regions.slice(0, INITIAL_SHOW);
          const remaining = i.regions.length - INITIAL_SHOW;
          return (
            <>
              {visible.map(r => (
                <Chip key={r.id} label={r.name}
                  selected={(regions[i.id] || []).includes(r.id)}
                  earned={earned?.has(`region:${r.id}`)}
                  onClick={() => onToggle(i.id, r.id)} small />
              ))}
              {!isExpanded && remaining > 0 && (
                <button onClick={() => setExpandedCountries(p => ({ ...p, [i.id]: true }))}
                  style={{
                    width: "100%", padding: "8px", marginTop: 4,
                    background: "none", border: "1px dashed rgba(27,61,47,0.2)",
                    borderRadius: "8px", cursor: "pointer",
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                    color: "#8B2332", fontWeight: 500,
                  }}>
                  Show {remaining} more regions
                </button>
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
        <StepHeader number="03" title="Any favorite producers?"
          subtitle="No producers found for your selected regions — no worries! You can add specific wines in the next step." />
      </div>
    );
  }

  return (
    <div>
      <StepHeader number="03" title="Any favorite producers?"
        subtitle="Know specific estates or wineries you love? Select them — totally fine to skip this step." />
      <Accordion items={items} defaultOpen={items[0]?.id}
        getLabel={i => `${i.country?.emoji || ""} ${i.region?.name || i.id}`}
        getCount={i => (estates[i.id] || []).length}
        renderContent={i => {
          const showCount = expandedRegions[i.id] || PAGE_SIZE;
          const visible = i.producers.slice(0, showCount);
          const remaining = i.producers.length - showCount;
          return (
            <>
              {visible.map(p => (
                <Chip key={p.id} label={p.name}
                  selected={(estates[i.id] || []).includes(p.id)}
                  earned={earned?.has(`estate:${p.id}`)}
                  onClick={() => onToggle(i.id, p.id)} small />
              ))}
              {remaining > 0 && (
                <button onClick={() => setExpandedRegions(p => ({
                  ...p, [i.id]: showCount + PAGE_SIZE,
                }))}
                  style={{
                    width: "100%", padding: "8px", marginTop: 4,
                    background: "none", border: "1px dashed rgba(27,61,47,0.2)",
                    borderRadius: "8px", cursor: "pointer",
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                    color: "#8B2332", fontWeight: 500,
                  }}>
                  Show {Math.min(remaining, PAGE_SIZE)} more producers
                </button>
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

  const renderGroup = (varietals, colorLabel, colorHex) => {
    const filtered = varietals.filter(v => v.color === colorLabel);
    if (filtered.length === 0) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        <p style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
          textTransform: "uppercase", letterSpacing: "0.12em",
          color: colorHex, margin: "0 0 8px 4px", fontWeight: 600,
        }}>{colorLabel === "red" ? "Red" : "White"}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {filtered.map(v => (
            <Chip key={v.id} label={v.name} color={colorHex}
              selected={selected.includes(v.id)}
              earned={earned?.has(`varietal:${v.id}`)}
              onClick={() => onToggle(v.id)} small />
          ))}
        </div>
      </div>
    );
  };

  const renderSection = (label, varietals) => {
    if (varietals.length === 0) return null;
    return (
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
          textTransform: "uppercase", letterSpacing: "0.15em",
          color: "#1B3D2F", opacity: 0.4, margin: "0 0 12px 4px", fontWeight: 600,
        }}>{label}</p>
        {renderGroup(varietals, "red", "#8B2332")}
        {renderGroup(varietals, "white", "#6B8F5E")}
      </div>
    );
  };

  return (
    <div>
      <StepHeader number="04" title="Which grapes do you love?"
        subtitle="These are your preferences regardless of origin. A Pinot Noir lover is a Pinot Noir lover, whether Burgundy or Oregon." />
      {hasSelections ? (
        <>
          {renderSection("Based on your selections", relevant)}
          {renderSection("Other varietals", other)}
        </>
      ) : (
        <>
          {renderGroup(sorted, "red", "#8B2332")}
          {renderGroup(sorted, "white", "#6B8F5E")}
        </>
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
  const suggestRef = useRef(null);
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

  return (
    <div>
      <StepHeader number="05" title="Any specific favorites?" subtitle="Name a wine you'd order again in a heartbeat — producer, wine name, vintage, whatever you remember." />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: showSuggestions ? 0 : 16 }}>
          <input ref={ref} type="text" value={val} onChange={e => handleChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") { setSuggestions([]); setShowSuggestions(false); } }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder='e.g. "Kanonkop Paul Sauer 2019" or "Cloudy Bay Sauvignon Blanc"'
            autoComplete="off"
            style={{ flex: 1, padding: "12px 16px", borderRadius: "12px", border: "2px solid rgba(27,61,47,0.15)", background: "rgba(255,255,255,0.7)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", outline: "none", transition: "border-color 0.2s ease" }}
          />
          <button onClick={add} disabled={!val.trim()} style={{ padding: "12px 20px", borderRadius: "12px", border: "none", background: val.trim() ? "#8B2332" : "rgba(27,61,47,0.1)", color: val.trim() ? "#F5F0E8" : "rgba(27,61,47,0.3)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, cursor: val.trim() ? "pointer" : "default", transition: "all 0.2s ease" }}>Add</button>
        </div>

        {/* Autocomplete dropdown */}
        {showSuggestions && (
          <div ref={suggestRef} style={{
            background: "rgba(255,255,255,0.97)", borderRadius: "0 0 12px 12px", border: "2px solid rgba(139,35,50,0.15)",
            borderTop: "1px solid rgba(27,61,47,0.08)", marginBottom: 16, maxHeight: 220, overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          }}>
            {suggestions.map((item, i) => (
              <button key={i} onClick={() => selectSuggestion(item)}
                style={{
                  width: "100%", display: "flex", flexDirection: "column", gap: "2px",
                  padding: "10px 16px", background: "none", border: "none",
                  borderBottom: i < suggestions.length - 1 ? "1px solid rgba(27,61,47,0.06)" : "none",
                  cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(139,35,50,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", fontWeight: 500 }}>{item.w}</span>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", color: "#1B3D2F", opacity: 0.45 }}>
                  {[item.v, item.r, item.c].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {wines.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {wines.map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: "10px", background: "rgba(139,35,50,0.06)", border: "1px solid rgba(139,35,50,0.15)" }}>
            <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F" }}>🍷 {w}</span>
            <button onClick={() => onRemove(i)} style={{ background: "none", border: "none", color: "#8B2332", cursor: "pointer", fontSize: "18px", padding: "0 4px", opacity: 0.5 }}>×</button>
          </div>
        ))}
      </div>}
      {estateSuggestions.length > 0 && wines.length === 0 && (
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.4, margin: "0 0 10px 2px", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>From your producers</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {estateSuggestions.map((name) => (
              <button key={name} onClick={() => { setVal(name + " "); ref.current?.focus(); }} style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", borderRadius: "100px",
                border: "1px solid rgba(139,35,50,0.2)",
                background: "rgba(139,35,50,0.04)",
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px",
                color: "#8B2332", cursor: "pointer", transition: "all 0.15s ease",
              }}>
                <span style={{ fontSize: "12px", opacity: 0.6 }}>+</span> {name}
              </button>
            ))}
          </div>
        </div>
      )}
      {wines.length === 0 && estateSuggestions.length === 0 && (
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.4, textAlign: "center", margin: "24px 0", fontStyle: "italic" }}>No specific wines added yet — perfectly fine!</p>
      )}
    </div>
  );
}

// ─── The Reveal (The Reveal session) ───
//
// Quiz completion is a moment, not a page: the archetype lands, the palate is
// already saved (auto-save — there is no unsaved state for a signed-in user),
// and the room it opens onto is /palate. Identity detail lives ONLY in
// PalateView — no Full Profile tab, no stat counts here.

function RevealReading() {
  return (
    <div data-testid="reveal-reading" style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", textAlign: "center", padding: "0 24px" }}>
      <style>{`@keyframes revealPulse { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.06); } }`}</style>
      <img src="/protea-icon.png" alt="" style={{ height: 64, width: "auto", animation: "revealPulse 1.6s ease-in-out infinite" }} />
      <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "19px", fontStyle: "italic", color: "#1B3D2F", opacity: 0.7, margin: 0, lineHeight: 1.5 }}>
        The Somm is reading your palate…
      </p>
    </div>
  );
}

function Reveal({ profile, user, saveFailed, onRetry, onGoHome }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Staged entrance: each block fades up in sequence so the archetype lands
  // as a moment, not a form submit. Settled transform must be "none", not
  // translateY(0) — a non-none transform makes the wrapper the containing
  // block for position:fixed descendants (the rating modal, toasts)
  const stage = (delay) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "none" : "translateY(14px)",
    transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
  });

  return (
    <div>
      {/* Hero — the payoff */}
      <div style={{ background: "linear-gradient(145deg, #1B3D2F 0%, #2A5540 50%, #1B3D2F 100%)", borderRadius: "24px", padding: "36px 24px 32px", color: "#F5F0E8", marginBottom: 20, boxShadow: "0 16px 48px rgba(27,61,47,0.4)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "rgba(139,35,50,0.1)" }} />
        <div style={{ position: "absolute", bottom: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(107,143,94,0.08)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ ...stage(100), fontSize: "52px", marginBottom: 12, transform: mounted ? "scale(1)" : "scale(0.6)", transition: `opacity 0.7s ease 100ms, transform 0.8s cubic-bezier(0.34, 1.4, 0.64, 1) 100ms` }}>{profile.archetypeEmoji}</div>
          <div style={{ ...stage(500), fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: mounted ? 0.5 : 0, marginBottom: 8 }}>Your Wine DNA</div>
          <h2 data-testid="reveal-archetype" style={{ ...stage(700), fontFamily: "'Playfair Display', Georgia, serif", fontSize: "32px", margin: "0 0 16px 0", fontWeight: 700, lineHeight: 1.1 }}>{profile.archetype}</h2>
          <p style={{ ...stage(1100), fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", lineHeight: 1.65, opacity: mounted ? 0.8 : 0, maxWidth: 360, margin: "0 auto" }}>{profile.narrative}</p>
        </div>
      </div>

      {saveFailed && user && (
        <div style={{ ...stage(1300), background: "rgba(139,35,50,0.06)", borderRadius: "14px", padding: "18px 20px", border: "1px solid rgba(139,35,50,0.15)", marginBottom: 16, textAlign: "center" }}>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", margin: "0 0 14px", lineHeight: 1.55, opacity: 0.75 }}>
            We couldn&apos;t save your palate just now — one more try should do it.
          </p>
          <button onClick={onRetry} style={{ padding: "12px 32px", borderRadius: "100px", border: "none", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(139,35,50,0.25)" }}>
            Try again
          </button>
        </div>
      )}

      {!saveFailed && user && (
        <div style={{ ...stage(1500), textAlign: "center", marginBottom: 28 }}>
          <div data-testid="reveal-saved" style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#6B8F5E", fontWeight: 600, marginBottom: 14 }}>
            ✓ Saved to your palate
          </div>
          <a href="/palate" data-testid="reveal-palate-cta" style={{ display: "inline-block", padding: "15px 44px", borderRadius: "100px", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, textDecoration: "none", boxShadow: "0 6px 24px rgba(139,35,50,0.3)" }}>
            Meet your palate →
          </a>
        </div>
      )}

      {!user && (
        <div style={{ ...stage(1500), background: "rgba(139,35,50,0.06)", borderRadius: "14px", padding: "20px 20px", border: "1px solid rgba(139,35,50,0.15)", marginBottom: 28, textAlign: "center" }}>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", margin: "0 0 16px 0", lineHeight: 1.55, opacity: 0.7 }}>
            Save your profile free — then paste any restaurant wine list and get your picks matched to your taste in seconds.
          </p>
          <a href="/signup" style={{ display: "inline-block", padding: "12px 32px", borderRadius: "100px", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(139,35,50,0.25)" }}>Save My Profile →</a>
        </div>
      )}

      {/* Ratable recs — the highest-signal moment: recognition becomes rated
          evidence, and "Building now" is alive from minute one */}
      {profile.recommendations?.length > 0 && (
        <div data-testid="reveal-recs" style={stage(1900)}>
          <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "20px", color: "#1B3D2F", fontWeight: 600, margin: "0 0 6px" }}>Start it off</h3>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.55, margin: "0 0 14px", lineHeight: 1.5 }}>
            Rate the ones you know — every answer sharpens your palate.
          </p>
          <WineRecList recs={profile.recommendations} user={user} limit={5} />
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 28, paddingBottom: 40 }}>
        {user && onGoHome && (
          <button onClick={onGoHome} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.4, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: "12px 16px" }}>
            I&apos;ll explore later — take me home
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Quiz Component ───

// The "reading" moment is anticipation, not fake loading — the save genuinely
// runs behind it. This floor just keeps it from flashing when the save is fast.
const MIN_READING_MS = 1400;

export default function Quiz({ user, onProfileGenerated, initialAnswers, earnedDna, onCancel, onDone }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers || { countries: [], regions: {}, estates: {}, varietals: [], specificWines: [] });
  const [profile, setProfile] = useState(null);
  // Reveal phase: "reading" (save in flight) | "revealed" | "error"
  const [phase, setPhase] = useState(null);
  const [savedRow, setSavedRow] = useState(null);
  const [anim, setAnim] = useState(false);
  const scrollRef = useRef(null);
  const totalSteps = 5;
  const isRefineMode = !!initialAnswers;

  // "dimension:value" keys of earned-promoted DNA (refine mode only) — these
  // chips wear the ✦ so an uncheck is an informed choice
  const earnedSet = new Set(earnedDna || []);

  const go = (n) => { setAnim(true); setTimeout(() => { setStep(n); setAnim(false); window.scrollTo({ top: 0, behavior: "smooth" }); }, 200); };
  const toggle = (arr, item) => arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  // Auto-save: completing the quiz IS saving it. A signed-in user never sees
  // an unsaved profile — the reveal renders what the save returned (the
  // merged palate), so what they meet is exactly what persisted.
  const runSave = async (dna) => {
    setPhase("reading");
    const started = Date.now();
    const row = await onProfileGenerated(dna);
    const remaining = MIN_READING_MS - (Date.now() - started);
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    if (row) {
      setSavedRow(row);
      setPhase("revealed");
    } else {
      setPhase("error");
    }
  };

  const finish = () => {
    const dna = generateDNAProfile(answers);
    setProfile(dna);
    go(99);
    if (user && onProfileGenerated) {
      runSave(dna);
    } else {
      setPhase("revealed");
    }
  };

  const canProceed = step === 0 ? answers.countries.length > 0 : true;

  // The reveal shows the saved truth when there is one (merge can add earned
  // DNA the local computation doesn't know about), the local computation
  // otherwise (anonymous users, or a failed save awaiting retry)
  const revealProfile = savedRow ? {
    archetype: savedRow.archetype,
    archetypeEmoji: savedRow.archetype_emoji,
    narrative: savedRow.narrative,
    recommendations: savedRow.recommendations || [],
  } : profile;

  return (
    <div ref={scrollRef} style={{ maxWidth: 520, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      {step >= 0 && step < 99 && (
        <div style={{ padding: "16px 20px 12px", position: "sticky", top: 0, background: "rgba(245,240,232,0.9)", backdropFilter: "blur(12px)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {onCancel && (
                <button onClick={onCancel} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: "14px 16px 14px 0" }}>← Back</button>
              )}
              <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.01em" }}>
                {!isRefineMode && <img src="/protea-icon.png" alt="" style={{ height: 34, width: "auto" }} />}
                {isRefineMode ? "Refine Profile" : "Sommeasy"}
              </span>
            </div>
            <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.5 }}>Step {step + 1} of {totalSteps}</span>
          </div>
          <ProgressBar current={step} total={totalSteps} />
          {isRefineMode && earnedSet.size > 0 && (
            <p data-testid="earned-legend" style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.55, margin: "10px 4px 0", lineHeight: 1.4 }}>
              <span style={{ color: "#8B2332" }}>✦</span> earned by your ratings — unchecking one removes it from your palate
            </p>
          )}
        </div>
      )}

      {/* Content */}
      {/* Settled transform is "none" so fixed-position children (rating modal,
          toasts) anchor to the viewport, not this wrapper */}
      <div style={{ flex: 1, padding: "20px 20px 120px", opacity: anim ? 0 : 1, transform: anim ? "translateX(20px)" : "none", transition: "all 0.2s ease" }}>
        {step === 0 && <CountryStep selected={answers.countries} earned={earnedSet} onToggle={id => setAnswers(p => ({ ...p, countries: toggle(p.countries, id) }))} />}
        {step === 1 && <RegionStep selectedCountries={answers.countries} regions={answers.regions} earned={earnedSet} onToggle={(cId, rId) => setAnswers(p => ({ ...p, regions: { ...p.regions, [cId]: toggle(p.regions[cId] || [], rId) } }))} />}
        {step === 2 && <ProducerStep selectedRegions={answers.regions} estates={answers.estates} earned={earnedSet} onToggle={(rId, eId) => setAnswers(p => ({ ...p, estates: { ...p.estates, [rId]: toggle(p.estates[rId] || [], eId) } }))} />}
        {step === 3 && <VarietalStep selected={answers.varietals} onToggle={id => setAnswers(p => ({ ...p, varietals: toggle(p.varietals, id) }))} selectedRegions={answers.regions} selectedEstates={answers.estates} earned={earnedSet} />}
        {step === 4 && <SpecificWineStep wines={answers.specificWines} onAdd={w => setAnswers(p => ({ ...p, specificWines: [...p.specificWines, w] }))} onRemove={i => setAnswers(p => ({ ...p, specificWines: p.specificWines.filter((_, j) => j !== i) }))} selectedEstates={answers.estates} />}
        {step === 99 && phase === "reading" && <RevealReading />}
        {step === 99 && (phase === "revealed" || phase === "error") && revealProfile && (
          <Reveal
            profile={revealProfile}
            user={user}
            saveFailed={phase === "error"}
            onRetry={() => runSave(profile)}
            onGoHome={onDone}
          />
        )}
      </div>

      {/* Navigation */}
      {step >= 0 && step < totalSteps && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px 24px", background: "linear-gradient(to top, rgba(245,240,232,1) 60%, rgba(245,240,232,0))", display: "flex", justifyContent: "center", gap: "12px", zIndex: 10 }}>
          <div style={{ maxWidth: 520, width: "100%", display: "flex", gap: "12px" }}>
            {step > 0 && <button onClick={() => go(step - 1)} style={{ flex: 1, padding: "14px", borderRadius: "14px", border: "2px solid rgba(27,61,47,0.15)", background: "rgba(255,255,255,0.7)", color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, cursor: "pointer" }}>Back</button>}
            <button onClick={() => step === totalSteps - 1 ? finish() : go(step + 1)} disabled={!canProceed} style={{
              flex: step === 0 ? 1 : 2, padding: "14px", borderRadius: "14px", border: "none",
              background: canProceed ? "#8B2332" : "rgba(27,61,47,0.1)", color: canProceed ? "#F5F0E8" : "rgba(27,61,47,0.3)",
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, cursor: canProceed ? "pointer" : "default",
              boxShadow: canProceed ? "0 4px 16px rgba(139,35,50,0.25)" : "none",
            }}>{step === totalSteps - 1 ? (isRefineMode ? "Update My Wine DNA" : "See My Wine DNA") : "Continue"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
