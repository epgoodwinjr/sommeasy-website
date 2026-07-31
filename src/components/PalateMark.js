"use client";

// PalateMark — THE inline surface for the visual DNA signature (Act III,
// "The Signature"). One implementation for every surface: /palate hero,
// home strip, quiz reveal, anonymous teaser. The render itself lives in
// src/lib/palateMark.js (pure genome → SVG string, share-card ready);
// this wrapper only mounts it into React.
//
// Decorative by contract: every surface shows the strand's title beside
// the mark, so the title is the accessible name and the mark is
// aria-hidden (the SVG string carries aria-hidden/role too). A missing
// genome renders nothing — surfaces degrade to text-only exactly as they
// did before the mark existed.

import { renderPalateMark } from "@/lib/palateMark";

export default function PalateMark({ genome, size = 96, style }) {
  const svg = renderPalateMark(genome, { size });
  if (!svg) return null;
  return (
    <span
      data-testid="palate-mark"
      aria-hidden="true"
      style={{ display: "inline-flex", lineHeight: 0, flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
