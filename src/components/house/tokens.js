// tokens.js — The House List design tokens (docs/house-list/README.md §6).
//
// The one copy of every value the house primitives share. Ink carries all
// text and rules; hierarchy comes from its opacity, never from grays. No new
// colors — these are the app's own.

export const INK = "#1B3D2F";
export const BURGUNDY = "#8B2332";
export const BURGUNDY_DEEP = "#7A1E2C";
export const SAGE = "#6B8F5E";
export const SAGE_TRACK = "rgba(107,143,94,0.18)";
export const CREAM = "#F5F0E8";

/** Ink at an opacity, for rules, leaders and tracks. */
export const ink = (alpha) => `rgba(27,61,47,${alpha})`;

export const SERIF = "'Playfair Display', Georgia, serif";
export const SANS = "'Source Sans 3', sans-serif";

export const GRADIENT = "linear-gradient(135deg,#8B2332,#7A1E2C)";
export const CIRCLE_SHADOW = "0 6px 20px rgba(139,35,50,0.3)";
export const PILL_SHADOW = "0 6px 20px rgba(139,35,50,0.25)";
export const TOAST_SHADOW = "0 4px 20px rgba(27,61,47,0.3)";

/** Interactive elements; the soft-out curve drives fills, rails and reveals. */
export const TRANSITION = "all 0.15s ease";
export const SOFT_OUT = "cubic-bezier(0.22,1,0.36,1)";

/** A dotted leader: 1.5px at 0.25 by default; 2px on primary entries,
 *  0.22 on setting/fact/DNA rows, 0.2 on the rating list and Reserved rows. */
export const leader = (width = 1.5, alpha = 0.25) => `${width}px dotted ${ink(alpha)}`;

/** The page column: 560px, 28px gutters (auth pages: 400px / 36px). */
export const COLUMN = 560;
export const GUTTER = 28;

/** The recurring type roles from the §6 table. */
export const TYPE = {
  h1: {
    fontFamily: SERIF, fontSize: "30px", fontWeight: 700, color: INK,
    letterSpacing: "-0.01em", lineHeight: 1.15, margin: 0,
  },
  sub: {
    fontFamily: SANS, fontSize: "15px", lineHeight: 1.5, color: INK, opacity: 0.55,
  },
  eyebrow: {
    fontFamily: SANS, fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.22em", color: BURGUNDY,
  },
  meta: {
    fontFamily: SANS, fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.14em", color: INK, opacity: 0.45,
  },
  fieldLabel: {
    fontFamily: SANS, fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.2em", color: INK, opacity: 0.5,
  },
};
