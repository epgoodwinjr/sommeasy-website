// pendingPalateRestore.js — folding a waiting palate into the account, once.
//
// Never Lose a Palate (Sessions 2 + 5): an anonymous quiz reaches the account
// through TWO carriers — user_metadata.pending_palate (attached at signup;
// travels with the account onto any device) and the localStorage stash
// (same browser; the only carrier for a plain sign-in). The first signed-in
// load of "/" folds them in: stash ∪ existing ∪ earned over an existing
// profile (initialRaw null — the anonymous quiz never displayed the existing
// chips, so nothing counts as a deselection; NEVER clobber).
//
// EXACTLY ONCE PER ACCOUNT (launch prep, Nov 2026). Production wrote 23
// "restore" events for one account in five days: the metadata carrier was
// cleared only at the very end of the save — behind ~88 sequential
// accumulation writes, ~15s on a phone, with the event already written near
// the start — so every reload in that window folded the quiz in again. The
// order now:
//
//   1. claim the local stash synchronously (one winner per browser);
//   2. if the CACHED session user carries a palate, ask the server — the
//      session is a cache and may predate a clear made on another device
//      (a carrier is only ever added at signup, so an absent cached carrier
//      means an absent one on the server: no request in the common case);
//   3. save — the profile write is a union, so repeating it is harmless;
//   4. right after the write lands, CLAIM the metadata carrier with
//      claim_pending_palate() (migration 013): one transaction removes it,
//      records quiz_completed and hands the palate back, so of any number
//      of tabs, devices and reloads exactly one load wins — and its record
//      can't be lost to a reload, because it commits with the claim. Only
//      the winner shows the welcome-back line. The slow accumulation writes
//      come after.
//
// A save that fails puts the local stash back and leaves the metadata
// carrier untouched (the claim runs only after a landed write), so the next
// load retries: nothing lost, nothing recorded. If the claim function is
// missing (the app deployed before the migration), the claim falls back to
// clearing the key through the auth API — safe for reloads and sequential
// devices, though not atomic for two devices in the same instant.
//
// Without the function (the fallback) the event is a separate request after
// the clear: a page that dies between the two records none. Never two.

import { saveQuizProfile } from "./saveQuizProfile";
import { claimStash, restoreStash, unionQuizRaw, parseMetadataStash } from "./pendingPalate";

export const rowToRaw = (row) => ({
  countries: row.countries || [], regions: row.regions || {},
  estates: row.estates || {}, varietals: row.varietals || [],
  specificWines: row.specific_wines || [],
});

const NOTHING = { row: null, welcomeBack: false };

/** PostgREST's "no such function" — the migration hasn't been applied. */
function isMissingFunction(error) {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Remove the account's pending palate on the server and record the fold-in.
 * Returns { won, recorded }: won when THIS call removed the carrier;
 * recorded when the server wrote the quiz_completed row with the claim (the
 * claim function does, in the same transaction). Never throws.
 */
export async function claimMetadataCarrier(supabase, event) {
  try {
    const { data, error } = await supabase.rpc("claim_pending_palate", {
      p_payload: event?.payload ?? {},
      p_occurred_at: event?.occurredAt ?? null,
    });
    if (!error) {
      // null: another load claimed it first (and recorded it)
      return data != null ? { won: true, recorded: true } : { won: false, recorded: false };
    }
    if (!isMissingFunction(error)) {
      console.error("Pending palate claim failed:", error);
      return { won: false, recorded: false }; // unknown outcome: a later load retries
    }
    // Deployed before migration 013: clear the key through the auth API and
    // let the caller record the event
    const { error: clearErr } = await supabase.auth.updateUser({ data: { pending_palate: null } });
    if (clearErr) {
      console.error("Pending palate metadata clear failed:", clearErr);
      return { won: false, recorded: false };
    }
    return { won: true, recorded: false };
  } catch (err) {
    console.error("Pending palate claim failed:", err);
    return { won: false, recorded: false };
  }
}

/**
 * Fold a waiting palate in. Returns { row, welcomeBack }: row is the saved
 * profile (null when there was nothing to fold or the save failed);
 * welcomeBack is true only for the one load that folded it in.
 */
export async function restorePendingPalate({ supabase, user, existingRow, storage }) {
  const local = claimStash(storage);

  let meta = null;
  if (parseMetadataStash(user?.user_metadata?.pending_palate)) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) throw error || new Error("no user");
      meta = parseMetadataStash(data.user.user_metadata?.pending_palate);
    } catch (err) {
      // Unverified: fold nothing on this load. The carrier stays where it
      // is and the local stash goes back — the next load tries again
      console.error("Pending palate check failed:", err);
      if (local) restoreStash(storage, local);
      return NOTHING;
    }
  }
  if (!local && !meta) return NOTHING;

  const stashAnswers =
    local && meta ? unionQuizRaw(meta.answers, local.answers) : (meta || local).answers;
  let won = false;
  try {
    const rawAnswers = existingRow
      ? unionQuizRaw(stashAnswers, rowToRaw(existingRow))
      : stashAnswers;
    const row = await saveQuizProfile(supabase, user.id, rawAnswers, {
      mode: existingRow ? "refine" : "fresh",
      initialRaw: null,
      // The Long Memory: this save is the anonymous quiz finally landing —
      // mode "restore", back-logged to when the quiz actually happened (the
      // local carrier's createdAt is authoritative when both exist)
      eventMode: "restore",
      occurredAt: local?.createdAt ?? meta?.createdAt ?? null,
      // Only the load that wins the claim records the event — and the claim
      // records it itself, in the same transaction. With no metadata carrier
      // the local stash was already claimed synchronously: record here
      beforeEvent: async (_row, event) => {
        if (!meta) { won = true; return true; }
        const claim = await claimMetadataCarrier(supabase, event);
        won = claim.won;
        return claim.won && !claim.recorded;
      },
    });
    if (row) {
      // The claim was a direct database write, so this browser's cached
      // session user still carries the palate. Refresh it (fire and forget —
      // the server is already right) so the next load doesn't even ask.
      if (won && meta) supabase.auth.updateUser({ data: { pending_palate: null } }).catch(() => {});
      return { row, welcomeBack: won };
    }
  } catch (err) {
    console.error("Pending palate restore failed:", err);
  }
  if (local) restoreStash(storage, local);
  return NOTHING;
}
