// logEntry.js — the bottle on Log a bottle's rate step (The House List §8.2):
// which name it's saved under, and whether it's the user's first.
//
// The stored name is the journal row's key (wine_interactions is unique on
// user_id + wine_name), so a picked name — a want row, a journal hit — must
// save byte for byte unless the user really edits it, or logging a want
// would fork a second row — and when they do edit it, renamedFrom names the
// unrated row the save takes over. Pure; logEntry.test.js runs the real
// module.

import { splitVintage } from "./vintage.js";

const squash = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** A picked or typed name (search, want list, as written). The vintage is
 *  split off for display and re-attached only if the name is edited. */
export function entryFromName(source, name) {
  if (typeof name !== "string" || !name.trim()) return null;
  const { base, vintage } = splitVintage(name);
  return { source, original: name, initialBase: base, base, vintage, appendVintage: true };
}

/** A read label: producer + name, saved without the vintage (home's
 *  semantics since the beginning) — the vintage only shows. */
export function entryFromScan(source, displayName, vintage) {
  if (typeof displayName !== "string" || !displayName.trim()) return null;
  return {
    source, original: displayName, initialBase: displayName, base: displayName,
    vintage: vintage ? String(vintage) : null, appendVintage: false,
  };
}

/** The name to save: the stored name unless edited (a whitespace-only touch
 *  isn't an edit); an edit keeps a split-off vintage. "" when emptied. */
export function nameToSave(entry) {
  const edited = squash(entry?.base);
  if (!edited) return "";
  if (edited === squash(entry.initialBase)) return entry.original;
  return entry.appendVintage && entry.vintage ? `${edited} ${entry.vintage}` : edited;
}

/** The journal row this save takes over when the name was edited: the row
 *  stored under the picked name, while it carries no verdict (a want, a
 *  pass, a had never rated). Saving under the edited name and leaving that
 *  row behind would fork the bottle — the 📌 entry lingering beside the
 *  logged one — so the caller renames it instead. A rated row stays put:
 *  another name is another bottle, and its evidence never moves on its own.
 *  Null when there's nothing to take over. */
export function renamedFrom(entry, journal) {
  if (!entry || !Array.isArray(journal)) return null;
  const name = nameToSave(entry);
  if (!name || name === entry.original) return null;
  const row = journal.find((r) => r && r.wine_name === entry.original);
  return row && row.rating == null ? row : null;
}

/** The user's first rated bottle ever — claimed only from a journal read
 *  that SUCCEEDED (unknown ≠ empty: a failed read never says "first"). */
export function isFirstRating(journal, readOk) {
  return readOk === true && Array.isArray(journal) && !journal.some((r) => r && r.rating != null);
}
