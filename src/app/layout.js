import "./globals.css";

export const metadata = {
  title: "Sommeasy — Your Wine DNA Profile",
  description:
    "Tell us about the wines you love and we'll build your Wine DNA profile. Never guess at a restaurant wine list again.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Sommeasy — Your Wine DNA Profile",
    description: "Never guess at a restaurant wine list again.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* Subtle background gradient */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(139,35,50,0.03) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(27,61,47,0.04) 0%, transparent 50%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      </body>
    </html>
  );
}
