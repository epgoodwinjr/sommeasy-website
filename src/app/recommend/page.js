"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { parseWineList, matchWinesAgainstDNA, curatePicks, getPickTypeInfo, getCountryFlag, getCountryName } from "@/lib/matchEngine";

// ─── Input mode constants ───
const MODES = [
  { id: "paste", label: "Paste Text", icon: "📋" },
  { id: "photo", label: "Snap Photo", icon: "📷" },
  { id: "url", label: "Paste URL", icon: "🔗" },
];

export default function RecommendPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wineListText, setWineListText] = useState("");
  const [colorPref, setColorPref] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [picks, setPicks] = useState(null);
  const [totalParsed, setTotalParsed] = useState(0);
  const [totalMatched, setTotalMatched] = useState(0);
  const [inputMode, setInputMode] = useState("paste");
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [menuUrl, setMenuUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState(null);
  const [extractedFrom, setExtractedFrom] = useState(null);
  const [pickRatings, setPickRatings] = useState({});
  const [ratingPick, setRatingPick] = useState(null);
  const [ratingToast, setRatingToast] = useState(null);
  const fileInputRef = useRef(null);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      if (u) {
        const { data } = await supabase.from("wine_profiles").select("*").eq("user_id", u.id).single();
        if (data) setProfile(data);
      }
      setLoading(false);
    }
    init();
  }, []);

  // ─── Photo handling ───
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");

    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
      const mediaType = file.type || "image/jpeg";

      setProcessing(true);
      setProcessingMsg("Reading your wine list...");

      try {
        const res = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mediaType }),
        });
        const data = await res.json();

        if (data.error && !data.text) {
          setErrorMsg(data.error);
          setProcessing(false);
          setProcessingMsg("");
          return;
        }

        setWineListText(data.text || "");
        setExtractedFrom("photo");
        setProcessingMsg("");
        setProcessing(false);
        setInputMode("paste");
      } catch (err) {
        setErrorMsg("Failed to process photo. Please try again.");
        setProcessing(false);
        setProcessingMsg("");
      }
    };
    reader.readAsDataURL(file);
  };

  // ─── URL handling ───
  const handleUrlFetch = async () => {
    if (!menuUrl.trim()) return;
    setErrorMsg("");
    setProcessing(true);
    setProcessingMsg("Fetching wine list from website...");

    try {
      const res = await fetch("/api/fetch-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: menuUrl.trim() }),
      });
      const data = await res.json();

      if (data.error && !data.text) {
        setErrorMsg(data.error);
        setProcessing(false);
        setProcessingMsg("");
        return;
      }

      setWineListText(data.text || "");
      setExtractedFrom("url");
      setProcessingMsg("");
      setProcessing(false);
      setInputMode("paste");
    } catch (err) {
      setErrorMsg("Failed to fetch that URL. Please try again.");
      setProcessing(false);
      setProcessingMsg("");
    }
  };

  // ─── Analysis ───
  const handleAnalyze = () => {
    if (!wineListText.trim() || !profile) return;
    setErrorMsg("");

    const entries = parseWineList(wineListText);
    setTotalParsed(entries.length);

    const dna = {
      countries: profile.countries || [],
      regions: profile.regions || {},
      estates: profile.estates || {},
      varietals: profile.varietals || [],
      specificWines: profile.specific_wines || [],
    };

    const scored = matchWinesAgainstDNA(entries, dna);
    const matched = scored.filter(e => e.score > 0);
    setTotalMatched(matched.length);

    const min = minPrice ? parseFloat(minPrice) : null;
    const max = maxPrice ? parseFloat(maxPrice) : null;

    const curated = curatePicks(scored, {
      minPrice: min,
      maxPrice: max,
      colorPreference: colorPref,
    });

    setPicks(curated);
  };

  // ─── Pick rating ───
  const handleRatePick = async (wineName, rating) => {
    setPickRatings((prev) => ({ ...prev, [wineName]: rating }));
    setRatingPick(null);
    setRatingToast("Rating saved!");
    setTimeout(() => setRatingToast(null), 2500);

    try {
      await fetch("/api/auth/callback", { method: "GET" }); // ensure session
      const supabase = createClient();
      await supabase.from("wine_interactions").upsert({
        user_id: user.id,
        wine_name: wineName,
        interaction_type: "had",
        rating: rating,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id, wine_name" });
    } catch (err) {
      console.error("Rating save error:", err);
    }
  };

  const handleReset = () => {
    setPicks(null);
    setWineListText("");
    setTotalParsed(0);
    setTotalMatched(0);
    setErrorMsg("");
    setPhotoPreview(null);
    setMenuUrl("");
    setExtractedFrom(null);
  };

  const loadExample = () => {
    setExtractedFrom(null);
    setWineListText(`WHITES
Cloudy Bay Sauvignon Blanc, Marlborough 2022............$52
Domaine William Fèvre Chablis Premier Cru 2021.........$78
Trimbach Riesling, Alsace 2021..........................$44
Cakebread Chardonnay, Napa Valley 2021.................$72
Jordan Chardonnay, Russian River Valley 2021...........$64
Ken Forrester Old Vine Chenin Blanc, Stellenbosch......$38
Sancerre, Domaine Vacheron 2022........................$62

REDS
Hamilton Russell Pinot Noir, Walker Bay 2020...........$85
Kanonkop Pinotage, Stellenbosch 2019...................$68
Meerlust Rubicon, Stellenbosch 2018....................$92
Catena Zapata Malbec, Mendoza 2020.....................$58
Penfolds Bin 389 Cabernet Shiraz, South Australia......$74
Ridge Monte Bello, Santa Cruz Mountains 2019..........$250
Domaine de la Côte-Rôtie, E. Guigal 2019.............$115
Boekenhoutskloof Syrah, Swartland 2020.................$72
Château Lynch-Bages, Pauillac 2018....................$185
Viña Almaviva, Puente Alto 2019.......................$165
Marchesi Antinori Tignanello 2019.....................$145
Vega Sicilia Unico, Ribera del Duero 2012.............$350
Pommard Premier Cru, Domaine de Courcel 2019..........$132
Central Otago Pinot Noir, Felton Road 2021.............$95
Barolo, Giacomo Conterno 2018.........................$210`);
  };

  // ─── Loading state ───
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 56, width: "auto", opacity: 0.5 }} />
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", opacity: 0.4 }}>Loading...</div>
      </div>
    );
  }

  // ─── Auth gate ───
  if (!user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 64, width: "auto", marginBottom: 20, opacity: 0.7 }} />
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", color: "#1B3D2F", margin: "0 0 12px" }}>Sign in to continue</h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.55, marginBottom: 28, maxWidth: 320, lineHeight: 1.55 }}>You need an account and a Wine DNA profile to get restaurant recommendations.</p>
        <a href="/login" style={{ padding: "15px 44px", borderRadius: "100px", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, textDecoration: "none", boxShadow: "0 6px 20px rgba(139,35,50,0.25)" }}>Sign In</a>
      </div>
    );
  }

  // ─── Profile gate ───
  if (!profile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
        <img src="/protea-icon.png" alt="" style={{ height: 64, width: "auto", marginBottom: 20, opacity: 0.7 }} />
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", color: "#1B3D2F", margin: "0 0 12px" }}>Build your Wine DNA first</h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.55, marginBottom: 28, maxWidth: 340, lineHeight: 1.55 }}>Take the quick quiz to tell us what wines you love, then come back here to get personalized picks from any restaurant wine list.</p>
        <a href="/" style={{ padding: "15px 44px", borderRadius: "100px", background: "linear-gradient(135deg, #8B2332, #7A1E2C)", color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", fontWeight: 600, textDecoration: "none", boxShadow: "0 6px 20px rgba(139,35,50,0.25)" }}>Take the Quiz</a>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // RESULTS VIEW
  // ═══════════════════════════════════════════════════
  if (picks) {
    const RATING_OPTIONS = [
      { id: "loved", emoji: "❤️", label: "Loved it" },
      { id: "liked", emoji: "👍", label: "Liked it" },
      { id: "fine", emoji: "😐", label: "It was fine" },
      { id: "not_for_me", emoji: "👎", label: "Not for me" },
    ];

    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px", minHeight: "100vh" }}>
        {/* Rating modal */}
        {ratingPick && (
          <div style={{
            position: "fixed", inset: 0, zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(27,61,47,0.4)", backdropFilter: "blur(8px)", padding: 24,
          }} onClick={() => setRatingPick(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{
              background: "#F5F0E8", borderRadius: "24px", padding: "28px 24px",
              maxWidth: 360, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
            }}>
              <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.15em", color: "#1B3D2F", opacity: 0.4, marginBottom: 8, fontWeight: 600 }}>How was it?</div>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", color: "#1B3D2F", lineHeight: 1.3, marginBottom: 24 }}>{ratingPick}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {RATING_OPTIONS.map((r) => (
                  <button key={r.id} onClick={() => handleRatePick(ratingPick, r.id)} style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "14px 18px", borderRadius: "14px",
                    border: pickRatings[ratingPick] === r.id ? "2px solid #8B2332" : "1px solid rgba(27,61,47,0.08)",
                    background: pickRatings[ratingPick] === r.id ? "rgba(139,35,50,0.06)" : "rgba(255,255,255,0.5)",
                    cursor: "pointer", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px",
                    color: "#1B3D2F", fontWeight: pickRatings[ratingPick] === r.id ? 600 : 500,
                    width: "100%", textAlign: "left",
                  }}><span style={{ fontSize: "20px" }}>{r.emoji}</span> {r.label}</button>
                ))}
              </div>
              <button onClick={() => setRatingPick(null)} style={{
                marginTop: 16, width: "100%", padding: "10px",
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                color: "#1B3D2F", opacity: 0.4, background: "none", border: "none", cursor: "pointer",
              }}>Cancel</button>
            </div>
          </div>
        )}
        {ratingToast && (
          <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px", borderRadius: "100px", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, zIndex: 90, boxShadow: "0 4px 20px rgba(27,61,47,0.3)" }}>✓ {ratingToast}</div>
        )}
        <div style={{ padding: "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(245,240,232,0.9)", backdropFilter: "blur(12px)", zIndex: 10 }}>
          <a href="/" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.01em" }}><img src="/protea-icon.png" alt="" style={{ height: 36, width: "auto" }} />Sommeasy</a>
          <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5 }}>{user.email?.split("@")[0]}</span>
        </div>

        <div style={{ textAlign: "center", padding: "28px 0 24px" }}>
          <div style={{ fontSize: "32px", marginBottom: 10 }}>✨</div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px", color: "#1B3D2F", margin: "0 0 10px", fontWeight: 700, letterSpacing: "-0.01em" }}>
            {picks.length === 0 ? "No matches found" : `Your ${picks.length} picks`}
          </h2>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.45, margin: 0, lineHeight: 1.5 }}>
            {picks.length > 0
              ? `Curated from ${totalMatched} matches across ${totalParsed} wines on the list`
              : `We parsed ${totalParsed} wines but couldn't find matches for your DNA. Try refining your profile.`}
          </p>
        </div>

        {picks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: 32 }}>
            {picks.map((pick, i) => {
              const typeInfo = getPickTypeInfo(pick.pickType);
              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.7)", borderRadius: "18px", padding: "20px",
                  border: "1px solid rgba(27,61,47,0.08)", position: "relative", overflow: "hidden",
                  boxShadow: i === 0 ? "0 4px 20px rgba(139,35,50,0.12)" : "0 2px 8px rgba(0,0,0,0.04)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "4px 12px", borderRadius: "100px",
                      background: typeInfo.bg, color: typeInfo.color,
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                    }}>
                      <span>{typeInfo.emoji}</span>
                      <span>{typeInfo.label}</span>
                    </div>
                    {pick.price && (
                      <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "18px", fontWeight: 700, color: "#1B3D2F" }}>${pick.price}</span>
                    )}
                  </div>

                  <h3 style={{
                    fontFamily: "'Playfair Display', Georgia, serif", fontSize: i === 0 ? "20px" : "17px",
                    color: "#1B3D2F", margin: "0 0 10px", lineHeight: 1.3, fontWeight: 600,
                  }}>{pick.name}</h3>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                    {pick.detectedCountry && (
                      <span style={{
                        fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                        color: "#1B3D2F", opacity: 0.6, background: "rgba(27,61,47,0.04)",
                        padding: "3px 10px", borderRadius: "100px",
                      }}>
                        {getCountryFlag(pick.detectedCountry)} {getCountryName(pick.detectedCountry)}
                      </span>
                    )}
                    {pick.matchReasons.map((reason, j) => {
                      const icons = { estate: "\u{1F3DB}\uFE0F", region: "\u{1F4CD}", varietal: "\u{1F347}", country: "\u{1F30D}", country_region: "\u{1F30D}", favorite: "\u2764\uFE0F" };
                      if (reason.type === "country") return null;
                      return (
                        <span key={j} style={{
                          fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                          color: "#1B3D2F", opacity: 0.6, background: "rgba(27,61,47,0.04)",
                          padding: "3px 10px", borderRadius: "100px",
                        }}>
                          {icons[reason.type] || "\u{1F377}"} {reason.label}
                        </span>
                      );
                    })}
                  </div>

                  {pick.producerMatch && (
                    <div style={{
                      fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F",
                      opacity: 0.45, marginTop: 8, lineHeight: 1.5,
                    }}>
                      {pick.producerMatch.name} · {pick.producerMatch.subregion || pick.producerMatch.region}, {pick.producerMatch.country}
                      {pick.producerMatch.varieties?.length > 0 && ` · ${pick.producerMatch.varieties.slice(0, 2).join(", ")}`}
                    </div>
                  )}

                  {pick.pickType === "adventure" && (
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#8B6914", marginTop: 10, fontStyle: "italic", opacity: 0.7 }}>
                      Something new — matches your grape preferences from a different region
                    </div>
                  )}
                  {pick.pickType === "value" && (
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#6B8F5E", marginTop: 10, fontStyle: "italic", opacity: 0.7 }}>
                      Best match in the lower price range
                    </div>
                  )}
                  {pick.pickType === "splurge" && (
                    <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", marginTop: 10, fontStyle: "italic", opacity: 0.7 }}>
                      Worth the stretch — strong DNA match at a higher price point
                    </div>
                  )}

                  {/* Rating section */}
                  <div style={{
                    marginTop: 14, paddingTop: 14,
                    borderTop: "1px solid rgba(27,61,47,0.06)",
                  }}>
                    {pickRatings[pick.name] ? (
                      <div style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
                        color: "#1B3D2F", opacity: 0.6,
                      }}>
                        <span>{{ loved: "❤️", liked: "👍", fine: "😐", not_for_me: "👎" }[pickRatings[pick.name]]}</span>
                        <span>{{ loved: "Loved it", liked: "Liked it", fine: "It was fine", not_for_me: "Not for me" }[pickRatings[pick.name]]}</span>
                        <button onClick={() => setRatingPick(pick.name)} style={{
                          fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px",
                          color: "#8B2332", background: "none", border: "none",
                          cursor: "pointer", marginLeft: "auto", textDecoration: "underline", opacity: 0.6,
                        }}>Change</button>
                      </div>
                    ) : (
                      <button onClick={() => setRatingPick(pick.name)} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "8px 14px", borderRadius: "10px",
                        border: "1px solid rgba(139,35,50,0.12)", background: "rgba(139,35,50,0.03)",
                        fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px",
                        color: "#8B2332", fontWeight: 600, cursor: "pointer",
                        width: "100%", justifyContent: "center",
                      }}>🍷 Had this wine? Rate it</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", marginBottom: 12 }}>
          <button onClick={handleReset} style={{
            flex: 1, padding: "14px 20px", borderRadius: "14px",
            border: "2px solid rgba(27,61,47,0.15)", background: "rgba(255,255,255,0.7)",
            color: "#1B3D2F", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, cursor: "pointer",
          }}>Try Another List</button>
          <a href="/" style={{
            flex: 1, padding: "14px 20px", borderRadius: "14px",
            border: "2px solid rgba(139,35,50,0.15)", background: "rgba(255,255,255,0.7)",
            color: "#8B2332", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600,
            textDecoration: "none", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
          }}>Update My DNA</a>
        </div>
        <div style={{ textAlign: "center", paddingBottom: 40 }}>
          <a href="/journal" style={{
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            color: "#1B3D2F", opacity: 0.4, textDecoration: "underline",
          }}>View Wine Journal →</a>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // INPUT VIEW
  // ═══════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ padding: "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(245,240,232,0.9)", backdropFilter: "blur(12px)", zIndex: 10 }}>
        <a href="/" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.01em" }}><img src="/protea-icon.png" alt="" style={{ height: 36, width: "auto" }} />Sommeasy</a>
        <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5 }}>{user.email?.split("@")[0]}</span>
      </div>

      {/* Title */}
      <div style={{ textAlign: "center", padding: "32px 0 24px" }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px", color: "#1B3D2F", margin: "0 0 10px", fontWeight: 700, letterSpacing: "-0.01em" }}>Get your picks</h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.5, margin: 0, maxWidth: 340, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
          Share a wine list and we&#39;ll find your best matches.
        </p>
      </div>

      {/* Input mode tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: 16, background: "rgba(27,61,47,0.04)", borderRadius: "12px", padding: "4px" }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => { setInputMode(m.id); setErrorMsg(""); }} style={{
            flex: 1, padding: "10px 8px", borderRadius: "10px", border: "none", cursor: "pointer",
            background: inputMode === m.id ? "rgba(255,255,255,0.9)" : "transparent",
            boxShadow: inputMode === m.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px",
            fontWeight: inputMode === m.id ? 600 : 400,
            color: inputMode === m.id ? "#1B3D2F" : "rgba(27,61,47,0.5)",
            transition: "all 0.2s ease",
          }}>
            <span style={{ marginRight: 4 }}>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      {/* ─── PASTE MODE ─── */}
      {inputMode === "paste" && (
        <div style={{ marginBottom: 20 }}>
          {/* Extracted text indicator */}
          {extractedFrom && wineListText && (
            <div style={{
              padding: "8px 14px", borderRadius: "10px", marginBottom: 10,
              background: "rgba(107,143,94,0.08)", border: "1px solid rgba(107,143,94,0.15)",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <span style={{ fontSize: "14px" }}>{extractedFrom === "photo" ? "📸" : "🔗"}</span>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", margin: 0, opacity: 0.7, flex: 1 }}>
                {extractedFrom === "photo" ? "Extracted from your photo" : "Extracted from URL"} — review and edit if needed.
              </p>
            </div>
          )}
          <textarea
            value={wineListText}
            onChange={(e) => setWineListText(e.target.value)}
            placeholder={"Paste wine list here...\n\ne.g.\nCloudy Bay Sauvignon Blanc, Marlborough 2022...$52\nKanonkop Pinotage, Stellenbosch 2019...$68"}
            rows={10}
            style={{
              width: "100%", padding: "16px", borderRadius: "14px",
              border: "2px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.6)",
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F",
              resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button onClick={loadExample} style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#8B2332",
              background: "none", border: "none", cursor: "pointer", textDecoration: "underline", opacity: 0.6,
            }}>Try an example list</button>
          </div>
        </div>
      )}

      {/* ─── PHOTO MODE ─── */}
      {inputMode === "photo" && (
        <div style={{ marginBottom: 20 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            style={{ display: "none" }}
          />

          {processing ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "40px 24px", borderRadius: "16px", border: "2px dashed rgba(139,35,50,0.2)",
              background: "rgba(139,35,50,0.03)",
            }}>
              {photoPreview && (
                <img src={photoPreview} alt="Wine list photo" style={{
                  width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: "10px", marginBottom: 20, opacity: 0.6,
                }} />
              )}
              <div style={{ width: 32, height: 32, border: "3px solid rgba(139,35,50,0.2)", borderTopColor: "#8B2332", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#8B2332", fontWeight: 600, margin: 0 }}>{processingMsg}</p>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.4, margin: "8px 0 0" }}>This usually takes 3-5 seconds</p>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()} style={{
              width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "40px 24px", borderRadius: "16px", border: "2px dashed rgba(139,35,50,0.2)",
              background: "rgba(139,35,50,0.03)", cursor: "pointer", transition: "all 0.2s ease",
            }}>
              <div style={{ fontSize: "40px", marginBottom: 12 }}>📸</div>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px", color: "#1B3D2F", fontWeight: 600, margin: "0 0 4px" }}>
                Take a photo or choose image
              </p>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5, margin: 0, maxWidth: 280, textAlign: "center", lineHeight: 1.4 }}>
                Point your camera at the wine list. Works best with good lighting and a flat surface.
              </p>
            </button>
          )}
        </div>
      )}

      {/* ─── URL MODE ─── */}
      {inputMode === "url" && (
        <div style={{ marginBottom: 20 }}>
          {processing ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "48px 24px", borderRadius: "16px", border: "2px solid rgba(27,61,47,0.08)",
              background: "rgba(255,255,255,0.5)",
            }}>
              <div style={{ width: 32, height: 32, border: "3px solid rgba(27,61,47,0.15)", borderTopColor: "#1B3D2F", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", fontWeight: 600, margin: 0 }}>{processingMsg}</p>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.4, margin: "8px 0 0" }}>Fetching and analyzing the page...</p>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: "8px", marginBottom: 8 }}>
                <input
                  type="url"
                  value={menuUrl}
                  onChange={(e) => setMenuUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUrlFetch()}
                  placeholder="https://restaurant.com/wine-list"
                  style={{
                    flex: 1, padding: "14px 16px", borderRadius: "12px",
                    border: "2px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.6)",
                    fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
                <button onClick={handleUrlFetch} disabled={!menuUrl.trim()} style={{
                  padding: "14px 20px", borderRadius: "12px", border: "none",
                  background: menuUrl.trim() ? "#1B3D2F" : "rgba(27,61,47,0.1)",
                  color: menuUrl.trim() ? "#F5F0E8" : "rgba(27,61,47,0.3)",
                  fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600,
                  cursor: menuUrl.trim() ? "pointer" : "default", whiteSpace: "nowrap",
                }}>Fetch</button>
              </div>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.4, margin: "4px 0 0 4px", lineHeight: 1.4 }}>
                Paste a link to the restaurant&#39;s wine list or drinks menu page. Also works with PDF links.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div style={{
          padding: "12px 16px", borderRadius: "12px", marginBottom: 16,
          background: "rgba(139,35,50,0.06)", border: "1px solid rgba(139,35,50,0.15)",
        }}>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#8B2332", margin: 0, lineHeight: 1.5 }}>
            {errorMsg}
          </p>
        </div>
      )}

      {/* Filters — show when in paste mode */}
      {inputMode === "paste" && (
        <div style={{ background: "rgba(255,255,255,0.5)", borderRadius: "16px", padding: "18px", border: "1px solid rgba(27,61,47,0.08)", marginBottom: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#1B3D2F", opacity: 0.5, marginBottom: 8, fontWeight: 600 }}>Color preference</div>
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                { id: "all", label: "All wines" },
                { id: "red", label: "🔴 Red" },
                { id: "white", label: "⚪ White" },
              ].map(opt => (
                <button key={opt.id} onClick={() => setColorPref(opt.id)} style={{
                  flex: 1, padding: "10px 8px", borderRadius: "10px", cursor: "pointer",
                  border: colorPref === opt.id ? "2px solid #1B3D2F" : "2px solid rgba(27,61,47,0.1)",
                  background: colorPref === opt.id ? "rgba(27,61,47,0.06)" : "transparent",
                  fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", fontWeight: colorPref === opt.id ? 600 : 400,
                  color: "#1B3D2F",
                }}>{opt.label}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#1B3D2F", opacity: 0.5, marginBottom: 8, fontWeight: 600 }}>Budget range (optional)</div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.4 }}>$</span>
                <input type="number" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px 10px 26px", borderRadius: "10px", border: "2px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.8)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", outline: "none", boxSizing: "border-box" }} />
              </div>
              <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.3 }}>to</span>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.4 }}>$</span>
                <input type="number" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px 10px 26px", borderRadius: "10px", border: "2px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.8)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "11px", color: "#1B3D2F", opacity: 0.35, margin: "6px 0 0", lineHeight: 1.4 }}>
              Leave blank for any price. Budget helps us pick your Value and Splurge options.
            </p>
          </div>
        </div>
      )}

      {/* Analyze button */}
      {inputMode === "paste" && (
        <button
          onClick={handleAnalyze}
          disabled={!wineListText.trim()}
          style={{
            width: "100%", padding: "17px", borderRadius: "14px", border: "none",
            background: wineListText.trim() ? "linear-gradient(135deg, #8B2332, #7A1E2C)" : "rgba(139,35,50,0.2)",
            color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px",
            fontWeight: 600, cursor: wineListText.trim() ? "pointer" : "not-allowed",
            boxShadow: wineListText.trim() ? "0 6px 24px rgba(139,35,50,0.25)" : "none",
            marginBottom: 40, transition: "all 0.15s ease",
          }}
        >Find My Wines</button>
      )}
    </div>
  );
}
