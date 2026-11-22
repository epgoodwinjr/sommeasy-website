// The two faces, self-hosted (launch prep Session 2b, Nov 2026).
//
// next/font downloads them at BUILD time and serves them from our own
// origin (/_next/static/media), so no page asks fonts.googleapis.com for
// anything — the privacy policy's Google Fonts line could go. It hashes
// every family name it emits ('__Playfair_Display_<hash>'), so the faces
// are reached through two CSS variables set on <html> (layout.js), and the
// house tokens SERIF and SANS (components/house/tokens.js) name the
// variables — every component already sets its type through those two.
//
// Same faces and weights as the old Google Fonts request
// (Playfair Display ital,wght 400..700; Source Sans 3 wght 300..700): both
// are variable fonts, so each style is one file covering the whole range.
// display "swap", as before. The link-preview image (opengraph-image.js)
// draws with its own checked-in WOFF files and does not use these.

import { Playfair_Display, Source_Sans_3 } from "next/font/google";

export const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-playfair",
});

export const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-sans",
});
