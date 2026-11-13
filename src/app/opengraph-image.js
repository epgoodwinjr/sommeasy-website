// opengraph-image.js — the link preview (docs/motion/README.md §16.2).
//
// What a shared Sommeasy link shows in a message or a feed: cream ground,
// the protea, the wordmark and the brand's one line in Playfair — the front
// door, set for a 1200×630 card. Next's built-in `next/og` draws it (no new
// dependency); the root layout's `twitter.card` asks for the large card,
// and Next fills twitter:image from this file. It sits at the app root, so
// every page's preview is this one.
//
// No dynamic API, so Next renders it once at build time: the font files
// (assets/fonts — next/og can't read the pages' Google Fonts stylesheet)
// and the protea are read from disk then. Centered, so a square crop
// (WhatsApp, some chat apps) still holds the mark and the whole line.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BURGUNDY, CREAM, INK } from "@/components/house/tokens";
import { TAGLINE } from "@/lib/houseCopy";

export const alt = `Sommeasy — ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The protea's own proportions (public/protea-icon.png is 245×406)
const MARK_HEIGHT = 150;
const MARK_WIDTH = Math.round((MARK_HEIGHT * 245) / 406);
// The masthead's wordmark: 0.36em of tracking, which also trails the last
// letter — the same space on the left keeps it centered
const WORDMARK_SIZE = 22;
const TRACKING = Math.round(WORDMARK_SIZE * 0.36);

const fromRoot = (...parts) => readFile(join(process.cwd(), ...parts));

export default async function Image() {
  const [playfair, sourceSans, protea] = await Promise.all([
    fromRoot("assets", "fonts", "PlayfairDisplay-Bold-latin.woff"),
    fromRoot("assets", "fonts", "SourceSans3-Bold-latin.woff"),
    fromRoot("public", "protea-icon.png"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", background: CREAM,
        }}
      >
        <img
          src={`data:image/png;base64,${protea.toString("base64")}`}
          width={MARK_WIDTH}
          height={MARK_HEIGHT}
          alt=""
        />
        <div
          style={{
            marginTop: 26, paddingLeft: TRACKING,
            fontFamily: "Source Sans 3", fontWeight: 700, fontSize: WORDMARK_SIZE,
            letterSpacing: TRACKING, textTransform: "uppercase", color: BURGUNDY,
          }}
        >
          Sommeasy
        </div>
        <div
          style={{
            // Two even lines, as Welcome's balanced headline breaks — and
            // narrow enough for a centered square crop (630px)
            marginTop: 40, maxWidth: 640, textAlign: "center", textWrap: "balance",
            fontFamily: "Playfair Display", fontWeight: 700, fontSize: 78,
            lineHeight: 1.08, color: INK,
          }}
        >
          {TAGLINE}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Playfair Display", data: playfair, weight: 700, style: "normal" },
        { name: "Source Sans 3", data: sourceSans, weight: 700, style: "normal" },
      ],
    },
  );
}
