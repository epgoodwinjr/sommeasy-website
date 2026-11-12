"use client";

// GrowthMoment — the bloom answering a rating (docs/motion/README.md §8.4).
// The one component every surface uses when a rating's engine result may
// carry a promotion or an identity shift:
//
//   <GrowthMoment genome={after} from={before} moment={growthOf(result)} size={164} />
//
//   moment   growthOf()'s { grow, celebrate } (src/lib/growthMoment.js).
//            Without a moment the bloom simply stands in the shape it now
//            has: a rating with no promotion and no shift gets no growth.
//   from     the genome before the rating. Arriving WITH a moment, the bloom
//            shows that shape first and grows into `genome` after `delay`
//            (Log's saved step, the wine page).
//   genome   the shape now. On a bloom that is already on the page (home's
//            crest) a later change of `genome` grows it in place — pass the
//            new genome and its moment together, and only for a moment.
//
// It celebrates — the swell, the pulse from the heart, the berry landing
// with its ripples — only when the moment says so: a promotion or a positive
// shift. Everything else about the growth is the mark's own
// (PalateMarkLive, palateMark.js): at rest it is exactly what <PalateMark>
// renders, and under reduced motion it is the new shape at once.

import PalateMarkLive from "@/components/PalateMarkLive";
import { GROWTH } from "@/components/house/motion";

export default function GrowthMoment({ genome, from = null, moment = null, size = 96, delay = GROWTH.delay, style }) {
  const grows = Boolean(moment && moment.grow);
  return (
    <PalateMarkLive
      genome={genome}
      size={size}
      style={style}
      growFrom={grows ? from : null}
      growDelay={delay}
      celebrate={grows && Boolean(moment.celebrate)}
    />
  );
}
