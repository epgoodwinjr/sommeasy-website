"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { parseWineList, matchWinesAgainstDNA, filterResults, getMatchTier } from "@/lib/matchEngine";

// ─── Price range options ───
const PRICE_RANGES = [
  { id: "any", label: "Any price", min: null, max: null },
  { id: "under30", label: "Under $30", min: null, max: 30 },
  { id: "30to60", label: "$30 – $60", min: 30, max: 60 },
  { id: "60to100", label: "$60 – $100", min: 60, max: 100 },
  { id: "over100", label: "$100+", min: 100, max: null },
];

const COLOR_OPTIONS = [
  { id: "all", label: "All wines", emoji: "🍷" },
  { id: "red", label: "Red", emoji: "🔴" },
  { id: "white", label: "White", emoji: "⚪" },
];

// ─── No Profile State ───
function NoProfileCard() {
  return (
    <div style={{ textAlign: "center", padding: "60px 24px" }}>
      <div style={{ fontSize: "48px", marginBottom: 16 }}>🍷</div>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", color: "#1B3D2F", margin: "0 0 12px 0" }}>
        Build your Wine DNA first
      </h2>
      <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.6, lineHeight: 1.6, maxWidth: 360, margin: "0 auto 24px" }}>
        Take the quick quiz to tell us what wines you love, then come back here to get personalized picks from any restaurant wine list.
      </p>
      <a href="/" style={{
        display: "inline-block", padding: "14px 36px", borderRadius: "100px",
        background: "#8B2332", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif",
        fontSize: "15px", fontWeight: 600, textDecoration: "none",
        boxShadow: "0 4px 16px rgba(139,35,50,0.25)",
      }}>Take the Quiz</a>
    </div>
  );
}

