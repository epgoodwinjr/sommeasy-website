// radio.js — keyboard for the house's single-choice groups (ChoiceLine,
// ChoiceTabs, RatingList): arrow keys move AND select, wrapping at the
// ends (the ARIA radio/tab pattern). Pair it with a roving tabIndex — only
// the checked option (or the first, when none is) sits in the tab order —
// and a data-choice attribute on each option so focus can follow.

const STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function choiceKeyDown(e, ids, value, onChange) {
  const step = STEPS[e.key];
  if (!step || ids.length === 0) return;
  e.preventDefault();
  const at = ids.indexOf(value);
  const from = at === -1 ? (step > 0 ? -1 : 0) : at;
  const next = ids[(from + step + ids.length) % ids.length];
  onChange?.(next);
  e.currentTarget.querySelector(`[data-choice="${CSS.escape(String(next))}"]`)?.focus();
}

/** The option that takes Tab focus: the checked one, else the first. */
export function tabStop(ids, value) {
  return ids.includes(value) ? value : ids[0];
}
