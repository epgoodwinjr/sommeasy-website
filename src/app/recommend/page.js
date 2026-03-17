"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { parseWineList, matchWinesAgainstDNA, curatePicks, getPickTypeInfo, getCountryFlag, getCountryName } from "@/lib/matchEngine";

// ─── Image compression utility ───
// Returns a compressed JPEG Blob (max 2048px, 0.85 quality, handles HEIC/HEIF)
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 2048;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Compression failed")); return; }
        resolve(blob);
      }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ─── Base64 encoding utility ───
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Loading message rotation ───
const LOADING_MESSAGES = [
  "Reading the wine list...",
  "Matching wines to your palate...",
  "Finding your perfect picks...",
];

// ─── Photo source types ───
const PHOTO_SOURCES = [
  { id: "wine-list", label: "Wine List / Menu" },
  { id: "shelf-tag", label: "Shelf Tag / Price Card" },
  { id: "bottle-label", label: "Bottle Label" },
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
  const [scoredEntries, setScoredEntries] = useState(null);
  const [totalParsed, setTotalParsed] = useState(0);
  const [totalMatched, setTotalMatched] = useState(0);
  const [showPasteMode, setShowPasteMode] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [menuUrl, setMenuUrl] = useState("");
  const [extractedFrom, setExtractedFrom] = useState(null);
  const [pickRatings, setPickRatings] = useState({});
  const [ratingPick, setRatingPick] = useState(null);
  const [ratingToast, setRatingToast] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const loadingInterval = useRef(null);
  const supabase = createClient();

  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  // Clean up loading interval on unmount
  useEffect(() => {
    return () => {
      if (loadingInterval.current) clearInterval(loadingInterval.current);
    };
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user || null;
      setUser(u);
      if (u) {
        // Fetch profile and interactions in parallel
        const [profileResult, interactionsResult] = await Promise.all([
          supabase.from("wine_profiles").select("*").eq("user_id", u.id).single(),
          supabase.from("wine_interactions").select("*").eq("user_id", u.id),
        ]);
        if (profileResult.data) setProfile(profileResult.data);
        if (interactionsResult.data) setInteractions(interactionsResult.data);
      }
      setLoading(false);
    }
    init();
  }, []);

  // ─── Rotating loading messages ───
  const startLoadingMessages = () => {
    let idx = 0;
    setProcessingMsg(LOADING_MESSAGES[0]);
    loadingInterval.current = setInterval(() => {
      idx = (idx + 1) % LOADING_MESSAGES.length;
      setProcessingMsg(LOADING_MESSAGES[idx]);
    }, 2500);
  };

  const stopLoadingMessages = () => {
    if (loadingInterval.current) {
      clearInterval(loadingInterval.current);
      loadingInterval.current = null;
    }
    setProcessingMsg("");
  };

  // ─── Core analysis (called with explicit values to avoid React batching issues) ───
  const runAnalysis = (entries, minP, maxP, colorP) => {
    if (!profile) return;
    setTotalParsed(entries.length);
    const dna = {
      countries: profile.countries || [],
      regions: profile.regions || {},
      estates: profile.estates || {},
      varietals: profile.varietals || [],
      specificWines: profile.specific_wines || [],
    };
    const scored = matchWinesAgainstDNA(entries, dna);
    setScoredEntries(scored);
    const matched = scored.filter(e => e.score > 0);
    setTotalMatched(matched.length);
    const curated = curatePicks(scored, { minPrice: minP, maxPrice: maxP, colorPreference: colorP });
    setPicks(curated);
  };

  // ─── Re-filter picks without re-scoring (called when filters change in results view) ───
  const handleRefilter = (newColorPref, newMinPrice, newMaxPrice) => {
    if (!scoredEntries) return;
    const curated = curatePicks(scoredEntries, {
      minPrice: newMinPrice ? parseFloat(newMinPrice) : null,
      maxPrice: newMaxPrice ? parseFloat(newMaxPrice) : null,
      colorPreference: newColorPref,
    });
    setPicks(curated);
  };

  // ─── Text analysis (paste mode fallback) ───
  const handleAnalyze = () => {
    if (!wineListText.trim() || !profile) return;
    setErrorMsg("");
    const entries = parseWineList(wineListText);
    const min = minPrice ? parseFloat(minPrice) : null;
    const max = maxPrice ? parseFloat(maxPrice) : null;
    runAnalysis(entries, min, max, colorPref);
  };

  // ─── Vision scan (photo or PDF) ───
  const handleVisionScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setErrorMsg("");

    // Client-side size check
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("That file is too large (max 10MB). Try a photo at lower resolution, or photograph one page at a time.");
      return;
    }

    setProcessing(true);
    startLoadingMessages();

    try {
      let payload;

      if (file.type === "application/pdf") {
        const base64 = await blobToBase64(file);
        payload = { pdfBase64: base64 };
      } else {
        const blob = await compressImage(file);
        const base64 = await blobToBase64(blob);
        payload = { imageBase64: base64, mimeType: "image/jpeg" };
      }

      const res = await fetch("/api/parse-wine-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.error) {
        setErrorMsg(data.error);
        setProcessing(false);
        stopLoadingMessages();
        return;
      }

      // Path A: structured wines from Vision → direct to match engine
      if (data.wines && Array.isArray(data.wines) && data.wines.length > 0) {
        const entries = data.wines.map(w => ({
          name: w.name || "",
          price: typeof w.price === "number" ? w.price : null,
          originalLine: w.name || "",
          isByTheGlass: w.is_btg || false,
          sectionColor: w.color || null,
          sectionVarietal: null,
        }));

        setWineListText(data.rawText || "");
        setExtractedFrom("scan");
        runAnalysis(entries, null, null, "all");
        setProcessing(false);
        stopLoadingMessages();
        return;
      }

      // Path B: raw text fallback → show paste mode for review
      if (data.rawText) {
        setWineListText(data.rawText);
        setExtractedFrom("scan");
        setShowPasteMode(true);
        setProcessing(false);
        stopLoadingMessages();
        return;
      }

      setErrorMsg("Couldn't read any wines from this image. Try a clearer photo.");
      setProcessing(false);
      stopLoadingMessages();
    } catch (err) {
      setErrorMsg("Failed to process your wine list. Please try again.");
      setProcessing(false);
      stopLoadingMessages();
    }
  };

  // ─── URL handling ───
  const handleUrlFetch = async () => {
    const trimmed = menuUrl.trim();
    if (!trimmed) return;

    // Basic URL validation
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setErrorMsg("Please enter a valid URL starting with https://");
      return;
    }

    setErrorMsg("");
    setProcessing(true);
    setProcessingMsg("Fetching the wine list...");

    try {
      const res = await fetch("/api/fetch-menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();

      if (data.error && !data.text) {
        setErrorMsg(data.error);
        setProcessing(false);
        setProcessingMsg("");
        return;
      }

      const text = data.text || "";
      setWineListText(text);
      setExtractedFrom("url");

      // Run analysis directly — go straight to results
      const entries = parseWineList(text);
      if (entries.length === 0) {
        setShowPasteMode(true);
        setProcessing(false);
        setProcessingMsg("");
        setErrorMsg("Found the page but couldn't spot a wine list. Try editing the text below, or scan a photo instead.");
        return;
      }

      setProcessingMsg("Finding your perfect picks...");
      runAnalysis(entries, null, null, "all");
      setProcessing(false);
      setProcessingMsg("");
    } catch (err) {
      setErrorMsg("Failed to fetch that URL. Check the address and try again.");
      setProcessing(false);
      setProcessingMsg("");
    }
  };

  // ─── Pick rating ───
  const handleRatePick = async (wineName, rating) => {
    setPickRatings((prev) => ({ ...prev, [wineName]: rating }));
    setRatingPick(null);
    setRatingToast("Rating saved!");
    setTimeout(() => setRatingToast(null), 2500);

    try {
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
    setScoredEntries(null);
    setWineListText("");
    setTotalParsed(0);
    setTotalMatched(0);
    setErrorMsg("");
    setMenuUrl("");
    setExtractedFrom(null);
    setShowPasteMode(false);
    setColorPref("all");
    setMinPrice("");
    setMaxPrice("");
  };

  const loadExample = () => {
    setExtractedFrom(null);
    setShowPasteMode(true);
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
      { id: "loved", emoji: "\u2764\uFE0F", label: "Loved it" },
      { id: "liked", emoji: "\uD83D\uDC4D", label: "Liked it" },
      { id: "fine", emoji: "\uD83D\uDE10", label: "It was fine" },
      { id: "not_for_me", emoji: "\uD83D\uDC4E", label: "Not for me" },
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
          <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#1B3D2F", color: "#F5F0E8", padding: "10px 24px", borderRadius: "100px", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600, zIndex: 90, boxShadow: "0 4px 20px rgba(27,61,47,0.3)" }}>{ratingToast}</div>
        )}
        <div style={{ padding: "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(245,240,232,0.92)", backdropFilter: "blur(16px)", zIndex: 10 }}>
          <a href="/" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.01em" }}><img src="/protea-icon.png" alt="" style={{ height: 36, width: "auto" }} />Sommeasy</a>
          <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5 }}>{user.email?.split("@")[0]}</span>
        </div>

        <div style={{ textAlign: "center", padding: "28px 0 20px" }}>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px", color: "#1B3D2F", margin: "0 0 10px", fontWeight: 700, letterSpacing: "-0.01em" }}>
            {picks.length === 0 ? "No matches found" : `Your ${picks.length} picks`}
          </h2>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.45, margin: 0, lineHeight: 1.5 }}>
            {picks.length > 0
              ? `Curated from ${totalMatched} matches across ${totalParsed} wines on the list`
              : `We parsed ${totalParsed} wines but couldn't find matches for your DNA. Try refining your profile.`}
          </p>
        </div>

        {/* ─── Filters (in results view for post-scan refinement) ─── */}
        <div style={{ background: "rgba(255,255,255,0.5)", borderRadius: "16px", padding: "16px", border: "1px solid rgba(27,61,47,0.08)", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: 12 }}>
            {[
              { id: "all", label: "All wines" },
              { id: "red", label: "Red" },
              { id: "white", label: "White" },
            ].map(opt => (
              <button key={opt.id} onClick={() => { setColorPref(opt.id); handleRefilter(opt.id, minPrice, maxPrice); }} style={{
                flex: 1, padding: "8px 6px", borderRadius: "10px", cursor: "pointer",
                border: colorPref === opt.id ? "2px solid #1B3D2F" : "2px solid rgba(27,61,47,0.1)",
                background: colorPref === opt.id ? "rgba(27,61,47,0.06)" : "transparent",
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", fontWeight: colorPref === opt.id ? 600 : 400,
                color: "#1B3D2F",
              }}>{opt.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.4 }}>$</span>
              <input type="number" placeholder="Min" value={minPrice} onChange={(e) => { setMinPrice(e.target.value); handleRefilter(colorPref, e.target.value, maxPrice); }}
                style={{ width: "100%", padding: "8px 10px 8px 22px", borderRadius: "8px", border: "1px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.8)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", outline: "none", boxSizing: "border-box" }} />
            </div>
            <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", opacity: 0.3 }}>to</span>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.4 }}>$</span>
              <input type="number" placeholder="Max" value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); handleRefilter(colorPref, minPrice, e.target.value); }}
                style={{ width: "100%", padding: "8px 10px 8px 22px", borderRadius: "8px", border: "1px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.8)", fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
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
                      const icons = { estate: "\u{1F3DB}\uFE0F", region: "\u{1F4CD}", varietal: "\u{1F347}", country: "\u{1F30D}", country_region: "\u{1F30D}", favorite: "\u2764\uFE0F", feedback_boost: "\u{1F4C8}" };
                      if (reason.type === "country" || reason.type === "feedback_suppress") return null;
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
                        <span>{{ loved: "\u2764\uFE0F", liked: "\uD83D\uDC4D", fine: "\uD83D\uDE10", not_for_me: "\uD83D\uDC4E" }[pickRatings[pick.name]]}</span>
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
                      }}>Had this wine? Rate it</button>
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
          }}>View Wine Journal</a>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // INPUT VIEW
  // ═══════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px", minHeight: "100vh" }}>
      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleVisionScan} style={{ display: "none" }} />
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleVisionScan} style={{ display: "none" }} />

      {/* Header */}
      <div style={{ padding: "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(245,240,232,0.92)", backdropFilter: "blur(16px)", zIndex: 10 }}>
        <a href="/" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#8B2332", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "10px", letterSpacing: "-0.01em" }}><img src="/protea-icon.png" alt="" style={{ height: 36, width: "auto" }} />Sommeasy</a>
        <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5 }}>{user.email?.split("@")[0]}</span>
      </div>

      {/* Title */}
      <div style={{ textAlign: "center", padding: "32px 0 28px" }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "30px", color: "#1B3D2F", margin: "0 0 10px", fontWeight: 700, letterSpacing: "-0.01em" }}>Get your picks</h2>
        <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "15px", color: "#1B3D2F", opacity: 0.5, margin: 0, maxWidth: 340, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
          Share a wine list and we&#39;ll find your best matches.
        </p>
      </div>

      {/* ─── PROCESSING STATE ─── */}
      {processing && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "56px 24px", borderRadius: "18px",
          border: "1px solid rgba(139,35,50,0.1)", background: "rgba(255,255,255,0.6)",
          marginBottom: 20,
        }}>
          <div style={{ width: 36, height: 36, border: "3px solid rgba(139,35,50,0.15)", borderTopColor: "#8B2332", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 20 }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", color: "#1B3D2F", fontWeight: 600, margin: 0, textAlign: "center" }}>{processingMsg}</p>
          <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.4, margin: "10px 0 0", textAlign: "center" }}>Usually takes 5-10 seconds</p>
        </div>
      )}

      {/* ─── TWO-CARD INPUT (hidden during processing) ─── */}
      {!processing && !showPasteMode && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: 20 }}>
          {/* CARD 1: Scan the List */}
          <button onClick={() => fileInputRef.current?.click()} style={{
            width: "100%", padding: "32px 24px", borderRadius: "18px",
            border: "2px solid rgba(139,35,50,0.15)", background: "rgba(255,255,255,0.7)",
            cursor: "pointer", textAlign: "center",
            boxShadow: "0 4px 16px rgba(139,35,50,0.08)",
            transition: "all 0.15s ease",
          }}>
            <div style={{ fontSize: "36px", marginBottom: 12 }}>{"\uD83D\uDCF8"}</div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "22px", color: "#1B3D2F", fontWeight: 700, marginBottom: 6 }}>Scan the List</div>
            <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F", opacity: 0.5, lineHeight: 1.4 }}>
              Take a photo or upload a picture of the wine list
            </div>
          </button>

          {/* Mobile camera shortcut */}
          {isMobile && (
            <button onClick={() => cameraInputRef.current?.click()} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
              padding: "14px 20px", borderRadius: "12px",
              border: "1px solid rgba(139,35,50,0.12)", background: "rgba(139,35,50,0.03)",
              cursor: "pointer",
            }}>
              <span style={{ fontSize: "18px" }}>{"\uD83D\uDCF7"}</span>
              <span style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#8B2332", fontWeight: 600 }}>Open Camera</span>
            </button>
          )}

          {/* CARD 2: Paste a Link */}
          <div style={{
            padding: "28px 24px", borderRadius: "18px",
            border: "1px solid rgba(27,61,47,0.08)", background: "rgba(255,255,255,0.55)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: 16 }}>
              <span style={{ fontSize: "24px" }}>{"\uD83D\uDD17"}</span>
              <div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "18px", color: "#1B3D2F", fontWeight: 700 }}>Paste a Link</div>
                <div style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F", opacity: 0.5 }}>Got a link to the wine list? Drop it here</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="url"
                value={menuUrl}
                onChange={(e) => setMenuUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlFetch()}
                placeholder="https://..."
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: "12px",
                  border: "2px solid rgba(27,61,47,0.1)", background: "rgba(255,255,255,0.7)",
                  fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", color: "#1B3D2F",
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <button onClick={handleUrlFetch} disabled={!menuUrl.trim()} style={{
                padding: "14px 24px", borderRadius: "12px", border: "none",
                background: menuUrl.trim() ? "linear-gradient(135deg, #8B2332, #7A1E2C)" : "rgba(139,35,50,0.15)",
                color: menuUrl.trim() ? "#F5F0E8" : "rgba(139,35,50,0.3)",
                fontFamily: "'Source Sans 3', sans-serif", fontSize: "14px", fontWeight: 600,
                cursor: menuUrl.trim() ? "pointer" : "default", whiteSpace: "nowrap",
                boxShadow: menuUrl.trim() ? "0 4px 16px rgba(139,35,50,0.2)" : "none",
              }}>Get My Picks</button>
            </div>
          </div>

          {/* Subtle paste text fallback */}
          <div style={{ textAlign: "center", marginTop: 4 }}>
            <button onClick={() => setShowPasteMode(true)} style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "13px", color: "#1B3D2F",
              opacity: 0.35, background: "none", border: "none", cursor: "pointer",
              textDecoration: "underline",
            }}>or paste text manually</button>
          </div>
        </div>
      )}

      {/* ─── PASTE MODE (fallback / Path B review) ─── */}
      {!processing && showPasteMode && (
        <div style={{ marginBottom: 20 }}>
          {extractedFrom && wineListText && (
            <div style={{
              padding: "8px 14px", borderRadius: "10px", marginBottom: 10,
              background: "rgba(107,143,94,0.08)", border: "1px solid rgba(107,143,94,0.15)",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <span style={{ fontSize: "14px" }}>{extractedFrom === "scan" ? "\uD83D\uDCF8" : extractedFrom === "url" ? "\uD83D\uDD17" : "\uD83D\uDCCB"}</span>
              <p style={{ fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F", margin: 0, opacity: 0.7, flex: 1 }}>
                {extractedFrom === "scan" ? "Extracted from your photo" : extractedFrom === "url" ? "Extracted from URL" : "Paste your wine list below"} — review and edit if needed.
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <button onClick={() => { setShowPasteMode(false); setWineListText(""); setExtractedFrom(null); }} style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#1B3D2F",
              background: "none", border: "none", cursor: "pointer", opacity: 0.4,
            }}>Back to scan/link</button>
            <button onClick={loadExample} style={{
              fontFamily: "'Source Sans 3', sans-serif", fontSize: "12px", color: "#8B2332",
              background: "none", border: "none", cursor: "pointer", textDecoration: "underline", opacity: 0.6,
            }}>Try an example list</button>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!wineListText.trim()}
            style={{
              width: "100%", padding: "17px", borderRadius: "14px", border: "none",
              background: wineListText.trim() ? "linear-gradient(135deg, #8B2332, #7A1E2C)" : "rgba(139,35,50,0.2)",
              color: "#F5F0E8", fontFamily: "'Source Sans 3', sans-serif", fontSize: "16px",
              fontWeight: 600, cursor: wineListText.trim() ? "pointer" : "not-allowed",
              boxShadow: wineListText.trim() ? "0 6px 24px rgba(139,35,50,0.25)" : "none",
              marginTop: 16, transition: "all 0.15s ease",
            }}
          >Find My Wines</button>
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
    </div>
  );
}
