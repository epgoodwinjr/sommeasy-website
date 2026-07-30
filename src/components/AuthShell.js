"use client";

// Shared visual shell + style vocabulary for every auth page (login,
// signup, forgot-password, update-password). One place to keep the brand
// identity consistent across the whole front door.

export const authFonts = {
  serif: "'Playfair Display', Georgia, serif",
  sans: "'Source Sans 3', sans-serif",
};

export const inputStyle = {
  width: "100%", padding: "15px 18px", borderRadius: "14px",
  border: "1px solid rgba(27,61,47,0.1)",
  background: "rgba(255,255,255,0.55)",
  fontFamily: authFonts.sans, fontSize: "16px",
  color: "#1B3D2F", outline: "none", boxSizing: "border-box",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
};

export const focusInput = (e) => {
  e.target.style.borderColor = "rgba(139,35,50,0.3)";
  e.target.style.boxShadow = "0 0 0 3px rgba(139,35,50,0.06)";
};

export const blurInput = (e) => {
  e.target.style.borderColor = "rgba(27,61,47,0.1)";
  e.target.style.boxShadow = "none";
};

export const primaryButtonStyle = (disabled) => ({
  width: "100%", padding: "16px", borderRadius: "14px",
  border: "none",
  background: disabled
    ? "rgba(139,35,50,0.4)"
    : "linear-gradient(135deg, #8B2332, #7A1E2C)",
  color: "#F5F0E8",
  fontFamily: authFonts.sans, fontSize: "15px", fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all 0.15s ease",
  boxShadow: disabled ? "none" : "0 6px 20px rgba(139,35,50,0.25)",
  marginTop: 4,
});

export const errorBoxStyle = {
  padding: "12px 16px", borderRadius: "12px",
  background: "rgba(139,35,50,0.06)", border: "1px solid rgba(139,35,50,0.12)",
};

export const errorTextStyle = {
  fontFamily: authFonts.sans, fontSize: "13px",
  color: "#8B2332", margin: 0, lineHeight: 1.4,
};

export const noticeBoxStyle = {
  padding: "12px 16px", borderRadius: "12px",
  background: "rgba(27,61,47,0.06)", border: "1px solid rgba(27,61,47,0.12)",
};

export const noticeTextStyle = {
  fontFamily: authFonts.sans, fontSize: "13px",
  color: "#1B3D2F", margin: 0, lineHeight: 1.4,
};

export const inlineLinkStyle = {
  color: "#8B2332", fontWeight: 600, textDecoration: "none",
  display: "inline-block", padding: "12px 8px", margin: "-12px 0",
};

export const mutedTextStyle = {
  fontFamily: authFonts.sans, fontSize: "14px",
  color: "#1B3D2F", textAlign: "center", opacity: 0.5,
};

export default function AuthShell({ subtitle, children }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img src="/protea-icon.png" alt="" style={{
            height: 72, width: "auto", marginBottom: 16,
            filter: "drop-shadow(0 4px 16px rgba(139,35,50,0.12))",
          }} />
          <h1 style={{
            fontFamily: authFonts.serif,
            fontSize: "34px", color: "#8B2332", margin: "0 0 6px 0",
            fontWeight: 700, letterSpacing: "-0.01em",
          }}>Sommeasy</h1>
          <p style={{
            fontFamily: authFonts.sans, fontSize: "15px",
            color: "#1B3D2F", opacity: 0.5, margin: 0,
          }}>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
