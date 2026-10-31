// numerals.js — section numerals for House List pages (README §7.2).
//
// Numerals are assigned at render time in display order, counting only the
// sections that render: a hidden conditional section never consumes one.
// numeralCounter() makes that the default — call next() inside the
// condition, and a section that doesn't render never calls it:
//
//   const next = numeralCounter();
//   {verdictDue && <SectionHead numeral={next()} label="From last night" />}
//
// Pure and dependency-free (houseList.test.js runs the real module).

const ROMAN = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** 1 → "I.", 4 → "IV."; { lower: true } → "iv." (home's rec rows).
 *  Anything below 1 or not a number → "". */
export function romanNumeral(n, { lower = false } = {}) {
  let rest = Math.floor(Number(n));
  if (!Number.isFinite(rest) || rest < 1) return "";
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return `${lower ? out.toLowerCase() : out}.`;
}

/** A fresh counter per render: each call returns the next numeral. */
export function numeralCounter(options) {
  let n = 0;
  return () => romanNumeral(++n, options);
}