// ─── Input Step ───
function InputStep({ onSubmit }) {
  const [wineListText, setWineListText] = useState("");
  const [priceRange, setPriceRange] = useState("any");
  const [colorPref, setColorPref] = useState("all");
  const textareaRef = useRef(null);

  const handleSubmit = () => {
    if (!wineListText.trim()) return;
    const range = PRICE_RANGES.find(p => p.id === priceRange);
    onSubmit({
      text: wineListText,
      colorPreference: colorPref,
      minPrice: range?.min,
      maxPrice: range?.max,
    });
  };

  const handlePasteExample = () => {
    const example = `Wines by the Bottle

WHITE
Cloudy Bay Sauvignon Blanc, Marlborough 2023    $52
Domaine Leflaive Puligny-Montrachet 2021    $185
Trimbach Riesling, Alsace 2022    $38
Gavi di Gavi, La Scolca 2022    $44
Cakebread Chardonnay, Napa Valley 2022    $72
Dog Point Sauvignon Blanc, Marlborough 2023    $48
Domaine Weinbach Riesling Grand Cru Schlossberg 2020    $120

RED
Kanonkop Paul Sauer, Stellenbosch 2019    $88
Caymus Cabernet Sauvignon, Napa Valley 2021    $95
Château Lynch-Bages, Pauillac 2018    $210
Muga Reserva, Rioja 2019    $42
Roagna Barolo Pira 2017    $175
Catena Zapata Malbec, Mendoza 2021    $55
Mullineux Syrah, Swartland 2020    $68
E. Guigal Côte-Rôtie Brune et Blonde 2019    $125
Fontodi Chianti Classico 2020    $56
Ridge Monte Bello 2019    $250
Felton Road Block 5 Pinot Noir, Central Otago 2022    $95
Cristom Pinot Noir, Eola-Amity Hills 2021    $72`;

    setWineListText(example);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: "36px", marginBottom: 8 }}>📋</div>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", color: "#1B3D2F", margin: "0 0 8px 0" }}>
          What's on the wine list?
        </h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.6, lineHeight: 1.5, maxWidth: 400, margin: "0 auto" }}>
          Paste the wine list from the restaurant's website, or type in what you see on the menu. We'll find your best matches.
        </p>
      </div>

      {/* Wine list text area */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.5, fontWeight: 600 }}>
            Wine List
          </label>
          <button onClick={handlePasteExample} style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#8B2332",
            background: "none", border: "none", cursor: "pointer", fontWeight: 600, opacity: 0.7,
          }}>Try an example</button>
        </div>
        <textarea
          ref={textareaRef}
          value={wineListText}
          onChange={e => setWineListText(e.target.value)}
          placeholder={"Paste wine list here...\n\nExample:\nCloudy Bay Sauvignon Blanc, Marlborough  $52\nKanonkop Paul Sauer, Stellenbosch  $88\nCaymus Cabernet Sauvignon, Napa Valley  $95"}
          style={{
            width: "100%", minHeight: 180, padding: "16px", borderRadius: "14px",
            border: "2px solid rgba(27,61,47,0.15)", background: "rgba(255,255,255,0.7)",
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F",
            lineHeight: 1.6, resize: "vertical", outline: "none", transition: "border-color 0.2s ease",
          }}
          onFocus={e => e.target.style.borderColor = "#8B2332"}
          onBlur={e => e.target.style.borderColor = "rgba(27,61,47,0.15)"}
        />
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: "12px", marginBottom: 24 }}>
        {/* Color preference */}
        <div style={{ flex: 1 }}>
          <label style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.5, fontWeight: 600, display: "block", marginBottom: 8 }}>
            I'm in the mood for
          </label>
          <div style={{ display: "flex", gap: "6px" }}>
            {COLOR_OPTIONS.map(opt => (
              <button key={opt.id} onClick={() => setColorPref(opt.id)} style={{
                flex: 1, padding: "10px 8px", borderRadius: "10px",
                border: colorPref === opt.id ? "2px solid #8B2332" : "2px solid rgba(27,61,47,0.12)",
                background: colorPref === opt.id ? "rgba(139,35,50,0.06)" : "rgba(255,255,255,0.5)",
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", fontWeight: colorPref === opt.id ? 600 : 400,
                color: colorPref === opt.id ? "#8B2332" : "#1B3D2F", cursor: "pointer", transition: "all 0.2s ease",
              }}>
                {opt.emoji} {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Price range */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#1B3D2F", opacity: 0.5, fontWeight: 600, display: "block", marginBottom: 8 }}>
          Price range
        </label>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {PRICE_RANGES.map(range => (
            <button key={range.id} onClick={() => setPriceRange(range.id)} style={{
              padding: "8px 16px", borderRadius: "100px",
              border: priceRange === range.id ? "2px solid #8B2332" : "2px solid rgba(27,61,47,0.12)",
              background: priceRange === range.id ? "rgba(139,35,50,0.06)" : "rgba(255,255,255,0.5)",
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", fontWeight: priceRange === range.id ? 600 : 400,
              color: priceRange === range.id ? "#8B2332" : "#1B3D2F", cursor: "pointer", transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}>{range.label}</button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={!wineListText.trim()} style={{
        width: "100%", padding: "16px", borderRadius: "14px", border: "none",
        background: wineListText.trim() ? "#8B2332" : "rgba(27,61,47,0.1)",
        color: wineListText.trim() ? "#F5F0E8" : "rgba(27,61,47,0.3)",
        fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", fontWeight: 600,
        cursor: wineListText.trim() ? "pointer" : "default", transition: "all 0.2s ease",
        boxShadow: wineListText.trim() ? "0 4px 16px rgba(139,35,50,0.25)" : "none",
      }}>Find My Wines</button>
    </div>
  );
}

// ─── Results Step ───
function ResultsStep({ results, totalParsed, onBack }) {
  const matched = results.filter(r => r.score > 0);
  const unmatched = results.filter(r => r.score === 0);

  return (
    <div>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: "36px", marginBottom: 8 }}>✨</div>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", color: "#1B3D2F", margin: "0 0 8px 0" }}>
          {matched.length > 0 ? `${matched.length} ${matched.length === 1 ? "match" : "matches"} found` : "No matches found"}
        </h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.6 }}>
          {matched.length > 0
            ? `We found ${matched.length} wine${matched.length === 1 ? "" : "s"} that match your DNA out of ${totalParsed} on the list.`
            : `We parsed ${totalParsed} wines but couldn't match any to your DNA. Try adding more preferences to your profile.`
          }
        </p>
      </div>

      {/* Matched wines */}
      {matched.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: 24 }}>
          {matched.map((wine, i) => {
            const tier = getMatchTier(wine.score);
            return (
              <div key={i} style={{
                background: "rgba(255,255,255,0.6)", borderRadius: "16px",
                padding: "18px 20px", border: "1px solid rgba(27,61,47,0.08)",
                borderLeft: `4px solid ${tier.color}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px", color: "#1B3D2F", lineHeight: 1.3 }}>
                      {wine.name}
                    </div>
                  </div>
                  {wine.price && (
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 700, color: "#1B3D2F", marginLeft: 12, whiteSpace: "nowrap" }}>
                      ${wine.price}
                    </div>
                  )}
                </div>

                {/* Match tier badge */}
                <span style={{
                  display: "inline-block", padding: "3px 10px", borderRadius: "100px",
                  background: tier.bg, color: tier.color,
                  fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
                }}>{tier.label}</span>

                {/* Match reasons */}
                {wine.matchReasons.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {wine.matchReasons.map((reason, j) => (
                      <span key={j} style={{
                        fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F",
                        opacity: 0.6, lineHeight: 1.3,
                      }}>
                        {reason.type === "estate" && "🏛️"}
                        {reason.type === "region" && "📍"}
                        {reason.type === "varietal" && "🍇"}
                        {reason.type === "country" && "🌍"}
                        {reason.type === "country_region" && "🌍"}
                        {reason.type === "favorite" && "❤️"}
                        {" "}{reason.label}
                        {j < wine.matchReasons.length - 1 && " · "}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unmatched wines (collapsed) */}
      {unmatched.length > 0 && (
        <UnmatchedSection wines={unmatched} />
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px", marginTop: 20, paddingBottom: 24 }}>
        <button onClick={onBack} style={{
          flex: 1, padding: "14px", borderRadius: "14px",
          border: "2px solid rgba(27,61,47,0.15)", background: "rgba(255,255,255,0.7)",
          color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, cursor: "pointer",
        }}>Try Another List</button>
        <a href="/" style={{
          flex: 1, padding: "14px", borderRadius: "14px",
          border: "2px solid rgba(139,35,50,0.2)", background: "rgba(255,255,255,0.7)",
          color: "#8B2332", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600,
          textDecoration: "none", textAlign: "center",
        }}>Update My DNA</a>
      </div>
    </div>
  );
}

function UnmatchedSection({ wines }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: "rgba(255,255,255,0.3)", borderRadius: "14px",
      border: "1px solid rgba(27,61,47,0.06)", overflow: "hidden",
    }}>
      <button onClick={() => setExpanded(!expanded)} style={{
        width: "100%", padding: "14px 18px", background: "none", border: "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        cursor: "pointer", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.5,
      }}>
        <span>{wines.length} other wine{wines.length === 1 ? "" : "s"} on the list</span>
        <span style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.3s ease", fontSize: "12px" }}>▼</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 18px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {wines.map((wine, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5 }}>{wine.name}</span>
              {wine.price && <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.4 }}>${wine.price}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───
export default function RecommendPage() {
  const [user, setUser] = useState(null);
  const [dnaProfile, setDnaProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("input"); // input | results
  const [results, setResults] = useState([]);
  const [totalParsed, setTotalParsed] = useState(0);

  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        // Fetch DNA profile
        const { data } = await supabase
          .from("wine_profiles")
          .select("*")
          .eq("user_id", session.user.id)
          .single();
        if (data) setDnaProfile(data);
      }
      setLoading(false);
    }
    init();
  }, []);

  const handleSubmit = ({ text, colorPreference, minPrice, maxPrice }) => {
    const entries = parseWineList(text);
    setTotalParsed(entries.length);

    if (!dnaProfile) return;

    // Use stored raw data for matching
    const profileForMatching = {
      countries: dnaProfile.countries || [],
      regions: dnaProfile.regions || {},
      estates: dnaProfile.estates || {},
      varietals: dnaProfile.varietals || [],
      specificWines: dnaProfile.specific_wines || [],
    };

    const matched = matchWinesAgainstDNA(entries, profileForMatching);
    const filtered = filterResults(matched, { colorPreference, minPrice, maxPrice });

    setResults(filtered);
    setView("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", color: "#8B2332", opacity: 0.5 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px", position: "sticky", top: 0,
        background: "rgba(245,240,232,0.9)", backdropFilter: "blur(12px)", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <a href="/" style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px",
          color: "#8B2332", fontWeight: 600, textDecoration: "none",
        }}>Sommeasy</a>
        {user ? (
          <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5 }}>
            {user.email?.split("@")[0]}
          </span>
        ) : (
          <a href="/login" style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332", fontWeight: 600, textDecoration: "none" }}>Sign In</a>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "20px 20px 40px" }}>
        {!user && (
          <div style={{ textAlign: "center", padding: "60px 24px" }}>
            <div style={{ fontSize: "48px", marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "24px", color: "#1B3D2F", margin: "0 0 12px 0" }}>Sign in to get recommendations</h2>
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.6, marginBottom: 24 }}>We need your Wine DNA profile to match against the wine list.</p>
            <a href="/login" style={{ display: "inline-block", padding: "14px 36px", borderRadius: "100px", background: "#8B2332", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, textDecoration: "none" }}>Sign In</a>
          </div>
        )}

        {user && !dnaProfile && <NoProfileCard />}

        {user && dnaProfile && view === "input" && (
          <InputStep onSubmit={handleSubmit} />
        )}

        {user && dnaProfile && view === "results" && (
          <ResultsStep
            results={results}
            totalParsed={totalParsed}
            onBack={() => { setView("input"); setResults([]); }}
          />
        )}
      </div>
    </div>
  );
}
