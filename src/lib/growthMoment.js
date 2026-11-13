// growthMoment.js — what a rating means for the bloom (docs/motion/README.md
// §8.4, big moment 2).
//
// A rating's engine result either carries a moment or it doesn't:
//
//   grow       a promotion or an identity shift: the bloom is shown in its
//              old shape and grows into the new one. Anything less — a
//              rating that only moved points, a demotion the title survived
//              — gets no growth: the bloom simply stands as it now is.
//   celebrate  the growth also swells, pulses and ripples. Only for a
//              promotion or a POSITIVE shift: a shift that came with a
//              demotion (a re-rate down, a bottle removed) changes shape
//              quietly. palateMark.js holds the same line from the other
//              side — it never celebrates a shape that got smaller.
//
// readPalate() is the re-read a surface makes once a moment is known: the
// genome the recompose just wrote, with the strand's words. Unknown ≠
// changed: any failure is null, and the caller leaves its bloom as it is.
//
// Dependency-free (the client comes in as an argument), so
// growthMoment.test.js runs the real module in plain node.

const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/** → { grow, celebrate } from a rating's { promotions, demotions, shift }. */
export function growthOf({ promotions, demotions, shift } = {}) {
  const promoted = list(promotions).length > 0;
  const demoted = list(demotions).length > 0;
  const shifted = Boolean(shift && shift.shifted);
  return {
    grow: promoted || shifted,
    celebrate: promoted || (shifted && !demoted),
  };
}

/** The palate as it stands now → { genome, title, epithet }, or null. */
export async function readPalate(supabase, userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("wine_profiles")
      .select("archetype, identity")
      .eq("user_id", userId)
      .maybeSingle();
    const genome = data?.identity?.genome;
    if (error || !genome || typeof genome !== "object") return null;
    return {
      genome,
      title: typeof data.archetype === "string" ? data.archetype : null,
      epithet: typeof data.identity.epithet === "string" ? data.identity.epithet : null,
    };
  } catch {
    return null;
  }
}
