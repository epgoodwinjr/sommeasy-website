"use client";

import { useState, useRef, useEffect } from "react";
import wineUnified from "@/lib/wineUnified.json";
import { generateDNAProfile } from "@/lib/profileEngine";

const { countries: COUNTRIES_RAW, regions: REGIONS_DATA, producers: PRODUCERS_DATA, varietals: VARIETALS_RAW } = wineUnified;

// ─── Small UI components ───

function Chip({ label, selected, onClick, emoji, color, small }) {
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

function ProfileSection({ label, items }) {
  return (
    <div style={{ marginBottom: 12, background: "rgba(255,255,255,0.5)", borderRadius: "14px", padding: "14px 18px", border: "1px solid rgba(27,61,47,0.08)" }}>
      <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.5, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {items.map((item, i) => <span key={i} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "rgba(27,61,47,0.06)", padding: "4px 12px", borderRadius: "100px" }}>{item}</span>)}
      </div>
    </div>
  );
}

// ─── Quiz Steps ───

function CountryStep({ selected, onToggle }) {
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

function RegionStep({ selectedCountries, regions, onToggle }) {
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

function EstateStep({ regions, estates, onToggle }) {
  const items = Object.entries(regions).flatMap(([countryId, regionIds]) =>
    regionIds.filter(rId => ESTATES[rId]).map(rId => ({
      id: rId,
      region: Object.values(REGIONS).flat().find(r => r.id === rId),
      country: COUNTRIES.find(c => c.id === countryId),
      estateList: ESTATES[rId] || [],
    }))
  );
  if (items.length === 0) return <div><StepHeader number="03" title="Favorite producers?" subtitle="We don't have estates listed for your selected regions yet — no worries! You can add specific wines in the next step." /></div>;
  return (
    <div>
      <StepHeader number="03" title="Any favorite producers?" subtitle="Know specific estates or wineries you love? Select them — totally fine to skip." />
      <Accordion items={items} defaultOpen={items[0]?.id}
        getLabel={i => `${i.country.emoji} ${i.region.name}`}
        getCount={i => (estates[i.id] || []).length}
        renderContent={i => i.estateList.map(e => <Chip key={e.id} label={e.name} selected={(estates[i.id] || []).includes(e.id)} onClick={() => onToggle(i.id, e.id)} small />)} />
    </div>
  );
}

function VarietalStep({ selected, onToggle }) {
  const reds = VARIETALS.filter(v => v.color === "red");
  const whites = VARIETALS.filter(v => v.color === "white");
  return (
    <div>
      <StepHeader number="04" title="Which grapes do you love?" subtitle="These are your preferences regardless of origin. A Pinot Noir lover is a Pinot Noir lover, whether Burgundy or Oregon." />
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#8B2332", margin: "0 0 10px 4px", fontWeight: 600 }}>Red Varietals</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{reds.map(v => <Chip key={v.id} label={v.name} color="#8B2332" selected={selected.includes(v.id)} onClick={() => onToggle(v.id)} small />)}</div>
      </div>
      <div>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B8F5E", margin: "0 0 10px 4px", fontWeight: 600 }}>White Varietals</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{whites.map(v => <Chip key={v.id} label={v.name} color="#6B8F5E" selected={selected.includes(v.id)} onClick={() => onToggle(v.id)} small />)}</div>
      </div>
    </div>
  );
}

function SpecificWineStep({ wines, onAdd, onRemove, selectedEstates }) {
  // Derive tappable suggestions from Step 4 estate selections
  const estateSuggestions = Object.entries(selectedEstates || {})
    .flatMap(([rId, eIds]) =>
      (ESTATES[rId] || []).filter(e => eIds.includes(e.id)).map(e => e.name)
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
    const label = item.w + (item.r ? ", " + item.r : "");
    if (!wines.includes(label)) {
      onAdd(label);
    }
    setVal("");
    setSuggestions([]);
    setShowSuggestions(false);
    ref.current?.focus();
  };

  const add = () => { const t = val.trim(); if (t && !wines.includes(t)) { onAdd(t); setVal(""); setSuggestions([]); setShowSuggestions(false); ref.current?.focus(); } };

  return (
    <div>
      <StepHeader number="05" title="Any specific favorites?" subtitle="Got a wine you would order again in a heartbeat? Type it here — name, vintage, whatever you remember. Totally optional." />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: showSuggestions ? 0 : 16 }}>
          <input ref={ref} type="text" value={val} onChange={e => handleChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") { setSuggestions([]); setShowSuggestions(false); } }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder='e.g. "Kanonkop" or "Chablis"'
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
              <button key={name} onClick={() => onAdd(name)} style={{
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

// ─── DNA Profile Card ───
function DNAProfileCard({ profile, onStartOver, onSave, saving, user }) {
  const [tab, setTab] = useState("recs");
  return (
    <div>
      {/* Hero */}
      <div style={{ background: "linear-gradient(145deg, #1B3D2F 0%, #2A5540 50%, #1B3D2F 100%)", borderRadius: "24px", padding: "32px 24px 28px", color: "#F5F0E8", marginBottom: 20, boxShadow: "0 16px 48px rgba(27,61,47,0.4)", position: "relative", overflow: "hidden", textAlign: "center" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "rgba(139,35,50,0.1)" }} />
        <div style={{ position: "absolute", bottom: -30, left: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(107,143,94,0.08)" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: "48px", marginBottom: 12 }}>{profile.archetypeEmoji}</div>
          <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.5, marginBottom: 8 }}>Your Wine DNA</div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "32px", margin: "0 0 16px 0", fontWeight: 700, lineHeight: 1.1 }}>{profile.archetype}</h2>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", lineHeight: 1.65, opacity: 0.8, maxWidth: 360, margin: "0 auto" }}>{profile.narrative}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {[{ n: profile.countries.length, l: "Countries" }, { n: profile.regions.length, l: "Regions" }, { n: profile.varietals.length, l: "Grapes" }, { n: profile.estates.length + profile.specificWines.length, l: "Favorites" }].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "22px", fontWeight: 700 }}>{s.n}</div>
                <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.5, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Save prompt */}
      {!user && (
        <div style={{ background: "rgba(139,35,50,0.06)", borderRadius: "14px", padding: "20px 20px", border: "1px solid rgba(139,35,50,0.15)", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", color: "#1B3D2F", marginBottom: 8, lineHeight: 1.3 }}>
            {profile.archetypeEmoji} You&apos;re <em>{profile.archetype}</em>.
          </div>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", margin: "0 0 16px 0", lineHeight: 1.55, opacity: 0.7 }}>
            Save your profile free — then paste any restaurant wine list and get your picks matched to your taste in seconds.
          </p>
          <a href="/signup" style={{ display: "inline-block", padding: "12px 32px", borderRadius: "100px", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, textDecoration: "none", boxShadow: "0 4px 16px rgba(139,35,50,0.25)" }}>Save My Profile →</a>
        </div>
      )}
      {user && onSave && (
        <button onClick={onSave} disabled={saving} style={{ width: "100%", padding: "14px", borderRadius: "14px", border: "none", background: saving ? "rgba(27,61,47,0.3)" : "#1B3D2F", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", marginBottom: 16, transition: "all 0.2s ease" }}>
          {saving ? "Saving..." : "💾 Save My Wine DNA"}
        </button>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: 16, background: "rgba(27,61,47,0.06)", borderRadius: "12px", padding: "4px" }}>
        {[{ id: "recs", label: `Wines to Try (${profile.recommendations.length})` }, { id: "profile", label: "Full Profile" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "10px 12px", borderRadius: "10px", border: "none", background: tab === t.id ? "#fff" : "transparent", color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", fontWeight: tab === t.id ? 600 : 400, cursor: "pointer", transition: "all 0.2s ease", boxShadow: tab === t.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none" }}>{t.label}</button>
        ))}
      </div>

      {/* Recs */}
      {tab === "recs" && (
        <div>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.6, textAlign: "center", margin: "0 0 16px 0", lineHeight: 1.5 }}>Based on your DNA, here are wines we think you would love.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {profile.recommendations.map((rec, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.6)", borderRadius: "16px", padding: "18px 20px", border: "1px solid rgba(27,61,47,0.08)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #8B2332, #6B1D2A)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F5F0E8", fontFamily: "'Playfair Display', serif", fontSize: "14px", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "15px", color: "#1B3D2F", lineHeight: 1.3, marginBottom: 4 }}>{rec.wine}</div>
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.55, lineHeight: 1.4 }}>{rec.why}</div>
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", color: "#8B2332", opacity: 0.7, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {rec.matchType === "region + grape" ? "📍 Region + grape match" : rec.matchType === "grape" ? "🍇 Grape match" : "🧭 Discovery pick"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile */}
      {tab === "profile" && (
        <div>
          {(profile.redCount > 0 || profile.whiteCount > 0) && (
            <div style={{ marginBottom: 12, background: "rgba(255,255,255,0.5)", borderRadius: "14px", padding: "16px 18px", border: "1px solid rgba(27,61,47,0.08)" }}>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.5, marginBottom: 10, fontWeight: 600 }}>Red vs White</div>
              <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
                <div style={{ flex: profile.redCount || 0.01, background: "#8B2332", borderRadius: "4px 0 0 4px" }} />
                <div style={{ flex: profile.whiteCount || 0.01, background: "#6B8F5E", borderRadius: "0 4px 4px 0" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#8B2332", fontWeight: 600 }}>{profile.redCount} red</span>
                <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#6B8F5E", fontWeight: 600 }}>{profile.whiteCount} white</span>
              </div>
            </div>
          )}
          {profile.countries.length > 0 && <ProfileSection label="Countries" items={profile.countries} />}
          {profile.regions.length > 0 && <ProfileSection label="Regions" items={profile.regions} />}
          {profile.estates.length > 0 && <ProfileSection label="Estates" items={profile.estates} />}
          {profile.varietals.length > 0 && <ProfileSection label="Varietals" items={profile.varietals} />}
          {profile.specificWines.length > 0 && <ProfileSection label="Specific Wines" items={profile.specificWines} />}
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 28, paddingBottom: 20 }}>
        {user && (
          <a href="/recommend" style={{
            display: "inline-block", padding: "14px 32px", borderRadius: "100px",
            background: "#1B3D2F", color: "#F5F0E8",
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600,
            textDecoration: "none", boxShadow: "0 4px 16px rgba(27,61,47,0.25)",
            marginBottom: 12,
          }}>📋 I'm at a Restaurant</a>
        )}
        <br />
        <button onClick={onStartOver} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#8B2332", background: "none", border: "1px solid rgba(139,35,50,0.3)", borderRadius: "100px", padding: "10px 28px", cursor: "pointer", marginTop: 8 }}>Retake Quiz</button>
      </div>
    </div>
  );
}

// ─── Main Quiz Component ───
export default function Quiz({ user, onProfileGenerated, initialAnswers, onCancel }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(initialAnswers || { countries: [], regions: {}, estates: {}, varietals: [], specificWines: [] });
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [anim, setAnim] = useState(false);
  const scrollRef = useRef(null);
  const totalSteps = 5;
  const isRefineMode = !!initialAnswers;

  const go = (n) => { setAnim(true); setTimeout(() => { setStep(n); setAnim(false); window.scrollTo({ top: 0, behavior: "smooth" }); }, 200); };
  const toggle = (arr, item) => arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  const finish = () => {
    const dna = generateDNAProfile(answers);
    setProfile(dna);
    go(99);
  };

  const restart = () => {
    setAnswers({ countries: [], regions: {}, estates: {}, varietals: [], specificWines: [] });
    setProfile(null);
    setStep(0);
  };

  const handleSave = async () => {
    if (!user || !profile || !onProfileGenerated) return;
    setSaving(true);
    await onProfileGenerated(profile);
    setSaving(false);
  };

  const canProceed = step === 0 ? answers.countries.length > 0 : true;

  return (
    <div ref={scrollRef} style={{ maxWidth: 520, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      {step >= 0 && step < 99 && (
        <div style={{ padding: "16px 20px 12px", position: "sticky", top: 0, background: "rgba(245,240,232,0.9)", backdropFilter: "blur(12px)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {onCancel && (
                <button onClick={onCancel} style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: "4px 0" }}>← Back</button>
              )}
              <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.01em" }}>
                {!isRefineMode && <img src="/protea-icon.png" alt="" style={{ height: 34, width: "auto" }} />}
                {isRefineMode ? "Refine Profile" : "Sommeasy"}
              </span>
            </div>
            <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.5 }}>Step {step + 1} of {totalSteps}</span>
          </div>
          <ProgressBar current={step} total={totalSteps} />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, padding: "20px 20px 120px", opacity: anim ? 0 : 1, transform: anim ? "translateX(20px)" : "translateX(0)", transition: "all 0.2s ease" }}>
        {step === 0 && <CountryStep selected={answers.countries} onToggle={id => setAnswers(p => ({ ...p, countries: toggle(p.countries, id) }))} />}
        {step === 1 && <RegionStep selectedCountries={answers.countries} regions={answers.regions} onToggle={(cId, rId) => setAnswers(p => ({ ...p, regions: { ...p.regions, [cId]: toggle(p.regions[cId] || [], rId) } }))} />}
        {step === 2 && <EstateStep regions={answers.regions} estates={answers.estates} onToggle={(rId, eId) => setAnswers(p => ({ ...p, estates: { ...p.estates, [rId]: toggle(p.estates[rId] || [], eId) } }))} />}
        {step === 3 && <VarietalStep selected={answers.varietals} onToggle={id => setAnswers(p => ({ ...p, varietals: toggle(p.varietals, id) }))} />}
        {step === 4 && <SpecificWineStep wines={answers.specificWines} onAdd={w => setAnswers(p => ({ ...p, specificWines: [...p.specificWines, w] }))} onRemove={i => setAnswers(p => ({ ...p, specificWines: p.specificWines.filter((_, j) => j !== i) }))} selectedEstates={answers.estates} />}
        {step === 99 && profile && <DNAProfileCard profile={profile} onStartOver={restart} onSave={handleSave} saving={saving} user={user} />}
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
