# Fonts for server-drawn images

The link preview image (`src/app/opengraph-image.js`) is drawn on the server by
Next's built-in `next/og`, which can't use the Google Fonts stylesheet the
pages load. These are the same two faces, as files:

| File | Face | Source |
|---|---|---|
| `PlayfairDisplay-Bold-latin.woff` | Playfair Display 700, latin subset | Google Fonts (fonts.gstatic.com, v40) |
| `SourceSans3-Bold-latin.woff` | Source Sans 3 700, latin subset | Google Fonts (fonts.gstatic.com, v20) |

Both are licensed under the SIL Open Font License 1.1 — `OFL-PlayfairDisplay.txt`
and `OFL-SourceSans3.txt`. They are assets, not dependencies. WOFF, not WOFF2:
`next/og` (satori) reads TTF, OTF and WOFF only. The latin subset covers
U+0000–00FF and general punctuation; text outside it falls back to Noto Sans.
